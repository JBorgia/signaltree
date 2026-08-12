# Owner PositionId: lifetime contract and design space

**Status:** Phase 1 design note, 2026-08-11.

This note does two things, in order:

1. Defines the minimum lifetime contract owner `PositionId` must satisfy.
2. Compares implementation families against that contract before any production implementation hardens.

It is intentionally narrower than the full history PLAN. This note is about the
identity of the **behavioral owner / marker**, not the already-proven row
`SubjectId` token in `entityMap`.

## 1. Four concepts, kept separate

The current history work now relies on four distinct concepts:

```text
PositionId   = stable identity of the behavioral owner / marker
owner path   = current structural location of that owner
SubjectId    = stable identity of the thing being mutated at that location
changed path = physical value that mutated
```

For an `entityMap` row mutation:

```text
PositionId = P_rows
owner path = rows
SubjectId  = E17
path       = rows.42.driverId
```

The recent row-slice proof established `SubjectId`, not owner `PositionId`.

## 2. Lifetime scopes for owner PositionId

Three possible lifetime contracts exist:

### A. Materialization lifetime

Identity survives ordinary mutations while the materialized marker object stays
alive, but destroying and rematerializing the marker creates a new `PositionId`.

```text
same live marker object      -> same PositionId
destroy + rematerialize      -> new PositionId
```

### B. Tree lifetime

Identity survives marker rematerialization or reconstruction while the same
`signalTree(...)` instance exists, but dies with that tree instance.

```text
same SignalTree instance     -> same PositionId
new SignalTree instance      -> new PositionId
```

### C. Persistent lifetime

Identity survives serialization, reload, hydration, and reconstruction of the
tree across process boundaries.

```text
persist + reload + hydrate   -> same PositionId
```

## 3. First falsifier: does any current operation require B?

Do not choose A or B by instinct. Make this one question executable first:

> **Can the same semantic owner disappear and later be materialized again during one live tree lifetime while retained turns still need to recognize it as the same owner?**

If the answer is **no**, lifetime A is sufficient for all currently demonstrated
SignalTree requirements.

If the answer is **yes**, lifetime B becomes necessary for that concrete
lifecycle operation.

This is narrower than "same path gets the same identity." The real question is
semantic lineage, not path reuse.

```text
replace owner with a deliberately new marker at the same path
-> should normally be a NEW PositionId

implementation-level rematerialization of the same semantic owner
-> may need to preserve the SAME PositionId
```

The weakest contract that currently appears sufficient is therefore:

- **Use B only if an actually supported operation demonstrates semantic-owner rematerialization inside one live tree instance.**
- **Otherwise use A.**
- **Do not choose C without an explicit product requirement.**

Why not C by default:

- optimistic rollback currently needs retained historical distinction, not cross-process identity
- persistence adds serialization and hydration contracts to every owner identity choice
- globally durable identifiers imply storage and compatibility obligations not yet justified

The core functional requirement is narrower:

> A retained turn must distinguish the owner it originally referenced from any
> later, semantically different owner that occupies the same structural
> location.

That requirement does **not** by itself require owner identity to survive an
application reload.

## 4. Live lifetime vs reference lifetime

Owner identity needs two different lifetimes recorded explicitly:

```text
live identity lifetime      = while a live materialized owner can be resolved
reference lifetime          = while retained history may still refer to that PositionId
```

Under lifetime A, for example:

```text
P17 live:       materialization -> destruction
P17 reference:  materialization -> last retained turn containing P17 is evicted
```

Historical validity does not imply a live position is still resolvable.

The contract should therefore include this rule:

> **A PositionId may remain valid as a historical identifier after its live
> materialization ceases to exist. Historical validity does not imply a live
> position is resolvable.**

That enables APIs such as:

```ts
resolvePosition(positionId: PositionId): PositionMeta | undefined
```

while historical equality on `entry.position` remains meaningful.

The comparison domain should also be explicit:

> **`PositionId` equality is defined only within one owning SignalTree /
> history domain.**

That means tree-local allocation is valid:

```text
tree A: P1, P2, P3
tree B: P1, P2
```

without turning `PositionId` into a composite `{ treeId, id }` value on every
hot path. The enclosing history / turn store already belongs to one tree, so
global uniqueness is stronger than the current requirements demand.

## 5. Containment is a first-class requirement

`PositionId` is not only an equality token. History also needs live containment
queries such as:

```text
is P_trucks beneath P_dispatch?
what is the lowest owner containing P_trucks + P_drivers + P_orders?
```

So the likely shape separates identity from live metadata:

```ts
type PositionId = number;

interface PositionMeta {
  id: PositionId;
  parent?: PositionId;
  path: string;
}

interface HistoryEntry {
  position: PositionId;
  subject?: number;
  path: string;
  before: unknown;
  after: unknown;
}
```

