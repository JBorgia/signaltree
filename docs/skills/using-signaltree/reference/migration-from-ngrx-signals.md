---
name: signaltree-migration-from-ngrx-signals
description: One-to-one mapping guide specifically for porting @ngrx/signals stores to SignalTree. Only load this skill when the user is converting code that uses the @ngrx/signals package (signalStore, withState, withMethods, withComputed, withHooks, rxMethod, patchState, withEntities, signalStoreFeature). Do NOT load for classic @ngrx/store (reducers/actions/effects) or @ngrx/component-store migrations — those are different patterns.
---

# Migrating from @ngrx/signals to SignalTree

Quick reference for converting an existing `@ngrx/signals` codebase. Applies **only to `@ngrx/signals`** — the signal-based store package (`signalStore`, `withState`, `rxMethod`). Not applicable to classic `@ngrx/store` (reducers, actions, effects) or `@ngrx/component-store`.

Read the root `SKILL.md` and `reference/patterns.md` for full SignalTree context; use this file for the mechanical mappings.

## Hybrid adoption in a monorepo

If you are migrating a large workspace where `@ngrx/signals` is used by shared base classes (`signalStoreFeature`, custom `withEntity*` features in a `libs/store` package) and consumed by multiple apps, do not assume you can flip one app at a time without preparation:

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

| ngrx/signals                                   | SignalTree equivalent                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `signalStore(...)`                             | Domain slice in the single `signalTree()` + an `Ops` class for its methods |
| `withState({ a, b })`                          | Initial state object passed to `signalTree()`                              |
| `withMethods(({ ... }) => ({ ... }))`          | Methods on an `Ops` class that injects `APP_TREE`                          |
| `withComputed(({ ... }) => ({ ... }))`         | Angular `computed()` on the component or in `.derived()` on the tree       |
| `withHooks({ onInit })`                        | Constructor body of the service / `APP_TREE` factory                       |
| `rxMethod(pipe(...))`                          | Plain method returning `Observable<void>`; writes via `tap()`              |
| `patchState(store, { a, b })`                  | `tree.$.domain((s) => ({ ...s, a, b }))` or individual `.set()` calls      |
| `withEntities<T>()`                            | `entityMap<T, K>()` marker                                                 |
| `store.entities()`                             | `tree.$.items.all()`                                                       |
| `store.entityMap()`                            | `tree.$.items.byId(id)`                                                    |
| `addEntity(e)`                                 | `tree.$.items.addOne(e)`                                                   |
| `setAllEntities(es)`                           | `tree.$.items.setAll(es)`                                                  |
| `updateEntity({ id, changes })`                | `tree.$.items.upsertOne({ ...existing, ...changes })`                      |
| `removeEntity(id)`                             | `tree.$.items.removeOne(id)`                                               |
| `provideDevtoolsConfig({ name })` in providers | `.with(devTools({ treeName: name }))` on the tree — remove the provider    |

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
  providers: [provideAppTreeForTesting(s => ({ ...s, driver: { ...s.driver, currentDriver: { id: 1 } } }))]
  ```

Do not call any `Ops` method to seed state in tests — `Ops` are for runtime behaviour, not test fixtures.

## Keep the legacy facade — adapt its internals

When the existing `@ngrx/signals` store (e.g. `DriverStore`) is referenced by dozens of components and specs, do not rename it. Replace its internals with a small adapter over `AppStore` so the public shape is preserved while the implementation moves to SignalTree. See [`patterns.md`](./patterns.md#hybrid-migration-legacy-facade-adapters) for the adapter pattern. The legacy spec mocks (`Mock<DriverStore>`) keep working — they now mock the adapter's interface instead of the original `signalStore` instance.
