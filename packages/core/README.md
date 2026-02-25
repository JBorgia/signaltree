<div align="center">
  <img src="https://raw.githubusercontent.com/JBorgia/signaltree/main/apps/demo/public/signaltree.svg" alt="SignalTree Logo" width="60" height="60" />
</div>

# SignalTree: Reactive JSON

**JSON branches, reactive leaves.**

> No actions. No reducers. No selectors.

## What is @signaltree/core?

SignalTree treats application state as **reactive JSON** — a typed, dot-notation interface to plain JSON-like objects with fine-grained reactivity layered transparently on top.

You don't model state as actions, reducers, selectors, or classes — you model it as **data**.

### Core Philosophy

| Principle                | What It Means                                                                |
| ------------------------ | ---------------------------------------------------------------------------- |
| **State is Data**        | Your state shape looks like JSON. No ceremony, no abstractions.              |
| **Dot-Notation Access**  | `tree.$.user.profile.name()` — fully type-safe, IDE-discoverable             |
| **Invisible Reactivity** | You think in data paths, not subscriptions. Reactivity emerges naturally.    |
| **Lazy by Design**       | Signals created only where accessed. Types do heavy lifting at compile time. |

### Technical Features

- Recursive typing with deep nesting and accurate type inference
- Fast operations with sub‑millisecond measurements at 5–20+ levels
- Strong TypeScript safety across nested structures
- Memory efficiency via structural sharing and lazy signals
- Small API surface with minimal runtime overhead
- Compact bundle size suited for production

## Import guidance (tree-shaking)

Modern bundlers (webpack 5+, esbuild, Rollup, Vite) **automatically tree-shake barrel imports** from `@signaltree/core`. Both import styles produce identical bundle sizes:

```ts
// ✅ Recommended: Simple and clean
import { signalTree, batching } from '@signaltree/core';

// ✅ Also fine: Explicit subpath (same bundle size)
import { signalTree } from '@signaltree/core';
import { batching } from '@signaltree/core/enhancers/batching';
```

**Measured impact** (with modern bundlers):

- Core only: ~8.5 KB gzipped
- Core + batching: ~9.3 KB gzipped (barrel vs subpath: identical)
- Unused enhancers: **automatically excluded** by tree-shaking

### Marker Tree-Shaking (Self-Registering)

Built-in markers (`entityMap()`, `status()`, `stored()`) are **self-registering** - they only add their processor code when you actually use them:

```ts
// ✅ Only status() code is bundled (entityMap and stored tree-shaken out)
import { signalTree, status } from '@signaltree/core';
const tree = signalTree({ loadState: status() });

// ✅ Minimal bundle - no marker code included
import { signalTree } from '@signaltree/core';
const tree = signalTree({ count: 0 });
```

**How it works:**

- Each marker factory (`status()`, `stored()`, `entityMap()`) registers its processor on first call
- If you never call a marker factory, its code is completely eliminated
- Zero import-time side effects - registration is lazy and automatic

**When to use subpath imports:**

- Older bundlers (webpack <5) with poor tree-shaking
- Explicit control over what gets included
- Personal/team preference for clarity

This repo's ESLint rule is **disabled by default** since testing confirms effective tree-shaking with barrel imports.

### Callable leaf signals (DX sugar only)

SignalTree provides TypeScript support for callable syntax on leaf signals as developer experience sugar:

```typescript
// TypeScript accepts this syntax (with proper tooling):
tree.$.name('Jane'); // Set value
tree.$.count((n) => n + 1); // Update with function

// At build time, transforms convert to:
tree.$.name.set('Jane'); // Direct Angular signal API
tree.$.count.update((n) => n + 1); // Direct Angular signal API

// Reading always works directly:
const name = tree.$.name(); // No transform needed
```

**Key Points:**

- **Zero runtime overhead**: No Proxy wrappers or runtime hooks
- **Build-time only**: AST transform converts callable syntax to direct `.set/.update` calls
- **Optional**: Use `@signaltree/callable-syntax` transform or stick with direct `.set/.update`
- **Type-safe**: Full TypeScript support via module augmentation

**Function-valued leaves:**
When a leaf stores a function as its value, use direct `.set(fn)` to assign. Callable `sig(fn)` is treated as an updater.

**Setup:**
Install `@signaltree/callable-syntax` and configure your build tool to apply the transform. Without the transform, use `.set/.update` directly.

### Measuring performance and size

Performance and bundle size vary by app shape, build tooling, device, and runtime. To get meaningful results for your environment:

- Use the **Benchmark Orchestrator** in the demo app to run calibrated, scenario-based benchmarks across supported libraries with **real-world frequency weighting**. It applies research-based multipliers derived from 40,000+ developer surveys and GitHub analysis, reports statistical summaries (median/p95/p99/stddev), alternates runs to reduce bias, and can export CSV/JSON. When available, memory usage is also reported.
- Use the bundle analysis scripts in `scripts/` to measure your min+gz sizes. Sizes are approximate and depend on tree-shaking and configuration.

## Best Practices (SignalTree-First)

> 📖 **Full guide**: [Implementation Patterns](https://github.com/JBorgia/signaltree/blob/main/docs/IMPLEMENTATION_PATTERNS.md)

Follow these principles for idiomatic SignalTree code:

### 1. Expose signals directly (no computed wrappers)

```typescript
const tree = signalTree(initialState); // No .with(entities()) needed in v7+ (deprecated in v6, removed in v7)
const $ = tree.$; // Shorthand for state access

// ✅ SignalTree-first: Direct signal exposure
return {
  selectedUserId: $.selected.userId, // Direct from $ tree
  loadingState: $.loading.state,
  selectedUser, // Actual derived state (computed)
};

// ❌ Anti-pattern: Unnecessary computed wrappers
return {
  selectedUserId: computed(() => $.selected.userId()), // Adds indirection
};
```

### 2. Use `ReturnType` inference (SignalTree-first)

```typescript
// Let SignalTree infer the type - no manual interface needed!
import type { createUserTree } from './user.tree';
export type UserTree = ReturnType<typeof createUserTree>;

// Factory function - no explicit return type needed
export function createUserTree() {
  const tree = signalTree(initialState); // entities() not needed in v7+
  return {
    selectedUserId: tree.$.selected.userId, // Type inferred automatically
    // ...
  };
}
```

### 3. Use `computed()` only for derived state

```typescript
// ✅ Correct: Derived from multiple signals
const selectedUser = computed(() => {
  const id = $.selected.userId();
  return id ? $.users.byId(id)() : null;
});

// ❌ Wrong: Wrapping an existing signal
const selectedUserId = computed(() => $.selected.userId()); // Unnecessary!
```

### 4. Use EntitySignal API directly

```typescript
// ✅ SignalTree-native
const user = $.users.byId(123)(); // O(1) lookup
const allUsers = $.users.all; // Get all
$.users.setAll(usersFromApi); // Replace all

// ❌ NgRx-style (avoid)
const user = entityMap()[123]; // Requires intermediate object
```

### Notification Batching

SignalTree automatically batches _notification delivery_ to subscribers and change detection to the end of the current microtask. This prevents render thrashing when multiple values are updated together and preserves immediate read-after-write semantics (values update synchronously, notifications are deferred).

**Example**

```typescript
// Multiple updates in the same microtask are coalesced into a single notification
tree.$.form.name.set('Alice');
tree.$.form.email.set('alice@example.com');
tree.$.form.submitted.set(true);
// → Subscribers are notified once at the end of the microtask with final values
```

**Testing**

When tests need synchronous notification delivery, use `flushSync()`:

```typescript
import { getPathNotifier } from '@signaltree/core';

it('updates state', () => {
  tree.$.count.set(5);
  getPathNotifier().flushSync();
  expect(subscriber).toHaveBeenCalledWith(5, 0);
});
```

Alternatively, await a microtask (`await Promise.resolve()`) to allow the automatic flush to occur.

**Opting out**

To disable automatic microtask batching for a specific tree instance:

```typescript
const tree = signalTree(initialState, { batching: false });
```

Use this only for rare cases that truly require synchronous notifications (most apps should keep batching enabled).

## Quick start

### Installation

```bash
npm install @signaltree/core
```

### Deep nesting example

```typescript
import { signalTree } from '@signaltree/core';

// Strong type inference at deep nesting levels
const tree = signalTree({
  enterprise: {
    divisions: {
      technology: {
        departments: {
          engineering: {
            teams: {
              frontend: {
                projects: {
                  signaltree: {
                    releases: {
                      v1: {
                        features: {
                          recursiveTyping: {
                            validation: {
                              tests: {
                                extreme: {
                                  depth: 15,
                                  typeInference: true,
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

// Type inference at deep nesting levels
const depth = tree.$.enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme.depth();
console.log(`Depth: ${depth}`);

// Type-safe updates at unlimited depth
tree.$.enterprise.divisions.technology.departments.engineering.teams.frontend.projects.signaltree.releases.v1.features.recursiveTyping.validation.tests.extreme.depth(25); // Perfect type safety!
```

### Basic usage

```typescript
import { signalTree } from '@signaltree/core';

// Create a simple tree
const tree = signalTree({
  count: 0,
  message: 'Hello World',
});

// Read values (these are Angular signals)
console.log(tree.$.count()); // 0
console.log(tree.$.message()); // 'Hello World'

// Update values
tree.$.count(5);
tree.$.message('Updated!');

// Use in an Angular component
@Component({
  template: ` <div>Count: {{ tree.$.count() }}</div>
    <div>Message: {{ tree.$.message() }}</div>
    <button (click)="increment()">+1</button>`,
})
class SimpleComponent {
  tree = tree;

  increment() {
    this.tree.$.count((n) => n + 1);
  }
}
```

### Intermediate usage (nested state)

```typescript
// Create hierarchical state
const tree = signalTree({
  user: {
    name: 'John Doe',
    email: 'john@example.com',
    preferences: {
      theme: 'dark',
      notifications: true,
    },
  },
  ui: {
    loading: false,
    errors: [] as string[],
  },
});

// Access nested signals with full type safety
tree.$.user.name('Jane Doe');
tree.$.user.preferences.theme('light');
tree.$.ui.loading(true);

// Computed values from nested state
const userDisplayName = computed(() => {
  const user = tree.$.user();
  return `${user.name} (${user.email})`;
});

// Effects that respond to changes
effect(() => {
  if (tree.$.ui.loading()) {
    console.log('Loading started...');
  }
});
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Core features

### 1) Hierarchical signal trees

Create deeply nested reactive state with automatic type inference:

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string signal
tree.$.settings.theme.set('light'); // type-checked value
tree.$.todos.update((todos) => [...todos, newTodo]); // array operations
```

### 2) TypeScript inference

SignalTree provides complete type inference without manual typing:

```typescript
// Automatic inference from initial state
const tree = signalTree({
  count: 0, // Inferred as WritableSignal<number>
  name: 'John', // Inferred as WritableSignal<string>
  active: true, // Inferred as WritableSignal<boolean>
  items: [] as Item[], // Inferred as WritableSignal<Item[]>
  config: {
    theme: 'dark' as const, // Inferred as WritableSignal<'dark'>
    settings: {
      nested: true, // Deep nesting maintained
    },
  },
});

// Type-safe access and updates
tree.$.count.set(5); // ✅ number
tree.$.count.set('invalid'); // ❌ Type error
tree.$.config.theme.set('light'); // ❌ Type error ('dark' const)
tree.$.config.settings.nested.set(false); // ✅ boolean
```

### 3) Manual state management

Core provides basic state updates. For advanced entity management, use the built-in `entities` enhancer:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const tree = signalTree({
  users: [] as User[],
});

// Entity CRUD operations using core methods
function addUser(user: User) {
  tree.$.users.update((users) => [...users, user]);
}

function updateUser(id: string, updates: Partial<User>) {
  tree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
}

function removeUser(id: string) {
  tree.$.users.update((users) => users.filter((user) => user.id !== id));
}

// Manual queries using computed signals
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));
const activeUsers = computed(() => tree.$.users().filter((user) => user.active));
```

### 4) Manual async state management

Core provides basic state updates. For advanced async helpers, use the built-in async helpers (`createAsyncOperation`, `trackAsync`):

```typescript
const tree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

