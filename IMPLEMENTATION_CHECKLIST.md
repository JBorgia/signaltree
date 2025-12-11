# v5.0 Implementation Checklist

## Status Summary
```
Planning:   ✅ COMPLETE (5 commits, 4 docs)
Phase 1:    ✅ COMPLETE (types defined)
Phases 2-8: ⏳ READY TO START
```

---

## Phase 1: Type Definitions ✅

- [x] Define EntityMapMarker<E, K>
- [x] Define EntitySignal<E, K> interface
- [x] Define EntityConfig with options
- [x] Define TapHandlers<E, K>
- [x] Define InterceptHandlers<E, K>
- [x] Define InterceptContext<T>
- [x] Define EntityNode<E> for bracket access
- [x] Define entityMap<E, K>() factory
- [x] Define PathNotifier interface
- [x] Define global enhancer configs
- [x] Add type utilities (EntityType, IsEntityMap, etc.)
- [x] Add deprecation warnings (tree.addTap, tree.entities)
- [x] Export from @signaltree/types package
- [x] Verify zero TypeScript errors
- [x] Commit to git (8c4ef01)

**Done:** Type contract is locked, implementation can proceed

---

## Phase 2: PathNotifier Core ⏳

### [ ] Create path-notifier.ts

```typescript
// To implement:
- [ ] PatternMatcher class
  - [ ] Parse string patterns (exact, wildcards)
  - [ ] Support function predicates
  - [ ] Compile to fast match function
  - [ ] Match (path, pattern): boolean

- [ ] PathNotifier class
  - [ ] subscribers: Map<PatternKey, Handler[]>
  - [ ] interceptors: Map<PatternKey, Handler[]>
  - [ ] notify(path, value, prev): void
  - [ ] subscribe(pattern, handler): unsubscribe
  - [ ] intercept(pattern, handler): unsubscribe
  - [ ] runInterceptors(path, value, prev, next)
  - [ ] destroy(): void (cleanup)

- [ ] InterceptContext<T> class
  - [ ] block(error): void
  - [ ] transform(value): void
  - [ ] blocked: boolean
  - [ ] error: Error | undefined
  - [ ] value: T
```

### [ ] Create path-notifier.spec.ts

```typescript
// Test coverage:
- [ ] Pattern matching
  - [ ] Exact paths
  - [ ] Wildcard * (immediate children)
  - [ ] Wildcard ** (all descendants)
  - [ ] Function predicates
  - [ ] Case sensitivity
  - [ ] Performance (1000+ patterns)

- [ ] Subscription lifecycle
  - [ ] subscribe() returns unsubscribe function
  - [ ] unsubscribe() removes handler
  - [ ] Multiple handlers per pattern
  - [ ] Multiple patterns per handler

- [ ] Notification propagation
  - [ ] notify() calls matching subscribers
  - [ ] Correct order (registration order)
  - [ ] Passes correct path/value/prev
  - [ ] No handlers called for non-matching patterns

- [ ] Interception
  - [ ] intercept() runs before notify
  - [ ] Handler receives ctx with next()
  - [ ] Calling next() continues
  - [ ] ctx.block() prevents mutation
  - [ ] ctx.transform() changes value
  - [ ] Async interceptor support
  - [ ] Multiple interceptors chain

- [ ] Cleanup
  - [ ] destroy() clears all subscribers
  - [ ] destroy() clears all interceptors
  - [ ] No handlers called after destroy
  - [ ] Memory cleanup verified
```

### [ ] Performance benchmarking

```
Targets:
- notify() < 1ms for 1000 handlers
- subscribe() < 0.1ms per call
- Pattern matching cached
- No memory leaks
```

**Effort:** 2-3 days
**Blockers:** None (foundation layer)
**Review:** Detailed testing of all patterns

---

## Phase 3: SignalTree Core Integration ⏳

### [ ] Modify packages/core/src/lib/signal-tree.ts

