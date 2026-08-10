# The v3 team's seven asks, judged against the ethos

**Status:** evaluation, 2026-08-10. These are outside input, which is what the RFC
process is actually for — see `AGENTS.md`. This document is the ethos screen that
should happen _before_ anything is drafted, because two of the seven fail it and
one is a defect rather than a feature.

## The test being applied

From `docs/architecture/design-thesis-and-benchmarking-rules.md` §1 and §4:

1. A write goes to **one leaf**. Nothing above it is rebuilt or copied.
2. Partial writes are **O(1) regardless of state size**.
3. **The anti-pattern is full-state work per change.**

And the marker principle: state declares its behaviour **at the position where it
lives** — `stored()`, `status()`, `compared()`, `entityMap()` — not through global
switches.

A request passes if it removes full-state work, or if it needs collection
internals no consumer can reach. It fails if it is a global switch expressing a
positional fact, or if it makes a dev-only instrument look production-ready.

---

## #1 `setOne()` — PASSES, and it is a defect before it is a feature

**Strongest of the seven, and stronger than the v3 write-up claims.**

There is no replace path anywhere. `upsertOne` delegates to `updateOne`
(`entity-signal.ts:1078-1086`), and `updateOne` merges at `:875`:
`{ ...entity, ...transformedChanges }`.

**The live defect:** `entity-signal.ts:384-385` documents the entity-node callable as

```
node(value)    → full entity replace via updateOne
node(updater)  → updater-based replace via updateOne
```

and `:414` calls `updateOne`, which merges. **The docstring promises replace and
the code merges.** The updater form is worse: the updater returns a full `E`, which
is then spread as `Partial<E>` — so an updater that _removes_ a key leaves the old
value in place, silently.

**Ethos verdict: passes on all three counts.** v3's workaround —
`setAll(all().map(...))` per single-entity write — is the anti-pattern verbatim:
full-collection work to change one row, 50,000 element copies to change 100 rows.
`setOne` is O(1), position-preserving, and the missing half of a write surface that
already has merge. It is the same "missing half" argument `changeId`'s own docstring
makes.

**Correction to the v3 write-up, which I agree with:** the ST2027 hook is wrong.
ST2027 lives in the leaf comparator (`signal-tree.ts:715-744`) and fires only when
the new value deep-equals the current one. `setEntity()` changes a row, and
`entityMap` maintains its own storage and dirties via a version counter, so it never
reaches `leafEqual`. Drop that paragraph — the O(n) argument does not need it.

## #2 Multi-selection — PASSES, if argued as the invariant

`entity-signal.ts:528-557` is the entire selection surface: `activeId`,
`activeEntity`, `setActiveId`, `clearActive`. Nothing plural. The `selection<T>()`
with `toggle`/`count` is a **test fixture** in `custom-markers.spec.ts:87`
exercising the custom-marker path, and that extension API is not exported from
`packages/core/src/index.ts`. So hand-rolling really is the supported answer.

**Ethos verdict: passes, but only on one of the two arguments offered.**

The convenience argument is weak — a `Set` in a sibling branch is composition, and
by the standard applied to the capability matrix this session, "any library can
compose it" means it is not a capability.

The **invariant** argument passes: _selection only ever references loaded entities_
cannot be maintained outside the collection. v3 has to prune `selectedIds` manually
on every page-1 replace and snapshot it for rollback on delete. That is collection
internals leaking into app code, which is the test.

Consistency also favours it: `activeId` already exists, and is already remapped on
`changeId` at `:770`. Multi-select is the plural of a feature we accepted.

## #3 Paged / infinite loader — PASSES, watch config sprawl

Confirmed and explicitly deferred: RFC 0003 §5 lists "infinite/paginated
collections" as deferred, claiming it layers on without breaking the API. The
loader applies results via `entity.setAll(rows)` only (`entity-loader.ts:434`,
`:476`) — whole-collection replace is the sole write path, so there is no append
and a paged domain cannot reach SWR, `staleTime` or single-flight at all.

**Ethos verdict: passes.** "The collection declares how it loads" is positional
declaration. And a paged grid currently pays for whole-collection replace on every
page, which is the anti-pattern again.

**The risk to state plainly in any draft:** a second loader mode doubles the config
surface of the marker whose own RFC (0003 §4) argued _against_ a second marker on
exactly those grounds. It has to be one marker with a richer `load`, not
`entityMap` plus `pagedEntityMap`.

---

## #4 `devOnly(timeTravel())` — FAILS the ethos screen

