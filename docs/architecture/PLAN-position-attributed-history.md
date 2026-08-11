# PLAN — Position-Attributed Transactional History

**Status:** plan of record for branch `feat/position-attributed-history`, 2026-08-11.
Supersedes the phase ordering in `TODO.md` item 2. Target: **16.0.0**.

**Authority.** When this document and any other disagree about ordering or priority,
this one wins. When a design question arises that this document does not answer, the
tie-break is [history-priority-hierarchy.md](./history-priority-hierarchy.md).

**Companions, not duplicates.** Read them once each rather than restating them here:

| Document                                                                               | What it holds                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [history-priority-hierarchy.md](./history-priority-hierarchy.md)                       | the ranking, the rollback/prefix-closure resolution, measured/bet/unaudited |
| [history-the-greenfield-target.md](./history-the-greenfield-target.md)                 | why the unit is a named action, the falsified `act(label, fn)`              |
| [2026-08-history-greenfield-spike.md](../research/2026-08-history-greenfield-spike.md) | the six options and why four are eliminated                                 |
| [undo-business-and-ux-cases.md](../audits/2026-08/undo-business-and-ux-cases.md)       | 9 UX cases, 11 workloads, 4 business drivers                                |
| [history-current-state-gap.md](./history-current-state-gap.md)                         | what exists in core today vs the model, marker by marker                    |

---

## 1. The objective

> **Make multi-position optimistic operations safely reversible without
> caller-authored compensation. User undo/redo is a second consumer of the same
> mechanism.**

Not "better undo." The capability developers lack is updating several parts of state
immediately and reversing exactly that operation when the server rejects it. So they
don't: they wait.

**Observed, not assumed.** v3's `bulkPatch$` deliberately performs **no optimistic
pre-write** — each record's slice changes only when its own PATCH succeeds, so the
user watches a progress bar through N round trips. Chosen because there was no way to
reverse a wrong bulk apply. A real adopter avoiding optimistic behaviour in exactly
the place this design targets, for exactly the stated reason.

Replace this:

```ts
const oldDrivers = ...; const oldTrucks = ...;
try { optimisticUpdateEverything(); await save(); }
catch { restoreDrivers(oldDrivers); restoreTrucks(oldTrucks); /* … */ }
```

With this:

```ts
const tx = tree.transaction();
updateDrivers();
updateTrucks();
updateOrders();
const pending = tx.seal();
try {
  await save();
  pending.confirm();
} catch {
  pending.rollback();
}
```

`rollback()` means _reverse the positions attributed to this action, preserving
legitimate writes from the server, another user, background sync, telemetry, or an
agent_ — **not** "restore an old snapshot."

**Every design decision is judged against:** does this make cross-position optimistic
operations easier and safer?

---

## 2. The model in one page

> **The tree defines ownership. Turns define causality.**
>
> **History inherits tree ownership: a turn is reversible from the lowest position
> that contains every ownership position attributed to that turn.**
>
> **A turn is indivisible across all positions attributed to it.**

**Ownership position ≠ physical path.** The path answers _what changed_; the position
answers _where the behaviour belongs_. A marker owns its auxiliary state even when the
value physically lives elsewhere. Containment uses **ownership**.

**Only attributed positions belong to a turn.** A position excluded from history
(`recordHistory: false`) is outside the turn; leaving it untouched during reversal is
**not** partial reversal.

**Storage.** One canonical turn store; position indexes reference **turn ids**, never
independently-retained entries. That makes a partially-retained turn unrepresentable.

```
TurnStore:      TurnId -> Turn { id, entries[], positions[] }
PositionIndex:  PositionId -> ordered TurnId[]
Entry:          { position, path, before, after, mutation? }
```

**Not a general DAG.** Ordered position chains sharing atomic turn nodes. The frontier
rule guarantees the applied set is a **prefix** of every position's chain, which is why
this needs no graph machinery.

---

## 3. Five operations, and what constrains each

