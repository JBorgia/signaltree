# @signaltree/memoization

Intelligent caching and performance optimization for SignalTree featuring LRU cache eviction, path-based memoization, and automatic optimization.

## What is @signaltree/memoization?

The memoization package supercharges SignalTree performance with:

- Significant speedups across typical workloads (magnitude depends on workload)
- LRU (Least Recently Used) cache eviction algorithm
- Path-based memoization with fine-grained invalidation
- Glob pattern matching for smart cache cleanup
- High cache hit ratios in typical applications (>95%)
- Automatic optimization with minimal configuration
- Ultra-compact: Advanced caching in ~1.80KB gzipped
- Low overhead design suitable for frequent computations

## Installation

```bash
npm install @signaltree/core @signaltree/memoization
```

## Basic usage

```typescript
import { signalTree } from '@signaltree/core';
import { withMemoization } from '@signaltree/memoization';

const tree = signalTree({
  users: [] as User[],
  filters: { search: '', category: '' },
}).with(withMemoization());

// Memoize expensive computations
const filteredUsers = tree.memoize((state) => state.users.filter((user) => user.name.includes(state.filters.search) && (state.filters.category === '' || user.category === state.filters.category)), 'filtered-users');
```

## Quick Start with Presets (v3.0.2+)

SignalTree provides optimized preset configurations for common use cases:

```typescript
import { signalTree } from '@signaltree/core';
import { withSelectorMemoization, withComputedMemoization, withDeepStateMemoization, withHighFrequencyMemoization } from '@signaltree/memoization';

// For selector operations (fast, reference equality)
const selectorTree = signalTree(state).with(withSelectorMemoization());

// For computed properties (balanced, shallow equality)
const computedTree = signalTree(state).with(withComputedMemoization());

// For deep state comparisons
const deepTree = signalTree(state).with(withDeepStateMemoization());

// For high-frequency operations with large working sets
const highFreqTree = signalTree(state).with(withHighFrequencyMemoization());
```

### Preset Configurations

| Preset                           | Equality  | Cache Size | LRU | Use Case                                           |
| -------------------------------- | --------- | ---------- | --- | -------------------------------------------------- |
| `withSelectorMemoization()`      | Reference | 10         | ❌  | Fast selector caching for frequently accessed data |
| `withComputedMemoization()`      | Shallow   | 100        | ❌  | Computed properties with object/array dependencies |
| `withDeepStateMemoization()`     | Deep      | 50         | ✅  | Complex nested state with deep equality checks     |
| `withHighFrequencyMemoization()` | Shallow   | 500        | ✅  | High-frequency operations with large working sets  |

**Performance Characteristics:**

- Reference equality: ~0.3μs per comparison
- Shallow equality: ~5-15μs per comparison (optimized in v3.0.2)
- Deep equality: ~50-200μs per comparison

**Benchmark Fairness:** These presets are the same configurations used in SignalTree's benchmark suite, ensuring you can achieve the same performance results in your applications.

## Key features

### Intelligent Caching

```typescript
const tree = signalTree({
  products: [] as Product[],
  cart: [] as CartItem[],
}).with(withMemoization());

// Expensive computation cached automatically
const cartTotal = tree.memoize((state) => {
  return state.cart.reduce((total, item) => {
    const product = state.products.find((p) => p.id === item.productId);
    return total + (product?.price || 0) * item.quantity;
  }, 0);
}, 'cart-total');

// Only recalculates when cart or products change
console.log(cartTotal()); // Calculated
console.log(cartTotal()); // From cache ⚡
```

### Path-Based Invalidation

```typescript
// Cache is automatically invalidated when related paths change
tree.$.cart.update((cart) => [...cart, newItem]); // Invalidates 'cart-total'
tree.$.products.update((products) => [...products, newProduct]); // Also invalidates 'cart-total'
tree.$.user.name.set('John'); // Does NOT invalidate 'cart-total' ✅
```

### Manual Cache Management

```typescript
// Clear specific cache entries
tree.clearMemoCache('filtered-users');

// Clear all caches
tree.clearMemoCache();
```

## Configuration options

