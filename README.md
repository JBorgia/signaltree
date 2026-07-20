<div align="center">
  <img src="apps/demo/public/signaltree.svg" alt="SignalTree Logo" width="120" height="120" style="background: transparent;" />
  <h1>SignalTree</h1>
  <p><strong>Reactive JSON for Angular</strong></p>
  <p>State as shape. Signals at every path.</p>

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

## SignalTree is not @ngrx/signals

**Different library, different author, different package** — `@signaltree/core` (no hyphen, not under `@ngrx/`). It's a typed reactive store where **your state literal is the API**: no `withState` / `withMethods` / `withComputed` wrappers, no actions, no reducers. You read and write any path directly — `tree.$.user.name()` to read, `tree.$.user.name.set(v)` to write — at any depth. If a doc or AI agent conflated this with NgRx SignalStore, that's the confusion to drop first; see [SignalTree vs NgRx SignalStore](docs/compare/ngrx-signalstore.md).

## Why SignalTree

State is modeled as the shape of your data, and the capabilities you'd otherwise hand-assemble ship as composable markers and enhancers:

- **`entityMap()`** → normalized collections with O(1) lookups and reactive CRUD
- **`updateAndReport()`** → optimistic UI with a changed-paths report for rollback
- **`form()`** (`@signaltree/ng-forms`) → tree-integrated reactive forms with validation and wizards
- **`.derived()`** → computed state deep-merged at any path
- **`timeTravel()`** → undo/redo with configurable history depth
- **`stored()`** → localStorage autosave with migrations

### Use SignalTree if you need

- Optimistic UI with rollback (`updateAndReport`)
- Undo / redo (`timeTravel` enhancer)
- Typed normalized collections with O(1) lookups (`entityMap`)
- Reactive forms with validation, wizards, and persistence (`form()` marker)
- localStorage autosave with migrations (`stored()` marker)
- State that mirrors your data shape, not Redux ceremony

### Production architecture

