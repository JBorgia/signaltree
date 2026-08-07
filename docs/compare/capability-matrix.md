# Capability matrix — what the others have that we do not

**Status:** audit, 14.0.0-rc.1.

## How this was built, and why that matters

Every row is read from the **installed `.d.ts` of the shipped package**, not from
a README or from memory of a library's marketing. Reproduce it with
`node tools/api-surface.mjs`. Versions audited:

| library | version | unique exports | entry points |
| --- | --- | --- | --- |
| `@signaltree/core` | 14.0.0-rc.1 | 191 (root: 154) | 6 |
| `@ngrx/signals` | 21.1.1 | 73 | 5 |
| `@ngrx/store` | 21.1.1 | 79 | 2 |
| `@ngneat/elf` | 2.5.1 | 40 | 1 |
| `@ngneat/elf-entities` | 5.0.2 | 61 | 1 |
| `@ngneat/elf-state-history` | 1.4.0 | 2 | 1 |
| `@ngxs/store` | 20.1.0 | 131 | 6 |
| `@datorama/akita` | 8.0.1 | 186 | 1 (unmaintained upstream) |

Counts are the UNION across every subpath in each package's exports map, types
included — surface area, not features.

> **An earlier revision of this table said 248 for us and 56 for elf.** Both were
> wrong, and unevenly so, which is worse than being wrong. The scan followed
> NAMED re-exports into the modules behind them, so `export { signalTree } from
> './lib/signal-tree'` — one public symbol — pulled in everything that module
> exports. `@ngrx` and `@ngxs` ship single-file rolled-up declaration bundles
> with nothing to recurse into, so they were counted honestly while we and elf
> were inflated. The headline was comparing our internals against their public
> API. A named re-export publishes exactly the names it lists; only `export *`
> is followed now.

**Our root entry point is still 154 symbols against elf's 40**, and that
deserves an answer rather than a footnote. Most of it is types — the readonly
projections, the marker types, the per-marker config and signal interfaces — but
"most of it is types" is a reason, not an excuse, for a library whose pitch is
that state is just JSON.

This matters because a comparison written from docs measures documentation, not
capability, and it flatters whoever writes the better README. It also protects
against the opposite error: Akita's 199 exports are not 199 features — many are
internal helpers and type aliases that happen to be public.

**A capability being absent here is not automatically a gap to fill.** Some are
deliberate declines, and the analysis below says which and why.

---

## The grid

✅ built in · 🟡 partial / requires assembly · ❌ absent

### Collections

| capability | SignalTree | `@ngrx/signals` | elf | Akita | NGXS |
| --- | :-: | :-: | :-: | :-: | :-: |
| CRUD (add/update/remove/upsert/setAll) | ✅ | ✅ | ✅ | ✅ | 🟡 |
| **O(1) per-entity read that invalidates only that row** | ✅ | ❌ | ✅ | 🟡 | ❌ |
| Predicate update / remove | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Predicate **select / count** | 🟡 | ❌ | ✅ | ✅ | 🟡 |
| `prepend` | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Active-entity tracking** | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Per-entity UI state, kept off the domain entity** | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Id migration (temp id → server id)** | ❌ | ❌ | ✅ | 🟡 | ❌ |
| Reorder / move | ❌ | ❌ | ✅ | 🟡 | ❌ |
| Bounded / FIFO collection | ❌ | ❌ | ✅ | ❌ | ❌ |
| Union / merge two collections | 🟡 | ❌ | ✅ | 🟡 | ❌ |
| First / last | 🟡 | ❌ | ✅ | ✅ | 🟡 |
| Multiple named collections in one store | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Pagination** | ❌ | ❌ | ❌ | ✅ | ❌ |

### History, async, forms

| capability | SignalTree | `@ngrx/signals` | elf | Akita | NGXS |
| --- | :-: | :-: | :-: | :-: | :-: |
| Undo / redo | ✅ | ❌ | ✅ | ✅ | 🟡 |
| **Reactive `canUndo`/`canRedo`** | ✅ *(fixed in rc.1)* | ❌ | ✅ | ✅ | 🟡 |
| Jump to index | ✅ | ❌ | ✅ | ✅ | ❌ |
| **Pause / resume recording** | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Comparator to skip uninteresting entries** | 🟡 | ❌ | ✅ | ✅ | ❌ |
| **Per-entity undo/redo** | ❌ | ❌ | ✅ | ✅ | ❌ |
| Loading / error status | ✅ | 🟡 | 🟡 | ✅ | 🟡 |
| Async source / query primitive | ✅ | 🟡 | ❌ | 🟡 | ❌ |
| **Request caching / dedup** | 🟡 | ❌ | ❌ | ✅ | ❌ |
| Optimistic updates | 🟡 *(events pkg)* | ❌ | ❌ | 🟡 | ❌ |
| Form model + validators | ✅ | ❌ | ❌ | 🟡 | ❌ |
| Form wizard | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Dirty checking** | 🟡 *(forms only)* | ❌ | ❌ | ✅ | ❌ |

