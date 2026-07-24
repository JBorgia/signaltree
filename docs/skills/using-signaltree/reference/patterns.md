# Patterns

Idiomatic SignalTree usage. Every snippet compiles against `@signaltree/core` (and `@angular/core` where shown) without modification.

## Prefer a single global store

For app-wide state, lean toward **one tree per application** rather than many
small trees. A single tree:

- lets you derive cross-domain values naturally (one ticket depends on one
  driver depends on one truck — all on the same `$`);
- gives you one DevTools timeline, so "what happened right before that bug?"
  has a single answer;
- keeps initialization order explicit — the tree is composed once at app boot,
  not assembled from dozens of services that each hold a fragment.

This is a soft preference, not a rule. Genuinely component-local state
(a form, a popover, a list being edited) still belongs on the component. And
teams migrating from `@ngrx/signals` often have many small `signalStore`s —
you don't have to collapse them all day one. The shape below is the target,
not a prerequisite.

### Shape

One file per domain exposing a plain state factory:

```ts
// tickets.state.ts
import { entityMap } from '@signaltree/core';

interface Ticket {
  id: number;
  title: string;
  done: boolean;
}

export function ticketsState() {
  return {
    entities: entityMap<Ticket, number>(),
    activeId: null as number | null,
  };
}
```

```ts
// identity.state.ts
interface User {
  id: number;
  name: string;
}

export function identityState() {
  return {
    user: null as User | null,
  };
}
```

A single `createAppTree()` composes them and layers derived tiers. Each
`.derived(...)` call can read signals added by previous tiers — that's why
multi-tier derivations chain rather than collapse into one block:

```ts
// app-tree.ts
import { InjectionToken, Provider, computed } from '@angular/core';
import { signalTree, batching, devTools, timeTravel } from '@signaltree/core';

// Local minimal state factories for the snippet to compile standalone.
interface Ticket {
  id: number;
  title: string;
  done: boolean;
}
interface User {
  id: number;
  name: string;
}

import { entityMap } from '@signaltree/core';
function ticketsState() {
  return {
    entities: entityMap<Ticket, number>(),
    activeId: null as number | null,
  };
}
function identityState() {
  return { user: null as User | null };
}

function createBaseState() {
  return {
    tickets: ticketsState(),
    identity: identityState(),
  };
}

export function createAppTree() {
  return (
    signalTree(createBaseState())
      .with(devTools({ treeName: 'AppTree' }))
      .with(batching())
      .with(timeTravel())
      // Tier 1: entity resolution off raw state.
      .derived(($) => ({
        tickets: {
          active: {
            entity: computed(() => {
              const id = $.tickets.activeId();
              return id != null ? $.tickets.entities.byId(id)?.() ?? null : null;
            }),
          },
          all: computed(() => $.tickets.entities.all()),
        },
      }))
      // Tier 2: business logic depending on Tier 1.
      .derived(($) => ({
        tickets: {
          hasActive: computed(() => $.tickets.active.entity() != null),
          openCount: computed(() => $.tickets.all().filter((t) => !t.done).length),
        },
      }))
  );
}

export type AppTree = ReturnType<typeof createAppTree>;

export const APP_TREE = new InjectionToken<AppTree>('APP_TREE');

export function provideAppTree(): Provider[] {
  return [{ provide: APP_TREE, useFactory: () => createAppTree() }];
}
```

### Brown-field migrations: declare `APP_TREE` with a tree-shakable factory

In a brown-field migration where dozens (or hundreds) of existing `TestBed`s never opt into `provideAppTreeForTesting()`, every spec that transitively touches `AppStore` will fail with `NullInjectorError: APP_TREE` the moment the migration lands. Editing every spec to add the provider is mechanical noise and a poor reviewer experience.

**Solution:** declare the `APP_TREE` token itself with a `providedIn: 'root'` factory. Each child injector (including the per-spec `TestBed` injector) gets a fresh, isolated tree by default. Explicit `provideAppTree()` in `bootstrapApplication` and explicit `provideAppTreeForTesting(seed)` in a spec both still win, because they register a higher-priority provider on the consuming injector.

```ts skip
// tree/app-tree.ts
export const APP_TREE = new InjectionToken<AppTree>('APP_TREE', {
  providedIn: 'root',
  factory: () => createAppTree(), // full enhancers; tests get isolation because the factory runs per child injector
});
```

Two notes that bite if you skip them:

- **The factory must return `createAppTree()`, not `signalTree(createBaseState())`.** `AppTree = ReturnType<typeof createAppTree>` includes the enhancer methods (`devTools` connection handle, `timeTravel` history API, etc.). A bare `signalTree(createBaseState())` is structurally narrower and will fail to satisfy `AppTree` with `TS2769`. If you genuinely want a bare tree as the default (for example to keep tests free of DevTools chatter), define `AppTree = ReturnType<typeof signalTree<ReturnType<typeof createBaseState>>>` and have `createAppTree()` return that same narrower type — but then production code that needs the enhancer surface must reach for them via the builder, not via `inject(APP_TREE)`.
- Each child injector still gets its own tree because the factory runs per injector — enhancers don't leak state between specs.

This is the recommended default for any migration into an existing app. Greenfield apps where every `TestBed` is authored against the new shape can keep the bare `new InjectionToken<AppTree>('APP_TREE')` form.

### Splitting derived tiers into separate files

When a tier grows beyond ~30 lines, move it into its own file under
`tree/derived/`. Two practical conventions keep this readable as the tree
grows:

1. **Name tiers by what they do, not by their position.** `tier-entity-resolution.derived.ts`,
   `tier-ticket-workflow.derived.ts`, `tier-ui-aggregates.derived.ts` survive
   refactors. `tier-1`, `tier-2`, … force a rename whenever a tier moves.
