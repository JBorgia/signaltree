# Time-travel use cases, ranked, and what SignalTree actually supports

**Status:** RE-SCORED 2026-08-10 against `main` (15.0.0-dev), superseding the
14.0.0 scoring. Every verdict below was produced by executing against the **built**
package in `dist/packages/core`.

**Why it was re-scored.** The original pass was written against the belief that
collection mutations never recorded a history entry. That belief was false, and it
was retracted in
[14.0.0-what-actually-happened.md](14.0.0-what-actually-happened.md). A wrong
premise does not only inflate passes — it manufactures failures — so the ❌ and 🟡
rows were as suspect as the ✅ rows, and all 32 were re-run.

## The scoring rule

> **Every verdict names the `undo()` / `redo()` / `jumpTo()` it called and the
> state afterwards.**

Reading `getHistory().length` or `canUndo()` is **not** evidence. That is exactly
how the original scoring went wrong: the counter was read in the same tick as a
`queueMicrotask` flush and `undo()` was never called. Where a count is quoted
below, it is quoted as context beside an outcome, never as the verdict.

Two consequences worth stating, because they changed rows:

- A postcondition a caller could satisfy **without** the behaviour under test is
  not a postcondition. Case 9 initially "passed" because `cancel()` left a value
  unchanged — which was also true because nothing had ever been written. It needed
  a `commit()` control arm before the `cancel()` result meant anything.
- Verifying the **mechanism** is not verifying the **outcome**. Case 6's old
  evidence ("ten cursor writes recorded nothing") is now false by construction —
  `shouldSkip` moved to read time and entries ARE retained — while the outcome it
  was standing in for still holds.

Legend: ✅ works today · 🟡 works with assembly, caveat noted · ❌ not supported

---

## What changed from the 14.0.0 scoring

Seven rows moved. Five of them moved **down**, which is the point of re-scoring
from a retracted premise rather than only auditing the passes.

| Case                                | Was  | Now | Why                                                                                    |
| ----------------------------------- | ---- | --- | -------------------------------------------------------------------------------------- |
| 7. Bulk operation as one step       | 🟡   | ❌  | The documented `pauseRecording` recipe was **deleted** in 15.0.0. No replacement yet.  |
| 8. Undo scoped to a draft           | ✅\* | ✅  | Phantom-step defect **fixed**; option renamed `history` → `recordHistory`.             |
| 9. Discarding an in-progress edit   | ✅   | ✅  | Passes, but the audit named the **wrong function** — see the doc defect below.         |
| 15. An audit trail rather than undo | ✅   | 🟡  | `createAuditTracker` is a 100 ms **polling sampler** that can miss changes entirely.   |
| 20. Undo in a form                  | ✅   | ❌  | `timeTravel()` does **not** cover `form()` state. In a mixed tree it loses form edits. |
| 22. Pausing while replaying         | ✅   | ❌  | `pauseRecording` deleted.                                                              |
| 28. Devtools unbounded history      | ✅   | 🟡  | "Omit `maxHistorySize`" does not give unbounded history — it defaults to **50**.       |

Cases 2, 4, 5, 6, 19, 23, 24, 26 were re-run and their original verdicts survived
unchanged.

---

## Tier 1 — most apps that want undo at all

### 1. Single-step undo of the user's last edit ✅

Wrote `'hello'` then `'world'`; `undo()` → `title === 'hello'`.

### 2. A disabled-until-usable undo button ✅

`computed(() => tree.canUndo())` observed across a write and an undo without
re-creating the computed: `false` → `true` → `false`, and the `undo()` that flipped
it back left `n === 0`. Reactive, as claimed since 14.0.0.

### 3. Showing how many steps are available ✅

Verified as a **count**, not as a length: `getCurrentIndex()` advertised 5 backward
steps; 5 `undo()` calls were spent before `canUndo()` went false, ending at
`n === 0`. Advertised matched spendable.

### 4. Redo after undo ✅

`undo()` → `n=1`; `redo()` → `n=2`. Truncation confirmed: `undo()` then `set(99)`
left `canRedo() === false`.

### 5. Bounded memory in a long session ✅

20 writes at `maxHistorySize: 5` → 4 undos spendable, ending at `n === 16`, **not**
`0`. The oldest entries were evicted, which is the feature.

