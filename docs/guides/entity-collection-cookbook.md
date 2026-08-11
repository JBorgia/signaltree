# Cookbook: `entityMap({ load: loader(fn) })` + HTTP caching + push invalidation

`entityMap`'s cache-aware (single-scope) loading (v11.2+, [RFC 0002](../rfcs/0002-entity-collection.md);
scoped form and the `entityCollection`→`entityMap` fold in v11.4+, [RFC 0003](../rfcs/0003-keyed-entity-collection.md))
is the cache-aware collection loader: wrapping a load function with the `loader()` helper and passing
it as `load` in `entityMap(config)` adds load status + a freshness guard + single-flight dedup + tag
invalidation + optional offline-first persistence to the same marker — no second marker to import.
`loader()` is what keeps this machinery tree-shakeable; a plain `entityMap()` (no `load`) doesn't pay
for it. This cookbook wires it end-to-end with the two
things it deliberately does **not** own — HTTP-level caching (ETag / conditional GET) and
real-time push — so you don't reinvent the interplay.

## Division of responsibility

| Concern                                                                        | Owned by                                                     | Why                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Conditional GET, `ETag` / `If-None-Match`, `304 Not Modified`, `Cache-Control` | The **browser HTTP cache** + Angular `HttpClient`            | The platform already does this correctly; core stays HTTP-agnostic |
| "Is this collection fresh enough to skip a call?"                              | `entityMap`'s `staleTime`                                    | Application-level freshness, not transport-level                   |
| "N subsystems asked to load — send one request"                                | `entityMap`'s `.load()` guard                                | Single-flight coalescing                                           |
| "The server says this data changed — refetch"                                  | `invalidate()` / `invalidateTag()` + your SSE/SignalR wiring | Push freshness                                                     |

The rule of thumb: **`staleTime` decides whether to _ask_; the ETag decides whether the answer
costs bytes.** They stack — a re-fetch that the browser satisfies with a `304` is nearly free.

## 1. Baseline: a self-loading collection

```typescript
import { signalTree, entityMap, loader } from '@signaltree/core';

@Injectable({ providedIn: 'root' })
export class PlantStore {
  private http = inject(HttpClient);

  tree = signalTree({
    plants: entityMap<PlantDto, string>({
      selectId: (p) => p.url,
      load: loader(() => this.http.get<PlantDto[]>('/api/plants'), {
        staleTime: '30m', // skip refetch while fresh
        tags: ['plants'], // for invalidateTag()
      }),
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

## 2. Derived slices & lookups (don't hand-roll these)

A collection's read surface is bigger than `all()` / `loading()` / `error()`. Two features cover
almost every projection people write by hand in a separate derived layer.

### Computed slices — attach the projection at the declaration

`.computed(name, fn)` hangs a derived signal off the collection itself, so the projection lives next
to the data instead of in a distant `computed`:

```typescript
plants: entityMap<PlantDto, string>({
  selectId: (p) => p.url,
  load: loader(() => this.http.get<PlantDto[]>('/api/plants'), { staleTime: '30m' }),
})
  .computed('byUrl', (all) => Object.fromEntries(all.map((p) => [p.url, p])))
  .computed('activeCount', (all) => all.filter((p) => p.active).length),
```

Read them straight off the tree — **fully typed since v13.2, no cast**:

```typescript
this.store.tree.$.plants.byUrl(); // Signal<Record<string, PlantDto>>
this.store.tree.$.plants.activeCount(); // Signal<number>
```

`.computed()` chains, each name is typed independently, and slices work on **both** plain and
loader-backed collections — the loader surface (`load()`, `loading()`, …) stays available alongside
them.

> Before v13.2 slice names weren't on the static `tree.$` type and the docs told you to read them via
> `(tree.$.plants as any).byUrl()`. That cast is gone; if you see it in older code, delete it.

### `find` / `where` — reactive lookups without a wrapper

```typescript
const active = store.tree.$.plants.find((p) => p.active); // Signal<PlantDto | undefined>
const inRegion = store.tree.$.plants.where((p) => p.regionUrl === url); // Signal<PlantDto[]>
```

Reach for these when you want a **standalone reactive** lookup. A one-shot imperative read is fine
as-is and doesn't need a signal:

```typescript
const first = store.tree.$.plants.all().find((p) => p.active); // PlantDto | undefined — fine
```

`.all().find(...)` inside a `computed()` is also correct — the accessors just save you the wrapper.

### When a slice is the wrong tool

A slice's `compute` receives **only that collection's `E[]`**. Anything that reads other state — a
second collection, an external id signal, a filter the user typed — cannot be a slice and stays a
normal `computed()` / `.derived()`:

```typescript
// selectedPlantId lives elsewhere in the tree → NOT a slice
readonly selectedPlant = computed(() => {
  const id = this.store.tree.$.selectedPlantId();
  return id ? this.store.tree.$.plants.byId(id)?.() ?? null : null;
});
```

That boundary is the whole rule: **self-contained projection of one collection → slice; anything
cross-cutting → derived.**

## 3. Let the browser handle ETags

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

## 4. Push invalidation over SSE

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
      invalidateTag(this.tree, 'plants'); // mark stale; next load() refetches
      this.tree.$.plants.refresh(); // …or refetch immediately
    });
    inject(DestroyRef).onDestroy(() => es.close());
  }
}
```