### Infrastructure

| capability | SignalTree | `@ngrx/signals` | elf | Akita | NGXS |
| --- | :-: | :-: | :-: | :-: | :-: |
| Persistence | ✅ | ❌ | ✅ | ✅ | ✅ |
| Devtools | ✅ | 🟡 | ✅ | ✅ | ✅ |
| Batching / transactions | ✅ | 🟡 | ✅ | ✅ | 🟡 |
| **Action lifecycle observability** | 🟡 | ✅ | 🟡 | 🟡 | ✅ |
| **Plugin architecture with a public contract** | 🟡 | ✅ | ✅ | ✅ | ✅ |
| **Global unhandled-error hook** | ❌ | ❌ | ❌ | ❌ | ✅ |
| Testing utilities | 🟡 | 🟡 | 🟡 | ✅ | ✅ |
| SSR / transfer state | ❌ | ❌ | ❌ | ❌ | 🟡 |
| Diagnostics with stable codes | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Granular signals for arbitrary NESTED state** | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## What the comparison already caught

Reading elf's `StateHistory` contract — it exposes `hasPast$`/`hasFuture$` as
**observables** — prompted the question of whether ours were reactive at all.
They were not. `canUndo()` read a plain number, so `computed(() => canUndo())`
evaluated once and cached `false` forever; a zoneless app's undo button never
enabled. Fixed in this RC, pinned by tests that assert recompute counts rather
than values, because every pre-existing time-travel test calls the methods
imperatively — the one way the bug cannot show up.

**That is the argument for doing this exercise at all.** It was not found by
benchmarking, by review, or by our own test suite. It was found by reading a
competitor's type signature and asking why theirs was shaped differently.

---

## The gaps worth closing, ranked — with the implementation trade-off

### 1. Active-entity tracking — elf, Akita

`setActiveId(id)`, `selectActiveEntity()`, `withActiveIds` for multi-select.

**Why it recurs:** master/detail is the most common shape in a CRUD app, and
every team writes the same `activeId: null` field plus a derived lookup. Our own
docs demonstrate exactly that hand-rolled version in
`merge-derived.ts`, which is evidence the need is real and currently unmet.

**Their implementation:** elf keeps `activeId` in store state and derives the
entity. Akita's `ActiveState` is the same idea with `setActive` accepting a
relative offset (`next`/`prev`) — better than it sounds, because "select the
next row" otherwise means the caller re-implements bounds checking.

**Trade-off:** the entity must be looked up by id on read, so the derived value
is only as granular as the lookup. Ours would be *better* here than elf's — we
would build it on `byId()`, which is O(1) and invalidates one row, so the active
entity would be a genuinely fine-grained signal rather than a filtered stream.

**Verdict: adopt.** Small, high-frequency, and our primitives make it a better
version rather than a copy.

### 2. Per-entity UI state — elf `withUIEntities`, Akita `EntityUIStore`

A **parallel collection**, keyed by the same ids, holding `{ isExpanded,
isSelected, isSaving }` — deliberately not on the domain entity.

**Why it is a real idea and not sugar:** UI flags on a domain entity get
serialised into persistence, sent back to the server, diffed by change
detection, and undone by undo. Keeping them in a sibling collection means the
domain entity round-trips cleanly and the UI state has its own lifetime.

**Trade-off:** two collections to keep in sync — deleting an entity must delete
its UI row, and elf does not do that for you automatically. It is a pattern with
a sharp edge, not a free win.

**Verdict: adopt the concept, not the API.** We already have the better
mechanism: a sibling `entityMap` in the same tree, and `stored()` decides what
persists. What we lack is the *guidance* — this belongs in docs and possibly a
thin helper, not a new primitive.

### 3. Id migration — elf `updateEntitiesIds`

Change an entity's id in place, preserving position and identity.

**Why it matters:** it is the missing half of optimistic creation. You insert
with a temp id, the server returns the real one, and without this you must
remove-and-re-add — losing list position, any held `byId()` node, and any UI
state keyed by the old id. We ship `OptimisticUpdateManager` in
`@signaltree/events/angular` and it has no answer for this step.

**Trade-off:** it invalidates every id-keyed cache — for us that means the
`WeakRef` node cache and any consumer holding a node from `byId(tempId)`. Doing
it correctly means re-keying those, not just moving the storage entry.