The important split is:

- `PositionId` provides stable equality for retained history
- `PositionMeta` provides current containment and location for live queries

The ID should not encode hierarchy directly.

## 6. Candidate matrix

Score candidates against the chosen lifetime contract first, then by expected cost.

| Candidate                         | Relocation     | Rematerialization           | Retained after removal       | Historical equality without live owner | Cheap equality | GC-friendly live state | Registry needed | Serialization fit      | Expected unused cost | Containment fit                | Notes                                                                      |
| --------------------------------- | -------------- | --------------------------- | ---------------------------- | -------------------------------------- | -------------- | ---------------------- | --------------- | ---------------------- | -------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| Path                              | poor           | poor                        | poor                         | poor                                   | excellent      | excellent              | no              | excellent              | excellent            | direct but brittle             | aliases future owners at the same location                                 |
| Path + generation                 | good           | depends on generation owner | good                         | good                                   | good           | good                   | maybe           | good                   | low                  | separate metadata still needed | viable only if generation survives the chosen lifetime                     |
| Hidden monotonic tree-local token | excellent      | depends on lifetime A vs B  | excellent                    | excellent                              | excellent      | good                   | maybe           | possible, not required | very low             | separate metadata still needed | best default for A; for B requires an external lineage/rebinding mechanism |
| Marker object identity            | excellent live | poor beyond A               | awkward for retained history | poor                                   | excellent      | excellent live         | no              | poor                   | very low             | separate metadata still needed | collapses if history must name a dead owner cleanly                        |
| WeakMap(marker -> token)          | excellent      | depends on token owner      | good                         | good                                   | excellent      | excellent live         | yes             | poor                   | low                  | separate metadata still needed | often reduces to token + registry anyway                                   |
| Tree-owned registry token         | excellent      | excellent for B             | excellent                    | excellent                              | excellent      | controllable           | yes             | possible               | moderate             | strong                         | strongest explicit B-lifetime candidate                                    |
| UUID / ULID                       | excellent      | excellent                   | excellent                    | excellent                              | good           | good                   | maybe           | excellent              | higher               | separate metadata still needed | likely solves a stronger problem than required                             |
| User-supplied identity            | depends        | excellent                   | excellent                    | excellent                              | good           | good                   | no              | excellent              | API burden           | separate metadata still needed | not acceptable as the general mechanism                                    |

## 7. Candidates after the current probe result

- The owner-lifecycle probe above found no currently supported SignalTree
  operation that requires lifetime B.
- That means the current evidence boundary is:

  ```text
  Lifetime A  = sufficient for all currently demonstrated requirements
  Lifetime B  = not currently required
  Lifetime C  = out of scope
  ```

- Under that result, **Path** still fails the retained-history requirement immediately.
- **UUID / ULID** remain unjustified because they buy persistence C that the
  current requirements do not need.
- **User-supplied identity** remains the wrong default because it exports the
  burden to callers.
- **Marker object identity** remains weak for retained history because
  historical equality should outlive live resolvability.
- **Tree-owned registry token** should now be treated as deferred machinery:
  useful only if a concrete B-lifetime lifecycle later appears.
- **WeakMap(marker -> token)** is currently dominated by a hidden token stored
  directly on the materialized owner unless it can demonstrate an A-lifetime
  advantage beyond indirection.

That leaves the likely serious A-lifetime finalists as:

1. hidden tree-local opaque token
2. path + generation

The current default is the hidden opaque token. `path + generation` stays alive
only if it can show a concrete advantage over that simpler substrate.

## 8. Owner-lifecycle probe before any representation prototype

Before prototyping data structures, probe whether any currently supported
SignalTree operation actually requires lifetime B.

Use an explicit table and fill it with observed behavior rather than intuitions:

| Lifecycle event                   | Can representation disappear? | Can representation reappear? | Same semantic owner?           | Retained history could overlap? | Requires B? | Evidence / code path                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------- | ---------------------------- | ------------------------------ | ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ordinary marker access / laziness | no current path               | n/a                          | yes                            | yes                             | no          | `materializeMarkers()` is one-way replacement in `materialize-markers.ts`; `derived-after-tree-call.spec.ts` proves read-then-materialize works; `marker-materialization.spec.ts` proves nested markers stay materialized rather than leaking raw markers                       |
| enhancer attach / first use       | no                            | n/a                          | yes                            | yes                             | no          | `timeTravel()` installs `interceptLeafSignals(...)` over the existing tree in `time-travel.ts`; `enhancer-cleanup.spec.ts` proves attachment/cleanup, not owner rematerialization                                                                                               |
| subtree update / replacement      | yes                           | yes                          | no                             | yes                             | no          | touched subtrees are replaced while untouched ones are shared in `incremental-materialization.spec.ts`; no supported replacement path defines same-path replacement as same owner lineage                                                                                       |
| `entityMap` lifecycle             | no for the collection owner   | n/a                          | yes for row churn beneath it   | yes                             | no          | `entity-signal.ts` keeps collection state while row signals churn; `removeEntitySignal()` / `getEntitySignal()` comments cover row disappearance and return; `time-travel.spec.ts` proves reused row ids get a new subject token while the collection path stays the owner path |
| dynamic or plugin mount / unmount | no current supported surface  | no current supported surface | no current supported surface   | no current supported surface    | no          | runtime search found no mount/unmount API in `packages/core/src`; `registerMarkerProcessor()` in `materialize-markers.ts` explicitly says existing trees do not pick up post-construction registrations                                                                         |
| internal rematerialization        | no current owner-level path   | no current owner-level path  | no current owner-level surface | yes if one existed              | no          | current re-materialization comments are limited to per-row entity signals in `entity-signal.ts` (`resetEntitySignals`, `getEntitySignal`) and describe subject/node churn, not owner-position continuity                                                                        |

Search the real tree lifecycle for these cases:

1. marker laziness
2. conditional marker materialization
3. subtree replacement
4. collection reconstruction while the parent tree survives
5. enhancer attachment changing materialization
6. dynamic or plugin-style mount / unmount / remount within one tree instance

The decisive question is semantic, not object-level:

> **Would retained history or users expect the before and after owner to be the same position?**

The crucial column is not "same object?" but **"same semantic owner?"**

```text
old owner disappears
new owner appears at the same path
```

does NOT automatically imply lifetime B.

If the operation semantically replaced the owner, the correct result is usually:

```text
old owner = P17
new owner = P18
```

`same semantic owner = yes` does not by itself require B.

Lifetime B is justified only when all three are true:

```text
1. live representation disappears / recreates
2. semantics say it is still the SAME owner
3. retained references can span that gap
```

So the actual verdict function is:

```text
requires B =
  representation recreated
 && same semantic owner
 && retained-history overlap
```

That prevents an implementation detail from silently escalating the lifetime
contract.

The probe therefore needs both a positive and a negative control:

- **continuity when semantics say SAME**
- **new identity when semantics say NEW**

Include this explicit negative control:

```text
existing semantic owner at dispatch.foo -> P17
replace the thing that creates / owns dispatch.foo
new semantic owner at dispatch.foo -> P18

required: P18 != P17 unless the operation is explicitly defined as rematerialization
of the same owner lineage
```

That negative control matters because an overly sticky path-based registry could
otherwise appear to pass continuity tests while really collapsing `same path`
into `same identity`.

If no current operation demonstrates that expectation, record:

- lifetime A is sufficient for all currently demonstrated SignalTree requirements
- lifetime B is not currently required
- lifetime C is out of scope

That is not "B rejected forever." It is only:

> **No current requirement pays for B.**

If one operation does demonstrate it, name that exact operation as the reason
for B and prototype against it.

Record it in this form:

```text
Lifetime B required because:
<concrete operation>

Proof:
<executable spec>
```

## 9. What the next prototype must prove

Given the current probe result, the next prototype should target the smallest
A-lifetime owner primitive and prove these questions:

1. One owner can govern many subjects without identity collapse.
2. Subject rekey and subject remove-plus-reuse do not disturb owner identity.
3. Same path plus semantically new owner yields a new `PositionId`.
4. Retained turns keep referring to the original owner even after that owner disappears.
5. Historical equality does not require retaining the live owner object.
6. Live containment queries remain cheap enough to support ancestry and lowest-common-owner logic.
7. Unused owner bookkeeping cost is measured separately from row-subject bookkeeping cost.

## 10. Narrow research question

The next research question should stay narrow:

> **Given that lifetime A is sufficient for all currently demonstrated
> SignalTree requirements, what is the smallest owner `PositionId`
> representation that preserves retained equality without introducing a
> lineage subsystem?**

That question is stronger than asking which data structure looks elegant. It
gives the design-space sweep an actual objective function.

## 11. Current evidence after the batching rewrite

The current runtime slice now supports three distinct claims, and they should
not be collapsed into one another.

### Current implementation result

- The path-keyed scalar `PendingSlot` rewrite preserved the owner and subject
  batching boundaries in focused runtime tests.
- Under the current disciplined harness, semantic batching in the current
  implementation shows no detected regression against path-only legacy
  batching.
- Owner `PositionId` allocation is now tree-local at marker materialization
  time, not module-global, while remaining A-lifetime and intrinsically carried
  by the materialized owner.

Measured on `tools/bench-positionid-substrate.mjs` after the rewrite:

