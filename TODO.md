# TODO

Work that is decided and not yet done. **This is not an RFC list.**

We do not write RFCs for our own work — we make the change. An RFC is what an
outside contributor writes to propose something, and `docs/rfcs/` is the archive
of decisions already taken, kept for the options that were REJECTED and why. If
you are about to create `docs/rfcs/00NN-my-idea.md` for something we decided
internally, put it here instead and go do it.

**Target release: 14.1.1, and it is a clean break.** Breaking changes are explicitly
acceptable on anything — decided 2026-08-10. Two consequences that change how items
below are written:

1. **Prefer deletion to deprecation.** A wrong API kept for one release cycle is a
   wrong API that gets copied into someone's codebase for one release cycle. Nothing
   here needs a `@deprecated` window.
2. **What still gates work is KNOWLEDGE, not compatibility.** The only reason to hold
   an item now is that we do not yet know the right shape — never that removing it
   would break someone. See the sequencing note at the end of item 2.

---

# RELEASE SCOPE — 14.1.1 is SCOPE A ONLY

**Decided 2026-08-11.** Two bodies of work have been running in one conversation and
they are at opposite ends. This section is the boundary; when in doubt about whether
something belongs in 14.1.1, it is the authority.

|                                |                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| **Scope A — the audit**        | retractions, naming, the defects found while auditing, gates. **~85% done. Ships as 14.1.1.** |
| **Scope B — the architecture** | position-attributed transactional history. **Not started.** 16.0.0+                           |

Why cut now rather than hold: holding a release for an unstarted six-phase build is the
14.0.0 mistake inverted. 14.0.0 shipped too early _while the audit was still producing
findings_; holding 14.1.1 for work that has not begun is the same error at the other
end. 6a is live data-loss in shipped 14.0.0 and its doc fix is done — users benefit now
rather than after Phase 6.

## IN 14.1.1

Everything already committed, plus:

- **`batchUpdate` deletion** — with the demo benchmark **re-run and compared**, not a
  green build. It is called behind a `typeof … === 'function'` guard with a silent
  fallback, so removal leaves the benchmark measuring a different path.
- **entityMap renames** — `byIdOrFail()`, `map()`.
- **`batch` vs `coalesce` documentation** — the mid-callback contract is undocumented on
  both sides.
- **6d input validation** — `maxHistorySize ≤ 1` silently disables undo. Cheap,
  contained, and a footgun. Needs an ST code.
- **Item 7** — parity framing removal.
- **Item 1c** — the `changeId` held-node diagnostic.
- **Capability matrix** (item 8) and **RFC 0008** (item 9).

## OUT of 14.1.1 — do not let these leak in

- **Everything in the architecture plan.** Turns, transactions, ownership positions,
  containment, the turn store, position indexes.
- **The `capacity` removal.** It is breaking and it belongs _with_ the turn store, not
  before it. Removing it early strands adopters twice.
- **6a's code fix.** It is gated on the representation decision; the doc fix has shipped.
  > **Boundary crossed (2026-08-11, audit note):** the working tree later landed the
  > form-notifier fix that makes global `timeTravel()` record direct `form()` writes,
  > and `docs/guides/time-travel-in-production.md` §2b, `packages/core/README.md` and
  > the 2026-08 audits were rewritten to say 6a is fixed. This contradicts the
  > "OUT of 14.1.1 — do not let these leak in" decision above. Noted here because the
  > boundary was recorded, not because the fix is wrong — it is verified working and
  > fully green. Open for the boundary decision; nothing reverted.
- **The MST / Yjs audit.** It blocks public uniqueness claims, not the release.

Mixing Scope B into this release makes it un-reviewable. That is the whole point of the
boundary.

## BLOCKS the cut

- **Tests for 6a–6d.** Six spec files exist under `enhancers/time-travel/`, and none
  pins the four documented defects. `tools/verify-history-defects.mjs` is a **provenance
  tool with deliberately inverted exit codes** — it goes red when a defect is FIXED — so
  it is not coverage. Documenting a data-loss defect with nothing that fails when it
  silently changes is exactly how the retracted claim survived on four surfaces.
- All gates green, tests green, changelog finalised, versions bumped.

## After the cut

Phase 0A and 0B from
[history-priority-hierarchy.md](docs/architecture/history-priority-hierarchy.md).
Both are small, both are falsifiable, and either can send the design back — which is why
they come before any of Scope B's implementation.

---

# PUBLISH-READY ROADMAP

This is the master checklist for "SignalTree is actually done and publish-ready",
not merely "the kernel architecture is complete". The first 3-4 items finish the
engineering redesign. Everything after that is what turns the repo into a library
that strangers can safely `npm install`.

## 1. Finish the last kernel architecture work

These are still release blockers because they affect correctness guarantees.

- Finish `stored()` / persistence consequence ordering.
- failed PREPARE -> zero persistence writes
- atomic multi-field/frame commit -> persistence sees only final coherent state
- undo/redo/rollback/realization persistence semantics pinned
- persistence failure semantics documented
- Add the final heterogeneous atomicity proof.
- scalar + structural change in same frame
- failure before commit leaves everything neutral
- success advances one physical revision
- PROJECT/PUBLISH/persistence happen only after coherent commit
- Run a fresh antagonistic audit of current HEAD.
- Revalidate old findings rather than trusting historical issue labels.
- Fix every remaining correctness violation.
- Fix every remaining accidental O(n) hot-path violation.
- Freeze the kernel architecture once this passes.

