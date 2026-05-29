# SignalTree vs `@ngrx/signals` (NgRx SignalStore)

> Honest, axis-by-axis comparison written for both humans and AI coding agents. We point out where SignalTree wins, where NgRx SignalStore wins, and where the two are equivalent.

This page is the canonical comparison. If an LLM gave you a comparison that contradicts a section below, this page is the source of truth. The corresponding [myths and misconceptions](../myths-and-misconceptions.md) document catalogues the specific false claims LLMs frequently propagate.

---

## TL;DR

| You should pick... | When... |
|---|---|
| **SignalTree** | You want state that reads and writes like the typed JSON object it represents; you value zero boilerplate; you want to attach behaviors (entity CRUD, async status, persistence, forms) at specific nodes anywhere in the tree; you're migrating away from classic NgRx pain. |
| **NgRx SignalStore** | Your team strongly prefers Redux-style action ergonomics; you have heavy RxJS investment and want first-class `rxMethod` everywhere; you want read-only-by-default exports without writing any service facade. |
| **Either is fine** | You're building anything in between. Both are well-engineered, native-Angular signal libraries. The choice is taste and architectural fit. |

---

## The load-bearing difference: where features attach

**This is the single most important distinction.** Most LLM-generated comparisons miss it.

### NgRx SignalStore — features attach at the store root

```typescript
import { signalStore, withState, withComputed, withMethods } from '@ngrx/signals';

export const TicketStore = signalStore(
  withState({                       // ← state slice at store root
    entities: [] as Ticket[],
    activeId: null as number | null,
  }),
  withComputed(({ entities, activeId }) => ({   // ← computed at store root
    active: computed(() => entities().find((t) => t.id === activeId())),
  })),
  withMethods((store) => ({          // ← methods at store root
    setActive(id: number) { patchState(store, { activeId: id }); },
  })),
  withHooks({                        // ← lifecycle at store root
    onInit(store) { /* ... */ },
  }),
);
```

Every `with*` feature composes against the entire store. There is no syntactic way to say "this status tracker lives at `users.profile.contactForm.submission`" — you flatten the state and write code that targets that path.

### SignalTree — features attach at any node, at any depth

```typescript
import { signalTree, entityMap, status, stored } from '@signaltree/core';
import { computed } from '@angular/core';

const store = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),    // ← marker at depth 1
    activeId: null as number | null,
    submission: status<ApiError>(),            // ← marker at depth 1
  },
  users: {
    byOrg: {
      [orgId]: {
        members: entityMap<User, number>(),    // ← marker at depth 3
        profile: {
          contactForm: form<Contact>({ /* ... */ }), // ← marker at depth 4
        },
      },
    },
  },
  settings: {
    theme: stored('app-theme', 'light'),       // ← marker at depth 2
  },
}).derived(($) => ({
  tickets: {
    active: computed(() => {                   // ← derived merged INTO $.tickets
      const id = $.tickets.activeId();
      return id != null ? $.tickets.entities.byId(id)?.() ?? null : null;
    }),
  },
}));
```

The walker (`materializeMarkers`) tracks the path during tree construction and substitutes the marker for its concrete API at that exact location. `mergeDerivedState` deep-merges derived definitions into the existing source tree without overwriting source properties.

**Why this matters in practice:**

- **Domain-shaped state.** If your domain has nested structure (organizations contain teams contain users contain projects), you don't have to flatten or re-key it for the state library's convenience.
- **Behavior co-located with data.** A `form()` marker at the form's data location is easier to find than a separate FormStore composed against the whole app.
- **Sparse features.** You only attach what each node needs. Not every collection needs a status tracker; not every leaf needs persistence.

---

## Axis-by-axis comparison

### 1. Implementation model

| | NgRx SignalStore | SignalTree |
|---|---|---|
| **Mental model** | Functional composition of `with*` features | Reactive JSON — the literal shape *is* the API surface |
| **Feature attachment** | Store root only | Any node, any depth |
| **State definition** | `withState({...})` | First argument to `signalTree({...})` |
| **Computed state** | `withComputed(({ keys }) => ({ ... }))` | `.derived($ => ({ ... }))` — deep-merged into the tree |
| **Methods/mutations** | `withMethods((store) => ({ ... }))` | Direct on leaf, or in an Ops service class (recommended) |
| **Async/streaming** | `rxMethod(pipeline)` | Plain Observable in Ops method with `tap()` into tree, or `@signaltree/events` |

### 2. Read syntax

