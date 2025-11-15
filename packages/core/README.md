<div align="center">
  <img src="https://raw.githubusercontent.com/JBorgia/signaltree/main/apps/demo/public/signaltree.svg" alt="SignalTree Logo" width="60" height="60" />
</div>

# SignalTree Core

Foundation package for SignalTree. Provides recursive typing, deep nesting support, and strong performance.

## What is @signaltree/core?

SignalTree Core is a lightweight package that provides:

- Recursive typing with deep nesting and accurate type inference
- Fast operations with sub‑millisecond measurements at 5–20+ levels
- Strong TypeScript safety across nested structures
- Memory efficiency via structural sharing and lazy signals
- Small API surface with zero-cost abstractions
- Compact bundle size suited for production

## Import guidance (tree-shaking)

To keep bundles minimal, prefer subpath imports for enhancers and advanced utilities rather than importing them from the root barrel:

```ts
// Good: pulls in only the batching enhancer
import { withBatching } from '@signaltree/core/enhancers/batching';

// Also good: core-only API
import { signalTree } from '@signaltree/core';

// Avoid in apps: importing many enhancers from the root barrel
// import { withBatching, withMemoization } from '@signaltree/core';
```

This repo enforces the above via ESLint to help maintain optimal app bundle sizes.

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
import { signalTree, withMemoization } from '@signaltree/core';

const tree = signalTree({
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    value: Math.random(),
    category: `cat-${i % 10}`,
  })),
}).with(withMemoization());

// Expensive computation - automatically cached by memoization enhancer
const expensiveComputation = computed(() => {
  return tree.$.items()
    .filter((item) => item.value > 0.5)
    .reduce((acc, item) => acc + Math.sin(item.value * Math.PI), 0);
});

// The computation only runs when tree.$.items() actually changes
// Subsequent calls return cached result
```

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

Core provides basic state updates. For advanced entity management, use the built-in `withEntities` enhancer:

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

// Manual CRUD operations using core methods
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

Core provides basic state updates. For advanced async helpers, use the built-in middleware functions (`createAsyncOperation`, `trackAsync`):

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

### 5) Performance considerations

### 6) Enhancers and composition

SignalTree Core provides a complete set of built-in enhancers. Each enhancer is a focused, tree-shakeable extension that adds specific functionality.

#### Available Enhancers (All in @signaltree/core)

All enhancers are exported directly from `@signaltree/core`:

**Performance Enhancers:**

- `withBatching()` - Batch updates to reduce recomputation and rendering
- `withMemoization()` - Intelligent caching for expensive computations
- `withHighPerformanceBatching()` - Advanced batching for high-frequency updates
- `withHighPerformanceMemoization()` - Optimized memoization for large state trees

**Data Management:**

- `withEntities()` - Advanced CRUD operations for collections
- `createAsyncOperation()` - Async operation management with loading/error states
- `trackAsync()` - Track async operations in your state
- `withSerialization()` - State persistence and SSR support
- `withPersistence()` - Auto-save to localStorage/IndexedDB

**Development Tools:**

- `withDevTools()` - Redux DevTools integration
- `withTimeTravel()` - Undo/redo functionality

**Integration:**

- `withMiddleware()` - State interceptors and logging
- `createLoggingMiddleware()` - Built-in logging middleware
- `createValidationMiddleware()` - Built-in validation middleware

**Presets:**

- `createDevTree()` - Pre-configured development setup
- `TREE_PRESETS` - Common configuration patterns

#### Additional Packages

These are the **only** separate packages in the SignalTree ecosystem:

- **`@signaltree/ng-forms`** - Angular Forms integration (separate package)
- **`@signaltree/enterprise`** - Enterprise-scale optimizations for 500+ signals (separate package)
- **`@signaltree/callable-syntax`** - Build-time transform for callable syntax (dev dependency, separate package)

#### Composition Patterns

**Basic Enhancement:**

```typescript
import { signalTree, withBatching, withDevTools } from '@signaltree/core';

// Apply enhancers in order
const tree = signalTree({ count: 0 }).with(
  withBatching(), // Performance optimization
  withDevTools() // Development tools
);
```

**Performance-Focused Stack:**

```typescript
import { signalTree, withBatching, withMemoization, withEntities } from '@signaltree/core';

const tree = signalTree({
  products: [] as Product[],
  ui: { loading: false },
}).with(
  withBatching(), // Batch updates for optimal rendering
  withMemoization(), // Cache expensive computations
  withEntities() // Efficient CRUD operations
);

