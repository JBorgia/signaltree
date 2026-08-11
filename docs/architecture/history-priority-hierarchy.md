# History: the hierarchy of importance

**Status:** decision card, 2026-08-11. Owns the ranking, the conflict-resolution
rules, and the measured / strategic-bet / unaudited evidence that justifies them.
The executable plan — phases, gates, benchmarks — is
[history-PLAN.md](./history-PLAN.md); the goal and its derivation are
[history-the-greenfield-target.md](./history-the-greenfield-target.md); the options
considered are [2026-08-history-greenfield-spike.md](../research/2026-08-history-greenfield-spike.md).

This document exists because the design conversation collapsed back to _"which undo
stack should SignalTree use?"_ three separate times. That is the wrong question, and
the ranking below is what stops it recurring. **When two decisions conflict, the
higher rank wins and the lower rank absorbs the cost.**

---

## The objective — owned elsewhere

The objective and its derivation — bulk-safe optimistic operations, the business
drivers, the nine UX cases — are [history-PLAN.md](./history-PLAN.md) §1 and
[history-the-greenfield-target.md](./history-the-greenfield-target.md). This page only
ranks the capabilities that objective demands.

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

**Retention is its binding constraint**, and the cost has **four independent
variables**, not one. Everything in this section measures the **current `timeTravel()`
snapshot stack** — see the boundary note below before generalising any of it.

MEASURED, `--expose-gc`, one process per arm, baselined after seeding, 50,000-row
`entityMap`. Reproduce with
`node --expose-gc tools/bench-retention-arms.mjs <shape> 50000 <steps>`.

**Rows changed per entry**, at 50 entries:

| what each step changes                             | retained                           |
| -------------------------------------------------- | ---------------------------------- |
| nothing in the collection (scalar write beside it) | 0.435 MB                           |
| **1 row**                                          | **19.518 MB**                      |
| **50 different rows**                              | **19.518 MB** — identical to 1 row |
| 400 rows                                           | 20.314 MB                          |
| 4,000 rows                                         | 27.184 MB                          |
| all 50,000 rows                                    | **114.911 MB**                     |

**Temporal depth**, at 400 rows changed per step:

| entries | retained     |
| ------- | ------------ |
| 1       | **0.434 MB** |
| 5       | 2.08 MB      |
| 50      | 20.314 MB    |

Two things follow, and only for this representation:

**One row costs what fifty different rows cost.** The snapshot retains a fresh
N-pointer array per entry regardless of how many rows changed —
`50 × 50,000 × 8 bytes ≈ 20 MB`, matching 19.518 almost exactly. So ~19.5 MB is a
**per-entry floor for touching this collection at all**, not a worst case. The worst
case is 5.9× higher.

**The cost function has a second term nobody had documented:**

```
retained ≈ entries × (width × ~8 bytes  +  changedRows × ~38 bytes)
                      └── array term ──┘   └─── entity term ───┘
```

The entity term holds at 38.2–39.5 bytes per changed entity per entry across every
arm (400 rows → 0.79 MB, 4,000 → 7.66 MB, 50,000 → 95.4 MB above the floor).

> ### ⚠️ Evidence boundary: this measures the snapshot stack, NOT the turn store
>
> Every figure above is `timeTravel()`'s representation, whose cost is
> `entries × fresh-collection-array-width + changed-entity materialisation`.
>
> The proposed turn store is a different data structure: a turn holds one entry per
> attributed write, each carrying position, path, before, after, operation metadata
> and anchors. A 400-row optimistic operation is **~400 entries**, so its cost is
> plausibly `turn overhead + changedEntries × entryCost + metadata` — an **O(entries)**
> shape rather than an O(turns) one. **That has not been measured.** The Phase 2
> matrix in [the PLAN](./history-PLAN.md) exists to measure it.
>
> **What the snapshot numbers legitimately kill** is one misleading intuition: _"a
> bulk operation touching 400 records must inherently be the expensive history
> case."_ It is not — history depth and operation width are independent variables.
> That is useful, and it is as far as the evidence reaches.
>
> An earlier revision of this section wrote _"the dominant term is the number of
> turns, not the size of the operation"_ and claimed the PLAN's turn-based retention
> was "now measured." Both were over-reach: the first is true only for the snapshot
> stack at the tested shapes, and the second measured the wrong data structure. The
> architectural argument stands on its own and needs no memory evidence —
> **turns are the retention unit because they are indivisible. Memory limits decide
> how many turns fit, not whether a turn can be cut apart.**

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
- Retention **of the snapshot stack** (not the turn store): four variables — depth, width, rows-changed-per-entry, representation. ~19.5 MB is a per-entry floor for touching a 50k collection, 114.9 MB when every row changes, 0.434 MB for a single 400-row entry. Entry count O(state).
- Callback scope collapses under async; ambient attribution collapses under concurrency.
- `form()` participation is asymmetric.
- `PathNotifier` is blind to plain-leaf writes — `timeTravel()` sees them only because
  it separately wraps leaves via `interceptLeafSignals` and injects into the notifier.
  **Consequence:** an action built as a standalone notifier subscriber inherits that
  blind spot; one built inside the enhancer gets leaves for free.
- `flush()` compares by reference (`path-notifier.ts:198`), which is correct within a
  turn and insufficient across turns. Deep collapse belongs at
  `confirm()`/`rollback()`, **not** on line 198. `prunedEqual` is the reuse:
  reference-first, structural on mismatch. Known hole: it treats arrays as leaves, so
  a reconstructed **array** does not collapse.
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

## Why Phase 0 is early — the rank-2 falsifier

Because optimistic rollback is rank 2, rollback viability must be falsified **before**
prefix-closure and cross-position turns are built on top of decisions it might
contradict. The experiments — 0A ownership attribution, 0B rollback viability — their
kill gates, benchmark arms and the six rollback cases are all specified in
[history-PLAN.md](./history-PLAN.md) §5. This page records only why they come first.

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
