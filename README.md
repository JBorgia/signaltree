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

const store = signalTree({
  user: { name: 'Alice', age: 30 },
  settings: { theme: 'dark' },
});

// Read — just call it, like any signal
store.$.user.name(); // 'Alice'

// Write — set, update, or replace
store.$.user.name.set('Bob');
store.$.user.age.update((n) => n + 1);
store({ user: { name: 'Carol', age: 25 }, settings: { theme: 'light' } });
```

In templates, `store.$.user.name()` works exactly like any other signal.

## Install

```bash
npm install @signaltree/core
```

Requires Angular 17+ (signals support).

## Entity Collections

The `entityMap()` marker gives any node a normalized collection with full reactive CRUD:

```typescript
import { signalTree, entityMap } from '@signaltree/core';

const store = signalTree({
  users: entityMap<User, number>({ selectId: (u) => u.id }),
});

store.$.users.setAll([
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]);
store.$.users.addOne({ id: 3, name: 'Carol' });
store.$.users.updateOne(1, { name: 'Alice V2' });
store.$.users.removeOne(2);

// Reactive queries — all return signals
store.$.users.all(); // Signal<User[]>
store.$.users.byId(1); // Signal<User | undefined>
store.$.users.count(); // Signal<number>
store.$.users.where((u) => u.active); // Signal<User[]>
```

Additional methods: `addMany`, `upsertOne`, `upsertMany`, `updateMany`, `updateWhere`, `removeMany`, `removeWhere`, `clear`, `has`, `ids`, `find`.

## Markers

Markers declare special node behavior at tree creation time:

```typescript
import { signalTree, entityMap, status, stored } from '@signaltree/core';

const store = signalTree({
  users: entityMap<User>(), // Normalized entity collection (see above)
  loadingState: status(), // Loading/success/error tracking
  preference: stored('pref-key'), // Auto-persisted to localStorage
});

store.$.loadingState.setLoading();
store.$.loadingState.setSuccess(data);
store.$.loadingState.isLoading(); // Signal<boolean>
```

## Enhancers

Enhancers add capabilities via `.with()`. Each is opt-in and tree-shakeable. Duplicate detection prevents applying the same enhancer twice.

```typescript
import { signalTree, batching, devTools, timeTravel } from '@signaltree/core';

const store = signalTree({ count: 0, items: [] })
  .with(batching()) // Batch change notifications
  .with(timeTravel({ maxHistory: 50 })) // Undo/redo with 50-step history
  .with(devTools()); // Redux DevTools integration
```

| Enhancer          | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `batching()`      | Coalesce change-detection notifications into microtask batches |
| `timeTravel()`    | Undo/redo with configurable history depth                      |
| `devTools()`      | Redux DevTools integration with path-based actions             |
| `serialization()` | JSON serialize/deserialize with type preservation              |
| `persistence()`   | Auto-save/load to localStorage, IndexedDB, or custom adapters  |

> **9.0.1:** The `memoization()` enhancer was removed. Use Angular's built-in `computed()` — it already caches by reference equality and adds no runtime overhead.

## Derived State

Define derived computations in separate files with full type safety using `derivedFrom()`:

```typescript
import { derivedFrom } from '@signaltree/core';
import { computed } from '@angular/core';

const derived = derivedFrom<AppState>();

export const dashboardDerived = derived(($) => ({
  activeUserCount: computed(() => $.users.where((u) => u.active).length),
  totalRevenue: computed(() => $.orders.all().reduce((sum, o) => sum + o.total, 0)),
}));

// Attach to tree
const store = signalTree(initialState).derived(dashboardDerived);
store.$.activeUserCount(); // reactive, type-safe
```

## Callable Syntax

With `@signaltree/callable-syntax`, leaf nodes become callable for both read and write — a compile-time transform that produces zero runtime overhead:

```typescript
// With callable syntax installed:
store.$.user.name(); // Read  (same as before)
store.$.user.name('Bob'); // Write (compiles to .set('Bob'))
store.$.count((n) => n + 1); // Update (compiles to .update(n => n + 1))
```

Install as a dev dependency with a Vite/Webpack plugin — the transform compiles away before production.

## Subpath Imports

Specialized APIs live in subpath imports to keep the main barrel small:

```typescript
import { TREE_PRESETS, createDevTree, createProdTree } from '@signaltree/core/presets';
import { SecurityValidator, SecurityPresets } from '@signaltree/core/security';
import { createEditSession } from '@signaltree/core/edit-session';
import { createStorageAdapter, createIndexedDBAdapter } from '@signaltree/core/storage';
```

**Edit sessions** provide scoped undo/redo over a subtree — useful for form wizards and multi-step workflows:

```typescript
const session = createEditSession(store, '$.user.profile');
session.modify((profile) => ({ ...profile, name: 'Updated' }));
session.undo(); // Revert last change
session.commit(); // Persist changes to the main tree
```

## Lifecycle

Every tree has deterministic cleanup. `destroy()` tears down all resources — signals, enhancer timers, caches, and DevTools connections — in reverse enhancer order:

```typescript
const store = signalTree({ data: null }).with(batching()).with(devTools());
store.destroyed(); // Signal<boolean> — false

store.destroy();
store.destroyed(); // true — all enhancer resources cleaned up

