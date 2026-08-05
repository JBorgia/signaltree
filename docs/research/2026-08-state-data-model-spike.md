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
| E — What shipping libraries actually do | immer, Immutable.js, MobX, Valtio, Solid stores, Vue, Legend-State, Yjs: their state model and its read/write/snapshot profile | CLOSED |
| F — SignalTree's own profile | where OUR model wins and loses, quantified; what `entityMap` already does differently; what time travel costs under each option | RUNNING |

## Findings D — persistent structures

_pending_

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
  50,000-element collection · (c) obtain the *entire* state as a plain,
  library-free object graph · (d) capture a snapshot and restore it.
- Adaptive timing: warm up, then run ≥250 ms and divide. All figures are
  **µs/op**. **No subscribers/effects/reactions were attached during the write
  benchmarks** for any library — these are raw write-path costs, not
  notification costs.
- Where a library offers more than one way to do an operation, both were
  measured and the variant is named. Where the obvious cheap path is *wrong*,
  that is called out rather than reported as a win.

### The table

Bold = the cheapest correct variant. "held" = write through a nested handle
captured once; "walk" = re-walk from the root on every write.

| library (version) | in-memory model | (a) deep write | (b) 1-of-50k write | (c) whole state → POJO | (d) snapshot / restore | time travel | nested write handle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **baseline** — plain mutable object | POJO, nothing else | **0.036** held / 0.134 walk | **0.028** | **0.031** (it *is* the object) | 17 123 (`structuredClone`) / — | none | yes (it's just an object) |
| **baseline** — hand-rolled immutable spread | POJO, path-copied on write | **1.358** | **42.63** | **0.032** | **0.033 / 0.033** | free | no |
| **immer 11.1.16** | frozen POJO + transient revocable Proxy drafts; copy-on-write along the touched path only | **5.68** (4.34 autoFreeze off) | **2 858** (61.4 autoFreeze off) | **0.038** | **0.037 / 0.036** | free (persistent) + patches | no (drafts die with `produce`) |
| **Immutable.js 5.1.9** | persistent HAMT `Map` + 32-way trie `List`; `items[0]` is itself a `Map` | **1.49** (`setIn`) | **0.499** (`setIn`) | 6 475 (`toJS`) | **0.059 / 0.055** | free (persistent) | no |
| **Valtio 2.3.2** | mutable raw objects, one Proxy per object, global version counter; `snapshot()` materialises a structurally-shared POJO cached per `(target, version)` | **0.285** held / 0.447 walk | **0.310** held / 0.364 walk | 0.093 *cached*; **2 620 after a deep write**; **56 120–84 657 after an array write** | 0.079 take / **234 517** restore | bolted on; snapshots are non-writable | **yes** (identity-stable nested proxies) |
| **MobX 7.0.0** | observable graph, one atom per property, Proxy per object, deep-observable eagerly on assignment | **1.14** held / 3.89 walk | **1.01** held / 1.62 walk | **175 978** (`toJS`) | 148 240 / 689 866 | none native | **yes** |
| **Solid 1.9.14 `createStore`** | mutable raw POJO + *lazy* Proxy per object (`$PROXY`) + *lazy* signal per property (`$NODE`), allocated only on a tracked read | 2.61 `setStore` / **1.42** `produce` | 0.568 `setStore` / **0.525** `produce` | **0.107** (`unwrap` → raw target) | 37 712 clone / 66 700 `reconcile` | bolted on (`reconcile`) | **no** — `set` trap is a silent no-op |
| **Vue 3.5.41 `reactive`** | mutable raw POJO + lazy Proxy per object cached in `reactiveMap`; `Dep` per `(target,key)` on first tracked read | **0.255** held / 1.594 walk | **0.227** held / 0.436 walk | **0.053** (`toRaw`) | 17 766 / 19 495 | bolted on | **yes** (objects; not primitive leaves) |
| **Legend-State 2.1.15** | **one plain object holds all data** (`root._`); a *separate* lazily-grown "node" metadata tree mirrors only the paths you touched | **14.10** held leaf / 19.97 walk | **1.93** held leaf / 5.16 walk | **0.157** (`get`) / 0.159 (`peek`) | 26 419 / 91 436 | diff log only (`trackHistory`) | **yes** (identity-stable node proxies) |
| **@ngrx/signals 21.1.1** | **3 Angular signals for the entire state** — one per *top-level* key; each wrapped in a `toDeepSignal` Proxy that memoises a `computed()` per accessed sub-path | **2.06** (`patchState` + caller-side path rebuild) | **66.5** slice+spread; 359 with `.map()` | **0.514** (`getState`); 0.056 root computed | **0.362 / 0.681** | free | **depth-1 only** |
| **Yjs 13.6.32** | CRDT: linked list of `Item`s per type; `Y.Map`/`Y.Array` are live handles into the op log; **doc grows on every write** | **11.36** held / 33.76 walk | **10.95** held / 34.09 walk | 4 190 (`toJSON`) | `Y.snapshot()` 454 µs → **34 bytes**; materialise 107 945. Full update: 23 322 → 4.66 MB, apply 121 015 | **structural** | **yes** |
| **Automerge 3.4.0** | CRDT: columnar op log in WASM; the JS `doc` is a lazily-materialising proxy over the backend | **249.7** | **6 717** | **271 026** (`toJS`); a *single* deep field read is 0.147 | `getHeads` **0.408**; `view(doc, heads)` 313 655; save 27 392 → 650 KB; load 532 530 | **structural** | **no** |

Construction cost of the same fixture, since it is not free and it varies by
three orders of magnitude: Vue 3 ms · Legend-State <1 ms · Solid 127 ms ·
Immutable.js 68 ms · Yjs 82 ms · Valtio 202 ms · MobX 676 ms · Automerge
1 458 ms · ngrx `signalState` 4 ms.

Reference costs everyone is measured against: `structuredClone` of the 50k
array 16 798 µs · `Array.prototype.slice` of it 38.7 µs · spreading all 50k
elements 626 µs · `JSON.stringify` 3 708 µs.

### The five distinct models

**1. Immutable value at the root.** *immer, Immutable.js, hand-rolled spread,
@ngrx/signals.* State is a value; a write produces a new value sharing
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
*Vue, Solid, Legend-State.* The canonical state is a plain object; proxies and
dep-maps/signals/nodes are a parallel index built lazily over the paths you
actually touch. Verified: `toRaw(state) === toRaw(state)` and the nested raws
are not proxies (Vue); `unwrap(store)` returns the raw target in 0.107 µs
(Solid); `obs.get() === theOriginalObjectYouPassedIn` (Legend-State). **This
model gets O(1) serialisation *and* sub-µs partial writes.** What it does not
get is a *snapshot*: the object it hands back is live, so a durable capture is a
deep clone — 17 766 / 37 712 / 26 419 µs respectively.

**3. Per-leaf-owned state.** *MobX.* The atom owns the value; there is no POJO
anywhere. Writes are fast and local (1.01–1.14 µs) and independent of collection
size. Both reads-as-a-whole and snapshots must be materialised: `toJS` **175 978
µs**, restore 689 866 µs. This is SignalTree's family, and MobX is the evidence
that the materialisation bill is a property of the model, not of any one
implementation.

**4. Versioned structural-sharing snapshot.** *Valtio.* An attempt at all three
at once: mutate in place (0.285 µs), and get a POJO from `snapshot()` that
reuses untouched subtrees by reference. The sharing is real — verified in
`probe-valtio-sharing.mjs`: after a deep write `s1.items === s2.items` and
`s1.meta === s2.meta`; after an array write `s3.deep === s4.deep` and
`s3.items[0] === s4.items[0]`. **But the snapshot is still O(total proxied
nodes), not O(changed nodes)**, because `ensureVersion` must poll every
descendant's version once the global counter moves (`esm/vanilla.mjs:96-108`).
Measured directly, snapshot-after-a-deep-write against collection size:

| items | 0 | 100 | 1 000 | 10 000 | 50 000 |
| --- | --- | --- | --- | --- | --- |
| µs | 9.87 | 11.36 | 26.61 | 217.82 | 4 219.19 |

The array is untouched and its snapshot is reused by reference — and it still
costs 4.2 ms, purely to ask 50,000 proxies whether they changed. Structural
sharing buys the *allocation*, not the *walk*.

**5. CRDT op log.** *Yjs, Automerge.* Time travel is structural: a Yjs snapshot
is a state vector + delete set, **34 bytes**, and Automerge's `getHeads()` is
0.408 µs. Both are O(1) to *record*. Everything else is expensive: writes are
11–250 µs, materialising a POJO is 4 190 µs (Yjs) to 271 026 µs (Automerge), and
materialising a past state is 107 945 µs / 313 655 µs. The doc also grows
monotonically with every write (Yjs update bytes went 4.66 MB → 4.86 MB over the
benchmark run with `gc:false`).

### Answers to the four cross-cutting questions

**Which hold a POJO they can hand back for free (O(1)) vs must materialise
one (O(state))?**

| O(1) — a POJO already exists | O(state) — must be materialised |
| --- | --- |
| immer `state` (0.038 µs) | Immutable.js `toJS` — 6 475 µs |
| Immutable.js *nothing* — see right | MobX `toJS` — **175 978 µs** |
| Vue `toRaw` (0.053 µs) | Valtio `snapshot()` after any write — 2 620–84 657 µs |
| Solid `unwrap` (0.107 µs) | Yjs `toJSON` — 4 190 µs |
| Legend-State `get`/`peek` (0.157 µs) | Automerge `toJS` — **271 026 µs** |
| @ngrx/signals `getState` (0.514 µs) | Vue/Solid/Legend *if you need a **value*** — 17 766 / 37 712 / 26 419 µs |

Two distinct reasons for landing in the left column, and they are not
interchangeable: immer/ngrx are there because the state **is** an immutable
value; Vue/Solid/Legend are there because the state is a **live mutable object**
they never stopped holding. Only the first kind gets a free *snapshot* too.

Note `getState`'s mechanism (`ngrx-signals.mjs:256-265`): it reduces over
`Reflect.ownKeys(STATE_SOURCE)` — **three keys for this entire 50,000-element
state** — spreading a fresh 3-key root while handing back every nested object
**by reference**. Verified: two successive `getState` calls return different
roots but `a.items === b.items` and `a.deep === b.deep`. It is O(top-level
keys), not O(state).

**Which support a stable nested write handle?** Verified by capture-then-write,
not assumed:

| library | handle? | evidence |
| --- | --- | --- |
| Valtio | **yes** | nested proxy identity stable; `node.value = i` at 0.285 µs, 1.6× faster than re-walking |
| MobX | **yes** | identity stable; 1.14 µs held vs 3.89 µs walk — **3.4×** |
| Vue | **yes, for object nodes** | identity stable, `isReactive(node)` true, and a held-handle write **does** re-trigger a subscribed effect. 0.255 µs held vs 1.594 µs walk — **6.3×**. Primitive leaves are returned by value, so no leaf handle. |
| Legend-State | **yes** | `leaf === node.value` stable; `leaf.set(i)` 14.10 µs vs 19.97 µs walk |
| Yjs | **yes** | `Y.Map` handle identity stable; 11.36 µs held vs 33.76 µs walk — **3.0×** |
| **Solid** | **no** | `proxyTraps.set() { return true; }` (`store/dist/store.js`) — a Proxy `set` trap that reports success and writes nothing. Verified: `node.value = 4242` leaves the raw at `0`, silently, with no error. Every write goes through `setStore(...path, v)` from the root, or `produce`, whose setter proxy is valid only inside the callback. |
| **@ngrx/signals** | **depth-1 only** | `store.deep` is the writable top-level signal and *does* expose `.set`/`.update`; `store.deep.l1` and deeper are Proxies over `computed()` with `set === undefined`, and their Proxy identity is **not** stable (`ngrx-signals.mjs:25` returns a new Proxy per access). |
| **immer** | **no** | drafts are revoked when `produce` returns. `createDraft`/`finishDraft` lets a nested draft handle live across statements, but only within one draft session. |
| **Immutable.js** | **no** | a held sub-collection is a *value*; writing it does not update the root. |
| **Automerge** | **no** | all writes go through `A.change(doc, fn)`. A draft handle that escapes the callback silently discards writes (verified: value stays `1`). Worse, `doc.a.b.c = 42` outside `change()` **does not throw and reads back as 42 locally**, while a later `change` still sees the old value — silent divergence. |

So this is a genuine capability split, and it splits *against* the immutable
libraries. Everything that holds mutable objects can offer a nested handle;
everything that holds an immutable root cannot, because a nested position is not
addressable once the root is replaced. Solid is the one mutable library that
declines to offer it — and does so by silently swallowing the write.

**What does time travel cost, and is it free or bolted on?**

| cost class | libraries | capture | restore |
| --- | --- | --- | --- |
| **free — the data model is already a value** | immer, Immutable.js, hand-rolled spread, @ngrx/signals | 0.033–0.362 µs | 0.033–0.681 µs |
| **structural — O(1) to record, O(state) to materialise** | Yjs, Automerge | 34 bytes / 0.408 µs | 107 945 / 313 655 µs |
| **bolted on — a deep clone in both directions** | Vue, Solid, Legend-State, MobX, Valtio | 17 766 – 148 240 µs | 19 495 – 689 866 µs |

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
same in all four: *the canonical state is a plain JavaScript object, and
reactivity is a side structure that never owns the data.* Handing back a POJO is
free because they never stopped having one.

But that is only two of the three things you want, and *which* two differs:

| | O(1) whole-state POJO | O(1) snapshot | sub-µs partial write |
| --- | --- | --- | --- |
| mutable POJO + side reactivity (Vue, Solid, Legend) | ✅ | ❌ 17.8–37.7 ms | ✅ 0.23–14 µs |
| immutable value at the root (immer, Immutable.js, ngrx) | ✅ | ✅ | ❌ 42–2 858 µs on the collection |
| per-leaf-owned (MobX) | ❌ 176 ms | ❌ 148 ms | ✅ 1.0 µs |
| versioned structural sharing (Valtio) | ⚠️ free cached, 2.6–85 ms after any write | ❌ 235 ms | ✅ 0.3 µs |
| CRDT (Yjs, Automerge) | ❌ 4.2–271 ms | ✅ structurally | ❌ 11–250 µs |

**Nothing measured gets all three.** The trade-off is inherent in the following
precise sense: an O(1) whole-state read and an O(1) snapshot are only the same
operation when the object you hand back is a *value*. Vue/Solid/Legend hand back
a *live* object — free, but it changes underneath you, so a snapshot costs a
clone. ngrx hands back a value — free *and* snapshottable — and pays for it by
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
6.82 µs with autoFreeze off) and *no measurable difference* on the array write
(2 858 → 2 882 µs), where the freeze walk swamps it. Patches are minimal — one
`replace` op carrying the full 17-segment path for the deep write, one for the
array element. `applyPatches` with the inverse costs 6.34 µs.