```typescript
const tree = signalTree(state).with(
  withMemoization({
    enabled: true,
    maxCacheSize: 100, // Max cached entries
    defaultTTL: 300000, // 5 minute default TTL
    enableStats: true, // Enable cache statistics
    autoOptimize: true, // Auto-cleanup when cache is full
    debugMode: false, // Enable debug logging
    equality: 'shallow', // 'reference' | 'shallow' | 'deep'
  })
);
```

### What's New in v3.0.2

- **Optimized shallow equality algorithm**: Zero allocations per comparison, 15-25% faster
- **Preset configurations**: Quick-start presets for common use cases
- **Benchmark transparency**: Same configurations used in performance benchmarks are now publicly available

## Cache statistics

```typescript
// Get detailed cache performance metrics
const stats = tree.getCacheStats();
console.log(stats);
/*
{
  size: 15,
  totalHits: 234,
  totalMisses: 45,
  hitRatio: 0.839, // 83.9% hit ratio
  keys: ['filtered-users', 'cart-total', 'user-permissions'],
  memoryUsage: '1.2MB'
}
*/
```

## Advanced features

### TTL (Time To Live) Support

```typescript
// Cache with expiration
const expensiveData = tree.memoize(
  (state) => processLargeDataset(state.rawData),
  'processed-data',
  { ttl: 60000 } // Expires after 1 minute
);
```

### Custom Key Functions

```typescript
// Custom cache key generation
const userProjects = tree.memoize(
  (state) => getUserProjects(state.currentUserId, state.projects),
  (state) => `user-projects-${state.currentUserId}` // Custom key
);
```

### Conditional Memoization

```typescript
// Only memoize in production
const conditionalMemo = tree.memoize((state) => heavyCalculation(state.data), 'heavy-calc', { enabled: process.env['NODE_ENV'] === 'production' });
```

## Real-world examples

### E-commerce Product Filtering

```typescript
const shopTree = signalTree({
  products: [] as Product[],
  filters: {
    category: '',
    priceRange: { min: 0, max: 1000 },
    search: '',
    inStock: true,
  },
  sortBy: 'name',
}).with(withMemoization({ maxCacheSize: 50 }));

// Memoized filtering and sorting
const filteredProducts = shopTree.memoize((state) => {
  let filtered = state.products;

  if (state.filters.category) {
    filtered = filtered.filter((p) => p.category === state.filters.category);
  }

  if (state.filters.search) {
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(state.filters.search.toLowerCase()));
  }

  filtered = filtered.filter((p) => p.price >= state.filters.priceRange.min && p.price <= state.filters.priceRange.max && (!state.filters.inStock || p.stockQuantity > 0));

  return filtered.sort((a, b) => {
    switch (state.sortBy) {
      case 'price':
        return a.price - b.price;
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });
}, 'filtered-products');

// Usage in component
@Component({
  template: `
    @for (product of filteredProducts(); track product.id) {
    <product-card [product]="product" />
    }
    <div>Cache hit ratio: {{ shopTree.getCacheStats().hitRatio | percent }}</div>
  `,
})
class ProductListComponent {
  shopTree = shopTree;
  filteredProducts = filteredProducts;
}
```

### User Permissions & Role Calculations

```typescript
const authTree = signalTree({
  user: null as User | null,
  roles: [] as Role[],
  permissions: [] as Permission[],
}).with(withMemoization());

// Memoized permission checking
const userPermissions = authTree.memoize((state) => {
  if (!state.user) return [];

  const userRoles = state.roles.filter((role) => state.user!.roleIds.includes(role.id));

  return userRoles.flatMap((role) => state.permissions.filter((perm) => role.permissionIds.includes(perm.id)));
}, 'user-permissions');

const hasPermission = (permission: string) => authTree.memoize((state) => userPermissions().some((p) => p.name === permission), `has-permission-${permission}`);

// Usage
const canEditUsers = hasPermission('users.edit');
const canViewReports = hasPermission('reports.view');
```

## Debugging and optimization

### Debug Mode