### 6. Not recording cursor/hover/selection churn ✅

1 text write + 10 cursor-only writes; ONE `undo()` → `text === ''`. The churn did
not consume undo steps.

⚠️ **The old evidence for this row is now wrong even though the row is right.**
`shouldSkip` moved from write time to read time, so entries are retained
(`getHistory().length === 12` here). "Ten cursor writes recorded nothing" describes
a mechanism that no longer exists; the outcome is what still holds.

### 7. A bulk operation as ONE undo step ❌

**Downgraded from 🟡.** The recipe this audit documented — `pauseRecording()` /
`resumeRecording()` plus a sealing write — was deleted in 15.0.0 (`258b2c2b`) as a
silent-data-loss footgun. `typeof tree.pauseRecording === 'undefined'` on the built
tree. There is no replacement.

What survives is **incidental**, not an API: 5 `addOne` calls in one microtask
collapse to one entry, and ONE `undo()` took `seed,bulk0..bulk4` → `seed`. Put a
single `await` between the same writes and one `undo()` removes a single row
instead:

```
5 addOne, no await   -> undo() -> 'seed'                       (one step)
5 addOne, one await  -> undo() -> 'seed,bulk0,bulk1,bulk2,bulk3' (one row)
```

So "one undo step" is decided by incidental `await` placement in the caller, not by
the action. That is the case that motivates the transaction handle. **Gap A.**

### 8. Undo scoped to an editable draft, with a large server collection alongside ✅

The headline pattern, and it now works cleanly — the phantom-step defect was fixed
in `8f16c9cb`.

```ts
signalTree({
  rows: entityMap({ selectId: (r) => r.id, recordHistory: false }), // saved, never undone
  draft: { title: '', body: '' }, // undoable
}).with(timeTravel({ maxHistorySize: 50 }));
```

⚠️ **The option was renamed.** `history: false` no longer exists; it is
`recordHistory: false` (`063a4457`). The old spelling collided with `form()`'s
opt-IN `history: history()`.

Measured: 5 excluded-only collection writes, then ONE `undo()` → the draft title
went `'my draft'` → `''` and the collection was byte-identical before and after.
Before the fix those 5 writes each burned an undo step that changed nothing
visible.

### 9. Discarding an in-progress edit without touching history ✅ — but the API is misnamed here