```text
current semantic batching - current path-only legacy batching
median delta: -0.345 ms
95% CI: [-1.495, +1.048] ms
```

That supports this narrow statement:

> Owner identity, subject identity, and identity-aware batching coexist in the
> current implementation with no detected hot-path regression in this workload.

And this scope statement:

> For the currently demonstrated `entityMap` / `PathNotifier` / `timeTravel()`
> slice, the Phase 1 owner identity substrate is now proven for the intended
> scope: opaque, numeric, tree-local, materialization-lifetime, and path-
> independent.

### Historical control result

The stronger question was whether the rewrite fixed a real regression or merely
caused a non-reproduced benchmark swing.

Comparing the reconstructed immediate pre-rewrite pending representation against
the current notifier under the SAME harness produced:

```text
pre-rewrite semantic batching - current semantic batching
median delta: +19.022 ms
95% CI: [+18.101, +19.935] ms
95% interval vs current median: [+45.70%, +50.34%]
```

That means the rewrite fixed a real performance regression in the earlier
pending representation.

### What remains unresolved

The preserved synthetic composite-string arm did NOT recreate that historical
cliff:

```text
current synthetic composite arm - current scalar semantic arm
median delta: +0.234 ms
95% CI: [-0.420, +0.822] ms
```

So the evidence does NOT support the stronger claim that composite-string key
encoding itself caused the entire earlier regression.

The correct attribution is narrower:

> The prior semantic-batching regression disappeared after replacing the old
> pending representation with a path-keyed scalar fast path. The specific
> dominant cause inside the prior representation remains unresolved.

Plausible contributors still include the old pending-map structure, the
composite-key allocation pattern, array carriage, and associated `Map`
behavior. None is isolated enough yet to claim individually.

### Source-boundary status

`source` remains a YELLOW semantics question, not a demonstrated break.

Two end-to-end falsifiers now exist for:

```text
time-travel replay -> user write -> same tick
user write -> time-travel replay -> same tick
```

In the currently demonstrated `timeTravel()` slice, replay writes do not become
recorded mixed transitions in history. That is because the restore path
suppresses the notifier-backed recording path while `isRestoring` is active.

That is enough to say:

- current time-travel history semantics do not require `source` to be part of
  the batching identity tuple for this demonstrated slice
- direct notifier provenance still merges distinct sources to `'mixed'`
- future recordable source classes may still justify a semantic-source boundary

So the status is:

```text
Lifetime-A PositionId semantics         GREEN
Owner boundary batching                 GREEN
Subject boundary batching               GREEN
Path-keyed scalar fast path             GREEN
Source-boundary semantics               YELLOW
Intrinsic allocation/stamping           no detected regression
Semantic batching, current impl         no detected regression
Prior semantic-batching regression      reproduced in pre-rewrite control
Cause of prior cliff                    unresolved inside old representation
Tree-local allocator                    GREEN for current scope
Containment                             deferred
```

## 12. Effect-layer evidence after the first structural slice

The effect vocabulary now distinguishes three materially different cases that
must not be inferred from `effects.length === 0` alone:

```text
true scalar net-zero
legitimate structural batch with no scalar effects
owner-only structural notification carrying queued history
```

That distinction is now explicit in the current `timeTravel()` / `entityMap`
slice rather than being guessed from whether any scalar payload survived
coalescing.

### Turn-existence rule

The current rule should be recorded explicitly:

> **Turn existence is not determined by whether `effects.length > 0`.**

The demonstrated outcomes are:

```text
scalar net-zero
+ identical final visible snapshot
-> no turn

structural batch
+ no scalar effects
+ visible state changed
-> valid turn
```

So the canonical turn layer now distinguishes:

```text
no surviving semantic mutation
```

from:

```text
no currently materialized scalar effect payload
```

That distinction is load-bearing for structural history and should be treated
as part of the effect-layer contract, not as an incidental optimization.

### Current effect-layer evidence

- `changeId` capture now binds rekey history to the owner-path structural
  notification rather than forcing rekey to masquerade as remove+add.
- Mixed scalar + collection-remove turns now prove one canonical heterogeneous
  turn can be undone and redone atomically from any participating position.
- Mixed-turn prevalidation is now falsified for the unsupported-add case:
  when one canonical turn contains both a supported scalar effect and an
  unsupported structural effect, no scalar write applies and no frontier
  moves.
- Collection add replay now preserves historical creation identity: undo
  removes the row, redo restores the same `SubjectId` rather than allocating a
  fresh one.
- Non-append add replay now restores the original anchored position for the
  demonstrated prepend case rather than silently replaying as append.
- Mixed add + scalar turns now prove whole-turn atomicity in both directions:
  they undo/redo together when valid, and a poisoned add restore blocks sibling
  scalar replay before any frontier moves.
