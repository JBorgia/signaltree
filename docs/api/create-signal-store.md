# createSignalStore() API Reference

## Overview

Creates signals using the signal-store pattern for perfect type inference. This function eagerly converts all object properties into Angular signals at creation time.

## Signature

```typescript
function createSignalStore<T>(obj: T, equalityFn: (a: unknown, b: unknown) => boolean): DeepSignalify<T>;
```

## Parameters

- **`obj`** - The object to convert to signals
- **`equalityFn`** - Function to compare values for equality (e.g., `Object.is`, `equal`)

## Returns

A deeply signalified version maintaining exact type structure where:

- Primitive values become `WritableSignal<T>`
- Nested objects become recursively signalified
- Arrays and built-in objects become signals

## How It Works

1. **Immediate Creation**: Walks through entire object structure and creates signals for every property immediately
2. **Recursive Processing**: For nested objects, recursively calls itself to create nested signal structures
3. **Type Preservation**: Maintains exact TypeScript type relationships through `DeepSignalify<T>`
4. **Built-in Object Detection**: Handles Date, RegExp, Map, Set, functions, etc. as primitive signals
5. **Safety**: Never double-wraps existing signals, includes error handling with rollback

## Examples

### Basic Usage

```typescript
const store = createSignalStore(
  {
    user: { name: 'John', age: 30 },
    settings: { theme: 'dark' },
  },
  Object.is
);

// Perfect type inference maintained throughout
store.user.name.set('Jane');
console.log(store.settings.theme()); // 'dark'
```

### With Custom Equality

```typescript
const store = createSignalStore(state, equal); // Deep equality
const shallowStore = createSignalStore(state, Object.is); // Reference equality
```

## Performance Characteristics

- **Memory**: Higher upfront memory usage since all signals are created immediately
- **Access Speed**: Faster property access since signals already exist
- **Best For**: Smaller objects or when most properties will be accessed
- **Initialization**: Slower initial creation time for large objects

## Built-in Object Handling

The following types are treated as primitives and wrapped in signals directly:

- `Date`, `RegExp`, `Function`
- `Map`, `Set`, `WeakMap`, `WeakSet`
- `ArrayBuffer`, `DataView`, `Error`, `Promise`
- `URL`, `URLSearchParams`, `FormData`, `Blob`, `File`

## Error Handling

- Validates input is not null/undefined
- Handles primitive values by returning single signal
- Graceful fallback for problematic nested objects
- Comprehensive error messages for debugging

## See Also

- [createLazySignalTree()](./create-lazy-signal-tree.md) - On-demand alternative
- [Performance Comparison](../performance.md#eager-vs-lazy)
- [Type System](../core-concepts.md#type-system)
