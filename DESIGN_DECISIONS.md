# PathNotifier + Entities Refactor: Key Decision Reference

## Architecture Decisions (LOCKED IN ✅)

### Entity Storage & Operations

```
Decision: Use Map<K, WritableSignal<E>> internally, expose EntitySignal interface
Rationale: O(1) lookups, proper signal tracking, clean DX
Trade-offs: Slightly more memory per entity (wrapper signal), but O(n)→O(1) wins justify it
Alternative considered: Object notation (rejected - no signal tracking)
```

### Entity Hooks Location

```
Decision: Scoped to EntitySignal (tree.$.collection.tap/intercept), NOT on root
Rationale: Keeps root API clean, avoids global registry pollution, scales better
Trade-offs: Hook lifecycle tied to tree lifetime (acceptable)
Alternative considered: Global registry like tree.addTap (rejected - pollutes API)
```

### PathNotifier Exposure

```
Decision: Internal only (__pathNotifier), NOT exposed on root
Rationale: Gives flexibility, prevents API lock-in to implementation detail
Trade-offs: Users can't implement custom mutation observers (acceptable - use enhancers)
Alternative considered: Public API (rejected - couples external code to internal detail)
```

### Interceptor Async Support

```
Decision: YES - InterceptHandlers can be async, ctx.block can await validation
Rationale: Common use case (remote validation before mutation), async/await friendly
Trade-offs: More complex execution (need to handle Promise rejection)
Alternative considered: Sync-only (rejected - misses important pattern)
```

### Global Enhancer Coordination

```
Decision: Via PathNotifier subscriptions/interceptors (not a separate registry)
Rationale: Single backbone for all change detection, no duplication
Trade-offs: None (cleaner than separate registry)
Alternative considered: Separate middleware registry (rejected - redundant)
```

---

## Implementation Decisions (FOR PHASE 2)

### PathNotifier Subscription Model

```
Decision:
  - subscribe() → observer pattern (called AFTER mutation)
  - intercept() → middleware pattern (called BEFORE mutation, can block)

Rationale:
  - Two-layer gives flexibility for both observation and control
  - subscribe() for logging/persistence (read-only)
  - intercept() for validation/batching (mutation control)

Implementation:
  unsub1 = pathNotifier.subscribe('users.*', handler);
  unsub2 = pathNotifier.intercept('**', handler);
```

### Pattern Matching Strategy

```
Decision: Support three styles:
  1. String paths with wildcards: 'users', 'users.*', 'users.**'
  2. Function predicates: (path) => path.startsWith('_')
  3. Exact paths: 'users.u1.name'

Rationale:
  - String paths for common patterns (fast, cache-able)
  - Functions for complex logic (logging filters, etc.)
  - Exact paths for entity-specific hooks

Implementation: Store subscriptions in Map<pattern, handler[]>
  For notify(path): iterate handlers, match via:
    - startsWith (exact)
    - glob matching (wildcards)
    - function call (predicate)
```

### Interceptor Execution Order

```
Decision: All interceptors for a path run in registration order, any can block

Rationale:
  - Predictable order for debugging
  - First-blocker-wins semantics
  - Order matters (validate before batch, batch before persist)

Implementation:
  for handler in interceptors[path]:
    if !blocked:
      await handler(ctx, next)
      if ctx.blocked: break
```

### Cleanup Strategy

```
Decision: WeakSet for handler storage + explicit unsubscribe functions

Rationale:
  - Explicit cleanup (good for debugging)
  - Easy to verify no leaks in tests
  - No surprise behavior from GC

Implementation:
  const unsub = pathNotifier.subscribe(pattern, handler);
  // ... later ...
  unsub(); // Removes from Set
  // On tree.destroy(): iterate all handlers, call unsub
```

---

## Implementation Order (PHASES 2-4)

### Phase 2: PathNotifier Core

```
Priority: HIGH (foundation for everything)

Tasks in order:
  1. Create path-notifier.ts
  2. Implement Pattern class (wildcards, functions)
  3. Implement SubscriberRegistry (Map<pattern, handler[]>)
  4. Implement notify() method
  5. Implement subscribe() method
  6. Implement intercept() method
  7. Write comprehensive tests
  8. Performance: micro-benchmark notify() hot path

When done: Should be able to:
  - Create pathNotifier
  - Subscribe to patterns
  - Call notify() and see handlers fire
  - Intercept mutations and block them
```

