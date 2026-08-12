# History: the current codebase, against the target

**Status:** gap analysis, 2026-08-11. The "what exists today" map that the
15.0.0 history design work needs before Phase 0: for each element of the
position-attributed model, what is in `packages/core` today, what is partial,
what is absent, and which phase owns closing it.

**Staleness stamp:** inventory was verified accurate as of `6abbc3a5` (2026-08-11),
then partially invalidated later the same day by the Phase 0A probe work: the notify
contract can now carry an optional owner path, `form()` field accessors announce on the
form path, and marker mutators observed via `interceptLeafSignals` can report owning
positions. The remaining live question is no longer "can ownership exist" but whether
the added contract is measurably free when unused and which write shapes still require
interception rather than direct notifier participation.

This document **decides nothing**. It inventories. The PLAN is the authority on
ordering and priority; the tie-break when the PLAN is silent is
[history-priority-hierarchy.md](./history-priority-hierarchy.md). Where this page
and the old `TODO.md` item 2 disagree about the future, the PLAN wins.

The one number worth repeating up front, because it reframes 0A:

> The question is not **"can ownership exist"** on the write path anymore.
> The contract now carries an optional owner path. The 0A question is whether
> that extra argument is measurably free when nothing consumes it.

As of the current harness revision, Phase 0A has split into two separate results:

- **ownership carriage: demonstrated experimentally**
- **zero-when-unused: measured on the real notifier; no-margin runs remain inconclusive by contract**

---

## 1. What the substrate already provides

The tree already computes and carries the raw material of the target — a value
tuple per write — at every write site:

- `PathNotifier.notify(path, value, prev, ownerPath?)` — the owner-capable form of the
  same notifier contract, called from `entity-signal.ts`, `form.ts` and enhancer-local
  leaf interception. `path`, `after`, `before` and now optional owner identity: the
  whole value tuple, already there.
- `updateAndReport(partial)` — `signal-tree.ts:1172` — applies a partial update
  and returns the dot-paths that _actually_ changed.
- `PathNotifier` batching — `path-notifier.ts:213-238` — collapses per-path
  first/last within one microtask and fires one `onFlush`. This is a
  within-turn collapse already implemented; the target's `seal()` is that rule
  applied **across** turns. Note the caveat at `:222`: `flush()` compares by
  reference (`newValue === oldValue`), which the PLAN records as correct within
  a turn and insufficient across turns.

So the three facts the greenfield target lists as "what the tree knows" are all
present: changed path, `before`/`after`, and within-turn coalescing. What the tree
does **not** know — intention, operation, user action, **position** — is exactly
the absent half of this map.

## 2. Write shapes, and what each notifies today

Measured against the current source, by marker:

| Write shape                                         | Path notified                                                                                  | Ownership position available?                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `entityMap` `addOne`                                | `${basePath}.${id}` (`entity-signal.ts:756`)                                                   | **Yes** — `basePath` is the position, already computed                    |
| `entityMap` `updateOne` / field set                 | `${basePath}.${id}` (`:953`, `:1001`)                                                          | **Yes**                                                                   |
| `entityMap` `removeOne`                             | `${basePath}.${id}` (`:1116`)                                                                  | **Yes**                                                                   |
| `entityMap` `addMany` / `updateMany` / `removeMany` | `${basePath}.${id}` per row (`:903`, `:1055`, `:1167`, `:1285`, `:1290`)                       | **Yes**                                                                   |
| `entityMap` `changeId`                              | `${basePath}.${String(to)}` (`:845`)                                                           | **Yes** — and see §4 for the stability trap                               |
| `form()` `set` / `update`                           | `path` — when `notifier && path`, including field-accessor writes routed back to the form path | **Yes, conditionally installed** — owner = the form path                  |
| plain leaf `tree.$.a.b.set()`                       | **only via `interceptLeafSignals`**, installed by `timeTravel()` itself                        | **Conditional** — leaf owner = the leaf path unless a marker supplies one |
| `status()`                                          | no direct `notify()` site; owner arrives through wrapped mutators / leaf interception          | **Conditional** — owner reported at the marker position when intercepted  |
| `stored()`                                          | no direct `notify()` site; owner arrives through wrapped mutators / leaf interception          | **Conditional** — owner reported at the marker position when intercepted  |
| `compared()`                                        | no direct `notify()` site; owner arrives through wrapped mutators / leaf interception          | **Conditional** — owner reported at the marker position when intercepted  |
| `async-source()` / `async-query()`                  | no direct `notify()` site; owner arrives through wrapped mutators / leaf interception          | **Conditional** — owner reported at the marker position when intercepted  |