Exit condition: no known correctness redesign or semantic blocker remains.

## 2. Complete every public feature you intend to advertise

Make an explicit list of what SignalTree v1 actually promises.

At minimum, verify the production behavior of:

- scalar reads/writes
- nested object signals
- recursive typed facade
- entity collections
- add
- remove
- update
- rekey/change ID
- restore
- held entity facade behavior
- key reuse/new SubjectId behavior
- transactions
- explicit pending transaction rollback
- thrown transaction rollback
- confirmed undo
- redo
- pending rollback
- confirm/seal behavior
- history retention
- subject reclamation
- structural causal history
- Angular observation/publication
- zoneless/OnPush behavior if advertised
- `stored()` / persistence
- any forms integration you intend to publish
- any plugin/enhancer APIs you intend to support

Anything incomplete should either be finished or explicitly removed from the v1 public surface.

## 3. Freeze the public API

Before publishing, stop treating exported API shape as fluid.

Audit:

- package exports
- public types
- public interfaces
- enhancer APIs
- helper functions
- error classes
- public symbols/constants
- factory functions
- entity APIs
- history APIs
- transaction APIs
- persistence APIs

Then:

- remove accidental exports
- expose anything users genuinely need
- remove internal escape hatches
- mark internal/test-only APIs properly
- make names consistent
- remove obsolete compatibility APIs you don't intend to support
- ensure the public API doesn't expose `SlotIndex` or other physical implementation details
- ensure runtime identity abstractions remain properly separated
- generate an API surface snapshot so accidental future export changes become detectable in CI

## 4. Lock TypeScript DX

SignalTree's recursive typing is part of the product, so this deserves release-level testing.

Create compile-time tests for:

```typescript
tree.$.profile.name();
tree.$.profile.name.set('Jonathan');

tree.$.orders.byId(id).status();
tree.$.orders.byId(id).status.set('done');
```

And test that invalid operations fail compilation.

Cover:

- deeply nested objects
- arrays if supported
- entity collections
- optional fields
- nullable fields
- unions
- readonly values
- literal types
- generic state definitions
- nested collections if supported
- enhancer-composed tree types
- transaction APIs
- history APIs
- persistence APIs
- emitted `.d.ts` files from the actual published build

## 5. Define supported Angular / TypeScript / Node versions

You need an explicit compatibility matrix.

Decide what v1 supports for:

- Angular versions
- TypeScript versions
- Node versions
- RxJS versions if relevant
- zone.js / zoneless configurations
- ESM
- browsers

Then test those combinations in CI.

Don't let `peerDependencies` imply support you haven't actually tested.

## 6. Package-output audit

Test the actual package consumers will install, not just source code inside Nx.

For every published SignalTree package:

- run the production build
- inspect generated package directory
- inspect `package.json`
- inspect `exports`
- inspect `.d.ts`
- inspect ESM output
- make sure source/test files aren't unintentionally shipped
- make sure internal package paths aren't broken
- verify source maps if shipped
- check tree-shaking
- confirm `sideEffects` metadata is correct
- confirm Angular metadata is correct where needed
- make sure package-to-package imports resolve from built artifacts

Then do `npm pack` or equivalent and inspect the tarball.

## 7. Install the packed package into clean consumer applications

Do not release based only on monorepo tests.

Create clean smoke consumers that install the generated tarballs.

At least:

### Angular consumer

```text
new Angular app
-> install packed SignalTree package
-> build production
-> run simple SignalTree example
```

Test:

- normal component
- OnPush
- zoneless if supported
- computed/effect/template observation
- entity operations
- transactions/history
- production build

### TypeScript-only consumer

If the core package is meant to remain framework-neutral:

```text
plain TS project
-> install core package
-> construct tree
-> mutate/read
-> compile and run
```

This proves you haven't accidentally leaked Angular into the kernel.

## 8. Browser/runtime compatibility tests

If this is a browser library, test actual runtime behavior beyond Vitest.

At minimum:

- Chromium
- Firefox
- WebKit/Safari equivalent

Especially for:

- Angular publication
- persistence
- structured values
- scheduling/microtasks
- serialization if used

You don't necessarily need a giant E2E suite. A small release smoke suite is enough.

## 9. Complete the correctness suite

Before v1, make sure permanent tests cover the architectural invariants we've spent all this time establishing.

Especially:

```text
PositionId != SubjectId != SlotIndex != key/path
```

and:

```text
all fallible semantic work before PRIVATE COMMIT
```

and:

```text
one physical commit -> one revision
```

and:

```text
PROJECT never determines authority
```

and:

```text
realization does not create causal authorship
```

and:

```text
semantic refusal has no physical/public/persistence side effects
```

Include adversarial cases involving:

- key reuse
- remove->restore
- remove->fresh-add same key
- restore->rekey->scalar
- fresh-add->rekey->scalar
- multiple effects sharing causal owner PositionId
- transaction abort
- pending rollback
- confirmed undo/redo
- stale structural state
- occupied destination refusal
- reclamation
- history retention
- held facades
- projection failure seams
- equality throws
- preparation throws

## 10. Finish the permanent performance suite

You already have much of this.

Make sure the final benchmark gate covers:

```text
10
100
1,000
10,000
100,000
```

for the meaningful operations.

Permanent logical assertions should prove:

- scalar read O(1)
- scalar write O(1)
- value update O(1)
- add O(1)-shaped
- remove O(1)-shaped
- rekey O(1)-shaped
- restore O(1)-shaped
- frame O(k)
- zero unrelated projection visits
- zero unrelated structural visits
- no public fresh-add key-order copying
- appropriate bounded causal work

