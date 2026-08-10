# History in SignalTree: a greenfield architecture spike

**Status:** research, 2026-08-10. Target release for whatever is chosen: 15.0.0.

This designs history/undo/time-travel **from scratch**. The existing
`timeTravel()` is treated as prior art, not as a starting point, and no option
below is justified by what another library ships. Where a competitor is mentioned
it is to explain why an idea we might copy does not apply to us.

**It is a spike, not a decision.** Six architectures are laid out with their real
costs. Section 9 states a preference and then argues against it. The maintainer
picks.

## Method, and its one rule

Every claim marked MEASURED was produced by executing against the built package
(`npx nx build core`, then importing `dist/packages/core/dist/index.js` from a
`node --input-type=module` script). One process per arm, repeated, medians
reported with spread where the spread matters, and every timing loop reads state
back so nothing is dead-code eliminated.

That rule earned its keep immediately: **three of the premises this spike was
commissioned on turned out to be false**, and each was false because a previous
check verified a mechanism instead of an outcome, or asserted before an
asynchronous flush. Section 1 is those corrections, and it has to come first
because it changes the requirements.

---

## 1. Corrections to the inputs

### 1.1 Collection mutations DO record. The stated defect is a test artefact.

The premise for [TODO](../../TODO.md) item 2a, for the ❌ rows in
[undo-business-and-ux-cases.md](../audits/2026-08/undo-business-and-ux-cases.md)
§4, and for the fit-page rewording in TODO item 4, is:

> `addOne`/`updateOne`/`removeOne` create no history entry. Verified: three
> collection mutations left history at 1 with `canUndo()` false.

MEASURED, same three mutations, in one script, differing only in whether the
microtask queue was allowed to drain:

| assertion point               | history length | `canUndo()` |
| ----------------------------- | -------------- | ----------- |
| synchronously after the calls | 1              | `false`     |
| after `await` (one tick)      | 2              | **`true`**  |

The `PathNotifier` batches through `queueMicrotask`, and `timeTravel()` records
on `onFlush`. Nothing is recorded synchronously for a marker write, so a
synchronous assertion sees an empty history **by construction, for any marker
write, forever**. The reported numbers reproduce exactly — 1 and `false` — which
is why they were convincing.

Outcomes, asserted rather than mechanisms, all MEASURED and all with no
counter-bump workaround and no root write:

| UX case                   | operation                      | result                              |
| ------------------------- | ------------------------------ | ----------------------------------- |
| 2 — "undo that delete"    | `removeOne('b')` then `undo()` | 3 → 2 → **3**, ids `a,b,c`          |
| 4 — "undo that drag"      | `updateOne('c', { order: 0 })` | `abc` → `cab` → undo → **`abc`**    |
| 1b — "undo that row edit" | `updateOne` on a field         | reverts                             |
| 3 — "undo my bulk action" | 20 `updateOne` in one turn     | **one** entry, one undo reverts all |

The mechanism is `interceptLeafSignals`, which wraps marker mutators
(`intercept-leaf-signals.ts`, the marker branch) as well as plain signals, so an
`addOne` sets `timeTravel`'s `selfDirty` flag and the flush hook records.

**Consequence for this spike:** the demand side is not "collections cannot be
undone". It is "collections can be undone, and the step boundaries, the scope and
the authorship are wrong". That is a different problem, and a smaller one. TODO
item 2a, audit cases 1b/2/4, and workload verdicts 2/4/5/6 in §7 of the
business-cases doc all need re-scoring before they are used as requirements.

### 1.2 `notify()` does NOT fire at every write site

[history-the-native-shape.md](../architecture/history-the-native-shape.md) rests
on "`notify(path, value, prev)` — at every write site, already". MEASURED, with a
`subscribe('**')` listener attached and no interception installed:

| write form                       | paths reaching the notifier                            |
| -------------------------------- | ------------------------------------------------------ |
| `tree.$.a.b.c.set(2)`            | **none**                                               |
| `tree({ a: { b: { c: 3 } } })`   | **none**                                               |
| `tree.updateAndReport(...)`      | **none** (it returns `["a.b.c"]`, and notifies nobody) |
| `entityMap.addOne/updateOne/...` | `rows.<id>`                                            |
| `form().patch(...)`              | `f` — the form path, whole value as one blob           |
| `status().setLoading()`          | **none**                                               |

With `interceptLeafSignals` installed, all four plain-write forms are covered
(`tree(partial)`, `updateAndReport`, `tree(updater)`, `batchUpdate` — MEASURED,
all produce a path). So the substrate is real but it is **two mechanisms, not
one**: markers self-notify; everything else needs an interceptor that
`timeTravel()` and devtools each install independently.

Two narrower facts matter for the options below:

- **A `form()` is one path.** Its notify carries the whole form value, so a
  path-keyed log has no field granularity inside a form. Per-field undo in a form
  is not expressible on the notifier — it needs the form's own history.
- **`status()` is invisible.** Consistent with
  [undo-redo-vs-devtools.md](../architecture/undo-redo-vs-devtools.md) (undo does
  not want loading state), and a genuine hole for a forensic devtools layer.

### 1.3 The notifier already implements correct coalescing — within a turn

MEASURED, five writes to one path in one microtask (`1→2→3→4→5→6`):

```
events after one turn: [{"path":"a.b.c","before":1,"after":6}]
```

One event, **first** `before`, **last** `after`. And a write-then-revert inside
one turn (`6→99→6`) produces **zero** events.

`PathNotifier.notify` keeps `firstValues.get(path)` as `oldValue` and overwrites
`newValue`, then `flush()` skips any path where `newValue === oldValue`. That is
exactly the merge rule hard problem 2 warns about getting backwards, and it is
already written, already correct, and already shipped. **Cross-turn coalescing —
merging a run of turns into one step — is still open.** Within a turn it is done.

### 1.4 Granularity today is "per microtask", which is neither of the two options on the table

MEASURED, 20 `updateOne` calls on 20 different entities:

| shape                  | history entries added |
| ---------------------- | --------------------- |
| synchronous `for` loop | **1**                 |
| `await` between each   | **20**                |

The same drag, the same bulk assign, records one step or twenty depending on
whether the handler happens to await. The open product judgement in §7 is usually
framed as "per-write vs per-turn". Today it is neither: it is _per microtask_, an
implementation accident that maps to no user intention. Any option has to replace
it with something a developer can state.

### 1.5 "Recording is flat in state size" is false. It is sublinear.

MEASURED, cost per RECORDED history entry, snapshot model, 50 entries per run,
`n.flushSync()` after each write so one write = one entry, median of 11 runs for
the two extreme widths:

