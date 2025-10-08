# Middleware Benchmark Implementation History

## Summary

**UPDATE (Oct 7, 2025):** Middleware benchmarks have been **properly re-implemented** using actual library APIs after initially being removed for using synthetic implementations.

## Implementation History

### Phase 1: Removal (Oct 7, 2025 AM)

Removed synthetic middleware benchmark implementations that were just trivial function calls and didn't use actual library middleware/plugin APIs.

### Phase 2: Re-Implementation (Oct 7, 2025 PM)

**Properly implemented** middleware benchmarks using actual library middleware architectures for libraries that support comparable functionality.

## Current Status

### Libraries with Middleware Benchmarks Implemented:

- **SignalTree**: Native `withMiddleware()` with before/after property update hooks ✅
- **NgRx Store**: Actual `ActionReducer` meta-reducers that intercept actions ✅
- **NgXs**: Actual `NgxsPlugin` interface with `handle()` method for action lifecycle ✅
- **Akita**: Actual `Store.akitaPreUpdate()` hooks for state transition interception ✅

### Libraries WITHOUT Middleware Benchmarks:

- **NgRx SignalStore**: Has `withHooks()` but these are lifecycle hooks (onInit/onDestroy), NOT state update interception ❌
- **Elf**: Uses RxJS effects/operators, operates at stream level not middleware level ❌

## Implementation Details

### Re-Implemented Libraries (Using Actual APIs):

1. **NgRx Store** (`ngrx-benchmark.service.ts`) ✅

   - Uses actual `ActionReducer` type and meta-reducer pattern
   - `runSingleMiddlewareBenchmark()`: Single meta-reducer wrapping base reducer
   - `runMultipleMiddlewareBenchmark()`: Composes multiple meta-reducers
   - `runConditionalMiddlewareBenchmark()`: Conditional logic in meta-reducer
   - **Architecture**: Intercepts actions before/after reducer execution

2. **NgXs** (`ngxs-benchmark.service.ts`) ✅

   - Uses actual `NgxsPlugin` interface with `handle()` method
   - `runSingleMiddlewareBenchmark()`: Single plugin intercepting actions
   - `runMultipleMiddlewareBenchmark()`: Chain of plugins composed together
   - `runConditionalMiddlewareBenchmark()`: Conditional plugin logic based on action type
   - **Architecture**: Intercepts action lifecycle (dispatch → completion)

3. **Akita** (`akita-benchmark.service.ts`) ✅
   - Uses actual `Store` class with `akitaPreUpdate()` override
   - `runSingleMiddlewareBenchmark()`: Store with single akitaPreUpdate hook
   - `runMultipleMiddlewareBenchmark()`: Simulates multiple middleware in single hook (Akita limitation)
   - `runConditionalMiddlewareBenchmark()`: Conditional logic in akitaPreUpdate
   - **Architecture**: Intercepts state transitions (previous → next state)

### Libraries Remaining Removed:

4. **NgRx SignalStore** (`ngrx-signals-benchmark.service.ts`) ❌

   - Reason: `withHooks()` are lifecycle hooks, not state update interception
   - No comparable middleware API

5. **Elf** (`elf-benchmark.service.ts`) ❌
   - Reason: RxJS effects/operators work at observable stream level
   - Different paradigm than before/after middleware hooks

## Why These Were Removed

The previous implementations were **synthetic simulations** that:

- Just called trivial inline functions (10-30 iterations of arithmetic)
- Completed in ~0ms, causing "0 ops/s" and "N/A" displays
- Got optimized away by V8 JIT compiler
- **Did NOT use the actual library's middleware/plugin architecture**
- **Did NOT represent real-world middleware performance**

For example, the NgRx SignalStore implementation was:

```typescript
async runSingleMiddlewareBenchmark(operations: number): Promise<number> {
  const start = performance.now();
  const hook = (ctx: string, payload?: unknown) => {
    let acc = 0;
    for (let i = 0; i < 10; i++) acc += i;  // Trivial loop
    return acc > -1;
  };
  for (let i = 0; i < operations; i++) hook('noop', i);
  return performance.now() - start;
}
```

This doesn't test NgRx SignalStore's actual `withHooks()` API, just measures function call overhead.

## Impact

### Before Removal (Synthetic Implementations):

- Middleware tests showed "0 ops/s" or "N/A" for most libraries
- Gave false impression but didn't use actual library APIs
- Benchmark results were misleading

### After Removal (Phase 1):

- Middleware tests showed "Not Supported" or "N/A"
- Honest but incomplete - some libraries DO have middleware

### After Re-Implementation (Phase 2 - Current):

- Middleware tests now correctly show:
  - ✅ **SignalTree**: Real performance using actual `withMiddleware()`
  - ✅ **NgRx Store**: Real performance using actual meta-reducers
  - ✅ **NgXs**: Real performance using actual `NgxsPlugin` interface
  - ✅ **Akita**: Real performance using actual `akitaPreUpdate` hooks
  - ❌ **NgRx SignalStore**: Not implemented (lifecycle hooks only)
  - ❌ **Elf**: Not implemented (RxJS streams, different paradigm)
- Benchmark comparison now shows REAL middleware overhead for each library's actual architecture
- Fair comparison of different middleware/plugin approaches

## Files Modified

```
apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/
├── ngrx-signals-benchmark.service.ts  (removed 3 methods)
├── akita-benchmark.service.ts         (removed 3 methods)
├── elf-benchmark.service.ts           (removed 3 methods)
├── ngxs-benchmark.service.ts          (removed 3 methods)
└── ngrx-benchmark.service.ts          (removed 3 methods + 2 imports)
```

## Deployment

Changes deployed to: https://signaltree.io

The benchmark page will now show accurate middleware support:

- SignalTree: Full middleware benchmark results
- Other libraries: "Not Supported" or "N/A" for middleware tests