| Operation           | State                            | Recording                     | Frontier-constrained? |
| ------------------- | -------------------------------- | ----------------------------- | --------------------- |
| `abort()`           | untouched                        | discarded                     | n/a — no reversal     |
| `seal()`            | untouched                        | captured as a pending turn    | no                    |
| `confirm()`         | untouched                        | promoted to confirmed history | —                     |
| `rollback()`        | speculative contribution removed | pending turn discarded        | **no**                |
| `undo()` / `redo()` | reversed if eligible             | retained                      | **yes**               |

```
                    ┌──── confirm ──→ CONFIRMED ──→ undo / redo
RECORDING → SEALED  │
                    └──── rollback ─→ REJECTED

RECORDING ─ abort ─→ recording discarded, state untouched
```

**`commit()` is gone as a name**, deliberately. It conflated _seal the recorded set_
with _the server accepted this_. Separating them is what dissolves the
rollback/prefix-closure collision — see the hierarchy doc.

### The two causalities

|                           | used by         | granularity                                     | why                                                               |
| ------------------------- | --------------- | ----------------------------------------------- | ----------------------------------------------------------------- |
| **Historical causality**  | `undo` / `redo` | conservative, **position**-level, prefix-closed | we refuse to invent semantic independence between unrelated turns |
| **Speculative ownership** | `rollback`      | precise, **entry**-level                        | the turn _recorded_ what it wrote; it is not guessing             |

Path-granular rollback is **not an exception** to the conservative rule. It is a
different invariant for a different operation. Someone will eventually see two
reversal paths and try to unify them; this table is why they must not.

### What rollback success means

> **Eliminate the rejected turn's SURVIVING speculative contribution without
> destroying legitimate subsequent writes.** Not "restore the pre-turn value."

`A --T42--> B --T43--> C`, reject T42 → **C stays C**. T43 superseded it; the rejected
value B is already gone, and that is successful compensation. Implementing rollback as
"apply `before` regardless of current provenance" recreates the exact multi-writer
corruption this architecture exists to prevent.

**The limit, stated because it cannot be engineered away.** Rollback cannot resolve a
later write whose _premise_ was the rejected one:

```
x = 10;  T42: x = 20;  T43: x = x + 5  → 25.   T42 rejected. Is the answer 15, 25, or an error?
```

`before: 20, after: 25` does not say whether T43 meant "+5 independently", was
authoritative, or should itself be rejected. **The promise:** concurrent writes to a
shared position do not prevent rollback; unrelated and superseding writes are
preserved automatically; a later write that semantically **depends** on the rejected
mutation must be **detected**, not silently corrupted — with invalidate-for-refetch as
the generic fallback.

---

## 4. Settled decisions

Treat as settled unless implementation evidence falsifies them. Numbered for citation
in commit messages.

1. Tree positions define semantic ownership.
2. Ownership position and physical path are distinct concepts.
3. Turns are the atomic unit of causality and reversal.
4. Only attributed positions belong to a turn.
5. A turn is indivisible across all attributed positions.
6. Position indexes reference canonical turns; they never independently own entries.
7. Retention belongs to the turn store. Per-position `capacity` is removed.
8. Per-position **depth**, if ever supported, is a **view** constraint — never retention.
9. Undo authority derives from tree containment at the call site.
10. Confirmed history is prefix-closed at every participating position.
11. Undo/redo dependency is conservatively position-level. **Rollback evaluates
    conflicts at the entries the turn actually wrote.**
12. `seal()` captures the net speculative mutation set; `confirm()` promotes it.
13. `abort()` discards recording and does **not** revert state.
14. Attribution must be isolated between concurrent transactions. Ambient attribution
    is forbidden **by invariant**, not by preference — it was falsified.
15. Collection operation metadata enriches value diffs; it does not replace them.
16. Temporal rewind and action reversal are distinct production semantics.
17. `timeTravel()` is production-**permissible** for the temporal semantic — at a cost
    the caller accepts, not as an architectural advantage.
18. Participation must be symmetric: a position that does not record into a history
    must not be restored by it. _(This is the 6a fix, as an invariant.)_
19. `PositionId` is the stable identity of the owning position/marker — never a mutable
    entity key or path segment.
