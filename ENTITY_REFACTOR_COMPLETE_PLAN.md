# SignalTree Entity Refactor + PathNotifier: Complete Implementation Plan

## Overview

This is the complete architectural redesign for SignalTree v5.0, combining:

1. **Map-based entity collections** (O(1) operations, scoped hooks)
2. **PathNotifier backbone** (unified change detection, fixes enhancer bugs)
3. **Angular-native DX** (no framework-agnostic detour)

The PathNotifier solves critical issues in current enhancers while providing the infrastructure for scoped entity hooks.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SignalTree<T>                           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    PathNotifier                           │  │
│  │           (Internal, instance-scoped)                     │  │
│  │                                                           │  │
│  │  • Catches ALL mutations (root, leaf, entity, batch)      │  │
│  │  • Path-based subscriptions with wildcards                │  │
│  │  • Interceptors for blocking/transforming                 │  │
│  │  • Guaranteed cleanup on destroy                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│         │              │              │              │          │
│         │              │              │              │          │
│    ┌────┴────┐    ┌────┴────┐    ┌───┴────┐    ┌───┴────┐     │
│    │ Entity  │    │ Global  │    │ Global │    │ Global │     │
│    │  Hooks  │    │ Logging │    │Batching│    │Persist │     │
│    │ (Scoped)│    │(Pattern)│    │(Global)│    │(Event) │     │
│    └─────────┘    └─────────┘    └────────┘    └────────┘     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    State Tree                             │  │
│  │  tree.$: EntityAwareTreeNode<T>                           │  │
│  │  └── users: EntitySignal<User, string>                    │  │
│  │      ├── ['u1']: EntityNode<User>                         │  │
│  │      ├── all(): Signal<User[]>                            │  │
│  │      ├── addOne(user): K                                  │  │
│  │      ├── tap(handlers): () => void                        │  │
│  │      └── intercept(handlers): () => void                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why PathNotifier Solves Both Problems

### Entity Hooks (Scoped)

```typescript
// Entity mutations trigger PathNotifier
tree.$.users.addOne(user);
  ↓
EntitySignal.addOne() calls setAtPath('users.u1', user)
  ↓
PathNotifier.notify('users.u1', user, undefined)
  ↓
EntitySignal's internal tap/intercept handlers fire
```

### Global Enhancers (Unified)

```typescript
// All mutations eventually trigger PathNotifier
tree.$.count(5)              // Signal.set() → notify()
tree.batchUpdate(fn)         // Each child update → notify()
tree.$.users.addOne(user)    // Entity mutation → notify()
  ↓
PathNotifier catches ALL via pattern matching
  ↓
withBatching, withLogging, withPersistence subscribe to patterns
```

---

## Implementation Phases

### Phase 1: Types (COMPLETED ✅)

- [x] EntitySignal interface
- [x] EntityConfig, TapHandlers, InterceptHandlers
- [x] Global enhancer configs
- [x] PathNotifier interface (internal)
- [x] Deprecated old EntityHelpers

**Commit:** `8c4ef01` feat: add new Map-based entity types

---

### Phase 2: PathNotifier Core (2-3 days)

**Goal:** Implement internal PathNotifier infrastructure

**Tasks:**

- [ ] Create `packages/core/src/lib/path-notifier.ts`

  - [ ] Pattern matching (wildcard, function filter, glob patterns)
  - [ ] Subscriber management with cleanup
  - [ ] Interceptor chain with async support
  - [ ] Context object for blocking/transforming
  - [ ] Type-safe path parameter

- [ ] Create `packages/core/src/lib/path-notifier.spec.ts`
  - [ ] Pattern matching tests (wildcards, recursive, functions)
  - [ ] Subscription lifecycle
  - [ ] Interceptor ordering
  - [ ] Async interceptor support
  - [ ] Cleanup verification

**Key Implementation Details:**

```typescript
// Pattern matching examples
'users'              → exact path
'users.*'            → direct children only
'users.**'           → all descendants
(path) => path.startsWith('ui') → function filter
```

