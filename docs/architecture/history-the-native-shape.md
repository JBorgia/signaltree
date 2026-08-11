# History, in SignalTree's own shape

> ⚠️ **SUPERSEDED — read this as the argument for one option, not as the design.**
> It reads as current and it is not. This note argued for the path-diff log as _the_
> answer, and its central premise is measured wrong: `notify()` does **not** fire at
> every write site. Plain leaf writes reach it only via `interceptLeafSignals`
> (installed by `timeTravel()` itself), `status()`, `stored()`, `compared()` and the
> async markers never notify at all, and a whole `form()` is a single path — so a
> path-diff log has no in-form field granularity. The plan of record is
> [history-PLAN.md](./history-PLAN.md); the options analysis is
> [2026-08-history-greenfield-spike.md](../research/2026-08-history-greenfield-spike.md).
> The reasoning below is still worth reading; the verdict is not.

**Status:** superseded architecture note, 2026-08-10. Written in answer to one question:
_why are we coding to make SignalTree look like other libraries when it isn't
them?_ The answer is that we are, the audit that preceded this inherited their
vocabulary, and most of its "gaps" are artefacts of the borrowed shape rather
than missing features.

## The tell

Read the gap list in
[time-travel-use-case-audit.md](../audits/2026-08/time-travel-use-case-audit.md)
and notice that every single one is a limitation of **a stack of whole-tree
snapshots navigated by index**:

| Gap                                  | Why it is hard                                        |
| ------------------------------------ | ----------------------------------------------------- |
| No settable label                    | A snapshot has no natural place to put one            |
| No grouping / transaction            | You cannot group things that are already whole states |
| No coalescing                        | You cannot merge two whole states meaningfully        |
| Not persistable                      | Snapshots are large; the stack is `entries x width`   |
| No per-entity undo                   | A whole-tree snapshot has no per-entity granularity   |
| No branch scoping                    | A whole-tree snapshot is, definitionally, whole       |
| Undo reverts what the user never did | A snapshot cannot say who caused it                   |

Also notice the vocabulary: `maxHistorySize`, `shouldSkip`, `pauseRecording`,
`jumpTo`. Every one is a snapshot-stack concept, and three of them arrived in
14.0.0 from a capability audit whose stated motivation was "elf and Akita ship
pause and a comparator; we shipped neither."

**That is the mistake.** A snapshot stack is the only architecture available to an
immutable-root store. Redux, elf and Akita capture the root reference because the
root reference is the only thing they can capture cheaply — every write already
produced a new one. Their history design is downstream of their write design.

Our write design is the opposite, and we kept their history design anyway.

## What SignalTree already knows that they cannot

A write goes to one leaf, and the library **already computes the path**:

```ts
// path-notifier.ts:113 — called from entity-signal.ts, form.ts, devtools
notify(path: string, value: unknown, prev: unknown)
```

`path`, `after`, `before`. At every write site, already. And
`updateAndReport(partial): string[]` already returns the dot-paths that _actually_
changed — a re-fetched payload that deep-equals current state reports `[]`.

So the native currency of a SignalTree change is not a state. It is:

```
{ path, before, after, label?, author?, txn? }
```

`timeTravel()` throws all of that away and snapshots the root instead.

## The architecture that fits

**An inverse-diff log, with keyframes only for scrubbing.**

- **Undo** = apply `before` at `path`. One leaf. O(1), independent of state size —
  the same claim the write path already makes.
- **Redo** = apply `after` at `path`.
- **Label** = a field on the entry. Gap B, gone.
- **Group** = a `txn` id shared by a span of entries; undo walks the span. Gap A,
  gone, and the `pauseRecording` sealing-write trap with it.
- **Coalesce** = merge adjacent entries with the same `path`. Gap D, gone — and
  note it is only expressible _because_ entries are retained, which is why moving
  `shouldSkip` to read time was a prerequisite rather than a separate fix.