**immer — `autoFreeze`.** Default-on, and it is the single largest cost in this
whole table's immer row: the 50k-element write goes from **61.4 µs to 2 858 µs,
a 47× penalty**, because `freeze(result, true)` walks all 50,000 elements of the
freshly-`slice()`d array on every `produce` (each element early-returns as
already frozen, but the walk is still O(N)).

**Immutable.js — `toJS`.** 6 475 µs, and this is the same "materialise a POJO"
cost the brief flags. Worth noting it is *cheaper* than MobX (175 978 µs) and
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
the written node up to the root, and at *each* ancestor calls
`getNodeValue(parent)` — which itself walks the parent chain — and allocates two
fresh path arrays via `[node.key].concat(path)`. That is O(depth²) work and
O(depth²) allocation **per write, whether or not anything is listening.**
Measured, with no collection present at all:

| depth | 1 | 2 | 4 | 8 | 16 |
| --- | --- | --- | --- | --- | --- |
| µs/write | 0.815 | 1.217 | 2.049 | 4.407 | 10.987 |

~0.7–0.8 µs per level, superlinear, and **completely independent of collection
size** (12.15 µs at `items=0` vs 12.61 µs at `items=50000`). Legend-State is
fast at reads and at *shallow* writes; it is the slowest non-CRDT library
measured at deep ones.

