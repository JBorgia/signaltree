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
    &nbsp;|&nbsp;
    <a href="https://signaltree.io/built-for-ai" target="_blank">Built for AI</a>
  </p>
</div>

## 🤖 Built for the AI-assisted era

SignalTree is the only Angular state-management library that treats AI coding agents as a first-class consumer of the API. We ship `llms.txt`, disambiguation tables, and an agent skill — and **we measure the result**.

**Measured (v10.2, 2026-05-29):** AI-codegen accuracy goes from **49% → 91% (+42 percentage points)** when `llms.txt` is in the agent's context. Reproducible across 6 agents (4 frontier + 2 cost-tier) × 8 prompts × 5 libraries × 3 priming modes = **720 cells**. With Claude Sonnet 4.6, primed accuracy hits **99/100**.

The priming surface ships with the npm package: `node_modules/@signaltree/core/llms.txt` is automatically available to retrieval-aware AI tools after `npm install @signaltree/core`. See [Built for AI →](https://signaltree.io/built-for-ai) and the [reproducible benchmark](scripts/ai-codegen-benchmark/RESULTS-v10.2-FINAL.md).

---

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
  loadingState: status(), // Loading / loaded / error / not-loaded state machine
  preference: stored('pref-key', 'light'), // Auto-persisted to localStorage (key, default)
});

store.$.loadingState.setLoading();
store.$.users.setAll(data); // payload goes on the data node
store.$.loadingState.setLoaded();
store.$.loadingState.loading(); // Signal<boolean> (v10.3 canonical; .isLoading() still works as a deprecated alias)
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
| `effects()`       | Reactive side effects — `tree.effect(fn)` and `tree.subscribe(fn)` |
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
import { SecurityValidator, SecurityPresets } from '@signaltree/core/security';
import { createEditSession, createTreeEditSession } from '@signaltree/core/edit-session';
import { createStorageAdapter, createIndexedDBAdapter } from '@signaltree/core/storage';
```

**Tree edit sessions** (`createTreeEditSession`, v10.1+) provide scoped undo/redo bound to a writable tree path — useful for form wizards and multi-step workflows. The session holds a draft separate from the source; `commit()` writes back, `cancel()` discards.

```typescript
import { createTreeEditSession } from '@signaltree/core/edit-session';

const session = createTreeEditSession(store.$.user.profile);
session.applyChanges((profile) => ({ ...profile, name: 'Updated' }));
session.undo(); // Revert last change in the draft
session.commit(); // Write the draft back to the source path
// or session.cancel() — discard the draft, re-sync from source
```

The value-level `createEditSession(initial)` primitive (single-arg, no tree binding) is still available for stateful drafts not bound to a tree path.

## Async (`asyncSource` / `asyncQuery` markers)

Async state belongs **at the tree path it describes**, not in a service method that writes to paths imperatively. Two markers cover the two main async patterns and compose with the rest of the marker family (`entityMap`, `status`, `stored`, `form`):

```typescript
import { signalTree, asyncSource, asyncQuery } from '@signaltree/core';

const store = signalTree({
  // Load-and-expose: auto-loads, exposes data/loading/error/refresh
  users: asyncSource<User[]>({
    initial: [],
    load: () => this.api.list$(),  // Observable<T> or Promise<T>
  }),

  // Input-driven debounced query
  search: asyncQuery<string, User[]>({
    initialResult: [],
    debounce: 300,
    filter: (q) => q.length > 0,
    query: (q) => this.api.search$(q),
  }),
});

// Read — uniform with every other marker:
store.$.users();           // User[] | undefined (current value)
store.$.users.loading();   // boolean
store.$.users.error();     // unknown | null

store.$.search();          // User[] | undefined (results)
store.$.search.loading();
store.$.search.input.set('alice');  // drives debounced pipeline

