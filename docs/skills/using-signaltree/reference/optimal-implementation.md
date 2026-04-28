# Optimal SignalTree implementation

The prescribed shape for any non-trivial SignalTree migration or new-app setup. Two independent reference migrations of the same codebase converged on this layout — treat it as the default, deviate only with a written reason.

> **Read this before** starting a migration or building a new app's store. The other reference docs explain individual primitives; this one tells you how they fit together at scale.

## File / folder layout

```
src/app/store/
├── app-store.ts                 # @Injectable({providedIn:'root'}) facade — exposes $ + ops
├── index.ts                     # barrel: re-exports AppStore, APP_TREE, AppTree, createBaseState
├── tree/
│   ├── app-tree.ts              # APP_TREE token, createBaseState(), createAppTree(initial?)
│   ├── app-tree.testing.ts      # provideAppTreeForTesting() — co-located, see testing.md
│   ├── state/
│   │   ├── index.ts
│   │   ├── tickets.state.ts     # one factory per domain
│   │   ├── trucks.state.ts
│   │   └── …                    # one file per domain once you have >2 domains
│   └── derived/
│       ├── index.ts
│       ├── tier-entity-resolution.derived.ts
│       ├── tier-business-logic.derived.ts
│       └── …                    # named tier files, see patterns.md
└── ops/
    ├── index.ts
    ├── tickets.ops.ts           # one Ops class per domain
    ├── tickets.ops.spec.ts      # co-located spec
    ├── trucks.ops.ts
    ├── trucks.ops.spec.ts
    └── …
```

Rules:

- **Foundation lives at `src/app/store/`**, not nested under a feature folder. A foundational store is application-scoped, not feature-scoped.
- **One file per domain** under `tree/state/` once the tree has > 2 domains. Don't keep five domains in one `app-tree.ts`.
- **One Ops class per domain** under `ops/`, each with a co-located `*.ops.spec.ts`.
- **Derived tiers in named files** under `tree/derived/` once you have ≥ 3 derived concerns. Name by what they do (`tier-entity-resolution`), not by position (`tier-1`).
- **`app-tree.testing.ts` ships from day one**, co-located with `app-tree.ts`. See [`testing.md`](./testing.md).

## The `createAppTree(initial?)` factory

Take bootstrap-time inputs as a parameter when the tree needs runtime values not present in default state (selected hauler/truck, tenant id, etc.). This avoids the anti-pattern of constructing the tree first and then immediately patching it.

```ts skip
import { signalTree, batching, devTools, timeTravel } from '@signaltree/core';
import { entityResolutionDerived } from './derived/tier-entity-resolution.derived';
import { ticketWorkflowDerived } from './derived/tier-ticket-workflow.derived';
import { ticketsState } from './state/tickets.state';
import { trucksState } from './state/trucks.state';
// …

export const STORE_NAME = 'AppTree';

export function createBaseState(initial: { haulerId: number | null; truckId: number | null } = { haulerId: null, truckId: null }) {
  return {
    tickets: ticketsState(),
    trucks: trucksState(),
    selected: { haulerId: initial.haulerId, truckId: initial.truckId },
    // …
  };
}

export function createAppTree(initial: { haulerId: number | null; truckId: number | null } = { haulerId: null, truckId: null }) {
  return signalTree(createBaseState(initial))
    .with(devTools({ treeName: STORE_NAME }))
    .with(batching())
    .with(timeTravel())
    .derived(entityResolutionDerived)
    .derived(ticketWorkflowDerived);
}

export type AppTree = ReturnType<typeof createAppTree>;
```

`provideAppTree()` and `provideAppTreeForTesting()` both take the same `initial` shape, so production and tests stay symmetric. Default the parameter so callers without bootstrap inputs don't break.

## Pattern defaults

The following are defaults — apply them unless you have a specific reason not to.

### `entityMap<T, K>()` for collections

Use `entityMap` for any collection where you do **any** of:

- look up by id (`.byId(n)`)
- check membership
- update individual entries
- cross-reference from another domain (e.g. `selectedDriverId → drivers.byId(id)`)

Plain `T[]` is correct only for **ordered, append-only, non-keyed** lists (e.g. an event log buffer). When in doubt, use `entityMap` — it costs one line in the state factory and gives you O(1) CRUD.

```ts skip
// ✓ keyed lookup, cross-reference, individual updates → entityMap
trucks: entityMap<TruckDto, number>(),
drivers: entityMap<DriverDto, number>(),

// ✓ ordered append-only event log → plain array
events: [] as EventDto[],
```

### Per-domain state files

Once the tree has > 2 domains, split each into its own file:

```
state/tickets.state.ts:    export function ticketsState() { return { entities: entityMap<TicketDto, number>(), selected: null as number | null }; }
state/trucks.state.ts:     export function trucksState()  { return entityMap<TruckDto, number>(); }
```

