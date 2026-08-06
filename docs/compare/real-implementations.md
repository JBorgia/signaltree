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

> ⚠️ **An earlier revision of this file published the opposite result.** It
> claimed SignalTree was 20× faster than elf. It was not measuring undo/redo at
> all — see "The retraction" below. These numbers are the corrected ones, and
> they are verified by postconditions every arm must satisfy.

| arm | median | retained | history |
| --- | --- | --- | --- |
| **elf** | **1.27 ms** | 4.77 MB | built-in `elf-state-history` |
| signaltree | 190.11 ms | 5.18 MB | built-in `timeTravel()` |
| ngrx-signals | 196.63 ms | 0.94 MB | hand-rolled |
| raw-signals | 311.67 ms | 6.16 MB | hand-rolled |

**SignalTree loses undo/redo at this scale, by ~150× to elf**, and is level with
the hand-rolled `@ngrx/signals` implementation it was supposed to beat.

The reason is the same structural fact measured below: recording a history entry
materialises `tree()`, and for a collection that rebuilds the `all` array —
O(collection) per entry, not O(depth). Fifty entries over ten thousand rows is
half a million pointer copies before any undo happens, and each undo restores
via `setAll`, which is O(collection) again.

### The retraction

The first version of this harness measured SignalTree **doing nothing**:

```
SYNC (as the harness was written)   history=1    reverted=false     0.51 ms
AWAITED                             history=52   reverted=TRUE    215.12 ms
```

`timeTravel()` records on a notifier FLUSH, which is scheduled with
`queueMicrotask`. The workload was `async` but had no `await` between the writes
and the undos, so the flush never ran: SignalTree recorded **one** entry, called
`undo()` fifty times with nothing to undo, and restored nothing — while every
other arm performed fifty `structuredClone`s of ten thousand entities. Published,
that table showed SignalTree winning by orders of magnitude **on the strength of
being idle**.

The fix is not just an `await`. The workload now asserts its own postconditions,
for **every** arm:

- the writes actually landed (`value === 900_049`);
- the undos actually reverted it (`value !== afterWrites`);
- history held ≥ 50 entries **after the writes** — captured there, because
  stack-based arms drain their history as they undo while SignalTree keeps
  entries and moves a pointer, and checking afterwards failed three arms for a
  difference in semantics rather than for doing no work.

A benchmark that cannot detect it did nothing is the same defect class it exists
to expose. This is the fifth instance of that pattern in this repo, after
`grep "Failed tasks"` exiting 0, pre-publish passing on 5 of 7 packages,
typecheck reading only typing specs, and a property test passing while data was
dropped.

One further correction during the fix: yielding with `setTimeout(0)` added
~100 ms of pure timer granularity to every arm (100 yields × ~1 ms), which
swamped the differences. A microtask yield is enough to flush the notifier and
costs nothing.

### Structural sharing does not extend to collection contents

Measured on a 500-row collection, changing ONE entity:

```
unrelated branch shared : true      <- O(depth) holds here
rows node shared        : false
all ARRAY shared        : false
entity objects shared   : 499 / 500
```

So the accurate statement is **O(depth) for plain nested state, but
O(collection-length in pointers) per history entry for a collection**, with the
entity objects themselves shared. The comment in `time-travel.ts` claiming
"only the nodes that actually changed — O(depth) per entry" is true of nested
objects and false of collections, and the undo/redo column above is exactly
where that shows up.

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
package it actually ships moved it to 1.27 ms. Combined with fixing our own
idle arm, that is the difference between "SignalTree wins by 3,000×" and
"SignalTree loses by 150×" — from the same harness, two bugs apart.

**History was on for everyone in the first run**, including during the
collection workload, which charged signaltree and elf for recording while
ngrx-signals and raw-signals paid nothing — they have no primitive to enable.
Separating the workloads changed the collection ordering.

---

## What to claim

- ❌ **NOT undo/redo at scale.** ~150× slower than elf over a 10k collection, and
  level with a hand-rolled implementation. The earlier claim of a 20× win was an
  artefact of measuring an idle arm.
- ✅ **Snapshots are nearly free.** A held `tree()` of 10k entities costs 0.01 MB
  ([memory-profile.md](../architecture/memory-profile.md)).
- ❌ **Not raw collection throughput.** Second-to-third of four, run to run.
- ❌ **Not per-entity memory.** Highest of four
  ([memory-profile.md](../architecture/memory-profile.md)).
- ❌ **Not bundle size.** Recorded elsewhere and unchanged.