**@ngrx/signals — `signalState` vs `signalStore`.** **The premise in the brief
is wrong, and this does not explain the harness discrepancy.** `signalState`
(`ngrx-signals.mjs:345-361`) and `withState` (`:789-807`) build the *identical*
`STATE_SOURCE`: one `signal()` per top-level key, each wrapped in
`toDeepSignal`. `signalState` adds exactly one thing — a root `computed()` that
spreads the top-level keys, making the container itself callable. Verified both
by source and by constructing a `signalStore`-shaped state source directly
(`tmp/trackE/probe-ngrx.mjs`): same three keys, same signals, and the four
operations measure within noise of each other (deep write 2.19 vs 2.06 µs;
`getState` 0.404 vs 0.514 µs; snapshot 0.446 vs 0.362 µs; restore 0.636 vs 0.681
µs). **Both are "the DeepSignal one." Neither is lighter.** The demo-vs-harness
discrepancy in "Open measurements" needs a different explanation.

The one genuinely heavy ngrx path is reading *through* the DeepSignal chain:
`store.deep.l1…l15.value()` costs **1.22 µs** because `toDeepSignal` allocates a
fresh Proxy at every hop (`:25`) even though the `computed()` behind it is
memoised. Reading the same field off `getState()` costs 0.498 µs.

