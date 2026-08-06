# Snapshots are for rehydration, not reconstruction

**Status:** investigation, not settled design. Everything below marked MEASURED
was run; everything marked UNVERIFIED was not. Read the "What I could not
establish" section before acting on any of it.

This document exists because three separate bugs were fixed at three different
layers before anyone noticed they were the same bug.

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

| area                              | 13.5.0        | working tree | how it fails                        |
| --------------------------------- | ------------- | ------------ | ----------------------------------- |
| `tree()` — the public read API    | ❌ 8 / 5 keys | ✅ 2 / 1     | emitted computeds + methods         |
| `snapshotState()` — shared helper | ❌ 8 keys     | ✅ 2         | same                                |
| `JSON.stringify(tree())`          | ❌ `"map":{}` | ✅           | a full collection reported as empty |
| **`serialization()`**             | ❌ THROWS     | ❌ THROWS    | tries to `.set()` a computed        |
| **`timeTravel` undo**             | ❌ silent     | ❌ silent    | marker state is never restored      |
| **`tree(partial)`**               | ❌ silent     | ❌ silent    | entityMap left empty, no error      |
| `applyState()` — devtools replay  | ✅            | ✅           | special-cases `setAll`              |

Three consumer areas are still broken, and they fail in three different ways —
one throws, two are silent. `tree()` is a **public API**, so this was never
confined to the persistence enhancer: any application calling `tree()` to read
whole state, log it, POST it or assert on it in a test received the derived
views and the `"map":{}` lie.

**`timeTravel` undo not restoring markers is new information** and arguably
ranks with 2.1: undo appears to work, silently leaves marker state at its
post-change value, and reports success. Verified identical in 13.5.0, so
pre-existing.

---

## 3. What breaks, in severity order

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

The mechanism is the thesis stated exactly. `serialization()` emits **17 keys**
for a `status()` node:

```
state, error, notLoaded, loading, loaded, hasError, idle, settled,
setNotLoaded, setLoading, setLoaded, setError, reset, start, setSuccess,
succeed, fail
```

Two of those are state. Six are computeds. **Nine are setter methods** — it is
serialising functions. Then `deserialize` walks the payload and tries to `.set()`
each key back, and a computed has no setter, so the whole restore throws.

`stored()` and `form()` survive only because their nodes happen to materialise
to a scalar or a plain values object rather than exposing computeds as
enumerable properties. It is luck of shape, not design.

**Why it matters:** `entityMap` is the most-used marker in the repo's own demo
by 4×, and `serialization()` is the documented persistence path. Persisting a
tree with a collection in it has never worked.

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

### 3.4 Three restore paths, three behaviours

**MEASURED.**

| path                                          | used by                   | entityMap restore           |
| --------------------------------------------- | ------------------------- | --------------------------- |
| `applyState()`                                | devtools replay **only**  | ✅ (special-cases `setAll`) |
| `serialization()`'s private `updateSignals()` | `serialize`/`deserialize` | ❌ throws                   |
| `tree(partialSnapshot)`                       | everything else           | ❌ silent no-op             |

`tree({ rows: snapshot.rows })` leaves the collection empty and reports nothing.
Verified pre-existing in 13.5.0.

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

Three fixes, three layers, one cause. The fourth instance (3.1) is still open
and is the most severe.

**The generalisable lesson:** when the read path emits structure and the write
path expects values, every consumer of the snapshot breaks differently, so the
bugs never look related.

---

## 5. The open design questions

None of these are settled. They need a decision before more code is written.

1. **What does `tree()` promise?** Is `tree(tree())` an identity? It is not
   today, and it is not obvious that it should be.
2. **Should `status()` be persisted at all?** A rehydrated tree is never
   loading. A restored `ERROR` from yesterday is arguably noise. A restored
   `LOADED` may matter for offline-first — but that case is already served by
   `entityMap({ load: loader({ persist }) })`, which tracks freshness through
   `lastLoadedAt` on separate machinery.
3. **Cross-session vs within-session are different problems.** Persistence and
   SSR transfer have no in-flight request. Devtools replay and time-travel undo
   are within the same process, where a request genuinely may still be running.
   One normalisation rule cannot serve both, and today's code pretends it can.
4. **Should the three restore paths be unified,** or do they legitimately
   differ? If they differ, each needs a stated guarantee.
5. **Session state vs persisted state needs to be a first-class distinction.**
   Every symptom above is the absence of that concept. Candidate mechanisms: a
   per-marker `toSnapshot`/`fromSnapshot`, a field classification, an explicit
   `hydrate()` API distinct from `tree(partial)`, opt-out-per-node, versioned
   snapshots.

---

## 6. Whose fault

Blunt, because it changes what the fix is.

|                                       | Nature                                                       |
| ------------------------------------- | ------------------------------------------------------------ |
| `serialization()` throwing on markers | **Library.** No user action avoids it                        |
| `LOADING` deadlock                    | **Library.** Persisting state is the documented feature      |
| `entityMap` `map: {}`                 | **Library**                                                  |
| Three disagreeing restore paths       | **Library**                                                  |
| Marker inside an array                | Implementer — but silent, so the diagnosis was ours (ST2021) |
| Collection as a plain array leaf      | Implementer — _our own demo_ did it, hence ST2018            |
| Mutating a `tree()` snapshot          | Implementer — now throws in dev                              |

The severe items are all ours. The frequent items are misuse the library
accepted in silence.

---

## 7. What I could NOT establish

- **Whether `serialization()` ever worked with `entityMap`.** Only 13.5.0 and
  the working tree were tested. It may have been broken since the marker
  existed.
- **Whether anyone is hitting 3.1 in production.** No telemetry. Weak signal:
  an explicit `storage:` option appears zero times in this repo's own code and
  docs, so at least some persistence features are lightly used.
- **The right answer to any question in §4.** They are stated as questions
  because they are open, not as rhetorical setup for a preferred answer.
- **Whether `tree(partial)` failing to restore an entityMap is intended.** It is
  a silent no-op, which is never intended, but it may be a known limitation
  recorded somewhere not yet found.
- **Browser behaviour.** Everything here is Node 24.3 / V8 13.6.

---

## 8. Recommendation

Do **not** fix 3.1 the way 3.2 was fixed — at whichever layer the symptom
surfaced. That approach has now produced one fix in demonstrably the wrong
place.

Settle §4.5 first: introduce the session-vs-persisted distinction, decide what
each restore path guarantees, and only then touch code. The single highest-value
change is making a marker declare what of it is state, because every symptom in
§3 follows from markers having no way to say so.
