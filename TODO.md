# TODO

Work that is decided and not yet done. **This is not an RFC list.**

We do not write RFCs for our own work — we make the change. An RFC is what an
outside contributor writes to propose something, and `docs/rfcs/` is the archive
of decisions already taken, kept for the options that were REJECTED and why. If
you are about to create `docs/rfcs/00NN-my-idea.md` for something we decided
internally, put it here instead and go do it.

**Target release: 15.0.0, and it is a clean break.** Breaking changes are explicitly
acceptable on anything — decided 2026-08-10. Two consequences that change how items
below are written:

1. **Prefer deletion to deprecation.** A wrong API kept for one release cycle is a
   wrong API that gets copied into someone's codebase for one release cycle. Nothing
   here needs a `@deprecated` window.
2. **What still gates work is KNOWLEDGE, not compatibility.** The only reason to hold
   an item now is that we do not yet know the right shape — never that removing it
   would break someone. See the sequencing note at the end of item 2.

Ordered by what unblocks the most. Reasoning is compressed — the full derivation
is in the linked audits. What went wrong in 14.0.0, including what I broke myself,
is in [14.0.0-what-actually-happened.md](docs/audits/2026-08/14.0.0-what-actually-happened.md).

---

## ~~1. Move semantic history filtering from write-time to read-time~~ — DONE

Implemented. `shouldSkip` no longer runs in `addEntry`; entries are retained and
`undo()`/`redo()` skip via `skipsBackward()`/`skipsForward()`. The O(1) reference
dedup stays on the write path. 1,087 core tests pass, 32/32 gates.

**What still follows from it**, and is not done: labelling and coalescing are now
_possible_ — a complete history with changed-path metadata is what they need — but
neither is built. Both are now properties of the transaction handle (item 2), not
separate features, and **not** a `transaction(label, fn)` callback — that form is
falsified.

Original reasoning, kept because it is the argument for the next two:

### 1. Move semantic history filtering from write-time to read-time

**The change.** The write path keeps only the O(1) reference-identity dedup it
already has. Everything semantic — skip, group, label, coalesce — moves to read
time over a bounded buffer.

**Why.** `shouldSkip` currently runs on every recorded write and DISCARDS the entry
(`time-travel.ts`, the `return` after the comparator). Five problems, one cause:

1. **The cost is on the wrong operation.** Writes are the hot path — per keystroke,
   per telemetry frame. `undo()` is a human gesture. Recording an entry is O(depth)
   and effectively free since 13.5.0; the comparator is the expensive part. We pay
   O(state) per write to avoid something that costs almost nothing.
2. **It is irreversible.** A skipped entry never existed. A wrong predicate loses
   history permanently. Read-side filtering is a view: wrong filter, change it.
3. **One policy for every consumer.** An undo button, a devtools panel and an audit
   view must share one filter fixed at record time.
4. **It is a documented foot-gun.** "A careless comparator is an O(state) walk per
   write" stops being expressible if the comparator does not run per write.
5. **Coalescing is impossible save-side.** To merge keystrokes into a word you need
   a RUN of entries; at write N you cannot know N+1 is coming. The current shape
   forecloses it by construction.

**Also closes:** the no-label gap and the no-coalescing gap, which were filed as
separate features and are the same design error. `transaction(label, fn)` changes
shape too — with entries retained and labelled, grouping is a read concern.

**Watch:** retention. Keeping everything costs `entries x width`. `maxHistorySize`
bounds the count, ST2029's model says width dominates, and the structural dedup is
already free — so bound the buffer rather than destroying data to save memory
nobody has measured.

Derivation: [undo-business-and-ux-cases.md](docs/audits/2026-08/undo-business-and-ux-cases.md)

## ~~1b. `setOne()` / replace path~~ — DONE, shipped as `replaceOne`

Resolved and committed (`80f41e94`). The entity-node callable now REPLACES, and
`replaceOne(id, entity)` is public.

**The deciding argument was neither of the ones this item used to carry.** Not the
withdrawn `@signaltree/callable-syntax` analogy (that was a dev-only build transform for
leaf signals and has no bearing on merge-vs-replace), and not branch-callable
consistency. It is that **the updater form is unfixable under merge**: `node(cur => …)`
returns a full `E`, so a spread puts any dropped key straight back. Merge cannot host
that signature — either the callable replaces or `node(updater)` gets deleted.

