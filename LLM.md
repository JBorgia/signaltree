# SignalTree v7 - AI/Developer Guidance

> **Purpose:** Comprehensive guidance for AI assistants and developers implementing SignalTree v7+.
> **Last Updated:** January 2026 (v7.1.0)

---

## Quick Reference

### Installation

```bash
npm install @signaltree/core@^7.0.0
```

### Minimal Example

```typescript
import { signalTree, entityMap } from '@signaltree/core';

const store = signalTree({
  users: entityMap<User, number>(),
  settings: {
    theme: 'light' as 'light' | 'dark',
  },
});

// Read
store.$.users.all(); // User[]
store.$.settings.theme(); // 'light' | 'dark'

// Write
store.$.users.addOne(user);
store.$.settings.theme.set('dark');
```

---

## v7 Breaking Changes

### ❌ DEPRECATED: `.with(entities())`

**v6 (old):**

```typescript
import { signalTree, entityMap, entities } from '@signaltree/core';

const store = signalTree({
  users: entityMap<User, number>(),
}).with(entities()); // ❌ No longer needed
```

**v7 (new):**

```typescript
import { signalTree, entityMap } from '@signaltree/core';

const store = signalTree({
  users: entityMap<User, number>(),
}); // ✅ entityMap auto-processed
```

### ✅ NEW: Markers

v7 introduces **markers** - declarative placeholders that are auto-processed during tree creation:

| Marker                 | Purpose                       | Example                               |
| ---------------------- | ----------------------------- | ------------------------------------- |
| `entityMap<E, K>()`    | Entity collection with CRUD   | `users: entityMap<User, number>()`    |
| `status<E>()`          | Async loading state tracking  | `loading: status<MyError>()`          |
| `stored(key, default)` | Auto localStorage persistence | `theme: stored('app-theme', 'light')` |

---

## Markers Reference

### `entityMap<Entity, Key>()`

Creates a normalized entity collection with CRUD operations.

```typescript
import { entityMap } from '@signaltree/core';

interface User {
  id: number;
  name: string;
}

const store = signalTree({
  users: entityMap<User, number>(),
});

// Available operations:
store.$.users.all(); // Signal<User[]>
store.$.users.byId(1); // () => Signal<User | undefined>
store.$.users.count(); // Signal<number>
store.$.users.addOne(user); // Add single entity
store.$.users.addMany(users); // Add multiple entities
store.$.users.setAll(users); // Replace all entities
store.$.users.updateOne(id, changes);
store.$.users.upsertOne(user);
store.$.users.removeOne(id);
store.$.users.removeMany(ids);
store.$.users.clear();
```

### `status<ErrorType>()`

Creates async operation status tracking with derived convenience signals.

```typescript
import { status, LoadingState } from '@signaltree/core';

interface ApiError {
  code: string;
  message: string;
}

const store = signalTree({
  users: {
    entities: entityMap<User, number>(),
    status: status<ApiError>(), // Custom error type
  },
});

// Status signals:
store.$.users.status.state(); // Signal<LoadingState>
store.$.users.status.error(); // Signal<ApiError | null>
store.$.users.status.isLoading(); // Signal<boolean>
store.$.users.status.isLoaded(); // Signal<boolean>
store.$.users.status.isError(); // Signal<boolean>
store.$.users.status.isNotLoaded(); // Signal<boolean>

// Status mutations:
store.$.users.status.setLoading();
store.$.users.status.setLoaded();
store.$.users.status.setError(error);
store.$.users.status.setNotLoaded();
store.$.users.status.reset();

// LoadingState enum values:
// LoadingState.NotLoaded = 'NOT_LOADED'
// LoadingState.Loading = 'LOADING'
// LoadingState.Loaded = 'LOADED'
// LoadingState.Error = 'ERROR'
```

### `stored(key, defaultValue, options?)`

Auto-persists signal value to localStorage.

```typescript
import { stored } from '@signaltree/core';

const store = signalTree({
  settings: {
    theme: stored('app-theme', 'light'),
    language: stored('app-lang', 'en'),
    notifications: stored('app-notifications', true),
  },
});

// Read (auto-loads from localStorage)
store.$.settings.theme(); // 'light' or value from localStorage

// Write (auto-saves to localStorage)
store.$.settings.theme.set('dark');

// Additional methods:
store.$.settings.theme.clear(); // Remove from localStorage, reset to default
store.$.settings.theme.reload(); // Re-read from localStorage
```

---

## Derived State

Use `.derived()` to add computed state based on source state.

