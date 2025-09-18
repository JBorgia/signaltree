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

When combined with `@signaltree/memoization`, computed values become even more powerful:

```typescript
import { withMemoization } from '@signaltree/memoization';

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

Core provides basic state updates - entity management requires `@signaltree/entities`:

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

Core provides basic state updates - async helpers are now provided via `@signaltree/middleware` helpers:

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

SignalTree Core provides the foundation, but its real power comes from composable enhancers. Each enhancer is a focused, tree-shakeable extension that adds specific functionality.

#### Available Enhancers

**Performance Enhancers:**

- `@signaltree/batching` - Batch updates to reduce recomputation and rendering
- `@signaltree/memoization` - Intelligent caching for expensive computations

**Data Management:**

- `@signaltree/entities` - Advanced CRUD operations for collections
- Async helpers are provided via `@signaltree/middleware` (createAsyncOperation / trackAsync)
- `@signaltree/serialization` - State persistence and SSR support

**Development Tools:**

- `@signaltree/devtools` - Redux DevTools integration
- `@signaltree/time-travel` - Undo/redo functionality

**Integration:**

- `@signaltree/ng-forms` - Angular Forms integration
- `@signaltree/middleware` - State interceptors and logging
- `@signaltree/presets` - Pre-configured common patterns

#### Composition Patterns

**Basic Enhancement:**

```typescript
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withDevtools } from '@signaltree/devtools';

// Apply enhancers in order
const tree = signalTree({ count: 0 }).with(
  withBatching(), // Performance optimization
  withDevtools() // Development tools
);
```

**Performance-Focused Stack:**

```typescript
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';
import { withEntities } from '@signaltree/entities';

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
import { withSerialization } from '@signaltree/serialization';
import { withTimeTravel } from '@signaltree/time-travel';

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
  withDevtools(), // Requires: core, provides: debugging
  withBatching(), // Requires: core, provides: batching
  withMemoization() // Requires: batching, provides: caching
);
// Automatically ordered: batching -> memoization -> devtools
```

#### Quick Start with Presets

For common patterns, use presets that combine multiple enhancers:

```typescript
import { ecommercePreset, dashboardPreset } from '@signaltree/presets';

// E-commerce preset includes: entities, async, batching, serialization
const ecommerceTree = ecommercePreset({
  products: [] as Product[],
  cart: { items: [], total: 0 },
});

// Dashboard preset includes: batching, memoization, devtools
const dashboardTree = dashboardPreset({
  metrics: { users: 0, revenue: 0 },
  charts: { data: [] },
});
```

#### Core Stubs

SignalTree Core includes lightweight stubs for all enhancer methods. This allows you to write code that uses advanced features, and the methods will warn when the actual enhancer isn't installed:

```typescript
const tree = signalTree({ users: [] as User[] });

// Works but warns: "Feature requires @signaltree/entities"
const users = tree.entities<User>('users');
users.add(newUser); // Warns: "Method requires @signaltree/entities"

