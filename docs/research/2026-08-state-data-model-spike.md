# Spike — data models for a reactive state tree

- **Status:** OPEN
- **Started:** 2026-08-05
- **Relates to:** `2026-08-write-path-spike.md` (the write-path/notification spike)

## Why this exists

SignalTree's shape is: **only leaves are Angular signals; branches are plain
callable accessors.** That produces a specific and lopsided performance profile,
now measured rather than assumed:

| operation                                     | vs `@ngrx/signals`                       | why                                                                                                     |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| update one deep field (path walked each time) | **~20x faster**                          | 15 property reads + 1 signal write, against 15 object allocations for an immutable rebuild              |
| update through a HELD leaf reference          | **~31x faster**                          | a capability SignalStore does not have at all — every write there goes through `patchState` at the root |
| read the WHOLE state                          | **~2.25x slower**                        | they hold a POJO and return it; we must walk the signal graph and materialise one                       |
| 1000 single-element updates in a 50k array    | **~8x slower** (unreconciled, see below) | `equal: deepEqual` walks 50k elements on every leaf write                                               |

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

| Track                                   | Question                                                                                                                        | Status  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D — Persistent/immutable structures     | HAMT, RRB vectors, path copying, structural sharing: what each buys for read / update / snapshot / memory, measured in JS       | RUNNING |
| E — What shipping libraries actually do | immer, Immutable.js, MobX, Valtio, Solid stores, Vue, Legend-State, Yjs: their state model and its read/write/snapshot profile  | CLOSED  |
| F — SignalTree's own profile            | where OUR model wins and loses, quantified; what `entityMap` already does differently; what time travel costs under each option | RUNNING |

## Findings D — persistent structures

**Method.** Node 24.3.0 (V8 13.6), darwin arm64, `--expose-gc
--max-old-space-size=8192`, some runs with `--allow-natives-syntax`. Every
number below is a median of 7 auto-calibrated trials; memory is
`heapUsed` delta across a double `global.gc()`. Libraries measured at
`immutable@5.1.9`, `immer@11.1.16`, `hamt@2.2.2`, `list@2.0.19`
(funkia/list, RRB), `@thi.ng/associative@7.1.45`. Scripts lived under
`tmp/trackD/` (gitignored, deleted). Everything is Node — **not re-run in
Chrome**, see the "could not establish" list.

Primary sources, verified bibliography:

- Bagwell, "Ideal Hash Trees", EPFL tech report, **2001** — infoscience.epfl.ch/record/64398
- Bagwell, "Fast And Space Efficient Trie Searches", EPFL, 2000 — record/64394
- Bagwell & Rompf, "RRB-Trees: Efficient Immutable Vectors", EPFL-REPORT-169879, 2011 — record/169879
- Stucki, Rompf, Ureche, Bagwell, "RRB Vector: A Practical General Purpose Immutable Sequence", ICFP 2015, 342–354, doi:10.1145/2784731.2784739
- Driscoll, Sarnak, Sleator, Tarjan, "Making Data Structures Persistent", JCSS 38(1):86–124, 1989, doi:10.1016/0022-0000(89)90034-2
- Merkle, "A Digital Signature Based on a Conventional Encryption Function", CRYPTO '87, LNCS 293, 369–378, doi:10.1007/3-540-48184-2_32

Library internals read as source, not documentation:
`node_modules/immutable/dist/immutable.js` (`SHIFT = 5`, `SIZE = 32`,
`MAX_ARRAY_MAP_SIZE = 8`, `MAX_BITMAP_INDEXED_SIZE = 16`,
`MIN_HASH_ARRAY_MAP_SIZE = 8`, `List._tail`); `node_modules/hamt/hamt.js`
(`SIZE = 5`, `BUCKET_SIZE = 32`, `MAX_INDEX_NODE = 16`,
`MIN_ARRAY_NODE = 8`, `popcount(bitmap & bit-1)`);
`node_modules/list/dist/index.js` (`branchingFactor = 32`,
`branchBits = 5`, `prefix`/`suffix` affixes capped at 32);
`node_modules/immer/dist/immer.mjs` (`prepareCopy` → `shallowCopy` →
`markChanged` walks to the parent).

### Headline table — 50,000-element collection, one element changed

| structure                                   | random get | persistent update@idx              | whole-state read (→ POJO)   | "what changed"                                            | mem / retained version |
| ------------------------------------------- | ---------- | ---------------------------------- | --------------------------- | --------------------------------------------------------- | ---------------------- |
| plain array + `slice()` (immer)             | **4.1 ns** | 32.3 µs (37.7 µs w/ record spread) | **0.3 ns** (return the ref) | 87 µs deepEqual · 232 µs ref-walk · 18 µs inline ref scan | **400 KB**             |
| 2-level chunked, C = 224                    | 6.4 ns     | **0.11 µs**                        | 52 µs (`[].concat(...)`)    | **2.1 µs**                                                | 4.1 KB                 |
| 32-way vector trie (hand-rolled)            | —          | —                                  | —                           | **0.26 µs**                                               | —                      |
| `immutable.List` (32-way trie + tail)       | 13.4 ns    | **0.097 µs**                       | 967 µs `toArray()`          | **0.15 µs** (internal-node walk)                          | **2.0 KB**             |
| `list` (funkia, RRB)                        | 9.5 ns     | 0.174 µs                           | 184 µs `toArray()`          | —                                                         | 1.6 KB                 |
| `hamt` (HAMT, int keys)                     | 34.1 ns    | 0.178 µs                           | —                           | —                                                         | —                      |
| journal of inverse deltas (mutate in place) | 4.1 ns     | ~0.08 µs                           | **0.3 ns**                  | free (you logged it)                                      | **0.5 KB**             |

Same shape, 1000 retained versions of a 50k collection, measured retained
heap: plain `slice()` **381.6 MB** · immer **381.7 MB** · chunked C=224
**3.94 MB** · `immutable.List` **1.94 MB** · journal **0.49 MB**.
That is a **197x** memory difference between immer and `immutable.List`
for identical logical content, and it is entirely a fanout effect.

---

### 1. HAMT — the branching factor is a lie on string keys

Source says 32 (`SHIFT = 5` in immutable.js; `SIZE = 5`,
`BUCKET_SIZE = 32` in `hamt`), with popcount-compacted sparse nodes
exactly as Bagwell 2001 describes. Measured shape of a fully built
`immutable.Map` is different:

| N (string keys `key_0…`)    | node types                                     | **measured avg branch fanout** | **measured max depth** | log₃₂ N |
| --------------------------- | ---------------------------------------------- | ------------------------------ | ---------------------- | ------- |
| 1,000                       | 16 HashArrayMap, 258 BitmapIndexed, 1000 Value | **4.65**                       | 3                      | 2       |
| 100,000                     | 835 / 30,265 / 100,000                         | **4.22**                       | 5                      | 4       |
| 1,000,000                   | 17,948 / 341,084 / 1,000,000                   | **3.79**                       | **6**                  | 4       |
| 1,000,000, **integer** keys | 33,825 HashArrayMap, 0 BitmapIndexed           | **30.56**                      | **4**                  | 4       |

At 1M string keys the fanout histogram is dominated by 2-child nodes
(202,324 of 359,032 branch nodes). Proximate cause: immutable.js hashes
strings with the JVM recurrence `hashed = (31*hashed + charCodeAt(i))|0`
then `smi()`; for common-prefix keys the _high_ bits stay correlated —
the level-5 hash fragment occupies only **13 of 32** possible values with
a max slot load of 150,000 against an ideal of 31,250. Marginal
distribution at levels 0–4 is fine; the joint distribution is not.
Integer keys hash to themselves and the trie behaves as designed.

Get/set, medians:

| N         | `immutable.Map` get | `hamt` get | plain obj get | `Map` get | `immutable.Map` set | `hamt` set | `{...obj}` copy | `new Map(m)` copy |
| --------- | ------------------- | ---------- | ------------- | --------- | ------------------- | ---------- | --------------- | ----------------- |
| 1,000     | 32.7 ns             | 26.5 ns    | **9.3 ns**    | 10.4 ns   | 141 ns              | **111 ns** | 138 µs          | 25.3 µs           |
| 100,000   | 76.6 ns             | 59.7 ns    | **12.0 ns**   | 15.4 ns   | 317 ns              | **231 ns** | 33.8 ms         | 6.1 ms            |
| 1,000,000 | 154.5 ns            | 101.9 ns   | **10.4 ns**   | 14.4 ns   | 365 ns              | **288 ns** | 490 ms          | 127 ms            |

So a HAMT get is **10–15x slower than a plain property read** and that
gap _grows_ with N (it should be ~flat; it isn't, because depth grows).
The HAMT wins on the persistent-set column by 3–4 orders of magnitude at
100k+, and that is the entire case for it.

**Structural sharing survival** (whole object graph walked by identity,
`|reachable(v1) ∩ reachable(v2)| / |reachable(v2)|`), one `set`:

| structure                 | v2 nodes | shared  | **freshly allocated** |
| ------------------------- | -------- | ------- | --------------------- |
| `immutable.Map` N=1,000   | 2,550    | 99.647% | **9**                 |
| `immutable.Map` N=100,000 | 262,202  | 99.996% | **11**                |
| `hamt` N=1,000            | 1,549    | 99.484% | **8**                 |
| `hamt` N=100,000          | 162,201  | 99.994% | **10**                |

Memory: `immutable.Map` **155 B/entry** at both 1k and 100k; `hamt`
**108.8 B/entry**; plain object 42–63 B/entry; `Map` 32–37 B/entry.
A HAMT costs roughly **4x the memory of a `Map`** for the same data.

`@thi.ng/associative` does **not** contain a HAMT. Its `HashMap` is a
mutable open-bucket hash map (`_bins`, `_mask`, `_load`, `ceilPow2`
resize) with no persistence and no structural sharing. The premise in the
question is wrong.

### 2. RRB / persistent vectors vs HAMT for array-shaped state

`immutable.List` is a 32-way radix trie with a **32-element tail buffer**
(`List._tail`, `tailOffset`). `list` (funkia) is a genuine RRB tree:
`branchingFactor = 32`, plus **prefix and suffix affixes capped at 32**,
and relaxed nodes carrying size tables — verified by construction: a
plain `from()` produces 0 nodes with `.sizes`, `concat` of two 1000-lists
produces **2** relaxed nodes, `slice`+`concat` (the splice path) produces
**4**.

Per-operation, medians (ns unless marked):

| op                 | N         | plain array      | `immutable.List` | `list` (RRB) | `hamt` |
| ------------------ | --------- | ---------------- | ---------------- | ------------ | ------ |
| get                | 1,000     | **0.64**         | 7.6              | 5.1          | 10.4   |
| get                | 50,000    | **4.1**          | 13.4             | 9.5          | 34.1   |
| get                | 1,000,000 | **4.6**          | 21.4             | 15.6         | 34.0   |
| set@idx            | 1,000     | 268              | **50**           | 105          | 86     |
| set@idx            | 50,000    | 32,309           | **97**           | 174          | 178    |
| set@idx            | 1,000,000 | 531,676          | **127**          | 327          | 205    |
| append             | 50,000    | 132,306          | 77               | **37**       | —      |
| append             | 1,000,000 | 2.64 ms          | 135              | **54**       | —      |
| prepend            | 50,000    | 414,171          | 334              | **14**       | —      |
| prepend            | 1,000,000 | 10.05 ms         | 141              | **14.6**     | —      |
| splice −1 @mid     | 50,000    | **46,476**       | 1,401,000        | 1,358        | —      |
| splice −1 @mid     | 1,000,000 | 805,824          | 31,667,000       | **1,499**    | —      |
| full iterate (sum) | 50,000    | **20,978**       | 1,412,000        | 286,169      | —      |
| full iterate (sum) | 1,000,000 | **690,906**      | 24,890,000       | 4,559,000    | —      |
| → plain array      | 50,000    | 38,106 (`slice`) | 1,151,000        | **350,998**  | —      |

**What RRB buys over a plain radix trie is exactly two things, and they
are large:** prepend is **O(1) at any size** (14.6 ns at 1M vs 141 ns for
`immutable.List` and **10 ms** for `[x, ...a]`), and **splice is
O(log n)** — 1.5 µs at 1M against `immutable.List`'s **31.7 ms** (a
21,000x gap) and the plain array's 806 µs. `immutable.List.splice` is
implemented as a full rebuild, so it is _worse than a plain array_ at
every size measured.

**What it costs is iteration.** A `immutable.List` full scan is **28
ns/element** vs a plain array's **0.42 ns/element** — **67x**. RRB is
better but still **13.6x**. Any read path that touches every element
pays this, every time.