Heavy timing stays behind `ST_PERF`.

Also preserve a final baseline report for the release.

## 11. Production-bundle cleanliness

Verify the things used for proving performance do not leak into production.

Check that production output contains no:

- performance counters
- benchmark hooks
- test-only integrity methods if they aren't intended
- instrumentation strings
- debug assertions
- test injection seams
- accidental Angular TestBed code
- development logging

Run the existing stripping/instrumentation guard against final HEAD.

## 12. Memory / lifecycle testing

SignalTree has semantic lifetimes, shells, tombstones and retained values, so release testing should include memory behavior.

Test long-running sequences such as:

```text
add
remove
restore
remove
retire
add another subject
repeat thousands of times
```

Verify:

- retired backing can actually be reclaimed
- SubjectIds aren't incorrectly reused
- retained shells don't accidentally retain huge payload graphs
- history retention behaves as configured
- pending transactions don't leak indefinitely
- publication tokens don't accumulate
- descriptor maps don't grow without bound

You don't need perfect heap science, but you should run at least one sustained churn test.

## 13. Error model

Audit all errors users can actually receive.

Define/export meaningful error types for things such as:

- invalid transaction operations
- rollback failure
- structural drift
- illegal restore
- persistence error
- unsupported operation
- history exhaustion if applicable

Errors should:

- have stable names
- carry useful context
- not expose internal SlotIndexes unless intentionally diagnostic
- preserve `cause` appropriately
- distinguish semantic refusal from catastrophic invariant failure

Document which failures leave state unchanged and which occur after committed state.

## 14. Persistence contract

Beyond implementation, document what persistence actually guarantees.

Specify:

- when writes happen
- what is serialized
- atomicity expectations
- initialization/hydration behavior
- migration/version behavior
- error behavior
- asynchronous adapter behavior
- whether multiple rapid commits coalesce
- interaction with undo/redo
- interaction with realization
- whether persistence restoration creates history

Treat this as a real API contract, not an implementation detail.

## 15. SSR/hydration decision

For an Angular library in 2026, users will ask.

Either support SSR/hydration and test it, or explicitly document:

> SignalTree v1 does/does not support SSR/hydration.

If persistence touches browser globals, make sure imports don't explode under Node SSR merely from loading the package.

## 16. Security / dependency audit

Before publishing:

- dependency vulnerability audit
- eliminate unnecessary runtime dependencies
- check dependency licenses
- check transitive dependency exposure
- verify no secrets/test credentials exist
- scan package tarballs for accidental files
- verify generated sourcemaps don't contain anything sensitive
- inspect postinstall/preinstall scripts; ideally none
- inspect prototype/key handling around user-generated entity IDs where relevant

## 17. Licensing and ownership

Make sure the repository and package are legally publishable.

You need:

- `LICENSE`
- copyright attribution
- package `license`
- third-party notices if required
- dependency license review
- contributor/license policy if accepting outside contributions

## 18. Package metadata

Every published package should have polished metadata.

Check:

- `name`
- `version`
- `description`
- `keywords`
- `license`
- `author`
- repository URL
- homepage
- bugs URL
- `type`
- `exports`
- `types`
- peer dependencies
- engines
- side effects
- publish config
- files whitelist

No placeholder metadata.

## 19. Decide the package structure

Freeze what you're actually shipping.

For example:

```text
@signaltree/core
@signaltree/angular
@signaltree/forms
...
```

Avoid publishing packages merely because they happen to exist in the monorepo.

Define:

- which are public
- which are experimental
- which are private
- how versions relate
- whether packages version together

## 20. Versioning policy

Choose and document SemVer behavior.

For example:

```text
1.0.0
```

means public APIs are now subject to compatibility expectations.

Define what counts as:

- patch
- minor
- major

Especially for:

- inferred TypeScript types
- causal semantics
- persistence format
- enhancer APIs
- error types

## 21. Changelog

Create a useful `CHANGELOG.md`.

For the initial release, summarize major capabilities rather than dumping hundreds of internal commits.

Something like:

```text
SignalTree 1.0.0

- Recursive typed SignalTree facade
- Angular signal integration
- Entity collections
- Transactions
- Causal undo/redo
- Structural time travel
- Persistence
- O(1)-shaped local mutation kernel
...
```

## 22. Migration / compatibility guide

Even for a first public release, you have had major internal/API changes during development.

If anyone may be using an earlier SignalTree version, document:

- breaking API changes
- old -> new syntax
- transaction changes
- entity API changes
- persistence changes
- history semantics

If nobody external uses it yet, this can be very small.

## 23. README worthy of a stranger

The README needs to sell and teach SignalTree without this conversation.

It should answer:

1. What problem does SignalTree solve?
2. Why not plain Angular signals?
3. Why not NgRx / SignalStore / another state library?
4. What does the syntax look like?
5. How do I install it?
6. How do I create a tree?
7. How do entities work?
8. How do transactions work?
9. How does undo/redo work?
10. How does persistence work?
11. What Angular versions are supported?
12. What guarantees does the library provide?

The first example should probably be extremely small:

```typescript
const tree = signalTree({
  user: {
    name: 'Jonathan',
    age: 43,
  },
});

tree.$.user.name();
tree.$.user.name.set('Jon');
```

Then move into the advanced capabilities.

## 24. Full documentation site