20. No history feature may impose measurable overhead when unused.
21. Every phase has a falsification gate.
22. Traversal semantics come from the **call site**, never a `mode` / `scope` /
    `strategy` flag.

### Two eliminated by measurement — do not revive

- **`act('label', fn)`** — callback scope is dynamic scope and dies on `await`.
  MEASURED via `batch()`: 5 sync writes → 1 entry, 5 awaited → 2, a 12-way concurrent
  `mergeMap` fan-out → **12 entries**.
- **Ambient attribution** — two concurrent actions each captured the other's paths, so
  undoing a rename un-archived an unrelated row.

That leaves **explicit attribution** as the only surviving mechanism, by exhaustive
elimination rather than assertion.

---

## 5. Phase 0 — falsify the foundation before building anything

Two parallel experiments. **Both are disposable prototypes.** Neither is implementation.

### 0A — ownership attribution

> Can a stable ownership position be resolved at write time for plain leaves,
> `entityMap`, `form()`, `status()` and `stored()`, with **no measurable cost when
> history is not installed**?

The codebase indicates where the answer lives: `entityMap` notifies
`${basePath}.${id}`, so `basePath` **is** the ownership position — already computed,
already free. If the other four markers can surrender their own path as cheaply, 0A
passes. If they cannot, that asymmetry is the finding.

Known cost: this likely changes the notify contract to carry an owner, and that is the
**write path**, which is where decision 20 bites.

**Measure the contract change itself, four arms** (under the §7 methodology): the
current 3-arg `notify(path, value, prev)` · owner-capable notify with history
**absent** · owner-capable notify with history installed but **inactive** · history
**actively recording**. Arms 1→2 isolate the decision-20 cost — what an owner costs
when nothing consumes it — and are the pair the gate depends on.

**Also prove identity stability:** record a turn, `changeId`, then inspect the original
turn's ownership references. Then deliberately derive `PositionId` from the mutable id
and prove the test fails.

**GATE:** proceed only if ownership is correct _and_ unused cost is unmeasurable.

### 0B — rollback viability prototype

Safe optimistic rollback is **rank 2** — the strategic centre the whole model exists
to serve. 0B proves the **semantics** are viable; **Phase 6** productizes them. If
speculative compensation cannot survive overlapping writers, the rest of the machinery
(turns, indexes, frontiers, retention, redo) is being built on a premise the primary
use case has already falsified.

The smallest prototype covering these, **by outcome**:

| #   | Case                                                              | Expected                                                         |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | T42 writes position A                                             | rollback succeeds                                                |
| 2   | T42 writes `A.x`, T43 writes `A.y`                                | rollback preserves T43                                           |
| 3   | T42 writes `A.x`, T43 **overwrites** `A.x`                        | rollback preserves T43 (supersession)                            |
| 4   | T42 mutates a collection structurally, concurrent mutation occurs | anchors compensate **or detect they cannot**                     |
| 5   | T42 and T43 pending simultaneously (attribution isolation)        | neither captures nor rolls back the other's writes — invariant I |
| 6   | Rejected entity creation, then writes beneath that entity         | dependency detected, not silently corrupted                      |

**Case 4 must not be skipped.** Value snapshots cannot compensate `remove row B at
index 1` followed by a concurrent reorder — so **collection anchors move out of the
last phase into this spike**. One representative structural mutation is enough; a
scalar-only spike proves nothing about the primary use case.

