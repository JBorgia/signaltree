# Time-travel use cases, ranked, and what SignalTree actually supports

**Status:** RE-SCORED 2026-08-10 against `main` (14.1.1-dev), superseding the
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

| Case                                | Was  | Now | Why                                                                                                      |
| ----------------------------------- | ---- | --- | -------------------------------------------------------------------------------------------------------- |
| 7. Bulk operation as one step       | 🟡   | ❌  | The documented `pauseRecording` recipe was **deleted** in 14.1.1. No replacement yet.                    |
| 8. Undo scoped to a draft           | ✅\* | ✅  | Phantom-step defect **fixed**; option renamed `history` → `recordHistory`.                               |
| 9. Discarding an in-progress edit   | ✅   | ✅  | Passes, but the audit named the **wrong function** — see the doc defect below.                           |
| 15. An audit trail rather than undo | ✅   | 🟡  | `createAuditTracker` is a 100 ms **polling sampler** that can miss changes entirely.                     |
| 20. Undo in a form                  | ✅   | ❌  | `timeTravel()` does **not** cover `form()` state. In a mixed tree it loses form edits.                   |
| 22. Pausing while replaying         | ✅   | ❌  | `pauseRecording` deleted.                                                                                |
| 28. Devtools unbounded history      | ✅   | 🟡  | Omitting `maxHistorySize` caps at **50**, and it counts entries not steps — any value ≤ 1 disables undo. |

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

⚠️ 4 steps, not 5 — but the history really does hold 5 **entries**, exactly as
`maxHistorySize: 5` says and as the guide documents. The oldest entry is the state
you land on rather than a step you spend, so N entries yields N−1 steps. Nothing in
the docs is wrong here and no sample needs renumbering; the conversion is what goes
unsaid. See case 28.

### 6. Not recording cursor/hover/selection churn ✅

1 text write + 10 cursor-only writes; ONE `undo()` → `text === ''`. The churn did
not consume undo steps.

⚠️ **The old evidence for this row is now wrong even though the row is right.**
`shouldSkip` moved from write time to read time, so entries are retained
(`getHistory().length === 12` here). "Ten cursor writes recorded nothing" describes
a mechanism that no longer exists; the outcome is what still holds.

### 7. A bulk operation as ONE undo step ❌

**Downgraded from 🟡.** The recipe this audit documented — `pauseRecording()` /
`resumeRecording()` plus a sealing write — was deleted in 14.1.1 (`258b2c2b`) as a
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

### 13. Persisting history across a reload ❌ — and the undo button is live afterwards

`serialize()` output contains no history key. Round-tripped through
`deserialize()` into a fresh tree: state restored (`n === 2`), history did not.

**New defect found while re-scoring**, stated at the boundary rather than from one
data point. `deserialize()` is recorded as an ordinary `BATCH` entry
(`["INIT"]` → `["INIT","BATCH"]`), so the first `undo()` after a restore always
reverts the restore. What it lands on varies with prior history; that it discards
the restore does not.

Payload restores `n = 2`:

| target tree before restore | entries | `canUndo()` | after `undo()` | after 2nd `undo()` | restore |
| -------------------------- | ------- | ----------- | -------------- | ------------------ | ------- |
| fresh, 0 prior writes      | 2       | `true`      | `0`            | `0`                | lost    |
| 1 prior write (`n=7`)      | 3       | `true`      | `7`            | `0`                | lost    |
| 2 prior writes (`7,8`)     | 4       | `true`      | `8`            | `7`                | lost    |
| 3 prior writes (`7,8,9`)   | 5       | `true`      | `9`            | `8`                | lost    |

**Severity correction.** An earlier draft of this row called it "throws away the
restored state". It is **recoverable**: `canRedo()` is `true` afterwards and
`redo()` returns `n` to `2`. So this is a live undo button that does something the
user cannot want on its first press, not data loss.

**Mitigation that works today:** restore _before_ attaching the enhancer, which
makes the restored state `INIT`'s baseline so undo has no way past it.

```
deserialize() then .with(timeTravel({}))  ->  canUndo() === false, undo() is a no-op
```

⚠️ **That only covers synchronous hydration**, and it is the narrower half of the
problem. It works when the payload exists at tree construction — `localStorage`, a
transferred SSR state blob, an embedded bootstrap. An app hydrating from an
**async fetch** cannot sequence it that way: the tree must exist before the
response arrives, so the enhancer is already attached and the restore lands as a
recorded entry. That case needs the code answer — a non-recording restore path, or
authorship (TODO item 3) — not the doc line.