**Verdict: adopt.** It closes a hole in a feature we already ship.

### 4. Pause / resume + comparator on history — elf, Akita

`pause()`, `resume()`, and `comparatorFn(prev, next)` to skip recording.

**Why:** without pause, a bulk import writes a hundred history entries and the
user's next undo reverts one row of it. Our `maxHistorySize` bounds the memory
but does not make undo mean anything sensible. We have reference-dedup, which
skips *identical* snapshots — that is narrower than a comparator, which lets the
app decide that a change is uninteresting.

**Trade-off:** a comparator runs on every recorded write, so a careless one is
an O(state) walk per write — exactly the cost the reference-dedup was introduced
to remove. It should be opt-in and documented as such.

**Verdict: adopt pause/resume. Adopt the comparator with the cost stated.**

### 5. Pagination — Akita only

`PaginatorPlugin`: page cache, `hasPage`, prefetch, invalidation.

**Trade-off:** pagination is genuinely coupled to the data source, and Akita's
plugin is the largest single feature in that library. Most apps now use a server
cursor and a query library.

**Verdict: decline for core.** Revisit only if it can be expressed as a marker
composed from `asyncQuery()` + `entityMap()` rather than a new subsystem.

### 6. Action lifecycle observability — NGXS, and now `@ngrx/signals` too

`ofActionDispatched / Successful / Errored / Canceled / Completed` in NGXS.

**This one moved while we were not looking.** `@ngrx/signals` 21 ships an
`/events` entry point — `event`, `eventGroup`, `on`, `withReducer`,
`withEventHandlers`, `injectDispatch`, `Dispatcher`, `EventScope` — a full
Redux-style dispatch and reducer layer for signal stores. Our positioning has
been that they are the signals-first option WITHOUT the action ceremony and we
are the granular one; half of that is now their opt-in feature rather than their
absence. It does not change the granularity result, which is what the
`@ngrx/signals` comparison actually turns on, but it does mean "you don't need
actions" is no longer a distinction from them.

Worth stating plainly because it was missed by hand-listing entry points, and
only appeared once the tool enumerated every subpath in their exports map.

**Why it is more than devtools:** it is the seam for cross-cutting concerns —
analytics, retry, a global spinner, error reporting — without wrapping every
call site. Our `PathNotifier` sees *changes*, which is not the same: it cannot
distinguish "the save failed" from "nothing was written".

**Trade-off:** it presumes actions. We do not have actions, and adding them to
get observability would import the ceremony the library exists to avoid.

**Verdict: decline the action model; take the requirement.** The real gap is
that a failed async operation has no global observation point. That is
answerable within our model via `asyncQuery`/`asyncSource` status transitions —
closer to a `onAsyncSettled` hook than to NGXS actions.

### 7. Global unhandled-error hook — NGXS only

`NgxsUnhandledErrorHandler`. Nobody else has it, including us. An error thrown
inside an effect or an async loader currently surfaces wherever it surfaces.

**Verdict: adopt.** Small, and the absence is conspicuous once seen.

### 8. `prepend` — everyone except us

One method, and checking it properly changed the row: elf and Akita take
`{ prepend: true }` on their add, and NGXS has `insertItem` among its state
operators. We are the ONLY library in this table without it. My first draft
recorded elf, Akita and NGXS as 🟡 from memory; reading their declaration files
made it 4/4 against us.

Chat logs, feeds, activity streams. `setAll([newRow, ...existing])` is
O(collection) and rebuilds the id index; a prepend is neither.

**Verdict: adopt.** Trivial, and being alone in lacking it is the strongest
signal in the grid.

---

## "elf is small, fast, and ticks every box — so why would anyone pick us?"

The right question, and the grid above does not answer it. Three measurements do.

### 1. On bundle size, elf wins. Straightforwardly.

`node tools/size-compare.mjs` — same capability, same esbuild + gzip method.

| capability | SignalTree | elf | |
| --- | --- | --- | --- |
| store + a few fields | 5.69 KB | **1.01 KB** | 5.6x |
| entity collection, CRUD + read | 8.59 KB | **2.38 KB** | 3.6x |
| entity collection + undo/redo | 10.33 KB | **2.84 KB** | 3.6x |

With RxJS bundled — a signals-first app that would otherwise not carry it — elf's
numbers become 4.24 / 5.54 / 5.94 KB, so the gap narrows to 1.3x–1.7x. It never
closes. **elf is smaller and this project should stop being surprised by that**;
it is already on record that bundle size is not our advantage.

### 2. On entity collections, elf wins too — and that is all we ever measured