`invalidate()` marks stale only (RFC 0002 §7) — it never fetches on its own, so a burst of push
events is cheap. Call `.refresh()` when you want an eager refetch; omit it to defer until the view
next reads the collection.

## 5. Push invalidation over SignalR (`@signaltree/realtime` / TruckTrax-style)

Same shape, different transport:

```typescript
connection.on('PlantsChanged', () => invalidateTag(this.tree, 'plants'));
```

Because `invalidateTag` walks `tree.$` for tagged collections, one event can invalidate several
collections that share a tag (e.g. `tags: ['catalog']` on both `plants` and `seeds`).

## 6. Offline-first (hydrate-then-revalidate)

Seed instantly from IndexedDB on startup, then revalidate in the background:

```typescript
import { entityMap, loader } from '@signaltree/core';
import { createIndexedDBAdapter } from '@signaltree/core/storage';

plants: entityMap<PlantDto, string>({
  selectId: (p) => p.url,
  load: loader(() => this.http.get<PlantDto[]>('/api/plants'), {
    swr: true,
    persist: {
      adapter: createIndexedDBAdapter(),
      key: 'plants',
      hydrateThenRevalidate: true,   // show cached rows immediately, refetch in background
    },
  }),
}),
```

On first access the collection paints the persisted snapshot (marked stale, so `loaded()` is
`false` until the network confirms), fires `load()`, and swaps in fresh rows on success — while
`swr: true` keeps serving the old rows during the revalidation instead of blanking the view.

## 7. Scoped collections (parameterized by region, customer, tenant, …)

Reach for the scoped form (v11.4+, [RFC 0003](../rfcs/0003-keyed-entity-collection.md)) when a
collection is scoped to something that changes at runtime — a region, a customer, a tenant — and
you'd otherwise hand-roll a "current scope" ref plus manual clear/refetch on change around a plain
`entityMap`. Add a third type param `P` and give the wrapped loader function a parameter; everything
else (`entityMap` surface, single-flight, `tags`, `persist`, `swr`) is unchanged.

```typescript
customers: entityMap<Customer, string, { regionUrl: string }>({
  selectId: (c) => c.externalId,
  load: loader(({ regionUrl }) => api.getCustomers$(regionUrl), {
    staleTime: '30m',
    // freshness compared per scope with `equal` (default: structural value comparison)
  }),
});
```

```typescript
// In a component — pass the current scope on every call:
tree.$.customers.load({ regionUrl }); // same scope + fresh => no-op; scope changed => refetch
tree.$.customers.params(); // Signal<{ regionUrl: string } | undefined> — the loaded scope, typed
```

`staleTime` freshness is now evaluated **per-scope**, compared via `equal` (default: a structural
value comparison, so `{ regionUrl }` object literals compare by value): switching `regionUrl` marks
the collection stale and refetches even though the previous region was still fresh. Pass a custom
`equal` when you need a cheaper or narrower comparison. A `load()` for a different scope while one
is in flight supersedes it (last-request-wins) rather than racing. A collection whose loader
declares a parameter is implicitly lazy — there's no scope to auto-load on first `tree.$` access,
so call `load(params)` explicitly (e.g. from the component that owns the scope selector).

This is a **single-scope cache**: only the most recently loaded scope's rows are kept, so toggling
between two scopes refetches each time rather than serving a cached second scope instantly. A
multi-scope LRU (instant back-toggle between recently seen scopes) is explicitly deferred — see RFC
0003 §5 — and layers on top of this without an API break if it ships later.

## 8. Imperative error handling