```typescript
// To implement:
- [ ] Add __pathNotifier: PathNotifier property
- [ ] Create helper: wrapSignalMutation(signal, path)
  - [ ] Wrap signal.set() to call pathNotifier
  - [ ] Wrap signal.update() to call pathNotifier
  - [ ] Pass through return values
  - [ ] Preserve thisArg

- [ ] Apply wrapping recursively
  - [ ] Root state signal
  - [ ] All child signals
  - [ ] Nested signals (a.b.c.d)
  - [ ] Ensure proper path calculation

- [ ] Wire batchUpdate()
  - [ ] Ensure each mutation notifies
  - [ ] Maintain batch semantics

- [ ] Wire callable syntax tree()
  - [ ] Ensure mutations notify
  - [ ] Maintain existing behavior

- [ ] Add cleanup in destroy()
  - [ ] Call pathNotifier.destroy()
  - [ ] Cleanup all signal wrappers
```

### [ ] Create integration tests

```typescript
// Test coverage:
- [ ] All mutation types trigger notify
  - [ ] tree.$.x.set()
  - [ ] tree.$.x.update()
  - [ ] tree() callable
  - [ ] tree.batchUpdate()

- [ ] Path accuracy
  - [ ] Root: 'count'
  - [ ] Nested: 'user.name'
  - [ ] Deep: 'a.b.c.d.e'
  - [ ] Arrays: 'items.0.name'

- [ ] Value passing
  - [ ] Before/after values correct
  - [ ] Type preservation
  - [ ] Reference handling

- [ ] No performance regression
  - [ ] Mutations < 2x slower
  - [ ] No memory growth
  - [ ] No GC pauses

- [ ] Cleanup
  - [ ] destroy() removes all wrappers
  - [ ] No dangling references
```

**Effort:** 2-3 days
**Blockers:** Phase 2 complete
**Review:** Performance testing critical

---

## Phase 4: EntitySignal Implementation ⏳

### [ ] Create entity-signal.ts

```typescript
// EntitySignal<E, K> class:

- [ ] Storage
  - [ ] entities: Map<K, WritableSignal<E>>
  - [ ] Config storage (keyOf, onError)
  - [ ] Hook registries (tap, intercept)

- [ ] Constructor
  - [ ] Accept path, config, pathNotifier
  - [ ] Initialize Map
  - [ ] Validate config

- [ ] CRUD Operations
  - [ ] addOne(entity, opts?): K
    - [ ] Compute ID from entity
    - [ ] Run interceptor.onAdd if exists
    - [ ] Store in Map with signal wrapper
    - [ ] Notify PathNotifier
    - [ ] Run tap.onAdd if exists
    - [ ] Invalidate computed caches
    - [ ] Return ID

  - [ ] addMany(entities, opts?): K[]
    - [ ] Run for each entity
    - [ ] Batch notifications or individual?
    - [ ] Return array of IDs

  - [ ] updateOne(id, changes, opts?)
    - [ ] Validate ID exists
    - [ ] Run interceptor.onUpdate
    - [ ] Merge changes into Map value
    - [ ] Signal.update() to trigger reactivity
    - [ ] Notify PathNotifier
    - [ ] Run tap.onUpdate
    - [ ] Invalidate caches

  - [ ] updateMany(predicate, changes, opts?)
    - [ ] Find matching entities
    - [ ] Run updateOne for each

  - [ ] updateWhere(predicate, changes, opts?)
    - [ ] Alias for updateMany

  - [ ] removeOne(id, opts?)
    - [ ] Validate ID exists
    - [ ] Run interceptor.onRemove
    - [ ] Delete from Map
    - [ ] Notify PathNotifier
    - [ ] Run tap.onRemove
    - [ ] Invalidate caches

  - [ ] removeMany(predicate, opts?)
    - [ ] Find matching
    - [ ] Run removeOne for each

  - [ ] upsertOne(entity, opts?)
    - [ ] Check if exists
    - [ ] addOne or updateOne accordingly

  - [ ] upsertMany(entities, opts?)
    - [ ] Run for each

- [ ] Query Operations (Computed Signals)
  - [ ] all(): Signal<E[]>
    - [ ] Computed from Map.values()
    - [ ] Cached, invalidate on mutation

  - [ ] count(): Signal<number>
    - [ ] Computed from Map.size
    - [ ] Cached, invalidate on mutation

  - [ ] ids(): Signal<K[]>
    - [ ] Computed from Map.keys()

  - [ ] has(id): boolean
    - [ ] Direct Map.has() check

  - [ ] isEmpty(): Signal<boolean>
    - [ ] Computed from Map.size === 0

  - [ ] where(predicate): Signal<E[]>
    - [ ] Computed filtered array
    - [ ] Cache result

  - [ ] find(predicate): Signal<E | undefined>
    - [ ] Computed first match
    - [ ] Cache result

  - [ ] byId(id): EntityNode<E> | undefined
    - [ ] Return entity signal or undefined
    - [ ] Type-safe access

  - [ ] byIdOrFail(id): EntityNode<E>
    - [ ] Throw if not found

- [ ] Hook Registration
  - [ ] tap(handlers): unsubscribe
    - [ ] Store in tapHandlers Set
    - [ ] Return function to remove

  - [ ] intercept(handlers): unsubscribe
    - [ ] Store in interceptHandlers Set
    - [ ] Return function to remove

- [ ] Cleanup
  - [ ] destroy(): void
    - [ ] Clear Map
    - [ ] Clear tap/intercept handlers
    - [ ] Cleanup computed signals
```

