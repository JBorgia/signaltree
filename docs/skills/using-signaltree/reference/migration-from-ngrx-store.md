---
name: signaltree-migration-from-ngrx-store
description: One-to-one mapping guide for porting a classic @ngrx/store codebase (createAction/createReducer/createSelector/createEffect, @ngrx/entity, StoreModule/provideStore) to SignalTree. Load this when the user is converting code that uses the @ngrx/store package family — actions, reducers, selectors, effects, feature state, entity adapters. Do NOT load for @ngrx/signals (signalStore/withState/rxMethod) — that is a different package with its own guide (migration-from-ngrx-signals.md).
---

# Migrating from classic `@ngrx/store` to SignalTree

Quick reference for converting an existing **classic Redux-style NgRx** codebase — `@ngrx/store`, `@ngrx/effects`, `@ngrx/entity`, `@ngrx/store-devtools`, `@ngrx/router-store`. Applies to the `createAction` / `createReducer` / `createSelector` / `createEffect` architecture. **Not** for `@ngrx/signals` (`signalStore`, `withState`, `rxMethod`) — use [`migration-from-ngrx-signals.md`](./migration-from-ngrx-signals.md) for that, and **not** for `@ngrx/component-store` (its per-component `ComponentStore<T>` maps to a component-local `signalTree()`, see the note at the end).

Read the root [`SKILL.md`](../SKILL.md), [`reference/optimal-implementation.md`](./optimal-implementation.md), and [`reference/patterns.md`](./patterns.md) for full SignalTree context; use this file for the mechanical mappings.

