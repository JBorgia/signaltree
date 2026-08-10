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
- **`updateAndReport()`** → a changed-paths report for partial server-payload sync, audit trails, and targeted persistence
- **`form()`** (`@signaltree/ng-forms`) → tree-integrated reactive forms with validation and wizards
- **`.derived()`** → computed state deep-merged at any path
- **`timeTravel()`** → undo/redo with configurable history depth
- **`stored()`** → localStorage autosave with migrations and durable writes (auto-drained on background/unload)

### Use SignalTree if you need

- Optimistic UI with rollback (snapshot → write → restore; see the [Ops recipe](docs/guides/composition-recipes.md#2-a-reusable-entity-crud-ops-base))
- Undo / redo (`timeTravel` enhancer)
- Typed normalized collections with O(1) lookups (`entityMap`)
- Reactive forms with validation, wizards, and persistence (`form()` marker)
- localStorage autosave with migrations and background/kill-safe writes (`stored()` marker)
- State that mirrors your data shape, not Redux ceremony

### Production architecture

For anything beyond a prototype, wrap the tree in a service and expose **`$` reads + Ops methods**: keep `computed()` / `.derived()` for reads and `@Injectable` Ops services for writes and async. This keeps agent-generated code architecturally sound, not just API-correct. See [Recommended Architecture](docs/architecture/signaltree-architecture-guide.md#recommended-architecture-tldr).

For components that should only ever read the store, `asReadonly(tree)` narrows the tree to a `ReadonlyStore` — read-only `$` over the tree's full accumulated type (leaf `Signal` reads, `.derived()` computeds preserved, `linked()` narrowed to `Signal`) plus `destroy()`/`destroyed`. Marker surfaces are genuinely narrowed to per-marker reader allowlists: entity mutators (`upsertOne`, `removeWhere`, …), loader triggers (`load`/`refresh`/`invalidate`), `status` setters, and `form` writes are not offered on the readonly type, and `byId()` is re-signed to a read-only entity node (deep `Signal` leaves, no `.set`). `defineStore(factory, { expose: 'readonly' })` is sugar over the same view for injected stores. This is a compile-time narrowing only — the same runtime object, no runtime guard — so it stops the type system from _offering_ a write, not a determined `as any`; pair it with a separate Ops service for the write path.

## When to Use SignalTree

SignalTree makes a specific architectural trade: **writes are independent of state size, and
notification is independent of subscriber count — and you pay for that whenever you materialize the
whole tree.** Two questions decide whether that trade is in your favour.

**1. How many live consumers are bound _below the top level_, and how often do you write?**

Only leaves are signals, so a write goes to one leaf and dirties only that leaf's consumers. An
immutable store re-runs every subscriber's projection on every emission and filters downstream.
Measured against elf at 100 fixed fields ([`tools/bench-state-scale.mjs`](tools/bench-state-scale.mjs),
200 writes, median of 11):

| live consumers | SignalTree | elf       |
| -------------- | ---------- | --------- |
| 0              | 0.007 ms   | 0.380 ms  |
| 1,000          | 0.045 ms   | 20.175 ms |
| 5,000          | 0.195 ms   | 95.730 ms |

And write cost against state size, with zero consumers: at 1,024 root props SignalTree is
**0.005 ms** and an immutable store is **20.741 ms**, because it copies the slice and we don't.

**2. Do you read the whole collection on every change, or undo deeply over it?**

Either one hands the win back:

- Over 10,000 rows, `update` + `byId()` is **2.13 µs**; `update` + `all()` is **9.91 µs**, because
  `all()` rebuilds the array on every change and there are no per-entity consumers to earn the
  granularity back. That gap widens with collection size and with how many per-entity nodes have
  been materialised.
- Undo/redo over a 10,000-row collection measures **~3× behind elf** (3.67 ms against 1.24 ms). An immutable store restores
  by swapping one reference; SignalTree writes values back into per-entity signals. That is the
  price of granular reads, not a defect — see
  [`docs/compare/real-implementations.md`](docs/compare/real-implementations.md).

**High write frequency × many per-entity bindings → SignalTree, by a wide margin. Whole-collection
reads or deep undo → an immutable store fits better.**

> Numbers are Node v24.3 / V8 on one machine. Browser transfer is not yet established — re-run the
> harnesses rather than trusting the table.

### Which apps land where

<!-- measured: node --expose-gc tools/bench-compare.mjs (collection and undo arms); node tools/bench-vs-signalstore.mjs (per-entity vs whole-collection reads) -->

Every figure in this section comes from `node --expose-gc tools/bench-compare.mjs`
and `node tools/bench-vs-signalstore.mjs`. Ratios between sub-millisecond arms move
run to run — re-run before quoting one.

Two columns, deliberately separated: **what the measurements say** is a different question from
**what teams pick**. Ecosystem gravity is real, but it is a fact about hiring, not about fit —
collapsing them lets one masquerade as the other. The library measurements are ours; the mapping
from a domain to a workload is judgment, so validate it against your own app.

| Workload                                          | Typical domains                                                                                     | What the measurements say                                                                     | What teams usually pick              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------ |
| Streaming telemetry into many per-entity bindings | Fleet & logistics, grid/SCADA, telecom NOC, manufacturing MES, airline & rail ops, trading blotters | **SignalTree, decisively** — 448× at 1,000 consumers                                          | SignalTree                           |
| Offline-first with server-owned collections       | Field service, mobile ops                                                                           | **SignalTree** — `loader` + `hydrateThenRevalidate`                                           | SignalTree                           |
| Deep nested forms with audit and persistence      | Healthcare, claims, regulated workflows                                                             | **SignalTree** — `form()`, `history()`, `stored()` are primitives here and assembly elsewhere | Toss-up; governance decides          |
| CRUD over moderate lists, server round-trips      | CRM, ERP, admin consoles, insurance                                                                 | **SignalTree leans** — ~3× on the collection task, tens of × on undo                          | `@ngrx/signals`, on gravity          |
| Drag-driven boards and schedules                  | Dispatch, Gantt, planning                                                                           | **SignalTree leans** — high write frequency, per-item bindings, moderate collections          | Toss-up                              |
| Undo/redo over moderate state                     | Editors-in-a-panel, wizards, bulk edit                                                              | **SignalTree** — `@ngrx/signals` has no undo primitive at all                                 | Hand-rolled history (the 262 ms arm) |
| Whole-dataset reads on every change               | BI and analytics explorers                                                                          | **Depends on modelling** — a plain array leaf is at parity; `entityMap` is the wrong tool     | Toss-up                              |
| Deep undo over **large** collections              | Design tools, media timelines                                                                       | **An immutable root wins** — needs 10k+ rows _and_ deep history _and_ undo as a core feature  | elf, or immutable under NgRx         |
| Concurrent editing of one document                | CMS authoring, co-editing                                                                           | **Not a store decision** — a CRDT goes underneath either way                                  | Yjs/Automerge + any store            |
| Large teams, long-lived, hiring-driven            | Banking core, public sector                                                                         | **No technical winner at this altitude**                                                      | NgRx classic — legitimately so       |

Where the two columns disagree, the honest reading is "a toss-up that gravity decides" — not
"something else fits better."

**Reach for SignalTree when you have:**

- **Structured or nested state** — settings, user profiles, workspaces, dashboards, multi-step
  wizards, anything with domains inside domains. `tree.$.workspace.editor.draft.dirty()` reads and
  writes at any depth, with full recursive typing.
- **Server-backed collections** — `entityMap({ load: loader(fn) })` gives you normalized O(1) CRUD
  plus caching, `staleTime` freshness, single-flight dedup, tag invalidation, and optional
  offline-first persistence from one config key.
- **Forms** — the `form()` marker covers field/dirty/valid/touched/submit and wizards, and bridges
  to Angular Signal Forms via `signalForm()`.
- **Optimistic UI** — snapshot with `byId()`, write eagerly, restore on failure; `entityMap`'s
  batch ops keep a burst to one notification. `updateAndReport()` tells you which **paths** changed
  (for partial server-payload sync, audit trails, targeted persistence). See the
  [Ops recipe](docs/guides/composition-recipes.md#2-a-reusable-entity-crud-ops-base).
- **Async data** — `asyncSource()` / `asyncQuery()` for load-and-expose and debounced
  input-driven queries, with `status()` predicates for the lifecycle.
- **Undo/redo, persistence, DevTools** — `timeTravel()`, `stored()` with migrations, `history()` /
  `trackHistory()`, Redux DevTools integration. All included, none hand-wired.
- **State that will grow.** Starting simple is fine — the shape _is_ the API, so adding a domain or
  attaching a marker at a new node doesn't restructure anything you already wrote. You don't need to
  predict your final shape to start.
- **Multiple stores / feature domains** — one tree per feature with an Ops service in front is the
  recommended architecture, and it scales to many.
- **AI-assisted development** — measured 49% → 98% codegen accuracy with `llms.txt` in context (see
  below), plus a vendor-neutral agent skill.
- **Migrating off `@ngrx/signals`** — the agent-ready migration playbook ships in
  `@signaltree/core/skills/`.

**Where something else may fit better:**

- **Every widget reads the whole collection.** A chart-driven analytics explorer re-reads `all()` on
  every change and binds nothing per entity, so it pays the materialization tax and collects none of
  the fan-out benefit — measured at 97.47 µs against 1.90 µs for the per-entity path. Model it as a
  plain array leaf, or use a store that returns its state by reference.
- **Deep undo over large collections.** Restoring writes values back into per-entity signals rather
  than swapping a reference — ~2.5× behind elf at 10,000 rows. If the undo stack _is_ the product
  (design tools, timeline editors), that ratio is the wrong way round for you. If you just need undo
  over a big grid, `pauseRecording()` and `timeTravel({ shouldSkip })` are the levers.
- **Collaborative document editing.** Merge semantics belong in a CRDT (Yjs, Automerge) underneath
  whatever store you pick; no state library is the right layer for that.
- **A couple of values in one component.** Raw Angular signals (`signal` / `computed` /
  `linkedSignal` / `resource`) are complete for that, and reaching for any store would be
  ceremony. The interesting question isn't "is my app big enough" — it's whether you want the
  batteries above hand-assembled or provided. See
  [SignalTree vs raw Angular signals](docs/compare/native-signals.md).
- **Event-sourcing or CQRS** — use NgRx Store (the classic Redux variant); replaying an event log is
  a different architecture, not a feature gap.
- **Genuinely shape-shifting state** — streaming arbitrary JSON with unknown keys at high frequency
  (log aggregators, fully-dynamic schema editors). Markers and the type system assume a known shape;
  put dynamic payloads in a collection inside a slice instead.
- **A large existing `@ngrx/store` (classic) + heavy RxJS codebase** — the lowest-cognitive-cost
  migration target is `@ngrx/signals`, whose RxJS-flavored model is closer to where you already are.
  See [`docs/compare/ngrx-signalstore.md`](docs/compare/ngrx-signalstore.md) for the decision tree.

## 🤖 Built for the AI-assisted era

SignalTree is the first Angular state-management library to treat AI coding agents as a first-class consumer of its API. We ship `llms.txt`, disambiguation tables, and a vendor-neutral agent skill — and **we measure the result**.

**Measured (v10.3.3, 2026-06-01):** AI-codegen accuracy goes from **49% cold → 98% primed (+49 percentage points)** when `llms.txt` is in the agent's context. Reproducible across 6 agents (4 frontier + 2 cost-tier) × 8 prompts × 5 libraries × 3 priming modes = **720 cells**. Four of the six agents reach **100/100** when primed.

The priming surface ships with the npm package: `node_modules/@signaltree/core/llms.txt` is automatically available to retrieval-aware AI tools after `npm install @signaltree/core`. See [Built for AI →](https://signaltree.io/built-for-ai) and the [reproducible benchmark](scripts/ai-codegen-benchmark/RESULTS-v10.3.3-VS-v10.2.md).

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

Requires Angular 20, 21, or 22 (see `peerDependencies` in [`packages/core/package.json`](packages/core/package.json)).

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
store.$.loadingState.loading(); // Signal<boolean> (the `is`-prefix aliases — .isLoading() etc. — were removed in v11.0.0)
```

Wrapping a load function with the `loader()` helper and passing it as `entityMap()`'s `load` (plus optional `staleTime`/`equal`/`swr`/`tags`/`persist` in `loader()`'s second argument) turns the collection into a cache-aware (single-scope), self-loading one — a loader, load status, a `staleTime` freshness guard, single-flight dedup, tag-based invalidation, and optional offline-first persistence, all on the same marker. `loader()` is what keeps this machinery tree-shakeable — a plain `entityMap()` doesn't pay for it. The collection retains only the current scope — switching scope A → B → A refetches A rather than serving from a multi-key cache. There is no separate `entityCollection` marker — the short-lived v11.2/11.3 marker of that name was folded into `entityMap` in v11.4.0. See [`docs/guides/entity-collection-cookbook.md`](docs/guides/entity-collection-cookbook.md) for the full walkthrough.

## Composition model

A SignalTree store is composed from four distinct, type-safe mechanisms — each handles one concern, rather than funneling everything through a single primitive:

| Concern           | Mechanism                                                                                                        | Example                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **State shape**   | the constructor object — state _is_ the JSON, including markers (`entityMap`, `status`, `stored`, `asyncSource`) | `signalTree({ users: entityMap<User>() })`        |
| **Derived state** | `.derived()` / `derivedFrom()` — computed signals deep-merged at any path                                        | `.derived($ => ({ activeCount: computed(...) }))` |
| **Capabilities**  | `.with()` enhancers — opt-in, tree-shakeable, and reusable (author your own custom enhancers)                    | `.with(batching()).with(devTools())`              |
| **Actions**       | a plain `@Injectable` Ops service that writes to tree paths — reads (`tree.$`) stay decoupled from writes        | `ops.users.select(id)`                            |

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

| Enhancer          | Purpose                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `batching()`      | Coalesce change-detection notifications into microtask batches                                 |
| `effects()`       | **Deprecated (11.6.0)** — use native Angular `effect(() => tree.$.path())`; removal next major |
| `timeTravel()`    | Undo/redo with configurable history depth                                                      |
| `devTools()`      | Redux DevTools integration with path-based actions                                             |
| `serialization()` | JSON serialize/deserialize with type preservation                                              |
| `persistence()`   | Auto-save/load to localStorage, IndexedDB, or custom adapters                                  |

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

One fact explains the whole rule: **only leaves are Angular signals.**

A **branch** is SignalTree's own accessor, so we own its call semantics and a
call can mean "merge this". It is callable in both directions, natively:

```typescript
store.$.user(); // read the subtree
store.$.user({ name: 'Bob' }); // partial-update it
store.$.user((u) => ({ ...u, age: u.age + 1 })); // updater form
store({ ui: { loading: false } }); // the root, same shape
```

A **leaf** is a real `WritableSignal`. Calling an Angular signal is a **read** —
it returns the value and ignores any argument — so leaves are written the
ordinary way:

```typescript
store.$.user.name(); // read
store.$.user.name.set('Bob'); // write
store.$.count.update((n) => n + 1); // transform
```

> **Changed in 14.0.0.** Through 13.x the types also permitted
> `store.$.user.name('Bob')`, and the `@signaltree/callable-syntax` transform
> was meant to rewrite it to `.set()`. It could not run inside an Angular app at
> all, so that call type-checked and then **silently did nothing**. Both the
> overloads and the package are gone; it is now a compile error. Leaves stay
> real Angular signals on purpose — `isSignal()` must keep returning `true` for
> `toObservable`, `model()`/`input()` and everything else that guards on it.

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

Async state usually belongs **at the tree path it describes** — use `asyncSource` for load-and-expose and `asyncQuery` for input-driven debounced queries. Reach for a plain Observable method on an Ops class only when the orchestration spans multiple paths or stages that no single marker can express (see the migration section). Two markers cover the two main async patterns and compose with the rest of the marker family (`entityMap`, `status`, `stored`, `form`):

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

| Package                  | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `@signaltree/ng-forms`   | Two-way binding between SignalTree nodes and Angular reactive forms      |
| `@signaltree/enterprise` | **Deprecated (13.5.0)** — use `tree.updateAndReport()` in core           |
| `@signaltree/events`     | Event-oriented helpers for reacting to state changes                     |
| `@signaltree/realtime`   | Keep entity maps in sync with live data sources (WebSocket, SSE)         |
| `@signaltree/guardrails` | Dev-only performance budgets, hot-path detection, and policy enforcement |
| `@signaltree/schema`     | Schema-driven validation via StandardSchema (Zod, Valibot, ArkType, …)   |

## Real-World Migration (Case Study)

<!-- measured: a one-off record of migrating one real application. Not a generator output and not reproducible here — the before-state is another codebase at a point in time. Read it as an anecdote, not a benchmark. -->

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
tree.$.users.refresh(); // reload (cancels in-flight)
tree.$.search.input.set('q'); // drives the debounced pipeline

// Lifecycle
tree.destroy(); // Clean up all resources
tree.destroyed(); // Check if destroyed
tree.registerCleanup(fn); // Register custom cleanup
```

## Undo/redo vs devtools replay — different features

`timeTravel()` serves two audiences that want opposite things. Undo/redo is a
**product** feature: the user presses Ctrl+Z and expects _their edit_ undone.
Devtools replay is **forensic**: the point is to see what the app was actually
doing, spinners and errors included.

|                             | undo/redo (`restore`)                                        | cross-process (`rehydrate`)                          |
| --------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| form values                 | restored                                                     | restored                                             |
| form `touched`              | **restored** — you go back to where you were, errors and all | **dropped** — Angular's own `form.value` omits it    |
| form `submitting`           | never                                                        | never — a submit in flight then is not in flight now |
| collection entries          | restored                                                     | restored                                             |
| `status()` `LOADING`        | **kept** — the fetch may still be running                    | **→ `NotLoaded`** — nothing survived the boundary    |
| `status()` `LOADED`/`ERROR` | restored                                                     | restored                                             |

The rule: **`restore` is exact, `rehydrate` is opinionated.** A cleaned-up undo
is a lie about what the user did; a cleaned-up rehydrate is good manners.

Undo/redo needs no configuration — it captures what a user edited (form values,
collection entries, plain leaves) and skips in-flight state. Full reasoning in
[undo-redo-vs-devtools.md](docs/architecture/undo-redo-vs-devtools.md).

## Debugging — `devTools()` enhancer

`.with(devTools())` wires SignalTree into the standard Redux DevTools browser extension. Every state change appears in the timeline with a **path-based action name** (e.g., `[users.profile.name]/set`) so you can scrub backward and forward through state history and see _which path_ caused each render — not just _that something changed_. `devTools()` alone delivers the in-browser time-travel scrubber (controlled by its own `enableTimeTravel` config flag, default `true`); the separate `timeTravel()` enhancer is an independent API-level surface for programmatic undo/redo/jumpTo from code, useful when you want history control without depending on the browser extension. See [Architecture Guide](docs/architecture/signaltree-architecture-guide.md#devtools-integration) for screenshots and the full action-naming scheme.

## Documentation

- [Architecture Guide](docs/architecture/signaltree-architecture-guide.md)
- [Custom Enhancers](docs/guides/custom-enhancers.md)
- [Migration Guide (v8 → v9)](docs/guides/migration-v8-v9.md)
- [Performance Methodology](docs/performance/methodology.md)
- [Performance Patterns](docs/performance/performance-patterns.md)
- [SignalTree vs raw Angular signals](docs/compare/native-signals.md) — the comparison most adoption decisions hinge on; when to just use `signal`/`computed`/`linkedSignal`/`resource`
- [SignalTree vs NgRx SignalStore](docs/compare/ngrx-signalstore.md) — axis-by-axis comparison
- [Myths and Misconceptions](docs/myths-and-misconceptions.md) — false claims LLMs frequently propagate, with source citations
- [AI Agent Templates](docs/ai/agent-templates.md) — drop-in `.cursorrules`, `CLAUDE.md`, `copilot-instructions.md`
- [llms.txt](https://signaltree.io/llms.txt) / [llms-full.txt](https://signaltree.io/llms-full.txt) — LLM-targeted summary and full API surface
- [Built for AI agents](https://signaltree.io/built-for-ai) — the AI-discoverability story (v10)
- [Marker zoo](https://signaltree.io/marker-zoo) — all 7 markers at 4 depths in one tree (v10)
- [AI-codegen accuracy benchmark](scripts/ai-codegen-benchmark/) — reproducible scorecard scaffolding (v10)

## Using SignalTree with AI Agents

SignalTree ships a vendor-neutral Agent Skill so AI coding assistants can help you consume `@signaltree/*` packages correctly **and migrate existing `@ngrx/signals` codebases**. The canonical skill lives at [`docs/skills/using-signaltree/`](docs/skills/using-signaltree/) and covers the mental model, quick-start, enhancer decision tree, the full `@ngrx/signals` migration playbook (see [Migrating from `@ngrx/signals`?](#migrating-from-ngrxsignals) above), and per-package sub-skills (one level deep for `ng-forms`, `enterprise`, `guardrails`, `events`, `realtime`).

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