```typescript
const tree = signalTree(state).with(
  withMemoization({
    debugMode: true,
    onCacheHit: (key) => console.log(`Cache HIT: ${key}`),
    onCacheMiss: (key) => console.log(`Cache MISS: ${key}`),
    onCacheInvalidate: (key) => console.log(`Cache INVALIDATED: ${key}`),
  })
);
```

### Performance Monitoring

```typescript
// Monitor cache performance over time
setInterval(() => {
  const stats = tree.getCacheStats();
  if (stats.hitRate < 0.7) {
    console.warn('Low cache hit rate:', stats.hitRate);
    // Consider reducing cache size or changing equality strategy
  }
}, 30000);
```

## Performance Measurement and Validation

### Measuring Cache Effectiveness

Monitor your cache performance to validate strategy choices:

```typescript
const tree = signalTree(state).with(withMemoization());

// Check cache statistics
const stats = tree.getCacheStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Cache size: ${stats.size} entries`);

// Thresholds for optimization:
// - Hit rate < 30%: Consider removing memoization
// - Hit rate 30-70%: Try different equality strategy
// - Hit rate > 70%: Good memoization candidate
```

### Benchmark Before and After

```typescript
// Test without memoization
const start1 = performance.now();
for (let i = 0; i < 1000; i++) {
  expensiveComputation(data);
}
const baseline = performance.now() - start1;

// Test with memoization
const memoized = memoizeShallow(expensiveComputation);
const start2 = performance.now();
for (let i = 0; i < 1000; i++) {
  memoized(data);
}
const optimized = performance.now() - start2;

console.log(`Speedup: ${(baseline / optimized).toFixed(1)}x`);
```

### Global Cache Monitoring

```typescript
import { getGlobalCacheStats } from '@signaltree/memoization';

// Monitor all caches across your application
const globalStats = getGlobalCacheStats();
console.log(`Total trees: ${globalStats.treeCount}`);
console.log(`Average cache size: ${globalStats.averageCacheSize.toFixed(1)}`);
console.log(`Total cached items: ${globalStats.totalSize}`);
```

### Red Flags to Watch For

Signs your memoization strategy needs adjustment:

```typescript
// 1. Low hit rates indicate wasted overhead
const stats = tree.getCacheStats();
if (stats.hitRate < 0.3) {
  console.warn('Low cache hit rate - consider removing memoization');
}

// 2. Large cache sizes may indicate memory leaks
if (stats.size > 1000) {
  console.warn('Large cache size - check TTL and maxCacheSize settings');
}

// 3. Performance regression on simple operations
const start = performance.now();
tree.state.simpleProperty.set('value'); // Should be < 1ms
const duration = performance.now() - start;
if (duration > 1) {
  console.warn('Memoization overhead detected on simple operations');
}
```

### A/B Testing Different Strategies

```typescript
// Test multiple strategies to find the best fit
const strategies = [
  { name: 'None', tree: signalTree(state) },
  { name: 'Lightweight', tree: signalTree(state).with(withLightweightMemoization()) },
  { name: 'Shallow', tree: signalTree(state).with(withShallowMemoization()) },
  { name: 'Deep', tree: signalTree(state).with(withMemoization()) },
];

strategies.forEach(({ name, tree }) => {
  const start = performance.now();
  // Run your typical workload
  performTypicalOperations(tree);
  const duration = performance.now() - start;
  console.log(`${name}: ${duration.toFixed(2)}ms`);
});
```

## When to use memoization

Perfect for:

- Expensive filtering and sorting operations
- Complex computed values
- Data transformations
- Permission calculations
- Search and aggregation
- Performance-critical paths

## Composition with other packages

```typescript
import { signalTree } from '@signaltree/core';
import { withMemoization } from '@signaltree/memoization';
import { withBatching } from '@signaltree/batching';
import { withDevTools } from '@signaltree/devtools';

