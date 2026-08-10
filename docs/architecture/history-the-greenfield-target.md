# History: the greenfield target

**Status:** goal statement, 2026-08-10. This is the _what for_, derived from the
research rather than from any implementation. The design space that could satisfy it
is in [2026-08-history-greenfield-spike.md](../research/2026-08-history-greenfield-spike.md);
the demand it answers is in
[undo-business-and-ux-cases.md](../audits/2026-08/undo-business-and-ux-cases.md).

Written because two prior attempts to answer "what should we build" produced a
performance budget and a list of missing features. Neither is a goal. A budget says
how fast the thing should be once you have decided what it is.

---

## 1. What the performance work actually unlocked

This is the premise, and it is not "we got faster."

Before 13.5.0, recording a snapshot per write over a 10,000-row collection cost
**340.60 ms**. At that price history is _necessarily_ a development instrument. You
enable it in dev, you strip it in prod, and the API you design is a debugger's API —
`jumpTo(index)`, `getHistory()`, `pauseRecording()`, `maxHistorySize`. Every library
in this space has that vocabulary because every library in this space paid that cost.

Structural sharing removed it. Recording is now tens of microseconds, and on a
path-diff log retained memory is **flat in state size** — 0.15 MB at 50,000 rows
against 19.58 MB for the snapshot stack (spike §1.7).

**So the constraint that made history a dev-only instrument is gone, and the API
shaped by that constraint outlived its reason.** The greenfield opportunity is not a
faster debugger. It is that undo can now be a production feature that ships to end
users — and none of our current vocabulary is aimed at that.

That reframing is the whole point. Everything below follows from taking it seriously.

## 2. What the business is buying

From [undo-business-and-ux-cases §1](../audits/2026-08/undo-business-and-ux-cases.md),
the strongest driver by a distance:

> **Bulk-operation safety.** Users will not run a bulk action they cannot reverse.
> They hand-edit rows instead, and the feature you built goes unused.

**Corrected 2026-08-10 against a real adopter.** That framing did not survive contact
with v3, and the correction makes the claim narrower and verifiable.

v3 **shipped** the bulk actions without undo. They bought safety two other ways: a
confirm gate that always runs before the write (`entity-table-buttons.component.ts:244-248`,
with an explicit note that there is no `skipConfirm` escape hatch), and forward error
recovery — failures are collected and the failed records stay selected so the user
retries just those.

But the absence of undo **did** change the design. `bulkPatch$` chose no optimistic
pre-write at all: each record's slice state changes only when its own PATCH succeeds.
That is a deliberately slower UX — the user watches a progress bar through N round
trips — chosen because there was no way to reverse a wrong bulk apply.

So the honest driver:

> **Undo is not the precondition for shipping bulk. It is the precondition for making
> bulk optimistic** — for deleting the progress-bar wait.

Narrower, and it survives an adopter. It also relocates the value: undo is not a
safety net bolted to a finished feature, it is what buys the responsive version of
that feature. Unverified either way: whether the shipped bulk actions actually get
used. Nobody has field telemetry.

The other three drivers — self-service error recovery, confidence to explore,
regulated change trails — all sharpen the same point, except the fourth, which is an
**audit log** and is explicitly not this feature.

## 3. What the users think they are undoing

Nine UX cases, ranked. The complete list of what a user believes one Ctrl+Z contains:

> "that row edit" · "that delete" · "my bulk action" · "that drag" · "my typing" ·
> "what did I just do?" · "cancel this dialog" · "put it back, the save failed" ·
> "not my change — the server's"

**Every one of them names an action.** Not a state, not a write, not a field, not a
microtask. No user has ever wanted to undo a snapshot.

Set that against what the tree can currently see
([spike §3](../research/2026-08-history-greenfield-spike.md)):