- Rekey replay now preserves subject identity across undo/redo: changing the
  domain key relocates the historical `SubjectId` but never changes it.
- Mixed rekey + scalar turns now prove whole-turn collision prevalidation in
  both directions: replay refuses to steal an occupied key and blocks sibling
  scalar replay before any frontier moves.

So the current status is:

```text
Canonical turn store                     GREEN
Undo dependent closure                   GREEN
Redo prerequisite closure                GREEN
Scalar selective replay                  GREEN
Global future truncation                 GREEN
Net-zero scalar suppression              GREEN
Collection remove capture/replay         GREEN / first structural slice
Rekey capture                            GREEN
Rekey replay                             GREEN
Collection add replay                    GREEN
Add anchor preservation                  GREEN / prepend proof
Mixed scalar+collection turn             GREEN
Prevalidation atomicity for mixed turns  GREEN / add and rekey collision falsifiers
```

The next effect-layer rule should therefore be explicit:

> **Freeze the current turn/effect architecture unless new evidence attacks
> it.**

`rekey` was the last materially different collection-vocabulary stress test for
this phase because it changed domain key without changing `SubjectId`,
`PositionId`, or `Turn`, and the collision cases still fit existing whole-turn
prevalidation.

That changes the objective function for the next phase:

> **Do not count new capabilities first. Count old responsibilities removed.**

The immediate work should now focus on subtraction and migration in this order:

1. migrate public confirmed undo/redo off the old snapshot-reversal path and onto the canonical turn engine
2. kill the invariant that notifier flush defines causality
3. remove per-position copied confirmed-history payloads so canonical turns become the single authoritative confirmed action payload
4. test form-history convergence against the generic owner/effect substrate
5. only then widen into transaction lifecycle and speculative rollback integration

## 13. Deletion / demotion inventory after collection-vocabulary proof

The new substrate should now be evaluated not only by what it enables, but by
which older semantic responsibilities it makes redundant.

Use these dispositions:

```text
DELETE         = old invariant/semantic responsibility should go away
REPLACE        = old mechanism should be subsumed by the new substrate
DEMOTE         = still useful, but no longer owns causal history semantics
KEEP           = distinct concern; remains first-class
MIGRATE LATER  = expected consolidation target, but not immediate
```

### Migration order

The first target should be old snapshot-based public `undo()/redo()`.

First migration gate:

```text
Goal:
public undo()/redo() stops depending on snapshot causality

Turn engine becomes authoritative for:
- selecting what to reverse / reapply
- maintaining frontiers
- preserving turn indivisibility
- selective state replay

Snapshot system remains authoritative only for:
- temporal rewind / inspection
```

Desired split:

```text
public undo/redo
      -> Turn engine

timeTravel(timestamp/index/etc.)
      -> snapshot engine
```

Do not delete snapshot capture yet. Delete its responsibility for causal
reversal first.

That creates the clean boundary:

```text
Before

snapshots
|- undo
|- redo
`- temporal rewind

After

Turn engine
|- undo
`- redo

snapshots
`- temporal rewind
```

Keep the first public migration deliberately narrow. Do not migrate forms,
transactions, or optimistic rollback in the same slice. The first proof target
is only this:

> **Can ordinary public confirmed history stand entirely on the turn/effect
> substrate while snapshots remain temporal-only?**

### Freeze the abstraction boundary now

The causal substrate should now be described in five explicit layers:

```text
Canonical Turn Store
  ↓
Selector
  ↓
Execution Plan
  ↓
Effect Engine
  ↓
Commit Policy
```

Where each layer owns a different concern:

```text
Canonical Turn Store
-> Turns, participating PositionIds, SubjectIds, effects

Selector
-> which Turn(s) or closure are being requested?

Execution Plan
-> which effects, in what order, under what validation rules?

Effect Engine
-> validate and apply primitive effects

Commit Policy
-> what does this execution MEAN for surrounding state bookkeeping?
```

This extra split matters because confirmed undo/redo and rollback should share
effect primitives without forcing rollback to inherit confirmed-history frontier
semantics merely because both replay effects.

The intended shape is therefore:

```text
confirmed undo
-> selector picks latest applicable confirmed Turn / closure
-> plan applies newest -> oldest
-> effect engine validates + replays primitives
-> commit policy moves confirmed frontiers

confirmed redo
-> selector picks earliest unapplied confirmed Turn / closure
-> plan applies oldest -> newest
-> effect engine validates + replays primitives
-> commit policy moves confirmed frontiers

rollback
-> selector picks a rejected/pending Turn contribution
-> plan computes surviving-compensation / conflict rules
-> effect engine validates + replays primitives
-> commit policy mutates pending/rejected state, not confirmed frontiers