```typescript
import { signalTree, entityMap, derived } from '@signaltree/core';
import { computed } from '@angular/core';

const store = signalTree({
  users: entityMap<User, number>(),
  selectedUserId: null as number | null,
}).derived(($) => ({
  // Nested under existing domain
  users: {
    selected: computed(() => {
      const id = $.selectedUserId();
      return id != null ? $.users.byId(id)?.() ?? null : null;
    }),
    activeCount: computed(() => $.users.all().filter((u) => u.isActive).length),
  },
  // Top-level derived
  hasSelection: computed(() => $.selectedUserId() != null),
}));

// Access derived state same as source state
store.$.users.selected(); // User | null
store.$.users.activeCount(); // number
store.$.hasSelection(); // boolean
```

### Derived Layer Best Practices

1. **Use `computed()` from Angular** - It's the standard reactive primitive
2. **Nest under domains** - Keep derived state co-located with source
3. **Multiple layers allowed** - Chain `.derived()` for complex dependencies
4. **Avoid side effects** - Derived state should be pure computations

---

## Enhancers

Enhancers add cross-cutting functionality to the tree.

```typescript
import {
  signalTree,
  devTools,
  batching,
  memoization,
  timeTravel
} from '@signaltree/core';

const store = signalTree({ ... })
  .with(devTools({ treeName: 'AppStore' }))  // Redux DevTools integration
  .with(batching())                           // Batch multiple updates
  .with(memoization())                        // Cache computed values
  .with(timeTravel({ maxHistorySize: 50 })); // Undo/redo support
```

### Available Enhancers

| Enhancer          | Purpose                       | When to Use               |
| ----------------- | ----------------------------- | ------------------------- |
| `devTools()`      | Redux DevTools integration    | Development/debugging     |
| `batching()`      | Batch multiple signal updates | Performance optimization  |
| `memoization()`   | Cache expensive computations  | Large derived state       |
| `timeTravel()`    | Undo/redo functionality       | Form editing, canvas apps |
| `serialization()` | State persistence             | App reload persistence    |

---

## Common Patterns

### Pattern 1: Domain with Status

```typescript
const store = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),
    status: status<NotifyError>(),
    activeId: null as number | null,
    filters: {
      startDate: new Date(),
      endDate: new Date(),
    },
  },
}).derived(($) => ({
  tickets: {
    active: computed(() => {
      const id = $.tickets.activeId();
      return id != null ? $.tickets.entities.byId(id)?.() ?? null : null;
    }),
    isReady: computed(() => $.tickets.status.isLoaded()),
  },
}));
```

### Pattern 2: Selection State

```typescript
const store = signalTree({
  haulers: entityMap<Hauler, number>(),
  trucks: entityMap<Truck, number>(),
  selected: {
    haulerId: null as number | null,
    truckId: null as number | null,
  },
}).derived(($) => ({
  selection: {
    hauler: computed(() => {
      const id = $.selected.haulerId();
      return id != null ? $.haulers.byId(id)?.() ?? null : null;
    }),
    truck: computed(() => {
      const id = $.selected.truckId();
      return id != null ? $.trucks.byId(id)?.() ?? null : null;
    }),
    isComplete: computed(() => $.selected.haulerId() != null && $.selected.truckId() != null),
  },
}));
```

### Pattern 3: Settings with Persistence

```typescript
const store = signalTree({
  settings: {
    theme: stored('app-theme', 'light' as 'light' | 'dark'),
    language: stored('app-lang', 'en'),
    notifications: stored('app-notifications', true),
    lastSyncDate: stored('app-last-sync', null as Date | null),
  },
});
```

### Pattern 4: Async Operations (with Angular resource)

```typescript
import { resource } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UsersResource {
  private _tree = inject(APP_TREE);
  private _api = inject(UserService);

  readonly users = resource({
    params: () => ({ filter: this._tree.$.users.filter() }),
    loader: ({ params }) => firstValueFrom(this._api.list$(params)),
  });

  // Sync to tree when loaded
  readonly _ = effect(() => {
    if (this.users.hasValue()) {
      this._tree.$.users.entities.setAll(this.users.value());
    }
  });
}
```

---

## Anti-Patterns to Avoid

### ❌ Don't use `.with(entities())` in v7+

```typescript
// ❌ Wrong - entities() is deprecated
const store = signalTree({
  users: entityMap<User, number>(),
}).with(entities());

// ✅ Correct - entityMap auto-processed
const store = signalTree({
  users: entityMap<User, number>(),
});
```

### ❌ Don't duplicate entity data

