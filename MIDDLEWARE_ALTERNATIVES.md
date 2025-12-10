# SignalTree Middleware: 12 Better Aligned Alternatives

## Current Implementation (Baseline)

**Type:**
```ts
interface Middleware<T> {
  id: string;
  before?: (action: string, payload: unknown, state: T) => boolean;
  after?: (action: string, payload: unknown, state: T, newState: T) => void;
}

tree.addTap(middleware)
tree.removeTap(id)
```

**Issues:**
- String-based action names (no type safety)
- Weak hook semantics (before returns boolean, after is void)
- `addTap`/`removeTap` feels foreign to Angular/RxJS conventions
- WeakMap-based storage adds complexity & indirection
- No priority/ordering guarantees
- Function wrapping incurs overhead on every call
- No composition (can't chain middleware easily)

---

## Alternative 1: Middleware Composition (Functional)

**Philosophy:** Compose middleware as pure functions; no registry needed.

```ts
type MiddlewareHandler<T> = (
  next: (state: T) => void,
  action: string,
  payload: unknown,
  state: T
) => void;

export function withMiddlewareComposition<T>(...handlers: MiddlewareHandler<T>[]) {
  return (tree: SignalTree<T>) => {
    const chain = handlers.reverse().reduce(
      (next, handler) => (action, payload, state) => 
        handler(() => next(action, payload, state), action, payload, state),
      () => {} // final no-op
    );
    
    // Intercept tree() calls
    // ...
    return tree;
  };
}

// Usage
const tree = signalTree(state).with(
  withMiddlewareComposition(
    (next, action, payload) => {
      console.log(`Before ${action}`);
      next();
    },
    (next, action, payload) => {
      const start = performance.now();
      next();
      console.log(`${action} took ${performance.now() - start}ms`);
    }
  )
);
```

**Pros:**
- ✅ Pure functional; no global state
- ✅ Automatic ordering via composition
- ✅ Easy to test (all functions)
- ✅ Tree-shaking friendly; unused middleware dropped
- ✅ Zero indirection (no WeakMap lookups)

**Cons:**
- ❌ Can't dynamically add/remove at runtime
- ❌ Requires enhancer reapplication

**Performance:** O(1) per call (thin wrapper); composition happens at setup.

---

## Alternative 2: Signal-Based Observer Pattern

**Philosophy:** Middleware as RxJS-style observables/signals of state changes.

```ts
type StateChange<T> = {
  action: string;
  before: T;
  after: T;
  payload: unknown;
  timestamp: number;
};

export function withObservableMiddleware<T>(tree: SignalTree<T>) {
  const changes = signal<StateChange<T>[]>([]);
  
  const originalFn = tree.bind(tree);
  tree = function(...args) {
    const before = originalFn();
    const result = originalFn(...args);
    const after = originalFn();
    
    if (before !== after) {
      changes.update(arr => [...arr, {
        action: args[0]?.type || 'UPDATE',
        before,
        after,
        payload: args[0],
        timestamp: Date.now(),
      }]);
    }
    return result;
  };
  
  // Return tree + observable api
  return tree as SignalTree<T> & {
    changes(): StateChange<T>[];
    onChange(predicate: (change: StateChange<T>) => boolean): Signal<StateChange<T>[]>;
  };
}

// Usage
const tree = signalTree(state).with(withObservableMiddleware);

const validationErrors = computed(() => {
  const change = tree.onChange(c => c.action === 'UPDATE');
  return validate(change()?.after);
});
```

**Pros:**
- ✅ Signal-native; fits SignalTree philosophy
- ✅ Composable with computed() chains
- ✅ Can replay history
- ✅ No callback hell
- ✅ Type-safe (StateChange is concrete)

**Cons:**
- ❌ Slight memory overhead (stores changes array)
- ❌ Less suitable for side effects (logging)

**Performance:** O(1) append per change; computed() handles scheduling.

---

## Alternative 3: Enhancer-Based Interception

**Philosophy:** Each concern (logging, validation, persistence) is a separate enhancer; they compose.

```ts
export function withLogging<T>(name: string) {
  return (tree: SignalTree<T>) => {
    const original = tree.bind(tree);
    return function(...args) {
      if (args.length > 0) console.log(`${name}:`, args);
      return original(...args);
    } as SignalTree<T>;
  };
}

export function withValidation<T>(validator: (state: T) => boolean) {
  return (tree: SignalTree<T>) => {
    const original = tree.bind(tree);
    return function(...args) {
      const result = original(...args);
      if (!validator(original())) throw new Error('Validation failed');
      return result;
    } as SignalTree<T>;
  };
}

// Usage
const tree = signalTree(state)
  .with(
    withLogging('MyTree'),
    withValidation(s => s.age >= 0)
  );
```

**Pros:**
- ✅ Clean DX (reads as pipeline)
- ✅ Each concern is isolated
- ✅ Easy to reuse/test
- ✅ No global registry
- ✅ Stackable errors (middleware can throw)

**Cons:**
- ❌ Multiple function wrappings add tiny overhead
- ❌ Harder to remove dynamically

**Performance:** Linear wrap depth; negligible unless 20+ enhancers.

---

## Alternative 4: Computed-Based State Subscriptions

**Philosophy:** State changes are computed signals; subscribe to specific keys.

```ts
export function withStateSubscriptions<T>(tree: SignalTree<T>) {
  const subscribers = new Map<string | symbol, ((value: unknown) => void)[]>();
  
  return tree as SignalTree<T> & {
    onKeyChange<K extends keyof T>(
      key: K,
      handler: (value: T[K], oldValue: T[K]) => void
    ): () => void {
      const handlers = subscribers.get(key) || [];
      handlers.push(handler as (value: unknown) => void);
      subscribers.set(key, handlers);
      
      // Return unsubscribe function
      return () => {
        const idx = handlers.indexOf(handler as (value: unknown) => void);
        if (idx >= 0) handlers.splice(idx, 1);
      };
    }
  };
}

// Usage
const unsub = tree.onKeyChange('users', (newUsers, oldUsers) => {
  console.log(`Users changed from ${oldUsers.length} to ${newUsers.length}`);
});
```

**Pros:**
- ✅ Granular subscriptions (only what you care about)
- ✅ Unsubscribe is explicit and easy
- ✅ No overhead for unobserved changes
- ✅ Fits reactive patterns (like .subscribe())

**Cons:**
- ❌ Can't intercept before updates
- ❌ No global ordering

**Performance:** O(n) subscribers only for changed keys.

---

## Alternative 5: Interceptor Hooks (TypeScript Proxy)

**Philosophy:** Use Proxy to intercept all state access uniformly.

```ts
export function withInterceptors<T>(
  tree: SignalTree<T>,
  interceptors: {
    get?: (key: string, value: unknown) => unknown;
    set?: (key: string, value: unknown) => boolean;
    delete?: (key: string) => boolean;
  }
) {
  return new Proxy(tree.state, {
    get: (target, key) => {
      const value = Reflect.get(target, key);
      return interceptors.get?.(String(key), value) ?? value;
    },
    set: (target, key, value) => {
      const allow = interceptors.set?.(String(key), value) ?? true;
      if (allow) Reflect.set(target, key, value);
      return allow;
    },
  }) as TreeNode<T>;
}

// Usage
const tree = signalTree(state).with(
  withInterceptors({
    set: (key, value) => {
      if (value === null) {
        console.warn(`Setting ${key} to null`);
        return false; // block it
      }
      return true;
    }
  })
);
```

**Pros:**
- ✅ Can intercept any property access
- ✅ Return false to block updates
- ✅ Minimal code

**Cons:**
- ❌ Proxy overhead per property access
- ❌ Doesn't intercept signal.set() calls directly (only state.key access)

**Performance:** Proxy traps are O(1) but can add 1-5% overhead depending on access patterns.

---

## Alternative 6: Event Emitter Pattern

**Philosophy:** Publish-subscribe via a simple event bus.

```ts
type EventBus<T> = {
  on<K extends keyof T>(event: K, handler: (value: T[K]) => void): () => void;
  emit<K extends keyof T>(event: K, value: T[K]): void;
};

export function withEventBus<T>(tree: SignalTree<T>): SignalTree<T> & EventBus<T> {
  const listeners = new Map<string, Set<Function>>();
  
  const original = tree.bind(tree);
  
  const wrapper = function(...args) {
    const before = original();
    const result = original(...args);
    const after = original();
    
    // Emit change events for modified keys
    if (before !== after && typeof after === 'object') {
      for (const key of Object.keys(after)) {
        if ((before as any)[key] !== (after as any)[key]) {
          const handlers = listeners.get(key);
          if (handlers) {
            handlers.forEach(h => h((after as any)[key]));
          }
        }
      }
    }
    return result;
  } as SignalTree<T>;
  
  Object.assign(wrapper, tree);
  
  wrapper.on = (event, handler) => {
    const handlers = listeners.get(String(event)) || new Set();
    handlers.add(handler);
    listeners.set(String(event), handlers);
    return () => handlers.delete(handler);
  };
  
  return wrapper;
}

// Usage
tree.on('users', (newUsers) => {
  console.log('Users updated:', newUsers.length);
});
```

**Pros:**
- ✅ Event-driven (familiar pattern)
- ✅ Easy to unsubscribe
- ✅ No global state

**Cons:**
- ❌ Pub-sub discovery is implicit (not visible at setup time)
- ❌ Classic memory leak risk if subscriptions aren't cleaned up

**Performance:** O(listeners) per change; unsubscribe is O(1).

---

## Alternative 7: Differential Updates Signal

**Philosophy:** Emit only what changed; subscriber chooses what to observe.

```ts
type Diff<T> = {
  timestamp: number;
  changedPaths: string[];
  diff: Partial<T>;
};

export function withDiffTracking<T>(tree: SignalTree<T>) {
  const diffs = signal<Diff<T>[]>([]);
  
  const original = tree.bind(tree);
  
  const wrapper = function(...args) {
    const before = structuredClone(original()); // deep clone for comparison
    const result = original(...args);
    const after = original();
    
    const diff: Partial<T> = {};
    const changedPaths: string[] = [];
    
    // Compute diff
    for (const key of Object.keys(after)) {
      if ((before as any)?.[key] !== (after as any)[key]) {
        (diff as any)[key] = (after as any)[key];
        changedPaths.push(key);
      }
    }
    
    if (changedPaths.length > 0) {
      diffs.update(arr => [...arr, { timestamp: Date.now(), diff, changedPaths }]);
    }
    
    return result;
  } as SignalTree<T>;
  
  Object.assign(wrapper, tree);
  wrapper.diffs = diffs;
  
  return wrapper as SignalTree<T> & { diffs: Signal<Diff<T>[]> };
}

// Usage
const changes = computed(() => {
  const allDiffs = tree.diffs();
  return allDiffs.filter(d => d.changedPaths.includes('users'));
});
```

**Pros:**
- ✅ Minimal data passed (only changes)
- ✅ Signal-native querying
- ✅ Can analyze change patterns

**Cons:**
- ❌ Deep clone on every update (expensive)
- ❌ Memory overhead storing diffs

**Performance:** O(n) per update (deep clone); memory: O(changes * size).

---

## Alternative 8: Aspect-Oriented Programming (AOP)

**Philosophy:** Separate cross-cutting concerns via decorator/wrapper pattern.

```ts
type Aspect<T> = {
  pointcut: (key: string, value: unknown) => boolean;
  around?: (proceed: () => void, context: { key: string; value: unknown; tree: SignalTree<T> }) => void;
  before?: (context: { key: string; value: unknown; tree: SignalTree<T> }) => void;
  after?: (context: { key: string; value: unknown; tree: SignalTree<T> }) => void;
};

export function withAspects<T>(tree: SignalTree<T>, aspects: Aspect<T>[]) {
  const original = tree.bind(tree);
  
  const wrapper = function(...args) {
    const before = original();
    
    // Find matching aspects
    const matching = aspects.filter(a => {
      if (args.length === 0) return false;
      return a.pointcut(String(args[0]), args[1]);
    });
    
    // Execute before hooks
    matching.forEach(a => a.before?.({ key: String(args[0]), value: args[1], tree }));
    
    // Execute around hooks
    const proceed = () => original(...args);
    let executed = false;
    for (const aspect of matching) {
      if (aspect.around) {
        aspect.around(proceed, { key: String(args[0]), value: args[1], tree });
        executed = true;
      }
    }
    if (!executed) proceed();
    
    // Execute after hooks
    const after = original();
    matching.forEach(a => a.after?.({ key: String(args[0]), value: args[1], tree }));
    
    return after;
  } as SignalTree<T>;
  
  Object.assign(wrapper, tree);
  return wrapper;
}

// Usage
const tree = signalTree(state).with(
  withAspects([
    {
      pointcut: (key) => key === 'users',
      before: (ctx) => console.log('Users about to change'),
      after: (ctx) => console.log('Users changed'),
    },
    {
      pointcut: (key) => key.startsWith('payment'),
      around: (proceed, ctx) => {
        console.time('payment');
        proceed();
        console.timeEnd('payment');
      }
    }
  ])
);
```

**Pros:**
- ✅ Separation of concerns (aspects are external)
- ✅ Pointcuts allow selective interception
- ✅ around/before/after hooks are clear
- ✅ Easy to compose

**Cons:**
- ❌ Pointcut matching adds overhead
- ❌ More verbose than alternatives

**Performance:** O(aspects) per update (linear scan of matching aspects).

---

## Alternative 9: Reactive Streams (Observable-like)

**Philosophy:** Treat state changes as a lazy stream; backpressure-aware.

```ts
type StateStream<T> = {
  subscribe(observer: { next: (change: StateChange<T>) => void; error?: (err: Error) => void; complete?: () => void }): () => void;
  filter(predicate: (change: StateChange<T>) => boolean): StateStream<T>;
  map<U>(fn: (change: StateChange<T>) => U): StateStream<U>;
};

export function withReactiveStream<T>(tree: SignalTree<T>): SignalTree<T> & { changes: StateStream<T> } {
  const observers = new Set<Function>();
  
  const original = tree.bind(tree);
  
  const wrapper = function(...args) {
    const before = original();
    const result = original(...args);
    const after = original();
    
    if (before !== after) {
      observers.forEach(obs => obs({
        before,
        after,
        action: args[0]?.type || 'UPDATE',
        timestamp: Date.now(),
      }));
    }
    return result;
  } as SignalTree<T>;
  
  Object.assign(wrapper, tree);
  
  wrapper.changes = {
    subscribe: (observer) => {
      observers.add(observer.next);
      return () => observers.delete(observer.next);
    },
    filter: (predicate) => ({
      subscribe: (observer) => {
        return wrapper.changes.subscribe({
          ...observer,
          next: (change) => predicate(change) && observer.next(change),
        });
      },
      filter: (p) => wrapper.changes.filter((c) => predicate(c) && p(c)),
      map: (f) => wrapper.changes.filter(predicate).map(f),
    }),
    map: (fn) => ({
      subscribe: (observer) => {
        return wrapper.changes.subscribe({
          ...observer,
          next: (change) => observer.next(fn(change)),
        });
      },
      filter: (p) => wrapper.changes.map(fn).filter(p),
      map: (f) => wrapper.changes.map(fn).map(f),
    }),
  };
  
  return wrapper;
}

// Usage
tree.changes
  .filter(c => c.action === 'UPDATE')
  .map(c => c.after.users.length)
  .subscribe({
    next: (userCount) => console.log(`Users: ${userCount}`)
  });
```

**Pros:**
- ✅ Familiar to RxJS developers
- ✅ Lazy (only computes when subscribed)
- ✅ Composable (filter, map, etc.)
- ✅ Unsubscribe built-in

**Cons:**
- ❌ More overhead than simple callbacks
- ❌ Chaining can be verbose

**Performance:** O(subscribers) per change; lazy evaluation helps.

---

## Alternative 10: Mutable Signal with Computed Tracking

**Philosophy:** No explicit middleware; use computed() to derive state changes.

```ts
export function withChangeTracking<T>(tree: SignalTree<T>) {
  const lastValue = signal<T>(tree());
  const changed = computed(() => {
    const current = tree();
    const last = lastValue();
    
    // Auto-detect changes by comparing before/after
    // This works because computed() re-runs on tree() changes
    return {
      before: last,
      after: current,
      paths: diffPaths(last, current),
    };
  });
  
  // Update lastValue on every tree change
  effect(() => {
    const _ = tree(); // track changes
    const _ = changed(); // force compute
    lastValue.set(tree());
  });
  
  return tree as SignalTree<T> & { changed: Signal<ChangeInfo<T>> };
}

// Usage
const tree = signalTree(state).with(withChangeTracking);

const logChanges = effect(() => {
  const change = tree.changed();
  console.log('Changed paths:', change.paths);
});
```

**Pros:**
- ✅ No callbacks; uses Angular patterns (effect/computed)
- ✅ Automatic cleanup (effects are tied to component lifecycle)
- ✅ No memory leaks

**Cons:**
- ❌ Requires effect/computed understanding
- ❌ Can't block updates (only observe)

**Performance:** Single effect + computed per tree instance; very efficient.

---

## Alternative 11: State Machine Middleware

**Philosophy:** Model state transitions as state machine states; enforce valid transitions.

```ts
type StateTransition<T> = {
  from: (state: T) => boolean;
  to: (state: T) => boolean;
  action: string;
  guard?: (state: T, newState: T) => boolean;
  onTransition?: (from: T, to: T) => void;
};

export function withStateMachine<T>(tree: SignalTree<T>, transitions: StateTransition<T>[]) {
  const lastState = signal<T>(tree());
  
  const original = tree.bind(tree);
  
  const wrapper = function(...args) {
    const before = original();
    const result = original(...args);
    const after = original();
    
    if (before !== after) {
      const matching = transitions.find(t => t.from(before) && t.to(after));
      
      if (!matching) {
        throw new Error(`Invalid state transition: ${before} -> ${after}`);
      }
      
      if (matching.guard && !matching.guard(before, after)) {
        throw new Error(`Guard failed for transition ${matching.action}`);
      }
      
      matching.onTransition?.(before, after);
      lastState.set(after);
    }
    
    return result;
  } as SignalTree<T>;
  
  Object.assign(wrapper, tree);
  return wrapper;
}

// Usage
const tree = signalTree(state).with(
  withStateMachine([
    {
      from: (s) => s.status === 'idle',
      to: (s) => s.status === 'loading',
      action: 'start-load',
    },
    {
      from: (s) => s.status === 'loading',
      to: (s) => s.status === 'ready',
      action: 'finish-load',
    }
  ])
);
```

**Pros:**
- ✅ Enforces valid state graph
- ✅ Guards prevent invalid transitions
- ✅ Great for complex workflows (auth, forms, etc.)
- ✅ Self-documenting

**Cons:**
- ❌ Requires upfront state definition
- ❌ Verbose for simple cases

**Performance:** O(transitions) linear scan per update; negligible.

---

## Alternative 12: GraphQL-like Resolver Pattern

**Philosophy:** Each field has a resolver (selector + interceptor); decouples concerns.

```ts
type FieldResolver<T, K extends keyof T> = {
  select?: (value: T[K]) => unknown;
  intercept?: (value: T[K], next: (v: T[K]) => void) => void;
};

export function withResolvers<T>(tree: SignalTree<T>, resolvers: Partial<Record<keyof T, FieldResolver<T, any>>>) {
  const original = tree.bind(tree);
  
  const wrapper = function(...args) {
    if (args.length === 0) {
      // Get: apply selectors
      const state = original();
      const result = { ...state };
      
      for (const [key, resolver] of Object.entries(resolvers)) {
        if (resolver.select && key in state) {
          (result as any)[key] = resolver.select((state as any)[key]);
        }
      }
      
      return result;
    } else {
      // Set: apply interceptors
      const updates = args[0];
      for (const key of Object.keys(updates)) {
        const resolver = resolvers[key as keyof T];
        if (resolver?.intercept) {
          resolver.intercept((updates as any)[key], (v) => original({ [key]: v }));
          return; // interceptor handles update
        }
      }
      
      return original(...args);
    }
  } as SignalTree<T>;
  
  Object.assign(wrapper, tree);
  return wrapper;
}

// Usage
const tree = signalTree(state).with(
  withResolvers({
    users: {
      select: (users) => users.filter(u => u.active), // only return active
      intercept: (newUsers, next) => {
        const validated = newUsers.filter(u => u.id); // require id
        next(validated);
      }
    }
  })
);
```

**Pros:**
- ✅ Per-field logic (like GraphQL resolvers)
- ✅ Clean separation of read/write logic
- ✅ Easy to reason about (each field is independent)
- ✅ Can add computed fields

**Cons:**
- ❌ Only works at top level (not nested)
- ❌ Less suitable for cross-field concerns

**Performance:** O(1) resolver lookup per field.

---

## Comparison Matrix

| Alternative | DX Score | Perf | Testability | Learning Curve | Fits SignalTree |
|-------------|----------|------|-------------|-----------------|-----------------|
| 1. Composition | 9/10 | 10/10 | 10/10 | Low | 9/10 |
| 2. Observable | 8/10 | 9/10 | 9/10 | Medium | 10/10 ✅ |
| 3. Enhancer | 9/10 | 9/10 | 10/10 | Low | 10/10 ✅ |
| 4. Subscriptions | 7/10 | 10/10 | 8/10 | Low | 8/10 |
| 5. Proxy | 6/10 | 7/10 | 6/10 | Medium | 7/10 |
| 6. Event Bus | 8/10 | 9/10 | 8/10 | Low | 8/10 |
| 7. Diff Tracking | 7/10 | 6/10 | 8/10 | Low | 8/10 |
| 8. AOP | 8/10 | 7/10 | 9/10 | High | 7/10 |
| 9. Streams | 7/10 | 8/10 | 8/10 | High | 9/10 |
| 10. Computed | 9/10 | 10/10 | 9/10 | Low | 10/10 ✅ |
| 11. State Machine | 7/10 | 9/10 | 10/10 | High | 6/10 |
| 12. Resolvers | 8/10 | 9/10 | 8/10 | Medium | 7/10 |

---

## Top 3 Recommendations

### 🥇 Winner: Alternative 10 (Mutable Signal + Computed Tracking)

**Why:**
- Uses Angular's built-in effect/computed; zero new mental model
- Automatic cleanup (no memory leaks)
- Composes naturally with SignalTree's reactive design
- No middleware registry (simpler architecture)
- Easy to test (just check computed values)

```ts
const tree = signalTree(state).with(withChangeTracking);

effect(() => {
  const change = tree.changed();
  console.log('Changed:', change.paths);
});
```

### 🥈 Alternative 3 (Enhancer-Based)

**Why:**
- Reads as a clean pipeline
- Each concern isolated
- Easy to understand and test
- Scales to many enhancers without complexity

```ts
const tree = signalTree(state)
  .with(
    withLogging('MyTree'),
    withValidation(validate),
    withPersistence({ key: 'state' })
  );
```

### 🥉 Alternative 2 (Observable/Signal-Based)

**Why:**
- Signal-native (fits SignalTree perfectly)
- Can replay history
- Composable with computed chains
- Clean separation of concerns

```ts
tree.onChange(c => c.action === 'UPDATE')
  .pipe(
    filter(c => c.after.users.length > 0)
  )
  .subscribe(change => {
    console.log('Users updated:', change.after.users);
  });
```

---

## Migration Path from Current to Recommended

**Phase 1:** Drop `addTap`/`removeTap` API entirely.

**Phase 2:** Introduce Alt #10 (Computed Tracking) as new standard:
- Users subscribe to `tree.changed()` signal
- Framework handles cleanup via effect lifecycle
- No runtime registration needed

**Phase 3:** Provide optional "classic" enhancers (logging, validation, etc.) as pre-built with Alternative 3 approach:
```ts
import { withLogging, withValidation, withPersistence } from '@signaltree/enhancers';

const tree = signalTree(state)
  .with(
    withLogging(),
    withValidation(myValidator),
    withPersistence({ key: 'my-state' })
  );
```

**Result:** Cleaner codebase, better DX, zero memory leak risk, full type safety.

