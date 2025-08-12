# 🌳 SignalTree Core

The foundation package for SignalTree - a powerful, type-safe, modular signal-based state management solution for Angular applications.

## ✨ What is @signaltree/core?

SignalTree Core is the lightweight (5KB) foundation that provides:

- **Hierarchical signal trees** for organized state management
- **Type-safe updates and access** with full TypeScript inference
- **Basic entity management** with CRUD operations
- **Simple async actions** with loading states
- **Form integration basics** for reactive forms

## 🚀 Quick Start

### Installation

```bash
npm install @signaltree/core
```

### Basic Usage

```typescript
import { signalTree } from '@signaltree/core';

// Create a reactive state tree
const tree = signalTree({
  user: {
    name: 'John Doe',
    email: 'john@example.com',
  },
  settings: {
    theme: 'dark',
    notifications: true,
  },
});

// Full type-safe access to nested signals
console.log(tree.$.user.name()); // 'John Doe'
tree.$.settings.theme.set('light');

// Entity management always included (lightweight)
const users = tree.asCrud('users');
users.add({ id: '1', name: 'Alice', email: 'alice@example.com' });

// Basic async actions included
const loadUser = tree.asyncAction(async (id: string) => {
  return await api.getUser(id);
});
```

## 📦 Core Features

### Hierarchical Signal Trees

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

### Basic Entity Management

```typescript
// Built-in CRUD operations (lightweight)
const todos = tree.asCrud<Todo>('todos');

todos.add({ id: '1', text: 'Learn SignalTree', done: false });
todos.update('1', { done: true });
todos.remove('1');
todos.upsert({ id: '2', text: 'Build app', done: false });

// Basic queries
const todoById = todos.findById('1');
const allTodos = todos.selectAll();
const todoCount = todos.selectTotal();
```

### Simple Async Actions

```typescript
const loadUsers = tree.asyncAction(async () => await api.getUsers(), {
  onStart: () => ({ loading: true }),
  onSuccess: (users) => ({ users, loading: false }),
  onError: (error) => ({ loading: false, error: error.message }),
});

// Use in components
async function handleLoadUsers() {
  await loadUsers();
}
```

### Reactive Effects

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

## 🎯 Core API Reference

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

// Entity management
tree.asCrud<T>(key); // Get entity helpers

// Async actions
tree.asyncAction(fn, config?); // Create async action
```

## 🔌 Extending with Optional Packages

SignalTree Core can be extended with additional features:

```typescript
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';
import { withTimeTravel } from '@signaltree/time-travel';

// Compose features using pipe
const tree = signalTree(initialState).pipe(withBatching(), withMemoization(), withTimeTravel());
```

### Available Extensions

- **@signaltree/batching** (+1KB) - Batch multiple updates
- **@signaltree/memoization** (+2KB) - Intelligent caching & performance
- **@signaltree/middleware** (+1KB) - Middleware system & taps
- **@signaltree/async** (+2KB) - Advanced async actions & states
- **@signaltree/entities** (+2KB) - Advanced entity management
- **@signaltree/devtools** (+1KB) - Redux DevTools integration
- **@signaltree/time-travel** (+3KB) - Undo/redo functionality
- **@signaltree/ng-forms** (+3KB) - Complete Angular forms integration
- **@signaltree/presets** (+0.5KB) - Environment-based configurations

## 🎯 When to Use Core Only

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

## 🔄 Migration from NgRx

```typescript
// Step 1: Create parallel tree
const tree = signalTree(initialState);

// Step 2: Gradually migrate components
// Before (NgRx)
users$ = this.store.select(selectUsers);

// After (SignalTree)
users = this.tree.$.users;

// Step 3: Replace effects with async actions
// Before (NgRx)
loadUsers$ = createEffect(() =>
  this.actions$.pipe(
    ofType(loadUsers),
    switchMap(() => this.api.getUsers())
  )
);

// After (SignalTree)
loadUsers = tree.asyncAction(() => api.getUsers(), {
  onSuccess: (users, tree) => tree.$.users.set(users),
});
```

## 📖 Examples

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

const users = userTree.asCrud<User>('users');

const loadUsers = userTree.asyncAction(async () => await api.getUsers(), {
  onStart: () => ({ loading: true }),
  onSuccess: (users) => ({ users, loading: false, error: null }),
  onError: (error) => ({ loading: false, error: error.message }),
});

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
    users.add({ id: crypto.randomUUID(), ...userData });
  }
}
```

## � Available Extension Packages

Extend the core with optional feature packages:

### Performance & Optimization

- **[@signaltree/batching](../batching)** (+1KB) - Batch multiple updates for better performance
- **[@signaltree/memoization](../memoization)** (+2KB) - Intelligent caching & performance optimization

### Advanced Features

- **[@signaltree/middleware](../middleware)** (+1KB) - Middleware system & state interceptors
- **[@signaltree/async](../async)** (+2KB) - Advanced async operations & loading states
- **[@signaltree/entities](../entities)** (+2KB) - Enhanced CRUD operations & entity management

### Development Tools

- **[@signaltree/devtools](../devtools)** (+1KB) - Development tools & Redux DevTools integration
- **[@signaltree/time-travel](../time-travel)** (+3KB) - Undo/redo functionality & state history

### Integration & Convenience

- **[@signaltree/presets](../presets)** (+0.5KB) - Pre-configured setups for common patterns
- **[@signaltree/ng-forms](../ng-forms)** (+3KB) - Complete Angular Forms integration

### Quick Start with Extensions

```bash
# Performance-focused setup
npm install @signaltree/core @signaltree/batching @signaltree/memoization

# Full development setup
npm install @signaltree/core @signaltree/batching @signaltree/memoization @signaltree/devtools @signaltree/time-travel

# All packages (full-featured)
npm install @signaltree/core @signaltree/batching @signaltree/memoization @signaltree/middleware @signaltree/async @signaltree/entities @signaltree/devtools @signaltree/time-travel @signaltree/presets @signaltree/ng-forms
```

## �🔗 Links

- [SignalTree Documentation](https://signaltree.io)
- [GitHub Repository](https://github.com/JBorgia/signaltree)
- [NPM Package](https://www.npmjs.com/package/@signaltree/core)
- [Interactive Examples](https://signaltree.io/examples)

## 📄 License

MIT License with AI Training Restriction - see the [LICENSE](../../LICENSE) file for details.

---

**Ready to get started?** This core package provides everything you need for most applications. Add extensions only when you need them! 🚀
