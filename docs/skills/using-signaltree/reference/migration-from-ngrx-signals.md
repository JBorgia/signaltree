---
name: signaltree-migration-from-ngrx-signals
description: One-to-one mapping guide specifically for porting @ngrx/signals stores to SignalTree. Only load this skill when the user is converting code that uses the @ngrx/signals package (signalStore, withState, withMethods, withComputed, withHooks, rxMethod, patchState, withEntities, signalStoreFeature). Do NOT load for classic @ngrx/store (reducers/actions/effects) or @ngrx/component-store migrations — those are different patterns.
---

# Migrating from @ngrx/signals to SignalTree

Quick reference for converting an existing `@ngrx/signals` codebase. Applies **only to `@ngrx/signals`** — the signal-based store package (`signalStore`, `withState`, `rxMethod`). Not applicable to classic `@ngrx/store` (reducers, actions, effects) or `@ngrx/component-store`.

Read the root `SKILL.md`, [`reference/optimal-implementation.md`](./optimal-implementation.md), and [`reference/patterns.md`](./patterns.md) for full SignalTree context; use this file for the mechanical mappings.

> **Driving multiple subagents through this migration?** A single implementer often runs out of context after building the foundation but before sweeping consumers. If the migration touches ≥ 2 legacy stores or ≥ 10 consumer files, read [`orchestrating-a-migration.md`](./orchestrating-a-migration.md) for the phased survey → audit → foundation → consumers → gate playbook before dispatching any subagent.

## Minimum viable migration (1 small store)

**Skip every pattern below this section** if the legacy app has exactly one `signalStore` with < 5 signals and < 3 methods. The full `AppStore` + `Ops` + tier ceremony is calibrated for multi-domain apps; on a one-store app it is pure overhead.

Minimum recipe:

1. Replace the `signalStore({...}, withState(s), withMethods(m))` factory with `signalTree(s)` exported via an `APP_TREE` `InjectionToken` + `provideAppTree()`.
2. Move each `withMethods` function onto a single `@Injectable({ providedIn: 'root' })` `AppOps` class that injects `APP_TREE`.
3. Replace every `inject(LegacyStore)` with `inject(APP_TREE)` (for reads) or `inject(AppOps)` (for writes). No `AppStore` facade needed.
4. Run the verifier (Step 6 below).