**`setOne(entity)` was rejected on correctness, not style.** It would derive the key via
`selectId(entity)`, and `changeId` can leave `entity.id` disagreeing with the storage
key — a silent wrong-slot write. `replaceOne(id, entity)` takes the caller's id and
cannot drift. A test pins that drift so the reason outlives this note.

## 1c. A diagnostic for `changeId` + held nodes

`changeId` drops the old per-entity signal (`entity-signal.ts:768-770`) — correct,
and deliberately so — but nothing warns, and a held node just resolves `undefined`.
A long-lived `selectById(id)` closing over the old id breaks silently. Cheapest of
the v3 asks, and it protects "diagnostics with stable codes", which is one of the
six capabilities no competitor has.

## 2. Settle the history REPRESENTATION — decision pending, do not pre-empt

**The goal is
[history-the-greenfield-target.md](docs/architecture/history-the-greenfield-target.md):
history's unit is a named user action, declared at the call site, scoped to the state
it touches, attributed to whoever caused it.** Read that first — it says what we are
building and why, and it has a §6 acceptance list to verify against by outcome.

**Then read [2026-08-history-greenfield-spike.md](docs/research/2026-08-history-greenfield-spike.md)
before touching 2a-2c or 3.** Six candidate architectures with pros and cons; the
choice is not made yet, and this item is the decision, not an implementation.

**The adopter check has been run and it narrowed the field.** v3 ships 50-step undo to
production end users at the form layer and deliberately type-erases `timeTravel`, so the
target's architecture is already their shipped architecture. Two results that change
this item:

- **`act('label', fn)` is dead.** Callback scope is dynamic scope and does not survive
  `await`. MEASURED via `batch()`: 5 sync writes → 1 entry, 5 awaited → 2, a 12-way
  concurrent `mergeMap` fan-out → **12**. Every real bulk handler is the last shape.
  The replacement is a transaction **handle** (`tree.action(label)` → `commit()`/`abort()`),
  because a value closes over an async pipeline and a callback scope cannot.
- **Option F is eliminated.** An unrelated write can land between an action's open and
  commit, so an action entry cannot be a whole-tree snapshot — undo must revert only the
  action's paths. Action entries are **path-scoped deltas** necessarily, which rules out
  every whole-state option including fix-the-stack-in-place. This was the strongest
  cost-based counter-argument and the constraint removes it.

**Still open before implementing:** write `tree.action()` against v3's three real
handlers — `onArchiveToggle`, `bulkPatch$`, `create$` — and see which call sites fight
it. Same falsification that killed the callback form.

### Sequencing: what gates on what

Breaking-change freedom removed every compatibility gate. What remains is knowledge, and
it splits three ways.

**Ships without the prototype — absence is safer than presence, or the defect is wrong
under every design:**

- Delete pause/resume/isRecordingPaused (above)
- Delete `__provisional`/`finalizeProvisional` (2b)
- Phantom entries + the `history` option collision (2a)
- Re-score the 32-case audit and the 11 workload verdicts (item 6)
- Delete the parity framing (item 7)

**Gated on the prototype, because we do not yet know the shape:**

- The representation itself, and nesting semantics
- **Authorship (item 3) — likely subsumed.** If a write outside any action is simply not
  in user history, authorship stops being a separate mechanism and becomes a property of
  having no action scope. Building a parallel `author` field first risks shipping two
  answers to one question. Hold until the prototype says.
- Whether read-time `shouldSkip` survives at all
- `insertAt` (2c) and the `changeId` remap event (item 1c): both are needed under every
  option, but their signatures may need to carry action identity. Existence is certain;
  shape is not.
- `maxHistorySize` → turn-bounded, which is undefinable until "turn" is

**Independent of all of it:** capability matrix (item 8) and RFC 0008 (item 9).

~~Re-verifying the spike's memory figures~~ — **DONE 2026-08-10, and the
load-bearing one stands.** Re-run from scratch against the built package with
`--expose-gc`, one process per arm:

- **Retention REPRODUCED.** Snapshot stack 0.594 / 4.089 / **19.979 MB** at
  1k / 10k / 50k against the reported 0.59 / 4.05 / 19.58 — within ~2%, and 3 reps
  at 50k identical to three decimals. So Option F's cost-based elimination holds
  independently of the path-scoped-delta constraint that already killed it.
