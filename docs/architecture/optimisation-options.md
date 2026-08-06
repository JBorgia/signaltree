# Optimisation options for SignalTree, surveyed and measured

Companion to [design-thesis-and-benchmarking-rules.md](./design-thesis-and-benchmarking-rules.md).
That document says what the architecture is and what it costs. This one enumerates
**what could be done about the costs** — deliberately broadly, so the obvious
first answer has to compete rather than win by default.

Forty-one options across nine families. Each is marked:

- **MEASURED** — a number in this document came from a harness run for it.
- **REASONED** — the mechanism is understood, the magnitude is not measured.
- **REJECTED** — measured or reasoned, and it loses. The reason is recorded so
  it does not come back.

The ranked shortlist is at the bottom. Read that first if you want the answer;
read the families if you want to know what it beat.

---

## 0. The measurements this document is built on

All figures: Node 24.3 / V8 13.6, isolated processes (one arm per process — see
realisation 13 in the thesis document for why in-process races are unusable
here), median of 7–11 samples.

### Per-write equality cost, by leaf type (2M writes)

| leaf type            | `deepEqual` | `Object.is` | hand-specialised |
| -------------------- | ----------- | ----------- | ---------------- |
| number               | **6.5 ns**  | 8.1 ns      | 8.2 ns           |
| boolean              | 11.6 ns     | **9.3 ns**  | 10.1 ns          |
| Date                 | 14.8 ns     | 8.6 ns      | 9.0 ns (getTime) |
| string               | 24.9 ns     | **10.3 ns** | 12.2 ns          |
| small object `{x,y}` | 58.3 ns     | 8.4 ns      | —                |

### Materialisation: generic walk vs shape-compiled closure chain

| shape                     | generic   | compiled | speedup   |
| ------------------------- | --------- | -------- | --------- |
| nested 15 deep × 5 leaves | 1.7 µs    | 1.6 µs   | 1.03×     |
| nested 50 deep × 5 leaves | 5.3 µs    | 4.7 µs   | 1.12×     |
| wide 1,000 leaves         | 59.9 µs   | 33.4 µs  | 1.79×     |
| wide 10,000 leaves        | 958.8 µs  | 374.4 µs | **2.56×** |
| grid 100 × 100            | 454.3 µs  | 273.1 µs | 1.66×     |
| grid 1000 × 20            | 1102.9 µs | 897.5 µs | 1.23×     |

### Write one leaf, then read the whole state (200×)

| shape                       | rebuild all | incremental | speedup   | subtrees reference-shared |
| --------------------------- | ----------- | ----------- | --------- | ------------------------- |
| grid 100 × 100 (10k leaves) | 489.1 µs    | **8.6 µs**  | **56.7×** | 99 / 100                  |
| grid 1000 × 20 (20k leaves) | 1127.0 µs   | 47.8 µs     | 23.6×     | 999 / 1000                |
| grid 20 × 1000 (20k leaves) | 1086.6 µs   | 47.0 µs     | 23.1×     | 19 / 20                   |
| deep nest 50                | 2.2 µs      | 2.2 µs      | 1.0×      | 2 / 3                     |

### Write-path cost of tracking dirtiness (1M writes)

| variant                             | ns/write   | delta       | ratio     |
| ----------------------------------- | ---------- | ----------- | --------- |
| bare leaf `set`                     | 4.1 ns     | —           | baseline  |
| eager version stamp, depth 1        | 11.7 ns    | +7.6 ns     | 2.85×     |
| eager version stamp, depth 5        | 17.2 ns    | +13.1 ns    | 4.18×     |
| eager version stamp, depth 20       | 32.3 ns    | +28.2 ns    | 7.85×     |
| eager version stamp, depth 50       | 72.6 ns    | +68.5 ns    | 17.61×    |
| **early-exit dirty flag, depth 5**  | **6.7 ns** | **+2.6 ns** | **1.64×** |
| **early-exit dirty flag, depth 20** | **7.8 ns** | **+3.7 ns** | **1.90×** |
| **early-exit dirty flag, depth 50** | **7.8 ns** | **+3.7 ns** | **1.90×** |

