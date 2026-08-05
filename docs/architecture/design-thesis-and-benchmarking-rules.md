# SignalTree: the design thesis, and the rules for reasoning about it

**Read this before benchmarking SignalTree, before "optimising" anything, and
before comparing it to another library.** It exists because the same mistakes
were made repeatedly — by a human reviewer and by AI agents — and each one cost
hours and produced a wrong conclusion that shipped.

---

## 1. The thesis, in one paragraph

State is a **tree whose leaves are Angular signals** and whose branches are plain
callable accessors. A write goes to **one leaf**. Nothing above it is rebuilt,
copied, or invalidated. That is a deliberate rejection of the Redux/immutable
model, where every write reconstructs the object graph along the path to the
change and hands you a whole new state value.

Two things follow, and they are the product:

1. **Partial writes are O(1) regardless of state size.** Updating one field in a
   50,000-row store costs the same as updating one field in a 3-field store.
2. **You know exactly what changed, at write time, for free.** The write already
   located a single leaf. Nothing needs to be diffed to discover it.

The DX layer — dot-notation, JSON-shaped, `tree.$.a.b.c()` — is a separate goal:
make the tree feel like plain JSON. It is not in tension with the above.

---

## 2. What the shape costs, honestly

The bill for per-leaf ownership is **materialisation**: there is no plain object
anywhere until you build one. `tree()` walks the signal graph and constructs a
POJO, O(state).

How big a bill: a POJO-backed store returns its state **by reference** in
~0.0007 ms; `tree()` at 100k leaves is **13.9 ms**. That is four orders of
magnitude, not the "~2.25x" an earlier revision of this document claimed — that
figure came from a demo scenario that measured something else entirely.

This is not an implementation flaw; it is a property of the model, and there is
independent evidence. MobX is the closest structural cousin (one atom per
property, no POJO anywhere) and its `toJS` on the same fixture measures
**176,000 µs** — the worst materialisation of any non-CRDT library surveyed.

**The correct response is not to make materialisation fast. It is to stop
calling it.** Serialisation is rare in real applications. Anything that
materialises the whole tree _on every change_ has imported the Redux cost model
into a library built to escape it.

### The measured landscape

From `docs/research/2026-08-state-data-model-spike.md` (Track E — 11
configurations, one fixture, same four operations):

| model                          | who                                | partial write                                   | whole-state read | snapshot              |
| ------------------------------ | ---------------------------------- | ----------------------------------------------- | ---------------- | --------------------- |
| Immutable value at the root    | immer, Immutable.js, @ngrx/signals | slow (path copy; 42–66 µs for a 50k collection) | **O(1)**         | **free**              |
| Mutable POJO + lazy side-index | Vue, Solid, Legend-State           | **sub-µs**                                      | **O(1)**         | deep clone (18–38 ms) |
| Per-leaf owned                 | **SignalTree**, MobX               | **O(1)**                                        | materialise      | materialise           |
| CRDT                           | Yjs, Automerge                     | slow                                            | slow             | **structural**        |

**Nothing surveyed gets all three of** {O(1) whole-state read, O(1) snapshot,
sub-µs partial write}. The trade is real. SignalTree bought the write.

---

## 3. THE BENCHMARKING RULE

> **Compare TASKS, not implementations.**

Normalise the _user-facing outcome_. Let each library use its own best idiom to
get there. Never force one library to adopt another's data model "for fairness" —
that measures the first library impersonating the second, which is a thing no
application ever does.

This rule was violated repeatedly and it cost the most:

- Forcing SignalTree to rebuild a 50k array immutably (because `patchState` must)
  produced **"SignalTree is 8× slower on large collections."** A real app uses
  `entityMap()`. With the idiomatic API the same task is **28.5× faster** than
  SignalStore (1.63 ms vs 46.56 ms; the array-leaf idiom is 49.80 ms, i.e. at
  parity, not 8× behind). Wrong API, wrong conclusion — and the wrong framing
  **hid a real O(n) defect in `entityMap` for weeks**.
