# CausalRuntime contract

**Status:** stable pre-kernel checkpoint, 2026-08-12.

This document freezes the semantic boundary reached after the producer and
mutation-substrate proof plus the stabilization pass. It is not an extraction
plan for `TimeTravelManager` or `transactions.ts`. It defines the greenfield
runtime contract that later implementation work must satisfy.

Read this with
[history-the-greenfield-target.md](history-the-greenfield-target.md) and
[2026-08-history-greenfield-spike.md](../research/2026-08-history-greenfield-spike.md).
Those documents explain why history's unit is an action and why callback-scoped
grouping is dead. This document narrows the next task to the runtime model and
its invariants.

---

## Public constraint boundary

The stable product constraint is the steady-state reactive JSON surface after
construction, not any particular construction or builder API.

What must remain stable:

- `tree.$.a.b.c()` reads reactive state
- `tree.$.a.b.c.set(value)` writes reactive state where writable
- `tree.$.a.b.c.update(fn)` updates reactive state where writable
- tree shape remains naturally navigable through JavaScript and TypeScript
  property access
- reactive semantics remain Angular-signal-friendly

What is explicitly not architecturally frozen here:

- tree construction syntax
- enhancer installation syntax
- capability declaration syntax
- transaction setup syntax
- history setup syntax
- form setup syntax
- builder lifecycle
- `plannedSignalTree()` as a public API candidate

Design rule for the kernel phase:

> Construction API is not part of the architectural constraint.
> Post-construction reactive JSON semantics are.

This means internal lifecycle may become fully construction-first:

1. configuration
2. capability planning
3. position-topology construction
4. causal-runtime construction
5. producer specialization
6. tree exposure

After tree exposure, structural capabilities are treated as frozen. Users care
that the exposed tree still feels like a reactive JSON object; they do not care
whether setup came from `signalTree(...).with(...)`, `createTree({...})`, a
builder, or another internal construction ritual.

---

## Stable pre-kernel checkpoint

The following is treated as proven at this checkpoint:

- capability planner
- canonical BuildPlan
- tree-owned PositionTopology
- plain producer
- `status()` producer
- `stored()` producer
- `entityMap()` structural producer
- derived non-authoring behavior
- mixed-family canonical turns
- surgical rollback
- unsafe rollback refusal
- history exclusion as absence from turn participation
- benchmark semantic switches removed
- full core suite green
- `core` build green
- `core` lint green
- cleanup-precedence behavior covered by focused tests
- `maxHistorySize` semantics settled as `N` retained turns yields up to `N`
  undo operations

Non-blocking build warnings remain on the ledger around the existing Rollup
circular dependencies. They are not evidence against the causal model and do not
change this checkpoint.

---

## Non-goal

Do not start by moving code out of `time-travel.ts` or `transactions.ts`.

The sequence is:

1. Specify the desired `CausalRuntime`.
2. Map current implementations onto that contract.
3. Identify reusable algorithms.
4. Port semantics.
5. Delete obsolete managers.

The prototypes are valuable because they proved semantics, not because their
file boundaries are the target design.

---

## Canonical model

The runtime owns canonical causal turns. A turn is semantic, not producer-family
specific.

```ts
type TurnId = number;

interface CausalTurn {
  id: TurnId;
  effects: readonly CausalEffect[];
  participants: readonly PositionId[];
  state: 'pending' | 'confirmed';
}

interface CausalEffect {
  owner: PositionId;
  before: unknown;
  after: unknown;
  subjectId?: SubjectId;
  structural?: StructuralOperation;
}
```

`participants` is explicit. Ancestors matter for authority and containment, not
for authorship or attribution.

`CausalEffect` describes semantics only:

- who owned the change
- what the prior value was
- what the resulting value was
- optional structural identity when the operation is add/remove/rekey class work

The runtime must not branch on whether an effect came from plain state,
`status()`, `stored()`, `entityMap()`, or any future producer family.

---

## Runtime shape

```text
CausalRuntime
├── PositionRegistry reference
├── TurnStore
│   ├── pending turns
│   ├── confirmed turns
│   ├── position -> turn indexes
│   ├── retention
│   └── redo truncation
├── Frontiers
├── Authority
│   ├── containment
│   └── reversal eligibility
├── Speculative Compensation
│   ├── supersession
│   ├── dependency detection
│   └── rollback
└── Confirmed Reversal
    ├── undo
    └── redo
```

One tree has one `CausalRuntime`. Consumers project from it; they do not each
redefine history.

Expected projections after the kernel:

- `transactions()` as the speculative lifecycle projection
- scoped undo/redo as the confirmed-turn reversal projection
- `timeTravel()` as causal reversal plus separate temporal snapshot projection
- DevTools as an inspection projection
- provenance as an inspection/query projection

---

## Operations that must stay distinct

These may share lower-level effect application code. They are not aliases and
must not collapse into one semantic operation.

```ts
rollback(turn);
```

Removes the surviving contribution of a rejected speculative turn.

```ts
undoAt(authority);
```

Reverses the latest causally eligible confirmed turn under containment and
frontier rules.

```ts
restoreTemporalState(...)
```

Rewinds or restores a temporal snapshot view.

Rollback, historical undo, and temporal rewind are different operations even if
they eventually share representation primitives.

---

## Runtime invariants

The first implementation work should be driven by tests/specs that pin these:

1. Canonical turns are atomic. A turn cannot be partially reversed because some
   effects lie outside an authority boundary.
2. Participation is explicit. Only actual mutation owners participate; ancestors
   exist for authority, not attribution.
3. Containment and frontier are independent. Containment answers whether reversal
   is structurally allowed here; frontier answers whether it is causally allowed
   now.
4. Confirmed history is prefix-closed per participating position.
5. Rollback preserves legitimate later work.
6. Unsafe structural compensation refuses atomically.
7. Retention evicts whole turns atomically.
8. Redo truncation operates on canonical turns, not per-position fragments.
9. History exclusion means absence from turn effects and participants.
10. No producer-family knowledge exists inside the runtime.
11. Temporal snapshots are not required for causal correctness.
12. One tree has one causal runtime.

These are the contract. Existing managers are acceptable only insofar as they
can be mapped onto it without semantic loss.

---

## Immediate next step

The next phase starts with tests or a spec that exercise the invariants above,
not with code motion. The first design question is the data model for turns,
indexes, frontiers, authority, retention, rollback, undo, redo, and inspection
projections.

The first executable contract surface now lives at
`packages/core/src/lib/internals/causal-runtime/causal-runtime.contract.spec.ts`.
It is intentionally model-level: no `signalTree()` construction and no temporal
snapshot machinery.
