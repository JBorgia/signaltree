# PathNotifier: Unified Solution for Entities + Enhancers

## Problem Statement

SignalTree v5.0 needs to solve **two seemingly different problems** with one unified architecture:

### Problem 1: Entity Hooks (Scoped)
Current approach pollutes root API:
```typescript
// ❌ This pollutes tree root
tree.addTap('users', (action) => {...});
tree.removeTap('users');

// Users want this (scoped to collection)
tree.$.users.tap({ onAdd: (user) => {...} });
tree.$.users.intercept({ onAdd: (user, ctx) => {...} });
```

### Problem 2: Enhancer Bugs (Global)
Current enhancers have systemic issues:
- **Batching**: Global mutable state → race conditions between trees
- **Persistence**: 50ms polling → 20,000 calls/second per tree
- **Time Travel**: Only catches ~20% of mutations
- **DevTools**: Incomplete state tracking
- **All**: No cleanup → memory leaks on destroy

## The Unified Solution: PathNotifier

Instead of solving these as separate problems, PathNotifier acts as **internal infrastructure** that:

1. Solves entity hook scoping (hooks attach to EntitySignal, not root)
2. Fixes all enhancer bugs (unified change detection)
3. Eliminates duplicate code (all enhancers share same backbone)

### Architecture

```
┌─────────────────────────────────────────────┐
│           SignalTree<T>                     │
│  ┌───────────────────────────────────────┐  │
│  │       PathNotifier                    │  │
│  │  (Internal, NOT exposed on root)      │  │
│  │                                       │  │
│  │  • Catches ALL mutations              │  │
│  │  • Path-based subscriptions           │  │
│  │  • Interceptor chain                  │  │
│  │  • Instance-scoped (no global state)  │  │
│  └───────────────────────────────────────┘  │
│    ↑         ↑         ↑         ↑          │
│    │         │         │         │          │
│  ┌─┴─┐  ┌────┴────┐  ┌─┴───┐  ┌─┴───┐     │
│  │Tap│  │Intercept│  │Query│  │Async│     │
│  │   │  │         │  │     │  │Hook │     │
│  └───┘  └─────────┘  └─────┘  └─────┘     │
│  (EntitySignal hooks = scoped to collection)│
│                                            │
│                                            │
│  Global Enhancers (subscribe to patterns): │
│  • withBatching()                          │
│  • withLogging()                           │
│  • withPersistence()                       │
│  • withTimeTravel()                        │
│  • withDevTools()                          │
└─────────────────────────────────────────────┘
```

## How It Solves Both Problems

### Entity Hooks (Scoped)

**User code:**
```typescript
const tree = signalTree({
  users: entityMap<User, string>({ 
    keyOf: u => u.id 
  }),
});

// ✅ Scoped to collection (not polluting root)
tree.$.users.tap({
  onAdd: (user) => console.log('Added', user.name),
  onUpdate: (id, changes) => console.log('Updated', id),
  onRemove: (id) => console.log('Removed', id),
});

tree.$.users.intercept({
  onAdd: async (user, ctx) => {
    const result = await validateUser(user);
    if (!result.valid) {
      ctx.block(result.error);
    }
  },
});
```

**Implementation flow:**
```
user.ts (EntitySignal)
  ├─ addOne(user)
  │   ├─ Create WritableSignal<User>
  │   ├─ Store in Map<K, WritableSignal<E>>
  │   ├─ setAtPath('users.u1', user)
  │   │
  │   └─ tree.__pathNotifier.notify('users.u1', user, undefined)
  │       ├─ Run interceptors first (can block)
  │       ├─ If not blocked, notify subscribers
  │       └─ EntitySignal's tap/intercept handlers fire ✅
  │
  └─ Return entity ID
```

**Key point:** Hooks are methods on EntitySignal, not registered globally. Each collection maintains its own hook list.

---

### Global Enhancers (Fixed)

#### Before: Batching Bug

```typescript
// ❌ Global state (BROKEN)
let updateQueue: Array<Update> = [];
let flushTimeoutId: number | undefined;

// Tree A sets flushTimeoutId
const treeA = signalTree({...}).with(withBatching({ maxBatchSize: 200 }));

// Tree B overwrites flushTimeoutId
const treeB = signalTree({...}).with(withBatching({ maxBatchSize: 10 }));

// Tree A updates don't flush on schedule anymore!
treeA.$.count(5); // Still in queue, flushTimeoutId is for Tree B
```

#### After: Batching Fixed

```typescript
// ✅ Instance-scoped state (FIXED)
export function withBatching<T>(config?: BatchingConfig) {
  return (tree: SignalTree<T> & { __pathNotifier: PathNotifier }) => {
    // Each tree gets its own queue
    const queue: Array<Update> = [];
    let flushScheduled = false;

    // Subscribe to ALL mutations
    const unsub = tree.__pathNotifier.intercept('**', (ctx, next) => {
      queue.push(ctx);
      
      if (queue.length >= config?.maxBatchSize) {
        flush();
      } else if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }
    });

    // Cleanup
    tree.destroy = () => {
      unsub();
      queue.length = 0;
      originalDestroy();
    };
  };
}
```

