# Form History Gate 2 Inventory

Gate 2 starts from deletion inventory, not new abstraction.

## Current ownership split

### Causal history currently owned by form history

Source: packages/core/src/lib/form-history/form-history.ts

```text
snap.past[]
snap.present
snap.future[]
undo()
redo()
clearHistory()
record()
restore()
capacity trimming
exclude-field projection
```

This is a private causal stack attached to the form values signal. It decides:

```text
what can undo
what can redo
what the previous form state was
what the next form state was
how causal future is truncated
```

That is the substrate Gate 2 should delete.

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