const tree = signalTree(state).with(withBatching(), withMemoization({ maxCacheSize: 200 }), withDevTools());
```

## Measuring impact

Use the Demo app's Benchmark Orchestrator to compare cached vs. uncached computations across scenarios. Results are calibrated to your device and include distribution charts and percentiles.

### Developer Experience Benefits

| Aspect               | Without Memoization | With Memoization | **Benefit**           |
| -------------------- | ------------------- | ---------------- | --------------------- |
| Performance tuning   | Manual optimization | **Automatic**    | **Zero effort**       |
| Debugging complexity | High                | **Low**          | **Simplified**        |
| Cache management     | Manual              | **Intelligent**  | **Self-managing**     |
| Memory concerns      | High                | **Minimal**      | **Automatic cleanup** |

### Cache Efficiency & Smart Optimization

SignalTree memoization provides advanced performance features:

- **High cache hit ratios** (85-95%) in real applications
- **Memory efficient** with automatic LRU eviction
- **Path-based invalidation** reduces unnecessary cache misses
- **Pattern matching** for intelligent cache management
- **Automatic optimization** learns from usage patterns
- **Zero configuration** for 90% of use cases

## Smart Strategy Selection Guide

Choose the right memoization strategy based on your data patterns and performance needs:

### 🎯 Decision Framework

```typescript
// 1. RAPID UPDATES (values change frequently)
// ❌ DON'T: Heavy memoization when cache rarely hits
const badTree = signalTree({
  timestamp: Date.now(),
}).with(withMemoization()); // Wasted overhead!

// ✅ DO: Lightweight or no memoization
const goodTree = signalTree({
  timestamp: Date.now(),
}).with(withLightweightMemoization()); // Minimal overhead

// 2. STABLE OBJECTS (settings, preferences)
// ✅ DO: Shallow equality for primitive properties
const settingsTree = signalTree({
  user: { name: 'John', theme: 'dark', lang: 'en' },
}).with(withShallowMemoization()); // Perfect balance

// 3. COMPLEX COMPUTATIONS (expensive operations)
// ✅ DO: Deep equality for thorough comparison
const analyticsTree = signalTree({
  events: largeDataSet,
}).with(withHighPerformanceMemoization()); // Large cache, optimized

// 4. UNKNOWN PATTERNS (new features, prototypes)
// ✅ DO: Start with shallow equality (good default)
const prototypeTree = signalTree(state).with(withShallowMemoization());
```

### 📊 Performance Measurement Tools

```typescript
// Measure cache effectiveness
const tree = signalTree(state).with(withMemoization());
const stats = tree.getCacheStats();

console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Cache size: ${stats.size} entries`);

// Optimization thresholds:
if (stats.hitRate < 0.3) {
  console.log('❌ Consider removing memoization - low hit rate');
} else if (stats.hitRate > 0.7) {
  console.log('✅ Good memoization candidate - high hit rate');
} else {
  console.log('⚡ Try different equality strategy');
}
```

### 🎯 Benchmark-Specific Strategies

Based on SignalTree performance analysis, here's when to use memoization:

```typescript
// Hot paths: Values change rapidly - minimal overhead
const rapidTree = signalTree(state).with(withLightweightMemoization());

// Deep nested: Object properties change occasionally
const nestedTree = signalTree(state).with(withShallowMemoization());

// Array mutations: Values always change - skip memoization
const arrayTree = signalTree({ items: [] }); // No memoization

// Complex selectors: Let Angular computed() handle it
const tree = signalTree(state);
const complexSelector = computed(() => tree.state.data().filter(/* complex logic */));
```

The choice of equality strategy fundamentally impacts performance:

```typescript
// Reference equality (fastest) - only for immutable data
equality: 'reference'; // ~1-2μs per comparison

// Shallow equality (balanced) - good for objects with primitives
equality: 'shallow'; // ~5-15μs per comparison

// Deep equality (thorough) - when structure matters
equality: 'deep'; // ~50-200μs per comparison
```

### Benchmark-Specific Recommendations

Different scenarios need different memoization strategies:

```typescript
// Rapid Sequential Updates - values constantly change
// Use minimal or no memoization to avoid cache overhead
const rapidUpdatesTree = signalTree({
  counters: Array.from({ length: 50 }, () => ({ value: 0 })),
}).with(withLightweightMemoization()); // Reference equality, no overhead

// Deep Nested Updates - structure matters but changes slowly
const nestedTree = signalTree({
  user: { profile: { settings: { theme: 'dark' } } },
}).with(withShallowMemoization()); // Good balance for object updates

// Array Mutations - values always change
// Skip memoization entirely, let core signals handle updates
const arrayTree = signalTree({
  items: [] as Item[],
}); // No memoization - direct mutations invalidate cache anyway

// Computed Selectors - expensive calculations, stable inputs
const selectorTree = signalTree({
  data: [] as DataPoint[],
}).with(withHighPerformanceMemoization()); // Large cache, shallow equality
```