| collection width | scalar-only write | collection write |
| ---------------- | ----------------- | ---------------- |
| 1,000 rows       | **23.1 µs**       | 31.8 µs          |
| 10,000 rows      | 29.9 µs           | 66.9 µs          |
| 50,000 rows      | **70.7 µs**       | 255 µs           |

Spreads do not overlap for the scalar case (1k: 20.0–38.7; 50k: 62.0–80.8), so
the 3.1× is real. A collection write is worse because the snapshot's `all` array
is rebuilt: MEASURED at 500 rows, changing one entity, the unrelated branch is
shared, the `rows` node is not, and 499/500 entity objects are shared — one fresh
N-pointer array per entry.

**And the 340.60 ms → 0.04 ms figure does not reproduce.** MEASURED at 10,000
rows, 50 writes:

| shape                              | entries recorded | total        |
| ---------------------------------- | ---------------- | ------------ |
| 50 root writes `tree({ rev: i })`  | 50               | 0.73–1.95 ms |
| 50 leaf writes, batched (no flush) | **1**            | 0.19–0.61 ms |
| 50 leaf writes, flushed each       | 50               | 1.13–1.48 ms |

The cheapest configuration I can construct is 0.19 ms, and it records **one**
entry for fifty writes — which is the most likely shape of a 0.04 ms measurement,
and would make it a count artefact of the same family as §1.1. The improvement
over the pre-13.5.0 340.60 ms is real and large (~170–450×); "flat in state size"
is the part to retract.

**This inverts the brief's premise.** It is not true that time is settled and
only memory is at stake. Both scale with collection width in the snapshot model,
and the correction below matters more than either.

### 1.6 Restoring a snapshot is O(state). The snapshot model's one advantage does not exist here.

`history-the-native-shape.md` concedes two things to snapshots, the first being
"`jumpTo(arbitrary index)` is a pointer move on a snapshot stack". Not here.
MEASURED, median of 20 for undo, median of 11 for a 40-step jump:

| collection width | `undo()` one step | `jumpTo()` across 40 steps | diff-log undo one step |
| ---------------- | ----------------- | -------------------------- | ---------------------- |
| 1,000 rows       | 59 µs             | 34 µs                      | **0.92 µs**            |
| 10,000 rows      | 78 µs             | 59 µs                      | **1.37 µs**            |
| 50,000 rows      | 434 µs            | 90 µs                      | **1.08 µs**            |

A pointer move is O(1) because an immutable store _has_ a root pointer.
SignalTree does not: `restoreState()` hands the snapshot to `tree(state)`, which
is a full recursive write. So snapshot navigation costs O(width) and log
navigation costs O(entries in the span) — flat at ~1 µs per entry.

The crossover is around 35–90 steps. Below that the log wins; a 200-step jump in
a devtools panel favours a keyframe. **Undo, which is one step, is 60–450× cheaper
on a log.** That is the single strongest architectural argument in this document,
and it is the opposite of what the snapshot model was assumed to buy.

### 1.7 Retention: the log is flat, the stack is not

MEASURED with `--expose-gc`, one process per arm, 3 reps (identical to 3 decimal
places), 50 recorded steps each a single-entity write, heap retained after the
run with the history and tree still reachable:

| collection width | no history | snapshot stack | path-diff log |
| ---------------- | ---------- | -------------- | ------------- |
| 1,000 rows       | 0.14 MB    | 0.59 MB        | **0.16 MB**   |
| 10,000 rows      | 0.17 MB    | 4.05 MB        | **0.22 MB**   |
| 50,000 rows      | 0.15 MB    | 19.58 MB       | **0.15 MB**   |

Consistent with ST2029's `entries × width` model for the stack, and the log is
flat — indistinguishable from no history at all, because `before`/`after` are
references to entity objects the tree already holds.

**With one trap that has to be designed around.** The log arm holds 50,050
entries at 50k rows: seeding a collection notifies **once per entity**. Bytes are
flat and _entry count is O(state)_. So `maxHistorySize` as an entry count would
silently amputate the tail of any bulk operation. A log must be bounded by
**turns**, never by entries.

### 1.8 The authorship failure is real, and narrower than documented

MEASURED. Tree with a scalar `rev` and a `rows` collection; user edits `rev`,
"server" adds a row, user edits `rev` again:

| scenario                                                   | result                  |
| ---------------------------------------------------------- | ----------------------- |
| server push in its own turn, **one** `undo()`              | server row survives     |
| server push in its own turn, **two** `undo()`              | **server row reverted** |
| server push in the SAME turn as a user write, one `undo()` | **server row reverted** |

So it is not "any undo eats server data". It is (a) undoing _past_ a server
entry, and (b) a server push sharing a microtask with a user write — which is
exactly the shape of an HTTP callback that stores rows and flips a loading flag.
Both are still unacceptable in the SCADA/NOC workload; the narrowing matters
because it tells you the fix is turn attribution, not global suppression.

### 1.9 NEW DEFECT: `history: false` converts data loss into dead undo steps

MEASURED. `entityMap({ history: false })` correctly keeps the collection out of
the snapshot — three undos left the rows untouched. But an **excluded-only write
still records an entry**, because `selfDirty` is set by the interceptor before
anything knows the write was excluded, and `pruneHistoryExcluded` runs after the
snapshot is built:

```
five excluded-only writes -> history length 7, canUndo true
undo() -> rev 1 -> 1   (a user pressing Ctrl+Z sees NOTHING change)
```

Five phantom steps. The user presses Ctrl+Z, the button was enabled, and nothing
moves. Combined with §1.8's two-undo case: pressing Ctrl+Z twice can consume one
step that does nothing and then one that destroys server data. Not previously
reported anywhere in `docs/`.

### 1.10 NEW HARD PROBLEM: position is not recoverable from a value diff

Missing from the five in `history-the-native-shape.md`, and it blocks UX case 2
("the removed row, restored **in place**"). MEASURED:

| inverse of `removeOne('b')` on `[a,b,c,d]` | result                                                         |
| ------------------------------------------ | -------------------------------------------------------------- |
| `addOne(before)`, no `sortComparer`        | `a,c,d,b` — **order lost**                                     |
| `addOne(before)`, with `sortComparer`      | `a,b,c,d` — order preserved (it is derived from data)          |
| `setAll(spliced at remembered index)`      | `a,b,c,d` — O(N), and needs an index the notify does not carry |

The entity node offers `addOne`, `prependOne`, `addMany`, `prependMany`,
`setAll`, `replaceOne`, `upsertOne` — and **no `insertAt`**. A value diff carries
`{path, before, after}` and no position, so an insertion-ordered collection
cannot be repaired without either a new O(1) positional insert or an O(N)
`setAll`. This is the clearest advantage a _command_ log has over a _value_ log.