For a serious public library, README alone isn't enough.

For signaltree.io, I'd want sections such as:

```text
Introduction
Installation
Quick Start
Core Concepts
Recursive Signals
Entities
Transactions
Undo / Redo
Causal History
Persistence
Angular Integration
Performance
API Reference
Architecture
Recipes
FAQ
Migration
```

Use the architecture sophistication as a selling point, but don't make users learn PositionId and SubjectId just to set a name.

## 25. API reference generation

Generate docs from the public API only.

Users need searchable documentation for:

- functions
- types
- configuration
- enhancers
- transaction objects
- entity methods
- time-travel methods
- persistence interfaces
- errors

Keep physical-kernel internals out of the normal API docs.

## 26. Examples

Have copy/paste examples for:

- basic nested state
- computed/effects
- entity CRUD
- transactions
- rollback
- undo/redo
- persistence
- Angular component
- OnPush
- zoneless
- forms if shipping
- async flows where appropriate

Ideally have at least one runnable example app.

## 27. A showcase/demo application

For SignalTree specifically, this matters.

Build a small but nontrivial application demonstrating:

```text
entities
nested state
transactions
undo/redo
persistence
Angular templates
```

A todo app is probably too trivial for what SignalTree does.

Something like an editable order/project interface with undo/history would communicate the value much better.

## 28. CI release gate

Your required checks before merging/releasing should include at least:

```text
test
build
lint
type tests
package smoke test
consumer installation test
production instrumentation guard
```

Optionally:

- browser E2E
- performance logical gate
- dependency audit

No release should depend on remembering to run these manually.

## 29. Release automation

Set up the actual publishing workflow.

Prefer an automated pipeline that:

```text
tag/version
-> clean checkout
-> install locked dependencies
-> test
-> build
-> lint
-> package
-> smoke install
-> publish
-> create GitHub release
```

Use npm trusted publishing/OIDC/provenance if the publishing setup supports it rather than a long-lived npm token.

## 30. Release provenance / supply-chain hygiene

For a modern npm package, ensure:

- lockfile committed
- deterministic builds as practical
- protected release branch/tag
- npm 2FA/trusted publishing
- provenance enabled
- CI-only publishing
- no local developer machine required to publish production releases

## 31. Release candidate

Do not jump immediately from development to `1.0.0`.

Publish something like:

```text
1.0.0-rc.1
```

Then:

- install it from npm into fresh projects
- use it yourself
- ask a few people to try it
- verify documentation against the actual package
- collect packaging/DX failures
- fix them

Release candidates are especially valuable for TypeScript libraries because package/export/type problems often appear only outside the monorepo.

## 32. Real external consumer test

Have at least one project that is not inside the SignalTree monorepo consume the release candidate.

That catches:

- undeclared dependencies
- bad exports
- path aliases
- missing files
- source-only imports
- Nx assumptions
- test-only dependencies accidentally required at runtime
- bad TypeScript declarations

This is one of the highest-value release checks.

## 33. Final public API review

After RC feedback:

- remove anything embarrassing or clearly wrong
- don't casually add more features
- decide what is experimental
- mark experimental features explicitly
- freeze v1 API

Then generate the final API snapshot.

## 34. Final release regression run

Immediately before `1.0.0`:

```text
clean clone
install
test
build
lint
type tests
package
external consumer smoke
browser smoke
production bundle audit
logical complexity gates
ST_PERF baseline
dependency/security audit
```

No dirty working tree.

No ignored failures.

No known flaky critical tests.

## 35. Publish `1.0.0`

Then:

- publish packages
- publish docs
- tag repository
- GitHub release
- changelog
- release notes
- verify npm pages
- install exact `1.0.0` into a clean project
- verify signaltree.io installation instructions actually work

## 36. Post-release operational readiness

"Done" also means knowing what happens when somebody reports a problem.

Have:

- GitHub issue templates
- bug report template
- reproduction instructions
- feature request policy
- security reporting contact/policy
- contribution guide
- code of conduct if accepting community contributions
- support/version policy

## Concrete sequence from here

1. Finish stored()/persistence atomic consequence semantics.
2. Add final heterogeneous atomicity forcing test.
3. Perform fresh correctness/complexity audit of HEAD.
4. Fix every release-blocking audit finding.
5. Freeze public API.
6. Add exhaustive public type/API tests.
7. Establish Angular/TS/Node compatibility matrix.
8. Audit built package output.
9. npm-pack every publishable package.
10. Build clean external consumer projects from the tarballs.
11. Complete runtime/browser/SSR decisions and tests.
12. Run lifecycle/memory/churn tests.
13. Audit errors and persistence API semantics.
14. Complete README.
15. Complete signaltree.io docs.
16. Generate public API reference.
17. Build a production example/demo.
18. Complete package metadata/licenses/security audit.
19. Configure CI release gate.
20. Configure automated trusted publishing/provenance.
21. Generate final performance baseline.
22. Publish `1.0.0-rc.1`.
23. Test RC from genuinely external projects.
24. Fix RC packaging/DX/documentation issues only.
25. Freeze v1 public API.
26. Run clean-clone final release matrix.
27. Publish `1.0.0`.
28. Verify the published package and documentation from scratch.

---

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

### The `tree.action()` prototype has been run — DONE 2026-08-10