inspection / provenance
-> selector picks Turns
-> plan may inspect only
-> effect engine may not run
-> commit policy mutates nothing
```

Temporal rewind remains a separate system:

```text
Snapshot Timeline
      ↓
   jumpTo()
      ↓
temporal reconstruction
```

### Frozen invariants

Freeze these statements now and treat violations as architectural regressions:

> **New causal capabilities must not require users to abandon reactive JSON or dot-notation mutation.**

> **State remains the API. Causal machinery observes and augments normal state mutations; it never replaces them with a second mutation model.**

> **Capabilities belong to the JSON shape, not to an orchestration framework surrounding the JSON.**

Priority order for this work:

```text
1. reactive JSON / shape-first DX
2. capabilities attached to the shape
3. ordinary dot-notation reads and writes
4. internal causal machinery
```

If a history, transaction, or rollback design is internally elegant but starts
teaching users to think in turn ids, selectors, effects, scopes, execution
plans, or commit policies, it is the wrong SignalTree design.

> **Scopes select turns; scopes do not own history.**

> **Turns own causal effects; snapshots own temporal state.**

> **A turn is indivisible everywhere it participates.**

> **Markers contribute behavioral ownership boundaries; they do not create history stacks.**

> **Selection determines what causal work is requested; commit policy determines what that execution means.**

That last rule is what keeps confirmed undo and speculative rollback related
without pretending they are the same operation.

That first rule constrains the entire migration from the product side:

```text
tree.user.name.set('Jon');
tree.undo();
```

must remain the mental model. The turn/effect/frontier substrate exists so
ordinary SignalTree writes acquire stronger guarantees without the user having
to think in terms of actions, reducers, selectors, execution plans, or commit
policies.

The correct framing is therefore:

```text
user-facing SignalTree
-> reactive JSON
-> state literal is the API
-> dot notation
-> ordinary reads / writes
-> history / transactions / optimistic updates as conveniences

internal substrate
-> PositionId / SubjectId ownership
-> causal Turns
-> effect capture + replay
-> frontiers + closure
-> rollback conflict handling
```

The internal substrate should be treated like invisible plumbing, not the
public product model. SignalTree should not teach users to think in terms of
canonical turn stores, selector layers, effect engines, or commit policies.
Those concepts are valid implementation vocabulary and inappropriate DX
vocabulary.

This is stricter than internal consolidation alone. SignalTree should not drift
from:

```text
JSON
-> make it reactive
-> keep its shape
-> attach capabilities where useful
```

toward a user-facing architecture organized around Turn selection and replay.
Those are beneath-the-waterline implementation concepts, not the product's
composition model.

Markers now fit the model unusually well:

```text
unmarked ordinary state -> P_root
form(...)               -> P_form
entityMap(...)          -> P_entities
future behavioral marker-> P_marker
```

Each marker contributes a behavioral owner identity into the shared canonical
store. None of them should own a parallel history stack.

Publicly, the relevant principle is simpler:

> **Capabilities stay attached to the JSON node where they belong.**

So a marker may establish an internal ownership position for causal history
without teaching the user that a new history-position concept exists.

### Migration test classes

Shadow comparison is useful during the public undo/redo migration, but it must
not silently turn the old snapshot engine into the specification for the new
one.

Classify migration tests explicitly:

```text
LEGACY-EQUIVALENT
both systems are expected to match

NEW-SEMANTICS
turn-based undo/redo intentionally differs because it preserves unrelated present state
```

Seed the first migration suites with concrete cases.

`LEGACY-EQUIVALENT` should use intentionally boring paths where both systems
should converge to the same visible state:

```text
single scalar write
single entity-field write
single collection remove
single collection add
single collection rekey
ordinary sequential undo / redo
```

`NEW-SEMANTICS` should prove cases where snapshot equality must not define
correctness:

```text
T1 -> A+B
T2 -> unrelated C

undo from B

required:
T1 reverses according to closure
C remains at T2
```

Example non-equivalence case:

```text
T1 -> A+B
T2 -> unrelated C

undo B
```

Turn-based selective undo may preserve `C`; snapshot rewind may not. That is a
semantic improvement, not a migration failure.

The migration harness must therefore not use old/new full-state equality as a
universal gate.

Useful transition invariant:

```text
undo()/redo()
-> must never ask "which snapshot should I restore?"