**Expect an asymmetry and treat it as a result:** a scalar has a supersession answer
(compare current value to the entry's `after`); a structurally reordered collection may
only have _compensate_ or _cannot — reconcile_.

**Open question 0B should answer while it is there:**

| Supersession detection                   | Cost       | Hole                                                                                                     |
| ---------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| compare current value to entry's `after` | free       | **ABA** — later turn writes X, a third writes the original back, T42 looks like the owner when it is not |
| per-path write stamp / generation        | closes ABA | pays on the write path that decision 20 constrains                                                       |

Measure both rather than choosing. The ABA hole is narrow but real: restoring `before`
there clobbers a value a later writer deliberately set.

**GATE:** proceed only if cases 1–3 and 5 pass outright and case 4 either compensates
or detects. Silent corruption in any case is a stop. A failure here is a **rank-2
failure**: speculative compensation cannot survive overlapping writers, and the model
should not be built on it.

0B's bar is a disposable prototype demonstrating the cases above, nothing more. Phase 6
(productization, §6) is where it becomes the shipped, correctness-gated integration.

---

## 6. Phases 1–6, each with a kill criterion

| Phase                                      | Work                                                                                                                              | GATE                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — position history**                   | generalise the shipped position-owned mechanism; canonical position identity; participation/exclusion; **resolve 6a's asymmetry** | existing scoped-history behaviour reproduced under the ownership model; mutation tests prove containment                                |
| **2 — turn store**                         | `TurnId`, canonical turns, position→turn indexes, turn-based retention, remove `capacity`, atomic eviction, frontier tracking     | single-position history passes existing semantics **plus** atomic eviction and truncation invariants                                    |
| **3 — cross-position transactions**        | explicit attribution threaded through the call graph                                                                              | **real application actions produce useful NON-ROOT ownership boundaries often enough for containment to be a usable interaction model** |
| **4 — redo and truncation**                | redo from the same frontier model; conservative first truncation policy, documented                                               | no sequence produces divergent position histories or violates prefix closure                                                            |
| **5 — collection metadata**                | anchors for remove/insert/prepend/reorder/rekey                                                                                   | positional inverses survive reorder/rekey/drift **or fail loudly without corruption**                                                   |
| **6 — optimistic rollback productization** | productize the 0B-viable semantics: turns as the primitive for cross-position optimistic workflows                                | a real multi-position optimistic workflow removes bespoke compensation without sacrificing correctness                                  |

**Phase 3's gate is the strategic falsifier.** If realistic turns nearly always resolve
to the root, ancestry is technically correct and practically useless as an interaction
model. Measurable against v3 and synthetic shapes.

What is already known about that risk: v3's `dispatch` branch holds `haulers`,
`trucks`, `drivers`, `orders` as siblings, so a driver↔truck reassignment has LCA
`dispatch` — the rule works on the real adopter's real shape. And `activeId` lives
**inside** `entityMap`, so selection changes do not escalate at all. The escalation
risk is **hoisted status**: if save/loading state lives in a shared `ui.saving` branch
rather than at the position (`status()`), every optimistic write touches a top-level
sibling and LCA collapses to root.

> **Design guideline that falls out:** hoisting status or selection out of a domain
> converts every action in that domain into a root-level action. Ancestry is the scope.

---

## 7. Invariants — tests before implementation, each with a mutation proof

Every one needs a deliberate break that turns something red. **If breaking containment
does not fail a test, containment is a comment, not a guarantee.**

|       | Invariant                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** | **Turn indivisibility** — a cross-position turn cannot be partially undone, redone, retained, evicted or truncated                                                                                     |
| **B** | **Prefix closure** — no operation leaves a position with a later turn applied while an earlier required turn at that position is undone                                                                |
| **C** | **Containment** — undo from a position cannot mutate ownership positions outside its subtree                                                                                                           |
| **D** | **Atomic eviction** — retention cannot leave a shared turn present in some position indexes and absent in others                                                                                       |
| **E** | **Atomic truncation** — discarded redo history removes shared turns from all chains atomically                                                                                                         |
| **F** | **Refusal, never partial** — an operation that cannot preserve the invariants fails without modifying state                                                                                            |
| **G** | **Ownership identity stability** — `changeId` cannot corrupt retained position attribution                                                                                                             |
| **H** | **Zero-when-unused** — unused history machinery adds no measurable write-path regression                                                                                                               |
| **I** | **Attribution isolation** — writes attributable to transaction A can never be recorded into B merely because their lifetimes overlap. _Mutation-test it by deliberately implementing ambient capture._ |

Invariant I exists because ambient attribution is the **obvious** implementation and
someone will reach for it again.

### Benchmark methodology for H — literal, because these benchmarks have already lied

- **Baseline after setup/seeding**, not before.
- **One process per arm**, `--expose-gc`, explicit settle loop.
- **Read the resulting state back**, or dead-code elimination gives a 1000×-wrong
  answer — that is how a `0.176 µs/write` figure nearly shipped.
- **Compare distributions**; quote a range when arms overlap rather than one median.
- **No timer/yield in the measured per-write loop.** `await setTimeout` per write is
  **forbidden**: its ~1 ms floor swamps a ~50 µs signal, and it produced ~1143 µs on
  all eight arms of one benchmark and _negative_ per-write costs in another.
- Arms measured, four: **current 3-arg `notify`** (pre-change baseline) ·
  **owner-capable notify, history absent** · **owner-capable notify, history installed
  but inactive** · **active recording**. Arms 1→2 isolate the contract change itself —
  the cost 0A must show is unmeasurable even when nothing consumes the owner. Arms 2→3
  isolate installing a non-writing consumer; arms 3→4 recording.

The benchmark must be able to **falsify** "zero when unused," not make every
implementation look identical.

### Diagnostics

Refusal cannot be a bare boolean. Internally distinguish at least
`outside-boundary` · `frontier-blocked` · `history-evicted` · `structural-drift`.
Every **emittable** history diagnostic needs a registered ST code and documentation —
the `error-codes` gate enforces it. The public taxonomy may be one refusal error with
structured reasons; that decision can come later.

---

## 8. Evidence discipline

### Measured — trust these

- Recording after structural sharing: 50 writes over 10k rows, 340.60 ms → sub-ms.
- **Restore is O(state)**: `undo()` 436.67 µs at 50k, scaling 25.4 / 83.5 / 436.7 at
  1k / 10k / 50k. `restoreState` is `this.tree(state)`; **there is no root pointer.**
- Retention at 50 steps / 50k rows: **19.5 MB** for collection-touching writes,
  **0.45 MB** for scalar writes beside them — 43× on write shape alone. Unchanged
  collections are shared by reference.
- Log **entry count is O(state)** — 1,050 / 10,050 / 50,050 — while bytes stay flat.
  So retention must be bounded by **turns**, never entries.
- Callback scope collapses under async; ambient attribution collapses under concurrency.
- `form()` participation is **asymmetric**: no recording, yet restored anyway.
- `PathNotifier` is blind to plain-leaf writes; `timeTravel()` sees them only because
  it separately wraps leaves via `interceptLeafSignals` and injects into the notifier.
  **Consequence:** an action built as a standalone notifier subscriber inherits that
  blind spot; one built inside the enhancer gets leaves for free.
- `flush()` compares by reference (`path-notifier.ts:198`) — correct within a turn,
  insufficient across turns. Deep collapse belongs at `confirm()`/`rollback()`, **not**
  on line 198. `prunedEqual` is the reuse: reference-first, structural on mismatch.
  Known hole: it treats arrays as leaves, so a reconstructed **array** does not
  collapse.
- A real adopter declined optimistic bulk writes for want of reversal.

### Strategic bet — labelled as such

> Serious client applications increasingly have multiple legitimate writers: user,
> server push, background refresh, offline sync, optimistic writes, autosave,
> telemetry, workers, **AI agents**, collaborators. The more writers state has, the
> less acceptable snapshot rollback becomes, because reverting an old tree destroys
> legitimate intervening work.

An agent writing into app state is a second writer with **no UI presence** — an app
becomes multi-writer without becoming collaborative.

**Falsifier:** if applications route multi-writer state through CRDT/event-sourced
layers whose own undo and ownership systems make store-level transactional history
unnecessary, this capability is worth less than expected.

### Unaudited — no uniqueness claim is licensed

The Angular set was audited by probing installed declarations: `@ngrx/signals` 21.1.1,
elf 2.5.1 / elf-state-history 1.4.0, `@ngxs/store` 20.1.0 — **none ships scoped
history**. **MobX-State-Tree's patch/UndoManager and Yjs's `UndoManager`
(`trackedOrigins`) are the real prior art and have NOT been audited.** Required before
a public claim; not required before building.

---

## 9. Non-goals

- **A CRDT.** Concurrent modification of one collaborative document stays a CRDT problem.
- **A general dependency graph.** Position intersection is a conservative causal
  approximation. Do not infer semantic independence between leaf paths or entity ids —
  two rows changing may both affect sort order, count, derived indexes, selection.
- **A command/event-sourced store.** Value diffs stay primary; operation metadata is
  selective enrichment.
- **A whole-tree snapshot correctness mechanism.** Keyframes remain useful for the
  temporal semantic; they are not how production scoped undo is made correct.
- **Two history engines.** One canonical representation, one set of invariants.
- **Per-entity independent undo.** No researched workload asks for it; the grid mental
  model is "undo my last action."

---

## 10. Open questions

Do not expand without implementation evidence.

1. **Ownership cost** (0A) — the blocking question.
2. **Supersession detection** (0B) — value-compare with an ABA hole, or a write stamp
   that pays on the write path.
3. **Redo truncation policy** — clear all redoable future turns after a new write, or
   preserve provably unrelated branches? Prefer correctness and simplicity first.
4. **Transaction API shape** — the smallest explicit surface that handles async and
   unrelated writers without ambient capture. Known cost from the prototype:
   attribution threads through **every store method a bulk handler composes**, and
   those are also public single-record entry points, so the parameter must be optional
   and every call path considered.
5. **Public diagnostic surface** — what a caller receives when reversal is unavailable.
   Must not block the internal model.
6. **Nesting** — answered by the adopter's structure rather than convention: `activate$`
   is simultaneously bulk-composed and a public single-record entry point, so **the
   inner must join the outer**. Confirm in Phase 3.

---

## 11. Completion criteria

- Ownership attribution validated across all supported marker types.
- Ownership identity survives re-keying.
- Zero-when-unused benchmarked and passing, by the methodology in §7.
- Invariants A–I have tests **with mutation proofs**.
- Current scoped history migrated to the ownership model; 6a's asymmetry resolved.
- Canonical turns and position indexes implemented.
- Retention and truncation atomic by turn; `capacity` removed.
- Undo and redo preserve prefix closure.
- Cross-position turns can be created intentionally and cannot capture unrelated writes.
- Narrower scopes refuse rather than partially reverse; the lowest valid ancestor can
  reverse a contained turn atomically.
- Collection operations preserve positional semantics or fail loudly.
- A realistic v3 workflow has been used to **falsify** the implementation.
- **Cross-position optimistic rollback works without caller-written compensation.**
- Documentation explains the model without requiring users to understand the indexing.

---

## 12. Method rules

Carried forward because each was paid for.

1. **Assert outcomes, not mechanisms.** If you test that a write "was recorded," call
   `undo()` and inspect state. Reading `getHistory().length` or `canUndo()` without a
   following `undo()` is not evidence — that is how a defect report survived on four
   surfaces while being false.
2. **Read every check's result before committing.** Never in the same command as a
   formatter that rewrites files. Read exit codes directly, never off a pipe (this
   shell is **zsh**: `$pipestatus`, not `PIPESTATUS`).
3. **Distrust a flattering number harder than an unflattering one**, and distrust an
   alarming one enough to check whether it is recoverable before ranking it.
4. **Read the body before calling something a duplicate.** Three findings came from
   barrel listings; one was wrong.
5. **Scope a rename to an explicit file list.** A blind `sed` across `docs/` rewrote the
   point-in-time archive and turned an audit's own heading into "`name` is a legacy
   alias for `name`".
6. **Before a verdict leaves the harness, name the configuration that would falsify it**
   and either run that too or scope the sentence to what was run.
7. **Say which hierarchy rank a change protects**, in the commit message. A reviewer can
   then ask "you are weakening attribution isolation — which higher rank does that
   buy?" If the answer is "cleaner API," rank 6 loses.
8. **Do not resolve on paper what can be measured.** Every reasoned conclusion in this
   design that ran ahead of execution was wrong: `act(label, fn)`, ambient attribution,
   "collections do not record", "every doc sample is off by one", "the cost argument
   holds independently", "one parameter at the Ops boundary". Six for six.
