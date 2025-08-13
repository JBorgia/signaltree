# signalTree() API Reference

## Overview

Creates a reactive signal tree with smart progressive enhancement and recursive typing support.

## Signatures

```typescript
// Basic usage - works with ANY type
function signalTree<T>(obj: T): SignalTree<T>;

// With preset configuration
function signalTree<T>(obj: T, preset: TreePreset): SignalTree<T>;

// With custom configuration
function signalTree<T>(obj: T, config: TreeConfig): SignalTree<T>;
```

## Parameters

- **`obj`** - The initial state object to convert into a reactive tree
- **`preset`** (optional) - Preset configuration ('basic', 'performance', 'development', 'production')
- **`config`** (optional) - Custom configuration object

## Returns

A `SignalTree<T>` with the following properties:

- `state` - The signalified state object
- `$` - Alias for state (shorthand access)
- `unwrap()` - Convert back to plain JavaScript object
- `update()` - Update state using an updater function
- `pipe()` - Compose with additional features

## Basic Examples

### Simple State

```typescript
const tree = signalTree({
  count: 0,
  user: { name: 'John', age: 30 },
});

// Access signals
console.log(tree.$.count()); // 0
tree.$.user.name.set('Jane');

// Update entire state
tree.update((state) => ({ count: state.count + 1 }));
```

### Maximum Flexibility

```typescript
// Works with ANY object type - no constraints!
const tree = signalTree({
  data: [1, 2, 3],
  metadata: new Map(),
  fn: () => 'hello',
  symbol: Symbol('id'),
  date: new Date(),
});
```

### Configuration Options

```typescript
const tree = signalTree(state, {
  useLazySignals: false, // Use eager signal creation
  useShallowComparison: true, // Use Object.is instead of deep equality
  treeName: 'MyApp', // Name for debugging
});
```

## Advanced Usage

### Composition with Pipe

```typescript
const enhancedTree = tree.pipe(withBatching(), withMemoization(), withTimeTravel());
```

### Performance Optimization

```typescript
// Automatic strategy selection based on object size
const smallTree = signalTree(smallObject); // Uses lazy signals
const largeTree = signalTree(largeObject); // Uses eager signals
```

## Type Safety

SignalTree maintains complete TypeScript type inference:

```typescript
const tree = signalTree({
  user: { name: 'John', settings: { theme: 'dark' } },
  todos: [] as Todo[],
});

// Full type inference maintained
tree.$.user.name.set('Jane'); // ✅ string
tree.$.user.settings.theme.set('light'); // ✅ string
tree.$.todos.set([...todos, newTodo]); // ✅ Todo[]
```

## See Also

- [Core Concepts](../core-concepts.md)
- [Configuration Guide](../configuration.md)
- [Performance Tips](../performance.md)
- [Examples](../examples/)