### [ ] Create entity-node.ts

```typescript
// EntityNode<E> class for bracket access:

- [ ] Proxy-based access
  - [ ] tree.$.users['u1']() → entity signal
  - [ ] tree.$.users['u1'].name() → property value
  - [ ] tree.$.users['u1'].name.set() → update property

- [ ] Type safety
  - [ ] Branded ID type
  - [ ] Property autocomplete

- [ ] Fallback
  - [ ] Return undefined for missing IDs
  - [ ] Type: EntityNode<E> | undefined
```

### [ ] Modify entities.ts enhancer

```typescript
// withEntities() function:

- [ ] Detect EntityMapMarker in state
  - [ ] Scan object for marked properties
  - [ ] Build list of entity collections

- [ ] Create EntitySignal instances
  - [ ] For each marked property
  - [ ] Pass path to EntitySignal
  - [ ] Pass pathNotifier

- [ ] Wrap tree.$ return
  - [ ] Replace marked properties with EntitySignals
  - [ ] Maintain type information
  - [ ] Allow chaining with other enhancers

- [ ] Cleanup on destroy
  - [ ] Call EntitySignal.destroy() for each
```

### [ ] Create entities.spec.ts

```typescript
// Comprehensive test suite:

- [ ] CRUD operations
  - [ ] addOne/Many
  - [ ] updateOne/Many/Where
  - [ ] removeOne/Many/Where
  - [ ] upsertOne/Many
  - [ ] Error cases (duplicate, missing, invalid)

- [ ] Query operations
  - [ ] all() computed correctly
  - [ ] count() accurate
  - [ ] where() filtering works
  - [ ] find() returns first match
  - [ ] Caching works

- [ ] Bracket access
  - [ ] tree.$.users['id']() returns signal
  - [ ] Nested property access
  - [ ] Property mutation

- [ ] Hook lifecycle
  - [ ] tap.onAdd fires
  - [ ] tap.onUpdate fires
  - [ ] tap.onRemove fires
  - [ ] intercept.onAdd can block
  - [ ] Async interceptor support
  - [ ] Multiple hooks work together

- [ ] Integration
  - [ ] Mutations flow to PathNotifier
  - [ ] Computed signals update
  - [ ] No memory leaks

- [ ] Performance
  - [ ] byId() is O(1)
  - [ ] Large entity counts (1000+)
  - [ ] Computed signal efficiency
```

**Effort:** 5-7 days
**Blockers:** Phases 2-3 complete
**Review:** Comprehensive testing, performance validation