// Now supports advanced operations
tree.batchUpdate((state) => ({
  products: [...state.products, newProduct],
  ui: { loading: false },
}));

const products = tree.entities<Product>('products');
products.selectBy((p) => p.category === 'electronics');
```

**Full-Stack Application:**

```typescript
import { signalTree, withSerialization, withTimeTravel } from '@signaltree/core';

const tree = signalTree({
  user: null as User | null,
  preferences: { theme: 'light' },
}).with(
  // withAsync removed — API integration patterns are now covered by middleware helpers
  withSerialization({
    // Auto-save to localStorage
    autoSave: true,
    storage: 'localStorage',
  }),
  withTimeTravel() // Undo/redo support
);

// Advanced async operations
const fetchUser = tree.asyncAction(async (id: string) => api.getUser(id), {
  loadingKey: 'loading',
  onSuccess: (user) => ({ user }),
});

// Automatic state persistence
tree.$.preferences.theme('dark'); // Auto-saved

// Time travel
tree.undo(); // Revert changes
```

#### Enhancer Metadata & Ordering

Enhancers can declare metadata for automatic dependency resolution:

```typescript
// Enhancers are automatically ordered based on requirements
const tree = signalTree(state).with(
  withDevTools(), // Requires: core, provides: debugging
  withBatching(), // Requires: core, provides: batching
  withMemoization() // Requires: batching, provides: caching
);
// Automatically ordered: batching -> memoization -> devtools
```

#### Quick Start with Presets

For common patterns, use presets that combine multiple enhancers:

```typescript
import { createDevTree, TREE_PRESETS } from '@signaltree/core';

// Development preset includes: batching, memoization, devtools, time-travel
const devTree = createDevTree({
  products: [] as Product[],
  cart: { items: [], total: 0 },
});

// Or use preset configurations
const customTree = signalTree(state, TREE_PRESETS.DASHBOARD);
```

#### Core Stubs

SignalTree Core includes all enhancer functionality built-in. No separate packages needed:

```typescript
import { signalTree, withEntities } from '@signaltree/core';

const tree = signalTree({ users: [] as User[] });

// Without enhancer - use manual CRUD
tree.$.users.update((users) => [...users, newUser]);

// With enhancer - use entity helpers
const enhanced = tree.with(withEntities());
const users = enhanced.entities<User>('users');
users.add(newUser); // ✅ Advanced CRUD operations
```

Core includes several performance optimizations:

```typescript
// Lazy signal creation (default)
const tree = signalTree(
  {
    largeObject: {
      // Signals only created when accessed
      level1: { level2: { level3: { data: 'value' } } },
    },
  },
  {
    useLazySignals: true, // Default: true
  }
);

// Custom equality function
const tree2 = signalTree(
  {
    items: [] as Item[],
  },
  {
    useShallowComparison: false, // Deep equality (default)
  }
);

// Structural sharing for memory efficiency
tree.update((state) => ({
  ...state, // Reuses unchanged parts
  newField: 'value',
}));
```

## Error handling examples

### Manual async error handling

```typescript
const tree = signalTree({
  data: null as ApiData | null,
  loading: false,
  error: null as Error | null,
  retryCount: 0,
});

async function loadDataWithRetry(attempt = 0) {
  tree.$.loading.set(true);
  tree.$.error.set(null);

  try {
    const data = await api.getData();
    tree.$.data.set(data);
    tree.$.loading.set(false);
    tree.$.retryCount.set(0);
  } catch (error) {
    if (attempt < 3) {
      // Retry logic
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      return loadDataWithRetry(attempt + 1);
    }

    tree.$.loading.set(false);
    tree.$.error.set(error instanceof Error ? error : new Error('Unknown error'));
    tree.$.retryCount.update((count) => count + 1);
  }
}

// Error boundary component
@Component({
  template: `
    @if (tree.$.error()) {
    <div class="error-boundary">
      <h3>Something went wrong</h3>
      <p>{{ tree.$.error()?.message }}</p>
      <p>Attempts: {{ tree.$.retryCount() }}</p>
      <button (click)="retry()">Retry</button>
      <button (click)="clear()">Clear Error</button>
    </div>
    } @else {
    <!-- Normal content -->
    }
  `,
})
class ErrorHandlingComponent {
  tree = tree;

  retry() {
    loadDataWithRetry();
  }

