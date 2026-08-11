# History: the hierarchy of importance

**Status:** priority statement, 2026-08-11. Companion to
[history-the-greenfield-target.md](./history-the-greenfield-target.md) (what we are
building) and [2026-08-history-greenfield-spike.md](../research/2026-08-history-greenfield-spike.md)
(the options considered).

This document exists because the design conversation collapsed back to _"which undo
stack should SignalTree use?"_ three separate times. That is the wrong question, and
the ranking below is what stops it recurring. **When two decisions conflict, the
higher rank wins and the lower rank absorbs the cost.**

---

## The primary objective

> **Make multi-position optimistic operations safely reversible without
> caller-authored compensation. User undo/redo is a second consumer of the same
> mechanism.**

Not "better undo." The thing developers cannot do today is update several parts of
state immediately and reverse exactly that operation if the server rejects it. So
they don't: they wait.

**This is observed, not assumed.** v3's `bulkPatch$` deliberately performs **no
optimistic pre-write** — each record's slice changes only when its own PATCH
succeeds, so the user watches a progress bar through N round trips. That choice was
made because there was no way to reverse a wrong bulk apply. A real adopter avoiding
optimistic behaviour in exactly the place the design targets, for exactly the stated
reason.

The pattern to replace:

```ts
const oldDrivers = ...; const oldTrucks = ...;
const oldSelection = ...; const oldStatus = ...;
try {
  optimisticUpdateEverything();
  await save();
} catch {
  restoreDrivers(oldDrivers); restoreTrucks(oldTrucks);
  restoreSelection(oldSelection); restoreStatus(oldStatus);
}
```

The pattern to enable:

```ts
const tx = tree.transaction();
updateDrivers();
updateTrucks();
clearSelection();
setSaving();
const turn = tx.commit();
try {
  await save();
} catch {
  turn.rollback();
}
```

And `rollback()` must mean _reverse the positions attributed to this action, while
preserving legitimate writes from the server, another user, background sync,
telemetry, or an agent_ — **not** "restore an old snapshot."

---

## The hierarchy

| Rank  | Capability                                | Wins against                                       |
| ----- | ----------------------------------------- | -------------------------------------------------- |
| **1** | **Correct cross-position attribution**    | everything — nothing below works without it        |
| **2** | **Safe optimistic rollback**              | scoped undo, temporal rewind, devtools, ergonomics |
| **3** | **Scoped user undo/redo**                 | temporal rewind, devtools, ergonomics              |
| **4** | **Temporal rewind (`timeTravel()`)**      | devtools, ergonomics                               |
| **5** | **Devtools, provenance, diagnostics**     | ergonomics                                         |
| **6** | **API ergonomics and conceptual economy** | —                                                  |

Ranks 1–3 are the differentiated capability. Rank 4 is valuable and orthogonal.
Ranks 5–6 are consequences, not goals.

### What each rank protects

**1 — Attribution.** Every history-relevant write must carry a stable ownership
position. Two mechanisms have already been eliminated by measurement, and both were
the obvious implementation at the time:

- **Callback scope** dies on `await`. MEASURED via `batch()`: 5 synchronous writes →
  1 entry, 5 awaited → 2, a 12-way concurrent `mergeMap` fan-out → **12 entries**.
- **Ambient scope** dies on concurrency. Two concurrent actions each captured the
  other's paths, so undoing a rename un-archived an unrelated row.

Explicit attribution is what survives. It is a correctness requirement, not a style
preference, and it may not be traded for ergonomics (rank 6).

**2 — Optimistic rollback.** The reason the architecture exists. Every design
decision should be asked: _does this make cross-position optimistic operations easier
and safer?_

**3 — Scoped undo/redo.** The same mechanism, consumed by a user gesture instead of a
failed request. Ranked below rollback because a refusal is acceptable here — the user
can be told "cannot undo from this scope" — where a refusal at rank 2 leaves the UI
displaying a lie.

**4 — Temporal rewind.** `timeTravel()` answers _what did the tree look like then?_
That is a different question from _what did this action change?_, and neither
substitutes for the other. Production-permissible; **not** an architectural
advantage — see the measurements below.

**5 — Devtools and provenance.** Consumers of the above. They must not shape it.

**6 — Ergonomics.** Real, and last. A conceptually tidy API that cannot express
rank 2 is worthless.

---

## The live conflict this hierarchy has to resolve

The ranking is not decoration. It has an immediate consequence that contradicts a
decision already written down.

**Rank 2 (`rollback()`) collides with the prefix-closure invariant.**

The invariant: applied history is prefix-closed at every participating position, so a
turn is reversible only when it sits at the applied frontier of every position it
touched. That is what makes rank 3 safe.

But consider the motivating scenario. T42 optimistically writes `dispatch.trucks`,
`dispatch.drivers`, `dispatch.orders`. While the request is in flight, telemetry
updates a truck's location — a legitimate write to a position T42 touched, creating
T43. Then the server rejects T42.

T42 is no longer at the frontier of `trucks`. **Prefix-closure forbids reversing it.**

- Refusal is correct for rank 3. A user is told they cannot undo from here.
- **Refusal is a product failure for rank 2.** The server said no, the optimistic
  state is wrong on screen, and the app has no recourse.

And this is not an edge case — concurrent writes during an in-flight request are the
normal condition the architecture is built for.

### Three exits, none free

| Option                                             | Cost                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Rollback is not frontier-constrained               | a later turn's value at a shared path gets clobbered — the exact "reverting destroys legitimate work" failure the design exists to prevent |
| Rollback may fail, app reconciles                  | reintroduces caller-authored compensation, defeating the primary objective                                                                 |
| Frontier at **path** granularity for rollback only | works, but carves an exception into the "dependency is conservatively position-level" decision                                             |