---

#### Before: Persistence Bug

```typescript
// ❌ Polling hack (BROKEN)
const checkForChanges = () => {
  const currentValue = signal();
  if (currentValue !== previousValue) {
    previousValue = currentValue;
    triggerAutoSave();
  }
  setTimeout(checkForChanges, 50); // Never cleaned up!
};

// With 1000 signals = 20,000 calls/second perpetually
// setTimeout callbacks hold references → memory leak
```

#### After: Persistence Fixed

```typescript
// ✅ Event-driven subscription (FIXED)
export function withPersistence<T>(config: PersistenceConfig) {
  return (tree: SignalTree<T> & { __pathNotifier: PathNotifier }) => {
    // Subscribe only to changes we care about
    const unsub = tree.__pathNotifier.subscribe(
      config.filter ?? (() => true),
      (value, prev, path) => {
        // Only called when something ACTUALLY changes
        saveToStorage(value);
      }
    );

    // Cleanup removes subscription
    tree.destroy = () => {
      unsub();
      originalDestroy();
    };
  };
}
```

---

#### Before: Time Travel Bug

```typescript
// ❌ Only catches root calls (BROKEN)
const enhancedTree = function(...args) {
  const beforeState = tree();
  // Apply update via tree()
  const afterState = tree();
  // Track this entry
};

// What's tracked:
tree({ count: 1 });                    // ✅
tree(s => ({ ...s, x: 1 }));           // ✅

// What's MISSED:
tree.$.count.set(5);                   // ❌
tree.$.users.addOne(user);             // ❌
tree.batchUpdate(fn);                  // ❌
```

#### After: Time Travel Fixed

```typescript
// ✅ Intercepts everything (FIXED)
export function withTimeTravel<T>(config?: TimeTravelConfig) {
  return (tree: SignalTree<T> & { __pathNotifier: PathNotifier }) => {
    // Subscribe to EVERY mutation
    const unsub = tree.__pathNotifier.intercept('**', (ctx, next) => {
      const beforeState = deepClone(tree());
      next(); // Execute mutation
      const afterState = tree();

      // Record ALL mutations
      history.push({
        path: ctx.path, // e.g., 'users.u1.name' or 'count'
        before: beforeState,
        after: afterState,
      });
    });

    // What's tracked now:
    tree({ count: 1 });                // ✅ Caught
    tree.$.count.set(5);               // ✅ Caught
    tree.$.users.addOne(user);         // ✅ Caught
    tree.batchUpdate(fn);              // ✅ Caught
    // ALL mutations tracked!
  };
}
```

---

## Why This Works

### 1. **Single Point of Observation**

PathNotifier is wired into all mutation points:
```
tree()               → signal.set()      → notify
tree.$.x.set(v)      → signal.set()      → notify
tree.$.x.update(fn)  → signal.update()   → notify
tree.batchUpdate(fn) → each child set()  → notify
tree.$.users.addOne  → setAtPath()       → notify
```

### 2. **Path-Based Subscriptions**

Enhancers subscribe to patterns, not hardcoded to specific properties:

```typescript
// Batching subscribes to everything
tree.__pathNotifier.intercept('**', batchingInterceptor);

// Logging can filter
tree.__pathNotifier.subscribe(
  (path) => !path.startsWith('_'),
  loggingHandler
);

// Persistence can be selective
tree.__pathNotifier.subscribe(
  (path) => shouldPersist(path),
  persistenceHandler
);

// Time travel can track everything
tree.__pathNotifier.intercept('**', timeTravelInterceptor);
```

### 3. **Instance Scoping**

Each tree has its own PathNotifier:
```typescript
const treeA = signalTree({...}).with(withBatching());
const treeB = signalTree({...}).with(withBatching());

// treeA.batchQueue is separate from treeB.batchQueue
// treeA.flushTimeoutId is separate from treeB.flushTimeoutId
// No cross-contamination
```

### 4. **Entity Hooks Integration**

EntitySignal uses PathNotifier internally:

```typescript
class EntitySignal<E, K> {
  private tapHandlers: Set<TapHandler<E, K>> = new Set();
  private interceptHandlers: Set<InterceptHandler<E, K>> = new Set();

  addOne(entity: E, opts?: AddOptions<E, K>): K {
    const id = opts?.keyOf?.(entity) ?? this.config.keyOf(entity);

    // Run interceptors
    for (const interceptor of this.interceptHandlers) {
      if (interceptor.onAdd) {
        const ctx = new InterceptContext<E>(entity);
        interceptor.onAdd(entity, ctx);
        if (ctx.blocked) throw ctx.error;
        // ... potentially transform entity ...
      }
    }

    // Store in map
    const signal = signal(entity);
    this.entities.set(id, signal);

    // Notify global enhancers via PathNotifier
    tree.__pathNotifier.notify(`${this.path}.${id}`, entity, undefined);

    // Run local tap handlers
    for (const tap of this.tapHandlers) {
      tap.onAdd?.(entity, id);
    }

    return id;
  }

  tap(handlers: TapHandlers<E, K>): () => void {
    this.tapHandlers.add(handlers);
    return () => this.tapHandlers.delete(handlers);
  }
}
```