  clear() {
    this.tree.$.error.set(null);
  }
}
```

### State update error handling

```typescript
const tree = signalTree({
  items: [] as Item[],
  validationErrors: [] as string[],
});

// Safe update with validation
function safeUpdateItem(id: string, updates: Partial<Item>) {
  try {
    tree.update((state) => {
      const itemIndex = state.items.findIndex((item) => item.id === id);
      if (itemIndex === -1) {
        throw new Error(`Item with id ${id} not found`);
      }

      const updatedItem = { ...state.items[itemIndex], ...updates };

      // Validation
      if (!updatedItem.name?.trim()) {
        throw new Error('Item name is required');
      }

      const newItems = [...state.items];
      newItems[itemIndex] = updatedItem;

      return {
        items: newItems,
        validationErrors: [], // Clear errors on success
      };
    });
  } catch (error) {
    tree.$.validationErrors.update((errors) => [...errors, error instanceof Error ? error.message : 'Unknown error']);
  }
}
```

## Package composition patterns

SignalTree Core is designed for modular composition. Start minimal and add features as needed.

### Basic Composition

```typescript
import { signalTree } from '@signaltree/core';

// Core provides the foundation
const tree = signalTree({
  users: [] as User[],
  ui: { loading: false },
});

// Basic operations included in core
tree.$.users.set([...users, newUser]);
tree.$.ui.loading.set(true);
tree.effect(() => console.log('State changed'));
```

### Performance-Enhanced Composition

```typescript
import { signalTree, withBatching, withMemoization } from '@signaltree/core';

// Add performance optimizations
const tree = signalTree({
  products: [] as Product[],
  filters: { category: '', search: '' },
}).with(
  withBatching(), // Batch updates for optimal rendering
  withMemoization() // Cache expensive computations
);

// Now supports batched updates
tree.batchUpdate((state) => ({
  products: [...state.products, ...newProducts],
  filters: { category: 'electronics', search: '' },
}));

// Expensive computations are automatically cached
const filteredProducts = computed(() => {
  return tree.$.products()
    .filter((p) => p.category.includes(tree.$.filters.category()))
    .filter((p) => p.name.includes(tree.$.filters.search()));
});
```

### Data Management Composition

```typescript
import { signalTree, withEntities } from '@signaltree/core';

// Add data management capabilities (+2.77KB total)
const tree = signalTree({
  users: [] as User[],
  posts: [] as Post[],
  ui: { loading: false, error: null },
}).with(
  withEntities() // Advanced CRUD operations
);

// Advanced entity operations
const users = tree.entities<User>('users');
users.add(newUser);
users.selectBy((u) => u.active);
users.updateMany([{ id: '1', changes: { status: 'active' } }]);

// Powerful async actions
const fetchUsers = tree.asyncAction(async () => api.getUsers(), {
  loadingKey: 'ui.loading',
  errorKey: 'ui.error',
  onSuccess: (users) => ({ users }),
});
```

### Full-Featured Development Composition

```typescript
import { signalTree, withBatching, withEntities, withSerialization, withTimeTravel, withDevTools } from '@signaltree/core';

// Full development stack (example)
const tree = signalTree({
  app: {
    user: null as User | null,
    preferences: { theme: 'light' },
    data: { users: [], posts: [] },
  },
}).with(
  withBatching(), // Performance
  withEntities(), // Data management
  // withAsync removed — use middleware helpers for API integration
  withSerialization({
    // State persistence
    autoSave: true,
    storage: 'localStorage',
  }),
  withTimeTravel({
    // Undo/redo
    maxHistory: 50,
  }),
  withDevTools({
    // Debug tools (dev only)
    name: 'MyApp',
    trace: true,
  })
);

// Rich feature set available
const users = tree.entities<User>('app.data.users');
const fetchUser = tree.asyncAction(api.getUser);
tree.undo(); // Time travel
tree.save(); // Persistence
```

### Production-Ready Composition

```typescript
import { signalTree, withBatching, withEntities, withSerialization } from '@signaltree/core';

// Production build (no dev tools)
const tree = signalTree(initialState).with(
  withBatching(), // Performance optimization
  withEntities(), // Data management
  // withAsync removed — use middleware helpers for API integration
  withSerialization({
    // User preferences
    autoSave: true,
    storage: 'localStorage',
    key: 'app-v1.2.3',
  })
);

// Clean, efficient, production-ready
```

### Conditional Enhancement

```typescript
import { signalTree, withBatching, withEntities, withDevTools, withTimeTravel } from '@signaltree/core';