The third is more defensible for rollback than for undo: rollback knows the exact
paths it wrote and is compensating **its own** writes, rather than inferring semantic
independence between unrelated turns. That is a narrower claim than general
path-granular dependency analysis. It is still an exception, and exceptions inside
invariants are how invariants stop being invariants.

**This must be decided before the turn store is built, not discovered afterwards.**
Under the current phasing, optimistic rollback is the last phase and prefix-closure
is built two phases earlier — so the collision would surface after the decision it
contradicts is implemented. Add a rollback spike alongside the ownership experiment:
_can a committed turn be reversed after a concurrent write to a shared position, and
if not, what happens?_

### The constraint, stated so it cannot be lost

> **Rollback must succeed in the presence of concurrent writes to positions the turn
> touched. If the frontier rule forbids that, the frontier rule is wrong for rollback
> and the exception must be stated rather than discovered.**

---

## Where rank 4 sits, and why it is not higher

`timeTravel()` earns rank 4 rather than rank 2 on measurements, not taste.

**What got cheap was recording, not restore.** Structural sharing (13.5.0) took 50
writes over 10,000 rows from **340.60 ms to sub-millisecond**. That is real and it is
what makes a second, better-scoped history mechanism affordable to build at all.

**Restore did not get cheap.** `restoreState()` is `this.tree(state)` — a full
recursive write. MEASURED and independently reproduced: `undo()` at 50,000 rows costs
**436.67 µs**, scaling 25.4 → 83.5 → 436.7 µs at 1k / 10k / 50k. **O(state).**

And the structural point cuts against treating rewind as a differentiator:
**SignalTree has no root pointer to swap.** An immutable-root store makes whole-tree
restore O(1) by construction; SignalTree is _worse_ at literal rewind than the
architectures it would be differentiating from. This is why the spike's "fix the
snapshot stack in place" option died.

436 µs is fine for a user-initiated rewind, so temporal rewind is
**production-permissible**. It is not a capability nobody else has.

**Retention is its binding constraint**, and only for one write shape. MEASURED at
50 steps over 50,000 rows: **19.5 MB** when the writes touch the wide collection,
**0.45 MB** when they are scalar writes beside it — a 43× spread on nothing but which
node is written. Unchanged collections are shared by reference between entries, so
`entries × width` is paid only by writes that touch the wide collection.

Also measured, and the reason retention must be bounded by **turns** and never by
entries: the log's entry count is O(state) — 1,050 / 10,050 / 50,050 entries at 1k /
10k / 50k — while retained bytes stay flat.

**One defect blocks rank 4 regardless of the ranking.** `timeTravel()` currently
records **nothing** for `form()` writes (`["INIT"]` only, `canUndo()` false) but
snapshots **do** carry form values, so a later unrelated write captures the form's
then-current value and undoing it rewinds the form. That is **asymmetric
participation** — excluded from recording, included in restoration — and it is
incoherent under either semantic. Either forms participate and must record, or they
do not and must be excluded from restore.

---

## Measured, versus bet

Keeping these apart is the difference between an architecture and a hope.

### Measured

- Recording cost after structural sharing; restore is O(state) with no root pointer.
- Retention: 19.5 MB vs 0.45 MB at 50k/50 depending on write shape; entry count O(state).
- Callback scope collapses under async; ambient attribution collapses under concurrency.
- `form()` participation is asymmetric.
- `PathNotifier` is blind to plain-leaf writes — `timeTravel()` sees them only because
  it separately wraps leaves via `interceptLeafSignals` and injects into the notifier.
- `flush()` compares by reference (`path-notifier.ts:198`), which is correct within a
  turn and insufficient across turns.
- A real adopter deliberately declined optimistic bulk writes for want of reversal.

### Bet

- **Multi-writer state becomes normal**, driven less by human collaboration than by
  agents: an assistant writing into app state is a second writer with no UI presence,
  so an app becomes multi-writer without becoming collaborative.
- **The more writers state has, the less acceptable snapshot rollback becomes**,
  because reverting an old tree destroys legitimate intervening work.

**Falsifier:** if applications increasingly route multi-writer state through
CRDT/event-sourced layers whose own undo and ownership systems make store-level
transactional history unnecessary, this capability is worth less than expected.

### Not yet audited

Claims of the form _"no other state system provides this"_ are **not licensed**. The
Angular set was audited by probing installed declarations — `@ngrx/signals` 21.1.1,
elf 2.5.1 / elf-state-history 1.4.0, `@ngxs/store` 20.1.0 — and none ships scoped
history. **MobX-State-Tree's patch/UndoManager and Yjs's `UndoManager`
(`trackedOrigins`) have not been audited** and are the real prior art. Required
before a public claim, not before building.

---

## How to use this document

1. **When two decisions conflict, the higher rank wins.** Say which rank you were
   protecting in the commit message.
2. **When a rank-6 concern (ergonomics, tidiness) argues against a rank 1–2
   requirement, rank 6 loses.** Ambient attribution was tidier. It was also wrong.
3. **When a proposal improves rank 4–5 at the cost of rank 2, reject it** unless the
   rank-2 cost is measured and accepted explicitly.
4. **Do not resolve a conflict on paper if it can be measured.** Every reasoned
   conclusion in this design that ran ahead of execution was wrong: `act(label, fn)`,
   ambient attribution, "collections do not record", "every doc sample is off by
   one", "the cost argument holds independently", and "one parameter at the Ops
   boundary". Six for six.
