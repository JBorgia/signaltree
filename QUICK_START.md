# Quick Reference: v5.0 Implementation Start

## Essential Documents (Start Here)

1. **Architecture Overview**
   ```
   ARCHITECTURE.md — Visual diagrams and implementation map
   • Layer architecture (public API → impl → storage)
   • Mutation flow showing how all types are caught
   • Performance profiles (40-100x improvements)
   • Before/after DX comparison
   ```

2. **Design Decisions**
   ```
   DESIGN_DECISIONS.md — Locked architectural decisions
   • Storage: Map<K, WritableSignal<E>>
   • Hook scope: Scoped to EntitySignal
   • PathNotifier: Internal (__pathNotifier), instance-scoped
   • Async: YES, interceptors can be async
   ```

3. **Complete Plan**
   ```
   ENTITY_REFACTOR_COMPLETE_PLAN.md — 8-phase breakdown
   • Phases 2-3: PathNotifier foundation (4-6 days)
   • Phase 4: EntitySignal feature (5-7 days)
   • Phase 5: Fix enhancers (3-4 days)
   • Phases 6-8: Integration, polish, release
   ```

4. **Implementation Checklist**
   ```
   IMPLEMENTATION_CHECKLIST.md — Detailed tasks per phase
   • Specific code to create/modify
   • Test coverage requirements
   • Performance targets
   • Success verification
   ```

## Phase 2: PathNotifier (Ready to Start)

### Goal
Create internal backbone that catches ALL mutations and provides unified change detection for entities + enhancers.

### What to Create
```
packages/core/src/lib/path-notifier.ts  (~400 lines)
├── PatternMatcher class
│   ├── Parse string patterns (exact, *, **)
│   ├── Support function predicates
│   └── Compile to match function
├── PathNotifier class
│   ├── subscribers: Map<PatternKey, Handler[]>
│   ├── interceptors: Map<PatternKey, Handler[]>
│   ├── notify(path, value, prev)
│   ├── subscribe(pattern, handler)
│   ├── intercept(pattern, handler)
│   └── destroy()
└── InterceptContext<T> class
    ├── block(error)
    ├── transform(value)
    └── Properties: blocked, error, value

packages/core/src/lib/path-notifier.spec.ts  (~400 lines)
├── Pattern matching tests
├── Subscription lifecycle tests
├── Notification propagation tests
├── Interception tests (blocking, async)
└── Cleanup tests
```

### Performance Targets
- notify() < 1ms for 1000 handlers
- Pattern matching cached
- No memory leaks on destroy

### Key Insight
This is the foundation that makes both entities AND enhancers work:
- Entities: Will wire mutations through PathNotifier
- Enhancers: Will subscribe to PathNotifier patterns

### Next Phase Dependency
Phase 3 (Core Integration) requires Phase 2 complete to wire PathNotifier into signal setters.

## Phase 3: Core Integration (After Phase 2)

### Goal
Integrate PathNotifier into all mutation points so every change triggers notifications.

### What to Modify
```
packages/core/src/lib/signal-tree.ts
├── Add __pathNotifier: PathNotifier property
├── Create wrapSignalMutation(signal, path) helper
├── Wrap signal.set() to call pathNotifier
├── Wrap signal.update() to call pathNotifier
├── Apply recursively to all signals
└── Add cleanup in destroy()
```

### Critical Check
All these mutations must trigger notify():
- ✅ `tree.$.x.set(5)`
- ✅ `tree.$.x.update(fn)`
- ✅ `tree() { x: 5 }`
- ✅ `tree.batchUpdate(fn)`
- ✅ `tree.$.users.addOne(user)` (Phase 4)

## Phase 4: EntitySignal (After Phase 3)

### Goal
Implement Map-based entity collection with scoped hooks.

### What to Create
```
packages/core/src/enhancers/entities/lib/
├── entity-signal.ts
│   └── EntitySignal<E, K> class
│       ├── entities: Map<K, WritableSignal<E>>
│       ├── CRUD: addOne, updateOne, removeOne, addMany, etc.
│       ├── Queries: all(), count(), where(), find()
│       ├── Hooks: tap(), intercept()
│       └── ~400 lines
├── entity-node.ts
│   └── EntityNode<E> for bracket access
├── entities.ts (rewrite)
│   └── withEntities() enhancer
└── entities.spec.ts
    └── ~600 lines of tests
```

### Key Features
- O(1) lookups via Map.get(id)
- Bracket access: `tree.$.users['u1']()`
- Scoped hooks: `tree.$.users.tap({onAdd, onUpdate})`
- Async validation: `intercept.onAdd can await`

## Phase 5: Fix Enhancers (Overlaps Phase 4)

### What to Rewrite (4 enhancers)

#### 5.1: Batching (Remove Global State)
```
Before: Global updateQueue, flushTimeoutId
After:  Instance-scoped queue via PathNotifier.intercept('**')
Impact: Multiple trees no longer interfere
```