// Manual async operation management
async function loadUsers() {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Usage in component
@Component({
  template: `
    @if (tree.$.loading()) {
    <div>Loading...</div>
    } @else if (tree.$.error()) {
    <div class="error">{{ tree.$.error() }}</div>
    } @else { @for (user of tree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
    <button (click)="loadUsers()">Refresh</button>
  `,
})
class UsersComponent {
  tree = tree;
  loadUsers = loadUsers;
}
```

### Reactive computations with computed()

SignalTree works seamlessly with Angular's `computed()` for creating efficient reactive computations. These computations automatically update when their dependencies change and are memoized for optimal performance.

```typescript
import { computed, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  users: [
    { id: '1', name: 'Alice', active: true, role: 'admin' },
    { id: '2', name: 'Bob', active: false, role: 'user' },
    { id: '3', name: 'Charlie', active: true, role: 'user' },
  ],
  filters: {
    showActive: true,
    role: 'all' as 'all' | 'admin' | 'user',
  },
});

// Basic computed - automatically memoized
const userCount = computed(() => tree.$.users().length);

// Complex filtering computation
const filteredUsers = computed(() => {
  const users = tree.$.users();
  const filters = tree.$.filters();

  return users.filter((user) => {
    if (filters.showActive && !user.active) return false;
    if (filters.role !== 'all' && user.role !== filters.role) return false;
    return true;
  });
});

// Derived computation from other computed values
const activeAdminCount = computed(() => filteredUsers().filter((user) => user.role === 'admin' && user.active).length);

