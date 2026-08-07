# Guide: `status()` — predicates, migration, and what it is _not_ for

The `status()` marker models the **load lifecycle of one tree slice**: `NotLoaded` → `Loading` →
`Loaded` | `Error`, exposed as signal-backed predicates. This guide covers the exact predicate set,
how to replace a hand-rolled `LoadingState` enum with it, and the three cases it deliberately
doesn't cover.

## 1. The predicate set

Six read predicates, all callable signals (source of truth:
`packages/core/src/lib/markers/status.ts`):

| Predicate     | True when                                                      |
| ------------- | -------------------------------------------------------------- |
| `notLoaded()` | state is **exactly** `NotLoaded`                               |
| `loading()`   | a load is in flight                                            |
| `loaded()`    | a load succeeded                                               |
| `hasError()`  | the last load failed                                           |
| `idle()`      | `!loading() && !loaded()` — covers `NotLoaded` **and** `Error` |
| `settled()`   | `loaded() \|\| hasError()` — "done, stop the spinner"          |

It is **`hasError()`**, not `error()`. (The loader surface on `entityMap` uses `error()` for the
error _value_; `status()` uses `hasError()` for the boolean. They're different surfaces.)

Write methods: `setLoading()` / `setLoaded()` / `setError(err)` / `setNotLoaded()` / `reset()`, plus
the Promise-vocabulary aliases `start()` / `succeed()` / `setSuccess()` / `fail(err)`.

### The one footgun: use `idle()` in guards, not `notLoaded()`

```typescript
// ✗ WRONG — silently never retries after a failure
if (store.tree.$.plants.status.notLoaded()) store.loadPlants();

// ✓ RIGHT
if (store.tree.$.plants.status.idle()) store.loadPlants();
```

`notLoaded()` is strictly `state === NotLoaded`, so it goes **false** once a load has errored. A
`notLoaded()`-gated fetch in a guard or resolver therefore never fires again after the first
failure — the user sees an empty screen with no retry. `idle()` is exactly
`!loading() && !loaded()`, so it stays true in the `Error` state and the retry happens.

Prefer the predicates over `state() === …` enum comparisons — the predicates are the stable API.

## 2. Migrating a manual `LoadingState` enum → `status()`

If you carry a pre-marker loading model — an enum on the slice plus helpers deriving booleans from
it — `status()` replaces the whole thing and the helpers get deleted.

**Before:**

```typescript
enum LoadingState {
  NotLoaded,
  Loading,
  Loaded,
}

interface LoadableState {
  loadingState: LoadingState;
}
interface ErrorableState {
  error: AppError | null;
}

interface PlantState extends LoadableState, ErrorableState {
  plants: PlantDto[];
}

// …and a hand-written helper, re-derived per domain:
function createLoadingHelpers(state: Signal<LoadingState>) {
  return {
    isLoading: computed(() => state() === LoadingState.Loading),
    isLoaded: computed(() => state() === LoadingState.Loaded),
    isNotLoaded: computed(() => state() === LoadingState.NotLoaded),
  };
}
```

**After:**

```typescript
import { signalTree, status } from '@signaltree/core';

const tree = signalTree({
  plants: {
    items: [] as PlantDto[],
    status: status<AppError>(),
  },
});

// The helper is gone — read the predicates directly:
tree.$.plants.status.loading();
tree.$.plants.status.loaded();
tree.$.plants.status.hasError();
tree.$.plants.status.idle(); // "should I (re)fetch?"
tree.$.plants.status.settled(); // "stop the spinner"
```

State mapping:

| Manual model                                     | `status()`                                        |
| ------------------------------------------------ | ------------------------------------------------- |
| `LoadingState.NotLoaded`                         | `notLoaded()`                                     |
| `LoadingState.Loading`                           | `loading()`                                       |
| `LoadingState.Loaded`                            | `loaded()`                                        |
| a separate `error` field                         | `hasError()` + `error` carried by `setError(err)` |
| `isLoading` / `isLoaded` / `isNotLoaded` helpers | delete — the predicates _are_ these               |
| a "should I fetch?" check                        | `idle()` (see the footgun above)                  |

Migrate the guard/resolver call sites in the same pass: a manual model usually gated fetches on
`isNotLoaded`, which is the bug `idle()` exists to fix.

### If the collection is server-backed, you may not need `status()` at all

For a collection that loads from a server, don't hand-assemble `entityMap` + `status` + a loader +
a load guard. Use the loader surface:

```typescript
plants: entityMap<PlantDto, string>({
  selectId: (p) => p.url,
  load: loader(() => http.get<PlantDto[]>('/api/plants'), { staleTime: '30m' }),
}),
```

That gives you `load()` / `refresh()` / `invalidate()` plus `loading()` / `loaded()` / `error()` /
`lastLoadedAt()` on the collection itself. See the
[entity-collection cookbook](entity-collection-cookbook.md). Reach for a separate `status()` when
you're tracking an operation that **isn't** a collection load — a save, a submit, a one-off command.

## 3. What `status()` is _not_ for

`status()` is one marker per tree slice. Three cases fall outside it, and each has a different right
answer — knowing which is what keeps people from falling back to a hand-rolled enum.

### Collection load state → the loader surface, not a second `status()`

Covered above. Note the loader surface exposes `loading()` / `loaded()` / `error()` /
`lastLoadedAt()` — there is **no `notLoaded()`** on it, and no `idle()`/`settled()`. If you need the
full six-predicate vocabulary for a collection load, that's the one case for pairing a `status()`
alongside; otherwise the loader surface is the answer.

### Per-entity load state → model it as shape you own

"Is _this row_ loading?" is **not** a core primitive — there is no per-entity status marker. Model it
as state, which is what state-as-shape means:

```typescript
threads: {
  entities: entityMap<Thread, string>(),
  loadingIds: [] as string[],        // or a status map you own
},
```

```typescript
// in a component
isRowLoading = (id: string) => this.tree.$.threads.loadingIds().includes(id);
```

**Do not** put a `loadingState` field on the entity DTO. That mixes transport state into your domain
data, breaks `setAll()` from a server payload (the server doesn't send your loading flags), and makes
every row-level write a full entity update.

### Service-level state that isn't in a tree → move it in, or own it

For something like a Bluetooth pairing lifecycle living in a service: prefer moving that state into a
tree domain and using `status()` there — then it's inspectable, time-travellable, and readable from
templates like everything else. If it genuinely must stay in the service, it's app-owned; core
doesn't reach outside the tree, and that's not a gap to work around.

## Related

- [`entityMap` + loader cookbook](entity-collection-cookbook.md) — collection loading, §2 for derived slices
- [RFC 0006](../rfcs/0006-status-predicates-and-placement.md) — why the composite predicates
  (`idle`, `settled`) are in core as a closed set