---

## Benefits of Unified Approach

| Aspect | Before (Separate) | After (Unified) |
|--------|-------------------|-----------------|
| **Global state** | Batching: ❌ Yes | ✅ No (instance-scoped) |
| **Change detection** | Ad-hoc per enhancer | ✅ Single backbone |
| **Polling overhead** | Persistence: ❌ 20k calls/sec | ✅ 0 calls (event-driven) |
| **Mutation coverage** | Time Travel: ❌ 20% | ✅ 100% |
| **DevTools tracking** | ❌ Incomplete | ✅ Complete |
| **Entity hooks scoping** | ❌ Pollutes root | ✅ Scoped to collection |
| **Code duplication** | ❌ Each enhancer reinvents | ✅ Shared infrastructure |
| **Memory leaks** | ❌ Common (no cleanup) | ✅ Guaranteed cleanup |
| **Testing** | ❌ State bleeds | ✅ Isolated |
| **Bundle size** | Duplicated logic | ✅ Shared, smaller |

---

## Implementation Sequence

### Foundation Layer (Phases 2-3)
```
PathNotifier → Signal wrapping → Core integration
```
This is the backbone everything else uses.

### Feature Layer (Phase 4)
```
EntitySignal → Uses PathNotifier internally
```
Scoped hooks (tap/intercept) attach to EntitySignal.

### Enhancement Layer (Phase 5)
```
Migrate enhancers to use PathNotifier
• withBatching()    → instance-scoped queue
• withPersistence() → event-driven subscription
• withTimeTravel()  → complete interception
• withDevTools()    → unified tracking
```

### Integration Layer (Phase 6)
```
Verify entities work with global enhancers
```

---

## Key Design Decisions

### 1. PathNotifier is Internal (Not Exposed)

**Reasoning:**
- Gives us flexibility to optimize without breaking API
- Users interact with higher-level APIs (entity hooks, enhancers)
- Prevents custom code from depending on implementation details

**Exposure:**
```typescript
// NOT exposed (internal only)
tree.__pathNotifier; // double underscore = private

// Exposed (public API)
tree.$.users.tap(...);
tree.$.users.intercept(...);
tree.with(withBatching());
```

### 2. Patterns Use Wildcards + Functions

**Supports all subscription styles:**
```typescript
'users'              // Exact path
'users.*'            // Immediate children
'users.**'           // All descendants
(path) => {...}      // Custom filter
```

This flexibility allows:
- Persistence: Filter by path prefix
- Logging: Exclude internal signals
- Batching: Subscribe to everything

### 3. Interceptors Run Before Tap

**Order guarantees:**
```
1. Run all interceptors (can block/transform)
2. Apply mutation
3. Run all tap handlers (observation only)
```

This ensures:
- Validation happens before state changes
- Observers see final state
- No race conditions

---

## Backward Compatibility

### Deprecated (Will Remove in v6.0)
```typescript
// ❌ Don't use (global, pollutes root API)
tree.addTap('users', handler);
tree.removeTap('users');
tree.entities<User>('users');
```

### Use Instead (New API)
```typescript
// ✅ Use this (scoped, clean API)
tree.$.users.tap(handlers);
tree.$.users.intercept(handlers);
tree.$.users // EntitySignal with all methods
```

**Migration path:** Keep old methods working (throw deprecation warning) until v6.0, then remove.

---

## Performance Impact

### Baseline (Current)
- Persistence: 20,000 calls/sec (polling)
- Batching: Queue shared across instances (race conditions)
- Time Travel: ~20% coverage (incomplete)

### After PathNotifier
- Persistence: 0 calls/sec (event-driven, only on change)
- Batching: Instance-scoped (no interference)
- Time Travel: 100% coverage (all mutations tracked)

**Bundle size:** +0.8KB (PathNotifier core) - shared by all enhancers, saves space vs duplicated detection code.

---

## Summary

PathNotifier is the **missing foundational piece** that SignalTree needed:

1. **For Entity Hooks:** Provides scoped observation infrastructure (replace global registry)
2. **For Enhancers:** Provides unified change detection backbone (replace ad-hoc implementations)
3. **For Architecture:** Instance-scoped, with proper cleanup (fix global state bugs)
4. **For DX:** Everything feels cohesive (entities, enhancers, core all use same pattern)

This is why combining the entity refactor + enhancer improvements into one release makes sense. They're not separate features—they're **one unified architectural improvement**.