**Yjs / Automerge — do they get time travel for free?** To *record*, yes and
dramatically: 34 bytes for a Yjs snapshot, 0.408 µs for Automerge's heads. To
*use*, no: 107 945 µs and 313 655 µs respectively to materialise the past state.
The CRDTs move the cost from capture to replay, which is the right trade for
sync and the wrong one for an undo stack you scrub through.

### What surprised me

1. **Valtio's snapshot is O(total nodes), not O(changed nodes).** Structural
   sharing is real and verified, and it still costs 4.2 ms to snapshot after
   touching one deep field, because the version poll has to visit all 50,000
   untouched proxies. Caching the *result* does not help if you have to walk the
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
6. **immer charges ~3.3 µs to merely *read* a deep path** inside `produce`,
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
  libraries whose write cost *is* notification bookkeeping (Legend-State,
  arguably MobX) the ranking could move under load.
- **Memory.** Not measured for any library, despite build times spanning 1 ms to
  1 458 ms strongly implying large differences.
- **Legend-State v3.** npm `latest` for `@legendapp/state` is 2.1.15 (v3 is not
  on `latest`); the O(depth²) finding applies to what npm installs today and may
  not apply to the v3 rewrite.
- **Immutable.js's internals from source.** I verified its *behaviour* (root
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
*Method*. **Run Solid with `node --conditions=browser`** or you will measure the
SSR shim.

## Findings F — SignalTree's measured profile

_pending_

## Synthesis

_pending_