| The tree knows                  | The tree does not know |
| ------------------------------- | ---------------------- |
| the changed path                | **the intention**      |
| `before` and `after`            | the operation          |
| a microtask boundary            | **a user action**      |
| per-path within-turn coalescing | the position           |

**That is the gap, and it is the only one that matters.** The library has excellent
information about _what changed_ and no information about _what the user was doing_.
Every open problem in the audit — grouping, labelling, authorship, non-deterministic
step boundaries — is a restatement of that one absence.

Today a step boundary is a microtask, so **whether two changes are one undo step or
two is decided by whether the developer happened to `await` between them** (spike
§1.4). That is not a granularity setting; it is an accident.

---

## 4. The target

> **History's unit is a named user action — declared at the call site, scoped to the
> state it touches, attributed to whoever caused it. `undo()` reverses exactly one of
> those, in production, and cannot reach anything else.**

Three properties. Each is load-bearing and each traces to the research.

### 4.1 The unit is a declared intention — carried by a value, not a callback

One action is one step because the developer **said so**, not because a heuristic
guessed from timing, path adjacency, or `await` placement.

#### The callback form is falsified. Do not build it.

This section first proposed `act('label', fn)`. **Measured against the tree's own
grouping primitive, it cannot work**, because a callback scope is dynamic scope and
dynamic scope does not survive `await`. `batch()` is `try { fn() } finally { inBatch = wasBatching }`
— MEASURED, with `timeTravel()` counting entries:

| body of `batch()`                           | entries |
| ------------------------------------------- | ------- |
| 5 writes, synchronous                       | **1**   |
| 5 writes, one `await` between each          | 2       |
| 12 writes, concurrent `Promise.all` fan-out | **12**  |

The last row is the shape of every real bulk handler — v3's `bulkPatch$` and
`onArchiveToggle` both `mergeMap` over N HTTP requests at a concurrency limit. A
callback-scoped action would produce twelve steps for one user action, which is the
exact failure the goal exists to prevent.

Worse, a developer using it correctly still gets the wrong answer. For v3's
`onArchiveToggle` — one user action, "Deactivate 12 drivers" — the writes span a
confirm dialog's round trip, 12 concurrent requests, and two completion paths per
record. Wrapping the handler captures **zero** writes (the dialog returns
immediately); wrapping the subscribe callback captures zero (the `mergeMap` writes
land later); wrapping the per-record call captures the optimistic write only, a
twelfth of the action.

There are only three ways to know which writes belong to an action across an async
boundary: synchronous dynamic scope (falsified above), ambient async context (needs
Zone.js — a dead end for a library targeting zoneless, and v3 is zoneless by choice),
or **explicit attribution**. Only the third is available.

#### The shape: a transaction handle

Explicit attribution need not be viral per-mutation if the action hands back a lens.

```ts
// shape, not a signature
const act = tree.action('Deactivate 12 drivers');

from(ids)
  .pipe(
    mergeMap((id) => store.deactivate$(id, act), CONCURRENCY),
    toArray()
  )
  .subscribe({ complete: () => act.commit(), error: () => act.abort() });
```

Writes made through the handle are attributed by construction. The handle is a
**value**, so it closes over cleanly in an async pipeline — which is the entire reason
this works where a callback does not. One parameter at the Ops boundary, not an option
on every mutation.

And the intention is declared where the intention actually lives: the component that
owns the dialog. This is why it cannot be a marker — see §4.2.

Two properties fall out that no grouping API can provide:

- **`abort()` discards the action's own recording**, so an optimistic write plus its
  rollback collapses to **zero** steps rather than two that happen to cancel. Every
  v3 write is optimistic-then-confirm-or-rollback; `create$` writes an add then a
  remove on failure, `setArchived$` a remove then a restore. A user-facing undo must
  show nothing for a failed action. Grouping cannot express this; abort can.
- **Partial success is one action with a hole.** Nine of twelve succeed: the correct
  reversal is "undo the nine." So an action's extent is decided by **what committed,
  not what was attempted** — and in a bulk-over-N-requests world the ragged case is
  the common one, though all nine UX cases describe clean ones.