Early exit means: walk up marking ancestors dirty, and **stop at the first
ancestor that is already dirty**. After the first write in a run, the chain is
already marked, so the cost is flat in depth. The flags are cleared during
materialisation — O(dirty nodes), paid on read.

---

## Family A — Materialisation (`tree()`)

**A1. Incremental materialisation with structural sharing. SHIPPED in 13.5.0.**
Every node memoises its materialisation in a `computed`, so a node rebuilds only
when a signal beneath it actually changed and clean subtrees are returned BY
REFERENCE.

Implemented with Angular's `computed` rather than the hand-rolled dirty flags
this document originally proposed, and that turned out to be strictly better:
the invalidation already happens on the write path, so **incremental
materialisation is far cheaper than the alternatives** — the +3.7 ns of
early-exit marking, or the +68.5 ns of eager version stamping at depth 50.

It is not free, though, and an earlier revision of this document said it was.
Leaf writes are unaffected, but a partial update at the ROOT measures **~17 ns
slower** (0.065 → 0.082 µs), because the root's cached materialisation is now a
consumer of every leaf beneath it and invalidating it costs something. First
measured with the two versions in a fixed order — which would let any drift in
machine load fall entirely on the second — so it was re-run with the order
alternated across 23 samples. The ranges still do not overlap, so it is real. It is also how `entityMap` already works, so the codebase gained no
new mechanism.

Measured in the real library — cost of reading the whole state, by how much
actually changed:

| shape                       | all leaves changed | one leaf changed | nothing changed         |
| --------------------------- | ------------------ | ---------------- | ----------------------- |
| grid 100 × 100 (10k leaves) | 1807.8 µs          | 149.2 µs (12.1×) | 0.044 µs (**40,740×**)  |
| grid 1000 × 20 (20k leaves) | 3665.8 µs          | 389.8 µs (9.4×)  | 0.051 µs (72,412×)      |
| grid 20 × 1000 (20k leaves) | 5066.4 µs          | 311.6 µs (16.3×) | 0.045 µs (**111,558×**) |

The "all leaves" column is the honest baseline: it includes the memo's own
overhead, so it slightly _overstates_ what the old code cost. The
nothing-changed column is the one that matters most in practice — any code that
reads state more than once between writes used to pay a full rebuild every time.

**The bug this surfaced.** The win did not appear until a second defect was
fixed. After a child accessor returned its already-materialised object, `unwrap`
called `unwrap()` on it _again_, deep-copying a plain object that was already
plain. That made every parent read mint a fresh copy of every child, so no
subtree was ever reference-stable — the memo was in place and shared 0 of 100
subtrees. Removing the re-copy took it to 99 of 100. (The identical-looking
recursion in the `isSignal` branch is load-bearing and was kept: a leaf's VALUE
is user data, and copying it is what stops a snapshot aliasing live state.)

**The cost, and it is a real API change.** `tree()` no longer returns a freshly
allocated object, so mutating the result would corrupt the cache and the change
would survive into every later read. Snapshots were always meant to be
read-only; now it is load-bearing, so each node is `Object.freeze`d in dev mode —
mutation becomes an immediate `TypeError` instead of a corrupted tree found much
later. The freeze is shallow per node (each child is frozen by its own memo); a
deep freeze would have to walk leaf values, which is the O(state) cost this
exists to avoid.

No win on deep-narrow shapes, as predicted: this is a WIDTH optimisation, and
Track D measured depth at 0.4% of the allocation bill.

**A2. Shape-compiled materialiser. MEASURED.** Walk the shape once at
construction; emit a closure chain that knows its own keys and needs no type
checks per call. 1.03–2.56×, best on wide-flat shapes. Real, but a constant
factor that does not change the complexity. Composes with A1 and is strictly
smaller than it — do A1 first, then measure whether this still pays.

