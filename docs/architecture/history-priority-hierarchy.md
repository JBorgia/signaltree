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

## The conflict this hierarchy exposed, and its resolution

The ranking is not decoration. Applying it surfaced an apparent contradiction with an
invariant already written down, and resolving that contradiction produced the sharpest
distinction in the architecture.

### The apparent contradiction

Prefix-closure says applied history is prefix-closed at every participating position,
so a turn is reversible only when it sits at the applied frontier of every position it
touched. That is what makes rank 3 safe.

But take the motivating scenario. T42 optimistically writes `dispatch.trucks`,
`dispatch.drivers`, `dispatch.orders`. While the request is in flight, telemetry writes
`trucks.location` — legitimate, and to a position T42 touched, creating T43. Then the
server rejects T42.

T42 is no longer at the frontier of `trucks`, so prefix-closure forbids reversing it.

- Refusal is **correct** for rank 3: the user is told they cannot undo from here.
- Refusal is a **product failure** for rank 2: the server said no, the screen is
  showing a lie, and the app has no recourse.

And this is not an edge case. Concurrent writes during an in-flight request are the
normal condition the architecture exists for.

### The resolution: rollback is not undo

The contradiction came from an unexamined assumption — that rollback reverses a
**committed history turn**. It does not. It removes a **pending speculative** one.

`commit()` was conflating two different moments, and separating them dissolves the
conflict without weakening undo at all:

| Operation    | Purpose                                           | Frontier-constrained? |
| ------------ | ------------------------------------------------- | --------------------- |
| `abort()`    | stop recording; state untouched                   | n/a — no reversal     |
| `seal()`     | capture the net speculative mutation set          | no                    |
| `confirm()`  | promote the sealed turn into confirmed history    | —                     |
| `rollback()` | remove a rejected turn's speculative contribution | **no**                |
| `undo()`     | traverse confirmed history                        | **yes**               |

```text
                  ┌──── confirm ──→ CONFIRMED ──→ undo / redo
RECORDING → SEALED│
                  └──── rollback ─→ REJECTED
RECORDING ─ abort ─→ recording discarded, state untouched
```

Prefix-closure keeps its full strength, restated precisely:

> **Confirmed history is prefix-closed at each position.**

A pending speculative turn was never in confirmed history, so it was never subject to
the rule.

### Two causalities, not one invariant with an exception

This is the distinction to protect, because someone will later see two reversal paths
and try to unify them.

|                           | used by             | granularity                                     | why                                                               |
| ------------------------- | ------------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| **Historical causality**  | `undo()` / `redo()` | conservative, **position**-level, prefix-closed | we refuse to invent semantic independence between unrelated turns |
| **Speculative ownership** | `rollback()`        | precise, **entry**-level                        | the turn _recorded_ what it wrote; it is not guessing             |

Path-granular rollback is therefore **not an exception** to the conservative
position-level dependency rule. It is a different invariant for a different operation,
and the earlier decision should be worded to say so:

> Undo/redo preserve historical causality and use conservative position-level
> frontiers. Rollback removes a pending turn's own speculative contribution and
> evaluates conflicts at that turn's recorded entry and operation granularity.

### What rollback success actually means

The rule that prevents the naive implementation:

> **Rollback success does not mean restoring the pre-turn value. It means eliminating
> the rejected turn's SURVIVING speculative contribution without destroying legitimate
> subsequent writes.**

So for `A --T42--> B --T43--> C`, rejecting T42 leaves **C**. T43 superseded T42's
value; the rejected value B is already gone, and that is successful compensation.
Anyone implementing rollback as "apply `before` regardless of current provenance"
recreates exactly the multi-writer corruption this architecture exists to prevent.

### The limit — stated, because it cannot be engineered away

An earlier draft of this document claimed rollback must always succeed under concurrent
writes. That was too strong. Rollback cannot resolve a later write whose _premise_ was
the rejected one:

```text
x = 10
T42:  x = 20
T43:  x = x + 5   →  25      (T42 rejected — is the answer 15, 25, or an error?)
```

`before: 20, after: 25` does not say whether T43 meant "+5 independently", was an
authoritative server value, or depended on T42 and should itself be rejected. No store
can infer that.

The honest promise:

> **Concurrent writes to the same ownership position do not prevent rollback.
> Unrelated and superseding writes are preserved automatically. When a later write
> semantically depends on the rejected mutation, rollback must DETECT the conflict
> rather than silently corrupt state** — with a generic fallback of invalidating the
> affected server-owned position for refetch.

That is still far better than caller-authored compensation: the application no longer
writes `restoreDrivers(); restoreTrucks(); restoreSelection();` — SignalTree knows
which ownership positions need reconciliation.

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

## What Phase 0 must falsify — two parallel experiments

Optimistic rollback cannot remain the last phase. It is rank 2; if it is the strategic
centre it must be falsified first, not after prefix-closure and cross-position turns are
already built on top of decisions it might contradict.

### 0A — ownership attribution

> Can a stable ownership position be obtained at write time for plain leaves,
> `entityMap`, `form()`, `status()` and `stored()`, with **no measurable cost when
> history is not installed**?

The codebase already indicates where the answer lives: `entityMap` notifies
`${basePath}.${id}`, so `basePath` **is** the ownership position — already computed,
already free. If the other four markers can surrender their own path as cheaply, 0A
passes. If they cannot, that asymmetry is the finding.

### 0B — rollback viability prototype

Safe optimistic rollback is rank 2 — the strategic centre, so the semantics must be
falsified here, not after prefix-closure and cross-position turns are built on top of
them. 0B proves the semantics are viable; Phase 6 of the PLAN productizes them. The
smallest disposable prototype covering, by outcome:

1. T42 writes position A → rollback succeeds.
2. T42 writes `A.x`, T43 writes `A.y` → rollback preserves T43.
3. T42 writes `A.x`, T43 **overwrites** `A.x` → rollback preserves T43 (supersession).
4. T42 mutates a collection structurally, a concurrent mutation occurs → anchors either
   compensate correctly **or detect that they cannot**.
5. T42 and T43 pending simultaneously (attribution isolation) → neither captures nor
   rolls back the other's writes.
6. A rejected entity creation followed by writes beneath that entity → the dependency is
   detected, not silently corrupted.

Case 4 is the one that must not be skipped. Value snapshots are insufficient for
`remove row B at index 1` followed by a concurrent reorder, so **collection anchors move
out of the last phase and into this spike** — one representative structural mutation is
enough, but scalar-only would prove nothing about the primary use case.

Expect an asymmetry, and treat it as a result rather than a bug: a scalar has a
supersession answer (compare the current value against the entry's `after`), while a
structurally reordered collection may only have _compensate_ or _cannot — reconcile_.

### An open question 0B should answer while it is there

Deciding "does this speculative write still own the currently visible value?" has two
implementations with different costs:

|                                              | cost                        | hole                                                                                                                           |
| -------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| compare current value to the entry's `after` | free, no hot-path machinery | **ABA** — if a later turn wrote a different value and a third wrote the original back, T42 looks like the owner when it is not |
| carry a write stamp / generation per path    | closes ABA                  | pays on the write path, which rank 1's zero-when-unused requirement constrains                                                 |

Measure both rather than choosing. And note the ABA hole is narrow but real: restoring
`before` in that case clobbers a value a later writer deliberately set.

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