Memory per element: plain array 6.4 B/slot, `immutable.List` 14.5 B,
`list` 15.0 B — the trie roughly **doubles** the per-element cost of the
spine.

### 3. Path copying vs fat nodes vs node copying (Driscoll et al. 1989)

The paper names three techniques with these bounds (verified against the
JCSS reprint): **fat node** — O(1) space per update, **O(log m)** time
per access _and_ update, via a per-field binary search _tree_ keyed on
version stamp (not literally a sorted-array binary search); **node
copying** — amortized O(1) time and space per update, worst-case O(1)
per access, requires constant bounded in-degree; **node splitting** —
same bounds, for full (not just partial) persistence.

**What the libraries actually implement: path copying, both of them, and
nothing else.**

- **immer** — verified in `immer.mjs`: `prepareCopy(state)` calls
  `shallowCopy(base)` (`Array.prototype.slice` for arrays, `new Map` /
  `new Set`, otherwise `{...base}` or `Object.create(proto, descriptors)`
  in strict mode), and `markChanged(state)` recurses to `state.parent_`.
  That is path copying over the **user's own schema**, so the fanout is
  whatever the user's objects and arrays happen to be — **unbounded**.
- **immutable.js** — path copying too, but over **bounded-fanout tries**
  (HAMT for `Map`, 32-way radix trie + tail for `List`), so the copied
  spine is O(log₃₂ n) nodes of ≤32 slots instead of O(schema depth) nodes
  of arbitrary width.
- Neither implements fat nodes or node copying. I found no JS library
  that does.

Measured, on a 5-deep / fanout-4 store (1024 leaves), 1000 versions:

| technique                             | update     | read leaf (current) | read leaf at old version | **snapshot**                 | **restore**                               | mem/version   |
| ------------------------------------- | ---------- | ------------------- | ------------------------ | ---------------------------- | ----------------------------------------- | ------------- |
| hand path copy (spread spine)         | 329 ns     | 50.0 ns             | (hold the root)          | **O(1), free**               | **3.9 ns** (deref a held pointer)         | 341 B         |
| immer `produce`                       | 1,311 ns   | 50.0 ns             | —                        | O(1), free                   | 3.9 ns                                    | 413 B         |
| `immutable.js` `setIn`                | 490 ns     | —                   | —                        | O(1), free                   | 3.9 ns                                    | 2,473 B       |
| **fat node** (append version to slot) | **50 ns**  | 22.3 ns             | **28.1 ns** (bsearch)    | **4.96 ns** (bump a counter) | **4.96 ns**                               | 388 B         |
| **journal of inverse deltas**         | 79 ns      | 36.3 ns             | n/a                      | O(1)                         | **63 ns single step, 83 µs to jump 1000** | **130 B**     |
| `structuredClone` per version         | 419,610 ns | —                   | —                        | —                            | —                                         | **101,016 B** |

Time travel specifically:

- **Path copying gives O(1) snapshot _and_ O(1) restore** — a version _is_
  a pointer. That is the strongest single result here: 3.9 ns to restore
  any of 1000 versions, and all versions are simultaneously addressable
  and immutable. It pays O(depth) allocations per write.
- **Fat nodes give the cheapest write** (50 ns, 6.6x cheaper than a spread
  spine) and O(1) version stamping, but there is **no root pointer** —
  you cannot hand version _k_ to code that walks the tree without
  threading _k_ through every read, and materialising a whole state at
  version _k_ is O(size · log m). They win point queries and lose
  snapshots-as-values.
- **Journals are the cheapest memory** (130 B/version here, 508 B/version
  on the 50k-collection shape — **750x** less than immer) and the
  cheapest single-step undo (63 ns), but restoration is **O(k) in the
  distance travelled** (83 µs to walk 1000 versions and back) and only
  one version exists at a time. This is what SignalTree does.
- **`structuredClone` per version is 101 KB/version and 420 µs/write** on
  a 1024-leaf store. It is not a strategy, it is a control.

### 4. Copy-on-write over plain objects (immer) — sharing by node count is a vanity metric

Object-graph identity intersection after a single-field update:

| shape                                   | v2 nodes | shared      | fresh  |
| --------------------------------------- | -------- | ----------- | ------ |
| immer, 15-deep fanout-2 (32,768 leaves) | 65,535   | **99.976%** | **16** |
| immer, `{rows: 50k records}`            | 50,002   | **99.994%** | **3**  |
| immer, 15-deep spine → 50k rows         | 50,032   | **99.964%** | **18** |
| `immutable.js` Map→List→Map, 50k        | 303,235  | **99.994%** | 17     |
| plain `slice()` + record spread, 50k    | 50,001   | **99.996%** | 2      |

Every structure shares >99.6% of _objects_. The number is useless.
In **bytes**, on the 15-deep / 50k-wide shape:

- total retained by one version: **392.4 KB**
- the 50k outer array alone: **390.9 KB**
- all 16 fresh spine objects: **1,416 B**

So a single-field update allocates **392.4 KB fresh, of which 99.6% is
one array node**, and the fifteen levels of depth cost **0.4%**. Measured
delta-retained-bytes for v2 given v1 held: plain `slice()`+spread
**391.0 KB**, immer on `{rows:[50k]}` **397.2 KB**, 15-deep spine + immer
**404.6 KB**, chunked C=224 **4.6 KB**, `list` update **15.0 KB**.
(`immutable.List.set` and `immutable.Map.set` measured at −7.9 KB and
−19.7 KB — i.e. below this method's noise floor of roughly ±20 KB; the
1000-version aggregates above are the trustworthy version of that
number.)

**Depth is free. Width is the entire bill.** immer's cost is not
"immutability", it is that a plain array of 50,000 records is a single
node with 50,000 slots.

### 5. Chunked / paged arrays

Splitting a 50k collection into fixed-size chunks makes a persistent
single-element update cost O(C + N/C) — copy one chunk, copy the chunk
index — minimised at C = √N. It tracks the model almost exactly:

| C                 | chunks  | C + N/C | measured update |
| ----------------- | ------- | ------- | --------------- |
| 8                 | 6250    | 6258    | 882 ns          |
| 16                | 3125    | 3141    | 601 ns          |
| 32                | 1563    | 1595    | 804 ns          |
| 64                | 782     | 846     | 235 ns          |
| 128               | 391     | 519     | 114 ns          |
| **192**           | **261** | **453** | **104 ns**      |
| **224 (=√50000)** | **224** | **448** | **110 ns**      |
| **256**           | **196** | **452** | **106 ns**      |
| 512               | 98      | 610     | 152 ns          |
| 1024              | 49      | 1073    | 308 ns          |
| plain array       | 1       | 50000   | **37,722 ns**   |

**343x faster than a plain `slice()`+spread**, at C = 192–256. The
optimum is flat across 128–320, so exact tuning does not matter; being
within 2x of √N does.

What it costs:

- **iteration: 1.16–1.34x**, and that is all. Nested `for` over chunks:
  37.6 µs at C=224 vs 28.0 µs plain — and _larger_ chunks are cheaper
  (32.4 µs at C=16384), so the penalty is per-chunk loop setup, not
  cache behaviour.
- **random get: 4.5 ns → 6.4 ns** (1.4x). Power-of-two C lets you use
  shift/mask (4.9 ns at C=32) instead of div/mod (6.4 ns at C=224).
- **flatten to a POJO: 52 µs** via `[].concat(...ch)` vs 38 µs for
  `slice()` (1.4x). Note `Array.prototype.flat()` is **7.7x slower than
  `concat`** (380 µs vs 49 µs) at every chunk size measured — do not use
  `flat()`.
- memory: 4.1 KB/retained version at C=224 vs 400 KB for plain, and the
  structure itself is 403 KB vs 391 KB (3% overhead). C=32 is worse
  (13.1 KB/version) because the 1563-entry chunk index dominates.

**Who does this.** Verified in source: `immutable.List` keeps a
**32-element tail buffer** (`_tail`) so appends do not touch the trie;
`list` (funkia) keeps **prefix and suffix affixes capped at 32**
(`suffixSize < 32`), which is why its prepend is O(1). Both are the
tail-chunk idea from Clojure's `PersistentVector` / Bagwell & Rompf 2011.
A 2-level chunked array is just a fixed-depth-2 version of the same
trie. I found **no JS state-management library that chunks a user's
collection** — the technique exists only inside the vector libraries.

### 6. Reference-equality change detection — the win is fanout, not sharing

This is the answer to the question that matters, and the naive version of
it is **wrong**. Structural sharing alone does not make "what changed"
cheap. Localising a change is O(fanout of every node on the path), and a
plain 50k array is one node with fanout 50,000.

50k records, one field changed, all versions structurally shared:

| strategy                                               | cost        | what it returns               |
| ------------------------------------------------------ | ----------- | ----------------------------- |
| root pointer compare `a === b`                         | **3.9 ns**  | a boolean, no location        |
| `deepEqual(base, next)`, shared refs                   | 87–94 µs    | boolean                       |
| `deepEqual(base, structuredClone)`                     | **1.84 ms** | boolean                       |
| generic recursive ref-walk over the plain array        | **232 µs**  | the path `["rows",25000,"v"]` |
| hand-inlined `a[i] !== b[i]` scan over the plain array | **18 µs**   | the index                     |
| **ref-walk over chunked C=224**                        | **2.1 µs**  | `[111,136,"v"]`               |
| **ref-walk over a 32-way trie (hand-rolled)**          | **0.26 µs** | index 25000                   |
| **ref-walk over `immutable.List` internal nodes**      | **0.15 µs** | the changed slot              |

The generic ref-walk on a plain array is **2.7x slower than the deep
comparison it was supposed to replace.** Sharing bought nothing, because
the array node changed and you must scan all 50,000 slots to find out
where; the per-slot recursion overhead (4.6 ns) is worse than
`deepEqual`'s inlined loop (1.7 ns). Bounded fanout is what buys the win,
and it buys a lot:

| N (one element changed) | plain ref-walk | plain deepEqual | 32-way trie walk | `immutable.List` internal walk |
| ----------------------- | -------------- | --------------- | ---------------- | ------------------------------ |
| 1,000                   | 4.4 µs         | 1.7 µs          | **0.16 µs**      | **0.095 µs**                   |
| 50,000                  | 235 µs         | 104 µs          | **0.32 µs**      | **0.156 µs**                   |
| 1,000,000               | 4.76 ms        | 1.71 ms         | **0.41 µs**      | **0.187 µs**                   |

**The trie walk is flat in N** — 95 ns → 187 ns across three orders of
magnitude, which is the O(depth) claim, measured. At 1M it is **9,100x**
faster than the deep comparison.

As k changed elements grow (50k collection), the trie stays ahead on
_enumeration_: k=1 → 318 ns, k=10 → 1.75 µs, k=100 → 9.6 µs, k=1000 →
38 µs, k=10000 → 82 µs, against a plain ref-walk's flat 232–699 µs.
`deepEqual` gets _cheaper_ as k grows (42 ns at k=1000) only because it
short-circuits on the first difference — it answers a different question
and cannot enumerate.

Applied to SignalTree's leaf-equality problem — projected cost of the
**equality term alone** for 1000 writes to a 50k-element leaf:

| leaf `equal()`                  | per write | × 1000 writes |
| ------------------------------- | --------- | ------------- |
| `deepEqual` over the whole leaf | 90.6 µs   | **90.6 ms**   |
| inline ref scan over 50k slots  | 18.4 µs   | 18.4 ms       |
| `deepEqual` over one 224-chunk  | 516 ns    | **0.52 ms**   |
| ref scan over one 224-chunk     | 96.8 ns   | **0.10 ms**   |
| `===` only                      | 3.9 ns    | **0.004 ms**  |

### 7. Merkle-style content hashing of subtree identity

Implemented FNV-1a over the tree with a `WeakMap` memo keyed on node
identity (the only way to make it incremental in JS):

| operation                                 | 50k plain array | 50k as a 32-way trie |
| ----------------------------------------- | --------------- | -------------------- |
| hash from scratch                         | **4.02 ms**     | 4.21 ms              |
| re-hash after 1 change, children memoised | **762 µs**      | **2.2 µs**           |
| compare two hashes                        | 4.2 ns          | 4.2 ns               |
| whole-tree hash, all nodes cached         | 375 ns          | —                    |

Same fanout lesson: re-hashing after one change costs 762 µs on a plain
array because the changed array node still has to re-mix 50,000 child
hashes, versus 2.2 µs on a trie. **Maintaining a Merkle hash is strictly
more expensive than maintaining reference identity, and buys nothing you
did not already have** — structural sharing already gives you O(1)
"unchanged?" for free at 3.9 ns, with no maintenance and no collisions.