2. **Type each tier function against the tree shape it actually sees.** Use
   `derivedFrom<TTree>()` to declare the
   tier in its own file with a fully typed `$`, and `WithDerived<…>` to
   describe the tree shape after each tier so subsequent tiers can reference
   what came before.

```ts
// @skip-lint - illustrative cross-file imports; resolved at app build time.
// tree/app-tree.ts
import { signalTree, WithDerived } from '@signaltree/core';
import { entityResolutionDerived } from './derived/tier-entity-resolution.derived';
import { ticketWorkflowDerived } from './derived/tier-ticket-workflow.derived';

function createBaseState() {
  /* …state factories… */ return {} as Record<string, unknown>;
}

/** Tree shape before any derived tiers — what tier-1 sees. */
export type AppTreeBase = ReturnType<typeof signalTree<ReturnType<typeof createBaseState>>>;

/** Tree shape after entity resolution — what tier-2 sees. */
export type AppTreeWithEntityResolution = WithDerived<AppTreeBase, typeof entityResolutionDerived>;

/** Tree shape after ticket workflow — what tier-3 sees, and so on. */
export type AppTreeWithTicketWorkflow = WithDerived<AppTreeWithEntityResolution, typeof ticketWorkflowDerived>;
```

```ts
// @skip-lint - relative import to sibling app-tree file shown above.
// tree/derived/tier-entity-resolution.derived.ts
import { computed } from '@angular/core';
import { derivedFrom } from '@signaltree/core';
import type { AppTreeBase } from '../app-tree';

export const entityResolutionDerived = derivedFrom<AppTreeBase>()(($) => ({
  tickets: {
    active: computed(() => {
      const id = $.tickets.activeId();
      return id != null ? $.tickets.entities.byId(id)?.() ?? null : null;
    }),
  },
}));
```

```ts
// @skip-lint - relative import to sibling app-tree file shown above.
// tree/derived/tier-ticket-workflow.derived.ts
import { computed } from '@angular/core';
import { derivedFrom } from '@signaltree/core';
import type { AppTreeWithEntityResolution } from '../app-tree';

// Sees `tickets.active` from the previous tier, fully typed.
export const ticketWorkflowDerived = derivedFrom<AppTreeWithEntityResolution>()(($) => ({
  tickets: {
    canAdvance: computed(() => $.tickets.active() != null),
  },
}));
```

The chain in `createAppTree()` is unchanged — `.derived(entityResolutionDerived).derived(ticketWorkflowDerived)` — but each tier file is independently typed and reviewable.

### Recommended tier ladder for large apps

Once a tree has more than ~3 domains with computeds, ad-hoc `computed(...)` calls scattered across state factories become hard to reason about (which signal depends on which?). Validated production trees converge on a five-tier ladder, each tier strictly building on the one below:

| Tier | Name              | Sees                          | Job                                                                              |
| ---- | ----------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| 0    | Base state        | —                             | Raw data: `entityMap`s, primitive leaves, `status()` slices. No computeds.       |
| 1    | Entity resolution | `AppTreeBase`                 | Resolve `*Id` leaves to full entities via `entityMap.byId()`. Pure lookup.       |
| 2    | Complex logic     | `AppTreeWithEntityResolution` | Business rules over resolved entities (display names, isExternal, isComplete).   |
| 3    | Workflow          | `AppTreeWithComplexLogic`     | Domain-specific state machines (workflow steps, current index, status maps).     |
| 4    | Navigation        | `AppTreeWithWorkflow`         | Position queries on top of workflow (next/previous, canAdvance, statusInfo).     |
| 5    | UI aggregates     | `AppTreeWithNavigation`       | Cross-domain rollups for shells / error banners (overall loading, firstError). |

**Why these specific layers?** Each one answers a different question and depends only on lower layers, so the dependency graph is always acyclic by construction:

- **Tier 1 (entity resolution) MUST come first** — every higher tier wants to talk about entities, not IDs. Doing this lookup once removes a class of bugs where two tiers resolve the same id with different fallbacks.
- **Tier 2 (complex logic) is where business rules live** — `displayName`, `isComplete`, `isExternal`. If you find yourself writing the same `computed` in two components, it belongs here.
- **Tier 3+4 (workflow / navigation) split when state-machine code grows** — keep the steps array and current-index in workflow, keep next/previous and `canAdvance` in navigation. Splitting prevents one giant tier file from accumulating every workflow query in the app.
- **Tier 5 (UI aggregates) is the only tier that touches more than one domain** — overall loading, first-error, has-any-error. Components consume from here so they don't have to OR-together five domain signals inline.

**Type wiring at scale.** Each tier file imports the previous-tier shape it needs:

```ts skip
// tree/app-tree.ts
import { signalTree, WithDerived } from '@signaltree/core';
import { entityResolutionDerived } from './derived/tier-entity-resolution.derived';
import { complexLogicDerived } from './derived/tier-complex-logic.derived';
import { ticketWorkflowDerived } from './derived/tier-ticket-workflow.derived';
import { ticketNavigationDerived } from './derived/tier-ticket-navigation.derived';
import { uiAggregatesDerived } from './derived/tier-ui-aggregates.derived';

export type AppTreeBase = ReturnType<typeof signalTree<ReturnType<typeof createBaseState>>>;
export type AppTreeWithEntityResolution = WithDerived<AppTreeBase, typeof entityResolutionDerived>;
export type AppTreeWithComplexLogic = WithDerived<AppTreeWithEntityResolution, typeof complexLogicDerived>;
export type AppTreeWithWorkflow = WithDerived<AppTreeWithComplexLogic, typeof ticketWorkflowDerived>;
export type AppTreeWithNavigation = WithDerived<AppTreeWithWorkflow, typeof ticketNavigationDerived>;
export type AppTree = ReturnType<typeof createAppTree>; // final, post-uiAggregates
```

**Consumer rule:** components and Ops always type against `AppTree` (the final composed shape). Only tier files type against intermediate phases. This keeps consumer code stable when tiers are reordered or added.

