# @signaltree/enterprise

Enterprise-grade optimizations for SignalTree. Designed for large-scale applications with 500+ signals and high-frequency bulk updates.

## Features

- **Diff-based updates** - Only update signals that actually changed
- **Bulk operation optimization** - 2-5x faster for large state updates
- **Advanced change tracking** - Detailed statistics and monitoring
- **Path indexing** - Optimized signal lookup for large trees
- **Lazy initialization** - Zero overhead until first use

## Installation

```bash
npm install @signaltree/core @signaltree/enterprise
```

## Quick Start

```typescript
import { signalTree } from '@signaltree/core';
import { withEnterprise } from '@signaltree/enterprise';

const tree = signalTree(largeState).with(withEnterprise());

// Use optimized bulk updates
const result = tree.updateOptimized(newData, {
  ignoreArrayOrder: true,
  maxDepth: 10,
});

console.log(result.stats);
// { totalChanges: 45, adds: 10, updates: 30, deletes: 5 }
```

## When to Use

### ✅ Use @signaltree/enterprise when:

- You have 500+ signals in your state tree
- Bulk updates happen at high frequency (60Hz+)
- You need real-time dashboards or data feeds
- You're building enterprise-scale applications
- You need detailed update monitoring and statistics

### ❌ Skip @signaltree/enterprise when:

- Small to medium apps (<100 signals)
- Infrequent state updates
- Startup/prototype projects
- Bundle size is critical (adds +2.4KB gzipped)

## API

### `withEnterprise()`

Enhancer that adds enterprise optimizations to a SignalTree.

```typescript
import { signalTree } from '@signaltree/core';
import { withEnterprise } from '@signaltree/enterprise';

const tree = signalTree(initialState).with(withEnterprise());
```

### `tree.updateOptimized(updates, options?)`

Performs optimized bulk updates using diff-based change detection.

**Parameters:**

- `updates: Partial<T>` - The new state values
- `options?: UpdateOptions` - Configuration options

**Options:**

```typescript
{
  maxDepth?: number;              // Maximum depth to traverse (default: 100)
  ignoreArrayOrder?: boolean;     // Ignore array element order (default: false)
  equalityFn?: (a, b) => boolean; // Custom equality function
  autoBatch?: boolean;            // Automatically batch updates (default: true)
  batchSize?: number;             // Patches per batch (default: 10)
}
```

**Returns:**

```typescript
{
  changed: boolean; // Whether any changes were made
  stats: {
    totalChanges: number; // Total number of changes
    adds: number; // New properties added
    updates: number; // Properties updated
    deletes: number; // Properties deleted
  }
}
```

### `tree.getPathIndex()`

Get the PathIndex for debugging/monitoring. Returns `null` if `updateOptimized` hasn't been called yet (lazy initialization).

```typescript
const index = tree.getPathIndex();
if (index) {
  console.log('Path index active');
}
```

## Examples

### Real-time Dashboard

```typescript
import { signalTree } from '@signaltree/core';
import { withEnterprise } from '@signaltree/enterprise';

interface DashboardState {
  metrics: Record<string, number>;
  alerts: Alert[];
  users: User[];
  // ... hundreds more properties
}

const dashboard = signalTree<DashboardState>(initialState).with(withEnterprise());

// High-frequency updates from WebSocket
socket.on('metrics', (newMetrics) => {
  const result = dashboard.updateOptimized({ metrics: newMetrics }, { ignoreArrayOrder: true });

  console.log(`Updated ${result.stats.updates} metrics`);
});
```

### Data Grid with Bulk Operations

```typescript
import { signalTree } from '@signaltree/core';
import { withEnterprise } from '@signaltree/enterprise';

const grid = signalTree({
  rows: [] as GridRow[],
  columns: [] as GridColumn[],
  filters: {} as FilterState,
  selection: new Set<string>(),
}).with(withEnterprise());

// Bulk update from API
async function loadData() {
  const data = await fetchGridData();

  const result = grid.updateOptimized(data, {
    maxDepth: 5,
    autoBatch: true,
  });

  console.log(`Loaded ${result.stats.adds} rows in bulk`);
}
```

### Custom Equality for Complex Objects

```typescript
const tree = signalTree(complexState).with(withEnterprise());

tree.updateOptimized(newState, {
  equalityFn: (a, b) => {
    // Custom deep equality for specific object types
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    return a === b;
  },
});
```

## Performance

**Bundle Size:**

- Adds +2.4KB gzipped to your bundle
- Zero overhead until first `updateOptimized()` call (lazy initialization)

**Performance Gains:**

- 2-5x faster for bulk updates on large state trees
- Scales efficiently with tree depth and complexity
- Minimal memory overhead with path indexing

## License

Business Source License 1.1 (BSL-1.1) - See [LICENSE](../../LICENSE) for details.

Converts to MIT license on the Change Date specified in the license.

## Related Packages

- [@signaltree/core](../core) - Core SignalTree functionality
- [@signaltree/ng-forms](../ng-forms) - Angular forms integration
- [@signaltree/callable-syntax](../callable-syntax) - Callable syntax transform
