# Spike — data models for a reactive state tree

- **Status:** OPEN
- **Started:** 2026-08-05
- **Relates to:** `2026-08-write-path-spike.md` (the write-path/notification spike)

## Why this exists

SignalTree's shape is: **only leaves are Angular signals; branches are plain
callable accessors.** That produces a specific and lopsided performance profile,
now measured rather than assumed:

| operation | vs `@ngrx/signals` | why |
| --------- | ------------------ | --- |
| update one deep field (path walked each time) | **~20x faster** | 15 property reads + 1 signal write, against 15 object allocations for an immutable rebuild |
| update through a HELD leaf reference | **~31x faster** | a capability SignalStore does not have at all — every write there goes through `patchState` at the root |
| read the WHOLE state | **~2.25x slower** | they hold a POJO and return it; we must walk the signal graph and materialise one |
| 1000 single-element updates in a 50k array | **~8x slower** (unreconciled, see below) | `equal: deepEqual` walks 50k elements on every leaf write |

The first two ARE the product: partial updates that skip the rebuild, **while
still supporting time travel**. The last two are the bill for it.

The question this spike answers: **is that bill inherent, or is it a consequence
of the data model we chose — and what do other data models buy?**

## Rules

Same as the write-path spike. Everything already written here is a CLAIM until
re-derived from source, spec, or a measurement. Several claims in this repo have
already been proven wrong, including two of my own benchmark numbers in the last
hour.

## Open measurements (do not cite until closed)

- **Unreconciled:** the demo reports 11.3 ms for SignalTree's large-array
  scenario; an independent harness measures ~385 ms for what reads as the same
  workload. Not batching (the demo's exact enhancer config measures 377.6 ms),
  not the recent `deepEqual` rewrite (385.2 ms before it, 387.4 ms after).
  `benchmark-constants.ts` declares `ARRAY_UPDATES` **twice** (1000 and 255),
  which is one candidate. Chrome-vs-Node is another.
- The non-`deep-nested` wins (batch-updates, computed-chains, selector-memo,
  concurrent-updates) came from a harness that had a hoisting bug in a different
  scenario. They are probably fine and have not been re-verified.

## Research tracks

| Track | Question | Status |
| ----- | -------- | ------ |
| D — Persistent/immutable structures | HAMT, RRB vectors, path copying, structural sharing: what each buys for read / update / snapshot / memory, measured in JS | RUNNING |
| E — What shipping libraries actually do | immer, Immutable.js, MobX, Valtio, Solid stores, Vue, Legend-State, Yjs: their state model and its read/write/snapshot profile | RUNNING |
| F — SignalTree's own profile | where OUR model wins and loses, quantified; what `entityMap` already does differently; what time travel costs under each option | RUNNING |

## Findings D — persistent structures

_pending_

## Findings E — shipping libraries

_pending_

## Findings F — SignalTree's measured profile

_pending_

## Synthesis

_pending_