### 1.11 `changeId` is invisible to the notifier, and the naive inverse duplicates a row

MEASURED. `changeId('tmp-1', 'srv-42')` produced **zero** notifications: the call
site notifies with the same value for both `value` and `prev`, and `flush()`
drops any path where `newValue === oldValue`. So a log holding `rows.tmp-1` has
no remap event to subscribe to, and applying the inverse:

```
has('tmp-1') = false
naive inverse => count 1 -> 2, ids ["srv-42","tmp-1"]   <-- DUPLICATE ROW
```

Worse than hard problem 3 describes. There is not a remap to apply; there is no
signal at all.

### 1.12 `form(history())` restore is a patch, and cannot delete a key

MEASURED. Ordinary cases are correct — field undo/redo across three steps, and an
array shrinking from `['x','y']` to `['x']` restores. But `restore()` calls
`ctx.write(target)` which patches, so a key introduced after `initial`:

```
before undo: {"name":"b","tags":["x"],"extra":"appeared"}
after  undo: {"name":"b","tags":["x"],"extra":"appeared"}   <-- key survived
```

Narrow (dynamic/array field sets), and it is the same "a partial restore is worse
than a failed one" shape the codebase has already paid for once.

### 1.13 Dead coalescing machinery already in the tree

`addEntry(action, payload, provisional = false)`, `__provisional`, and
`finalizeProvisional()` exist in `time-travel.ts`. **Nothing in `packages/*/src`
ever passes `provisional = true` and nothing calls `finalizeProvisional`** —
coverage marks it uncovered. It is a half-built attempt at exactly the coalescing
still filed as gap D. Any option should delete it rather than inherit it.

---

## 2. Goals, ranked, each naming the workloads that demand it

Derived from §7 of
[undo-business-and-ux-cases.md](../audits/2026-08/undo-business-and-ux-cases.md)
— the eleven workloads the fit page recommends SignalTree for. Ranked by how much
damage the absence does, not by how interesting the feature is. Workload numbers
are that document's.

| #      | Goal                                                                             | Demanded by                                                                     | Why it ranks here                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1** | **An undo must never revert a change the user did not make.**                    | 1 (telemetry/SCADA/NOC), 2 (offline, server-owned collections), 7 (BI datasets) | The only goal whose failure is a safety issue rather than an annoyance. §1.8 shows it fails today in two reachable ways.                                                      |
| **G2** | **One user action = one undo step, deterministically, stated by the developer.** | 4 (bulk assign), 5 (drag boards), 6 (bulk edit, wizards)                        | §1.4: today it depends on whether a handler awaits. Non-deterministic step boundaries make undo untrustworthy, which removes the whole business case (bulk-operation safety). |
| **G3** | **Structural undo over collections: add, delete, reorder — restored in place.**  | 4, 5, 2 (offline creates), 6                                                    | The top four UX cases are all collection mutations. §1.1 says add/delete/reorder revert; §1.10 says a delete does not come back _in place_ without a `sortComparer`.          |
| **G4** | **Scope: an undo in one place must not move state elsewhere.**                   | 1, 2, 3 (forms + audit + persistence), 7                                        | The only structural defence for G1 — discipline is not one. Already proven by `form(history())`, whose history cannot see the rest of the tree.                               |
| **G5** | **A step carries a human label, set by the developer.**                          | 4 (bulk), 6 (editors), 3 (regulated trails)                                     | Blocks any undo _menu_. Cheap under every option. Note: 3 wants an audit log, which is a different artefact — see the non-goals.                                              |
| **G6** | **Retention bounded and predictable, stated in units a developer controls.**     | 1, 7, 8 (large collections)                                                     | §1.7: bytes are fine on a log and 19.6 MB on a stack at 50k — but the log's _entry count_ is O(state), which breaks the obvious bound.                                        |
| **G7** | **Coalescing a run of turns into one step.**                                     | 3 (typing in deep forms), 6 (editors)                                           | Genuinely lowest. §1.3 shows within-turn coalescing is done; cross-turn matters only for text-heavy editing, which is not the centre of the claimed workloads.                |

**Explicit non-goals**, each because no workload asks for it:

- **Per-entity independent undo.** The mental model in a grid is "undo my last
  action", not "undo this row's history". Falls out of G4's mechanism anyway.
- **Forensic replay of `status()`/loading/in-flight requests.** A different
  feature with a different audience — `undo-redo-vs-devtools.md` settled this, and
  §1.2 confirms `status()` does not even notify.
- **Audit trail.** Append-only, never rewound, different retention, different
  authority. `createAuditTracker()` already exists. Conflating it with undo
  satisfies neither (workload 3).
- **Cross-user intention preservation.** Workload 9 is routed to a CRDT and
  should stay routed there.
- **Undoing a server effect.** No store can un-send a `POST`.

---

## 3. What the tree actually gives a history subsystem

Established in §1 and stated here as the substrate every option builds on.

| Capability                                         | Available?                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| The changed path, at write time, for free          | Yes for markers (self-notify); for plain leaves only via `interceptLeafSignals` |
| `before` and `after` values                        | Yes, both, from `notify(path, value, prev)`                                     |
| Per-path within-turn coalescing, correctly ordered | **Yes, already implemented** (§1.3)                                             |
| A turn boundary                                    | Yes — `onFlush`, one per microtask. Not a user action.                          |
| The _operation_ that caused a write                | **No.** `updateOne` and `replaceOne` both surface as one path with a new value. |
| The _position_ of an entity                        | **No.** §1.10.                                                                  |
| A rekey event                                      | **No.** §1.11.                                                                  |
| Field granularity inside a `form()`                | **No.** One path per form. §1.2.                                                |
| O(1) whole-state restore                           | **No.** §1.6. There is no root pointer.                                         |
| Reference-shared snapshots, frozen in dev          | Yes — and this is what makes the _stack_ affordable at all                      |

Two asymmetries decide most of the design space. **The tree knows the path and
the values but not the intention** — that is the A-versus-B fork. And **it has no
root to swap** — which is why the snapshot stack's headline property is absent
and why it should not be the undo representation regardless of which option wins.

---

## 4. The design space

Six options. Each is stated as: how undo works, how scope works, how
grouping/labelling/coalescing work, retention, what it makes IMPOSSIBLE, and
honest pros and cons.

### Option A — Inverse path-diff log (a value log)

One append-only global log of `{ path, before, after, turn, label?, author? }`.
Undo applies `before` at `path`.

This is the option
[history-the-native-shape.md](../architecture/history-the-native-shape.md)
argues for, corrected by §1.2 (it needs its own leaf interception; markers
self-notify) and §1.3 (its coalescing already exists inside a turn).

