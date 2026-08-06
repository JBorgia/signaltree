# Snapshots are for rehydration, not reconstruction

**Status:** investigation, with a proposed design in §8. Everything below marked
MEASURED was run; everything marked UNVERIFIED was not. Read the "What I could
not establish" section before acting on any of it.

This document exists because three separate bugs were fixed at three separate
sites before anyone noticed they were the same bug — and none of the three was
aimed at the cause. A second pass found a fourth instance, worse than all three,
and found that both diagnostics built to detect this exact class are inert. See
§4 for the honest count.

**Scope.** This covers ONE class of defect — the snapshot/rehydration path. It
does **not** cover the rest of the 13.6.0 work. For the options analysis behind
the changes already made (13 options for the entityMap snapshot shape, 12 for
where to fix the `stored()` storage leak, 12 for markers inside arrays, 12 for
the bundle budget), see
[RFC 0011](../rfcs/0011-13.6.0-questionable-changes.md). For the older open
items — duplicate `stored()` keys, `reload()` on corrupt data,
`callable-syntax` — see [RFC 0008](../rfcs/0008-post-13.3-open-items.md).

---

## 1. The idea

A snapshot's job is to **rehydrate a tree that already exists**, not to contain
enough information to **reconstruct** one.

By the time a snapshot is applied, `signalTree(initialState)` has already built
the shape, every marker and every signal. The snapshot only has to carry the
**values that go into the leaves**. Anything the live node can recompute is
_structure_, and structure in a value payload is at best waste and at worst a
lie.

The library already followed this rule in one place and violated it everywhere
else — which is why the violations looked like unrelated bugs.

**MEASURED.** `.derived()` computeds are correctly absent from `tree()`:

```ts
const tree = signalTree({ a: 2, b: 3 }).derived(($) => ({
  sum: computed(() => $.a() + $.b()),
}));
tree(); // → { a: 2, b: 3 }   ← `sum` is NOT here, and that is correct
```

Feed that snapshot into a fresh tree and `sum` recomputes to 5. The rule works.
Markers did not follow it.

---

## 2. Which areas this affects — it is NOT only serialisation

**MEASURED**, every consumer of the snapshot path, `status()` and `entityMap`,
published 13.5.0 vs the working tree:

| area                                    | 13.5.0        | working tree | how it fails                                                  |
| --------------------------------------- | ------------- | ------------ | ------------------------------------------------------------- |
| `tree()` — the public read API          | ❌ 8 / 5 keys | ✅ 2 / 1     | emitted computeds + methods                                   |
| `snapshotState()` — shared helper       | ❌ 8 keys     | ✅ 2         | same                                                          |
| `JSON.stringify(tree())`                | ❌ `"map":{}` | ✅           | a full collection reported as empty                           |
| **`serialization()`**                   | ❌ THROWS     | ❌ THROWS    | tries to `.set()` a computed                                  |
| **`timeTravel` undo**                   | ❌ silent     | ❌ silent    | marker state is never restored — _same path as the row below_ |
| **`tree(partial)`**                     | ❌ silent     | ❌ silent    | entityMap left empty, no error                                |
| **`tree()` — `form()`/`asyncSource()`** | ❌ absent     | ❌ absent    | unbranded callable; every walker skips it (§3.0)              |
| `applyState()` — devtools replay        | ✅            | ✅           | special-cases `setAll`                                        |

Four consumer areas are still broken, and they fail in three different ways —
one throws, three are silent. `tree()` is a **public API**, so this was never
confined to the persistence enhancer: any application calling `tree()` to read
whole state, log it, POST it or assert on it in a test received the derived
views and the `"map":{}` lie.

**`timeTravel` undo not restoring markers is new information** and arguably
ranks with 3.1: undo appears to work, silently leaves marker state at its
post-change value, and reports success. Verified identical in 13.5.0, so
pre-existing. **It is not an independent defect**: `restoreState` falls through
to `this.tree(state)` (`time-travel.ts:218`), so undo and `tree(partial)` are
the same code path and one fix closes both. Listed as two rows because they are
two _symptoms_; counting them as two causes overstated the problem in an earlier
revision.

---

## 3. What breaks, in severity order

### 3.0 `form()` and `asyncSource()` are ABSENT from `tree()` entirely

