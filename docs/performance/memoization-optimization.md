# Memoization Performance Optimization Guide

This guide covers how to choose the right memoization strategy for optimal SignalTree performance.

## Quick Reference: Equality Strategy Performance

| Strategy    | Speed  | Use Case                  | Cache Hit Rate | Memory |
| ----------- | ------ | ------------------------- | -------------- | ------ |
| `reference` | ⚡⚡⚡ | Immutable data, hot paths | High if stable | Low    |
| `shallow`   | ⚡⚡   | Objects with primitives   | Medium-High    | Medium |
| `deep`      | ⚡     | Complex nested objects    | Variable       | High   |

## Strategy Selection Framework

### 1. Hot Path Optimization (>100 calls/second)

**Use: `withLightweightMemoization()` or no memoization**

```typescript
// For rapid sequential updates
const realtimeTree = signalTree({
  metrics: { cpu: 0, memory: 0, requests: 0 },
}).with(withLightweightMemoization());

// Configuration: reference equality, no LRU, no TTL, small cache
```

**Why**: Cache overhead (5-15μs) can exceed computation time for simple operations.

### 2. Stable Object Updates

**Use: `withShallowMemoization()`**

```typescript
// For user preferences, settings, form data
const settingsTree = signalTree({
  user: { id: 1, name: 'John', theme: 'dark' },
  preferences: { autoSave: true, notifications: false },
}).with(withShallowMemoization());
```

**Why**: Objects change infrequently, shallow equality is sufficient and fast.

### 3. Complex Computations

**Use: `withHighPerformanceMemoization()`**

```typescript
// For expensive filtering, sorting, aggregations
const analyticsTree = signalTree({
  events: [] as AnalyticsEvent[],
  filters: { date: '2025-01', category: 'sales' },
}).with(withHighPerformanceMemoization());
```

**Why**: Large cache justifies overhead for expensive operations.

## Benchmark-Specific Optimizations

Based on SignalTree benchmark analysis:

### Rapid Sequential Updates

```typescript
// DON'T: Memoization adds overhead when values always change
import { withMemoization } from '@signaltree/core';
const rapidTree = signalTree({
  counters: Array.from({ length: 50 }, () => ({ value: 0 })),
}).with(withMemoization()); // ❌ Cache never hits

// DO: Use lightweight or no memoization
const optimizedTree = signalTree({
  counters: Array.from({ length: 50 }, () => ({ value: 0 })),
}).with(withLightweightMemoization()); // ✅ Minimal overhead
```

### Array Mutations

```typescript
// DON'T: Memoize when arrays are constantly mutated
const arrayTree = signalTree({
  items: [] as Item[],
}).with(withMemoization()); // ❌ Every mutation invalidates cache

// DO: Let signals handle direct updates
const directTree = signalTree({
  items: [] as Item[],
}); // ✅ Direct signal updates are already optimized
```

### Deep Nested Updates

```typescript
// DO: Use shallow equality for object properties
import { withShallowMemoization } from '@signaltree/core';
const nestedTree = signalTree({
  user: {
    profile: { settings: { theme: 'dark', lang: 'en' } },
  },
}).with(withShallowMemoization()); // ✅ Balances speed and correctness
```

### Computed Selectors

```typescript
// DO: Let Angular's computed() handle memoization
const tree = signalTree({ items: [] as Item[] });

const expensiveSelector = computed(() =>
  tree.state
    .items()
    .filter((item) => item.active)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 10)
); // ✅ Angular's computed is already optimized
```

## Performance Measurement

### Validate Your Strategy

```typescript
// Measure cache effectiveness
const stats = tree.getCacheStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);

// Decision thresholds:
if (stats.hitRate < 0.3) {
  // Remove memoization - overhead not justified
} else if (stats.hitRate > 0.7) {
  // Good candidate - consider upgrading to more sophisticated strategy
}
```

### Before/After Benchmarking

```typescript
// Test your specific workload
const strategies = [
  { name: 'None', create: () => signalTree(state) },
  { name: 'Lightweight', create: () => signalTree(state).with(withLightweightMemoization()) },
  { name: 'Shallow', create: () => signalTree(state).with(withShallowMemoization()) },
];

strategies.forEach(({ name, create }) => {
  const tree = create();
  const start = performance.now();

  // Your typical operations
  runTypicalWorkload(tree);

  const duration = performance.now() - start;
  console.log(`${name}: ${duration.toFixed(2)}ms`);
});
```

## Common Anti-Patterns

### ❌ Over-Memoizing Hot Paths

```typescript
// Bad: Complex memoization for simple, frequent operations
const badTree = signalTree({
  timestamp: Date.now(),
}).with(withMemoization({ equality: 'deep' })); // Overhead > benefit
```

### ❌ Under-Memoizing Expensive Operations

```typescript
// Bad: No memoization for expensive filtering
const expensiveTree = signalTree({
  data: largeDataset,
}); // No caching of expensive computations
```

### ❌ Wrong Equality Strategy

```typescript
// Bad: Deep equality for objects with only primitive values
const settingsTree = signalTree({
  theme: 'dark',
  language: 'en',
}).with(withMemoization({ equality: 'deep' })); // Unnecessary complexity
```

## Memory Management

### Large Applications

```typescript
// Limit cache sizes in memory-constrained environments
const mobileTree = signalTree(state).with(
  withMemoization({
    maxCacheSize: 50,
    ttl: 30000,
    enableLRU: true,
  })
);
```

### Development vs Production

```typescript
// More aggressive caching in production
import { withHighPerformanceMemoization, withLightweightMemoization } from '@signaltree/core';
const productionTree = signalTree(state).with(isProduction ? withHighPerformanceMemoization() : withLightweightMemoization());
```

## Related Documentation

- [Core Enhancers Reference](../../packages/core/README.md#6-enhancers-and-composition) - Complete API reference
- [Performance Metrics](./metrics.md) - Measurement methodology
- [Bundle Optimization](./bundle-optimization.md) - Size optimization techniques

## TL;DR Quick Decisions

1. **Hot paths (>100 ops/sec)**: `withLightweightMemoization()` or none
2. **Settings/preferences**: `withShallowMemoization()`
3. **Expensive computations**: `withHighPerformanceMemoization()`
4. **Constantly changing data**: No memoization
5. **Angular computed()**: Let Angular handle it
6. **When in doubt**: Measure cache hit rate
