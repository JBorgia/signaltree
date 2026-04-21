---
name: using-signaltree
description: Guides AI agents integrating SignalTree (@signaltree/core and related packages) into Angular 20+ applications. Use when the user mentions SignalTree, @signaltree/core, @signaltree/ng-forms, @signaltree/enterprise, @signaltree/callable-syntax, @signaltree/guardrails, @signaltree/events, @signaltree/realtime, signal tree, reactive state, Angular signals store, or Angular state management; when the user wants to create, read, or update a signalTree() state tree; when the user is choosing enhancers (batching, memoization, persistence, time travel, devTools) or markers (entityMap, status, stored, form); or when the user is building reactive forms, syncing realtime data, or wiring event-driven flows on top of Angular signals. Covers the mental model, quick-start, the enhancer decision tree, and pointers into reference docs and nested sub-skills.
---

# Using SignalTree

SignalTree is reactive JSON for Angular. You write a plain state object, hand it to `signalTree()`, and every leaf becomes an Angular signal you can read, write, and compute over by dotting through a typed `$` proxy. There are no actions, reducers, or selectors. Nothing to register. The tree is the store.

This skill covers the core product and routes to nested sub-skills when the user works with a specific package (forms, enterprise, callable-syntax, guardrails, events, realtime).

## Mental model

- **Reactive JSON tree.** `signalTree(state)` returns a tree whose shape mirrors the input. Every leaf is an Angular `WritableSignal`. Every branch is a typed accessor.
- **The `$` proxy.** Typed dot-access to every leaf and branch. `tree.$.user.profile.name` is a signal; `tree.$.user.profile` is a group accessor.
- **Read = call.** `tree.$.count()` reads the current value and subscribes the current reactive context.
- **Write a leaf = `.set(value)` / `.update(fn)`.** Write a branch = call the accessor directly: `tree.$.user({ name, email })` (replace) or `tree.$.user((u) => ({ ...u, name }))` (patch). No dispatch, no reducers.
- **Compose with enhancers.** `tree.with(batching()).with(memoization())`. Enhancers add cross-cutting behavior (batching CD notifications, caching derived values, persisting, time travel). The `.with(...)` chain is order-sensitive — apply enhancers in the order you want them layered.
- **Markers are typed placeholders.** `entityMap<User>()`, `status()`, `stored(key, default)`, `form(fields)` stand in for their runtime values in the initial state object. After `signalTree()` runs, the marker is replaced with the real API at that path.

### What SignalTree is not

- Not NgRx/Redux. Do not introduce actions, reducers, action creators, or selectors on top of it. If you feel the need to, re-read the reactive-JSON mental model.
- Not a service-wrapper-by-default. A tree is a value — a component-local tree belongs on the component. For app-wide state, a single `providedIn: 'root'` service that holds one tree is the target shape (see [`reference/patterns.md`](reference/patterns.md) → "Prefer a single global store"). No module registration required either way.
- Not dependent on decorators, zone tricks, or custom change detection.

## Quick-start

**Before writing any code, install the package:**

```bash
npm install @signaltree/core
# pnpm: pnpm add @signaltree/core
```

See [`reference/install.md`](reference/install.md) for optional packages and peer-dependency details.

Minimal example — create a tree, read it, write it:

```ts
import { signalTree } from '@signaltree/core';

const tree = signalTree({
  counter: 0,
  user: { name: 'Ada', email: 'ada@example.com' },
});

// Read
const name = tree.$.user.name();

// Write (leaf)
tree.$.counter.set(1);
tree.$.counter.update((n) => n + 1);

// Write (replace a subtree — call the branch accessor)
tree.$.user({ name: 'Grace', email: 'grace@example.com' });
```

Using it in an Angular component is just as direct — the `$` proxy exposes signals, so `@if`, `@for`, `[value]`, and two-way bindings all work natively. See [`reference/patterns.md`](reference/patterns.md) for template and component idioms.

## When to use which enhancer or package

Use this decision tree to pick what to pull in. Add packages only when you hit the problem they solve; start with `@signaltree/core` alone.

- **Need to group updates so Angular only runs change detection once?**
  Use `batching()` from `@signaltree/core`. Signal writes are always synchronous; batching only coalesces CD notification timing.

- **Need to persist the tree to `localStorage` across reloads?**
  Use `persistence({ key, autoSave, autoLoad, debounceMs })` from `@signaltree/core`. For a single leaf, prefer the `stored()` marker instead.

- **A `computed()` is running too often, or you need deep/shallow equality for cache keys?**
  Use `memoization({ maxCacheSize, equality, enableLRU })` from `@signaltree/core`. Remember that Angular's built-in `computed()` already memoizes by reference equality — only reach for this enhancer when that isn't enough.

- **Want debugging history, time travel, or Redux DevTools?**
  Use `timeTravel()` and/or `devTools({ treeName })` from `@signaltree/core`.