const isDevelopment = process.env['NODE_ENV'] === 'development';

// Conditional enhancement based on environment
const tree = signalTree(state).with(
  withBatching(), // Always include performance
  withEntities(), // Always include data management
  ...(isDevelopment
    ? [
        // Development-only features
        withDevTools(),
        withTimeTravel(),
      ]
    : [])
);
```

### Preset-Based Composition

```typescript
import { createDevTree, TREE_PRESETS } from '@signaltree/core';

// Use presets for common patterns
const devTree = createDevTree({
  products: [],
  cart: { items: [], total: 0 },
  user: null,
});
// Includes: batching, memoization, devtools, time-travel

// Or use preset configurations directly
const customTree = signalTree(state, TREE_PRESETS.PERFORMANCE);
// Includes: batching, memoization optimizations
```

### Measuring bundle size

Bundle sizes depend on your build, tree-shaking, and which enhancers you include. Use the scripts in `scripts/` to analyze min+gz for your configuration.

### Migration Strategy

Start with core and grow incrementally:

```typescript
// Phase 1: Start with core
const tree = signalTree(state);

// Phase 2: Add performance when needed
const tree2 = tree.with(withBatching());

// Phase 3: Add data management for collections
const tree3 = tree2.with(withEntities());

// Phase 4: Add async for API integration
// withAsync removed — no explicit async enhancer; use middleware helpers instead

// Each phase is fully functional and production-ready
```

```typescript
// Start minimal, add features as needed
let tree = signalTree(initialState);

if (isDevelopment) {
  tree = tree.with(withDevTools());
}

if (needsPerformance) {
  tree = tree.with(withBatching(), withMemoization());
}

if (needsTimeTravel) {
  tree = tree.with(withTimeTravel());
}
```

### Service-based pattern

```typescript
@Injectable()
class AppStateService {
  private tree = signalTree({
    user: null as User | null,
    settings: { theme: 'light' as const },
  });

  // Expose specific parts
  readonly user$ = this.tree.$.user;
  readonly settings$ = this.tree.$.settings;

  // Expose specific actions
  setUser(user: User) {
    this.tree.$.user.set(user);
  }

  updateSettings(settings: Partial<Settings>) {
    this.tree.$.settings.update((current) => ({
      ...current,
      ...settings,
    }));
  }

  // For advanced features, return the tree
  getTree() {
    return this.tree;
  }
}
```

## Measuring performance

For fair, reproducible measurements that reflect your app and hardware, use the **Benchmark Orchestrator** in the demo. It calibrates runs per scenario and library, applies **real-world frequency weighting** based on research analysis, reports robust statistics, and supports CSV/JSON export. Avoid copying fixed numbers from docs; results vary.

## Example

```typescript
// Complete user management component
@Component({
  template: `
    <div class="user-manager">
      <!-- User List -->
      <div class="user-list">
        @if (userTree.$.loading()) {
        <div class="loading">Loading users...</div>
        } @else if (userTree.$.error()) {
        <div class="error">
          {{ userTree.$.error() }}
          <button (click)="loadUsers()">Retry</button>
        </div>
        } @else { @for (user of users.selectAll()(); track user.id) {
        <div class="user-card">
          <h3>{{ user.name }}</h3>
          <p>{{ user.email }}</p>
          <button (click)="editUser(user)">Edit</button>
          <button (click)="deleteUser(user.id)">Delete</button>
        </div>
        } }
      </div>

      <!-- User Form -->
      <form (ngSubmit)="saveUser()" #form="ngForm">
        <input [(ngModel)]="userTree.$.form.name()" name="name" placeholder="Name" required />
        <input [(ngModel)]="userTree.$.form.email()" name="email" type="email" placeholder="Email" required />
        <button type="submit" [disabled]="form.invalid">{{ userTree.$.form.id() ? 'Update' : 'Create' }} User</button>
        <button type="button" (click)="clearForm()">Clear</button>
      </form>
    </div>
  `,
})
class UserManagerComponent implements OnInit {
  userTree = signalTree({
    users: [] as User[],
    loading: false,
    error: null as string | null,
    form: { id: '', name: '', email: '' },
  });

  constructor(private userService: UserService) {}

  ngOnInit() {
    this.loadUsers();
  }

