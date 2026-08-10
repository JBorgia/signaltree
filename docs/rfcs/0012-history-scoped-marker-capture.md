# RFC 0012 — letting a marker decline HISTORY capture without declining SERIALISATION

**Status:** **IMPLEMENTED in 14.0.0** — corrected 2026-08-10. All three items of
§5 shipped, despite §5's own "Not for 14.0.0" line and despite an earlier version
of this status block that repeated it:

1. `history?: boolean` on `entityMap` config — shipped, `@default true`, in
   `packages/core/src/lib/types.ts`.
2. The dev diagnostic — shipped as **ST2029**, in an evolved form. §5 asked for an
   attach-time check on collection size; that was built and did not work, because
   an app attaches `timeTravel()` when it builds the tree and the rows arrive later
   from a fetch, so an attach-time check sees an empty collection every time. It is
   now a RECORD-time check judged on retention (`entries x width`) rather than row
   count, sampled every 16 entries.
3. The docs requirement — the `history?: boolean` JSDoc states that undo becomes
   partial for an excluded collection, in the terms §5 asked for.

The §6 measurements were **not** taken as a precondition. That is a real gap in
the record rather than a formality: the feature shipped on the strength of the
ST2029 retention model instead. If the three figures matter, they matter now, not
before a landing that already happened.

⚠️ **What did NOT ship is Option B's harder half** — a per-purpose snapshot, so a
marker could be captured for serialisation and skipped for history _within the same
tree_. `history: false` is all-or-nothing per marker: excluded from history AND
still serialised, which is the common case, but there is no way to have one
collection with its own scoped undo stack. §3 explains why that is hard, and it
constrains any proposal to give `entityMap` its own history — see
`docs/audits/2026-08/undo-business-and-ux-cases.md` §4b.
**Prompted by:** the fit review — the one architectural gap that survived the
14.0.0 audit with no workaround better than "call `pauseRecording()` yourself".

---

## 1. The problem, measured

`entityMap`'s snapshot hook is one line:

```ts
snapshot: (node) => ({ all: node.all() }),
```

`allSignal` is `computed(() => { version(); return Array.from(storage.values()); })`,
so it rebuilds an N-pointer array whenever the collection's version bumps.

Time travel records on every self-dirty flush by materialising the tree. So:

> **Attaching `timeTravel()` to a tree containing an `entityMap` makes every
> collection-mutating write O(collection width), permanently.**

The mitigating half is real and worth stating: a write to an _unrelated_ leaf
leaves `allSignal` clean, so the history entry shares the same array by
reference. The O(N) is paid only when the collection itself changes. Measured on
500 rows changing one entity — entity objects shared 499/500, `all` array not
shared. Over a 10k grid with 50 edits that is ~500k pointer copies.

This is not a bug. It is the direct price of 14.0.0's thesis: _a snapshot
carries values, not machinery_. A flat `E[]` is what makes the payload plain,
serialisable and restorable. elf undoes in 3 µs because its state **is** the
shared immutable structure and it never has to produce a flat array to record a
version. You can have a plain-JSON snapshot or an O(changed) history entry over
a collection. Not both.

## 2. What the user actually wants

A 10,000-row operational grid, streaming updates, that:

- **persists** — survives reload, participates in `serialization()` / `stored()`;
- **is not in the undo stack** — the user undoes their form edit, not the feed.

Today `transient: true` is the only opt-out and it opts out of **both**. So the
grid is either fully captured (and every write is O(N)) or fully absent from
every snapshot (and does not persist). There is no third answer.

`pauseRecording()` shipped in 14.0.0 and is the imperative version: correct, and
it puts the burden on every call site that writes the collection. The
declarative version belongs on the marker.

## 3. The complication that makes this an RFC rather than a patch

**Time travel, devtools and serialisation share one snapshot path.** All three
reach `snapshotState()` → `unwrap()` → `snapshotMarkerNode()`, and that function
memoises per node:

```ts
const SNAPSHOT_MEMO = new WeakMap<object, Signal<{ value: unknown }>>();
```

That memo is exactly what makes structural sharing work: a clean marker returns
the identical object across snapshots, so a history entry costs O(depth) rather
than O(state), and `computed(() => tree().rows)` does not churn.

A purpose-dependent snapshot therefore cannot simply branch inside
`snapshot()` — the memo would cache whichever purpose asked **first** and serve
it to the other. Keying the memo by purpose fixes correctness and costs the
thing the memo exists to provide: two cells per node, and the two purposes no
longer share the object, so a serialisation snapshot and a history entry stop
being reference-identical.

**This is the same shared-cell defect the release already fixed once** — two
builders (`unwrap` and the deleted `unwrapObjectSafely`) wrote to one memo cell,
and whichever entry point read a node first decided its snapshot permanently.
Reintroducing that shape deliberately would be a poor trade.