**Feasibility: PROVEN.** A working prototype was built outside the library — one
`subscribe('**')`, one `onFlush`, one `interceptLeafSignals`, no source
modified — and MEASURED to do all of:

| behaviour                                        | outcome                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| leaf undo/redo by path                           | `c: 1→2→3` → one undo → **1** → redo → **3**                                 |
| collection delete → undo                         | ids restored, **but appended not in place** (§1.10)                          |
| bulk assign, 3 entities, one turn → **one** undo | all three owners back to `null`, rows not deleted                            |
| authorship filter                                | server push survived two user undos — G1 **satisfied by construction**       |
| path-prefix scope                                | `undo({ prefix: 'rows.a' })` moved row a only; row b and the draft untouched |

The suppression detail that made it work is worth recording: the inverse write
re-enters the notifier, so it must be wrapped in a suppression flag _and_
`flushSync()`ed inside that flag — otherwise the undo appends itself to the log.

- **Undo** — apply `before` at `path`. **0.9–1.4 µs, flat in collection width**
  (§1.6). 60–450× cheaper than snapshot undo.
- **Scope** — `path.startsWith(prefix)`. Per-entity undo and branch scoping are
  the same one-line filter. MEASURED working.
- **Grouping** — a `turn` id shared by a span; undo walks the span newest-first.
  Replaces `pauseRecording` + the sealing-write trap entirely.
- **Labelling** — a field. `transaction(label, fn)` stamps a turn.
- **Coalescing** — within a turn, free and already correct (§1.3). Across turns,
  merge adjacent same-path entries keeping the earlier `before` and later `after`.
- **Retention** — **flat in state size** (§1.7: 0.15–0.22 MB at every width).
  Bounded by turns, not entries.

**Makes IMPOSSIBLE:**

- Restoring an insertion-ordered collection **in place** (§1.10). Needs a
  `sortComparer`, a new `insertAt`, or an O(N) `setAll`. UX case 2 is a direct hit.
- Surviving `changeId` (§1.11) without a new remap notification.
- Field-level undo inside a `form()` — one path per form (§1.2).
- "Show me the whole state at step N" without replaying from a keyframe.
- Freezing history. Snapshot entries are frozen in dev; a log holds live
  references, so a consumer that mutates an entity it read from the log corrupts
  history silently. The read-only contract that made the stack safe is lost.

**Pros:** the cheapest undo by a wide margin and flat in width; nine of the
audit's gaps collapse into fields on a record; authorship becomes structural
rather than disciplinary; it is the only option proven end-to-end in this spike.

**Cons:** value diffs throw away intention, so position, rekey and any
order-sensitive operation are unrepresentable without extra channels — the
non-invertibility class is _larger_ than the doc claims, not smaller; entry count
is O(state) on a bulk seed, so the obvious retention bound is wrong; it loses the
frozen-history guarantee; a `form()` is opaque to it; and it needs an interception
point that two subsystems already install separately, which is a third copy of a
mechanism nobody owns.

### Option B — Command / intention log

Record the operation and its parameters, not the values:
`{ op: 'removeOne', target: 'rows', args: ['b'], inverse: { op: 'insertAt', args: [1, entity] }, turn, label? }`.
Undo runs the inverse command.

**Undo** — execute the inverse. Cost is the cost of the operation: O(1) for a
field write, O(1) for `insertAt` if it existed, O(N) for `setAll`.

**Scope** — by `target` path, same prefix filter as A, but coarser: the command
names the collection, and per-entity scope needs the args parsed.

**Grouping** — a turn id, same as A. A command log also makes a _macro_ natural:
one recorded command whose inverse is a list of inverses.

**Labelling** — better than A: the op name is already a label
(`"Remove row"`, `"Assign 400 tickets"` for a macro). G5 nearly free.

**Coalescing** — worse than A. Two `updateOne` commands on the same field merge
only if you know the ops commute, which the log does not. The notifier's existing
within-turn value coalescing (§1.3) is _unavailable_, because commands are
recorded before values settle.

**Retention** — smallest of all options: args are usually ids and small patches.
A `removeOne` inverse must retain the removed entity, so it is not zero.

**Makes IMPOSSIBLE:**

- Recording writes that did not come through a named API. A direct
  `tree.$.a.b.c.set(x)` is not a command, so either every write form has to be
  modelled as a command (large surface) or leaf writes fall back to a value diff —
  at which point this is Option A with extra steps for collections.
- Automatic correctness. A value diff's inverse is mechanically derivable; a
  command's inverse is hand-written per operation, and a wrong one is a silent
  data-loss bug. There are ~20 mutators on the entity node alone.
- Faithful replay when an operation is not deterministic (`upsertMany` behaves
  differently depending on what is present).

**Pros:** the only option that solves §1.10 properly — the command knows the
index, so a delete comes back in place; it survives `changeId` if the rekey is
itself a command; labels are free; retention is the smallest; and "undo my bulk
action" is one record rather than a span, which makes G2 structural rather than
conventional.

**Cons:** ~20 hand-written inverses in `entityMap` alone, each a potential silent
data-loss bug, and none of them checkable by the type system; it cannot see
non-API writes, which is most of a plain tree; it forfeits the free within-turn
coalescing that already works; and it puts a new correctness obligation on every
future mutator we add, forever. The measured undo cost advantage over A is
nil — both are O(1) for the common case — so the entire case for B is §1.10 plus
labels.

### Option C — Per-position independent histories, and no global log at all

Generalise `form({ history: history() })` to every marker and to plain branches.
`entityMap({ history: history() })` keeps its own stack; a branch declares
`tracked()`. There is no tree-wide history object and no global index.

**Undo** — `tree.$.rows.history.undo()`. Each position owns its representation
and can pick the cheapest one for its shape (a collection can keep commands, a
form keeps projected value snapshots as it does today).

**Scope** — **declared at the position**, which is the library's organising idea
(`stored()`, `status()`, `compared()`, `entityMap()`). G1 and G4 are satisfied _by
construction_: a history that has no reference to the rest of the tree cannot
revert it. §1.8's failures become unrepresentable rather than documented.

**Grouping** — within one position, a turn id. **Across positions, impossible.**

**Labelling** — a field, per position.

**Coalescing** — per position, and easier: a form already projects and compares,
so it already dedupes.

**Retention** — per position, bounded per position, and the _shape_ is chosen per
position. Excellent for G6: the 50,000-row grid opts out by not opting in, and
`history: false` becomes unnecessary rather than merely awkward — which also
deletes the §1.9 phantom-step defect, because there is nothing global to record a
phantom into.

**Makes IMPOSSIBLE:**

- **"Undo the last thing I did."** This is case 1 of 32, the highest-ranked case
  in every audit, and the one thing that works today. With N independent
  histories and no ordering between them, there is no last thing. The consumer has
  to decide which scope Ctrl+Z belongs to.
