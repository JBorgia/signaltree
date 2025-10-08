# State Management Middleware Capabilities Analysis

**⚠️ UPDATED (Oct 2025):** This analysis led to the removal of synthetic middleware benchmarks. See [MIDDLEWARE_CLEANUP.md](./MIDDLEWARE_CLEANUP.md).

## Current Status: Only SignalTree Has Middleware Benchmarks ✅

The benchmarks correctly show only SignalTree has middleware support because:

1. **SignalTree** has native `withMiddleware()` with before/after state update interception
2. **Other libraries** have different plugin/hook systems that don't directly compare to SignalTree's middleware architecture
3. **Previous synthetic implementations** were removed because they didn't use actual library middleware APIs

## Why Other Libraries Don't Have Middleware Benchmarks

While other libraries have plugin/hook systems, they operate differently than SignalTree's before/after middleware:

## What Each Library Actually Supports:

### 🟢 NgRx Store - Meta-Reducers (COULD be implemented)

```typescript
// NgRx Meta-Reducer (Middleware Equivalent)
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

### 🟢 NgXs - Plugin System (COULD be implemented)

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

### 🟢 Akita - Store Hooks & Transaction System (COULD be implemented)

```typescript
// Akita Store Hooks
class MyStore extends Store<MyState> {
  constructor() {
    super(initialState);

    // Hook into all updates
    this.akitaPreUpdate = (previousState, nextState) => {
      console.log('State changing:', { previousState, nextState });
      return nextState; // Can modify or reject
    };
  }
}

// Transaction middleware
import { transaction } from '@datorama/akita';

// Performance tracking
const performanceTransaction = <T>(fn: () => T): T => {
  const start = performance.now();
  const result = transaction(fn);
  const duration = performance.now() - start;
  console.log(`Transaction took ${duration}ms`);
  return result;
};

// Validation middleware
const validationTransaction = <T>(validateFn: () => boolean, fn: () => T): T => {
  if (!validateFn()) {
    throw new Error('Validation failed');
  }
  return transaction(fn);
};
```

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