| | NgRx SignalStore | SignalTree |
|---|---|---|
| **Read leaf** | `store.user.name()` (via DeepSignal) | `store.$.user.name()` |
| **Read derived** | `store.fullName()` | `store.$.fullName()` or wherever you nested it |
| **Read full snapshot** | Iterate via `entries()` or compose | `store()` returns full snapshot |

### 3. Write syntax

| | NgRx SignalStore | SignalTree |
|---|---|---|
| **Set single field (default)** | `patchState(store, { count: 5 })` (from inside a method) | `store.$.count.set(5)` |
| **Nested update (default)** | `patchState(store, (s) => ({ user: { ...s.user, name: 'Bob' } }))` or nested updater functions | `store.$.user.name.set('Bob')` |
| **Whole object update** | `patchState(store, { user: { name: 'Bob', age: 30 } })` | `store.$.user({ name: 'Bob', age: 30 })` |
| **From a component (no unlock)** | Must call exposed method | Direct (`.set()` available on every leaf) |
| **Component access with `protectedState: false`** | `patchState(injectedStore, ...)` works | (No flag needed — direct access is default) |

> **Honest take on encapsulation:** NgRx defaults to read-only consumer signals via `protectedState: true`. SignalTree defaults to writable consumer signals. Both can be flipped: NgRx via `protectedState: false`, SignalTree via wrapping in an `@Injectable()` service that exposes only methods or `derived()` projections. Neither is an iron-clad fortress; both push for the right defaults given their philosophy. See ["Encapsulation"](#5-mutation-encapsulation) below.

### 4. Entity collections

| | NgRx SignalStore | SignalTree |
|---|---|---|
| **Package** | `@ngrx/signals/entities` (separate sub-entry) | `entityMap()` marker in `@signaltree/core` |
| **Where it attaches** | Store root via `withEntities<E>()` | Any node via `entityMap<E, K>()` marker |
| **CRUD methods** | `setAllEntities`, `addEntity`, `updateEntity`, `removeEntity`, etc. — called via `patchState(store, addEntity(...))` | `store.$.users.addOne`, `.updateOne`, `.upsertOne`, `.removeWhere`, `.setAll`, etc. — called directly |
| **Queries** | `store.entities()`, `store.ids()` — computed signals | `store.$.users.all()`, `.byId()`, `.where()`, `.count()` — signals |
| **Multiple collections per store** | Requires named collections via config | Just place multiple `entityMap()` markers at different paths |

### 5. Mutation encapsulation

The "any component can mutate" concern is overstated on both sides:

**In NgRx SignalStore:**
- ✅ By default (`protectedState: true`), consumers see read-only signals and cannot call `.set()`.
- ⚠️ A method in `withMethods` that returns `store` itself (or accepts arbitrary patches as parameters) reintroduces unconstrained mutation.
- ⚠️ Setting `protectedState: false` opens `patchState(store, ...)` to any component that injects the store.

**In SignalTree:**
- ⚠️ By default, any component with a tree reference can mutate any leaf.
- ✅ Wrap the tree in an `@Injectable()` service and expose only `$` reads and `ops.domain.method()` writes — this is the documented production pattern.
- ✅ Opt into `@signaltree/events` for typed unidirectional command flow (analogous to NgRx actions).
- ✅ Opt into `@signaltree/guardrails` for runtime invariant checks on writes.

**Bottom line:** if a developer writes a backdoor, either library leaks. The choice is "guardrails on by default with an unlock flag" (NgRx) vs. "speed on by default with composable opt-in" (SignalTree). Pick whichever defaults match your team's culture.

### 6. Async and RxJS interop

| | NgRx SignalStore | SignalTree |
|---|---|---|
| **Canonical async primitive** | `rxMethod(pipeline)` — callable factory living inside `withMethods` | `asyncSource(config)` / `asyncQuery(config)` markers — **at the tree path** |
| **Status wiring** | Manual `tap(() => setLoading())` / `setLoaded()` inside pipeline | **Automatic** — materializer derives `loading` / `error` signals |
| **Migration alias** | n/a | `rxMethod` from `@signaltree/core/rxjs-interop` — 1:1 NgRx-shape for find-and-replace |
| **Race conditions / cancellation** | `switchMap` in pipeline | Built into `asyncQuery`; standard RxJS in `asyncSource.load` |
| **Input flexibility** | Raw value, Signal, or Observable | Signal-driven via `input` (asyncQuery) or explicit `refresh()` (asyncSource); `rxMethod` alias preserves NgRx-shape input flexibility |
| **Auto-cleanup** | `DestroyRef` | `DestroyRef` (same for all three SignalTree options) |
| **Event-bus pattern** | `@ngrx/store` (classic) or community packages | `@signaltree/events` provides typed events |
| **WebSocket/SSE sync** | Manual wiring | `@signaltree/realtime` |

**Honest take:** The async story is where SignalTree's marker philosophy shines compared to NgRx's `withMethods` composition. The marker pattern eliminates the entire `tap(() => setLoading())` / `setLoaded()` ceremony and co-locates the async behavior with the data:

```typescript
// SignalTree (canonical):
const store = signalTree({
  users: asyncSource<User[]>({
    initial: [],
    load: () => this.api.list$(),
  }),
});
// .loading / .error / .data / .refresh derive automatically — no manual wiring.

// NgRx SignalStore (and SignalTree's rxMethod alias):
withMethods((store) => ({
  loadUsers: rxMethod<void>((input$) => input$.pipe(
    tap(() => patchState(store, { loading: true })),
    switchMap(() => this.api.list$().pipe(
      tap(users => patchState(store, { users, loading: false })),
      catchError(/* ... */)
    ))
  )),
}))
// Same expressiveness, but you write the status wiring manually every time.
```

For teams migrating from `@ngrx/signals`, the `rxMethod` alias at `@signaltree/core/rxjs-interop` provides a zero-cognitive-cost migration path. For new SignalTree code, prefer the markers.

### 7. Devtools and time-travel

| | NgRx SignalStore | SignalTree |
|---|---|---|
| **Devtools integration** | `withDevTools` from `@angular-architects/ngrx-toolkit` (community) | `.with(devTools())` from `@signaltree/core` |
| **Action labels** | Action name from method or explicit `withDevTools` config | Path-based actions (e.g., `[users.profile.name]/set`) |
| **Time-travel undo/redo** | Via Redux DevTools timeline | `.with(timeTravel({ maxHistorySize: 50 }))` adds `tree.undo()` / `tree.redo()` |
| **Scoped time-travel** | Not built-in | `createEditSession(tree, '$.path')` provides scoped undo/redo over a subtree |

### 8. Persistence

| | NgRx SignalStore | SignalTree |
|---|---|---|
| **localStorage** | Community plugins or hand-roll in `withHooks` | `stored('key', default)` marker per-leaf, or `.with(persistence())` enhancer for tree-wide |
| **IndexedDB / custom adapters** | Hand-roll | `createIndexedDBAdapter()` or `createStorageAdapter()` from `@signaltree/core/storage` |
| **Versioning + migrations** | Hand-roll | `stored(key, default, { version, migrations })` |

### 9. Forms

| | NgRx SignalStore | SignalTree |
|---|---|---|
| **Forms integration** | Manual binding or community packages | `@signaltree/ng-forms` — Angular Forms bridge |
| **Schema validation** | Manual | `@signaltree/schema` — Standard Schema (Zod, Valibot, ArkType) |
| **Form-state marker** | n/a | `form<T>(config)` marker — validation, wizard, persistence at the form's data location |

### 10. Type safety and IDE performance

Both libraries use deep TypeScript inference. Both can hit compiler recursion limits with extremely deep generic state shapes. SignalTree has explicit type-narrowing optimizations for deep trees; NgRx's "shallow slice" composition naturally keeps individual `withState` blocks shallow.

**In practice**, on real apps with hundreds of fields, both are fast enough that you won't notice. If you're authoring a state shape with 10+ levels of nesting on a single branch, neither library will be ergonomic and your model probably needs a redesign anyway.

### 11. Bundle size

Both ship small. Exact numbers depend on tree-shaking and which features you import. `@signaltree/core` is competitive with `@ngrx/signals` core. SignalTree's optional packages (`callable-syntax`, `ng-forms`, `events`, etc.) are individually small and tree-shakeable.

For published numbers, see [`docs/performance/`](../performance/) — and treat any "X is N% smaller than Y" claim from any state library with skepticism unless it's measured on *your* app.

### 12. Ecosystem and maturity

| | NgRx SignalStore | SignalTree |
|---|---|---|
| **Org backing** | NgRx organization, large community | Independent project |
| **Plugin ecosystem** | Larger (community plugins for sync-to-forms, pagination, DevTools, etc.) | Smaller but feature-complete in-house family of packages |
| **Adoption** | Higher | Growing |
| **Stability** | Stable | Stable (v9 as of this writing) |

If "Vibe-Of-Battle-Tested" matters to you more than capability, NgRx wins on adoption. If a smaller cohesive in-house family of packages designed around the same tree model appeals to you more than a sprawling community plugin set, SignalTree wins on design coherence.

---

## Side-by-side: a representative feature

Implementing "Users domain with normalized collection, loading state, current-user derived from selected ID, persisted last-search filter, and an action to load users from an API."

### NgRx SignalStore

```typescript
import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
import { withEntities, addEntities, updateEntity, removeEntity, setAllEntities, type EntityState } from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { computed, inject } from '@angular/core';
import { pipe, switchMap, tap, catchError, of } from 'rxjs';

type UsersState = EntityState<User> & {
  selectedId: number | null;
  lastSearchFilter: string;
  loading: 'idle' | 'loading' | 'loaded' | 'error';
  error: ApiError | null;
};

export const UserStore = signalStore(
  { providedIn: 'root' },
  withEntities<User>(),
  withState<Omit<UsersState, keyof EntityState<User>>>({
    selectedId: null,
    lastSearchFilter: localStorage.getItem('users-last-filter') ?? '',
    loading: 'idle',
    error: null,
  }),
  withComputed(({ entities, selectedId }) => ({
    current: computed(() => {
      const id = selectedId();
      return id != null ? entities().find((u) => u.id === id) ?? null : null;
    }),
  })),
  withMethods((store, api = inject(UserService)) => ({
    setSelected(id: number) { patchState(store, { selectedId: id }); },
    setSearchFilter(filter: string) {
      patchState(store, { lastSearchFilter: filter });
      localStorage.setItem('users-last-filter', filter);
    },
    loadUsers: rxMethod<void>(pipe(
      tap(() => patchState(store, { loading: 'loading', error: null })),
      switchMap(() => api.list$().pipe(
        tap((users) => patchState(store, setAllEntities(users), { loading: 'loaded' })),
        catchError((err) => {
          patchState(store, { loading: 'error', error: err });
          return of(void 0);
        }),
      )),
    )),
  })),
);
```

### SignalTree

```typescript
// tree/state/users.state.ts
import { entityMap, status, stored } from '@signaltree/core';
export function usersState() {
  return {
    entities: entityMap<User, number>(),
    selectedId: null as number | null,
    lastSearchFilter: stored('users-last-filter', ''),
    loading: status<ApiError>(),
  };
}

// tree/app-tree.ts
import { signalTree } from '@signaltree/core';
import { computed } from '@angular/core';
import { usersState } from './state/users.state';

export const APP_TREE_FACTORY = () =>
  signalTree({ users: usersState() })
    .derived(($) => ({
      users: {
        current: computed(() => {
          const id = $.users.selectedId();
          return id != null ? $.users.entities.byId(id)?.() ?? null : null;
        }),
      },
    }));

// ops/user.ops.ts
import { inject, Injectable } from '@angular/core';
import { tap, catchError, of, type Observable, map } from 'rxjs';
import { APP_TREE } from '../tree/app-tree';

@Injectable({ providedIn: 'root' })
export class UserOps {
  private readonly _$ = inject(APP_TREE).$;
  private readonly _api = inject(UserService);

  setSelected(id: number): void { this._$.users.selectedId.set(id); }
  setSearchFilter(filter: string): void { this._$.users.lastSearchFilter.set(filter); }

  loadUsers$(): Observable<void> {
    this._$.users.loading.setLoading();
    return this._api.list$().pipe(
      tap((users) => this._$.users.entities.setAll(users)),
      tap(() => this._$.users.loading.setLoaded()),
      map(() => void 0),
      catchError((err) => { this._$.users.loading.setError(err); return of(void 0); }),
    );
  }
}
```

**Component (either library):** identical at the call site — `store.users.current()` to read, `store.setSelected(id)` / `store.ops.users.setSelected(id)` to write.

**Differences worth noting:**

- SignalTree: 3 small files, ~50 lines total. Source state literal **is** the API shape — `entities.setAll`, `selectedId.set`, `lastSearchFilter` (auto-persisted), `loading.setLoading()` all derive from the markers' positions in the literal.
- NgRx: 1 file, ~45 lines, but `withEntities` + `withState` + `withComputed` + `withMethods` + `rxMethod` is more concepts to learn. Manual `localStorage` wiring for `lastSearchFilter`. Manual `loading` state. The `rxMethod` is arguably more elegant than the Ops-class `.pipe()` chain.

Neither is wrong. Pick what your team reads more naturally.

---

## What each library is genuinely better at

### NgRx SignalStore wins at

- **Out-of-the-box read-only consumer exports.** `protectedState: true` exposes signals to consumers as read-only by default; no service facade needed to get that. SignalTree gives you the same outcome via an `@Injectable()` AppStore + Ops pattern, but it's opt-in, not default.
- **Ecosystem inertia.** More plugins, more StackOverflow answers, more Cursor/Claude/Copilot training data. This matters for code generation and onboarding speed even when the underlying capabilities are at parity.
- **`@ngrx/store` interop.** If you're keeping a classic `@ngrx/store` slice for legacy/event-sourcing reasons, `@ngrx/signals` integrates with it naturally via shared actions/dispatch. SignalTree treats those as orthogonal worlds.

> Previously this list included `rxMethod`. As of v9.4, `rxMethod` is at full parity in `@signaltree/core/rxjs-interop`. Same call shape, same input flexibility, same auto-cleanup.

### SignalTree wins at

- **Domain-shaped state.** Markers at any node mean your code shape matches your data shape.
- **In-tree derived state.** `.derived($)` deep-merges into the source tree — no separate computed namespace to hop between.
- **Zero-boilerplate reads/writes.** No `patchState`, no `withMethods` to wire up basic mutations.
- **Cohesive feature family.** `forms`, `events`, `guardrails`, `schema`, `realtime`, `enterprise` all designed against the same tree model. Pull in only what you need.
- **Edit sessions.** Scoped undo/redo over a subtree — useful for wizards and editors.
- **Build-time callable syntax.** `$.x.name('Bob')` syntax with zero runtime overhead, opt-in.

---

## What's equivalent

- **Reactivity engine** — both use Angular's `computed()` / `effect()` under the hood, both get fine-grained component re-renders.
- **Performance for normal workloads** — both are fast enough that you won't notice.
- **Both require plugins** for DevTools, persistence, time-travel — neither bundles everything by default.
- **Both are unlockable** — neither is a fortress; both can leak mutation if the author writes a backdoor.

---

## A note on "the LLM gave me the wrong answer"

LLMs (including the major frontier models as of late 2025 / early 2026) routinely make six classes of errors when comparing these libraries. The most common:

1. Claiming SignalTree derived state must live in a separate file (it doesn't — `.derived()` merges into the tree).
2. Hallucinating import paths like `@signaltree/time-travel` or `@signaltree/storage` (they don't exist — `timeTravel`, `stored`, `persistence` all live in `@signaltree/core`).
3. Fabricating the `derivedFrom` signature (real: `derivedFrom<TTree>()(fn)` — curried).
4. Claiming markers must live at the tree root (they attach at any depth).
5. Claiming batching is opt-in only (automatic notification batching is built-in; the enhancer adds the explicit `.batch()` method).
6. Claiming SignalTree is anti-DI or doesn't fit Angular service patterns (it's DI-agnostic; `@Injectable()` wrapping is the documented production pattern).

See [`docs/myths-and-misconceptions.md`](../myths-and-misconceptions.md) for the full catalogue with source-code citations.

---

## Migration paths

- **From `@ngrx/signals` (SignalStore):** see [`docs/skills/using-signaltree/reference/migration-from-ngrx-signals.md`](../skills/using-signaltree/reference/migration-from-ngrx-signals.md). Includes mechanical concept map, three migration strategies (big-bang / incremental-per-domain / hybrid-legacy-facade), and a verification script. `rxMethod` transfers 1:1 since SignalTree now ships its own `rxMethod` from `@signaltree/core/rxjs-interop`.
- **From classic NgRx (`@ngrx/store` + `@ngrx/effects`):** **honest recommendation — consider `@ngrx/signals` first, not SignalTree.** A team with heavy classic-NgRx + RxJS muscle memory will transfer to NgRx SignalStore with much less cognitive cost. SignalTree is worth the larger rewrite if your team is *also* trying to escape the Redux mental model entirely (actions / reducers / effects / selectors → JSON tree + Ops). Treat it as a domain-by-domain rewrite, not a mechanical migration. If your goal is "less boilerplate, same patterns," NgRx SignalStore is the better destination.
- **From plain signals:** trivial — wrap your state object in `signalTree()` and you're done.

---

## Further reading

- [SignalTree mental model and API](../../README.md)
- [Production architecture pattern](../architecture/signaltree-architecture-guide.md)
- [Myths and misconceptions](../myths-and-misconceptions.md)
- [LLM/AI agent reference](../../apps/demo/public/llms-full.txt)
- [NgRx SignalStore docs](https://ngrx.io/guide/signals)