## 4. Options

### A. `historyTransient` on the marker processor, purpose-keyed memo

`MarkerProcessor` gains `historyTransient?: true`; `snapshotState` takes a
purpose; `SNAPSHOT_MEMO` becomes `WeakMap<object, Map<Purpose, Signal<…>>>`.

- ✅ Declarative, uniform across markers, no per-instance config.
- ❌ Doubles memo cells for every node on a tree that uses both. Loses
  cross-purpose reference sharing. Touches the hottest read path in the library.
- ❌ Per-marker-TYPE, not per-instance: it would exclude _every_ `entityMap`
  from history, which is wrong — a 20-row lookup table belongs in undo.

### B. Per-instance option, resolved at capture time — **recommended**

`entityMap({ …, history: false })` sets a flag on the materialised node. Time
travel does not change how it snapshots; it **prunes** history-excluded nodes
from the plain object it has already built.

```ts
// in TimeTravelManager.addEntry
const plain = snapshotState(this.tree.$);
const entry = pruneHistoryExcluded(plain, this.tree.$);
```

- ✅ **The memo is untouched.** One snapshot, one cell, sharing preserved. The
  O(N) `Array.from` still happens once per collection change for the
  serialisation path, but the history entry no longer _retains_ it.
- ✅ Per-instance, which is the right granularity.
- ✅ Restore is symmetric and free: a pruned key is simply absent from the entry,
  and `recursiveUpdate` already leaves absent keys alone.
- ❌ Pruning walks the built object once per recorded entry — O(nodes), not
  O(state), and only over the marker positions.
- ⚠️ **Undo becomes partial by design.** Undoing past a collection write will not
  revert the collection. That is the point, and it must be documented loudly,
  because "a partial restore is worse than a failed one" is a lesson this
  release already paid for (ST2024, the half-applying `tree({ rows: [] })`).

### C. Do nothing; document `pauseRecording()` as the answer

- ✅ Zero risk, ships today.
- ❌ Puts the burden on every write site, and the failure mode is invisible: an
  app that forgets simply gets slow, which is the ST2026 shape.

### D. Make the rebuild cheaper instead of avoiding it — **measured and rejected**

`allSignal` rebuilds with `Array.from(storage.values())`. It does not have to:
`updateOne` knows exactly which entity changed, so the previous array could be
patched instead. MEASURED, one index replaced:

| N      | rebuild | `prev.slice()` + patch |      |
| ------ | ------- | ---------------------- | ---- |
| 1,000  | 1.1 µs  | 0.3 µs                 | 3.4x |
| 10,000 | 10.5 µs | 2.2 µs                 | 4.7x |
| 50,000 | 88.3 µs | 30.3 µs                | 2.9x |

Real, and still rejected, for three reasons in increasing order of weight:

1. **It is a constant factor, not a complexity change.** `slice()` is still
   O(N). Option B takes the same cost to ZERO for a collection that opts out.
2. **The consumer it helps is the one we steer away from.** Reading `all()`
   after every single-entity update is the whole-collection-read anti-pattern;
   `byId()` is the granular path and ST2018 already points there.
3. **Its enabling machinery regresses something currently flat.** Patching needs
   an id→index map to find the slot. Appending keeps it O(1), but `removeOne`
   shifts every later index — O(N) to reindex. `removeOne` measures FLAT today
   (0.52 / 0.39 / 0.51 µs at 1k / 10k / 100k), so this trades an O(1) operation
   for a constant-factor win on a discouraged one.

Recorded because the option is genuinely attractive and the first two objections
are not decisive on their own — the third is. If option B is ever abandoned,
re-derive this rather than assuming it was rejected on the numbers alone.

## 5. Recommendation

**Option B**, with:

1. `history?: boolean` (default `true`) on `entityMap` config first — it is the
   marker where the cost is measurable.
2. A dev diagnostic — next free code — when a tree has `timeTravel()` attached
   and an `entityMap` above a size threshold with `history` left at its default.
   The trap is silent and permanent, exactly like ST2026.
3. Docs stating that undo will not revert an excluded collection, in the same
   place `undo-redo-vs-devtools.md` states the restore/rehydrate split.

**Not for 14.0.0.** The RC's snapshot format is frozen and this changes what a
history entry contains. It is additive at the type level but behavioural at the
undo level, which makes it a minor at the earliest.

## 6. What must be measured before it lands

- History entry retention with and without `history: false`, at 1k/10k/50k rows,
  under forced GC — the un-GC'd number is 8x high, per the memory-profile note.
- The pruning walk's cost per recorded entry, to confirm it is not just moving
  the O(N) rather than removing it.
- That the serialisation round-trip is byte-identical with the flag on, since
  the flag must not reach `serialize()`.