> **This guide owns the classic-NgRx-specific mappings only.** The _target architecture_ — one `signalTree()` behind `APP_TREE`, an `AppStore` facade, per-domain `Ops` classes, `entityMap`/`status`/`stored` markers, derived tiers, and the migration Definition of Done — is identical to the Signal Store migration. Rather than duplicate it, this file links into [`migration-from-ngrx-signals.md`](./migration-from-ngrx-signals.md) for every shared section (App shape audit, Goal-state patterns #1–5, testing, DoD). Read both.

> **Driving multiple subagents through this migration?** Classic NgRx codebases are usually _larger_ than Signal Store ones (separate action/reducer/selector/effect files per feature multiply the file count). If the migration touches ≥ 2 feature reducers or ≥ 10 consumer files, read [`orchestrating-a-migration.md`](./orchestrating-a-migration.md) — its five-phase survey → audit → foundation → consumers → gate playbook explicitly covers classic `@ngrx/store` (adapt the Phase 1 greps to `createReducer(` / `createEffect(`).

## The one conceptual shift that drives every mapping

Classic NgRx is a **message bus**: a component dispatches an _action_, one or more _reducers_ compute new state from it, _selectors_ read that state back, and _effects_ listen for actions to run I/O and dispatch _more_ actions. Four moving parts, wired indirectly through a global action stream.

SignalTree deletes the bus. **A state change is just a method call that writes signals.** There is no action object, no `dispatch`, no `ofType`, no action-stream round-trip.

| Classic NgRx concept                                                 | Does it survive? | Becomes                                                                                                                    |
| -------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Action (`createAction`)                                              | ❌ deleted       | The _method name_ on an `Ops` class. `loadTickets` isn't an object you dispatch — it's `store.ops.tickets.loadTickets$()`. |
| Reducer (`createReducer`/`on`)                                       | ❌ deleted       | The _body_ of that `Ops` method — the signal writes it performs.                                                           |
| Selector (`createSelector`)                                          | ✅ transforms    | An Angular `computed()` (component-local) or a `.derived()` tier (shared).                                                 |
| Effect (`createEffect`)                                              | ✅ transforms    | An `asyncSource`/`asyncQuery` marker, or an `Ops` method returning `Observable<void>`.                                     |
| Action-stream round-trip (`load` → effect → `loadSuccess` → reducer) | ❌ deleted       | Collapses into **one** method: the effect-equivalent writes the result straight to the tree. No success/failure actions.   |

**The biggest single simplification:** the `load → loadSuccess → loadFailure` triad — one action to start, an effect to do the I/O, two more actions to report back, and reducer `on()` handlers for each — collapses into a single `Ops` method whose `tap()` writes the data and whose `catchError` writes the error. Three actions, one effect, and three reducer cases become **one method**. Expect the migrated code to be dramatically smaller; that is the point, not a mistake.

## Minimum viable migration (one small feature)

If the app has exactly one feature reducer with < 5 state fields and a handful of actions, skip every pattern below and do the direct swap:

```ts skip
// Before — counter.actions.ts + counter.reducer.ts + counter.selectors.ts
export const increment = createAction('[Counter] Increment');
export const setBy = createAction('[Counter] Set By', props<{ by: number }>());
export const counterReducer = createReducer(
  { count: 0 },
  on(increment, (s) => ({ ...s, count: s.count + 1 })),
  on(setBy, (s, { by }) => ({ ...s, count: s.count + by }))
);
export const selectCount = createSelector(selectCounter, (s) => s.count);
export const selectDouble = createSelector(selectCount, (c) => c * 2);

// After — @signaltree/core, one file
import { signalTree, defineStore } from '@signaltree/core';
import { computed } from '@angular/core';

export const CounterStore = defineStore(() => signalTree({ count: 0 }).derived(($) => ({ double: computed(() => $.count() * 2) })), { providedIn: 'root' });
// dispatch(increment())      → store.$.count.update((n) => n + 1)
// dispatch(setBy({ by: 5 })) → store.$.count.update((n) => n + 5)
// store.select(selectCount)  → store.$.count()
// store.select(selectDouble) → store.$.double()
```

`inject(CounterStore)` resolves to the real tree; its `destroy()` is wired to the injector's `DestroyRef`. For anything larger than one feature, use the full `AppStore` + `Ops` shape below.

## Before you pick patterns: run the shared App shape audit

The goal-state architecture (entity collections, root `selected` slice, typed error siblings, derived tiers, cross-domain orchestration) is **identical** to the Signal Store migration and **conditional** on the same four questions. Do not re-derive it here — go run it:

➡️ **[App shape audit](./migration-from-ngrx-signals.md#app-shape-audit-run-before-picking-patterns)** and **[Goal-state architectural patterns #1–5](./migration-from-ngrx-signals.md#goal-state-architectural-patterns)**.

Then come back for the classic-NgRx mechanical mappings. One classic-NgRx-specific mapping into that audit: a `createEntityAdapter<T>()` feature is _always_ a collection domain (audit Q1 = collection) → Pattern #1 (`entityMap` + root `selected`) applies by default.

## Default: big-bang migration

Same default and rationale as the [Signal Store big-bang flow](./migration-from-ngrx-signals.md#default-big-bang-migration) — one PR: stand up the tree, migrate every consumer, delete every legacy file, drop the packages, verify. The classic-NgRx specifics for each step:

0. **Orient.** Same orientation questions (source root, owning `package.json`, build/test/lint commands, monorepo?). Additionally identify **which NgRx packages are in play** — `@ngrx/store` is mandatory; `@ngrx/effects`, `@ngrx/entity`, `@ngrx/store-devtools`, `@ngrx/router-store`, `@ngrx/component-store` are each optional and each removed separately in step 5.

1. **Discover every legacy file and consumer.** Classic NgRx has no single import anchor the way `signalStore(` is — the pieces live in separate files. Use this grep set:

   ```bash
   grep -rln "from '@ngrx/store'"   <app-src>/   # actions, reducers, selectors, Store consumers
   grep -rln "from '@ngrx/effects'" <app-src>/   # effect classes
   grep -rln "from '@ngrx/entity'"  <app-src>/   # entity adapters
   grep -rln 'createReducer('       <app-src>/   # reducer files → delete
   grep -rln 'createEffect('        <app-src>/   # effect files → delete
   grep -rln 'createSelector('      <app-src>/   # selector files → delete or fold into derived
   grep -rln 'createAction\|createActionGroup' <app-src>/   # action files → delete
   grep -rln 'inject(Store)\|Store<' <app-src>/  # every component/guard/resolver that reads or dispatches
   ```

   The `inject(Store)` / `Store<…>` list is your **consumer** scope (rewrite these). The `createReducer` / `createEffect` / `createSelector` / `createAction` lists are the files you will **delete**.

2. Stand up the new shape — `AppStore` + `APP_TREE` + per-domain `Ops` + `app-tree.testing.ts` — exactly as in the [Signal Store guide](./migration-from-ngrx-signals.md#critical-one-tree-for-all-domains). **One tree for all features.** Each NgRx _feature slice_ (`StoreModule.forFeature('tickets', …)`) becomes a **domain slice** in the single tree, not its own tree.

3. Migrate **every** `inject(Store)` consumer to `inject(AppStore)` (mapping table below).

4. **`rm` every action / reducer / selector / effect file in the same commit**, plus their `*.spec.ts` siblings and any barrel/index that re-exports them. A feature typically has `foo.actions.ts`, `foo.reducer.ts`, `foo.selectors.ts`, `foo.effects.ts`, `foo.state.ts`, and an `index.ts` — all go.

5. Remove the NgRx packages from `package.json` — `@ngrx/store`, and whichever of `@ngrx/effects`, `@ngrx/entity`, `@ngrx/store-devtools`, `@ngrx/router-store` were in use. Update the lockfile.

6. **Verify** with [`scripts/verify-signaltree-migration.sh`](../../../../scripts/verify-signaltree-migration.sh), passing each NgRx package via repeatable `--package` flags (the script defaults to `@ngrx/signals`, which is the _wrong_ package here — you must override):

   ```bash
   scripts/verify-signaltree-migration.sh \
     --src   <app-src> \
     --build "<your build command>" \
     --test  "<your test command>" \
     --lint  "<your lint command>" \
     --package-json <path-to-package.json> \
     --package @ngrx/store \
     --package @ngrx/effects \
     --package @ngrx/entity \
     --package @ngrx/store-devtools
   ```

   The script's source-import grep and `package.json` parse both key off the `--package` values, so listing every NgRx package you're removing makes the gate assert they're all gone. Non-zero exit means not done — do not commit, do not declare success. The `--allow-source-presence` / `--allow-dep-presence` flags work the same as in the Signal Store guide for [incremental](#incremental-per-feature-migration) and monorepo cases.

   **If the script is unavailable**, the manual equivalent:

   ```bash
   grep -rln "from '@ngrx/store'"   <app-src>/   # must be empty
   grep -rln "from '@ngrx/effects'" <app-src>/   # must be empty
   grep -rln 'createReducer(\|createEffect(\|createSelector(' <app-src>/  # must be empty
   node -e "const p=require('./package.json');
            ['dependencies','peerDependencies'].forEach(k =>
              ['@ngrx/store','@ngrx/effects','@ngrx/entity','@ngrx/store-devtools'].forEach(pkg =>
                console.assert(!p[k]?.[pkg], pkg+' still in '+k)));"
   # then your build / test / lint commands
   ```

## Concept map

The headline reference. Left column is what you'll `grep` for; right column is what it becomes.

### Actions & dispatch

| classic `@ngrx/store`                                 | SignalTree equivalent                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createAction('[X] Foo')`                             | Deleted. Becomes a **method name** on an `Ops` class.                                                                                                                                                                                                    |
| `createAction('[X] Foo', props<{ id: number }>())`    | Deleted. Becomes a **method parameter**: `fooOps.foo(id: number)`.                                                                                                                                                                                       |
| `createActionGroup({ source, events })`               | Deleted. Each event becomes one method on the feature's `Ops` class.                                                                                                                                                                                     |
| `store.dispatch(foo())`                               | `store.ops.<domain>.foo()`                                                                                                                                                                                                                               |
| `store.dispatch(foo({ id }))`                         | `store.ops.<domain>.foo(id)`                                                                                                                                                                                                                             |
| One action handled by **multiple** reducers (fan-out) | **One** method that performs all the writes — on the domain `Ops` if same-domain, or an [orchestration `Ops`/`AppStore` method](./migration-from-ngrx-signals.md#3-cross-domain-orchestration--dedicated-purposeops-not-domain-ops) if it spans domains. |
| `load` → effect → `loadSuccess` → reducer round-trip  | **One** `Ops` method (or `asyncSource` marker) — the I/O and the write live together; no success/failure actions.                                                                                                                                        |

### Reducers → writes

| classic `@ngrx/store`                                          | SignalTree equivalent                                                                                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createReducer(initialState, on(...) …)`                       | The `initialState` object → a domain **state factory** (`tree/state/<domain>.state.ts`); the `on()` handlers → the write logic inside `Ops` methods.                                     |
| `on(setName, (s, { name }) => ({ ...s, name }))`               | `this._$.name.set(name)` (single leaf)                                                                                                                                                   |
| `on(patch, (s, { a, b }) => ({ ...s, a, b }))`                 | `this._$.domain({ a, b })` — branch call = deep-merge partial write                                                                                                                      |
| `on(reset, () => initialState)`                                | `this._$.domain(() => initialDomainState())` — call the branch with an updater returning fresh state                                                                                     |
| Nested immutable spread `{ ...s, nested: { ...s.nested, x } }` | `this._$.domain.nested({ x })` — path-targeted partial write, no manual spreading                                                                                                        |
| `ActionReducerMap` / `combineReducers`                         | The single `createBaseState()` object composing every domain factory.                                                                                                                    |
| `MetaReducer` (localStorage sync)                              | `stored(key, default)` markers (see [Pattern #4](./migration-from-ngrx-signals.md#4-persisted-state--stored-slices-not-constructor-localstorage-reads)) or the `persistence()` enhancer. |
| `MetaReducer` (logging / devtools)                             | `devTools({ treeName })` enhancer.                                                                                                                                                       |

### Selectors → reads & derived

| classic `@ngrx/store`                                       | SignalTree equivalent                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createFeatureSelector<FooState>('foo')`                    | The domain slice itself: `tree.$.foo`. No registration.                                                                                                                                                                                                  |
| `createSelector(selectFoo, (s) => s.bar)`                   | `tree.$.foo.bar()` — read the signal directly.                                                                                                                                                                                                           |
| `createSelector(selectA, selectB, (a, b) => …)` (projector) | The projector body becomes a `computed()`; if reused across ≥ 2 consumers, a [`.derived()` tier](./migration-from-ngrx-signals.md#2-materialize-derivations-inside-the-tree-with-externalderived--derived); if consumer-local, a component `computed()`. |
| Selector composed of other selectors                        | A **derived tier** that reads an earlier tier (`$.<earlierTier>.…`). Tiering rule and ladder are in [Pattern #2](./migration-from-ngrx-signals.md#2-materialize-derivations-inside-the-tree-with-externalderived--derived).                              |
| `store.select(selectFoo)` (returns `Observable`)            | `tree.$.foo` is a `Signal` — read `tree.$.foo()` in templates/`computed()`. Need an `Observable`? `toObservable(tree.$.foo)`.                                                                                                                            |
| `store.selectSignal(selectFoo)` (NgRx 16+)                  | `tree.$.foo` — already a signal; drop the wrapper.                                                                                                                                                                                                       |
| Selector memoization (automatic in NgRx)                    | Angular `computed()` already memoizes by reference — no `memoization` enhancer (removed in 9.0.1).                                                                                                                                                       |
| Parameterized selector `(id) => createSelector(...)`        | A method on the entity map — `tree.$.items.byId(id)` — or a `computed()` closing over a param signal.                                                                                                                                                    |

### Effects → async

| classic `@ngrx/store`                                                                                                                     | SignalTree equivalent                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createEffect(() => actions$.pipe(ofType(load), switchMap(() => api.load$().pipe(map(loadSuccess), catchError(() => of(loadFailure))))))` | **Preferred:** an [`asyncSource`](./migration-from-ngrx-signals.md#option-a--asyncsource--asyncquery-markers-canonical-preferred) marker at the path the data lives at. **Fallback:** an `Ops` method returning `Observable<void>` whose `tap()` writes the result and `catchError` writes the error. |
| Debounced search effect (`debounceTime` + `switchMap`)                                                                                    | `asyncQuery<Input, Result>({ debounce, query })` — drive via `.input.set(q)`.                                                                                                                                                                                                                         |
| `ofType(a, b, c)` (one effect, many triggers)                                                                                             | Not needed — each trigger is already a distinct method; factor shared logic into a private helper.                                                                                                                                                                                                    |
| Non-dispatching effect (`{ dispatch: false }` — e.g. navigate, toast)                                                                     | A plain `void` `Ops` method, or an `effect()` in the `Ops` constructor reacting to a leaf (see [`withFeature` mapping](./migration-from-ngrx-signals.md#custom-feature-patterns-signalstorefeature)).                                                                                                 |
| `this.actions$` (the action stream)                                                                                                       | Deleted — there is no action stream.                                                                                                                                                                                                                                                                  |
| `@Effect()` decorator (legacy pre-8 syntax)                                                                                               | Same as `createEffect` — becomes an `asyncSource` marker or `Ops` method.                                                                                                                                                                                                                             |
| `EffectsModule.forRoot([])` / `provideEffects()`                                                                                          | Deleted — `Ops` are plain `@Injectable` services wired through `AppStore`.                                                                                                                                                                                                                            |

### `@ngrx/entity`

`createEntityAdapter` maps almost one-to-one onto the `entityMap<T, K>()` marker. Drop `EntityState`, `EntityAdapter`, and `adapter.getSelectors()` entirely.

| `@ngrx/entity`                                         | SignalTree `entityMap<T, K>()`                                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createEntityAdapter<Foo>({ selectId })`               | `entityMap<Foo, K>({ selectId })` in the domain state factory                                                                                                              |
| `createEntityAdapter({ sortComparer })`                | `entityMap<Foo, K>({ sortComparer })` (v10.5+ — keeps `all()`/`ids()` sorted)                                                                                              |
| `EntityState<Foo>` (`{ ids, entities }`)               | Just the `entityMap` slot — no explicit shape type needed                                                                                                                  |
| `adapter.getInitialState({ loading: false })`          | `{ items: entityMap<Foo, K>(), itemsLoad: status<string>() }`                                                                                                              |
| `adapter.addOne(e, s)`                                 | `tree.$.items.addOne(e)`                                                                                                                                                   |
| `adapter.setAll(es, s)`                                | `tree.$.items.setAll(es)`                                                                                                                                                  |
| `adapter.upsertOne(e, s)` / `upsertMany`               | `tree.$.items.upsertOne(e)`                                                                                                                                                |
| `adapter.updateOne({ id, changes }, s)`                | `tree.$.items.updateOne(id, changes)`                                                                                                                                      |
| `adapter.removeOne(id, s)`                             | `tree.$.items.removeOne(id)`                                                                                                                                               |
| `adapter.removeAll(s)`                                 | `tree.$.items.clear()`                                                                                                                                                     |
| `selectAll` (from `getSelectors()`)                    | `tree.$.items.all()`                                                                                                                                                       |
| `selectEntities` (the `Record`/dictionary)             | `tree.$.items.map()` → `Signal<ReadonlyMap<K, T>>`; `entities[id]` → `map().get(id)`                                                                                       |
| `selectIds`                                            | `tree.$.items.ids()`                                                                                                                                                       |
| `selectTotal`                                          | `tree.$.items.count()`                                                                                                                                                     |
| `selectEntities()[id]` (single lookup)                 | `tree.$.items.byId(id)?.()` — `byId(id)` returns a callable `EntityNode<T> \| undefined`; invoke to read                                                                   |
| "current entity" pattern (`currentId` + selector join) | [Pattern #1](./migration-from-ngrx-signals.md#1-currentx-xdto-ngrx-signal--entitymap--root-selectedid--derived-current): root `selected.<id>` scalar + a derived `current` |

### Module & provider wiring

| classic `@ngrx/store` bootstrap                                          | SignalTree                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StoreModule.forRoot(reducers)` / `provideStore(reducers)`               | `provideAppTree()` in `app.config.ts`                                                                                                                                                                       |
| `StoreModule.forFeature('foo', fooReducer)` / `provideState(fooFeature)` | Deleted — the `foo` slice is already in the single tree                                                                                                                                                     |
| `EffectsModule.forRoot([...])` / `provideEffects(...)`                   | Deleted — `Ops` services need no registration                                                                                                                                                               |
| `StoreDevtoolsModule.instrument()` / `provideStoreDevtools()`            | `.with(devTools({ treeName: 'AppStore' }))` on the tree                                                                                                                                                     |
| `@ngrx/router-store` (`provideRouterStore`, router selectors)            | **Not replaced by SignalTree** — keep it, or read router state via `inject(ActivatedRoute)` / `Router` events and mirror what you need into a tree slice. Decide per app; don't silently drop router state. |

## Worked example: a full feature (actions + reducer + selectors + effects + entity)

This is the canonical classic-NgRx feature — the exact shape that motivates the migration. Before: **five files**. After: **two** (`state` + `ops`), plus a derived tier if the `current` join is reused.

**Before — `tickets/` (NgRx):**

```ts skip
// tickets.actions.ts
export const loadTickets = createAction('[Tickets] Load');
export const loadTicketsSuccess = createAction('[Tickets] Load Success', props<{ tickets: Ticket[] }>());
export const loadTicketsFailure = createAction('[Tickets] Load Failure', props<{ error: string }>());
export const selectTicket = createAction('[Tickets] Select', props<{ id: number }>());
export const createTicket = createAction('[Tickets] Create', props<{ ticket: Ticket }>());

// tickets.reducer.ts
export const adapter = createEntityAdapter<Ticket>();
export interface TicketsState extends EntityState<Ticket> {
  selectedId: number | null;
  loading: boolean;
  error: string | null;
}
const initialState = adapter.getInitialState({ selectedId: null, loading: false, error: null });
export const ticketsReducer = createReducer(
  initialState,
  on(loadTickets, (s) => ({ ...s, loading: true, error: null })),
  on(loadTicketsSuccess, (s, { tickets }) => adapter.setAll(tickets, { ...s, loading: false })),
  on(loadTicketsFailure, (s, { error }) => ({ ...s, loading: false, error })),
  on(selectTicket, (s, { id }) => ({ ...s, selectedId: id })),
  on(createTicket, (s, { ticket }) => adapter.addOne(ticket, s))
);

// tickets.selectors.ts
export const selectTicketsState = createFeatureSelector<TicketsState>('tickets');
const { selectAll, selectEntities } = adapter.getSelectors();
export const selectAllTickets = createSelector(selectTicketsState, selectAll);
export const selectTicketsLoading = createSelector(selectTicketsState, (s) => s.loading);
export const selectSelectedId = createSelector(selectTicketsState, (s) => s.selectedId);
export const selectCurrentTicket = createSelector(selectTicketsState, selectEntities, selectSelectedId, (_, entities, id) => (id != null ? entities[id] ?? null : null));

// tickets.effects.ts
@Injectable()
export class TicketsEffects {
  private actions$ = inject(Actions);
  private api = inject(TicketApi);
  load$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadTickets),
      switchMap(() =>
        this.api.getAll().pipe(
          map((tickets) => loadTicketsSuccess({ tickets })),
          catchError((e) => of(loadTicketsFailure({ error: String(e) })))
        )
      )
    )
  );
}

// component
this.tickets$ = this.store.select(selectAllTickets);
this.current$ = this.store.select(selectCurrentTicket);
this.store.dispatch(loadTickets());
this.store.dispatch(selectTicket({ id }));
```

**After — SignalTree (`store/` foundation shared across all domains):**

```ts skip
// store/tree/state/tickets.state.ts — reducer initialState + entity adapter collapse here
import { entityMap, status } from '@signaltree/core';

export function ticketsState() {
  return {
    tickets: entityMap<Ticket, number>(),   // ← createEntityAdapter<Ticket>()
    ticketsLoad: status<string>(),           // ← loading + error flags
  };
}

// store/tree/state/selection.state.ts — root selection (Pattern #1); selectedId is cross-domain
export function selectionState() {
  return { ticketId: null as number | null };  // ← on(selectTicket) target
}

// store/tree/derived/tier-entity-resolution.derived.ts — selectCurrentTicket becomes a derived tier
import { computed } from '@angular/core';
import { derivedFrom } from '@signaltree/core';
import type { AppTreeBase } from '../app-tree';

export const entityResolutionDerived = derivedFrom<AppTreeBase>()(($) => ({
  tickets: {
    current: computed(() => {
      const id = $.selected.ticketId();
      return id != null ? $.tickets.tickets.byId(id)?.() ?? null : null;
    }),
  },
}));

// store/ops/tickets.ops.ts — actions + effects + reducer writes ALL collapse into methods
import { inject, Injectable } from '@angular/core';
import { catchError, EMPTY, map, tap, type Observable } from 'rxjs';
import { APP_TREE } from '../tree/app-tree';

@Injectable({ providedIn: 'root' })
export class TicketsOps {
  private readonly _$ = inject(APP_TREE).$.tickets;
  private readonly _selected = inject(APP_TREE).$.selected;
  private readonly _api = inject(TicketApi);

  // loadTickets + loadTicketsSuccess + loadTicketsFailure + the effect → ONE method
  loadTickets$(): Observable<void> {
    this._$.ticketsLoad.setLoading();
    return this._api.getAll().pipe(
      tap((tickets) => {
        this._$.tickets.setAll(tickets);
        this._$.ticketsLoad.setLoaded();
      }),
      map(() => void 0),
      catchError((e: unknown) => {
        this._$.ticketsLoad.setError(String(e));
        return EMPTY;
      })
    );
  }

  selectTicket(id: number): void { this._selected.ticketId.set(id); }   // ← on(selectTicket)
  createTicket(ticket: Ticket): void { this._$.tickets.addOne(ticket); } // ← on(createTicket)
}

// component — inject(AppStore), reads via $, writes via ops
private readonly _store = inject(AppStore);
readonly tickets = this._store.$.tickets.tickets.all;   // selectAllTickets — a Signal
readonly current = this._store.$.tickets.current;       // selectCurrentTicket — the derived tier
// ngOnInit / resolver:
this._store.ops.tickets.loadTickets$().subscribe();     // dispatch(loadTickets())
onSelect(id: number) { this._store.ops.tickets.selectTicket(id); } // dispatch(selectTicket({ id }))
```

Even leaner: `loadTickets$` is a textbook [`asyncSource`](./migration-from-ngrx-signals.md#option-a--asyncsource--asyncquery-markers-canonical-preferred) — `tickets: asyncSource<Ticket[]>({ initial: [], load: () => api.getAll() })` — which erases the manual `setLoading`/`tap`/`catchError` wiring entirely. Reach for the `Ops` `Observable` form only when the caller needs explicit subscription control or multi-step orchestration.

Five files (actions, reducer, selectors, effects, + the feature `index.ts`) → two, and the three-action load triad → one method. That reduction _is_ the migration's value; don't recreate the ceremony you just deleted.

## Incremental per-feature migration

Same shape as the Signal Store [incremental per-domain playbook](./migration-from-ngrx-signals.md#incremental-per-domain-migration) — one feature slice per PR, foundation-first Phase 0, `--allow-source-presence --allow-dep-presence` on the verifier until the last feature lands. The one classic-NgRx wrinkle: **`@ngrx/store`'s root `StoreModule.forRoot`/`provideStore` must stay wired until the last feature reducer is gone**, because feature reducers register against it. Remove `provideStore`/`provideEffects` and the packages only in the final PR, alongside dropping the `--allow-*` flags and widening `--src` to the full app.

A still-on-NgRx feature and a migrated SignalTree domain coexist fine: a component mid-transition can `inject(Store)` for the unmigrated slice and `inject(AppStore)` for the migrated one. Clean that up in the feature's own PR.

## Gotchas specific to classic NgRx

- **Don't recreate actions as an enum or a discriminated union.** The instinct to "keep the action names" as a `type` or a command object is the Redux habit fighting the design. The method name _is_ the action. If you genuinely need an audit log of state changes, that's what `devTools()` / `timeTravel()` give you — not a hand-rolled action bus.
- **One action, many reducers → decide domain ownership.** A classic action can be handled by reducers in several features (e.g. a `logout` action clearing five slices). That's a [cross-domain orchestration method](./migration-from-ngrx-signals.md#3-cross-domain-orchestration--dedicated-purposeops-not-domain-ops) — a `SessionOps.logout()` that calls each domain's clear — **not** five `Ops` each listening for something. There's nothing to listen to.
- **Effect that dispatches into another feature.** An effect whose success action is handled by a _different_ feature's reducer becomes a single method that writes both slices (or calls the other domain's `Ops`). The cross-feature indirection disappears.
- **`concatLatestFrom` / `withLatestFrom(store.select(...))` in effects** — the effect read some state to do its work. In the `Ops` method, just read the signal synchronously: `const id = this._selected.ticketId();`. No `withLatestFrom`.
- **Selector projector with runtime args** (`selectFooById(id)`) — becomes `entityMap.byId(id)` for entity lookups, or a factory `computed` closing over an input signal for computed joins. Don't rebuild the memoized-selector-factory pattern.
- **`Store` is generic over the whole app state** (`Store<AppState>`). Consumers that typed against `AppState` and reached into arbitrary slices should now go through `AppStore.$.<domain>` — narrower and typed per slice. Grep for `Store<` after migrating to catch leftover typings.
- **RxJS effects that never dispatch** (`{ dispatch: false }`) still need a home — a `void` `Ops` method the consumer calls, or an `effect()` in the `Ops` constructor if it should fire reactively on a state change. Don't drop them; map each one.
- **`@ngrx/router-store`** is out of SignalTree's scope — it's router state, not app state. Keep it or bridge it deliberately; the verifier won't flag it since you won't list it in `--package`.

## `@ngrx/component-store` note (different package)

`@ngrx/component-store` (`ComponentStore<T>`, `this.select`, `this.updater`, `this.effect`) is neither classic `@ngrx/store` nor `@ngrx/signals`. It's per-component local state — the SignalTree equivalent is a **component-local `signalTree()`** (the one documented exception to the one-tree rule; see [`SKILL.md`](../SKILL.md)), not the `AppStore`/`APP_TREE` foundation. `this.select` → `computed()`, `this.updater` → a component method calling `.set()`/`.update()`, `this.effect` → an `asyncSource`/`asyncQuery` marker or a component method returning `Observable<void>`. If a `ComponentStore` has outgrown its component and become app-wide, fold it into `APP_TREE` as a domain slice instead.

## Testing

Identical to the Signal Store migration — every `TestBed` that touches `AppStore` needs `provideAppTreeForTesting()`, and specs that seeded NgRx state must seed the tree directly. See [Test bed must provide `APP_TREE`](./migration-from-ngrx-signals.md#test-bed-must-provide-app_tree) and [`reference/testing.md`](./testing.md).

Classic-NgRx-specific spec rewrites:

- **`provideMockStore({ initialState })`** → `provideAppTreeForTesting((s) => ({ ...s, ...seed }))`.
- **`store.overrideSelector(selectFoo, value)`** → seed the underlying tree state so the derived value computes, or (rarely) mock the `Ops`; do **not** mock the derived signal. Seed the source, read the real derivation.
- **`provideMockActions(actions$)` + effect marble tests** → gone. Test the `Ops` method directly: call it, subscribe, assert the tree state changed and `status()` transitioned. No `Actions` stream to mock.
- **Dispatching in a test** (`store.dispatch(foo())` then asserting selector output) → call `store.ops.<domain>.foo()`, then read `store.$.<domain>.<field>()`.

## Definition of done

Same gates as the [Signal Store DoD](./migration-from-ngrx-signals.md#definition-of-done) and the [architectural self-check](./migration-from-ngrx-signals.md#architectural-self-check-run-on-your-own-diff-before-declaring-done), with the package list adjusted:

- `grep -rln "from '@ngrx/store'" <app-src>/` returns nothing (repeat for `@ngrx/effects`, `@ngrx/entity` if used).
- `grep -rln 'createReducer(\|createEffect(\|createSelector(\|createAction' <app-src>/` returns nothing.
- Every NgRx package you set out to remove is gone from `package.json` (or tracked for removal if a shared lib elsewhere still uses it). `@ngrx/router-store`, if intentionally kept, is documented as a deliberate exception.
- Test suite green; lint clean; DevTools shows the tree under its `treeName`.

Run the [architectural self-check](./migration-from-ngrx-signals.md#architectural-self-check-run-on-your-own-diff-before-declaring-done) against your diff — selection placement, load+error siblings, derived tiers, orchestration boundary, `AppStore` injection style. Green build is necessary, not sufficient.