- "Fairness" edits that equalise implementations usually _introduce_ bias. Two
  were found in the demo pointing in opposite directions: our arm started the
  clock before constructing a 50k array (penalising us); their arm used
  `map(cb)` where ours used `slice()` (flattering us, ~8×).

### Corollaries

- **A capability the competitor lacks is not cheating.** SignalTree can hold a
  stable write handle (`const leaf = tree.$.a.b.c` then `leaf.set(x)`). ngrx can
  do this at depth 1 only; immer, Immutable.js and Automerge cannot at all.
  Measuring it is legitimate — just label it, and report the walked path too.
- **Never pool samples across scenarios.** A deep-nested sample is ~0.1 ms and a
  selector sample is ~15 ms; a pooled median measures the scenario _mix_, and
  moves when you add a scenario rather than when a library gets faster. Use the
  geometric mean of per-scenario ratios.
- **A skipped scenario must be loud.** An unimplemented benchmark once silently
  dropped from _our_ aggregate while still counting against every competitor
  that ran it.
- **Single runs lie.** Report medians and spread, and call a difference real
  only if it exceeds both arms' spread. Two wrong conclusions in this project
  came from single runs.
- **But do NOT interleave arms in one process** — that advice, which this
  document previously gave, was measured and is wrong here. See realisation 13:
  a third arm of a different kind made one arm 7.5× slower while leaving the
  others untouched. **One process per arm**, repeated, is the ground truth.

---

## 4. THE ANTI-PATTERN: full-state work per change

> If only one leaf changed, no code path may do O(state) work.

This is the video-frame principle: you do not re-encode every pixel because one
moved. Every violation below was found by measurement, not review.

### Confirmed violations

**`timeTravel()` — the worst, because it is the feature the architecture exists
to enable.** Every recorded entry does `snapshotState()` (materialise the whole
tree) then `structuredClone()` (deep copy the whole tree). Measured, 50 root
writes that each change ONE number:

| collection size | no timeTravel | with timeTravel |
| --------------- | ------------- | --------------- |
| 100 rows        | 0.06 ms       | 2.85 ms         |
| 1,000 rows      | 0.03 ms       | 29.51 ms        |
| 10,000 rows     | **0.03 ms**   | **340.60 ms**   |

Writes are O(1) until you turn on time travel, at which point they become
O(state) and scale with data you did not touch. ~17 KB retained per entry at
5,000 rows.

It also **does not record direct leaf writes at all** (`tree.$.a.b.set(x)`
leaves history untouched), so undo silently cannot restore them.

**`serialization()` change detection** polls with `JSON.stringify(tree())` —
materialise plus stringify the entire tree, on a timer, to discover whether
anything changed.

**`entityMap` — FIXED (13.5.0), with a caveat.** `updateSignals()` rebuilt `all`/`ids`/`count`/
`map` on every single-entity mutation: three full copies of the collection plus a
deep-equality compare on each. `updateOne` was O(size) — 2,831 µs on 50k rows —
in the flagship _collection_ API whose storage write is O(1). Now the queries are
lazily computed from a version counter: **under 1 µs, flat across 1k/10k/50k**
(0.91 µs vs 432 µs for a plain array leaf on a single-write micro-benchmark;
at TASK level, 1000 toggles of a 50k collection, it is 1.63 ms vs 49.80 ms —
quote the task number, not the micro one), with a fan-out of exactly 1
(100 updates to one entity caused ZERO recomputes of a computed reading another;
the array leaf re-ran 100/100).

The caveat: the O(N) work is **deferred, not removed**. `update + byId()` is
1.90 µs, but `update + all()` is 97.47 µs — 1.8× _slower_ than a
shallow-compared array leaf. `entityMap` wins decisively when readers are
per-entity and loses when every write is followed by a whole-collection read.
Also: `tree()` over an `entityMap` emits the collection three times (`all`,
`ids`, `map`), which is why time travel over one costs 414× the bare write.

