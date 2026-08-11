# Undo/redo and devtools replay are different features

They look like one feature — both "go back to an earlier state" — and treating
them as one is what stalled the snapshot/rehydration work. They want different
things, cost different amounts, and ship to different audiences.

**Undo/redo** is a product feature. A user presses Ctrl+Z and expects _their
edit_ undone. Nobody presses Ctrl+Z to un-fetch a request or to make a spinner
reappear.

**Devtools replay** is forensic. The point is to see what the app was actually
doing — including the loading, the errors, the in-flight requests. A devtool
that shows a tidied-up version of history is not a devtool.

---

## Every contested decision was devtools-only

This is the grid that unblocked the work. When the snapshot design stalled, the
open questions all turned out to sit on one side:

| decision                                                  | undo/redo | devtools |
| --------------------------------------------------------- | --------- | -------- |
| `status()` `LOADED` survives rehydrate?                   | **no**    | yes      |
| Restore must be forensically exact                        | **no**    | yes      |
| `entityMap` + loader: does the payload or the loader win? | **no**    | yes      |
| `LOADING` normalisation across a process boundary         | **no**    | yes      |
| `stored()` writes through to localStorage on rewind       | **no**    | yes      |
| Form values round-trip                                    | **yes**   | yes      |
| Collection entries round-trip                             | **yes**   | yes      |

Five blocked decisions, none of which undo/redo needs an answer to. Undo/redo
was buildable the whole time — it was waiting on questions belonging to a
feature nobody ships to production.

The cost asymmetry runs the same way. Undo/redo captures user-editable state,
which is small. Forensic replay captures everything, which is where both the
expense and the arguments live.

---

## What each mode does

`hydrate(node, value, mode)` — `mode` is a property of the CALL SITE, because
the call site is the only thing that knows whether a process boundary was
crossed.

| call site                                 | mode        | meaning                                      |
| ----------------------------------------- | ----------- | -------------------------------------------- |
| `tree(partial)`                           | `merge`     | an ordinary application write                |
| `timeTravel` undo / redo / jumpTo         | `restore`   | same process; a request may still be running |
| `deserialize`, SSR transfer, localStorage | `rehydrate` | new process; nothing is in flight            |

The rule that falls out: **`restore` is exact, `rehydrate` is opinionated.**

|                             | `restore` (undo/redo)                                               | `rehydrate` (cross-process)                                                                                           |
| --------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| form values                 | restored                                                            | restored                                                                                                              |
| form `touched`              | **restored** — you are going back to where you were, errors and all | **dropped** — Angular's own `form.value` omits it, and a form reopened tomorrow showing yesterday's red is surprising |
| form `submitting`           | never                                                               | never — a submit in flight then is not in flight now                                                                  |
| collection entries          | restored                                                            | restored                                                                                                              |
| `status` `LOADING`          | **kept** — the fetch may genuinely still be running                 | **normalised to NotLoaded** — nothing survived the boundary, and believing it deadlocks every fetch guard             |
| `status` `LOADED` / `ERROR` | restored                                                            | restored                                                                                                              |

`touched` is the one place these differ for a reason other than in-flight state.
A cleaned-up undo is a lie about what the user did; a cleaned-up rehydrate is
just good manners.

---

## Two defects this uncovered, both silent

**Restore dropped markers.** `recursiveUpdate` had no idea how to write a marker
node, so undo moved the scalars and left the collection alone. Measured:
`n=3 rows=3` → undo → `n=2 rows=3`. The user lands in a state the app was never
in, and it reports success — worse than having no undo.

**Capture missed marker writes entirely.** `interceptLeafSignals` requires a node
to have both `set` and `update`. A `form()` has `set` and `patch`; an
`entityMap` has `addOne`/`setAll`; a `status()` has `setLoading`. None of them
qualified, so none of their writes marked the tree dirty and none were recorded.
Three writes produced two history entries. **Undo cannot restore what was never
captured.**

That second one hid behind a passing test. The test edited a collection _and_ a
scalar; the scalar marked the tree dirty and the collection rode along in the
snapshot, so undo appeared to work. A collection-only edit recorded nothing —
history stayed at `["INIT"]`. The lesson is narrow and worth keeping: **a test
that exercises two things at once can pass for the wrong one.**

---

## Opting a collection out — and what it costs you

The last row of that table (`collection entries` → restored, both modes) is the
default, and for a big collection it is expensive. A history entry holds the
tree's snapshot, and an `entityMap`'s snapshot is an N-pointer array rebuilt
whenever the collection changes. So attaching `timeTravel()` to a tree holding
a large collection makes every collection-mutating write O(collection width),
permanently. MEASURED over 50 recorded writes with
[`tools/bench-retention-arms.mjs`](../../tools/bench-retention-arms.mjs), heap
baselined after seeding so the collection itself is excluded:

| rows   | default | `recordHistory: false` | every row changed |
| ------ | ------- | ---------------------- | ----------------- |
| 1,000  | 0.51MB  | 0.13MB                 | 2.45MB            |
| 10,000 | 3.95MB  | 0.15MB                 | 23.06MB           |
| 50,000 | 19.38MB | 0.15MB                 | 114.77MB          |

Two things about that table are easy to read wrong, and an earlier version of it
did:

- **The default column is a floor, not a worst case.** Changing one row costs the
  same as changing fifty different ones — the pointer array is rebuilt either way.
  The third column is the ceiling: each *changed* row adds ~40 bytes on top of the
  array, so at 50k the span between "touch it at all" and "rewrite all of it" is
  5.9x.
- **The exclusion column does not scale with width.** `recordHistory: false` is
  flat at ~0.15MB whether the collection holds 1,000 rows or 50,000 — the flag
  removes the `entries x width` term rather than shrinking it. Retention becomes
  O(1) in collection size, which is a different claim from "cheaper".

`entityMap({ recordHistory: false })` takes the collection out of history capture.
Everything else about it is unchanged — it still appears in `tree()`, it still
round-trips through `serialization()`, it is still persisted. The flag scopes
one thing: what `undo()` can reach.

**State this plainly to your users, because the tool cannot.** Undo becomes
_partial_. The scalars around the collection revert; the collection does not.
A user who deletes a row and hits undo gets their filter panel back and their
row stays deleted. That is a defensible product decision for a 50,000-row grid
whose rows are server-owned anyway, and an indefensible one for a shopping cart.
The flag is opt-in for exactly that reason — the tree cannot tell those apart.

If the collection should be in neither history nor the persisted snapshot, that
is a different flag: `transient: true`.

Leaving a big collection on the default warns once as
[ST2029](../errors/README.md), past roughly 500k retained pointers (~5MB). It
is judged on `entries x width` rather than on a row count, because either
number alone gets it wrong in one direction: a 20,000-row grid edited twice
costs almost nothing, and a 50-row list edited for an hour costs almost
nothing, and a row-count threshold cannot tell you that.

It is checked when an entry is RECORDED, not when the enhancer attaches. The
first version checked at attach and never fired in a real app: you attach
`timeTravel()` where you build the tree, and the rows arrive later from a fetch,
so the collection is empty at exactly the moment being inspected. It passed its
own tests because those tests loaded the rows first — test order chosen to suit
the implementation rather than to match what an app does.

---

## What ships

Undo/redo works for form values, collection entries, status and plain leaves,
in both directions, with `touched` preserved. It costs what time travel already
cost — snapshots are memoised and structurally shared, so recording a write is
flat in state size.

Forensic devtools replay — loader metadata, async status, request timing — is a
separate opt-in layer that does not exist yet. It belongs behind a flag that is
off in production, where the remaining five decisions can be got wrong cheaply.
