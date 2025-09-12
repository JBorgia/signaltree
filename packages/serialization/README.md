# @signaltree/serialization

Advanced state serialization, persistence, and SSR support for SignalTree with auto-save functionality and custom storage adapters.

## Features

- Advanced serialization: Handles complex types (Date, RegExp, Map, Set) with circular reference support
- Auto-save persistence: Debounced automatic state persistence with configurable intervals
- Multiple storage adapters: localStorage, sessionStorage, IndexedDB, and custom storage backends
- SSR compatibility: Server-side rendering support with hydration
- Snapshot management: Point-in-time state capture and restoration
- Circular reference handling for complex object graphs
- Performance optimized: Efficient serialization designed for low overhead
- Compact bundle: Advanced persistence in ~4.62KB gzipped

## Quick start

### Installation

```bash
npm install @signaltree/serialization @signaltree/core
```

### Basic serialization

```typescript
import { signalTree } from '@signaltree/core';
import { withSerialization } from '@signaltree/serialization';

const tree = signalTree({
  user: { name: 'John', age: 30 },
  settings: { theme: 'dark', language: 'en' },
}).with(withSerialization());

// Serialize current state
const serializedData = tree.serialize();

// Deserialize data
tree.deserialize(serializedData);

// Convert to/from plain objects
const plainObject = tree.toJSON();
tree.fromJSON(plainObject);

// Create snapshots
const snapshot = tree.snapshot();
tree.restore(snapshot);
```

### Auto-save persistence

```typescript
import { signalTree } from '@signaltree/core';
import { withPersistence } from '@signaltree/serialization';

const tree = signalTree({
  preferences: { theme: 'light' },
  userData: { profile: { name: '' } },
}).with(
  withPersistence({
    key: 'app-state',
    autoSave: true, // Enable auto-save
    debounceMs: 1000, // Save after 1 second of inactivity
    autoLoad: true, // Auto-load on creation
  })
);

// State changes automatically trigger saves
tree.$.preferences.theme.set('dark'); // Automatically saved after 1 second

// Manual persistence operations
await tree.save(); // Manual save
await tree.load(); // Manual load
await tree.clear(); // Clear storage
```

### IndexedDB for large state

```typescript
import { createIndexedDBAdapter, withPersistence } from '@signaltree/serialization';

const indexedDBAdapter = createIndexedDBAdapter('MyAppDB', 'states');

const tree = signalTree({
  largeData: {
    /* complex state */
  },
}).with(
  withPersistence({
    key: 'large-app-state',
    storage: indexedDBAdapter,
    autoSave: true,
  })
);
```

### Custom storage adapter

```typescript
import { createStorageAdapter, withPersistence } from '@signaltree/serialization';

// Example: Firebase storage adapter
const firebaseAdapter = createStorageAdapter(
  // Read function
  async (key: string) => {
    const doc = await firebase.firestore().collection('states').doc(key).get();
    return doc.exists ? doc.data()?.state || null : null;
  },
  // Write function
  async (key: string, data: string) => {
    await firebase.firestore().collection('states').doc(key).set({ state: data });
  },
  // Delete function
  async (key: string) => {
    await firebase.firestore().collection('states').doc(key).delete();
  }
);

const tree = signalTree({
  cloudData: {
    /* state synced to Firebase */
  },
}).with(
  withPersistence({
    key: 'firebase-state',
    storage: firebaseAdapter,
  })
);
```

## Advanced configuration

### Serialization Options

```typescript
const tree = signalTree({
  complex: {
    date: new Date(),
    regex: /test/gi,
    map: new Map([['key', 'value']]),
    set: new Set([1, 2, 3]),
  },
}).with(
  withSerialization({
    includeMetadata: true,
    replacer: (key, value) => {
      // Custom serialization logic
      return value;
    },
    reviver: (key, value) => {
      // Custom deserialization logic
      return value;
    },
  })
);
```

### Persistence Configuration

```typescript
const tree = signalTree({ state: {} }).with(
  withPersistence({
    key: 'my-app',
    storage: localStorage, // Default: localStorage
    autoSave: true, // Default: true
    debounceMs: 2000, // Default: 1000ms
    autoLoad: true, // Default: true
    includeMetadata: true, // Include timestamps, version
    replacer: customReplacer, // Custom serialization
    reviver: customReviver, // Custom deserialization
  })
);
```

## Advanced types handled

SignalTree serialization handles complex JavaScript types automatically:

```typescript
const tree = signalTree({
  // Standard types
  string: 'text',
  number: 42,
  boolean: true,
  null: null,
  undefined: undefined,

  // Advanced types (automatically handled)
  date: new Date('2023-01-01'),
  regex: /pattern/gi,
  map: new Map([
    ['a', 1],
    ['b', 2],
  ]),
  set: new Set([1, 2, 3]),

  // Special values
  nan: NaN,
  infinity: Infinity,
  negativeInfinity: -Infinity,

  // Nested structures with circular references
  circular: {
    /* handled automatically */
  },
}).with(withSerialization());

const serialized = tree.serialize();
// All types preserved through serialization/deserialization cycle
```

## SSR support

Perfect for Next.js, Angular Universal, and other SSR frameworks:

```typescript
// Server-side
const serverTree = signalTree(initialData).with(withSerialization());
const serializedState = serverTree.serialize();

// Send to client
const html = `
  <script>
    window.__INITIAL_STATE__ = ${JSON.stringify(serializedState)};
  </script>
`;

// Client-side hydration
const clientTree = signalTree({}).with(withSerialization());
clientTree.deserialize(window.__INITIAL_STATE__);
```

## Storage adapters

### Built-in Adapters

