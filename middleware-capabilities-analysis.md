# State Management Middleware Capabilities Analysis

**✅ UPDATED (Oct 7, 2025):** Middleware benchmarks have been properly re-implemented using actual library APIs. See [MIDDLEWARE_CLEANUP.md](./MIDDLEWARE_CLEANUP.md).

## Current Status: 4 Libraries with Middleware Benchmarks ✅

The benchmarks now properly measure middleware/plugin overhead for:

1. **SignalTree** - Native `withMiddleware()` with before/after state update interception ✅
2. **NgRx Store** - Meta-reducers wrapping reducers for action interception ✅
3. **NgXs** - Plugin system with `NgxsPlugin` interface for action lifecycle hooks ✅
4. **Akita** - Store hooks with `akitaPreUpdate()` override for state transition interception ✅

**Not Implemented:**

- **Elf** - Uses RxJS effects/operators (different paradigm)
- **NgRx SignalStore** - Lifecycle hooks only, not middleware

## Implementation Approach

After initially being removed, middleware benchmarks were **properly re-implemented** using actual library middleware APIs:

## What Each Library Actually Supports:

### 🟢 NgRx Store - Meta-Reducers (✅ IMPLEMENTED)

**Implementation Status:** Properly implemented using actual `ActionReducer<T>` wrapper pattern.

```typescript
// NgRx Meta-Reducer (Middleware Equivalent) - ACTUAL IMPLEMENTATION
const loggingMetaReducer = (reducer: ActionReducer<any>): ActionReducer<any> => {
  return (state, action) => {
    console.time(`Action: ${action.type}`);
    const result = reducer(state, action);
    console.timeEnd(`Action: ${action.type}`);
    return result;
  };
};

const performanceMetaReducer = (reducer: ActionReducer<any>): ActionReducer<any> => {
  return (state, action) => {
    const start = performance.now();
    const result = reducer(state, action);
    const duration = performance.now() - start;
    if (duration > 16) {
      console.warn(`Slow action: ${action.type} took ${duration}ms`);
    }
    return result;
  };
};

// Usage in StoreModule
StoreModule.forRoot(reducers, {
  metaReducers: [loggingMetaReducer, performanceMetaReducer],
});
```

**Benchmark Implementation:**

- `runSingleMiddlewareBenchmark()`: Wraps reducer with single meta-reducer
- `runMultipleMiddlewareBenchmark()`: Composes multiple meta-reducers into chain
- `runConditionalMiddlewareBenchmark()`: Conditional logic based on action type

### 🟢 NgXs - Plugin System (✅ IMPLEMENTED)

**Implementation Status:** Properly implemented using actual `NgxsPlugin` interface.

```typescript
@Injectable()
export class LoggingPlugin implements NgxsPlugin {
  handle(state: any, action: any, next: NgxsNextPluginFn) {
    console.log('Action dispatched:', action);
    const start = performance.now();
    return next(state, action).pipe(
      tap((result) => {
        const duration = performance.now() - start;
        console.log(`Action completed in ${duration}ms`);
      })
    );
  }
}

@Injectable()
export class ValidationPlugin implements NgxsPlugin {
  handle(state: any, action: any, next: NgxsNextPluginFn) {
    // Validation logic here
    if (this.isInvalidAction(action)) {
      throw new Error('Invalid action');
    }
    return next(state, action);
  }
}

// Usage
NgxsModule.forRoot([MyState], {
  developmentMode: true,
  plugins: [LoggingPlugin, ValidationPlugin],
});
```

**Benchmark Implementation:**

- `runSingleMiddlewareBenchmark()`: Creates single plugin implementing `NgxsPlugin.handle()`
- `runMultipleMiddlewareBenchmark()`: Composes array of plugins into chain
- `runConditionalMiddlewareBenchmark()`: Conditional plugin logic based on action type

### 🟢 Akita - Store Hooks (✅ IMPLEMENTED)