Consequence to accept deliberately: **an undeclared write gets a step boundary the
library chose**, and it will sometimes choose wrong. Acceptable, because the failure is
a mis-grouped step rather than lost data — and it is the only honest option, since
intention cannot be derived from state.

### 4.2 Scope is declared where the state lives

Undo in one part of the tree must not move state in another. Not by developer
discipline — **structurally**, by construction.

This is the marker principle, and it is not speculative: `form({ history: history() })`
already works exactly this way, and a form's history **cannot see** the rest of the
tree. The target is that generalised, so a collection, a branch or a form declares its
own participation at its own position — the same way `stored()`, `status()` and
`compared()` declare persistence, loading and equality at theirs.

**But scope and identity are different questions, and only scope is positional.** A
marker binds behaviour to a position in state; an action binds it to an intention over
time. "Deactivate 12 drivers" touches three positions — the entities, `selectedIds`,
and the save status — so no marker can span it. What makes those twelve PATCHes one
action is a dialog in a component, which is not a fact about any position in the tree.

The apparent counterexample is the instructive one. `form(history())` works — and it is
the one undo v3 ships to production — because a form is the rare case where **the action
unit and the state position coincide**, and the writes are synchronous field edits.
That yields a predictive line worth stating plainly:

> **Markers cover single-position, synchronous actions. Anything crossing positions or
> spanning async needs a transaction.**

That line sorts the nine UX cases better than user psychology does: "that row edit" is
already served; "my bulk action" and "that drag" are not. The split is on **write
topology** — and the business driver in §2 sits entirely on the hard side of it.

Consequence: **`undo()` as a whole-tree verb stops existing** as a user-facing thing.
There is no "undo the application." There is only "undo the action," and an action has
a scope.

### 4.3 Authorship is a property of the action

A write the user did not cause can never enter the user's undo history. Today this
fails two reachable ways (spike §1.8): undoing _past_ a server entry, and a server
push sharing a microtask with a user write — which is the exact shape of any HTTP
callback that stores rows and flips a loading flag.

This is the **only goal whose failure is a safety issue** rather than an annoyance,
and it is the one thing `pauseRecording()` at every call site can never guarantee.
Not merely because callers forget — because **pause is a global mode**. MEASURED:
inside a paused window, an unrelated `tree.$.rev.set(999)` was suppressed along with
the action's own writes. `pausedSignal` is one flag on one manager and
`addEntry` returns early for every writer, so correctness requires **sole ownership of
the tree for the duration of the window**. A synchronous `for` loop has that by
construction; a multi-second `mergeMap` over N HTTP requests does not.

That is the difference between the two failures, and it is why the transaction is a
different mechanism rather than a nicer `pauseRecording`. A callback scope merely fails
to capture the right writes. **A global mute actively suppresses other people's.**

## 4.4 The consequence that decides the representation

State this early rather than letting it emerge late, because it is the deepest change
in the design.

**If an unrelated write can land between an action's open and its commit — and under
async fan-out it always can — then an action's history entry cannot be a whole-tree
snapshot.** Undoing the action must revert _only the paths the action touched_, leaving
the concurrent write alone. So action entries are **path-scoped deltas**, necessarily.

This is not a preference. It eliminates every option in the
[spike](../research/2026-08-history-greenfield-spike.md) whose entry is a whole state,
including Option F (fix the snapshot stack in place) — which was the strongest
cost-based counter-argument until this constraint appeared.

It also lands on the enabling condition from §5 rather than fighting it. `restoreState`
is `tree(state)` with no root pointer to swap, and a partial `tree({ ... })` merge is
exactly how a scoped revert applies. **The thing filed as a missing optimisation is the
mechanism scoped undo needs.**

## 4.5 Where each piece belongs