- A bulk action that spans two positions (assign owners **and** stamp
  `updatedAt`) as one step.
- A single history list for case 17 / any undo menu.
- Whole-tree devtools rewind.

**Pros:** the only option where G1 and G4 are structural rather than best-effort;
follows the established positional-declaration ethos exactly; per-position choice
of representation means a collection and a form each get the right one; deletes
`history: false`, `pauseRecording` and the phantom-entry defect outright;
retention is bounded where the data is.

**Cons:** it deletes the most-wanted feature. Ctrl+Z becomes a composition the
application assembles, and every consumer will assemble it slightly wrong —
usually by ordering positions by a timestamp, which is the global log they were
told they did not need, rebuilt badly outside the library. It also multiplies API
surface: every marker grows a `history` option with matching semantics, and plain
branches need a new marker that exists only to enable history.

### Option D — Turn journal: per-position logs, spanned by a global turn index

Option C's per-position logs, plus one global, tiny spine: an ordered list of
turns, each turn holding `{ id, label?, author, participants: [positions] }` and
no state at all. `tree.undo()` reads the newest turn, asks each participating
position to undo that turn id, and stops.

**Undo** — pop a turn, fan out to the positions it names. Cost is the sum of the
per-position undos: O(1) per participant.

**Scope** — two levels, and they compose. `tree.$.rows.history.undo()` is scoped;
`tree.undo()` is global but **turn-bounded**, so it can only ever revert what one
turn contained. §1.8's cross-turn failure is gone by construction (a turn cannot
span a user write and a server push unless something declared it did), and the
same-turn failure becomes an explicit, catchable condition: a turn with two
authors is a bug the library can throw ST-something on.

**Grouping** — the turn _is_ the group. `transaction(label, fn)` opens one turn
across positions. G2 is the primitive rather than an afterthought.

**Labelling** — on the turn, which is the right granularity: a user names an
action, not a write.

**Coalescing** — merge adjacent turns with the same label/positions, which is a
much smaller and safer merge than merging entries.