The one thing it buys that pointers cannot: comparing trees from
_different allocation lineages_. `deepEqual(a, structuredClone(a))` costs
**2.53 ms**; comparing two cached hashes costs **11.4 ns** (222,000x).
But cold-hashing both sides costs **8.11 ms** — 3.2x worse than just
deep-comparing. So it only pays if the hashes are already maintained,
which only makes sense if the trees arrive from elsewhere (network, disk,
another process).

Collision surface: a 32-bit content hash over 1e6 distinct records
produced **131 collisions**, against a birthday expectation of ~116. A
32-bit hash behaves exactly like a random function and is **not usable as
proof of equality** at this scale. You need ≥64 bits, which in JS means
two words or a string, and the mixing cost roughly doubles.

Who does this in JS state management: **nobody I could find**. Verified
absent from immer and immutable.js by source. Content-hash-addressed
state exists (git; Merkle-DAG systems; Automerge's hash-linked change
DAG) but as a _sync/identity_ mechanism across processes, not as a
change-detection mechanism inside a store — which is exactly what the
lineage result above predicts.

### 8. V8 realities — several of these dominate the data-structure choice

**Element kinds** (`%HasSmiElements` etc., 50k arrays):

| kind                      | random get  | `slice()`    | full iterate | bytes/slot |
| ------------------------- | ----------- | ------------ | ------------ | ---------- |
| PACKED_SMI                | **0.68 ns** | 41.8 µs      | 17.3 µs      | **7.80**   |
| PACKED_DOUBLE             | 1.89 ns     | 38.5 µs      | 28.4 µs      | 8.01       |
| PACKED_ELEMENTS (objects) | 2.07 ns     | 40.9 µs      | 69.9 µs      | 8.01       |
| HOLEY_SMI                 | 2.20 ns     | 40.6 µs      | 41.3 µs      | 8.01       |
| **DICTIONARY**            | **14.2 ns** | **126.5 ms** | **118.9 ms** | **800.01** |

Dictionary-mode arrays are **3,100x slower to copy** and **100x the
memory per slot**. One `arr[100 * len] = x` does it. Everything else is
benign: `slice()`, `[...a]`, `concat`, `Array.from`, and `map` all
**preserve** PACKED_SMI (verified with natives), so copy-on-write over
arrays does not degrade the element kind. Holey costs 3.2x on get and
2.4x on iterate versus packed — `new Array(n)` without filling is the
common way to get there.

**Inline caches.** Property read at a site seeing k object shapes,
self-timed (measurement loop inside the generated function, so no shared
harness call site):

| shapes at the site | 1    | 2    | 3    | **4**    | **5**    | 6    | 8    | 16   | 64   |
| ------------------ | ---- | ---- | ---- | -------- | -------- | ---- | ---- | ---- | ---- |
| ns/read            | 0.79 | 0.80 | 0.83 | **0.94** | **2.57** | 2.56 | 2.58 | 2.58 | 2.57 |