`bench-compare.mjs` measures entity collections, and elf leads on throughput and
undo. That is elf's optimised path — a `Map` plus one array — and until now it
was the ONLY cross-library benchmark in this repo. **Every published comparison
was fought on the competitor's best ground, and on the one shape where this
library's design gives it no advantage.**

### 3. On general state, the result inverts — by orders of magnitude

The thesis is that only leaves are signals, branches are plain accessors, and a
write is O(1) *regardless of state size*. Nothing had ever tested that against
anyone. `node tools/bench-state-scale.mjs`, 200 writes, warmed, postconditioned,
elf using its own `setProp`:

**Write cost vs state size, no consumers attached** — nested shape, which is how
an app is actually written and is much kinder to elf than flat root props:

| state | SignalTree | elf | |
| --- | --- | --- | --- |
| 100 fields | 0.008 ms | 0.041 ms | 5x |
| 1,000 fields | 0.006 ms | 0.366 ms | 60x |
| 5,000 fields | 0.008 ms | 1.313 ms | 162x |
| 10,000 fields | 0.006 ms | 1.079 ms | **~185x** |

*(Ranges are the spread across two full runs, which reproduce to within a few
percent. An earlier draft quoted 253x at 10,000 fields from a single run; the
reproducible figure is ~176–196x. Same conclusion, smaller number, and the
smaller number is the one that is true.)*

**SignalTree is flat.** 0.006 ms at 10,000 fields is the same as at 100. elf's
cost is proportional to the slice it immutably copies, because that is what an
immutable store does. On a flat shape — every field a root property — elf goes
from 0.042 ms at 64 props to 20.9 ms at 1,024, a **2,832x** ratio, with a sharp
inflection between 64 and 128 that looks like V8 leaving its fast path for object
spread.

**Write cost vs live consumers**, 100 fields fixed:

| consumers | SignalTree | elf | |
| --- | --- | --- | --- |
| 100 | 0.020 ms | 2.372 ms | 116x |
| 1,000 | 0.046 ms | 21.328 ms | 464x |
| 5,000 | 0.195 ms | 109.462 ms | **562x** |

The mechanism, counted directly: with 1,000 selectors on nested state and one
field changed, **elf executes 1,000 of 1,000 projection functions** and notifies
1. SignalTree executes **1**. elf's `distinctUntilChanged` correctly suppresses
the notification — nobody re-renders who shouldn't — but every selector still
runs on every write.

### So the honest positioning

**Pick elf** if state is mostly entity collections, bundle size is the binding
constraint, and you are comfortable with RxJS. It is smaller, it is faster at
collections, and its feature surface is broader than ours.

**Pick SignalTree** when state is large and deeply nested rather than
collection-shaped, when writes are frequent, when many components observe
different parts of it, or when you want signals rather than observables in a
zoneless app. The advantage is not a constant factor — it is that our cost does
not grow with the size of your state and elf's does. At 100 fields the difference
is 5x and irrelevant. At 10,000 it is ~185x and decides whether the app is usable.

**And elf makes you manage that.** Its cost is proportional to the copied slice,
so an elf app stays fast by being carefully partitioned into small stores and
shallow sections. That is real architectural work, and it is work SignalTree does
not ask for. Ours is O(1) by construction, not by discipline.

---

## "Why not just put signals on elf?"

You can, today, and it does not help — which is the most useful thing measured
in this document.

elf ships **no signal API** (its only peer dependency is `rxjs`), but
`toSignal()` from `@angular/core/rxjs-interop` turns any observable into a
signal, so "signals elf" is one wrapper away. Measured: 1,000 consumers over
nested state, 200 writes.

| | time | projections run per write |
| --- | --- | --- |
| SignalTree, native signals | **0.070 ms** | 1 / 1000 |
| elf + `toSignal` | **20.332 ms** | **1000 / 1000** |

290x, and the projection count is unchanged. **`toSignal` changes the
CONSUMPTION api and nothing else.** The cost lives in elf's store and pipe
layer: the write copies a slice of an immutable object, and every `select`
projection re-runs because the store emitted. Wrapping the far end of that
pipeline in a signal cannot make either go away.

For elf to get these characteristics it would have to stop holding one immutable
state object and start holding a signal per leaf, with plain accessors over
them. That is not a signals adapter on elf; that is a different library with the
same name, and it is the architecture this one already has. The observable-vs-
signal question is a red herring — **the real difference is one immutable object
versus many independent signals**, and it is upstream of how you consume it.

## DX, with the same feature written twice

A todo list: entity collection, a filter, a derived count, one editable row, and
undo/redo. Every API below verified present in the installed packages.