The asymmetry is narrower than the morning inventory: direct notifier participation is
still uneven, but the owner signal itself is no longer absent. If 0A's gate is
"ownership resolved at write time across all marker types," the live split is
**1 direct family · 6 conditional families** (`entityMap` direct; `form()`, plain
leaves, `status()`, `stored()`, `compared()`, and `async-*` via interception today).

> **Conditional, not fully direct.** Zero direct `notify()` sites does not mean
> invisible to history: these markers write through leaf signals, and
> `interceptLeafSignals` (§3) now wraps the relevant mutators so ownership can be
> surfaced at the marker position when `timeTravel()` is attached. The remaining 0A
> risk is therefore not "can ownership exist" but "how much of it still depends on
> enhancer-local interception rather than first-class direct participation."

The marker notifier wiring itself is lazy — `materialize-markers.ts:563-567`
`getNotifier()` — so an owner on the notify contract is not paid by trees that
never touch history. But "lazy" and "zero when unused" are not the same
benchmark; the latter is decision 20 and §5 below.

## 3. The leaf blind spot is siting, and it is already recorded

`timeTravel()` sees plain-leaf writes only because it wraps them:
`interceptLeafSignals` at `time-travel.ts:788` routes leaf `.set()` through the
notifier (`:799`) and flags the tree dirty (`:796`) so its `onFlush` subscriber
records one entry per flush (`:803-822`).

Consequence, already in the PLAN's Measured list and confirmed at the call site:
**an action built as a standalone notifier subscriber inherits the blind spot; one
built inside the enhancer gets leaves for free.** 0B's prototype must decide which
side it sits on before its first measurement, or it will report "leaves don't
notify" when the real statement is "leaves notify only where the siting lives."

## 4. The one mechanism that already does the target's job — at one position

`form({ history: history() })` (`markers/form.ts:132`, engine in
`form-history.ts`) is a scoped, position-owned undo stack. It cannot see the rest
of the tree; it is the single case where the target's §4.2 "action unit and state
position coincide" holds, and it is the one undo v3 ships to production.

Two facts about it matter for Phase 1, which is meant to generalise it:

- It is **opt-in and self-contained** — `form({ history })` owns its own stack; it
  does not feed `timeTravel()`. That is the opt-in/opt-out collision resolved in
  14.1.1 by renaming to `recordHistory`, and the current shape of `recordHistory`
  (`types.ts:765`) is the participation flag the ownership model keeps.
- Its reverse as a **cross-position speculative rollback mechanism** does not
  exist. Current snapshot `timeTravel()` undo already restores a simple
  `removeOne` to the original order; the missing case is structural rollback
  under concurrent writers, where collection anchors can be required to either
  compensate correctly or report `cannot-reconcile`.

## 5. What is entirely absent

Grepped across `packages/core/src` (non-spec), today:

| Concept                                   | Count                                                                                                                                               | Notes                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `TurnId`                                  | 0 files                                                                                                                                             | the plan's atomic unit of causality                                                                                |
| `PositionId`                              | 0 files                                                                                                                                             | the stable identity of an owning position                                                                          |
| `ownerPosition` / owner on notify         | owner-capable notify contract present; no dedicated `PositionId` abstraction yet                                                                    | 0A proved carriage, Phase 1 still owns the first-class identity model                                              |
| `seal()` / `confirm()` / `rollback()`     | 0 call sites                                                                                                                                        | the lifecycle the PLAN defines; only comments in `types.ts` and `time-travel.ts` mention what a `commit()` "needs" |
| transaction handle (`tree.transaction()`) | 0 — the only `transaction` hits are IndexedDB's own `database.transaction()` in `enhancers/serialization/storage-adapters.ts` (`:75`, `:87`, `:99`) | the call-site value the greenfield target §4.1 requires                                                            |
| turn store / position indexes / frontier  | 0 files                                                                                                                                             | the model in PLAN §2                                                                                               |
| collection anchors / operation metadata   | 0 files                                                                                                                                             | PLAN Phase 5                                                                                                       |
| write stamp / generation                  | 0 files                                                                                                                                             | the 0B supersession question                                                                                       |