#### 5.2: Persistence (Remove Polling)
```
Before: 50ms setTimeout loop = 20,000 calls/sec
After:  PathNotifier.subscribe() = 0 calls when idle
Impact: Battery friendly, no memory leaks
```

#### 5.3: TimeTravel (Improve Coverage)
```
Before: ~20% of mutations tracked (only root tree() calls)
After:  100% via PathNotifier.intercept('**')
Impact: Undo/redo works for all operations
```

#### 5.4: DevTools (Complete Tracking)
```
Before: Incomplete state in Redux DevTools
After:  All mutations tracked, time-travel works
Impact: Better debugging experience
```

## Quick Decision Tree

```
Should I use Map or array for entities?
→ Map. Phase 1 types are locked to Map.

Should hooks be on root or EntitySignal?
→ EntitySignal. Phase 1 types specify scoped hooks.

Should PathNotifier be exposed on root?
→ NO. It's internal (__pathNotifier). Users use higher-level APIs.

Can interceptors be async?
→ YES. Design supports await validation.

Will this break existing code?
→ NO. Old APIs deprecated in v5.0, removed in v6.0.
  Deprecation warnings added to guide migration.
```

## Performance Quick Reference

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Entity updateOne | O(n) | O(1) | 40-100x |
| Persistence calls/sec | 20,000 | 0 (idle) | ∞ |
| TimeTravel coverage | 20% | 100% | 5x |
| Bundle size | baseline | +2.1 KB | Justified |

## Testing Quick Reference

Each phase has test checklist in IMPLEMENTATION_CHECKLIST.md:

```
Phase 2: PathNotifier
  ✓ Pattern matching (exact, *, **)
  ✓ Subscribe/unsubscribe lifecycle
  ✓ Notification propagation
  ✓ Interceptor ordering
  ✓ Async interceptor support

Phase 3: Core Integration
  ✓ All mutation types trigger notify
  ✓ Nested path accuracy
  ✓ No performance regression

Phase 4: EntitySignal
  ✓ All CRUD operations
  ✓ All query operations
  ✓ Tap/intercept hooks
  ✓ Bracket access

Phase 5: Enhancers
  ✓ Each enhancer isolated
  ✓ No global state
  ✓ Proper cleanup
  ✓ All work together
```

## Common Questions

**Q: Why PathNotifier before EntitySignal?**
A: PathNotifier is the foundation. EntitySignal needs it to wire mutations. Enhancers need it for coordinated observation.

**Q: Why not expose PathNotifier publicly?**
A: Gives flexibility to optimize internally without breaking users. Users interact with higher-level APIs (entity hooks, enhancers).

**Q: Will this slow down mutations?**
A: No. PathNotifier notifications are O(1) per subscription. No performance regression expected. Measured in Phase 3.

**Q: Can I run multiple phases in parallel?**
A: Phases 5.1-5.2 (batching, persistence) can start after Phase 3. Phase 4 (EntitySignal) should not run in parallel with Phase 3 (dependencies).

**Q: When do users upgrade?**
A: After Phase 8 (v5.0.0 release). Old APIs work with deprecation warnings. Migration guide provided.

## Git Log (Implementation Trail)

```
HEAD → main
bef414a docs: planning complete for v5.0 refactor
f1b8e38 docs: comprehensive architecture & implementation map for v5.0
ce78f29 docs: add decision reference for PathNotifier + Entities refactor
67a723b docs: explain PathNotifier as unified solution for entities + enhancers
c61f424 docs: add complete 8-phase implementation plan for entities + PathNotifier
8c4ef01 feat: add new Map-based entity types (EntitySignal, EntityConfig, ...)

↓ [Previous work on middleware analysis]
```

## Estimated Timeline

```
Start of Week 1:
  Days 1-3:   Phase 2 (PathNotifier core)
  
Days 4-6:     Phase 3 (Core integration)

Start of Week 2:
  Days 7-13:  Phase 4 (EntitySignal)
  
Days 7-10:    Phase 5.1-5.2 (Batching, Persistence) [parallel]

Week 3:
  Days 14-15: Phase 5.3-5.4 (TimeTravel, DevTools)
  Days 16-17: Phase 6 (Integration testing)
  
Week 4:
  Days 18-19: Phase 7 (Documentation)
  Days 20-25: Phase 8 (Release prep & publish)
  
Total: 20-25 days realistic
```

## Next Action

**You are here:** Planning complete ✅

**Next step:** Choose to start Phase 2 or take a break

If starting Phase 2:
1. Open `DESIGN_DECISIONS.md` for PathNotifier pattern details
2. Create `packages/core/src/lib/path-notifier.ts`
3. Start with PatternMatcher class
4. Build tests as you go
5. Use `IMPLEMENTATION_CHECKLIST.md` to track progress

Ready? Let's implement! 🚀