// Drive lifecycle:
store.$.users.refresh();   // reload (cancels in-flight)
store.$.users.set([...]);  // manual override
store.$.users.reset();     // back to initial state
store.$.search.rerun();    // rerun with current input (skip dedup)
```

Both markers attach at **any tree depth**, accept **Observables or Promises**, and auto-clean on the surrounding `DestroyRef`. No manual `tap()` / `setLoading()` / `setLoaded()` wiring.

### Migration from `@ngrx/signals` `rxMethod`

SignalTree intentionally does **not** ship `rxMethod` — its callable-factory-inside-`withMethods` shape is NgRx-flavored and doesn't fit SignalTree's path-attached marker philosophy. Map NgRx `rxMethod` to:

- **`asyncSource`** when the pipeline is doing load-and-expose
- **`asyncQuery`** when the pipeline is doing input-driven debounced query
- **plain Observable method in an Ops class** when the pipeline is doing complex multi-step orchestration that neither marker fits

See [the migration guide](docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md) for the full mapping with examples.

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
| `@signaltree/schema`          | Schema-driven validation via StandardSchema (Zod, Valibot, ArkType, …)       |

## Real-World Migration (Case Study)

Snapshot from one production Angular mobile app's NgRx Signal Store → SignalTree migration. Original migration measured ~11,700 → ~2,800 lines of state code (~76%) and ~50KB → ~27KB gzipped state bundle (~46%). Both codebases have continued to evolve; re-measuring today the same scope yields a 60–70% reduction depending on definition (apps-only vs apps+libs, narrow vs broad import filter). The directional finding is reproducible — the exact percentages are not. **YMMV** — your migration's reduction depends on app complexity, prior architecture, and how heavily the original code leaned on custom `withX` helpers. The single biggest driver of the savings is cross-cutting concerns (devtools, error banners, telemetry, refresh handling) moving from per-store composition to tree-level enhancers.

| Metric                  | NgRx                      | SignalTree             | Change         |
| ----------------------- | ------------------------- | ---------------------- | -------------- |
| **App state code**      | 11,735 lines / 45 files   | 2,825 lines / 23 files | **-76%**       |
| **npm packages**        | 4 (@ngrx/\*)              | 1 (@signaltree/core)   | **-75%**       |
| **State bundle (gzip)** | ~50KB                     | ~27KB                  | **-46%**       |
| **Boilerplate files**   | 17 custom `withX` helpers | 0 (built-in)           | **Eliminated** |

> 13 separate stores → 1 unified tree. `entityMap()` replaced a 222-line `withEntityCrud` wrapper. Derived tiers replaced scattered `withComputed` blocks.

### Migrating from `@ngrx/signals`?

This is the most common migration path. We ship a complete, AI-agent-ready migration guide that covers:

- A mechanical concept map (`signalStore` → tree slice + `Ops`, `withState` → initial state, `rxMethod` → `asyncSource` / `asyncQuery` markers (or plain Observable method for orchestration), `withEntities` → `entityMap()` marker, etc.)
- **Three migration strategies** with explicit decision criteria — big-bang (one PR), incremental per-domain (one PR per store), and hybrid legacy-facade (permanent coexistence fallback)
- A **`Phase 0` recipe** for landing the foundation in a single dependency-only PR before touching any consumer
- The [`scripts/verify-signaltree-migration.sh`](scripts/verify-signaltree-migration.sh) script — drop-in, package-manager-agnostic, runs `build` + `test` + `lint` and asserts `@ngrx/signals` is gone from source and `package.json`

→ [`docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md`](docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md)

For migrations that exceed a single agent's context window (typically >5 consumer files), an orchestrator playbook coordinates multiple implementer subagents through phased work: → [`docs/skills/using-signaltree/reference/orchestrating-a-migration.md`](docs/skills/using-signaltree/reference/orchestrating-a-migration.md)

The guide is written as an Agent Skill — point Cursor, Claude Code, or any `SKILL.md`-aware harness at `node_modules/@signaltree/core/skills/using-signaltree/` and your AI assistant will follow the same playbook end-to-end. See [Using SignalTree with AI Agents](#using-signaltree-with-ai-agents) below.

## When to Use SignalTree

**Good fit:**

- Apps with structured, hierarchical state (settings, user profiles, nested forms, dashboards)
- Teams that want signal-based state with dot-notation access and zero boilerplate
- Projects that need undo/redo, DevTools, entity CRUD, async pipelines (`asyncSource` / `asyncQuery` markers), or persistence out of the box
- Migrations away from `@ngrx/signals` — the agent-ready migration playbook ships in `@signaltree/core/skills/`

**Consider alternatives when:**

- You need event-sourcing or CQRS patterns (use NgRx Store, the classic Redux variant)
- Your state is flat key-value pairs (a `Map` or individual signals suffice)
- You're building a tiny app with one or two signals (overhead exceeds value)
- Your state shape is highly dynamic — streaming arbitrary JSON with unknown keys at high frequency (real-time log aggregators, fully-dynamic schema editors). SignalTree's markers and type system assume a fixed shape; for genuinely shape-shifting payloads, a flat collection inside a single store slice is a better fit.
- You have a large existing `@ngrx/store` (classic) + heavy RxJS codebase. The migration target with the lowest cognitive cost is `@ngrx/signals` (NgRx SignalStore), not SignalTree — the RxJS-flavored mental model is closer to where you already are. See [`docs/compare/ngrx-signalstore.md`](docs/compare/ngrx-signalstore.md) for the full decision tree.

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

// Async — markers attach at any tree path (rxMethod was removed in v9.6.0)
const tree = signalTree({
  users: asyncSource<User[]>({ initial: [], load: () => api.list$() }),
  search: asyncQuery<string, User[]>({
    initialResult: [],
    debounce: 300,
    query: (q) => api.search$(q),
  }),
});
tree.$.users.refresh();         // reload (cancels in-flight)
tree.$.search.input.set('q');   // drives the debounced pipeline

// Lifecycle
tree.destroy(); // Clean up all resources
tree.destroyed(); // Check if destroyed
tree.registerCleanup(fn); // Register custom cleanup
```