Two existing subsystems are relevant prior art and neither is it:

- `write-context.ts` (`withWriteContext` / `getActiveWriteContext`,
  `write-context.ts:80`) tags writes with `UpdateMetadata` — synchronous-only by
  design, with the `await` boundary trap documented at `:38-53`. It is the
  **authorship** channel (`intent: 'system'`, `source: 'time-travel'`), consumed
  by guardrails and validation. It is **not** attribution: ambient, synchronous,
  and it cannot survive the fan-out that motivated the transaction handle. Plan
  decision 14 forbids using ambient capture for membership; this module is the
  remaining legitimate use of the ambient mechanism, and it must not be
  mistaken for the other. Since the restore-phantom fix, `timeTravel()` itself
  also consumes it: `path-notifier.ts` records the active source on each
  batched entry at `notify()` time, and time-travel's `**` subscriber skips
  `source === 'time-travel'` entries — the deferred restore flush that
  `isRestoring` (a synchronous flag) cannot catch.
- `@signaltree/events` ships an optimistic-update manager
  (`optimistic-updates.ts`) — `correlationId`, `previousData`, `rollback()`.
  This is exactly the bespoke per-request compensation the PLAN's objective
  exists to remove: single-path, no ownership, caller-managed. It is the
  in-repo counterexample 0B's motivation should quote, and a candidate
  consumer to migrate once the mechanism exists.

## 6. Which phase closes each gap

