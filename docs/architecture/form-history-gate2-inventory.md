# Form History Gate 2 Inventory

Gate 2 starts from deletion inventory, not new abstraction.

## Current ownership split

### Legacy private history shape is now deleted

Source: packages/core/src/lib/form-history/form-history.ts

```text
snap.past[]
snap.present
snap.future[]
capacity trimming
exclude-field projection
```

This no longer exists on the form-facing API. Form history now exposes only
behavioral capabilities:

```text
undo()
redo()
canUndo()
canRedo()
```

### Causal history currently owned by the shared scoped authority

Source: packages/core/src/enhancers/time-travel/time-travel.ts

```text
turns
frontiers
position-scoped undo/redo selection
canUndo / canRedo predicates
effect replay
```

This same core now drives form history both with and without `timeTravel()`.

### Form semantics currently owned by the form marker

Source: packages/core/src/lib/markers/form.ts

```text
values signal
field patch/set/reset/clear
validators
async validators
errors / valid / errorList
submitting
wizard navigation
dirty
touched
persistence hooks
snapshot/hydrate rules for values + touched
```

These are form semantics, not evidence that forms need a separate causal engine.

Two points matter up front:

```text
dirty
-> derived from values vs initial
-> not causal storage

touched
-> interaction state
-> snapshot/restoration policy, not a private undo stack
```

## Integration seam today

The current seam is in packages/core/src/lib/markers/form.ts:

```text
config.history.attach({ read, write })
formSignal.history = historyBinding.api
__recordHistory = historyBinding.record
```

That means the form marker already has a single behavioral attachment point.
The first Gate 2 hypothesis should keep that shape and replace only the private
causal ownership underneath it.

## Gate 2 starting hypothesis

A form marker participates as one behavioral PositionId while ordinary field
writes continue to look like ordinary SignalTree form writes.

Good shape:

```ts
store.$.profile.name.set('Jon');
store.$.profile.history?.undo();
```

Bad shape:

```ts
const history = tree.history.scope(store.$.profile);
history.execute(...);
```

## First falsifiers

### A. Non-contiguous form activity

```text
T1 -> form
T2 -> unrelated state
T3 -> form

form-scoped undo
-> T3 reverses
-> T2 survives
```

### B. Cross-position indivisible turn

```text
T1 -> form + entityMap
T2 -> unrelated state

form-scoped undo
-> seeds from the form PositionId
-> selects the whole T1 closure
-> unrelated T2 survives
```

Case B is the harder proof. A private form-only stack cannot model it
correctly if T1 is indivisible.

## Gate 2 deletion target

Delete form-owned causal storage and keep form-owned UX semantics.

After a successful migration, forms may still expose scoped undo/redo as a
convenience surface, but they should not own:

```text
past/present/future causal storage
private undo/redo selection
private future truncation rules
private reversal authority
```

## Provisional state classification

Current behavior proves the following split more narrowly than the old private
stack suggested:

```text
values
-> CAUSAL
-> shared scoped undo/redo must reverse them

touched
-> SELECTIVELY CAUSAL form semantic
-> previously-established touched state is restored on form undo
-> later touched mutations are not yet characterized as standalone shared effects

dirty
-> DERIVED
-> computed from current values vs initial

valid / errors / errorList
-> DERIVED
-> recomputed from live values + validators

submitting
-> EPHEMERAL
-> never rewound by undo/redo

history grouping
-> FORM POLICY
-> if a logical form action must stay one undo step, preserve it at turn
	boundaries, not by reviving form-owned chronology
```

Do not broaden `touched` into "all marker metadata is causal" from one replay
hook. The current evidence only supports restoring touched state that was already
part of the form state the user had reached.

## Gate 2 status after convergence

```text
Stable form PositionId                    GREEN
Form writes in canonical turns            GREEN
Form-scoped selection                     GREEN
Cross-position indivisibility             GREEN
form.undo/redo shared authority           GREEN
form.canUndo/canRedo shared authority     GREEN
private stack causal authority            REMOVED
standalone/shared dual implementation     REMOVED
obsolete inspection api                   REMOVED

future mirror                             DELETED
past mirror                               DELETED
present mirror                            DELETED
grouping preservation                     CHARACTERIZED
```

## Grouping characterization

Current characterization shows a real policy difference between the legacy local
stack and shared turns:

```text
local form history (no timeTravel)
-> one form write = one undo step

shared timeTravel mode
-> synchronous form writes before the flush boundary coalesce into one undo turn

shared timeTravel mode across flush / event boundaries
-> writes separated by flushes remain separate undo steps
```

That behavior now lives in shared turn production, not in form-owned storage.
If the product wants different grouping, the fix belongs at causal boundary
production (form mutation grouping / flush policy), not by reviving
`past/present/future`.

Given the current characterization, the lightweight default is coherent:

```text
one synchronous operation / flush
-> one implicit undo turn

separate event / flush boundaries
-> separate undo turns
```

That is sufficient to freeze Gate 2 without adding new grouping configuration.

## Gate 2 frozen surface

```text
form.history.undo()
form.history.redo()
form.history.canUndo()
form.history.canRedo()
```

No `past/present/future` projection remains, and no new turn/position
inspection surface replaces it.