timeTravel()
-> may ask exactly that
```

If public confirmed history still needs snapshot position/index inspection to
decide causality, the migration is not complete.

### Current inventory as migration plan

Add one implementation column during the migration itself:

```text
Can old code be physically deleted yet?
YES / NO - blocked by ...
```

| Existing responsibility                 | Disposition         | Migration target / rationale                                                | Physical deletion gate                                                                                                                                                                         |
| --------------------------------------- | ------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| snapshot user undo                      | REPLACE             | public undo via canonical Turn/effect engine + frontiers                    | when all public confirmed undo paths route through the turn engine, legacy-equivalent cases pass, new-semantics cases pass, and no production caller still needs snapshots for causal reversal |
| snapshot user redo                      | REPLACE             | public redo via canonical Turn/effect engine + frontiers                    | when all public confirmed redo paths route through the turn engine, legacy-equivalent cases pass, new-semantics cases pass, and no production caller still needs snapshots for causal reversal |
| temporal snapshots                      | KEEP                | explicit `timeTravel()` consumer for temporal rewind / inspection           | no deletion planned                                                                                                                                                                            |
| `flush == causal history entry`         | DELETE as invariant | Turn boundary defines causality; flush remains observation transport        | when implicit turn attribution exists independently of flush                                                                                                                                   |
| per-position copied history payloads    | REPLACE             | `PositionId -> TurnId[]` indexes + frontier only                            | when canonical turns are authoritative everywhere                                                                                                                                              |
| form-specific history engine            | MIGRATE LATER       | generic owner/effect engine if form semantics fit                           | blocked by generic form proof                                                                                                                                                                  |
| path as ownership identity              | DEMOTE              | `PositionId` owns behavioral identity; path remains location/debug metadata | when no confirmed-history equality depends on path                                                                                                                                             |
| collection-specific history scaffolding | DEMOTE              | collection replay primitives only; generic engine owns history semantics    | when caller-facing history semantics no longer depend on it                                                                                                                                    |
| caller-authored optimistic compensation | REPLACE             | pending Turn lifecycle plus rollback selection semantics                    | blocked by pending-turn production flow                                                                                                                                                        |
| `PathNotifier`                          | KEEP                | observation/batching transport only                                         | no deletion planned                                                                                                                                                                            |

Two migration rules matter here:

1. deleting a semantic responsibility is more important than deleting a file immediately
2. the new substrate is not done when new features work; it is done when confirmed history, transactions, and optimistic compensation no longer require parallel causal/history models

### Strong deletion criteria

These are the intended simplifications, not optional cleanup:

```text
one confirmed causal action
-> one authoritative payload

notifier flush
-> observations

Turn boundary
-> causality
```

For ordinary synchronous writes, one implicit turn may still happen to align
with one flush. That is implementation convenience, not the invariant.

This distinction becomes mandatory once explicit transactions exist:

```text
const tx = tree.transaction();

changeA();
await work;
changeB();

tx.seal();
```

Multiple flushes may still belong to one Turn.

The public undo/redo migration may initially consume whatever implicit turns
the runtime currently produces, but it must not promote:

```text
one flush = one Turn
```

into the new public contract.

Conceptual ownership stays:

```text
today:
flush happens to close implicit turn

target:
turn boundary defines causality
flush only transports observations
```

### Next implementation sequence

The confirmed-history migration phase should now be treated as this explicit
sequence:

```text
1. Replace public confirmed undo with turn/frontier execution.
2. Cover LEGACY-EQUIVALENT undo cases: scalar, entity-field, remove/add/rekey, ordinary sequential undo.
3. Replace public confirmed redo through prerequisite closure.
4. Cover sequential redo and branch truncation.
5. Add NEW-SEMANTICS cross-position proof where unrelated later state survives.
6. Verify timeTravel() still performs genuine temporal snapshot restoration independently.
7. Search production code for remaining causal-reversal reads of snapshots.
8. Only then delete or demote snapshot-based undo/redo paths.
9. Make canonical Turn store/indexes the only confirmed-history authority.
10. Remove flush-defined causality as an invariant.
11. Migrate another producer, likely form history.
12. Extract / invert turn-engine ownership when migration pressure justifies it.
13. Then connect explicit transactions and pending rollback.
```

### Authority-split proof case

Add one scenario that proves the public/history split directly, not just by
method naming:

```text
T1 -> A+B
T2 -> unrelated C
```

Then:

```text
undo(B)
```

must selectively reverse the required turn closure while preserving `C`.

After that, invoke explicit temporal rewind through `timeTravel()` and prove
that it can still rewind `C` when asked to move to the earlier temporal point.

That demonstrates in one executable slice:

```text
undo
-> causal / selective

timeTravel
-> temporal / global
```

### Proof gates after Gate 1

The roadmap now has three successive proof gates:

```text
GATE 1
public confirmed history migrates
-> snapshot causal reversal deleted

GATE 2
forms migrate
-> second major state family shares the same history engine

GATE 3
transactions + pending rollback migrate
-> the same Turn/Effect substrate owns confirmed and speculative causality
```

### Gate 1 complete

Confirmed causal history is now turn/frontier-based; snapshot history is
temporal-only. Normal SignalTree writes remain the mutation API.

The final dependency audit answers the boundary questions this way:

```text
confirmed history
-> can operate without currentIndex authority