The three-way question — marker, enhancer, or something new — has a clean answer, and
two of the three already exist and are already correct.

| Layer                    | Question it answers                                        | Status                                                                                                 |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Marker** (positional)  | Is this state _eligible_ for history?                      | Exists and is right — `history: false`, `transient: true`. Do **not** add an action marker.            |
| **Enhancer** (tree-wide) | The log, and navigating it                                 | Exists and is right — recording, retention, read-time `shouldSkip`, devtools scrubbing                 |
| **Transaction** (new)    | What was the user doing, and which writes were part of it? | Missing. Delivered _by_ the enhancer (it needs write-path visibility), but scoped as a call-site value |

An enhancer has the right visibility — it sees every write on the whole tree, which
cross-position grouping requires. What it lacks is **identity**: it sees
`(path, before, after, microtask)`, which is precisely the gap table in §3. So an
enhancer can _consume_ action identity; it cannot _originate_ it. `pauseRecording()` is
what you get from trying to inject identity into an enhancer through a global mode, and
modes fail structurally — they do not nest meaningfully, have no owner, and cannot
distinguish two concurrent actions.

**Three of the four pieces already exist**, which makes this less net-new than it looks:

| Already in the code           | What it is                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addEntry(action: string, …)` | The identity slot — present for versions, and every caller passes a mechanism name: `'INIT'`, `'update'`, `'RESET'`, `'batch'`. Never an intention. |
| `batch(fn)`                   | Synchronous grouping that already coalesces to one entry — and the measured proof that callback scope is not enough                                 |
| `finalizeProvisional(state)`  | Deferred entry completion: a `commit` primitive in embryo, currently dead code with no caller                                                       |

The first row is the sharpest illustration of §3's gap. **The field for intention has
existed all along and has only ever held the recorder's name for itself.**

## 5. What this makes possible that no other library offers

Not a parity claim — a structural one, and the reason to build it rather than copy.

An action-dispatch store (Redux, NgRx, NgXs) has one global root and every reducer
sees every action. Scope is a convention over that root; it cannot be a guarantee. A
snapshot stack cannot carry authorship because a snapshot has no author. **Both
limitations are downstream of having a single root reference to capture.**

SignalTree has no root reference — spike §1.6, `restoreState` is `tree(state)`, a full
recursive write. That has been treated as a missing optimisation. **It is the enabling
condition**: state that declares behaviour at its position can declare _history_ at
its position, and scope becomes structural rather than conventional.

**One thing here IS worth borrowing, and it is a different loan than the one we
refused.** The _scoping_ cannot come from action-dispatch stores. The transaction
_lifecycle_ — begin, commit, abort, nesting, partial failure — is a solved problem in
databases, with well-understood answers to every question §4.1 raises. Refusing to copy
another state library's history model is not a reason to re-derive transaction
semantics from first principles.

So the differentiated product is **production-safe scoped undo** — safe because the
scope and the author are declarable, not because recording is fast. Speed is what
makes it affordable; the marker system is what makes it correct.

## 6. What "done" looks like

The target is met when all of the following hold, each verified **by outcome** — a
verdict that cites `getHistory().length` or `canUndo()` without then calling `undo()`
and inspecting state is not evidence. That specific mistake produced a retracted
defect report in this repo.

| #   | Acceptance criterion                                                                                       | From                        |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | A labelled multi-write action is one step, and one `undo()` reverses all of it                             | UX 3, 6 · G2, G5            |
| 2   | Step boundaries do not change when a handler adds or removes an `await`                                    | spike §1.4 · G2             |
| 2b  | **A 12-way concurrent `mergeMap` fan-out is ONE step.** Measured at 12 today                               | §4.1 · v3 `onArchiveToggle` |
| 2c  | **An aborted optimistic action leaves ZERO steps**, not two that cancel                                    | §4.1 · v3 `create$`         |
| 2d  | **Partial success leaves one step covering what committed** — 9 of 12 undoes the 9                         | §4.1                        |
| 2e  | **A concurrent unrelated write is attributed elsewhere, never suppressed**, and survives the action's undo | §4.3 · §4.4                 |
| 3   | A delete returns **in place**, without a `sortComparer`                                                    | UX 2 · G3                   |
| 4   | A server write is never reachable by user undo, including in the same microtask as a user write            | UX 9 · G1                   |
| 5   | `undo()` in one scope provably cannot alter state in another                                               | UX 9 · G4                   |
| 6   | No step exists that changes nothing observable (the `history: false` phantom defect)                       | spike §1.9                  |
| 7   | Retention is bounded in **turns**, never in entries — entry count is O(state)                              | G6 · spike §1.7             |
| 8   | Retained memory is flat in collection width                                                                | spike §1.7                  |
| 9   | Structure-shaped workloads move from ❌ to ✅ in the §8 split                                              | use-cases §8                |

Criteria 2 and 2b are the ones to lead with. Both are cheap to test, impossible to
fake, and they are the difference between undo a developer can reason about and undo
they cannot. 2b is currently measured at **12**, and any design that cannot move it to 1
is not a candidate.

## 7. Explicitly not the target

Each rejected because no researched workload asks for it — not because it is hard.

- **Whole-tree time travel as a product feature.** It is a devtools instrument, and
  [undo-redo-vs-devtools.md](./undo-redo-vs-devtools.md) already separated them. It
  keeps its own vocabulary, including `jumpTo` and keyframes, and end users never see it.
- **Per-entity independent undo.** The mental model in a grid is "undo my last
  action," not "undo this row's history."
- **Audit trail.** Append-only, never rewound, different retention, different
  authority. `createAuditTracker()` exists. Conflating them satisfies neither.
- **Forensic replay of loading/in-flight state.** `status()` does not even notify.
- **Cross-user intention preservation.** Routed to a CRDT; keep it there.
- **Undoing a server effect.** No store can un-send a `POST`.

## 8. What the adopter check returned

This section previously said the central bet was unresearched and named the check to
run. It has been run against v3, and it changed three things in this document.

**Answered — v3 ships production undo, and it is already this architecture.** 50-step
undo/redo goes to real end users at the form layer: `history({ capacity: 50 })` in
`build-entity-form.ts:29`, imported from the core barrel and **not** behind
`fileReplacements` — only `debug-enhancers.ts` is swapped for production. Nothing undoes
collections. `timeTravel` is dev-only, and `tree-enhancers.ts:58-73` deliberately erases
its methods from the static type so no app code can depend on them.

So the split proposed in §4 — scoped production undo where scope is structural, no
whole-tree `undo()` — **is already v3's shipped architecture, arrived at independently.**
That is real confirmation of the §5 enabling-condition argument, and the strongest
evidence in this document that the direction is right.

**Falsified — the callback form.** See §4.1. The concern was that developers would not
bother declaring intentions; the actual blocker is harder and structural, and it was
measurable in this repo rather than a matter of speculation about willingness.

**Corrected — the business driver.** See §2. Undo is the precondition for making bulk
_optimistic_, not for shipping it at all.

### What is still open

1. **Does the transaction handle read well at real call sites?** The falsification that
   killed the callback form is available for the handle too, against the same three v3
   handlers — `onArchiveToggle`, `bulkPatch$`, `create$`, all optimistic, async and
   fanned out. Write the API against those three before implementing anything. This is
   still the cheapest thing here to falsify and it still invalidates the most.
2. **Whether the shipped bulk actions get used.** §2's driver assumes user caution
   suppresses adoption; v3 shows the feature shipped anyway. Nobody has field telemetry,
   and this repo cannot produce it.
3. **Nesting.** If an action opens inside another action, does the inner one commit into
   the outer or stand alone? Databases have answers; we have not chosen one.
