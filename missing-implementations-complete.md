# Missing Benchmark Implementations - Realistic Analysis

**⚠️ NOTE: This document is now outdated.** As of October 2025, synthetic middleware benchmarks have been removed from all libraries except SignalTree. See [MIDDL| ------------------- | ---------------- | ------------- | -------------- | ------------- | ------------- |
| **Middleware** | ✅ Meta-reducers | ✅ Plugins | ✅ Hooks | ❌ Not impl | ❌ No support |
| **Async Workflows** | ✅ Effects | ✅ Actions | ⚠️ Limited | ⚠️ Limited | ❌ No support |
| **Time Travel** | ⚠️ Manual only | ❌ No support | ⚠️ Plugin only | ⚠️ Addon only | ❌ No support |

### **Total Feasible Implementations (Updated Oct 7, 2025):**

- **NgRx Store**: 6/10 methods (3 middleware + 3 async) - **✅ BOTH RE-IMPLEMENTED**
- **NgXs**: 6/10 methods (3 middleware + 3 async) - **✅ BOTH RE-IMPLEMENTED**
- **Akita**: 3/10 methods (3 middleware only) - **✅ MIDDLEWARE RE-IMPLEMENTED**
- **Elf**: 0/10 methods (no comparable implementations)
- **NgRx Signals**: 0/10 methods (lifecycle hooks only, no async support)

### **Effort Estimation (Realistic - Updated):**

- **Middleware implementations**: ✅ **COMPLETED** - 4 hours (NgRx Store, NgXs, Akita using actual APIs)
- **Async workflows**: ✅ **COMPLETED** - 3 hours (NgRx Store, NgXs using actual @ngrx/effects and Actions APIs)
- **Time Travel**: NOT RECOMMENDED (would require massive custom implementations)

**🎉 All feasible implementations are now complete!**

---

## 🎯 **Recommendations (Updated Oct 7, 2025)**

### ✅ **Priority 1: Middleware - COMPLETED**

Middleware benchmarks have been **properly implemented** for all libraries with comparable middleware/plugin systems:

- Uses actual library APIs (meta-reducers, plugins, hooks)
- Measures real middleware overhead
- Fair comparison of different architectural approaches

See [MIDDLEWARE_CLEANUP.md](./MIDDLEWARE_CLEANUP.md) for implementation details.

### ✅ **Priority 2: Async Workflows - COMPLETED**

Async workflow benchmarks have been **properly implemented** for libraries with Effects/Actions systems:

- **NgRx Store**: Uses actual `@ngrx/effects` with Actions, ofType, mergeMap
- **NgXs**: Uses actual Actions observable with ofActionDispatched
- **Akita/Elf**: Remain as lightweight simulations (no effects/actions systems)
- Measures real async overhead for applicable libraries
- Fair comparison respecting architectural differences

See [ASYNC_WORKFLOW_IMPLEMENTATIONS.md](./ASYNC_WORKFLOW_IMPLEMENTATIONS.md) for full details.E_CLEANUP.md](./MIDDLEWARE_CLEANUP.md) for details.

Based on the analysis of all benchmark services and **actual library capabilities**, here's a comprehensive list of **feasible missing implementations** across the state management libraries.

## 📊 Implementation Gap Summary

**SignalTree** has **21 total benchmark methods** while all other libraries only have **11 methods**. However, **not all missing methods can be implemented** due to fundamental architectural differences.

## ⚠️ **Reality Check: What's Actually Possible**

Many libraries lack the core architectural features needed for certain benchmarks. This analysis separates **feasible implementations** from **impossible ones**.

**UPDATE (Oct 2025):** Middleware benchmarks have been removed from all libraries except SignalTree because the synthetic implementations didn't represent actual middleware architecture.

## 🔍 Complete Method Comparison

### ✅ Currently Implemented (All Libraries)

These methods exist in all 6 services:

1. `runDeepNestedBenchmark(dataSize: number, depth?: number): Promise<number>`
2. `runArrayBenchmark(dataSize: number): Promise<number>`
3. `runComputedBenchmark(dataSize: number): Promise<number>`
4. `runBatchUpdatesBenchmark(batchSize: number, operations: number): Promise<number>`
5. `runSelectorBenchmark(dataSize: number): Promise<number>`
6. `runSerializationBenchmark(dataSize: number): Promise<number>`
7. `runConcurrentUpdatesBenchmark(concurrency: number, operations?: number): Promise<number>`
8. `runMemoryEfficiencyBenchmark(dataSize: number): Promise<number>`
9. `runDataFetchingBenchmark(dataSize?: number): Promise<number>`
10. `runRealTimeUpdatesBenchmark(dataSize?: number): Promise<number>`
11. `runStateSizeScalingBenchmark(dataSize?: number): Promise<number>`