### The fix pattern

The information needed is already there. `recursiveUpdate` collects changed
dot-paths (that is what `updateAndReport()` returns). Any consumer that currently
materialises the whole tree can instead consume `{ path, before, after }`:

- **time travel** → store the diff, not the frame. O(changes) per entry instead
  of O(state), and it makes long histories affordable, which is the actual
  feature.
- **serialisation change detection** → subscribe to changed paths instead of
  polling a stringified snapshot.
- **persistence** → write only the touched slice.

---

## 5. Realisations worth not re-deriving

Each of these was learned the expensive way.

1. **Only leaves are signals.** Branches are plain callable functions with no
   `.set`/`.update`. Calling a leaf with an argument is a silent no-op — that is
   why `@signaltree/callable-syntax` exists as a build-time transform.
2. **Materialisation is the tax for O(1) writes.** Don't try to make `tree()`
   fast; make fewer things call it.
3. **Deep equality on leaves costs O(index of first difference), not O(size).**
   It short-circuits — ~7.7 ns per reference-identical element — so a change near
   the front of a 50k array costs +3.8 µs and a change at random costs +170 µs.
   The pathological case is a payload with NO difference at all (+337 µs), which
   is exactly what a re-fetch produces.

   It never pays for itself on CPU: ~124 ns/row versus ~0.8 ns for a selector
   pass, so one deep compare is worth ~155 selector passes, and it loses at every
   size and dependent count measured. It is defensible **purely as correctness** —
   `updateAndReport` reports 0 changed paths across 100 identical re-fetches
   under `deepEqual` and 100 under `Object.is`.

   **A size-adaptive default is NOT defensible** and was rejected on the
   measurement: cost per element is flat, so a size threshold picks an arbitrary
   point on a straight line and silently flips semantics either side of it.
   `useShallowComparison` stays an explicit opt-in.

4. **A `Map` is not automatically faster.** A per-node `Map` index cost +12% on
   subtree reads and 310 B/node with no measured safety benefit over an
   own-property check; it was built, measured and reverted.
5. **`Object.create(null)` is not free.** V8 puts null-prototype objects in
   dictionary mode: measured +51% on `unwrap`.
6. **`a instanceof X && b instanceof X` short-circuits; `||` does not.** Rewriting
   the built-in checks with `||` cost +60% on Dates and +43% on arrays.
7. **Enhancers must copy property DESCRIPTORS, not `Object.assign`.** Every tree
   method is non-enumerable; `Object.assign` silently dropped all of them and
   `updateAndReport` returned `[]` while losing the write.
8. **Direct leaf writes bypass everything at the root** — time travel, path
   notification, guardrails. Any feature that must see all writes has to
   instrument the leaves, not the root. No surveyed library achieves a root
   chokepoint; the ones with full coverage instrument leaves.
9. **The demo's `large-array` number is arithmetically impossible.** It reports
   11.3 ms for 1000 updates — 11.3 µs each — when a bare `slice()` of a 50k array
   is 47–49 µs on its own. Do not cite that scenario. (The duplicated
   `ARRAY_UPDATES` constant was investigated and is NOT the cause: the two live
   in different namespaces, `ITERATIONS.*` and `YIELD_FREQUENCY.*`.)

10. **Benchmark fixtures must actually change the value.** Three harnesses in
    this repo built items as `{id: i, value: i}` and then "updated" index `i % N`
    with `value: i` — writing the value already there. Every update was a
    structurally identical no-op, which is deepEqual's WORST case (no
    short-circuit, full walk) and inflated a 53–218 ms workload to 385 ms. A
    per-pass counter that never repeats avoids it, and the replay variant of the
    same trap (fixtures are reused across samples, so `-(i+1)` degenerates from
    pass 2).