  async loadUsers() {
    this.userTree.$.loading.set(true);
    this.userTree.$.error.set(null);

    try {
      const users = await this.userService.getUsers();
      this.userTree.$.users.set(users);
    } catch (error) {
      this.userTree.$.error.set(error instanceof Error ? error.message : 'Load failed');
    } finally {
      this.userTree.$.loading.set(false);
    }
  }

  editUser(user: User) {
    this.userTree.$.form.set(user);
  }

  async saveUser() {
    try {
      const form = this.userTree.$.form();
      if (form.id) {
        await this.userService.updateUser(form.id, form);
        this.updateUser(form.id, form);
      } else {
        const newUser = await this.userService.createUser(form);
        this.addUser(newUser);
      }
      this.clearForm();
    } catch (error) {
      this.userTree.$.error.set(error instanceof Error ? error.message : 'Save failed');
    }
  }

  private addUser(user: User) {
    this.userTree.$.users.update((users) => [...users, user]);
  }

  private updateUser(id: string, updates: Partial<User>) {
    this.userTree.$.users.update((users) => users.map((user) => (user.id === id ? { ...user, ...updates } : user)));
  }

  deleteUser(id: string) {
    if (confirm('Delete user?')) {
      this.removeUser(id);
      this.userService.deleteUser(id).catch((error) => {
        this.userTree.$.error.set(error.message);
        this.loadUsers(); // Reload on error
      });
    }
  }

  private removeUser(id: string) {
    this.userTree.$.users.update((users) => users.filter((user) => user.id !== id));
  }

  clearForm() {
    this.userTree.$.form.set({ id: '', name: '', email: '' });
  }
}
```

    ]

}
}));

// Get entire state as plain object
const currentState = tree.unwrap();
console.log('Current app state:', currentState);

```
});
```

## Core features

### Hierarchical signal trees

```typescript
const tree = signalTree({
  user: { name: '', email: '' },
  settings: { theme: 'dark', notifications: true },
  todos: [] as Todo[],
});

// Access nested signals with full type safety
tree.$.user.name(); // string
tree.$.settings.theme.set('light');
tree.$.todos.update((todos) => [...todos, newTodo]);
```

### Manual entity management

```typescript
// Manual CRUD operations
const tree = signalTree({
  todos: [] as Todo[],
});

function addTodo(todo: Todo) {
  tree.$.todos.update((todos) => [...todos, todo]);
}

function updateTodo(id: string, updates: Partial<Todo>) {
  tree.$.todos.update((todos) => todos.map((todo) => (todo.id === id ? { ...todo, ...updates } : todo)));
}

function removeTodo(id: string) {
  tree.$.todos.update((todos) => todos.filter((todo) => todo.id !== id));
}

// Manual queries with computed signals
const todoById = (id: string) => computed(() => tree.$.todos().find((todo) => todo.id === id));
const allTodos = computed(() => tree.$.todos());
const todoCount = computed(() => tree.$.todos().length);
```

### Manual async state management

```typescript
async function loadUsers() {
  tree.$.loading.set(true);

  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error instanceof Error ? error.message : 'Unknown error');
  } finally {
    tree.$.loading.set(false);
  }
}

// Use in components
async function handleLoadUsers() {
  await loadUsers();
}
```

### Reactive effects

```typescript
// Create reactive effects
tree.effect((state) => {
  console.log(`User: ${state.user.name}, Theme: ${state.settings.theme}`);
});

// Manual subscriptions
const unsubscribe = tree.subscribe((state) => {
  // Handle state changes
});
```

## Core API reference

### signalTree()

```typescript
const tree = signalTree(initialState, config?);
```

### Tree Methods

```typescript
// State access
tree.$.property(); // Read signal value
tree.$.property.set(value); // Update signal
tree.unwrap(); // Get plain object

// Tree operations
tree.update(updater); // Update entire tree
tree.effect(fn); // Create reactive effects
tree.subscribe(fn); // Manual subscriptions
tree.destroy(); // Cleanup resources

// Extended features (built into @signaltree/core)
tree.entities<T>(key); // Entity helpers (use withEntities enhancer)
tree.asyncAction(fn, config?); // Async operations (use createAsyncOperation helper)
```

## Extending with enhancers

SignalTree Core includes all enhancers built-in:

```typescript
import { signalTree, withBatching, withMemoization, withTimeTravel } from '@signaltree/core';

