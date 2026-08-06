# Retained heap — the axis that actually constrains a low-end device

**Status:** measurement, 14.0.0. Reproduce with
`node --expose-gc tools/memory-report.mjs`.

Bundle size and retained heap are different constraints, and conflating them
leads to optimising the wrong one. **Bytes over the wire decide load time;
retained heap decides whether the page survives.** This project has extensive
bundle data and, until now, none on memory — which is awkward, because memory is
where the architecture should win and size is where it explicitly does not
compete.

---

## The numbers

Node 24.3 / V8 13.6, forced GC, one process per scenario.

| scenario | retained | per unit | collectable after release |
| --- | --- | --- | --- |
| `signalTree`, 20k scalar leaves | 11.81 MB | **619 B/leaf** | ✅ |
| plain object of 20k RAW Angular signals | 11.00 MB | **577 B/signal** | ✅ |
| plain object, 20k keys (floor) | 1.21 MB | 63 B/key | ✅ |
| `entityMap`, 1k entities | 0.31 MB | 330 B/entity | ✅ |
| `entityMap`, 10k entities | 2.85 MB | 299 B/entity | ✅ |
| `entityMap` 10k **+ a held `tree()` snapshot** | 2.86 MB | 300 B/entity | ✅ |

2,000 repeated `tree()` reads grew the heap by **0.039 MB**.

---

## What these say

**1. The tree structure is nearly free; the cost is Angular's signals.**
619 B/leaf against 577 B for a bare Angular signal holding the same value — the
whole accessor tree, the marker registry, the memo and the path plumbing add
**about 42 bytes per leaf, ~7%**. Anyone weighing "SignalTree vs raw signals" on
memory is choosing between 619 and 577; the differentiator is not the overhead,
because there barely is one.

The real number in that row is the other comparison: a signal costs ~9× a plain
object property (577 B vs 63 B). That is the price of reactivity itself and it
is Angular's, not ours — but it is the number that matters when someone asks
"can I put 20,000 reactive values on a phone".

**2. A snapshot of 10,000 entities costs 0.01 MB.**
`entityMap` 10k retains 2.85 MB; the same collection with a `tree()` snapshot
**held live** retains 2.86 MB. Structural sharing means the snapshot shares the
entity objects by reference rather than copying them — which is exactly the
property [`snapshot-aliasing.spec.ts`](../../packages/core/src/lib/snapshot-aliasing.spec.ts)
documents from the correctness side. Read whole state as often as you like; it
is not a memory event.

**3. Reading does not grow the heap.** 2,000 full `tree()` reads added 0.039 MB
— noise. The memo is keyed per node and invalidated by writes, so it grows with
the SHAPE of the tree, not with how often it is read. A memo that grew per read
would be a leak in any app that renders in a loop.

**4. Nothing leaks.** Every scenario is collectable once released, verified by
`WeakRef` rather than by a heap delta.

---

## Two methodology traps, both of which produced wrong answers here first

Recorded because both are silent and both invent a problem that does not exist.

**Heap deltas without forced GC measure ALLOCATION, not retention.** Already on
record at 8× (25.71 MB vs 3.32 MB) in
[materialisation-prior-art §3.2](./materialisation-prior-art.md). The tool now
refuses to run without `--expose-gc`.

**Scenarios sharing one process contaminate each other.** The first draft ran
them all in one and reported `entityMap 10k + a held snapshot` retaining LESS
than the same entityMap alone — strictly more data retaining less, which cannot
be true. It was the previous scenario's garbage plus V8's lazy reclamation. One
process per scenario, the same rule the benchmark harness already needed
(design-thesis §3, realisation 13).

**And a third, specific to leak checks:** a heap delta after release is not
evidence of a leak. V8 does not shrink `heapUsed` promptly, so the first version
of the "reclaimed" column reported every `entityMap` scenario as a 2.3 MB leak.
A `WeakRef` is the definitive test — but it is **not cleared within the same
synchronous turn**, however many times you call `gc()`. Without yielding to a
macrotask first, every scenario reports a leak, *including a plain object*, which
is how that bug announced itself.

---

## Cross-library — measured, and it does NOT favour us

`node --expose-gc tools/memory-compare.mjs`. Same 10,000 entity objects in each
library's idiomatic collection, one process per arm.

| arm | @10k | **marginal** | fixed |
| --- | --- | --- | --- |
| elf | 3.15 MB | **96 B/entity** | 2.23 MB |
| raw Angular signals | 6.59 MB | **89 B/entity** | 5.74 MB |
| `@ngrx/signals` | 6.68 MB | **91 B/entity** | 5.81 MB |
| **SignalTree `entityMap`** | 7.89 MB | **134 B/entity** | 6.61 MB |

**MARGINAL is the slope between 1k and 10k**, so every fixed cost — module load,
Angular init, the harness — cancels. It is the only column that answers "what
does one more row cost". The entity objects are ~89 B of it and no library
controls that part.

**SignalTree is the most expensive per entity of the four**: ~45 B/row over a
raw signal, ~43 B over `@ngrx/signals`. That is the id index and the entity
storage map, and it is the price of `byId()` being O(1) and per-entity writes
not touching the array. It buys something; it is not free; and the honest
statement is "granular reactivity costs ~50 % more per row than holding an
array", not "we use less memory".

### The number that actually matters for a large list

| SignalTree usage at 10k | per entity |
| --- | --- |
| entity objects alone (the floor) | 89 B |
| plain array leaf | 113 B |
| `entityMap`, collection read via `.all()` | 315 B |
| **`entityMap` after `byId()` on every row** | **4,149 B** |

Calling `byId()` for all 10,000 rows takes retained heap from 3.0 MB to
**39.6 MB** — 46× the data. `byId()` materialises a per-entity node so that row
can be bound and written independently, which is the whole point of the feature,
but the cost is per row and it is large.

**This is the memory guidance that matters on a phone:** use `byId()` for the
rows a user can actually interact with, not for every row you render. A 10,000
row list that calls `byId()` per row is the shape that will run a low-end device
out of memory, and nothing else in this document comes close to it.

## What is still NOT measured

- **`@ngrx/store`, `@ngxs/store` and Akita are absent.** They need an Angular JIT
  bootstrap to construct, and standing up a full Angular environment per arm
  would introduce a bigger confound than the comparison is worth. Their absence
  is not evidence either way.
- **No browser numbers.** Node/V8 only. A phone's constraint is the same shape
  but the absolute figures will differ.
- **No DOM.** This measures the store, not the rendering that consumes it.
