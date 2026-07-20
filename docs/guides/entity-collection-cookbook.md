# Cookbook: `entityCollection` + HTTP caching + push invalidation

`entityCollection` (v11.2+, [RFC 0002](../rfcs/0002-entity-collection.md)) is the cache-aware
collection loader: it composes `entityMap` + load status + a freshness guard + single-flight
dedup + tag invalidation + optional offline-first persistence into one marker. This cookbook
wires it end-to-end with the two things it deliberately does **not** own — HTTP-level caching
(ETag / conditional GET) and real-time push — so you don't reinvent the interplay.

## Division of responsibility

| Concern | Owned by | Why |
|---|---|---|
| Conditional GET, `ETag` / `If-None-Match`, `304 Not Modified`, `Cache-Control` | The **browser HTTP cache** + Angular `HttpClient` | The platform already does this correctly; core stays HTTP-agnostic |
| "Is this collection fresh enough to skip a call?" | `entityCollection` `staleTime` | Application-level freshness, not transport-level |
| "N subsystems asked to load — send one request" | `entityCollection.load()` guard | Single-flight coalescing |
| "The server says this data changed — refetch" | `invalidate()` / `invalidateTag()` + your SSE/SignalR wiring | Push freshness |

The rule of thumb: **`staleTime` decides whether to *ask*; the ETag decides whether the answer
costs bytes.** They stack — a re-fetch that the browser satisfies with a `304` is nearly free.

## 1. Baseline: a self-loading collection

```typescript
import { signalTree, entityCollection } from '@signaltree/core';

@Injectable({ providedIn: 'root' })
export class PlantStore {
  private http = inject(HttpClient);

  tree = signalTree({
    plants: entityCollection<PlantDto, string>({
      load: () => this.http.get<PlantDto[]>('/api/plants'),
      selectId: (p) => p.url,
      staleTime: '30m',      // skip refetch while fresh
      tags: ['plants'],      // for invalidateTag()
    }),
  });
}
```

```typescript
// In a component — read like any entityMap, load on demand:
plants = this.store.tree.$.plants;         // full entityMap surface
ngOnInit() { this.plants.load(); }         // no-op if fresh or already in-flight
// template: @for (p of plants.all(); ...)   plants.loading()   plants.error()
```

Five subsystems calling `plants.load()` in the same tick produce **one** HTTP request.

## 2. Let the browser handle ETags

You write no ETag code. Return `Cache-Control` + `ETag` from the server; the browser stores the
response and replays `If-None-Match` automatically on the next `HttpClient.get` to the same URL.

```
# server response headers
Cache-Control: no-cache        # revalidate every time, but allow 304
ETag: "a1b2c3"
```

When `staleTime` elapses and `load()` fires a real request, an unchanged resource comes back as a
`304` with an empty body — the collection's rows don't churn and the round-trip is cheap. Use
`Cache-Control: max-age=…` if you want the browser to short-circuit the request entirely inside
that window (in which case keep `staleTime` ≤ `max-age` so you don't serve staler data than the
transport would).

> Do **not** try to move `If-None-Match` handling into the loader. That re-implements, worse, what
> the platform already does — and it's explicitly out of scope for core (RFC 0002 §3).

## 3. Push invalidation over SSE

When the backend can tell you "plants changed", flip freshness with `invalidateTag` and let the
next read (or an explicit `refresh()`) do the fetch.

```typescript
import { invalidateTag } from '@signaltree/core';

@Injectable({ providedIn: 'root' })
export class PlantStore {
  // …tree as above…

  constructor() {
    const es = new EventSource('/api/events');
    es.addEventListener('plants.changed', () => {
      invalidateTag(this.tree, 'plants');   // mark stale; next load() refetches
      this.tree.$.plants.refresh();         // …or refetch immediately
    });
    inject(DestroyRef).onDestroy(() => es.close());
  }
}
```

`invalidate()` marks stale only (RFC 0002 §7) — it never fetches on its own, so a burst of push
events is cheap. Call `.refresh()` when you want an eager refetch; omit it to defer until the view
next reads the collection.

## 4. Push invalidation over SignalR (`@signaltree/realtime` / TruckTrax-style)

Same shape, different transport:

```typescript
connection.on('PlantsChanged', () => invalidateTag(this.tree, 'plants'));
```

Because `invalidateTag` walks `tree.$` for tagged collections, one event can invalidate several
collections that share a tag (e.g. `tags: ['catalog']` on both `plants` and `seeds`).

## 5. Offline-first (hydrate-then-revalidate)

Seed instantly from IndexedDB on startup, then revalidate in the background:

```typescript
import { entityCollection, createIndexedDBAdapter } from '@signaltree/core';

plants: entityCollection<PlantDto, string>({
  load: () => this.http.get<PlantDto[]>('/api/plants'),
  selectId: (p) => p.url,
  swr: true,
  persist: {
    adapter: createIndexedDBAdapter(),
    key: 'plants',
    hydrateThenRevalidate: true,   // show cached rows immediately, refetch in background
  },
}),
```

On first access the collection paints the persisted snapshot (marked stale, so `loaded()` is
`false` until the network confirms), fires `load()`, and swaps in fresh rows on success — while
`swr: true` keeps serving the old rows during the revalidation instead of blanking the view.

## Anti-patterns

- **Don't** stack TanStack Query / a second document cache alongside `entityMap` — you'd get the
  triple-cache duplication `entityCollection` exists to remove.
- **Don't** put conditional-GET logic in the loader (see §2).
- **Don't** hand-flip `status()` from your SSE handler — that's what `invalidateTag` replaces.