Go straight to [Definition of done](#definition-of-done). Patterns 1–5 below are about scaling architecture across domains — not relevant when there is only one.

## App shape audit (run before picking patterns)

The goal-state patterns below are **conditional**, not universal. Before applying any of them, answer these four questions about the legacy app and capture the answers in your scratch notes — each pattern explicitly references them:

1. **Are domains entity-collections or singletons?** A _collection_ domain has a list/map of records keyed by id (drivers, tickets, products). A _singleton_ domain has one record or a handful of scalars (app config, current user, theme, feature flags). Pattern #1 only applies to collection domains.
2. **Is there a typed error model in the codebase?** Search for an existing `Error`-shaped class, interface, or discriminated union (`grep -rln 'class .*Error\b\|interface .*Error\b' <app-src>/`). If yes, Pattern #1's `xError` sibling rule applies. If no, `status<string>()` alone is correct — do **not** invent an error type just to satisfy the pattern.
3. **Is there a cross-domain lifecycle?** Login/logout, multi-step wizard, tenant switch, anything that mutates ≥ 2 domain slices in one user action. If yes, Pattern #3 applies. If no, skip Pattern #3 entirely — a one-domain `Ops` calling itself is not orchestration.
4. **Is anything persisted to `localStorage` / `sessionStorage` / cookies?** If yes, Pattern #4 applies. If no, skip it.

The matrix:

| App shape                                    | Patterns to apply          |
| -------------------------------------------- | -------------------------- |
| Entity-CRUD multi-domain w/ session + errors | 1, 2, 3, 4, 5 (all)        |
| Entity-CRUD multi-domain, no session         | 1, 2, 4, 5                 |
| Singleton/config-only app                    | 2 (if derivations), 4, 5   |
| Pure-state stores (no `withMethods`)         | 1 (state shape only), 4    |
| Mixed (some entity, some singleton)          | 1 for entity domains; 4, 5 |

Applying every pattern mechanically to a non-CRUD app produces an awkward shape (empty `selected` slice, derived tier files with one identity computation, `SessionOps` with one method that calls one other Ops). Match the patterns to the app's actual shape.

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

The first PR should add the foundation **without importing it from any consumer**. The legacy stores stay; the new files are dead code from the runtime's perspective. This PR's only job is to prove that pulling `@signaltree/core` into the dependency graph keeps `build`, `test`, and `lint` green.

**Required foundation file set** (every one of these — missing any of them is a skill violation, not a stylistic choice):

```
src/app/store/
├── app-store.ts                              # @Injectable AppStore facade — the ONLY thing consumers inject
├── index.ts                                  # barrel: export AppStore + types only (never APP_TREE/Ops)
├── ops/
│   ├── index.ts                              # barrel
│   ├── <first-domain>.ops.ts                 # @Injectable XOps service
│   └── <first-domain>.ops.spec.ts            # XOps spec — required for Phase 0 to count as foundation
└── tree/
    ├── app-tree.ts                           # APP_TREE InjectionToken + createAppTree() + provideAppTree()
    ├── app-tree.spec.ts                      # asserts shape of $.<domain>, presence of derived tiers
    ├── state/
    │   ├── index.ts                          # barrel
    │   ├── selection.state.ts                # ROOT selection slice (see Goal pattern #1) — even if first domain only writes one <x>Id
    │   └── <first-domain>.state.ts           # domain factory: entityMap + xLoad + xError, NO selection inside
    └── derived/
        ├── index.ts                          # barrel
        └── tier-entity-resolution.derived.ts # Tier 1: id → entity (always exists, even with one domain)
```

The foundation MUST also include a test helper for downstream PRs:

```
src/app/testing/
└── provide-app-tree-for-testing.ts          # provideAppTreeForTesting(seed?) — used by every spec from PR 2 onward
```

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
4. **Step 4 — `rm` the migrated store + its spec + any barrel that re-exports it.** Do **not** ship a legacy facade adapter unless one of the [hybrid constraints](#hybrid-adoption-fallback-path) applies, **or** the migrated domain has ≥ ~10 call sites of the form `_store.<domain>.X` through a shared aggregator object (a permitted, time-boxed exception — see below). Incremental is _not_ hybrid — the migrated store goes away in the same PR; it's only the _other_ stores that remain.

   **Time-boxed aggregator-facade exception.** If consumers reach the legacy store through a shared aggregator (e.g. `_store.drivers.currentDriver()` everywhere instead of `inject(DriverStore)`), rewriting all call sites in the same PR can balloon the diff past reviewable size. In that case it is acceptable to keep the aggregator slot (`store.drivers`) backed by a thin adapter object that delegates to `AppStore` — provided you (a) delete `driver.store.ts` and `driver.store.spec.ts` in the same PR, (b) tag the adapter with `// TODO(legacy-facade): remove by <date/release>`, and (c) open a tracking issue for the call-site sweep. The legacy `signalStore` factory must not survive this PR; only the typed object literal that exposes the same field shape may remain.

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
class FooOps {
  private readonly _$ = inject(APP_TREE).$.foo;
  private readonly _legacy = inject(LegacySettingsStore); // still on @ngrx/signals
  private readonly _fooService = inject(FooService);

  loadAll$(filter?: FooFilter): Observable<void> {
    return this._legacy.scope$.pipe(
      // legacy store's public observable
      filterNullish$,
      switchMap((scope) => this._fooService.loadAll$({ ...filter, scopeUrl: scope.url })),
      tap((items) => this._$.entities.setAll(items)),
      map(() => void 0),
      take(1)
    );
  }
}
```

The inverse direction — a still-on-ngrx store reading from `AppStore` — also works (`AppStore` is an Angular service too) and needs no special wiring.

### Root-injected `Ops` side-effect hazard

`Ops` classes are normally `@Injectable({ providedIn: 'root' })` and `AppStore` injects them eagerly. Any constructor work an `Ops` does — subscribing to a refresher, opening a websocket, calling `inject(SomeStore)` that itself injects an HTTP/DB service — runs **the moment any test injects `AppStore`**. In a partially-migrated app this manifests as `NG0201` cascades through transitive dependencies (e.g. `AppStore -> FooOps -> LegacySettingsStore -> SomeDbService`) in tests that previously had nothing to do with the new store.

Three safe patterns (pick one):

- **Lazy initialization.** Move constructor side-effects (subscriptions, refresher hookups) into a `start()` method called by the consumer that needs them, or guard them behind a feature flag. Never subscribe in the constructor of a `providedIn: 'root'` `Ops`.
- **Scope `Ops` to consumers.** Drop `providedIn: 'root'` and let consumers `provide` the `Ops` in a route-level or component-level injector. `AppStore` then exposes a typed `inject<FooOps>(FooOps)` accessor inside a component-scoped factory, not as an eager root-singleton.
- **Optional collaborators + lazy `Injector.get` in `AppStore`.** Keep `Ops` `providedIn: 'root'` but make every side-effect collaborator `inject(X, { optional: true })` and resolve `Ops` from `AppStore` via `inject(Injector).get(FooOps)` inside the facade method, not as a field. This is the lowest-churn option for a partially-migrated app where unrelated specs only read `tree.$` signals — they never instantiate the `Ops`, so missing collaborators never throw. Required pattern when the migrated `Ops` has ≥ 2 side-effect collaborators (refresher, telemetry, banners, websocket, etc.).

```ts skip
// foo.ops.ts — collaborators optional
@Injectable({ providedIn: 'root' })
export class FooOps {
  private readonly _refresher = inject(RefresherService, { optional: true });
  private readonly _telemetry = inject(TelemetryService, { optional: true });
  // …
}

// app-store.ts — lazy resolve
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly $ = inject(APP_TREE).$;
  private readonly _injector = inject(Injector);
  readonly ops = {
    foo: {
      loadFoo$: () => this._injector.get(FooOps).loadFoo$(),
    },
  } as const;
}
```

All three patterns keep Phase 0 from regressing unrelated tests when the foundation lands.

**If you choose to fix the cascade in test files instead** (acceptable for a single-PR consumer migration), add the missing transitive provider to each affected legacy spec. **Verify each helper actually exists before importing it** — `grep -rn "export function <providerName>" <app-src>/testing/` (and any shared test-utils package). Hallucinated helper names are the most common follow-up failure mode of this fix.

**While you're in those spec files, sweep dead `providers: [LegacyStoreName]` entries.** Many specs list the legacy store in their `providers` array but never inject it from the SUT — leftover noise from earlier refactors. Migration is the right time to delete them; they will fail loudly if anything actually depended on them, and silently shrink the diff if not. Quick audit:

```bash
grep -rln "providers:.*<LegacyStoreName>" <app-src>/ | xargs -I {} grep -L "inject(<LegacyStoreName>)\|TestBed.inject(<LegacyStoreName>)" {}
```

Files in the output list the provider but never inject it — safe to strip.

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
// ngrx — FooStore, BarStore, BazStore, QuxStore each call signalStore()
// WRONG in SignalTree — do not do this:
// const fooTree = signalTree(fooState());      // ✗
// const barTree = signalTree(barState());      // ✗

// CORRECT — all domains in one tree:
const tree = signalTree({
  foo: fooState(),
  bar: barState(),
  baz: bazState(),
  qux: quxState(),
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

## Goal-state architectural patterns

The concept map above keeps the build green. These five patterns are what separates a passing migration from one that lands at the **right end-state for a multi-domain entity-CRUD app**. They are **conditional** — each applies only when the [App shape audit](#app-shape-audit-run-before-picking-patterns) says it does. Applying them mechanically to a non-CRUD app produces a worse shape than vanilla SignalTree, not a better one.

A migration that ignores patterns _that do apply_ produces a SignalTree shaped like the old `signalStore` graph (one slice per old store, single-`currentX` signals, eager loads, no derived tiers) — green but architecturally thin. Apply on first migration; retrofitting later is significantly more churn.

### 1. `currentX: XDto` ngrx signal → `entityMap` + root `selected.<id>` + derived current

**Applies when:** the domain is a _collection_ per audit Q1 — multiple records of the same shape with a stable key field. Skip entirely for singleton domains; port them as plain leaves (or `stored()` slots, see Pattern #4).

When the ngrx store has a `currentFoo: FooDto` (or `selectedBar`, `activeQux`) signal **and `Foo` has a stable key field**, do not port it as a single signal in the new state. The "current" is one of many — model it that way, and put **selection at the _root_ of the tree**, not inside the domain slice. Selection is inherently cross-domain (FooOps writes `selected.fooId`, BarOps writes `selected.barId`, derived tiers read both); putting it under `foo.selected` blocks that pattern and forces awkward `$.foo.selected.fooId()` reads.

```ts
// state/driver.state.ts — domain entities + load state ONLY. No selection.
import { entityMap, status } from '@signaltree/core';
// import your app's DTOs and typed-error / Nullable aliases from wherever they live
// e.g. import type { DriverDto } from '<your-models>';
//      import type { AppError, Nullable } from '<your-models>';

export function driverState() {
  return {
    drivers: entityMap<DriverDto, number>(),
    driversLoad: status<string>(),
    driversError: null as Nullable<AppError>, // typed sibling — see rule below
  };
}

// state/selection.state.ts — root-level selection slice, ONE per app
export function selectionState() {
  return {
    driverId: null as Nullable<number>,
    truckId: null as Nullable<number>,
    haulerId: null as Nullable<number>,
    // ...add more <x>Id scalars as new domains migrate; never split this slice
  };
}

// app-tree.ts — selection is a TOP-LEVEL slice, sibling to domains
export function createBaseState() {
  return {
    driver: driverState(),
    selected: selectionState(), // <-- root, not driver.selected
  };
}

// derived/tier-entity-resolution.derived.ts — current entity is *derived*
import { computed } from '@angular/core';
import { externalDerived } from '@signaltree/core';
import type { AppTreeBase } from '../app-tree';

export const entityResolutionDerived = externalDerived<AppTreeBase>()(($) => ({
  driver: {
    current: computed(() => {
      const id = $.selected.driverId(); // <-- root selection
      return id != null ? $.driver.drivers.byId(id)?.() ?? null : null;
    }),
  },
}));
```

This unlocks `upsertOne`, `removeOne`, `byId`, `setAll` for the entity collection — operations the single-signal port permanently loses access to.

**Hard rules (when this pattern applies):**

- If the ngrx signal type is `XDto` or `Nullable<XDto>` and `X` has a stable key field, port it as `entityMap<X, K>()` (in the domain slice) plus a `<key>: Nullable<K>` scalar (in the root `selected` slice). The selected-key field name should match the natural key (`fooId`, `barUuid`, `quxSlug`) — not force-fit `<x>Id` if the natural key is a string/uuid/composite.
- For **composite keys** (e.g. `{ tenant, id }`), use `entityMap<X, string>()` with a stringified composite as K, and store the same composite-string in `selected`. SignalTree's `entityMap` only supports primitive K.
- `selected` is **always a top-level slice of the tree** when used, never nested inside a domain. The derived tier reads `$.selected.<key>()` and `$.<domain>.<entityMap>.byId(...)` — both at root.
- **Skip the root `selected` slice entirely** if no domain in the app has a "current/selected" concept. An empty `selected: {}` slice is noise.
- Load + error: see **Typed error sibling rule** below — also conditional.

**Typed error sibling rule (conditional on audit Q2):**

- **If the app has a typed error model** (existing class/interface/discriminated union): the domain slice has **two siblings** — `xLoad: status<string>()` for the state machine _and_ `xError: Nullable<AppError>` for the typed payload (so consumers don't lose typed error info to the `string`-only payload of `status<T>().setError(msg)`). Ops set both: `$.x.xLoad.setError(String(err)); $.x.xError.set(toAppError(err));`. `status<AppError>()` is **not** a substitute — its API is state-machine, not error-storage.
- **If the app has no typed error model**: `xLoad: status<string>()` alone is correct. Do **not** invent an error type just to satisfy the pattern — the cost (new type, mapping function, every `Ops` learns to use it) outweighs the benefit until the app actually needs structured errors.

### 2. Materialize derivations inside the tree with `externalDerived` + `.derived()`

**Applies when:** the legacy app has ≥ 1 `withComputed` derivation that is read from ≥ 2 consumers. Skip when every derivation is consumer-local (one component reads it once) — a component-level `computed()` is correct in that case.

The naive port of `withComputed(({ ... }) => ({ isExternal: computed(...) }))` is a component-level `computed()`. That works but forfeits SignalTree's strongest feature when reuse exists: **typed derived tiers composed into the tree itself**, reusable from any consumer without reimplementation.

```ts
// app-tree.ts
import { signalTree, type WithDerived } from '@signaltree/core';
import { entityResolutionDerived } from './derived/tier-entity-resolution.derived';
import { complexLogicDerived } from './derived/tier-complex-logic.derived';

export type AppTreeBase = ReturnType<typeof signalTree<ReturnType<typeof createBaseState>>>;
export type AppTreeWithEntityResolution = WithDerived<AppTreeBase, typeof entityResolutionDerived>;
export type AppTreeWithComplexLogic = WithDerived<AppTreeWithEntityResolution, typeof complexLogicDerived>;
export type AppTree = AppTreeWithComplexLogic;

export function createAppTree(initial: {
  /* ... */
}) {
  return signalTree(createBaseState(initial))
    .with(devTools({ treeName: 'AppTree' }))
    .with(batching())
    .derived(entityResolutionDerived) // tier 1: id → entity
    .derived(complexLogicDerived); // tier 2+: depends on tier 1
}
```

**When to add a derived tier:** any `computed()` that ≥ 2 components, services, or specs would otherwise reimplement. Common tiers: entity resolution (id → entity), workflow state (current record's status, active step), UI aggregates (counts, badge text), navigation guards.

**When NOT to add a derived tier:**

- One-shot derivations consumed by a single component — use a component-local `computed()`.
- Pure value transforms with no state read (e.g. `formatDate`) — use a plain function.
- Derivations that depend on injected services as well as tree state — put them on the consuming service or use `derivedFrom` at the call site, not in a tier (tiers only see `$`).

**Tiering rule:** later tiers may read earlier-tier derivations via `$.<earlierTier>.…`; never the reverse. Each tier gets its own `tier-<name>.derived.ts` file and a typed `AppTreeWith<Name>` alias so derived tiers themselves are type-safe.

### 3. Cross-domain orchestration → dedicated `<purpose>Ops`, not domain-Ops

**Applies when:** audit Q3 returned yes — the app has a real cross-domain lifecycle (login/logout, wizard, tenant switch). Skip entirely otherwise. A one-domain `Ops` calling its own slice's writes is not orchestration; do not invent a `SessionOps` that wraps one method on one collaborator.

When a migration needs to coordinate two or more domains (e.g. end-of-session clears qux + bar + selection; start-of-session hydrates config + foo + baz), **do not put the orchestration inside one of the domain `Ops`**. Stand up a dedicated `<purpose>Ops` class — the name reflects the lifecycle, not necessarily "Session":

```ts
// session.ops.ts
import { inject, Injectable } from '@angular/core';
import { SelectionOps } from './selection.ops';
import { TicketOps } from './ticket.ops';
import { TruckOps } from './truck.ops';

@Injectable({ providedIn: 'root' })
export class SessionOps {
  private readonly _tickets = inject(TicketOps);
  private readonly _trucks = inject(TruckOps);
  private readonly _selection = inject(SelectionOps);

  /** Reset all session-scoped state. Order matters: clear active ticket first
   *  so any UI bound to it sees null before driver/selection are cleared. */
  endSession(): void {
    this._tickets.clearActiveTicket();
    this._trucks.clearAllTrucksAndHaulers();
    this._selection.clearAll();
  }
}
```

Equivalent pattern for one-shot atomic mutations of `selected.*` (when Pattern #1 applies): a dedicated `SelectionOps` owns every write to `$.selected.*` so the rest of the codebase has a single, lintable boundary. The domain `Ops` (FooOps, BarOps) own their own slice's writes — never another slice's.

**Smell to refactor:** any `Ops` class that injects ≥ 2 other `Ops` classes is doing orchestration; extract to its own `<purpose>Ops`.

### 4. Persisted state → `stored()` slices, not constructor `localStorage` reads

**Applies when:** audit Q4 returned yes — the legacy app reads/writes `localStorage`/`sessionStorage`/cookies for any piece of state. Skip otherwise.

Baseline ngrx stores typically read `localStorage` in `withHooks({ onInit })` and write back via a service. SignalTree's `stored()` marker handles both directions reactively:

```ts
// settings.state.ts
import { stored } from '@signaltree/core';
// import your Nullable<T> alias (or inline `T | null`)

const K = '<your-app-prefix>-settings-'; // namespace storage keys per app

export function settingsState() {
  return {
    regionId: stored(`${K}regionId`, null as Nullable<number>),
    tenantId: stored(`${K}tenantId`, null as Nullable<number>),
    measurementSystem: stored(`${K}measurementSystem`, null as Nullable<string>),
    permissionsRequested: stored(`${K}permissionsRequested`, false),
  };
}
```

**Migration recipe:** every `localStorage.getItem('key')` / `setItem('key', …)` call site that wraps a piece of state becomes a `stored('key', defaultValue)` slot. Delete the `LocalStorageService.set(key, …)` calls in `Ops` — `stored()` writes through automatically on signal mutation.

**When `stored()` doesn't fit:** initial values that depend on other injection (e.g. environment-keyed storage keys like `<x>Id-${env.targetEnvironment}`). For those, use the `AppTreeService` pattern: a `providedIn: 'root'` service that reads your storage service in its constructor and passes the seed values to `createAppTree(seed)` once.

### 5. `Ops` injection in `AppStore` → eager by default, lazy only for incremental

**Applies when:** the legacy store has ≥ 1 `withMethods` function. Skip entirely for pure-state stores (just `withState` + optional `withComputed`) — there are no `Ops` to inject; the domain slice in `app-tree.ts` is the whole migration. Components inject `AppStore` and read `store.$.<domain>.*` directly.

**Sync vs async methods:** `Ops` methods don't all need to return `Observable<void>`. Sync setters return `void`; async I/O methods return `Observable<void>`. Pick by what the legacy method did:

```ts skip
@Injectable({ providedIn: 'root' })
export class FooOps {
  private readonly _$ = inject(APP_TREE).$.foo;

  // sync setter — returns void, no observable wrapping
  setTheme(theme: 'light' | 'dark'): void {
    this._$.theme.set(theme);
  }

  // async loader — returns Observable<void>, consumer subscribes
  loadAll$(): Observable<void> {
    this._$.itemsLoad.setLoading();
    return this._fooService.loadAll$().pipe(
      tap((items) => {
        this._$.items.setAll(items);
        this._$.itemsLoad.setLoaded();
      }),
      map(() => void 0),
      catchError((err: unknown) => {
        this._$.itemsLoad.setError(String(err));
        return EMPTY;
      })
    );
  }
}
```

For a **completed migration** (no remaining `@ngrx/signals` consumers), `AppStore` injects every `Ops` class eagerly as a field:

```ts
// app-store.ts \u2014 goal-state pattern
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree = inject(APP_TREE);
  readonly $ = this.tree.$;
  readonly ops = {
    tickets: inject(TicketOps),
    trucks: inject(TruckOps),
    drivers: inject(DriversOps),
    selection: inject(SelectionOps),
    session: inject(SessionOps),
  };
}
```

This exposes the **whole Ops surface** (`store.ops.tickets.loadTickets$()`, `store.ops.tickets.clearActive()`, etc.) without method-by-method delegation. Discoverable via IDE autocomplete. Adding a new method on `TicketOps` requires zero changes in `AppStore`.

The lazy `Injector.get(XOps)` pattern — and the "method-delegation object literal" shape — is **only** for [incremental migrations](#root-injected-ops-side-effect-hazard) where unrelated specs would otherwise trigger a constructor cascade through Ops they don't use. Once the migration completes, refactor to eager `inject()`.

**Smell that you forgot to refactor:** lazy `Injector.get` calls in `AppStore` after the last domain migrates. If `grep -l '@ngrx/signals' <app-src>/` returns nothing, eager injection is the correct shape.

## Custom feature patterns (signalStoreFeature)

> **Do not silently drop a `withFeature(...)` call during migration.** Custom features encode real behavior (error banners, refresh hooks, telemetry collectors). Map each one to its SignalTree equivalent or an `effect()` inside the `Ops` constructor — never reduce one to a no-op placeholder. If you legitimately want to drop the behavior, do it in a separate commit with a code-owner sign-off — not silently inside the migration PR.

The ngrx feature surface — `withFeature`, `withHooks`, `withProps` — collapses into three SignalTree shapes:

| ngrx primitive | SignalTree equivalent | Where it lives |
|---|---|---|
| `withFeature(myFeature)` | `effect(() => { … })` reading `this._$.<leaf>()` | `Ops` class constructor |
| `withHooks({ onInit, onDestroy })` | `onInit` → `start(injector)` method called from `AppStore` constructor; `onDestroy` → an explicit `Subject<void>` field cancelled in `stop()` | `Ops` class |
| `withProps({ x$ })` | `readonly x$ = toObservable(this._$.x)` | `Ops` class |

### Worked example: `withErrorBanners` + `withRefreshHandling` + `withTelemetryBaggage`

Before (ngrx — three custom features stacked on `signalStore`):

```ts skip
export const DriverStore = signalStore(
  { providedIn: 'root' },
  withReduxDevtools(driverStoreName),
  withTelemetryBaggage(driverStoreName),
  withState(initialState),
  withErrorBanners(driverStoreName),       // shows a banner on error
  withRefreshHandling(driverStoreName),    // hooks app-wide refresher
  withMethods((store, driverService = inject(DriverService)) => ({
    loadActiveDriver$: rxMethod<void>(/* … */),
    clearCurrentDriver: () => patchState(store, { currentDriver: null }),
  })),
);
```

After (SignalTree — features become opt-in side-effects on the `Ops` class). All collaborators are `inject(_, { optional: true })` so unrelated specs can construct `DriverOps` without dragging the whole banner / refresher / telemetry chain into the test bed:

```ts skip
@Injectable({ providedIn: 'root' })
export class DriverOps {
  private readonly _tree = inject(APP_TREE);
  private readonly _$ = this._tree.$.driver;
  private readonly _driverService = inject(DriverService);

