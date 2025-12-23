# v5.0 Refactor: Complete Architecture & Implementation Map

## Executive Summary

SignalTree v5.0 is a major architectural redesign solving **three interconnected problems** with **one unified solution**:

| Problem              | Current                    | v5.0 Solution               |
| -------------------- | -------------------------- | --------------------------- |
| Entity lookups       | O(n) with `.find()`        | O(1) with Map               |
| Entity hooks scope   | Pollutes root API          | Scoped to EntitySignal      |
| Enhancer reliability | Global state, 20% coverage | PathNotifier backbone, 100% |

The key insight: **PathNotifier is the missing piece** that makes both entities AND enhancers work correctly.

---

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Application Code (User)                          │
│  tree.$.users.tap({...})  tree.$.count.set(5)  withBatching(...)   │
└────────────────────────────────────────────────────────────────────┬┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│              Public API Layer (No Breaking Changes)                 │
│  • tree.$: EntityAwareTreeNode                                      │
│  • tree.$.collection: EntitySignal                                  │
│  • tree.with(enhancer): WithMethods                                 │
│  • withLogging, withBatching, withPersistence, withDevTools, etc.   │
└────────────────────────────────────────────────────────────────────┬┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│         Implementation Layer (Internal, Coordinated)                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    PathNotifier                             │   │
│  │  Internal backbone for all change detection & control       │   │
│  │  • NOT exposed on root tree                                 │   │
│  │  • Instance-scoped (no global state)                        │   │
│  │  • Catches ALL mutations (root, leaf, entity, batch)        │   │
│  │  • Path-based subscriptions (exact, wildcard, function)     │   │
│  │  • Interceptor chain (can block/transform)                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                             ▲                                       │
│         ┌───────────────────┼───────────────────┐                  │
│         │                   │                   │                  │
│  ┌──────┴────────┐  ┌──────┴─────┐  ┌──────────┴───────┐         │
│  │  EntitySignal │  │SignalTree   │  │ Enhancers        │         │
│  │  (scoped)     │  │ Core        │  │ (global)         │         │
│  │               │  │             │  │                  │         │
│  │ tap/intercept │  │Wrap signal  │  │Batch (queue)    │         │
│  │for collection │  │setters      │  │Persist (event)  │         │
│  │               │  │notify()     │  │TimeTravel (cap) │         │
│  │               │  │             │  │DevTools (track) │         │
│  └───────────────┘  └─────────────┘  │Logging (filter) │         │
│                                       └─────────────────┘         │
│                                                                     │
│  All three layers use PathNotifier for coordination                │
└────────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│           Storage Layer (WritableSignal + Map)                      │
│  • Root state in WritableSignal                                     │
│  • Nested signals created recursively                               │
│  • Entity collections stored in Map<K, WritableSignal<E>>           │
└────────────────────────────────────────────────────────────────────┘
```

---

## Mutation Flow Diagram

### Single Mutation Path

```
User Code
  │
  ├─ tree.$.count.set(5)              ─────┐
  ├─ tree.$.users.addOne(user)        ─────┤
  ├─ tree.batchUpdate(fn)             ─────┼──→ Signal.set() or Signal.update()
  ├─ tree({ count: 5 })               ─────┤
  └─ tree.$.nested.deep.value.set(v)  ─────┘
                                       │
                                       ▼
                       ┌─────────────────────────────┐
                       │   Wrapped signal.set/update │
                       │   (added in Phase 3)        │
                       └─────────────────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────┐
                    │  tree.__pathNotifier.runIntercept │
                    │  (Phase 2)                        │
                    │                                   │
                    │ For each matching pattern:        │
                    │ 1. Call interceptor(ctx, next)    │
                    │ 2. Interceptor can:               │
                    │    - Call next() to continue      │
                    │    - Call ctx.block() to cancel   │
                    │    - Await async validation       │
                    └──────────────────────────────────┘
                                       │
                    ┌──────────────────┴────────────────┐
                    │                                    │
          ┌─────────▼──────────┐             ┌──────────▼────────┐
          │  Blocked by any    │             │  Not blocked,     │
          │  interceptor?      │             │  continue         │
          └─────────┬──────────┘             └──────────┬────────┘
                    │                                    │
          YES ◀─────┴─────────────┐        NO ◀─────────┴─────────┐
                    │                                    │
            ┌───────▼──────────┐              ┌─────────▼────────┐
            │  Throw error     │              │ Apply mutation   │
            │  (mutation fails) │             │ (Signal.set)     │
            └──────────────────┘              └─────────┬────────┘
                                                        │
                                    ┌───────────────────▼──────────┐
                                    │  pathNotifier.notify(path,   │
                                    │    value, prev)              │
                                    │  (Phase 3)                   │
                                    │                              │
                                    │ For each matching pattern:    │
                                    │ • Call subscriber(value, ...) │
                                    │ • Call tap handlers           │
                                    │ • Enhancers react             │
                                    └──────────────────────────────┘
                                                    │
                            ┌───────────────────────┼────────────────┐
                            │                       │                │
                    ┌───────▼──────┐      ┌────────▼────┐   ┌──────▼────┐
                    │  Batching    │      │ Persistence │   │ Time      │
                    │  enhancer    │      │  enhancer   │   │ Travel    │
                    │              │      │             │   │ enhancer  │
                    │ Adds to      │      │ Debounces & │   │           │
                    │ batch queue  │      │ saves to    │   │ Records   │
                    │              │      │ storage     │   │ snapshot  │
                    └──────────────┘      └─────────────┘   └───────────┘
                            │
                    ┌───────▴──────────┐
                    │ Queue exceeds    │
                    │ size or timeout? │
                    └───────┬──────────┘
                            │
                        YES ▼
                    ┌──────────────┐
                    │  Flush batch │
                    │  to mutations│
                    └──────────────┘
