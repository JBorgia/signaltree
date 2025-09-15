# Missing Benchmark Implementations - Realistic Analysis

Based on the analysis of all benchmark services and **actual library capabilities**, here's a comprehensive list of **feasible missing implementations** across the state management libraries.

## 📊 Implementation Gap Summary

**SignalTree** has **21 total benchmark methods** while all other libraries only have **11 methods**. However, **not all missing methods can be implemented** due to fundamental architectural differences.

## ⚠️ **Reality Check: What's Actually Possible**

Many libraries lack the core architectural features needed for certain benchmarks. This analysis separates **feasible implementations** from **impossible ones**.

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

#### 1. **Middleware Methods (3 missing)**

```typescript
runSingleMiddlewareBenchmark(operations: number): Promise<number>
runMultipleMiddlewareBenchmark(middlewareCount: number, operations: number): Promise<number>
runConditionalMiddlewareBenchmark(operations: number): Promise<number>
```

**Status by Library:**

- ✅ **NgRx Store**: Meta-reducers (FEASIBLE)
- ✅ **NgXs**: Plugin system (FEASIBLE)
- ✅ **Akita**: Store hooks (FEASIBLE)
- ✅ **Elf**: Effects/operators (FEASIBLE)
- ✅ **NgRx Signals**: withHooks (FEASIBLE)

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

#### 3. **Async Workflow Methods (3 missing)**

```typescript
runAsyncWorkflowBenchmark(dataSize: number): Promise<number>
runConcurrentAsyncBenchmark(concurrency: number): Promise<number>
runAsyncCancellationBenchmark(operations: number): Promise<number>
```

**Status by Library:**

- ✅ **NgRx Store**: Effects system (FEASIBLE)
- ✅ **NgXs**: Actions/effects (FEASIBLE)
- ⚠️ **Akita**: Limited async patterns (PARTIALLY FEASIBLE)
- ⚠️ **Elf**: Observable effects (PARTIALLY FEASIBLE)
- ❌ **NgRx Signals**: No async primitives (NOT FEASIBLE without major custom implementation)

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

| Feature             | NgRx Store       | NgXs          | Akita          | Elf           | NgRx Signals  |
| ------------------- | ---------------- | ------------- | -------------- | ------------- | ------------- |
| **Middleware**      | ✅ Meta-reducers | ✅ Plugins    | ✅ Hooks       | ✅ Effects    | ✅ withHooks  |
| **Async Workflows** | ✅ Effects       | ✅ Actions    | ⚠️ Limited     | ⚠️ Limited    | ❌ No support |
| **Time Travel**     | ⚠️ Manual only   | ❌ No support | ⚠️ Plugin only | ⚠️ Addon only | ❌ No support |

### **Total Feasible Implementations:**

- **NgRx Store**: 6/10 methods (3 middleware + 3 async)
- **NgXs**: 6/10 methods (3 middleware + 3 async)
- **Akita**: 4/10 methods (3 middleware + 1 partial async)
- **Elf**: 4/10 methods (3 middleware + 1 partial async)
- **NgRx Signals**: 3/10 methods (3 middleware only)

### **Effort Estimation (Realistic):**

- **Middleware implementations**: 8-12 hours total (high value, all libraries)
- **Async workflows**: 12-16 hours total (NgRx/NgXs only)
- **Time travel**: NOT RECOMMENDED (would require massive custom implementations)

**Total realistic effort: 20-28 hours** for meaningful feature parity improvements.

---

## 🎯 **Recommendations**

### **Priority 1: Implement Middleware (Universal Support)**

All libraries can implement the 3 middleware benchmarks using their native patterns:

- Immediate value for fair middleware comparison
- Showcases each library's middleware approach
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
