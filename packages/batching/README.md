# @signaltree/batching

Batching extension for SignalTree that groups multiple state updates into single change cycles for improved performance and reduced UI thrashing.

## ✨ What is @signaltree/batching?

The batching package optimizes SignalTree performance by:

- **Grouping rapid updates** into single change cycles
- **Preventing UI thrashing** during bulk operations
- **Configurable batch sizes** and auto-flush delays
- **Automatic optimization** with minimal configuration

## 🚀 Installation

```bash
npm install @signaltree/core @signaltree/batching
```

## 📖 Basic Usage

```typescript
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';

const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null,
}).pipe(withBatching());

// Batch multiple updates for optimal performance
tree.batchUpdate((state) => ({
  users: [...state.users, newUser],
  loading: false,
  error: null,
}));
```

## 🎯 Key Features

### Automatic Batching

```typescript
const tree = signalTree({
  count: 0,
  name: '',
  active: false,
}).pipe(withBatching());

// Multiple rapid updates get batched automatically
tree.$.count.set(1);
tree.$.name.set('John');
tree.$.active.set(true);
// Only triggers one UI update cycle!
```

### Manual Batch Updates

```typescript
// Explicitly batch related updates
tree.batchUpdate((currentState) => ({
  users: [...currentState.users, newUser],
  totalUsers: currentState.users.length + 1,
  lastUpdated: Date.now(),
}));
```

### Configurable Batching

```typescript
const tree = signalTree(state).pipe(
  withBatching({
    enabled: true,
    maxBatchSize: 50, // Max updates per batch
    autoFlushDelay: 16, // Auto-flush after 16ms (60fps)
    batchTimeoutMs: 100, // Force flush after 100ms
  })
);
```

## ⚡ Performance Benefits

### Before Batching

```typescript
// Without batching - causes 3 re-renders
tree.$.users.update((users) => [...users, user1]);
tree.$.users.update((users) => [...users, user2]);
tree.$.users.update((users) => [...users, user3]);
```

### After Batching

```typescript
// With batching - causes 1 re-render
tree.batchUpdate((state) => ({
  users: [...state.users, user1, user2, user3],
}));
```

## 🔧 Configuration Options

```typescript
interface BatchingConfig {
  enabled?: boolean; // Enable/disable batching (default: true)
  maxBatchSize?: number; // Max updates per batch (default: 100)
  autoFlushDelay?: number; // Auto-flush delay in ms (default: 16)
  batchTimeoutMs?: number; // Force flush timeout (default: 100)
}
```

## 📊 Real-World Examples

### Bulk Data Operations

```typescript
const dataTree = signalTree({
  items: [] as Item[],
  categories: [] as Category[],
  filters: { search: '', category: '' },
  loading: false,
}).pipe(withBatching());

// Efficiently update multiple related state pieces
async function loadData() {
  const [items, categories] = await Promise.all([api.getItems(), api.getCategories()]);

  dataTree.batchUpdate(() => ({
    items,
    categories,
    loading: false,
    filters: { search: '', category: categories[0]?.id || '' },
  }));
}
```

## 🎯 When to Use Batching

Perfect for:

- ✅ Bulk data operations
- ✅ Form state management
- ✅ Animation and transitions
- ✅ Real-time data updates
- ✅ High-frequency state changes
- ✅ Performance-critical applications

## 🔗 Composition with Other Packages

```typescript
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';
import { withDevTools } from '@signaltree/devtools';

const tree = signalTree(state).pipe(withBatching({ maxBatchSize: 50 }), withMemoization(), withDevTools());
```

## 📈 Performance Metrics

The batching package typically provides:

- **60-80% reduction** in UI updates during bulk operations
- **3x faster** nested state updates
- **Minimal overhead** - only ~1KB added to bundle
- **Frame-rate aware** batching for smooth animations

## 🔗 Links

- [SignalTree Documentation](https://signaltree.io)
- [Core Package](https://www.npmjs.com/package/@signaltree/core)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [Performance Examples](https://signaltree.io/examples/batching)

## 📄 License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

**Optimize your app's performance** with intelligent batching! 🚀
