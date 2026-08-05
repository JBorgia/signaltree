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
materialises the whole tree *on every change* has imported the Redux cost model
into a library built to escape it.

### The measured landscape

From `docs/research/2026-08-state-data-model-spike.md` (Track E — 11
configurations, one fixture, same four operations):

| model | who | partial write | whole-state read | snapshot |
| ----- | --- | ------------- | ---------------- | -------- |
| Immutable value at the root | immer, Immutable.js, @ngrx/signals | slow (path copy; 42–66 µs for a 50k collection) | **O(1)** | **free** |
| Mutable POJO + lazy side-index | Vue, Solid, Legend-State | **sub-µs** | **O(1)** | deep clone (18–38 ms) |
| Per-leaf owned | **SignalTree**, MobX | **O(1)** | materialise | materialise |
| CRDT | Yjs, Automerge | slow | slow | **structural** |

**Nothing surveyed gets all three of** {O(1) whole-state read, O(1) snapshot,
sub-µs partial write}. The trade is real. SignalTree bought the write.

---

## 3. THE BENCHMARKING RULE

> **Compare TASKS, not implementations.**

Normalise the *user-facing outcome*. Let each library use its own best idiom to
get there. Never force one library to adopt another's data model "for fairness" —
that measures the first library impersonating the second, which is a thing no
application ever does.

This rule was violated repeatedly and it cost the most:

- Forcing SignalTree to rebuild a 50k array immutably (because `patchState` must)
  produced **"SignalTree is 8× slower on large collections."** A real app uses
  `entityMap()`. With the idiomatic API the same task is **56× faster** than
  SignalStore. Wrong API, wrong conclusion — and the wrong framing **hid a real
  O(n) defect in `entityMap` for weeks**.
- "Fairness" edits that equalise implementations usually *introduce* bias. Two
  were found in the demo pointing in opposite directions: our arm started the
  clock before constructing a 50k array (penalising us); their arm used
  `map(cb)` where ours used `slice()` (flattering us, ~8×).

### Corollaries

- **A capability the competitor lacks is not cheating.** SignalTree can hold a
  stable write handle (`const leaf = tree.$.a.b.c` then `leaf.set(x)`). ngrx can
  do this at depth 1 only; immer, Immutable.js and Automerge cannot at all.
  Measuring it is legitimate — just label it, and report the walked path too.
- **Never pool samples across scenarios.** A deep-nested sample is ~0.1 ms and a
  selector sample is ~15 ms; a pooled median measures the scenario *mix*, and
  moves when you add a scenario rather than when a library gets faster. Use the
  geometric mean of per-scenario ratios.
- **A skipped scenario must be loud.** An unimplemented benchmark once silently
  dropped from *our* aggregate while still counting against every competitor
  that ran it.
- **Single runs lie.** Interleave arms in one process, rotate arm order per
  sample, report medians and IQR, and call a difference real only if it exceeds
  both arms' spread. Two wrong conclusions in this project came from single runs.

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
| 100 rows | 0.06 ms | 2.85 ms |
| 1,000 rows | 0.03 ms | 29.51 ms |
| 10,000 rows | **0.03 ms** | **340.60 ms** |

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
in the flagship *collection* API whose storage write is O(1). Now the queries are
lazily computed from a version counter: **under 1 µs, flat across 1k/10k/50k**
(0.91 µs vs 432 µs for a plain array leaf — 474×), with a fan-out of exactly 1
(100 updates to one entity caused ZERO recomputes of a computed reading another;
the array leaf re-ran 100/100).

The caveat: the O(N) work is **deferred, not removed**. `update + byId()` is
1.90 µs, but `update + all()` is 97.47 µs — 1.8× *slower* than a
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

12. **A held `byId()` reference used to die permanently across remove → re-add.**
    The node captured the per-entity signal once; removal deleted it from the
    map and the re-add made a new one, leaving the held reference reading an
    orphan forever. Holding a nested reference is the capability this library has
    and immutable stores do not, so it has to survive churn. Now resolved through
    the map per read.

---

## 6. Open optimisation candidates, ranked

1. **Diff-based time travel.** Biggest win available; turns the flagship feature
   from O(state)-per-write into O(changes)-per-write and makes deep histories
   viable. Needs a granularity setting (per-leaf vs per-transaction).
2. **Record leaf writes in time travel** — correctness, not speed: undo currently
   cannot restore a direct leaf write.
3. **Push-based serialisation change detection**, replacing the
   `JSON.stringify(tree())` poll.
4. **Size-adaptive leaf equality**, with a measured crossover.
5. **Lazy/cached `tree()`** — a version-stamped materialisation so repeated reads
   between writes are free, mirroring what `entityMap` now does for `all()`.