### ❌ Missing Advanced Methods (10 methods)

These exist only in SignalTree. **Feasibility varies by library architecture:**

#### 1. **Middleware Methods (3 methods)** ✅ RE-IMPLEMENTED

```typescript
runSingleMiddlewareBenchmark(operations: number): Promise<number>
runMultipleMiddlewareBenchmark(middlewareCount: number, operations: number): Promise<number>
runConditionalMiddlewareBenchmark(operations: number): Promise<number>
```

**Status: PROPERLY IMPLEMENTED (Oct 7, 2025)**

After initially being removed for using synthetic implementations, these have been **properly re-implemented** using actual library middleware/plugin APIs.

**Current Status by Library:**

- ✅ **SignalTree**: Native `withMiddleware()` - IMPLEMENTED
- ✅ **NgRx Store**: Actual meta-reducers (ActionReducer) - RE-IMPLEMENTED
- ✅ **NgXs**: Actual NgxsPlugin interface - RE-IMPLEMENTED
- ✅ **Akita**: Actual akitaPreUpdate hooks - RE-IMPLEMENTED
- ❌ **Elf**: RxJS effects/operators (different paradigm) - NOT IMPLEMENTED
- ❌ **NgRx Signals**: Lifecycle hooks only, not middleware - NOT IMPLEMENTED

See [MIDDLEWARE_CLEANUP.md](./MIDDLEWARE_CLEANUP.md) for implementation details and history.

#### 2. **Time Travel / History Methods (4 missing)**

```typescript
runUndoRedoBenchmark(operations: number): Promise<number>
runHistorySizeBenchmark(historySize: number): Promise<number>
runJumpToStateBenchmark(operations: number): Promise<number>
runAllFeaturesEnabledBenchmark(dataSize: number): Promise<number>
```

**Status by Library:**

- ⚠️ **NgRx Store**: Redux DevTools only (LIMITED - manual history required)
- ❌ **NgXs**: No built-in time travel (NOT FEASIBLE without major custom implementation)
- ⚠️ **Akita**: History plugin available (LIMITED - requires external plugin)
- ⚠️ **Elf**: History addon available (LIMITED - requires external addon)
- ❌ **NgRx Signals**: No built-in history (NOT FEASIBLE without major custom implementation)

#### 3. **Async Workflow Methods (3 methods)** ✅ PROPERLY IMPLEMENTED

```typescript
runAsyncWorkflowBenchmark(dataSize: number): Promise<number>
runConcurrentAsyncBenchmark(concurrency: number): Promise<number>
runAsyncCancellationBenchmark(operations: number): Promise<number>
```

**Status: PROPERLY IMPLEMENTED (Oct 7, 2025)**

After using synthetic `setTimeout` implementations, these have been **properly re-implemented** using actual library async APIs where available.

**Current Status by Library:**

- ✅ **SignalTree**: Native async capabilities - IMPLEMENTED
- ✅ **NgRx Store**: Actual @ngrx/effects with Actions, ofType, mergeMap - RE-IMPLEMENTED
- ✅ **NgXs**: Actual Actions observable with ofActionDispatched - RE-IMPLEMENTED
- ⚠️ **Akita**: Lightweight simulation (no effects/actions system) - INTENTIONAL
- ⚠️ **Elf**: Lightweight simulation (no effects/actions system) - INTENTIONAL
- ❌ **NgRx Signals**: No async primitives - NOT IMPLEMENTED

See [ASYNC_WORKFLOW_IMPLEMENTATIONS.md](./ASYNC_WORKFLOW_IMPLEMENTATIONS.md) for full implementation details and rationale.

---

## 🛠️ **Feasible Implementations Only**

### ✅ **High Priority: Middleware (All Libraries Can Implement)**

All libraries have native middleware-equivalent capabilities:

#### **NgRx Store - Meta-Reducers**

```typescript
async runSingleMiddlewareBenchmark(operations: number): Promise<number> {
  const loggingMetaReducer = (reducer: ActionReducer<any>) => (state: any, action: any) => {
    const start = performance.now();
    const result = reducer(state, action);
    const duration = performance.now() - start;
    return result;
  };

  // Use meta-reducer in benchmark store setup
  const start = performance.now();
  for (let i = 0; i < operations; i++) {
    store.dispatch(incrementAction());
  }
  return performance.now() - start;
}
```

#### **NgXs - Plugin System**

```typescript
@Injectable()
export class BenchmarkPlugin implements NgxsPlugin {
  handle(state: any, action: any, next: NgxsNextPluginFn) {
    const start = performance.now();
    const result = next(state, action);
    const duration = performance.now() - start;
    return result;
  }
}
```

