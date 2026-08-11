# History: the current codebase, against the target

**Status:** gap analysis, 2026-08-11. The "what exists today" map that
[PLAN-position-attributed-history.md](./PLAN-position-attributed-history.md) §5
needs before Phase 0: for each element of the position-attributed model, what is in
`packages/core` today, what is partial, what is absent, and which phase owns closing
it.

This document **decides nothing**. It inventories. The PLAN is the authority on
ordering and priority; the tie-break when the PLAN is silent is
[history-priority-hierarchy.md](./history-priority-hierarchy.md). Where this page
and the old `TODO.md` item 2 disagree about the future, the PLAN wins.

The one number worth repeating up front, because it reframes 0A:

> The question is not **"is it cheap to extend"** the write path with an owner.
> Nothing about ownership exists today. The question is **"is it cheap to
> introduce."**

---

## 1. What the substrate already provides

The tree already computes and carries the raw material of the target — a value
tuple per write — at every write site:

- `PathNotifier.notify(path, value, prev)` — `path-notifier.ts:113`, called from
  `entity-signal.ts`, `form.ts` and devtools. `path`, `after`, `before`: the
  whole value tuple, already there.
- `updateAndReport(partial)` — `signal-tree.ts:1172` — applies a partial update
  and returns the dot-paths that _actually_ changed.
- `PathNotifier` batching — `path-notifier.ts:189-215` — collapses per-path
  first/last within one microtask and fires one `onFlush`. This is a
  within-turn collapse already implemented; the target's `seal()` is that rule
  applied **across** turns. Note the caveat at `:198`: `flush()` compares by
  reference (`newValue === oldValue`), which the PLAN records as correct within
  a turn and insufficient across turns.

So the three facts the greenfield target lists as "what the tree knows" are all
present: changed path, `before`/`after`, and within-turn coalescing. What the tree
does **not** know — intention, operation, user action, **position** — is exactly
the absent half of this map.

## 2. Write shapes, and what each notifies today

Measured against the current source, by marker:

| Write shape                                         | Path notified                                                                                      | Ownership position available?                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `entityMap` `addOne`                                | `${basePath}.${id}` (`entity-signal.ts:756`)                                                       | **Yes** — `basePath` is the position, already computed                    |
| `entityMap` `updateOne` / field set                 | `${basePath}.${id}` (`:953`, `:1001`)                                                              | **Yes**                                                                   |
| `entityMap` `removeOne`                             | `${basePath}.${id}` (`:1116`)                                                                      | **Yes**                                                                   |
| `entityMap` `addMany` / `updateMany` / `removeMany` | `${basePath}.${id}` per row (`:903`, `:1055`, `:1167`, `:1285`, `:1290`)                           | **Yes**                                                                   |
| `entityMap` `changeId`                              | `${basePath}.${String(to)}` (`:845`)                                                               | **Yes** — and see §4 for the stability trap                               |
| `form()` `set` / `update`                           | `path` — **only when `notifier && path`** (`form.ts:871`)                                          | **Partial** — position = the form's path, but notification is conditional |
| plain leaf `tree.$.a.b.set()`                       | **only via `interceptLeafSignals`**, installed by `timeTravel()` itself (`time-travel.ts:675,683`) | **Conditional** — the leaf blind spot; see §3                             |
| `status()`                                          | — (0 `notify` sites)                                                                               | **No**                                                                    |
| `stored()`                                          | — (0 `notify` sites)                                                                               | **No**                                                                    |
| `compared()`                                        | — (0 `notify` sites)                                                                               | **No**                                                                    |
| `async-source()` / `async-query()`                  | — (0 `notify` sites)                                                                               | **No**                                                                    |

That last block is the 0A asymmetry, named precisely rather than as a hunch: three
markers write state the history subsystem will need to attribute, and **none of
them announces it**. If 0A's gate is "ownership resolved at write time across all
marker types," the marker set is currently split 2½ / 0 / 3½.

The marker notifier wiring itself is lazy — `materialize-markers.ts:563-567`
`getNotifier()` — so an owner on the notify contract is not paid by trees that
never touch history. But "lazy" and "zero when unused" are not the same
benchmark; the latter is decision 20 and §5 below.

