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

## `@signaltree/guardrails` — a defect, and then a redesign

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

### What was deliberately NOT changed, and then was

The first pass kept the clone. `git blame` puts it at `2be2186b`, "robust
polling detection", and it earns its keep: it is what lets polling notice a leaf
value **mutated in place**, which never notifies a signal and is invisible to
every other path. Removing it looked like trading a measured cost for a real
capability, so it stayed.

That was the right instinct and the wrong stopping point — because it framed the
question as keep-or-remove and never asked what the clone was actually competing
against. Measured properly, the clone is worse on **three** axes, not one:

| | with the clone | holding the reference |
| --- | --- | --- |
| making the snapshot | O(state), 87.9µs at 300 branches | free |
| `deepEqual(cur, prev)` | full walk — a clone shares nothing | short-circuits on every shared subtree |
| `detectChangedPaths` | full walk, same reason | O(changed paths) |
| retention | a full copy per change | shares with the live snapshot |

Snapshot + diff together: **189µs cloned vs 70.6µs by reference** at 300
branches, 3-4x. The clone was not just costly to make — it *destroyed the fast
path in everything downstream of it*, because structural sharing is what makes
those walks cheap and a copy shares nothing.

### The premise that changed the answer

`tree()` returns the identical object when nothing changed and a new one when
something did — and a **no-op write does not produce a new one**, because the
leaf's `equal` suppressed it. So reference identity is not an approximation of
"did anything change". It is exact, and it is O(1). Verified all four ways:
same reference across idle polls, new reference after a real write, same
reference after a no-op write, and blind only to in-place mutation.

On the **idle poll** — which is what guardrails does 20 times a second whether
or not anything happened, and therefore most of what it ever does:

| | idle poll |
| --- | --- |
| clone + compare | 32.5µs @ 100 branches, 122.8µs @ 400 |
| reference compare | **0.080µs / 0.045µs** |

### What shipped

The dispatch key is derivable from the data, so this is a hybrid, not a choice:

- **`cur !== prev`** → a signal-driven change. Diff the paths, which is now
  O(changed paths) because the previous snapshot shares its unchanged subtrees.
- **`cur === prev`** → a signal-driven change is *impossible*. The only thing
  that can have happened is an in-place mutation, so check the containers —
  and only then.

Containers (array / `Map` / `Set` / `Date`) are copied individually instead of
the whole tree. `length`/`size`/`getTime` is an O(1) check that catches every
shape change at any size — push/pop/splice/delete/add/clear, which is the
overwhelming majority of in-place mutation. Contents are copied under an
AGGREGATE budget of 5,000 elements tree-wide (~4µs per poll).

That budget was per-container at first, capped at 1,000, and it was the same
wrong noun this document keeps finding: fifty containers of 999 elements pass a
per-container cap individually and cost 50,000 element comparisons twenty times
a second. What is bounded has to be the thing that costs time, and that is a sum.

ST2030 now reports one container that could not be copied, with everything else
in state unaffected — where it used to mean the entire snapshot had degraded.

Each of the three mechanisms is mutation-verified independently: removing the
in-place check fails 4 tests, removing the contents copy fails 2, removing the
shape check fails 1.

---

## The same question, turned on this release's own decisions

Asking "did I weigh options, or take the first thing that worked?" about the
guardrails clone found a redesign. Asked about everything else shipped in
14.0.0, it found **ST2029 does not work.**

It was checked once when `timeTravel()` attached. That is the one moment it
cannot work: an app builds its tree and attaches the enhancer in the same
breath, and the rows arrive later from a fetch. At attach the collection is
empty, every time.

It passed three tests. All three populated the collection *before* attaching —
an order chosen, without noticing, to suit the implementation rather than to
match what an app does. This repo already had the lesson written down, in
`undo-redo-vs-devtools.md`: *"a test that exercises two things at once can pass
for the wrong one."* This is its sibling — **a test can encode the
implementation's assumptions instead of the requirement's, and then confirm
them.** Every ST2029 test now builds, attaches, and only then loads.

Moving the check to record time also removed a number that had been guessed
rather than derived. The threshold was "1,000 rows", and the quantity that
actually costs memory is `entries × width`:

- a 20,000-row grid edited twice retains 40k pointers and warned — noise;
- a 50-row list edited for an hour retains 10k and stayed silent — correct, but
  by luck, since the row count is what was being tested.

The budget is now ~500k retained pointers (~5MB, at the ~10 bytes/pointer the
RFC 0012 measurements imply). The dispatch key was derivable from the data the
whole time; the row count was a proxy for it that gets both ends wrong.

---

## Open, and deliberately not done here

**Guardrails prefers a strategy that may see nothing.** `startChangeDetection`
tries PathNotifier first and, if a notifier exists at all, uses it — even for a
plain-object tree, where the notifier only fires for entity collections or when
devtools has installed its leaf interceptor. The code knows this: it warns and
tells you to set `disablePathNotifier: true`. So the default can be
change-blind, and the fallback that always works is third in line. Changing the
ordering is a behavioural decision, not a fix, and it wants its own evidence.

**Freezing beats polling for in-place mutation.** Everything above detects an
in-place mutation up to 50ms later and infers its path by diffing. `Object.freeze`
on snapshot values in dev makes the mutation throw *at the mutating line*, with
a stack — strictly better information, and it enforces a contract the library
already documents. NgRx ships exactly this as `strictStateImmutability`, opt-in,
because it makes dev and prod behave differently. If it were added, the
container-watch machinery becomes a fallback for people who decline the freeze.

**The constructor gate and cross-realm objects.** RFC 0013 §5.1 records that a
cross-realm `{}` no longer equals a local one. The obvious escape hatch —
falling back to `constructor.name` — is declined: `name` collides across
unrelated classes (two different `class Row`s), so it trades a false-UNEQUAL,
which costs a redundant notification, for a false-EQUAL, which drops a write.
That is the wrong direction on the only axis that matters here.

## What the survey is actually worth

Two things, neither of them the thing it was launched to find:

1. **The generalisation was wrong, and cheap to disprove.** "50 more instances
   of a pattern we just fixed" was a grep result wearing a finding's clothes. The
   cost was never the callback — it was the callback × a large collection × a
   per-write path. Counting the idiom counts the wrong noun.

2. **Looking for the hot path directly found what grepping for the idiom could
   not.** Neither the ng-forms `getRawValue` measurement nor the guardrails
   defect appears anywhere in the 50 sites that prompted this. Both came from
   asking "what runs on every change here?" instead of "where else does this
   pattern appear?"

3. **The costly move was framing the guardrails question as keep-or-remove.**
   Both answers were defensible and both were wrong, because neither asked what
   the clone was competing against. The clone did not merely cost 87.9µs to
   make — it destroyed the structural-sharing fast path in everything downstream
   of it. That only becomes visible once you measure the alternative rather than
   the thing in front of you.

4. **Two of the three findings came from re-auditing decisions already made,
   not from new code.** ST2029's attach-time check and the guardrails clone were
   both shipped by this same release, both with passing tests, both reviewed at
   the time. A survey aimed outward found its best material by turning around.