**When to skip the ladder.** A small app (≤ 2 domains, ≤ 5 computeds total) does not need this — inline `computed`s in state factories are fine. Adopt the ladder when:

- Total derived signals exceed ~15 across the tree, OR
- Two or more components import the same `computed` from different state files, OR
- Cross-domain rollups appear (the moment one computed reads from two state slices, you want UI aggregates).

Do NOT pre-build empty tiers — start with whatever tiers you actually have signals for, and add tiers only when crossing the boundary creates real value. The ladder is a destination, not a starting template.

### `AppStore` facade

A single `providedIn: 'root'` class holds the tree, exposes `$`, and namespaces
domain operations under `ops`. Cross-domain orchestration lives as methods on
this class.

```ts
import { inject, Injectable, InjectionToken, Signal } from '@angular/core';
import { signalTree } from '@signaltree/core';

// Declared elsewhere in the real app (see "Shape" above).
interface AppState {
  tickets: { activeId: number | null };
  identity: { user: { id: number; name: string } | null };
}
declare const APP_TREE: InjectionToken<ReturnType<typeof signalTree<AppState>>>;

@Injectable({ providedIn: 'root' })
class TicketOps {
  clearAll(): void {
    /* ... */
  }
}
@Injectable({ providedIn: 'root' })
class IdentityOps {
  clear(): void {
    /* ... */
  }
}

@Injectable({ providedIn: 'root' })
export class AppStore {
  readonly tree = inject(APP_TREE);
  readonly $ = this.tree.$;

  readonly ops = {
    tickets: inject(TicketOps),
    identity: inject(IdentityOps),
  } as const;

  /** Cross-domain orchestration — coordinates multiple Ops. */
  logout(): void {
    this.ops.identity.clear();
    this.ops.tickets.clearAll();
  }
}
```

### `Ops` class per domain

One `@Injectable({ providedIn: 'root' })` class per domain owns the mutators
for that slice. Ops classes are **stateless facades** — no fields other than
injected dependencies and a cached reference to the relevant slice of `$`.
Async operations return observables so callers control subscription lifetime.
For most async needs, **prefer the `asyncSource` and `asyncQuery` markers** in
the tree literal — they eliminate this Ops-method pattern entirely. Use the
Ops-method pattern when you need explicit `Observable<void>` returns the
caller subscribes to (e.g., chained workflows). See "Replacing `rxMethod`"
below for the full mapping.

```ts
import { inject, Injectable, InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { signalTree, entityMap } from '@signaltree/core';

interface Ticket {
  id: number;
  title: string;
  done: boolean;
}
interface AppState {
  tickets: {
    entities: ReturnType<typeof entityMap<Ticket, number>>;
    activeId: number | null;
  };
}
declare const APP_TREE: InjectionToken<ReturnType<typeof signalTree<AppState>>>;
interface TicketApi {
  list$(): Observable<Ticket[]>;
}
declare const TICKET_API: InjectionToken<TicketApi>;

@Injectable({ providedIn: 'root' })
export class TicketOps {
  private readonly _tree = inject(APP_TREE);
  private readonly _$tickets = this._tree.$.tickets;

  private readonly _api = inject(TICKET_API);

  // Sync mutations.
  setActive(id: number | null): void {
    this._$tickets.activeId.set(id);
  }

  clearAll(): void {
    this._$tickets.entities.setAll([]);
    this._$tickets.activeId.set(null);
  }

  // Async — observable return, caller owns subscription.
  load$(): Observable<void> {
    return this._api.list$().pipe(
      tap((items) => this._$tickets.entities.setAll(items, { selectId: (t) => t.id })),
      map(() => void 0)
    );
  }
}
```

### Component usage

**Injection rules — follow these exactly:**

- **Components, resolvers, interceptors, guards, and any other consumer inject `AppStore` only.** Never inject an Ops class or `APP_TREE` directly in a consumer.
- **Ops classes inject `APP_TREE` directly** for writes, and may inject other services. They do not inject `AppStore`.
- **`APP_TREE` token is private infrastructure.** Only `AppStore` and Ops classes should ever inject it.

```
Consumer (component / resolver / interceptor)
  └─ injects AppStore
       ├─ $.domain.leaf()          ← reads
       └─ ops.domain.method()      ← writes (delegates to Ops class)

Ops class
  └─ injects APP_TREE              ← writes directly to the tree
```

Components read via `store.$` and trigger mutations via `store.ops.<domain>`:

```ts
import { Component, inject } from '@angular/core';
import { signalTree, entityMap } from '@signaltree/core';

interface Ticket {
  id: number;
  title: string;
  done: boolean;
}
interface AppState {
  tickets: {
    entities: ReturnType<typeof entityMap<Ticket, number>>;
    activeId: number | null;
  };
}

// Minimal ambient store/ops shapes for the snippet.
declare class TicketOps {
  load$(): import('rxjs').Observable<void>;
  setActive(id: number | null): void;
}
declare class AppStore {
  readonly $: ReturnType<typeof signalTree<AppState>>['$'];
  readonly ops: { tickets: TicketOps };
}

@Component({ selector: 'app-tickets', template: '' })
export class TicketsComponent {
  readonly store = inject(AppStore);
  readonly tickets = this.store.$.tickets.entities.all;
  readonly activeId = this.store.$.tickets.activeId;

  load() {
    this.store.ops.tickets.load$().subscribe();
  }
}
```

### Rules of thumb