Works, and the tree-bound session is real. **This audit named the wrong function,**
and so does
[time-travel-in-production.md:176](../../guides/time-travel-in-production.md#L176).

- `createEditSession(initial: T)` is **value-level**. Its surface is
  `original/modified/canUndo/canRedo/isDirty/setOriginal/applyChanges/undo/redo/reset/getHistory`.
  It has **no** `commit` and **no** `discard`.
- `createTreeEditSession(source)` is the tree-bound one, with `commit()` /
  `cancel()` / `pullFromSource()`.

Measured with a control arm, because "cancel left it unchanged" is otherwise
satisfiable by a session that never wrote anything:

```
applyChanges('committed edit') -> leaf still 'committed'   (draft is held)
commit()                       -> leaf 'committed edit'    (writes through ✔)
applyChanges('scratch work')   -> leaf still 'committed'
cancel()                       -> leaf 'committed'         (discarded ✔)
```

Also stale:
[myths-and-misconceptions.md:261](../../myths-and-misconceptions.md#L261) says a
path-bound session is "planned for v10.1". `createTreeEditSession` ships today.

### 10. Rolling back an optimistic write when the server rejects ✅ with the caveat REPRODUCED

Clean case: `undo()` → `'server value'`.

The documented caveat is real and was executed rather than asserted. With one
unrelated write in between, the error-path `undo()` reverted the **wrong thing**:

```
row='optimistic', then other=42, then undo()
  -> { row: 'optimistic', other: 0 }   // rolled back the bystander, not the row
```

History is global, not per-request. With concurrent in-flight requests, use an edit
session or an explicit compensating write.

---

## Tier 2 — common, and mostly fine

### 11. Keyboard Ctrl+Z / Ctrl+Shift+Z — judgement, not a verified pass

Nothing library-specific; bind to `undo()`/`redo()`, both verified in cases 1 and 4.
Scored as judgement because there is no library behaviour here that could fail.

### 12. Undo across a route change ✅

History is tree state, so it survives anything that does not dispose the tree;
`undo()` after simulated navigation → `n === 1`. The real variable is tree
**lifetime**: a root-provided tree keeps history, a component-provided `defineStore`
tree disposes with the component. That part is architectural and was not executed.

### 13. Persisting history across a reload ❌ — and the failure is worse than "absent"

`serialize()` output contains no history key. Round-tripped through
`deserialize()` into a fresh tree: state restored (`n === 2`), history did not.

**New defect found while re-scoring.** After `deserialize()`, `canUndo()` is
`true`, and one `undo()` took `n` from the restored `2` to `0`:

```
deserialize(json) -> n === 2, canUndo() === true
undo()            -> n === 0     // discards everything that was just restored
```

So the reload story is not "undo is unavailable" — it is "the undo button is
enabled and pressing it throws away the restored state." Same family as the phantom
step fixed in case 8. **See gap C.**

### 14. Undo in a wizard (back = undo) — judgement

Mechanically identical to case 1, which passes. The caveat is UX advice (users
expect Back to be navigation), not a library limit.

### 15. An audit trail rather than undo 🟡 — downgraded

**`createAuditTracker` is a sampler, not a trail.** `signalTree` has no `.subscribe`
method, so the tracker always takes its fallback branch:
`setInterval(handleChange, 100)` (`audit.js:41-49`). Every tracker is a permanent
100 ms polling timer, and the sampling loses changes:

```
n=2 then n=3 inside one 100ms window -> logged {"n":3}   // intermediate lost
name='TEMP' then name='a' in one window -> logged NOTHING // write+revert invisible
```

For an undo stack, coalescing is a feature. For an **audit trail** it is a
correctness bug: "a field was set and set back" is precisely what an audit trail
exists to capture, and it is silently dropped. This matters most in the workload
the sibling audit calls our best-supported one — healthcare/claims/regulated —
where it is a compliance question, not a papercut.

`createAuditCallback(prev, current)` and reading `getHistory()` are exact; prefer
either. `createAuditTracker` also leaks its interval unless the returned stop
function is wired to a `DestroyRef`.

### 16. Knowing what a write actually changed ✅

`updateAndReport({a:5})` → `["a"]`; the same write again → `[]`; nested
`{b:{c:9}}` → `["b.c"]`. The deep-equal re-fetch reporting `[]` is the claim, and it
holds.

### 17. Showing a history list the user can click ✅

Verified by landing state, not list length: `jumpTo(1)` → `n=1`, `jumpTo(4)` →
`n=4`, `jumpTo(0)` → `n=0`. Entry shape is `{ state, timestamp, action }`.

### 18. Labelling entries so the UI can say "Undo Bold" ❌

Entries carry `action`, auto-assigned (`["INIT","BATCH"]`). `tree.addEntry` is
`undefined` on the built tree, and mutating `entry.action` through the array
returned by `getHistory()` does not stick. You can read the label, not set it.
**Gap B, still the highest-value gap here.**

### 19. Coalescing rapid keystrokes into one step ❌

Typed `h/he/hel/hell/hello`, one microtask each; ONE `undo()` → `'hell'`. It removed
a letter, not the word. `shouldSkip` can drop an entry but cannot merge a run.
**Gap D.**

### 20. Undo after a page of edits, in a form ❌ — **reversed, and this is the biggest finding**

The 14.0.0 verdict said "`form()` state is ordinary tree state, so `timeTravel()`
covers it." It does not. Form writes never notify the history recorder.

Form-only tree, 3 writes to a form field:

```
entries = 1  (["INIT"])     canUndo() === false     undo() -> name unchanged ('abc')
```

Control, identical writes to a plain leaf on an identically shaped tree:

```
entries = 4                                          undo() -> name === 'ab'  ✔
```

**In a mixed tree it is not merely absent — it loses data.** Form writes create no
entry, but a _later_ plain-leaf write takes a snapshot that incidentally includes
the form's then-current values. So an `undo()` aimed at the plain field also
rewinds the form to a stale value the user has since typed past:

```
plain='p1'; name='ada'; plain='p2'; name='ada l'
  -> 3 entries; newest snapshot holds name:'ada' while the live value is 'ada l'
undo()  ->  plain 'p1'  AND  name ''        // the user's form content is gone
```

One Ctrl+Z on an unrelated field wipes the form. The correct mechanism is the
form's **own** scoped stack, which works:

```ts
form({ initial: { name: '' }, history: history() });
// form.history.undo() -> name === 'ab'   ✔
```

This is also why v3 — the only known adopter shipping 50-step undo — does undo at
the form layer and type-erases `timeTravel`. Their architecture was not a
preference; the alternative does not work.

### 21. Clearing history on save ✅ — and it answers an open naming question

`n` was `3`; `resetHistory()` → `n === 3`, `canUndo() === false`, and a following
`undo()` left `n === 3`.

**This settles TODO 5b item 4.** `resetHistory()` **empties the stack and leaves
state alone** — it does not restore-to-initial. The name is accurate and should not
be renamed to `clear()`, which would be ambiguous between the two operations.

### 22. Pausing recording while replaying/animating ❌ — API deleted

`typeof tree.pauseRecording === 'undefined'`. Deleted in `258b2c2b`. This row was ✅
against 14.0.0 and there is no replacement; suppressing programmatic/replay writes
is now unsupported and is the authorship question (TODO item 3).

---

## Tier 3 — specialist

### 23. Per-entity undo ("undo just this row") ❌

No `undoEntity` / `undoOne` / `historyFor` on the collection. Two rows edited in
sequence; `undo()` reverted row `b` — the global last write — with no way to target
row `a`. elf has this; we do not, and it is not composable.

### 24. Branch-scoped history for a non-marker branch ❌

`recordHistory` is a marker option. Putting the key on a plain branch just makes it
data (no error). A UI-only write to `ui.zoom` consumed the undo step that the user
meant for their document edit:

```
doc.t='x'; ui.zoom=2; undo() -> { doc: 'x', zoom: 1 }   // spent on zoom
```

[RFC 0012](../../rfcs/0012-history-scoped-marker-capture.md) — accepted, deferred.

### 25. Undo across a collection AND its loader state 🟡

`undo()` reverted the draft and left the excluded collection untouched, as
documented. The loader signals are the marker's own, so they are excluded with it —
usually right, occasionally surprising. (No loader was configured in this run, so
the loader-specific half is reasoned, not executed.)

### 26. Diffing two arbitrary history entries ✅

The claim depends on entries NOT being deep copies, so it was tested for exactly
that: for an untouched subtree, `entry[n-2].a === entry[n-1].a` is `true`, and the
nested node is shared too. Structural sharing holds across entries, so a reference
walk finds changed subtrees. No API sugar for it.

### 27. Canvas/design-tool undo over thousands of objects 🟡

Time is fine and was measured: 2,000 objects, 50 recorded steps → 62.5 ms total
recording, one `undo()` in 0.117 ms.

⚠️ **The memory claim is not verified.** "10,000 objects over 50 entries is ~5 MB"
is an estimate. It is the same family as the unreproduced 19.58 MB retention figure
that TODO item 2 flags as load-bearing and agent-measured. Treat both as open.

### 28. Undo in a devtools panel with unbounded history 🟡 — downgraded

**"Omit `maxHistorySize`" does not give unbounded history.** The default is 50
(`time-travel.js:32`, `config.maxHistorySize ?? 50`), and the type declares no
default. Measured over 200 writes:

| `maxHistorySize` | undos spendable | final `n` |
| ---------------- | --------------- | --------- |
| omitted          | 49              | 151       |
| `Infinity`       | 200             | 0         |
| `500`            | 200             | 0         |
| `0`              | **0**           | 200       |

Unbounded requires `maxHistorySize: Infinity` explicitly.

**New defect:** `maxHistorySize: 0` silently disables undo entirely. `0` is a
plausible spelling of "no limit" — `?? 50` does not catch it, and the trim then
fires on every entry. It should either mean unbounded or throw.

---

## Tier 4 — wrong tool, worth saying so

### 29. Selective undo — revert step 3 while keeping 4 and 5 ❌

Needs operation inverses, not snapshots. Do not build it on `jumpTo`.

### 30. Undo of a server-side effect ❌

Out of scope for any store. `undo()` reverts local state; it cannot un-send a
`POST`. Pair with a compensating request.

### 31. Collaborative multi-user editing ❌ by design

Undo must be per-user and intention-preserving; snapshot history is neither. Use a
CRDT (Yjs, Automerge) underneath whichever store you pick.

### 32. Time travel as a substitute for tests ❌

Reproducing a bug by scrubbing is a debugging aid, not a regression guard.

---

## Defects this re-score found (not previously filed)

Ordered by how much damage they do.

1. **`timeTravel()` does not cover `form()` state (case 20).** Form-only trees have
   no undo at all; mixed trees silently rewind form fields to a stale snapshot when
   an unrelated field is undone. Data loss, on the primary editing surface.
2. **`createAuditTracker` is a 100 ms polling sampler (case 15).** No `.subscribe`
   on the tree means the fallback always runs. A write and its revert inside one
   window are logged as nothing.
3. **`undo()` after `deserialize()` discards the restored state (case 13).**
   `canUndo()` is true post-restore and the first undo lands on the pre-restore
   state.
4. **`maxHistorySize` defaults to 50, undocumented (case 28)**, so "omit for
   unbounded" is false.
5. **`maxHistorySize: 0` silently disables undo (case 28).**
6. **Doc defect (case 9):** `commit`/`discard` are attributed to
   `createEditSession`, which has neither; they are `commit()`/`cancel()` on
   `createTreeEditSession`. Present in this audit and in
   `docs/guides/time-travel-in-production.md:176`.
7. **Stale doc (case 9):** `myths-and-misconceptions.md:261` calls the path-bound
   session "planned for v10.1"; `createTreeEditSession` ships.

Answered along the way: **TODO 5b item 4** — `resetHistory()` empties, it does not
restore-to-initial.

---

## Gaps, ranked by how many use cases they block

| Gap                               | Blocks                        | Assessment                                                                                                                                                                                                                        |
| --------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G. Forms are outside history**  | 20, and most real editing UIs | **New, and now the widest.** The primary editing surface is invisible to `timeTravel()` and undoing a neighbour destroys form content. Scoped `form(history())` works and should be the documented answer until this is resolved. |
| **B. No settable entry label**    | 18, and weakens 7, 17         | Cheapest fix with the widest reach. Entries already carry `action`; it needs a public way to set it.                                                                                                                              |
| **A. No group/transaction API**   | 7, and any multi-write action | Worse than at 14.0.0: the documented workaround was deleted, so grouping now depends on incidental `await` placement. The transaction handle closes A and B together.                                                             |
| **D. No coalescing window**       | 19, text editing generally    | Needed for per-word undo. Distinct from `shouldSkip`, which drops rather than merges.                                                                                                                                             |
| **C. History is not persistable** | 13                            | And the current behaviour is destructive, not merely absent.                                                                                                                                                                      |
| **E. No per-entity history**      | 23                            | Real gap vs elf, not composable, narrower audience.                                                                                                                                                                               |
| **F. No branch-level scoping**    | 24                            | Already scoped as RFC 0012 and deferred deliberately.                                                                                                                                                                             |

**A and B are still one feature**, and G raises the stakes: an action-scoped,
path-delta history is also what would let a form participate in a shared stack
without a whole-tree snapshot capturing it incidentally.

## What holds up well

Of 32 cases: **13 work today**, 6 work with a stated caveat, 8 are genuine gaps, 4
are out of scope, and 1 is judgement-only. That is materially worse than the
14.0.0 count of 17 clean — and the difference is not regression in the library so
much as the first honest scoring: two rows were deleted APIs, one was a false
claim about forms, and one was a sampler mistaken for an audit trail.

What is genuinely good is still genuinely good, and was re-verified by outcome:
`recordHistory` scoping (case 8) that no other Angular store offers,
`updateAndReport` (case 16), structural sharing across entries (case 26), reactive
`canUndo` (case 2), and recording that is flat in state size (case 27: 2,000
objects, 0.117 ms per undo).

## Method note

Support was established by execution against the built package, and the scoring
rule at the top of this file is the thing that changed the results. Four rows moved
because the old evidence read a counter instead of calling `undo()`; one row moved
because a "passing" postcondition was satisfiable without the behaviour under test
until a control arm was added.

The harness lives in the session scratchpad rather than the repo: these are
one-shot verification scripts, not regression tests. **The findings above should
become real tests** — cases 13, 15, 20 and 28 in particular are live defects with
no test pinning them.