---

## Phase 5: Fix Critical Enhancers ⏳

### [ ] 5.1: Batching (1 day)

```typescript
// withBatching rewrite:

- [ ] Remove global state
  - [ ] Delete updateQueue
  - [ ] Delete flushTimeoutId
  - [ ] Delete currentBatchingConfig

- [ ] Create instance-scoped queue
  - [ ] Per-tree batch storage
  - [ ] Per-tree flush timer

- [ ] Use PathNotifier.intercept
  - [ ] Subscribe to '**' pattern
  - [ ] Add each mutation to queue
  - [ ] Flush on maxBatchSize or microtask

- [ ] Cleanup on destroy
  - [ ] Unsubscribe from PathNotifier
  - [ ] Clear queue
  - [ ] Clear timer

- [ ] Tests
  - [ ] Multiple trees independent
  - [ ] Queue isolation
  - [ ] Proper flush timing
```

### [ ] 5.2: Persistence (1 day)

```typescript
// withPersistence rewrite:

- [ ] Remove polling
  - [ ] Delete 50ms setTimeout loop
  - [ ] Delete change tracking timers

- [ ] Use PathNotifier.subscribe
  - [ ] Subscribe to paths matching filter
  - [ ] Call onSave on change

- [ ] Debouncing
  - [ ] Implement proper debounce
  - [ ] Clear timer on unsubscribe

- [ ] Hash comparison
  - [ ] Avoid redundant saves
  - [ ] Compare serialized state

- [ ] Auto-load
  - [ ] Load from storage on init
  - [ ] Handle errors gracefully

- [ ] Tests
  - [ ] No polling happening
  - [ ] Debounce works
  - [ ] Proper cleanup on destroy
  - [ ] Multiple trees independent
```

### [ ] 5.3: TimeTravel (1-2 days)

```typescript
// withTimeTravel rewrite:

- [ ] Use PathNotifier.intercept
  - [ ] Subscribe to '**' pattern
  - [ ] Capture before/after state

- [ ] 100% coverage
  - [ ] Root updates (tree())
  - [ ] Leaf updates (tree.$.x.set())
  - [ ] Entity updates (addOne, etc.)
  - [ ] Batch updates
  - [ ] Nested updates

- [ ] History management
  - [ ] Store snapshots with action name
  - [ ] Limit history size
  - [ ] Deep clone for correctness

- [ ] Undo/Redo
  - [ ] Implement undo() method
  - [ ] Implement redo() method
  - [ ] Prevent infinite loops during restoration
  - [ ] Track current index

- [ ] Tests
  - [ ] All mutation types tracked
  - [ ] Undo/redo works
  - [ ] History limit enforced
  - [ ] No loops during restoration
  - [ ] canUndo/canRedo accurate
```

### [ ] 5.4: DevTools (1 day)

```typescript
// withDevTools rewrite:

- [ ] Use PathNotifier.subscribe
  - [ ] Subscribe to '**' pattern
  - [ ] Send to Redux DevTools extension

- [ ] Complete tracking
  - [ ] All mutations appear
  - [ ] Path in action name
  - [ ] Before/after values

- [ ] Time-travel from DevTools
  - [ ] Listen for DISPATCH messages
  - [ ] Jump to requested state

- [ ] Tests
  - [ ] All mutations sent
  - [ ] DevTools time-travel works
  - [ ] Proper cleanup
  - [ ] Extension detection
```

**Effort:** 3-4 days (phases 5.1-5.4)
**Blockers:** Phases 2-3 complete
**Review:** Each enhancer tested in isolation and together

---

## Phase 6: Entity + Enhancer Integration ⏳

- [ ] Test withBatching + entities
  - [ ] Entity mutations get batched
  - [ ] Queue isolation per tree

- [ ] Test withPersistence + entities
  - [ ] Entity changes saved
  - [ ] No polling overhead
  - [ ] Entity serialization works