- **State lives in the tree.** Never on the Ops class or `AppStore`.
- **Derived lives in `.derived()`.** Never on the Ops class.
- **Ops classes are stateless facades.** No fields other than injected dependencies and a cached slice of `$`.
- **Cross-domain orchestration goes on `AppStore`.** Not on any one Ops.
- **One tree per application.** Keep component-local trees only for genuinely ephemeral UI state.
- **Consumers inject `AppStore`, nothing else.** A component, resolver, interceptor, or guard that injects an Ops class or `APP_TREE` directly is wrong — route everything through `AppStore`.
- **`APP_TREE` belongs to infrastructure.** Only `AppStore` and Ops classes ever inject the token.
- **Tests must provide `APP_TREE`.** `providedIn: 'root'` makes `AppStore` ambient — Angular instantiates it (and any consumer that depends on it) inside every `TestBed`, which then fails with `NG0201` because production `provideAppTree()` is never called. Ship `provideAppTreeForTesting()` alongside `provideAppTree()` from day one. See [`testing.md`](./testing.md).

### Lifetime caveat for `providedIn: 'root'` Ops

Ops classes are typically `@Injectable({ providedIn: 'root' })` so consumers can call them anywhere. That makes them **application-lifetime** — `DestroyRef` injected into a root Ops never fires until the app shuts down, so `takeUntilDestroyed(destroyRef)` inside a root-provided Ops is effectively a no-op.

This is fine for fire-and-forget reads (the subscription naturally completes when the source completes), but be deliberate when:

- **You need cancellation between user actions** (a new `loadDriver$()` call should cancel the previous one). Use `switchMap` inside the Ops on a `Subject<TInput>`, not `takeUntilDestroyed`.
- **The Ops drives an infinite stream** (websocket, polling). Hold an explicit `Subject<void>` cancellation token and expose `cancelLoad(): void { this._cancel$.next(); }`.
- **Tests need cleanup between specs.** Either drive Ops via `firstValueFrom(...)` so completion is explicit, or expose an explicit cancel hook the test bed can call in `afterEach`.

If you need per-request scoping rather than app-lifetime, drop `providedIn: 'root'` from the Ops and provide it on a feature route or a sub-injector instead. Don't reach for `takeUntilDestroyed` to fix what is really a scoping problem.

## Hybrid migration: legacy facade adapters (fallback)

