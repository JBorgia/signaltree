# Time-travel use cases, ranked, and what SignalTree actually supports

**Status:** audit, 14.0.0. Written after
[time-travel-in-production.md](../../guides/time-travel-in-production.md), and it
immediately found a defect in it — the `pauseRecording` recipe that guide shipped
was destructive. That is recorded in case 7.

## Why rank them

"Do we support time travel" is not answerable. Thirty-odd distinct things get
called time travel, they want different guarantees, and a library can ace the rare
ones while failing the common ones. Ranking first means the gaps get weighted by
how many real apps hit them rather than by how interesting they are.

Ranking is judgement — mine, from the shapes these features take in shipped
Angular apps — and it is stated so you can disagree with a specific row rather
than the conclusion. **Support status is not judgement**: every ✅ below was
executed against the built 14.0.0 package, and the ❌ rows name what is missing.

Legend: ✅ works today · 🟡 works with assembly, caveat noted · ❌ not supported

---

## Tier 1 — most apps that want undo at all

### 1. Single-step undo of the user's last edit ✅

`tree.undo()`. The whole feature for most apps.

### 2. A disabled-until-usable undo button ✅

`canUndo()` / `canRedo()`, **reactive since 14.0.0**. On 13.x these read plain
values, so `computed(() => tree.canUndo())` cached `false` forever and the button
never enabled — in a zoneless app it never enabled at all. If your undo button
looks dead on 13.x, that is this.

### 3. Showing how many steps are available ✅

`getCurrentIndex()` back; `getHistory().length - 1 - getCurrentIndex()` forward.
Both reactive. Shipped in the demo's time-travel page as `Undo (3)` / `Redo (2)`.

### 4. Redo after undo ✅

`tree.redo()`, with the standard truncation: a new write after undoing discards
the forward entries.

### 5. Bounded memory in a long session ✅

`timeTravel({ maxHistorySize: 50 })`. Verified: 20 writes at limit 5 leaves 5.

### 6. Not recording cursor/hover/selection churn ✅

`shouldSkip(prev, next)`. Verified: ten cursor-only writes recorded nothing.
⚠️ Runs on every recorded write — compare the few fields you mean.

### 7. A bulk operation as ONE undo step 🟡

**This is the case that found the bug.** `pauseRecording()` / `resumeRecording()`
alone is not enough and loses data: nothing is recorded, so the newest entry still
describes the pre-bulk state, `undo()` steps back _past_ it, and the bulk result
becomes unreachable with `canRedo()` false. Measured: 1 → bulk to 5 → undo gave
**0**, redo gave 1, and 5 was gone.

Correct form — seal the batch with one recorded write:

```ts
tree.pauseRecording();
for (const row of imported) tree.$.rows.addOne(row);
tree.resumeRecording();
tree({ importedAt: Date.now() }); // ONE entry capturing the result
```

🟡 rather than ✅ because there is no first-class group/transaction API; you must
know to seal, and you need a field for the sealing write to land on. **See gap A.**

### 8. Undo scoped to an editable draft, with a large server collection alongside ✅

The headline pattern, and the thing no other Angular store can do:

```ts
signalTree({
  rows: entityMap({ selectId: (r) => r.id, history: false }), // saved, never undone
  draft: { title: '', body: '' }, // undoable
}).with(timeTravel({ maxHistorySize: 50 }));
```

Verified: undo reverted the draft and left the collection untouched.
⚠️ Stated tradeoff: `undo()` will not revert an excluded collection.

### 9. Discarding an in-progress edit without touching history ✅

`createEditSession` (`@signaltree/core/edit-session`) — commit or discard,
independent of `timeTravel()`. The right tool for "Cancel" on a modal.

### 10. Rolling back an optimistic write when the server rejects ✅

`undo()` in the error path, or `jumpTo(getCurrentIndex() - 1)`.
⚠️ Only sound if nothing else recorded in between. With concurrent in-flight
requests, prefer an edit session or an explicit compensating write — history is
global, not per-request.

---

## Tier 2 — common, and mostly fine

### 11. Keyboard Ctrl+Z / Ctrl+Shift+Z ✅

Nothing library-specific; bind to `undo()`/`redo()`.

### 12. Undo across a route change ✅

History lives on the tree, not the component, so a `providedIn: 'root'` tree keeps
it. A component-provided tree via `defineStore` disposes with the component —
usually what you want.

### 13. Persisting history across a reload ❌

`persistence()` and `stored()` save **state**, not the history stack. Nothing
serialises `getHistory()`. You can write it out yourself — entries are
`{ state, timestamp, action }` — but nothing supports rehydrating it back into the
enhancer. **See gap C.**

### 14. Undo in a wizard (back = undo) 🟡

Works, but usually the wrong tool: users expect Back to be navigation, not "revert
my last keystroke". Model steps as routes or explicit state; keep undo for edits
within a step.

### 15. An audit trail rather than undo ✅

`createAuditTracker()` / `createAuditCallback()`, or read `getHistory()`. No
`timeTravel()` needed for an append-only log.

### 16. Knowing what a write actually changed ✅

`tree.updateAndReport(partial)` returns the dot-paths of leaves that really
changed — a deep-equal re-fetch reports `[]`. Nobody else has this.

### 17. Showing a history list the user can click ✅

