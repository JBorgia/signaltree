---
name: using-signaltree
description: Guides AI agents integrating SignalTree (@signaltree/core and related packages) into Angular 20+ applications. Use when the user mentions SignalTree, @signaltree/core, @signaltree/ng-forms, @signaltree/enterprise, @signaltree/guardrails, @signaltree/events, @signaltree/realtime, signal tree, reactive state, Angular signals store, or Angular state management; when the user wants to create, read, or update a signalTree() state tree; when the user is choosing enhancers (batching, persistence, time travel, devTools) or markers (entityMap, status, stored, form); or when the user is building reactive forms, syncing realtime data, or wiring event-driven flows on top of Angular signals.
---

# Using SignalTree

SignalTree: reactive JSON for Angular. State as shape. Signals at every path. Plain state object → `signalTree()` → every leaf = Angular signal via typed `$` proxy. No action creators, reducer functions, or selector functions — mutations live as named methods on an `Ops` service, derivations as `.derived()` tiers.

Mental model:

- Reactive JSON tree: `signalTree(state)` mirrors input shape. Leaves = `WritableSignal<T>`. Branches = typed accessors.
- `$` proxy: `tree.$.user.profile.name` = signal; `tree.$.user.profile` = group accessor.
- Read: `tree.$.count()` — subscribes reactive context.
- Write leaf: `.set(value)` / `.update(fn)`. Write branch (both forms are **deep-merge partial writes** — keys absent from the payload are preserved): `tree.$.user({ name, email })` (partial-merge object) or `tree.$.user((u) => ({ ...u, name }))` (updater function). No dispatch. There is no `tree.set(...)` — the root is callable: `tree(partial)` or `tree(updater)`.
- Enhancers: `tree.with(batching()).with(devTools())` — order-sensitive.
- Markers: `entityMap<User>()`, `entityMap<Plant>({ load: loader(fn) })` (cache-aware (single-scope) form), `status()`, `stored(key, defaultValue)`, `form<T>({ initial: T })`, `compared(value, equal)` (v13.5+, per-leaf equality) — placeholders; `signalTree()` replaces each with its runtime API at that path. Branches are natively callable for reads AND writes (writes are deep-merge partial updates — keys not in the payload are preserved); leaves are NOT callable for writes — use `.set()` / `.update()`. Arrays in leaves are `WritableSignal<T[]>` — use `.update(arr => [...arr, x])`, NOT `.push()`.

