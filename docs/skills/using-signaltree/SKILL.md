---
name: using-signaltree
description: Guides AI agents integrating SignalTree (@signaltree/core and related packages) into Angular 20+ applications. Use when the user mentions SignalTree, @signaltree/core, @signaltree/ng-forms, @signaltree/enterprise, @signaltree/callable-syntax, @signaltree/guardrails, @signaltree/events, @signaltree/realtime, signal tree, reactive state, Angular signals store, or Angular state management; when the user wants to create, read, or update a signalTree() state tree; when the user is choosing enhancers (batching, memoization, persistence, time travel, devTools) or markers (entityMap, status, stored, form); or when the user is building reactive forms, syncing realtime data, or wiring event-driven flows on top of Angular signals.
---

# Using SignalTree

SignalTree: reactive JSON for Angular. Plain state object → `signalTree()` → every leaf = Angular signal via typed `$` proxy. No actions, reducers, selectors, or registration.

Mental model:
- Reactive JSON tree: `signalTree(state)` mirrors input shape. Leaves = `WritableSignal<T>`. Branches = typed accessors.
- `$` proxy: `tree.$.user.profile.name` = signal; `tree.$.user.profile` = group accessor.
- Read: `tree.$.count()` — subscribes reactive context.
- Write leaf: `.set(value)` / `.update(fn)`. Write branch: `tree.$.user({ name, email })` (replace) or `tree.$.user((u) => ({ ...u, name }))` (patch). No dispatch.
- Enhancers: `tree.with(batching()).with(memoization())` — order-sensitive.
- Markers: `entityMap<User>()`, `status()`, `stored(key, default)`, `form(fields)` — placeholders; `signalTree()` replaces each with its runtime API at that path.

Don't introduce actions, reducers, action creators, or selectors — they fight the design. No module registration.

**App-wide state always uses one tree.** All domains (auth, settings, tickets, feature flags, …) go into a single `signalTree()` call — never one tree per domain or one tree per service. The pattern:
- `createAppTree()` — composes all domain state factories into one `signalTree()`, wired via an `APP_TREE` `InjectionToken` and a `provideAppTree()` function.
- `AppStore` — a single `providedIn: 'root'` class that injects `APP_TREE`, exposes `readonly $ = this.tree.$`, and namespaces per-domain `Ops` classes under `readonly ops = { … } as const`.
- `Ops` classes — one per domain (`DriverOps`, `SettingsOps`, …), each `Injectable`, each injecting `APP_TREE` directly for writes. No business logic in `AppStore` itself.
- **Consumers (components, resolvers, interceptors, guards) inject `AppStore` only** — never an Ops class or `APP_TREE` directly. Reads go through `store.$`; writes go through `store.ops.<domain>.<method>()`.

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
- `computed()` running too often / need deep-equality cache keys → `memoization({ maxCacheSize, equality, enableLRU })` from `@signaltree/core`.
- Debug history, time travel, Redux DevTools → `timeTravel()` / `devTools({ treeName })` from `@signaltree/core`.
- Large app, bulk updates slow, diff-based patching → add `@signaltree/enterprise`, compose `enterprise()`. Read [`enterprise/SKILL.md`](enterprise/SKILL.md).
- Reactive forms (validation, dirty/touched, wizards, FormGroup interop) → add `@signaltree/ng-forms`. Read [`ng-forms/SKILL.md`](ng-forms/SKILL.md).
- `tree.$.field('value')` sugar over `.set()` → add `@signaltree/callable-syntax` (build-time transform, zero runtime cost). Read [`callable-syntax/SKILL.md`](callable-syntax/SKILL.md).
- Dev-time perf budgets, memory-leak detection, anti-pattern warnings → add `@signaltree/guardrails` (dev-only; noop in production). Read [`guardrails/SKILL.md`](guardrails/SKILL.md).
- Event-driven with Zod schemas, idempotency, retries → add `@signaltree/events` (ESM-only, requires Zod). Read [`events/SKILL.md`](events/SKILL.md).
- Sync tree to Supabase / Firebase / WebSocket → add `@signaltree/realtime`, compose `supabaseRealtime()` or `createRealtimeEnhancer()`. Read [`realtime/SKILL.md`](realtime/SKILL.md).

Composing enhancers — typical production shape:

```ts
import { signalTree, batching, memoization, devTools } from '@signaltree/core';

interface AppState { counter: number; ui: { theme: 'light' | 'dark' } }

const tree = signalTree<AppState>({ counter: 0, ui: { theme: 'light' } })
  .with(batching({ enabled: true, notificationDelayMs: 0 }))
  .with(memoization({ maxCacheSize: 100, equality: 'shallow', enableLRU: true }))
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
- [`reference/patterns.md`](reference/patterns.md) — idiomatic creation, templates, `computed()`/`effect()` interop, bulk updates, `derivedFrom`/`externalDerived`.
- [`reference/anti-patterns.md`](reference/anti-patterns.md) — what not to do.
- [`reference/install.md`](reference/install.md) — Angular version requirement, install commands.
- [`reference/migration-from-ngrx-signals.md`](reference/migration-from-ngrx-signals.md) — mechanical mapping guide when porting an existing `@ngrx/signals` codebase. Only relevant for `@ngrx/signals` (`signalStore`, `withState`, `rxMethod`) — not classic `@ngrx/store`.

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
