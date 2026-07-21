# RFC 0002 — `entityCollection`: a cache-aware collection loader

**Status:** Accepted (2026-07-20 — §7 defaults resolved: `staleTime` default `0`; `lazy: false`; `invalidate()` marks stale only)
**Date:** 2026-07-20
**Affects:** `@signaltree/core` (11.x line), docs/skills/recipes
**Versions at writing:** core 11.1.1 (published); `@signaltree/shared` 9.2.2; `@ngrx/signals` (SignalStore + `withEntities`) as comparator; Angular 20.x
**Supersedes prior thinking in:** the v3 state audit (redundant-fetch finding) and the prioritized-gaps list (gaps 1–5)

> **Folded into `entityMap` (11.4.0).** This RFC's `entityCollection` shipped as a
> separate marker in 11.2.0. In 11.4.0 the marker was **removed** and its capability
> folded into `entityMap` as an opt-in option: `entityMap<E, K>({ load, staleTime, swr,
> tags, persist, … })` — passing `load` turns on the loader surface this RFC specifies;
> `entityMap<E, K>()` with no `load` is unchanged. See [RFC 0003 §0](0003-keyed-entity-collection.md#0-revision-note-113x0--1140-same-day-correction)
> for the rationale and the scoped/parameterized follow-on. The design below is otherwise
> historical — read `entityCollection<E, K>(config)` as `entityMap<E, K>(config)` with a
> `load` in `config`.

---

## 1. The question

Every consumer of `entityMap` that loads its data from a server re-implements the *same* four things by hand:

1. an `entityMap` for the normalized rows,
2. a `status()` for loading/loaded/error,
3. an `asyncSource`-style loader that calls the API and calls `setAll()`,
4. a **load-guard** so the same collection isn't fetched five times by five subsystems.

The v3 audit found exactly this: `loadActiveTicket$` triggered by five subsystems with no freshness check and no coalescing — redundant fetches every consumer had to remember to prevent. The pieces all exist in core today ([entity-map.ts](../../packages/core/src/lib/markers/entity-map.ts), [status.ts](../../packages/core/src/lib/markers/status.ts), [async-source.ts](../../packages/core/src/lib/markers/async-source.ts), [stored.ts](../../packages/core/src/lib/markers/stored.ts)); nothing composes them.

**Should the composition be a new core marker, or a recipe?**

## 2. The test (from RFC 0001 §2)

> Is it a state-management concern?

RFC 0001 sent AI composites (`toolCall`, `agentLoop`, `conversation`) to recipes because they are **domain models**, not state concerns, and because new markers add codegen hallucination surface. That reasoning does **not** transfer here:

- **Cache-aware collection loading is squarely a state-management concern** — freshness, in-flight state, and normalized identity are the substance of state management, not a domain model layered on top.
- **The demand signal RFC 0001 asked for already exists.** RFC 0001 deferred streaming pending "a real demand signal." Here the signal is in hand: the audit's #1 finding, and boilerplate every server-backed `entityMap` consumer writes.
- **It reduces net surface for codegen, not increases it.** The recipe alternative is ~40 lines an agent must assemble correctly every time (entityMap + status + loader + guard + `setAll` wiring). One marker with a declarative config is *fewer* tokens and *fewer* ways to get the guard wrong. This is the inverse of the AI-composite case, where the marker would have added concepts without removing boilerplate.

**Conclusion: `entityCollection` clears the §2 bar. It ships as a core marker.** This is a deliberate, narrow exception to RFC 0001's marker-skepticism, justified by (a) it being a true state concern and (b) it *removing* more surface than it adds.

## 3. What ships — and what explicitly does not

Folding in the prioritized-gaps list (gaps 1–6):

| Gap | Disposition | Where |
|---|---|---|
| **1. `entityCollection` loader** | **BUILD** | new marker (this RFC) |
| **2. `staleTime` + SWR on async** | **BUILD, trimmed** | `staleTime` + `swr` boolean on `entityCollection`; **no** 3-way `cachePolicy` enum |
| **3. single-flight dedup** | **FOLD IN** — not a standalone feature | the `.load()` guard below; primitives already coalesce via `switchMap`/teardown |
| **4. invalidation + tags** | **BUILD, scoped** | `.invalidate()` + a tag registry (`invalidate(tag)`); **defer** general `tree.invalidate(path)` |
| **5. unify persistence + hydrate-revalidate** | **SPLIT** — reject the merge, keep the SWR half | `persist:` option reusing `createIndexedDBAdapter`; **no** `stored`/`persistence` refactor |
| **6. ETag + SSE cookbook** | **DOCS, last** | recipe after this lands |

**Explicitly out of scope (now and later):** a 3-way `cache-first | SWR | network-first` enum (TanStack-envy — two knobs cover the real need); merging the `stored` marker and `persistence` enhancer (deliberately different scopes, both work, breaking to merge); general path-based `tree.invalidate(path)` (more surface, less payoff than tag-based on loaded collections); HTTP/ETag/conditional-GET logic in core (browser + `HttpClient` own that); a normalized graph cache (`entityMap`'s by-id level is right; graph normalization is Apollo's niche).

## 4. API surface (the implementation spec)

### 4.1 Marker factory

```typescript
// Shipped as entityMap({ load, ... }) in 11.4.0 (folded from the separate
// entityCollection marker this RFC originally specified — see the note above):
export function entityMap<E, K extends string | number = string>(
  config?: EntityMapConfig<E, K>
): EntityMapSignal<E, K>;

export interface EntityMapConfig<E, K extends string | number = string> {
  // --- loading (opt-in: presence of `load` turns on the whole loader surface below) ---
  load?: () => Observable<E[]> | Promise<E[]>;  // the fetch; omit for a plain client-only entityMap
  selectId?: (entity: E) => K;                  // existing entityMap option, unchanged
  lazy?: boolean;                               // default false: load on materialize; true: wait for .load()

  // --- freshness (gap 2, trimmed) ---
  staleTime?: number | string;                  // ms or '30m' / '5s' / '1h'; skip refetch while fresh. default 0 (always stale)
  swr?: boolean;                                // default false: while revalidating, keep serving last value (no flip to Loading)

  // --- identity/sorting passthrough to entityMap ---
  sortComparer?: (a: E, b: E) => number;

  // --- invalidation (gap 4, scoped) ---
  tags?: string[];                              // register under these tags for invalidate(tag)

  // --- persistence (gap 5, SWR half only) ---
  persist?: PersistOption;                      // see 4.4
}
```

`staleTime` accepts a duration string (`'30m'`, `'90s'`, `'2h'`, `'500ms'`) or raw ms. Parser is a small internal util; reject unknown units at dev time.

### 4.2 Materialized signal

The returned signal is the same `entityMap` signal (all its CRUD/query methods pass through unchanged), with a loader/status surface added when `load` is present in config:

```typescript
export interface EntityMapSignal<E, K extends string | number = string>
  extends EntitySignal<E, K> {              // full entityMap surface: all/byId/where/addOne/updateOne/...

  // --- loader control ---
  load(): Promise<void>;                    // guarded: no-op if fresh OR in-flight (folds gap 3)
  refresh(): Promise<void>;                 // force: ignores staleTime, still single-in-flight
  invalidate(): void;                       // mark stale → next load()/read triggers refetch (gap 4)

  // --- status (mirrors LoadingState, no new enum) ---
  readonly loading: Signal<boolean>;
  readonly loaded: Signal<boolean>;
  readonly error: Signal<unknown | null>;
  readonly lastLoadedAt: Signal<number | null>;   // drives staleTime; null until first success
}
```

Rationale for the method set:
- **`load()` is the guarded path** — the one every subsystem calls. It checks `lastLoadedAt` against `staleTime` and checks the in-flight latch. This is where gap 3 lives: concurrent `load()` calls share the one in-flight promise (a stored `Promise` latch, not `shareReplay` — simpler and matches the signal-consumption model where all readers converge on the same `all` signal).
- **`refresh()`** is the escape hatch (push told us it's stale, or user hit reload): bypass `staleTime`, still single-in-flight.
- **`invalidate()`** flips freshness without fetching; the next `load()` (or a subscribed auto-refresh) does the work. This is the primitive realtime/SSE hands to.

### 4.3 Tag registry (gap 4)

```typescript
// exported from core
export function invalidateTag(tree: SignalTree<any>, tag: string): void;
```

Collections declaring `tags: ['plants']` register on materialize; `invalidateTag(tree, 'plants')` calls `.invalidate()` on every collection carrying that tag. This is the clean seam for `@signaltree/realtime`: an SSE/SignalR "plants changed" event → `invalidateTag(tree, 'plants')` → subscribed views refetch. No status hand-flipping.

Deferred: `tree.invalidate(path)`. Path-based invalidation across arbitrary nodes is broader surface for less payoff; revisit only on demand.

### 4.4 Persistence (gap 5, SWR half only)

```typescript
type PersistOption =
  | false                                   // default
  | { adapter: StorageAdapter; key: string; hydrateThenRevalidate?: boolean };
```

Reuses the existing [`StorageAdapter` + `createIndexedDBAdapter`](../../packages/core/src/enhancers/serialization/serialization.ts) — **no new persistence mechanism, no merge of `stored`/`persistence`.** When `hydrateThenRevalidate: true`, on materialize the collection seeds `all` from the persisted snapshot *instantly* (offline-first), marks itself stale, and revalidates via `load()` in the background — the SWR/offline story from gap 5, delivered through this marker rather than a persistence rewrite.

## 5. Interaction with existing primitives

- **Does not replace `entityMap`** — `entityCollection` *is* an `entityMap` with a loader bolted on. Client-only collections keep using bare `entityMap`. Zero migration.
- **Does not replace `asyncSource`/`asyncQuery`** — those stay the primitives for non-collection async (a single object, an input-driven query). `entityCollection` is the collection-shaped composition on top.
- **No new status enum** — reuses `LoadingState` semantics via mirrored signals; agents already know the four states.

## 6. Codegen / discoverability impact

Net **positive** for the audit's #3 priority. Before: an agent must know to assemble entityMap + status + guard + `setAll` and *remember the freshness guard* — the step most often skipped, producing exactly the redundant-fetch bug. After: one marker, declarative config, the guard baked in. Fewer tokens, fewer failure modes. Update llms.txt / SKILL.md with the one-liner form once shipped.

## 7. Risks / open questions

1. **`staleTime` default.** Proposed `0` (always stale → always refetches on `load()`), matching least-surprise vs current manual loaders. Alternative: `Infinity` (load once). Leaning `0`; flag for review.
2. **Auto-load vs lazy default.** Proposed `lazy: false` (load on materialize) to match `asyncSource`'s non-lazy default. Collections that need a param before loading set `lazy: true` and call `.load()`.
3. **`invalidate()` auto-refresh.** Should `invalidate()` on a collection with live subscribers auto-`refresh()`, or only mark stale and wait for the next `load()`? Proposed: **mark stale only** (predictable, no surprise network); realtime opts into refresh by calling `refresh()` after. Flag for review.
4. **Bundle cost.** This composes existing internals, but it is new surface. Measure gzip delta; the repo does not claim a small bundle ([bundle-not-an-advantage] memory), so this is a correctness/measurement note, not a marketing constraint.

## 8. Next steps

1. ~~Land this RFC (Proposed → Accepted) — resolve the three flagged defaults in §7 first.~~ **Done (2026-07-20).**
2. ~~Implement `entityCollection` marker + `invalidateTag` in core, mirroring the `asyncSource` marker structure and finalization path.~~ **Done** — [`markers/entity-collection.ts`](../../packages/core/src/lib/markers/entity-collection.ts), wired into the three marker→signal type chains in `types.ts` and the public barrels.
3. ~~Test suite~~ **Done** — [`markers/entity-collection.spec.ts`](../../packages/core/src/lib/markers/entity-collection.spec.ts), 22 tests covering load-guard/single-flight, `staleTime`, `swr`, `invalidate()`/`invalidateTag`, `persist` hydrate-then-revalidate. Full core suite green.
4. ~~Docs: llms.txt / SKILL.md one-liner; ETag + SSE cookbook (gap 6).~~ **Done** — SKILL.md + llms.txt entries; [`guides/entity-collection-cookbook.md`](../guides/entity-collection-cookbook.md).
5. Remaining: pick the release version (comments say `v11.2`; `package.json` still `11.1.1`) and bump on publish; measure the gzip delta (§7.4).
