# RFC 0013 — Bounded equality, and a speculative snapshot

Two proposals that came out of the 14.0.0 performance evaluation. Neither is a
bug fix and neither belongs in the RC: both change observable semantics, and one
adds public API. They are here because the analysis exists and should not have
to be re-derived.

Same format as [RFC 0011](./0011-14.0.0-questionable-changes.md): numbered
options, a recommendation, and an explicit **⚠️ Trap** naming what looks right
and is not.

**Evidence.** Every SignalTree figure below was MEASURED against the working
tree, one process per arm, median of 5–9. The machine was running other work, so
treat magnitudes as indicative and re-measure quiet before publishing any of
them.

---

## 1. Bounded equality for large arrays

### The problem

`deepEqual` is the default leaf comparator. For most leaf types that is close to
free, because plain nested objects become **branches**, not leaves — so an
object-valued leaf is only ever an array, a `Date`/`Map`/`Set`, or a
`compared()` value:

| leaf value    | `deepEqual`  | `Object.is` |             |
| ------------- | ------------ | ----------- | ----------- |
| number        | 10.4 ns      | 5.9 ns      | irrelevant  |
| string        | 13.0 ns      | 5.1 ns      | irrelevant  |
| Date          | 19.6 ns      | 3.8 ns      | irrelevant  |
| array of 3    | 33.7 ns      | 3.8 ns      | irrelevant  |
| array of 1000 | **7,163 ns** | 3.6 ns      | **~2,000x** |

So the comparator is well matched to every leaf type except a large array —
which is exactly the shape **ST2018** already tells you not to build.

The inline-reference loop landed separately (see the note in `deep-equal.ts`)
and took the changed-element path 2.8–3.9x. What remains is the case it cannot
help: two arrays with **no shared element references** that are nevertheless
structurally equal — a re-fetched payload. There the full walk is unavoidable
and costs ~2.8 ms at 50k.

### Options considered (10)

1. **Do nothing.** The array leaf is already discouraged, `entityMap` is the
   answer, and `compared()` is the documented escape hatch. ← **recommended**
2. **Size-gated reference-only comparison.** Above K elements, compare by
   reference and report unequal if any differ. MEASURED at K=1024: the 50k
   re-fetch case goes 3,532 µs → **0.0 µs**. **It flips a verdict** — a
   structurally identical re-fetch now notifies. See the trap.
3. **Default to `Object.is`, make deep equality opt-in.** Inverts a design
   commitment: SignalTree suppresses no-op notifications so a re-fetched payload
   does not cascade. Removing that by default is a different library.

   **Worth recording that the host framework takes the other side.** Angular
   signals default to `Object.is`, and Angular's own guidance is not to override
   it without cause. Our divergence is deliberate and defensible — it is what
   stops a re-fetched payload cascading — but "a different library" understates
   the counterargument, and this option should not be dismissed as lightly as an
   earlier revision of this RFC did.

4. **Bound by depth rather than width.** Does not help — the cost here is width.
5. **Sample K elements and assume the rest match.** Can report equal when they
   are not, which drops a real write. The only unsafe direction; never do this.
6. **Cache a structural hash per array.** Hashing IS the O(N) walk, paid on
   write instead of compare, plus invalidation.
7. **Adopt a third-party comparator.** MEASURED against both, and an earlier
   revision of this RFC judged it on `lodash.isEqual` alone, which is not the
   opponent that matters:

   |                      |        ours |   lodash |    `fast-deep-equal` |
   | -------------------- | ----------: | -------: | -------------------: |
   | object, 10 keys      |    229.2 ns | 326.7 ns |         **207.0 ns** |
   | array 1k, one change | **1.08 µs** |        — |              1.76 µs |
   | array 1k, all-new    |     62.6 µs |        — |          **41.1 µs** |
   | **cyclic value**     |  **`true`** |        — | **THREW RangeError** |

   So against the actual leader we win **one of three on speed** — the
   partial-walk case, which is the inline-reference loop — and lose the other
   two. What settles it is the last row: `fast-deep-equal` stack-overflows on a
   cyclic value, so adopting it would reintroduce the crash §4 documents, in a
   zero-dep package, to be ~10% faster on small objects.

8. **Bound by byte size rather than element count.** Requires measuring size,
   which is the walk.
9. **A `maxCompare` config option.** Config as a substitute for a decision — the
   ground RFC 0011 §1 option 9 was rejected on.
10. **Warn instead of bounding** when a leaf array exceeds K and equality is
    running hot. Additive to option 1 and cheap; the diagnostic gap in §3 below
    is the better version of it.

### Recommendation: option 1, do nothing

Option 2 measures beautifully and buys nothing we actually need. The workload it
optimises — re-setting a large array leaf with structurally identical content —
is simultaneously (a) the anti-pattern ST2018 exists to prevent, (b) already
solved by `entityMap`, and (c) already opt-outable via `compared()`. Adding a
semantic cliff at 1024 elements to speed up a shape we tell people not to build
is surface for nothing.