| | lines | imports | packages |
| --- | --- | --- | --- |
| SignalTree | **13** | **1** | **1** |
| elf | 25 | 5 | 4 |

The line count is the least of it. The shape differs in three ways that persist
no matter how the code is written:

1. **Every reactive read needs a `toSignal` wrapper.** Reading one row is
   `tree.$.todos.byId(1)` against
   `toSignal(store.pipe(selectEntity(1)), { initialValue: undefined })`. That is
   per consumer, forever, in every component.
2. **Writes go through reducer functions.** `store.update(updateEntities(1, {...}))`
   against `tree.$.todos.updateOne(1, {...})` — a small thing that adds an import
   per operation used.
3. **Capabilities arrive as separate packages that must be wired together in
   order.** `stateHistory(store)` has to be constructed after the store and held
   somewhere; persistence is another package again. Ours are markers inside the
   state shape, so a collection that persists is a declaration rather than an
   assembly step.

Against that, elf's DX advantages are real: fewer concepts to learn, a smaller
surface (40 exports against our 154), and reducers that compose as plain data.

## Why anyone picked NgRx over elf, given elf is smaller and faster

Partly first-mover, but there is a harder reason visible in the manifests:

| package | version | peer dependencies |
| --- | --- | --- |
| `@ngrx/store` | 21.1.1 | `@angular/core@^21.0.0`, rxjs |
| `@ngrx/signals` | 21.1.1 | `@angular/core@^21.0.0`, rxjs |
| `@ngneat/elf` | 2.5.1 | **rxjs only** |
| `@ngneat/elf-entities` | 5.0.2 | elf, rxjs |
| `@datorama/akita` | 8.0.1 | rxjs, tslib |

**elf declares no relationship to Angular at all.** That is a deliberate design
— it is framework-agnostic — and it cuts both ways. It never breaks on an
Angular major, and it never moves with one either. NgRx's version tracks
Angular's, which is precisely what an enterprise picking a dependency for a
five-year application is buying: a guarantee that it is compatible now and will
be maintained through the next major.

Three further things a team weighs that no benchmark shows:

- **Angular went signals-first and zoneless.** NgRx responded by shipping
  `@ngrx/signals`, an entire second library. elf, being framework-agnostic,
  structurally cannot: it has no way to depend on `signal()`. Its model is
  drifting away from the framework rather than toward it, and `toSignal` does
  not close that gap (see above).
- **The same org shipped Akita, which is now unmaintained.** Choosing elf means
  betting on a maintainer whose previous state library was abandoned. That is a
  reasonable thing to weigh and it is not a technical argument at all.
- **elf's versions are a loose constellation** — elf 2.5.1, elf-entities 5.0.2,
  elf-state-history 1.4.0 — rather than a coordinated release train. Assembling
  five packages at five independent versions is a supply-chain judgement an
  architect makes once and lives with.

**So elf being better on the axes measured here did not make it win, and would
not have.** Libraries are chosen on maintenance guarantees, framework alignment,
hiring pool and ecosystem as much as on throughput — which is worth remembering
before treating any row of this document as a strategy.

---

## Where we are ahead, and by how much

- **Granular signals for arbitrary nested state.** Every other library here is
  coarse outside its entity collection: change one field of a nested object and
  every consumer of that slice recomputes. This is the only row in the matrix
  where the answer is ✅/❌/❌/❌/❌, and it is the actual thesis of the library.
- **Markers as one concept** — `form()`, `status()`, `stored()`, `asyncSource()`,
  `asyncQuery()`, `loader()`, `compared()`, `derived()`, `linked()` all register
  through one extension point, `registerMarkerProcessor`. The others solve each
  of these with a differently-shaped plugin, or not at all.
- **Forms** — a form model with validators and a wizard, in the state library.
  Akita persists an Angular form; nobody else models one.
- **Diagnostics with stable codes** (ST2001–ST2024) that fold out of production
  builds. No competitor here ships numbered diagnostics.
- **`updateAndReport`** — which paths changed, without a diff pass.

---

## Honest limits of this document

- **Capability presence is not capability quality.** A ✅ says the API exists in
  the shipped types, not that it is good, fast, or well documented.
- **`@ngrx/store` and NGXS are Redux-model libraries.** Several 🟡s for them mean
  "expressible with reducers and selectors, with more ceremony", which is a
  different claim from "missing".
- **Akita is unmaintained upstream.** Its column is included because its feature
  set is the broadest here and worth learning from, not because it is a live
  competitor.
- **Nothing here is benchmarked.** Performance lives in
  [real-implementations.md](./real-implementations.md); this document is about
  what exists, not what it costs.