### Phase 3: Core Integration

```
Priority: HIGH (enables everything else)

Files to modify:
  1. packages/core/src/lib/signal-tree.ts
     - Add __pathNotifier instance variable
     - Wrap signal.set() and signal.update()
     - Handle nested paths (a.b.c)

Tasks:
  1. Create helper: wrapSignalMutation(signal, path)
  2. Apply to root state signal
  3. Apply to all child signals recursively
  4. Ensure batchUpdate() flows through notify
  5. Add __pathNotifier to destroy() cleanup

When done: Should be able to:
  - Create tree
  - Subscribe to any path via pathNotifier
  - Make mutations
  - See handlers fire for all mutation types
```

### Phase 4: EntitySignal Implementation

```
Priority: HIGH (main feature)

Files to modify:
  1. packages/core/src/enhancers/entities/lib/entity-signal.ts

Core class structure:
  class EntitySignal<E, K> {
    private entities: Map<K, WritableSignal<E>>;
    private tapHandlers: Set<TapHandler<E, K>>;
    private interceptHandlers: Set<InterceptHandler<E, K>>;

    constructor(
      private path: string,
      private config: EntityConfig<E, K>,
      private pathNotifier: PathNotifier
    ) {}

    // CRUD operations
    addOne(entity: E, opts?: AddOptions): K
    updateOne(id: K, changes: Partial<E>, opts?: MutationOptions): void
    removeOne(id: K, opts?: MutationOptions): void
    // ... addMany, updateMany, removeMany, upsert variants

    // Queries
    all(): Signal<E[]>
    count(): Signal<number>
    byId(id: K): EntityNode<E> | undefined
    where(predicate: (e: E) => boolean): Signal<E[]>
    find(predicate: (e: E) => boolean): Signal<E | undefined>

    // Hooks
    tap(handlers: TapHandlers<E, K>): () => void
    intercept(handlers: InterceptHandlers<E, K>): () => void
  }

Tasks:
  1. Implement Map storage
  2. Implement bracket access Proxy (tree.$.users['u1']())
  3. Implement byId(), all(), count(), where(), find()
  4. Implement addOne/updateOne/removeOne
  5. Implement tap() hook registration
  6. Implement intercept() hook registration
  7. Wire mutations → pathNotifier.notify
  8. Wire mutations → local tap/intercept handlers
  9. Create EntityNode class for bracket access
  10. Write comprehensive tests

When done: Should be able to:
  - Create entityMap
  - Add/update/remove entities
  - Query with all(), where(), find()
  - Access by ID with bracket notation
  - Use tap/intercept hooks
```

---

## Data Structure Details

### PathNotifier Internal Structure

```typescript
interface PathNotifier {
  private subscribers: Map<PatternKey, Handler[]>;
  private interceptors: Map<PatternKey, Handler[]>;

  subscribe(pattern: Pattern, handler: Handler): () => void {
    const key = patternToKey(pattern);
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    const handlers = this.subscribers.get(key)!;
    handlers.push(handler);

    return () => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }

  notify(path: string, value: unknown, prev: unknown): void {
    for (const [key, handlers] of this.subscribers) {
      if (matchesPattern(key, path)) {
        for (const handler of handlers) {
          handler(value, prev, path);
        }
      }
    }
  }
}
```

### EntitySignal Internal Structure

```typescript
class EntitySignal<E, K> {
  private entities: Map<K, WritableSignal<E>> = new Map();
  private tapHandlers = new Set<TapHandler<E, K>>();
  private interceptHandlers = new Set<InterceptHandler<E, K>>();

  // Cached computed signals
  private allSignal: Signal<E[]> | undefined;
  private countSignal: Signal<number> | undefined;

  addOne(entity: E, opts?: AddOptions): K {
    const id = opts?.keyOf?.(entity) ?? this.config.keyOf(entity);

    // 1. Run interceptors (can block)
    for (const ih of this.interceptHandlers) {
      if (ih.onAdd) {
        const ctx = new InterceptContext<E>(entity);
        await ih.onAdd(entity, ctx);
        if (ctx.blocked) throw ctx.error;
      }
    }

    // 2. Store in Map
    const signal = signal(entity);
    this.entities.set(id, signal);

    // 3. Notify global enhancers
    this.pathNotifier.notify(`${this.path}.${id}`, entity, undefined);

    // 4. Run tap handlers (observation)
    for (const th of this.tapHandlers) {
      th.onAdd?.(entity, id);
    }

    // 5. Invalidate computed caches
    if (this.allSignal) this.allSignal.invalidate();
    if (this.countSignal) this.countSignal.invalidate();

    return id;
  }
}
```