This keeps `app-tree.ts` short (just the composition + enhancer chain) and makes each domain reviewable independently.

### Multi-tier derived chains

Once you have ≥ 3 derived concerns, or any derived value that depends on another derived value, use named tier files. See the worked example in [`patterns.md`](./patterns.md#splitting-derived-tiers-into-separate-files). Tier names describe what they do (`tier-entity-resolution`, `tier-ticket-workflow`, `tier-ui-aggregates`), not their position.

### Enhancer baseline for production

```ts skip
.with(devTools({ treeName: 'AppTree' }))   // always
.with(batching())                          // always
.with(timeTravel())                        // always (cheap; turn off in prod via config if needed)
.with(persistence({ key, autoSave, ... })) // when you need it
```

These are not optional for non-trivial apps. Tests skip them (see [`testing.md`](./testing.md)); production doesn't. (Note: `memoization` was removed in 9.0.1; use Angular `computed()` for memoization.)

### Cross-domain orchestration on `AppStore`

If a method touches one domain, it goes on that domain's Ops class. If it touches two or more domains, it goes on `AppStore` and delegates to the relevant Ops:

```ts skip
// ✓ on AppStore — touches identity AND tickets
logout(): void {
  this.ops.identity.clear();
  this.ops.tickets.clearAll();
}

// ✗ wrong — IdentityOps reaching into TicketOps
class IdentityOps {
  clear() { this.tree.$.identity({ user: null }); inject(TicketOps).clearAll(); }
}
```

This keeps Ops classes free of cross-cutting dependencies (and circular DI).

## Definition of done

A SignalTree migration is **not done** until every box is checked.

### Code completeness

- [ ] Zero imports of `@ngrx/signals` (or whichever legacy package) anywhere in the migrated app's source tree. Verify with `grep -rln '@ngrx/signals' src/app/`.
- [ ] Legacy package removed from `package.json` `dependencies` (or, if a shared lib outside the migrated app still uses it, a tracking ticket exists with a target removal date).
- [ ] All legacy facade adapters deleted. If any remain, each must carry `// TODO(legacy-facade): remove by <date/release>` and a tracking issue.
- [ ] `node_modules/@ngrx` reinstalled clean (`pnpm install` after lockfile update).

### Architecture

- [ ] Foundation lives at `src/app/store/` with the layout above.
- [ ] One tree, one `APP_TREE` token, one `AppStore` facade.
- [ ] Every keyed collection uses `entityMap<T, K>()`.
- [ ] Every domain has its own `*.state.ts` file (if > 2 domains) and its own `*.ops.ts` class.
- [ ] Derived logic split into named tier files (if ≥ 3 derived concerns).
- [ ] Enhancer baseline applied (`devTools + batching + timeTravel`).
- [ ] Cross-domain methods on `AppStore`; single-domain methods on Ops.

### Testing

- [ ] `app-tree.testing.ts` exists and exports `provideAppTreeForTesting()` (with the same `initial` parameter shape as `createAppTree`).
- [ ] `createBaseState()` is exported from `app-tree.ts`.
- [ ] Every Ops class has a co-located `*.ops.spec.ts` covering its public methods.
- [ ] Test suite is green. No `NG0201: APP_TREE` failures, no `Reflect.ownKeys` failures, no `vi.mock`/`jest.mock` hoisting issues.
- [ ] Lint is green (no new warnings introduced by the migration).

### DevX

- [ ] DevTools shows the tree under the chosen `treeName`.
- [ ] `tree.$.<domain>` autocompletes correctly through `AppStore.$` in the IDE.

### Sign-off

- [ ] Read [`migration-from-ngrx-signals.md`](./migration-from-ngrx-signals.md) cover-to-cover before declaring done. The "Gotchas" section covers traps that still bite even after the checklist passes.

## When the hybrid pattern is acceptable

Big-bang is the default. Hybrid (legacy facade adapter over `AppStore`) is acceptable **only** when one of these is true and documented:

1. **PR size constraints.** A 500+-file diff exceeds your team's review capacity.
2. **Multi-team coordination.** Multiple teams own consumers of the legacy facade and can't be flipped on the same day.
3. **Release cadence.** The migration takes longer than your release cycle, so prod must keep running on the in-flight hybrid state.
4. **Risk-averse rollback.** Regulated environment requires the ability to revert the foundation without reverting consumer code.

In all four cases, the hybrid is **scaffolding with a deletion deadline**. Ship it with:

- a `// TODO(legacy-facade): remove by <date/release>` comment on every adapter,
- a tracking issue in your issue tracker,
- a date or release tag for the deletion.

A facade with no deletion plan is not a hybrid — it's a permanent second store and a maintenance burden. Don't ship one.