// Performance-critical computation with complex logic
const userStatistics = computed(() => {
  const users = tree.$.users();

  return {
    total: users.length,
    active: users.filter((u) => u.active).length,
    admins: users.filter((u) => u.role === 'admin').length,
    averageNameLength: users.reduce((acc, u) => acc + u.name.length, 0) / users.length,
  };
});

// Dynamic computed functions (factory pattern)
const userById = (id: string) => computed(() => tree.$.users().find((user) => user.id === id));

// Usage in effects
effect(() => {
  console.log(`Filtered users: ${filteredUsers().length}`);
  console.log(`Statistics:`, userStatistics());
});

// Best Practices:
// 1. Use computed() for derived state that depends on signals
// 2. Keep computations pure - no side effects
// 3. Leverage automatic memoization for expensive operations
// 4. Chain computed values for complex transformations
// 5. Use factory functions for parameterized computations
```

### Performance optimization with memoization

Computed values become even more powerful with the built-in memoization enhancer:

```typescript
import { signalTree, memoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(memoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

### Debugging with Redux DevTools

SignalTree integrates seamlessly with Redux DevTools for time-travel debugging and state inspection.

**Basic Usage:**

```typescript
import { signalTree, devTools } from '@signaltree/core';

const tree = signalTree({ count: 0 }).with(devTools({ name: 'Counter' }));
```

**Single Instance Mode:**

When using multiple independent stores (e.g., feature modules), you can group them under a single Redux DevTools instance to avoid cluttering the connection list. This is particularly useful for large applications with many lazy-loaded stores.

```typescript
const DEVTOOLS_GROUP_ID = 'my-app-production';
const DEVTOOLS_GROUP_NAME = 'My App SignalTree';

// Store 1
const materialsTree = signalTree(materialsState).with(
  devTools({
    treeName: 'Materials',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);

// Store 2
const ordersTree = signalTree(ordersState).with(
  devTools({
    treeName: 'Orders',
    aggregatedReduxInstance: {
      id: DEVTOOLS_GROUP_ID,
      name: DEVTOOLS_GROUP_NAME,
    },
  })
);
```

Both stores will appear as branches under the same "My App SignalTree" instance in Redux DevTools.

### Advanced usage (full state tree)

```typescript
interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  data: {
    users: User[];
    posts: Post[];
    cache: Record<string, unknown>;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebar: {
      open: boolean;
      width: number;
    };
    notifications: Notification[];
  };
}

const tree = signalTree<AppState>({
  auth: {
    user: null,
    token: null,
    isAuthenticated: false,
  },
  data: {
    users: [],
    posts: [],
    cache: {},
  },
  ui: {
    theme: 'light',
    sidebar: { open: true, width: 250 },
    notifications: [],
  },
});

// Complex updates with type safety
tree((state) => ({
  auth: {
    ...state.auth,
    user: { id: '1', name: 'John' },
    isAuthenticated: true,
  },
  ui: {
    ...state.ui,
    notifications: [...state.ui.notifications, { id: '1', message: 'Welcome!', type: 'success' }],
  },
}));

// Get entire state as plain object
const currentState = tree();
console.log('Current app state:', currentState);
```

## Package Selection Guide

**Start with just `@signaltree/core`** - it includes comprehensive enhancers for most applications:

- Performance optimization (batching, memoization)
- Data management (entities, async operations)
- Development tools (devtools, time-travel)
- State persistence (serialization)

**Add companion packages when you need:**

| Package                       | When to Add                        | Bundle Impact    |
| ----------------------------- | ---------------------------------- | ---------------- |
| `@signaltree/ng-forms`        | Angular Reactive Forms integration | ~10KB gzipped    |
| `@signaltree/enterprise`      | 500+ signals, large-scale apps     | ~8KB gzipped     |
| `@signaltree/guardrails`      | Development performance monitoring | 0KB (dev-only)   |
| `@signaltree/callable-syntax` | Prefer callable syntax sugar       | 0KB (build-time) |

**Typical Installation Patterns:**

```bash
# Basic application
npm install @signaltree/core

# Application with forms
npm install @signaltree/core @signaltree/ng-forms

# Large enterprise application
npm install @signaltree/core @signaltree/enterprise

# Development with all tools
npm install @signaltree/core @signaltree/enterprise @signaltree/ng-forms
npm install --save-dev @signaltree/guardrails @signaltree/callable-syntax
```

## Links

- [SignalTree Documentation](https://signaltree.io)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [NPM Package](https://www.npmjs.com/package/@signaltree/core)
- [Interactive Examples](https://signaltree.io/examples)

## 📄 License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

**Ready to get started?** This core package provides everything you need for most applications. Add extensions only when you need them! 🚀