### Performance-Critical Scenarios

#### Hot Path Optimization

For code that runs hundreds of times per second:

```typescript
import { withLightweightMemoization } from '@signaltree/memoization';

const realTimeTree = signalTree({
  metrics: { cpu: 0, memory: 0, network: 0 },
}).with(withLightweightMemoization());

// Configuration optimizes for speed:
// - Reference equality only (1-2μs vs 50-200μs for deep)
// - No LRU tracking overhead
// - No TTL timestamp checks
// - Small cache (100 entries) for minimal management
```

#### Memory-Constrained Environments

```typescript
const mobileTree = signalTree(state).with(
  withMemoization({
    maxCacheSize: 50, // Small memory footprint
    ttl: 30000, // 30-second expiration
    equality: 'reference', // Fastest comparison
    enableLRU: false, // No tracking overhead
  })
);
```

#### High-Throughput Processing

```typescript
const batchTree = signalTree(state).with(
  withMemoization({
    maxCacheSize: 10000, // Large cache for batch processing
    equality: 'shallow', // Good performance/correctness balance
    ttl: undefined, // No expiration overhead
    enableLRU: true, // Sophisticated cache management
  })
);
```

### When NOT to Use Memoization

Avoid memoization when:

- Values change on every access (cache hit rate < 20%)
- Simple computations (faster than cache lookup)
- Memory is extremely constrained
- Working with constantly mutating arrays

```typescript
// BAD: Memoizing rapidly changing values
const badTree = signalTree({
  timestamp: Date.now(),
}).with(withMemoization()); // Cache never hits!

// GOOD: Let signals handle direct updates
const goodTree = signalTree({
  timestamp: Date.now(),
}); // Direct signal updates are already optimized
```

### Lightweight Memoization for Critical Paths

For performance-critical scenarios where speed is more important than cache sophistication:

```typescript
import { withLightweightMemoization } from '@signaltree/memoization';

const tree = signalTree({
  realTimeData: [] as DataPoint[],
}).with(withLightweightMemoization());

// Optimized for maximum speed:
// - Reference equality only (fastest comparison)
// - No LRU tracking overhead
// - No TTL timestamp checks
// - Smaller cache size to reduce management overhead
```

### Shallow Equality Memoization

For objects with primitive values where deep equality is unnecessary:

```typescript
import { withShallowMemoization } from '@signaltree/memoization';

const tree = signalTree({
  userPreferences: { theme: 'dark', language: 'en' },
  settings: { autoSave: true, notifications: false },
}).with(withShallowMemoization());

// Balanced approach:
// - Shallow equality (faster than deep, safer than reference)
// - Reasonable cache management overhead
// - Good for objects with primitive properties
```

### High-Performance Memoization

For applications with abundant memory and complex computations:

```typescript
import { withHighPerformanceMemoization } from '@signaltree/memoization';

const tree = signalTree({
  largeDatasets: [] as ComplexData[],
}).with(withHighPerformanceMemoization());

// Maximizes cache effectiveness:
// - Large cache size (10,000 entries)
// - Shallow equality for speed
// - 5-minute TTL
// - Full LRU management
```

### Standalone Memoization Functions

For memoizing individual functions outside of SignalTree:

```typescript
import { memoizeShallow, memoizeReference } from '@signaltree/memoization';

// Shallow equality memoization
const expensiveComputation = memoizeShallow((data: UserData) => {
  return computeUserMetrics(data);
});

// Reference equality memoization (fastest)
const simpleTransform = memoizeReference((input: string) => {
  return input.toUpperCase();
});
```

## Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Memoization Examples](https://signaltree.io/examples/memoization)

## License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

Improve performance with intelligent caching.