```

### Example: Entity Addition

```
User code:
  const userId = tree.$.users.addOne({ id: 'u1', name: 'Alice' });

Flow:
  ↓
EntitySignal.addOne(user)
  ├─ Call interceptor.onAdd(user, ctx)   ← Phase 4 (EntitySignal)
  │   └─ Can throw to block
  ├─ Store in Map<K, WritableSignal>
  ├─ setAtPath('users.u1', user)
  │   └─ tree.__pathNotifier.notify('users.u1', user, undefined)  ← Phase 3
  │       ├─ Batching intercepts: adds to queue
  │       ├─ Persistence subscribes: marks for save
  │       ├─ TimeTravel subscribes: records snapshot
  │       └─ Any custom enhancer pattern matches
  ├─ Call tap.onAdd(user, 'u1')          ← Phase 4 (EntitySignal)
  └─ Return 'u1'

Result:
  ✅ Entity stored in Map
  ✅ All global enhancers notified
  ✅ Local hooks executed
  ✅ Can batch, persist, time-travel, log without touching EntitySignal code
```

---

## Phase Breakdown & Dependencies

```
┌──────────────────────────┐
│ Phase 1: Type Definitions│  (✅ COMPLETE)
│ - EntitySignal interface │
│ - EntityConfig options   │
│ - Hook types             │
│ - Deprecation markers    │
└────────────┬─────────────┘
             │
┌────────────▼─────────────┐
│ Phase 2: PathNotifier    │  (Foundation)
│ - Pattern matching       │
│ - Subscriber registry    │
│ - Interceptor chain      │
│ - Cleanup logic          │
└────────────┬─────────────┘
             │
┌────────────▼──────────────────┐
│ Phase 3: Core Integration     │  (Required before 4, 5.1-5.2)
│ - Add __pathNotifier to tree  │
│ - Wrap signal setters         │
│ - Wire batchUpdate            │
└────────────┬──────────────────┘
             │
     ┌───────┴─────────────────────┬─────────────────────────┐
     │                             │                         │