Written against v3's three real handlers as they ship
(`packages/core-services-v2/src/lib/store-features/service-crud-ops.ts:344` `create$`,
`:434` `bulkPatch$`, and `packages/screens/src/lib/entity-table-buttons.component.ts:258`
`onArchiveToggle` → `setArchived$` at `:516`). Five results, and the first one
falsifies the obvious implementation.

**1. AMBIENT attribution is dead — the same way `act(label, fn)` was.** The cheapest
handle implementation says "while an action is open, writes belong to it". MEASURED:
two concurrent actions each captured **both** actions' paths.

```
a1 "Archive x" captured: ["entities.x","entities.y"]
a2 "Rename y"  captured: ["entities.x","entities.y"]   -> undoing the rename un-archives x
```

v3 really does run these concurrently — `bulkPatch$` and `onArchiveToggle` both fan
out, and a user can start one while another is in flight. So membership cannot be
inferred from wall-clock overlap. **Writes must be explicitly attributed, which means
the handle has to reach the call site.** Dynamic scope failed against `await`; ambient
scope fails against concurrency. Same lesson, one level up.

**2. The call sites that fight it, named.** `onArchiveToggle` fans out through
`store.activate$` / `deactivate$`, which are ALSO public single-record entry points a
component calls directly. So either those open their own action (and nest) or they
take one. **Nesting is forced by v3's structure, not a design choice** — and the
answer to "inner commits into outer or stands alone" is that the inner must join the
outer. Concretely the signature has to grow:
`activate$(id)` → `activate$(id, action?)`, threaded through
`mergeMap(id => action(id), CONCURRENCY)`. That is the cost, and it lands on every
store method a bulk handler composes.

**3. The leaf blind spot is `PathNotifier`'s, and SITING fixes it.** The prototype
captured 3 entity paths and **0 of 4** scalar writes — but it ran against a bare
`signalTree()`. Re-measured with the enhancer attached:

```
bare tree         captured: ["entities.e1"]                                        0/3 leaves
with timeTravel() captured: ["entities.e1","selectedIds","saveState","bulkCompleted"] 3/3 leaves
```

`time-travel.ts:638` installs `interceptLeafSignals` and calls `notifier.notify()`
itself at `:646`, so plain-leaf writes reach `PathNotifier` **only because
`timeTravel()` injects them**. Consequence: an action built as a standalone notifier
subscriber inherits the blind spot; one built **inside the time-travel enhancer gets
leaves for free**. That is an independent confirmation of the target doc's §4.5 siting,
arrived at from the opposite direction.

It still matters that leaves are in scope — `create$` deliberately carries selection
from the temp id to the server id, and an undo restoring the row without the selection
is wrong.

**4. Partial failure has no `commit()`/`abort()` answer.** MEASURED on
`onArchiveToggle` with 3 records, 1 failing: 2 succeeded, 1 failed and **already
self-reverted** via the handler's own `catchError`. The delta set is
`["entities.a","entities.b","entities.c","entities.b"]` — b's removal AND its restore.
`commit()` records a step whose undo re-removes a row the user can still see;
`abort()` would revert the two the server accepted. Neither describes the outcome.

**The fix is already written elsewhere in the library.** The action must record **net
change per path** — first `before`, last `after`, drop paths that round-trip. That is
exactly `PathNotifier.flush()`'s merge rule, which §1.3 measured as already correct
**within a turn**. The action needs the same rule **across turns**. It also fixes
result 5 for free.

⚠️ **The collapse predicate must be deep — but do NOT change `flush()`.**
`path-notifier.ts:198` is literally `if (newValue === oldValue) continue;`, and that
line must stay `===`. `flush()` runs on **every turn** over **every changed path**,
driven by `queueMicrotask` — putting a structural walk there is the same mistake as
write-time `shouldSkip`, which item 1 just finished moving off the hot path.

| runs                | when                      | over                 | predicate  |
| ------------------- | ------------------------- | -------------------- | ---------- |
| `flush()`           | every turn                | every changed path   | keep `===` |
| `commit()` collapse | per action, human-clicked | that action's deltas | deep       |

`commit()` is a person clicking Save; `flush()` is a keystroke. Same siting argument
as `shouldSkip`.

**Reuse `prunedEqual` (`utils.ts:118`) rather than inventing a predicate.** It is
reference-first (`if (a === b) return true`), treats arrays and built-ins as leaves
so it never walks them, and recurses only into plain objects. VERIFIED against the
exact case:

```
same reference    -> true   (fast path, no walk)
reconstructed obj -> true   <- collapses the phantom
genuinely changed -> false
```

It is honest about its cost: reference-first still pays the structural walk when
references differ, which is precisely when you have to look. What it buys is that
v3's capture-then-restore style hits the fast path — fast where it can be.

⚠️ **KNOWN HOLE — `prunedEqual` treats arrays as leaves, and for THIS use that is
not merely "conservative".** `utils.ts:130` returns `false` for two arrays with
differing references without comparing contents. Everywhere else in the library that
is the safe direction; here it means **failing to collapse**, so the phantom entry
survives — the exact defect the collapse exists to prevent. VERIFIED:
`prunedEqual([1,2,3], [1,2,3]) === false`.

Reachability, stated so nobody reads the table row as "safe":

- **Entity collections: probably not reachable.** They notify per-entity paths
  (`rows.<id>`), so the value at a path is an entity object, not the array.
- **A plain array leaf IS reachable**, directly. `tags: string[]` compensated by
  reconstruction (`tags.set([...original])` rather than `tags.set(original)`) leaves
  a phantom step.

