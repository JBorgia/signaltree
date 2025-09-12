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
tree.clearCache('filtered-users');

// Clear all caches
tree.clearCache();

// Pattern-based invalidation (glob patterns)
tree.invalidatePattern('user.*'); // Clears all user-related caches
tree.invalidatePattern('cart*'); // Clears all cart-related caches

// Smart optimization (removes least frequently used)
tree.optimize();
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
  })
);
```

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
  if (stats.hitRatio < 0.7) {
    console.warn('Low cache hit ratio:', stats.hitRatio);
    tree.optimize(); // Clean up least used entries
  }
}, 30000);
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

## Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Memoization Examples](https://signaltree.io/examples/memoization)

## License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

Improve performance with intelligent caching.