```typescript
// ❌ Wrong - duplicates data
const store = signalTree({
  users: entityMap<User, number>(),
  activeUser: null as User | null, // Duplicates user data
});

// ✅ Correct - store ID, derive entity
const store = signalTree({
  users: entityMap<User, number>(),
  activeUserId: null as number | null,
}).derived(($) => ({
  activeUser: computed(() => {
    const id = $.activeUserId();
    return id != null ? $.users.byId(id)?.() ?? null : null;
  }),
}));
```

### ❌ Don't create manual loading state when status() is available

```typescript
// ❌ Wrong - manual boilerplate
const store = signalTree({
  users: {
    entities: entityMap<User, number>(),
    loading: {
      state: 'idle' as 'idle' | 'loading' | 'loaded' | 'error',
      error: null as Error | null,
    },
  },
});

// ✅ Correct - use status() marker
const store = signalTree({
  users: {
    entities: entityMap<User, number>(),
    status: status(),
  },
});
```

### ❌ Don't mix Observable and Signal patterns unnecessarily

```typescript
// ❌ Wrong - mixing patterns
readonly users$ = toObservable(this.tree.$.users.all);
readonly activeUser$ = this.users$.pipe(
  map(users => users.find(u => u.id === this.activeId()))
);

// ✅ Correct - stay in signal world
readonly activeUser = computed(() => {
  const id = this.activeId();
  return this.tree.$.users.byId(id)?.() ?? null;
});
```

---

## Testing

### Unit Testing Trees

```typescript
import { signalTree, entityMap } from '@signaltree/core';

describe('AppTree', () => {
  let tree: ReturnType<typeof createAppTree>;

  beforeEach(() => {
    tree = createAppTree();
  });

  it('should add user', () => {
    tree.$.users.addOne({ id: 1, name: 'Test' });
    expect(tree.$.users.count()).toBe(1);
  });

  it('should derive active user', () => {
    tree.$.users.addOne({ id: 1, name: 'Test' });
    tree.$.activeUserId.set(1);
    expect(tree.$.activeUser()?.name).toBe('Test');
  });
});
```

### Testing with Angular TestBed

```typescript
describe('UsersComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: APP_TREE, useFactory: () => createAppTree() }],
    });
  });

  it('should render users', () => {
    const tree = TestBed.inject(APP_TREE);
    tree.$.users.setAll([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
    // ... test component rendering
  });
});
```

---

## Migration from v6

### Step 1: Remove `.with(entities())`

```diff
- import { signalTree, entityMap, entities } from '@signaltree/core';
+ import { signalTree, entityMap } from '@signaltree/core';

const store = signalTree({
  users: entityMap<User, number>()
-}).with(entities());
+});
```

### Step 2: Replace manual loading state with `status()`

```diff
+ import { status } from '@signaltree/core';

const store = signalTree({
  users: {
    entities: entityMap<User, number>(),
-   loading: {
-     state: 'idle' as LoadingState,
-     error: null as Error | null
-   }
+   status: status()
  }
});

// Update usage:
- tree.$.users.loading.state.set('loading');
+ tree.$.users.status.setLoading();

- tree.$.users.loading.state.set('loaded');
+ tree.$.users.status.setLoaded();

- tree.$.users.loading.error.set(error);
+ tree.$.users.status.setError(error);
```

### Step 3: Add `stored()` for persisted settings

```diff
+ import { stored } from '@signaltree/core';

const store = signalTree({
  settings: {
-   theme: 'light' as 'light' | 'dark',
+   theme: stored('app-theme', 'light' as 'light' | 'dark'),
  }
});

// Remove manual localStorage code
- localStorage.setItem('app-theme', theme);
- const savedTheme = localStorage.getItem('app-theme');
```

---

## Type Safety

SignalTree provides full TypeScript inference:

```typescript
const store = signalTree({
  users: entityMap<User, number>(),
  settings: {
    theme: 'light' as 'light' | 'dark',
  },
});

// Fully typed:
store.$.users.addOne({ id: 1 }); // Error: missing 'name' property
store.$.settings.theme.set('invalid'); // Error: not 'light' | 'dark'
store.$.users.byId('1'); // Error: expected number key
```

---

## Performance Tips

1. **Use `entityMap`** for collections > 10 items (O(1) lookups)
2. **Use `batching()`** when updating multiple signals
3. **Use `memoization()`** for expensive derived computations
4. **Avoid reading `.all()` when you need `.byId()`**
5. **Keep derived computations shallow** - avoid deep nesting

---

## Resources

- [SignalTree GitHub](https://github.com/JBorgia/signaltree)
- [SignalTree npm](https://www.npmjs.com/package/@signaltree/core)
- [Angular Signals Guide](https://angular.dev/guide/signals)
- [Angular Resource Guide](https://angular.dev/guide/signals/resource)