**Implementation Status:** Properly implemented using actual `Store.akitaPreUpdate()` override.

```typescript
// Akita Store Hooks - ACTUAL IMPLEMENTATION
class MyStore extends Store<MyState> {
  constructor() {
    super(initialState);
  }

  // Hook into all updates
  override akitaPreUpdate(previousState: MyState, nextState: MyState): MyState {
    console.log('State changing:', { previousState, nextState });
    return nextState; // Can modify or reject
  }
}

// Performance tracking
class PerformanceStore extends Store<MyState> {
  override akitaPreUpdate(prev: MyState, next: MyState): MyState {
    const start = performance.now();
    const result = super.akitaPreUpdate(prev, next);
    const duration = performance.now() - start;
    if (duration > 1) {
      console.warn(`Slow state update took ${duration}ms`);
    }
    return result;
  }
}
```

**Benchmark Implementation:**

- `runSingleMiddlewareBenchmark()`: Single Store with `akitaPreUpdate` override
- `runMultipleMiddlewareBenchmark()`: Simulates multiple middleware in single hook (Akita limitation)
- `runConditionalMiddlewareBenchmark()`: Conditional logic based on state properties

**Note:** Akita only supports one `akitaPreUpdate` hook per store, so multiple middleware must be simulated within a single hook implementation.

### 🟢 Elf - Effects & Operators (COULD be implemented)

```typescript
import { createRepository, withEntities } from '@ngneat/elf';
import { withRequestsCache } from '@ngneat/elf-requests';

// Elf effects (middleware-like)
const todosRepository = createRepository(
  {
    name: 'todos',
  },
  withEntities<Todo>()
);

// Logging effect
const loggingEffect = todosRepository.pipe(tap((state) => console.log('State changed:', state))).subscribe();

// Performance tracking effect
const performanceEffect = todosRepository
  .pipe(
    pairwise(),
    tap(([prev, curr]) => {
      const start = performance.now();
      // State comparison logic
      const duration = performance.now() - start;
      if (duration > 16) {
        console.warn(`Slow state update: ${duration}ms`);
      }
    })
  )
  .subscribe();

// Custom operators (middleware-like)
const withLogging =
  <T>() =>
  (source$: Observable<T>) =>
    source$.pipe(tap((value) => console.log('Operation:', value)));

const withValidation =
  <T>(validator: (value: T) => boolean) =>
  (source$: Observable<T>) =>
    source$.pipe(
      tap((value) => {
        if (!validator(value)) {
          throw new Error('Validation failed');
        }
      })
    );
```

### 🟢 NgRx SignalStore - withHooks (COULD be implemented)

```typescript
import { signalStore, withHooks, withState } from '@ngrx/signals';

// SignalStore hooks (middleware equivalent)
const TodoStore = signalStore(
  { providedIn: 'root' },
  withState({ todos: [] }),
  withHooks({
    onInit(store) {
      console.log('Store initialized');
    },
    onDestroy(store) {
      console.log('Store destroyed');
    },
  })
);

// Custom hooks for middleware behavior
const withMiddleware = () => {
  return withHooks({
    onInit(store) {
      // Track all state changes
      effect(() => {
        const state = store.todos();
        console.log('State changed:', state);
      });
    },
  });
};
```

## Why Only SignalTree Is Currently Benchmarked:

1. **Implementation Gap**: Other services haven't implemented their respective middleware patterns
2. **Different Paradigms**: Each library has different middleware concepts that need custom implementation
3. **SignalTree Focus**: This appears to be a SignalTree-focused demo showcasing its native middleware capabilities

## Recommendation:

To make the comparison fair, implement equivalent middleware patterns for each library:

- **NgRx**: Meta-reducers for interception
- **NgXs**: Plugin system for hooks
- **Akita**: Store hooks and transactions
- **Elf**: Effects and operators
- **NgRx Signals**: withHooks pattern

This would show the **real performance characteristics** of each library's middleware approach rather than just showing "N/A".