┌────▼────────────┐      ┌────────▼──────┐      ┌──────────▼───┐
│ Phase 4:        │      │ Phase 5:       │      │ Phase 6:      │
│ EntitySignal    │      │ Fix Enhancers  │      │ Integration   │
│                 │      │                │      │               │
│ - Map storage   │      │ 5.1: Batching  │      │ - Entities +  │
│ - CRUD ops      │      │ (instance qty) │      │   Batching    │
│ - Queries       │      │                │      │ - Entities +  │
│ - Local hooks   │      │ 5.2: Persist   │      │   Persist     │
│                 │      │ (event-driven) │      │ - Entities +  │
│ Duration: 5-7d  │      │                │      │   TimeTravel  │
│                 │      │ 5.3: TimeTravel│      │ - Entities +  │
│                 │      │ (100% cover)   │      │   DevTools    │
│                 │      │                │      │               │
│                 │      │ 5.4: DevTools  │      │ Duration: 1-2d│
│                 │      │ (complete)     │      │               │
│                 │      │                │      │               │
│                 │      │ Duration: 3-4d │      │               │
└────────────────┘      └────────────────┘      └───────────────┘
       │                         │                      │
       └─────────────┬───────────┴──────────────────────┘
                     │
            ┌────────▼────────┐
            │ Phase 7: Polish │  (Documentation)
            │ & Migration     │
            │ Duration: 1-2d  │
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │ Phase 8: Release│  (Testing & Publishing)
            │ v5.0            │
            │ Duration: 1-2d  │
            └─────────────────┘
```

---

## Code Organization

### Directories & Files

```
packages/core/src/
├── lib/
│   ├── types.ts                    (Phase 1 ✅)
│   │   ├── EntityMapMarker<E, K>
│   │   ├── EntitySignal<E, K>
│   │   ├── TapHandlers<E, K>
│   │   ├── InterceptHandlers<E, K>
│   │   ├── entityMap<E, K>()
│   │   └── PathNotifier (interface only)
│   │
│   ├── path-notifier.ts            (Phase 2)
│   │   ├── PatternMatcher
│   │   ├── PathNotifier (implementation)
│   │   └── InterceptContext<T>
│   │
│   └── signal-tree.ts              (Phase 3)
│       └── Modified to wrap signals + integrate PathNotifier
│
├── enhancers/
│   ├── entities/                   (Phase 4)
│   │   └── lib/
│   │       ├── entity-signal.ts    (EntitySignal class)
│   │       ├── entity-node.ts      (Bracket access via Proxy)
│   │       ├── entities.ts         (withEntities() enhancer)
│   │       └── entities.spec.ts
│   │
│   ├── batching/lib/               (Phase 5.1)
│   │   └── batching.ts             (Rewrite with PathNotifier)
│   │
│   ├── serialization/lib/          (Phase 5.2)
│   │   └── serialization.ts        (Rewrite with event-driven)
│   │
│   ├── time-travel/lib/            (Phase 5.3)
│   │   └── time-travel.ts          (Rewrite with 100% coverage)
│   │
│   └── devtools/lib/               (Phase 5.4)
│       └── devtools.ts             (Rewrite with complete tracking)

packages/types/src/
└── index.ts                         (Phase 1 ✅)
    └── Re-exports all entity types from core

Documentation:
├── ENTITY_REFACTOR_COMPLETE_PLAN.md    (8-phase overview)
├── PATHNOTIFIER_UNIFICATION.md         (Why PathNotifier works)
├── DESIGN_DECISIONS.md                 (Locked decisions)
├── ARCHITECTURE.md                     (This file)
├── MIGRATION_v5.md                     (Phase 7)
└── ENHANCER_IMPROVEMENTS.md            (Detailed analysis)
```

---

## DX Comparison: Before vs After

### Entity Operations

**Before (v4.x):**

```typescript
const tree = signalTree({
  users: [] as User[],
});

// ❌ O(n) lookup, not type-safe
const user = tree().users.find((u) => u.id === 'u1');
user.name = 'Alice';

// ❌ No validation/control
```

**After (v5.0):**

```typescript
const tree = signalTree({
  users: entityMap<User, string>({
    keyOf: u => u.id
  })
});

// ✅ O(1) lookup, type-safe
const user = tree.$.users['u1']();
tree.$.users['u1'].name.set('Alice');

// ✅ Scoped to collection, clean API
tree.$.users.tap({
  onAdd: (user, id) => console.log('Added:', user.name),
  onUpdate: (id, changes) => console.log('Updated:', id),
  onRemove: (id) => console.log('Removed:', id),
});

// ✅ Validation + control
tree.$.users.intercept({
  onAdd: async (user, ctx) => {
    const result = await validateUser(user);
    if (!result.valid) ctx.block(result.error);
  }
});

