# Capability matrix — what the others have that we do not

**Status:** audit, 14.0.0-rc.1.

## How this was built, and why that matters

Every row is read from the **installed `.d.ts` of the shipped package**, not from
a README or from memory of a library's marketing. Reproduce it with
`node tools/api-surface.mjs`. Versions audited:

| library | version | unique exports | entry points |
| --- | --- | --- | --- |
| `@signaltree/core` | 14.0.0-rc.1 | 248 | 6 |
| `@ngrx/signals` | 21.1.1 | 73 | 5 |
| `@ngrx/store` | 21.1.1 | 79 | 2 |
| `@ngneat/elf` | 2.5.1 | 56 | 1 |
| `@ngneat/elf-entities` | 5.0.2 | 69 | 1 |
| `@ngneat/elf-state-history` | 1.4.0 | 7 | 1 |
| `@ngxs/store` | 20.1.0 | 131 | 6 |
| `@datorama/akita` | 8.0.1 | 199 | 1 (unmaintained upstream) |

Counts are the UNION across every subpath in each package's exports map, types
included. They are a measure of surface area, not of features — see the limits
section. Ours is read from the built declaration bundle rather than the source
barrel, because reading source follows re-export chains into internal modules
and produced a number that was not comparable to anyone else's.

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