So `prunedEqual` is the right base but not sufficient alone. Either special-case
array leaves in the collapse predicate, or accept the hole and document it — decide
deliberately, and do not let "arrays are leaves" pass review as an optimisation when
here it is a correctness gap.

**Cost bound to state while designing:** O(paths touched × value size), not O(state).
The per-path term is large when a path's value is a big array. `ST2027` already exists
for the deep-equal-different-reference class (~2.8 ms on a 50k array) if a diagnostic
is wanted rather than an unbounded walk.

The finding that motivates all of this — across turns a compensating write often
**reconstructs** the value rather than restoring the captured object, and reference
identity then fails to collapse it. MEASURED on the partial-failure shape:

| compensation style                         | net by `Object.is` | net by deep-equal |
| ------------------------------------------ | ------------------ | ----------------- |
| v3-faithful (restores the captured object) | `[a, c]` ✓         | `[a, c]` ✓        |
| reconstructs a fresh object                | `[a, **b**, c]` ✗  | `[a, c]` ✓        |

v3's own handlers capture `currentEntity` before mutating and restore that exact
object, so reference identity happens to work for them today — but it is one
refactor away from leaving a phantom entry for a row the user can still see. Specify
deep equality.

**5. `create$` records history the user never saw.** Server assigns a different id, so
the action contains `entities.temp-1` (add), `entities.temp-1` (remove),
`entities.srv-9` (add). Undo must not resurrect a temp id the server rejected. Net
collapse per result 4 nets the temp row to nothing.

**Also confirmed against a real shape rather than in theory:** a realtime server push
landing mid-action is captured inside the user's action
(`["entities.r1","entities.pushed-by-server"]`), so undoing "Archive r1" would delete a
row the user never touched. This is the §2 constraint that forces path-scoped deltas —
now reproduced on a handler that ships.

**What this does NOT change:** the transaction handle is still the right shape, and
`act(label, fn)` stays dead. What it changes is that the handle is **not ambient and
not free** — it has to be threaded through store method signatures, and it needs the
cross-turn merge rule before it can be correct under partial failure.

**Note on `abort()` — RETRACTED and re-tested.** An earlier draft of this item said
`abort()` duplicates `catchError`, would double-revert, and that the handle's value is
"labelling and grouping, not rollback". That read `abort()` as reverting **state**. It
does not: **`abort()` discards the recording; `catchError` reverts the state, exactly
as it already does.** They compose, and re-measured on `create$`'s error path:

```
state before = "existing", after = "existing"   (catchError reverted)
undo steps created by the action: 0
double-revert: NO — abort() touched no state
```

So `abort()` does the one thing `catchError` **structurally cannot**: express "this
action produced nothing the user should be able to undo." Keep it.

Two refinements from the same run:

- **Net collapse makes `abort()` belt-and-braces rather than load-bearing** for the
  total-failure case: the same failure committed by mistake also recorded 0 steps,
  because `temp-1` round-tripped and collapsed out. `abort()` still earns its place —
  it states the intent rather than relying on the arithmetic working out.
- **`abort()` is the WRONG call on partial failure.** With collapse, `commit()` on the
  2-of-3 archive records exactly the two the server accepted and drops the
  self-reverted one. `abort()` there would discard a real two-record change. So the
  handle needs no third outcome — `commit()` + net collapse covers partial failure,
  and `abort()` covers total failure.

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
  at 50k identical to three decimals.

  ⚠️ **But the cost argument against Option F does NOT hold generally**, and an
  earlier draft of this item said it did. By the refinement below, a scalar/form
  editing workload beside a 50k collection retains ~0.45–0.9 MB — which is free.
  Memory eliminates Option F **only for collection-write-heavy workloads**. Those
  happen to be exactly the ones the fit page claims (drag boards, bulk CRUD,
  offline creates), so the practical conclusion survives — but the reason it
  survives is contingent, not general.

  **Which argument is load-bearing matters for anyone revisiting this.**
  Correctness carries every workload: an unrelated write landing between an
  action's open and commit forces path-scoped deltas regardless of memory. Memory
  does not. So if the correctness constraint is ever reopened, **memory is not
  available as a fallback justification** — at 0.30 MB (re-measured 2026-08-11;
  0.45 was itself a superseded reading) it isn't one.

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

  ⚠️ **CORRECTED 2026-08-11 — "worst case" is exactly backwards, and 0.896 does not
  reproduce.** Re-run with `tools/bench-retention-arms.mjs` (baseline after seeding):
  the scalar arm is **0.298 MB** at 50k, not 0.896, and 0.896 has not reproduced
  under any baselining method (baselining _before_ seeding gives 7.62 MB, because
  then the collection is inside the arm). The reference-sharing insight stands — it
  is the durable finding — but 19.38 MB is a **floor, not a worst case**: one
  changed row and fifty different changed rows retain the same 19.38 MB, and
  changing all 50,000 retains **114.77 MB**. The real cost function has two terms,
  `entries × (width × ~8 B + changedRows × ~40 B)`, and the second was missing
  everywhere. The "sits nearer 0.9 than 19.6" conclusion survives in direction
  (mixed workloads are cheap) but the ceiling it implied was 5.9× too low.

- **Recording slope PARTIALLY reproduced.** Collection column reproduces in shape
  and within ~2× (31.8/66.9/255 → 18.8/49.8/215 µs per recorded entry). The scalar
  column does not: measured **flat** in collection width (10.8 → 11.3 µs) where the
  original rises 3× (23.1 → 70.7). The flat result is what the retention refinement
  predicts, so the two measurements corroborate each other. Do not quote 70.7 µs
  again without re-measuring.

