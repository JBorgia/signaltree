# Testing

How to wire SignalTree into Angular `TestBed`s without ambient-DI surprises.

> **Single hard rule.** Every `TestBed` that constructs a service or component which depends on `AppStore` — directly **or transitively** through any `providedIn: 'root'` consumer (legacy facades, message hubs, resolvers, etc.) — **must** include `provideAppTreeForTesting()` in `providers`. Mocking `AppStore` with `useValue` is not enough on its own when the DI graph still walks through real `providedIn: 'root'` services that inject `APP_TREE`.

## Why

In the recommended shape from [`patterns.md`](./patterns.md):

```ts
// app-tree.ts
export const APP_TREE = new InjectionToken<AppTree>('APP_TREE');

export function provideAppTree(): Provider[] {
  return [{ provide: APP_TREE, useFactory: () => createAppTree() }];
}
```

```ts
// app-store.ts
@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree = inject(APP_TREE);
  readonly $ = this.tree.$;
  readonly ops = {
    /* ... */
  } as const;
}
```

`AppStore` is `providedIn: 'root'`, so Angular happily instantiates it inside any `TestBed`. The instantiation then calls `inject(APP_TREE)`, which **fails** because `APP_TREE` is only registered by `provideAppTree()` in production `app.config.ts`. The error surfaces as:

```text
NG0201: No provider found for `InjectionToken APP_TREE`.
Source: DynamicTestModule.
Path:   <YourConsumer> -> AppStore -> InjectionToken APP_TREE.
```

If `AppStore` is consumed transitively (e.g. a legacy `Store` facade migrated to wrap `AppStore`), the path lengthens — `MessagingHub -> Store -> AppStore -> APP_TREE` — and the failure cascades through every test that touches the consumer.

## The recipe

Co-locate this with `app-tree.ts` (e.g. `app-tree.testing.ts`):

```ts
// app-tree.testing.ts
import { Provider } from '@angular/core';
import { signalTree } from '@signaltree/core';
import { APP_TREE, AppTree, createBaseState } from './app-tree';

/**
 * Provide a real, isolated AppTree for a TestBed.
 *
 * Pass `overrides` to seed any subtree — useful for tests that need a
 * specific `currentDriver`, `featureFlags`, etc. without going through Ops.
 */
export function provideAppTreeForTesting(overrides?: (state: ReturnType<typeof createBaseState>) => ReturnType<typeof createBaseState>): Provider[] {
  return [
    {
      provide: APP_TREE,
      useFactory: (): AppTree => {
        const base = createBaseState();
        const seeded = overrides ? overrides(base) : base;
        return signalTree(seeded);
      },
    },
  ];
}
```

Notes:

- **Use a real tree, not a mock.** Mocking the tree itself defeats the test value of the proxy and `entityMap` semantics. Real trees are cheap.
- **Skip enhancers in tests** by default. `batching()` adds scheduling, `devTools()` opens a connection, `timeTravel()` keeps history — none help unit tests. If a test specifically exercises batching, layer `batching()` in that test only.
- **`createBaseState()` must be exported from `app-tree.ts`.** This is the seam that lets tests construct an isolated state without copying the production composition.

## Mocking strategy by test type

There are three layers — tree, ops, facade — and only one of them should be mocked per test. The matrix:

| Test type                                   | Tree          | Ops classes    | Components / consumers | Notes                                                |
| ------------------------------------------- | ------------- | -------------- | ---------------------- | ---------------------------------------------------- |
| **Ops class spec** (`*.ops.spec.ts`)        | real (seeded) | **real (SUT)** | n/a                    | Mock the underlying HTTP / domain services only.     |
| **Component spec** (template / interaction) | real (seeded) | mocked         | real (SUT)             | Spy on `ops.<domain>.<method>` to assert dispatch.   |
| **Legacy consumer spec** (using shim)       | real (seeded) | mocked or real | real                   | Provide the legacy facade adapter; do NOT mock both. |
| **`AppStore` spec itself** (rare)           | real          | mocked         | n/a                    | Usually unnecessary — `AppStore` is a thin facade.   |

### Ops spec example

```ts
// driver.ops.spec.ts
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { DriverOps } from './driver.ops';
import { provideAppTreeForTesting } from './app-tree.testing';
import { APP_TREE } from './app-tree';
import { DriverService } from '../../driver.service';

describe('DriverOps', () => {
  let ops: DriverOps;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideAppTreeForTesting(), { provide: DriverService, useValue: { load$: () => of({ id: 1, name: 'Ada' }) } }],
    });
    ops = TestBed.inject(DriverOps);
  });

  it('writes the loaded driver to the tree', async () => {
    await firstValueFrom(ops.loadActiveDriver$());
    const tree = TestBed.inject(APP_TREE);
    expect(tree.$.driver.currentDriver()).toEqual({ id: 1, name: 'Ada' });
  });
});
```

### Component spec example