**Expected Bundle Impact:** +0.8KB gzipped (new core, reused by all enhancers)

---

### Phase 3: SignalTree Core Integration (2-3 days)

**Goal:** Wire PathNotifier into all mutation points

**Tasks:**

- [ ] Add internal `__pathNotifier: PathNotifier` to SignalTree (not exposed)
- [ ] Wrap all signal setters to call PathNotifier

  - [ ] Root `tree()` callable
  - [ ] Direct signal `.set()` / `.update()` calls
  - [ ] `tree.batchUpdate()`
  - [ ] Nested signal access: `tree.$.foo.bar.set()`

- [ ] Create `packages/core/src/lib/signal-tree.spec.ts` additions
  - [ ] Verify all mutations trigger notifications
  - [ ] Test pattern matching at different depths
  - [ ] Test interceptor blocking
  - [ ] Test async interceptors

**Complexity:** Medium (need to ensure no performance regression)

---

### Phase 4: EntitySignal Implementation (5-7 days)

**Goal:** Implement full Map-based EntitySignal with hooks

**Tasks:**

- [ ] Create `packages/core/src/enhancers/entities/lib/entity-signal.ts`

  - [ ] Map storage with signal wrappers
  - [ ] Bracket access via Proxy: `['u1']()`
  - [ ] Explicit methods: `byId()`, `byIdOrFail()`
  - [ ] Queries: `all()`, `count()`, `ids()`, `has()`, `isEmpty()`, `where()`, `find()`
  - [ ] Mutations: `addOne/Many`, `updateOne/Many/Where`, `upsertOne/Many`, `removeOne/Many/Where`
  - [ ] Computed signals (lazy initialization)

- [ ] Add hook execution to each mutation

  - [ ] Run EntityConfig.hooks first (transform/block)
  - [ ] Run tap handlers (observation)
  - [ ] Run intercept handlers (blocking/transform)
  - [ ] Proper error handling with onError callback

- [ ] Update `withEntities()` enhancer

  - [ ] Detect EntityMapMarker in state
  - [ ] Create EntitySignal instances for each collection
  - [ ] Inject PathNotifier into EntitySignal
  - [ ] Wire entity mutations → PathNotifier

- [ ] Create comprehensive test suite
  - [ ] All mutation types
  - [ ] Hook execution order
  - [ ] Error handling (duplicate add, missing update, etc.)
  - [ ] Async interceptors
  - [ ] Cleanup on destroy

**Expected Bundle Impact:** ~1.5KB gzipped (was ~1.2KB with arrays, now with Maps + hooks)

---

### Phase 5: Fix Critical Enhancer Bugs (3-4 days)

**Goal:** Fix batching, persistence, time-travel, devtools with PathNotifier

**5.1 Migrate Batching** (1 day)

- [ ] Rewrite `withBatching()` to use PathNotifier
- [ ] Remove global `updateQueue` and `flushTimeoutId`
- [ ] Make each tree instance have isolated queue
- [ ] Update tests for instance isolation
- [ ] Benchmark: verify no performance regression

**5.2 Migrate Persistence** (1 day)

- [ ] Rewrite `withPersistence()` to use PathNotifier.subscribe
- [ ] Remove 50ms polling loop
- [ ] Add hash-based change detection to prevent redundant saves
- [ ] Implement proper debouncing with cleanup
- [ ] Test with various storage backends (localStorage, sessionStorage, custom)

**5.3 Migrate Time Travel** (1-2 days)

- [ ] Rewrite `withTimeTravel()` to use PathNotifier.intercept
- [ ] Ensure 100% mutation capture (currently only ~20%)
- [ ] Test with:
  - [ ] Root updates: `tree()`
  - [ ] Leaf updates: `tree.$.x.set()`
  - [ ] Entity mutations: `tree.$.users.addOne()`
  - [ ] Batch updates: `tree.batchUpdate()`
  - [ ] Nested updates: `tree.$.a.b.c.set()`
- [ ] Verify undo/redo works for all cases

**5.4 Migrate DevTools** (1 day)

