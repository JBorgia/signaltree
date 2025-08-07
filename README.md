# 🎯 NGX Signal Store

A powerful, type-safe, hierarchical signal store for Angular applications built on top of Angular Signals.

## ✨ Features

- **🏗️ Hierarchical State**: Organize state in nested structures with automatic signal creation
- **🔒 Type Safety**: Full TypeScript support with inferred types and autocomplete
- **⚡ Performance**: Optimized with batching, memoization, and shallow comparison
- **🔌 Extensible**: Plugin-based architecture with middleware support
- **🧪 Developer Experience**: Redux DevTools integration and comprehensive testing utilities
- **📦 Entity Management**: Built-in CRUD operations for collections
- **🌐 Async Support**: Integrated async action handling with loading states
- **⏰ Time Travel**: Undo/redo functionality with state history

## 🚀 Quick Start

### Installation

```bash
npm install @signal-store
```

### Basic Usage

```typescript
import { signalStore } from '@signal-store';

// Create a hierarchical store
const store = signalStore({
  user: {
    name: 'John Doe',
    email: 'john@example.com',
  },
  settings: {
    theme: 'dark',
    notifications: true,
  },
});

// Access nested state through signals
console.log(store.state.user.name()); // 'John Doe'
console.log(store.$.settings.theme()); // 'dark' ($ is shorthand for state)

// Update individual signals
store.state.user.name.set('Jane Doe');

// Update entire store
store.update((current) => ({
  ...current,
  settings: { ...current.settings, theme: 'light' },
}));

// Get plain object representation
const plainData = store.unwrap();
```

## 📚 API Reference

### Core API

#### Basic Store Operations

- `signalStore(initialState)` - Create a basic signal store
- `enhancedSignalStore(initialState, config)` - Create an enhanced store with performance features
- `store.state.*` - Access nested signals (reactive)
- `store.$.*` - Shorthand alias for state
- `store.update(updater)` - Update entire store
- `store.unwrap()` - Get plain object representation

### ⚡ Performance Features

Boost your application's performance with advanced optimization features:

```typescript
const store = enhancedSignalStore(data, {
  enablePerformanceFeatures: true,
  batchUpdates: true,
  useMemoization: true,
  trackPerformance: true,
});
```

#### Performance Methods

- `store.batchUpdate(updater)` - Batch multiple updates for better performance
- `store.computed(fn, cacheKey?)` - Create memoized computed values
- `store.optimize()` - Trigger cache cleanup and memory optimization
- `store.clearCache()` - Clear all cached computed values
- `store.getMetrics()` - Get performance metrics and statistics

### 🔌 Middleware System

Extend store functionality with a powerful middleware system:

```typescript
// Add custom middleware
store.addMiddleware({
  id: 'logger',
  before: (action, payload, state) => {
    console.log('Before:', action, state);
    return true; // Continue with action
  },
  after: (action, payload, oldState, newState) => {
    console.log('After:', action, newState);
  },
});
```

#### Middleware Methods

- `store.addMiddleware(middleware)` - Add custom middleware
- `store.removeMiddleware(id)` - Remove middleware by ID

#### Built-in Middleware

- `loggingMiddleware(storeName)` - Console logging for all actions
- `performanceMiddleware()` - Performance timing for updates
- `validationMiddleware(validator)` - State validation after updates
- `createAuditMiddleware(auditLog)` - Track state changes for compliance

### 📦 Entity Management

Manage collections with built-in CRUD operations:

```typescript
const entityStore = createEntityStore([
  { id: 1, name: 'Item 1' },
  { id: 2, name: 'Item 2' },
]);

// Or add entity helpers to existing store
const helpers = store.withEntityHelpers('items');
```

#### Entity Methods

- `store.withEntityHelpers(entityKey)` - Add entity helpers to a store property
- `entityHelpers.add(entity)` - Add new entity
- `entityHelpers.update(id, updates)` - Update entity by ID
- `entityHelpers.remove(id)` - Remove entity by ID
- `entityHelpers.upsert(entity)` - Add or update entity
- `entityHelpers.findById(id)` - Find entity by ID (signal)
- `entityHelpers.findBy(predicate)` - Find entities by condition (signal)
- `entityHelpers.selectIds()` - Get all entity IDs (signal)
- `entityHelpers.selectAll()` - Get all entities (signal)
- `entityHelpers.selectTotal()` - Get entity count (signal)

### 🌐 Async Operations

Handle asynchronous operations with integrated loading states:

```typescript
// Create async action
const loadUser = store.createAsyncAction(
  async (userId: string) => {
    return await userService.getUser(userId);
  },
  {
    loadingKey: 'loading',
    errorKey: 'error',
    onSuccess: (user, store) => {
      store.state.user.set(user);
    },
  }
);

// Use async action
await loadUser('123');
```

