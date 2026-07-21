# @signaltree/core Changelog

## 11.4.0 (2026-07-20)

> `entityMap` gains cache-aware loading (`load`/`staleTime`/`equal`/`params`/`persist`/`tags`)
> + NG0600-safe deferred auto-load. The short-lived 11.3.0 `entityCollection` marker is
> **folded into `entityMap`** — removed as a separate marker, not just renamed. Its keyed
> design also supersedes the 11.3.0 `key`/`currentKey`/`clearOnKeyChange` shape, corrected
> same day (there is no separately-published 11.3.0 to stay compatible with). See RFC 0003
> §0 for the full rationale behind both corrections.

### Public API changes — `entityCollection` folded into `entityMap`, scoped loading (RFC 0003)

- **The `entityCollection` marker is removed.** Cache-aware loading is no longer a
  separate marker — it's an option set on `entityMap`: pass `load` in `entityMap`'s
  config and the collection gains the loader surface below. `entityMap<E, K>()` called
  without `load` is unchanged (still the plain, lean marker). There is nothing to import
  besides `entityMap` itself; `entityCollection` and `EntityCollectionConfig` no longer
  exist. Rationale: a second marker didn't earn its keep — any real app has server-backed
  entity data, so it would import the loader surface anyway (no tree-shaking win from
  splitting it out), and two markers only added a "which one?" decision. See RFC 0003 §0
  and §4 (item 6).
- **`entityMap<E, K, P>(config)`** gains a third type param `P` (scope/params type; defaults to `void`, i.e. the existing parameterless form is unchanged). `config.load` becomes `(params: P) => Observable<E[]> | Promise<E[]>` — a loader that **declares a parameter** makes the collection **scoped**; `staleTime` freshness is then evaluated per scope.
- **`config.equal?: (a: P, b: P) => boolean`** — scope-params comparator, mirroring the convention `asyncQuery`/`asyncStream` already use. Default: a structural value comparison, so `{ regionUrl }` object literals compare by value (not reference). When the new `load(params)` scope is not equal to the loaded one, the collection is stale and refetches. Provide a cheaper/narrower comparator (e.g. `(a, b) => a.id === b.id`) when it matters. Scoped collections are implicitly lazy (no scope to auto-load until one is supplied).
- **`config.clearOnParamsChange?: boolean`** (default `false`) — renamed from the 11.3.0 `clearOnKeyChange`. On a scope change, keep the previous scope's rows visible (no flicker) until the new scope's load settles. Set `true` to blank rows immediately instead.
- **`.load(params)`** — scoped collections require the params argument; the parameterless `.load()` is unchanged for global (unscoped) collections.
- **`.refresh(params?)`** — omit `params` to force a reload of the last-loaded scope; pass `params` to refresh (or switch to) a specific scope.
- **`params: Signal<P | undefined>`** — replaces the 11.3.0 `currentKey: Signal<string | null>`. Exposes the **typed** scope of the currently-loaded data (not a serialized string); `undefined` for a global collection or before its first load.
- **Concurrency semantics**: same scope (per `equal`) + fresh → `.load()` is a no-op; same scope while a fetch is already in-flight → single-flight (one request services all callers); a scope that is **not equal** to the in-flight one → the new request supersedes (last-request-wins) — the stale in-flight result is never written into state, though its promise still resolves normally for any caller awaiting it.
- **`persist` write-through** now uses a per-scope storage key (`${key}::${stableStringify(params)}`) for scoped collections, so multiple scopes persist independently under the same base key. Scoped `hydrateThenRevalidate` seeds a scope on its first `load(params)` call for that scope.
- 100% backward compatible for the parameterless (global) form (`P` defaulting to `void`) — unchanged in behavior and typing. The 11.3.0 `entityCollection` marker itself does not carry forward, but it was never a published release, so nothing real depends on it.

### Fixed — NG0600 on non-lazy cache-aware `entityMap` / `asyncSource`

- **Deferred auto-load + offline-first seed.** SignalTree finalizes markers lazily on first `.$` access, which is frequently a template read *during* Angular's render pass. A non-lazy cache-aware `entityMap`'s initial auto-load, and any `persist.hydrateThenRevalidate` offline-first seed, previously ran synchronously inside that materialization step — writing signals mid-render and throwing `NG0600: Writing to signals is not allowed while Angular renders` when the collection was first read from a template. Both are now deferred to a microtask, landing after the current render pass, so a non-lazy collection (or `asyncSource`) read first inside a template is render-safe.
- **Observable consequence: auto-load is now asynchronous.** Data for a non-lazy cache-aware `entityMap`/`asyncSource` arrives on the next microtask rather than synchronously during tree construction — `loading()` reads `true` starting the microtask after materialization, not synchronously within it. Tests reading immediately after `signalTree()` construction should `await Promise.resolve()` (or flush microtasks) before asserting loaded state.
- Applies to both markers: `entityMap`'s cache-aware form (global/non-lazy collections only — scoped collections were already lazy) and `asyncSource`.