The cliff is **exactly at 4 → 5 shapes** (V8's polymorphic IC limit), the
penalty is **3.3x**, and it then plateaus — megamorphic reads are not
catastrophic.

**Object spread is a different story.** Same experiment for `{...o}` on
8-property objects:

| shapes at the site | 1        | 2    | 4    | 8        | 16   | 64    |
| ------------------ | -------- | ---- | ---- | -------- | ---- | ----- |
| `{...o}` ns        | **12.0** | 13.3 | 14.0 | **77.6** | 86.3 | 102.5 |
| `Object.assign` ns | 59.2     | 64.7 | 65.9 | 97.6     | 73.2 | 97.7  |

**6.5x**, because `CloneObjectIC` has no megamorphic fast path. This is
load-bearing: a _generic_ path-copy helper (`setIn(obj, path, v)` with a
single `{...o, [k]: v}` site handling every node shape in the store) is
inherently polymorphic. Measured directly on a 5-deep spine: a
specialised inlined spread chain costs **40.4 ns**, the generic recursive
`setIn` costs **61.9 ns** — **1.53x**, and that is with only 6 shapes in
play. immer's `produce` on the same 5-deep store costs **1,311 ns**
against 329 ns hand-rolled (**4x**), which is proxy overhead on top of
this.

**Dictionary-mode objects.** Spread cost per property:

| props | fast-mode ns/prop | dictionary-mode ns/prop | ratio |
| ----- | ----------------- | ----------------------- | ----- |
| 4     | 9.4               | 76.0                    | 8.1x  |
| 8     | 8.3               | 69.3                    | 8.4x  |
| 16    | 8.6               | 69.8                    | 8.1x  |
| 32    | 9.7               | 78.9                    | 8.1x  |
| 128   | 17.4              | 89.2                    | 5.1x  |

A single `delete o.k` on a store node makes every subsequent copy of that
node **~8x more expensive, permanently**.

**`Object.create(null)` is always dictionary mode** — `%HasFastProperties`
returns `false` even for an empty one, and it never recovers:

|                             | `{}` / `{a,b,c,d}` | `Object.create(null)` (+4 keys) |
| --------------------------- | ------------------ | ------------------------------- |
| read `.c`                   | **0.28 ns**        | **2.80 ns** (9.9x)              |
| `{...o}`                    | **8.77 ns**        | **292.7 ns** (33.4x)            |
| create                      | 5.3 ns / 4.5 ns    | 10.3 ns / 58.8 ns               |
| retained bytes (empty / +4) | 64.8 / 64.1 B      | **192.6 / 288.7 B** (3–4.5x)    |

Using `Object.create(null)` for store nodes to avoid prototype pollution
costs **33x on the copy path**. Also note `{...nullProtoObj}` returns an
object with `Object.prototype` — the spread does not preserve the null
prototype.

**Map vs object.** Crossover depends entirely on the operation, not on N:

|                            | N=8         | N=64        | N=1,000     | N=100,000   |
| -------------------------- | ----------- | ----------- | ----------- | ----------- |
| `obj[strKey]`              | **7.3 ns**  | **9.1 ns**  | **9.2 ns**  | **10.3 ns** |
| `Map.get(strKey)`          | 11.3        | 9.2         | 9.9         | 12.6        |
| `obj[intKey]`              | **3.7**     | **4.1**     | **3.7**     | **3.7**     |
| `Map.get(int)`             | 5.1         | 6.1         | 6.0         | 5.9         |
| full copy `{...o}`         | **12.4 ns** | 5.20 µs     | 129 µs      | 26.0 ms     |
| full copy `new Map(m)`     | 185 ns      | **1.37 µs** | **24.6 µs** | **5.0 ms**  |
| iterate `Object.keys`+read | 47 ns       | 800 ns      | 17.0 µs     | 9.00 ms     |
| iterate `map.forEach`      | **41 ns**   | **289 ns**  | **4.3 µs**  | **0.56 ms** |
| build from scratch         | **58 ns**   | 825 ns      | 75.0 µs     | 4.84 ms     |
| build into a `Map`         | 92 ns       | **783 ns**  | **12.6 µs** | **4.04 ms** |

**Objects always win single-key reads** (1.3–1.6x, at every size).
**`Map` always wins bulk copy, bulk iteration, and bulk build**, and the
margin grows: at 1,000 keys `new Map(m)` is **5.3x** faster than
`{...o}` and `forEach` is **4.0x** faster than `Object.keys`; at 100,000
it is 5.2x and 16x. The crossover for copy sits between N=8 and N=64.
For a store node that is read constantly and copied rarely, use an
object; for a keyed _collection_ that is copied or scanned wholesale, use
a `Map`.

---

### Direct answer: which pairs are compatible, which are in tension

The four goals: **(a)** fast partial updates, **(b)** fast whole-state
reads, **(c)** cheap time travel, **(d)** cheap "what changed".

**Compatible, same mechanism — (a) + (c) + (d) are one property, not
three.** Path copying over **bounded fanout** gives all three at once,
and the evidence is that they are literally the same pointer discipline:
`immutable.List` at 50k does update in **97 ns**, retains **2.0 KB per
version**, restores any version in **3.9 ns** (deref a held root), and
localises a change in **152 ns flat in N**. Nothing was traded between
them. The single design parameter producing all three is that no node has
more than 32 children.

**In tension: (b) against everything else — and it is a hard tension, not
a constant factor.** "Fast whole-state read" in the O(1) sense means
_returning a reference to a plain JS value_, and a plain JS value's array
node **is** the whole collection. So:

- If the whole state is a POJO, reading it is **0.3 ns** and updating one
  element of a 50k array is **32.3 µs** and **400 KB** (immer).
- If the collection is a trie, updating is **97 ns** and **2.0 KB**, and
  materialising a POJO is **967 µs** (`toArray`) or **4.7 ms**
  (`toJS` on nested Maps) — a **3-million-x** swing on the read.

These are the same fact viewed twice. **(a) and (b) are provably in
tension** for wide collections: you cannot both (i) hand out a reference
to a plain array in O(1) and (ii) avoid copying that array's 50,000
slots on write, because the reference _is_ the array. Likewise **(b) and
(c)**: an O(1) addressable snapshot of a POJO state requires the POJO to
be immutable, which forces the O(width) write.

**The tension is resolvable in constants, not asymptotics, and the
resolution is chunking.** A 2-level chunked collection at C ≈ √N sits
between the two regimes: update **110 ns** (343x better than plain),
memory **4.1 KB/version** (98x better), what-changed **2.1 µs** (43x
better than `deepEqual`), and whole-state materialisation **52 µs** — 1.4x
worse than `slice()` but _not_ O(1). That last number is the entire
price: you give up "return the reference" and accept "rebuild the array",
which for a 50k collection is 52 µs.

Restated as a rule the synthesis can use:

| you want                                                   | you must accept                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| whole-state read as a returned reference (0.3 ns)          | O(width) writes and O(width) memory per version — immer's profile                                      |
| O(log n) writes, O(1) snapshots, O(depth) diffs            | whole-state reads become O(n) materialisation (52 µs chunked, 967 µs trie) and iteration slows 1.2–67x |
| cheapest memory per version (0.5 KB) and cheapest write    | journals: only one version exists at a time, restore is O(distance)                                    |
| cheapest write **and** simultaneously-addressable versions | fat nodes — but then there is no root pointer, and whole-state read at version k is O(n log m)         |

The one thing that is **free** and that we are not currently taking: a
leaf's `equal()` can be `===` (**3.9 ns**) instead of `deepEqual`
(**90.6 µs**) the moment the write path guarantees that unchanged
subtrees are reference-identical. That is a **23,000x** difference on the
equality term alone, needs no new data structure, and the 1000-write /
50k-array scenario's equality term drops from **90.6 ms to 4 µs**.

### What surprised me

1. **`immutable.Map` is not a 32-way trie in practice.** On string keys
   it measures at **fanout 3.79 and depth 6** at 1M entries; on integer
   keys, 30.56 and depth 4. The JVM-style string hash correlates high
   bits for common-prefix keys.
2. **Structural sharing by object count is meaningless.** Every structure
   measured shares >99.6% of objects after a single-field update. In
   bytes, immer's 15-deep/50k-wide update allocates **392 KB, of which
   99.6% is one array node and 0.4% is the fifteen levels of depth.**
3. **Reference-equality diffing was 2.7x _slower_ than the deep
   comparison** it was meant to replace, on a plain 50k array. The win
   comes from bounded fanout, not from sharing. I had this backwards
   going in.
4. **`immutable.List.splice` is worse than a plain array at every size** —
   31.7 ms vs 806 µs at 1M — while RRB does it in 1.5 µs.
5. **The V8 polymorphic-IC cliff is at exactly 4→5 shapes for reads
   (3.3x) but 4→8 for spread (6.5x)**, and the spread penalty is much
   larger because `CloneObjectIC` has no megamorphic fallback. Generic
   path-copy helpers are structurally megamorphic.
6. **`Object.create(null)` is always dictionary mode** — 33x on spread,
   9.9x on read, 3–4.5x memory.
7. **`Array.prototype.flat()` is 7.7x slower than `[].concat(...)`** for
   re-flattening chunks (380 µs vs 49 µs at 50k).
8. **`JSON.parse(JSON.stringify(x))` beats `structuredClone(x)`** on a
   50k-record state: 7.7 ms vs 13.7 ms.
9. **Optimal chunk size tracks the analytic C + N/C minimum almost
   perfectly** and the optimum is flat across 128–320, so tuning is
   forgiving.
10. **A HAMT costs ~4x a `Map` in memory** (155 B/entry vs 37 B/entry at
    100k) — the price of sharing is paid on every entry, not just the
    changed ones.

### What I could NOT establish

- **Large-object spread throughput (>32 properties).** Measurements swing
  between 0.86 and 18 ns/prop across otherwise-identical runs, apparently
  GC/tiering dependent. Small objects (≤16 props, the realistic store
  node) are stable at ~9 ns/prop and I trust those.
- **Why objects built by dynamic key addition alternate in and out of
  dictionary mode** at exactly n = 20, 23, 26, 29, 32, 35, 38.
  Reproducible, `%HasFastProperties` confirms it, cause unknown.
- **Chrome vs Node.** Everything is Node 24.3.0 / V8 13.6 on darwin
  arm64. The demo-vs-harness discrepancy in the open-measurements section
  may well be a Chrome/Node difference and this track does not settle it.
- **Whether SignalTree's ~8x large-array regression is fully explained by
  the `deepEqual` term.** My projection for the equality term alone is
  **90.6 ms** for 1000 writes; the independent harness reports ~385 ms.
  Same order of magnitude, not a full account — roughly 4x is unattributed.
- **A full survey of Merkle hashing in JS state management.** I verified
  its absence in immer and immutable.js by source, and found no library
  that does it, but I did not exhaustively enumerate the ecosystem.
- **Whether RRB's relaxed nodes actually carried the 50k splice
  benchmark.** I confirmed `list` produces size-table-bearing nodes on
  `concat` and on `slice`+`concat` (2 and 4 relaxed nodes respectively on
  a 2000-element case), but did not verify the node composition at 50k/1M.
- **`hamt` memory at N=1000 on the first pass** measured negative (GC
  noise); the corrected repeated-allocation measurement gives 108.8
  B/entry and that is the one quoted. Single-update delta-byte
  measurements below ~20 KB are likewise inside this method's noise floor
  and are not quoted as results.
- **Fat nodes and node copying in a real JS store.** My fat-node
  implementation is a 60-line model, not a library. The 50 ns write and
  28 ns versioned read are real but come from a purpose-built flat slot
  map, not from a general tree, and would not survive a realistic nested
  schema unchanged.

## Findings E — shipping libraries

**Status:** CLOSED. Every number below was produced by running code against the
library source installed from npm, on one machine, in one session.

### Method

- **Env:** Node v24.3.0, darwin 25.2.0. Harness `tmp/trackE/` (throwaway,
  gitignored, deleted after the run — reproduction recipe at the end of this
  section).
- **One fixture for every library**, so the numbers are comparable:
  `{ deep: <15 nested objects, leaf {value,tag}>, items: <50,000 × {id,name,value,done}>, meta: {...} }`.
  The deep write path is `deep.l1…l15.value` — 16 property hops from the root.
- **Four operations**, identical semantics everywhere:
  (a) update one deeply nested field · (b) update one element of the
  50,000-element collection · (c) obtain the _entire_ state as a plain,
  library-free object graph · (d) capture a snapshot and restore it.
- Adaptive timing: warm up, then run ≥250 ms and divide. All figures are
  **µs/op**. **No subscribers/effects/reactions were attached during the write
  benchmarks** for any library — these are raw write-path costs, not
  notification costs.
- Where a library offers more than one way to do an operation, both were
  measured and the variant is named. Where the obvious cheap path is _wrong_,
  that is called out rather than reported as a win.

### The table

Bold = the cheapest correct variant. "held" = write through a nested handle
captured once; "walk" = re-walk from the root on every write.

| library (version)                           | in-memory model                                                                                                                                                 | (a) deep write                                     | (b) 1-of-50k write                       | (c) whole state → POJO                                                               | (d) snapshot / restore                                                                                  | time travel                           | nested write handle                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| **baseline** — plain mutable object         | POJO, nothing else                                                                                                                                              | **0.036** held / 0.134 walk                        | **0.028**                                | **0.031** (it _is_ the object)                                                       | 17 123 (`structuredClone`) / —                                                                          | none                                  | yes (it's just an object)                |
| **baseline** — hand-rolled immutable spread | POJO, path-copied on write                                                                                                                                      | **1.358**                                          | **42.63**                                | **0.032**                                                                            | **0.033 / 0.033**                                                                                       | free                                  | no                                       |
| **immer 11.1.16**                           | frozen POJO + transient revocable Proxy drafts; copy-on-write along the touched path only                                                                       | **5.68** (4.34 autoFreeze off)                     | **2 858** (61.4 autoFreeze off)          | **0.038**                                                                            | **0.037 / 0.036**                                                                                       | free (persistent) + patches           | no (drafts die with `produce`)           |
| **Immutable.js 5.1.9**                      | persistent HAMT `Map` + 32-way trie `List`; `items[0]` is itself a `Map`                                                                                        | **1.49** (`setIn`)                                 | **0.499** (`setIn`)                      | 6 475 (`toJS`)                                                                       | **0.059 / 0.055**                                                                                       | free (persistent)                     | no                                       |
| **Valtio 2.3.2**                            | mutable raw objects, one Proxy per object, global version counter; `snapshot()` materialises a structurally-shared POJO cached per `(target, version)`          | **0.285** held / 0.447 walk                        | **0.310** held / 0.364 walk              | 0.093 _cached_; **2 620 after a deep write**; **56 120–84 657 after an array write** | 0.079 take / **234 517** restore                                                                        | bolted on; snapshots are non-writable | **yes** (identity-stable nested proxies) |
| **MobX 7.0.0**                              | observable graph, one atom per property, Proxy per object, deep-observable eagerly on assignment                                                                | **1.14** held / 3.89 walk                          | **1.01** held / 1.62 walk                | **175 978** (`toJS`)                                                                 | 148 240 / 689 866                                                                                       | none native                           | **yes**                                  |
| **Solid 1.9.14 `createStore`**              | mutable raw POJO + _lazy_ Proxy per object (`$PROXY`) + _lazy_ signal per property (`$NODE`), allocated only on a tracked read                                  | 2.61 `setStore` / **1.42** `produce`               | 0.568 `setStore` / **0.525** `produce`   | **0.107** (`unwrap` → raw target)                                                    | 37 712 clone / 66 700 `reconcile`                                                                       | bolted on (`reconcile`)               | **no** — `set` trap is a silent no-op    |
| **Vue 3.5.41 `reactive`**                   | mutable raw POJO + lazy Proxy per object cached in `reactiveMap`; `Dep` per `(target,key)` on first tracked read                                                | **0.255** held / 1.594 walk                        | **0.227** held / 0.436 walk              | **0.053** (`toRaw`)                                                                  | 17 766 / 19 495                                                                                         | bolted on                             | **yes** (objects; not primitive leaves)  |
| **Legend-State 2.1.15**                     | **one plain object holds all data** (`root._`); a _separate_ lazily-grown "node" metadata tree mirrors only the paths you touched                               | **14.10** held leaf / 19.97 walk                   | **1.93** held leaf / 5.16 walk           | **0.157** (`get`) / 0.159 (`peek`)                                                   | 26 419 / 91 436                                                                                         | diff log only (`trackHistory`)        | **yes** (identity-stable node proxies)   |
| **@ngrx/signals 21.1.1**                    | **3 Angular signals for the entire state** — one per _top-level_ key; each wrapped in a `toDeepSignal` Proxy that memoises a `computed()` per accessed sub-path | **2.06** (`patchState` + caller-side path rebuild) | **66.5** slice+spread; 359 with `.map()` | **0.514** (`getState`); 0.056 root computed                                          | **0.362 / 0.681**                                                                                       | free                                  | **depth-1 only**                         |
| **Yjs 13.6.32**                             | CRDT: linked list of `Item`s per type; `Y.Map`/`Y.Array` are live handles into the op log; **doc grows on every write**                                         | **11.36** held / 33.76 walk                        | **10.95** held / 34.09 walk              | 4 190 (`toJSON`)                                                                     | `Y.snapshot()` 454 µs → **34 bytes**; materialise 107 945. Full update: 23 322 → 4.66 MB, apply 121 015 | **structural**                        | **yes**                                  |
| **Automerge 3.4.0**                         | CRDT: columnar op log in WASM; the JS `doc` is a lazily-materialising proxy over the backend                                                                    | **249.7**                                          | **6 717**                                | **271 026** (`toJS`); a _single_ deep field read is 0.147                            | `getHeads` **0.408**; `view(doc, heads)` 313 655; save 27 392 → 650 KB; load 532 530                    | **structural**                        | **no**                                   |

Construction cost of the same fixture, since it is not free and it varies by
three orders of magnitude: Vue 3 ms · Legend-State <1 ms · Solid 127 ms ·
Immutable.js 68 ms · Yjs 82 ms · Valtio 202 ms · MobX 676 ms · Automerge
1 458 ms · ngrx `signalState` 4 ms.

Reference costs everyone is measured against: `structuredClone` of the 50k
array 16 798 µs · `Array.prototype.slice` of it 38.7 µs · spreading all 50k
elements 626 µs · `JSON.stringify` 3 708 µs.

### The five distinct models

**1. Immutable value at the root.** _immer, Immutable.js, hand-rolled spread,
@ngrx/signals._ State is a value; a write produces a new value sharing
everything untouched. Verified for immer: after a 15-deep write, `items`,
`items[0]` and `meta` are reference-identical and every object on the written
path is new (`tmp/trackE/probe-immer.mjs`). Same for Immutable.js. **Serialisation
is O(1) and time travel is free**, because a snapshot is just keeping the old
reference. The bill is on the write: you pay for the path copy, and for a
collection you pay for the whole spine — hand-rolled 42.6 µs, ngrx 66.5 µs,
immer 61.4 µs (2 858 µs with `autoFreeze` on). Immutable.js is the exception
that proves the model can be fixed: its 32-way trie makes the 50k-element write
**0.499 µs**, 85× faster than a `slice()`-based rebuild — but it pays for it at
`toJS`, 6 475 µs, because its nodes are not POJOs.

**2. Mutable POJO + a side reactivity structure that never owns the data.**
_Vue, Solid, Legend-State._ The canonical state is a plain object; proxies and
dep-maps/signals/nodes are a parallel index built lazily over the paths you
actually touch. Verified: `toRaw(state) === toRaw(state)` and the nested raws
are not proxies (Vue); `unwrap(store)` returns the raw target in 0.107 µs
(Solid); `obs.get() === theOriginalObjectYouPassedIn` (Legend-State). **This
model gets O(1) serialisation _and_ sub-µs partial writes.** What it does not
get is a _snapshot_: the object it hands back is live, so a durable capture is a
deep clone — 17 766 / 37 712 / 26 419 µs respectively.

**3. Per-leaf-owned state.** _MobX._ The atom owns the value; there is no POJO
anywhere. Writes are fast and local (1.01–1.14 µs) and independent of collection
size. Both reads-as-a-whole and snapshots must be materialised: `toJS` **175 978
µs**, restore 689 866 µs. This is SignalTree's family, and MobX is the evidence
that the materialisation bill is a property of the model, not of any one
implementation.

**4. Versioned structural-sharing snapshot.** _Valtio._ An attempt at all three
at once: mutate in place (0.285 µs), and get a POJO from `snapshot()` that
reuses untouched subtrees by reference. The sharing is real — verified in
`probe-valtio-sharing.mjs`: after a deep write `s1.items === s2.items` and
`s1.meta === s2.meta`; after an array write `s3.deep === s4.deep` and
`s3.items[0] === s4.items[0]`. **But the snapshot is still O(total proxied
nodes), not O(changed nodes)**, because `ensureVersion` must poll every
descendant's version once the global counter moves (`esm/vanilla.mjs:96-108`).
Measured directly, snapshot-after-a-deep-write against collection size:

| items | 0    | 100   | 1 000 | 10 000 | 50 000   |
| ----- | ---- | ----- | ----- | ------ | -------- |
| µs    | 9.87 | 11.36 | 26.61 | 217.82 | 4 219.19 |

The array is untouched and its snapshot is reused by reference — and it still
costs 4.2 ms, purely to ask 50,000 proxies whether they changed. Structural
sharing buys the _allocation_, not the _walk_.

**5. CRDT op log.** _Yjs, Automerge._ Time travel is structural: a Yjs snapshot
is a state vector + delete set, **34 bytes**, and Automerge's `getHeads()` is
0.408 µs. Both are O(1) to _record_. Everything else is expensive: writes are
11–250 µs, materialising a POJO is 4 190 µs (Yjs) to 271 026 µs (Automerge), and
materialising a past state is 107 945 µs / 313 655 µs. The doc also grows
monotonically with every write (Yjs update bytes went 4.66 MB → 4.86 MB over the
benchmark run with `gc:false`).

### Answers to the four cross-cutting questions

**Which hold a POJO they can hand back for free (O(1)) vs must materialise
one (O(state))?**

| O(1) — a POJO already exists         | O(state) — must be materialised                                            |
| ------------------------------------ | -------------------------------------------------------------------------- |
| immer `state` (0.038 µs)             | Immutable.js `toJS` — 6 475 µs                                             |
| Immutable.js _nothing_ — see right   | MobX `toJS` — **175 978 µs**                                               |
| Vue `toRaw` (0.053 µs)               | Valtio `snapshot()` after any write — 2 620–84 657 µs                      |
| Solid `unwrap` (0.107 µs)            | Yjs `toJSON` — 4 190 µs                                                    |
| Legend-State `get`/`peek` (0.157 µs) | Automerge `toJS` — **271 026 µs**                                          |
| @ngrx/signals `getState` (0.514 µs)  | Vue/Solid/Legend \*if you need a **value\*** — 17 766 / 37 712 / 26 419 µs |

Two distinct reasons for landing in the left column, and they are not
interchangeable: immer/ngrx are there because the state **is** an immutable
value; Vue/Solid/Legend are there because the state is a **live mutable object**
they never stopped holding. Only the first kind gets a free _snapshot_ too.

Note `getState`'s mechanism (`ngrx-signals.mjs:256-265`): it reduces over
`Reflect.ownKeys(STATE_SOURCE)` — **three keys for this entire 50,000-element
state** — spreading a fresh 3-key root while handing back every nested object
**by reference**. Verified: two successive `getState` calls return different
roots but `a.items === b.items` and `a.deep === b.deep`. It is O(top-level
keys), not O(state).

**Which support a stable nested write handle?** Verified by capture-then-write,
not assumed:

| library           | handle?                   | evidence                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Valtio            | **yes**                   | nested proxy identity stable; `node.value = i` at 0.285 µs, 1.6× faster than re-walking                                                                                                                                                                                                                                                    |
| MobX              | **yes**                   | identity stable; 1.14 µs held vs 3.89 µs walk — **3.4×**                                                                                                                                                                                                                                                                                   |
| Vue               | **yes, for object nodes** | identity stable, `isReactive(node)` true, and a held-handle write **does** re-trigger a subscribed effect. 0.255 µs held vs 1.594 µs walk — **6.3×**. Primitive leaves are returned by value, so no leaf handle.                                                                                                                           |
| Legend-State      | **yes**                   | `leaf === node.value` stable; `leaf.set(i)` 14.10 µs vs 19.97 µs walk                                                                                                                                                                                                                                                                      |
| Yjs               | **yes**                   | `Y.Map` handle identity stable; 11.36 µs held vs 33.76 µs walk — **3.0×**                                                                                                                                                                                                                                                                  |
| **Solid**         | **no**                    | `proxyTraps.set() { return true; }` (`store/dist/store.js`) — a Proxy `set` trap that reports success and writes nothing. Verified: `node.value = 4242` leaves the raw at `0`, silently, with no error. Every write goes through `setStore(...path, v)` from the root, or `produce`, whose setter proxy is valid only inside the callback. |
| **@ngrx/signals** | **depth-1 only**          | `store.deep` is the writable top-level signal and _does_ expose `.set`/`.update`; `store.deep.l1` and deeper are Proxies over `computed()` with `set === undefined`, and their Proxy identity is **not** stable (`ngrx-signals.mjs:25` returns a new Proxy per access).                                                                    |
| **immer**         | **no**                    | drafts are revoked when `produce` returns. `createDraft`/`finishDraft` lets a nested draft handle live across statements, but only within one draft session.                                                                                                                                                                               |
| **Immutable.js**  | **no**                    | a held sub-collection is a _value_; writing it does not update the root.                                                                                                                                                                                                                                                                   |
| **Automerge**     | **no**                    | all writes go through `A.change(doc, fn)`. A draft handle that escapes the callback silently discards writes (verified: value stays `1`). Worse, `doc.a.b.c = 42` outside `change()` **does not throw and reads back as 42 locally**, while a later `change` still sees the old value — silent divergence.                                 |

So this is a genuine capability split, and it splits _against_ the immutable
libraries. Everything that holds mutable objects can offer a nested handle;
everything that holds an immutable root cannot, because a nested position is not
addressable once the root is replaced. Solid is the one mutable library that
declines to offer it — and does so by silently swallowing the write.

**What does time travel cost, and is it free or bolted on?**

| cost class                                               | libraries                                              | capture             | restore              |
| -------------------------------------------------------- | ------------------------------------------------------ | ------------------- | -------------------- |
| **free — the data model is already a value**             | immer, Immutable.js, hand-rolled spread, @ngrx/signals | 0.033–0.362 µs      | 0.033–0.681 µs       |
| **structural — O(1) to record, O(state) to materialise** | Yjs, Automerge                                         | 34 bytes / 0.408 µs | 107 945 / 313 655 µs |
| **bolted on — a deep clone in both directions**          | Vue, Solid, Legend-State, MobX, Valtio                 | 17 766 – 148 240 µs | 19 495 – 689 866 µs  |

The bolted-on row is exactly the "mutable POJO" and "per-leaf-owned" models. The
free row is exactly the "immutable value at the root" model. Time travel is not
a feature you add; it is a consequence of whether your state is a value.

Two traps found in the bolted-on row. Valtio's `snapshot()` looks like a free
capture (0.079 µs) and the assignment back looks like a free restore (0.176 µs)
— but snapshot properties are defined with `Object.defineProperty` and **no
`writable` flag**, so they are non-writable (`{"value":0,"writable":false,
"enumerable":true,"configurable":true}`, and valtio's own source comments on
this at `esm/vanilla.mjs:25-27`). Assigning a snapshot back leaves the live tree
**read-only**; the correct restore needs `deepClone` first, at 234 517 µs.
Solid's `reconcile` genuinely restores and correctly avoids aliasing the
snapshot (verified), but costs 66 700 µs on this fixture regardless of whether
one element differs (68 942 µs) or none does.

**Does anything get BOTH fast partial writes AND O(1) whole-state reads?**

**Yes — Vue, Solid, Legend-State, and @ngrx/signals.** And the mechanism is the
same in all four: _the canonical state is a plain JavaScript object, and
reactivity is a side structure that never owns the data._ Handing back a POJO is
free because they never stopped having one.

But that is only two of the three things you want, and _which_ two differs:

|                                                         | O(1) whole-state POJO                     | O(1) snapshot   | sub-µs partial write             |
| ------------------------------------------------------- | ----------------------------------------- | --------------- | -------------------------------- |
| mutable POJO + side reactivity (Vue, Solid, Legend)     | ✅                                        | ❌ 17.8–37.7 ms | ✅ 0.23–14 µs                    |
| immutable value at the root (immer, Immutable.js, ngrx) | ✅                                        | ✅              | ❌ 42–2 858 µs on the collection |
| per-leaf-owned (MobX)                                   | ❌ 176 ms                                 | ❌ 148 ms       | ✅ 1.0 µs                        |
| versioned structural sharing (Valtio)                   | ⚠️ free cached, 2.6–85 ms after any write | ❌ 235 ms       | ✅ 0.3 µs                        |
| CRDT (Yjs, Automerge)                                   | ❌ 4.2–271 ms                             | ✅ structurally | ❌ 11–250 µs                     |

**Nothing measured gets all three.** The trade-off is inherent in the following
precise sense: an O(1) whole-state read and an O(1) snapshot are only the same
operation when the object you hand back is a _value_. Vue/Solid/Legend hand back
a _live_ object — free, but it changes underneath you, so a snapshot costs a
clone. ngrx hands back a value — free _and_ snapshottable — and pays for it by
having no nested write handle and by making the caller rebuild the immutable
path on every write. MobX and SignalTree own the leaves, which buys the write
and costs both reads.

@ngrx/signals is the closest thing to a counter-example, and it is worth being
precise about why it is not one: it does **not** have fast partial writes. Its
deep write (2.06 µs) is slower than Vue's (0.255 µs) and its 50k-element write
(66.5 µs) is 130× slower than Solid's `produce` (0.525 µs) and 293× slower than
Valtio's held handle. It buys its free `getState` and free time travel with
exactly the write cost the immutable model implies.

### Notes on specific claims in the brief

**immer — "what exactly is copied on a nested write?"** Only the touched path,
verified by identity. But the copying is triggered by the **read**, not the
write: `objectTraps.get` calls `prepareCopy(state)` before returning a child
draft (`src/core/proxy.ts:150-160`), which `shallowCopy`s the ancestor and
allocates an `assigned_` Map. So merely walking a 16-hop path inside `produce`
costs **3.29 µs** even when nothing is written — measured against **0.244 µs**
for a `produce` that touches nothing at all. Identity is still preserved
(`finalize` returns `state.base_` when `modified_` is false,
`src/core/finalize.ts:79-81`), so the copies are allocated and thrown away.

**immer — `produceWithPatches`.** +59% on the deep write (5.68 → 9.05 µs; 4.34 →
6.82 µs with autoFreeze off) and _no measurable difference_ on the array write
(2 858 → 2 882 µs), where the freeze walk swamps it. Patches are minimal — one
`replace` op carrying the full 17-segment path for the deep write, one for the
array element. `applyPatches` with the inverse costs 6.34 µs.

**immer — `autoFreeze`.** Default-on, and it is the single largest cost in this
whole table's immer row: the 50k-element write goes from **61.4 µs to 2 858 µs,
a 47× penalty**, because `freeze(result, true)` walks all 50,000 elements of the
freshly-`slice()`d array on every `produce` (each element early-returns as
already frozen, but the walk is still O(N)).

**Immutable.js — `toJS`.** 6 475 µs, and this is the same "materialise a POJO"
cost the brief flags. Worth noting it is _cheaper_ than MobX (175 978 µs) and
Automerge (271 026 µs) and comparable to a `structuredClone` of the raw array
(16 798 µs). `toJS` of the deep subtree alone is 0.924 µs — the cost is entirely
the 50k collection.

**Valtio — repeated snapshot / snapshot after a deep write / reference
identity.** All three measured above. Repeated snapshot with no intervening
write returns the **identical object** (`s2 === s3`), at 0.093 µs. A no-op write
(same value) does not bump the version and does not invalidate the snapshot.

**Solid — `reconcile`.** Keyed prefix scan, then a suffix scan, then a
`Map`-based reindex of the middle (`store.js:345-388`) — an O(N) keyed
reconciliation in the Inferno/snabbdom family, not an LCS. Measured at 66 700 µs
for an identical array and 68 942 µs with one element changed: the diff cost is
dominated by the O(N) scan, not by the number of changes. `produce` is **not**
immer — it is a second, thinner Proxy (`setterTraps`, `store.js:422-437`) whose
`set` calls `setProperty` directly on the raw store inside a `batch`.

**Legend-State — "claims very fast reads/writes; establish HOW."** The read
claim is true and the mechanism is clean: the data is one bare POJO at `root._`,
`getNodeValue` just indexes into it, and `get()`/`peek()` return **the very
object you passed to `observable()`** (verified: `obs.get() === plain`). 0.157
µs for the whole state.

**The write claim did not survive measurement.** A 16-deep write is **14.10 µs**
— 55× Vue's and 50× Valtio's for the same write. From source, the cause is
`computeChangesRecursive` (`index.mjs:523-537`): after every `set` it walks from
the written node up to the root, and at _each_ ancestor calls
`getNodeValue(parent)` — which itself walks the parent chain — and allocates two
fresh path arrays via `[node.key].concat(path)`. That is O(depth²) work and
O(depth²) allocation **per write, whether or not anything is listening.**
Measured, with no collection present at all:

| depth    | 1     | 2     | 4     | 8     | 16     |
| -------- | ----- | ----- | ----- | ----- | ------ |
| µs/write | 0.815 | 1.217 | 2.049 | 4.407 | 10.987 |

~0.7–0.8 µs per level, superlinear, and **completely independent of collection
size** (12.15 µs at `items=0` vs 12.61 µs at `items=50000`). Legend-State is
fast at reads and at _shallow_ writes; it is the slowest non-CRDT library
measured at deep ones.

**@ngrx/signals — `signalState` vs `signalStore`.** **The premise in the brief
is wrong, and this does not explain the harness discrepancy.** `signalState`
(`ngrx-signals.mjs:345-361`) and `withState` (`:789-807`) build the _identical_
`STATE_SOURCE`: one `signal()` per top-level key, each wrapped in
`toDeepSignal`. `signalState` adds exactly one thing — a root `computed()` that
spreads the top-level keys, making the container itself callable. Verified both
by source and by constructing a `signalStore`-shaped state source directly
(`tmp/trackE/probe-ngrx.mjs`): same three keys, same signals, and the four
operations measure within noise of each other (deep write 2.19 vs 2.06 µs;
`getState` 0.404 vs 0.514 µs; snapshot 0.446 vs 0.362 µs; restore 0.636 vs 0.681
µs). **Both are "the DeepSignal one." Neither is lighter.** The demo-vs-harness
discrepancy in "Open measurements" needs a different explanation.

The one genuinely heavy ngrx path is reading _through_ the DeepSignal chain:
`store.deep.l1…l15.value()` costs **1.22 µs** because `toDeepSignal` allocates a
fresh Proxy at every hop (`:25`) even though the `computed()` behind it is
memoised. Reading the same field off `getState()` costs 0.498 µs.

**Yjs / Automerge — do they get time travel for free?** To _record_, yes and
dramatically: 34 bytes for a Yjs snapshot, 0.408 µs for Automerge's heads. To
_use_, no: 107 945 µs and 313 655 µs respectively to materialise the past state.
The CRDTs move the cost from capture to replay, which is the right trade for
sync and the wrong one for an undo stack you scrub through.

### What surprised me

1. **Valtio's snapshot is O(total nodes), not O(changed nodes).** Structural
   sharing is real and verified, and it still costs 4.2 ms to snapshot after
   touching one deep field, because the version poll has to visit all 50,000
   untouched proxies. Caching the _result_ does not help if you have to walk the
   tree to discover the cache is valid.
2. **Valtio's cheap restore is a trap.** Assigning a snapshot back is 0.176 µs
   and leaves your entire state tree read-only, silently. The correct restore is
   1.3 million times more expensive.
3. **Solid's store proxy `set` trap is `return true` with no write.** A held
   nested reference accepts assignments, reports success, and does nothing. No
   error, no warning in the production build.
4. **Node resolves `solid-js/store` to the SSR build**, which has no proxies at
   all. My first Solid run measured plain object mutation and reported that
   held-handle writes worked and `reconcile` aliased its input — all artefacts.
   Anyone benchmarking Solid in Node without `--conditions=browser` is measuring
   nothing. This is the second time in this spike that a benchmark was confidently
   wrong before it was checked.
5. **immer's `autoFreeze` is a 47× tax** on a single-element write in a 50k
   collection (2 858 µs → 61.4 µs when disabled), and it is on by default.
6. **immer charges ~3.3 µs to merely _read_ a deep path** inside `produce`,
   because the `get` trap pre-copies every ancestor before it knows whether
   you'll write.
7. **Legend-State, the library whose pitch is speed, has the slowest deep write
   of any non-CRDT library measured** — and the cost is O(depth²) notification
   bookkeeping that runs even with zero subscribers.
8. **MobX — the closest structural cousin to per-leaf signals — has by far the
   worst POJO materialisation of any non-CRDT library: 176 ms.** This is the
   most directly relevant number in the whole track: it is independent evidence
   that "materialising the whole state is expensive" is a property of the
   per-leaf model itself.
9. **@ngrx/signals holds three signals for a 50,000-element state.** Its `getState`
   is nearly free not because it is clever but because it barely does anything:
   three spreads and everything else shared by reference. The corollary is that
   it has no per-leaf reactivity at all below the top level — every subscriber to
   any part of `items` re-runs when any element changes.
10. **A Yjs snapshot is 34 bytes.**

### What I could not establish

- **Whether these numbers transfer to a browser.** Everything is Node v24.3.0 /
  V8 on one machine. The open measurement in this doc explicitly names
  Chrome-vs-Node as a candidate for the SignalTree discrepancy; nothing here
  rules it in or out.
- **The cause of the demo-vs-harness ngrx discrepancy.** I ruled out the
  `signalState`/`signalStore` hypothesis (same model, same numbers). I did not
  investigate the duplicated `ARRAY_UPDATES` declaration.
- **Any of this with live subscribers attached.** All write numbers are
  unsubscribed. Notification cost is the write-path spike's territory, and for
  libraries whose write cost _is_ notification bookkeeping (Legend-State,
  arguably MobX) the ranking could move under load.
- **Memory.** Not measured for any library, despite build times spanning 1 ms to
  1 458 ms strongly implying large differences.
- **Legend-State v3.** npm `latest` for `@legendapp/state` is 2.1.15 (v3 is not
  on `latest`); the O(depth²) finding applies to what npm installs today and may
  not apply to the v3 rewrite.
- **Immutable.js's internals from source.** I verified its _behaviour_ (root
  `Map`, `items` a `List`, `items[0]` a `Map`, correct structural sharing on
  `setIn`) and measured it, but read the HAMT/trie implementation only far
  enough to confirm the shape. Track D is the right place for that.
- **CRDT merge/sync cost**, which is the thing CRDTs actually exist for and the
  reason their other numbers are what they are.

### Reproduction

Harness deleted per the spike rules. To rebuild: `npm i immer@11.1.16
immutable@5.1.9 valtio@2.3.2 mobx@7.0.0 solid-js@1.9.14 vue@3.5.41
@legendapp/state@2.1.15 yjs@13.6.32 @automerge/automerge@3.4.0`, `@ngrx/signals`
from the workspace root. Fixture and adaptive `bench()` as described under
_Method_. **Run Solid with `node --conditions=browser`** or you will measure the
SSR shim.

## Findings F — SignalTree's measured profile

**Harness:** `scripts/benchmarks/data-model-profile.mjs`. Run with
`node --expose-gc scripts/benchmarks/data-model-profile.mjs [section…]`; sections
are `write read collection construct entitymap timetravel equality ttentity
ttleak`. `ttentity` and `ttleak` **must** run in their own process (see F-1d-ter).
Arms are interleaved in one process, arm order rotates per sample, 15 samples,
medians + IQR. Node v24.3.0, Apple M4, `dist/packages/core` built from HEAD.

**Two fixture bugs were found and fixed inside this track before any number
below was trusted** — both had produced wrong conclusions, and one of them is
the explanation for a number already in this document:

1. `mkItems` builds `{ id: i, value: i }` and the update writes `value: i` at
   `idx = i % N`. For `i < N` that writes **the value already there**, so every
   "update" is a structurally-identical no-op and `deepEqual` runs its full
   `N`-element walk instead of short-circuiting. This is what
   `fair-signalstore-headtohead.mjs` and `deep-equality-cost.mjs` still do.
2. Fixtures are built once and each arm is replayed ~18 times (warmup +
   samples). A per-loop value like `-(i + 1)` writes the value the previous pass
   already wrote, which degenerates into case 1 from the second pass on. The
   written value has to be globally unique across the whole run.

---

### F-1a. Partial write — walked path vs held leaf reference

Per write, 10 000 writes per sample. A `nested(d)` chain; the leaf is a number.

| depth | walked each time | held leaf ref | bare `signal()` | held + 1 dependent computed | POJO immutable rebuild |
| ----- | ---------------- | ------------- | --------------- | --------------------------- | ---------------------- |
| 1     | 6.5 ns           | 5.1 ns        | 3.0 ns          | 23.5 ns                     | 15.7 ns                |
| 5     | 32.0 ns          | 15.6 ns       | 16.0 ns         | 43.4 ns                     | 40.6 ns                |
| 15    | 46.7 ns          | 15.5 ns       | 16.0 ns         | 43.1 ns                     | 110.3 ns               |

Both forms are legitimate and both are cheap. Read:

- **The held reference is free.** At depth 15 it costs 15.5 ns — statistically
  identical to a bare Angular `signal()` (16.0 ns). SignalTree adds _nothing_
  measurable to a leaf write once the leaf is resolved. This is the strongest
  single result in the track.
- **Walking costs ~2.9 ns per level** (46.7 ns at depth 15 vs 6.5 ns at depth 1).
  Path resolution is one property read per level and nothing else.
- **The advantage over an immutable rebuild grows with depth**, as it must:
  1.0x at depth 1 (rebuilding one small object is cheap), 2.4x at depth 15
  walked, **7.1x** held. Note this baseline is a _hand-written_ POJO rebuild —
  the floor. A real store (`patchState`) adds its own overhead on top, which is
  where the "~20x / ~31x vs `@ngrx/signals`" in the header table comes from.
  Those figures are not re-derived here; this table is the architecture-only
  comparison.
- **The notification, not the write, is the cost.** Adding one dependent
  computed takes a depth-15 held write from 15.5 ns to 43.1 ns — propagation is
  ~2x the write itself. Any "write cost" number taken on a leaf with no live
  consumer (including several in this repo) understates real cost by ~3x.

### F-1b. Whole-state read — `tree()` materialisation

Per `tree()` call, on a wide object with 10 primitive leaves per group.

| leaves  | `tree()` | `structuredClone(POJO)` | POJO by reference |
| ------- | -------- | ----------------------- | ----------------- |
| 1 000   | 0.088 ms | 0.055 ms                | 0.0001 ms         |
| 10 000  | 0.936 ms | 0.568 ms                | 0.0001 ms         |
| 100 000 | 13.90 ms | 7.86 ms                 | 0.0007 ms         |

`tree()` is **linear and ~1.6–1.8x the cost of a `structuredClone`** of the
equivalent POJO. It allocates a complete fresh object graph on every call and
caches nothing.

**The header table's "read the WHOLE state ~2.25x slower" is the wrong
comparison and should be corrected.** `@ngrx/signals`' `signalState` holds a
POJO and returns it by reference — that is the third column, 0.0007 ms. The
honest statement is: _any_ competitor that stores a POJO answers a whole-state
read in O(1), and we answer it in O(leaves). At 100 000 leaves that is four
orders of magnitude, not 2.25x. The 2.25x figure is measuring something else and
should not be cited until re-derived.

### F-1c. Large collection — 1000 single-element updates on an array leaf

Per update, in µs. `ST` = `signalTree({ items: [...] })`, one array leaf.

| N      | pattern                          | ST deepEqual (default) | ST `useShallowComparison` | bare signal `Object.is` | no signal (slice only) |
| ------ | -------------------------------- | ---------------------- | ------------------------- | ----------------------- | ---------------------- |
| 1 000  | front idx, new value             | 4.00                   | 0.27                      | 0.26                    | 0.26                   |
| 1 000  | random idx, new value            | 3.83                   | 0.29                      | 0.28                    | 0.25                   |
| 1 000  | front idx, **identical** (no-op) | 7.53                   | 0.27                      | 0.33                    | 0.30                   |
| 10 000 | front idx, new value             | 6.29                   | 2.44                      | 2.48                    | 2.44                   |
| 10 000 | random idx, new value            | 34.94                  | 2.50                      | 2.53                    | 2.41                   |
| 10 000 | front idx, **identical** (no-op) | 70.14                  | 2.40                      | 2.36                    | 2.44                   |
| 50 000 | front idx, new value             | 53.16                  | 49.10                     | 49.05                   | 49.44                  |
| 50 000 | random idx, new value            | 218.35                 | 48.16                     | 48.21                   | 48.34                  |
| 50 000 | front idx, **identical** (no-op) | 384.83                 | 47.67                     | 47.40                   | 47.48                  |

Three facts fall out, and together they close the open measurement at the top of
this document:

1. **SignalTree adds nothing over a bare Angular signal.** The
   `useShallowComparison` column and the `Object.is` column match the _no signal
   at all_ column at every size. The array-leaf write path is a `slice()` plus a
   signal set; the tree itself costs nothing.
2. **`slice()` dominates at 50k.** 47–49 µs of every arm is the array copy. Any
   claim about "SignalTree on large arrays" that does not subtract this is
   measuring `Array.prototype.slice`.
3. **`deepEqual`'s cost is O(index of the first difference), not O(N).** Because
   `slice()` leaves every untouched element reference-identical, the walk exits
   at the first changed element, at ~7.7 ns per reference-identical element:
   - mismatch at the front → 50k: 53.2 − 49.4 = **3.8 µs**
   - uniform-random mismatch (~N/2) → 50k: 218.4 − 48.3 = **170 µs**
   - **no mismatch at all** → full walk _plus_ a field-by-field compare of every
     element → 50k: 384.8 − 47.5 = **337 µs**

**This resolves "the demo reports 11.3 ms, an independent harness measures
~385 ms".** The ~385 ms harness is running case (3): its fixture writes the
value that is already present, so all 1000 updates pay the full 50 000-element
walk. 385 µs/update × 1000 = 385 ms — the number reproduces exactly. Correct the
fixture and the same workload is **53 ms** (front idx) to **218 ms** (random
idx). `benchmark-constants.ts` is **not** a cause: the two `ARRAY_UPDATES` are
`ITERATIONS.ARRAY_UPDATES = 1000` and `YIELD_FREQUENCY.ARRAY_UPDATES = 255`,
different namespaces, not a redeclaration. **Strike that candidate.**

The demo's own 11.3 ms is still unexplained, but it can now be bounded. The demo
writes `Math.random()` values (always different) at `idx = i % dataSize` — the
cheapest case — yet 11.3 ms for 1000 updates is **11.3 µs per update**, and a
bare `slice()` of a 50 000-element array measures 47–49 µs with no signal
involved at all. 11.3 ms is arithmetically impossible for the workload the demo
claims to run. Whatever it is timing, it is not 1000 single-element updates over
a 50 000-element array. **Do not cite 11.3 ms.**

### F-1d. Time travel

**Recording granularity is per-microtask-flush, not per-write.** 100 synchronous
leaf writes produce **2** history entries (INIT + one coalesced flush); 100
writes each awaiting a microtask produce 100. One `undo()` after a synchronous
burst therefore reverts the entire burst. This is a behavioural fact, not a perf
number, and I could not find it documented anywhere.

Cost of recording ONE history entry, by state size:

| state         | `timeTravel()` | no enhancer | manual immutable snapshot (structural sharing) | manual `structuredClone` snapshot |
| ------------- | -------------- | ----------- | ---------------------------------------------- | --------------------------------- |
| 1 000 leaves  | **832 µs**     | 0.3 µs      | 0.3 µs                                         | 59 µs                             |
| 10 000 leaves | **4 342 µs**   | 0.3 µs      | 1.2 µs                                         | 542 µs                            |

`undo()`: 0.060 ms @1 000 leaves, 0.531 ms @10 000.
Retained per history entry: **25.3 KB @1 000 leaves, 249.4 KB @10 000** — ~25
bytes per leaf per entry, a fully materialised clone with no sharing. With the
default `maxHistorySize: 50`, a 10 000-leaf tree retains ~12 MB of history.

`addEntry` is **8–14x more expensive than a naive full `structuredClone`** of the
state, because it makes three full passes: `snapshotState()` walks the whole
signal graph and materialises a POJO, `structuredClone` copies that POJO, then
`deepEqual` compares it against the previous entry to dedupe. Against the
structural-sharing alternative (keep the immutable POJO, push the new root) it is
**2 700x** at 1 000 leaves and **3 600x** at 10 000 — and that alternative
retains O(depth) per entry instead of O(state).

Time travel is by a wide margin the most expensive thing in the library.

#### F-1d-bis. `entityMap` under time travel

| operation                                           | median   |
| --------------------------------------------------- | -------- |
| `entityMap(5000).updateOne` + flush, no enhancer    | 0.010 ms |
| `entityMap(5000).updateOne` + flush, `timeTravel()` | 4.141 ms |

**414x.** `entityMap`'s O(1) write is completely erased by time travel, because
`snapshotState` materialises the collection — and `tree()` emits **five** keys
for an `entityMap` (`all`, `count`, `ids`, `map`, `empty`), so the snapshot
contains the collection **three times** (as an array, as a key array, and as a
`Map`) before `structuredClone` copies all three and `deepEqual` walks all three.

#### F-1d-ter. `timeTravel()` leaks its cost across unrelated trees

`timeTravel()` subscribes to the **global** `PathNotifier` flush event. Every
live `timeTravel` tree therefore runs a full `snapshotState` + `structuredClone`

- `deepEqual` on **every flush anywhere in the process** — including flushes
  caused by a completely unrelated tree — and then throws the result away when the
  dedupe finds nothing changed.

| unrelated 10 000-leaf `timeTravel` trees alive | cost of one `entityMap(2000).updateOne` + flush |
| ---------------------------------------------- | ----------------------------------------------- |
| 0                                              | 0.008 ms                                        |
| 1                                              | 3.749 ms                                        |
| 2                                              | 7.165 ms                                        |
| 3                                              | 9.701 ms                                        |

Perfectly linear, ~3.2 ms per extra tree, all of it discarded (their histories
stay at 1 entry). In an app with several time-travelled stores, every write in
_any_ store pays for _all_ of them. This is a defect, not a tuning parameter.

The trigger has to be a write that actually notifies. A plain leaf `.set()` on an
unenhanced tree never calls the notifier, so a leaf-only benchmark cannot see
this; only `entityMap` mutations and enhanced trees reveal it. It silently
contaminated my own numbers until those cases were moved into separate
processes — hence the two extra harness sections.

### F-1e. Construction and retained memory

| leaves  | `signalTree(shape)` | `structuredClone` | retained (tree) | B/leaf  | retained (POJO) | ratio |
| ------- | ------------------- | ----------------- | --------------- | ------- | --------------- | ----- |
| 1 000   | 0.205 ms            | 0.055 ms          | 544 KB          | **558** | 16 KB           | 33.9x |
| 10 000  | 2.303 ms            | 0.550 ms          | 5.42 MB         | **555** | 157 KB          | 34.6x |
| 100 000 | 39.9 ms             | 8.23 ms           | 54.0 MB         | **553** | 1.56 MB         | 34.7x |

Construction is linear, ~0.4 µs per leaf, ~4x a `structuredClone`.
**Retained memory is a flat ~555 bytes per leaf, 35x the POJO.**

The decomposition says where a fix would have to aim:

| thing                                              | retained @10 000     |
| -------------------------------------------------- | -------------------- |
| 10 000 bare Angular `signal()`                     | 5.09 MB (521 B each) |
| 10 000 bare `signal(v, { equal: deepEqual })`      | 5.09 MB (521 B each) |
| `signalTree` with 10 000 primitive leaves          | 5.52 MB              |
| `signalTree` with ONE array leaf of 10 000 objects | 790 KB               |
| the same 10 000 objects as a raw array             | 783 KB               |

**~94% of the per-leaf cost is Angular's signal node, not SignalTree.**
SignalTree adds ~34 B/leaf on top of the 521 B Angular charges for a writable
signal, and the custom `equal` costs nothing. "One signal per leaf" is the
expensive decision, and it is expensive _because of Angular's signal_, not
because of anything in this repo. A tree with one array leaf holding the same
data costs 790 KB against 5.5 MB — **7x less** — which is the same trade-off
`entityMap` makes, from the other direction.

All of the above is the **eager** path. `useLazySignals` exists but is opt-in and
inert without `lazy: lazy()` from `@signaltree/core/lazy`; `LAZY_THRESHOLD: 50`
only chooses the default _when the lazy feature is installed_. Nothing here
measures that path.

---

### F-2. What `entityMap` already does differently

**How it stores entities** (`packages/core/src/lib/entity-signal.ts`, as of
commit `6d9aae8b`, which landed _during_ this track):

- The source of truth is a plain **`Map<K, E>`** closed over in
  `createEntitySignal`. It is not a signal.
- A single `signal(0)` **version counter** is the only writable signal for the
  collection. Every mutation calls `updateSignals()`, which is exactly
  `version.update(v => v + 1)`.
- The four collection queries — `all`, `count`, `ids`, `map` — are **lazy
  `computed`s** that read `version()` and rebuild from the `Map`.
- **Per-entity signals**: a `Map<K, WritableSignal<E | undefined>>`, materialised
  lazily on first `byId()`. `byId(id).field()` is a `computed` over _that
  entity's_ signal only. A mutation calls `syncEntitySignal(id)`, a no-op if
  nobody has ever asked for that entity.

Read this: **the version-counter design is what makes the write O(1), and it
landed hours ago.** Before `6d9aae8b`, `updateSignals()` eagerly rebuilt three
full copies of the collection and `.set()` them, so every single-entity update
was O(size) — that commit's own message records 2.8 ms per `updateOne` on
50 000 rows. Every number below is post-fix.

#### Does a single-entity update avoid the O(size) work an array leaf pays?

Yes, decisively. 1000 single-entity updates at random ids, per update:

| N      | `entityMap.updateOne` | array leaf, deepEqual | array leaf, shallow | plain `Map.set` |
| ------ | --------------------- | --------------------- | ------------------- | --------------- |
| 1 000  | **0.245 µs**          | 5.14 µs (21x)         | 0.250 µs (1.0x)     | 0.033 µs        |
| 10 000 | **0.471 µs**          | 70.3 µs (149x)        | 2.70 µs (5.7x)      | 0.082 µs        |
| 50 000 | **0.911 µs**          | 432 µs (474x)         | 56.5 µs (62x)       | 0.168 µs        |

The write is ~5x a bare `Map.set` and effectively independent of collection size.

#### Is `byId(id).field()` genuinely body-granular?

Yes. Measured fan-out over 100 updates:

| what re-ran                   | 100 updates to entity #1 | 100 updates to entity #500 |
| ----------------------------- | ------------------------ | -------------------------- |
| `computed(byId(500).value())` | **0**                    | 100                        |
| `computed(byId(500)())`       | **0**                    | 100                        |
| `computed(all().length)`      | 100                      | 100                        |
| `computed(count())`           | **0**                    | **0**                      |

Fan-out is exactly 1. The claim holds. (`count()` re-runs 0 times because it is
itself a `computed` whose _value_ does not change, so Angular's equality stops
propagation at that node — a correct diamond, worth knowing.)

For contrast, on an array leaf: **100 updates to element #1 re-ran a computed
that reads only element #500 100 times.** No granularity at all.

#### Whole-collection read

Per `tree()` call:

| N      | `tree()` entityMap, CACHED | `tree()` entityMap, COLD (1 update first) | `tree()` array leaf |
| ------ | -------------------------- | ----------------------------------------- | ------------------- |
| 1 000  | 9.58 µs                    | 45.8 µs                                   | 0.63 µs             |
| 10 000 | 9.33 µs                    | **443.7 µs**                              | 0.67 µs             |

`entityMap.all()` alone: 0.58 µs cached, 12.3 µs cold @10 000. `tree()` on an
`entityMap` emits `[all, count, ids, map, empty]` — the collection materialised
**three times**. Retained memory is 1.18x an array leaf at 10 000 (927 KB vs
786 KB) once the computeds are warm.

#### The verdict, with its condition attached

**Does `entityMap` solve the large-collection case? Yes for the write — and only
if consumers read granularly.** The lazy computeds do not remove the O(N) work;
they defer it to the next whole-collection read. Measured as 1000 × (update,
then read):

| N      | `updateOne` + `all()` | `updateOne` + `byId()` | array leaf (shallow) + read |
| ------ | --------------------- | ---------------------- | --------------------------- |
| 10 000 | 13.05 µs              | **1.56 µs**            | 3.37 µs                     |
| 50 000 | 97.47 µs              | **1.90 µs**            | 53.34 µs                    |

- Update + **granular** read: entityMap is **28x** faster than a
  shallow-compared array leaf at 50 000, and ~475x faster than the default array
  leaf.
- Update + **whole-collection** read: entityMap is **1.8x SLOWER** than the
  array leaf at 50 000 (97 µs vs 53 µs) — it rebuilds the array from the `Map` on
  every read, where the array leaf hands back the reference it already holds.

So: is the "8x slower on large-array" finding about the wrong API? **Yes,
mostly.** The right API for a 50 000-row collection is `entityMap` + `byId()`,
and it is ~475x faster than the benchmarked one. But `entityMap` is not a free
win: a component that renders the whole list from `all()` after every write is
_worse off_ than a plain array leaf with `useShallowComparison`. The benchmark
should be re-cut into two scenarios — granular consumer and whole-list consumer —
rather than simply replaced.

#### Two `entityMap` defects found while measuring

1. **A held `byId()` reference is permanently dead after remove → re-add of the
   same id.** `removeEntitySignal` deletes the per-entity signal, so a node
   captured earlier closes over an orphan. Verified: after `removeOne(1)` then
   `addOne({ id: 1, … })`, the held node reads `undefined` forever while a fresh
   `byId(1)` returns the new entity. Held references survive _updates_ correctly
   (same per-entity signal), so this is specifically the remove/re-add path — and
   the held reference is exactly the capability the header table calls the
   product.
2. **`byId()` allocates a new node on every call after a mutation.** Every
   mutation does `nodeCache.delete(id)`, so the next `byId()` rebuilds the node
   and one `computed` per field. ~1.0–1.1 µs per post-write `byId()` on a 3-field
   entity (1.56 µs for update+byId vs 0.47 µs for the update alone). A template
   calling `byId()` every change-detection pass pays this per field per pass.

---

### F-3. Where the deep-equality default actually pays for itself

**Establish the scope first, because it is much narrower than it looks:**
`signalTree` recurses into plain objects, so **a plain object is never a leaf** —
it becomes one signal per primitive field. Verified: `tree.$.obj.set` is
`undefined` (a branch), `tree.$.arr.set` is a function (a leaf). For a primitive
leaf `deepEqual` returns at its first line, `a === b`. **The `equal: deepEqual`
bill is paid only by leaves holding arrays or built-ins.** Everything below is
therefore a question about collection leaves.

#### What it suppresses (500 polls of a 200-row list)

| workload                        | real changes     | deepEqual notified | `Object.is` notified | spurious suppressed |
| ------------------------------- | ---------------- | ------------------ | -------------------- | ------------------- |
| identical payload every poll    | 0                | **0**              | 500                  | 500 (100%)          |
| one row changes every 10th poll | 50 (+49 reverts) | **99**             | 500                  | 401 (80%)           |
| one row changes every poll      | 500              | 500                | 500                  | 0 (0%)              |

It does exactly what it claims: 100% suppression on a steady-state poll, 80% on
a mostly-quiet one. And the honesty argument is real, and is _not_ a performance
trade-off:

> 100 re-fetches of an identical payload, paths reported by `updateAndReport`:
> **deepEqual = 0, `Object.is` = 100.**

Under reference equality `updateAndReport` reports a change on every re-fetch
that changed nothing. That is the feature breaking, not getting slower.

#### What it costs per write

Linear in leaf size, and it depends entirely on whether the elements are
reference-shared with the previous value:

- **Elements shared by reference** (a local edit via `slice()`): **~7.7 ns per
  element** up to the first difference (see F-1c).
- **Elements all fresh** (a network re-fetch, `JSON.parse`): **~124 ns per row**
  for a 4-field row, dead flat from 10 to 100 000 rows (1.22 µs → 12 494 µs).

Per write on a leaf holding an identical fresh payload (the worst case):

| rows   | deepEqual  | `Object.is` |
| ------ | ---------- | ----------- |
| 1      | 0.14 µs    | 0.03 µs     |
| 10     | 1.17 µs    | 0.03 µs     |
| 100    | 11.09 µs   | 0.05 µs     |
| 1 000  | 108.8 µs   | 0.28 µs     |
| 10 000 | 1 075.7 µs | 1.37 µs     |

#### Crossover — and there isn't one

Does the deep compare cost less than the downstream recomputes it prevents?
Measured with D dependent selectors, each an O(leaf) pass, on an
identical-payload poll (deepEqual / `Object.is`, µs per poll):

| rows   | D = 1        | D = 2        | D = 4        |
| ------ | ------------ | ------------ | ------------ |
| 10     | 1.16 / 0.18  | 1.16 / 0.14  | 1.19 / 0.25  |
| 100    | 11.34 / 0.20 | 11.08 / 0.28 | 11.35 / 0.50 |
| 1 000  | 113.5 / 0.93 | 113.7 / 1.64 | 119.6 / 3.13 |
| 10 000 | 1 132 / 8.24 | 1 178 / 17.1 | 1 202 / 31.2 |

**deepEqual loses at every size and every fan-out tested.** The reason is a
constant: `deepEqual` costs ~124 ns per row while a selector pass over the same
row costs ~0.8 ns. One deep compare is worth **~155 selector passes**. You would
need roughly 150 dependent computeds over the same leaf — or one whose per-row
work is ≥124 ns, e.g. a DOM write or a date parse per row — before it pays for
itself on CPU alone.

So: **`equal: deepEqual` on collection leaves is not defensible as a performance
optimisation. It is defensible only as a correctness guarantee** — the
`updateAndReport` result above, and not notifying on a no-op re-fetch. That is a
real guarantee and worth keeping; it should just stop being described as though
it saves work.

#### Is a size-adaptive default defensible?

**Not on the axis of size — on the axis of provenance.** Cost per element does
not change with size (124 ns/row, flat across four orders of magnitude), so any
element-count threshold is arbitrary: it does not separate a cheap case from an
expensive one, it picks a point on a straight line and changes the _semantics_ on
either side of it. A leaf that silently switches from "honest change reporting"
to "reports every re-fetch as a change" at 501 rows is a worse API than either
endpoint.

What the data actually separates is:

- **reference-shared writes** (local edit through `update()`/`slice()`) —
  7.7 ns/element, short-circuits at the first difference, effectively free. Keep
  `deepEqual`.
- **all-fresh writes** (a re-fetch replacing the leaf wholesale) — 124 ns/row,
  full walk, and simultaneously _the only case where the suppression is worth
  anything_. The expensive case and the valuable case are the same case.

If a threshold is wanted anyway, the numbers to hang it on: the walk stays under
100 µs to ~800 fresh rows and under 1 ms to ~8 000; above ~10 000 fresh rows a
single re-fetch write costs more than a frame. My recommendation is an **opt-in
per-leaf** escape (`Object.is` on a named leaf, or an `entityMap`, which sidesteps
the question by never putting the collection in a leaf) rather than a
size-adaptive global default.

---

### What I could not establish

- **Why the demo reports 11.3 ms.** I bounded it (impossible for the stated
  workload: a bare `slice()` of 50 000 elements is 47–49 µs, the demo implies
  11.3 µs per update) but did not instrument the demo in Chrome. Remaining
  candidates: `dataSize` is not what the label says, the timed region is not what
  it looks like, or the reported result is not that scenario's.
- **Everything here is Node v24.3.0 on an Apple M4.** No Chrome numbers. The
  ordering should hold; the constants will not. The 385 ms reproduction is the
  one cross-checked result.
- **Retained memory is a process-heap delta under `--expose-gc`**, not
  heap-snapshot retainer analysis. The 555 B/leaf figure is stable to ~±1% across
  three sizes and three runs, so I trust the magnitude, but I have not attributed
  it field-by-field inside Angular's `SIGNAL_NODE`.
- **`entityMap` with a `sortComparer`** — `all()`/`ids()` gain a sort, so the
  cold-read numbers in F-2 are a lower bound. Not measured.
- **The `lazy: lazy()` path** — every construction, read and memory number is the
  eager default. Whether lazy materialisation moves the 555 B/leaf figure is open,
  and is probably the highest-value follow-up.
- **`entityMap` in cache-aware/`loader()` mode** — only the plain client-side
  collection was measured.
- **Time travel with `includePayload: false`**, and with the default
  `maxHistorySize: 50` — large caps were used to isolate per-entry cost. The
  default caps _retained_ memory at 50 × entry (~12 MB at 10 000 leaves) but does
  not change per-entry CPU.
- **Whether F-1d-ter reproduces in a browser** under Angular's own microtask
  scheduling. The mechanism is in the source (`getPathNotifier().onFlush`, never
  scoped to the tree), so I expect it to, but it was measured only in Node.
- **The other unreconciled item** — batch-updates / computed-chains /
  selector-memo / concurrent-updates — is untouched by this track.

### Reproduction

```bash
npx nx build core
node --expose-gc scripts/benchmarks/data-model-profile.mjs           # all but the two below
node --expose-gc scripts/benchmarks/data-model-profile.mjs ttentity  # needs a clean process
node --expose-gc scripts/benchmarks/data-model-profile.mjs ttleak    # needs a clean process
```

## Synthesis

## Synthesis

**No pivot. The model is right, and the reason is sharper than "we measured
faster" — it is that one competitor tried the strictly-better-looking thing and
the measurement shows why it does not work.**

### The question this spike was actually answering

Tracks D, E and F were run to decide whether per-leaf ownership is the right
data model for SignalTree, or an accident we should correct before 14.0.0 froze
the snapshot format. The answer has three parts.

### 1. Four models, and the trade is real

Nothing surveyed gets all three of {O(1) whole-state read, O(1) snapshot,
sub-µs partial write}. Track E's five shipping models reduce to a single
sentence each:

| model                          | who                                  | what it buys                              | what it costs                                                 |
| ------------------------------ | ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| Immutable value at root        | immer, Immutable.js, `@ngrx/signals` | free snapshot, O(1) whole-state read      | O(width) writes; no granularity below the root                |
| Mutable POJO + lazy side index | Vue, Solid, Legend-State             | O(1) read **and** sub-µs write            | no durable snapshot — a capture is a deep clone, 17.7–37.7 ms |
| Per-leaf owned                 | **SignalTree**, MobX                 | O(1) writes at any size, fan-out 1        | reads-as-a-whole must be materialised                         |
| Versioned shared snapshot      | Valtio                               | mutate in place _and_ a shared POJO       | the snapshot walk is O(total), not O(changed)                 |
| CRDT op log                    | Yjs, Automerge                       | structural time travel, 34-byte snapshots | writes 11–250 µs, materialise 4.2–271 ms                      |

**SignalTree bought the write.** MobX is the independent evidence that the
materialisation bill is a property of the model rather than of our
implementation: its `toJS` measures **176 ms**, the worst non-CRDT number in the
survey.

### 2. Valtio is the finding, not the benchmark

Model 4 is what a greenfield build would reach for: mutate in place, hand back a
structurally-shared POJO, get everything at once. The sharing is real and was
verified directly (`probe-valtio-sharing.mjs`). **And the snapshot still costs
4.2 ms after touching one deep field at 50k**, because `ensureVersion` must poll
every descendant once the global counter moves.

> Caching the result does not help if you have to walk the tree to discover the
> cache is valid.

That is the whole argument for the architecture we have, and it is mechanical
rather than comparative. SignalTree's materialisation is one `computed` per node
in a `WeakMap`, so **invalidation propagates at WRITE time through Angular's
dependency graph** and a clean subtree's memo is never consulted. Valtio has a
version counter and no graph, so staleness can only be _discovered at read time_
— and discovery is a walk. Same ambition, asymptotically different result,
because one has a dependency graph and the other has a number.

So the ranking is not "SignalTree is faster than Valtio." It is: **per-leaf
ownership plus memoised incremental materialisation over a reactive graph is the
only surveyed combination that gets granular writes, fan-out-1 notification and
an O(changed) _serialisable_ snapshot simultaneously.**

### 3. What a greenfield build would genuinely change — and what it would not

**Would not: chunk the collection.** Track D's bounded-fanout result is real —
`immutable.List` at 50k does update in 97 ns, retains 2.0 KB per version and
localises a change in 152 ns flat in N, and reference-equality diffing on a flat
50k array is _2.7x slower_ than `deepEqual` while the trie version is 0.26 µs.
It is nonetheless the wrong fix here, and reading the code is what settles it:
`entityMap.all` must hand back `E[]`, so a chunked store still flattens on read
— chunked materialisation measures **52 µs against `slice()`'s 38.7 µs**, i.e.
slightly _worse_. The per-version memory and diff wins only materialise if the
SNAPSHOT stays chunked, and then `tree().rows.all` is no longer an array, which
contradicts the format 14.0.0 just committed to.

**So the O(width) history cost is the price of the snapshot thesis, not a
defect.** elf undoes in 3 µs because its state _is_ the shared immutable
structure and it never has to produce a flat array to record a version. You can
have "a snapshot is a plain JSON-shaped value" or "a history entry over a
collection is O(changed)". Not both. We chose the first, and persistence, SSR
and devtools are why.

**Would change: let a marker decline HISTORY capture separately from
SERIALISATION capture.** Today `transient: true` opts out of both, so a
10k-row grid that wants persistence is forced into the undo stack, and
`entityMap`'s `snapshot` hook (`{ all: node.all() }`) makes every
collection-mutating write O(collection) once `timeTravel()` is attached.
`pauseRecording()` is the imperative workaround shipped in 14.0.0; the
declarative one is a flag on the marker contract, and it fits the M5/M6
vocabulary the release already built.

### 4. Two premises this spike overturned, worth not re-deriving

- **Structural sharing alone buys nothing for diffing.** The win is bounded
  fanout, not sharing. Every structure measured shares >99.6% of objects after a
  single-field update, so counting shared objects is a vanity metric.
- **"Depth is free; width is the entire bill."** immer's 15-deep/50k-wide update
  allocates 392 KB, of which **99.6% is one array node and 0.4% is the fifteen
  levels of depth**. Our deep-nesting win is real but it is not "we avoid a huge
  copy along the path" — the path copy is cheap. It is that we avoid the wide
  node and allocate nothing.

### 5. The one free win, and why it is closed

Track D proposed that a leaf's `equal()` could be `===` (3.9 ns) rather than
`deepEqual` (90.6 µs) once the write path guarantees reference-identical
unchanged subtrees — a projected 23,000x on the equality term. **Both halves are
refuted** and it should not be re-proposed: the projection came off the
in-process megamorphism phantom plus a no-op fixture, and re-measured in
isolated processes `Object.is` is flat at ~41 ms against `deepEqual`'s 49 ms
(head) — while the guarantee _cannot exist at a leaf_, because a leaf value
comes from the caller and an HTTP re-fetch hands you a brand-new array. Making
`===` the default would report every re-fetch as a change, which is exactly the
correctness property `deepEqual` provides.

### Status of the four goals

| goal                   | verdict                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Fast partial updates   | **Achieved**, and independent of state size — 0.006 ms at 1,024 root props against 21.4 ms                                               |
| Cheap "what changed"   | **Achieved** — the write already located the leaf; `updateAndReport()` returns the paths                                                 |
| Cheap time travel      | **Achieved for nested state** (an entry is O(depth) and shares clean subtrees); **O(width) for collections**, by construction, see §3    |
| Fast whole-state reads | **Traded away deliberately.** Incremental materialisation makes it O(changed) rather than O(state), which is as close as this model gets |