- [ ] Test withTimeTravel + entities
  - [ ] Entity addOne tracked
  - [ ] Entity updateOne tracked
  - [ ] Entity removeOne tracked
  - [ ] Undo/redo with entities works

- [ ] Test withDevTools + entities
  - [ ] Entity ops appear in DevTools
  - [ ] Time-travel from DevTools works

- [ ] Test multiple enhancers
  - [ ] All work together
  - [ ] No interference
  - [ ] Proper ordering

**Effort:** 1-2 days
**Blockers:** Phases 4-5 complete

---

## Phase 7: Polish & Documentation ⏳

- [ ] Add deprecation warnings
  - [ ] tree.addTap() → show warning
  - [ ] tree.removeTap() → show warning
  - [ ] tree.entities() → show warning
  - [ ] Point to migration guide

- [ ] Update JSDoc
  - [ ] All entity methods
  - [ ] All PathNotifier methods
  - [ ] All hook types
  - [ ] All enhancer configs

- [ ] Create MIGRATION_v5.md
  - [ ] Before/after examples
  - [ ] Property naming changes
  - [ ] Hook location changes
  - [ ] Enhancer updates

- [ ] Update demo app
  - [ ] Use new entityMap API
  - [ ] Show tap/intercept examples
  - [ ] Show enhancer combinations

- [ ] Update docs site
  - [ ] Entity guide
  - [ ] Hook examples
  - [ ] Performance notes
  - [ ] Troubleshooting

**Effort:** 1-2 days
**Blockers:** Phases 2-6 complete

---

## Phase 8: Release v5.0 ⏳

- [ ] Final testing
  - [ ] Full test suite passes
  - [ ] Integration tests pass
  - [ ] E2E tests pass

- [ ] Performance verification
  - [ ] Bundle size acceptable
  - [ ] Runtime performance measured
  - [ ] Memory cleanup verified

- [ ] Version bump
  - [ ] Update package.json files
  - [ ] Update CHANGELOG.md
  - [ ] Create git tag v5.0.0

- [ ] Publish
  - [ ] Publish to npm
  - [ ] Verify on npm registry
  - [ ] Test installation

- [ ] GitHub release
  - [ ] Create release notes
  - [ ] Link migration guide
  - [ ] Announce on discussions

**Effort:** 1-2 days
**Blockers:** Phases 2-7 complete

---

## Risk Mitigation

- [ ] Phase 2: Performance micro-benchmark PathNotifier
- [ ] Phase 3: No performance regression on mutations
- [ ] Phase 4: O(1) behavior with large entity counts
- [ ] Phase 5: Each enhancer tested in isolation
- [ ] Phase 6: All enhancers work together
- [ ] Phase 7: Migration path is clear
- [ ] Phase 8: Bundle size < 2.5 KB gzipped

---

## Timeline

```
Week 1-2: Phases 2-3   (PathNotifier + Core)
Week 3:   Phase 4      (EntitySignal)
Week 3-4: Phases 5-6   (Enhancers + Integration)
Week 5:   Phases 7-8   (Polish + Release)

Total: 4-5 weeks
Realistic: 20-25 days with review/testing
```

---

## Success Verification

- [ ] All tests pass (unit + integration)
- [ ] Zero TypeScript errors
- [ ] No memory leaks
- [ ] Entity lookups 40-100x faster
- [ ] Persistence polling removed (0 calls/sec idle)
- [ ] TimeTravel 100% coverage (was 20%)
- [ ] DevTools complete tracking
- [ ] Bundle size acceptable
- [ ] Documentation complete
- [ ] Migration guide clear

---

## Ready to Start?

**Next immediate action:** Phase 2 (PathNotifier Core)

```bash
# All planning documents committed
git log --oneline | head -5

# Can reference during implementation:
cat ARCHITECTURE.md           # Visual diagrams
cat DESIGN_DECISIONS.md       # Technical details
cat ENTITY_REFACTOR_COMPLETE_PLAN.md  # Full breakdown
```

**Estimated start-to-finish:** 20-25 days of focused engineering