- [ ] Rewrite `withDevTools()` to use PathNotifier.subscribe
- [ ] Fix incomplete state tracking in Redux DevTools
- [ ] Test time-travel from DevTools extension
- [ ] Verify action names are descriptive (path in action)

**Expected Improvements:**

- ✅ Batching: Global state → Instance state (fixes race conditions)
- ✅ Persistence: 20,000 calls/sec → 0 calls/sec (when idle)
- ✅ Time Travel: 20% coverage → 100% coverage
- ✅ DevTools: Incomplete → Complete tracking

---

### Phase 6: Entity Integration (1-2 days)

**Goal:** Ensure entities work seamlessly with global enhancers

**Tasks:**

- [ ] Test entities + batching (entities batch updates)
- [ ] Test entities + persistence (entity collections persist)
- [ ] Test entities + time-travel (entity adds/updates/removes tracked)
- [ ] Test entities + devtools (entity ops show in DevTools)
- [ ] Test entities + logging (entity paths match log format)

- [ ] Add entity serialization support
  - [ ] Convert Map to/from JSON in persistence
  - [ ] Restore entity signals after hydration

---

### Phase 7: Cleanup & Documentation (1-2 days)

**Goal:** Polish, deprecation warnings, migration guide

**Tasks:**

- [ ] Add deprecation warnings to old APIs

  - [ ] `tree.addTap()` → points to global enhancers
  - [ ] `tree.removeTap()` → points to global enhancers
  - [ ] `tree.entities<E>('path')` → points to entityMap + tree.$

- [ ] Update all enhancer JSDoc comments
- [ ] Create migration guide (`MIGRATION_v5.md`)

  - [ ] Before/after examples for each pattern
  - [ ] How to migrate from old entity API
  - [ ] How to create custom enhancers with PathNotifier

- [ ] Update demo app

  - [ ] Replace old entity usage with new API
  - [ ] Add examples of tap/intercept hooks
  - [ ] Add examples of global enhancers working together

- [ ] Performance benchmarks

  - [ ] Entity mutations (array vs Map)
  - [ ] Persistence writes (polling vs event-driven)
  - [ ] Batching efficiency (queue isolation)
  - [ ] Time travel completeness

- [ ] Update documentation site
  - [ ] Entity collection guide
  - [ ] Hook examples
  - [ ] Enhancer architecture overview
  - [ ] Troubleshooting section

---

### Phase 8: Release & Testing (1-2 days)

**Goal:** Final validation, bump to v5.0, tag release

**Tasks:**

- [ ] Run full test suite
- [ ] Bundle size check (expect ~2-3KB increase, justified by fixes)
- [ ] Manual QA with real-world app
- [ ] Update CHANGELOG.md with breaking changes
- [ ] Bump version to 5.0.0 (major)
- [ ] Create GitHub release with migration guide
- [ ] Announce on Discussions

---

## Timeline Summary

| Phase     | Work               | Days           | Cumulative |
| --------- | ------------------ | -------------- | ---------- |
| 1         | Types              | 0              | 0 (done)   |
| 2         | PathNotifier       | 2-3            | 2-3        |
| 3         | Core Integration   | 2-3            | 4-6        |
| 4         | EntitySignal       | 5-7            | 9-13       |
| 5         | Fix Enhancers      | 3-4            | 12-17      |
| 6         | Entity Integration | 1-2            | 13-19      |
| 7         | Polish & Docs      | 1-2            | 14-21      |
| 8         | Release            | 1-2            | 15-23      |
| **Total** |                    | **15-23 days** |            |

**Realistic estimate: 20-25 days** (accounting for review, testing, iteration)

---

## Risk Mitigation

| Risk                               | Likelihood | Impact | Mitigation                                             |
| ---------------------------------- | ---------- | ------ | ------------------------------------------------------ |
| PathNotifier perf overhead         | Low        | Medium | Benchmark hot paths, lazy initialization               |
| Breaking existing enhancers        | Medium     | High   | Maintain backward-compatible API, deprecation warnings |
| Entity + enhancer interaction bugs | Medium     | Medium | Comprehensive integration tests                        |
| Bundle size bloat                  | Low        | Low    | Tree-shake old code, measure gzipped size              |