- **Scope** = filter by path prefix. `undo` over `$.draft` cannot see `$.rows`.
  Gaps E and F, gone. **Per-entity undo — the thing elf has and we "cannot do" —
  is `path.startsWith('$.rows.' + id)`.** It falls out.
- **Authorship** = a field on the entry. A server push carries `author: 'server'`
  and a user's undo filters it out. The failure where Ctrl+Z reverts a change the
  user never made becomes unrepresentable, not merely documented.
- **Retention** = the log stores what changed, not the whole state. ST2029's
  `entries x width` floor — 19.38 MB at 50,000 rows over 50 entries, and 114.77 MB
  when every row changes — describes a cost this shape does not have.
- **Collections** = `entity-signal.ts` already calls `notify` per entity on every
  mutation. Recording collection changes stops being a feature to build and becomes
  a subscription to a notification that already fires.

Nine of the audit's problems are one design decision.

## What the snapshot model buys, honestly

Two things, and neither is undo:

1. **`jumpTo(arbitrary index)`** is a pointer move on a snapshot stack; on a log it
   is a replay or rewind across a range. More work, and worth measuring before
   assuming it is cheap enough.
2. **"Show me the whole state at step N"** — the devtools case — needs a base state
   plus replay. The standard answer is periodic keyframes, which is how video has
   always worked: keep a full snapshot every N entries, replay diffs from the
   nearest one.

So the honest design is **a diff log for undo, keyframes for scrubbing** — and
`timeTravel()` becomes the keyframe-and-replay instrument it always was, while undo
becomes something else entirely. That also settles the question this release kept
circling: the two are not the same feature wearing different configs, and trying to
serve both from one snapshot stack is why neither is good.

## What is genuinely hard, and must be resolved before building

Not hand-waved:

1. **Non-invertible writes.** A `before` that cannot be reapplied — a function
   value, a class instance with private fields, a live subscription — has no safe
   inverse. ST2028 already documents this class for edit sessions. The log needs an
   explicit "not invertible, keyframe required" verdict per entry, and a policy when
   one appears mid-span.
2. **Coalescing correctness.** Merging adjacent same-path entries is only sound if
   the earlier `before` is kept and the later `after` wins. Get the order wrong and
   undo silently lands on a value that never existed.
3. **Path stability under structural change.** `$.rows.<id>` is stable until
   `changeId` renames it — which is exactly the case ST2031 was just added for. A
   log holding pre-rename paths needs the same remap `activeId` gets.
4. **Interaction with structural sharing.** `before`/`after` are references into a
   memoised, structurally-shared graph. Holding them keeps that subtree alive, so
   log retention has a memory profile that needs measuring rather than assuming —
   smaller than snapshots, but not free.
5. **Ordering versus batching.** `pathNotifier` has a batching mode. Whether the log
   records pre- or post-batch decides whether a batch is one entry or many, which is
   the grouping question again from below.

## Why this is a 15.0.0 shape, not a patch

It replaces the history representation. Everything reading `getHistory()` sees a
different thing, `jumpTo` changes cost, and `maxHistorySize` stops meaning what it
means today. That is a major, and it should be the _point_ of the major rather than
a side effect.

It also reverses the direction of the last three additions. `shouldSkip`,
`pauseRecording` and the `maxHistorySize`-bounds-memory story are all snapshot-stack
patches. Two of the three came from competitor parity, and one of those two has a
documented rationale that does not work. Building the log makes all three either
unnecessary or trivial — which is the strongest evidence available that the borrowed
shape was the problem.

## The rule this should have been screened against

Before adding a history feature, ask: **does this exist because an immutable-root
store had no alternative?** If yes, we probably have one, and it is probably a path.

`stored()`, `status()`, `compared()`, `entityMap()` were all designed by asking what
the tree already knows at that position. History is the one subsystem that was
designed by asking what other libraries ship.
