# RFC 0012 — letting a marker decline HISTORY capture without declining SERIALISATION

**Status:** proposed, post-14.0.0-rc.1
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