---

## Success Criteria

✅ **Types** — Comprehensive, zero-runtime cost, fully typed
✅ **PathNotifier** — Instance-scoped, 100% mutation coverage, proper cleanup
✅ **EntitySignal** — O(1) lookups, scoped hooks, full CRUD
✅ **Global Enhancers** — No global state, unified infrastructure, zero polling
✅ **No Memory Leaks** — All subscriptions/timers cleaned up on destroy
✅ **Performance** — Entity ops 40-100x faster, batching more efficient
✅ **DX** — Type-safe, intuitive, fully documented
✅ **Test Coverage** — All new code tested, existing tests pass

---

## Development Strategy

### Start Immediately

1. Phase 2: PathNotifier (foundation for everything else)
2. Phase 3: Core integration (ensure notifications work)
3. Phase 4: EntitySignal (main feature)

### Parallel Work (After Phase 3)

- Phase 5.1-5.2: Batching & persistence (medium complexity, lower risk)
- Phase 6: Entity integration (validates architecture)

### After EntitySignal Stabilizes

- Phase 5.3-5.4: Time travel & devtools (higher complexity, needs careful testing)
- Phase 7-8: Polish & release

---

## Interdependencies

```
Phase 1 (Types)
    ↓
Phase 2 (PathNotifier)
    ↓
Phase 3 (Core Integration) ────┐
    ↓                          │
Phase 4 (EntitySignal) ◄───────┘
    ↓
Phase 5 (Fix Enhancers) ◄─── Can start after Phase 3
    ↓
Phase 6 (Entity Integration)
    ↓
Phase 7 (Cleanup)
    ↓
Phase 8 (Release)
```

---

## Files to Create/Modify

### New Files

- `packages/core/src/lib/path-notifier.ts` — PathNotifier implementation
- `packages/core/src/lib/path-notifier.spec.ts` — Tests
- `packages/core/src/enhancers/entities/lib/entity-signal.ts` — EntitySignal impl
- `MIGRATION_v5.md` — Migration guide

### Modified Files

- `packages/core/src/lib/types.ts` — (already updated ✅)
- `packages/types/src/index.ts` — (already updated ✅)
- `packages/core/src/lib/signal-tree.ts` — Add PathNotifier integration
- `packages/core/src/enhancers/entities/lib/entities.ts` — Rewrite for Map-based
- `packages/core/src/enhancers/batching/lib/batching.ts` — Use PathNotifier
- `packages/core/src/enhancers/serialization/lib/serialization.ts` — Use PathNotifier
- `packages/core/src/enhancers/time-travel/lib/time-travel.ts` — Use PathNotifier
- `packages/core/src/enhancers/devtools/lib/devtools.ts` — Use PathNotifier
- `apps/demo/` — Update examples

### Files to Deprecate (v6.0)

- Old entities.ts (keep as shim)
- Direct `addTap`/`removeTap` implementation

---

## Code Review Checklist

Before merging each phase:

- [ ] All tests pass (unit + integration)
- [ ] No TypeScript errors
- [ ] Bundle size impact acceptable
- [ ] Performance benchmarks acceptable
- [ ] JSDoc comments complete
- [ ] No breaking changes (or clearly documented)
- [ ] Backward compatibility (deprecations ok for v5.0)

---

## Next Steps

1. **Immediately:** Start Phase 2 (PathNotifier core)
2. **Parallel:** Prepare Phase 3 (core integration)
3. **After Phase 3:** Parallel Phase 5.1-5.2 (fix enhancers) + Phase 4 (EntitySignal)
4. **Final:** Phase 6-8 (integration, polish, release)

---

## References

- Type definitions: `/packages/core/src/lib/types.ts` (Phase 1 ✅)
- Enhancer issues: `ENHANCER_IMPROVEMENTS.md` (detailed analysis)
- Original plan: Entity + middleware redesign (this document synthesizes both)
