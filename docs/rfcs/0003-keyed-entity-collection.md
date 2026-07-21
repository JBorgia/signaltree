# RFC 0003 — Scoped, parameterized cache-aware loading on `entityMap`

**Status:** Accepted (2026-07-20); **revised same-day** — see §0
**Date:** 2026-07-20
**Affects:** `@signaltree/core` (11.x line), docs/skills/recipes
**Builds on:** [RFC 0002](0002-entity-collection.md) (parameterless cache-aware loading on `entityMap`)
**Versions at writing:** core 11.2.0 (published); target 11.4.0 (this feature — see §0)

## 0. Revision note (11.3.0 → 11.4.0, same-day correction)

This RFC originally shipped in 11.3.0 as a **separate `entityCollection` marker**,
with a `key?: (params) => unknown[]` config function, a
`currentKey: Signal<string | null>` accessor, and `clearOnKeyChange`. Both the
marker boundary and that API surface are superseded by this revision, published
as **11.4.0** the same day (there was no separate 11.3.0 release to preserve
compatibility with):

- **The `entityCollection` marker is removed — folded into `entityMap`.**
  Cache-aware loading is no longer a second marker; it's an **option set on
  `entityMap`**. Passing `load` in `entityMap(config)` turns on the loader
  surface (`.load()`, `.refresh()`, `.invalidate()`, `.loading()`, `.loaded()`,
  `.error()`, `.lastLoadedAt()`, `.params()`); a plain client collection is
  still `entityMap<User, number>()` with no loader surface at all. There is no
  second import, no "which marker do I reach for?" — one marker, an opt-in
  config key. A separate `entityCollection` marker didn't earn its keep: any
  real app has server-backed entity data, so it would import the loader
  surface anyway (no tree-shaking win from splitting it out), and having two
  markers just added a decision an agent or human had to get right. Folding it
  in minimizes surface (RFC 0001's ethos) at no bundle cost — `load` is just
  another optional config key, so `entityMap()` called without `load` compiles
  to exactly the lean marker it always was.
- **`key?: (params) => unknown[]`** → **`equal?: (a: P, b: P) => boolean`**.
  Freshness now compares the raw scope params directly (default: a structural
  value comparison, so `{ regionUrl }` object literals compare by value) instead
  of routing through a caller-supplied queryKey-array function.
- **`currentKey: Signal<string | null>`** → **`params: Signal<P | undefined>`**.
  The signal now exposes the *typed* scope object it loaded, not a serialized
  string — no `JSON.stringify` round-trip for callers who want to read it back.
- **`clearOnKeyChange`** → **`clearOnParamsChange`** (same semantics, renamed
  to track the option it now pairs with).

Why: see §4 for the full rationale on `equal`/`params` (matches
`asyncQuery`/`asyncStream`'s `equal` comparator convention; avoids a second
serialized-key source of truth; `key` collided with `persist.key` in the same
config object, forcing readers to disambiguate two same-named-but-unrelated
options at a glance). The marker fold is a separate, additional correction on
top of that rename — same-day review concluded the RFC 0002 marker boundary
itself was wrong, not just its `key`/`currentKey` naming. The rest of this
document is written against the **corrected (`entityMap({..., equal, ...})`)**
shape; where it matters, the superseded 11.3.0 `entityCollection` name and
shape are called out explicitly.

---

## 1. The gap

`entityMap`'s cache-aware loading (`load`, RFC 0002) is excellent for **global,
parameterless** server collections: one `load()`, one `staleTime` freshness
guard, single-flight dedup, `tags` + `invalidateTag`, optional `persist`. But
most real-world server data is **scope-keyed** (by region, customer, plant,
tenant, filter set), and a cache-aware `entityMap` has only one implicit,
global key. SignalTree shipped the two halves separately and neither is the
whole thing:

- **`asyncQuery`** keys by input (`input` signal + `equal`, re-runs on change) — but it
  is a *single document*: no normalized `entityMap` surface (`byId`/`where`/`upsert`),
  and **no `staleTime` cache** (toggling input A→B→A refetches A every time).
- **`entityMap`'s loader** has the normalized store + `staleTime` + dedup + tags + persist
  — but **one global key**.

The missing primitive is their **intersection**: a normalized collection whose freshness
is keyed by a caller-supplied scope. Without it, every consumer with scoped lists
hand-rolls the same guard — a per-collection key field: compute a scope key, skip the
fetch when the key is unchanged AND the collection is loaded, store the key on success,
expose a `force` bypass, and (the subtle bug) clear the list *only* on a real key change.
See the before/after in §7.

## 2. What ships

Extend `entityMap`'s `load` option with an optional **`equal`** comparator and a scope-parameter
type `P`. A collection whose loader declares a parameter (`load: (params) => …`) is
**scoped**; `staleTime` freshness is evaluated against the **current scope**, compared
via `equal`, and a scope change marks the collection stale and refetches. Everything
else (normalized surface, single-flight, resolves-never-rejects `load()`, `tags`, error
handling, `persist`, `swr`) is unchanged.

```ts
customers: entityMap<Customer, string, { regionUrl: string }>({
  load: ({ regionUrl }) => api.getCustomers$(regionUrl),
  selectId: (c) => c.externalId,
  staleTime: '30m',
  // freshness compared per scope with `equal` (structural by default)
});
// caller: tree.$.customers.load({ regionUrl });
//   same scope + fresh → no-op; scope changed → refetch (supersedes any in-flight load)
```

New/changed surface (`P` defaults to `void` — the existing parameterless form is
byte-for-byte compatible):

- Config: `load: (params: P) => …` (a loader declaring a parameter makes the collection
  *scoped*), `equal?: (a: P, b: P) => boolean` (default: structural value comparison),
  `clearOnParamsChange?: boolean`.
- Signal: `load(params: P)`, `refresh(params?: P)`, and a new
  `params: Signal<P | undefined>` (the typed scope of the currently-loaded data;
  `undefined` for a global collection or before its first load).

**Typing:** a single `load(params: P)` signature covers both forms — `void` params are
omittable, so a global collection's `load()` type-checks while a scoped `load(params)`
requires the argument. No overloads; inference flows from `load`'s parameter or the
explicit third type argument. (Enforced by `@ts-expect-error` type tests.) Whether a
collection is scoped is derived from `load`'s declared arity (`load.length > 0`), not
from a separate config flag — one loader-shape decision drives both typing and runtime
behavior.

**NG0600 safety.** Because SignalTree finalizes markers lazily on first `.$` access —
frequently a template read *during* Angular's render — materializing a cache-aware
`entityMap` performs no synchronous signal writes: a global (non-lazy) collection's
initial auto-load and offline-first seed are deferred to a microtask, landing after the
current render pass. Reading a non-lazy collection first inside a template no longer
throws `NG0600: Writing to signals is not allowed while Angular renders`. One observable
consequence: auto-load is now asynchronous — data arrives on the next microtask, not
synchronously during construction.

## 3. Semantics (precise)

Let `equalFn` be `equal ?? defaultEqual` (structural value comparison — `a === b ||
stableStringify(a) === stableStringify(b)`) for scoped collections (irrelevant for
global collections, which have no `P`).

- **Freshness is per-current-scope.** `load(params)` fetches when: never loaded, OR
  `!equalFn(loadedParams, params)` (scope changed), OR `invalidate()`d, OR
  `Date.now() - lastLoadedAt >= staleMs`. Otherwise it's a no-op (`Promise.resolve()`),
  exactly as RFC 0002.
- **Single-flight** stays: a concurrent `load()` for an **equal** scope (per `equalFn`)
  returns the in-flight promise.
- **Supersede on a different scope.** A `load()` for a scope that is **not equal** to
  the in-flight one abandons the in-flight result (its rows never write — guarded by a
  run token; the observable is unsubscribed) and starts the new-scope load. The
  superseded promise is resolved (never left hanging). This is last-request-wins,
  matching `asyncQuery`'s `switchMap`.
- **On success:** `setAll(rows)`, `lastLoadedAt = now`, `params()` is set to the loaded
  scope, clear `invalidated`, `loading = false`, persist write-through (per-scope
  storage key).
- **`load()` resolves, never rejects.** Errors route to `error()` (unchanged).
- **`invalidate()`** marks the current scope stale; `invalidateTag(tree, tag)` marks
  tagged collections stale regardless of scope.
- **Clear-on-params-change (config, default off).** Default is **keep-until-settled**:
  the previous scope's rows stay visible (and `loaded` stays true) until the new load
  settles — no flicker. `clearOnParamsChange: true` blanks the rows immediately and drops
  to a not-loaded/loading state on a scope change (the "blank the list on scope switch"
  UX).
- **Auto-load:** scoped collections **cannot** auto-load on first `tree.$` access (no
  params available), so they are **implicitly `lazy`** — call `load(params)`. Documented;
  no error thrown (setting `lazy` is a no-op for a scoped collection). Global (unscoped)
  collections auto-load as in RFC 0002, but the auto-load and any offline-first seed are
  **deferred to a microtask** off the synchronous materialization pass — see the
  NG0600-safety note in §2. This makes auto-load asynchronous: `loading()` reads `true`
  starting the microtask after materialization, not synchronously during it.

## 4. Design decisions (with rationale)

1. **Single-scope by default, not a multi-key cache.** Cache only the current scope's
   data + params; a scope change evicts and refetches. This matches how scoped UIs work
   (one region at a time), keeps memory bounded, and is a strict, safe superset of the
   hand-rolled guard. A future opt-in **multi-scope LRU** (à la TanStack Query
   `queryKey` + `gcTime`) can layer on without an API break — the seam is the internal
   `loadedParams`/`params` bookkeeping, which would become a small keyed map. **Not
   built now.**
2. **Why `equal`, not a `key` queryKey function (the 11.3.0→11.4.0 correction).** The
   original design borrowed TanStack Query's `queryKey` shape: a `key: (params) =>
   unknown[]` function the caller writes, serialized internally to decide freshness.
   Same-day review found three problems:
   - **Inconsistent with the rest of core.** `asyncQuery` and `asyncStream` already
     compare their input/scope via an `equal` comparator, not a caller-supplied key
     function. A second, differently-shaped mechanism for the same concept ("has the
     scope changed?") is one more thing an agent or human has to learn — and get wrong —
     per marker. `equal` makes the scoped loader consistent with markers it's meant to
     compose alongside.
   - **A redundant serialized-key source of truth.** `key` existed only to produce a
     string to diff; `equal` diffs the params directly and skips the round-trip. The
     default (`stableStringify` under the hood) gives the same "compare by value, order
     matters in arrays" behavior for the common case, but callers never see or manage a
     serialized form.
   - **Naming collision with `persist.key`.** The config already has a
     `persist.key` (the storage key). A sibling top-level `key` option meant "the scope
     key function" and "the storage key" were both spelled `key` in the same config
     object, one level apart — a real, observed point of confusion in review. `equal`
     doesn't collide with anything.
   - The **signal-level** rename (`currentKey: Signal<string | null>` →
     `params: Signal<P | undefined>`) follows from the same shift: once freshness is
     decided by comparing typed params instead of diffing serialized keys, exposing the
     serialized key on the signal has no remaining purpose — callers who read it back
     want the typed scope, not its string form.
3. **Params serialization for persistence and the default comparator.**
   `stableStringify` sorts object keys at every level, so equal-by-value scopes serialize
   identically regardless of property order; **arrays stay order-sensitive**. This is
   used both as the default `equal` implementation and for building the per-scope
   storage key (below). Contract: params must be JSON-serializable to get persistence or
   the default comparator; a custom `equal` lifts the JSON-serializability requirement
   for freshness (but not for `persist`, which still serializes the scope into the
   storage key).
4. **Persistence.** `persist` write-through uses a **per-scope storage key**
   (`${key}::${stableStringify(params)}`), so scopes don't clobber each other.
   `hydrateThenRevalidate` for a scoped collection seeds a scope on its **first
   `load(params)`** (sync adapters seed before the fetch; async adapters seed when the
   read resolves), rather than at materialize (no scope is known there). Global-collection
   hydration is unchanged (materialize-time, deferred to a microtask — see §2/§3).
5. **No overloads for `load`.** A single `load(params: P)` with `P = void` gives both
   call shapes type-safely (void is omittable). Fewer signatures = less for an AI agent
   to disambiguate — consistent with RFC 0001's surface-minimization bias.
6. **Why fold `entityCollection` into `entityMap` rather than keep it a sibling
   marker (the other 11.3.0→11.4.0 correction).** Same-day review re-applied RFC
   0001 §2's test to the marker boundary itself, not just the config-option
   names: a second marker only earns its keep if it removes more surface than
   it adds *and* isn't reachable by making an existing marker's config richer.
   `entityCollection` failed both once `equal`/`params`/`clearOnParamsChange`
   were in hand — it was structurally `entityMap` plus one optional field
   (`load`), so the "two markers" surface was pure overhead: an extra export,
   an extra import, and a decision (which one for this collection?) an agent
   had to make correctly for *every* server-backed entity list. Folding it in
   removes that decision entirely — `entityMap()` with no `load` is the exact
   marker it always was, and `entityMap({ load, … })` is the same marker with
   the loader surface switched on.

## 5. Explicitly deferred

Multi-scope LRU / `gcTime` (instant back-toggle); prefetch; infinite/paginated collections;
per-scope `staleTime`. All layer onto single-scope later without breaking the API.

## 6. Backward compatibility

100%. `P` defaults to `void`; the parameterless `entityMap<E,K>({ load: () => … })`
form, its `load()`/`refresh()`/`invalidate()` calls, and all RFC 0002 tests (ported to
`entityMap`) are unchanged in behavior. Additive minor — published as **11.4.0** (see §0;
there is no separately-published 11.3.0 whose shape this needs to stay compatible with).
The 11.3.0 `entityCollection` marker itself does **not** carry forward — it never had a
published release to be compatible with, so its removal is not a breaking change against
anything real.

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
// it must only clear on a *real* scope change.
```

collapses to a declaration — no `_key` fields, no guard, no set/setLoaded/setError
ceremony, and the clear-on-change decision moves into the (tested-once) primitive:

```ts
customers: entityMap<Customer, string, { regionUrl: string }>({
  load: ({ regionUrl }) => api.getCustomers$(regionUrl),
  selectId: c => c.externalId,
  staleTime: '30m',
  // freshness compared per scope with `equal` (structural by default)
});
// caller: tree.$.customers.load({ regionUrl });
```

This is the difference between "clean for the global half of collections" and "clean for
all of them."

## 8. Status

Implemented as scoped/cache-aware `load` support on
[`markers/entity-map.ts`](../../packages/core/src/lib/markers/entity-map.ts) (loader
mechanics factored into
[`markers/entity-loader.ts`](../../packages/core/src/lib/markers/entity-loader.ts));
tests in [`markers/entity-map-loading.spec.ts`](../../packages/core/src/lib/markers/entity-map-loading.spec.ts)
(single-flight, supersede, per-scope freshness, refresh, invalidate, error, swr,
clearOnParamsChange, invalidateTag, per-scope persist, scoped hydrate, and
`load()`-vs-`load(params)` type enforcement). Full core suite green; parameterless form
unchanged. NG0600-safety (deferred auto-load/seed) covered by the corresponding
`async-source.spec.ts` and `entity-map-loading.spec.ts` render-timing cases. The
11.3.0 `entityCollection` marker and its spec files are removed — there is no
deprecated shim, since 11.3.0 was never a published release.