```typescript
// localStorage (default)
withPersistence({ key: 'state', storage: localStorage });

// sessionStorage
withPersistence({ key: 'state', storage: sessionStorage });

// IndexedDB for large data
const idbAdapter = createIndexedDBAdapter('MyDB', 'store');
withPersistence({ key: 'state', storage: idbAdapter });
```

### Custom Adapter Interface

```typescript
interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

// Create adapter
const customAdapter = createStorageAdapter(
  getItem, // Read function
  setItem, // Write function
  removeItem // Delete function
);
```

## Error handling

```typescript
const tree = signalTree({ data: {} }).with(
  withPersistence({
    key: 'app-state',
  })
);

try {
  await tree.load();
} catch (error) {
  console.error('Failed to load state:', error);
  // Handle error (use defaults, retry, etc.)
}

try {
  await tree.save();
} catch (error) {
  console.error('Failed to save state:', error);
  // Handle error (queue for retry, notify user, etc.)
}
```

## Performance and bundle size

- **Bundle Size**: ~4.6KB gzipped (approximate; varies by build/tooling)
- **Serialization**: Optimized for speed; actual performance depends on data shapes and environment
- **Auto-Save**: Debounced to prevent excessive storage operations
- **Memory Usage**: Efficient handling of large state trees
- **Tree-Shaking**: Only used features included in bundle

## Integration examples

### Angular Service

```typescript
@Injectable({ providedIn: 'root' })
export class AppStateService {
  private tree = signalTree({
    user: { name: '', email: '' },
    preferences: { theme: 'light' },
  }).with(
    withPersistence({
      key: 'angular-app-state',
      autoSave: true,
    })
  );

  user = this.tree.$.user;
  preferences = this.tree.$.preferences;

  async saveState() {
    await this.tree.save();
  }

  async loadState() {
    await this.tree.load();
  }
}
```

### React Hook

```typescript
function usePersistedState<T>(key: string, initialState: T) {
  const [tree] = useState(() =>
    signalTree(initialState).with(
      withPersistence({
        key,
        autoSave: true,
        debounceMs: 500,
      })
    )
  );

  return {
    state: tree.state,
    save: tree.save,
    load: tree.load,
    clear: tree.clear,
  };
}
```

## Testing utilities

```typescript
// Helper functions for testing
import { applySerialization, applyPersistence } from '@signaltree/serialization';

// Explicit typing for tests (avoids complex .with() inference)
const testTree = applySerialization(signalTree({ test: true }));
const persistentTree = applyPersistence(signalTree({ test: true }), {
  key: 'test-state',
});
```

## API reference

### `withSerialization(config?)`

Enhances SignalTree with serialization capabilities.

**Config Options:**

- `includeMetadata?: boolean` - Include metadata (timestamps, version)
- `replacer?: (key: string, value: unknown) => unknown` - Custom replacer
- `reviver?: (key: string, value: unknown) => unknown` - Custom reviver

### `withPersistence(config)`

Enhances SignalTree with persistence capabilities.

**Config Options:**

- `key: string` - Storage key (required)
- `storage?: StorageAdapter` - Storage adapter (default: localStorage)
- `autoSave?: boolean` - Enable auto-save (default: true)
- `debounceMs?: number` - Auto-save delay (default: 1000ms)
- `autoLoad?: boolean` - Enable auto-load (default: true)
- Plus all `withSerialization` options

### Storage Adapter Creators

- `createStorageAdapter(getItem, setItem, removeItem)` - Create custom adapter
- `createIndexedDBAdapter(dbName?, storeName?)` - Create IndexedDB adapter

### Tree Methods (Added by Enhancers)

**Serialization Methods:**

- `serialize(config?)` - Serialize to JSON string
- `deserialize(data, config?)` - Deserialize from JSON string
- `toJSON()` - Convert to plain object
- `fromJSON(obj)` - Load from plain object
- `snapshot(config?)` - Create snapshot with metadata
- `restore(snapshot, config?)` - Restore from snapshot

**Persistence Methods:**

- `save()` - Save to storage (returns Promise)
- `load()` - Load from storage (returns Promise)
- `clear()` - Clear from storage (returns Promise)

## Related packages

- **[@signaltree/core](../core)** - Core SignalTree functionality (required)
- **[@signaltree/time-travel](../time-travel)** - History management with persistence
- **[@signaltree/devtools](../devtools)** - Development tools with state inspection

## Bundle size breakdown

```
@signaltree/serialization: 4.62KB gzipped
├── Core serialization: ~2.1KB
├── Persistence layer: ~1.2KB
├── Storage adapters: ~0.8KB
├── Type handlers: ~0.4KB
└── Utils & helpers: ~0.12KB
```

## Use cases

- **State Persistence**: Maintain app state across browser sessions
- **SSR/Hydration**: Server-side rendering with client hydration
- **Offline Support**: Cache state for offline application functionality
- **State Synchronization**: Sync state across browser tabs/windows
- **Debugging**: Capture and restore state for debugging purposes
- **Testing**: Save and restore state for consistent test environments
- **Cloud Sync**: Persist state to remote storage services

## Why choose @signaltree/serialization?

- **Complete Solution**: Handles all JavaScript types and edge cases
- **Production Ready**: Used in enterprise applications with full test coverage
- **Performance Optimized**: Minimal overhead with intelligent debouncing
- **Flexible Storage**: Works with any storage backend through adapters
- **Framework Agnostic**: Works with Angular, React, Vue, or vanilla JavaScript
- **TypeScript First**: Full type safety with excellent IntelliSense support
- **Zero Dependencies**: Only depends on @signaltree/core

---

Ready to persist state? Install `@signaltree/serialization` to enable robust persistence.
