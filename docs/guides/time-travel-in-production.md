# Time travel in production

Every other Angular store tells you to keep undo/redo out of production. That
advice is correct **for them** and was correct for us until 13.5.0. It is now
wrong for the reason people repeat it, and right for a different reason that is
much easier to manage.

This guide separates the three costs that got collapsed into one warning, and
gives you the four levers that make production undo/redo a normal feature.

Every figure and behaviour below was verified against the built package. Timing
comes from `node tools/bench-leaf-equality.mjs`; retention arithmetic is the
ST2029 model in [errors/README.md](../errors/README.md).

## The one distinction that matters

**User-facing undo/redo is not devtools time travel.** They have been argued
about as one thing.

- _"Undo the last thing I did"_ is a product feature. Editors, bulk-edit grids,
  wizards, drag boards. Your users expect it and it ships.
- _"Let me scrub the whole app back through 200 states"_ is a debugging tool. It
  wants unbounded history and full fidelity, and it belongs in dev.

`timeTravel()` serves both. The rest of this guide is about the first.

## Cost 1 — snapshot time. This no longer exists.

The reason every other library says dev-only: a snapshot is a deep clone, so
recording costs O(state) **per write**. At 10,000 rows that is unusable, so it
gets gated to dev and nobody revisits it.

Since 13.5.0, `tree()` is memoised and structurally shared — materialisation
rebuilds only the nodes beneath a signal that actually changed, and clean
subtrees come back **by reference**. A history entry is therefore a pointer graph
over shared structure, not a copy.

<!-- measured: the "before" column is a point-in-time record from the 13.5.0 CHANGELOG entry — pre-13.5.0 materialisation no longer exists to re-run. The "now" column reproduces with `node tools/bench-leaf-equality.mjs`. -->

| 50 recorded writes over | before 13.5.0 | now         |
| ----------------------- | ------------- | ----------- |
| 10,000 rows             | 340.60 ms     | **0.04 ms** |

The qualitative change is not the percentage: recording is now **flat in state
size**. If you rejected time travel on write cost, re-measure.

## Cost 2 — memory. This is the real constraint, and it is arithmetic.

A history entry holds the tree's snapshot, and a collection's snapshot is **one
pointer per entity**. So retention is `entries x width`, at roughly 10 bytes per
retained pointer:

<!-- measured: the ST2029 retention model — `entries x width` at ~10 bytes per retained pointer. Source and measurement are in docs/errors/README.md, ST2029; the threshold lives in packages/core/src/lib/signal-tree.ts. Arithmetic, not a benchmark: it scales linearly by construction. -->

| collection | 50 entries retained |
| ---------- | ------------------- |
| 1,000 rows | 0.76 MB             |
| 10,000     | 5.08 MB             |
| 50,000     | 24.73 MB            |

Core warns past ~500k retained pointers (**ST2029**), judged on retention rather
than row count — a wide collection with short history and a narrow one with long
history are held to the same standard, because a row-count threshold gets both
wrong.

This is the number to design against. It is bounded by two things you control:
how many entries you keep, and how wide the recorded state is. Both have levers.

## Cost 3 — bundle. Real, and a separate question.

<!-- measured: node tools/size-report.mjs — the per-enhancer delta over a bare tree. -->

`timeTravel()` is a couple of KB you do not want in a build that never undoes
anything; `node tools/size-report.mjs` prints the current delta.

⚠️ **Do not gate it on a runtime boolean.** This ships it anyway:

```ts
// BROKEN — the static import defeats tree-shaking, so timeTravel is in the bundle
const tree = isProduction ? base : base.with(timeTravel());
```

Put the import behind the build so the bundler can drop it — see
[composition-recipes.md](./composition-recipes.md). If you _want_ undo in
production, this cost is simply the price of the feature, and it is small.

## The four levers

### 1. Bound the history — `maxHistorySize`

```ts
signalTree(state).with(timeTravel({ maxHistorySize: 50 }));
```

Verified: 20 writes against `maxHistorySize: 5` leaves a history of 5. This is
your direct control over the `entries` half of `entries x width`.

### 2. Scope what is recorded — `history: false`

The lever no other Angular store has. A collection can persist and serialise
while staying **out of the undo stack**:

```ts
signalTree({
  // 50,000 server-owned rows: saved and restored, never undone
  rows: entityMap({ selectId: (r) => r.id, history: false }),
  // the small editable state the user actually undoes
  draft: { title: '', tags: [] as string[] },
}).with(timeTravel({ maxHistorySize: 50 }));
```

Verified: with `history: false`, two undos reverted the scalar state to its
initial value and left the collection's contents untouched.

⚠️ **That is the tradeoff, stated plainly: `undo()` will not revert an excluded
collection.** If the user can edit those rows and expects undo, do not exclude
them — shorten the history instead.

`transient: true` is the stronger form: out of history **and** out of
serialisation. Use it for genuinely derived or secret state.

Arbitrary branches cannot be scoped yet — only markers. That is
[RFC 0012](../rfcs/0012-history-scoped-marker-capture.md), accepted and deferred.