#### **Akita - Store Hooks**

```typescript
class BenchmarkStore extends Store<any> {
  constructor() {
    super(initialState);
    this.akitaPreUpdate = (prev, next) => {
      const start = performance.now();
      // Process update
      const duration = performance.now() - start;
      return next;
    };
  }
}
```

### ⚠️ **Medium Priority: Async Workflows (Partial Support)**

#### **NgRx Store - Effects (FULL SUPPORT)**

```typescript
async runAsyncWorkflowBenchmark(dataSize: number): Promise<number> {
  // Can fully implement using Effects
  const asyncEffect$ = createEffect(() =>
    this.actions$.pipe(
      ofType(startAsyncAction),
      concatMap(() =>
        timer(0).pipe(map(() => completeAsyncAction()))
      )
    )
  );
}
```

#### **NgXs - Actions (FULL SUPPORT)**

```typescript
@Action(AsyncWorkflowAction)
async handleAsyncWorkflow(ctx: StateContext<any>, action: any) {
  const start = performance.now();
  await Promise.all(/* async operations */);
  return performance.now() - start;
}
```

#### **Akita/Elf - Observable Effects (PARTIAL SUPPORT)**

```typescript
// Limited async capability compared to SignalTree
const asyncEffect = store.pipe(switchMap((state) => from(asyncOperation()).pipe(tap((result) => store.update(result))))).subscribe();
```

### ❌ **Low Priority: Time Travel (Very Limited Support)**

#### **NgRx Store - Manual History Only**

```typescript
// Would require manual history state management
interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

// NOT recommended - very complex and performance-heavy
async runUndoRedoBenchmark(operations: number): Promise<number> {
  // Manual undo/redo implementation would be slow and complex
}
```

#### **Akita/Elf - Plugin Required**

```typescript
// Requires @datorama/akita history plugin or @ngneat/elf-history
// Only basic undo/redo, not full time travel like SignalTree
```

---

## 📊 **Realistic Implementation Summary**

### **What CAN be implemented:**

| Feature             | NgRx Store     | NgXs          | Akita          | Elf           | NgRx Signals  |
| ------------------- | -------------- | ------------- | -------------- | ------------- | ------------- |
| **Middleware**      | ❌ Removed     | ❌ Removed    | ❌ Removed     | ❌ Removed    | ❌ Removed    |
| **Async Workflows** | ✅ Effects     | ✅ Actions    | ⚠️ Limited     | ⚠️ Limited    | ❌ No support |
| **Time Travel**     | ⚠️ Manual only | ❌ No support | ⚠️ Plugin only | ⚠️ Addon only | ❌ No support |

### **Total Feasible Implementations (Updated Oct 2025):**

- **NgRx Store**: 3/10 methods (3 async only - middleware removed)
- **NgXs**: 3/10 methods (3 async only - middleware removed)
- **Akita**: 1/10 methods (1 partial async - middleware removed)
- **Elf**: 1/10 methods (1 partial async - middleware removed)
- **NgRx Signals**: 0/10 methods (middleware removed, no async support)

### **Effort Estimation (Realistic - Updated):**

- ~~**Middleware implementations**: 8-12 hours total (high value, all libraries)~~ **REMOVED - Not comparable architectures**
- **Async workflows**: 12-16 hours total (NgRx/NgXs only)
- **Time travel**: NOT RECOMMENDED (would require massive custom implementations)

**Total realistic effort: 12-16 hours** for remaining feature parity improvements.

---

## 🎯 **Recommendations (Updated Oct 2025)**

### ~~**Priority 1: Implement Middleware (Universal Support)**~~ ❌ REMOVED

Middleware benchmarks have been removed because:

- Libraries have fundamentally different plugin/hook architectures
- Synthetic implementations didn't represent real middleware behavior
- Only SignalTree has before/after state update interception comparable to middleware

See [MIDDLEWARE_CLEANUP.md](./MIDDLEWARE_CLEANUP.md) for details.

- Relatively quick implementation

### **Priority 2: Implement Async Workflows (NgRx/NgXs Only)**

Only NgRx Store and NgXs have sufficient async capabilities:

- Demonstrates async state management patterns
- Shows Effects vs Actions performance
- Medium implementation effort

### **Skip: Time Travel Features**

Most libraries lack native time travel capabilities:

- Would require massive custom implementations
- Performance would be poor compared to SignalTree's native support
- Not representative of library capabilities
- High effort, low value

### **Alternative: Feature Capability Matrix**

Instead of forcing implementations, create a capability comparison showing what each library supports natively vs. requiring custom implementations.