## Debugging — `devTools()` enhancer

`.with(devTools())` wires SignalTree into the standard Redux DevTools browser extension. Every state change appears in the timeline with a **path-based action name** (e.g., `[users.profile.name]/set`) so you can scrub backward and forward through state history and see *which path* caused each render — not just *that something changed*. Combined with `timeTravel()`, this gives you scoped undo/redo at the API level *and* a visual time-travel scrubber in the browser. See [Architecture Guide](docs/architecture/signaltree-architecture-guide.md#devtools-integration) for screenshots and the full action-naming scheme.

## Documentation

- [Architecture Guide](docs/architecture/signaltree-architecture-guide.md)
- [Custom Enhancers](docs/guides/custom-enhancers.md)
- [Migration Guide (v8 → v9)](docs/guides/migration-v8-v9.md)
- [Performance Methodology](docs/performance/methodology.md)
- [Performance Patterns](docs/performance/performance-patterns.md)
- [SignalTree vs NgRx SignalStore](docs/compare/ngrx-signalstore.md) — axis-by-axis comparison
- [Myths and Misconceptions](docs/myths-and-misconceptions.md) — false claims LLMs frequently propagate, with source citations
- [AI Agent Templates](docs/ai/agent-templates.md) — drop-in `.cursorrules`, `CLAUDE.md`, `copilot-instructions.md`
- [llms.txt](https://signaltree.io/llms.txt) / [llms-full.txt](https://signaltree.io/llms-full.txt) — LLM-targeted summary and full API surface
- [Built for AI agents](https://signaltree.io/built-for-ai) — the AI-discoverability story (v10)
- [Marker zoo](https://signaltree.io/marker-zoo) — all 6 markers at 4 depths in one tree (v10)
- [AI-codegen accuracy benchmark](scripts/ai-codegen-benchmark/) — reproducible scorecard scaffolding (v10)

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