**Retention** — per-position logs, bounded in turns. The spine is a few hundred
bytes. G6 is stated in the unit a developer actually thinks in ("keep 50 undo
steps"), which neither the current `maxHistorySize` nor A's entry count manages.

**Makes IMPOSSIBLE:**

- "Show me the whole state at step N" — same as A/B/C; needs keyframes.
- Recording a write to a position that did not opt in. That is the point, and it
  is also the trap: a partial undo. The lesson already paid for
  (`undo-redo-vs-devtools.md`: "a partial restore is worse than a failed one")
  applies at full force, so the library must be able to _say_ which positions a
  turn touched but could not record — a per-turn "incomplete" verdict.
- Undo that crosses a turn boundary in one gesture (which is a feature, not a
  loss).

**Pros:** the only option that satisfies G1, G2, G3 and G4 together. Turn-bounded
global undo keeps case 1 working while making cross-authorship reverts
structurally impossible. Retention is expressed in steps. Labels sit at the right
granularity. Each position keeps the representation its shape wants, so §1.10 is
solved where it occurs (a collection keeps commands) without imposing commands on
plain leaves.

**Cons:** the most code and the most new public surface of any option — a turn
journal, a per-position history contract, a `history()` value accepted by three or
four markers, and something for plain branches. It reintroduces the global object
C abolished, so the cross-scope-undo hazard is _narrowed_, not removed. It needs a
"this turn is incomplete" concept, which is a new failure mode to document and to
render in a UI. And the fan-out means one turn's undo is only as correct as its
least correct participant.

### Option E — Snapshot keyframes plus diffs (for devtools, not undo)

Keep whole-tree snapshots, but only every N turns, and diffs in between.
`jumpTo(n)` finds the nearest keyframe and replays forward.

Positioned deliberately as **not an undo mechanism**. §1.6 says snapshot
navigation is O(width) and flat in span; log navigation is O(span) at ~1 µs.
Keyframes are the right answer above ~35–90 steps and the wrong one below it.

**Undo** — possible but wasteful; it is the current design with fewer entries.

**Scope** — none. A whole-tree snapshot is definitionally whole. This is the
option that cannot have G4, which is why it must not be the undo mechanism.

**Grouping/labelling** — on the diffs, borrowed from whichever log option ships.

**Retention** — `keyframes × width` plus flat diffs. At 50k rows, one keyframe
per 25 turns is ~0.4 MB per keyframe rather than 19.6 MB per fifty entries. Good
for a dev-only tool, still too much for production.

**Makes IMPOSSIBLE:** scoped anything; authorship; production use over a large
collection; and — importantly — it cannot be the _only_ mechanism, because a
keyframe alone cannot answer "undo my edit".

**Pros:** the honest home for `jumpTo`, whole-tree rewind, unbounded history, and
the forensic cases (`LOADING` kept, `status()` exact). Composes with A/B/C/D
rather than competing. Cheap to build once a diff log exists.

**Cons:** it is the current architecture with a size cap, so shipping only this
changes nothing about G1–G4; it must never be reachable in production or §1.8
returns; and the shared memoised snapshot path
([RFC 0012 §3](../rfcs/0012-history-scoped-marker-capture.md)) means a
purpose-keyed snapshot costs the structural sharing the memo exists for.

### Option F — Keep the snapshot stack; fix the three defects (the null option)

Included because §1.1 changed what "broken" means. Collection recording works.
Delete, drag, in-grid edit and bulk-in-one-turn all revert, MEASURED. What is
actually wrong is three things, all narrower than a rewrite:

1. **Turn attribution** (G1/G2): replace "per microtask" with an explicit turn,
   and refuse to record a turn with two authors. §1.4, §1.8.
2. **Phantom entries** (§1.9): do not record an entry whose only difference is
   pruned content. A `selfDirty` flag that knows the write was excluded.
3. **Labels and transactions** (G5/G2): make `addEntry` public behind
   `transaction(label, fn)`, and delete the dead `__provisional` machinery
   (§1.13) rather than finishing it.

**Undo** — unchanged, 59–434 µs and O(width).

**Scope** — stays a whole-tree opt-out (`history: false`), so G4 is
best-effort and G1 depends on discipline.

**Retention** — stays `entries × width`: 19.6 MB at 50k × 50.

**Makes IMPOSSIBLE:** G4 in any real sense, per-entity or branch scope, flat
retention, cheap undo over a large collection, and persisting history across a
reload at a sane size.

**Pros:** by far the least work; lands on a representation with 1,087 passing core
tests behind it; keeps `jumpTo` and devtools working unchanged; fixes the two
reachable G1 failures and the phantom-step defect; and no consumer's
`getHistory()` breaks. It could ship in a minor.

**Cons:** it accepts O(width) undo and `entries × width` retention permanently,
in a library whose entire thesis is that no code path may do O(state) work when
one leaf changed — §4 of
[the design thesis](../architecture/design-thesis-and-benchmarking-rules.md)
names `timeTravel()` as the worst violation of exactly that rule, and this option
leaves the violation in place. It also leaves G4 unachievable, which means G1 is
forever a matter of the consumer remembering something.

### Considered and rejected

- **Event-sourced projection** (state is a fold over an event log; undo = drop the
  tail and re-fold). Rejected on §1.6's evidence turned around: re-folding is
  O(events × cost), and the tree has no fold — state is _authored_ by writes at
  leaves, not derived. It would require inverting the library's write model and
  would reintroduce whole-state work per change. It is the right architecture for
  a different library.
- **Persistent-trie state with versioned roots** (get O(1) restore by making the
  root a real pointer). Rejected on the Track D measurements already in
  [the data-model spike](./2026-08-state-data-model-spike.md): it buys O(1)
  restore and cheap versioning, and it costs the per-leaf signal ownership that is
  the product. This is a state-model change wearing a history hat.
- **Deriving history from `serialization()` polling.** Rejected: it is
  `JSON.stringify(tree())` on a timer, the anti-pattern verbatim.

---

## 5. The five hard problems (plus the two this spike found), per option

`history-the-native-shape.md` §"What is genuinely hard" lists five. §1.10 and
§1.12 add two. Answered per option.

### 5.1 Non-invertible writes

MEASURED first, because the problem is smaller than stated for _values_ and
larger for _effects_. A function leaf and a `Map` leaf both restore by identical
reference through the current snapshot model (no clone since 13.5.0), and history
entries are frozen in dev. A class instance with only private fields is destroyed
at _materialisation_, not at undo — it becomes a branch with no enumerable
properties and its methods are gone before history is involved.

| Option | Answer                                                                                                                                                                                                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | `before`/`after` hold live references, so value invertibility is as good as the stack's — and it _loses the frozen guarantee_, which is a new hazard rather than a solved problem. Needs a per-entry "not invertible" verdict for effect-bearing writes and a policy for one appearing mid-span (proposal: mark the whole turn non-undoable and say so). |
| B      | Best. A command can declare itself non-invertible explicitly, which is a design-time statement rather than a runtime guess.                                                                                                                                                                                                                              |
| C/D    | Per position, which is right: `form()` already excludes secrets by projection; a collection declares per-mutator. The turn-level verdict in D is where "one participant cannot invert" gets reported.                                                                                                                                                    |
| E      | Keyframes sidestep it — a keyframe is a state, not an inverse. This is the genuine argument for keeping keyframes somewhere.                                                                                                                                                                                                                             |
| F      | Unchanged (references restore; effects do not).                                                                                                                                                                                                                                                                                                          |

**Cross-cutting:** the class-instance case should be a diagnostic at construction,
not a history feature. It is a materialisation defect wearing a history costume.

### 5.2 Coalescing order correctness

**Already solved within a turn, in shipped code** (§1.3): first `before`, last
`after`, per path, and a write-then-revert produces nothing.

| Option | Answer                                                                                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A      | Inherits it free within a turn. Cross-turn merge must keep the earlier `before` and later `after`; a wrong merge lands undo on a value that never existed, so it should be a read-time view over a retained log (which is what moving `shouldSkip` to read time already bought) and never a destructive save-time merge. |
| B      | **Loses it.** Commands are recorded before values settle, so the notifier's merge is unavailable and command-level merging needs commutativity the log does not know. This is B's worst property and it is easy to miss.                                                                                                 |
| C      | Per position, and easier — a form already compares projections and dedupes.                                                                                                                                                                                                                                              |
| D      | Merge _turns_, not entries. Strictly safer: two turns with the same label and the same participants merge without reasoning about values at all.                                                                                                                                                                         |
| E      | Not applicable to keyframes; applies to its diffs, same as A.                                                                                                                                                                                                                                                            |
| F      | Not expressible. The dead `__provisional` machinery (§1.13) was the attempt; it never had a caller.                                                                                                                                                                                                                      |

### 5.3 Path stability under `changeId` (ST2031)

**Worse than documented.** §1.11: `changeId` notifies _nothing_, and the naive
inverse produces a duplicate row (`ids ["srv-42","tmp-1"]`).

| Option | Answer                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Broken until `changeId` emits a real remap event that the log can apply to retained paths. Prerequisite, not a follow-up.                |
| B      | Solved if the rekey is itself a recorded command with `changeId(to, from)` as its inverse — the natural shape.                           |
| C      | Contained: the collection owns its own history and can rewrite its own keys on rekey without anyone else knowing. Best answer available. |
| D      | Same as C, plus the turn spine references positions rather than paths, so nothing above the collection holds a stale key.                |
| E      | Immune (a keyframe holds values, not keys).                                                                                              |
| F      | Immune for the same reason, and this is a real point in F's favour.                                                                      |

### 5.4 Retention of references into the structurally-shared graph

MEASURED (§1.7): the log retains 0.15–0.22 MB flat, indistinguishable from no
history at all, because `before`/`after` point at entity objects the tree already
holds. The stack retains 0.59/4.05/19.58 MB.

The genuine hazard is not bytes, it is **liveness**: a log holding `before` for a
removed entity keeps that subtree alive, so a long log over a churning collection
retains entities the app has otherwise forgotten. Not measured here — it needs a
churn workload (add/remove N times) rather than an update workload, and it should
be measured before A or B ships.

| Option | Answer                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| A      | Flat in width, O(state) in _entry count_ on a bulk seed (50,050 entries at 50k). Bound by turns. Unmeasured churn liveness. |
| B      | Smallest bytes; same churn liveness for `removeOne` inverses.                                                               |
| C/D    | Bounded per position, which is the only bound a developer can reason about locally.                                         |
| E      | `keyframes × width`. Dev-only for that reason.                                                                              |
| F      | `entries × width`, ST2029 warns, 19.6 MB at 50k × 50.                                                                       |

### 5.5 Pre- versus post-batch recording

Post-batch, in every option, and this is now an evidence-backed answer rather
than a judgement: recording post-batch is what delivers §1.3's correct
coalescing, and recording pre-batch would record intermediate values a user never
saw.

The real question underneath is **what a "batch" means**, and §1.4 answers that
too: a microtask is the wrong unit. Every option needs an explicit turn — opened
by `transaction()`, or by a frame, or by an event handler — with the microtask
flush as the _default_ turn boundary rather than the only one. D makes the turn a
first-class object; A and B need one anyway.

### 5.6 NEW — Position in an ordered collection (§1.10)

| Option | Answer                                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | **Cannot solve it.** Requires either a `sortComparer` (order becomes data, which is the idiom we should push anyway), a new O(1) `insertAt`, or O(N) `setAll`. |
| B      | Solves it natively — the command carries the index. This is the strongest single argument for B.                                                               |
| C/D    | Solves it where it occurs: the collection's own history records commands even if leaves record diffs.                                                          |
| E/F    | Immune — a snapshot restores the whole array. This is the second real point in F's favour.                                                                     |

**Independent of the option chosen, `insertAt(index, entity)` is worth adding.**
It is O(1), it has no history dependency, and its absence forces O(N)
whole-collection work to put one row back — the anti-pattern verbatim.

### 5.7 NEW — Merge-based restore cannot delete (§1.12)

`form(history())`'s `restore()` patches, so a key added after `initial` survives
undo. Any option whose restore is a merge inherits this. A/B/D restore by explicit
per-path or per-command application and can delete. C inherits it wherever a
position's restore is a patch — so the per-position contract must specify
**replace, not merge**, and `form()`'s implementation needs fixing regardless of
which option wins.

---

## 6. Summary matrix

Goals from §2. `~` = partially, or only with consumer discipline.

|                               |  A diff log   |          B command log           | C per-position | D turn journal |   E keyframes    | F fix the stack |
| ----------------------------- | :-----------: | :------------------------------: | :------------: | :------------: | :--------------: | :-------------: |
| G1 never revert others' work  |       ~       |                ~                 |    **yes**     |    **yes**     |        no        |        ~        |
| G2 one action = one step      |    **yes**    |             **yes**              |  yes, locally  |    **yes**     |        ~         |        ~        |
| G3 structural undo in place   |      no       |             **yes**              |    **yes**     |    **yes**     |     **yes**      |     **yes**     |
| G4 scope                      |    **yes**    |                ~                 |    **yes**     |    **yes**     |        no        |       no        |
| G5 labels                     |    **yes**    |             **yes**              |    **yes**     |    **yes**     |     **yes**      |     **yes**     |
| G6 bounded retention          | yes, in turns |             **yes**              |    **yes**     |    **yes**     |     dev only     |       no        |
| G7 cross-turn coalescing      |    **yes**    |                no                |    **yes**     |    **yes**     |        ~         |       no        |
| undo cost, 50k rows           |  **1.1 µs**   |              ~O(1)               |     ~O(1)      |     ~O(1)      |      90 µs       |     434 µs      |
| retention, 50 steps, 50k rows |  **0.15 MB**  |             <0.15 MB             |  per position  |  per position  | ~0.4 MB/keyframe |    19.58 MB     |
| "undo the last thing I did"   |    **yes**    |             **yes**              |     **no**     |    **yes**     |     **yes**      |     **yes**     |
| whole state at step N         |      no       |                no                |       no       |       no       |     **yes**      |     **yes**     |
| new public surface            |    medium     |              large               |     large      |  **largest**   |      small       |  **smallest**   |
| risk of a silent wrong undo   |    medium     | **high** (hand-written inverses) |      low       |     medium     |       low        |       low       |

---

## 7. The two open product judgements

Framed, not answered. Both are UX decisions before they are engineering ones, and
both are now better informed than when they were filed.

### (a) Granularity: per-write or per-turn?

**What changed:** the question is not open in the way it was filed. §1.4 shows
today's answer is _per microtask_ — 20 `updateOne` calls record 1 entry
synchronously and 20 entries with an `await` between them. Neither of the two
candidate answers is what currently happens, so this is not a choice between the
status quo and a change; both options are changes.

**The case for per-write:** a grid row edit is one write and one step. Simplest
mental model. And per-write is _recoverable_ — a read-time view can group, whereas
a save-time group cannot be ungrouped (this is exactly the argument that moved
`shouldSkip` to read time).

**The case for per-turn:** a drag writing twenty `order` fields is one gesture and
must be one step, or Ctrl+Z twenty times is the user's punishment for dragging.
Same for a bulk assign. And the business case for undo (bulk-operation safety) is
_entirely_ about multi-write actions.

**What the evidence adds:** these are reconcilable rather than exclusive, if
recording is per-write and _stepping_ is per-turn — record every entry, tag it
with a turn, navigate by turn, and let a read-time view expose per-write for a
devtools panel. That costs nothing on a log (§1.3 already coalesces within a turn)
and is impossible on a stack. **The residual decision is what defines a turn** —
a microtask, an event handler, an animation frame, or only an explicit
`transaction()` — and that is the part no measurement can settle. My reading is
that anything implicit will be wrong for someone, which argues for an explicit
`transaction(label, fn)` as the _only_ grouping construct and the microtask as an
unlabelled fallback. But that puts a call-site burden on the drag handler, which
is the objection `pauseRecording` already lost on.

### (b) Scope: positional declaration, or a path filter at the undo call site?

**The case for positional** (`entityMap({ history: history() })`): it is the
library's ethos — `stored()`, `status()`, `compared()`, `entityMap()` all declare
behaviour where the state lives. It makes G1 structurally impossible to violate
rather than merely documented. It is already proven by `form(history())`. And it
deletes `history: false`, along with the phantom-step defect §1.9 that flag
causes.

**The case for a call-site filter** (`undo({ prefix: 'rows' })`): one mechanism
covers per-entity, per-branch and per-collection scope with no new marker options;
MEASURED working in the prototype; a plain branch needs no invented marker to
participate; and the _same_ state can be undone at different scopes by different
UI (a row-level undo button and a page-level Ctrl+Z over one log).

**The tension nobody should paper over:** these answer different questions.
Positional declares _what may be recorded_; a filter declares _what this gesture
reverts_. **They are not alternatives and probably both belong** — positional for
opt-in and retention, filters for gesture scope. The real either/or is narrower:
**does a position that did not opt in get recorded at all?** If yes, the filter is
the only real scope and G1 depends on every undo call site passing the right
filter. If no, retention and G1 are structural and the cost is that undo can be
_partial_ — which is the failure mode this codebase has already paid for once, and
which needs a per-turn "incomplete" verdict to be honest about.

---

## 8. What gets deleted

| Artefact                                        | A                                                     | B                 | C                                | D                                      | E                          | F                                     |
| ----------------------------------------------- | ----------------------------------------------------- | ----------------- | -------------------------------- | -------------------------------------- | -------------------------- | ------------------------------------- |
| `shouldSkip`                                    | subsumed by path filter + authorship; delete          | subsumed; delete  | per position; delete global      | subsumed by turns; delete              | keep for keyframe thinning | keep                                  |
| `pauseRecording` / `resumeRecording`            | delete — authorship + turns replace it                | delete            | delete — nothing global to pause | delete                                 | keep (dev)                 | keep, and it stays a trap             |
| `maxHistorySize` (count of entries)             | **must change meaning** — entries are O(state) (§1.7) | change to turns   | per position                     | **turns** — the unit a developer means | keyframe count             | keep, keeps meaning `entries × width` |
| `jumpTo(index)`                                 | O(span); dev-only                                     | O(span); dev-only | not expressible                  | O(span) via the spine                  | **its home**               | keep                                  |
| `includePayload`, `actionNames`                 | replaced by a per-entry/turn `label`                  | replaced          | replaced                         | replaced                               | replaced                   | replaced by `transaction()`           |
| `getHistory(): {state,timestamp,action}[]`      | **breaks** — the major                                | breaks            | breaks                           | breaks                                 | survives                   | survives                              |
| `entityMap({ history: false })`                 | keep (opt-out still needed)                           | keep              | **delete** — opt-in replaces it  | **delete**                             | keep (dev)                 | keep, and fix §1.9                    |
| `finalizeProvisional` / `__provisional` (§1.13) | **delete — dead today**                               | delete            | delete                           | delete                                 | delete                     | **delete**                            |
| `HISTORY_EXCLUDED` / `pruneHistoryExcluded`     | keep                                                  | keep              | delete with `history: false`     | delete                                 | keep                       | keep                                  |
| ST2029 (`entries × width` warning)              | **obsolete** — retention is flat                      | obsolete          | per position                     | per position                           | keep (dev)                 | keep, load-bearing                    |

Two things survive every option and should be treated as settled rather than
re-litigated: **read-time filtering** (retain, then decide — a destructive
save-time decision cannot be undone, which is the whole reason `shouldSkip` moved)
and **`transaction(label, fn)`** as the public grouping and labelling construct.
Neither depends on the representation.

---

## 9. Recommendation, and the strongest argument against it

### Recommend D — per-position histories spanned by an explicit turn journal, with E as a separate dev-only layer

Because it is the only option that satisfies G1 through G4 together, and because
each of those has a measured failure behind it rather than a preference:

- **G1** fails today in two reachable ways (§1.8) and the only structural defence
  is scope. Positional declaration makes it unrepresentable; a call-site filter
  makes it a discipline. D takes the structural one and keeps the filter as
  gesture scope.
- **G2** fails today non-deterministically (§1.4). A turn is the smallest object
  that fixes it, and D makes it first-class rather than implied.
- **G3**'s remaining hole is position (§1.10), which only a command inverse
  solves — and D lets the collection keep commands without imposing them on plain
  leaves, which is where B's ~20 hand-written inverses become a liability.
- **G4** is unavailable in E and F by construction.
- And the cost argument runs the same way for once: undo at 50k rows is 434 µs on
  the stack and ~1 µs on a log (§1.6), while retention is 19.58 MB against
  ~0.15 MB (§1.7). The stack's compensating advantage — O(1) restore — **does not
  exist in this library**, because there is no root pointer to swap. That is the
  finding that should decide this, and it was assumed the other way in every
  document written before this one.

`timeTravel()` becomes Option E: keyframes, `jumpTo`, unbounded history, full
forensic fidelity including `status()`, off in production. Undo becomes something
else entirely, which is what
[undo-redo-vs-devtools.md](../architecture/undo-redo-vs-devtools.md) already
concluded from the demand side.

### The strongest counter-argument, which I cannot dismiss

**Option F is nearly as good for a tenth of the work, and §1.1 is why.**

The whole case for a rewrite was assembled from an audit that believed collection
undo did not work. It does — delete, drag, in-grid edit and same-turn bulk all
revert, MEASURED, with no workaround. What is actually broken is three narrow
things: turn attribution (§1.4, §1.8), phantom entries under `history: false`
(§1.9), and the absence of labels and `transaction()`. All three are fixable on
the shipped representation, behind 1,087 passing tests, without breaking a single
consumer's `getHistory()`, and probably in a minor rather than a major.

Against that, D is the **largest** new public surface of any option: a turn
journal, a per-position history contract, a `history()` value accepted by several
markers, and something invented for plain branches which have no marker to declare
on. It reintroduces the global object C abolished, so the cross-scope hazard is
narrowed rather than removed. It requires a per-turn "incomplete" verdict — a new
failure mode to specify, document and render — precisely because a partial undo is
worse than a failed one. And its correctness is the correctness of its least
correct participant, which is exactly how the `interceptLeafSignals` marker gap
went unnoticed for two releases.

There is also a specific, uncomfortable pattern here. Three of this spike's
inputs contained a confident measurement that did not survive re-execution
(§1.1, §1.5, §1.6). The prudent reading is not "so the rewrite is more justified
than we thought" — it is **"our confidence about this subsystem has been wrong
repeatedly, and the option with the least new surface is the one whose wrongness
costs least"**. If D is chosen, its riskiest properties (churn liveness in §5.4,
the turn definition in §7a, the partial-undo verdict) should be measured or
prototyped _before_ the API is designed, not after.