`getHistory()` + `jumpTo(index)`. The demo does exactly this.

### 18. Labelling entries so the UI can say "Undo Bold" ❌

Entries carry `action`, but it is auto-assigned (`INIT`, `UPDATE`, `RESET`,
`batch`) and **`addEntry` is not public** — you can read the label, not set it. Any
undo menu naming the operation is blocked. **Gap B, and the highest-value gap
here.**

### 19. Coalescing rapid keystrokes into one step ❌

Text editors merge writes within a time window so undo removes a word, not a
letter. `shouldSkip` can drop a write but cannot merge two. Workaround: debounce
before writing to the tree, which changes when state updates. **See gap D.**

### 20. Undo after a page of edits, in a form ✅

`form()` state is ordinary tree state, so `timeTravel()` covers it. `shouldSkip`
on `touched`/`dirty` churn is usually wanted.

### 21. Clearing history on save ✅

`resetHistory()`.

### 22. Pausing recording while replaying/animating ✅

`pauseRecording()` — and here the absence of a recorded entry is exactly right,
unlike case 7.

---

## Tier 3 — specialist

### 23. Per-entity undo ("undo just this row") ❌

elf has it. We do not, and it is not composable: it needs a per-entity history
stack inside the collection. Real for spreadsheet-style grids.

### 24. Branch-scoped history for a non-marker branch ❌

`history: false` is a marker option. A plain branch cannot be excluded.
[RFC 0012](../../rfcs/0012-history-scoped-marker-capture.md) — accepted, deferred,
blocked on three measurements.

### 25. Undo across a collection AND its loader state coherently 🟡

Excluding a collection with `history: false` also excludes its `loading`/`error`,
since they are the marker's own signals. Usually right; occasionally surprising.

### 26. Diffing two arbitrary history entries ✅

Structural sharing makes `prev !== next` meaningful at every node, so a walk over
two entries finds changed subtrees by reference. No API sugar for it.

### 27. Canvas/design-tool undo over thousands of objects 🟡

Recording is flat in state size, so time is fine. Memory is `entries x width` —
model objects as an `entityMap` and keep `maxHistorySize` modest. 10,000 objects
over 50 entries is ~5 MB.

### 28. Undo in a devtools panel with unbounded history ✅

Omit `maxHistorySize`. This is the dev case, and the one everyone else means by
"time travel".

### 29. Selective undo — revert step 3 while keeping 4 and 5 ❌

Nobody in the field has this; it needs operation inverses, not snapshots. Do not
build it on `jumpTo`.

### 30. Undo of a server-side effect ❌

Out of scope for any store. `undo()` reverts local state; it cannot un-send a
`POST`. Pair with a compensating request.

---

## Tier 4 — wrong tool, worth saying so

### 31. Collaborative multi-user editing ❌ by design

Undo must be per-user and intention-preserving; snapshot history is neither. Use a
CRDT (Yjs, Automerge) underneath whichever store you pick.

### 32. Time travel as a substitute for tests ❌

Reproducing a bug by scrubbing is a debugging aid, not a regression guard.

---

## Gaps, ranked by how many use cases they block

| Gap                               | Blocks                        | Assessment                                                                                                                                             |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **B. No settable entry label**    | 18, and weakens 7, 17         | Cheapest fix with the widest reach. Entries already carry `action`; it needs a public way to set it. Any undo MENU is blocked without it.              |
| **A. No group/transaction API**   | 7, and any multi-write action | The sealing-write recipe works but is a trap — the obvious form silently loses the result. A `tree.transaction(label, fn)` would fix A and B together. |
| **D. No coalescing window**       | 19, text-editing generally    | Needed for per-word undo. Distinct from `shouldSkip`, which drops rather than merges.                                                                  |
| **C. History is not persistable** | 13                            | Undo across reload. Entries are serialisable; there is no rehydrate path.                                                                              |
| **E. No per-entity history**      | 23                            | Real gap vs elf, not composable, narrower audience.                                                                                                    |
| **F. No branch-level scoping**    | 24                            | Already scoped as RFC 0012 and deferred deliberately.                                                                                                  |

**A and B are one feature.** A public `transaction(label, fn)` that records
exactly one labelled entry for everything inside it would close the two
highest-ranked gaps, remove the trap in case 7, and give case 17's history list
something meaningful to display. That is the recommendation this audit produces.

## What holds up well

Of 32 cases: **17 work today**, 5 work with a stated caveat, 6 are genuine gaps,
and 4 are things a store should not attempt. The Tier 1 list — where most apps
live — is 9 of 10 clean, with the one exception being the bulk-grouping trap.

Two things are better than the field rather than merely adequate: `history: false`
scoping (case 8), which no other Angular store offers, and `updateAndReport`
(case 16). And the reason any of this is viable in production is that recording is
flat in state size — 50 writes over 10,000 rows went 340.60 ms to 0.04 ms in
13.5.0. Every other library's dev-only advice is about the cost we removed.

## Method note

Support was established by execution, not by reading types. That mattered: case 7
had been documented as working in a guide written hours earlier, and it does not.
The reason it passed review is that I had verified the _mechanism_ — writes apply,
no entries record — and never exercised the _outcome_, which is what `undo()` then
does. A postcondition that confirms the mechanism without exercising the outcome is
the same shape as the blind gates found earlier in this release.