---

## Testing Strategy

### PathNotifier Tests

```typescript
describe('PathNotifier', () => {
  // Pattern matching
  test('exact path match');
  test('wildcard * (immediate children)');
  test('wildcard ** (all descendants)');
  test('function predicate');

  // Subscription lifecycle
  test('subscribe returns unsubscribe function');
  test('unsubscribe removes handler');
  test('multiple handlers for same pattern');
  test('multiple patterns for same handler');

  // Notification behavior
  test('notify calls matching subscribers');
  test('notify order matches registration order');
  test('notify passes correct path/value/prev');

  // Interception
  test('interceptor runs before notification');
  test('blocked interceptor prevents notification');
  test('async interceptor support');
  test('interceptor can transform value');

  // Cleanup
  test('destroy clears all subscribers');
  test('destroy prevents further notifications');
});
```

### EntitySignal Tests

```typescript
describe('EntitySignal', () => {
  // CRUD
  test('addOne stores entity and returns ID');
  test('addOne with custom keyOf');
  test('updateOne modifies entity');
  test('removeOne deletes entity');
  test('addMany bulk adds');
  test('updateMany bulk updates');
  test('removeMany bulk removes');

  // Queries
  test('all() returns all entities');
  test('count() returns entity count');
  test('byId() retrieves by ID');
  test('where() filters entities');
  test('find() returns first match');

  // Hooks
  test('tap observer called on add');
  test('tap observer called on update');
  test('tap observer called on remove');
  test('intercept can block add');
  test('intercept can block update');
  test('intercept async validation');
  test('multiple tap/intercept handlers');

  // Bracket access
  test('tree.$.users[id]() returns entity signal');
  test('tree.$.users[id].name() gets nested property');
  test('tree.$.users[id].name(newName) sets nested property');

  // Integration
  test('mutations flow through PathNotifier');
  test('withBatching batches entity additions');
  test('withPersistence persists entity changes');
});
```

---

## Risk Mitigation Checklist

### Phase 2 (PathNotifier)

- [ ] Micro-benchmark notify() performance
- [ ] Test memory leaks with WeakMap
- [ ] Verify pattern matching edge cases

### Phase 3 (Core Integration)

- [ ] Ensure all signal types trigger notifications
- [ ] Test nested path accuracy
- [ ] Verify no performance regression on mutations

### Phase 4 (EntitySignal)

- [ ] Benchmark Map lookups vs array .find()
- [ ] Test Proxy bracket access compatibility
- [ ] Verify computed signals cache properly
- [ ] Memory test with large entity counts

### Phase 5 (Enhancer Migration)

- [ ] Verify batching queue isolation
- [ ] Confirm persistence polling removed
- [ ] Validate time travel 100% coverage
- [ ] Check DevTools extension compatibility

---

## Success Criteria Checklist

### Phase 2

- [ ] PathNotifier tests pass (100%)
- [ ] notify() hot path < 1ms for 1000 handlers
- [ ] No memory leaks on destroy
- [ ] Supports all three pattern styles

### Phase 3

- [ ] All signal mutations flow through PathNotifier
- [ ] root/leaf/batch/entity mutations all tracked
- [ ] Integration tests pass
- [ ] Performance within 5% of baseline

### Phase 4

- [ ] All CRUD operations work
- [ ] All query operations work
- [ ] Tap/intercept hooks execute
- [ ] Bracket access works as expected
- [ ] EntitySignal tests pass (100%)

### Phase 5

- [ ] Each enhancer uses PathNotifier
- [ ] No global state in any enhancer
- [ ] All cleanup happens on destroy
- [ ] Each enhancer passes isolation tests

### Phase 6-8

- [ ] Full integration tests pass
- [ ] Bundle size acceptable
- [ ] Performance benchmarks show improvements
- [ ] Documentation complete
