# Reactivity audit — 14.0.0-rc.1

**Status:** audit. Prompted by `canUndo()` turning out to be non-reactive, on the
theory that a defect found once is rarely found only once.

## Method

Every read-shaped public API wrapped in a `computed`, mutated, then checked for
BOTH re-evaluation and a changed value. Calling a method directly cannot detect
this class of bug — that is exactly how `canUndo()` shipped — so the probe
asserts recompute counts, not just values.

## Results

| API                                             | reactive             |
| ----------------------------------------------- | -------------------- |
| `entityMap.all()`                               | ✅                   |
| `entityMap.count()`                             | ✅                   |
| `entityMap.where(p)()`                          | ✅                   |
| `entityMap.find(p)()`                           | ✅                   |
| `entityMap.has(id)()`                           | ✅                   |
| `entityMap.byId(id)()`                          | ✅                   |
| `tree()`                                        | ✅                   |
| `timeTravel.canUndo()` / `canRedo()`            | ✅ _(fixed in rc.1)_ |
| `timeTravel.getCurrentIndex()` / `getHistory()` | ✅ _(fixed in rc.1)_ |
| `status()` marker                               | ✅                   |

**One real defect, already fixed.** Time-travel state was the only
non-reactive surface, and it is now a signal.

> A first pass reported `where`, `find` and `has` as broken. They were not — they
> return `Signal<T>` and the probe read the signal OBJECT without calling it.
> Recorded because the false positive is instructive: an audit for "looks
> reactive but isn't" can just as easily manufacture the finding it is looking
> for, and three fabricated defects would have been worse than the one real one.

## What the audit found instead: the inline-predicate trap

`where(p)` and `find(p)` memoise per predicate IDENTITY, in a `WeakMap`. So this,
which is the natural thing to write in a template:

```html
@for (row of tree.$.rows.where(r => !r.done)(); track row.id) { ... }
```

allocates a NEW arrow every change-detection cycle, misses the cache every time,
and re-filters the whole collection. Measured over 1,000 entities, 2,000 reads:

|                              | time               |
| ---------------------------- | ------------------ |
| hoisted predicate (memo hit) | 0.27 ms            |
| inline predicate (memo miss) | **20.54 ms — 75x** |

**It is not a leak.** The cache is a `WeakMap`, and 50,000 inline-predicate calls
retain ~0 MB after forced GC. It is pure churn: a new `computed` plus a full
filter pass per call.

**Guidance:** hoist the predicate to a stable reference — a class field, a module
constant — whenever the result is read in a template. An inline arrow is correct
and 75x more expensive.

This is a trap in our own API rather than a bug, and it is the kind a
`ngDevMode` diagnostic could catch: the same collection receiving many distinct
predicate identities with an identical source string is a memo miss, and is
detectable cheaply in dev.