11. **`timeTravel()` used to cost you other people's trees.** It subscribes to
    the GLOBAL PathNotifier flush, so every time-travelled tree materialised and
    deep-cloned ITSELF whenever any tree in the process flushed — 0.008 ms →
    9.7 ms as three unrelated 10k-leaf trees were kept alive. Fixed by gating on
    a self-dirty flag; cost is now flat.

12. **The benchmark harness's own array-leaf figure swings 5.7× on WHERE the
    change lands**, because deepEqual is O(index of first difference). Same 1000
    updates to a 50k array leaf: index 0 → 89 ms, moving index → 92 ms, last
    index → 487 ms, no change at all → 506 ms. The target index is part of the
    workload definition and must be stated with any array-leaf number.

13. **Interleaving arms in one process produced a 7.5× phantom.** The SignalTree
    array-leaf arm measured ~50 ms alone, ~50 ms against any ONE other arm, and
    ~375 ms as soon as a THIRD arm of a DIFFERENT KIND joined — while the
    plain-JS and SignalStore arms were unmoved. Three IDENTICAL SignalTree arms
    were all fast (55/54/54 ms), so it is not arm count; an 8 GB old-space and a
    64 MB semi-space changed nothing, so it is not GC. It is V8 megamorphism at
    a call site shared by the arms, and the cost lands on whichever arm's hot
    loop sits inside a shared generic function.

    This is the worst class of measurement bug: the number **moves when you add
    an unrelated arm**, so the same library scores differently depending on who
    else is in the benchmark that day. Run one process per arm.

14. **A held `byId()` reference used to die permanently across remove → re-add.**
    The node captured the per-entity signal once; removal deleted it from the
    map and the re-add made a new one, leaving the held reference reading an
    orphan forever. Holding a nested reference is the capability this library has
    and immutable stores do not, so it has to survive churn. Now resolved through
    the map per read.

---

## 6. What the data-model survey settled (Track D)

Independent measurement of persistent/immutable structures, run against the
premises in section 2 rather than in support of them. Three overturned
something.

### The four goals are two

Fast partial updates, cheap time travel, and cheap "what changed" are **not
three goals** — they are one property with one cause: **no node has more than
~32 children.** `immutable.List` at 50k gets all three at once with nothing
traded: update 97 ns, 2.0 KB retained per version, restore 3.9 ns (deref a held
root), and localise a change in 152 ns **flat in N** (95 ns at 1k → 187 ns at
1M).

Only **fast whole-state reads** is in genuine tension, and it is structural, not
a constant factor. "Read the whole state in O(1)" means _returning a reference to
a POJO_, and a POJO's array node **is** the collection. The same fact runs both
ways: POJO state reads in 0.3 ns and updates one of 50k elements in 32 µs /
400 KB; trie state updates in 97 ns / 2.0 KB and materialises in 967 µs.

Chunking at C ≈ √N is the resolvable middle — update 110 ns (343×), 4.1 KB per
version (98×), diff 2.1 µs, materialise 52 µs — and you pay for it by giving up
"return the reference".

### Overturned premises

- **Structural sharing alone buys nothing for diffing.** Reference-equality
  diffing measured **2.7× SLOWER than the deep comparison** on a plain 50k array
  (232 µs vs 87 µs): you still scan 50,000 slots, and the per-slot recursion
  overhead beats `deepEqual`'s inlined loop. The trie version is 0.26 µs. **The
  win is bounded fanout, not sharing.**
- **Depth is free; width is the entire bill.** immer's 15-deep, 50k-wide
  single-field update allocates 392 KB, of which **99.6% is one array node and
  0.4% is the fifteen levels of depth.** Measuring structural sharing by object
  count is a vanity metric — everything shares >99.6% of objects. Note what this
  does to our own framing: the deep-nested win is real, but it is not "we avoid
  a huge copy," because the copy along a deep path is cheap. It is that we avoid
  the _wide_ node, and that we do no allocation at all.