```ts
// some.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideAppTreeForTesting } from '../store/tree/app-tree.testing';
import { DriverOps } from '../store/ops/driver.ops';
import { SomeComponent } from './some.component';

describe('SomeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SomeComponent],
      providers: [provideAppTreeForTesting((s) => ({ ...s, driver: { ...s.driver, currentDriver: { id: 1, name: 'Ada' } } })), { provide: DriverOps, useValue: { clearCurrentDriver: jest.fn() } }],
    });
  });

  // ...
});
```

## Wiring `APP_TREE` once for a large existing test suite

For a brown-field migration the simplest fix is to declare `APP_TREE` with a tree-shakable `providedIn: 'root'` factory — every child injector (including each per-spec `TestBed`) then gets a fresh isolated tree by default, and existing specs need **no** changes. See ["Brown-field migrations: declare `APP_TREE` with a tree-shakable factory"](./patterns.md#brown-field-migrations-declare-app_tree-with-a-tree-shakable-factory) in `patterns.md`. Use the recipe below only when the token has no `providedIn: 'root'` default and you instead want one global testing provider.

Per-TestBed `provideAppTreeForTesting()` is the right shape for **new** specs. For an existing app where dozens of spec files (and their parameterised setup helpers like `provideMockStore()`, `createTestingModule()`) need it, editing each one is mechanical noise that obscures real changes. Register the provider **once** via `getTestBed().initTestEnvironment(...)`:

```ts
// test-setup.ts
import { NgModule } from '@angular/core';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { getTestBed } from '@angular/core/testing';

// IMPORTANT: import directly from the testing file, NOT from a barrel.
// Importing `./signaltree` (the barrel) pulls in AppStore + every Ops class
// transitively, which pre-loads any service those Ops inject. That breaks
// specs that rely on `vi.mock(...)` / `jest.mock(...)` hoisting against
// modules in the Ops dependency graph.
import { provideAppTreeForTesting } from './app/store/tree/app-tree.testing';

@NgModule({ providers: [...provideAppTreeForTesting()] })
class SignalTreeTestEnvironmentModule {}

getTestBed().initTestEnvironment([BrowserTestingModule, SignalTreeTestEnvironmentModule], platformBrowserTesting(), { errorOnUnknownElements: true, errorOnUnknownProperties: true });
```

Why this works: `useFactory` inside `provideAppTreeForTesting()` runs per child injector, so each `TestBed.configureTestingModule(...)` still gets its own isolated tree — the registration is global but the _value_ is per-spec.

**The barrel-import rule is non-negotiable.** Symptom if you ignore it: a spec that has `vi.mock('@some-package')` at the top stops working because `@some-package` was already loaded (transitively, via `index.ts → AppStore → SomeOps → SomeService → @some-package`) before `vi.mock` had a chance to hoist. The error usually surfaces as the real implementation being called instead of the mock, often with a misleading stack trace.

**Per-spec overrides still work.** If a single test needs seeded state, call `provideAppTreeForTesting(s => ({...}))` inside its own `providers` — Angular merges the per-spec provider on top of the global one.

**When to pick which.** New code or a small migration (≤ 5 spec files): per-TestBed. Existing app with many specs: global. Either way, the recipe is the same `provideAppTreeForTesting()`; only the registration site differs.

## Common test-bed pitfalls

- **Mocking `AppStore` with `useValue`** doesn't stop Angular from also instantiating _other_ root-provided services that themselves inject `APP_TREE`. Always provide `APP_TREE` (via `provideAppTreeForTesting()`), even if `AppStore` is also mocked.
- **Don't seed via `createAppTree()`.** That production factory often layers `batching()`, `devTools()`, etc. Use `signalTree(createBaseState())` directly so tests stay deterministic.
- **`takeUntilDestroyed(destroyRef)` inside Ops** is a no-op for `providedIn: 'root'` Ops because root services live for the application's lifetime. In tests, this means subscriptions started by Ops are not cleaned up between specs — either:
  - drive Ops via `firstValueFrom(ops.someMethod$())` so completion is explicit,
  - or scope cancellation with an explicit `Subject<void>` exposed on the Ops class.
    See "Lifetime caveat" in [`patterns.md`](./patterns.md#lifetime-caveat-for-providedin-root-ops).
- **`ɵNotFound: NG0201` mid-test, halfway through a suite that previously passed** almost always means a new `providedIn: 'root'` consumer started transitively touching `AppStore`. Add `provideAppTreeForTesting()` to the failing test bed; do not mock the new consumer.

## Quick checklist for the agent

Before declaring a SignalTree migration "done":

1. ✅ `app-tree.testing.ts` exists alongside `app-tree.ts` exporting `provideAppTreeForTesting()`.
2. ✅ `createBaseState()` is exported from `app-tree.ts`.
3. ✅ Every `TestBed.configureTestingModule({...})` call in the migrated app that fails with `NG0201: APP_TREE` has `provideAppTreeForTesting()` added to its `providers`.
4. ✅ Ops specs use a real tree + real Ops + mocked downstream services.
5. ✅ Component specs use a real seeded tree + mocked Ops.
6. ✅ Test suite runs to green before the next layer of refactor.