temporal travel
-> can operate without frontier authority

temporal snapshots
-> may reconstruct visible state
-> are not authoritative for semantic identity or causal reconstruction
```

The new `isTemporalViewActive` flag is acceptable because it answers only one
question:

```text
do the live values currently represent a temporal snapshot view?
```

It must not answer:

```text
what turn is applied?
what can undo?
what can redo?
what causal future exists?
```

### Gate 2 success criteria, tightened

Gate 2 should now be defined as deletion of form-owned causal history, not just
feature parity.

After Gate 2, this should be gone:

```text
form
├ history[]
├ redo[]
├ causal storage
└ reversal algorithm
```

And the surviving form responsibilities should look like:

```text
form
├ PositionId
├ mutation/effect production
├ grouping policy
├ dirty/touched/validation behavior
└ scoped-history UX
  ↓
shared selector / turn engine
```

`form.undo()` may survive as a convenience projection over a position selector.
A form-owned causal stack should not.

Use two falsifiers to prove the migration is real:

```text
Case A: non-contiguous independent activity

T1 -> P_form
T2 -> P_telemetry
T3 -> P_form

form-scoped undo
-> selects the latest form Turn / closure
-> telemetry survives

Case B: cross-position indivisible Turn

T1 -> P_form + P_orders
T2 -> P_telemetry

form-scoped undo
-> seeds from P_form
-> selects T1
-> T1 remains indivisible
-> form and order effects reverse together
-> telemetry survives
```

Case B is the stronger proof because an independent form-owned stack cannot
model it correctly: the form position may LOCATE the action, but it may not
redefine only the form-shaped portion of an indivisible Turn.

One further Gate 2 requirement should be stated up front:

```text
form grouping policy
-> may influence Turn boundary

form grouping policy
-> must not require a private form history stack
```

That keeps the distinction between observation cadence and causal boundary
explicit when form typing/keystroke grouping migrates.

Add the corresponding DX gate:

```text
form migration is only successful if form history moves onto the shared
substrate WITHOUT requiring the user to learn or configure that substrate.
```

Good shape:

```text
form.name.set('Jon');
form.undo();
```

Bad shape:

```text
const history = tree.history.scope(form);
history.execute(...)
```

That distinction matters more than internal elegance. Internal consolidation is
only a win if the public reactive-JSON / dot-notation experience stays flat or
gets simpler.

The same rule should constrain later transaction and rollback work:

```text
const pending = store.transaction(() => {
  store.$.orders.updateOne(id, { status: 'assigned' });
  store.$.drivers.updateOne(driverId, { activeOrderId: id });
});
```

The transaction wrapper may declare causal grouping. It must not replace normal
SignalTree writes with a second mutation language.

The same applies to Gate 2 forms work. A bad success criterion is "forms now
use the generic causal engine". A good success criterion is "the standalone
form history machinery disappeared while form usage stayed natural and
shape-local".

### Terminology guardrail

Keep terms such as `selector`, `effect engine`, `canonical turn store`, and
`commit policy` in internal architecture discussions. They should not become the
normal public vocabulary for SignalTree features.

Public-facing explanations should stay anchored in existing SignalTree idioms:

```text
reactive JSON
state as shape
signals at every path
markers
enhancers
undo / redo
transactions
optimistic updates
```

If an extraction is conceptually elegant internally but starts to make
SignalTree sound like an architecture framework rather than reactive JSON, that
extraction is probably too visible.

### Ongoing rejection test

Every implementation step should answer both questions:

```text
1. Did this preserve the causal invariants?
2. Did this keep reactive JSON as the user's mental model?
```

If either answer is no, the work is not finished.

### Architectural checkpoint after confirmed-history migration

After confirmed undo/redo migration, form history is the first important
generalization test outside the collection family that motivated the current
work.

The question is not whether forms keep form-specific UX. They can and should.
The question is whether forms still need a distinct causal history model.

Target shape:

```text
form owner PositionId
+ field effects
+ canonical Turns
```

If that works without a second history engine, the generic-state claim becomes
materially stronger.

### Code-organization consequence

The current engine lives inside `time-travel.ts` because that was the right
experimental seam. It should not necessarily remain owned by `timeTravel()`
long-term.

Target ownership inversion:

```text
turn-history/
  turn-store
  frontiers
  closure
  effects
  replay

timeTravel
  -> consumes snapshot capability

history/undo
  -> consumes turn engine

transactions
  -> produce turns

optimistic rollback
  -> consumes pending turns
```

Do not extract that prematurely. Extract only when the confirmed-history
migration makes the ownership inversion concrete rather than theoretical.
