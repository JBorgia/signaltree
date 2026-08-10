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