### Compatibility

- **Angular 22 peer support** — `@angular/*` peer ranges widened to `^20 || ^21 || ^22` across all packages (the signals APIs used are stable across these majors). No code change; `@signaltree/*` continues to require Angular 17+ signals.

## 11.2.0 (2026-07-20)

### Public API additions — `entityCollection` marker (RFC 0002)

- **`entityCollection<E, K>(config)`** — a cache-aware entity-collection loader. Composes the full `entityMap` surface (CRUD + query signals) with a loader, load status, a freshness guard, single-flight dedup, tag-based invalidation, and optional offline-first persistence — the boilerplate every server-backed `entityMap` consumer previously hand-wired. Config: `load`, `selectId`, `sortComparer`, `lazy`, `staleTime` (ms or `'30m'`; default `0` = always stale), `swr`, `tags`, `persist` (reuses the existing `StorageAdapter`/`createIndexedDBAdapter`, with `hydrateThenRevalidate` for offline-first SWR). Methods: `.load()` (guarded — no-op if fresh OR in-flight, so concurrent callers coalesce to one fetch), `.refresh()` (force, still single-in-flight), `.invalidate()` (mark stale only). Status signals: `.loading()`, `.loaded()`, `.error()`, `.lastLoadedAt()`. Auto-loads on first `tree.$` access unless `lazy: true`.
- **`invalidateTag(tree, tag)`** — marks every `entityCollection` carrying `tag` stale by walking `tree.$` (no global registry). The clean seam for push-driven freshness (SSE/SignalR → `@signaltree/realtime`). Returns the number of collections invalidated.

### Scope notes (RFC 0002)

- Deliberately **not** added: a 3-way `cache-first | SWR | network-first` policy enum (`staleTime` + `swr` cover the real need); merging the `stored` marker and `persistence` enhancer (distinct scopes, both retained); a general `tree.invalidate(path)` (tag-based invalidation on loaded collections covers the demand, path-based deferred).

## 9.3.0 (2026-05-28)

### Public API additions (enhancer infrastructure)

- **`UpdateMetadata`** lifted from `@signaltree/guardrails` to `@signaltree/core`. Cross-cutting metadata is core-level concern. Guardrails keeps a deprecated re-export for one minor release.
- **`withWriteContext(meta, fn)` / `getActiveWriteContext()`** (`./lib/write-context.ts`) — synchronous ambient channel for tagging writes with `UpdateMetadata`. Enhancer-author API: capture metadata at write time without changing Angular's `WritableSignal.set(value)` signature.
- **`interceptLeafSignals` callback widened** with optional 4th argument `meta?: UpdateMetadata`. Existing 3-arg callbacks continue to work. Captures the active write context synchronously immediately before invoking `onWrite`.
- **`interceptLeafSignals` promoted to public API** for external enhancer authors (was internal-by-convention; used by core's devtools + time-travel; now consumable by `@signaltree/schema` and downstream packages). Removed `@internal` JSDoc tag so the d.ts emit includes the full signature under `stripInternal: true`.

### Internal: replay sites tagged with metadata

- **`devTools.applyExternalState`** (Redux DevTools time-travel) wraps its replay in `withWriteContext({ intent: 'system', source: 'time-travel' })` so downstream enhancers can distinguish replays from user writes.
- **`timeTravel.restoreState`** (the time-travel enhancer's undo/redo/jumpTo) wraps similarly.

### Why this matters

External enhancers that need to react to writes (validation, audit logging, telemetry) can now distinguish user writes from system replays without payload-shape sniffing. The ambient channel is the only seam that doesn't fork Angular's `WritableSignal` API.

### Compatibility

- 100% backwards compatible for application code.
- Backwards compatible for existing enhancers: the new 4th callback argument is optional.
- `@signaltree/guardrails` continues to work via `@deprecated` re-export of `UpdateMetadata`; `extractMetadata` now reads `getActiveWriteContext()` first and falls back to the legacy payload-shape sniff.

### Tests

19 new tests across `write-context.spec.ts`, `internals/intercept-leaf-signals.spec.ts`, and `enhancers/time-travel/time-travel-metadata.spec.ts`. All existing core / guardrails / devtools / time-travel / ng-forms tests pass unchanged.