- **A 32-way trie is not 32-way in practice.** `immutable.Map` measured fanout
  **3.79** and depth **6** at 1M string keys (30.6 / 4 on integer keys) — the
  JVM-style string hash leaves high bits correlated for common-prefix keys, and
  one level-5 fragment occupies 13 of 32 values.
- `@thi.ng/associative` contains **no HAMT** at all; its `HashMap` is a mutable
  open-bucket map. `immutable.List.splice` is worse than a plain array at every
  size (31.7 ms vs 806 µs at 1M) where RRB does it in 1.5 µs.
- `Object.create(null)` is **always** dictionary mode: 33× on spread, 9.9× on
  read. (Consistent with realisation 5's +51% on `unwrap`, and worse than it.)

### The "free win" that is not free, and not that big

Track D proposed that a leaf's `equal()` could be `===` (3.9 ns) instead of
`deepEqual` (90.6 µs) once the write path guarantees unchanged subtrees are
reference-identical, projecting 90.6 ms → 4 µs on the 1000-write/50k-array
scenario. Both halves need correcting:

1. **The projection came off the 385 ms figure, which was the in-process
   megamorphism phantom** (realisation 13) plus the no-op fixture. Re-measured
   in isolated processes, `deepEqual` vs `Object.is` on the same workload:

   | change position    | deepEqual | `Object.is` | deepEqual's share |
   | ------------------ | --------- | ----------- | ----------------- |
   | head (index 0–999) | 49.11 ms  | 40.67 ms    | **8.4 ms — 17%**  |
   | tail (index N−1−i) | 379.96 ms | 42.30 ms    | 338 ms — 89%      |
   | no change at all   | 383.88 ms | 41.28 ms    | 343 ms — 89%      |

   `Object.is` is **flat at ~41 ms** regardless of position, so `deepEqual` is
   the entire position-sensitivity — and ~41 ms is the irreducible
   `slice()`+spread floor that no equality change can touch.

2. **The guarantee does not exist at a leaf.** Reference-identity of unchanged
   subtrees is something an internal write path can promise; a leaf value comes
   from the caller. An HTTP re-fetch hands you a brand-new array, and no write
   path can make it reference-identical to the old one. Switching the default to
   `===` would report every re-fetch as a change — which is exactly the
   correctness property `deepEqual` is there to provide.

**The actionable conclusion is not to tune the equality.** Even the best case for
an array leaf (40.67 ms, shallow) barely beats SignalStore's 46.56 ms, while
`entityMap` is 1.63 ms — 25× better than either. Modelling a collection as an
array leaf is the mistake; the equality function is a rounding error on it.

---

## 7. Open optimisation candidates, ranked

1. **Diff-based time travel.** Biggest win available; turns the flagship feature
   from O(state)-per-write into O(changes)-per-write and makes deep histories
   viable. Needs a granularity setting (per-leaf vs per-transaction).
2. **Record leaf writes in time travel** — correctness, not speed: undo currently
   cannot restore a direct leaf write.
3. **Push-based serialisation change detection**, replacing the
   `JSON.stringify(tree())` poll.
4. **Bounded fanout for large leaf collections** (chunking at C ≈ √N). Track D's
   result says this is the single change that would buy fast partial updates,
   cheap time travel and cheap change-detection _together_, because they share
   one cause. It is also the only candidate here that is a data-structure
   change rather than a bookkeeping change. Cost: `tree()` can no longer return
   a reference. `entityMap` already achieves the same effect for the case that
   matters, so this is only worth it if plain large array leaves must be fast.
   (Size-adaptive leaf equality was previously listed here and is **rejected** —
   see realisation 3.)
5. **Lazy/cached `tree()`** — a version-stamped materialisation so repeated reads
   between writes are free, mirroring what `entityMap` now does for `all()`.