**A3. `new Function`-generated materialiser. REASONED.** The same idea taken
further: generate source text and `eval` it, the way `fast-json-stringify`
does. Probably beats A2's closure chain because the property writes become
monomorphic stores into a known object shape. Blocked in strict CSP
environments, which is a hard blocker for a library. Only worth it as an
opt-in build-time transform (see F3).

**A4. Materialise into a pre-shaped object literal. REASONED.** Allocate the
result with a hidden class V8 already knows (`{a: 0, b: 0, c: 0}` rather than
`{}` plus dynamic key adds). Avoids hidden-class transitions per key. Small,
composes with A2, needs A2 to exist first.

**A5. Lazy per-branch proxies. REJECTED.** Return a `Proxy` that materialises
subtrees on access. Rejected on prior measurement (RFC 0004 branch 12) plus
Track D's `Object.create(null)` result: proxies defeat inline caching for every
downstream reader, and the cost lands on code we do not control. The whole
point of `tree()` is handing a plain object to something external.

**A6. Never materialise — export a cursor API instead. REASONED.** Give
consumers a read cursor and make them walk. Correct for some consumers and
useless for the actual use case, which is handing a POJO to `JSON.stringify`,
a devtools bridge, or a test assertion. Keep as a supplementary API, not a
replacement.

**A7. Structural-sharing snapshot as the _primary_ representation. REJECTED.**
Maintain the immutable POJO as the source of truth, with the signals derived
from it. This is the ngrx/immer model, and it re-imports exactly the write cost
the architecture exists to avoid (42–66 µs for a 50k collection). A1 gets the
same reference-identity property _lazily_, without paying on writes that nobody
reads back.

---

## Family B — Time travel

**B1. Diff-based entries (`{path, before, after}`). REASONED.** The information
already exists: `recursiveUpdate` collects changed dot-paths, which is what
`updateAndReport()` returns. Store that instead of a full frame. O(changes) per
entry instead of O(state). This was the standing #1 recommendation.

**B2. Snapshot-by-reference on top of A1. MEASURED (via A1). ★ better than B1.**
If `tree()` already returns a structurally-shared POJO, a history entry is
**the root reference** — nothing to diff, nothing to clone. Cost per entry is
O(depth) new objects, which Track D measured as the cheap dimension (immer's
15-deep update: 0.4% of bytes are the depth, 99.6% is the one wide node).
Restore is a pointer assignment; Track D measured the equivalent at **3.9 ns**.

B2 subsumes B1 and is less code, because it needs no diff format, no diff
application logic, and no inverse-patch correctness proof. B1 remains useful
only if entries must be _transmitted_ (see C4).

**B3. Record direct leaf writes. ALREADY WORKED — claim retracted.** This
document asserted that `tree.$.a.b.set(x)` left history untouched so undo could
not restore it. That was stale: `interceptLeafSignals` already routes leaf
writes through the PathNotifier and the flush hook records them. Verified and
pinned in 13.5.0 by `leaf-write-history.spec.ts` (`.set()`, `.update()`, depth,
redo, and "restoring must not grow history").

The lesson is about the claim, not the code: an undo feature that silently drops
writes looks exactly like one that works, so "is it recorded?" must be a test,
never a reading of the source. The unverified assertion was repeated across two
documents and a shortlist before anyone ran it.

**B4. Ring buffer with a hard entry cap. REASONED.** Bounds memory but does not
reduce per-entry cost. Worth having anyway as a safety valve; it is what stops
a long session from retaining unboundedly. Cheap to build.

**B5. Coalesce entries by transaction. REASONED.** One history entry per
batch/flush rather than per write. Big constant-factor win for form-typing
workloads, and it is the granularity setting the thesis document already says
is needed. Independent of B1/B2 — do it either way.

**B6. Copy-on-write history with periodic keyframes. REASONED.** Store diffs and
a full frame every N entries, so restore is bounded. Standard video-codec
structure, and it matches the user's own framing of the problem. Only needed if
B1 is chosen over B2 — with B2 restore is already O(1).