// Custom cleanup hooks
store.registerCleanup(() => ws.close());
```

## Optional Packages

| Package                       | Purpose                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `@signaltree/ng-forms`        | Two-way binding between SignalTree nodes and Angular reactive forms          |
| `@signaltree/enterprise`      | Diff-based `updateOptimized()` for large trees (500+ signals), path indexing |
| `@signaltree/callable-syntax` | Compile-time callable syntax transform (Vite/Webpack plugin, dev dependency) |
| `@signaltree/events`          | Event-oriented helpers for reacting to state changes                         |
| `@signaltree/realtime`        | Keep entity maps in sync with live data sources (WebSocket, SSE)             |
| `@signaltree/guardrails`      | Dev-only performance budgets, hot-path detection, and policy enforcement     |

## Real-World Migration (Case Study)

Measured from a production Angular mobile application migrating from NgRx Signal Store to SignalTree. Results reflect one team's experience; your mileage will vary depending on app complexity and existing architecture.

| Metric                  | NgRx                      | SignalTree             | Change         |
| ----------------------- | ------------------------- | ---------------------- | -------------- |
| **App state code**      | 11,735 lines / 45 files   | 2,825 lines / 23 files | **-76%**       |
| **npm packages**        | 4 (@ngrx/\*)              | 1 (@signaltree/core)   | **-75%**       |
| **State bundle (gzip)** | ~50KB                     | ~27KB                  | **-46%**       |
| **Boilerplate files**   | 17 custom `withX` helpers | 0 (built-in)           | **Eliminated** |

> 13 separate stores → 1 unified tree. `entityMap()` replaced a 222-line `withEntityCrud` wrapper. Derived tiers replaced scattered `withComputed` blocks.

### Migrating from `@ngrx/signals`?

This is the most common migration path. We ship a complete, AI-agent-ready migration guide that covers:

- A mechanical concept map (`signalStore` → tree slice + `Ops`, `withState` → initial state, `rxMethod` → plain method, `withEntities` → `entityMap()` marker, etc.)
- **Three migration strategies** with explicit decision criteria — big-bang (one PR), incremental per-domain (one PR per store), and hybrid legacy-facade (permanent coexistence fallback)
- A **`Phase 0` recipe** for landing the foundation in a single dependency-only PR before touching any consumer
- The [`scripts/verify-signaltree-migration.sh`](scripts/verify-signaltree-migration.sh) script — drop-in, package-manager-agnostic, runs `build` + `test` + `lint` and asserts `@ngrx/signals` is gone from source and `package.json`

→ [`docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md`](docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md)

The guide is written as an Agent Skill — point Cursor, Claude Code, or any `SKILL.md`-aware harness at `node_modules/@signaltree/core/skills/using-signaltree/` and your AI assistant will follow the same playbook end-to-end. See [Using SignalTree with AI Agents](#using-signaltree-with-ai-agents) below.

## When to Use SignalTree

**Good fit:**

- Apps with structured, hierarchical state (settings, user profiles, nested forms)
- Teams that want signal-based state with dot-notation access and zero boilerplate
- Projects that need undo/redo, DevTools, entity CRUD, or persistence out of the box

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

// Entity CRUD
tree.$.users.addOne(entity);
tree.$.users.byId(id);
tree.$.users.all();

// Enhance & derive
tree.with(enhancer()); // Add capabilities (chainable)
tree.derived(derivedFn); // Attach derived state

// Lifecycle
tree.destroy(); // Clean up all resources
tree.destroyed(); // Check if destroyed
tree.registerCleanup(fn); // Register custom cleanup
```

## Documentation

- [Architecture Guide](docs/architecture/signaltree-architecture-guide.md)
- [Custom Enhancers](docs/guides/custom-enhancers.md)
- [Migration Guide (v8 → v9)](docs/guides/migration-v8-v9.md)
- [Performance Methodology](docs/performance/methodology.md)
- [Performance Patterns](docs/performance/performance-patterns.md)

## Using SignalTree with AI Agents

SignalTree ships a vendor-neutral Agent Skill so AI coding assistants can help you consume `@signaltree/*` packages correctly **and migrate existing `@ngrx/signals` codebases**. The canonical skill lives at [`docs/skills/using-signaltree/`](docs/skills/using-signaltree/) and covers the mental model, quick-start, enhancer decision tree, the full `@ngrx/signals` migration playbook (see [Migrating from `@ngrx/signals`?](#migrating-from-ngrxsignals) above), and per-package sub-skills (one level deep for `ng-forms`, `enterprise`, `callable-syntax`, `guardrails`, `events`, `realtime`).

**Cursor** — copy the folder into your project:

```bash
cp -r node_modules/@signaltree/core/skills/using-signaltree .cursor/skills/
```

(A pointer shim at [`.cursor/skills/using-signaltree/SKILL.md`](.cursor/skills/using-signaltree/SKILL.md) already exists in this repo for local development.)

**Claude Code** — same pattern:

```bash
cp -r node_modules/@signaltree/core/skills/using-signaltree .claude/skills/
```

(A pointer shim at [`.claude/skills/using-signaltree/SKILL.md`](.claude/skills/using-signaltree/SKILL.md) already exists in this repo for local development.)

**Generic harnesses** — any tool that can point at a directory of `SKILL.md` files can read `docs/skills/` directly (either from a git checkout or from the `skills/` folder shipped inside each published `@signaltree/*` tarball). No harness-specific phrasing lives inside the skill bodies.

For contributor-oriented guidance (commands, bundle limits, validation pipeline, release flow), see [`AGENTS.md`](AGENTS.md).

## Contributing

Contributions welcome. Please run `npm run validate:all` before submitting PRs.

## License

MIT — see [LICENSE](LICENSE).