- **`undo()` = O(state) REPRODUCED.** 436.67 µs at 50k against 434 µs reported,
  scaling 25.4 → 83.5 → 436.7 µs. There is no root pointer to swap; the snapshot
  model's one claimed advantage over a log does not exist here.
- **Entry-count trap REPRODUCED exactly** — 50,050 log entries at 50k rows, with
  bytes flat. Confirms that a log must be bounded by turns, never by entries.
- **REFINEMENT — `entries × width` is only paid by writes that TOUCH the wide
  collection.** 50 scalar writes beside an untouched 50k collection retain
  **0.896 MB**; 50 collection writes retain **19.98 MB**. Unchanged collections are
  shared by reference between entries. So 19.58 MB is a real **worst case, not a
  typical one**, and ST2029's wording describes a collection-write-heavy workload
  rather than history in general. Doesn't rescue Option F (dead on correctness) and
  doesn't change that `undo()` is O(state) — but the realistic mixed workload sits
  nearer 0.9 MB than 19.6 MB, and the cost argument should say so.
- **Recording slope PARTIALLY reproduced.** Collection column reproduces in shape
  and within ~2× (31.8/66.9/255 → 18.8/49.8/215 µs per recorded entry). The scalar
  column does not: measured **flat** in collection width (10.8 → 11.3 µs) where the
  original rises 3× (23.1 → 70.7). The flat result is what the retention refinement
  predicts, so the two measurements corroborate each other. Do not quote 70.7 µs
  again without re-measuring.

Full write-up in
[the spike §1.7](docs/research/2026-08-history-greenfield-spike.md).

### DELETE `pauseRecording()` / `resumeRecording()` / `isRecordingPaused()`

**Not deprecate — delete, in 15.0.0.** This was previously written as blocked on the
transaction shipping first, on the grounds that removing a published API with no
replacement leaves callers stranded. That reasoning is void now that breaking changes
are acceptable, and it was the wrong trade anyway: the API is a **silent-data-loss
footgun**, so a deprecation window is a window in which more call sites acquire it.

Delete the three methods, the `pausedSignal`, the early return at `time-travel.ts:128`,
and lever 3 of `docs/guides/time-travel-in-production.md` (the pause + sealing-write
recipe). Nothing in `packages/*` or the demo depends on them, and v3 — the only known
adopter — deliberately type-erases `timeTravel` and does not use them.

**This can ship before the transaction exists.** Its absence is strictly safer than its
presence, so it is not gated on the replacement.

Not merely verbose — **unsafe**, and its own guide proves it. It cannot express "one
step", only "record nothing" (`time-travel.ts:128` is the whole implementation), so the
documented recipe needs a synthetic sealing write landing on an invented domain field,
and the entry is then identified by a timestamp rather than by the action. An earlier
revision of that guide shipped the destructive version without the seal.

And it is a **global** mode: MEASURED, an unrelated `tree.$.rev.set(999)` inside a paused
window was suppressed too. Correctness requires sole ownership of the tree for the
window's duration — which a synchronous `for` loop has and a multi-second `mergeMap`
over N requests does not.

The narrow shape where it is genuinely fine — synchronous, single-writer, quiescent app,
with a meaningful revision field to seal on — is an import script, not an interactive
bulk action. Which is to say it is dev behaviour that was documented as a production
lever.

Note for the RFC 0012 authors: §2 there calls pause "the imperative version: correct, and
it puts the burden on every call site." By this repo's own guide it is **not correct on
its own**. The burden is not verbosity, it is silent data loss.

[history-the-native-shape.md](docs/architecture/history-the-native-shape.md) argues
for one of the six (the path-diff log). Read it as an advocate, not as the plan — and
note the spike narrowed its central premise: `notify()` does **not** fire at every
write site (plain leaf writes reach it only via `interceptLeafSignals`, `status()`
never notifies, and a whole `form()` is a single path, so a path log has no in-form
field granularity).

Two things the spike established that any option must reckon with:

- **Restoring a snapshot is O(state), not O(1).** There is no root pointer to swap;
  `restoreState` is `this.tree(state)`, a full recursive write. The snapshot model's
  only claimed advantage over a log does not exist in SignalTree — measured 434 µs
  vs 1.08 µs for one undo step at 50k rows. Verify this before building on it; it
  inverts what every prior doc here assumed.