  // Optional collaborators — see "Root-injected Ops side-effect hazard" above.
  private readonly _banners = inject(BannerStore, { optional: true });
  private readonly _refresher = inject(AppRefresherService, { optional: true });
  private readonly _baggage = inject(TelemetryBaggageService, { optional: true });

  constructor() {
    // ↳ withErrorBanners equivalent: react to error leaf changes.
    effect(() => {
      const err = this._$.driverError();
      if (err) this._banners?.show(BannerType.Error, err.message);
    });

    // ↳ withTelemetryBaggage equivalent: stamp baggage when the driver changes.
    effect(() => {
      const driver = this._$.currentDriver();
      if (driver) this._baggage?.set('driver.id', driver.id);
    });
  }

  /** ↳ withHooks({ onInit }) equivalent — called once from AppStore. */
  start(injector: Injector): void {
    this._refresher?.register(injector, () => this.loadActiveDriver$().subscribe());
  }

  loadActiveDriver$(): Observable<void> { /* … */ }
  clearCurrentDriver(): void { this._$.currentDriver.set(null); }
}
```

And in `AppStore`:

```ts skip
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree = inject(APP_TREE);
  readonly $ = this.tree.$;
  readonly ops = { driver: inject(DriverOps), /* … */ } as const;

  constructor() {
    // Wire each Ops's withHooks({ onInit }) port exactly once.
    const injector = inject(Injector);
    this.ops.driver.start(injector);
  }
}
```

Three tradeoffs to call out for the user before signing off the migration:

1. **`effect()` runs eagerly inside the injection context.** Wrap any side-effect that should not fire on initial state in a guard (`if (driver)` above) — `effect()` doesn't have ngrx's `withMethods` lazy semantics.
2. **`{ optional: true }` collaborators silently no-op when missing.** That's intentional for tests, but it also means a *production* misconfiguration (forgot to `provideRefresher()`) will silently disable the feature instead of throwing. If the feature is mandatory in production, document that in the Ops class header and add a smoke test in `app.config.spec.ts`.
3. **`withProps({ x$: toObservable(store.x) })` only needs `inject(Injector)` if it runs outside the constructor.** Inside the constructor it's free: `readonly driver$ = toObservable(this._$.currentDriver);`.

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
2. Add `app-tree.testing.ts` exporting `provideAppTreeForTesting()`. The un-enhanced testing tree is structurally narrower than the production `AppTree` (no `devTools` / `batching` / `timeTravel`), so the factory must cast:

   ```ts skip
   // app-tree.testing.ts
   export function provideAppTreeForTesting(overrides?: (s: ReturnType<typeof createBaseState>) => ReturnType<typeof createBaseState>): Provider[] {
     return [
       {
         provide: APP_TREE,
         useFactory: (): AppTree => {
           const base = createBaseState();
           const seeded = overrides ? overrides(base) : base;
           // Cast: tree without enhancers satisfies every consumer that
           // only reads `$` / writes signals.
           return signalTree(seeded) as unknown as AppTree;
         },
       },
     ];
   }
   ```

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

### Architectural self-check (run on your own diff before declaring done)

The verifier and the gates above catch import-level and dependency-level regressions. They cannot catch shape-level mistakes — the migration can be green and still ship the wrong architecture. Before you declare done, answer each item below against your own diff. "N/A per app shape audit" is a valid answer; "I forgot" is not.

1. **Selection placement.** If Pattern #1 applies: is `selected` a top-level slice (`$.selected.<key>()`), not nested inside a domain (`$.<domain>.selected.<key>()`)? If Pattern #1 does not apply (singleton-only app): is there _no_ `selected` slice at all?
2. **Load + error siblings.** For each domain slice that does async I/O: does it have a `xLoad: status<string>()` field? If the app has a typed error model, does it also have a `xError: Nullable<AppError>` sibling? If not, is the absence intentional per audit Q2?
3. **Derived tiers.** If ≥ 1 derivation is reused across consumers: is there a `derived/tier-<name>.derived.ts` file with a typed `AppTreeWith<Name>` alias? If every derivation is one-shot: is there _no_ tier file (component-local `computed()` only)?
4. **Orchestration boundary.** Does any single `Ops` class inject ≥ 2 other `Ops` classes? If yes, that's a smell — extract to a `<purpose>Ops`. If audit Q3 said no cross-domain lifecycle: is there _no_ orchestration `Ops`?
5. **`AppStore` injection style.** Post-migration (no `@ngrx/signals` consumers left): does `AppStore` use eager `inject(XOps)` fields, not lazy `Injector.get(XOps)` calls? Mid-incremental-migration: is the lazy pattern only on Ops whose collaborators trigger NG0201 cascades in unrelated specs?

If any answer is "yes, that's wrong" or "I'm not sure," fix the shape before merging. Retrofitting these later is the most expensive churn in the entire migration.
