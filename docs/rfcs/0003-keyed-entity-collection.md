# RFC 0003 — Keyed / parameterized `entityCollection`

**Status:** Accepted (2026-07-20)
**Date:** 2026-07-20
**Affects:** `@signaltree/core` (11.x line), docs/skills/recipes
**Builds on:** [RFC 0002](0002-entity-collection.md) (the parameterless `entityCollection`)
**Versions at writing:** core 11.2.0 (published); target 11.3.0 (this feature)

---

## 1. The gap

`entityCollection` (RFC 0002) is excellent for **global, parameterless** server
collections: one `load()`, one `staleTime` freshness guard, single-flight dedup, `tags`
+ `invalidateTag`, optional `persist`. But most real-world server data is **scope-keyed**
(by region, customer, plant, tenant, filter set), and `entityCollection` has only one
implicit, global key. SignalTree shipped the two halves separately and neither is the
whole thing:

- **`asyncQuery`** keys by input (`input` signal + `equal`, re-runs on change) — but it
  is a *single document*: no normalized `entityMap` surface (`byId`/`where`/`upsert`),
  and **no `staleTime` cache** (toggling input A→B→A refetches A every time).
- **`entityCollection`** has the normalized store + `staleTime` + dedup + tags + persist
  — but **one global key**.

The missing primitive is their **intersection**: a normalized collection whose freshness
is keyed by a caller-supplied scope. Without it, every consumer with scoped lists
hand-rolls the same guard — a per-collection key field: compute a scope key, skip the
fetch when the key is unchanged AND the collection is loaded, store the key on success,
expose a `force` bypass, and (the subtle bug) clear the list *only* on a real key change.
See the before/after in §7.

## 2. What ships

Extend `entityCollection` with an optional **`key`** function and a scope-parameter type
`P`. `staleTime` freshness is evaluated against the **current key**; a key change marks
the collection stale and refetches. Everything else (normalized surface, single-flight,
resolves-never-rejects `load()`, `tags`, error handling, `persist`, `swr`) is unchanged.

```ts
customers: entityCollection<Customer, string, { regionUrl: string }>({
  load: ({ regionUrl }) => api.getCustomers$(regionUrl),
  key:  ({ regionUrl }) => [regionUrl],   // presence of `key` ⇒ keyed
  selectId: (c) => c.externalId,
  staleTime: '30m',
});
// caller: tree.$.customers.load({ regionUrl });
//   same key + fresh → no-op; key changed → refetch (supersedes any in-flight load)
```

New/changed surface (`P` defaults to `void` — the existing parameterless form is
byte-for-byte compatible):

- Config: `load: (params: P) => …`, `key?: (params: P) => unknown[]`,
  `clearOnKeyChange?: boolean`.
- Signal: `load(params: P)`, `refresh(params?: P)`, and a new
  `currentKey: Signal<string | null>` (serialized key of the loaded scope; always `null`
  for unkeyed collections).

**Typing:** a single `load(params: P)` signature covers both forms — `void` params are
omittable, so unkeyed `load()` type-checks while keyed `load(params)` requires the
argument. No overloads; inference flows from `load`'s parameter or the explicit third
type argument. (Enforced by `@ts-expect-error` type tests.)

## 3. Semantics (precise)

Let `k = stableStringify(key(params))` for keyed collections (`null` for unkeyed).

- **Freshness is per-current-key.** `load(params)` fetches when: never loaded, OR
  `k !== currentKey`, OR `invalidate()`d, OR `Date.now() - lastLoadedAt >= staleMs`.
  Otherwise it's a no-op (`Promise.resolve()`), exactly as RFC 0002.
- **Single-flight** stays: a concurrent `load()` for the **same** key returns the
  in-flight promise.
- **Supersede on different key.** A `load()` for a **different** key while one is in
  flight abandons the in-flight result (its rows never write — guarded by a run token;
  the observable is unsubscribed) and starts the new-key load. The superseded promise is
  resolved (never left hanging). This is last-request-wins, matching `asyncQuery`'s
  `switchMap`.
- **On success:** `setAll(rows)`, `lastLoadedAt = now`, `currentKey = k`, clear
  `invalidated`, `loading = false`, persist write-through (per-scope key).
- **`load()` resolves, never rejects.** Errors route to `error()` (unchanged).
- **`invalidate()`** marks the current scope stale; `invalidateTag(tree, tag)` marks
  tagged collections stale regardless of key.