For anything beyond a prototype, wrap the tree in a service and expose **`$` reads + Ops methods**: keep `computed()` / `.derived()` for reads and `@Injectable` Ops services for writes and async. This keeps agent-generated code architecturally sound, not just API-correct. See [Recommended Architecture](docs/architecture/signaltree-architecture-guide.md#recommended-architecture-tldr).

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

## 🤖 Built for the AI-assisted era

SignalTree is the first Angular state-management library to treat AI coding agents as a first-class consumer of its API. We ship `llms.txt`, disambiguation tables, and a vendor-neutral agent skill — and **we measure the result**.

**Measured (v10.2, 2026-05-29):** AI-codegen accuracy goes from **49% → 91% (+42 percentage points)** when `llms.txt` is in the agent's context. Reproducible across 6 agents (4 frontier + 2 cost-tier) × 8 prompts × 5 libraries × 3 priming modes = **720 cells**. With Claude Sonnet 4.6, primed accuracy hits **99/100**.

The priming surface ships with the npm package: `node_modules/@signaltree/core/llms.txt` is automatically available to retrieval-aware AI tools after `npm install @signaltree/core`. See [Built for AI →](https://signaltree.io/built-for-ai) and the [reproducible benchmark](scripts/ai-codegen-benchmark/RESULTS-v10.2-FINAL.md).

**Don't take our number — re-run it.** The full harness (agents, prompts, libraries, priming modes, and scoring) lives in [`scripts/ai-codegen-benchmark/`](scripts/ai-codegen-benchmark/). Point it at your own agents and prompts and reproduce the delta yourself.

---

## Mental Model

A SignalTree turns a plain JSON object into a tree of Angular signals. Each leaf becomes a `WritableSignal`. Reads and writes use the same shape as any Angular signal — `node()` to read, `.set()` / `.update()` to write. Markers, enhancers, and derived tiers add capability on top, but they layer onto that base.

```typescript
import { signalTree } from '@signaltree/core';

const store = signalTree({
  user: { name: 'Alice', age: 30 },
  settings: { theme: 'dark' },
});

// Read — just call it, like any signal
store.$.user.name(); // 'Alice'

// Write — set or update a leaf, or partial-update the whole tree
store.$.user.name.set('Bob');
store.$.user.age.update((n) => n + 1);
store({ settings: { theme: 'light' } }); // deep-merge — `user` is preserved
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
store.$.users.byId(1); // EntityNode<User> | undefined — callable accessor with per-field signals
store.$.users.count(); // Signal<number>
store.$.users.where((u) => u.active); // Signal<User[]>
```

Additional methods: `addMany`, `upsertOne`, `upsertMany`, `updateMany`, `updateWhere`, `removeMany`, `removeWhere`, `clear`, `has`, `ids`, `find`.

Pass `sortComparer` to keep `all()`/`ids()` sorted on every read (`@ngrx/entity` parity): `entityMap<User>({ selectId, sortComparer: (a, b) => a.name.localeCompare(b.name) })`. Per-entity reads are body-granular — `byId(id).field()` re-runs only when that entity changes.

> **Error codes:** every SignalTree error and dev-mode warning carries a stable, greppable `[ST####]` code. Search it in a stack trace or in [`docs/errors/README.md`](docs/errors/README.md) for the cause and fix. In dev, the core warns on common mistakes (missing `selectId` → `[ST2001]`, wrong-library method names → `[ST2002]`, in-place-mutation no-op writes → `[ST2003]`).

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
store.$.users.setAll(data); // entities written directly — loadingState is a sibling
store.$.loadingState.setLoaded();
store.$.loadingState.loading(); // Signal<boolean> (v10.3 canonical; .isLoading() still works as a deprecated alias)
```

`entityCollection<E, K>(config)` (v11.2) is a cache-aware, self-loading `entityMap` — it composes the full `entityMap` surface with a loader, load status, a `staleTime` freshness guard, single-flight dedup, tag-based invalidation, and optional offline-first persistence. See [`docs/guides/entity-collection-cookbook.md`](docs/guides/entity-collection-cookbook.md) for the full walkthrough.

## Composition model

A SignalTree store is composed from four distinct, type-safe mechanisms — each handles one concern, rather than funneling everything through a single primitive:

| Concern            | Mechanism                                                                                                            | Example                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **State shape**    | the constructor object — state _is_ the JSON, including markers (`entityMap`, `status`, `stored`, `asyncSource`, `entityCollection`)     | `signalTree({ users: entityMap<User>() })`               |
| **Derived state**  | `.derived()` / `derivedFrom()` — computed signals deep-merged at any path                                            | `.derived($ => ({ activeCount: computed(...) }))`        |
| **Capabilities**   | `.with()` enhancers — opt-in, tree-shakeable, and reusable (author your own custom enhancers)                        | `.with(batching()).with(devTools())`                     |
| **Actions**        | a plain `@Injectable` Ops service that writes to tree paths — reads (`tree.$`) stay decoupled from writes            | `ops.users.select(id)`                                   |

This deliberately splits across four purpose-built tools what NgRx SignalStore unifies under one `with*` composition primitive (`withState` / `withComputed` / `withMethods` / `signalStoreFeature`). The closest analog to NgRx's reusable-feature primitive (`signalStoreFeature` / `withFeature`) is `.with()` enhancers; state, derived state, and actions live in the other three mechanisms. For an honest, axis-by-axis comparison — including where NgRx wins — see [docs/compare/ngrx-signalstore.md](docs/compare/ngrx-signalstore.md).

The sections below detail each mechanism.

## Enhancers

Enhancers add capabilities via `.with()`. Each is opt-in and tree-shakeable (modern bundlers — Vite, esbuild, Rollup, webpack 5+). Applying the same enhancer twice throws a clear error — fail-fast, no silent fallback.

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

> **9.0.1:** The `memoization()` enhancer was removed. Use Angular's built-in `computed()` — it memoizes its result and only re-runs when a tracked signal changes, with no extra cost over what Angular already provides.

## Derived State

Define derived computations in separate files with full type safety using `derivedFrom()`:

```typescript
import { derivedFrom } from '@signaltree/core';
import { computed } from '@angular/core';

const derived = derivedFrom<AppState>();

export const dashboardDerived = derived(($) => ({
  activeUserCount: computed(() => $.users.where((u) => u.active)().length),
  totalRevenue: computed(() => $.orders.all().reduce((sum, o) => sum + o.total, 0)),
}));

// Attach to tree
const store = signalTree(initialState).derived(dashboardDerived);
store.$.activeUserCount(); // reactive, type-safe
```

## Callable Syntax

**Branch nodes are callable for reads AND writes natively** — `store.$.user()` reads the user subtree, `store.$.user({ name: 'Bob' })` partial-updates it. **Leaves are Angular signals**: callable as getters, but writes go through `.set()` / `.update()`. `@signaltree/callable-syntax` is a compile-time transform that brings **leaf writes** into the same call-with-arg shape that branches already support, so a single call expression covers reads and writes at every depth:

```typescript
// Branches — always callable both directions:
store.$.user();                    // read subtree
store.$.user({ name: 'Bob' });     // partial-update subtree

// Leaves — read works without the plugin; with @signaltree/callable-syntax,
// writes use the same shape:
store.$.user.name();               // read leaf (no plugin needed)
store.$.user.name('Bob');          // compiles to .set('Bob')
store.$.count((n) => n + 1);       // compiles to .update(n => n + 1)
```

It's a Vite/Webpack plugin (dev dependency only) — the transform expands these forms back into `.set()` / `.update()` calls at build time, so production bundles have zero runtime overhead and the underlying signal API is unchanged.

> **Configure `rootIdentifiers`** in the plugin options to match your store variable names. Default is `['tree']`; if you use `store`, `state`, or other names, list them — variables not in the list are left alone.

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

> **When to reach for what:** use `createTreeEditSession` when you need an uncommitted draft you can `commit()` or `cancel()` against a specific subtree — distinct from `timeTravel()`, which records the whole tree's history and lets you step backward globally rather than holding a separate draft.

## Async (`asyncSource` / `asyncQuery` markers)

Async state usually belongs **at the tree path it describes** — use `asyncSource` for load-and-expose and `asyncQuery` for input-driven debounced queries. Reach for a plain Observable method on an Ops class only when the orchestration spans multiple paths or stages that no single marker can express (see the migration section). Two markers cover the two main async patterns and compose with the rest of the marker family (`entityMap`, `status`, `stored`, `form`, `entityCollection`):

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

Both markers attach at **any tree depth** and accept **Observables or Promises**. When the tree is constructed inside an Angular injection context, both markers auto-clean their in-flight subscriptions on the surrounding `DestroyRef`. Outside an injection context (e.g., trees built in plain functions or tests), call `store.destroy()` for cleanup. No manual `tap()` / `setLoading()` / `setLoaded()` wiring either way.

### Migration from `@ngrx/signals` `rxMethod`

SignalTree no longer ships `rxMethod` (removed in v9.6.0 — it was briefly available as a migration alias in v9.5.x). Its callable-factory-inside-`withMethods` shape was NgRx-flavored and didn't fit SignalTree's path-attached marker philosophy. Map NgRx `rxMethod` to:

- **`asyncSource`** when the pipeline is doing load-and-expose
- **`asyncQuery`** when the pipeline is doing input-driven debounced query
- **plain Observable method in an Ops class** when the pipeline is doing complex multi-step orchestration that neither marker fits

See [the migration guide](docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md) for the full mapping with examples.

## Lifecycle

Every tree has deterministic cleanup. `destroy()` runs every registered cleanup hook (in registration order), tearing down signals, enhancer timers, caches, and DevTools connections. Built-in enhancers register their own cleanup; custom enhancers must call `tree.registerCleanup(fn)` to participate:

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

Snapshot from one production Angular mobile app's NgRx Signal Store → SignalTree migration. Original migration measured ~11,700 → ~2,800 lines of state code (~76%) and ~50KB → ~27KB gzipped state bundle (~46%). Both codebases have continued to evolve; re-measuring today the same scope yields a 60–70% reduction depending on definition (apps-only vs apps+libs, narrow vs broad import filter). The directional finding is reproducible — the exact percentages are not. **YMMV** — your migration's reduction depends on app complexity, prior architecture, and how heavily the original code leaned on custom `withX` helpers. The most concretely-attributable single reduction was `entityMap()` replacing a 222-line `withEntityCrud` wrapper. The remaining bulk of the savings appears to come from cross-cutting concerns (devtools, error banners, telemetry, refresh handling) consolidating into tree-level enhancers, though we have not separately measured each category.

| Metric                  | NgRx                      | SignalTree             | Change         |
| ----------------------- | ------------------------- | ---------------------- | -------------- |
| **App state code**      | 11,735 lines / 45 files   | 2,825 lines / 23 files | **-76%**       |
| **npm packages**        | 4 (@ngrx/\*)              | 1 (@signaltree/core)   | **-75%**       |
| **State bundle (gzip)** | ~50KB                     | ~27KB                  | **-46%**       |
| **Boilerplate files**   | 17 custom `withX` helpers | 0 (built-in)           | **Eliminated** |

> 13 separate stores → 1 unified tree. `entityMap()` replaced a 222-line `withEntityCrud` wrapper. Derived tiers replaced scattered `withComputed` blocks.

### Migrating from `@ngrx/signals`?

This is the most common migration path. We ship a complete, AI-agent-ready migration guide that covers:

- A concept map that's mechanical for the common cases (`signalStore` → tree slice + `Ops`, `withState` → initial state, `withEntities` → `entityMap()` marker) and supplies a decision tree for `rxMethod` migrations (`asyncSource` for load-and-expose, `asyncQuery` for input-driven, plain Observable method on an Ops class for multi-stage orchestration)
- **Three migration strategies** with explicit decision criteria — big-bang (one PR), incremental per-domain (one PR per store), and hybrid legacy-facade (permanent coexistence fallback)
- A **`Phase 0` recipe** for landing the foundation in a single dependency-only PR before touching any consumer
- The [`scripts/verify-signaltree-migration.sh`](scripts/verify-signaltree-migration.sh) script — drop-in, package-manager-agnostic, runs `build` + `test` + `lint` and asserts `@ngrx/signals` is gone from source and `package.json`

→ [`docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md`](docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md)

For migrations that exceed a single agent's context window (typically >5 consumer files), an orchestrator playbook coordinates multiple implementer subagents through phased work: → [`docs/skills/using-signaltree/reference/orchestrating-a-migration.md`](docs/skills/using-signaltree/reference/orchestrating-a-migration.md)

The guide is written as an Agent Skill — point Cursor, Claude Code, or any `SKILL.md`-aware harness at `node_modules/@signaltree/core/skills/using-signaltree/` and your AI assistant will follow the same playbook end-to-end. See [Using SignalTree with AI Agents](#using-signaltree-with-ai-agents) below.

## API Summary

```typescript
// Create
const tree = signalTree(initialState);
const tree = signalTree(initialState, config);

// Read
tree(); // Full state snapshot
tree.$.path.to.leaf(); // Leaf signal value

// Write
tree(updates); // Partial update — keys not in the payload are preserved
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

`.with(devTools())` wires SignalTree into the standard Redux DevTools browser extension. Every state change appears in the timeline with a **path-based action name** (e.g., `[users.profile.name]/set`) so you can scrub backward and forward through state history and see *which path* caused each render — not just *that something changed*. `devTools()` alone delivers the in-browser time-travel scrubber (controlled by its own `enableTimeTravel` config flag, default `true`); the separate `timeTravel()` enhancer is an independent API-level surface for programmatic undo/redo/jumpTo from code, useful when you want history control without depending on the browser extension. See [Architecture Guide](docs/architecture/signaltree-architecture-guide.md#devtools-integration) for screenshots and the full action-naming scheme.

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
- [Marker zoo](https://signaltree.io/marker-zoo) — all 7 markers at 4 depths in one tree (v10)
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

**Business Source License 1.1 (BUSL-1.1)** — see [LICENSE](LICENSE). Commercial and internal use is permitted; it converts to the **MIT License on 2028-09-05** (the Change Date). Source-available, not OSI "open source," until then.

### Enterprise / procurement FAQ

**Q: Can we use this in commercial, government, or regulated-industry applications?**
A: Yes. BUSL-1.1 grants worldwide rights to use, modify, and distribute the Software for your own applications, including commercial and internal use (LICENSE §2–3). Using it as a dependency in your product is unrestricted.

**Q: What is actually restricted?**
A: One thing: you may not publicly offer a _modified, competing_ version of SignalTree itself in a way that circumvents the license (§4b). This does not affect using the library in an application.

**Q: Is there an AI-training restriction?**
A: No. The license contains no AI- or model-training clause.

**Q: Does the license change over time?**
A: Yes — each release automatically converts to the standard **MIT License** on its Change Date, **2028-09-05** (§6). Governing law is New York (§7).
