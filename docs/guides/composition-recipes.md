# Composition recipes: patterns that need no new API

Three capabilities get asked for often enough that they look like missing features:
a standard enhancer policy, a reusable entity-CRUD Ops base, and a selection
read-model. All three are **compositions of primitives that already ship**, and
each is deliberately _not_ in `@signaltree/core`.

They live here because a recipe is the better answer when the composition is
short and the opinions are yours: it costs no API surface, it can't be
half-right for your app, and you can read the whole thing.

> **Provenance.** These are the resolved forms of findings A, B and C from
> [`docs/audits/2026-07/v3-consumer-reuse-audit.md`](../audits/2026-07/v3-consumer-reuse-audit.md),
> which came out of auditing a large real consumer (three apps, twelve admin
> domains). Every snippet below is the shape that consumer arrived at, with the
> corrections the audit produced.

---

## 1. A standard enhancer policy

**The need:** every app re-decides which enhancers to apply and whether to gate
`timeTravel()` out of production. Two apps in one repo will drift.

**The recipe** — one function in your shared lib:

```typescript
import { batching, devTools } from '@signaltree/core';
import type { Enhancer, SignalTreeBuilder, TreeNode } from '@signaltree/core';

export interface StandardEnhancerOptions {
  name: string;
  /** Extra enhancers the CALLER constructed — see the tree-shaking note. */
  extra?: Array<Enhancer<unknown>>;
}

export function withStandardEnhancers<T extends object>(tree: SignalTreeBuilder<T, TreeNode<T>>, { treeName, extra = [] }: StandardEnhancerOptions) {
  const base = tree.with(batching()).with(devTools({ name }));
  return extra.reduce((acc, enhancer) => acc.with(enhancer), base);
}
```

### The tree-shaking trap — read this before writing your own

The obvious version takes an `isProduction` boolean and gates `timeTravel()`
inside:

```typescript
// ✗ DON'T — timeTravel ships in every production bundle
return isProduction ? enhanced : enhanced.with(timeTravel());
```

That is a **static import behind a runtime check**, so the bundler cannot drop
`timeTravel` — your production build carries a deep-clone-per-write enhancer it
never uses. This is not hypothetical: it is the same mistake
[RFC 0005 §0](../rfcs/0005-entity-loader-composition.md) documents, where
`entity-map.ts` statically imported `attachLoader` and shipped the loader in
every `entityMap` bundle for a full version.

Gate it **structurally** instead — the caller imports `timeTravel` only where it
is wanted, so a production entry point never references it:

```typescript
// dev entry point
withStandardEnhancers(signalTree(state), {
  name: 'MyApp Dev',
  extra: [timeTravel()], // import lives in the dev-only file
});

// production entry point — no timeTravel import anywhere in this graph
withStandardEnhancers(signalTree(state), { name: 'MyApp' });
```

With Angular, `fileReplacements` in `angular.json` is the natural seam.

### Typing note

`.with()` returns `this & TAdded`. If your helper lives in a **library** and you
let TypeScript infer the return type, the emitted `.d.ts` will reference the
enhancer method interfaces — `BatchingMethods`, `DevToolsMethods`,
`TimeTravelMethods`, `OptimizedUpdateMethods`, `EffectsMethods`. All five are
exported from `@signaltree/core`, so this works; if you are on **< 13.2.0**,
`DevToolsMethods` and `OptimizedUpdateMethods` were missing from the barrel and
you would have had to annotate a narrower return type (losing `.batch()`/`.undo()`
for your callers). Upgrade rather than erase the type.

---

## 2. A reusable entity-CRUD Ops base

**The need:** N admin domains that all do list/create/update/delete against a
REST endpoint, with optimistic writes and rollback.

Most of this already ships. Before writing any of it, note what you get for free:

| Concern                                             | Already provided by                                      |
| --------------------------------------------------- | -------------------------------------------------------- |
| Normalized collection, O(1) `byId`                  | `entityMap()`                                            |
| Fetch + caching + `staleTime` + single-flight + SWR | `entityMap({ load: loader(fn) })`                        |
| Load status                                         | the loader surface: `loading()` / `loaded()` / `error()` |
| Save/submit lifecycle                               | `status<Err>()` + its predicates                         |
| Batch writes in one notification                    | `upsertMany` / `updateMany` / `removeMany`               |

What is **not** provided is the opinionated glue: your REST verb/URL conventions,
your error model, and the optimistic-rollback policy. That glue is what the
recipe is.

### State: one slice factory per domain

```typescript
import { entityMap, loader, status } from '@signaltree/core';

export function entityCrudState<T extends { id: string }>(api: ApiService, config: { name: string; endpoint: string; staleTime?: string }) {
  return {
    entities: entityMap<T, string>({
      selectId: (e) => e.id,
      load: loader(() => api.get$<T[]>(config.endpoint), {
        staleTime: config.staleTime ?? '5m',
        swr: true, // serve cached rows while revalidating
        lazy: true,
      }),
    }),
    save: status<AppError>(),
    selection: { selectedIds: [] as string[], isAdding: false },
  };
}
```