> **Status after step 1 (done):** the **silence** is fixed — ST2008 now fires
> for these, at any depth, from one builder, identically regardless of read
> order. The **absence** is not fixed and is what step 2 addresses. Everything
> described below still happens; it is now loud instead of silent.

**MEASURED** — the most severe item here, and it was missed by this document's
first revision. A materialised `form()` is an unbranded callable: neither
`isSignal` nor `isNodeAccessor`, so every walker skips it.

```ts
const t = signalTree({
  f: form({ initial: { a: 1 } }),
  grp: { g: form({ initial: { b: 2 } }) },
  n: 1,
});
t.$.f.set({ a: 42 });
t.$.grp.g.set({ b: 99 });

t(); // → { "grp": {}, "n": 1 }      ← BOTH forms gone; `grp` comes back EMPTY
//   live: f = {a:42}, g = {b:99}
```

No warning. `tree()` feeds time travel, devtools, audit **and
`persistence()`** — so form state is missing from all four.

**The user story:** a checkout draft that never saves. `form()` inside a tree
with `persistence()`. The user fills in half a form and closes the tab.
`persistence()` writes `{}` and reports success. And because
`form({ persist })` has its own separate localStorage machinery, the draft
sometimes comes back anyway, from a different mechanism. Intermittent-looking
data loss is the worst possible shape for a bug.

**MEASURED against the published 13.5.0 tarball: identical** (`{"grp":{},"n":1}`
with the same live values). Pre-existing, and not caused by any 13.6.0 change.

**ST2008 was built for exactly this and was inert until step 1.** `eac09db6`
added it in 13.4.0 — commit message: _"Materialized markers that are plain
callables land here... omitted from the snapshot entirely, so
serialize/persistence/devtools/audit silently lose the key."_

**It was added to one of three skip sites.** At `eac09db6^`, `unwrap` already
had three places that skip a plain function: the accessor branch, the generic
string-key loop, and the generic symbol-key loop. The commit put the warning on
the **accessor branch only** and left the other two silent — and the silent pair
was what ran for a marker reached through a backing store, which is the ordinary
case. Step 1 removed the accessor branch entirely and put the diagnostic on both
surviving sites, so there is now one builder and no site that can drop a value
quietly.

**An earlier revision of this section blamed 13.5.0's memoisation refactor
(`6e70dd7e`) for splitting the loop and losing the warning. That is wrong** —
verified against `6e70dd7e^`: the two loops and the asymmetry both predate it,
and the refactor only extracted the accessor branch into `buildFromAccessor`.
The real story is simpler and worse: **the diagnostic never covered the path
that matters, from the day it was written.** It had no test anywhere in the
repo, which is why nothing caught it — and because the accessor and store
builders shared a single memo cell, whether it fired at all depended on which
entry point read a node first (MEASURED; see §8). Both are fixed in step 1: one
builder, and `snapshot-builder.spec.ts` pins the order-independence.

### 3.1 `serialization()` cannot round-trip `status()` or `entityMap` — it THROWS

**MEASURED, and it predates the 13.5.0/13.6.0 work** (identical against the
published 13.5.0 tarball, so not caused by any recent change).

| tree contains     | `serialize()` → `deserialize()`         |
| ----------------- | --------------------------------------- |
| plain object      | ✅                                      |
| array leaf        | ✅                                      |
| nested + `Date`   | ✅                                      |
| `stored()`        | ✅                                      |
| `form()`          | ✅                                      |
| **`status()`**    | ❌ `targetSignal.set is not a function` |
| **`entityMap()`** | ❌ `targetSignal.set is not a function` |

**The mechanism is more specific than the §1 thesis.** `serialize()` does not
use `tree()` at all — it has a **private second materialiser**,
`unwrapObjectSafely` (`serialization.ts:197`, reached from `serialization.ts:765`),
which never learned the marker rule. That is why 13.6.0's `tree()` fix did not
reach it. Three hundred lines away in the same file, `toJSON()` already
delegates to `tree()` (`serialization.ts:494`) — so the enhancer disagrees with
itself, and the correct implementation is already sitting next to the broken one.

`serialize()` emits **17 keys** for a `status()` node:

```
state, error, notLoaded, loading, loaded, hasError, idle, settled,
setNotLoaded, setLoading, setLoaded, setError, reset, start, setSuccess,
succeed, fail
```

