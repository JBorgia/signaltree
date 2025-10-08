# Middleware Benchmark Cleanup

## Summary

Removed synthetic middleware benchmark implementations from libraries that don't have true state update interception middleware comparable to SignalTree's `@signaltree/middleware` package.

## Research Findings

### Libraries with TRUE Middleware/Plugin Systems:

- **SignalTree**: Native `withMiddleware()` with before/after hooks ✅
- **NgRx Store**: Meta-reducers (action interception) 🟡
- **NgXs**: Plugin system (`NgxsPlugin` interface) 🟡

### Libraries WITHOUT Direct Middleware Equivalents:

- **NgRx SignalStore**: Has `withHooks()` but these are lifecycle hooks (onInit/onDestroy), NOT state update interception ❌
- **Akita**: Has `akitaPreUpdate` hooks but different paradigm ❌
- **Elf**: Uses RxJS effects/operators, not before/after middleware ❌

## What Was Removed

Removed synthetic middleware implementations from:

1. **NgRx SignalStore** (`ngrx-signals-benchmark.service.ts`)

   - `runSingleMiddlewareBenchmark()`
   - `runMultipleMiddlewareBenchmark()`
   - `runConditionalMiddlewareBenchmark()`

2. **Akita** (`akita-benchmark.service.ts`)

   - Same three methods removed

3. **Elf** (`elf-benchmark.service.ts`)

   - Same three methods removed

4. **NgXs** (`ngxs-benchmark.service.ts`)

   - Same three methods removed

5. **NgRx Store** (`ngrx-benchmark.service.ts`)
   - Same three methods removed
   - Also removed unused imports: `EnhancedBenchmarkOptions`, `runEnhancedBenchmark`

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

### Before:

- Middleware tests showed "0 ops/s" or "N/A" for most libraries
- Gave false impression that libraries "support" middleware
- Benchmark results were misleading

### After:

- Middleware tests will now correctly show:
  - ✅ **SignalTree**: Real performance data using actual `withMiddleware()`
  - ❌ **Other libraries**: "Not Supported" or "N/A" (since methods don't exist)
- Benchmark comparison is now honest about architectural differences
- No more synthetic "function call overhead" measurements

## Future Considerations

If you want to benchmark middleware/plugin capabilities for other libraries, you should:

1. **NgRx Store**: Implement actual meta-reducers that intercept actions
2. **NgXs**: Implement actual `NgxsPlugin` that uses the plugin lifecycle
3. **Akita**: Implement actual `akitaPreUpdate` hooks in Store classes
4. **Elf**: Implement actual RxJS operators/effects chains

These would provide REAL comparisons of each library's middleware architecture, not just function call overhead.

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