> **The one fact everything else follows from: only LEAVES are Angular signals.**
> A branch is not a signal — it's a plain accessor function. This asymmetry is the
> single most common thing agents get wrong about this codebase, so before changing
> anything that touches nodes, check your reasoning against this table:
>
> |                         | leaf (`WritableSignal<T>`)                     | branch / node (`NodeAccessor<T>`)                       |
> | ----------------------- | ---------------------------------------------- | ------------------------------------------------------- |
> | read                    | `leaf()`                                       | `node()` — unwraps the whole subtree                    |
> | write a value           | `leaf.set(v)`                                  | `node({ partial })` — deep merge, absent keys preserved |
> | write from current      | `leaf.update(fn)`                              | `node(fn)` — fn receives the unwrapped value            |
> | has `.set` / `.update`  | yes                                            | **no — by design, and it needs none**                   |
> | called with an argument | **compile error** (14.0.0; was a silent no-op) | writes (this is native core behavior)                   |
>
> Consequences worth stating outright, because each has been "fixed" wrongly before:
> **(1)** Never add `.set()`/`.update()` to a node — the call signatures already do
> both writes, and the names would collide with state keys called `set`/`update`.
> **(2)** Node call-syntax is core behavior, not a plugin, and not something to
> warn users away from.
> **(3)** A LEAF never takes that syntax. `@signaltree/callable-syntax` used to
> promise it via a build transform and was **deleted in 14.0.0**: the transform
> could not run inside an Angular app at all, so `tree.$.leaf(v)` type-checked
> and then silently did nothing. Leaves stay real Angular signals (`isSignal()`
> is `true`), which is what `toObservable` and `model()`/`input()` interop
> require — that is why the sugar was refused rather than implemented.

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
const tree = signalTree({
  counter: 0,
  user: { name: 'Ada', email: 'ada@example.com' },
});
tree.$.user.name(); // read
tree.$.counter.set(1); // write leaf
tree.$.user({ name: 'Grace', email: 'grace@example.com' }); // write branch
```

`$` proxy exposes signals — `@if`, `@for`, `[value]`, two-way bindings work natively. See [`reference/patterns.md`](reference/patterns.md) for template idioms.

Enhancer / package decision tree — start with `@signaltree/core` alone; add only when you hit the matching problem:

- Group CD notifications → `batching()` from `@signaltree/core`.
- Persist tree to `localStorage` → `persistence({ key, autoSave, autoLoad, debounceMs })` from `@signaltree/core`. Single leaf → `stored()` marker.
- `computed()` running too often → use Angular's `computed()` — it already memoizes by reference. SignalTree no longer ships a `memoization` enhancer (removed in 9.0.1); for deep-equality cache keys, derive via your own `computed()` with explicit comparison.
- Debug history, time travel, Redux DevTools → `timeTravel()` / `devTools({ name })` from `@signaltree/core`. **v14:** `canUndo()`/`canRedo()`/`getHistory()` are REACTIVE — bind them directly (`@if (tree.canUndo())`); before 14.0.0 they read plain values, so a zoneless app's undo button never enabled. **14.1.1:** `pauseRecording`/`resumeRecording`/`isRecordingPaused` are REMOVED (they could not express "one undo step", only "record nothing", and pause was global). `timeTravel({ shouldSkip: (prev, next) => … })` drops uninteresting transitions — it runs on every recorded write, so compare only the fields you mean.
- Report every error the library catches to Sentry/telemetry → `onTreeError` from **`@signaltree/core/authoring`**. Additive: markers still handle their own errors; this cannot swallow or retry.
- **⚠️ Two entry points since 14.0.0.** `@signaltree/core` is the APP surface;
  `@signaltree/core/authoring` is enhancer/marker/tooling plumbing. Emitting an
  authoring symbol from `@signaltree/core` is a compile error. `isDev` and
  `withKind` stayed on the root.

<!-- BEGIN GENERATED: api-entry-points — do not edit by hand; run `node tools/gen-api-surface.mjs` -->

`@signaltree/core` has **33 symbols**. `@signaltree/core/authoring` has **39**, grouped as: reader allowlists (8), marker brands (3), marker type guards (6), other type guards (5), marker authoring (4), enhancer authoring (4), write-path plumbing (4), observation hooks (2), constants (2), other (1).

<!-- END GENERATED: api-entry-points -->

- Large app, bulk updates, diff-based patching, "what changed" reporting → `tree.updateAndReport(partial)`, built into `@signaltree/core`. There is NO `onPathChange`/subscription API in core — do not emit one. Do NOT add `@signaltree/enterprise` — deprecated in 13.5.0 and **removed in 14.0.0** (no longer published). It was measurably slower than the core method that replaced it. To migrate an existing dependency off it, see [`docs/guides/migration-v13-v14.md`](../../guides/migration-v13-v14.md) §6.
- Reactive forms (validation, dirty/touched, wizards, FormGroup interop) → add `@signaltree/ng-forms`; on Angular 22+ the same package bridges to **Signal Forms** via `signalForm` from `@signaltree/ng-forms/signals`. Read [`ng-forms/SKILL.md`](ng-forms/SKILL.md).
- Dev-time perf budgets, memory-leak detection, anti-pattern warnings → add `@signaltree/guardrails` (dev-only; noop in production). Read [`guardrails/SKILL.md`](guardrails/SKILL.md).
- Event-driven with Zod schemas, idempotency, retries → add `@signaltree/events` (ESM-only, requires Zod). Read [`events/SKILL.md`](events/SKILL.md).
- Sync tree to Supabase / Firebase / WebSocket → add `@signaltree/realtime`, compose `supabaseRealtime()` or `realtime()`. Read [`realtime/SKILL.md`](realtime/SKILL.md).

Composing enhancers — typical production shape:

```ts
import { signalTree, batching, devTools } from '@signaltree/core';

interface AppState {
  counter: number;
  ui: { theme: 'light' | 'dark' };
}

const tree = signalTree<AppState>({ counter: 0, ui: { theme: 'light' } })
  .with(batching({ enabled: true, notificationDelayMs: 0 }))
  .with(devTools({ name: 'AppStore' }));
```

Cross-package enhancers (`guardrails()`, `formBridge()`, `supabaseRealtime(...)`) slot into same chain.

Angular Signal Forms bridge (Angular 22+, v11.6+) — not an enhancer; `signalForm` from `@signaltree/ng-forms/signals` turns a `form()` marker into a Signal Forms `FieldTree` sharing the marker's values signal (one model, no sync loops):

```ts
import { signalForm } from '@signaltree/ng-forms/signals';
import { signalTree, form } from '@signaltree/core';