### 3. ~~Make bulk work one step — `pauseRecording()`~~ — REMOVED in 15.0.0

**This lever is gone, and it should never have been one.** `pauseRecording()`,
`resumeRecording()` and `isRecordingPaused()` were deleted rather than deprecated.

It could not express "one undo step" — only "record nothing". `addEntry` bailed on a
single boolean, so pausing alone was **destructive**: nothing recorded, the newest entry
still described the state BEFORE the bulk, `undo()` stepped back past it, and the result
became unreachable with `canRedo()` false. Verified: n went 1 → (bulk to 5) → undo → **0**,
redo → 1, and 5 was unreachable. An earlier revision of this very guide shipped that
recipe.

The documented fix was a synthetic "sealing" write — meaning an undo API that required
you to add a field to your domain model so history had somewhere to land, after which
the entry was identified by a timestamp rather than by what the user did.

And it was a **global** mode. `pausedSignal` was one flag on one manager and `addEntry`
returned early for every writer, so correctness required sole ownership of the tree for
the window's duration. Verified: an unrelated `tree.$.rev.set(999)` inside a paused window
was suppressed too. A synchronous `for` loop has sole ownership by construction; a
multi-second `mergeMap` over N HTTP requests does not.

**What to do instead, today:** nothing. Writes that share a microtask are already one
entry — a 25-row import in a synchronous loop records one step and `undo()`/`redo()`
round-trips it. Verified after removal: 25 `addOne` calls → 1 entry, undo → 3 rows,
redo → 28.

**What is coming:** that microtask boundary is decided by whether a caller happens to
`await`, which is an accident rather than a design. Intent-scoped grouping is a
transaction handle — see
[history-the-greenfield-target.md](../architecture/history-the-greenfield-target.md).

### 4. Drop uninteresting transitions — `shouldSkip`

```ts
timeTravel({
  // a cursor move is not an undo step
  shouldSkip: (prev, next) => prev.cursor !== next.cursor && prev.doc === next.doc,
});
```

Verified: ten cursor-only writes were all skipped, leaving history at 2 entries.

⚠️ It runs on **every recorded write**, so compare the few fields you mean. A
whole-state deep compare here undoes the saving.

## Composition patterns, and whether they hold up

| What you are building                         | Pattern                                                                     | Supported                            |
| --------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| Editor undo over a small document             | `maxHistorySize` + `shouldSkip` for caret/selection                         | Yes                                  |
| Bulk-edit grid with cancel                    | `createEditSession` (`@signaltree/core/edit-session`) — commit or discard   | Yes, and independent of `timeTravel` |
| Undo one panel, not the whole app             | `history: false` on everything outside the panel                            | Yes                                  |
| Large server collection + small editable form | `entityMap({ history: false })` beside an undoable branch                   | Yes — the headline pattern           |
| Optimistic write, roll back on error          | `undo()` in the error path, or `jumpTo(getCurrentIndex() - 1)`              | Yes                                  |
| Import/generate, then one undo                | `pauseRecording()` / `resumeRecording()` **+ a sealing write**              | Yes — read the warning               |
| Audit trail rather than undo                  | `createAuditTracker()` / `createAuditCallback()`, or `getHistory()`         | Yes — no `timeTravel` needed         |
| Show the user how far they can go             | `getCurrentIndex()` back, `getHistory().length - 1 - getCurrentIndex()` fwd | Yes — reactive since 14.0.0          |
| Undo per entity, independently                | —                                                                           | **No.** elf has this; we do not      |
| Collaborative editing                         | A CRDT (Yjs, Automerge) underneath — undo is per-user, not per-document     | **Not a store feature.** Don't       |

## Reactive readers, and why that mattered

`canUndo()`, `canRedo()`, `getHistory()` and `isRecordingPaused()` are **signals
since 14.0.0**. Before that they read plain values, so
`computed(() => tree.canUndo())` evaluated once and cached `false` forever — an
undo button in a zoneless app never enabled. If you are on 13.x and your undo
button looks dead, that is the bug.

## A starting configuration

```ts
export const appTree = signalTree({
  rows: entityMap({ selectId: (r: Row) => r.id, history: false }),
  draft: { title: '', body: '' },
  ui: { cursor: 0, hovered: null as string | null },
}).with(
  timeTravel({
    maxHistorySize: 50,
    shouldSkip: (prev, next) => (prev as State).draft === (next as State).draft,
  })
);
```

Fifty steps over a small draft, a large collection deliberately outside the undo
stack, and cursor churn dropped. Retention is 50 entries over a narrow branch —
kilobytes, not megabytes — and recording is flat in state size.

## See also

- [entity-collection-cookbook.md](./entity-collection-cookbook.md) — collection
  modelling, including why an array leaf is the expensive mistake
- [errors/README.md](../errors/README.md) — ST2029 (retention) and ST2028
  (edit-session cloning)
- [RFC 0012](../rfcs/0012-history-scoped-marker-capture.md) — scoping history for
  arbitrary branches, not just markers