// ✅ Can unsubscribe
const unsub = tree.$.users.tap({...});
unsub();
```

### Global Enhancers

**Before (v4.x):**

```typescript
// ❌ Global state → race conditions
withBatching({ maxBatchSize: 100 });

// ❌ 50ms polling loop, never cleaned up
withPersistence({ key: 'state', autoSave: true });

// ❌ Only catches 20% of mutations
withTimeTravel();

// ❌ Incomplete state in DevTools
withDevTools();

// ❌ Each enhancer reinvents change detection
```

**After (v5.0):**

```typescript
// ✅ Instance-scoped queue, no interference
withBatching({ maxBatchSize: 100 });

// ✅ Event-driven, 0 calls when idle, proper cleanup
withPersistence({ key: 'state', autoSave: true });

// ✅ Catches 100% of mutations (root, leaf, entity, batch)
withTimeTravel();

// ✅ Complete state tracking in DevTools
withDevTools();

// ✅ All use PathNotifier, unified infrastructure
```

---

## Performance Profile

### Entity Operations

| Operation | v4.x (Array)            | v5.0 (Map)          | Improvement |
| --------- | ----------------------- | ------------------- | ----------- |
| addOne    | O(1)                    | O(1)                | —           |
| updateOne | O(n) find + O(1) set    | O(1) get + O(1) set | 40-100x     |
| removeOne | O(n) find + O(n) splice | O(1) delete         | 40-100x     |
| byId      | O(n) .find()            | O(1) .get()         | 40-100x     |
| all()     | O(1) (ref)              | O(n) computed       | —           |

### Persistence

| Aspect                 | v4.x            | v5.0           | Improvement  |
| ---------------------- | --------------- | -------------- | ------------ |
| Detection              | 50ms polling    | Event-driven   | 0 idle calls |
| Trees with 100 signals | 2,000 calls/sec | 0 calls (idle) | ∞            |
| CPU usage (idle)       | High            | Minimal        | 90%+         |
| Memory cleanup         | Leaks           | Guaranteed     | ✅           |

### Time Travel

| Aspect                         | v4.x              | v5.0 | Improvement |
| ------------------------------ | ----------------- | ---- | ----------- |
| Coverage                       | ~20% of mutations | 100% | 5x          |
| Tracked: root `tree()`         | ✅                | ✅   | —           |
| Tracked: leaf `tree.$.x.set()` | ❌                | ✅   | ✅          |
| Tracked: entity `addOne()`     | ❌                | ✅   | ✅          |
| Tracked: batch updates         | ❌                | ✅   | ✅          |

### Bundle Size Impact

```
PathNotifier:      +0.8 KB (shared backbone)
EntitySignal:      +1.5 KB (was ~1.2 KB with arrays)
Enhancer cleanup:  -0.5 KB (remove duplicate logic)
Type utilities:    +0.3 KB (exported types)
────────────────────────────
Net impact:        ~+2.1 KB gzipped

Justified by:
- 40-100x faster entity operations
- 0 polling calls in persistence
- 100% mutation tracking in time-travel
- No memory leaks
- Instance-scoped batching
```

---

## Testing Strategy

### Unit Tests (Per-Phase)

```
Phase 2: PathNotifier
  ✓ Pattern matching (exact, wildcard, predicate)
  ✓ Subscribe/unsubscribe lifecycle
  ✓ Notify propagation
  ✓ Interceptor ordering
  ✓ Async interceptor support
  ✓ Blocking behavior
  ✓ Cleanup on destroy

Phase 3: Core Integration
  ✓ All mutations trigger notify
  ✓ Nested path accuracy
  ✓ Root callable → notify
  ✓ Batch updates → notify
  ✓ No performance regression

Phase 4: EntitySignal
  ✓ CRUD operations (add, update, remove)
  ✓ Bulk operations (addMany, updateMany, removeMany)
  ✓ Query operations (all, count, where, find)
  ✓ Bracket access (tree.$.users['u1']())
  ✓ Tap hook lifecycle
  ✓ Intercept hook blocking
  ✓ Async validation
  ✓ Hook cleanup
  ✓ Computed signal caching

