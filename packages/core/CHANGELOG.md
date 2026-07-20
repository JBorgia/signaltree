# @signaltree/core Changelog

## Unreleased

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