// All enhancers available from @signaltree/core
const tree = signalTree(initialState).with(withBatching(), withMemoization(), withTimeTravel());
```

### Available enhancers

All enhancers are included in `@signaltree/core`:

- **withBatching()** - Batch multiple updates for better performance
- **withMemoization()** - Intelligent caching & performance optimization
- **withMiddleware()** - Middleware system & state interceptors
- **withEntities()** - Advanced entity management & CRUD operations
- **withDevTools()** - Redux DevTools integration for debugging
- **withTimeTravel()** - Undo/redo functionality & state history
- **withSerialization()** - State persistence & SSR support
- **createDevTree()** - Pre-configured development setup
- **TREE_PRESETS** - Common configuration patterns (PERFORMANCE, DASHBOARD, etc.)

## When to use core only

Perfect for:

- ✅ Simple to medium applications
- ✅ Prototype and MVP development
- ✅ When bundle size is critical
- ✅ Learning signal-based state management
- ✅ Applications with basic state needs

Consider enhancers when you need:

- ⚡ Performance optimization (withBatching, withMemoization)
- 🐛 Advanced debugging (withDevTools, withTimeTravel)
- � Entity management (withEntities)
- 🔌 Middleware patterns (withMiddleware)

Consider separate packages when you need:

- 📝 Angular forms integration (@signaltree/ng-forms)
- 🏢 Enterprise-scale optimizations (@signaltree/enterprise)
- 🎯 Callable syntax transform (@signaltree/callable-syntax)

## Migration from NgRx

```typescript
// Step 1: Create parallel tree
const tree = signalTree(initialState);

// Step 2: Gradually migrate components
// Before (NgRx)
users$ = this.store.select(selectUsers);

// After (SignalTree)
users = this.tree.$.users;

// Step 3: Replace effects with manual async operations
// Before (NgRx)
loadUsers$ = createEffect(() =>
  this.actions$.with(
    ofType(loadUsers),
    switchMap(() => this.api.getUsers())
  )
);

// After (SignalTree Core)
async loadUsers() {
  try {
    const users = await api.getUsers();
    tree.$.users.set(users);
  } catch (error) {
    tree.$.error.set(error.message);
  }
}

// Or use middleware helpers for async actions (createAsyncOperation / trackAsync)
loadUsers = tree.asyncAction(() => api.getUsers(), {
  onSuccess: (users) => ({ users }),
});
```

## Examples

### Simple Counter

```typescript
const counter = signalTree({ count: 0 });

// In component
@Component({
  template: ` <button (click)="increment()">{{ counter.$.count() }}</button> `,
})
class CounterComponent {
  counter = counter;

  increment() {
    this.counter.$.count.update((n) => n + 1);
  }
}
```

### User Management

```typescript
const userTree = signalTree({
  users: [] as User[],
  loading: false,
  error: null as string | null,
});

async function loadUsers() {
  userTree.$.loading.set(true);
  try {
    const users = await api.getUsers();
    userTree.$.users.set(users);
    userTree.$.error.set(null);
  } catch (error) {
    userTree.$.error.set(error instanceof Error ? error.message : 'Load failed');
  } finally {
    userTree.$.loading.set(false);
  }
}

function addUser(user: User) {
  userTree.$.users.update((users) => [...users, user]);
}

// In component
@Component({
  template: `
    @if (userTree.$.loading()) {
    <spinner />
    } @else { @for (user of userTree.$.users(); track user.id) {
    <user-card [user]="user" />
    } }
  `,
})
class UsersComponent {
  userTree = userTree;

  ngOnInit() {
    loadUsers();
  }

  addUser(userData: Partial<User>) {
    const newUser = { id: crypto.randomUUID(), ...userData } as User;
    addUser(newUser);
  }
}
```

## Available extension packages

All enhancers are now consolidated in the core package. The following features are available directly from `@signaltree/core`:

### Performance & Optimization

- **withBatching()** (+1.27KB gzipped) - Batch multiple updates for better performance
- **withMemoization()** (+2.33KB gzipped) - Intelligent caching & performance optimization

### Advanced Features

- **withMiddleware()** (+1.89KB gzipped) - Middleware system & state interceptors
- **withEntities()** (+0.97KB gzipped) - Enhanced CRUD operations & entity management

### Development Tools

- **withDevTools()** (+2.49KB gzipped) - Development tools & Redux DevTools integration
- **withTimeTravel()** (+1.75KB gzipped) - Undo/redo functionality & state history

### Integration & Convenience

- **withSerialization()** (+0.84KB gzipped) - State persistence & SSR support
- **ecommercePreset()** - Pre-configured setups for e-commerce applications
- **dashboardPreset()** - Pre-configured setups for dashboard applications

### Quick Start with Extensions

All enhancers are now available from the core package:

```bash
# Install only the core package - all features included
npm install @signaltree/core