Template/signal consumers want `load()`'s always-resolves guarantee (no unhandled rejection just
from reading a collection), but a route guard, resolver, or other imperative call site usually
wants a normal `await`/`try-catch`. Use `loadOrThrow()` there — same freshness/in-flight guard as
`load()`, but it rejects with the loader's error instead of only surfacing it through `.error()`:

```typescript
export const plantsResolver: ResolveFn<boolean> = async () => {
  const store = inject(PlantStore);
  try {
    await store.tree.$.plants.loadOrThrow();
    return true;
  } catch (err) {
    return false; // or redirect
  }
};
```

For a forced reload (bypassing the freshness guard) where you'd rather branch on state than catch,
pair `refresh()` with an `.error()` check instead:

```typescript
await this.tree.$.plants.refresh();
if (this.tree.$.plants.error()) {
  // handle the failed refresh — rows are unchanged, the old data (if any) is still there
}
```

There is no `refreshOrThrow()`: a failed load never becomes fresh (`lastLoadedAt` only advances on
success), so retrying after an error is already what `loadOrThrow()` does — `refresh()`'s only
distinct job is forcing a reload of _already-fresh_ data, which has nothing to do with retrying a
failure (see [RFC 0004](../rfcs/0004-v12-optimal-iteration.md) §3 V-P4).

## Why not just use an array? (ST2018)

This is the most expensive mistake available here, and it does not look like a
mistake — `rows: Row[]` is the obvious thing to write.

Reproduce with `node tools/bench-array-leaf.mjs --n 50000 --updates 1000`:
1000 single-row updates over a 50,000-row collection, arms interleaved, median
of 9, fixture rebuilt every round.

|                                 | time        | vs `entityMap` |
| ------------------------------- | ----------- | -------------- |
| `entityMap`                     | **0.45 ms** | —              |
| plain array leaf                | 46.02 ms    | ~103x          |
| — of which `slice()` + spread   | 43.20 ms    |                |
| NgRx SignalStore `updateEntity` | 734.87 ms   | ~1640x         |

An array leaf costs **two orders of magnitude** more than `entityMap`, and
almost all of it is the copy: `slice()` plus the object spread is 43.20 ms of
the 46.02 ms. Every update rebuilds the array and every equality check walks it.
`entityMap` owns each entity separately — the write is O(1) and `byId(id)` is a
per-entity signal with a fan-out of exactly 1.

Quote the absolutes and the collection size, never the multiplier alone: both
rebuilding arms are quadratic in N, so the ratio is a fact about the fixture.

> **This table previously claimed the array leaf reached "parity with the
> immutable store", at 49.80 ms against SignalStore's 46.56 ms.** The array-leaf
> half reproduces; the SignalStore half does not. Measured with
> `@ngrx/signals/entities` — its own best idiom — SignalStore is 734.87 ms here,
> sixteen times the array leaf, because `updateEntity` spreads a 50,000-key
> object per write while `slice()` copies a dense array. The old 46.56 ms sits
> within noise of the array-leaf figure beside it, which is what a naive
> `.asMap()` arm measures; that arm was corrected in `bench-vs-signalstore.mjs`
> and this table was never updated to match. It also had no generator, which is
> why nothing caught it. `tools/bench-array-leaf.mjs` now exists so it can.

Since 13.5.0 core warns about this at construction (**ST2018**) when a leaf
holds 32+ objects with a stable `id`. It is deliberately quiet otherwise — small
arrays, primitives, objects with no identity key, non-unique ids, nested arrays.

**When an array leaf is the right answer:** the collection is read-only, or it
is always replaced wholesale (a search result set, a static lookup table). Then
the rebuild you are being warned about is the operation you actually want.
Silence the warning by taking explicit control of equality:

```ts
import { compared } from '@signaltree/core';

const tree = signalTree({
  // Replaced wholesale on every search; per-entity writes never happen.
  results: compared(initialResults, (a, b) => a === b),
});
```

## Anti-patterns

- **Don't** model a per-entity-updated collection as a plain array leaf — see
  ST2018 above. At 50,000 rows that is ~103x (`node tools/bench-array-leaf.mjs
--n 50000 --updates 1000`), and it grows with the collection.
- **Don't** stack TanStack Query / a second document cache alongside `entityMap` — you'd get the
  triple-cache duplication `entityMap`'s cache-aware loading exists to remove.
- **Don't** put conditional-GET logic in the loader (see §3).
- **Don't** hand-flip `status()` from your SSE handler — that's what `invalidateTag` replaces.
