# Async Workflow Benchmark Implementations

**Date:** October 7, 2025  
**Status:** Properly implemented using actual library async APIs where available

## Summary

This document explains how async workflow benchmarks are implemented for each state management library, distinguishing between libraries that use **actual async primitives** (Effects, Actions) versus those using **lightweight simulations**.

## Implementation Status by Library

### ✅ Libraries with Actual Async API Implementations

#### 1. **SignalTree** - Native Async Support

- **Status:** Implemented using native async capabilities
- **Methods:** `runAsyncWorkflowBenchmark`, `runConcurrentAsyncBenchmark`, `runAsyncCancellationBenchmark`
- **Architecture:** Uses SignalTree's built-in async primitives

#### 2. **NgRx Store** - Effects-Based (@ngrx/effects)

- **Status:** ✅ Properly implemented (Oct 7, 2025)
- **Methods:** All 3 async workflow methods implemented
- **Implementation Details:**
  - Uses actual `@ngrx/effects` library
  - `Actions` observable with `ofType` operator
  - `mergeMap` for concurrent operations
  - `race` + `takeUntil` for cancellation
  - `timer` for async delays
- **Architecture:** Effect streams that react to dispatched actions
- **Example:**
  ```typescript
  const asyncEffect$ = actions$.pipe(
    ofType(triggerAsync),
    mergeMap((action) =>
      timer(0).pipe(
        map(() => asyncComplete({ id: action.id })),
        take(1)
      )
    )
  );
  ```

#### 3. **NgXs** - Actions-Based (@ngxs/store)

- **Status:** ✅ Properly implemented (Oct 7, 2025)
- **Methods:** All 3 async workflow methods implemented
- **Implementation Details:**
  - Uses actual `Actions` observable from `@ngxs/store`
  - `ofActionDispatched` operator for listening to actions
  - `mergeMap` for concurrent operations
  - `race` for cancellation patterns
  - Action classes for type-safe async workflows
- **Architecture:** Action streams that react to dispatched state actions
- **Example:**
  ```typescript
  const asyncEffect$ = actions$.pipe(
    ofActionDispatched(TriggerAsyncAction),
    mergeMap((action) =>
      timer(0).pipe(
        map(() => new AsyncCompleteAction(action.id)),
        take(1)
      )
    )
  );
  ```

### ⚠️ Libraries with Lightweight Simulations

#### 4. **Akita** - Limited Async (Simulation)

- **Status:** Lightweight simulation (intentional)
- **Why:** Akita has no built-in effects/actions system
- **Methods:** `runAsyncWorkflowBenchmark`, `runConcurrentAsyncBenchmark`, `runAsyncCancellationBenchmark`
- **Implementation:** Uses `setTimeout` and `Promise.all` for basic async patterns
- **Limitation:** Cannot benchmark actual Akita-specific async patterns as they don't exist
- **Architecture:** Direct Promise-based async operations

#### 5. **Elf** - Limited Async (Simulation)

- **Status:** Lightweight simulation (intentional)
- **Why:** Elf uses RxJS operators but has no effects/actions system comparable to NgRx/NgXs
- **Methods:** `runAsyncWorkflowBenchmark`, `runConcurrentAsyncBenchmark`, `runAsyncCancellationBenchmark`
- **Implementation:** Uses `setTimeout` and `Promise.all` for basic async patterns
- **Limitation:** Could use RxJS effects but no action-based architecture
- **Architecture:** Direct Promise-based async operations

#### 6. **NgRx SignalStore** - No Async Support

- **Status:** ❌ Not implemented
- **Why:** NgRx SignalStore has no async primitives (Effects, Actions, etc.)
- **Methods:** None implemented
- **Note:** Lifecycle hooks exist but are not comparable to async workflows

## Timeline

### Phase 1: Synthetic Implementations (Before Oct 7, 2025)

- All libraries used generic `setTimeout` and `Promise.all`
- Did not represent actual library async capabilities
- Not a fair comparison

### Phase 2: Proper Implementation (Oct 7, 2025)

- **NgRx Store:** Implemented using actual `@ngrx/effects` API
- **NgXs:** Implemented using actual `Actions` observable API
- **Akita/Elf:** Remain as lightweight simulations (intentional - no comparable APIs)
- **SignalTree:** Already using native async capabilities

## Key Differences Between Implementations

### NgRx Store Effects vs NgXs Actions

| Aspect              | NgRx Store                         | NgXs                              |
| ------------------- | ---------------------------------- | --------------------------------- |
| **Import**          | `@ngrx/effects`                    | `@ngxs/store` (Actions)           |
| **Observable**      | `Actions` from effects             | `Actions` from store              |
| **Filter Operator** | `ofType(action)`                   | `ofActionDispatched(ActionClass)` |
| **Action Style**    | Factory functions (`createAction`) | Class-based (`new ActionClass()`) |
| **Dispatch**        | Manual subject injection           | `store.dispatch()`                |
| **Architecture**    | Side effects as separate streams   | Actions as observable events      |

### Why Akita/Elf Use Simulations

1. **No Built-in Effects System:**

   - NgRx has `@ngrx/effects`
   - NgXs has Actions observable
   - Akita/Elf have neither

2. **Different Async Paradigm:**

   - Akita uses queries and observables directly
   - Elf uses RxJS operators on state
   - Neither has action-based async workflows

3. **Fair Benchmarking:**
   - Simulations ensure all libraries test the same async patterns
   - Avoids penalizing libraries for architectural differences
   - Focuses on async overhead, not paradigm differences

## Impact on Benchmarks

### Before (Synthetic)

- All libraries showed similar async performance
- Misleading - didn't reflect actual library usage
- Synthetic `setTimeout` doesn't represent real async patterns

### After (Proper Implementation)

- **NgRx Store:** Shows actual Effects overhead
- **NgXs:** Shows actual Actions observable overhead
- **Akita/Elf:** Show baseline async overhead (simulation)
- **Fair comparison** of async capabilities

## References

- [NgRx Effects Documentation](https://ngrx.io/guide/effects)
- [NgXs Actions Stream](https://www.ngxs.io/concepts/actions)
- [Akita Query Documentation](https://datorama.github.io/akita/docs/query/)
- [Elf Effects](https://ngneat.github.io/elf/)

## Related Documentation

- [MIDDLEWARE_CLEANUP.md](./MIDDLEWARE_CLEANUP.md) - Similar proper implementation for middleware
- [middleware-capabilities-analysis.md](./middleware-capabilities-analysis.md) - Architectural analysis
- [missing-implementations-complete.md](./missing-implementations-complete.md) - Implementation status
