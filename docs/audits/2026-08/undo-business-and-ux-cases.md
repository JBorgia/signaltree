# Undo: business cases, UX cases, and what they demand of the state layer

**Status:** research, 2026-08-10. Written to answer a question I had been putting
back to the maintainer — "is undo a product feature or a debugging aid?" — which
the research answers, so it should never have been a question.

This document deliberately does not mention what other libraries do. Their
constraint was snapshot cost per write, which 13.5.0 removed; designing against
their limits imports a problem we do not have.

## Method, and its limits

Business and UX cases below are derived from the workloads SignalTree already
claims on its own fit page, plus the standard undo affordances in shipped
line-of-business software. **This is desk research, not user interviews.** No
SignalTree consumer has been asked. Treat the case list as a hypothesis that is
falsifiable by one conversation with a real adopter, and the "what it demands"
column as the part that is objectively checkable.

## 1. Why a business pays for undo

Four drivers, in rough order of how often they justify the work.

**Bulk-operation safety.** The single strongest driver. "Assign these 400 tickets
to Dana", "apply this rate to every line", "import this spreadsheet". Users will
not run a bulk action they cannot reverse — they hand-edit rows instead, which is
slower and more error-prone, and the feature you built goes unused. Undo is what
makes bulk features adoptable.

**Error recovery without a support ticket.** A mis-drag or a wrong delete becomes
a self-service fix instead of a phone call and a database restore. This is a
measurable cost line in any domain with a support desk.

**Confidence to explore.** Users try things when trying is reversible. It shows up
as feature adoption, not as an undo metric, which is why it is chronically
under-valued in planning.

**Regulated change trails.** Healthcare, claims, finance, public sector. The
requirement is usually "show me who changed what and when", which is an _audit
log_, not undo — but the two get specified together in the same ticket, and
conflating them produces a history stack that satisfies neither.

## 2. UX cases, by what the user thinks they are undoing

The user's mental model — not the implementation — decides what one undo step
must contain. Nine cases, ranked by how often they appear in the domains
SignalTree targets.

| #   | The user's intent              | One undo step must be              | What that demands of the state layer                |
| --- | ------------------------------ | ---------------------------------- | --------------------------------------------------- |
| 1   | "Undo that row edit"           | The whole cell/row change          | A **collection mutation** must be recordable        |
| 2   | "Undo that delete"             | The removed row, restored in place | Collection mutation + order preserved               |
| 3   | "Undo my bulk action"          | All N changes, as ONE step         | Explicit **grouping**, not suppression              |
| 4   | "Undo that drag"               | The move, not the re-sort          | Recordable reorder — for us, an `order` field write |
| 5   | "Undo my typing"               | A word or a pause-delimited run    | **Coalescing** by time window                       |
| 6   | "What did I just do?"          | A readable list of steps           | Human-**labelled** entries                          |
| 7   | "Cancel this dialog"           | Nothing enters history at all      | Edit-session semantics, separate from undo          |
| 8   | "Put it back, the save failed" | The optimistic write only          | Rollback that ignores concurrent activity           |
| 9   | "Not my change — the server's" | Server writes are **not** undoable | Authorship, so non-user writes stay out             |

## 3. What that implies, and why the original question dissolves

Look at cases 1, 2, 3 and 4. **They are all collection mutations**, and they are
the top of the ranking because the domains SignalTree already pitches are
collection-shaped: rows in a grid, cards on a board, line items on a claim,
tickets in a queue.

Our own fit page already sells this. It lists "Undo/redo as a shipped feature over
moderate state — editors-in-a-panel, wizards, bulk edit" as a workload where
SignalTree wins, and "CRUD over moderate lists — CRM, ERP, admin consoles" and
"Drag-driven boards and schedules — dispatch, Gantt, planning" as leaning our way.

So the question "is undo a product feature or a debugging aid?" is already
answered by what we ship and claim: **it is a product feature, and the state it
must cover is collections.**

Which makes the finding from the previous audit a defect rather than a
documentation gap:

> A collection mutation does not create a history entry. Two `addOne` calls left
> history at 1 (just `INIT`), `canUndo()` false. Only a tree/branch write records.
> Snapshots do carry collections, so a later root write's snapshot holds the rows
> and undo reverts them — but nothing in the collection API triggers a recording.

Against the ranked cases: **cases 1–4, the four most common, do not work.** Case 3
appears to work via `pauseRecording()` plus a root-write seal, but that is a
workaround that happens to exist, not grouping, and it only works because
something _else_ records.