// Install the enhancer to enable full functionality
const enhanced = tree.with(withEntities());
const realUsers = enhanced.entities<User>('users');
realUsers.add(newUser); // ✅ Works perfectly
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
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';

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
import { signalTree } from '@signaltree/core';
import { withEntities } from '@signaltree/entities';

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
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withEntities } from '@signaltree/entities';
import { withSerialization } from '@signaltree/serialization';
import { withTimeTravel } from '@signaltree/time-travel';
import { withDevtools } from '@signaltree/devtools';

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
  withDevtools({
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
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withEntities } from '@signaltree/entities';
import { withSerialization } from '@signaltree/serialization';

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
import { signalTree } from '@signaltree/core';
import { withDevtools } from '@signaltree/devtools';
import { withTimeTravel } from '@signaltree/time-travel';

const isDevelopment = process.env['NODE_ENV'] === 'development';

// Conditional enhancement based on environment
const tree = signalTree(state).with(
  withBatching(), // Always include performance
  withEntities(), // Always include data management
  ...(isDevelopment
    ? [
        // Development-only features
        withDevtools(),
        withTimeTravel(),
      ]
    : [])
);
```

### Preset-Based Composition

```typescript
import { ecommercePreset, dashboardPreset } from '@signaltree/presets';

// Use presets for common patterns
const ecommerceTree = ecommercePreset({
  products: [],
  cart: { items: [], total: 0 },
  user: null,
});
// Includes: entities, async, batching, serialization

const dashboardTree = dashboardPreset({
  metrics: {},
  charts: [],
  filters: {},
});
// Includes: batching, memoization, devtools
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

// Extended features (require additional packages)
tree.entities<T>(key); // Entity helpers (requires @signaltree/entities)
// tree.asyncAction(fn, config?) example removed — use middleware helpers instead
tree.asyncAction(fn, config?); // Create async action
```

## Extending with optional packages

SignalTree Core can be extended with additional features:

```typescript
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';
import { withTimeTravel } from '@signaltree/time-travel';

// Compose features using .with(...)
const tree = signalTree(initialState).with(withBatching(), withMemoization(), withTimeTravel());
```

### Available extensions

- **@signaltree/batching** - Batch multiple updates
- **@signaltree/memoization** - Intelligent caching & performance
- **@signaltree/middleware** - Middleware system & taps
- Async helpers moved to `@signaltree/middleware` - advanced async operations & loading states
- **@signaltree/entities** - Advanced entity management
- **@signaltree/devtools** - Redux DevTools integration
- **@signaltree/time-travel** - Undo/redo functionality
- **@signaltree/ng-forms** - Complete Angular forms integration
- **@signaltree/serialization** - State persistence & SSR support
- **@signaltree/presets** - Environment-based configurations

## When to use core only

Perfect for:

- ✅ Simple to medium applications
- ✅ Prototype and MVP development
- ✅ When bundle size is critical
- ✅ Learning signal-based state management
- ✅ Applications with basic state needs

Consider extensions when you need:

- ⚡ Performance optimization (batching, memoization)
- 🐛 Advanced debugging (devtools, time-travel)
- 📝 Complex forms (ng-forms)
- 🔧 Middleware patterns (middleware)

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

Extend the core with optional feature packages:

### Performance & Optimization

- **[@signaltree/batching](../batching)** (+1.27KB gzipped) - Batch multiple updates for better performance
- **[@signaltree/memoization](../memoization)** (+2.33KB gzipped) - Intelligent caching & performance optimization

### Advanced Features

- **[@signaltree/middleware](../middleware)** (+1.89KB gzipped) - Middleware system & state interceptors
- Async helpers moved to middleware package (see `packages/middleware`)
- **[@signaltree/entities](../entities)** (+0.97KB gzipped) - Enhanced CRUD operations & entity management

### Development Tools

- **[@signaltree/devtools](../devtools)** (+2.49KB gzipped) - Development tools & Redux DevTools integration
- **[@signaltree/time-travel](../time-travel)** (+1.75KB gzipped) - Undo/redo functionality & state history

### Integration & Convenience

- **[@signaltree/presets](../presets)** (+0.84KB gzipped) - Pre-configured setups for common patterns
- **[@signaltree/ng-forms](../ng-forms)** (+3.38KB gzipped) - Complete Angular Forms integration

### Quick Start with Extensions

```bash
# Performance-focused setup
npm install @signaltree/core @signaltree/batching @signaltree/memoization

# Full development setup
npm install @signaltree/core @signaltree/batching @signaltree/memoization @signaltree/devtools @signaltree/time-travel

# All packages (full-featured)
npm install @signaltree/core @signaltree/batching @signaltree/memoization @signaltree/middleware @signaltree/entities @signaltree/devtools @signaltree/time-travel @signaltree/presets @signaltree/ng-forms
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