**⚠️ Trap: option 2.** It is the most attractive number in this document — a
3,532 µs → 0 µs improvement, from ten lines, with the failure in the "safe"
direction (a spurious notification, never a dropped write). The reason to refuse
it is that "safe" is doing a lot of work in that sentence: a spurious
notification on a 50,000-row collection re-runs every downstream computed and
re-renders every bound view. It converts a rare 3 ms comparison into a frequent
unbounded cascade, and it does so **silently and only above a size threshold**,
so it will be found in production and not in a test.

---

## 2. A speculative snapshot — `with()`

### The idea

Datomic's `with` applies facts to an immutable database value speculatively,
producing something queryable that was never committed. For SignalTree that
answers _"what would the tree look like if I applied this patch?"_ — which is
what optimistic updates, form drafts, preview modes and scrub-preview all want.

### What is already served, and this is most of it

| use case                     | already?                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optimistic update + rollback | **Yes.** MEASURED: `const before = tree()` → mutate → `tree(before)` restores exactly, including `entityMap` and recomputed `derived`. Works because of 14.0.0's hydrate contract |
| Form drafts                  | **Yes** — that is what `form()` is                                                                                                                                                |
| Time-travel scrubbing        | Mostly — `jumpTo` exists; preview-without-commit is a devtools nicety                                                                                                             |
| Preview modes                | **No** — but a component usually computes the previewed value locally                                                                                                             |

### The reason it is weaker here than in Datomic

Datomic's `with` is valuable **because Datomic has a query language**: you
speculate, then run arbitrary queries against the result. SignalTree has no query
surface — you read fields. "What would `$.a.b` be if I set `$.a.b`?" is the value
you were about to set. Speculation only pays where it **propagates**, which means
`.derived()`. Repo-wide that is 46 call sites, 18 in the demo. Real, but not
enough to justify new core surface on its own.

### Options considered (6)

1. **Do not build it.** ← **recommended for now**
2. **`tree.with(patch)` returning a live speculative tree.** The ergonomic
   version, and the expensive one. **⚠️ Trap:** `memoKey()` resolves an accessor
   to its backing store, so a speculative tree sharing stores would write into
   the **same memo cells** as the real tree — the exact shared-cell defect
   deleted in 14.0.0, reintroduced deliberately. It needs copy-on-write shadow
   stores along the patched path so unchanged subtrees reuse the real memo (safe,
   they are unchanged) while patched nodes get fresh cells.
3. **`with(snapshot, patch)` returning a plain POJO.** Zero memo interaction,
   trivially correct, no new node kind. Loses `$.a.b()` ergonomics, which is most
   of the appeal — but it is the version that could ship in an afternoon.
4. **Build a detached tree** from the current snapshot plus the patch. Simple and
   correct; O(state) per preview, which defeats previewing a one-field change.
5. **Expose it as a devtools-only capability**, not public API.
6. **Wait for demand.** Ship nothing; revisit if preview shows up in an issue.

### Recommendation: option 1, with option 3 as the shape if it is ever built

Not because it is hard — option 3 is small — but because the demand is
hypothetical and the API surface is permanent. Everything it would serve today is
already served, mostly by work 14.0.0 just finished. Revisit with a real use
case, and start from option 3 rather than option 2.

---

## 3. The diagnostic gap both of these point at

Neither proposal is recommended, but the analysis surfaced something that is.

`ST2003` fires when a write re-sets a **reference-identical** value. It does
**not** fire when a write re-sets a **structurally equal copy** — MEASURED, both
cases silent for the copy:

```
re-set identical REFERENCE      -> ST2003 fired: false
re-set structurally-equal COPY  -> ST2003 fired: false   <- the expensive one
```

The copy is the shape a re-fetched payload takes, and it is the expensive one:
`deepEqual` cannot short-circuit, so it walks the whole structure to conclude
nothing changed. On a 50k array that is ~2.8 ms **per write, to do nothing**.

This is not hypothetical. It has corrupted a benchmark **twice** — HANDOFF §7.3
records it once, and the 14.0.0 array-idiom figures were wrong by 10x for the
same reason: a warm-up pass left the fixture holding its target values, so the
measured pass was 1,000 no-op writes hitting `deepEqual`'s worst case.

A diagnostic here would have caught both. It is cheap: the comparator already
knows it returned `true`, and the write path already knows the reference
differed. Proposed as the next free `ST####`, and recommended **ahead of**
either proposal above.

---

## 4. What this RFC missed, and how it was found

Every option in §1 was generated from first principles, and **none of them was
cycle safety** — because the whole section was framed as a performance question
and never asked what makes the comparator _wrong_.

Reading `fast-equals` surfaced it in two searches: that library ships circular
support as a **separate entry point** (`circularDeepEqual`), and an API shaped
that way implies a failure class. Testing for it found that `deepEqual` threw
`RangeError: Maximum call stack size exceeded` on any cyclic value — the default
leaf comparator, crashing on a parent-pointing node list, which is ordinary
domain data.

Fixed and pinned by `deep-equal-cycles.spec.ts`; the guard is a depth counter
that only materialises a `WeakMap` past a depth no legitimate state reaches.

The generalisable lesson, which is worth more than the finding: **when surveying
prior art, read the API surface for what it implies about failure modes, not just
the implementation for techniques.** Ten self-generated options found a 3x
optimisation and missed a crash.