# Everything is available from @signaltree/core:
import {
  signalTree,
  withBatching,
  withMemoization,
  withEntities,
  withDevTools,
  withTimeTravel,
  withSerialization,
  ecommercePreset,
  dashboardPreset
} from '@signaltree/core';
```

## Companion Packages

While `@signaltree/core` includes comprehensive built-in enhancers for most use cases, the SignalTree ecosystem also provides specialized companion packages for specific needs:

### 📝 @signaltree/ng-forms

**Angular Forms integration for SignalTree (Angular 17+)**

Seamlessly connect Angular Forms with your SignalTree state for two-way data binding, validation, and form control.

```bash
npm install @signaltree/ng-forms
```

**Features:**

- 🔗 Two-way binding between forms and SignalTree state
- ✅ Built-in validation integration
- 🎯 Type-safe form controls
- 🔄 Automatic sync between form state and tree state
- 📊 Form status tracking (valid, pristine, touched, etc.)
- ⚡ Native Signal Forms support (Angular 20.3+)
- 🔧 Legacy bridge for Angular 17-19 (deprecated, will be removed with Angular 21)

**Signal Forms (Angular 20.3+ recommended)**

Use Angular's Signal Forms `connect()` API directly with SignalTree:

```ts
import { toWritableSignal } from '@signaltree/core';

const tree = signalTree({
  user: { name: '', email: '' },
});

// Leaves are WritableSignal<T>
nameControl.connect(tree.$.user.name);

// Convert a slice to a WritableSignal<T>
const userSignal = toWritableSignal(tree.$.user);
userGroupControl.connect(userSignal);
```

The `@signaltree/ng-forms` package supports Angular 17+ and will prefer `connect()` when available (Angular 20.3+). Angular 17-19 uses a legacy bridge that will be deprecated when Angular 21 is released.

**Quick Example:**

```typescript
import { signalTree } from '@signaltree/core';
import { bindFormToTree } from '@signaltree/ng-forms';

const tree = signalTree({
  user: { name: '', email: '', age: 0 },
});

@Component({
  template: `
    <form [formGroup]="form">
      <input formControlName="name" />
      <input formControlName="email" type="email" />
      <input formControlName="age" type="number" />
    </form>
  `,
})
class UserFormComponent {
  form = new FormGroup({
    name: new FormControl(''),
    email: new FormControl(''),
    age: new FormControl(0),
  });

  constructor() {
    // Automatically sync form with tree state
    bindFormToTree(this.form, tree.$.user);
  }
}
```

**When to use:**

- Building forms with Angular Reactive Forms
- Need validation integration
- Two-way data binding between forms and state
- Complex form scenarios with nested form groups

**Learn more:** [npm package](https://www.npmjs.com/package/@signaltree/ng-forms)

---

### 🏢 @signaltree/enterprise

**Enterprise-scale optimizations for large applications**

Advanced performance optimizations designed for applications with 500+ signals and complex state trees.

```bash
npm install @signaltree/enterprise
```

**Features:**

- ⚡ PathIndex for O(k) lookup time regardless of tree size
- 🗜️ Advanced memory optimization algorithms
- 📊 Performance profiling and monitoring
- 🔍 Efficient path-based signal resolution
- 🎯 Optimized for large-scale applications

**Quick Example:**

```typescript
import { signalTree } from '@signaltree/core';
import { withEnterpriseOptimizations } from '@signaltree/enterprise';

const tree = signalTree({
  // Large application state with hundreds of signals
  modules: {
    auth: {
      /* ... */
    },
    data: {
      /* ... */
    },
    ui: {
      /* ... */
    },
    // ... many more modules
  },
}).with(
  withEnterpriseOptimizations({
    enablePathIndex: true,
    enableMemoryOptimizations: true,
    enablePerformanceMonitoring: true,
  })
);
```

**Performance Benefits:**

- **Constant-time lookups:** O(k) lookup where k is path depth, not total signal count
- **Memory efficiency:** Up to 40% reduction in memory usage for large trees
- **Faster updates:** Optimized update batching for high-frequency scenarios

**When to use:**

- Applications with 500+ signals
- Complex nested state structures (10+ levels deep)
- High-frequency state updates
- Enterprise-scale applications with performance requirements
- Need detailed performance profiling

**Learn more:** [npm package](https://www.npmjs.com/package/@signaltree/enterprise)

---

### 🛡️ @signaltree/guardrails

**Development-only performance monitoring and debugging**

Comprehensive development tools for detecting performance issues, memory leaks, and anti-patterns during development. **Zero production overhead** via conditional exports.

```bash
npm install --save-dev @signaltree/guardrails
```

**Features:**

- 🔥 Hot-path detection - identifies frequently accessed signals
- 💾 Memory leak detection - tracks signal cleanup issues
- 📊 Performance budgets - enforces performance thresholds
- ⚠️ Anti-pattern warnings - detects common mistakes
- 📈 Real-time performance metrics
- 🎯 Zero production overhead (no-op in production builds)

**Quick Example:**

```typescript
import { signalTree } from '@signaltree/core';
import { withGuardrails } from '@signaltree/guardrails';

