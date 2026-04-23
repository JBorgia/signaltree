# @signaltree/enterprise

Enterprise-grade optimizations for SignalTree. Designed for large-scale applications with 500+ signals and high-frequency bulk updates.

## Features

- **Diff-based updates** - Only update signals that actually changed
- **Bulk operation optimization** - 2-5x faster for large state updates
- **Advanced change tracking** - Detailed statistics and monitoring
- **Path-change subscriptions** - React to specific dot-paths changing (9.1+)
- **Snapshot / restore** - Cheap structured-clone snapshots with diff-engine restore (9.1+)
- **Auto-optimize threshold** - Route large updates through the diff engine automatically (9.1+)
- **Lazy initialization** - Zero overhead until first use

## Installation

```bash
npm install @signaltree/core @signaltree/enterprise
```

## Type Definitions

Type declarations are shipped as `src/**/*.d.ts` and referenced by the package exports.
No extra build step is needed to consume types.

## Quick Start

```typescript
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

const tree = signalTree(largeState).with(enterprise());

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

### `enterprise(options?)`

Enhancer that adds enterprise optimizations to a SignalTree.

```typescript
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

const tree = signalTree(initialState).with(enterprise());

// Or with auto-optimize threshold (9.1+):
const tree2 = signalTree(initialState).with(
  enterprise({ autoOptimizeThreshold: 100 })
);
```

**Options (9.1+):**

```typescript
{
  autoOptimizeThreshold?: number; // If set, tree.updateAuto(...) routes through
                                  // updateOptimized when the payload has at
                                  // least this many top-level keys.
}
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

> **Deprecated (9.1+):** Path-index access is an internal detail and will be
> removed in a future major. Use `onPathChange` for change observation.

Get the PathIndex for debugging/monitoring. Returns `null` if `updateOptimized` hasn't been called yet (lazy initialization).

```typescript
const index = tree.getPathIndex();
if (index) {
  console.log('Path index active');
}
```

### `tree.onPathChange(listener)` (9.1+)

Subscribe to dot-paths that change on each `updateOptimized` (or
`updateAuto` when it routes through the diff engine). Returns an
unsubscribe function.

```typescript
const off = tree.onPathChange((paths) => {
  console.log('changed:', paths); // e.g. ['user.name', 'cart.items.0.qty']
});

tree.updateOptimized({ user: { name: 'Ada' } });
// → listener fires with ['user.name']

off(); // stop listening
```

### `tree.snapshot()` / `tree.restore(snap)` (9.1+)

Capture and restore the entire state via a `structuredClone`. `restore`
routes through the diff engine, so listeners and stats fire as if the
restored values were a normal optimized update.

```typescript
const snap = tree.snapshot();

tree.updateOptimized({ user: { name: 'Grace' } });

// later... roll back
tree.restore(snap);
```

### `tree.updateAuto(updates)` (9.1+)

When `enterprise({ autoOptimizeThreshold: N })` is configured, payloads
with `≥ N` top-level keys are routed through `updateOptimized`; smaller
payloads use the regular fast path. Without a threshold this is a plain
`update`.

```typescript
const tree = signalTree(initialState).with(
  enterprise({ autoOptimizeThreshold: 50 })
);

tree.updateAuto({ a: 1, b: 2 });          // fast path
tree.updateAuto(largeServerPayload);      // diff engine
```

## Examples

### Real-time Dashboard

```typescript
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

interface DashboardState {
  metrics: Record<string, number>;
  alerts: Alert[];
  users: User[];
  // ... hundreds more properties
}

const dashboard = signalTree<DashboardState>(initialState).with(enterprise());

// High-frequency updates from WebSocket
socket.on('metrics', (newMetrics) => {
  const result = dashboard.updateOptimized({ metrics: newMetrics }, { ignoreArrayOrder: true });

  console.log(`Updated ${result.stats.updates} metrics`);
});
```

### Data Grid with Bulk Operations

```typescript
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

const grid = signalTree({
  rows: [] as GridRow[],
  columns: [] as GridColumn[],
  filters: {} as FilterState,
  selection: new Set<string>(),
}).with(enterprise());

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
const tree = signalTree(complexState).with(enterprise());

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