And it produces a second-order UX failure worse than a missing feature. Because
unrecorded collection changes ride inside the next recorded snapshot, undoing an
unrelated edit silently reverts them. In case 9's terms: a server push that
arrived between two user edits gets undone by the user's Ctrl+Z, with no
indication. That is data loss with a confident UI.

## 3b. CORRECTION — there are two undo systems, and I audited one

Everything above, and the scoring that follows, was written as though
`timeTravel()` were the only undo mechanism. It is not, and missing this made the
verdict far more pessimistic than the truth.

**`form()` has its own history, independent of `timeTravel()`:**

```ts
signalTree({ f: form({ initial: { name: '', email: '' }, history: history() }) });

t.$.f.history.undo(); // also .redo() .canUndo() .canRedo() .clearHistory()
t.$.f.reset(); // back to `initial`, clears dirty
t.$.f.dirty(); // has anything changed
```

Verified: three `set()` calls then `abc` → undo → `ab` → undo → `a` → redo →
`ab`. It is **scoped to that form**, so writes elsewhere in the tree — including
server pushes — cannot pollute it and cannot be undone by it.

That splits the problem cleanly, and the split is the useful architectural
statement:

| Mechanism           | Scope               | Good for                                        |
| ------------------- | ------------------- | ----------------------------------------------- |
| `form(history())`   | One form's fields   | Field-level undo while editing a record         |
| `timeTravel()`      | The whole tree      | Structural undo — add/remove/reorder, bulk work |
| `createEditSession` | One editing session | Commit-or-discard, nothing enters history       |

Which matters because **the dominant LOB editing pattern is form-shaped**: click a
row, a drawer or dialog opens, edit fields, save or cancel. In that pattern the
undo the user wants is field-level, inside the form — and it already works.

`timeTravel()` is left holding the cases the form cannot see: rows added, rows
deleted, rows reordered, and bulk actions. Those are exactly the ones that do not
record.

## 4. Scoring the cases against 14.0.0

Verified by execution against the built package.

| #   | Case | 14.0.0 | Why |
| --- | ---- | ------ | --- |

These scores are REVISED against §3b. The first version of this table scored
every case against `timeTravel()` alone and read "two of nine work", which was
wrong — it audited one of two mechanisms.

| 1 | Undo a row edit **in a form** | ✅ | `form(history())` — the dominant LOB pattern |
| 2 | Undo a delete | ❌ | `removeOne` records nothing |
| 3 | Undo a bulk action | 🟡 | Only via pause + a root-write seal; no grouping API, and the obvious form loses data |
| 4 | Undo a drag | ❌ | Reorder is an `updateOne` on `order`, which records nothing |
| 1b | Undo a row edit **in-grid** | ❌ | No form involved; `updateOne` records nothing
| 5 | Undo my typing | 🟡 | `form(history())` records per `set()`, so granularity follows your binding's debounce — not per-keystroke coalescing, but usable |
| 6 | Readable step list | ❌ | `action` is auto-assigned; `addEntry` is not public |
| 7 | Cancel a dialog | ✅ | `createEditSession`, independent of history |
| 8 | Rollback a failed save | ✅ | `undo()` / `jumpTo`, sound when nothing else recorded between |
| 9 | Server writes not undoable | ✅ for form state, 🟡 for the tree | A form's history is scoped to that form, so it cannot see server writes at all. For tree-level, `pauseRecording()` works but there is no authorship concept |

**Revised: five of ten work, and the split is the point.** Field-level undo inside
a form works today and covers the dominant editing pattern. What does not work is
**structural** undo — add, delete, reorder, bulk — because collection mutations do
not record.

My previous statement here was "two of nine work", which was wrong for the reason
worth remembering: I audited `timeTravel()` and treated it as the whole subject,
so a working mechanism sitting one marker away scored as a gap. Asking "how much
of this is forms rather than time travel" found it in one question.

## 4b. Should undo be a marker, a modifier, or a combination?

The instinct that whole-tree undo may be wrong for production is correct, and
there is measured evidence rather than taste behind it.

**Global undo reverts things the user never did.** Because an unrecorded change
rides inside the next recorded snapshot, a server push that arrives between two
user edits is inside the snapshot the second edit records — so the user's Ctrl+Z
reverts the server's change too, silently. That is not a bug to be fixed in
`timeTravel()`; it is inherent to whole-tree snapshot undo. Any tree-wide undo has
it. The only real defence is **scope**.