- **`changeId` notifies nothing** — it passes the same value as `value` and `prev`,
  so `flush()` drops it, and a naive log inverse therefore produces a duplicate row.
  Blocks any log-based option until fixed.

`notify(path, value, prev)` already exists at every write site
(`path-notifier.ts:113`, called from entity-signal, form, devtools), and
`updateAndReport()` already returns changed paths. So the library already produces
`{ path, before, after }` per write and `timeTravel()` throws it away to snapshot
the root instead — which is the only thing an immutable-root store CAN capture, and
we are not one.

On a diff log: labels are a field, grouping is a span id, coalescing is merging
adjacent same-path entries, per-entity undo and branch scoping are both a path-prefix
filter, authorship is a field, and collection recording is a subscription to a
notification that already fires. Nine problems, one decision.

Genuinely hard, and must be settled first: non-invertible writes (ST2028's class),
coalescing order correctness, path stability under `changeId` (ST2031's class),
retention of references into the shared graph, and pre- vs post-batch recording.

### 2a. Fix phantom undo steps on `entityMap({ history: false })`

**This item used to say "record collection mutations." That was wrong — see the
retraction in
[14.0.0-what-actually-happened.md](docs/audits/2026-08/14.0.0-what-actually-happened.md).**
Collection mutations record fine. `removeOne` → `undo()` brings the row back,
`setAll` reorder → `undo()` restores the ORDER, and 20 `updateOne` in one microtask
is one entry that one undo reverts. My "verified" evidence was a synchronous
assertion against a `queueMicrotask` flush: I read the counter and never called
`undo()`.

The real defect underneath it: a collection excluded with `history: false` still
produces history entries. Five excluded-only writes gave five entries and
`canUndo() === true`, and the undo changes nothing a user can see — a dead Ctrl+Z,
which is worse than no undo because it burns a step the user believes they spent.

**Fix the option, not just the symptom — breaking changes make the real fix available.**
The `history` option name carries **two opposite meanings** today:

| Marker        | `history` today      | Means                                          |
| ------------- | -------------------- | ---------------------------------------------- |
| `form()`      | `history: history()` | **Opt IN** to this form's own undo stack       |
| `entityMap()` | `history?: boolean`  | **Opt OUT** of the global `timeTravel()` stack |

One name, opt-in at one position and opt-out at another. Patching the phantom entry
leaves that collision in place, and the collision is the reason the phantom exists:
`false` means "do not put me in the snapshot" when what a caller wants is "I am not
part of undo at all." Under the target's §4.5 split, positional markers answer exactly
one question — **is this state eligible for history** — and both markers should express
it the same way.

Do this as one change with the phantom fix, since they are the same bug at two depths.

**Also now known, and it settles the question item 2 deferred:** granularity today is
**per microtask**, not per mutation and not per user turn. 20 writes with no `await`
between them collapse to one entry; the same 20 with an `await` make 20. So the
"decide per-mutation or per-turn" question has a third, undesigned answer already
shipping — and it means turn boundaries are decided by incidental `await` placement
in the caller. That is the thing to fix, and the transaction **handle** is how — not a
callback form, which is measured not to survive `await`. See the target doc §4.1.

**Constraint, already measured:** time travel, devtools and serialisation share one
snapshot path, memoised per node. A purpose-dependent snapshot cannot just branch —
the memo serves whichever purpose asked first. See
[0012 §3](docs/rfcs/0012-history-scoped-marker-capture.md).

### 2b. Delete the `__provisional` / `finalizeProvisional` machinery

`time-travel.ts:193-213` and `:308-323` implement a half-built coalescing scheme with
**no caller anywhere in `packages/*/src`**, and the comment at `:123` already admits
it went "gone rather than wired up." It is still filed as a gap elsewhere.

**Delete it, and do not wait for the transaction.** There was an argument for holding:
`finalizeProvisional(state)` is a deferred-entry-completion mechanism, which is what
`commit()` needs, so deleting it now means rebuilding something similar later. That
argument loses. It was built to coalesce rapid same-path updates against a snapshot
stack; `commit()` has to close a **path-scoped delta spanning concurrent writers**.
Resurrecting the first as the second would inherit assumptions that no longer hold, and
re-adding ~20 lines is cheaper than reasoning about which of them still apply.

Keep the design note, not the code: **deferred completion is a real requirement, and
this was a first attempt at it.**

### 2c. `insertAt` on collections

The one thing a value diff genuinely cannot recover: position. `removeOne` +
`addOne` puts the row back at the END (`a,c,d,b`), and the only position-preserving
workaround is `setAll`, which is O(N) to move one row — the anti-pattern verbatim.
Every undo shape in the spike needs this; it is not specific to a choice.

## 3. Authorship on a write

Mark a write as non-user so it stays out of the undo stack by construction, instead
of every call site remembering `pauseRecording()`. Then `@signaltree/realtime` and
`@signaltree/events` can do the right thing — neither uses pause today, and a
server push is currently user-undoable.

## ~~4. Reword two fit-page rows~~ — WITHDRAWN, the premise was false

Both rows were flagged because of the retracted collection-recording claim. Drag undo
**works**: `setAll` reorder `a,b,c` → `c,a,b` → `undo()` returns `a,b,c`, order
included, with no counter-bump workaround. Nothing to reword.

The one thing still worth saying on that page is scope — whole-tree undo can revert a
server push the user never made — but that is item 3, and it is a real limitation
rather than a wrong claim.

## ~~5. State the collection limitation on the npm README~~ — WITHDRAWN

There is no collection limitation to state. Retracted with item 4.

## 5b. Naming: finish the pass

[api-naming-audit.md](docs/audits/2026-08/api-naming-audit.md) — run against the BUILT
surface, since an `as any` attachment is invisible to a type-level read and one finding
is exactly that.

Done: `removeAll()` deleted (pure alias of `clear()`), and the `coalesce()`/`update()`
data-loss defect it surfaced.

Still to do, in order:

1. **DELETE `batchUpdate`** — it is a pure duplicate of the tree callable, not just a
   composition. Its body is `recursiveUpdate(signalState, arg)`, which is precisely what
   `tree(partial)` / `tree(updater)` already do; with `batching()` attached it adds a
   `batch()` wrap, so `tree.batchUpdate(x)` === `tree.batch(() => tree(x))`.

   **Hazard, handle before deleting:** the demo's `benchmarks.service.ts` calls it behind
   a `typeof … === 'function'` guard **with a silent fallback**, so removing the method
   leaves the benchmark running and measuring a different path. Re-run and compare that
   benchmark as part of the change — a green build will not catch it. Sites:
   `signal-tree.ts`, `batching.ts:63,381`, `builder-types.ts:105`,
   `packages/core/README.md:2136`, `ENHANCERS.md:28`, `callable-syntax-demo`, and the
   benchmark harness.

2. **Document `batch` vs `coalesce`.** Not duplicates — MEASURED, a mid-callback read
   inside `coalesce` sees the OLD value because `coalesce` defers the WRITE, while
   `batch` defers only notification. Neither docstring says so, and both currently imply
   the same end state reached two ways.
3. **`getHistory()` / `getCurrentIndex()`** — the only `get`-prefixed accessors in a
   library of bare nouns (`all()`, `count()`, `canUndo()`). Both move to the devtools
   surface anyway; rename once, there.
4. ~~**`resetHistory()` vs `clear()`**~~ — ANSWERED, no rename. MEASURED: after 3
   writes, `resetHistory()` left `n === 3`, `canUndo() === false`, and a following
   `undo()` left `n === 3`. It empties the stack and leaves state alone. The name is
   accurate; `clear()` would be ambiguous between the two operations.
5. **`byIdOrFail()`** — an `OrFail` suffix unique in the API, for a "strict variant"
   concept that recurs without it (`removeMany`, `addMany` both throw).
6. **`map()` on `entityMap`** — returns `ReadonlyMap`, but reads as a projection next to
   `all()`. `asMap()`/`byIdMap()`. The `WRONG_ENTITY_METHODS` table exists for this class
   of mistake already.
7. **`__timeTravel`** — enumerable on the public tree object, so serialisation, devtools
   and `{ ...tree }` all see it.

### Pass 2 — the other packages (done; findings below are the work left)

8. **`@signaltree/events` inverts Zod's naming, and re-exports Zod.** MEASURED:
   `validateEvent` THROWS, `parseEvent` returns a result — backwards from `parse` /
   `safeParse` in the library it ships as `z`. Rename: `parseEvent` throws,
   `safeParseEvent` returns, `isValidEvent` unchanged.
9. **`@signaltree/events` mixes `Id` and `Key`** for the same concept —
   `generateCorrelationId` AND `generateCorrelationKey` are both public, beside
   `generateEventId` and `generateIdempotencyKey`. Pick one suffix.
10. **`ConnectionState` is two different public types.** A union in
    `events/angular/websocket.service.ts:35`, an interface in `realtime/types.ts:22`.
    An app using both packages imports one name for two incompatible shapes. Realtime
    also has its own `ConnectionStatus` enum beside it.
11. **`packages/enterprise/` is dead** — one stray `signaltree.code-workspace`, no
    package.json, no source. `@signaltree/enterprise` was removed in 14.0.0. Delete the
    directory or move the workspace file to the repo root.

### Pass 3 — config and option keys (done; work left below)

12. **`treeName` is a legacy alias for `name`** — the source says so verbatim
    (`/** Alias for name (legacy support) */`) and `devtools-impl.ts:1096` resolves
    `name ?? treeName`. Same class as `removeAll` and `equal`. Delete it.
13. **`TreeConfig.enableTimeTravel` is DEAD** (`types.ts:489`) — zero consumers in
    `signal-tree.ts`. A second, LIVE `enableTimeTravel` exists on `DevToolsConfig`
    (`types.ts:997`, used at `devtools-impl.ts:666,705`). So the flag a user is most
    likely to reach for silently does nothing while the working one is elsewhere.
    Delete the dead one.
14. **`Config` vs `Options` has no rule** — 37 vs 19, no distinction. Proposed rule:
    `Config` for construction-time config of a long-lived thing, `Options` for per-call
    arguments. Several names already fit; the outliers are the rename.
15. **ng-forms has four overlapping form-config types** — `FormConfig`(core),
    `FormTreeOptions`, `AngularFormsConfig`, `SignalFormOptions` share `validators`,
    `asyncValidators`, `storage`, `debounceMs`, `destroyRef`, `fieldConfigs`,
    `conditionals`, `injector` in varying subsets. Structural, needs a design pass
    rather than a rename.

Pass 3 also confirmed two things already filed: `equal` appears as an option key in
THREE interfaces (which is why removing the export was right, not merely tidy), and
`history`'s opt-in/opt-out collision spans exactly two interfaces — so unifying it is
small.

### Still uncovered

- **Config/option key names**, systematically. Three surfaced incidentally and all
  three were problems (`history` opt-in/opt-out, `equal` colliding with an export,
  `batchUpdates` naming a flag that does not control `batchUpdate`). That hit rate
  argues for a dedicated pass.
- **Type/interface names** beyond the collisions above (~70 in `events` alone). One
  lead was chased and cleared — `ErrorClassification`/`ClassificationResult` are two
  real concepts, not a duplicate.

## ~~6. Re-score the 32-case time-travel audit~~ — DONE 2026-08-10

Both documents re-scored by outcome against the built package on `main`. Every
verdict now names the `undo()`/`redo()`/`jumpTo()` it called and the state
afterwards. Seven of 32 cases moved, **five of them downward**, plus workload
verdicts 2/4/5/6/8 in
[undo-business-and-ux-cases.md](docs/audits/2026-08/undo-business-and-ux-cases.md).
Method and results:
[time-travel-use-case-audit.md](docs/audits/2026-08/time-travel-use-case-audit.md).

Confirmed along the way, independently: collection mutations record, `undo()`
restores deletes, field edits and **order**, and 20 `updateOne` in one microtask is
one entry reverted by one undo. The retraction holds.

### 6a. NEW DEFECT — `timeTravel()` does not cover `form()` state

**The largest finding of the re-score, and it loses user data.** Form writes never
notify the history recorder.

- Form-only tree, 3 form writes: `getHistory()` is `["INIT"]`, `canUndo() === false`,
  `undo()` is a no-op. Identical writes to a plain leaf on the same-shaped tree give
  4 entries and a working undo.
- Mixed tree: a _later_ plain-leaf write snapshots the form's then-current values
  incidentally, so `undo()` on an unrelated field **rewinds the form to a stale
  value**. Measured: `plain='p1'; name='ada'; plain='p2'; name='ada l'` → one
  `undo()` → `plain='p1'` AND `name=''`. One Ctrl+Z on a neighbouring field wiped
  the form.

`form({ history: history() })` — the form's own scoped stack — works correctly.
This is why v3 does undo at the form layer and type-erases `timeTravel`: their
architecture was forced, not chosen.

Do not fix by making the snapshot walker descend into form markers — that
reproduces the whole-tree-snapshot problem item 2 already ruled out. This is
evidence FOR the path-scoped delta representation, and it belongs to that decision.
Until then, document scoped form history as the only correct mechanism.

### 6b. NEW DEFECT — `createAuditTracker` is a 100 ms polling sampler

`signalTree` exposes no `.subscribe`, so the tracker always takes its fallback
branch, `setInterval(handleChange, 100)` (`audit.js:41-49`). It samples rather than
trails. MEASURED: two writes inside one window log only the last; **a write and its
revert inside one window log nothing at all**.

Boundary measured: two writes 0/25/50 ms apart log **1** entry, 90 ms+ log 2. A
write followed by a revert to the original value logs **0** entries at 0 ms and
50 ms, and 2 at 120 ms — so below ~90 ms the trail has no record it happened.

That is acceptable for an undo stack and wrong for an audit trail, which is the
thing it is named for and recommended for in the regulated/healthcare workload.
Either drive it from `PathNotifier` (the notification already fires at every write
site) or delete it and document `createAuditCallback` / `getHistory()`, which are
exact. It also leaks its interval unless the returned stop function is wired to a
`DestroyRef`.

### 6c. NEW DEFECT — `undo()` after `deserialize()` reverts the restore

`deserialize()` is recorded as an ordinary `BATCH` entry (`["INIT"]` →
`["INIT","BATCH"]`), so `canUndo()` is `true` immediately after a restore and the
first `undo()` always discards it. Verified at the boundary, not from one data
point — with a payload restoring `n = 2`:

| target before restore  | entries | `canUndo` | after undo | after 2nd undo |
| ---------------------- | ------- | --------- | ---------- | -------------- |
| fresh                  | 2       | `true`    | `0`        | `0`            |
| 1 prior write (`7`)    | 3       | `true`    | `7`        | `0`            |
| 2 prior writes (`7,8`) | 4       | `true`    | `8`        | `7`            |
| 3 prior writes         | 5       | `true`    | `9`        | `8`            |

Where it lands varies; that it discards the restore does not.

**Severity correction on the first report:** it is **recoverable** — `canRedo()` is
`true` and `redo()` returns the restored value. This is an enabled undo button
whose first press does something the user cannot want, not data loss. Rank it below
6a and 6b accordingly.

Mitigation that works today: `deserialize()` **before** `.with(timeTravel({}))` →
`canUndo() === false` and `undo()` is a no-op, because the restored state becomes
`INIT`'s baseline and undo has no way past it.

⚠️ **That only covers SYNCHRONOUS hydration** — `localStorage`, a transferred SSR
blob, an embedded bootstrap. An app hydrating from an **async fetch** cannot
sequence it that way: the tree must exist before the response arrives, so the
enhancer is already attached and the restore lands as a recorded entry. So the doc
line closes the narrower half; the async half still needs a code answer (a
non-recording restore path, or authorship — item 3).

### 6d. `maxHistorySize` — it is a buffer length, not a step count

Bigger than first reported. Default is 50 (`time-travel.ts:80`,
`config.maxHistorySize ?? 50`) and the type declares no default, so "omit it for
unbounded history" is false. But the off-by-one is the part that affects everyone.
10 writes on a tree starting at `n = 0`:

| config     | entries | index  | undos spendable | note               |
| ---------- | ------- | ------ | --------------- | ------------------ |
| omitted    | 11      | 10     | 10              |                    |
| `0`        | 0       | **-1** | **0**           | undo disabled      |
| `1`        | 1       | 0      | **0**           | undo disabled      |
| `2`        | 2       | 1      | 1               |                    |
| `5`        | 5       | 4      | 4               |                    |
| `-1`       | 0       | **-1** | **0**           | undo disabled      |
| `NaN`      | 11      | 10     | 10              | silently unbounded |
| `Infinity` | 11      | 10     | 10              |                    |

1. **HEADLINE: any value ≤ 1 silently disables undo.** `0` reads as "no limit",
   `1` reads as "one step"; both give none. `-1` also drives `getCurrentIndex()`
   to `-1`, since the trim runs `currentIndex--` against an already-empty buffer.
   Fix with **input validation and a stable ST-code** — a silently dead undo
   button is the same failure class as the phantom step fixed in 2a.
2. **N entries yields N−1 undo steps**, because the oldest retained entry is a
   floor you land on rather than a step you spend.

   ⚠️ **The docs are NOT wrong and must not be renumbered.** An earlier draft of
   this item said "every doc sample is off by one". That was false. `types.ts:43`
   says "Maximum number of history **entries** to keep, `@default 50`" and
   `time-travel-in-production.md:95` says "20 writes against `maxHistorySize: 5`
   leaves a history of 5" — measured here as exactly 5 entries. Changing `50` to
   `51` would introduce a real error. **Document the conversion**; do not touch
   the numbers.

3. **`NaN` is silently unbounded** (`length > NaN` is never true). Narrower than
   1; cover it in the same validation guard.

**It is `??`, not `||`, and that decides the fix.** Under `|| 50` a `0` would
become `50` and undo would work; under `??` it is a genuine zero-length buffer that
shifts off every entry as it is pushed (`:233`). So **validate the input** — reject
`< 1` and non-finite — and do **not** change the `??`, which correctly
distinguishes "not supplied" from "supplied as 0".

**Scope:** every row of that table was executed at 10 writes on a single scalar
leaf. The conversion and the ≤ 1 result are arithmetic on buffer length and should
hold generally, but were not re-run across collection or form shapes.

### 6g. Shipped `.d.ts` files carry no JSDoc

Found while checking whether `maxHistorySize`'s documented `@default 50` reaches
consumers. It does not. `removeComments: true` in `tsconfig.lib.prod.json` strips
every comment from declaration emit, so an IDE hover shows
`maxHistorySize?: number` with no description and no default. `core/src/lib/types.ts`
has 476 JSDoc lines; the shipped `types.d.ts` has 0.

All seven packages checked: **core, shared, ng-forms, guardrails, schema** set the
flag and ship 0 JSDoc lines; **events and realtime** do not and retain theirs. A
five-of-seven inconsistency rather than a policy, and the two that omit it show
the intended behaviour — so the fix is to drop the flag from the other five.

This is a discoverability defect out of proportion to its size: the library's
answer to "why would an agent reach for SignalTree" leans on the API being
self-describing, and today every hover in five of seven packages is bare.

### 6e. Doc defects found by re-scoring

- `commit`/`discard` are attributed to `createEditSession`, which has neither. The
  value-level API is `applyChanges`/`reset`; the tree-bound one is
  `createTreeEditSession` with `commit()`/`cancel()`. Wrong in the audit (now
  fixed) and in `docs/guides/time-travel-in-production.md:176` (not fixed).
- `docs/myths-and-misconceptions.md:261` says a path-bound edit session is "planned
  for v10.1". `createTreeEditSession` ships today.

### 6f. Tests do not pin any of this

The re-score ran as one-shot scripts, not tests. Cases 13, 15, 20 and 28 are live
defects with **no test pinning them** — 20 in particular is silent data loss on the
primary editing surface. Add regression tests with the fixes.

**Also answered:** 5b item 4 — `resetHistory()` EMPTIES the stack and leaves state
alone; it does not restore-to-initial. The name is accurate; do not rename it to
`clear()`.

## 7. Delete the parity framing from time-travel guidance

Nothing in our docs should reason from what elf or Akita do. Their constraint was
snapshot cost per write, which 13.5.0 removed. That framing is how `pauseRecording`
arrived with a rationale that does not work.

`docs/guides/time-travel-in-production.md` also argues you can run `timeTravel()`
in production because recording is cheap. True and beside the point — whole-tree
undo reverts things the user never did. Rewrite around scoped, marker-declared
undo.

## 8. Capability matrix: two structural jobs

- **Split the grid** on the line already marked with †: architectural (a consumer
  cannot add it) versus convenience API (any library composes it). The unmarked
  rows are the real comparison.
- **Single-source it.** `docs/compare/capability-matrix.md` and the demo's typed
  `CapabilityRow[]` disagree by eight rows, and the demo openly declares the
  markdown stale. Generate the markdown from the typed data.

## 9. RFC 0008 needs an item-by-item check

[0008](docs/rfcs/0008-post-13.3-open-items.md) is the post-13.3 open-items list
from 2026-08-04; three releases have shipped since. Most is probably done, but
marking it executed without checking each item is how 0012 came to claim it had not
shipped when it had.