> **Default is big-bang**, not hybrid. The hybrid pattern below is a _temporary scaffold_ for migrations that cannot land in one PR. See [`optimal-implementation.md`](./optimal-implementation.md#when-the-hybrid-pattern-is-acceptable) for when this is acceptable, and what deletion-deadline metadata you must ship with each adapter.

When big-bang isn't possible — the existing app exposes a long-standing facade like an `@ngrx/signals` `DriverStore`, dozens of consumers depend on it, and you cannot flip them all in one PR — two-step the migration:

1. **Stand up the new shape first.** Create `AppStore`, `Ops` classes, and `APP_TREE` exactly as in [Shape](#shape).
2. **Replace the legacy facade's internals with adapters over `AppStore`.** Keep the legacy class name and public signature so consumers and specs keep compiling. Delete the legacy facade only when zero consumers remain.

The adapter is a _typed view_ that re-exposes `AppStore` slices in the legacy facade's shape — usually a `readonly` interface plus a small factory:

```ts
// store.ts (legacy facade, post-migration)
import { Injectable, Signal, computed, inject } from '@angular/core';
import { LoadingState } from '@signaltree/core';
import { AppStore } from './signaltree';

/** Public legacy shape — components and specs already depend on this. */
export interface LegacyDriverFacade {
  readonly currentDriver: Signal<{ id: number; name: string } | null>;
  readonly isLoading: Signal<boolean>;
  readonly loadingState: Signal<LoadingState>;
  loadActiveDriver(): void;
  clearCurrentDriver(): void;
}

function createLegacyDriverAdapter(app: AppStore): LegacyDriverFacade {
  const $driver = app.$.driver;
  return {
    currentDriver: $driver.currentDriver,
    isLoading: $driver.load.loading, // legacy facade name → v10.3 canonical .loading
    loadingState: computed(() => $driver.load.state()),
    loadActiveDriver: () => {
      app.ops.driver.loadActiveDriver$().subscribe();
    },
    clearCurrentDriver: () => app.ops.driver.clearCurrentDriver(),
  };
}

@Injectable({ providedIn: 'root' })
export class Store {
  private readonly _app = inject(AppStore);
  /** Legacy `store.drivers.*` — same shape as before the migration. */
  readonly drivers: LegacyDriverFacade = createLegacyDriverAdapter(this._app);
}
```

### Adapter rules

- **Adapter functions are pure.** They take an `AppStore` instance and return the legacy interface — no DI, no `inject()`, no state.
- **Adapter values are computed once per `Store` instance**, not lazily on each access. Components reading `store.drivers.currentDriver` should hit the same `Signal` reference every time.
- **Ban legacy back-references.** The new `Ops` classes must never read from the legacy facade — only `AppStore -> Ops -> tree`. The arrow goes one way.
- **Move shared types into the `signaltree/` directory before rewriting the legacy facade.** State shapes and DTOs that the slice owns should live next to the new `Ops` and tree definitions, with the legacy file re-exporting them for backward compat. Otherwise the new `Ops` class will need to import the legacy facade for its types — instant circular import.
- **Cross-cutting `signalStoreFeature` extensions don't port as-is.** Behaviour-only features (error banners, telemetry baggage, refresh hooks) cannot be bolted onto the plain `@Injectable` adapter. Three valid options: **(a)** drop them and reintroduce as SignalTree enhancers in a follow-up (cheapest if no test exercises them); **(b)** rewrite the cross-cutting behaviour as constructor-body subscriptions on the relevant `Ops` class that read `tree.$.<domain>` and call the same downstream services; **(c)** keep the cross-cutting behaviour on the legacy ngrx store until the underlying library is migrated. Document which option you chose in a class-level comment.
- **Mandatory deletion deadline.** Every adapter ships with `// TODO(legacy-facade): remove by <date/release>` _and_ a tracking issue. A facade with no deletion plan becomes a permanent second store and a maintenance burden — don't ship one. Grep for the TODO before every release; if the deadline has passed, the next sprint is the deletion sprint, not "we'll get to it."

### Test impact

Existing specs that mocked `Mock<DriverStore>` keep their shape — they now mock `LegacyDriverFacade` instead. **But** the `TestBed` that constructs `Store` will instantiate `AppStore`, which needs `provideAppTreeForTesting()`. See [`testing.md`](./testing.md) for the full recipe.

## Create the tree where it's used

A SignalTree is a value, not a module. Create it wherever it logically lives — usually in a component or a service factory.

### In a component

```ts
import { Component } from '@angular/core';
import { signalTree } from '@signaltree/core';

@Component({
  selector: 'app-counter',
  template: `<button (click)="inc()">{{ tree.$.count() }}</button>`,
})
export class CounterComponent {
  readonly tree = signalTree({ count: 0 });

  inc() {
    this.tree.$.count.update((n) => n + 1);
  }
}
```

### Shared service (`providedIn: 'root'`)

When a tree is genuinely shared across routes or components (auth/identity,
user preferences, a reference-data cache), put it on a single
`providedIn: 'root'` service. The tree is private; the service exposes
read-only `Signal<T>` leaves plus mutator methods. This matches the external
shape of `@ngrx/signals`' `signalStore({ providedIn: 'root' })`, which makes
it the natural target when migrating.

```ts
import { inject, Injectable, Signal } from '@angular/core';
import { signalTree } from '@signaltree/core';

interface UserState {
  name: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class UserStore {
  private readonly _tree = signalTree<UserState>({ name: '', email: '' });

  // Expose leaves as read-only signals.
  readonly name: Signal<string> = this._tree.$.name;
  readonly email: Signal<string> = this._tree.$.email;

  // Expose mutators.
  setName(v: string): void {
    this._tree.$.name.set(v);
  }

  setEmail(v: string): void {
    this._tree.$.email.set(v);
  }
}

// Consumers:
//   readonly user = inject(UserStore);
//   name = this.user.name;           // Signal<string>
//   rename() { this.user.setName('Grace'); }
```

For app-wide state, prefer the single-`AppStore`-plus-`Ops` shape above over
growing one service per domain.

### Alternative (rare): factory + `InjectionToken`

Factory-plus-`InjectionToken` is the older recipe. It's still valid for
narrow cases (e.g. a tree whose construction depends on runtime providers
you don't want to re-express as constructor-injected deps), but the shared
service above is shorter, gives you DI-friendly mocking via
`TestBed.overrideProvider(UserStore, ...)`, and doesn't require a separate
token declaration.

```ts
import { InjectionToken } from '@angular/core';
import { signalTree } from '@signaltree/core';

interface UserState {
  name: string;
  email: string;
}

export const USER_TREE = new InjectionToken<ReturnType<typeof createUserTree>>('UserTree');

export function createUserTree() {
  const tree = signalTree<UserState>({ name: '', email: '' });

  return {
    name: tree.$.name,
    email: tree.$.email,
    setName: (v: string) => tree.$.name.set(v),
  };
}

export function provideUserTree() {
  return { provide: USER_TREE, useFactory: createUserTree };
}
```

## Reading in templates

The `$` proxy exposes signals, so Angular templates consume them directly.

```html
<!-- Read a leaf -->
<span>{{ tree.$.user.name() }}</span>

<!-- Two-way binding -->
<input [(ngModel)]="tree.$.fields.username" />

<!-- One-way binding -->
<input [value]="tree.$.fields.email()" />

<!-- Conditionals and loops use the same signal reads -->
@if (tree.$.load.loading()) {
<spinner />
} @for (user of tree.$.users.all(); track user.id) {
<user-row [user]="user" />
}
```

## Computed values

Use Angular's `computed()` for derived state. Read tree signals inside the callback just like any other signal.

```ts
import { Component, computed } from '@angular/core';
import { signalTree } from '@signaltree/core';

interface CartItem {
  price: number;
  qty: number;
}

@Component({ selector: 'app-cart', template: '' })
export class CartComponent {
  readonly tree = signalTree({
    items: [] as CartItem[],
    taxRate: 0.08,
  });

  readonly subtotal = computed(() => this.tree.$.items().reduce((s, i) => s + i.price * i.qty, 0));

  readonly total = computed(() => this.subtotal() * (1 + this.tree.$.taxRate()));
}
```

Reach for plain Angular `computed()` whenever a derivation recomputes more than you'd like — it caches by reference and short-circuits identical inputs. SignalTree no longer ships a `memoization()` enhancer (removed in 9.0.1); for deep- or shallow-equality keying, write the comparison inside your own `computed()`.

## Effects

Use `effect()` for side effects that should react to tree changes — analytics, logging, localStorage beyond what `persistence()` covers, or imperative integrations.

```ts
import { Component, effect } from '@angular/core';
import { signalTree } from '@signaltree/core';

@Component({ selector: 'app-log', template: '' })
export class LogComponent {
  readonly tree = signalTree({ count: 0 });

  constructor() {
    effect(() => {
      const n = this.tree.$.count();
      console.log('count changed:', n);
    });
  }
}
```

Never call `.set()`, `.update()`, or any tree mutation inside `computed()`. Writes belong in `effect()` or an imperative handler.

### RxJS interop

Angular's `toObservable` / `toSignal` bridge works with tree signals exactly
like any other signal — no adapter needed.

```ts
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';
import { signalTree } from '@signaltree/core';

@Component({ selector: 'app-rx-bridge', template: '' })
export class RxBridgeComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly tree = signalTree({ query: '', count: 0 });

  // Signal → Observable
  readonly query$: Observable<string> = toObservable(this.tree.$.query);

  constructor() {
    // Observable → tree (write on next).
    this.query$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => this.tree.$.count.set(q.length));
  }
}
```

## Bulk updates via `.update()`

For list mutations, build the new array immutably and pass it to `.update()`.

```ts
interface Todo {
  id: number;
  text: string;
  done: boolean;
}

const tree = signalTree({ todos: [] as Todo[] });

// append
tree.$.todos.update((ts) => [...ts, { id: 3, text: 'ship it', done: false }]);

// toggle by id
tree.$.todos.update((ts) => ts.map((t) => (t.id === 3 ? { ...t, done: !t.done } : t)));

// remove
tree.$.todos.update((ts) => ts.filter((t) => t.id !== 3));
```

If mutations are hot, switch the list to `entityMap<Todo, number>()` for O(1) CRUD — see [`core.md`](core.md).

## `entityMap` CRUD

```ts
import { signalTree, entityMap } from '@signaltree/core';

interface User {
  id: number;
  name: string;
  active: boolean;
}

const store = signalTree({ users: entityMap<User, number>() });

store.$.users.setAll([
  { id: 1, name: 'Ada', active: true },
  { id: 2, name: 'Grace', active: false },
]);
store.$.users.addOne({ id: 3, name: 'Hedy', active: true });
store.$.users.upsertOne({ id: 1, name: 'Ada L.', active: true });
store.$.users.removeOne(2);

const all = store.$.users.all(); // User[]
const adaNode = store.$.users.byId(1); // EntityNode<User> | undefined — invoke: adaNode?.()
const ada = adaSig ? adaSig() : null;
```

## Separate-file derived with `derivedFrom`

When a derived block doesn't belong inline in the component, declare it in a sibling file and keep full type inference:

```ts
// derived.ts
import { derivedFrom, type SignalTree } from '@signaltree/core';

interface AppState {
  counter: number;
}
type AppTree = SignalTree<AppState>;

export const appDerived = derivedFrom<AppTree>()(($) => ({
  doubled: $.counter() * 2,
}));
```

Consume it by passing it as the second argument to `signalTree()`:

```ts skip
// store.ts — conceptual shape (skipped by the skill lint because the
// current public types erase TDerived in the overload return type, so
// `tree.$.doubled` is not surfaced on the builder even though it works
// at runtime).
import { signalTree } from '@signaltree/core';
import { appDerived } from './derived';

export const tree = signalTree({ counter: 0 }, appDerived);
tree.$.counter(); // number
tree.$.doubled(); // number (from derived, available at runtime)
```

Prefer Angular's `computed()` inline (declared next to the component field
that uses it) for small derivations. Reach for `derivedFrom` when the
derivation set lives in its own file; use it alongside `computed()` inside
the factory rather than relying on the `signalTree(initial, factory)`
overload to expose typed derived props.

## Composing enhancers: a production-shaped tree

```ts
import { signalTree, batching, devTools, persistence } from '@signaltree/core';

interface AppState {
  user: { name: string; email: string };
  ui: { theme: 'light' | 'dark'; sidebarOpen: boolean };
}

export const appTree = signalTree<AppState>({
  user: { name: '', email: '' },
  ui: { theme: 'light', sidebarOpen: false },
})
  .with(batching({ enabled: true, notificationDelayMs: 0 }))
  .with(devTools({ treeName: 'AppTree' }))
  .with(
    persistence({
      key: 'app.v1',
      autoSave: true,
      autoLoad: true,
      debounceMs: 300,
    })
  );
```

## Exposing a read-only API

If your tree lives inside a service factory, use a TypeScript interface to expose `Signal<T>` (read-only) to consumers while the implementation keeps the underlying `WritableSignal<T>`.

```ts
import { Signal } from '@angular/core';
import { signalTree } from '@signaltree/core';

export interface CounterApi {
  readonly count: Signal<number>;
  inc(): void;
  reset(): void;
}

export function createCounter(): CounterApi {
  const tree = signalTree({ count: 0 });
  return {
    count: tree.$.count,
    inc: () => tree.$.count.update((n) => n + 1),
    reset: () => tree.$.count.set(0),
  };
}
```

Consumers get read-only signals; only the factory can mutate.

## Porting reusable store features (`createEnhancer`)

Reusable cross-cutting behavior — dismissable banners, toast queues, optimistic
locking, you name it — lives in an **enhancer** rather than in a mixin or a
base class. `createEnhancer` attaches metadata (for dependency ordering and
DevTools) and types the surface the enhancer adds to the tree.

```ts
import { signalTree } from '@signaltree/core';
import { createEnhancer } from '@signaltree/core/authoring';

// The extra surface this enhancer adds to the tree.
interface BannerApi {
  dismissBanner: () => void;
}

export const withDismissableBanner = createEnhancer<BannerApi>(
  {
    name: 'dismissable-banner',
    provides: ['banner'],
    // requires: ['batching'],   // optional — forces ordering
  },
  (tree) => {
    const enhanced = tree as typeof tree & BannerApi;
    // The enhancer is applied to a tree that owns a `banner.visible` leaf.
    const banner = (
      tree.$ as unknown as {
        banner: { visible: { set: (v: boolean) => void } };
      }
    ).banner;
    enhanced.dismissBanner = () => banner.visible.set(false);
    return enhanced;
  }
);

// `createEnhancer` is typed against `ISignalTree<any>`, so cast at the call
// site to bind it to your concrete tree shape while preserving the `BannerApi`
// surface the enhancer adds.
import type { ISignalTree } from '@signaltree/core';

type BannerState = { banner: { visible: boolean } };
const appTree = signalTree<BannerState>({ banner: { visible: true } }).with(withDismissableBanner as unknown as (tree: ISignalTree<BannerState>) => ISignalTree<BannerState> & BannerApi);

appTree.$.banner.visible(); // true
appTree.dismissBanner(); // available on the builder
appTree.$.banner.visible(); // false
```

For authoring larger enhancers (custom markers, scheduler hooks, async
middleware), see [`../../guides/custom-markers-enhancers.md`](../../guides/custom-markers-enhancers.md).

## Porting `signalStoreFeature` patterns

`@ngrx/signals`' `signalStoreFeature` is used for two distinct jobs in practice.
SignalTree has a dedicated answer for each:

| What the feature does                                                                                                 | SignalTree equivalent                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Adds reusable **state shape + reactive behaviour** to a slice (`withLoadingState`, `withSavingState`, `withEntities`) | **Built-in or custom marker** — the behaviour lives in the tree itself |
| Adds **cross-cutting tree-level behaviour** needing DI (`withErrorBanners`, `withTelemetryBaggage`)                   | `createEnhancer` (see above)                                           |
| **Side-effects on init** (subscriptions, `effect()`)                                                                  | Constructor body of the Ops class                                      |

### Built-in markers replace `withLoadingState` and `withEntities`

`withLoadingState` adds loading/error state to a store. SignalTree's `status()`
marker does the same job — declare it once in the state shape and the reactive
methods appear on that node automatically:

```ts
import { entityMap, signalTree, status } from '@signaltree/core';

interface Ticket {
  id: number;
  title: string;
}

const tree = signalTree({
  tickets: {
    entities: entityMap<Ticket>(), // replaces withEntities
    loading: status(), // replaces withLoadingState
  },
});

// status() attaches setters, boolean readers, and raw state/error to the node:
tree.$.tickets.loading.setLoading();
tree.$.tickets.loading.setLoaded();
tree.$.tickets.loading.setError(new Error('network failure'));
tree.$.tickets.loading.setNotLoaded(); // reset to initial state

// Boolean signals — v10.3 canonical (bare names). Prefer these over .state() string comparisons.
tree.$.tickets.loading.loading();   // boolean
tree.$.tickets.loading.loaded();    // boolean
tree.$.tickets.loading.hasError();  // boolean
tree.$.tickets.loading.notLoaded(); // boolean
// (The is-prefix aliases .isLoading/.isLoaded/.isError/.isNotLoaded were removed in v11.)

const err = tree.$.tickets.loading.error(); // Error | null

// If you must compare raw state, import and use the LoadingState enum:
// import { LoadingState } from '@signaltree/core';
// tree.$.tickets.loading.state() === LoadingState.Loading  ✓
// tree.$.tickets.loading.state() === 'loading'             ✗ TypeScript error

// entityMap() attaches upsertOne / setAll / removeOne / byId / all / clear:
tree.$.tickets.entities.setAll([{ id: 1, title: 'Haul A' }], { selectId: (t) => t.id });
const all = tree.$.tickets.entities.all(); // Signal<Ticket[]>
```

Use `status()` anywhere you previously reached for `withLoadingState` or a
hand-rolled `{ loading, error }` slice. The marker is reusable across every
domain in the tree — declare it in each domain's state factory, not once globally.

#### When NOT to use `status()`

`status()` is opinionated about two things: (1) the loading-state values it stores (its own internal enum string values such as `'LOADED'`), and (2) the error channel — `setError(error)` is a single slot that callers typically end up stringifying.

Reach for a plain slice instead when **either** is true:

- **Your codebase already has a `LoadingState` enum** with different string values (e.g. `'Loaded'` vs `status()`'s `'LOADED'`). Importing both names invites a silent runtime mismatch that only fails in tests that compare on `state()`.
- **Your codebase has a rich error model** (e.g. a `NotifyErrorModel` with `message`, `errorMessage`, `correlationId`, etc.) and you need to round-trip the full object, not a stringified copy.

In either case, write a tiny slice factory that returns the exact types your codebase already uses:

```ts skip
// loading-slice.ts
import { LoadingState, NotifyErrorModel, Nullable } from '@models';

export function loadingSlice() {
  return {
    state: LoadingState.NotLoaded as LoadingState,
    error: null as Nullable<NotifyErrorModel>,
  };
}
```

Then consume it like any other slice — `tree.$.tickets.loading.state()`, `tree.$.tickets.loading.state.set(LoadingState.Loading)`, `tree.$.tickets.loading.error.set(captureError(err))`. You lose the `setLoading()` / `loaded()` ergonomic methods, but you keep your existing enum and error type — usually the right trade in established codebases.

### Custom markers for novel reusable state behaviour

When no built-in marker fits your need — e.g. a `savingState()` marker that
tracks optimistic writes, or a `pagination()` marker that manages page/pageSize —
author a **custom marker** with `registerMarkerProcessor`. The marker attaches
reactive methods to any node it is applied to, exactly like `status()` or
`entityMap()`.

```ts skip
// saving-state.marker.ts
import { registerMarkerProcessor } from '@signaltree/core/authoring';
import { signal, computed } from '@angular/core';

export const savingState = () => Symbol('savingState');

registerMarkerProcessor(savingState, (_initialValue, node) => {
  const _isSaving = signal(false);
  const _isSaved = signal(false);

  Object.assign(node, {
    isSaving: computed(() => _isSaving()),
    isSaved: computed(() => _isSaved()),
    setSaving: () => {
      _isSaving.set(true);
      _isSaved.set(false);
    },
    setSaved: () => {
      _isSaving.set(false);
      _isSaved.set(true);
    },
    resetSave: () => {
      _isSaving.set(false);
      _isSaved.set(false);
    },
  });
});

// Usage in state factory:
// { ticket: { data: null, saving: savingState() } }
// → tree.$.ticket.saving.setSaving() / .setSaved() / .isSaving() etc.
```

> `registerMarkerProcessor` must be called **before** any `signalTree()` call
> that uses the marker. Call it once at module load time.

The `ts skip` fence above is intentional — the `registerMarkerProcessor` callback
signature is low-level; verify the exact API against the core package types before
shipping a custom marker.

## Replacing `rxMethod` (from `@ngrx/signals`)

`@ngrx/signals` ships `rxMethod` to wire a method to an internally-owned
subscription. **SignalTree does not ship a `rxMethod` primitive** — the
SignalTree-native answer is to put async behavior at the tree path it
describes. Map NgRx `rxMethod` to one of these two options:

### 1. `asyncSource` / `asyncQuery` markers (canonical SignalTree pattern)

For the vast majority of cases — load-and-expose or input-driven query — the
markers eliminate the need for an Ops class subscription entirely. The marker
materializer wires up `data`/`loading`/`error`/`refresh` automatically.

```ts
import { signalTree, asyncSource, asyncQuery } from '@signaltree/core';

const store = signalTree({
  // ngrx style: rxMethod<void>(...) → load triggered by .loadUsers()
  // signaltree: asyncSource at the path the data lives at
  users: asyncSource<User[]>({
    initial: [],
    load: () => api.list$(),
  }),

  // ngrx style: rxMethod<string>(input$ => input$.pipe(debounceTime(300), switchMap(...)))
  // signaltree: asyncQuery — debounce + dedup + switchMap built in
  search: asyncQuery<string, User[]>({
    initialResult: [],
    debounce: 300,
    filter: (q) => q.length > 0,
    query: (q) => api.search$(q),
  }),
});

store.$.users.refresh();           // load-and-expose
store.$.search.input.set('alice'); // drives debounced pipeline
```

See [`core.md` § asyncSource](core.md#asyncsourcetconfig) and [§ asyncQuery](core.md#asyncquerytinput-tresultconfig) for full API.

### 2. Plain Observable in an Ops class

When neither marker fits — e.g., complex multi-step orchestration where the
caller needs explicit subscription control — write an Ops method that returns
`Observable<void>`. Two sub-flavors based on who owns the subscription:

#### 2a. Store-owned subscription (fire-and-forget effect)

When the Ops class should drive the subscription itself — e.g. a reactive
debounced search that should run as long as the app is alive — subscribe
inside the constructor using `takeUntilDestroyed(inject(DestroyRef))`:

```ts
import { inject, Injectable, DestroyRef, InjectionToken } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { debounceTime, switchMap, tap } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import { signalTree } from '@signaltree/core';

interface AppState {
  search: { query: string; results: string[] };
}
declare const APP_TREE: InjectionToken<ReturnType<typeof signalTree<AppState>>>;
interface SearchApi {
  query$(q: string): Observable<string[]>;
}
declare const SEARCH_API: InjectionToken<SearchApi>;

@Injectable({ providedIn: 'root' })
export class SearchOps {
  private readonly _tree = inject(APP_TREE);
  private readonly _$ = this._tree.$;
  private readonly _api = inject(SEARCH_API);

  constructor() {
    toObservable(this._$.search.query)
      .pipe(
        debounceTime(250),
        switchMap((q) => this._api.query$(q)),
        tap((results) => this._$.search.results.set(results)),
        takeUntilDestroyed(inject(DestroyRef))
      )
      .subscribe();
  }
}
```

#### 2b. Caller-owned observable return

When callers should decide when/whether to subscribe (HTTP loads, one-shot
actions with router-level cancellation), return an `Observable`:

```ts
import { inject, Injectable, InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { signalTree, entityMap } from '@signaltree/core';

interface Ticket {
  id: number;
  title: string;
}
interface AppState {
  tickets: {
    entities: ReturnType<typeof entityMap<Ticket, number>>;
  };
}
declare const APP_TREE: InjectionToken<ReturnType<typeof signalTree<AppState>>>;
interface TicketApi {
  list$(): Observable<Ticket[]>;
}
declare const TICKET_API: InjectionToken<TicketApi>;

@Injectable({ providedIn: 'root' })
export class TicketOps {
  private readonly _tree = inject(APP_TREE);
  private readonly _api = inject(TICKET_API);

  load$(): Observable<void> {
    return this._api.list$().pipe(
      tap((items) =>
        this._tree.$.tickets.entities.setAll(items, {
          selectId: (t) => t.id,
        })
      ),
      map(() => void 0)
    );
  }
}

// Component:
//   load() { this.store.ops.tickets.load$().subscribe(); }
```

Rule of thumb: if the consumer cares about completion or cancellation, return
`Observable<T>`. Otherwise, own the subscription in the Ops class with
`takeUntilDestroyed`.

## Where does `.with(enhancer)` go in a class wrapper?

Two placement choices, driven by whether the enhancer config is static or
sourced from DI.

- **Static config → field initializer.** Simpler, narrower type, and the tree
  is ready before the constructor body runs.

  ```ts
  import { Injectable } from '@angular/core';
  import { signalTree, batching } from '@signaltree/core';

  @Injectable({ providedIn: 'root' })
  export class UiStore {
    // All config known at class-declaration time → field initializer.
    private readonly _tree = signalTree({ theme: 'light' as const }).with(batching());

    readonly theme = this._tree.$.theme;
  }
  ```

- **DI-sourced config → constructor body.** Use this when the enhancer config
  depends on an `inject()`ed value (a storage adapter, a feature-flag signal, a
  logger).

  ```ts
  import { inject, Injectable, InjectionToken } from '@angular/core';
  import { signalTree, persistence } from '@signaltree/core';

  interface AppConfig {
    storageKey: string;
  }
  const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

  @Injectable({ providedIn: 'root' })
  export class PrefsStore {
    private readonly _cfg = inject(APP_CONFIG);
    // Declare without enhancers, then attach in the constructor so we can
    // reach injected dependencies.
    private readonly _tree = signalTree({ theme: 'light' as const });

    readonly theme = this._tree.$.theme;

    constructor() {
      this._tree.with(
        persistence({
          key: this._cfg.storageKey,
          autoSave: true,
          autoLoad: true,
        })
      );
    }
  }
  ```

Keep the field-initializer form whenever you can — less ceremony, fewer places
for ordering bugs.
