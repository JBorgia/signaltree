# @signaltree/core Changelog

## 11.3.0 (2026-07-20)

### Public API additions — keyed `entityCollection` (RFC 0003)

- **`entityCollection<E, K, P>(config)`** gains a third type param `P` (scope/params type; defaults to `void`, i.e. the existing parameterless form is unchanged). `config.load` becomes `(params: P) => Observable<E[]> | Promise<E[]>` — the loader now receives the scope params.
- **`config.key?: (params: P) => unknown[]`** — presence makes the collection **KEYED**. Return a JSON-stable, order-sensitive array (like a TanStack `queryKey`), e.g. `({ regionUrl }) => [regionUrl]`. `staleTime` freshness is evaluated per-key: a key change marks the collection stale and triggers a refetch even if the previous scope was still fresh. Keyed collections are implicitly lazy (no scope to auto-load until one is supplied).
- **`config.clearOnKeyChange?: boolean`** (default `false`) — on a key change, keep the previous scope's rows visible (no flicker) until the new scope's load settles. Set `true` to blank rows immediately instead.
- **`.load(params)`** — keyed collections require the params argument; the parameterless `.load()` is unchanged for unkeyed collections.
- **`.refresh(params?)`** — omit `params` to force a reload of the last-loaded scope; pass `params` to refresh (or switch to) a specific scope.
- **`currentKey: Signal<string | null>`** — the serialized key of the currently loaded scope; `null` for unkeyed collections.
- **Concurrency semantics**: same key + fresh → `.load()` is a no-op; same key while a fetch is already in-flight → single-flight (one request services all callers); a **different** key requested while the previous key's fetch is still in-flight → the new request supersedes (last-request-wins) — the stale in-flight result is never written into state, though its promise still resolves normally for any caller awaiting it.
- **`persist` write-through** now uses a per-scope storage key (`${key}::${serializedKey}`) for keyed collections, so multiple scopes persist independently under the same base key. Keyed `hydrateThenRevalidate` seeds a scope on its first `load(params)` call for that key.
- 100% backward compatible — the parameterless form (`P` defaulting to `void`, no `key`) is unchanged in behavior and typing.

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
