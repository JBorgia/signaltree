---
name: using-signaltree
description: Guides AI agents integrating SignalTree (@signaltree/core and related packages) into Angular 20+ applications. Use when the user mentions SignalTree, @signaltree/core, @signaltree/ng-forms, @signaltree/enterprise, @signaltree/callable-syntax, @signaltree/guardrails, @signaltree/events, @signaltree/realtime, signal tree, reactive state, Angular signals store, or Angular state management; when the user wants to create, read, or update a signalTree() state tree; when the user is choosing enhancers (batching, persistence, time travel, devTools) or markers (entityMap, status, stored, form); or when the user is building reactive forms, syncing realtime data, or wiring event-driven flows on top of Angular signals.
---

# Using SignalTree

SignalTree: reactive JSON for Angular. Plain state object → `signalTree()` → every leaf = Angular signal via typed `$` proxy. No actions, reducers, selectors, or registration.

Mental model:
- Reactive JSON tree: `signalTree(state)` mirrors input shape. Leaves = `WritableSignal<T>`. Branches = typed accessors.
- `$` proxy: `tree.$.user.profile.name` = signal; `tree.$.user.profile` = group accessor.
- Read: `tree.$.count()` — subscribes reactive context.
- Write leaf: `.set(value)` / `.update(fn)`. Write branch: `tree.$.user({ name, email })` (replace) or `tree.$.user((u) => ({ ...u, name }))` (patch). No dispatch.
- Enhancers: `tree.with(batching()).with(devTools())` — order-sensitive.
- Markers: `entityMap<User>()`, `status()`, `stored(key, default)`, `form(fields)` — placeholders; `signalTree()` replaces each with its runtime API at that path.

Don't introduce actions, reducers, action creators, or selectors — they fight the design. No module registration.

**App-wide state always uses one tree.** All domains (auth, settings, tickets, feature flags, …) go into a single `signalTree()` call — never one tree per domain or one tree per service. The pattern:
- `createAppTree()` — composes all domain state factories into one `signalTree()`, wired via an `APP_TREE` `InjectionToken` and a `provideAppTree()` function. **Also export `createBaseState()`** — tests need it to build isolated trees.
- `AppStore` — a single `providedIn: 'root'` class that injects `APP_TREE`, exposes `readonly $ = this.tree.$`, and namespaces per-domain `Ops` classes under `readonly ops = { … } as const`.
- `Ops` classes — one per domain (`DriverOps`, `SettingsOps`, …), each `Injectable`, each injecting `APP_TREE` directly for writes. No business logic in `AppStore` itself.
- **Consumers (components, resolvers, interceptors, guards) inject `AppStore` only** — never an Ops class or `APP_TREE` directly. Reads go through `store.$`; writes go through `store.ops.<domain>.<method>()`.
- **Ship `provideAppTreeForTesting()` alongside `provideAppTree()` from day one.** `AppStore` is `providedIn: 'root'`, so every `TestBed` that touches it (or any consumer that touches it transitively) will fail with `NG0201: APP_TREE` until tests provide the token. See [`reference/testing.md`](reference/testing.md).

Read [`reference/patterns.md`](reference/patterns.md) for the full wiring before writing any store code.

