# SignalTree Optimization Guide

## `optimize()` vs `clearCache()` - Key Differences

### Overview

SignalTree provides two distinct methods for memory management and cache optimization. Understanding when and how to use each is crucial for optimal performance.

## `optimize()` - Smart Optimization

### What it does:

- **Conditional cleanup**: Only clears cache when size exceeds `maxCacheSize` limit
- **Memory tracking**: Updates memory usage metrics in PerformanceMetrics
- **Smart preservation**: Maintains frequently used cached items when possible
- **Performance monitoring**: Tracks memory usage for optimization insights

### When to use:

- **Routine maintenance**: Regular component lifecycle cleanup
- **Periodic optimization**: Scheduled performance maintenance
- **Memory-aware cleanup**: When you want to respect cache size limits
- **Production environments**: Where you want controlled, predictable cleanup

### Example:

```typescript
const tree = signalTree(
  { data: [], filters: {}, results: [] },
  {
    enablePerformanceFeatures: true,
    useMemoization: true,
    maxCacheSize: 50,
    trackPerformance: true
  }
);

// Create many cached computations
for (let i = 0; i < 100; i++) {
  tree.computed(state => expensiveCalculation(state, i), `calc-${i}`);
}

// Smart cleanup - only clears if cache > 50 items
tree.cleanup();

// Check if cleanup helped with memory
const metrics = tree.getMetrics();
console.log(`Memory usage: ${metrics.memoryUsage} bytes`);

// Use in component lifecycle
ngOnDestroy() {
  this.tree.cleanup(); // Gentle cleanup before component destruction
}
```

---

## `clearCache()` - Immediate Reset

### What it does:

- **Immediate action**: Always clears ALL cached computed values regardless of size
- **Complete reset**: Forces fresh computation on next access
- **No memory tracking**: Focused only on cache invalidation
- **Aggressive cleanup**: Removes everything, no exceptions

### When to use:

- **Cache invalidation**: After data source changes that make cache stale
- **Memory pressure**: When you need immediate memory relief
- **Debugging**: To ensure fresh computations for testing
- **Bulk operations**: Before/after large data imports or transformations

### Example:

```typescript
const tree = signalTree(
  { dataset: [], filters: { category: '', price: 0 } },
  { enablePerformanceFeatures: true, useMemoization: true }
);

// Create cached computations
const filteredData = tree.computed(
  state => state.dataset.filter(item =>
    item.category.includes(state.filters.category) &&
    item.price >= state.filters.price
  ),
  'filtered-data'
);

filteredData(); // Computed and cached
filteredData(); // Served from cache

// Data source changed - invalidate ALL cache
await importNewDataset();
tree.clearCache(); // Forces fresh computation

filteredData(); // Computed fresh (cache miss)

// Use cases:
onDataImport() {
  tree.clearCache(); // Clear stale cache
  tree.update(() => ({ dataset: newData }));
}

onMemoryPressure() {
  tree.clearCache(); // Immediate memory relief
}

beforePerformanceTest() {
  tree.clearCache(); // Ensure clean slate for benchmarking
}
```

---

## Decision Matrix

| Scenario                | Method         | Reason                        |
| ----------------------- | -------------- | ----------------------------- |
| Component destruction   | `cleanup()`    | Gentle, respects cache limits |
| Data source changed     | `clearCache()` | Cache is stale, force refresh |
| Periodic maintenance    | `cleanup()`    | Smart, performance-aware      |
| Memory pressure         | `clearCache()` | Immediate relief needed       |
| Debugging               | `clearCache()` | Ensure fresh computations     |
| Production optimization | `cleanup()`    | Controlled, predictable       |
| Bulk data import        | `clearCache()` | Old cache is irrelevant       |
| Performance testing     | `clearCache()` | Clean baseline needed         |

---

## Performance Impact

### `cleanup()`

```typescript
// Low impact - conditional operation
const cache = computedCache.get(tree);
if (cache && cache.size > maxCacheSize) {
  cache.clear(); // Only if needed
}

// Updates memory metrics
if ('memory' in performance) {
  metrics.memoryUsage = performance.memory.usedJSHeapSize;
}
```

### `clearCache()`

```typescript
// Immediate impact - always executes
const cache = computedCache.get(tree);
if (cache) {
  cache.clear(); // Always clears
}
```

---

## Best Practices

### 1. Use `cleanup()` for routine maintenance

```typescript
@Component({...})
export class MyComponent implements OnDestroy {
  private tree = signalTree(this.initialState, {
    enablePerformanceFeatures: true,
    useMemoization: true,
    maxCacheSize: 50
  });

  ngOnDestroy() {
    // Gentle cleanup that respects cache limits
    this.tree.cleanup();
  }
}
```

### 2. Use `clearCache()` for data invalidation

```typescript
@Injectable()
export class DataService {
  private dataTree = signalTree(this.initialData, config);

  async refreshData() {
    // Clear stale cache before new data
    this.dataTree.clearCache();

    const newData = await this.api.fetchLatestData();
    this.dataTree.update(() => ({ data: newData }));
  }
}
```

### 3. Monitor and optimize

```typescript
// Monitor cache effectiveness
const metrics = tree.getMetrics();
const hitRatio = metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses);

if (hitRatio < 0.7) {
  console.warn('Low cache hit ratio - review cache keys');
}

// Monitor memory usage
if (metrics.memoryUsage && metrics.memoryUsage > 100 * 1024 * 1024) {
  // 100MB
  console.warn('High memory usage detected');
  tree.clearCache(); // Aggressive cleanup
}
```

### 4. Combine both methods strategically

```typescript
class AdvancedOptimizer {
  constructor(private tree: SignalTree<any>) {}

  // Routine maintenance
  performMaintenance() {
    this.tree.cleanup(); // Gentle, respects limits
  }

  // Emergency cleanup
  emergencyCleanup() {
    this.tree.clearCache(); // Immediate relief
  }

  // Smart cleanup based on metrics
  smartOptimize() {
    const metrics = this.tree.getMetrics();

    if (metrics.memoryUsage && metrics.memoryUsage > this.memoryThreshold) {
      this.tree.clearCache(); // Memory pressure
    } else {
      this.tree.cleanup(); // Normal maintenance
    }
  }
}
```

---

## Summary

- **`cleanup()`**: Smart, conditional optimization for routine maintenance
- **`clearCache()`**: Immediate, complete cache invalidation for specific scenarios

Choose `cleanup()` for regular maintenance and `clearCache()` when you need immediate cache invalidation or are dealing with stale data scenarios.