Full write-up in
[the spike §1.7](docs/research/2026-08-history-greenfield-spike.md).

### DELETE `pauseRecording()` / `resumeRecording()` / `isRecordingPaused()`

**Not deprecate — delete, in 14.1.1.** This was previously written as blocked on the
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

### 6f-b. OPEN QUESTION — does ST2029 fire on a collection that is never written?

Not a finding; not measured. The retention refinement showed that an untouched
collection is shared by reference between entries, so a wide-but-never-written
collection costs almost nothing. ST2029's message models retention as
`entries × width` and its text says "every write to those collections is
O(collection)".

If the **trigger** uses the same `entries × width` model rather than tracking
which collections were actually written, it will fire on a collection that is wide
and idle — a false positive that advises `recordHistory: false` on something
already free, and pushes users to exclude data from undo for no gain. Read the
trigger before rewording the message; whoever takes 6d owns this.

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

**Needs its own gate — nothing existing catches it.** `bundle-budget` measures
built JS and does not look at `.d.ts` at all; `api-surface` compares symbol
inventories, not comments.

### 6g — FIXED 2026-08-11 (second attempt; the first was reverted)

**The root cause is that one config drives both emits.** `removeComments: true`
sat in the same `compilerOptions` as `declaration: true`, so it stripped `.d.ts`
and `.js` together. That is why dropping it fixed declarations and polluted the JS
in a single move.

**The fix: strip comments in the rollup output, not in the tsconfig.** A
`signaltree-strip-js-comments` plugin (`renderChunk`) in
`tools/build/create-rollup-config.mjs` removes comments from emitted JS, and
`removeComments` is gone from all five package tsconfigs so declarations keep their
JSDoc. Result: 0 comment-carrying JS files and fully documented `.d.ts` —
core 0 → 2,973 JSDoc lines shipped, 75% of source retained.

**Why this succeeded where the first attempt failed.** The first attempt stripped
JS in npm's `postbuild`, which held after `npm run build` and broke the moment
`verify-gates.mjs` built `dist/` with nx directly and skipped the hook. A rollup
plugin lives in the **build graph**, so every path that produces JS produces
stripped JS. The invariant stopped being build-path-dependent.

**A viability risk that turned out not to exist.** The concern was that
`compilationMode: "partial"` (set in four packages) means ngc emits Angular
declaration metadata a plain declaration pass would lose. MEASURED: **zero** `ɵ`
metadata in any shipped `.d.ts` and **zero** `ɵɵngDeclare*` in any built JS,
because every package builds with `@nx/rollup:rollup` — ngc never runs.
`compilationMode: "partial"` is **inert config in core, ng-forms, events and
realtime**, and declarations were already plain-TypeScript output. Worth deleting
or honouring deliberately; filed separately below.

**Gate: `declaration-docs` + `declaration-docs:self`, both mutation-proven.**
`tools/check-declaration-docs.mjs` compares source JSDoc blocks against shipped
`.d.ts` blocks per package. Two design points that each cost a cycle:

- The invariant is a **ratio, not "not zero"** — `stripInternal` removes whole
  declarations so no package ships 100% (measured 72%–98%); the floor is 50%.
- A `needsBuild` gate must mutate a **built** file, and the harness replaces only
  the **first** match. Mutating schema's tsconfig was reported BLIND (dist is built
  before the mutation lands); blinding one `/**` of guardrails' 106 was also blind.
  `generate: () => ''` on the built `.d.ts` is what works.

**Cost, recorded because no gate measures it** — five tarballs grow 11–36%:

| package    | before  | after   |
| ---------- | ------- | ------- |
| core       | 114,732 | 156,382 |
| shared     | 4,440   | 5,884   |
| ng-forms   | 26,403  | 32,138  |
| guardrails | 14,002  | 15,465  |
| schema     | 11,544  | 13,977  |
| events     | 55,209  | 55,209  |
| realtime   | 8,620   | 7,848   |

This is **install weight, not bundle weight**: consumers bundle these and their
minifier strips comments regardless, and `bundle-budget` is unchanged.

**Still open, both independent of 6g:**

- **`events` has its own `rollup.config.mjs`** and does not use the shared factory,
  so the strip plugin does not apply — 20 of its JS files still ship comments. Not
  a regression (it never set `removeComments`), but its tarball is the one that
  did not improve. Either adopt the shared factory or export the plugin to it.
- **`angular-compat` silently depends on built JS being comment-free.** It detects
  APIs with `text.includes(api)` over whole files
  (`check-angular-compat.mjs:113`), so a doc comment merely NAMING
  `@angular/forms/signals` reads as an import of it. It **fails closed** — it can
  produce a spurious red but never miss a real violation — so this is a latent trap
  rather than a correctness bug. Cheap fix: strip comments from the text before
  matching. The defect is the unstated coupling, not the detection direction.
- **`compilationMode: "partial"` is inert** in four packages (see above).

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

## 10. Planned-lifecycle marker classification before any more parity work

The construction substrate is now proven across the major writable families:

- plain writable state
- `status()`
- `stored()`
- `entityMap()`
- derived non-authoring semantics

Two consequences are decided.

**1. `plannedSignalTree().derived(...)` is builder debt, not runtime debt.**

