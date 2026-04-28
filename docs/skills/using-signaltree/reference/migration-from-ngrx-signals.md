---
name: signaltree-migration-from-ngrx-signals
description: One-to-one mapping guide specifically for porting @ngrx/signals stores to SignalTree. Only load this skill when the user is converting code that uses the @ngrx/signals package (signalStore, withState, withMethods, withComputed, withHooks, rxMethod, patchState, withEntities, signalStoreFeature). Do NOT load for classic @ngrx/store (reducers/actions/effects) or @ngrx/component-store migrations — those are different patterns.
---

# Migrating from @ngrx/signals to SignalTree

Quick reference for converting an existing `@ngrx/signals` codebase. Applies **only to `@ngrx/signals`** — the signal-based store package (`signalStore`, `withState`, `rxMethod`). Not applicable to classic `@ngrx/store` (reducers, actions, effects) or `@ngrx/component-store`.

Read the root `SKILL.md`, [`reference/optimal-implementation.md`](./optimal-implementation.md), and [`reference/patterns.md`](./patterns.md) for full SignalTree context; use this file for the mechanical mappings.

## Default: big-bang migration

**Big-bang is the default.** In one PR, you:

0. **Orient yourself in the codebase first.** Before touching any code, answer:

   - **Where is the migrating app's source root?** (e.g. `src/app`, `apps/<name>/src`, `frontend/apps/<name>/src`). This is your `<app-src>` for every grep and the `--src` for the verifier script.
   - **Where is the `package.json` that owns `@ngrx/signals`?** Workspace root in npm/single-app, app-local in pnpm workspaces, frontend-root in some monorepos. This is `--package-json`.
   - **What are the build / test / lint commands?** Read `package.json` `scripts` and any `nx.json` / `angular.json` / `project.json`. These are `--build`, `--test`, `--lint`.
   - **Is this a single app or a monorepo?** If sibling apps in the same `package.json` still import `@ngrx/signals`, you'll need `--allow-dep-presence` in step 6 and a tracking ticket for the dep removal.
   - **Is `@angular-architects/ngrx-toolkit` (or any other `@ngrx/signals`-derivative package) also in use?** If yes, plan to remove it in step 5 and pass `--package` repeatedly in step 6.
   - **Are there shared base classes built on `signalStore` / `signalStoreFeature`?** If yes, decide between the two coexistence strategies in [Hybrid adoption](#hybrid-adoption-fallback-path) before writing any code.
   - **Is `@signaltree/core` already in the discovered `package.json`?** If not, install it before step 1 — see [`install.md`](./install.md). In a pnpm workspace either pass `-w` (root) or `--filter <pkg>` (specific package); plain `pnpm add @signaltree/core` at the workspace root will fail with `ERR_PNPM_ADDING_TO_ROOT`.

   Capture these answers in your scratch notes — every subsequent step references them.

1. **Discover every legacy store and consumer.** The only universal anchor is the package itself — file names, class names, and folder paths vary by codebase. Use these greps regardless of layout:

   ```bash
   grep -rln "from '@ngrx/signals'" <app-src>/   # every consumer + every store file
   grep -rln 'signalStore('         <app-src>/   # every store factory call site
   ```

   The first list is your migration scope; the second list is the set of files you will delete.

2. Stand up the new shape (`AppStore` + `APP_TREE` + per-domain `Ops` + `app-tree.testing.ts`).
3. Migrate **every** consumer from the discovery list to `inject(AppStore)`.
4. **`rm` every file from the `signalStore(` list in the same commit.** Include each file's `*.spec.ts` sibling and any barrel/re-export that points at it. Standing up the new `AppStore` while leaving the legacy files on disk is _not_ a migration — it is a hybrid you forgot to finish, and it will rot.
5. Remove `@ngrx/signals` (and `@angular-architects/ngrx-toolkit` if used) from `package.json` `dependencies` and `peerDependencies`. Update the lockfile.

6. **Verify with [`scripts/verify-signaltree-migration.sh`](../../../../scripts/verify-signaltree-migration.sh).** This is the canonical "am I done?" gate. The script runs all three fingerprint checks (source-import grep, `signalStore(` grep, `package.json` parse) and then the build / test / lint gates in one invocation. It works on any layout and any package manager — you supply the commands:

   ```bash
   scripts/verify-signaltree-migration.sh \
     --src    <app-src> \
     --build  "<your build command>" \
     --test   "<your test command>" \
     --lint   "<your lint command>" \
     [--package-json <path-to-package.json>] \
     [--package <legacy-pkg>]                    # repeatable; default: @ngrx/signals
     [--allow-dep-presence]                      # only if another app in the same monorepo still needs the package
     [--commit "feat(<app>): migrate to SignalTree"]
   ```

   The script does **not** delete anything — that's your job in step 4 (you know which files you just replaced). Non-zero exit means the migration is not done; do not commit, do not write a report, do not declare success.

   **If the script is unavailable** (downstream consumer without the `signaltree` repo checked out), run the equivalent checks manually:

   ```bash
   grep -rln "from '@ngrx/signals'" <app-src>/   # must be empty
   grep -rln 'signalStore('         <app-src>/   # must be empty
   node -e "const p=require('./package.json');                     \
            ['dependencies','peerDependencies'].forEach(k =>       \
              console.assert(!p[k]?.['@ngrx/signals'],             \
                '@ngrx/signals still in '+k));"
   # then your build / test / lint commands
   ```

#### Worked invocations (flex any shape)

```bash
# Nx + pnpm, single app or monorepo with this as the only ngrx app
scripts/verify-signaltree-migration.sh \
  --src   apps/<app>/src \
  --build "pnpm nx build <app>" \
  --test  "pnpm nx test <app>" \
  --lint  "pnpm nx lint <app>" \
  --package-json package.json

# Plain Angular CLI + npm
scripts/verify-signaltree-migration.sh \
  --src   src/app \
  --build "npm run build" \
  --test  "npm test -- --watch=false" \
  --lint  "npm run lint"

# Monorepo where another app still uses @ngrx/signals (don't fail step 3)
scripts/verify-signaltree-migration.sh \
  --src   apps/<app>/src \
  --build "yarn nx build <app>" \
  --test  "yarn nx test <app>" \
  --lint  "yarn nx lint <app>" \
  --allow-dep-presence

# Incremental per-domain migration: only one of N stores migrated this PR.
# --src is narrowed to the new SignalTree foundation so Steps 1+2 still
# assert *that domain* is clean; --allow-source-presence + --allow-dep-presence
# allow the still-on-ngrx siblings to remain. See "Incremental per-domain
# migration" below for the full pattern.
scripts/verify-signaltree-migration.sh \
  --src   apps/<app>/src/app/store \
  --build "pnpm nx build <app>" \
  --test  "pnpm nx test <app>" \
  --lint  "pnpm nx lint <app>" \
  --allow-source-presence \
  --allow-dep-presence

# Migrating off both @ngrx/signals AND @angular-architects/ngrx-toolkit
scripts/verify-signaltree-migration.sh \
  --src   src/app \
  --build "npm run build" \
  --test  "npm test -- --watch=false" \
  --lint  "npm run lint" \
  --package @ngrx/signals \
  --package @angular-architects/ngrx-toolkit
```

The end-state is one mental model in the codebase, no adapter cruft, no "temporary" facades that live forever. See [`optimal-implementation.md`](./optimal-implementation.md#definition-of-done) for the full Definition-of-Done checklist.

**The hybrid-facade pattern is a fallback**, not the recommended path. Use it only when one of the constraints in [`optimal-implementation.md`](./optimal-implementation.md#when-the-hybrid-pattern-is-acceptable) genuinely applies, and ship it with a deletion deadline.

## Incremental per-domain migration

**Use this when big-bang is impractical and hybrid (permanent coexistence) is overkill** — typically: an app has ≥3 `signalStore`s, you want each migration in its own reviewable PR, but the end-state is still one tree. Each PR migrates exactly one domain and leaves the rest untouched on `@ngrx/signals`. The legacy package stays installed until the **last** domain migrates.

When to pick incremental over big-bang or hybrid:

| Shape                                                         | Pick                               |
| ------------------------------------------------------------- | ---------------------------------- |
| 1–2 stores, all owned by one team                             | **big-bang** (one PR)              |
| ≥3 stores, single team, no shared `signalStoreFeature` base   | **incremental** (one PR per store) |
| Shared `signalStoreFeature` base classes blocking partial cut | **hybrid** (legacy facade)         |
| Multi-team consumer cutover constraint                        | **hybrid** (legacy facade)         |

### Phase 0: foundation-only first PR (recommended)

The first PR should add the foundation (`app/store/app-store.ts`, `tree/app-tree.ts`, the first domain's `state/` and `ops/`) **without importing it from any consumer**. The legacy stores stay; the new files are dead code from the runtime's perspective. This PR's only job is to prove that pulling `@signaltree/core` into the dependency graph keeps `build`, `test`, and `lint` green.

Why this matters: if any test transitively injects the new `AppStore` (even via a route guard that's exercised in a fixture), the failure mode is a `NG0201` cascade through every `Ops` constructor — and you won't know whether the regression came from the foundation or from a consumer rewrite. Phase 0 isolates that risk.

Verifier invocation for Phase 0 is the same as Step 6 below (with `--allow-source-presence --allow-dep-presence`); the `--src` points at the new foundation dir and asserts it is clean ESM with no legacy imports.

Once Phase 0 is merged, subsequent PRs follow the per-PR workflow.

### Per-PR workflow (one domain at a time)

Everything from the big-bang Step 0 (orientation) still applies. The differences:

1. **Step 1 grep is scoped to the one store you're migrating**, not `<app-src>`. The whole-app grep would list every still-on-ngrx sibling and drown the signal.
   ```bash
   grep -rln "<store-file-basename>" <app-src>/   # consumers of just this store
   ```
2. **Step 2 — stand up `AppStore` + `APP_TREE` once, on the first PR.** Subsequent PRs add domain slices to the existing tree. The first PR's `AppStore` exposes only the migrated domain; that's expected, not a smell.
3. **Step 3 — migrate the consumers of _this_ store only.** Other consumers stay on their respective legacy `signalStore`s. If a consumer needs both (transitional state), it injects both — acceptable for one PR, must be cleaned up by the next.
4. **Step 4 — `rm` the migrated store + its spec + any barrel that re-exports it.** Do **not** ship a legacy facade adapter unless one of the [hybrid constraints](#hybrid-adoption-fallback-path) applies. Incremental is _not_ hybrid — the migrated store goes away in the same PR; it's only the _other_ stores that remain.

   **Sequencing rule (do not violate):** Migrate every consumer of the store **first**, run `build` + `test` to confirm green, **then** delete the legacy store / spec / aggregator slot in the same PR. Removing the aggregator slot before the consumer rewrites lands turns every still-broken consumer into a `TS2339` build error and forces a full revert. If you cannot finish all consumers in one PR, leave the legacy store in place and ship the partial work as a Phase 0-style additive PR.
5. **Step 5 — do NOT remove `@ngrx/signals` from `package.json`.** Other domains still need it. The dep removal happens automatically in the final domain's PR.
6. **Step 6 — verifier invocation, narrowed and permissive:**
   ```bash
   scripts/verify-signaltree-migration.sh \
     --src   <app-src>/<new-foundation-dir>      # e.g. apps/<app>/src/app/store
     --build "<your build command>" \
     --test  "<your test command>" \
     --lint  "<your lint command>" \
     --package-json <path-to-package.json> \
     --allow-source-presence \
     --allow-dep-presence
   ```
   - `--src <new-foundation-dir>` asserts the _new_ SignalTree code is clean.
   - `--allow-source-presence` tolerates the leftover `@ngrx/signals` imports in still-on-ngrx siblings.
   - `--allow-dep-presence` tolerates the leftover entry in `package.json`.
   - When you migrate the _last_ domain, drop both `--allow-*-presence` flags and widen `--src` to the full `<app-src>` — that PR has to pass the strict big-bang verification.

### Cross-store reads from new `Ops` to a still-ngrx store

An `Ops` class can inject a still-on-ngrx `signalStore` directly — it is just an Angular service. Read its public signals or observables; do **not** call `patchState` on it from your `Ops`. When that store later migrates, only the import in your `Ops` (and the seed in tests) changes.

```ts skip
@Injectable({ providedIn: 'root' })
class PlantsOps {
  private readonly _$ = inject(APP_TREE).$.plants;
  private readonly _settings = inject(SettingsStore); // still on @ngrx/signals
  private readonly _plantService = inject(PlantService);

  loadAll$(filter?: PlantFilter): Observable<void> {
    return this._settings.region$.pipe(
      // legacy store's public observable
      filterNullish$,
      switchMap((region) => this._plantService.loadAll$({ ...filter, regionUrl: region.url })),
      tap((plants) => this._$.entities.setAll(plants)),
      map(() => void 0),
      take(1)
    );
  }
}
```

The inverse direction — a still-on-ngrx store reading from `AppStore` — also works (`AppStore` is an Angular service too) and needs no special wiring.

### Root-injected `Ops` side-effect hazard

`Ops` classes are normally `@Injectable({ providedIn: 'root' })` and `AppStore` injects them eagerly. Any constructor work an `Ops` does — subscribing to a refresher, opening a websocket, calling `inject(SomeStore)` that itself injects an HTTP/DB service — runs **the moment any test injects `AppStore`**. In a partially-migrated app this manifests as `NG0201` cascades through transitive dependencies (e.g. `AppStore -> DriverOps -> SettingsStore -> SomeDbService`) in tests that previously had nothing to do with the new store.

Two safe patterns:

- **Lazy initialization.** Move constructor side-effects (subscriptions, refresher hookups) into a `start()` method called by the consumer that needs them, or guard them behind a feature flag. Never subscribe in the constructor of a `providedIn: 'root'` `Ops`.
- **Scope `Ops` to consumers.** Drop `providedIn: 'root'` and let consumers `provide` the `Ops` in a route-level or component-level injector. `AppStore` then exposes a typed `inject<DriverOps>(DriverOps)` accessor inside a component-scoped factory, not as an eager root-singleton.

Either pattern keeps Phase 0 from regressing unrelated tests when the foundation lands.

### Co-locating the new foundation with a legacy `store/` directory

If the app already has a `store/` folder for legacy `signalStore`s (common when the team named it that), do **not** put the new SignalTree foundation in the same directory. Two options:

- Rename the legacy folder to `legacy-store/` (or `root-services/store/` if that already matches the codebase) in a separate prep commit, then put the new foundation at `src/app/store/`.
- Put the new foundation under a sibling name like `src/app/app-tree/` and keep the legacy folder where it is.

The verifier script doesn't care; pick whichever causes fewer import churn lines.

## Hybrid adoption (fallback path)

If you genuinely cannot land the migration in one PR — the diff is too large to review, multiple teams own consumers, the release cadence forces a coexistence window, or rollback risk demands it — stand up the new shape and use legacy-facade adapters as **temporary scaffolding**:

- **`@signaltree/core@9.2.0`+ no longer ships the global `declare module '@angular/core'` augmentation that previously activated callable overloads on every `WritableSignal<T>`.** Earlier versions (≤ 9.1.0) made the augmentation unconditional on any `core` import, which made `WritableSignal<T>` invariance-incompatible with `@ngrx/signals`' `WritableStateSource<T>`. Symptom on the older versions: ~30 `TS2345` errors in `@ngrx/signals` features the moment any consumer in the same `tsconfig` graph imported from `@signaltree/core`. Upgrade to `^9.2.0` before attempting hybrid adoption.
- The reverse (a SignalTree consumer that now wants the callable form on raw `WritableSignal<T>`) opts in via `import '@signaltree/callable-syntax/augmentation'` or by listing `@signaltree/callable-syntax` in `tsconfig.compilerOptions.types`. See [`install.md`](./install.md#signaltreecallable-syntax).
- **Shared `@ngrx/signals`-based base classes do not have to be migrated to SignalTree.** Two valid coexistence strategies:
  1. **Replace shared base classes with vanilla Angular signals** (`signal()` / `computed()` / `effect()`) and migrate per-app stores to SignalTree at your own pace. The base classes lose the `signalStoreFeature` composition story but keep API parity with consumers.
  2. **Keep `@ngrx/signals` in place for the legacy slice; introduce SignalTree alongside as the new canonical store.** With ≥ `9.2.0` this works without typecheck conflicts. Components migrate one at a time from `inject(LegacyStore)` to `inject(AppStore)`.
- Whichever strategy you pick, **do not introduce a partial SignalTree by per-domain `signalTree()` instances**. The single-tree rule below still applies — the AppStore facade should compose every SignalTree-managed domain into one tree even when other domains are still on the legacy store.

## Critical: one tree for all domains

**Do not create one `signalTree()` per ngrx store.** The entire application — every domain that had its own `signalStore` — must be composed into a single `signalTree()` call behind one `APP_TREE` `InjectionToken`, exposed through a single `AppStore` service.

```ts skip
// ngrx — DriverStore, SettingsStore, TicketStore, FeatureFlagStore each call signalStore()
// WRONG in SignalTree — do not do this:
// const driverTree = signalTree(driverState());      // ✗
// const settingsTree = signalTree(settingsState());  // ✗

// CORRECT — all domains in one tree:
const tree = signalTree({
  driver: driverState(),
  settings: settingsState(),
  ticket: ticketState(),
  featureFlags: featureFlagsState(),
});
export const APP_TREE = new InjectionToken<typeof tree>('APP_TREE');
```

Each ngrx `signalStore` becomes a **domain slice** in the single tree, not its own tree. Its methods become an `Ops` class. Components never inject an Ops class or `APP_TREE` — they inject only `AppStore`.

See `reference/patterns.md` for the full `APP_TREE` + `AppStore` + `Ops` wiring before writing any store code.

## Concept map

| ngrx/signals                                   | SignalTree equivalent                                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `signalStore(...)`                             | Domain slice in the single `signalTree()` + an `Ops` class for its methods                                                                                                                                   |
| `withState({ a, b })`                          | Initial state object passed to `signalTree()`                                                                                                                                                                |
| `withMethods(({ ... }) => ({ ... }))`          | Methods on an `Ops` class that injects `APP_TREE`                                                                                                                                                            |
| `withComputed(({ ... }) => ({ ... }))`         | Angular `computed()` on the component or in `.derived()` on the tree                                                                                                                                         |
| `withHooks({ onInit })`                        | Constructor body of the service / `APP_TREE` factory                                                                                                                                                         |
| `withProps(({ ... }) => ({ ... }))`            | Plain `readonly` fields on the `Ops` class (or `AppStore`); no signal magic needed                                                                                                                           |
| `rxMethod(pipe(...))`                          | Plain method returning `Observable<void>`; writes via `tap()`                                                                                                                                                |
| `patchState(store, { a, b })`                  | `tree.$.domain((s) => ({ ...s, a, b }))` or individual `.set()` calls                                                                                                                                        |
| `getState(store)`                              | `unwrap(tree.$)` (whole tree) or `unwrap(tree.$.domain)` (one slice) — `unwrap` is a free function from `@signaltree/core`                                                                                   |
| `signalState({ ... })` (standalone)            | `signalTree({ ... })` — `signalState` was the state-only primitive; `signalTree` is the equivalent baseline                                                                                                  |
| `withEntities<T>()`                            | `entityMap<T, K>()` marker                                                                                                                                                                                   |
| `store.entities()`                             | `tree.$.items.all()`                                                                                                                                                                                         |
| `store.entityMap()`                            | `tree.$.items.byId(id)` (per-id signal) — see row below for the whole collection                                                                                                                             |
| `store.entityMap()` (whole `Record<K, T>`)     | `tree.$.items.map()` returns a `Signal<ReadonlyMap<K, T>>`. Bracket access (`m[id]`) becomes `m.get(id)`; for a `Record`-shaped consumer derive via `computed(() => Object.fromEntries(tree.$.items.map()))` |
| `addEntity(e)`                                 | `tree.$.items.addOne(e)`                                                                                                                                                                                     |
| `setAllEntities(es)`                           | `tree.$.items.setAll(es)`                                                                                                                                                                                    |
| `updateEntity({ id, changes })`                | `tree.$.items.updateOne(id, changes)`                                                                                                                                                                        |
| `removeEntity(id)`                             | `tree.$.items.removeOne(id)`                                                                                                                                                                                 |
| `provideDevtoolsConfig({ name })` in providers | `.with(devTools({ treeName: name }))` on the tree — remove the provider                                                                                                                                      |

## Custom feature patterns (signalStoreFeature)

Custom features that add state shape (e.g. `withLoadingState`, `withSavingState`, `withErrorState`) map to **built-in markers**, not factory functions. Don't recreate the feature as a helper — put the marker directly in the state object.

```ts skip
// ngrx — withLoadingState adds isLoading, error, etc.
withLoadingState();

// SignalTree — status() marker placed at the relevant path
load: status<string>();
```

The `status()` marker provides:

- `.setLoading()` / `.setLoaded()` / `.setError(e)` / `.setNotLoaded()`
- Boolean signals: `.isLoading()` / `.isLoaded()` / `.isError()` / `.isNotLoaded()` — use these in templates and `computed()`
- Raw state via `.state()` — returns `Signal<LoadingState>`. **When comparing the raw value always import and use the `LoadingState` enum from `@signaltree/core`**; never compare to string literals (`'loading'`, `'loaded'`, etc.), which cause TypeScript errors.

```ts
import { LoadingState } from '@signaltree/core';

// ✓
tree.$.driver.load.state() === LoadingState.Loading;

// ✗ TypeScript error — string literals don't satisfy the enum type
tree.$.driver.load.state() === 'loading';
```

Prefer the boolean helpers over raw state comparisons wherever possible.

## rxMethod

`rxMethod` wraps an operator pipeline so that it can be called with static values or observables. Replace it with a plain method that returns `Observable<void>` and subscribes at the call site, or fire-and-forget with `.subscribe()` internally:

```ts
import { inject, Injectable, InjectionToken } from '@angular/core';
import { signalTree, status } from '@signaltree/core';
import { catchError, EMPTY, map, tap } from 'rxjs';
import type { Observable } from 'rxjs';

interface DriverState {
  currentDriver: { name: string } | null;
  load: ReturnType<typeof status>;
}
const tree = signalTree({ driver: { currentDriver: null as { name: string } | null, load: status<string>() } });
type AppTree = typeof tree;
const APP_TREE = new InjectionToken<AppTree>('APP_TREE');

// ngrx style (before) — rxMethod wrapping a pipeline, patchState for writes
// readonly loadDriver = rxMethod<void>(
//   pipe(switchMap(() => this.driverService.load$()
//     .pipe(tap(d => patchState(this, { driver: d })))))
// );

@Injectable({ providedIn: 'root' })
class DriverOps {
  private readonly _tree = inject(APP_TREE);
  private readonly _$ = this._tree.$.driver;
  private readonly _driverService: { load$(): Observable<{ name: string }> } = inject(Object as any);

  // SignalTree style (after) — plain Observable method, tap() writes to tree
  loadDriver$(): Observable<void> {
    this._$.load.setLoading();
    return this._driverService.load$().pipe(
      tap((d) => {
        this._$.currentDriver.set(d);
        this._$.load.setLoaded();
      }),
      map(() => void 0),
      catchError((err: unknown) => {
        this._$.load.setError(String(err));
        return EMPTY;
      })
    );
  }
}
```

## Gotchas

- **Flat signal reads vs nested paths** — `signalStore` exposes every signal flatly on the store instance: `store.customers()`, `store.isLoading()`, `store.selectedCustomerExternalId()`. In SignalTree those signals live under the `$` proxy at their domain path: `appStore.$.ticket.customers()`, `appStore.$.ticket.isLoading`, `appStore.$.ticket.selectedCustomerExternalId()`. When converting a component that read many signals off the old store, **every read site must be updated** — it is easy to miss them because the old and new injection names look similar. After renaming the injection, grep the component for the old store variable name and make sure no bare `store.signalName()` calls remain.

  ```ts
  // ngrx/signals — signals flat on the store instance
  // readonly customers = inject(TicketStore).customers;  // a Signal<Customer[]>
  // template: {{ customers() }}

  // SignalTree — signals at their domain path through AppStore
  private readonly _store = inject(AppStore);
  readonly customers = this._store.$.ticket.customers;    // same Signal<Customer[]>
  // template: {{ customers() }}  ← template unchanged; only the source path changed
  ```

- **`withEntities` uses an EntityMap** — SignalTree's `entityMap` is normalized (id → entity). If the ngrx store used array-based entities without ids, add a key selector.
- **`patchState` was batched** — SignalTree branch writes (`tree.$.domain(updater)`) auto-batch. Individual `.set()` calls on separate leaves do NOT batch unless you add `batching()`. If you're setting multiple sibling leaves, use a branch updater or add `batching()`.
- **`withHooks({ onDestroy })` cleanup** — use Angular `DestroyRef` injected in the constructor and register cleanup with `destroyRef.onDestroy(() => ...)`.
- **Feature store as service** — the ngrx `signalStore` is a service under the hood. The Ops class is its replacement. Keep `providedIn: 'root'` for app-wide operations; use component providers only for component-local state.
- **No `inject()` outside injection context** — `APP_TREE` must be injected in a constructor or field initializer, not in a plain function called at module load time.
- **Spec file placement after migration** — ngrx feature stores bundle state + methods in one class, so tests for both often live in the component spec or a single store spec. After migration, tests that exercise ops methods (loading data, triggering writes, cascading logic) belong in a spec file co-located with the Ops class (e.g. `ticket.ops.spec.ts`), not in the component spec. Component specs should only test rendering and UI interaction. Move any test that calls `store.loadTickets()`, `store.createTicket()`, or similar methods to the ops spec; leave template/binding tests in the component spec.

## Test bed must provide `APP_TREE`

After replacing an `@ngrx/signals` store with `AppStore` + `Ops`, every existing `TestBed` that mocked the old store will start failing with:

```text
NG0201: No provider found for `InjectionToken APP_TREE`.
```

…even when `AppStore` is mocked with `useValue`, because Angular still instantiates the legacy facade adapter (or any other `providedIn: 'root'` consumer) which itself injects `AppStore`, which injects `APP_TREE`.

The fix is mechanical:

1. Export `createBaseState()` from `app-tree.ts`.
2. Add `app-tree.testing.ts` exporting `provideAppTreeForTesting()`.
3. **For a small migration (≤ 5 affected spec files):** add `provideAppTreeForTesting()` to each failing TestBed's `providers`.
4. **For an existing large app (many parameterised testing helpers):** register `provideAppTreeForTesting()` once globally via `getTestBed().initTestEnvironment(...)` in `test-setup.ts`. This is documented in [`testing.md`](./testing.md#wiring-app_tree-once-for-a-large-existing-test-suite). Each spec still gets an isolated tree because `useFactory` runs per child injector.
5. Do **not** mock `AppStore` or the legacy adapter to "make the error go away" — the underlying `APP_TREE` still needs to exist for any transitive consumer.

Full recipe and matrix (which layer to mock per test type) in [`testing.md`](./testing.md).

### Specs that called `patchState(store, …)` on the real store

Specs that previously called `patchState(legacyStore, { … })` to seed state on the **real** legacy store (rather than mocking it) will throw `Reflect.ownKeys called on non-object` after the migration — the legacy facade no longer derives from `signalStore`, so `patchState` has nothing to patch.

Replace with one of:

- **Direct tree write** — preferred when the spec needs to set state arbitrarily mid-test:
  ```ts
  TestBed.inject(APP_TREE).$.<domain>(s => ({ ...s, ...overrides }));
  ```
- **`overrides` callback on `provideAppTreeForTesting()`** — preferred when the spec needs the seeded state from the start:
  ```ts
  providers: [provideAppTreeForTesting((s) => ({ ...s, driver: { ...s.driver, currentDriver: { id: 1 } } }))];
  ```

**`patchState(legacyStore, setAllEntities([...]))` and the entity-op family** rewrite to direct `entityMap` API calls on the seeded tree:

```ts skip
// before
patchState(legacyStore, setAllEntities(plants));
patchState(legacyStore, addEntity(p));
patchState(legacyStore, updateEntity({ id, changes }));
patchState(legacyStore, removeEntity(id));

// after
TestBed.inject(APP_TREE).$.<domain>.entities.setAll(plants);
TestBed.inject(APP_TREE).$.<domain>.entities.addOne(p);
TestBed.inject(APP_TREE).$.<domain>.entities.updateOne(id, changes);
TestBed.inject(APP_TREE).$.<domain>.entities.removeOne(id);
```

Do not call any `Ops` method to seed state in tests — `Ops` are for runtime behaviour, not test fixtures.

## Keep the legacy facade — adapt its internals (fallback only)

> Use this only when [big-bang isn't feasible](./optimal-implementation.md#when-the-hybrid-pattern-is-acceptable). Big-bang gives a cleaner end-state and avoids the dual-store maintenance tax.

When the existing `@ngrx/signals` store (e.g. `DriverStore`) is referenced by dozens of components and specs and you cannot land the full migration in one PR, do not rename it. Replace its internals with a small adapter over `AppStore` so the public shape is preserved while the implementation moves to SignalTree. See [`patterns.md`](./patterns.md#hybrid-migration-legacy-facade-adapters) for the adapter pattern. The legacy spec mocks (`Mock<DriverStore>`) keep working — they now mock the adapter's interface instead of the original `signalStore` instance.

**Every adapter must ship with a deletion deadline.** Add `// TODO(legacy-facade): remove by <date/release>` and open a tracking issue. A facade without a deletion plan becomes a permanent second store — the worst possible end-state.

## Definition of done

A migration is **not done** when the build is green. See [`optimal-implementation.md`](./optimal-implementation.md#definition-of-done) for the full checklist. The hard gates:

- `grep -rln '@ngrx/signals' src/app/` returns nothing in the migrated app.
- `@ngrx/signals` (and any related toolkit packages) removed from `package.json` (or tracked for removal if a shared lib elsewhere still uses them).
- All adapter facades either deleted or carrying a deletion-deadline comment + tracking issue.
- Test suite green; lint clean; DevTools shows the tree under its `treeName`.