- **Clear-on-key-change (config, default off).** Default is **keep-until-settled**: the
  previous scope's rows stay visible (and `loaded` stays true) until the new load
  settles — no flicker. `clearOnKeyChange: true` blanks the rows immediately and drops to
  a not-loaded/loading state on a scope change (the "blank the list on scope switch" UX).
- **Auto-load:** keyed collections **cannot** auto-load on first `tree.$` access (no
  params available), so they are **implicitly `lazy`** — call `load(params)`. Documented;
  no error thrown (setting `lazy` is a no-op for keyed).

## 4. Design decisions (with rationale)

1. **Single-scope by default, not a multi-key cache.** Cache only the current scope's
   data + key; a key change evicts and refetches. This matches how scoped UIs work (one
   region at a time), keeps memory bounded, and is a strict, safe superset of the
   hand-rolled guard. A future opt-in **multi-key LRU** (à la TanStack Query
   `queryKey` + `gcTime`) can layer on without an API break — the seam is the internal
   `loadedKey`/`currentKey` bookkeeping, which would become a small keyed map. **Not
   built now.**
2. **Key serialization.** `stableStringify` sorts object keys at every level, so
   equal-by-value scopes serialize identically regardless of property order; **arrays
   stay order-sensitive** (queryKey semantics). Contract: keys must be JSON-serializable.
3. **Persistence.** `persist` write-through uses a **per-scope storage key**
   (`${key}::${serializedKey}`), so scopes don't clobber each other. `hydrateThenRevalidate`
   for a keyed collection seeds a scope on its **first `load(params)`** (sync adapters
   seed before the fetch; async adapters seed when the read resolves), rather than at
   materialize (no key is known there). Unkeyed hydration is unchanged (materialize-time).
4. **No overloads for `load`.** A single `load(params: P)` with `P = void` gives both
   call shapes type-safely (void is omittable). Fewer signatures = less for an AI agent
   to disambiguate — consistent with RFC 0001's surface-minimization bias.

## 5. Explicitly deferred

Multi-key LRU / `gcTime` (instant back-toggle); prefetch; infinite/paginated collections;
per-key `staleTime`. All layer onto single-scope later without breaking the API.

## 6. Backward compatibility

100%. `P` defaults to `void`; the parameterless `entityCollection<E,K>({ load: () => … })`
form, its `load()`/`refresh()`/`invalidate()` calls, and all RFC 0002 tests are unchanged.
Additive minor (11.3.0).

## 7. Motivating before/after

Six region-scoped loaders, each ~18 lines of the identical hand-rolled guard:

```ts
private _customersKey: string | null = null;
loadCustomers$(regionUrl: string, force = false): Observable<void> {
  const key = JSON.stringify([regionUrl]);
  if (!force && key === this._customersKey && this._$.customersLoading.loaded()) return of(void 0);
  this._$.customersLoading.setLoading();
  return this._api.getCustomers$(regionUrl).pipe(
    take(1),
    tap(c => { this._$.customers.set(c); this._$.customersLoading.setLoaded(); this._customersKey = key; }),
    map(() => void 0),
    catchError(e => { this._$.customersLoading.setError(capture(e)); return of(void 0); }),
  );
}
// ...×6, plus a subtle bug: clearing the list unconditionally wipes it on a guard-skip;
// it must only clear on a *real* key change.
```

collapses to a declaration — no `_key` fields, no guard, no set/setLoaded/setError
ceremony, and the clear-on-change decision moves into the (tested-once) primitive:

```ts
customers: entityCollection<Customer, string, { regionUrl: string }>({
  load: ({ regionUrl }) => api.getCustomers$(regionUrl),
  key: ({ regionUrl }) => [regionUrl],
  selectId: c => c.externalId,
  staleTime: '30m',
});
// caller: tree.$.customers.load({ regionUrl });
```

This is the difference between "clean for the global half of collections" and "clean for
all of them."

## 8. Status

Implemented in [`markers/entity-collection.ts`](../../packages/core/src/lib/markers/entity-collection.ts);
tests in [`markers/entity-collection-keyed.spec.ts`](../../packages/core/src/lib/markers/entity-collection-keyed.spec.ts)
(single-flight, supersede, per-key freshness, refresh, invalidate, error, swr,
clearOnKeyChange, invalidateTag, per-scope persist, keyed hydrate, and `load()`-vs-`load(params)`
type enforcement). Full core suite green; parameterless form unchanged.