Derived state is already semantically correct under the causal runtime: source
writes record one canonical effect/turn/frontier move, derived recomputation
records none, and undo restores the source while derived values come back only
through reactivity. What is still missing is the PLANNED construction surface.
The greenfield builder needs a configuration-phase `.derived(...)` that installs
derived computations before exposure while requesting NO causal capability.

**2. Do not auto-migrate the remaining markers. Classify them first.**

Use these buckets:

- **A. State authors** — authoritative application-state mutations. These need
  planned specialization and, when requested, the canonical mutation substrate.
- **B. Reactive consequences** — derived/validation/aggregate projections. These
  may need planned construction, but they must not author turns/frontiers/history.
- **C. Controllers/resources** — async orchestration, loaders, freshness,
  invalidation, external lifecycle. Decompose into state + consequence + control
  rather than preserving a monolithic legacy marker by default.

Current classification from the code as it exists:

- **`compared()`** — A scalar writable LEAF variant, not a new family. It only
  swaps leaf equality (`signal-tree.ts` intercepts it before marker processing),
  so it rides the plain writable substrate rather than demanding separate planned
  lifecycle work.
- **`form()`** — mixed legacy composite. `values` are authoritative domain
  state and causal candidates. `touched` is WRITTEN interaction state, but it
  is not a default causal-history participant under the greenfield model.
  `dirty`, `valid`, `errors`, `errorList` are reactive consequences; wizard,
  submit, persistence and the old history facade are controllers around that
  state. Keep it off the greenfield critical path — Angular Signal Forms is
  still the destination, so it should not shape the substrate.
- **`asyncSource()`** — controller/resource abstraction with authored visible
  data plus status (`loading`/`error`) around an external loader. It captures
  visible value for undo/restore but declines `rehydrate`, which is exactly the
  smell of a resource/controller split rather than a pure state family.
- **`asyncQuery()`** — controller/resource abstraction. Its `input` is authored
  state, but results/load/error are source-driven query lifecycle, and the marker
  snapshots value without restoring it. Treat it as orchestration around state,
  not as an automatic causal-state family.
- **`entityMap` loader surface** (`loader()` / `entity-loader.ts`) — controller
  attached to an already-proven state author. The collection rows remain bucket A;
  freshness, invalidation, persistence, and revalidation policy are bucket C.

After this classification pass, the next substrate gate is the mixed-family
falsifier, not more marker-by-marker parity. Use one turn spanning scalar,
`entityMap` rekey, `status()`, and `stored()`; require one PositionRegistry, one
capture runtime, one causal representation, no fake common owner, and no
family-specific branching in the rollback engine.

## 11. Producer/mutation substrate is strategically proven; stabilize before kernel work

The mixed-family success/refusal pair is the final producer-side falsifier.
Freeze these as established invariants and stop adding producer parity work.

Established invariants:

- Producers emit CANONICAL semantic effects, not feature-specific history
  records.
- One turn may span heterogeneous state families without introducing
  family-specific rollback semantics.
- Rollback removes only the rejected turn's surviving speculative
  contribution.
- Legitimate later writes survive.
- Structural dependency can make compensation unsafe, in which case rollback
  refuses atomically.
- Persistence follows surviving state; it is not an independent causal author.
- Subject identity, ownership identity, and physical path remain distinct.

Current proof status:

- capability planner — GREEN
- planned lifecycle — GREEN
- tree-local Position topology — GREEN
- plain producer — GREEN
- `status()` producer — GREEN
- `stored()` producer — GREEN
- `entityMap()` structural producer — GREEN
- derived non-authoring — GREEN
- mixed heterogeneous turn — GREEN
- surgical mixed rollback — GREEN
- unsafe mixed rollback refusal — GREEN
- family-independent rollback engine — GREEN

Next phase is STABILIZATION, not more producer work. Close it in roughly this
order:

1. Remove benchmark semantic switches from production paths; keep only one
   production topology/capture semantics.
2. Resolve the known full-suite failures, including the deferred scalar-frontier
   failure.
3. Get lint green.
4. Keep the corrected `maxHistorySize` meaning: capacity `N` retains `N`
   reversible turns and therefore up to `N` undo operations. Update docs,
   migration notes, and changelog rather than restoring the old `N-1` defect.
5. Replace silent cleanup `catch {}` paths with observable cleanup failure
   reporting that does not mask the primary operation failure.
6. Classify/fix the environment-specific stored test failures so the suite can
   go green.
7. Keep `plannedSignalTree().derived(...)` recorded as construction/API debt;
   it is not a blocker unless removing the legacy builder path requires it.

Only after that green checkpoint, design a greenfield `CausalRuntime` rather
than extracting pieces from `TimeTravelManager`. The frozen contract for that
next phase is [causal-runtime-contract.md](docs/architecture/causal-runtime-contract.md).

Kernel sketch to preserve:

- `CausalRuntime`
- `PositionRegistry`
- `TurnStore` — pending turns, confirmed turns, indexes, retention, redo
  truncation
- `Frontiers`
- `Attribution` — transaction/turn grouping
- `ReversalEngine` — historical undo, speculative rollback, supersession,
  dependency/conflict classification
- `Authority` — containment and prefix/frontier eligibility

Consumers/projections after the kernel:

- `transactions()` — speculative lifecycle projection
- scoped undo/redo — confirmed-turn reversal projection
- `timeTravel()` — causal projection plus separate temporal snapshot
  projection
- DevTools — inspection projection
- provenance — inspection/query projection

Preserve the semantic distinction between speculative rollback, historical
undo, and temporal rewind even if they share representation under the kernel.