Phase 5: Enhancers
  ✓ Batching: queue isolation per tree
  ✓ Persistence: no polling, proper cleanup
  ✓ TimeTravel: 100% coverage of all mutation types
  ✓ DevTools: complete state tracking
  ✓ Logging: filter function support

Phase 6: Integration
  ✓ Entities + Batching
  ✓ Entities + Persistence
  ✓ Entities + TimeTravel
  ✓ Entities + DevTools
  ✓ Multiple enhancers together
```

### Integration Tests

```
✓ Complex entity scenario (add, update, remove, query)
✓ Entity mutations with batching enabled
✓ Entity changes persisted and restored
✓ Undo/redo with entity operations
✓ DevTools time-travel with entities
✓ Memory cleanup with entities
✓ Performance with large entity collections
```

### Backward Compatibility Tests

```
✓ Old tree.entities<E>(path) removed in v5.1.4 (was deprecated)
✓ Migration path is clear (middleware removed)
```

---

## Success Metrics

### Code Quality

- ✅ 0 global mutable state in enhancers
- ✅ 100% type coverage
- ✅ All tests pass
- ✅ No TypeScript errors

### Performance

- ✅ Entity lookups 40-100x faster
- ✅ Persistence 0 calls/sec (idle)
- ✅ Time travel 100% coverage
- ✅ < 5% performance regression on mutations
- ✅ Bundle size < 2.5 KB gzipped

### DX

- ✅ Scoped entity hooks (no root pollution)
- ✅ Type-safe entity operations
- ✅ Clear migration path
- ✅ Comprehensive documentation
- ✅ Example code in demo app

### Reliability

- ✅ No memory leaks
- ✅ Proper cleanup on destroy
- ✅ No cross-tree contamination
- ✅ Async validation support
- ✅ Error handling with onError callback

---

## Release Plan

### v5.0.0 Timeline

**Week 1-2:** Phases 2-3 (PathNotifier + Core)

- Code: ~1500 lines
- Tests: ~1000 lines
- Review: ~2 days

**Week 3:** Phase 4 (EntitySignal)

- Code: ~1200 lines
- Tests: ~1500 lines
- Review: ~2 days

**Week 3-4:** Phases 5-6 (Enhancers + Integration)

- Code: ~800 lines (enhancer rewrites)
- Tests: ~1200 lines
- Review: ~2 days

**Week 5:** Phases 7-8 (Polish + Release)

- Documentation: ~50 pages
- Migration guide: ~20 pages
- Testing: ~3 days
- Release prep: ~1 day

**Total: ~25 days**

### Announcement

````markdown
# SignalTree v5.0: Map-Based Entities + PathNotifier Architecture

## Major Improvements

### Entity Collections: O(n) → O(1)

- New entityMap<E, K>() API for Map-based storage
- 40-100x faster lookups, updates, removals
- Full TypeScript support with branded entity IDs

### Entity Hooks: Now Scoped!

- tree.$.users.tap() and tree.$.users.intercept()
- No more global middleware registry pollution
- Async validation support with ctx.block()

### All Enhancers Fixed

- Batching: No more global state (instance-scoped)
- Persistence: No more polling (event-driven, 0 calls/sec idle)
- TimeTravel: 100% mutation coverage (was 20%)
- DevTools: Complete state tracking
- Logging: Flexible pattern filtering

### Architecture: PathNotifier Backbone

- Internal coordination system for all mutations
- Unified infrastructure shared by entities + enhancers
- No duplicate change detection code
- Proper cleanup, no memory leaks

## Migration

**New API:**

```typescript
tree.$.users.tap(handlers);
tree.$.users; // EntitySignal with full CRUD
```

See MIGRATION_v5.md for complete guide.

## Performance

- Entity ops: 40-100x faster
- Persistence: 0 CPU usage when idle
- TimeTravel: 5x more complete
- Bundle: +2.1 KB (justified)

```

---

## Conclusion

v5.0 is the culmination of the entity + enhancer analysis. PathNotifier is the **missing architectural piece** that makes everything work:

1. **Entities** get scoped hooks via PathNotifier
2. **Enhancers** get unified infrastructure via PathNotifier
3. **Core** gets proper mutation tracking via PathNotifier

This is why the 8 phases work together—they're not separate features, they're **one coherent redesign**.

**Total effort: 20-25 days of focused engineering.**
```
````