### The ethos already answers this

SignalTree's organising idea is that state declares its own behaviour **at the
position where it lives** — `stored()` for persistence, `status()` for loading,
`compared()` for equality, `entityMap()` for identity. Not global switches:
positional declarations.

Undo should follow the same rule, and one marker already does:

```ts
form({ initial, history: history() }); // scoped undo, declared at the position
```

That works today (verified above) and it has the property the global version
cannot have: **a form's history cannot see, and cannot revert, anything outside
that form.** The failure mode described above is impossible by construction, not
by discipline.

So the answer is not a new marker. Undo is not a new kind of state — it is a
property of state that already exists, which is exactly what a marker option is
for. `history()` as a value passed into a marker is the "combination" shape, and
it is already the established pattern.

### The concrete gap: one option name, two meanings

| Marker        | `history` option today | Meaning                                        |
| ------------- | ---------------------- | ---------------------------------------------- |
| `form()`      | `history: history()`   | **Opt IN** to this form's own undo stack       |
| `entityMap()` | `history?: boolean`    | **Opt OUT** of the global `timeTravel()` stack |

Same name, opposite polarity, different subject. A reader who learns one learns
the wrong thing about the other.

Following the form precedent, `entityMap` should accept `history: history()` — its
own scoped stack, recording its own mutations, undoable without touching anything
else in the tree. That single change closes cases 1b, 2 and 4 **and** removes the
"undid something I did not do" hazard for collections, because the scope is
declared rather than global.

`history: false` then becomes unnecessary rather than wrong: if collections opt IN
to their own history, there is nothing global to opt out of.

### What RFC 0012 already settled, and the part it says is hard

[RFC 0012](../../rfcs/0012-history-scoped-marker-capture.md) asked this exact
question a release earlier and reached the same answer in one line: **"the
declarative version belongs on the marker."** `pauseRecording()` is named there as
the imperative form — "correct, and it puts the burden on every call site that
writes the collection."

Its §2 states the target case precisely: a 10,000-row operational grid that
**persists** (survives reload, participates in `serialization()`/`stored()`) and
**is not in the undo stack** (the user undoes their form edit, not the feed).
Before 14.0.0 the only opt-out was `transient: true`, which opted out of _both_ —
so the grid was either fully captured with O(N) writes, or absent from every
snapshot and non-durable. No third answer.

**All three items of RFC 0012 §5 shipped in 14.0.0**, which its own status block
denied until this audit corrected it: `history?: boolean`, the dev diagnostic (as
ST2029, moved from an attach-time size check to a record-time retention check
because attach-time always saw an empty collection), and the docs requirement.

**But §3 is why my proposal above is not a small change.** Time travel, devtools
and serialisation all share one snapshot path — `snapshotState()` → `unwrap()` →
`snapshotMarkerNode()` — memoised per node in a `WeakMap`. That memo is what makes
structural sharing work: a clean marker returns the identical object across
snapshots, so a history entry costs O(depth) instead of O(state).

So a _purpose-dependent_ snapshot cannot just branch inside `snapshot()` — the memo
would cache whichever purpose asked first and serve it to the other. Keying by
purpose fixes correctness and costs the thing the memo exists for: two cells per
node, and the two purposes stop sharing structure.

Which means `entityMap({ history: history() })` — a per-collection undo stack — is
**not** the same size of change as `history: false` was. It needs a design that
records collection mutations into a scoped stack _without_ forking the shared
snapshot path. That is the real content of §5 item 1 in this document, and it is
why it is RFC material rather than a patch.

### What that leaves `timeTravel()` for

Devtools. Whole-tree rewind and fast-forward, unbounded history, full fidelity —
genuinely useful, and genuinely a development concern. Keeping it dev-only is not a
limitation we inherited from libraries with expensive snapshots; it is the right
scope for a whole-tree tool, arrived at from the opposite direction.

Which reverses the recommendation in
[time-travel-in-production.md](../../guides/time-travel-in-production.md). That
guide argues you CAN run `timeTravel()` in production because recording is now
cheap. True, and beside the point: cost was never the only reason not to. The
guide needs rewriting around scoped, marker-declared undo, with `timeTravel()`
positioned as the devtools instrument.

## 5. What the research says to build

In priority order, derived from the ranking rather than from API symmetry.