Note `load:` takes `loader(fn)`, not a raw function — a raw function is rejected
with `[ST2004]`. That branded-helper rule is what keeps the loader machinery
tree-shakeable for collections that don't load.

### Ops: an abstract base over a tree slice

The base operates on a **slice of your existing tree**, not its own store, so all
domains share one DevTools timeline and one time-travel buffer.

```typescript
export abstract class EntityCrudOps<T extends { id: string }> {
  protected abstract readonly slice: EntityCrudSlice<T>;
  protected abstract readonly config: EntityCrudConfig;
  private readonly api = inject(ApiService);

  // Reads proxy the slice — no copies, no sync.
  get entities() {
    return this.slice.entities.all;
  }
  get isSaving() {
    return this.slice.save.loading;
  }
  get saveError() {
    return this.slice.save.error;
  }

  update$(id: string, changes: Partial<T>): Observable<T | AppError> {
    const { entities, save } = this.slice;
    // SNAPSHOT FIRST — this is the rollback data.
    const previous = entities.byId(id)?.() ?? null;
    if (previous) entities.upsertOne({ ...previous, ...changes } as T);
    save.setLoading();

    return this.api.patch$<Partial<T>, T>(`${this.config.endpoint}/${id}`, changes).pipe(
      take(1),
      tap((saved) => {
        entities.upsertOne(saved);
        save.setLoaded();
      }),
      catchError((e) => {
        if (previous) entities.upsertOne(previous); // restore the snapshot
        const error = toAppError(e, `${this.config.name}.update`);
        save.setError(error);
        return of(error);
      })
    );
  }
}
```

A domain is then a few lines:

```typescript
@Injectable({ providedIn: 'root' })
export class PlantOps extends EntityCrudOps<Plant> {
  protected readonly slice = inject(APP_TREE).$.plant;
  protected readonly config = { name: 'PlantOps', endpoint: 'plant' } as const;
}
```

### Two things to get right

**Snapshot before you mutate.** Rollback needs the _previous value_, so capture
it first. `updateAndReport()` is not the tool here — it returns the changed
**paths** (for partial-payload sync, audit trails, targeted persistence), not the
prior values, so it cannot restore state on its own.

**Roll back the whole of what you touched.** If an operation clears selection,
snapshot the selection too and restore _that_, not the ids you were acting on:

```typescript
const previousSelection = selection.selectedIds(); // not `[id]`
```

Restoring `[id]` looks right and passes a single-selection test, then silently
drops the user's other selections whenever a delete fails with several rows
selected. This was a real bug found in review, and its test passed because it
selected exactly the row it deleted.

### Why this isn't in core

It has no independent runtime, so [RFC 0007 §1](../rfcs/0007-packaging-principle-and-ng-forms-reslice.md)
would place it in core as an injected feature rather than a package — but the
parts worth sharing are already shipped, and what's left is an `extend`-this base
class plus your REST conventions. A base class you inherit from is the ceremony
SignalTree defines itself against ("your state literal is the API"), so it stays
yours. If a future version does ship this, it will compose `loader()` through the
same branded-helper rule, not take a raw `load:` function.

---

## 3. A selection read-model

**The need:** `selectedIds` plus the derived reads every table UI wants.

`selectedIds` is app-owned writable state. The reads are four one-line
`computed`s, so they belong in `.derived()`:

```typescript
export function selectionDerived<T extends { id: string }>(slice: { entities: Pick<EntitySignal<T, string>, 'byId'>; selection: { selectedIds: Signal<string[]> } }) {
  return {
    selection: {
      selectedEntities: computed(() =>
        slice.selection
          .selectedIds()
          .map((id) => slice.entities.byId(id)?.() ?? null)
          .filter((x): x is T => x != null)
      ),
      isMultiEdit: computed(() => slice.selection.selectedIds().length > 1),
      hasSelections: computed(() => slice.selection.selectedIds().length > 0),
      selectionCount: computed(() => slice.selection.selectedIds().length),
    },
  };
}
```

Merge it per domain:

```typescript
signalTree(createBaseState(api)).derived(($) => ({
  plant: selectionDerived($.plant),
  driver: selectionDerived($.driver),
}));
```

**Why not an `entityMap().computed()` slice?** A slice's `compute` receives only
that collection's `E[]`, so it cannot read an external `selectedIds`. Selection
is inherently cross-state, which is exactly the boundary that makes it a derived
rather than a slice — see the
[entity-collection cookbook §2](entity-collection-cookbook.md).

### If your derived reads come back `undefined`

That has one overwhelmingly common cause: **two copies of `@angular/core`**. Each
copy has its own `Symbol(SIGNAL)`, so `isSignal()` inside `@signaltree/core`
rejects a `computed()` your code created, and `.derived()` drops every value.
Since 13.2.0 this warns as `[ST2007]`; before that it failed silently. Fix the
duplication in your bundler (Vite: `resolve: { dedupe: ['@angular/core'] }`;
Jest: `moduleNameMapper`).
