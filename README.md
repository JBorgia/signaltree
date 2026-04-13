<div align="center">
  <img src="apps/demo/public/signaltree.svg" alt="SignalTree Logo" width="120" height="120" style="background: transparent;" />
  <h1>SignalTree</h1>
  <p><strong>Reactive JSON for Angular</strong></p>
  <p>JSON branches, reactive leaves. No actions. No reducers. No selectors.</p>

  <p>
    <a href="https://jborgia.github.io/signaltree/" target="_blank"><strong>Live Demo</strong></a>
    &nbsp;|&nbsp;
    <a href="https://www.npmjs.com/package/@signaltree/core" target="_blank">npm</a>
    &nbsp;|&nbsp;
    <a href="https://github.com/JBorgia/signaltree" target="_blank">GitHub</a>
  </p>
</div>

## Mental Model

A SignalTree turns a plain JSON object into a tree of Angular signals. Each leaf becomes a `WritableSignal`. You read and write state the same way you'd use any Angular signal — no new concepts.

```typescript
import { signalTree } from '@signaltree/core';

// Create a tree from plain JSON
const store = signalTree({
  user: { name: 'Alice', age: 30 },
  settings: { theme: 'dark' },
});

// Read (returns the current value, like signal())
store.$.user.name(); // 'Alice'

// Write (like signal.set())
store.$.user.name.set('Bob');

// Update the whole tree
store({ user: { name: 'Carol', age: 25 }, settings: { theme: 'light' } });
```

In templates, `store.$.user.name()` works exactly like any other signal.

## Install

```bash
npm install @signaltree/core
```

Requires Angular 17+ (signals support).

## Enhancers

Enhancers add capabilities via `.with()`. Each is opt-in and tree-shakeable.

```typescript
import { signalTree, batching, memoization, devTools, timeTravel } from '@signaltree/core';

const store = signalTree({ count: 0, items: [] })
  .with(batching()) // Batch change notifications
  .with(memoization()) // Cache derived computations
  .with(timeTravel()) // Undo/redo
  .with(devTools()); // Redux DevTools integration
```

| Enhancer          | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `batching()`      | Batch change detection notifications for performance   |
| `memoization()`   | Cache selectors with configurable TTL and LRU eviction |
| `timeTravel()`    | Undo/redo with configurable history depth              |
| `devTools()`      | Redux DevTools integration with path-based actions     |
| `effects()`       | Reactive side effects tied to tree lifecycle           |
| `serialization()` | JSON serialize/deserialize with type preservation      |
| `persistence()`   | Auto-save/load to localStorage or custom storage       |

## Markers

Markers declare special node behavior at tree creation time:

```typescript
import { signalTree, entityMap, status, stored } from '@signaltree/core';

const store = signalTree({
  users: entityMap<User>(), // Normalized entity collection
  loadingState: status(), // Loading/success/error tracking
  preference: stored('pref-key'), // Auto-persisted to localStorage
});
```

## Subpath Imports

Specialized APIs are available as subpath imports to keep the main barrel small:

```typescript
import { TREE_PRESETS, createDevTree } from '@signaltree/core/presets';
import { SecurityValidator } from '@signaltree/core/security';
import { createEditSession } from '@signaltree/core/edit-session';
```

## Lifecycle

Every tree has a `destroy()` method that cleans up all resources — signals, enhancer timers, caches, and DevTools connections:

```typescript
const store = signalTree({ data: null }).with(batching()).with(devTools());

// Later, when done:
store.destroy(); // All enhancer resources cleaned up automatically
```

The `destroyed` signal lets you check tree status: `store.destroyed()`.

## Optional Packages

| Package                       | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `@signaltree/ng-forms`        | Angular reactive forms integration       |
| `@signaltree/enterprise`      | Diff-based updates for 500+ signal trees |
| `@signaltree/callable-syntax` | Build-time DX transform (dev dependency) |

## When to Use SignalTree

**Good fit:**

- Apps with structured, hierarchical state (settings, user profiles, forms)
- Teams that want signal-based state without boilerplate
- Projects where undo/redo or DevTools integration matter

**Consider alternatives when:**

- You need event-sourcing or CQRS patterns (use NgRx Store)
- Your state is flat key-value pairs (a `Map` or individual signals suffice)
- You're building a tiny app with one or two signals

## API Summary

```typescript
// Create
const tree = signalTree(initialState);
const tree = signalTree(initialState, config);

// Read
tree(); // Full state snapshot
tree.$.path.to.leaf(); // Leaf signal value

// Write
tree(newState); // Replace full state
tree.$.path.to.leaf.set(v); // Set leaf
tree.$.path.to.leaf.update(fn); // Update leaf

// Enhance
tree.with(enhancer()); // Add capabilities

// Lifecycle
tree.destroy(); // Clean up all resources
tree.destroyed(); // Check if destroyed
tree.registerCleanup(fn); // Register custom cleanup
```

## Documentation

- [Architecture Guide](docs/architecture/)
- [Custom Enhancers](docs/guides/custom-enhancers.md)
- [Performance Methodology](docs/performance/methodology.md)

## Contributing

Contributions welcome. Please run `npm run validate:all` before submitting PRs.

## License

MIT — see [LICENSE](LICENSE).