Two of those are state. Six are computeds. **Nine are setter methods** — it is
serialising functions, which land in the payload as `{"§u":true}`. Worse, the
compact `nodeMap` marks all six computeds as writable branches. Then
`deserialize` walks the payload and tries to `.set()` each key back
(`serialization.ts:612`), and a computed has no setter, so the whole restore
throws.

**CORRECTION — "luck of shape" was half right and read the wrong way.** An
earlier revision said `stored()` and `form()` "survive" because their nodes
happen to materialise to a scalar or a values object rather than exposing
computeds. That is true of `serialize()` **only**, and it framed them as the
lucky ones. They are not: `form()` is absent from `tree()` entirely (§3.0). The
accurate statement is that the two read paths see **disjoint subsets** of the
same tree — `tree()` handles `status`/`entityMap` and drops `form`; `serialize()`
handles `form` and dies on `status`/`entityMap`. Neither is lucky. They are
differently broken, because they are two different walkers (§8).

**Why it matters:** `serialization()` is the documented persistence path and
`entityMap` is a first-class collection primitive. Persisting a tree with a
collection or a status node in it has never worked.

_(An earlier revision justified this with "`entityMap` is the most-used marker in
the repo's own demo by 4×." **Withdrawn** — see §7.)_

### 3.2 A persisted `LOADING` status deadlocks on rehydrate

**MEASURED.** Persist mid-flight, restore in a new process:

| predicate   | after restore | consequence                                        |
| ----------- | ------------- | -------------------------------------------------- |
| `loading()` | `true`        | a "don't fetch while loading" guard blocks forever |
| `idle()`    | `false`       | an idle-gated fetch never fires                    |
| `settled()` | `false`       | anything awaiting settlement waits forever         |

Nothing is in flight to change any of them. Permanent spinner, no retry.

`LOADING` describes an **in-flight operation**, and an operation cannot survive
serialisation — the process that owned it is gone. The same is true of a
time-travel undo _into_ a loading moment.

### 3.3 `entityMap` snapshots claimed the collection was empty

**MEASURED, FIXED in 13.6.0 (uncommitted → committed `9fe9f6a1`).** `tree()`
emitted `all`, `ids`, `count`, `map`, `empty`. `map` is a JS `Map`, which JSON
cannot represent, so it serialised as `{}` — a persisted snapshot claiming the
collection was **empty** while holding 10,000 entities. `ids` duplicated every
key (48,891 of 486,733 bytes at 10k rows). Now emits `{ all }` only.

The 13 alternatives weighed before choosing that — including the one that nearly
won, non-enumerable derived views, rejected on a measured +12.2 µs against
14.7 µs — are in [RFC 0011 §1](../rfcs/0011-13.6.0-questionable-changes.md).

**Option 10 of that list is worth re-reading.** It proposed tagging the snapshot
(`{ all, __entityMap: true }`) so restore could detect the shape "without
duck-typing `setAll`", and deferred it as _"orthogonal — `applyState` already
detects it correctly."_ Both halves of that dismissal are wrong: `applyState` is
not the path that matters (§3.4), and removing the duck-typing is the whole
design (§8). That was the registry idea in embryo, rejected on the wrong grounds.

### 3.4 Three restore paths, three behaviours

**MEASURED.**

| path                                          | used by                                   | entityMap restore           |
| --------------------------------------------- | ----------------------------------------- | --------------------------- |
| `applyState()`                                | devtools replay **only**                  | ✅ (special-cases `setAll`) |
| `serialization()`'s private `updateSignals()` | `serialize`/`deserialize`                 | ❌ throws                   |
| `recursiveUpdate` (`signal-tree.ts:445`)      | `tree(partial)` **and** `timeTravel` undo | ❌ silent no-op             |

Three implementations, not four: `restoreState` falls through to
`this.tree(state)` (`time-travel.ts:218`), so undo shares `recursiveUpdate` with
`tree(partial)`.

MEASURED repro of the third row — undo restores scalars and leaves markers
untouched:

```
history:           n=1 rows=0 st=NOT_LOADED → n=2 rows=1 → n=3 rows=3 st=LOADING
live before undo:  n=3 rows=3 st=LOADING
after undo:        n=2 rows=3 st=LOADING     ← rows and status did not move
after undo × 2:    n=1 rows=3 st=LOADING
```

Capture is correct — the history entries hold the right marker values at each
index. Only restore drops them, so undo lands the user in a state that never
existed and reports success.

**Why it matters:** a developer has no way to know which of the three they are
using, and they disagree on the most common shape in the library.

---

## 4. Why this class of bug is expensive

Each of these was found and fixed in isolation, at a different layer, by
someone (me) who did not realise they were the same defect:

1. `entityMap`'s `map: {}` looked like a serialisation quirk → fixed in `unwrap`.
2. `status()`'s six predicates looked like snapshot bloat → fixed in `unwrap`.
3. The `LOADING` deadlock looked like a status bug → "fixed" in `applyState`,
   which turned out to be **the wrong layer entirely**: `applyState` is used
   _only_ by devtools replay, and persistence does not go through it at all. So
   that fix addressed the one path where exact restoration is arguably correct
   and left every path that actually matters untouched.

4. `form()`/`asyncSource()` vanishing from `tree()` (§3.0) was not found at all
   until the machinery was read end to end rather than inward from a symptom. It
   is the most severe of the four.

**Counted honestly:** three fixes across **two** layers (`unwrap` twice,
`applyState` once, and `applyState` was the wrong one), plus a fourth instance
that was never fixed because it was never found. "Three fixes, three layers" in
an earlier revision overstated the spread; the problem is not that the fixes
were scattered widely, it is that none of them was aimed at the cause.

**And both detectors for this class are inert:**

- **ST2008** (read side) — written to cover one of `unwrap`'s three
  function-skip sites, never the one that runs for a marker behind a backing
  store, and never given a test (§3.0).
- **ST2005** (write side) — deliberately removed, on the grounds that it would
  "cry wolf on `tree(tree())`." That reasoning was correct at the time and
  expires the moment `tree(tree())` actually works.

So the diagnostics added specifically to make this class loud are silent on both
halves: one born incomplete, one retired by decision.

**The generalisable lesson:** when the read path emits structure and the write
path expects values, every consumer of the snapshot breaks differently, so the
bugs never look related.

**The corollary, learned the expensive way:** make the silence loud _before_
changing any behaviour — and **test the diagnostic**, because an untested
warning that covers two of three code paths reads exactly like one that works.
That is why §8 sequences the diagnostics first.

---

## 5. The design questions, and where they landed

These were five open questions in the first revision. Four of them collapse once
the machinery is read properly; §8 is the answer.

1. **What does `tree()` promise? Is `tree(tree())` an identity?** — **Answered.**
   It should be an identity **for state**, and deliberately not for derived
   views. That is already what the 13.6.0 read-side change did; the write side
   has not caught up. `signal-tree.ts:597-603` already assumes it ("the ordinary
   snapshot-restore pattern") while silently breaking it. Pin it as the property
   test in §8.
2. **Should `status()` be persisted at all?** — **Still genuinely open, and now
   narrower.** With `mode` (§8), the question is only what `rehydrate` does with
   `LOADED`: `ERROR` is worth keeping (a retry guard needs it), `LOADING` is
   settled (normalise), and `LOADED` may be redundant with
   `entityMap({ load: loader({ persist }) })`, which tracks freshness through
   `lastLoadedAt` on separate machinery. This is the one item here still needing
   a decision.
3. **Cross-session vs within-session are different problems.** — **Answered.**
   That is exactly what `mode` is (§8); it is a property of the call site, not
   of the data.
4. **Should the restore paths be unified?** — **Answered: yes**, and there are
   three implementations, not the four the symptoms suggest (§3.4). They
   converge on one walk once markers can declare `hydrate`.
5. **Session state vs persisted state as a first-class distinction.** —
   **Answered, and the earlier framing was wrong.** The candidate mechanisms
   listed here included "a field classification"; that is the wrong cut, because
   the same field is session or persisted depending on who is asking. It is an
   argument, not a schema. The other candidate listed — a per-marker
   `toSnapshot`/`fromSnapshot` — is right, and §8 shows the registry to hang it
   on already exists.

---

## 6. Whose fault

Blunt, because it changes what the fix is.

|                                               | Nature                                                       |
| --------------------------------------------- | ------------------------------------------------------------ |
| `form()`/`asyncSource()` absent from `tree()` | **Library.** Silent data loss on the public read API         |
| `serialization()` throwing on markers         | **Library.** No user action avoids it                        |
| `LOADING` deadlock                            | **Library.** Persisting state is the documented feature      |
| `entityMap` `map: {}`                         | **Library**                                                  |
| Three disagreeing restore paths               | **Library**                                                  |
| ST2008 inert, ST2005 retired                  | **Library.** Our own detectors for our own bug class         |
| Marker inside an array                        | Implementer — but silent, so the diagnosis was ours (ST2021) |
| Collection as a plain array leaf              | Implementer — _our own demo_ did it, hence ST2018            |
| Mutating a `tree()` snapshot                  | Implementer — now throws in dev (shallow freeze, dev only)   |

The severe items are all ours. The frequent items are misuse the library
accepted in silence.

---

## 7. What I could NOT establish

- **Whether `serialization()` ever worked with `entityMap`.** Only 13.5.0 and
  the working tree were tested. It may have been broken since the marker
  existed.
- **Whether `asyncSource()` survives `serialize()`.** Only `tree()` was measured
  for it (absent). The `serialize()` half is untested.
- **Whether anyone is hitting §3.0 or §3.1 in production.** No telemetry, and no
  signal either way. **RETRACTED:** an earlier revision offered a "weak signal"
  here — that an explicit `storage:` option "appears zero times in this repo's
  own code and docs, so at least some persistence features are lightly used."
  **That claim is false.** It appears ~99 times, including real application code
  at `apps/demo/src/app/pages/ng-forms-demo/ng-forms-demo.component.ts:103` and
  documented usage in `docs/guides/persistence-and-security.md` and
  `packages/core/README.md`. It was also a non-sequitur even if it had been
  true: `storage:` is a `stored()` option, and §3.1 is about `serialization()`.
- ~~Whether ST2008 is reachable at all.~~ **RESOLVED — it is reachable, but
  order-dependent.** It stayed silent in four shapes (root-level `form()`,
  nested `form()`, nested `asyncSource()`, a plain root-level function) because
  each of those reaches the node through the store builder. Reading the same
  node through the accessor builder first makes it fire (MEASURED, §8). So it is
  not unreachable — it is nondeterministic, which is worse: a warning that
  depends on which consumer touched a node first is not something a developer can
  rely on either way.
- **Time travel's leaf-write recording.** It routes through the **global**
  `PathNotifier.onFlush`. In a synchronous test, `$.n.set(1)` recorded nothing —
  history stayed at `["INIT"]` and `canUndo()` was `false`; only root writes
  `tree({...})` recorded immediately. This may be fine under a real flush, but it
  is an untested assumption under the whole enhancer, and it is adjacent to a
  claim a prior session asserted in two documents before retracting (HANDOFF
  §7.5) — so it needs a test, not a reading of the source.
- **A withdrawn relative-usage claim.** An earlier revision said `entityMap` is
  "the most-used marker in the repo's own demo by 4×." Recounting `apps/`
  (including code-sample strings): entityMap 45, stored 44, form 29, status 17,
  loader 17, asyncQuery 6. Roughly tied for first, not 4×. Withdrawn.
- **The 486,733-byte and +12.2 µs figures** in §3.3 were not re-measured in this
  pass; they are carried over from RFC 0011.
- ~~Whether `tree(partial)` failing to restore an entityMap is intended.~~
  **RESOLVED — it is documented as intentional**, at `signal-tree.ts:597-603`:
  markers "do not accept merge writes BY DESIGN — each has its own API", and a
  diagnostic was deliberately NOT added because it "would fire on `tree(tree())`,
  the ordinary snapshot-restore pattern". That comment is the sharpest finding in
  this document: the code calls `tree(tree())` ordinary while silently
  discarding a 10,000-entity collection out of it. The retired diagnostic is
  ST2005; its read-side sibling ST2008 was **born covering one of three
  function-skip sites** and never given a test (§3.0). So the detector pair
  built specifically for marker-drop is dead on both halves — one retired by
  decision, one incomplete from the day it was written.
- **Browser behaviour.** Everything here is Node 24.3 / V8 13.6.

---

## 8. Recommendation — complete the registry that already exists

An earlier revision proposed inventing a symbol protocol for markers to declare
their state. That was reinventing something: **a public marker registry already
exists** — `materialize-markers.ts:32` holds `{check, create}` pairs and
`registerMarkerProcessor` is exported from `@signaltree/core/authoring` with a
guide behind it. It covers **construction** only (raw marker → live node), with
no snapshot half and no hydrate half. Every symptom in §3 is a walker guessing
at something the registry could have answered.

### There are three read walkers, and they have drifted

| walker                  | where                  | walks                   | unbranded callable    |
| ----------------------- | ---------------------- | ----------------------- | --------------------- |
| `unwrap()` generic loop | `utils.ts:485`         | the plain backing store | **silent `continue`** |
| `buildFromAccessor()`   | `utils.ts:409`         | a `NodeAccessor`        | warns ST2008          |
| `unwrapObjectSafely()`  | `serialization.ts:197` | `serialize()` only      | traverses it          |

The first two are near-duplicates that have coexisted since well before the
13.5.0 memoisation refactor — that refactor only extracted the accessor branch
into a named function (§3.0). The divergence between them **is** §3.0. The third
is the private second materialiser behind §3.1.

**And the first two share one memo cell.** `materializeNode(store)` builds via
`unwrap(store)`; `unwrap(accessor)` builds via `buildFromAccessor(accessor)`;
`memoKey()` resolves an accessor to its store, so **both write to the same cache
entry and whichever reads first wins, permanently**. MEASURED, same tree, same
code:

```
tree() first, then unwrap($.grp):   ST2008 fired: false
unwrap($.grp) first, then tree():   ST2008 fired: true
```

**Exposure of the order-dependence: ordinary.** No symbols, no exotic shape — a
plain nested `form()` reproduces it, and any application that reads a subtree
accessor before calling `tree()` is in case B. Reading a subtree before reading
the whole tree is normal application code, so this is reachable by accident on a
first render.

**A second, separate divergence with much narrower exposure.** The two builders
can also disagree on **values**: `unwrap`'s loop copies own symbol keys and
`buildFromAccessor` has no symbol loop at all, so a symbol-keyed property is
present or absent depending on read order. This one is hard to reach —
`createSignalStore` iterates string keys, so ordinary construction cannot produce
it without stamping the symbol by hand. Recorded because it proves the two
builders are not equivalent, not because anyone is hitting it. **The two findings
have different exposure and should not be quoted as one.**

**Provenance, stated plainly.** The two loops and their asymmetry predate 13.5.0.
What 13.5.0's memoisation introduced is the **shared cache cell** — `memoKey()`
resolving an accessor to its store is what makes one cell serve two builders that
do not agree, turning a latent inconsistency into an order-dependent one. The
drift is inherited; the order-dependence is ours, from 13.5.0.

**⚠️ The obvious merge introduces a new leak.** "Give `buildFromAccessor` the
symbol loop too" makes the builders symmetric and is wrong. MEASURED: an accessor
carries **both** `Symbol(SignalTree:NodeAccessor)` and
`Symbol(SignalTree:NodeStore)` as own symbols, so a symbol-copying loop over
accessors would stamp the internal brands — and, via the store symbol, a walk
into the entire backing store — into **every** materialised node: every snapshot,
every persisted payload, every devtools frame.

**Enumerability is not the guard here, and an earlier draft of this section said
it was.** `unwrap`'s symbol loop uses `Object.getOwnPropertySymbols`, which
returns non-enumerable symbols too — MEASURED, flipping the accessor brand to
`enumerable: false` leaves both symbols in the returned list. So "make the brand
non-enumerable" is a no-op against this mechanism, and the claim that
`NODE_STORE_SYMBOL` is "already safe because it is non-enumerable" was wrong.

What actually makes the store direction safe is that **stores carry zero own
symbols** (MEASURED). Unifying by always building from the store avoids the leak
by construction rather than by filtering. If defence-in-depth is wanted on top,
the effective form is an explicit skip for `SignalTree:*` symbols inside the
symbol loop — not a descriptor change.

Note the existing precedent: `TREE_STORES` is a `WeakSet` rather than a stamped
symbol precisely because "unwrap copies own symbol keys into the snapshot, so a
marker property would leak into every materialised result" (`utils.ts:360`). The
hazard was already known and designed around once.

Markers also materialise to four different shapes — a plain object (`status`,
`entityMap`), a real branded signal (`stored`), and an unbranded callable
(`form`, `asyncSource`) — and each walker classifies those four differently. That
is the whole bug class in one sentence.

`utils.ts` also hardcodes `isStatusNode` (`:254`) and `isEntityNode` (`:272`) —
duck-type tests that no user-registered marker can ever join. `isStatusNode` used
to probe `.settled`, a lazy getter, so asking the type question allocated a
`computed` on every node materialisation; **that probe has since been replaced
with `.error`**, a plain property, which costs nothing and guards the exact deref
both call sites perform. The duck-typing itself remains, and is what an `owns()`
hook on the registry replaces.

### Complete `MarkerProcessor`

```ts
interface MarkerProcessor {
  check: (value) => boolean; // raw marker → mine?
  create: (marker, notifier, path) => node; // raw marker → live node
  owns?: (node) => boolean; // live node → mine?
  snapshot?: (node) => unknown; // live node → payload
  hydrate?: (node, value, mode) => void; // payload → live node
}
```

A marker's halves then live in one file: `status.ts` owns `{state, error}`,
`entity-map.ts` owns `{all}` and `setAll`, `form.ts` owns its values, `stored()`
is already a real signal and opts out. This deletes `isStatusNode` and
`isEntityNode` from `utils.ts` — duck-typing that no user-registered marker can
ever join.

**Make `snapshot` mandatory at registration for any marker whose node is an
unbranded callable.** Those are precisely the ones dropped today, and it turns a
silent read-time omission into a loud registration-time error. Registration is
the right place for it: `materializeMarkers` wraps `create()` in a `try/catch`
that swallows throws (RFC 0005 §7), so a materializer-level guard would fail
_open_ — the same lesson `entityMap({ load })` already learned with `[ST2004]`.

**Resolve `owns` by an O(1) stamp, not by scanning the registry.** `create()`
tags the node it returns with its owning processor; the walker reads the tag.
This is a **robustness** decision, not a perf one, and it does not need a
measurement to justify: `owns` is the one hook that runs on **every node, on
every materialisation**, and it is the one place in this design where a marker
author's code lands on the hot path. With a linear scan, one slow or badly
written user `owns()` degrades materialisation for trees that do not even use
that marker. With a stamp, it cannot — a marker's cost is paid only by trees that
contain it, which is the same boundary the lazy self-registration tree-shaking
already draws. The perf benefit is real but incidental; the isolation is the
point.

### `mode` is the session-vs-persisted distinction

Not a classification of fields — a property of the **call site**, the only place
that knows whether a process boundary was crossed:

| call site                                   | mode        |
| ------------------------------------------- | ----------- |
| `tree(partial)`                             | `merge`     |
| `timeTravel` undo/redo/jumpTo               | `restore`   |
| `deserialize` / SSR transfer / localStorage | `rehydrate` |

`status().hydrate` then reads: **`restore`** keeps `LOADING` verbatim (an
in-process undo into a loading moment is legitimate — the request may genuinely
still be running); **`rehydrate`** normalises `LOADING → NotLoaded` while
`LOADED` and `ERROR` survive. That keeps the rule in §3.2, already pinned by
`rehydration.spec.ts`, and moves it out of `applyState` — where it was flagged
as suspect — into `status.ts`, where it reaches persistence and the deadlock
actually happens.

### Sequencing — steps 1 and 2 are independently shippable

1. **Collapse to ONE builder — delete `buildFromAccessor` and always build from
   the store — then make ST2008 fire from all three function-skip sites, and
   test it.** Build-from-the-store, specifically: it is the direction that avoids
   the brand leak above, and it also retires the `length`/`prototype`/`name`
   intrinsic skip, which exists only because an accessor _is_ a function — a
   store is a plain object and never needs it. One builder per memo cell also
   makes the diagnostic deterministic, which no amount of adding warnings can do
   on its own. **The memoisation is untouched:** the cache stays exactly one cell
   per node, structurally shared, and a child accessor is still taken by
   reference (`result[key] = value()`), so the 13.5.0 whole-state-read and
   time-travel wins are preserved. The fix removes a second _writer_ to the cell,
   not the cell.

   **Do this first** — every fix in this class so far has been aimed at a
   symptom, and the one diagnostic that would have caught it shipped untested and
   covering the wrong two-thirds. "Make the silence loud" before "fix the
   symptom" is the correction to that failure mode.

   **Verify, do not assume:** re-run the whole-state-read and time-travel
   benchmarks before/after; confirm no snapshot gains an own symbol; confirm
   state stored under the keys `length`, `name` and `prototype` still round-trips
   (there is prior art here — a name-based skip once deleted real state).

   ✅ **DONE.** `buildFromAccessor` deleted; `unwrap()`'s accessor branch builds
   from `memoKey(node)`, so the object built from and the object keyed on are the
   same by construction. ST2008 now fires from both remaining skip sites, and the
   symbol loop skips `SignalTree:*` by identity (not by descriptor — see above).
   Net −53 lines of duplicated builder.

   Pinned by `snapshot-builder.spec.ts` (6 tests). Mutation-verified against the
   pre-change code: **2 of the 6 go red** — order-independence and
   ST2008-at-depth, the two that pin the fix. The other four are invariant
   guards (brand leak, `length`/`name`/`prototype` round-trip, structural
   sharing); they held before and must keep holding.

   **MEASURED, alternating order, 3 pairs** — no difference in any metric, in
   either direction:

   | metric       |         before |          after |
   | ------------ | -------------: | -------------: |
   | memo-hit     | 0.150–0.162 µs | 0.150–0.178 µs |
   | write + read | 158.9–176.7 µs | 146.7–175.1 µs |
   | time travel  |   0.53–0.57 ms |   0.49–0.61 ms |

   Ranges overlap throughout, so the change is perf-neutral; an earlier
   single-shot reading suggested ~10% faster on write+read and was **retracted**
   as noise. Structural sharing is exact and unchanged (49/50 subtrees shared),
   which is the property the 13.5.0 win actually rests on — and it is now pinned
   as a deterministic test rather than inferred from a timing.

   Gates: all packages test/lint/build exit 0; bundle 7.01 KB against a 7.1 KB
   budget (+0.02 KB net — the two ST2008 sites cost slightly more than the
   deleted duplicate saved); dev code still fully foldable (−1.68 KB per tree).

2. **Add `snapshot`/`hydrate`; implement for the four built-ins.** `tree()`
   then includes `form`.

   **This step is BREAKING, and the break is in already-written data.** `tree()`
   gains keys it did not have, so every test asserting on whole-state output
   changes and every persisted payload changes shape. Sequenced migration handles
   two of the three cases: an old snapshot restored into a new tree leaves the
   form at its initial value, and a new snapshot restored into an old tree hits
   the silent marker no-op. Both degrade acceptably.

   **The third case is not a migration.** A rolling deploy, or SSR/client version
   skew, puts both versions against the same storage **at the same time** — two
   shapes coexisting, with no ordering to exploit. So the question "does
   `snapshot()` output carry a version tag?" has to be answered **before** step 2
   ships, not bolted on after. A tag is cheap to add up front and impossible to
   add retroactively to payloads already in users' `localStorage`.

   **Do not reuse RFC 0011 §1 option 12's reasoning here.** That option
   ("deprecate in 13.6, change in 14.0") lost because shipping a payload that
   reports a full collection as `empty` for a whole major is worse than breaking
   it — the old payload was **actively false**. Here the old payload is not
   wrong, only smaller. Same-looking question, different call, and the earlier
   answer does not transfer.

3. **Delete `serialize()`'s private `unwrapObjectSafely`; call `tree()`.**
   Mostly deletion: kills the 17-key payload, both `deserialize` throws, and a
   second traversal from the bundle. ⚠️ **Verify `preserveTypes` /
   `encodeSpecials` parity for Date/Map/Set/BigInt first — do not assume it.**
4. **Route every restore through `hydrate` + `mode`.**
5. **Move the `LOADING` rule into `status.hydrate`;** update
   `rehydration.spec.ts`.
6. **Restore ST2005; add a round-trip property test over the registry:** for
   every registered marker, `t2(t1()); expect(t2()).toEqual(t1())`. The
   reasoning that retired ST2005 — that it would cry wolf on `tree(tree())` —
   expires once `tree(tree())` works.

**Why the property test is the point.** This class has produced four distinct
defects and three fixes, none of which was aimed at the cause (§4). What all four
share is that nothing ever forced a marker author to answer
_"what of me is state?"_ A registry field plus a test that iterates the
registry forces it structurally — and because it iterates the registry rather
than a hand-written list, it covers markers that do not exist yet, including
user-registered ones. That is the only thing that stops the recurrence.

### The property the design must be built against

Every failure in §3 is **silent and indistinguishable from a legitimate state**:
empty vs genuinely-empty, stuck spinner vs slow network, half-undone vs undone,
missing form vs never-filled. That property — not any individual bug — is what to
design against.