- **Large app, bulk updates are slow, need diff-based patching or path indexing?**
  Add `@signaltree/enterprise` and compose `enterprise()` into your `.with(...)` chain. Zero overhead until the first optimized update. Read [`enterprise/SKILL.md`](enterprise/SKILL.md).

- **Building reactive forms (validation, dirty/touched, wizards, FormGroup interop)?**
  Add `@signaltree/ng-forms` and use `createFormTree()`, `createWizardForm()`, `formBridge()`, or `withFormHistory()`. Read [`ng-forms/SKILL.md`](ng-forms/SKILL.md).

- **Want `tree.$.field('value')` sugar instead of `tree.$.field.set('value')`?**
  Add `@signaltree/callable-syntax` — a build-time AST transform with zero runtime cost. Read [`callable-syntax/SKILL.md`](callable-syntax/SKILL.md).

- **Need dev-time performance budgets, memory-leak detection, or anti-pattern warnings?**
  Add `@signaltree/guardrails`. It is development-only: conditional package exports swap to a noop build in production. Read [`guardrails/SKILL.md`](guardrails/SKILL.md).

- **Building an event-driven backend/frontend with Zod schemas, idempotency, and retries?**
  Add `@signaltree/events`. Framework-agnostic core with optional NestJS and Angular subpaths. ESM-only, requires Zod. Read [`events/SKILL.md`](events/SKILL.md).

- **Syncing tree state to Supabase / Firebase / a WebSocket?**
  Add `@signaltree/realtime` and compose `supabaseRealtime()` or `createRealtimeEnhancer()`. DB events (INSERT/UPDATE/DELETE) map onto `entityMap` operations automatically. Read [`realtime/SKILL.md`](realtime/SKILL.md).

## Composing enhancers

Enhancers are applied left-to-right via `.with()`. Typical production shape:

```ts
import { signalTree, batching, memoization, devTools } from '@signaltree/core';

interface AppState {
  counter: number;
  ui: { theme: 'light' | 'dark' };
}

const tree = signalTree<AppState>({
  counter: 0,
  ui: { theme: 'light' },
})
  .with(batching({ enabled: true, notificationDelayMs: 0 }))
  .with(memoization({ maxCacheSize: 100, equality: 'shallow', enableLRU: true }))
  .with(devTools({ treeName: 'AppStore' }));
```

Cross-package enhancers (e.g. `enterprise()`, `guardrails()`, `formBridge()`, `supabaseRealtime(...)`) slot into the same chain.

## Markers at a glance

Put a marker in your initial state object and SignalTree replaces it at that path with a fully-typed runtime API.

- `entityMap<T, K>()` — normalized collection with O(1) CRUD (`addOne`, `upsertOne`, `removeOne`, `setAll`, `byId`, `all`, `clear`).
- `status()` — async operation state (loading / loaded / error).
- `stored(key, default)` — a single signal backed by `localStorage`.
- `form(fields)` — tree-integrated form state; commonly paired with `formBridge()` from `@signaltree/ng-forms` for Angular `FormGroup` interop.

Full marker details and signatures live in [`reference/core.md`](reference/core.md).

## Deep dives

- [`reference/core.md`](reference/core.md) — `signalTree()` signatures, the `$` proxy, markers, enhancer composition, reads/writes.
- [`reference/patterns.md`](reference/patterns.md) — idiomatic tree creation, templates, `computed()` and `effect()` interop, bulk updates, `derivedFrom` / `externalDerived`.
- [`reference/anti-patterns.md`](reference/anti-patterns.md) — what not to do and why (no actions/reducers, no writing inside `computed()`, no installing private packages).
- [`reference/install.md`](reference/install.md) — Angular version requirement and install commands, sourced from `peerDependencies`.

Sub-skills (each has its own `SKILL.md`; harnesses that recurse will discover them directly):

- [`ng-forms/SKILL.md`](ng-forms/SKILL.md)
- [`enterprise/SKILL.md`](enterprise/SKILL.md)
- [`callable-syntax/SKILL.md`](callable-syntax/SKILL.md)
- [`guardrails/SKILL.md`](guardrails/SKILL.md)
- [`events/SKILL.md`](events/SKILL.md)
- [`realtime/SKILL.md`](realtime/SKILL.md)

## Operating rules for agents

- Prefer `@signaltree/core` first. Only add optional packages when they solve a concrete problem.
- Never instruct consumers to install `@signaltree/shared`, `@signaltree/types`, or `@signaltree/utils`. These are private and bundled at build time into the public packages.
- Never write to a signal inside `computed()`. `computed()` is read-only; side effects belong in `effect()` or an event handler.
- If the user uses custom markers, call `registerMarkerProcessor()` **before** any `signalTree()` call that relies on them.
- Do not reintroduce Redux-style patterns (actions, reducers, action creators, central selectors file). They fight the design and add boilerplate SignalTree is explicitly avoiding.
- When unsure of the exact API of a symbol, read the package source under `packages/<pkg>/src/` — the repo is the source of truth.
