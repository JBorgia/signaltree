# Survey of the packages the 14.0.0 hot-path work never touched

**Date:** 2026-08-07 · **Scope:** `@signaltree/events`, `@signaltree/ng-forms`,
`@signaltree/guardrails`

## Why this was run

The 14.0.0 equality work found that `Array.prototype.every(callback)` in
`deepEqual` cost a callback dispatch **per element** on the leaf-write path, and
replacing it with a plain loop carrying an inline reference check was a 3-4x win
(159µs → 37.9µs on a 50,000-element array with one change). A grep then found
**50 more callback-iteration sites** in three packages that no measurement in
this release had looked at: events (36), ng-forms (9), guardrails (5).

The hypothesis under test: *the same idiom, in the same position, costs the same
thing elsewhere.*

**It does not, anywhere.** The idiom was never the problem. The problem was the
idiom **over a large collection on a per-write path**, and that conjunction does
not occur in these three packages. Recorded here because a survey that finds
nothing is only worth something if it says what it looked at.

---

## `@signaltree/events` — nothing to fix

Of the 36 sites, **26 are in `src/testing/`** — `MockEventBus`, assertion
helpers, factories. Test-time code over arrays of recorded events. Irrelevant.

The remaining 10 split into:

| location                  | what it iterates                | why it does not matter        |
| ------------------------- | ------------------------------- | ----------------------------- |
| `core/registry.ts`        | registered event definitions    | startup, once                 |
| `core/validation.ts`      | Zod issues on a failed validate | only on the failure path      |
| `nestjs/dlq.service.ts`   | dead-letter entries             | server-side admin query       |
| `angular/handlers.ts:125` | the handler list, on unsubscribe | tens of entries, on teardown |
| `angular/entity-events.ts:245` | ids in one remove batch    | bounded by the batch          |

**The actual dispatch loop already uses `for...of`** (`handlers.ts:133` and
`:168`) — the one place a per-element callback would be paid per event is
already in the shape the deep-equal fix converted to. No change.

---

## `@signaltree/ng-forms` — measured, and it is fine

The 9 sites are form-structure traversals (`connectControlRecursive`,
`control.controls.forEach`), and they run at **connect time**, not per keystroke.
Bounded by form size, paid once.

Looking for the real per-keystroke path instead of the grep's suggestion found
something the grep would never have flagged: `formGroup.valueChanges` fires
`refreshAggregates()` (debounced by `validationBatchMs`), `schedulePersist()`
(debounced), and **`applyConditionals()` — which is not debounced and calls
`formGroup.getRawValue()`, a full recursive walk building a fresh object.**

Measured, per keystroke:

| fields | `getRawValue()` |
| ------ | --------------- |
| 20     | 1.19µs          |
| 50     | 2.70µs          |
| 200    | 12.91µs         |
| 500    | 32.14µs         |

32µs at 500 fields is **0.2% of a 16ms frame**, and it costs nothing at all
unless the form declares `conditionals` (the whole function is `() => undefined`
otherwise). Not worth a change, and worth recording as measured-and-declined so
the asymmetry with its debounced siblings does not read as an oversight later.

---

## `@signaltree/guardrails` — one real defect, fixed

The 5 sites are all in periodic analysis (`checkMemory`, `trackHotPath`,
percentile updates), not per-write. Nothing there.

But looking at what guardrails does **per state change** found
`tryStructuredClone(currentState)`, and a defect in its fallback.

### What was wrong

`structuredClone` throws on a function or class instance, so one such field
anywhere in state degrades the whole snapshot. The fallback was a JSON
round-trip, which turns a `Date` into a string and a `Map`/`Set` into `{}`. The
resulting `previousState` **can never `deepEqual` the live state again**, so
`handleStateChange` reported a change on **every poll, forever** — inventing hot
paths, update counts and issues for a tree nobody touched.

A diagnostic that fabricates the problem it exists to find is the one failure
mode it cannot have. Fixed under **ST2030**: hold the live snapshot by reference
instead, and say so once.

### What was deliberately NOT changed

The clone itself. `git blame` puts it at `2be2186b`, "robust polling detection",
and it earns its keep: it is what lets polling notice a leaf value **mutated in
place**, which never notifies a signal and is invisible to every other path.
Returning a reference loses exactly that, and only for the degraded case.

Verified before touching it — and it is the reason a reference is a legitimate
"before" at all:

- a `tree()` snapshot captured before a write **still reads the old value after
  it**, with no clone involved (snapshots are immutable and structurally shared);
- unchanged subtrees are shared by reference across snapshots, which a clone
  destroys.

Those two facts also make the clone look removable outright — it costs **87.9µs
per state change** on a 300-branch tree and discards the structural sharing, so
guardrails retains a full copy per change instead of a delta. **Not done here.**
The in-place-mutation case is a real capability, the commit that added the clone
was deliberate, and swapping a measured cost for a lost capability is a decision
that deserves its own change with its own evidence, not a drive-by inside a
survey.

---

## What the survey is actually worth

Two things, neither of them the thing it was launched to find:

1. **The generalisation was wrong, and cheap to disprove.** "50 more instances
   of a pattern we just fixed" was a grep result wearing a finding's clothes. The
   cost was never the callback — it was the callback × a large collection × a
   per-write path. Counting the idiom counts the wrong noun.

2. **Looking for the hot path directly found what grepping for the idiom could
   not.** Neither the ng-forms `getRawValue` measurement nor the guardrails
   ST2030 defect appears anywhere in the 50 sites that prompted this. Both came
   from asking "what runs on every change here?" instead of "where else does this
   pattern appear?"