const tree = signalTree({
  onboarding: { profile: form({ initial: { name: '' } }) },
});
const profile = signalForm(tree.$.onboarding.profile); // FieldTree<{ name: string }>
// template: <input [formField]="profile.name" /> — marker validators run as Signal Forms
// validators with real error kinds; built-ins emit Angular's branded errors by
// default (13.2+) — pass { nativeErrors: false } for plain { kind, message }.
// Async validation is NOT unified — pick ONE authority (marker submit() path OR validateAsync).
```

Schema-registry overload: `signalForm<TModel>(tree, rootPath, tree.$.subtree)` after `.with(schemas(...))` auto-applies every registered schema under `rootPath`. (`markerSignalForm`/`signalFormBridge` are deprecated 11.5.0 aliases — emit `signalForm`.)

Markers — placed in initial state, replaced by `signalTree()` with fully-typed runtime API:

- `entityMap<T, K>()` — O(1) CRUD: `addOne`, `upsertOne`, `removeOne`, `setAll`, `byId`, `all`, `clear`. **v14:** `prependOne`/`prependMany` (insert at the FRONT — `setAll([new, ...old])` rebuilds every per-entity signal, prepend does not), `changeId(from, to)` (adopt the server's id after an optimistic create — keeps list position, node cache and active selection; ⚠️ a node HELD from `byId(oldId)` resolves to `undefined` afterwards, re-read with `byId(newId)`), and the **active-entity** surface `setActiveId`/`clearActiveId`/`activeId()`/`activeEntity()` (master/detail; `activeEntity` resolves through the per-entity signal, so an unrelated row changing does NOT recompute it — a hand-rolled `computed(() => all().find(...))` would). Predicates: `.empty()` (the `.isEmpty` alias was removed in v11). Reads: `.count()`, `.has(id)`, `.where(pred)`, `.find(pred)`. Config: `entityMap<T,K>({ selectId, sortComparer })` — v10.5+ `sortComparer` keeps `all()`/`ids()` sorted (`@ngrx/entity` parity). `byId(id).field()` is body-granular (fan-out 1). `.computed('name', all => …)` attaches a derived slice to the collection at declaration; read it as `tree.$.users.name()` — **typed on `tree.$` since v13.2**, no cast, and chainable (each name typed independently). `compute` sees only that collection's `E[]`, so cross-collection/external-state projections stay a normal `computed`/`.derived()`. **Cache-aware / self-loading form (v11.2+, scoped form v11.4+):** wrap a load function with the `loader()` helper and pass it as `load` in config, and `entityMap` gains a loader surface — **use this instead of hand-wiring `entityMap` + `status` + a loader + a load-guard** for any server-backed collection. `loader()` is a separate export from `@signaltree/core`; it's what keeps the loader machinery tree-shakeable — a plain `entityMap()` (no `load`) doesn't pay for it. Config adds: `config.load: loader(() => Observable<E[]> | Promise<E[]>, { staleTime, swr, tags, persist, equal, lazy, clearOnParamsChange })` — `staleTime` (`'30m'`/ms — skip refetch while fresh; default `0` = always stale), `swr` (serve last value while revalidating), `tags` (for `invalidateTag`), `persist` (offline-first hydrate-then-revalidate via a `StorageAdapter`). Methods added: `.load()` (guarded — no-op if fresh OR in-flight, so N callers = one fetch), `.loadOrThrow()` (same guard as `.load()`, but rejects with the loader's error instead of only surfacing it via `.error()` — for imperative await/try-catch call sites; `.load()` never rejects), `.refresh()` (force, still single-in-flight), `.invalidate()` (mark stale — next `load()` refetches), `.reset()` (forget everything: empty the rows AND drop the cache entry). Status: `.loading()`, `.loaded()`, `.error()`, `.lastLoadedAt()`. **Mutators never touch cache freshness** — `staleTime` records when the collection last synced with the server, not whether the local rows still match it, so `clear()` (and `removeWhere(() => true)`, identically) leaves `loaded()` true and the next `load()` still guarded. Use `clear()` + `refresh()` to empty-then-refetch, or `.reset()` for the full drop — it also abandons any in-flight fetch (so a late response can't repopulate) and removes the current scope's persisted snapshot (so `hydrateThenRevalidate` can't seed the deleted rows back), neither of which `clear()` can do. Tag-based push invalidation: `invalidateTag(tree, 'plants')` marks every collection carrying that tag stale — the clean seam for SSE/SignalR (`@signaltree/realtime`). Auto-loads on first `tree.$` access (unless `loader()`'s `lazy: true`). **Scoped form (v11.4+):** a wrapped loader function that declares a param makes the collection scoped: `entityMap<E, K, P>({ load: loader((p) => api.list$(p)) })` — call `load(params)` with the scope (region/customer/tenant); freshness (`staleTime`) is tracked per scope via `loader()`'s `equal?: (a, b) => boolean` option (default: structural value compare), so a scope change refetches even if the old scope was fresh, and a different scope requested mid-fetch supersedes (last-request-wins). `params()` exposes the loaded scope (typed `Signal<P | undefined>`); `refresh(params?)` forces a reload; `loader()`'s `clearOnParamsChange` option blanks rows on scope change. Scoped collections are always lazy. Single-scope cache (no multi-key LRU yet). (Auto-load is deferred off the render pass, so a non-lazy collection read in a template is NG0600-safe.) There is no separate `entityCollection` marker — a plain `entityMap<T, K>()` (no `load`) is unaffected.
- `status()` — async op state. Write methods: `setLoading()` / `setLoaded()` / `setError(err)` / `setNotLoaded()` / `reset()`. v10.2 Promise-vocabulary aliases also work: `.start()` (= setLoading), `.setSuccess()` / `.succeed()` (= setLoaded), `.fail(err)` (= setError). Read predicates (canonical, bare names): `.loading()`, `.loaded()`, `.notLoaded()`, `.hasError()`, `.idle()`, `.settled()` — all callable signals, invoke them. (The `is`-prefix aliases were removed in v11.) `.settled()` = `loaded() || hasError()` ("done, stop the spinner"). **In a guard/resolver use `.idle()`** (= `!loading() && !loaded()`, covers NotLoaded AND Error) as the "should I (re)fetch?" predicate — `.notLoaded()` is false in the Error state, so a `.notLoaded()`-gated fetch silently never retries after an error. Prefer `.idle()` over `state() === …` enum comparisons.
- `asyncSource<T>(config)` — load-and-expose (preferred over `status()` + manual try/catch). Auto-derives `.loading()`, `.error()`, `.data` accessor, `.refresh()` reload.
- `asyncQuery<TInput, TResult>(config)` — input-driven debounced query with built-in switchMap + dedup pipeline. Drive via `.input.set(value)`; read current result on `.results` / `.data`; status on `.loading()` / `.error()`. Lifecycle: `.rerun()` re-fires with the current input (bypasses dedup), `.reset()` clears state. No `.refresh()` — that's on `asyncSource` only.
- **Streaming/LLM token output — no exported marker.** An `asyncStream` marker exists in-repo but is experimental and NOT exported from `@signaltree/core` as of 11.x — do not emit `asyncStream` or `createAsyncStreamSignal` (the import fails). `asyncSource`/`asyncQuery` REPLACE per emission (wrong tool for token deltas) — accumulate into a plain leaf instead: `tree.$.reply.update((t) => t + chunk)` inside a `for await` over the SDK's stream. There is no `@signaltree/ai` package — wire your AI SDK in directly. Don't model tokens as a pushed array.
- `stored(key, default)` — single signal backed by `localStorage`. Writes are debounced (100 ms default) but durable: pending writes drain automatically on `visibilitychange`/`pagehide`; `.flush()` commits one signal's pending write, `flushAllStoredSignals()` (exported from core) drains all — wire it to native lifecycle hooks (e.g. Capacitor `App` `'pause'`). `debounceMs: 0` writes synchronously; `maxWaitMs` caps delay under continuous updates; `onError` surfaces storage failures. `.clear()`/`.reload()` cancel pending writes; `.reload()` runs `migrate` like initial load.
- `form<T>(config: FormConfig<T>)` — tree-integrated form marker, **exported from `@signaltree/core`** (`@signaltree/ng-forms` is a separate FormGroup bridge, not the marker source). Config requires `{ initial: T, validators?, asyncValidators?, wizard? }`. Read the value by calling the marker (`tree.$.profile()`) or via the v10.4 alias `tree.$.profile.data()` — both return `T`. Bare-name accessors: `.dirty`, `.valid`, `.touched`, `.submitting` (NOT `.pristine`, NOT `.isDirty()`); value accessors: `.errors`, `.errorList`. Methods: `.validate()`, `.validateField(field)`, `.touch(field)`, `.submit(handler)` (handles touchAll + validate + submitting toggle + error trap internally).

Audit trail — `createAuditTracker(tree, auditLog, config?)`, **exported from `@signaltree/core`** (v13; `@signaltree/ng-forms/audit` is now a `@deprecated` back-compat re-export — import from core). Framework-agnostic and tree-shakeable (only bundled if imported); not an Angular-forms concern, works on any `signalTree()`. Pushes an `AuditEntry<T>` (`{ timestamp, changes, previousValues?, metadata? }`) into your own `auditLog: AuditEntry<T>[]` array on every state change, and returns an unsubscribe `() => void`. Config: `{ includePreviousValues?, getMetadata?: () => AuditMetadata, filter?: (changes) => boolean, maxEntries? }` (`maxEntries` bounds the log via a ring-buffer trim; `0` = unlimited). Uses `tree.subscribe()` when the tree has one; core `signalTree()` doesn't, so it falls back to ~100ms polling automatically — no extra wiring needed either way. `createAuditCallback(auditLog, getMetadata?)` returns a bare `(previous, current) => void` diff callback for when you already have your own `tree.subscribe()` call site instead.

Full signatures: [`reference/core.md`](reference/core.md).

Deep dives:

- [`reference/core.md`](reference/core.md) — `signalTree()` signatures, `$` proxy, markers, enhancer composition, reads/writes.
- [`reference/patterns.md`](reference/patterns.md) — idiomatic creation, templates, `computed()`/`effect()` interop, bulk updates, `derivedFrom`, **hybrid migration via legacy facade adapters**, lifetime caveats for root-provided Ops.
- [`reference/testing.md`](reference/testing.md) — `provideAppTreeForTesting()` recipe, mocking matrix (tree vs ops vs facade), common test-bed pitfalls.
- [`reference/anti-patterns.md`](reference/anti-patterns.md) — what not to do.
- [`reference/install.md`](reference/install.md) — Angular version requirement, install commands.
- [`reference/migration-from-ngrx-signals.md`](reference/migration-from-ngrx-signals.md) — mechanical mapping guide when porting an existing `@ngrx/signals` codebase. Only relevant for `@ngrx/signals` (`signalStore`, `withState`, `rxMethod`) — not classic `@ngrx/store`.
- [`reference/migration-from-ngrx-store.md`](reference/migration-from-ngrx-store.md) — mechanical mapping guide when porting a **classic `@ngrx/store`** codebase (`createAction`/`createReducer`/`createSelector`/`createEffect`, `@ngrx/entity`, `StoreModule`/`provideStore`). Actions → `Ops` methods, reducers → signal writes, selectors → `computed()`/derived tiers, effects → `asyncSource`/`Ops` observables. Shares the target architecture with the `@ngrx/signals` guide.
- `compared<T>(value, equal)` / `byKeys(...keys)` (v13.5+) — give ONE leaf its own equality function. Returns `T`, not a wrapper, so the tree type is unchanged: `user: compared(initialUser, byKeys<User>('id','version'))`. Measured, 2M writes to one leaf: an object `{id,name,email,version}` 53.8ns → 8.9ns (6.0x); the SAME object re-fetched over HTTP (equivalent value, new identity) 110.3ns → 9.0ns (12.2x). The decisive property is not speed — a comparator reaches the reference-equality floor (`Object.is`, 8.6ns) WHILE KEEPING re-fetch correctness, which is why defaulting leaves to `Object.is` stays wrong. `byKeys()` is O(keys), so a `version` counter makes equality constant-time however large the value grows (trade: a change outside the listed keys is a no-op and does not notify). **Do NOT emit it for primitives** — `deepEqual` short-circuits on its first line and measures 6.5ns against `Object.is`'s 8.1ns on a changing number; there is nothing to specialise. **It does not fix large collections** — still O(N), and it cannot touch the `slice()` that built the array. `compared()` makes its position a LEAF even for an object value (no `tree.$.user.name` accessor).
- **`tree()` is memoised and structurally shared (v13.5+)** — it rebuilds only nodes beneath a signal that actually changed and returns clean subtrees BY REFERENCE. Two consequences: (1) **`tree()` no longer returns a fresh object; mutating a snapshot corrupts the cache**, and snapshots are frozen in dev so it throws — copy first if you must mutate. Do NOT emit code that mutates the result of `tree()`/`unwrap()`. (2) `prev !== next` at any node is a meaningful change check now. This makes `timeTravel()` flat in state size (50 writes at 10k rows: 340.60ms → 0.04ms) and `getHistory()` returns entry states by reference.
- **[ST2018]** dev warning when a leaf holds 32+ objects with a stable `id`/`_id`/`uuid`/`key` → emit `entityMap({ selectId })` instead. As a plain array leaf, 1000 updates to a 50k collection measure ~40ms against ~0.3ms via `entityMap` — two orders of magnitude, and roughly level with the immutable stores (NgRx SignalStore ~39ms) because the leaf is rebuilt AND walked for equality. Quote the absolutes, not a multiplier: the entityMap side is sub-millisecond and load-sensitive, so the ratio spans ~47x-183x. Re-setting values already present costs MORE (~132ms) than changing them, since `deepEqual` cannot short-circuit. If the array is read-only or always replaced wholesale, that is fine — `compared()` silences it.

- [`reference/optimal-implementation.md`](reference/optimal-implementation.md) — prescribed file/folder layout, pattern defaults (`entityMap`, multi-tier derived, enhancer baseline), and the migration definition-of-done checklist. **Read this before beginning any non-trivial migration.**
- [`reference/orchestrating-a-migration.md`](reference/orchestrating-a-migration.md) — process playbook for an orchestrator agent driving one or more implementer subagents through a phased SignalTree adoption. Applies to NgRx Signal Store migration (default), classic NgRx / `BehaviorSubject` / `@Injectable` state migration (with adapted Phase 1 greps), and greenfield adoption (Phase 1 is a no-op). Load when the work spans more than ~5 consumer files, when a single implementer is likely to exhaust its context window, or when the user asks for a phased / supervised rollout.

Sub-skills:

- [`ng-forms/SKILL.md`](ng-forms/SKILL.md)
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
- **Big-bang migration is the default.** Migrate every domain, delete every legacy store, drop the legacy package from `package.json` in the same PR. The hybrid-facade pattern is a _fallback_ for when PR-size, team-coordination, or release-cadence constraints prevent big-bang — never an end-state. If you ship a hybrid facade, it must include a `// TODO(legacy-facade): remove by <date/release>` and a tracking issue. See [`reference/optimal-implementation.md`](reference/optimal-implementation.md) and [`reference/migration-from-ngrx-signals.md`](reference/migration-from-ngrx-signals.md).
- **Big-bang means deletion in the same commit.** Standing up the new `AppStore` next to the legacy `signalStore` files is _not_ a migration — it's a hybrid you forgot to finish. Before declaring done, the legacy `*.store.ts` files for every migrated domain must be `rm`-ed (along with their `*.store.spec.ts` siblings and any re-exports), and `grep -rln '@ngrx/signals' <migrated-app-src>/` must return empty. If the grep is non-empty and you are not on the explicit hybrid-fallback path, **stop and finish the deletion before continuing**.
- **Pattern defaults you must apply** unless the codebase explicitly forbids them:
  - **`entityMap<T, K>()` for any keyed collection** (anything with `id`/key lookup, membership tests, or cross-references). Plain `T[]` is only correct for ordered, append-only, non-keyed lists.
  - **Per-domain state files** (`tree/state/<domain>.state.ts`) once the tree has more than two domains. Don't keep all state in one `app-tree.ts`.
  - **Multi-tier `.derived()` chains in named files** (`tree/derived/tier-<concern>.derived.ts`) once you have ≥ 3 derived concerns or any cross-tier dependency. See [`reference/patterns.md`](reference/patterns.md#splitting-derived-tiers-into-separate-files).
  - **Enhancer baseline for production trees**: `devTools({ name }) + batching() + timeTravel()` minimum. Tests skip enhancers; production does not. (`memoization` was removed in 9.0.1 — use Angular `computed()`.)
  - **Cross-domain orchestration belongs on `AppStore`**, not on any one Ops class. Single-domain methods belong on Ops; methods that touch ≥ 2 domains belong on `AppStore`.
- **Definition of done for a migration:** (1) zero imports of the legacy package in the migrated app, (2) legacy package removed from `package.json` (or, if other apps still use it, a tracking ticket exists for removal), (3) test suite green, (4) DevTools shows the new tree under the chosen `name`. The full checklist is in [`reference/optimal-implementation.md`](reference/optimal-implementation.md#definition-of-done).