1. **Record collection mutations.** Still first, but the case is now narrower and
   more precise: it is about STRUCTURAL undo — rows added, deleted, reordered — not
   about field editing, which `form(history())` already covers. Cases 1b, 2 and 4.
   Needs a granularity decision (per-mutation vs per-turn), which is RFC material.
2. **`transaction(label, fn)`** — one labelled entry for everything inside. Closes
   case 3 properly (replacing the seal workaround) and case 6 at the same time.
3. **Authorship on a write** — mark a write as non-user so it stays out of the undo
   stack by construction, instead of relying on a caller to pause. Closes case 9
   and lets `realtime` do the right thing without every consumer knowing to.
4. **Coalescing window** for case 5. Lower priority: text-heavy editing is not the
   centre of the claimed workloads.

Note what is NOT on this list: per-entity undo. It is a real absence, but no case
above asks for it — the user's mental model in a grid is "undo my last action", not
"undo this row's history independently".

## 6. What to do about the guidance meanwhile

`docs/guides/time-travel-in-production.md` currently presents four levers as
though they compose into a working feature. They do, for scalar and branch state.
They do not for collections, which is where the claimed workloads live. Until item
1 above is decided, that guide should state the collection limitation at the top
rather than in a caveat, because a reader following it for a CRM grid will build
something that silently does nothing.

## Open questions this research cannot answer

- **Is any adopter actually shipping undo today?** If yes, they have hit case 1 and
  their workaround is the most valuable design input available.
- **Per-mutation or per-turn granularity** for collection recording? Case 1 wants
  per-action; a drag that writes twenty `order` fields wants per-turn. This is what
  item 1's RFC has to resolve, and it is a UX question before it is a perf one.

---

## 7. The workloads the website actually recommends

§2 derived UX cases from general LOB software. This section is narrower and more
accountable: it takes the **eleven workloads the fit page recommends SignalTree
for**, asks what undo means in each, and sketches the implementation. If a
workload we actively pitch cannot express its own undo, that is a claim to fix or
retract.

Verdicts are against 14.0.0 as measured in §4. `form(history())` = scoped field
undo, works. Collection mutations do not record.

### 1. Streaming telemetry into many per-entity bindings

_Fleet & logistics, grid/SCADA, telecom NOC, manufacturing MES, airline & rail ops,
trading blotters_

**What undo means:** nothing, for the telemetry — it is server-authored and the
user must not be able to revert it. What the user may undo is their own overlay:
an acknowledgement, a note, a manual override.

```ts
signalTree({
  // Server-authored. MUST be excluded or Ctrl+Z reverts incoming telemetry.
  units: entityMap({ selectId: (u) => u.id, history: false }),
  // The operator's own overlay — this is what undo is for.
  ack: form({ initial: { note: '', override: null }, history: history() }),
});
```

**Verdict: ✅, and this is `history: false`'s real use case** — not bulk import.
Without it, a global stack lets an operator undo a telemetry frame they never
caused. In a SCADA or NOC context that is a safety-adjacent bug, not a papercut.

### 2. Offline-first with server-owned collections

_Field service, mobile operations_

**What undo means:** revert _my_ local edit before it syncs. Never revert what the
server sent, and never let a sync write become an undo step.

```ts
signalTree({
  jobs: entityMap({ selectId: (j) => j.id, load: loader(...), history: false }),
  edit: form({ initial: blankJob, history: history() }),   // per-job edit buffer
});
```

**Verdict: 🟡.** Editing a job's fields works. _Creating_ a job offline is a
collection mutation, so it does not record and cannot be undone.

### 3. Deep nested forms with audit and persistence

_Healthcare, claims, regulated workflows_

**What undo means:** field-level undo while filling a long form, plus an audit
trail — which is a different artefact, and conflating them satisfies neither.

```ts
signalTree({
  claim: form({
    initial: blankClaim,
    history: history(), // undo while filling
  }),
  draft: stored('claim-draft', blankClaim), // survives a refresh
}).with(/* audit */);
// trail: createAuditTracker() — append-only, NOT the undo stack
```

**Verdict: ✅ — the best-supported workload we claim.** Nested depth is exactly
what `form()` handles, and undo, durability and audit are three separate
primitives instead of one overloaded stack.

### 4. CRUD over moderate lists, server round-trips

_CRM, ERP, admin consoles, insurance_

**What undo means:** three different things, and they do not share a mechanism.
Undo a row edit (form-shaped). Undo a delete (structural). Undo a bulk assign
(grouped).