| Gap                                                                 | Closed by                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| owner on the notify contract (all write shapes)                     | **0A** probe now exists; Phase 1 decides final substrate shape                                                            |
| `status`/`stored`/`compared`/`async-*` still depend on interception | 0A finding → Phase 1 participation/exclusion design                                                                       |
| stable row `SubjectId` under `changeId` / reuse                     | **0A** row-slice proof now exists                                                                                         |
| stable owning `PositionId`                                          | Phase 1 — still unresolved for the collection / marker owner                                                              |
| leaf siting for a standalone history consumer                       | 0A / 0B, whichever side the prototype sits on                                                                             |
| turn store, position indexes, frontier                              | Phase 2                                                                                                                   |
| cross-position transaction handle                                   | Phase 3                                                                                                                   |
| collection anchors                                                  | **0B** prototype now demonstrates both anchored reinsert and explicit `cannot-reconcile`; Phase 5 owns the real substrate |
| write stamp / supersession                                          | **0B** (viability's open question remains)                                                                                |
| optimistic rollback — semantics prove viable                        | **0B** prototype now exists in the test-only `packages/core/scripts/rollback-viability-prototype.ts`                      |
| optimistic rollback — productization / integration                  | Phase 6                                                                                                                   |

## 7. The reframe: cheap to **introduce**, not cheap to extend

Phase 1 should now proceed on a chosen shape, not a fresh debate:

> **Stable ownership identity is intrinsic to the materialized position; mutation observation remains lazily installed.**

That choice fits the current source rather than fighting it. `entityMap` already computes
`basePath` intrinsically, `form()` already carries owner metadata on field accessors, and
`interceptLeafSignals` already serves as the observation seam. The architectural correction
is to stop letting interception also DEFINE ownership for the conditional families.

The rule from here is simple:

> **Interception may observe ownership. It may not invent ownership.**

That rule only stays true if four distinct concepts remain distinct:

```text
PositionId   = stable identity of the behavioral owner / marker
owner path   = current structural location of that owner
SubjectId    = stable identity of the thing being mutated at that location
changed path = physical value that mutated
```

The recent `changeId` falsifier is exactly what breaks any attempt to collapse subject identity into path.
`entityMap`'s `basePath` proves the marker intrinsically knows the owner's current location;
it does NOT prove that location is the identity, and the current row token should be read as a subject token for the mutated entity instance rather than as the owning collection position's `PositionId`.

The next owner-identity question is not representation but the A/B falsifier. See
[`history-positionid-lifetime-and-design-space.md`](./history-positionid-lifetime-and-design-space.md):
owner `PositionId` should first answer whether any currently supported
SignalTree operation requires the same semantic owner to disappear and later be
rematerialized within one live tree lifetime. Only that result decides whether
materialization lifetime A is sufficient or tree lifetime B is necessary.
Persistent lifetime C remains out of scope unless a real cross-process
requirement appears.

The verdict is stricter than `same semantic owner = yes`. Lifetime B is required
only when representation is recreated, semantics still say SAME owner, and
retained history can span that gap.

With the current probe table filled, no currently demonstrated SignalTree
surface satisfies that predicate. The evidence-bound result is therefore:
materialization lifetime A is sufficient for current requirements, while B is
not currently required.

That probe must use semantic verdicts, not object-identity ones: same path does
not imply same owner. Replacement at the same path is the required negative
control.

That yields one invariant every future consumer can share: the same mutation has the same
semantic owner whether it is seen by `timeTravel()`, a standalone observer, a transaction
recorder, devtools, or a later provenance / agent-attribution subsystem.

The next falsifiers should target that exact claim:

1. The owner-lifecycle probe determines whether any supported operation actually requires lifetime B.
2. Owner-position semantics are explicit and distinct from row-subject semantics.
3. The row `SubjectId` survives `changeId` and id reuse.
4. A standalone observer and `timeTravel()` report the same row subject for the same mutation.
5. Owner `PositionId` at the collection / marker level is prototyped separately from row subject identity.
6. With no observer installed, intrinsic owner-position cost stays separate from row-subject cost.

And there is one lifetime question the prototype should expose immediately:

```text
P_rows owns rows
rows.7 -> E17
remove row 7
later add row 7 -> E18

required: E17 != E18 while P_rows remains the same owner position
```

Retained turns may still refer to `E17` after the row disappears. The prototype may not need
to keep a live materialized object for that old subject forever, but it does need stable
identity strong enough to distinguish an old row occupant from a later occupant of the same path.
For owner `PositionId`, the same split applies: historical reference lifetime may outlive
live materialization, and that must not imply a still-resolvable owner object.

The PLAN's §5 0A asks whether an ownership position can be resolved at write time
"with no measurable cost when history is not installed." The inventory above now has
an experimental carriage result and a benchmark that is stricter about what it can
claim:

- `tools/bench-history-ownership.mjs` now measures six arms in separate child
  processes with `--expose-gc`, including an A/A control and deterministic
  paired-round bootstrap confidence intervals on the median delta.
- Interleaving by round with a seeded per-round shuffle fixed the instrument:
  the A/A floor dropped from **20.35%** to **0.06%**. That is real progress in
  resolution.
- The isolating arm now exists: `owner-present-no-history` on the real
  `PathNotifier`, with `ownerPath` set and `installHistory = false`.
- On the latest full run with that arm in place, decision 20 measures
  `owner-present-no-history - owner-absent` at **-0.85%** with CI
  **-1.86%..+0.48%**. That is the right quantity at last, and with no declared
  equivalence margin it still resolves to **`INCONCLUSIVE`** by contract.
- The old committed-snapshot-vs-real comparison remains useful, but under its honest name:
  **owner-capability structural overhead**. On the same run it measured
  **+2.08%** with CI **+1.51%..+3.85%**.
- The good news is still structural as well: for `entityMap`, `basePath` **is** the
  ownership position and is **already computed at every call site**, so that family
  pays nothing to surrender it directly. The remaining design question concentrates
  on the families that still rely on interception to surface ownership.

Phase 0B now also has an executable result rather than only prose. The disposable
prototype in `packages/core/scripts/rollback-viability-prototype.ts`
proves the hierarchy doc's asymmetry directly while staying out of the published
package surface:

- scalar rollback can preserve a concurrent sibling write and can detect same-path
  supersession by comparing the visible value against the entry's `after`.
- structural collection rollback can compensate a concurrent reorder only when the
  removed row's surrounding anchors still define a valid bracket.
- when a concurrent reorder destroys that bracket, the correct answer is an
  explicit `cannot-reconcile`, not a silent best-effort insert.
- rejected optimistic creation followed by dependent writes beneath the created
  entity needs a dependency-conflict result, again not silent repair.

## 8. What this map does not claim

- It is not a decision. The PLAN decides; this page only records what the PLAN
  operates on.
- It does not license a uniqueness claim. The unaudited-competitor note in the
  hierarchy doc stands; nothing here adds to it.
- The "0 files" rows are a **starting position**, not a critique. The PLAN's §5
  already names this exact asymmetry as the Phase 0 falsifier — that ownership,
  turns, and the transaction lifecycle are all absent is precisely why 0A and 0B
  exist, and why both are disposable.