## 3. The leaf blind spot is siting, and it is already recorded

`timeTravel()` sees plain-leaf writes only because it wraps them:
`interceptLeafSignals` at `time-travel.ts:675` routes leaf `.set()` through the
notifier (`:683`) and flags the tree dirty (`:682`) so its `onFlush` subscriber
records one entry per flush (`:688-699`).

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
  15.0.0 by renaming to `recordHistory`, and the current shape of `recordHistory`
  (`types.ts:765`) is the participation flag the ownership model keeps.
- Its reverse (an `entityMap`-style collection with position-aware undo) does
  **not** exist. `removeOne` + `undo()` restores the row at the **end** — the
  position defect the PLAN's Phase 5 collection anchors exist to close.

## 5. What is entirely absent

Grepped across `packages/core/src` (non-spec), today:

| Concept                                   | Count                                                                                                                                               | Notes                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `TurnId`                                  | 0 files                                                                                                                                             | the plan's atomic unit of causality                                                                                |
| `PositionId`                              | 0 files                                                                                                                                             | the stable identity of an owning position                                                                          |
| `ownerPosition` / owner on notify         | 0 files                                                                                                                                             | the 0A contract change                                                                                             |
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
  mistaken for the other.
- `@signaltree/events` ships an optimistic-update manager
  (`optimistic-updates.ts`) — `correlationId`, `previousData`, `rollback()`.
  This is exactly the bespoke per-request compensation the PLAN's objective
  exists to remove: single-path, no ownership, caller-managed. It is the
  in-repo counterexample 0B's motivation should quote, and a candidate
  consumer to migrate once the mechanism exists.

## 6. Which phase closes each gap

| Gap                                                     | Closed by                                           |
| ------------------------------------------------------- | --------------------------------------------------- |
| owner on the notify contract (all write shapes)         | **0A** (probe) → Phase 1 (position history)         |
| `status`/`stored`/`compared`/`async-*` announce nothing | 0A finding → Phase 1 participation/exclusion design |
| `PositionId` stability under `changeId`                 | **0A** (must falsify the naive derivation)          |
| leaf siting for a standalone history consumer           | 0A / 0B, whichever side the prototype sits on       |
| turn store, position indexes, frontier                  | Phase 2                                             |
| cross-position transaction handle                       | Phase 3                                             |
| collection anchors                                      | **0B** (promoted) → Phase 5                         |
| write stamp / supersession                              | **0B** (open question)                              |
| optimistic rollback integration                         | Phase 6                                             |

## 7. The reframe: cheap to **introduce**, not cheap to extend

The PLAN's §5 0A asks whether an ownership position can be resolved at write time
"with no measurable cost when history is not installed." The inventory above
changes what that question costs to answer:

- The notify contract today is `notify(path, value, prev)` — three positional
  args. Adding an owner is a **net-new parameter on the write path**, which is
  where decision 20 (zero-when-unused) bites hardest. "Does an unused owner
  parameter cost anything?" is a different benchmark from "does an unused
  subscriber cost anything?" and the PLAN's §7 methodology (baseline /
  present-but-inactive / active, `--expose-gc`, no `await` in the loop) must be
  run against both shapes.
- The good news is already visible: for `entityMap`, `basePath` **is** the
  ownership position and is **already computed at every call site** —
  `entity-signal.ts:756,845,903,...` — so one of the four marker families pays
  nothing to surrender it. The cost question concentrates on the other families,
  especially the silent three.

## 8. What this map does not claim

- It is not a decision. The PLAN decides; this page only records what the PLAN
  operates on.
- It does not license a uniqueness claim. The unaudited-competitor note in the
  hierarchy doc stands; nothing here adds to it.
- The "0 files" rows are a **starting position**, not a critique. The PLAN's §5
  already names this exact asymmetry as the Phase 0 falsifier — that ownership,
  turns, and the transaction lifecycle are all absent is precisely why 0A and 0B
  exist, and why both are disposable.
