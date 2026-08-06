# Cross-library, real implementations

**Status:** measurement, 14.0.0. Reproduce with
`node --expose-gc tools/bench-compare.mjs`.

Every arm implements the **same capability** using that library's own entity
API, not a simplified stand-in:

| arm | implementation |
| --- | --- |
| `signaltree` | `entityMap({ selectId })`, `timeTravel()` |
| `ngrx-signals` | `signalState` + `@ngrx/signals/entities` (`setAllEntities`, `updateEntity`) — the official entity API |
| `elf` | `createStore` + `withEntities`, and **`@ngneat/elf-state-history`** for undo |
| `raw-signals` | a hand-rolled `Map` of per-entity signals + an id list — what you write with no library |

One process per arm; timing is the median of 5 runs; memory is retained heap
after forced GC. History is enabled **only** for the undo/redo workload, so
each workload isolates one thing.

---

## Collection — build 10,000, 200 single-entity updates, read all

| arm | median | retained |
| --- | --- | --- |
| elf | **1.69 ms** | 0.92 MB |
| raw-signals | 4.17 ms | 6.16 MB |
| **signaltree** | 5.97 ms | 1.29 MB |
| ngrx-signals | 11.06 ms | 0.93 MB |

**SignalTree is third of four on raw collection throughput.** It beats
`@ngrx/signals` by 1.9×, loses to elf by 3.5× and to a hand-rolled map of
signals by 1.4×. That is the honest picture and it is not the story this
library should be sold on.

---

## Undo/redo — 50 recorded writes, then 50 undos, over 10,000 entities

| arm | median | retained | history |
| --- | --- | --- | --- |
| **signaltree** | **0.06 ms** | 1.28 MB | built-in `timeTravel()` |
| elf | 1.21 ms | 4.77 MB | built-in `elf-state-history` |
| ngrx-signals | 202.73 ms | 0.94 MB | hand-rolled |
| raw-signals | 280.27 ms | 6.16 MB | hand-rolled |

**This is the gain, and it is large.**

- **20× faster than elf's own history primitive**, and with **3.7× less retained
  memory** — 1.28 MB against 4.77 MB for the same 50 entries over the same 10k
  collection.
- **~3,400× faster than a hand-rolled snapshot history**, which is what
  `@ngrx/signals` users have to write because SignalStore ships no history
  primitive.

The reason is structural, not micro-optimisation. A SignalTree history entry is
the **snapshot reference** produced by the memoised `tree()` — O(1) to record,
and `===` to compare. Every other approach copies state per entry, which is
O(state). At 10,000 entities that is the difference between storing a pointer
and cloning ten thousand objects, fifty times.

It is also why the memory figure is the *low* one here while SignalTree is the
*high* one on per-entity cost: the same structural sharing that makes a snapshot
nearly free is what makes 50 history entries nearly free.

---

## Reading these honestly

**What this does not show.** `@ngrx/store`, `@ngxs/store` and Akita are absent —
they need an Angular JIT bootstrap to construct, and standing up a full Angular
environment per arm would be a bigger confound than the comparison is worth.

**The hand-rolled arms are not strawmen, but they are not optimal either.** They
use `structuredClone` per entry, which is the obvious implementation. A user who
knew to store inverse patches instead would land far closer to elf. The number
to quote against `@ngrx/signals` is therefore "what the absence of a primitive
costs a typical user", not "the best achievable".

**Testing elf without `elf-state-history` would have been a strawman**, and the
first run of this harness did exactly that — it reported elf at 177 ms, in the
same band as the hand-rolled arms, because it was hand-rolled. Installing the
package it actually ships moved it to 1.21 ms and cut SignalTree's lead from
~3,000× to 20×. The 20× is the number that means something.

**History was on for everyone in the first run**, including during the
collection workload, which charged signaltree and elf for recording while
ngrx-signals and raw-signals paid nothing — they have no primitive to enable.
Separating the workloads changed the collection ordering.

---

## What to claim

- ✅ **Undo/redo at scale.** 20× faster and 3.7× lighter than the nearest library
  with a real history primitive; three orders of magnitude faster than what a
  user without one has to write.
- ✅ **Snapshots are nearly free.** A held `tree()` of 10k entities costs 0.01 MB
  ([memory-profile.md](../architecture/memory-profile.md)).
- ❌ **Not raw collection throughput.** Third of four.
- ❌ **Not per-entity memory.** Highest of four
  ([memory-profile.md](../architecture/memory-profile.md)).
- ❌ **Not bundle size.** Recorded elsewhere and unchanged.