**B7. Compress old entries. REJECTED for now.** Serialise-and-compress history
beyond some age. Adds a serialisation dependency to a feature whose entire
problem is that it serialises too much. Revisit only if B2 lands and memory is
still the binding constraint.

---

## Family C — Change detection and notification

**C1. Push-based serialisation change detection. REASONED.** Replace the
`JSON.stringify(tree())` poll with a subscription to changed paths. The poll is
the single worst offender in the codebase by cost-per-useful-bit: it
materialises and stringifies the entire tree, on a timer, to answer a yes/no
question the write path already knew.

**C2. Reference-compare the materialised root. MEASURED (via A1).** With A1,
"did anything change" is `prevRoot !== nextRoot` — one pointer comparison.
Strictly better than C1 and free once A1 exists. This is where Track D's
rejected `===` idea is actually valid: the precondition (unchanged subtrees are
reference-identical) is something the _materialiser_ can guarantee, even though
a _leaf_ cannot, because leaf values come from the caller.

**C3. Per-subtree change subscriptions. REASONED.** Let a consumer subscribe to
`a.b.*` and be woken only for that subtree. The dirty-marking walk in A1 passes
through exactly the right nodes to make this O(depth) to dispatch.

**C4. Emit a JSON-Patch (RFC 6902) stream. REASONED.** The transmittable form of
B1. Genuinely useful for realtime sync and for a devtools protocol, and it is a
standard other tools already consume. Belongs in `@signaltree/realtime`, not
core.

**C5. Batch change notifications by microtask. ALREADY EXISTS** (the flush
notifier). Noted so the survey is complete, and because the timeTravel leak
(realisation 11) came from misusing it — the global flush is not a per-tree
signal.

---

## Family D — Equality

**D1. Type-directed equality chosen per leaf at construction. SPLIT VERDICT —
MEASURED. Shipped as `compared()` in 13.5.0.**

Originally rejected outright here on primitive measurements. That was too broad,
and an outside review caught it. The verdict divides on leaf type:

**Rejected for primitives.** `deepEqual`'s first line is `if (a === b) return
true`, which is already the whole fast path. On a changing number it measures
**6.5 ns against `Object.is`'s 8.1 ns** — the general function is _faster_ than
the specialised one. There is nothing to specialise.

**Accepted for object leaves**, where generic recursion is real work (2M writes):

| leaf                             | `deepEqual` | comparator |           |
| -------------------------------- | ----------- | ---------- | --------- |
| object `{id,name,email,version}` | 53.8 ns     | 8.9 ns     | 6.0×      |
| same, re-fetched (equivalent)    | 110.3 ns    | 9.0 ns     | **12.2×** |
| nested, 3 levels / 6 fields      | 60.5 ns     | 9.5 ns     | 6.4×      |
| — `Object.is` reference floor    | —           | 8.6 ns     | —         |

The decisive property is not the speed: **a comparator reaches the
reference-equality floor while KEEPING re-fetch correctness.** That is what
rules out D3 (defaulting to `Object.is`) and rules in an opt-in comparator —
they are not the same trade. `byKeys('id', 'version')` goes further and is O(1)
in the size of the value, so a version field makes equality constant-time no
matter how large the object grows.

What it does **not** do, and the reason this sits below A1 and E1: a comparator
over a 50k array is still O(N), and it cannot touch the `slice()` that produced
the new array — measured, that copy alone is ~41 ms of a ~49 ms workload. It is
a correctness and constant-factor tool, not an answer for large collections.

The general lesson survives intact: nearly everything the _types_ could tell the
runtime, the initial _value_ already tells it at construction. What the value
cannot supply is **semantics** — which fields matter, whether order counts,
whether a `version` already answers the question. That is what `compared()` asks
the developer for, and it is why F2 (diagnostics) rather than F1 (runtime
specialisation) is where the recursive typing pays.

**D2. Size-adaptive equality. REJECTED — MEASURED.** Cost per element is flat,
so a size threshold picks an arbitrary point on a straight line and silently
flips semantics either side of it. See thesis realisation 3.

**D3. Default to `Object.is` on leaves. REJECTED.** Track D proposed it,
projecting 90.6 ms → 4 µs. Re-measured in isolation the real saving is **8.4 ms
of 49.1 ms (17%)** when the change is at the head, and the precondition cannot
hold: an HTTP re-fetch hands you a brand-new array that no write path can make
reference-identical. It would report every re-fetch as a change, destroying the
one property `deepEqual` exists to provide.

**D4. Bail out of `deepEqual` after N elements. REJECTED.** "Assume changed" past
a budget. Same semantic break as D3, applied non-deterministically, which is
worse — the same write would be reported differently depending on where the
difference sits.

**D5. Hash-and-compare leaves. REJECTED.** Hashing a 50k array is O(n) too, plus
allocation, plus collision handling. Strictly worse than the walk it replaces.

**D6. Keep `useShallowComparison` as the explicit opt-in. KEEP.** It is the
correct shape for this trade: the user who has a large array leaf and knows
their writes are always real changes can say so, per tree, in one place. The
measured floor it buys (~41 ms, flat in change position) is the whole of what
any equality strategy can deliver.

**D7. Structure-aware equality for arrays of entities. SUPERSEDED.** Compare by
`id` rather than structurally. This is what `entityMap` already is, and it is
28.5× rather than the ~1.2× an equality tweak could reach. The lesson is in
E1.

---

## Family E — Storage layout

**E1. Steer collections to `entityMap`, loudly. ★ MEASURED, and the highest
value-per-effort item in this document.** Ground truth on the collection task:

|                          | time        | vs SignalStore |
| ------------------------ | ----------- | -------------- |
| `entityMap`              | **1.63 ms** | **28.5×**      |
| plain array leaf         | 49.80 ms    | 0.9×           |
| SignalStore `patchState` | 46.56 ms    | reference      |

The array-leaf idiom is at _parity_ with the library we beat 28× with the right
idiom. Every equality and materialisation tweak in this document is a rounding
error next to picking the right container. This is a **diagnostic and
documentation** problem, not a performance problem: a dev-mode warning when a
leaf holds an array of objects with a stable `id` would recover more real-world
performance than A1 does.

**E2. Chunked array leaves at C ≈ √N. REASONED (Track D measured the model).**
Update 110 ns (343×), 4.1 KB/version (98×), diff 2.1 µs, materialise 52 µs. The
cost is that `tree()` can no longer return a reference into it. Only worth
building if plain large array leaves must be fast _despite_ E1 — and E1 is
cheaper.

**E3. HAMT / persistent trie for large leaves. REJECTED for core.** Track D's
own numbers argue against it: `immutable.Map`'s real fanout is **3.79** at 1M
string keys (not the advertised 32), `immutable.List.splice` is _worse than a
plain array at every size_ (31.7 ms vs 806 µs at 1M), and — decisively —
reference-equality diffing over a shared structure measured **2.7× slower** than
`deepEqual` on a plain array. The win in the trie literature comes from bounded
fanout, which E2 buys with far less machinery.

**E4. Typed-array storage for numeric leaves. REASONED.** A `number[]` leaf could
live in a `Float64Array`. Removes per-element boxing and makes equality a
`byteLength`-guarded loop. Narrow but real for chart/timeseries data, which is
this project's actual domain. Worth a spike _after_ the shortlist.

**E5. Interned string leaves. REJECTED.** V8 already interns literals; explicit
interning adds a map lookup to every write to save a comparison that is already
10 ns.

**E6. Flatten the tree into a path-keyed `Map`. REJECTED — already measured.** A
per-node `Map` index cost +12.1% on subtree reads and 310 B/node with no
measured safety benefit over an own-property check. Built, measured, reverted
(thesis realisation 4).

**E7. `Object.create(null)` for node storage. REJECTED — measured twice.** +51%
on `unwrap` in this repo; Track D independently measured 33× on spread and 9.9×
on read. V8 puts null-prototype objects in dictionary mode, always.

---

## Family F — Type-directed and build-time strategies

This is the family the recursive typing makes uniquely available, so it is
worth being precise about what the types can and cannot buy.

**What they buy:** the _shape_ is known statically at unlimited depth — key
names, nesting, which positions are leaves. **What they do not buy:** the
_values_, the sizes, or the write frequencies. Every option below that works,
works because it uses shape. Every one that fails, fails because it needed a
value.

**F1. Compile the shape at construction (runtime). MEASURED — this is A2.**
1.03–2.56×. The runtime already has the shape the moment it builds the store; it
does not need the type system to tell it. **This is the important negative
result of this family: nearly everything the types could tell us at compile
time, the initial value already tells us at construction.**

**F2. Diagnostics from the type shape. ★ REASONED — the real win here.** The
type system can see what a _value_ cannot: that `rows: Entity[]` is an array of
things with a stable `id` and should be an `entityMap` (E1); that a leaf is
declared at depth 40 and every write to it will cost the marking walk; that a
branch has 5,000 statically-known keys. These are lint/diagnostic outputs, not
runtime behaviour, and diagnostics are where this project already has
machinery (ST2001–ST2017). **This is where the infinite typing depth actually
pays: it makes E1 enforceable rather than merely documented.**

**F3. Build-time materialiser generation. REASONED.** `@signaltree/callable-syntax`
already establishes the precedent of a build-time transform. A transform could
emit a specialised `tree()` per declared tree type, sidestepping A3's CSP
problem entirely because the code is generated at build time, not `eval`'d at
runtime. This is the only option that gets A3's win without A3's blocker.
Meaningful work; park it behind A1.

**F4. Branded types for hot paths. REASONED.** Let a developer declare
`hot<T>()` / `cold<T>()` on a subtree and specialise storage accordingly. Honest
assessment: this is asking the developer to supply the profiling data. Prefer
F2 (tell them what is wrong) over F4 (make them tell us).

**F5. Compile-time path constants. REASONED.** The types know every valid path,
so path strings could be pre-resolved to integer indices at build time.
Eliminates `parse-path` and its LRU cache from the hot path. Small but clean,
and it composes with F3.

**F6. Type-driven serialisation schema. REASONED.** Emit a `fast-json-stringify`
schema from the tree type. Would make the _serialisation_ case fast without
touching the _materialisation_ case. Only worth it after C2 removes the
polling, because today the poll is the cost, not the stringify.

**F7. Discriminated-union-aware storage. REASONED.** When a leaf is
`{kind: 'a', ...} | {kind: 'b', ...}`, the shape changes with the value. Nothing
in the current design handles this well; each variant gets a different hidden
class and the node's inline caches go polymorphic. Genuinely interesting and
genuinely unmeasured. Flagged, not recommended.

**F8. Infer time-travel granularity from the types. REJECTED.** Granularity is a
policy question about what the _user_ wants to undo, not a structural property.
The types cannot know that a form's draft state should undo as one unit.

---

## Family G — Reads

**G1. Cache `tree()` behind a version stamp. SUBSUMED BY A1.** The all-or-nothing
version of A1: return the previous POJO if nothing changed at all. A1 is the
same idea applied per-subtree and is strictly better. Listed because it is the
cheaper first step if A1 proves too invasive.

**G2. Memoise subtree accessors. REASONED.** `tree.$.a.b` walks and rebuilds an
accessor each time. Interacts with the resolve-child work already on the spike
branch; measure there rather than here.

**G3. Batch reads within a microtask. REJECTED.** Reads are already cheap
(0.1 ms for 1000 bare leaf reads). There is no problem here to solve.

**G4. `structuredClone` replacement for snapshots. SUBSUMED BY B2.** With
structural sharing there is nothing to clone.

---

## Family H — Memory

**H1. Weak caching of materialised subtrees. REASONED.** A1 retains one POJO per
branch. A `WeakRef`-based cache would let them go under pressure at the cost of
occasional rebuilds. Do not build this until A1 ships and memory is measured —
Track D's numbers (2.0 KB per retained version for a 50k trie) suggest the
retention is small relative to the state itself.

**H2. Share leaf values across history entries. SUBSUMED BY B2.**

**H3. Drop the per-node metadata object. REASONED.** A1 needs a dirty flag and a
cache slot per branch. Packing the flag into a bitset indexed by node id would
save an object per branch. Micro-optimisation; measure after A1.

---

## Family I — Things that look like optimisations and are not

**I1. Making `tree()` fast rather than calling it less.** The thesis document's
central instruction, restated here because it is the failure mode every option
in Family A risks. A1 is acceptable _because_ it reduces how much work a call
does, not because it makes the same work faster.

**I2. Benchmarking against SignalStore's idioms.** Produced "8× slower on
collections" for a task where the idiomatic API is 28.5× faster.

**I3. Interleaving benchmark arms in one process.** Produced a 7.5× phantom that
moved when an _unrelated_ arm was added.

**I4. Optimising the deep-nested case.** It is already 1.7 µs at depth 15 and
2.2 µs at depth 50, and Track D showed depth is 0.4% of the allocation bill.
Width is the entire problem. The deep-nested benchmark win is real but it is
not where any remaining work is.

---

## The shortlist

Ranked by measured value, then by cost to build.

**1. A1 — incremental materialisation with structural sharing. Do this first.**
56.7× on the measured shape, for +3.7 ns per write. It is not primarily a
speedup: the reference-identity it produces makes **B2** (time travel entries
become a root pointer — no diff format, no clone, 3.9 ns restore), **C2**
(change detection becomes one pointer compare), and **G1/G4** collapse into it.
Five of this document's problems have one fix.

Build it with early-exit dirty marking (+3.7 ns, flat in depth), not eager
version stamping (+68.5 ns at depth 50). Activate the marking lazily on the
first materialisation so trees that never call `tree()` pay nothing.

The one real cost is the API change: `tree()` stops returning a fresh object, so
mutating the result corrupts the cache. Freeze in dev mode and document it.

**2. E1 — steer collections to `entityMap`, in diagnostics.** 28.5× vs 0.9×
between two idioms that look equally reasonable to write. No engine work at all;
it is a dev-mode warning plus documentation. Highest value per hour in this
document, and **F2** is how the typing makes it enforceable rather than
advisory.

**3. ~~B3~~ — done, and it was never broken.** The claim that undo could not
restore a direct leaf write was stale. Verified and pinned by tests.

**4. B5 — coalesce history by transaction.** The granularity setting the thesis
document already identified as missing. Independent of everything else.

**5. C1/C4 — push-based serialisation change detection.** Mostly obsoleted by C2
once A1 lands; C4's JSON-Patch stream remains independently useful for
`@signaltree/realtime`.

Then re-measure. Everything below this line in the families is a constant factor
on work that A1 has already stopped doing.

### What NOT to do next, and why

The standing #1 was **B1, diff-based time travel**. It is displaced: **B2 gets a
better result from A1's structural sharing with less code** — no diff format, no
patch-application logic, no inverse-patch correctness proof, and O(1) restore
instead of O(replay). B1 survives only as the _transmittable_ form (C4), which
is a realtime feature rather than a time-travel one.

And the single most attractive wrong turn is **D1**, type-directed per-leaf
equality. It is measured and it loses: `deepEqual` is _faster_ than `Object.is`
on a changed number (6.5 vs 8.1 ns) because its first line is already the fast
path. Nearly everything the type system could tell the runtime, the initial
value already tells it at construction — which is why **F2 (diagnostics)** is
where the recursive typing actually pays, and F1 (runtime specialisation) is
not.