const tree = signalTree({
  users: [] as User[],
  posts: [] as Post[],
}).with(
  withGuardrails({
    hotPathThreshold: 100, // Warn if signal accessed >100 times/sec
    memoryLeakThreshold: 50, // Warn if >50 uncleaned signals
    budgets: {
      updateTime: 16, // Warn if updates take >16ms
      signalCount: 1000, // Warn if >1000 signals created
    },
  })
);

// Development warnings will appear in console
// Production builds get no-op functions (0 overhead)
```

**Development Features:**

```typescript
import { getPerformanceMetrics, getHotPaths, checkMemoryLeaks } from '@signaltree/guardrails';

// Get detailed performance metrics
const metrics = getPerformanceMetrics();
console.log('Update time:', metrics.avgUpdateTime);
console.log('Signal count:', metrics.totalSignals);

// Identify hot paths
const hotPaths = getHotPaths();
console.log('Most accessed signals:', hotPaths);

// Check for memory leaks
const leaks = checkMemoryLeaks();
if (leaks.length > 0) {
  console.warn('Potential memory leaks:', leaks);
}
```

**Conditional Exports (Zero Production Overhead):**

```json
{
  "exports": {
    ".": {
      "development": "./dist/index.js",
      "production": "./dist/noop.js"
    }
  }
}
```

In production builds, all guardrails functions become no-ops with zero runtime cost.

**When to use:**

- During active development
- Performance optimization phase
- Debugging state management issues
- Team onboarding and code reviews
- CI/CD performance regression detection

**Learn more:** [npm package](https://www.npmjs.com/package/@signaltree/guardrails)

---

### 🎯 @signaltree/callable-syntax

**Build-time transform for callable signal syntax**

A TypeScript transformer that enables callable syntax sugar for setting signal values. This is **purely a developer experience enhancement** with zero runtime overhead.

```bash
npm install --save-dev @signaltree/callable-syntax
```

**Features:**

- 🍬 Syntactic sugar for signal updates
- ⚡ Zero runtime overhead (build-time transform)
- ✅ Full TypeScript type safety
- 🔧 Works with any build tool (Rollup, Webpack, esbuild, etc.)
- 📝 Optional - use direct `.set/.update` if preferred

**Syntax Transformation:**

```typescript
// With callable-syntax transform
tree.$.name('Jane'); // Transformed to: tree.$.name.set('Jane')
tree.$.count((n) => n + 1); // Transformed to: tree.$.count.update((n) => n + 1)

// Reading always works directly (no transform needed)
const name = tree.$.name(); // Direct Angular signal API
```

**Setup (tsconfig.json):**

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "@signaltree/callable-syntax" }]
  }
}
```

**Setup (Rollup):**

```javascript
import { callableSyntaxTransform } from '@signaltree/callable-syntax/rollup';

export default {
  plugins: [callableSyntaxTransform()],
};
```

**Important Notes:**

- **Optional:** You can always use direct `.set(value)` or `.update(fn)` syntax
- **Build-time only:** No runtime code is added to your bundle
- **Function-valued leaves:** When storing functions, use `.set(fn)` directly
- **Type-safe:** Full TypeScript support via module augmentation

**When to use:**

- Prefer shorter, more concise syntax
- Team convention favors callable style
- Migrating from other signal libraries with similar syntax
- Want familiar DX without runtime overhead

**When to skip:**

- Team prefers explicit `.set/.update` syntax
- Build pipeline doesn't support transformers
- Storing functions as signal values (use direct `.set`)

**Learn more:** [npm package](https://www.npmjs.com/package/@signaltree/callable-syntax)

---

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
