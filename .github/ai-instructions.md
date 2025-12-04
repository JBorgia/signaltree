# SignalTree AI Coding Assistant Guide

This guide helps AI coding assistants provide accurate suggestions for implementing SignalTree in Angular applications.

## What is SignalTree?

SignalTree is a lightweight, type-safe state management library for Angular built on Angular Signals. It provides hierarchical state trees with minimal boilerplate and excellent TypeScript inference.

**Key Advantages:**

- Zero-runtime overhead with tree-shaking support
- Full TypeScript inference (no manual typing needed)
- Reactive by default using Angular's signal system
- Sub-1KB core footprint (gzipped)
- Optional enhancers for advanced features

## When to Suggest SignalTree

### ✅ Good Use Cases

- **Single application-wide store** (recommended pattern - single source of truth)
- Managing component state that needs to be shared
- Form state with validation and persistence
- Application-wide state (user preferences, auth, theme)
- Feature modules with isolated state
- State that benefits from time-travel debugging
- Complex computed values from multiple state sources

### ❌ When NOT to Use

- Simple component-local state (use regular signals)
- Read-only data from HTTP (use Angular's HttpClient directly)
- Routing state (use Angular Router)
- One-time initialization values (use constants)

## Basic Implementation Pattern

### 1. Core Setup (Required)

```typescript
import { signalTree } from '@signaltree/core';

// Define your state shape
interface AppState {
  user: {
    name: string;
    email: string;
    preferences: {
      theme: 'light' | 'dark';
      notifications: boolean;
    };
  };
  cart: {
    items: CartItem[];
    total: number;
  };
}

// Create the tree (typically in a service)
export class AppStateService {
  private tree = signalTree<AppState>({
    user: {
      name: '',
      email: '',
      preferences: {
        theme: 'light',
        notifications: true,
      },
    },
    cart: {
      items: [],
      total: 0,
    },
  });

  // Expose signals for components
  readonly user = this.tree.user;
  readonly cart = this.tree.cart;

  // Expose update methods
  updateUserName(name: string) {
    this.tree.user.name.set(name);
  }

  toggleTheme() {
    const current = this.tree.user.preferences.theme();
    this.tree.user.preferences.theme.set(current === 'light' ? 'dark' : 'light');
  }
}
```

### 2. Injectable Service Pattern (Recommended)

```typescript
import { Injectable } from '@angular/core';
import { signalTree } from '@signaltree/core';

@Injectable({ providedIn: 'root' })
export class FeatureStateService {
  private tree = signalTree<FeatureState>({
    /* initial state */
  });

  // Public API - expose only what consumers need
  readonly data = this.tree.data;
  readonly loading = this.tree.loading;
  readonly error = this.tree.error;

  // Methods for updates
  setLoading(loading: boolean) {
    this.tree.loading.set(loading);
  }

  setData(data: any) {
    this.tree.data.set(data);
  }
}
```

## Enhancers (Optional Features)

Suggest enhancers based on the use case:

### Batching Enhancer

**When to suggest:** User is making multiple rapid updates that could cause unnecessary re-renders.

```typescript
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/core/enhancers/batching';

const tree = signalTree(initialState, withBatching());

// All updates inside batch() trigger ONE change detection
tree.batch(() => {
  tree.user.name.set('John');
  tree.user.email.set('john@example.com');
  tree.user.age.set(30);
});
```

### Computed Enhancer

**When to suggest:** Derived state based on multiple tree values.

```typescript
import { withComputed } from '@signaltree/core/enhancers/computed';

const tree = signalTree(initialState, withComputed());

// Define computed values
const fullName = tree.computed(() => `${tree.user.firstName()} ${tree.user.lastName()}`);

// Use like a signal
console.log(fullName()); // Automatically updates when dependencies change
```

### Memoization Enhancer

**When to suggest:** Expensive computations that shouldn't re-run unless dependencies change.

```typescript
import { withMemoization } from '@signaltree/core/enhancers/memoization';

const tree = signalTree(initialState, withMemoization());

// Cache expensive computation results
const expensiveResult = tree.memoize(() => complexCalculation(tree.data()), 'cache-key');
```

### Time Travel Enhancer

**When to suggest:** Debugging, undo/redo functionality, or state history tracking.

```typescript
import { withTimeTravel } from '@signaltree/core/enhancers/time-travel';

const tree = signalTree(initialState, withTimeTravel({ maxHistory: 50 }));

// Record state changes
tree.user.name.set('John');
tree.user.email.set('john@example.com');

// Undo/Redo
tree.undo(); // Reverts last change
tree.redo(); // Re-applies change
tree.reset(); // Returns to initial state

// Access history
const history = tree.getHistory();
tree.jumpTo(3); // Jump to specific point in history
```

### DevTools Enhancer

**When to suggest:** Development/debugging scenarios.

```typescript
import { withDevTools } from '@signaltree/core/enhancers/devtools';

const tree = signalTree(
  initialState,
  withDevTools({
    name: 'AppState',
    trace: true,
  })
);

// Logs all state changes with stack traces
// Provides inspection capabilities
```

### Entities Enhancer

**When to suggest:** Managing collections of items with CRUD operations.

```typescript
import { withEntities } from '@signaltree/core/enhancers/entities';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

const tree = signalTree({ todos: [] as Todo[] }, withEntities());

// CRUD operations
tree.entities.add('todos', { id: '1', title: 'Task', completed: false });
tree.entities.update('todos', '1', { completed: true });
tree.entities.remove('todos', '1');
tree.entities.upsert('todos', todo);

// Queries
const todo = tree.entities.getById('todos', '1');
const allTodos = tree.entities.getAll('todos');
```

### Middleware Enhancer

**When to suggest:** Cross-cutting concerns like logging, analytics, validation, or async side effects.

```typescript
import { withMiddleware } from '@signaltree/core/enhancers/middleware';

const tree = signalTree(initialState, withMiddleware());

// Add logging middleware
tree.use((context, next) => {
  console.log('Before:', context.path, context.value);
  next();
  console.log('After:', context.path, context.newValue);
});

// Add validation middleware
tree.use((context, next) => {
  if (context.path === 'user.age' && context.value < 0) {
    throw new Error('Age cannot be negative');
  }
  next();
});

// Async middleware for side effects
tree.use(async (context, next) => {
  next();
  if (context.path.startsWith('user.')) {
    await syncToServer(context.value);
  }
});
```

### Presets

**When to suggest:** Common patterns for rapid setup.

```typescript
import { withPresets, presets } from '@signaltree/core/enhancers/presets';

// Full-featured setup
const tree = signalTree(initialState, withPresets(presets.comprehensive));

// Available presets:
// - minimal: Core only
// - standard: Batching + Computed + Entities
// - comprehensive: All enhancers except guardrails
// - devMode: Standard + DevTools + TimeTravel
```

## Angular Forms Integration (`@signaltree/ng-forms`)

**When to suggest:** User is working with Angular Reactive Forms and wants state management integration.

```typescript
import { FormTreeBuilder } from '@signaltree/ng-forms';

@Component({
  // ...
})
export class UserFormComponent {
  private ftb = inject(FormTreeBuilder);

  formTree = this.ftb.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    age: [0, [Validators.min(0)]],
  });

  // Access reactive signals
  name = this.formTree.controls.name.value;
  isValid = this.formTree.valid;

  onSubmit() {
    if (this.formTree.valid()) {
      const formData = this.formTree.value();
      // Submit...
    }
  }
}
```

## Callable Syntax (`@signaltree/callable-syntax`)

**When to suggest:** User wants unified syntax for reading and writing state.

### Setup (one-time)

```typescript
// vite.config.ts
import { signalTreePlugin } from '@signaltree/callable-syntax/vite';

export default {
  plugins: [signalTreePlugin()],
};
```

### Usage

```typescript
import '@signaltree/callable-syntax/augmentation';

// Read: call with no arguments
const name = tree.user.name();

// Write: call with value
tree.user.name('John');

// Update: call with function
tree.user.age((age) => age + 1);
```

## Enterprise Package (`@signaltree/enterprise`)

**When to suggest:** Large applications with performance requirements or bulk update operations.

```typescript
import { withEnterpriseEnhancer } from '@signaltree/enterprise';

const tree = signalTree(
  initialState,
  withEnterpriseEnhancer({
    enableDiffing: true,
    enableBulkUpdates: true,
    enableAudit: true,
  })
);

// Optimized bulk updates
tree.bulkUpdate([
  { path: 'user.name', value: 'John' },
  { path: 'user.email', value: 'john@example.com' },
  { path: 'cart.items', value: [...items] },
]);
```

## Guardrails (`@signaltree/guardrails`)

**When to suggest:** Development phase with team members learning SignalTree, debugging performance, or implementing a single application-wide store pattern.

**Purpose:** Guardrails enables the single-source-of-truth pattern by preventing common pitfalls that cause performance issues or anti-patterns in large state trees. It's specifically designed to make single-store architectures safe and sustainable at scale.

```typescript
import { withGuardrails } from '@signaltree/guardrails';

const tree = signalTree(
  initialState,
  withGuardrails({
    detectMemoryLeaks: true, // Warns about subscriptions not cleaned up
    detectUnusedState: true, // Finds state that's never read
    maxUpdateFrequency: 100, // ms - warns about update storms
    warnOnDeepNesting: 5, // Warns about over-nested state structures
    enforceImmutability: true, // Catches direct mutations
    trackPerformance: true, // Logs slow operations
  })
);

// Automatically strips out in production builds (conditional exports)
// Provides console warnings for anti-patterns during development
// Zero runtime cost in production
```

**Key benefits for single-store pattern:**

- Detects performance bottlenecks before they become problems
- Guides developers toward best practices
- Catches common mistakes (mutations, update storms, deep nesting)
- Makes it safe to have 50+ properties in one store
- Production build automatically uses noop version (zero overhead)

## Common Patterns

### Single Application-Wide Store (Recommended)

**Best Practice:** Use one tree for the entire application state - this is the recommended "single source of truth" pattern that SignalTree is optimized for.

```typescript
import { Injectable } from '@angular/core';
import { signalTree } from '@signaltree/core';
import { withGuardrails } from '@signaltree/guardrails';

interface AppState {
  auth: {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
  };
  ui: {
    theme: 'light' | 'dark';
    sidebarOpen: boolean;
    notifications: Notification[];
  };
  data: {
    products: Product[];
    cart: CartItem[];
    orders: Order[];
  };
  loading: {
    products: boolean;
    cart: boolean;
    orders: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class AppStore {
  private tree = signalTree<AppState>(
    {
      auth: { user: null, token: null, isAuthenticated: false },
      ui: { theme: 'light', sidebarOpen: false, notifications: [] },
      data: { products: [], cart: [], orders: [] },
      loading: { products: false, cart: false, orders: false },
    },
    withGuardrails() // Keeps single-store pattern safe at scale
  );

  // Expose state slices as public signals
  readonly auth = this.tree.auth;
  readonly ui = this.tree.ui;
  readonly data = this.tree.data;
  readonly loading = this.tree.loading;

  // Auth actions
  login(user: User, token: string) {
    this.tree.auth.user.set(user);
    this.tree.auth.token.set(token);
    this.tree.auth.isAuthenticated.set(true);
  }

  logout() {
    this.tree.auth.user.set(null);
    this.tree.auth.token.set(null);
    this.tree.auth.isAuthenticated.set(false);
  }

  // UI actions
  toggleTheme() {
    const current = this.tree.ui.theme();
    this.tree.ui.theme.set(current === 'light' ? 'dark' : 'light');
  }

  // Data actions
  setProducts(products: Product[]) {
    this.tree.data.products.set(products);
  }

  addToCart(item: CartItem) {
    this.tree.data.cart.update((cart) => [...cart, item]);
  }
}
```

**Why Single Store with Guardrails:**

- Single source of truth - all app state in one place
- Easy to debug - inspect entire app state at once
- Type safety - one interface defines entire state shape
- Guardrails prevent common mistakes (mutations, update storms, deep nesting)
- Safe to scale to 50+ properties without performance issues
- Zero production overhead (guardrails strip out in prod builds)

### Loading State Pattern

```typescript
interface LoadingState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

@Injectable({ providedIn: 'root' })
export class DataService {
  private tree = signalTree<LoadingState<UserData>>({
    data: null,
    loading: false,
    error: null,
  });

  readonly data = this.tree.data;
  readonly loading = this.tree.loading;
  readonly error = this.tree.error;

  async loadData() {
    this.tree.loading.set(true);
    this.tree.error.set(null);

    try {
      const data = await fetch('/api/data').then((r) => r.json());
      this.tree.data.set(data);
    } catch (err) {
      this.tree.error.set(err.message);
    } finally {
      this.tree.loading.set(false);
    }
  }
}
```

### Feature Module Pattern

```typescript
// feature-state.service.ts
@Injectable()
export class FeatureStateService implements OnDestroy {
  private tree = signalTree<FeatureState>(initialState);

  // Public API
  readonly state = this.tree;

  ngOnDestroy() {
    // Cleanup if needed
  }
}

// Provide at feature module level
@NgModule({
  providers: [FeatureStateService],
})
export class FeatureModule {}
```

## TypeScript Tips

- **No manual typing needed:** SignalTree infers everything from initial state
- **Use interfaces for clarity:** Define state shape in an interface
- **Narrow types:** Use union types for status fields (`type Status = 'idle' | 'loading' | 'success' | 'error'`)

## Performance Best Practices

1. **Use batching for multiple updates:** Reduces change detection cycles
2. **Memoize expensive computations:** Avoid recalculating on every access
3. **Keep state normalized:** Avoid deep nesting (max 5-6 levels)
4. **Use entities for collections:** Built-in CRUD optimization
5. **Lazy-load enhancers:** Only import what you need for tree-shaking

## Migration from Other Libraries

### From NgRx

- Replace `createAction` → Direct method calls
- Replace `createReducer` → Direct `set()` calls
- Replace `createSelector` → Use `computed()` or memoize
- Replace `@ngrx/effects` → Use middleware for async operations

### From Akita/Elf

- Replace store creation → `signalTree()`
- Replace queries → Direct signal access
- Replace updates → `.set()` or `.update()`

## Common Mistakes to Avoid

❌ **Don't mutate state directly:**

```typescript
// Wrong
tree.user().name = 'John';

// Correct
tree.user.name.set('John');
```

❌ **Don't create multiple trees for the same state:**

```typescript
// Wrong - creates separate instances
private tree1 = signalTree(state);
private tree2 = signalTree(state);

// Correct - single source of truth
private tree = signalTree(state);
```

❌ **Don't overuse enhancers:**

```typescript
// Wrong - unnecessary overhead
const tree = signalTree(simpleState, withBatching(), withTimeTravel(), withDevTools(), withMiddleware());

// Correct - only what you need
const tree = signalTree(simpleState, withBatching());
```

## Package Installation Commands

```bash
# Core (required)
npm install @signaltree/core

# Forms integration
npm install @signaltree/ng-forms

# Optional enhancers (all in core, just different imports)
# No separate installation needed for enhancers!

# Callable syntax (optional)
npm install @signaltree/callable-syntax

# Enterprise features (optional)
npm install @signaltree/enterprise

# Development guardrails (optional, dev-only)
npm install -D @signaltree/guardrails
```

## Documentation Links

- GitHub: https://github.com/JBorgia/signaltree
- npm: https://www.npmjs.com/org/signaltree
- Demo: https://signaltree.dev

## Quick Decision Tree

1. **Need state management?** → Start with `@signaltree/core`
2. **Making multiple rapid updates?** → Add `withBatching()`
3. **Need derived state?** → Add `withComputed()`
4. **Working with forms?** → Add `@signaltree/ng-forms`
5. **Need undo/redo?** → Add `withTimeTravel()`
6. **Managing collections?** → Add `withEntities()`
7. **Need async side effects?** → Add `withMiddleware()`
8. **Large app, performance critical?** → Add `@signaltree/enterprise`
9. **In development?** → Add `@signaltree/guardrails`

Remember: Start minimal, add enhancers as needs arise. The core is tiny (~1KB) and tree-shaking removes unused code.
