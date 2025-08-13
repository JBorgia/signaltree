# createLazySignalTree() API Reference

## Overview

Creates a lazy signal tree using JavaScript Proxy for on-demand signal creation. Only creates signals when properties are first accessed, providing massive memory savings for large state objects.

## Signature

```typescript
function createLazySignalTree<T extends object>(obj: T, equalityFn: (a: unknown, b: unknown) => boolean, basePath?: string): DeepSignalify<T>;
```

## Parameters

- **`obj`** - Source object to lazily signalify
- **`equalityFn`** - Equality function for signal comparison
- **`basePath`** - Base path for nested objects (internal use)

## Returns

Proxied object that creates signals on first access with `__cleanup__` method for memory management.

## How It Works

1. **Proxy-Based**: Uses JavaScript Proxy to intercept property access
2. **On-Demand Creation**: Only creates signals when properties are first accessed
3. **LRU Caching**: Uses Maps to cache created signals and nested proxies
4. **Path-Based**: Tracks property paths for nested access (e.g., "user.profile.name")
5. **Cleanup Management**: Provides `__cleanup__` method to prevent memory leaks
6. **Memory Management**: Uses LRU cache with configurable limits

## Examples

### Basic Usage

```typescript
const lazyTree = createLazySignalTree(
  {
    user: { name: 'John', profile: { bio: 'Developer' } },
    settings: { theme: 'dark', notifications: true },
    large: {
      /* thousands of properties */
    },
  },
  equal
);

// No signals created yet - just proxy setup

// First access creates the signal
const nameSignal = lazyTree.user.name; // Signal created here
nameSignal.set('Jane');

// Nested access creates path-based signals
const bioSignal = lazyTree.user.profile.bio; // Creates nested proxy + signal
```

### Memory Management

```typescript
const lazyTree = createLazySignalTree(largeObject, equal);

// Use the tree...
lazyTree.some.deep.nested.property.set('value');

// Clean up when done
if (typeof lazyTree.__cleanup__ === 'function') {
  lazyTree.__cleanup__();
}
```

## Performance Characteristics

- **Memory**: Lower initial memory usage, grows as properties are accessed
- **Access Speed**: Slower first access (proxy + signal creation), fast subsequent access
- **Best For**: Large objects where only subset of properties will be accessed
- **Initialization**: Very fast initial creation time

## Cache Management

### LRU Strategy

- Uses `Map` with LRU eviction for signal caching
- Configurable cache size (default: 1000 entries)
- Automatic cleanup of least recently used signals

### Path-Based Caching

```typescript
// Each access creates path-based cache entry
lazyTree.user.name; // Cached as "user.name"
lazyTree.user.profile.bio; // Cached as "user.profile.bio"
```

## Cleanup and Memory Safety

### Automatic Cleanup

```typescript
const tree = createLazySignalTree(obj, equal);

// Cleanup all nested proxies and caches
tree.__cleanup__();
// - Clears signal cache
// - Clears nested proxy cache
// - Calls cleanup on all nested proxies
```

### Memory Leak Prevention

- Uses `Map` instead of `WeakMap` for controlled cleanup
- Tracks nested proxy cleanup functions
- Graceful error handling during cleanup

## Built-in Object Detection

Same as `createSignalStore` - the following are treated as primitives:

- `Date`, `RegExp`, `Function`
- `Map`, `Set`, `WeakMap`, `WeakSet`
- `ArrayBuffer`, `DataView`, `Error`, `Promise`
- `URL`, `URLSearchParams`, `FormData`, `Blob`, `File`

## Proxy Behavior

### Property Access

- Handles symbol properties normally
- Supports inspection methods (`valueOf`, `toString`)
- Creates signals/proxies on-demand for object properties
- Returns `undefined` for non-existent properties

### Property Setting

- Updates original object
- Updates cached signal if exists
- Clears nested proxy cache if type changes
- Graceful error handling

## When to Use vs createSignalStore

| Use `createLazySignalTree` when: | Use `createSignalStore` when:  |
| -------------------------------- | ------------------------------ |
| Large objects (>100 properties)  | Small objects (<50 properties) |
| Only accessing subset of data    | Accessing most properties      |
| Memory is a concern              | Speed is critical              |
| Runtime object exploration       | Static usage patterns          |

## See Also

- [createSignalStore()](./create-signal-store.md) - Eager alternative
- [Performance Comparison](../performance.md#eager-vs-lazy)
- [Memory Management](../core-concepts.md#memory-management)