### Either way, four things are true independent of the choice

1. **`insertAt(index, entity)`** should exist. O(1), no history dependency, and
   its absence forces O(N) work to put one row back (§1.10).
2. **`changeId` must emit a real remap notification** (§1.11). Today it emits
   nothing, and the naive inverse duplicates a row. This blocks A, B and D.
3. **The §1.9 phantom-entry defect should be fixed now**, on whatever ships.
   An enabled undo button that does nothing is a bug in every option.
4. **The dead `__provisional` machinery should be deleted** (§1.13), not
   finished.

---

## 10. Reproducing the measurements

No source file was modified for this spike; every prototype was built from the
public build plus two internal module paths (`lib/path-notifier.js`,
`lib/internals/intercept-leaf-signals.js`).

```
npx nx build core
# then, per arm, one process each:
node                e-baseline.mjs      # §1.1 §1.4 §1.8 §1.9 recording semantics
node                e-difflog.mjs       # §4 Option A prototype, outcomes asserted
node --expose-gc    e-retention.mjs <snapshot|difflog|none> <rows> <steps>   # §1.7
node                e-cost.mjs <snapshot|difflog|none> <rows> <steps>        # §1.6
node                e-record.mjs <scalar|collection> <rows>                  # §1.5
```

Ground rules that changed conclusions in this session and should be kept: one
process per arm (never interleaved — realisation 13 in
[the design thesis](../architecture/design-thesis-and-benchmarking-rules.md));
always read state back at the end of a timing loop; **always drain the microtask
queue before asserting on history**, because a marker write records nothing
synchronously and a synchronous assertion will confirm any hypothesis you bring
to it; and assert what `undo()` DOES, never that a write "was recorded".