Same family as the phantom step fixed in case 8. **See gap C.**

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

The window was measured rather than assumed. Two writes to the same field, varying
only the gap between them:

| gap between writes | entries logged | outcome                 |
| ------------------ | -------------- | ----------------------- |
| 0 ms               | 1              | intermediate state lost |
| 25 ms              | 1              | intermediate state lost |
| 50 ms              | 1              | intermediate state lost |
| 90 ms              | 2              | both captured           |
| 120 ms             | 2              | both captured           |

And the case that matters for a trail — a write followed by a **revert to the
original value**, which leaves no net change for the next sample to see:

| gap    | entries logged |                                        |
| ------ | -------------- | -------------------------------------- |
| 0 ms   | **0**          | invisible — no record it ever happened |
| 50 ms  | **0**          | invisible                              |
| 120 ms | 2              | captured                               |

For an undo stack, coalescing is a feature. For an **audit trail** it is a
correctness bug: "a field was set and set back" is precisely what an audit trail
exists to capture, and below ~90 ms it is silently dropped. This matters most in
the workload the sibling audit calls our best-supported one —
healthcare/claims/regulated — where it is a compliance question, not a papercut.

The interval also keeps sampling until the returned stop function is called;
verified still running 500 ms after the tracker went out of scope.

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

⚠️ **Scope of that last line.** What was executed is the four-write sequence above:
one neighbouring plain write after the form edit. "One Ctrl+Z wipes what the user
typed" is exact for that shape and is the common one — a form beside any
non-form field — but with more intervening plain writes the form rewinds to
whichever snapshot that undo lands on, which may be a partially-typed value rather
than `''`. The invariant that was verified across both runs is narrower and is the
real claim: **form edits are never their own entry, and are reverted by undos they
did not cause.**

The correct mechanism is the form's **own** scoped stack, which works:

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

⚠️ **The memory claim was an estimate; it is now measured, and it was high.**
"10,000 objects over 50 entries is ~5 MB" came from the same ~10 bytes/pointer
assumption as ST2029's 5.08 MB. MEASURED with `tools/bench-retention-arms.mjs`:
**3.95 MB** — the constant is ~8 bytes, a 64-bit pointer. The 19.58 MB figure at
50k has also now reproduced (19.382 MB, within 1%), so neither is open any longer.
What replaced them is a two-term model: `entries × (width × ~8 B + changedRows ×
~40 B)`, in which the old single-term figure is a **floor** and not a worst case.

### 28. Undo in a devtools panel with unbounded history 🟡 — downgraded

**"Omit `maxHistorySize`" does not give unbounded history** — that was this
audit's claim, not the library's. The default is 50
(`time-travel.ts:80`, `config.maxHistorySize ?? 50`) and unbounded requires
`maxHistorySize: Infinity` explicitly.

> **The library docs are ACCURATE and were wrongly called into question by an
> earlier draft of this row.** `types.ts:43` says "Maximum number of history
> **entries** to keep, `@default 50`", and
> `time-travel-in-production.md:95` says "20 writes against `maxHistorySize: 5`
> leaves a history of 5" — measured here as exactly 5 entries. There is **no
> off-by-one error in any sample, and no sample should be renumbered.** Changing
> `50` to `51` would introduce a real error, because 50 entries is what happens.

What is missing is a **conversion, not a correction**: entries are not undo steps.
10 writes (`n = 1..10`) on a tree starting at `n = 0`:

| `maxHistorySize` | entries | `getCurrentIndex()` | undos spendable | final `n` |                    |
| ---------------- | ------- | ------------------- | --------------- | --------- | ------------------ |
| omitted (→ 50)   | 11      | 10                  | 10              | 0         |                    |
| `0`              | 0       | **-1**              | **0**           | 10        | undo disabled      |
| `1`              | 1       | 0                   | **0**           | 10        | undo disabled      |
| `2`              | 2       | 1                   | 1               | 9         |                    |
| `5`              | 5       | 4                   | 4               | 6         |                    |
| `-1`             | 0       | **-1**              | **0**           | 10        | undo disabled      |
| `NaN`            | 11      | 10                  | 10              | 0         | silently unbounded |
| `Infinity`       | 11      | 10                  | 10              | 0         |                    |

Three things follow, and the **second** is the headline:

1. **N entries yields N−1 undo steps.** The oldest retained entry is a floor you
   cannot undo _from_ — it is the state you land on, not a step you spend. So a
   documented, accurate `maxHistorySize: 50` gives 49 undo steps. This is an
   unstated conversion, not a wrong number: the docs say entries and deliver
   entries. **Fix by documenting the conversion, not by renumbering.**
2. **Any value ≤ 1 disables undo entirely, silently.** By the conversion above
   this is arithmetic, but it lands on exactly the two values a caller is most
   likely to reach for by intuition: `0` reads as "no limit" and `1` reads as "one
   step of undo". Both give none. `-1` does the same and drives
   `getCurrentIndex()` to `-1`, because the trim runs `currentIndex--` against an
   already-empty buffer. This deserves **input validation with a stable ST-code**,
   not only a doc line — a silently dead undo button is the same failure class as
   the phantom step in case 8.
3. **`NaN` is silently unbounded**, since `length > NaN` is never true. Narrower
   than 2; validation should cover it in the same guard.

**This is `??`, not `||`, and the distinction decides the fix.** Under
`config.maxHistorySize || 50` a `0` would have become `50` and undo would work.
It is `config.maxHistorySize ?? 50` (`time-travel.ts:80`) with
`if (this.history.length > this.maxHistorySize) { this.history.shift(); … }`
(`:233`), so `0` is a genuine zero-length buffer that shifts off every entry as
it is pushed. Validate the input — reject `< 1` and non-finite — and do **not**
change the `??`, which correctly distinguishes "not supplied" from "supplied
as 0".

⚠️ **Scope of this row:** every value in the table was executed at 10 writes on a
single scalar leaf. The conversion and the ≤ 1 result are arithmetic on buffer
length and should hold generally, but they were not re-run across collection or
form shapes.

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
3. **`maxHistorySize` ≤ 1 silently disables undo (case 28).** `0` reads as "no
   limit", `1` reads as "one step"; both give none, because N entries yields N−1
   undo steps. `NaN` is silently unbounded and `-1` drives `getCurrentIndex()`
   negative. Confirmed `??`, not `||` — `0` is a real zero-length buffer, so the
   fix is **input validation with an ST-code**, not changing the coalesce.
   The docs are accurate and must not be renumbered; what is missing is the
   entries→steps conversion.
4. **`undo()` after `deserialize()` reverts the restore (case 13).** `deserialize`
   records an ordinary `BATCH` entry, so the first press always discards the
   restore regardless of how many entries exist — verified across 0–3 prior writes.
   **Recoverable via `redo()`**, so this is a live-but-wrong undo button rather
   than data loss, and restoring before attaching the enhancer avoids it.
5. **Doc defect (case 9):** `commit`/`discard` are attributed to
   `createEditSession`, which has neither; they are `commit()`/`cancel()` on
   `createTreeEditSession`. Present in this audit and in
   `docs/guides/time-travel-in-production.md:176`.
6. **Stale doc (case 9):** `myths-and-misconceptions.md:261` calls the path-bound
   session "planned for v10.1"; `createTreeEditSession` ships.
7. **Shipped `.d.ts` files carry no JSDoc at all** — found while checking whether
   `maxHistorySize`'s documented `@default 50` reaches consumers. It does not:
   `removeComments: true` in `tsconfig.lib.prod.json` strips every comment from
   declaration emit, so a consumer's IDE hover shows `maxHistorySize?: number` with
   no description and no default. Measured: `core/src/lib/types.ts` has 476 JSDoc
   lines; its shipped `types.d.ts` has 0.

   Scope — all seven packages checked: **core, shared, ng-forms, guardrails,
   schema** set the flag and ship 0 JSDoc lines; **events and realtime** do not set
   it and retain theirs (5 and 22 lines in the sampled files). A five-of-seven
   inconsistency, not a workspace-wide policy — and the two that omit it show the
   intended behaviour. Not a time-travel defect; filed here because this is where
   it surfaced.

Answered along the way: **TODO 5b item 4** — `resetHistory()` empties, it does not
restore-to-initial.

**Corrections to this document's own earlier drafts**, kept because the pattern
repeated: twice the measurement was right and the sentence around it was too
broad — "every doc sample is off by one" (the docs say entries and are accurate)
and "one Ctrl+Z wipes what the user typed" (exact at one neighbouring write, not
in general). Before a verdict leaves the harness, name the configuration that
would falsify it and either run that too or scope the sentence to what was run.

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