#### Async Methods

- `store.createAsyncAction(operation, config)` - Create async action with loading states

### ⏰ Time Travel & History

Implement undo/redo functionality:

```typescript
const store = enhancedSignalStore(data, {
  enablePerformanceFeatures: true,
  enableTimeTravel: true,
});

// Time travel operations
store.undo();
store.redo();
const history = store.getHistory();
store.resetHistory();
```

#### Time Travel Methods

- `store.undo()` - Undo last state change
- `store.redo()` - Redo previously undone change
- `store.getHistory()` - Get state change history
- `store.resetHistory()` - Clear undo/redo history

## 🛠️ Advanced Features

### Form Integration

```typescript
import { createFormStore, validators } from '@signal-store';

const form = createFormStore(
  { name: '', email: '', age: 0 },
  {
    validators: {
      name: validators.required(),
      email: validators.email(),
      age: (value) => (value < 18 ? 'Must be 18+' : null),
    },
  }
);
```

### Testing Utilities

```typescript
import { createTestStore } from '@signal-store';

const testStore = createTestStore({ count: 0 });

// Test helpers
testStore.setState({ count: 5 });
testStore.expectState({ count: 5 });
const history = testStore.getHistory();
```

### DevTools Integration

```typescript
const store = enhancedSignalStore(data, {
  enablePerformanceFeatures: true,
  enableDevTools: true,
  storeName: 'MyStore',
});
```

## Run tasks

To run the dev server for your app, use:

```sh
npx nx serve demo
```

To create a production bundle:

```sh
npx nx build demo
```

To see all available targets to run for a project, run:

```sh
npx nx show project demo
```

These targets are either [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Add new projects

While you could add new projects to your workspace manually, you might want to leverage [Nx plugins](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) and their [code generation](https://nx.dev/features/generate-code?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) feature.

Use the plugin's generator to create new projects.

To generate a new application, use:

```sh
npx nx g @nx/angular:app demo
```

To generate a new library, use:

```sh
npx nx g @nx/angular:lib mylib
```

You can use `npx nx list` to get a list of installed plugins. Then, run `npx nx list <plugin-name>` to learn about more specific capabilities of a particular plugin. Alternatively, [install Nx Console](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) to browse plugins and generators in your IDE.

[Learn more about Nx plugins &raquo;](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) | [Browse the plugin registry &raquo;](https://nx.dev/plugin-registry?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Set up CI!

### Step 1

To connect to Nx Cloud, run the following command:

```sh
npx nx connect
```

Connecting to Nx Cloud ensures a [fast and scalable CI](https://nx.dev/ci/intro/why-nx-cloud?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) pipeline. It includes features such as:

- [Remote caching](https://nx.dev/ci/features/remote-cache?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task distribution across multiple machines](https://nx.dev/ci/features/distribute-task-execution?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Automated e2e test splitting](https://nx.dev/ci/features/split-e2e-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task flakiness detection and rerunning](https://nx.dev/ci/features/flaky-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

### Step 2

## 🎮 Demo Application

Explore interactive examples and learn how to use all features:

```bash
# Run the demo application
npx nx serve demo

# Build for production
npx nx build demo

# Run tests
npx nx test ngx-signal-store
```

Visit the demo at `http://localhost:4200` to see live examples of:

- Basic store operations
- Performance comparisons
- Middleware implementations
- Entity management
- Async operations
- Time travel debugging
- Form integrations

## 📖 Examples

### Basic Counter

```typescript
const counter = signalStore({ count: 0 });

// Read value
console.log(counter.state.count()); // 0

// Update value
counter.state.count.update((n) => n + 1);
counter.state.count.set(10);
```

### Nested State

```typescript
const app = signalStore({
  user: {
    profile: { name: 'John', age: 30 },
    preferences: { theme: 'dark' },
  },
  ui: {
    loading: false,
    error: null,
  },
});

// Access nested values
app.state.user.profile.name.set('Jane');
app.$.ui.loading.set(true);
```

### Entity Collection

```typescript
interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

const todoStore = createEntityStore<Todo>([]);

// Add todo
todoStore.add({ id: '1', text: 'Learn signals', completed: false });

// Update todo
todoStore.update('1', { completed: true });

// Query todos
const activeTodos = todoStore.findBy((todo) => !todo.completed);
const todoCount = todoStore.selectTotal();
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Angular Signals](https://angular.io/guide/signals)
- Inspired by state management patterns from Redux, Zustand, and Pinia
- Developed using [Nx](https://nx.dev) workspace tools