Component-local state (a single component's ephemeral UI state) is the only case where a tree lives outside `APP_TREE`.

Install:

```bash
npm install @signaltree/core
# pnpm: pnpm add @signaltree/core
```

See [`reference/install.md`](reference/install.md) for optional packages and peer-dependency details.

```ts
import { signalTree } from '@signaltree/core';
const tree = signalTree({ counter: 0, user: { name: 'Ada', email: 'ada@example.com' } });
tree.$.user.name();                                       // read
tree.$.counter.set(1);                                    // write leaf
tree.$.user({ name: 'Grace', email: 'grace@example.com' }); // write branch
```

`$` proxy exposes signals — `@if`, `@for`, `[value]`, two-way bindings work natively. See [`reference/patterns.md`](reference/patterns.md) for template idioms.

Enhancer / package decision tree — start with `@signaltree/core` alone; add only when you hit the matching problem:

- Group CD notifications → `batching()` from `@signaltree/core`.
- Persist tree to `localStorage` → `persistence({ key, autoSave, autoLoad, debounceMs })` from `@signaltree/core`. Single leaf → `stored()` marker.
- `computed()` running too often → use Angular's `computed()` — it already memoizes by reference. SignalTree no longer ships a `memoization` enhancer (removed in 9.0.1); for deep-equality cache keys, derive via your own `computed()` with explicit comparison.
- Debug history, time travel, Redux DevTools → `timeTravel()` / `devTools({ treeName })` from `@signaltree/core`.
- Large app, bulk updates slow, diff-based patching → add `@signaltree/enterprise`, compose `enterprise()`. Read [`enterprise/SKILL.md`](enterprise/SKILL.md).
- Reactive forms (validation, dirty/touched, wizards, FormGroup interop) → add `@signaltree/ng-forms`. Read [`ng-forms/SKILL.md`](ng-forms/SKILL.md).
- `tree.$.field('value')` sugar over `.set()` → add `@signaltree/callable-syntax` (build-time transform, zero runtime cost). Read [`callable-syntax/SKILL.md`](callable-syntax/SKILL.md).
- Dev-time perf budgets, memory-leak detection, anti-pattern warnings → add `@signaltree/guardrails` (dev-only; noop in production). Read [`guardrails/SKILL.md`](guardrails/SKILL.md).
- Event-driven with Zod schemas, idempotency, retries → add `@signaltree/events` (ESM-only, requires Zod). Read [`events/SKILL.md`](events/SKILL.md).
- Sync tree to Supabase / Firebase / WebSocket → add `@signaltree/realtime`, compose `supabaseRealtime()` or `createRealtimeEnhancer()`. Read [`realtime/SKILL.md`](realtime/SKILL.md).

Composing enhancers — typical production shape:

```ts
import { signalTree, batching, devTools } from '@signaltree/core';

interface AppState { counter: number; ui: { theme: 'light' | 'dark' } }

const tree = signalTree<AppState>({ counter: 0, ui: { theme: 'light' } })
  .with(batching({ enabled: true, notificationDelayMs: 0 }))
  .with(devTools({ treeName: 'AppStore' }));
```

Cross-package enhancers (`enterprise()`, `guardrails()`, `formBridge()`, `supabaseRealtime(...)`) slot into same chain.

Markers — placed in initial state, replaced by `signalTree()` with fully-typed runtime API:
- `entityMap<T, K>()` — O(1) CRUD: `addOne`, `upsertOne`, `removeOne`, `setAll`, `byId`, `all`, `clear`.
- `status()` — async op state: loading / loaded / error.
- `stored(key, default)` — single signal backed by `localStorage`.
- `form(fields)` — tree-integrated form state; pair with `formBridge()` from `@signaltree/ng-forms`.

Full signatures: [`reference/core.md`](reference/core.md).

Deep dives:
- [`reference/core.md`](reference/core.md) — `signalTree()` signatures, `$` proxy, markers, enhancer composition, reads/writes.
- [`reference/patterns.md`](reference/patterns.md) — idiomatic creation, templates, `computed()`/`effect()` interop, bulk updates, `derivedFrom`/`externalDerived`, **hybrid migration via legacy facade adapters**, lifetime caveats for root-provided Ops.
- [`reference/testing.md`](reference/testing.md) — `provideAppTreeForTesting()` recipe, mocking matrix (tree vs ops vs facade), common test-bed pitfalls.
- [`reference/anti-patterns.md`](reference/anti-patterns.md) — what not to do.
- [`reference/install.md`](reference/install.md) — Angular version requirement, install commands.
- [`reference/migration-from-ngrx-signals.md`](reference/migration-from-ngrx-signals.md) — mechanical mapping guide when porting an existing `@ngrx/signals` codebase. Only relevant for `@ngrx/signals` (`signalStore`, `withState`, `rxMethod`) — not classic `@ngrx/store`.
- [`reference/optimal-implementation.md`](reference/optimal-implementation.md) — prescribed file/folder layout, pattern defaults (`entityMap`, multi-tier derived, enhancer baseline), and the migration definition-of-done checklist. **Read this before beginning any non-trivial migration.**

Sub-skills:
- [`ng-forms/SKILL.md`](ng-forms/SKILL.md)
- [`enterprise/SKILL.md`](enterprise/SKILL.md)
- [`callable-syntax/SKILL.md`](callable-syntax/SKILL.md)
- [`guardrails/SKILL.md`](guardrails/SKILL.md)
- [`events/SKILL.md`](events/SKILL.md)
- [`realtime/SKILL.md`](realtime/SKILL.md)

Operating rules:
- Prefer `@signaltree/core` first. Add optional packages only for concrete problems.
- Never instruct consumers to install `@signaltree/shared`, `@signaltree/types`, or `@signaltree/utils` — private, bundled at build time.
- Never write to a signal inside `computed()` — read-only; side effects in `effect()` or event handlers.
- Custom markers: call `registerMarkerProcessor()` before any `signalTree()` call that relies on them.
- Don't reintroduce Redux-style patterns.
- When unsure of an API, read `packages/<pkg>/src/` — repo is source of truth.
- **One tree per application.** If the codebase has multiple existing stores (ngrx, services, etc.), compose them all into a single `signalTree()` behind `APP_TREE`. Creating multiple `signalTree()` instances for app-wide state is always wrong.
- **A migration is not done until the test suite is green.** Build-green is necessary but not sufficient — the test suite must pass before declaring the migration complete. The most common failure is `NG0201: APP_TREE` in `TestBed`s; fix it via `provideAppTreeForTesting()` ([`reference/testing.md`](reference/testing.md)), not by mocking `AppStore`.
- **Big-bang migration is the default.** Migrate every domain, delete every legacy store, drop the legacy package from `package.json` in the same PR. The hybrid-facade pattern is a *fallback* for when PR-size, team-coordination, or release-cadence constraints prevent big-bang — never an end-state. If you ship a hybrid facade, it must include a `// TODO(legacy-facade): remove by <date/release>` and a tracking issue. See [`reference/optimal-implementation.md`](reference/optimal-implementation.md) and [`reference/migration-from-ngrx-signals.md`](reference/migration-from-ngrx-signals.md).
- **Big-bang means deletion in the same commit.** Standing up the new `AppStore` next to the legacy `signalStore` files is *not* a migration — it's a hybrid you forgot to finish. Before declaring done, the legacy `*.store.ts` files for every migrated domain must be `rm`-ed (along with their `*.store.spec.ts` siblings and any re-exports), and `grep -rln '@ngrx/signals' <migrated-app-src>/` must return empty. If the grep is non-empty and you are not on the explicit hybrid-fallback path, **stop and finish the deletion before continuing**.
- **Pattern defaults you must apply** unless the codebase explicitly forbids them:
  - **`entityMap<T, K>()` for any keyed collection** (anything with `id`/key lookup, membership tests, or cross-references). Plain `T[]` is only correct for ordered, append-only, non-keyed lists.
  - **Per-domain state files** (`tree/state/<domain>.state.ts`) once the tree has more than two domains. Don't keep all state in one `app-tree.ts`.
  - **Multi-tier `.derived()` chains in named files** (`tree/derived/tier-<concern>.derived.ts`) once you have ≥ 3 derived concerns or any cross-tier dependency. See [`reference/patterns.md`](reference/patterns.md#splitting-derived-tiers-into-separate-files).
  - **Enhancer baseline for production trees**: `devTools({ treeName }) + batching() + timeTravel()` minimum. Tests skip enhancers; production does not. (`memoization` was removed in 9.0.1 — use Angular `computed()`.)
  - **Cross-domain orchestration belongs on `AppStore`**, not on any one Ops class. Single-domain methods belong on Ops; methods that touch ≥ 2 domains belong on `AppStore`.
- **Definition of done for a migration:** (1) zero imports of the legacy package in the migrated app, (2) legacy package removed from `package.json` (or, if other apps still use it, a tracking ticket exists for removal), (3) test suite green, (4) DevTools shows the new tree under the chosen `treeName`. The full checklist is in [`reference/optimal-implementation.md`](reference/optimal-implementation.md#definition-of-done).