```ts
// Row edit — works.
rowEdit = form({ initial: row, history: history() });

// Delete — does NOT record. Today's only option is a root write to force a
// snapshot, which is a workaround, not a design:
remove(id: string) {
  this.tree.$.rows.removeOne(id);
  this.tree({ rev: this.tree.$.rev() + 1 });   // forces a recordable entry
}
```

**Verdict: 🟡, and this is the headline CRUD claim half-served.** One of three
undo meanings works natively.

### 5. Drag-driven boards and schedules

_Dispatch, Gantt, planning_

**What undo means:** undo the drag. That is the _only_ interaction that matters
here — it is the workload's entire gesture.

```ts
// The move itself: order as data (correct, and it persists for free).
move(id: string, order: number) {
  this.tree.$.cards.updateOne(id, { order });   // records NOTHING
  this.tree({ boardRev: this.tree.$.boardRev() + 1 }); // ...so force one
}
```

**Verdict: 🟡 with a non-obvious workaround, and this is the sharpest
contradiction in the set.** We lean on drag-driven boards, and the core gesture's
undo requires the developer to discover that they must bump an unrelated counter.
A dispatcher who drags a job to the wrong tech and hits Ctrl+Z gets nothing.

### 6. Undo/redo as a shipped feature over moderate state

_Editors-in-a-panel, wizards, bulk edit_

**What undo means:** whatever the panel edits — which the claim does not say.

**Verdict: ✅ for scalar/branch/form state, ❌ for collection structure.** The
workload we name "undo as a shipped feature" is the one whose support depends
entirely on a state shape the claim does not mention. That is the row to reword.

### 7. Whole-dataset reads on every change

_BI and analytics explorers_

**What undo means:** undo a filter or grouping change — a back button for the
query, not for the data.

```ts
filters: form({ initial: { range: '30d', groupBy: 'region' }, history: history() });
```

**Verdict: ✅.** Filter state is form-shaped and small; the dataset itself is
read-only and belongs in `history: false`.

### 8. Deep undo over LARGE collections

_Design tools, media timelines_

**Verdict: ❌, and the fit page already says an immutable root wins here.**
Consistent — no claim to retract. Worth noting _why_ it is now a structural answer
rather than a cost one: recording is cheap, but collection mutations do not record,
so depth over structure is the one thing this design does not give.

### 9. Concurrent editing of one document

_CMS authoring, co-editing_

**Verdict: correctly out of scope.** Undo must be per-user and
intention-preserving; snapshots are neither. The fit page already routes this to a
CRDT.

### 10. A few values inside one component

**Verdict: ✅ / not applicable.** If undo is needed at all, `form(history())`.

### 11. Large teams, long-lived, hiring-driven

**Verdict: not a technical undo question.**

## 8. What §7 changes

The eleven recommended workloads split cleanly, and the line is not the one the
marketing draws:

|                      | Workloads                                                                                | Undo today         |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------ |
| **Form-shaped**      | deep nested forms, BI filters, small components, per-record editing inside 2 and 4       | ✅ works, natively |
| **Structure-shaped** | drag boards, deletes and bulk in CRUD, offline creates, deep undo over large collections | ❌ or workaround   |

Three consequences:

**Both workarounds are verified, not sketched.** Delete: 3 rows → remove +
`rev` bump → 2 → undo → 3, row restored. Drag: `abc` → `updateOne(order)` + `rev`
bump → `cab` → undo → `abc` → redo → `cab`. So the counter-bump pattern genuinely
works for structural undo today; the objection is that a developer has to discover
it, and nothing in the docs points there.

(My first attempt at the drag check proved nothing — the fixture had no
`sortComparer`, so the `order` field was inert and `all()` returned insertion
order. Re-run with the comparator, it round-trips.)

1. **`history: false` earns its keep, for a reason nobody wrote down.** Its real
   job is keeping server-authored data out of a user's undo stack (workloads 1, 2, 7) — not trimming memory on a bulk import, which is how it is documented.
2. **Two fit-page rows overstate what works.** "Drag-driven boards" (5) needs a
   counter-bump workaround for its central gesture, and "Undo/redo as a shipped
   feature" (6) is silent about the shape dependency. Both should be reworded, or
   item 1 in §5 should ship.
3. **The two-mechanism split maps onto the workload split.** That is the strongest
   argument yet for scoped, marker-declared undo per §4b: the workloads whose undo
   works are the ones where undo is already declared at the position, and the
   workloads that fail are the ones waiting on `entityMap` to accept the same
   `history()` that `form` does.