Confirmed factually: `pauseRecording`/`resumeRecording` exist (`types.ts:421-423`,
attached at `time-travel.ts:744-746`), `timeTravel()` ships as a full runtime
enhancer with one `ngDevMode` check at `:187`, and there is no `devOnly()` anywhere.

**But the request should be declined as framed**, and this is the interesting one.

It asks us to make a **whole-tree** instrument's methods type-reachable in
production. This release established that whole-tree undo is the wrong shape for
production, and not on cost grounds: an unrecorded change rides inside the next
recorded snapshot, so a user's Ctrl+Z reverts a server push they never caused.
Scope is the only defence. **v3's type erasure is arguably correct**, and
`tree-enhancers.ts:58-73` reached the right conclusion for the right reason.

Worse, the specific thing it is wanted for — `pauseRecording()` in `bulkPatch$` —
rests on a rationale that **does not work**. Pausing alone records nothing, so undo
steps back _past_ the bulk operation and the result becomes unreachable. Verified
this session.

**What v3 actually needs is scoped undo**, which is TODO items 2 and 3, not a
wrapper that makes a dev tool look shippable. Answering #4 as asked would ship a
foot-gun with a type signature that endorses it.

## #5 `timeTravel({ mode: 'inspect' })` — FAILS as framed, real gap underneath

The v3 write-up is right that RFC 0012 §4 Option A already rejected per-marker-type
exclusion, and right not to re-propose it. But two corrections:

**The per-node opt-out already shipped.** `history?: boolean` on `entityMap` exists
and is enforced (`types.ts:700-723`, `entity-signal.ts:1296`), landed in 14.0.0 with
ST2029. So this is not a missing capability.

**And purpose-on-the-enhancer fails the ethos screen** — it is precisely a global
switch expressing what the marker principle says belongs at the position. That is
the thing `stored()`, `status()` and `compared()` exist instead of.

**The real gap, which is worth taking:** v3 has no undo at all, so history retention
is pure cost, and expressing that one app-wide fact requires `history: false` on
every `entityMap` across three apps. The honest framing is not "let the enhancer
declare its purpose" but **"there is no inspector-only path — you attach the undo
engine or you get nothing."**

That gap is real and half-closed already: `devtools-impl.ts:515` carries an
`enableTimeTravel` flag internally, so the separation exists inside devtools and is
simply not expressible from outside.

## #6 `changeId` + held-node diagnostic — PASSES cleanly

Confirmed: `:768-770` deletes `entitySignals`/`nodeCache` for the old id, with a
deliberate comment at `:765-767` that aliasing would be the worse failure. Right
call, and nothing warns — a held node just goes quiet.

**Ethos verdict: passes, and it is the cheapest of the seven.** "Diagnostics with
stable error codes" is one of the six capabilities no competitor has. A held node
resolving silently to `undefined` is exactly the class ST-codes exist for, and v3's
`selectById()` is a long-lived public API that closes over an id — so adopting
`changeId` silently breaks any component holding the old node.

## #7 Ops pattern — not a repo question

No repo-side evidence bears on it. If #1–#3 land, most of both implementations
collapses; that is the input to the decision, not a request of core.

---

## Revised ranking, after the ethos screen

| Ask                            | Verdict                | Why the order changed                                                                                 |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **#1 `setOne()`**              | Take — as a **defect** | The docstring already promises it. Shortest path, and the workaround is the anti-pattern verbatim     |
| **#6 held-node diagnostic**    | Take                   | Cheapest, and it protects a differentiator                                                            |
| **#2 multi-selection**         | Take, on the invariant | Volume win, but drop the convenience argument                                                         |
| **#3 paged loader**            | Take, carefully        | Volume win; must be a richer `load`, not a second marker                                              |
| **#5 inspector path**          | Reframe                | Not "purpose on the enhancer" — "no inspector without the undo engine"                                |
| **#4 `devOnly(timeTravel())`** | **Decline as framed**  | Makes a whole-tree dev instrument look production-ready, for a use case whose rationale does not work |

**#1 and #6 are shippable now** and neither needs a design decision. #2 and #3 are
the volume wins and both want the collection-recording work (TODO item 2) settled
first, since all three touch the same write path.

## For the drafters

`AGENTS.md` says we do not write RFCs for our own work. These came from outside, so
they are the real thing — but #4 and #5 should go back with the ethos objection
rather than into a draft, and #1 should be filed as a bug report against
`entity-signal.ts:384`.
