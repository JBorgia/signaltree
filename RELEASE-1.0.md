# SignalTree 1.0 Release

Single source of truth for the remaining work between current HEAD and a
credible `1.0.0` release candidate.

This is the release controller, not the full historical backlog. Use it to
bound autonomous agent work, checkpoint decisions, and prevent context drift.

## Current Phase

Current phase: `Phase 2 — Public Release Surface`

`GATE A` is **SATISFIED**. The kernel is FROZEN as of `4f7a2169`.

### FROZEN — persistence invariants

Burden of proof is now reversed. Do NOT reopen kernel architecture to inspect
one more idea. Reopen only when a later release test produces a concrete,
deterministic counterexample to one of these:

1. The durability authority is TREE-SCOPED. Commit-ness is never inferred from
   the presence or absence of a transaction on the call stack.
2. Callers DESCRIBE durable consequences; the authority decides when they may
   execute. No caller determines commit-ness for itself.
3. Any unresolved scope on a tree holds that tree's durability.
4. Foreign-tree scopes never interfere.
5. Successful compensation DISCARDS speculative consequences.
6. Refused compensation FLUSHES surviving authoritative truth. "Nothing to
   reverse" is a trivially successful rollback, not a refusal.
7. Durable consequences resolve surviving truth at EXECUTION time, never a
   value captured when the write was authored.
8. Persistence settlement is distinct from causal confirmation.

Freeze evidence: seven defects found and closed across three antagonistic audits
plus one verification; the defect curve ran 3 → 2 → 1 → 1, and the final one was
in a caller, not in the redesigned authority. Ladder at `4f7a2169`: 1715 passed
/ 20 skipped / 1 todo / 0 failed, build and lint clean.

The agent may continuously consume unchecked work within the current phase.
The agent must stop at the phase boundary when the exit gate is satisfied or a
decision condition from `AGENTS.md` is reached.

Do not auto-transition into the next phase in the same session without an
explicit human checkpoint.

## Budget

- Rough execution budget: 30-60 agent-hours
- Rough review/decision budget: 8-15 human hours
- Rough calendar budget to `1.0.0-rc.1`: 3-7 focused days, then RC soak

The architecture work is now a minority of what remains. Packaging, public
API/type verification, docs, consumer testing, and release automation are the
bulk.

## Release Invariants

- SignalTree owns truth.
- Angular owns observation.
- Causal history owns meaning.
- `PositionId != SubjectId != SlotIndex != key/path`.
- All expected fallible semantic work precedes private commit.
- PRIVATE COMMIT consumes prepared instructions only.
- Atomicity is externally observable coherence, not a count of internal
  revision increments. Specifically:

  - physical revisions are monotonic implementation stamps, never transaction
    identities, and never rewind — compensation is itself a physical commit;
  - each actual private physical commit may advance the revision;
  - a semantic transaction may span more than one private substrate commit;
  - no observer, publication adapter, persistence consequence, or other
    external consumer may observe an intermediate heterogeneous state.

  "One physical commit = one shared revision bump" still holds. "One
  transaction = one physical commit = one revision bump" does not, and was
  never the contract. Proven at `e74e63d1`.

- PROJECT reflects committed truth; it never determines authority.
- Persistence is post-commit.
- **Durable storage never gets ahead of the tree's settled commit state.** One
  authority answers this for every durable consequence:

  - no open commit scope on this tree → durable consequences may run;
  - one or more open commit scopes → durable consequences wait;
  - scopes settle → persist current surviving truth.

  The gate is TREE-LOCAL: a transaction open on tree B never delays tree A.
  Commit-ness is NEVER inferred from where the JavaScript call happened —
  "outside a transaction callback" is not the same as "this tree has no
  speculative state". Callers describe a consequence; they do not decide when it
  runs.

- A rollback REFUSAL is not a rollback success and not a transaction abort. The
  reversal attempt failed; nothing was compensated; the authored effects remain
  the live authoritative state, so their deferred consequences flush. Durable
  truth must never be made to disagree with live truth in order to honour a
  reversal that did not happen.
- A speculative transaction may defer a consequence only when ownership of the
  mutated node by that transaction's tree is POSITIVELY established. Ambiguous
  attribution must never suppress a committed consequence. (The write context is
  ambient; presence of a transaction is not evidence that a write is speculative
  under it. Pinned by `stored-commit-ordering.spec.ts` "does not absorb a write
  into a FOREIGN tree transaction scope".)
- Scope settlement is lifecycle cleanup and must occur even when compensation
  refuses or throws. Semantic failure may propagate; consequence infrastructure
  must never remain wedged. (Pinned by `persistence-commit-ordering.spec.ts`
  "is not wedged forever when compensation refuses".)
- Local scalar/structural operations must not scale with unrelated `n`.

## Required Validation

```bash
pnpm nx test core --skip-nx-cache --output-style=static --verbose
pnpm nx build core --skip-nx-cache --output-style=static
pnpm nx lint core --skip-nx-cache --output-style=static
```

Use focused characterization or slice-level validation first when practical.
Run the authoritative ladder before checkpointing a release slice.

## Workspace Dirt Not Owned By Release Tasks

- `eslint.config.mjs`
- `packages/ng-forms/src/signals/greenfield-branch-model.spec.ts`

Never include unrelated dirt in release commits.

## Rules

0. **Measure the property that actually governs the decision. A convenient proxy
   is not evidence for a DIFFERENT property. When two measurements disagree,
   determine whether they measure the same property; if they do, reconcile them
   before acting.**

   Two distinct failure classes, and conflating them is itself a mistake:

   **(a) A weak measurement of the RIGHT property.** These are simply wrong, and
   each produced a confident conclusion that survived until something
   contradicted it:

   | Weak                               | Said               | Strong                   | Truth                             |
   | ---------------------------------- | ------------------ | ------------------------ | --------------------------------- |
   | `grep -c '^export'` on `index.ts`  | core 141           | checker export graph     | 209 across 6 entrypoints          |
   | `SymbolFlags.Value` on an alias    | 2 runtime exports  | `getAliasedSymbol` first | 84                                |
   | `signal(`                          | `stored` uses none | `signal\s*[<(]`          | 1 — it is `signal<T>(`            |
   | `toContain('a')` on a JSON payload | test green         | parse, compare the value | red — matched the `a` in `"data"` |

   **(b) Correct measurements of DIFFERENT properties.** These do not contradict
   each other; all can be true at once, and each answers its own question:

   | Measurement                       | Property it governs          |
   | --------------------------------- | ---------------------------- |
   | Angular imported by source files  | implementation coupling      |
   | Angular in the public `.d.ts`     | type-contract coupling       |
   | Angular in the emitted entrypoint | runtime / package dependency |

   Core is 169-of-209 by the first, 3-of-209 by the second, and requires Angular
   by the third. Reading the second as "core is nearly framework-neutral" would
   be a category error: `angularInType` measured that `schema`'s public API does
   not EXPOSE Angular — it never measured whether the package REQUIRES Angular
   at runtime, which the emitted root import settles, and it does.

0b. **Name the property first, then design the falsifier that measures THAT
property directly. A proxy may support an investigation; it may never close
one.**

Rule 0 says which measurement is right. This says how to arrive at one, and it
is operational rather than an exhortation to care more:

1.  State the property.
2.  State what result would falsify the current hypothesis.
3.  Measure that property directly.
4.  Require a POSITIVE success condition — never merely the absence of a known
    failure string.
5.  Only then change production code.

Step 4 is the one that keeps being skipped. Every row below is a real error
from the 15.0 work, and they look nothing alike until you line them up:

| Question                                    | Weak proxy                                             | Decisive property                           |
| ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| Is the SDK neutral?                         | module-graph traversal                                 | retained runtime / declaration closure      |
| Does variadic `.with()` work?               | neutral tuple, realization enhancer chained separately | a realization enhancer INSIDE the tuple     |
| Does `T` flow through `timeTravel`?         | annotated call sites                                   | unannotated inferred consumer type          |
| Is the declaration valid?                   | source typecheck                                       | packed `.d.ts`, consumer compile            |
| Did the build succeed?                      | absence of `error TS`                                  | exit 0 AND artifact exists                  |
| Is the API unchanged?                       | exported symbol names                                  | public type contract                        |
| Is the package consumable?                  | `skipLibCheck: true`                                   | `skipLibCheck: false`                       |
| Does barrel reachability cause the pruning? | plausible export topology                              | already-exported `DefaultKey` still missing |

Corollary, and it is not a consolation prize: **optimize for cheaper, earlier,
more decisive failures — not for fewer failed experiments.** Every falsifier
that fired in this work improved the architecture rather than merely blocking
a change. The heterogeneous `.with()` failure exposed the neutral/realization
distinction; the `TimeTravelMethods<T>` falsifier produced the polymorphic
`this` design; the emitted-declaration failure exposed a shipped-package
defect that predated the work entirely; the failed barrel probe eliminated a
whole class of API "fixes" that would have widened the public surface to
satisfy a build bug. A green experiment that measured the wrong property costs
far more than a red one that measured the right property.

0c. **"Public" is determined by declaration reachability, not by the `export`
keyword or by JSDoc intent.** If a public signature needs a type, that type
cannot be treated as removable implementation detail by the production
declaration pipeline, however inconvenient that is. `stripInternal` makes this
operationally enforceable rather than merely stylistic: an `@internal` tag on
anything a public declaration references produces a shipped `.d.ts` that names
what it does not declare. See the entity-map resolution under Phase 2.

**Corollary — closure is transitive across BOTH type-space and value-space.** A
public declaration is invalid if it reaches a stripped symbol through a named type,
a conditional or default type argument, a `typeof` query, an alias, or any other
declaration dependency. Two routes are proven in-tree, and treating them as
unrelated bugs is the mistake:

| route       | shape                                                | emitted                                      |
| ----------- | ---------------------------------------------------- | -------------------------------------------- |
| type-space  | `@internal` type named by a public signature         | reference survives, declaration stripped     |
| value-space | public alias of an `@internal` function/class/object | `declare const c: typeof _c` — `_c` stripped |

The value-space route is invisible to "is the name declared?" checks: the alias IS
declared. Only its inferred TYPE is dangling. Any closure gate must therefore check
semantic validity, not symbol presence.

**This rule is COMPLETE — stop adding rules for each new manifestation.** entity-map
and the value-space alias are EXAMPLES of the invariant above, not separate
architectural principles. The general statement is: public declaration closure is
transitive across every dependency needed to interpret the shipped contract.

1. Characterize before fixing.
2. Do not reopen frozen semantics without a failing falsifier.
3. Never optimize a green path because timing merely looks high.
4. One conceptual change per commit.
5. Run focused validation first, authoritative ladder before commit.
6. Never include unrelated dirt.
7. Update this ledger after every checkpoint commit.
8. Stop and reassess after every phase gate.

## Gate Model

- `GATE A — Kernel freeze`
  persistence + heterogeneous atomicity + antagonistic audit green

  ```text
  ✅ persistence ordering (stored + persistence/autoSave)
  ✅ heterogeneous observational atomicity
  ✅ antagonistic persistence audit — 3 blockers found and closed
  ✅ framework-neutrality invariant, gated in CI
  ✅ no demonstrated current-HEAD kernel blocker
  ⚠  pre-existing bundle budget debt — NOT a kernel blocker
  ```

  GATE A freezes semantics, physical correctness, atomicity and architecture. A
  stale-or-red packaging budget is a different failure class and does not hold
  the kernel unfrozen. This is NOT permission to ship red: the budget must be
  green before `1.0.0-rc.1`, because a release gate that is red at RC means
  nothing. It moves to `GATE C`/`GATE D`:

  - establish a trustworthy current bundle baseline;
  - decide whether the budgets are stale or the implementation is oversized
    (`AGENTS.md` still claims bare 5.46KB/5.8 budget; the tool says 9.26/5.9 —
    at least one is wrong);
  - either reduce static reachability or deliberately reset justified budgets;
  - green before RC.

  Do not optimize bundle size during kernel freeze.

- `GATE B — API freeze`
  public exports/types/features intentionally selected
- `GATE C — Package proof`
  npm-packed artifacts install in clean TS + Angular consumers
- `GATE D — Release quality`
  compatibility, lifecycle, errors, docs, examples, metadata green
- `GATE E — Automation`
  clean checkout can test/build/package/publish without manual surgery
- `GATE F — RC`
  published RC installs and runs from npm in external projects
- `GATE G — 1.0`
  RC issues resolved, API frozen, final clean-clone release gate green

## Phase 1 — Kernel Completion

- [x] `stored()` consequence ordering
- [x] heterogeneous persistence/atomicity proof — proven on both paths
      (`e74e63d1`), contract stated as observable coherence (`59bed701`)
- [x] fresh HEAD antagonistic audit — 3 blockers demonstrated (`1f94f74a`)
- [x] targeted regression audit of the fix — 2 MORE blockers (`49a8ab34`)
- [ ] fix remaining release-blocking findings — see "Freeze readiness" below
- [x] freeze kernel — FROZEN at `4f7a2169`, invariants under "Current Phase"

Exit condition: `GATE A` — **SATISFIED**

Post-freeze regression work, recorded rather than held (none kernel-blocking;
each belongs to a later gate):

| Case                                                               | Gate                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| undo/redo overlapping an open commit scope                         | next correctness pass — closest to GATE A, expected to follow from the tree-level rule |
| structural (`entityMap`) consequences via the HELD path            | next correctness pass                                                                  |
| `stored()` `debounceMs > 0` / `maxWaitMs` interacting with a hold  | `GATE D` persistence contract                                                          |
| SSR / `storage === null`                                           | `GATE D` SSR decision                                                                  |
| packages other than core                                           | `GATE C` ecosystem verification                                                        |
| a natural (unmocked) port-level refusal                            | next correctness pass                                                                  |
| remove dead exports `hasOpenCommitScope` / `onCommitScopesSettled` | cleanup; `scheduleDurableConsequence` replaced both                                    |
| rename settle outcome `'commit'` → `'flush'`                       | cleanup; settlement is not causal confirmation                                         |

Checkpoint record for this phase:

- latest completed item: `stored()` consequence ordering — **DONE**, decided
  Option A (persistence is post-commit) and applied to both persistence APIs.
- last checkpoint commit: `f0da4dc8`
- last authoritative validation: full ladder green at `367f8678` —
  `nx test core` 1699 passed / 20 skipped / 1 todo / 0 failed,
  `nx build core` clean, `nx lint core` clean.

Commits in this slice:

| Commit     | What                                                         |
| ---------- | ------------------------------------------------------------ |
| `83e241ef` | characterize the pre-decision behavior (falsifier)           |
| `51a98699` | `stored()` post-commit via `internals/commit-consequence.ts` |
| `367f8678` | `persistence()` autoSave post-commit + discard-ordering fix  |
| `f0da4dc8` | kernel framework-neutrality lint gate                        |
| `e74e63d1` | heterogeneous atomicity proof, forward authoring path        |
| `59bed701` | atomicity contract stated as observable coherence            |
| `1f94f74a` | close 3 blockers from the fresh HEAD antagonistic audit      |
| `49a8ab34` | close 2 more blockers from the targeted regression audit     |

### Verification of the new authority — PASSED, one caller fixed

Freeze criterion: _can either persistence surface write while its own tree has
unresolved speculative state?_ **No** — not reproducible by any path, including
the ones that produced the previous six defects.

Properties re-proven by executed probe: bare writes still durable at
`debounceMs: 0` on a settled tree; the gate is tree-local; nothing stranded
after any of the six settle orderings of two overlapping pendings; `authoredSeq`
never skips an operation that should run; `resolveScopeKey` gives one identity
for tree / `$` / registry and never collides across trees; teardown neither
resurrects nor strands. Two `persistence()` enhancers on one tree is impossible
by construction (`signal-tree.ts` throws on duplicate enhancer), so that concern
is moot rather than untested.

**Seventh defect, fixed at `4f7a2169` — outside the new authority.** Both
compensation doors settled `'discard'` from a `finally` that could not tell
"compensation APPLIED" from "compensation REFUSED". A refusal reverses nothing,
so discarding made durable truth disagree with live truth. Pre-existing, not a
regression, and at a different location from the previous six — which is
corroborating evidence the replacement did its job. Outcome now tracks whether
compensation actually applied.

Two lessons worth keeping:

- _"Nothing to reverse" is a rollback that succeeded trivially, not a refusal._
  The first fix treated an empty effect list as un-compensated and flushed a
  `clear()` that had just been rolled back. Only the port THROWING means
  nothing was compensated.
- _A single-character `toContain` on a serialized payload asserts nothing._
  `expect(getItem(key)).toContain('a')` passed against the buggy code because
  `{"__v":1,"data":"v0"}` contains the 'a' in `"data"`. Compare parsed values.

Coverage the verification did NOT reach — carry into later gates, none
kernel-blocking: structural (`entityMap`) consequences under the HELD path;
`stored()` with `debounceMs > 0` / `maxWaitMs` interacting with a hold;
time-travel undo/redo overlapping an open scope; SSR / `storage === null`;
packages other than core; a natural (unmocked) port-level refusal.

Minor cleanup for after freeze: `hasOpenCommitScope` and `onCommitScopesSettled`
now have zero production consumers — `scheduleDurableConsequence` replaced both.
Dead internal exports, kept only by tests.

### RESOLVED — Option A implemented at `ed7b4d02`

The escalation was accepted and the abstraction replaced rather than patched a
fourth time. `scheduleDurableConsequence({claimant, key, run})` is now the only
way a durable consequence reaches storage; `stored()` no longer uses the ambient
write context to determine DURABILITY or commit-ness (it still reads it for the
devtools-replay check at `stored.ts:726`, which is not a durability decision),
and `persistence()` no longer runs its own gate. State 4 in the
table below no longer exists — the authority asks the tree, not the call stack.

**Accepted contract change:** while any transaction on a tree is unsettled, a
bare `stored()` write on that same tree is no longer immediately durable. It is
held and released with the surviving committed truth when the tree settles. A
tree with nothing speculative in flight keeps same-stack durability at
`debounceMs: 0`, and a foreign tree's transaction never delays it.

`authoredSeq` stays — it answers a different question. The scope gate says WHEN
durability may run; the sequence says WHICH operation is still current.

Ladder at `ed7b4d02`: 1714 passed / 20 skipped / 1 todo / 0 failed, build and
lint clean. One final focused verification is running; its single criterion is
"can either persistence surface write while its own tree has unresolved
speculative state?". If provably no, `GATE A` freezes.

### Historical — the escalation that produced the above

Third audit of this boundary. **Sixth defect, same class.** Characterized at
`c110a446` and deliberately NOT patched, per the escalation rule: three rounds of
one subsystem yielding defects is evidence about the design, not the code.

**The defect.** A rollback compensation write is applied through the realization
port with no transaction on the stack, so it cannot be attributed and falls
through to an immediate durable write. With two overlapping pendings — the
designed-for case, since only NESTED transactions are refused — the value it
restores is the OTHER pending's speculative value, durable while that
transaction is still unconfirmed. The two surfaces disagree on the same tree at
the same instant: `persistence()` writes nothing (it gates on
`hasOpenCommitScope`), `stored()` has already written the speculative value.

**Root cause.** `stored()` infers commit-ness from the WRITER'S CALL STACK. The
ambient write context has four distinguishable states; the code collapses them
into two:

|     | Ambient state                                              | Truth             | Today                           |
| --- | ---------------------------------------------------------- | ----------------- | ------------------------------- |
| 1   | no transaction anywhere                                    | committed         | write now ✅                    |
| 2   | inside my tree's transaction                               | speculative       | defer ✅                        |
| 3   | inside a FOREIGN tree's transaction                        | committed for me  | write now ✅ (`1f94f74a`)       |
| 4   | no transaction on the stack, but my tree has an open scope | **NOT committed** | **indistinguishable from 1** ❌ |

State 4 is reachable from the realization port _without any transaction on the
stack_, which is exactly why an ambient-context test cannot see it. Every one of
the six defects has been a path reaching durable storage unable to answer "is
this committed?", and answering "yes" by default. `persistence()` never had the
class only because its timer could not read the write context at all, forcing it
onto the per-tree gate.

**The reassessment.** The mechanism is not too complicated — a registry plus a
gate is small. The problem is that there are TWO ways of answering one question,
and the ambient one is structurally blind to state 4. Unifying on the tree's
scope state DELETES a state from the space rather than adding machinery.

- **Option A — one answer, per-tree scope state (recommended).** Both surfaces
  ask the tree, not the call stack: an unattributable write while the tree has
  an open scope is held and released via `onCommitScopesSettled`. Small in code.
  Preserves the foreign-tree property from `1f94f74a`, since the gate is
  per-tree. **Contract change:** `stored()` stops being durable while any
  transaction on its tree is unsettled, extending the "unsettled transaction
  holds writes indefinitely" trade from `persistence()` to `stored()`.
- **Option B — patch the compensation path.** The fourth local repair to a state
  space that has produced a defect on every inspection. Explicitly what the
  escalation rule exists to prevent.
- **Option C — positive attribution on realization writes.** Have the port mark
  its writes as committed realization. Rejected on inspection: the port does not
  know either — when `p2` rolls back it restores `p1`'s pending value, so only
  the tree's scope state can answer.

### Freeze readiness — NOT yet clean

The stop condition was "freeze if the targeted pass comes back clean." It did
not: it found two more blockers in the same boundary, one of them the SAME wedge
through a second refusal door that `1f94f74a` missed.

Running total on this one surface: **5 blockers across 2 audits.** Every one was
in the commit-consequence / persistence boundary; none touched PositionId,
SubjectId, realization semantics, structural storage, atomicity, or the causal
model. That is the good news — the kernel model is holding and the defects are
consequence-lifecycle and attribution bugs at its edge — but the density is a
signal in itself.

Two things gate the freeze decision:

1. **`49a8ab34` changed the boundary again**, so the second audit's clean
   conclusions are now as stale as the first's were. The delta is small (a
   settle on the plan-refusal path, plus a monotonic authored sequence in
   `stored()`), so a third pass should be scoped to that delta only, not the
   whole boundary.
2. ~~One semantic choice needs review.~~ **DECIDED — keep the flush.**

   **A rollback refusal is not a rollback success, and not a transaction
   abort.** The attempt to REVERSE the transaction failed. SignalTree refused to
   change state, which is the fail-closed principle working. Nothing was
   compensated, so the authored effects are still the live authoritative state
   and their deferred consequences must flush. Discarding them would
   deliberately manufacture `live truth = B, durable truth = A`, which is worse
   — and it makes the crash semantics coherent: if an app means to catch the
   refusal and refetch but dies first, recovery restores the last state
   SignalTree actually considered authoritative.

   The persistence consequence per outcome:

   | Outcome                                         | Physical state                | Persistence consequence                 |
   | ----------------------------------------------- | ----------------------------- | --------------------------------------- |
   | `confirm()`                                     | authored state survives       | **flush**                               |
   | successful `rollback()`                         | authored state compensated    | **discard**                             |
   | thrown callback, compensated                    | baseline restored             | **discard**                             |
   | rollback REFUSED before compensation            | authored state still survives | **flush surviving truth**               |
   | compensation begins then fails catastrophically | catastrophic boundary         | error; never pretend rollback succeeded |

   `abandon()` is NOT added for this release. "Drop this pending causal
   relationship without compensating its physical state" is a real feature with
   its own semantic questions (do those effects persist? what holds until the
   refetch?), not cleanup. Design it deliberately if a genuine use case appears.

   **Terminology debt, deliberately deferred:** the outcome is spelled
   `'commit'`, which risks being read as causal confirmation. `'flush'` /
   `'discard'` describes the persistence consequence more precisely —
   _persistence settlement is not causal confirmation_. Not renamed now: it
   would churn the exact delta the third audit is reviewing. Do it after freeze.

**Audit result (read-only `release-reviewer`, independent context, ran the
ladder itself).** Three blockers demonstrated with executed probes, all now
closed and each proven red as a test before any production change:

1. A refused rollback compensation permanently wedged `persistence()` for the
   tree — `settleCommitScope` was skippable by a fallible step. Now settles in
   a `finally` on all three lifecycle exits.
2. `stored().clear()` was durable immediately inside a transaction and never
   compensated. Now shares the write path's boundary and consequence key.
3. A committed write was DROPPED when made inside a foreign tree's transaction
   callback — ambient attribution absorbed it into a scope that could not
   compensate it. Deferral now requires positive proof of tree ownership.

Blockers 1 and 3 were regressions from `51a98699`. 1 and 3 compound: a wedged
tree loses `persistence()` while `stored()` keeps working, so an app using both
loses half its durable state silently.

Explicitly cleared by the audit, not merely unexamined: the lint gate is real
(static, `import type`, and `export … from` all error; dynamic `import()` is an
uncaught base-rule limitation with zero occurrences in HEAD); WeakMap retention
in `commit-consequence.ts` forms a proper ephemeron cycle and is collectible;
`hasOpenCommitScope` keys on the base tree that every enhancer in a chain
receives; `e74e63d1`'s atomicity proof is non-vacuous.

**DECIDED — Option A, observational atomicity is the contract.** A successful
heterogeneous transaction advances **two** physical revisions (the scalar and
structural substrates each commit their own frame), and that is fine: a `'**'`
subscriber capturing the whole tree on every notification never observes
`count` advanced without the row, nor the row without `count`. The invariant is
amended above; no code change. The scalar/structural substrate is NOT to be
redesigned merely to collapse revision increments.

Unifying the two frames into a single `CommittedFrame` remains available as
kernel-internal evolution — the natural place to design it deliberately is
during kernel extraction, not by contorting the current substrate before freeze.

Note: `TODO.md` §1 still carries the superseded "success advances one physical
revision" wording. Left alone because `TODO.md` is currently dirty with
unrelated user work; this file is the controller and supersedes it.

Semantics now enforced — "persistence observes committed physical truth, never
speculative authored state", worded to survive every path rather than keying on
`confirm()`:

| Path                      | Durable consequence                                              |
| ------------------------- | ---------------------------------------------------------------- |
| bare `set()`              | immediate; commits in its own stack, `debounceMs: 0` unchanged   |
| successful transaction    | one coherent write per key, final values only                    |
| thrown / rolled back      | zero speculative writes — never wrote, not wrote-then-repaired   |
| undo / redo / realization | non-authoring, but the result IS committed truth, so it persists |

- newly discovered work:
  - **AUDIT ITEM CLEARED: nothing equates a semantic transaction with one
    physical revision increment.** Every production consumer of `revision()`
    enumerated: `tree-scalar-slot-angular-runtime.ts:172` and
    `tree-scalar-slot-runtime.ts:123` (delegation), two `atomic-state/*`
    prototypes, and `tree-realization-adapter.ts:560`/`:771`. Only the last is
    a comparison, and it is a staleness guard inside a single realization
    ("Heterogeneous realization base revision is stale."), not a transaction
    identity. It compares the SAME counter: `tree-scalar-slot-angular-runtime.ts:139`
    builds the kernel from the `physicalCommitClock`, and the neutral runtime's
    `revision()` returns `physicalCommitClock?.revision() ?? revision`. Nothing
    treats revision as a turn id. Turn identity and physical revision are
    already properly distinct.
  - **The RESTORE path already implements the unified-frame pattern.**
    `tree-realization-adapter.ts:766-800` commits the scalar frame with
    `advanceRevision: false`, every structural plan with
    `advancePhysicalRevision: false`, then advances the clock exactly ONCE and
    publishes. So heterogeneous realization is already one revision; only the
    forward authoring path is two. This is the strongest argument that the
    future `CommittedChangeSet` envelope needs no new machinery — the forward
    path would adopt a mechanism the kernel already contains. Post-freeze work;
    recorded under Kernel Extraction Prerequisites.
  - **DECIDED: the bundle budget does not block `GATE A`.** Proven unrelated to
    this kernel slice (0.000KB attributable), so it is release debt carried to
    `GATE C`/`GATE D` and mandatory before RC. Full reasoning under the Gate
    Model above. Detail:
  - **Bundle budget is red, PRE-EXISTING.** `signaltree-bare` measures 9.26KB
    prod gzip against a 5.9KB budget (also `-entities` 20.05/9.75,
    `-form` 11.47/8). Attributed by esbuild stub-substitution: this slice
    contributes **0.000KB** — the bare bundle is byte-identical with and without
    `commit-consequence.ts`. Release debt, not a regression. Note `AGENTS.md`
    still claims bare is 5.46KB against a 5.8 budget; both numbers are stale.
  - **Kernel neutrality is real but not fully gated.** The 23 non-spec files in
    `lib/physical/` + `lib/internals/causal-runtime/` have zero direct
    `@angular` imports and are now gated. Transitive coupling remains:
    `causal-runtime/tree-realization-adapter.ts` imports
    `../tree-scalar-slot-angular-runtime`, whose `TreeScalarSlotRuntime` exposes
    `WritableSignal` where the neutral `tree-scalar-slot-runtime.ts` exposes
    `SlotIndex`. Migrating the adapter to the neutral interface is Phase 2+
    work — it is kernel-structural and must not reopen the freeze.
    (`../owned-mutation` is by contrast a clean split: the adapter uses only the
    metadata getters; `untracked()` is confined to `runOwnedMutation`.)
  - **`stored()` multi-key writes are post-commit but not atomic.** `Storage`
    has no multi-key atomic write, so N stored keys remain N `setItem` calls.
    Every observable value is a committed one, but the sequence is observable.
    `persistence()` (whole tree, single key) is genuinely atomic. Pinned as a
    RECORDED LIMIT in `stored-commit-ordering.spec.ts`.
  - **An unsettled transaction holds `autoSave` indefinitely** — deliberate, and
    documented at the call site. An unresolved optimistic mutation has no
    committed truth to persist.
  - `AGENTS.md:231` lists the nested sub-skills as
    `{ng-forms,enterprise,guardrails,events,realtime}`. `docs/skills/using-signaltree/`
    actually holds `ng-forms, guardrails, events, realtime, schema` — `enterprise`
    was removed in 14.0.0 and `schema` is missing from the list. Not release-blocking;
    left alone because `AGENTS.md` is currently dirty with unrelated user work.

## Post-Freeze — Kernel Extraction Prerequisites

Not Phase 1. Recorded here so the sequencing is not lost: these are the real
prerequisites for an honest `@signaltree/kernel`, and none of them may reopen
the kernel before `GATE A`.

- [ ] **Migrate the realization port to the neutral physical interface.** This
      is the actual blocker, not moving files.
      `causal-runtime/tree-realization-adapter.ts` consumes the
      `TreeScalarSlotRuntime` from `internals/tree-scalar-slot-angular-runtime.ts`,
      whose surface is Angular-shaped (`createLeaf`/`resolveScalarLeaf` return
      `WritableSignal<T>`). The neutral `internals/tree-scalar-slot-runtime.ts`
      already exposes the physical equivalent (`createSlot`/`readSlot`/
      `commitSlot`/`updateSlot` over `SlotIndex`). Until the adapter is migrated,
      any extracted kernel is framework-neutral in name only.
- [ ] **Give the publication boundary a unified commit envelope**, so an adapter
      receives one coherent published change set regardless of how many private
      substrate commits occurred:

      ```ts
      interface CommittedChangeSet {
        transactionId?: TransactionId;
        revisionFrom: number;
        revisionTo: number;
        changedSlots: readonly SlotIndex[];
        structuralChanges: readonly StructuralDelta[];
      }
      ```

      This needs less new machinery than it looks: the RESTORE path already does
      exactly this (`tree-realization-adapter.ts:766-800` — every substrate
      commits with advance suppressed, then ONE `physicalCommitClock.advance()`,
      then publish). The forward authoring path would adopt the mechanism that
      already exists rather than inventing one. Design it during the
      framework-neutral interface migration — it is the natural shape for a
      multi-framework adapter, and it must NOT be attempted before freeze.

- [ ] Split the metadata getters out of `internals/owned-mutation.ts`. Cheap:
      the adapter uses only `getOwnedOwnerPath`/`getOwnedPositionIds`, while
      `untracked()` is confined to `runOwnedMutation`, which the adapter never
      calls.
- [ ] Extend the neutrality lint gate from direct `@angular` imports to the
      adapter module itself, once the two items above make it pass.
- [ ] Only then decide whether `packages/kernel/` exists, and whether it is
      private or published. Package identity is the last step, not the first.

## Phase 2 — Public Release Surface

- [x] inventory public packages — `6e7bf16a`, baseline `tools/api-baseline.json`
- [ ] **PACKAGE TOPOLOGY DECISION** (below) — blocks the export freeze
- [ ] freeze exports
- [ ] public TypeScript tests
- [ ] compatibility matrix
- [ ] freeze public API

Exit condition: `GATE B`

### Measured public surface (`6e7bf16a`, checker-resolved, not regex)

| Package      | Total | Runtime | Type-only | **Angular in public TYPE** | Angular in decl | Internal-decl leaks |
| ------------ | ----: | ------: | --------: | -------------------------: | --------------: | ------------------: |
| `core`       |   209 |      84 |       125 |                      **3** |             169 |              **17** |
| `events`     |   116 |      63 |        53 |                      **0** |              11 |                   0 |
| `ng-forms`   |    34 |      15 |        19 |                      **3** |              26 |                   0 |
| `guardrails` |    33 |      11 |        22 |                      **0** |               2 |                   0 |
| `realtime`   |    13 |       5 |         8 |                      **0** |               7 |                   0 |
| `schema`     |     4 |       1 |         3 |                      **0** |               4 |                   0 |

`core` by entrypoint: `.` 142 (36 runtime) · `./authoring` 48 (39) · `./security` 7 ·
`./edit-session` 6 · `./lazy` 3 · `./storage` 3.

**The headline finding: core's CONTRACT is already framework-neutral.** Only 3 of
209 symbols expose an Angular type publicly — `linked`, `trackHistory`,
`toWritableSignal` — even though 169 declaring files import Angular internally.
Framework coupling is an implementation fact, not an API fact. A kernel
extraction therefore does not require a large public API change, which is a
materially stronger position than the file counts suggested.

### Emitted-entrypoint dependency analysis (runtime truth)

Transitive external imports of each BUILT entrypoint. This is the question that
settles a peer dependency; `angularInType` does not, and the tool docblock has
been corrected to say so.

| Entrypoint                          | Emitted external imports                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `core` `.`                          | `@angular/core`, `@angular/core/rxjs-interop`, `rxjs`, `rxjs/operators`, `tslib` |
| `core/authoring`                    | `@angular/core`, `@angular/core/rxjs-interop`, `rxjs`, `rxjs/operators`          |
| `core/lazy`, `core/edit-session`    | `@angular/core`                                                                  |
| **`core/security`, `core/storage`** | **(none)**                                                                       |
| **`events` `.`**                    | **`zod` only — no Angular, no Nest, no rxjs**                                    |
| `events/angular`                    | `@angular/core`, `@angular/core/rxjs-interop`, `rxjs`, `rxjs/webSocket`, `tslib` |
| `events/nestjs`                     | `@nestjs/common`, `bullmq`, `tslib`                                              |
| `events/testing`                    | (none)                                                                           |
| `guardrails` (all)                  | `@signaltree/core/authoring` only — **no Angular anywhere**                      |
| `ng-forms` `.`                      | `@angular/core`, `@angular/forms`, `@signaltree/core{,/authoring}`, `rxjs`       |
| `ng-forms/audit`                    | `@signaltree/core` only — confirms it is a pure re-export                        |
| `ng-forms/signals`                  | `@angular/core`, `@angular/forms/signals`, `@signaltree/core{,/authoring}`       |
| **`realtime` `.` and `./supabase`** | **`@angular/core`**                                                              |
| **`schema` `.`**                    | **`@angular/core`, `@signaltree/core/authoring`**                                |

**This corrects an earlier claim of mine.** I called `schema` "the strongest
candidate for eliminating Angular" on the basis that 0 of its 4 public types
mention Angular. Its emitted root imports `@angular/core` at runtime, so it is
NOT neutral today. Making it neutral means removing the Angular usage, not
merely narrowing the peer declaration. Same for `realtime`.

`events` is the genuine success: its root emits only `zod`, with Angular
confined to `./angular` and Nest/bullmq to `./nestjs`. That is the shape the
others should reach — and it argues for `peerDependenciesMeta.optional` rather
than deleting peers, since npm peers are package-scoped, not subpath-scoped.

Two anomalies to verify at `GATE C`, not now:

- `realtime` declares `@supabase/supabase-js` as a peer, but no emitted `.js`
  references it — only the `.d.ts`, README and package.json. Either a
  type-only dependency mis-declared as a runtime peer, or dead weight.
- A `${path}` template-literal specifier appeared while scanning `realtime`.
  Probably my scanner matching a dynamic import inside a template literal;
  needs confirming before anyone treats it as a defect.

### PACKAGE TOPOLOGY DECISION — required before the export freeze

Freezing 209 core symbols before deciding the topology risks discovering that
some belong elsewhere and having to redo `GATE B`. Four questions:

1. **17 internal declarations are publicly exported.** 7 on root
   (`ProcessDerived`, `DeepMergeTree`, `DerivedFactory`, `WithDerived`,
   `derivedFrom`, `SignalTreeBuilder`, `SignalTreePlanBuilder` from
   `lib/internals/*-types.ts`) and 10 on `./authoring` (marker-processor,
   hydrate-decision and error-reporter symbols). Are these intentional
   extension points to be relocated out of `internals/`, or accidental leaks to
   be removed? Removal is a breaking change; keeping them means `internals/` is
   a misnomer for those files.
2. **`ng-forms` re-exports core's audit API as its own** — `createAuditTracker`,
   `createAuditCallback`, `AuditEntry`, `AuditMetadata`, `AuditTrackerConfig`,
   all declared in `packages/core/src/lib/audit/audit.ts`. Two packages publish
   one API. Which owns it?
3. **Three packages declare an `@angular/core` peer that their public types do
   not require** — `events` (0 of 116), `realtime` (0 of 13), `schema` (0 of 4).
   `events` already splits `./angular` and `./nestjs` subpaths, so its root
   could be framework-neutral with Angular peer-scoped to the subpath. `schema`
   is the strongest case: a Standard Schema bridge should not need Angular at
   all. Narrow the peers, or keep them for safety?
4. **`@signaltree/kernel`: private boundary or published package?** Recommend
   PRIVATE first. The extraction prerequisite is unchanged — the realization
   port still consumes the Angular-shaped `TreeScalarSlotRuntime` and must move
   to the neutral `SlotIndex` interface. Publishing also means committing to a
   surface; whether that surface is small (`createTree`, `transactions`,
   `history`, `persistence`) or forces `SlotIndex` / `StructuralStore` /
   `EntityMutationFrame` into public view is exactly what a private boundary
   lets us find out without a compatibility promise.

### `@signaltree/authoring` — IN PROGRESS. Resume here.

**Decision reversed: the split happens in this major.** 15.0 is already the
breaking release; keeping `@signaltree/core/authoring` now and moving it later
would manufacture a second migration. The failed dependency check below changed
the SEQUENCE, not the destination — the prerequisites land before `GATE B`.

**GATE A stays frozen throughout.** Implementation and package refactoring are
allowed; frozen semantics are not. Stop if the split can only be achieved by
changing a GATE A invariant or redesigning marker semantics.

#### What the marker analysis proved

The problem is **file/package co-location, not semantic entanglement.** The
neutral model already exists:

```text
authorship factory  ->  plain descriptor { [X_MARKER]: true, config }
                            ->  materializer
                                    ->  framework create*Signal realization
```

Every Angular primitive in all five marker modules is inside the `create*Signal`
REALIZATION function. Zero are in the authorship factories, which return inert
objects.

| Module         | Angular primitives                    | Location                         | Authorship |
| -------------- | ------------------------------------- | -------------------------------- | ---------- |
| `form`         | `signal`×6, `computed`×9              | all in `createFormSignal`        | inert      |
| `status`       | `signal`×2, `computed`×6              | all in `createStatusSignal`      | inert      |
| `stored`       | `signal`×1, `untracked`×2             | all in `createStoredSignal`      | inert      |
| `async-query`  | `signal`×4, `untracked`×1, `effect`×1 | all in `createAsyncQuerySignal`  | inert      |
| `async-source` | `signal`×3                            | all in `createAsyncSourceSignal` | inert      |

So `@signaltree/authoring` needs no new abstraction — it needs the existing
separation made physical. The `create*Signal` functions are Angular REALIZATIONS,
not SDK contracts, and belong with the adapter in core.

Measurement note: count generic calls with `signal\s*[<(]`, not `signal(`.
`signal<T>(` does not contain `signal(`, which under-reported `stored` as having
zero uses.

#### FROZEN refactor constraint for these splits

> Marker descriptors own configuration and semantic intent. Framework
> realization owns reactive observation state. Neither becomes a second source
> of authoritative SignalTree truth.

That protects the frozen identity/authority model while files move. Do not solve
Angular removal by relocating mutable state into an ambient registry.

#### Canonical split shape — establish with `async-source`, then conform

```text
markers/async-source.ts           neutral: descriptor, guard, marker symbol, config types
markers/async-source.angular.ts   Angular: createAsyncSourceSignal + signal(...)
```

The suffix matters less than making the direction obvious. **Do not invent five
slightly different patterns** — `async-source` sets the structure and the other
four conform.

#### Pin these four on every split

1. **Public semantics unchanged** — same marker object shape, same identity
   symbol, same config semantics.
2. **Realization behavior unchanged** — existing core tests exercise the same
   Angular implementation after relocation.
3. **Dependency direction improves** — the neutral descriptor must NOT import
   the realization module; realization may import the descriptor.
4. **API symbol set unchanged** — until the final package move this must appear
   as declaration-location movement, which `tools/api-inventory.mjs --check`
   now reports separately from a contract change.

#### The package-boundary falsifier

Not "the Angular import disappeared from the neutral file", but:

> Can the descriptor module be imported in a process with **no Angular
> installed** and still construct, inspect, and type the marker?

**Prove it with an isolated consumer, not a grep.** Build a throwaway fixture
where `@angular/core` is genuinely unresolvable — a temp project outside the
workspace, or an esbuild/tsc run with Angular aliased to a failing stub — then
import the descriptor module, construct a marker, run its guard, and type-check
against its config. Grepping imports proves the file does not name Angular; it
does not prove the module's transitive closure can load without it. Every proxy
measurement in this release that drove a decision was materially wrong at least
once (see the standing rule below), and this is the decision the whole package
boundary rests on.

Success criterion for the first slice:

```text
Neutral descriptor closure     Angular runtime imports  = 0
                               core-internals reachback = 0
Angular realization            behavior unchanged
                               same marker identity/config semantics
                               same public symbol set
```

**If any symbol appears or disappears during `async-source`, STOP and understand
why before continuing.** The first split must be pure declaration-location
movement; a symbol-set change there means the seam is not where the analysis
said it was.

#### Order — deliberately not by marker name

```text
1. async-source   349 lines, 3 calls — simplest realization seam, sets the pattern
2. stored         richer: persistence consequences + untracked
3. status
4. form
5. async-query    LAST — effect() adds lifecycle deserving more scrutiny
```

After `async-source`, do `stored` NEXT rather than sweeping the rest: if both a
simple case and a consequence-bearing case split with no semantic drift, the
remaining three become safely mechanical.

#### Create the package only when this is true

```text
proposed @signaltree/authoring closure
    Angular runtime imports:      0
    core internals reach-through: 0
```

**Do not create the package halfway through the five splits.**

#### Recorded, NOT to be solved during the splits

Adapter registration (`installMaterializationRealization`, `064f19ab`) is
module-load and currently "last adapter imported wins". Fine for a single
Angular-facing core; it matters when a second adapter becomes viable. Desired
rule when that day comes:

```text
same adapter installed twice     -> idempotent
different incompatible adapter   -> deterministic failure
```

Release debt. Do not derail a split to fix it unless a split directly requires it.

#### Closure proof — measured, 38 of 46 already neutral

All five splits are done. Bundling the `authoring.ts` entrypoint with Angular
external and tree-shaking on, then inspecting what the OUTPUT retains:

| Class                      |     n | Detail                                                                                                                                                                |
| -------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type-only                  |     9 | Cannot retain a runtime dep by construction                                                                                                                           |
| Value, neutral             |    29 | `registerMarkerProcessor`, every guard and marker symbol, all 8 `*_READERS`, `onHydrateDecision`, `onTreeError`, `getPathNotifier`, write-context, enhancer authoring |
| **Value, retains Angular** | **8** | below                                                                                                                                                                 |

Seven of the eight are symbols ALREADY slated to leave authoring:

```text
createFormSignal, createAsyncSourceSignal, createAsyncQuerySignal
    Angular realizations -> core, not the SDK

composeEnhancers, isAnySignal, isNodeAccessor, isTraversableNode
    ordinary-user utilities from utils.ts, already classified as mis-filed
```

**`interceptLeafSignals` is the only genuine SDK symbol still dragging Angular.**
It reaches `../utils` (for `isTraversableNode`) and `./owned-mutation` (which
calls `untracked`). `utils.ts` is genuinely runtime-coupled — `isSignal` x7,
`signal`, `computed` — so this is not a type-only fix.

Two candidate resolutions, to decide next session:

- Extract the purely structural guards from `utils.ts` into a neutral module,
  the same contract pattern. `isTraversableNode` is pure structure and needs
  nothing; `isAnySignal`/`isNodeAccessor` call Angular's `isSignal` and cannot
  follow — but both are ordinary-user API leaving authoring anyway.
- `owned-mutation`'s `untracked` is a realization concern. Either
  `interceptLeafSignals` gains a narrow port like marker materialization did
  (`064f19ab`), or it is accepted as an Angular-side SDK piece and stays in core.

MEASUREMENT NOTE, Rule 0 again. The first attempt reported ALL 46 symbols as
framework-dragging, including ones known neutral. It was measuring module-graph
TRAVERSAL, not RETAINED closure — importing any name from a barrel walks the
whole barrel regardless of tree-shaking. Only the output-inspection version
measures the property that governs the decision. Caught because the result was
implausible, not because the method was reviewed.

#### Package move — scoped, NOT started

`9e193a7f` closed the last neutrality blocker. The SDK surface is proven neutral;
what remains is a physical migration.

**Retained closure of the proposed SDK: 23 modules, zero Angular in output.**
Measured with esbuild's metafile (bytes contributed), not module traversal:

```text
path-notifier (12.7KB)  intercept-leaf-signals  materialize-markers
constants               enhancers/index         owned-metadata
visit-tree              readonly                node-shape
types (252B runtime)    write-context           causal-write-mode
error-reporter          materialization-realization
production-substrate-stats
5 marker contracts      markers/derived         shared/lib/constants
```

NOT retained, despite appearing in a traversal measurement: `utils`,
`entity-signal`, `entity-map`, all of `physical/*`, the three marker
realizations, and most of `shared`.

**This settles the dependency direction, and it is the harder answer.** Core
needs `path-notifier`, `materialize-markers`, `write-context`, `types` and
`constants` centrally, so they cannot simply leave core. Since
`@signaltree/authoring` must NOT depend on core, the direction must be:

```text
@signaltree/authoring   owns the 23-module neutral closure
        ^
@signaltree/core        imports it
```

That is a real physical migration of ~22 core modules plus one shared module,
with circular-import risk, not a re-export shuffle. Scoped here so it can start
cold rather than be discovered mid-move.

Constraints already decided, do not relitigate:

- No `@signaltree/core` peer on authoring, not even for convenience. If the
  manifest ends up with one, stop and find out why.
- Move public CAPABILITY, not internal substrate. `OWNED_NODE_METADATA` and the
  other newly extracted internals stay private unless extension authors need
  them in the supported contract.
- No `@signaltree/core/authoring` forwarding shim. 15.0 is the breaking reset;
  a forwarding path has to be supported for all of 15.x and invites continued
  use. The migration guide carries the one-line import change instead.
- Packed-artifact proof before `GATE B`: pack the tarball, install it in a temp
  consumer OUTSIDE the workspace with no Angular installed and no tsconfig path
  aliases, import every runtime export, typecheck the type exports, and grep the
  tarball for `packages/core/src`, `../core`, `@angular/core`,
  `@signaltree/core/authoring`, `workspace:*`.

#### THREE closures, not one — measure all three before `git mv`

The 23-module result is the RETAINED RUNTIME closure. It is **not** yet the
package-migration closure. Three separate properties govern this move, and
esbuild answers only the first:

```text
1. RETAINED RUNTIME CLOSURE      esbuild metafile bytesInOutput
                                 -> MEASURED: 23 modules, 0 Angular

2. DECLARATION / TYPE CLOSURE    tsc declaration emit + resolution
                                 -> NOT YET MEASURED. What must exist for
                                    authoring's .d.ts to stand alone without
                                    reaching into @signaltree/core?

3. NATIVE MODULE-LOAD CLOSURE    built ESM imported with NO bundler
                                 -> NOT YET MEASURED. Does importing the
                                    package root make Node evaluate Angular or
                                    a core-only module?
```

**(2) is the one to worry about.** esbuild correctly erases type-only
dependencies, so they contribute zero bytes and vanish from the runtime
measurement — but `GATE B` freezes a TYPESCRIPT API, so a declaration
dependency on core is just as disqualifying as a runtime one. Do not engrave
"22 core modules + 1 shared module" as the physical move count until declaration
emit agrees.

And measure the EMITTED declaration specifiers, not TypeScript's source graph —
a fourth member of the same Rule 0 family:

```text
compiler source resolution   !=   shipped declaration resolution
```

A type can resolve perfectly inside the monorepo while the generated `.d.ts`
still carries an import path that is invalid once packed, or that reaches back
into core. The property that actually governs `GATE B` is:

```text
packed @signaltree/authoring .d.ts
        resolves using only itself + legitimate neutral dependencies
        never @signaltree/core
        never workspace-relative source paths
```

Read the emitted `.d.ts` files. Do not infer them from `tsc` succeeding.

#### First cold-session task: graph, not `git mv`

```text
candidate modules -> runtime edges + type/declaration edges
                  -> strongly connected components
                  -> topological migration order
```

Two stop conditions fall out of it:

- a candidate authoring `.d.ts` that references `@signaltree/core` -> STOP;
- a runtime SCC spanning a neutral-authoring module and an Angular/core-only
  module -> STOP and split that SCC first.

This is a MEASUREMENT exercise. It is not permission to reopen the authoring
architecture; do that only if one of these produces a real cross-boundary
dependency.

#### Migrate SCC-by-SCC, never 23 files at once

Establish the package, then move leaf groups upward in dependency order, keeping
BOTH packages building after each coherent slice. Let the SCC graph decide the
order, not the file names. The invariant after every slice:

```text
authoring -> NEVER core
core      -> MAY authoring
```

No temporary reverse edge "just until the move is finished". Those are exactly
the edges that survive migrations.

#### Two ownership maps — do not collapse them

`core -> authoring` being the right dependency direction does NOT mean every
module in the closure becomes public SDK API:

```text
PHYSICAL ownership   authoring may own 20+ implementation modules
PUBLIC   ownership   authoring EXPORTS only the ~38 supported capabilities
```

`owned-metadata`, the materialization machinery and any storage objects live
inside the package while staying package-private. The extraction at `9e193a7f`
deliberately preserved that line; the migration must not quietly erase it.

#### Packed proof covers three different things

```text
pack -> temp project OUTSIDE the workspace, no Angular installed,
        no workspace path aliases, install the tarball

node import('@signaltree/authoring')   proves MODULE LOADING
tsc consumer.ts --noEmit               proves DECLARATIONS
bundle representative imports          proves TREE-SHAKING
```

Native import matters on its own: a bundler can tree-shake something Node's ESM
loader would still evaluate.

**MEASUREMENT WARNING — this error was made TWICE in one session.** Module-graph
TRAVERSAL is not RETAINED closure. `onLoad`/`onResolve` fire during graph
construction, before tree-shaking; only the metafile's `bytesInOutput` (or
inspecting the bundled output) reports what survives. The traversal reading
scoped this migration at 45 modules against a true 23, and earlier reported all
46 authoring exports as framework-dragging when 38 were clean. Both times an
implausible result caught it, not the method. Use the metafile.

#### Declaration preflight — MEASURED, classified, decision taken

Measurement B is done. Runtime and declaration closures disagree, exactly as
predicted:

```text
retained RUNTIME closure       23 modules, 0 Angular, 0 core
shipped DECLARATION closure    29 files,  11 import @angular/core, 0 core
```

Neither closure depends on `@signaltree/core`. The architecture is NOT reopened:
the implementation boundary is right, the DECLARATION ownership is wrong.

**Symbol-level classification of all 46 authoring exports** (TypeScript parser,
not grep — a regex first reported four false `@signaltree/core` dependencies by
matching JSDoc `import` examples as code):

| Bucket                         |   n | Meaning                                                                                                    |
| ------------------------------ | --: | ---------------------------------------------------------------------------------------------------------- |
| 1 — declaration co-location    |  28 | Neutral declarations sharing a `.d.ts` with Angular-typed ones                                             |
| 2 — already leaving authoring  |   5 | `createFormSignal`, `createAsyncSourceSignal`, `createAsyncQuerySignal`, `composeEnhancers`, `isAnySignal` |
| 3 — genuine Angular-shaped SDK |   1 | `isSignalTree`                                                                                             |

**Bucket 1 has one dominant root cause: `lib/types.d.ts`.** Its Angular import
exists for `ISignalTree` and the leaf types, but `ENHANCER_META` (a Symbol),
`EnhancerMeta` (five plain fields) and `NodeAccessor<T>` (three call signatures
over `T`) need none of it. Eight module groups inherit the edge purely by
co-location: `enhancers/index`, `intercept-leaf-signals`, `materialize-markers`
(via `position-registry`), `node-shape`, `form.contract`, `path-notifier`,
`write-context`. `readonly.d.ts` is the same pattern independently — `import
type` for the `Pick` sources while the eight `*_READERS` are key allowlists.

**DECIDED — `isSignalTree` moves to `@signaltree/core`.** Its runtime is
framework-agnostic, but its predicate narrows to `ISignalTree<T>`, whose public
shape exposes Angular `WritableSignal` leaves. The rule this establishes:

> Runtime neutrality does not make an API authoring-neutral if its supported
> TYPE contract describes the framework realization.

**DECIDED — `isNodeAccessor` stays in authoring.** `NodeAccessor<T>` is neutral;
its Angular edge is co-location in `types.ts`, not intrinsic coupling.

**DECIDED — no Angular peer on `@signaltree/authoring`**, not optional, not
type-only. A non-Angular TypeScript consumer must not need `@angular/core`
installed to typecheck a framework-neutral SDK. `rxjs` is a separate question and
may legitimately remain if it appears in neutral async contracts.

#### Next session — in this order

1. Split the two declaration hotspots, using the pattern already proven five
   times on markers. Extract ONLY the neutral substrate the SDK consumes; do not
   move all of `types.ts`.

   ```text
   types.ts     -> neutral: ENHANCER_META, EnhancerMeta, NodeAccessor, ...
                -> stays:   ISignalTree, leaf/realization-facing types
   readonly.ts  -> neutral: the eight *_READERS allowlists
                -> stays:   Angular-derived source types
   ```

   **Extract the MINIMUM neutral contract.** The goal is the smallest substrate
   the SDK actually consumes — NOT "`types.ts` without the Angular import". If
   the neutral module grows into a shadow copy of core's full type model, the
   split has failed even when the declaration closure reports zero Angular.

   **STOP CONDITION during the split:** if a supposedly neutral declaration
   needs `ISignalTree`, `Signal`, `WritableSignal` or another realization-facing
   type for its ACTUAL PUBLIC SEMANTICS — not merely because it shares a file
   with one — stop and reclassify that symbol into bucket 3. Do not widen the
   neutral substrate to accommodate it. That is the same judgement already made
   for `isSignalTree`, and the same rule applies: runtime neutrality does not
   make an API authoring-neutral if its supported type contract describes the
   framework realization.

2. **Preserve nominal identity.** `ENHANCER_META` is a `Symbol` and must remain
   exactly ONE authoritative runtime instance — extract it, do not duplicate it
   into neutral and core copies with matching names. Same for any brand symbol
   behind `NodeAccessor`: ownership moves to the neutral side and core CONSUMES
   it, consistent with `core -> authoring`.

3. Relocate the five bucket-2 symbols. NOTE: they were moved to `./authoring`
   FROM the root barrel in 14.0.0, so removing them from authoring without
   giving them a home in core deletes them from the public API. This is an API
   move, not an export deletion.

4. Move `isSignalTree` to core.

5. Rerun the parsed emitted-declaration closure. **Required: 0 `@angular/*`,
   0 `@signaltree/core`, 0 `packages/core/src`, 0 core-relative shipped paths.**
   If a genuine authoring declaration still imports Angular, STOP and classify
   before proceeding.

6. FREEZE that result, then and only then compute A (runtime SCCs) and C
   (combined physical closure + topological order). Computing them now would
   bake in declaration edges that steps 1-4 are about to remove.

#### Progress

- [x] Neutralize marker materialization behind a realization port — `064f19ab`.
      `internals/materialize-markers.ts` now imports zero framework code.
- [x] `async-source` split — `af273898` (canonical pattern)
- [x] `stored` split — `6bb04f1d` (consequence-bearing proof)
- [x] `status` split — `7d2e51ca`
- [x] `form` split — `d09407b7` (type-only `HistoryFeature` edge)
- [x] `async-query` split — `3c5521fc` (lifecycle proven realization-side)
- [x] Contract-neutrality gate — `tools/check-contract-neutrality.mjs`, 5/5 pass
- [x] Closure proof run — 38/46 neutral; see the table above
- [ ] Move the 3 realizations + 4 ordinary-user utilities out of authoring
- [ ] Resolve `interceptLeafSignals` (port, or accept as Angular-side)
- [ ] Re-run the closure proof; require 0 retained Angular
- [ ] Create `@signaltree/authoring`, move the SDK, repoint `guardrails`
- [ ] Remove `@signaltree/core/authoring` as a 15.0 breaking change
- [ ] Regenerate the API baseline deliberately, then `GATE B`

### Historical — the dependency check that produced the sequence above

The gate was: _can `@signaltree/authoring` be consumed by a third-party
extension package without importing `@signaltree/core` implementation modules or
Angular?_ **No, on both counts.** Files were NOT moved.

Module-level import graph for the 37 SDK symbols — 14 declaring modules:

| Class                                           | Modules                                                                                                                                                     | Verdict              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Runtime-neutral**                             | `internals/error-reporter.ts` (zero imports of any kind), `write-context.ts`, `path-notifier.ts`, `enhancers/index.ts`                                      | could move today     |
| **Type-only Angular** — erasable, not a barrier | `types.ts` (`Signal`, `WritableSignal` as types), `readonly.ts` (`import type`)                                                                             | not blocking         |
| **Runtime Angular**                             | `internals/materialize-markers.ts` (`computed`, `isSignal`), `markers/{form,status,stored,async-query,async-source}.ts` (`signal`, `computed`, `untracked`) | **blocks the split** |

`markers/derived.ts` looked Angular-coupled but its `computed` mention is inside
a JSDoc comment; it has no imports at all.

**The blocker is `registerMarkerProcessor`, the flagship extension API.** It is
declared in `internals/materialize-markers.ts`, which needs Angular's `computed`
and `isSignal` at RUNTIME and additionally reaches into `./physical-commit-clock`
(kernel), `./position-registry`, `../path-notifier` and `../utils`. Moving it
produces exactly the package-shaped dependency leak the check exists to prevent:
a package that is a façade over core internals.

Confirmed against the built artifact rather than inferred — `core/authoring`
emits `@angular/core`, `@angular/core/rxjs-interop`, `rxjs`, `rxjs/operators`.

**Missing neutral port:** a reactive-primitive port (create a computed, detect a
signal) beneath both packages. That is the SAME class of work as the realization
port needing the neutral `SlotIndex` interface, and it is already recorded under
Kernel Extraction Prerequisites. Sequence the authoring split AFTER that
migration, not before it.

The audience argument for the split still holds — 37 of 48 symbols have no
ordinary-app use. The seam is real; it just cuts THROUGH the SDK today rather
than around it, so splitting now would ship the wrong boundary permanently.

### Keep / remove / move symbol map

Governing rule, applied per symbol rather than per package history:

```text
ordinary app needs it                          -> core
extension/plugin author needs it               -> authoring
framework-specific integration needs it        -> adapter/integration package
nobody outside SignalTree implementation needs it -> stop exporting it
```

**`core/authoring` — 48 symbols. The seam is clean enough to justify a split.**

| Class                                                                                                                                         |   n | Disposition                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Extension SDK — marker processing, hydrate/error hooks, enhancer composition, write context, path notifier, 4 `create*Signal` factories       |  24 | MOVE to `@signaltree/authoring` if the split lands; otherwise keep, but relocate the 10 declared under `internals/`                                          |
| Marker introspection — 8 `*_READERS`, 6 `is*Marker`, `*_MARKER` tokens                                                                        |  13 | MOVE with the SDK; coherent as a set                                                                                                                         |
| General utilities — `composeEnhancers`, `isAnySignal`, `isNodeAccessor`, `isTraversableNode`, `SIGNAL_TREE_CONSTANTS`, `SIGNAL_TREE_MESSAGES` |   7 | KEEP in core — ordinary-user API mis-filed under authoring                                                                                                   |
| **Private-package leakage** — `isBuiltInObject`, `parsePath`                                                                                  |   2 | **REMOVE.** Declared in `@signaltree/shared`, which is `"private": true`. Publishing them makes a private package's internals part of core's public contract |

37 of 48 are genuine extension-author surface with no ordinary-app use. That is
an SDK, not a convenience subpath — `@signaltree/authoring` is justified on
evidence, not merely plausible.

**Root's 7 `internals/` exports.** Verify each against docs, examples and typing
specs before cutting; expected dispositions: `derivedFrom` KEEP (user-facing);
`DerivedFactory`, `WithDerived` KEEP or MOVE to authoring; `SignalTreeBuilder`,
`SignalTreePlanBuilder` MOVE to authoring; `ProcessDerived`, `DeepMergeTree`
REMOVE — type machinery public only because inference needed it.

**`ng-forms` audit duplication.** `createAuditTracker`, `createAuditCallback`,
`AuditEntry`, `AuditMetadata`, `AuditTrackerConfig` all declare in
`packages/core/src/lib/audit/audit.ts`. `ng-forms/audit` emits only
`@signaltree/core`, confirming it is a pure re-export with no forms-specific
content. **Core owns audit; remove the republication.** Also eliminate
`ng-forms`' four `export *` barrels so its contract is explicit.

**`realtime` — 13 symbols, the abstraction is real.**

| Class             |   n | Detail                                              |
| ----------------- | --: | --------------------------------------------------- |
| Provider-neutral  |   9 | The whole root; `RealtimeAdapter` is a genuine seam |
| Supabase-specific |   4 | The whole `./supabase` subpath                      |
| Angular-specific  |   0 | —                                                   |

**KEEP the name.** A rename to `@signaltree/supabase` would destroy a working
provider boundary. The defect is that Angular sits in the NEUTRAL half —
`connection-state.ts` and `types.ts` import `@angular/core` — so the cleanup is
2 files, not a repackaging.

Recommended topology, pending that decision:

```text
              @signaltree/kernel  (private first)
                      |
              @signaltree/core    (Angular integration + product API)
                      |
   +----------+-------+--------+-----------+
   |          |                |           |
ng-forms   schema?          realtime?   guardrails
(Angular)  (neutral?)       (neutral?)  (already neutral)

events: root neutral, Angular peer scoped to ./angular, Nest to ./nestjs
```

Two facts support this being achievable rather than aspirational: `guardrails`
already imports zero Angular across 6 files, and `shared` zero across 12.

### RESOLVED at `56572c5d` — declaration closure, entity-map instance

`@rollup/plugin-typescript` compiles with `tsconfig.lib.prod.json`, which sets
`stripInternal: true`. `EntityMapComputedSlices`, `EntityMapMarkerWithSlices`, and
`DefaultKey` were referenced by PUBLIC declarations while marked `@internal`, so
their declarations were stripped and every reference to them survived — shipping
a `.d.ts` naming types it does not declare.

**`stripInternal` was functioning exactly as configured. The defect was
classifying declaration dependencies as `@internal` while public signatures
reference them.** The fix is therefore source-contract hygiene — remove the
incorrect classification — NOT disabling `stripInternal`, which remains a
legitimate mechanism for genuinely internal declarations.

| name                        | raw `tsc` | plugin | rolled `dist` | packed | after fix |
| --------------------------- | --------- | ------ | ------------- | ------ | --------- |
| `EntityMapComputedSlices`   | GOOD      | BAD    | BAD           | BAD    | GOOD      |
| `EntityMapMarkerWithSlices` | GOOD      | BAD    | BAD           | BAD    | GOOD      |
| `DefaultKey`                | GOOD      | BAD    | BAD           | BAD    | GOOD      |

Raw emission looked correct only because that probe used a different tsconfig
(`tsconfig.typecheck.json`) with no production stripping. Flipping `stripInternal`
as a single variable in a reproduction of the plugin stage turned every column
GOOD; removing the three tags with `stripInternal` left ON did the same.

CORRECTION — this ledger previously recorded `stripInternal` as RULED OUT. **That
was invalid.** The experiment removed the tags, checked the result with
`grep -c "error TS"` returning 0, and then read a `dist` file that was very likely
stale: it asserted neither build success nor artifact freshness. This is the Rule
0b step-4 failure, and it was already written down as a rule while sitting in this
document as a conclusion — which is exactly how a wrong causal claim survives.
Root-barrel reachability remains correctly ruled out (`DefaultKey` is exported
from its module AND `index.ts:129` and was dropped anyway); do not spend a cycle
widening exports.

A prior in-file fix attempt at `entity-map.ts` exported `DefaultKey` with a
correct diagnosis of the SYMPTOM but left the tag in place, so it did not resolve
the defect.

#### OPEN — second instance, possibly a second mechanism

`isDev`, `createFormSignal`, and `HydrateMode` are also publicly exported yet
`@internal`. Removing `isDev`'s tag did NOT restore its declaration, so at least
one of these is a DIFFERENT mechanism. `isDev` is `export const isDev = _isDev`,
making the alias target the obvious suspect.

The one question to answer, in an isolated fixture on the SAME production
tsconfig/plugin path — no API changes during the measurement:

> Does `stripInternal` remove a public alias's declaration because the aliased
> implementation symbol is `@internal`, even when the public alias itself is not?

Four minimal forms: exported-`@internal` target with a public alias;
module-local-`@internal` target with a public alias; `@internal` function target
with a public alias; and a plain public value as control. Property measured is
"public alias declaration survives production `.d.ts` emit" — not "the name
appears somewhere". Assert exit 0, fresh artifact, alias declaration count == 1,
and that packed matches rolled.

RESULT — the four-form fixture was run on the production tsconfig/plugin path:

| form | target                         | alias declared? | emitted type                  |
| ---- | ------------------------------ | --------------- | ----------------------------- |
| A    | exported `@internal` const     | YES             | `a = true` (inlined — safe)   |
| B    | module-local `@internal` const | YES             | `b = true` (inlined — safe)   |
| C    | exported `@internal` FUNCTION  | YES             | `c: typeof _c` — **DANGLING** |
| D    | plain public const (control)   | YES             | `d = true`                    |

**The alias-target hypothesis is REFUTED** — `@internal` on an alias target does not
strip the public alias. But the fixture found a second real route anyway: primitive
aliases inline their literal type and are safe, while FUNCTION (and likely
class/object) aliases emit `typeof target`, so the alias survives referencing a
stripped declaration. Visible only because the fixture asserted the emitted TYPE
rather than the name's presence — on a presence-only check all four rows read YES.

`isDev` therefore does NOT match the alias hypothesis. `_isDev` is module-local and
NOT `@internal`; `isDev` itself carries the tag, making it most likely the SAME
mechanism as entity-map. The earlier observation that removing its tag did not
restore the declaration is NOT trustworthy: it grepped one presumed file
(`constants.d.ts`) without confirming where the symbol should be emitted — the third
instance this session of answering a slightly different question than the one that
governs the decision. Re-test before recording any mechanism.

The rigorous falsifier asks the PUBLIC property, avoiding the location assumption:
after removing only `isDev`'s own `@internal` tag, can a consumer
`import { isDev } from '@signaltree/core'`, and what exact type arrives? Assert
build exit 0; dist recreated after the edit; package-root declaration exists;
`isDev` reachable from the root; consumer import typechecks; inferred type is the
expected boolean/literal shape; negative control proves it is not `any`/`unknown`.
Search the WHOLE fresh declaration tree for declaration sites and references to both
`isDev` and `_isDev`. If tag removal does not restore the contract, stop and
characterize what the fresh declarations actually contain — no mechanism guess.

Report the `isDev` result as this table, not as prose — it makes promoting one
sub-result into the conclusion much harder, which is exactly how the previous
`isDev` claim went wrong:

|                    | tagged | tag removed |
| ------------------ | ------ | ----------- |
| root importable    | ?      | ?           |
| rolled declaration | ?      | ?           |
| packed declaration | ?      | ?           |
| consumer type      | ?      | ?           |
| negative control   | ?      | ?           |

Then run an AST **characterization scan** (not a fix list) for the value-space
route. **Do not limit it to functions** — the recorded invariant is broader. The
property is whether the emitted public type contains a VALUE QUERY (`typeof
InternalThing`) whose target will not survive production declaration emission:

```ts
export const x = internalFunction;
export const x = InternalClass;
export const x = internalObject;
export const x = internalCallableObject;
```

Primitive initializers inline their literal type and are safe; anything the checker
describes by reference to another symbol is a candidate.

**Decide intent BEFORE de-internalizing any of the three, or any scan hit.** `isDev` is already in
the deletion-first utility audit below, so the product fix may be to remove it
from the public surface rather than to make its declaration survive. For each of
`isDev`, `createFormSignal`, `HydrateMode`: intended public API -> its declaration
closure must survive; not intended -> remove from public reachability instead of
de-internalizing. Otherwise a build-tool investigation quietly preserves an API
already slated for deletion.

#### Acceptance invariant

> A type reachable from a shipped public declaration must itself be present in
> the shipped declaration closure. Direct root importability is a SEPARATE
> API-design decision.

#### Permanent gate

Public declaration validation runs against the **packed** artifact, from an
external consumer, with no workspace path aliases, `skipLibCheck: false`, and
asserts `tsc` exit status 0. The repo may use `skipLibCheck` for speed; this gate
never may — an earlier "passing" external compile passed ONLY because
`skipLibCheck` suppressed errors inside `.d.ts` files, i.e. it suppressed exactly
the property under test.

The fixture must install the packed tarball PLUS its declared required peers
(`@angular/core`), while still excluding workspace aliases, monorepo source paths,
and undeclared dependencies. The harness must distinguish two failures that look
identical in the output:

| symptom                                   | meaning        |
| ----------------------------------------- | -------------- |
| missing required PEER dependency          | fixture defect |
| missing transitive DECLARATION dependency | package defect |

NOT YET GREEN. `56572c5d` proved the entity-map instance is gone. It did not prove
the packed consumer gate passes: the temp consumer had no `node_modules`, so
`@angular/core` was unresolved (fixture defect), and the `isDev` instance above is
a real remaining package defect.

#### Permanent closure fixture — must cover BOTH routes

A fixture covering only a non-root support type would miss the value-space case
entirely, so it must exercise both proven routes:

```ts
// type-space closure
/** @internal */ export interface InternalType {}
export interface PublicType {
  value: InternalType;
}

// value-space closure
/** @internal */ export function internalFn(): number {
  return 1;
}
export const publicFn = internalFn;
```

The production declaration gate must reject both if stripping leaves a dangling
reference. Add it only AFTER the cause is fully repaired — a fixture added while
the pipeline is still broken proves little.

#### Build-experiment evidence rule

A missing error string is not evidence that a build succeeded. `grep -c "error
TS"` returned 0 for a build that failed and emitted no artifact at all. Every
decisive build experiment must assert all three: command exit status 0, expected
artifact exists, artifact has/lacks the property being tested.

### GATE B needs three independent dimensions

No single proxy can freeze the API. Each of these has now been observed passing
while another failed:

| dimension             | question                                  | failure it missed                                                                                                                    |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Export inventory      | what names exist?                         | `TimeTravelMethods<T>` -> `TimeTravelMethods` (arity change, symbol set identical); `StateOf` (inventory clean, declaration invalid) |
| Public type contracts | what do those names mean to TypeScript?   | not yet systematic — targeted contract tests are sufficient for 1.0                                                                  |
| Declaration closure   | can the shipped types be consumed at all? | the entity-map blocker above                                                                                                         |

`tools/api-inventory.mjs` compares symbol sets and metadata; it structurally
cannot see a type-shape change to an existing symbol. Generic-arity plus
signature fingerprinting is a possible later improvement, NOT a 1.0 requirement.

### Enhancer + tree-type vocabulary — decided

`Enhancer` is framework-neutral (`8e294c4c`), the demo authors against it
(`6b302bb9`), and time-travel no longer needs a state generic (`b266457d`).
FROZEN unless a deterministic counterexample appears — do not reopen.

Settled by measurement, with the evidence recorded in those commit messages:

- `createEnhancer` stays; the two-stage model wanted no second verb.
- `EnhancerHost` stays private.
- Return-additions authoring REJECTED on runtime evidence: 8 of 9 enhancer
  bodies do something a generic `tree + additions` combiner cannot express
  (`batching` replaces tree identity, `copyTreeProperties` exists because
  `Object.assign` dropped non-enumerable methods, `transactions` attaches a
  side-channel key).
- The neutral / realization-facing `.with()` overload split reflects two real
  authoring models, not legacy accommodation.
- `SignalTreeBase<T>` — DELETE. Character-identical to `SignalTree<T>`, zero
  consumers (declaration + barrel re-export are its only occurrences).
- `SignalTree<T>` — canonical public tree type.
- `ISignalTree<T>` — remove from public API, but only AFTER the enhancer
  migration; its remaining legitimate use is realization-facing enhancer
  signatures in `guardrails`, `realtime`, `schema`, `ng-forms`. Every demo use is
  paired with a cast or a compensating `& Methods` annotation.
- `composeEnhancers` — DELETE. `enhancers.reduce((t, e) => e(t), tree)` typed
  `(tree: T) => T`, so it erases `TAdded` entirely. Not a synonym for
  `.with(a).with(b)` — a strictly worse path. Independent of variadic `.with()`.

Variadic `.with(a, b, c)` is typing-proven for neutral enhancers and for real
converted built-ins, INCLUDING `as const` spread and negative controls. It is
blocked only on migrating each built-in's public contract to
`Enhancer<Methods>` — a mechanical candidate proven on `batching` (three lines:
signature, `import type`, one boundary cast; body untouched), to be migrated
one at a time with per-enhancer characterization rather than assumed
batching-shaped.

### API cleanup queue, after the declaration fix

1. Delete `SignalTreeBase`.
2. Delete `composeEnhancers`.
3. Migrate remaining built-ins to `Enhancer<Methods>`, one at a time.
4. Remove the realization-facing `.with()` overload; add heterogeneous variadic
   `.with(...enhancers)` with runtime order-equivalence tests and an
   identity-replacing enhancer case.
5. Realistic `SignalTree` vs `ISignalTree` matrix (state containing nested
   object + `entityMap` + marker + primitive leaf, with negative controls), then
   remove public `ISignalTree`.
6. `FORM_MARKER` / `isFormMarker` — one owner. Declared in
   `@signaltree/core/authoring`, re-exported by `ng-forms`
   (`form-bridge.ts:582`); pick the marker-contract owner.
7. Un-publish `@signaltree/guardrails/./noop` as a public subpath, keeping it as
   the conditional-export target. Falsifiers first: repo/docs explicit imports of
   it = 0, no compelling external usage.
8. Authority audit — `flushAllStoredSignals`, `clearStoragePrefix`,
   `invalidateTag` fit no grammar bucket. Decide whether the authority is
   genuinely process-wide or leaked implementation ownership.
9. Deletion-first audit — `deepEqual`, `isDev`, `toWritableSignal`, `asReadonly`.
10. Metadata polish — `readonly`/literal-friendly `EnhancerMeta` arrays.

### NEEDS RECONCILIATION — "guardrails dead in prod"

Investigated: `@signaltree/guardrails` root resolves to `dist/noop.js` under the
`production` export condition, documented at `README.md:66-77`, with `default`
deliberately mapping to the REAL implementation so a bundler setting neither
condition gets the functional build. The rules measured are authoring-time
architectural diagnostics (`noDeepNesting`, `noFunctionsInState`,
`noCacheInPersistence`).

**No correctness defect demonstrated. The production no-op is intentional,
documented package behavior.** That is deliberately weaker than "loses nothing a
consumer depends on" — not every supported build environment has been shown to
select the intended branch, and rule names do not prove nobody relies on them as
enforcement. The original ledger item must either identify a narrower failing
invariant or be retired with evidence. Do not silently convert it to "false".

The real finding is API hygiene, queued above: `./noop` is separately public
though users should never select it themselves.

## Phase 3 — Packaging Proof

- [ ] audit built package output
- [ ] `npm pack` every publishable package
- [ ] verify tarball exports/types/layout
- [ ] clean TypeScript consumer smoke project
- [ ] clean Angular consumer smoke project

Exit condition: `GATE C`

## Phase 4 — Release Quality

- [ ] compatibility/runtime/browser coverage
- [ ] lifecycle/memory/churn tests
- [ ] error model audit
- [ ] persistence contract audit/documentation
- [ ] SSR/hydration decision and tests/docs
- [ ] README upgrade
- [ ] docs/examples/demo
- [ ] package metadata/license/security audit

Exit condition: `GATE D`

## Phase 5 — Automation

- [ ] **Fix two timing-sensitive specs that fail under parallel load.**
      `status.spec.ts` "should initialize 100 markers in under 50ms" and
      `production-scalar-substrate.benchmark.spec.ts` "public undo-of-remove
      realization" both failed transiently during Phase 1 runs and pass on a
      quiet machine. Not kernel blockers — but a wall-clock assertion in the
      default suite makes release automation nondeterministic, which is exactly
      what a CI release gate cannot tolerate. Either give them a generous
      margin, move them out of the gating suite, or assert complexity rather
      than milliseconds.
- [ ] CI release gate
- [ ] trusted publishing/provenance
- [ ] clean-checkout release flow
- [ ] final performance baseline generation

Exit condition: `GATE E`

## Phase 6 — Release Candidate

- [ ] publish `1.0.0-rc.1`
- [ ] install from npm in external projects
- [ ] collect RC packaging/DX/docs failures
- [ ] fix RC issues only
- [ ] final public API review

Exit condition: `GATE F`

## Phase 7 — 1.0 Release

- [ ] clean-clone final release matrix
- [ ] publish `1.0.0`
- [ ] verify npm/docs/install instructions from scratch
- [ ] post-release operational readiness

Exit condition: `GATE G`

## Suggested Chat Boundaries

- Chat 1: persistence + final atomicity
- Chat 2: fresh HEAD release-blocker audit
- Chat 3: public API/type freeze
- Chat 4: packaging + `npm pack` + consumers
- Chat 5: compatibility/lifecycle/error audits
- Chat 6: docs/examples
- Chat 7: CI/release automation
- Chat 8: RC verification

When a phase is complete, start a fresh chat and tell the agent to read
`AGENTS.md`, this file, current git status, and recent history before touching
the next phase.

## Autonomous Slice Contract

1-3 commits is a normal checkpoint size, **not a stop condition**. If the next
item is unambiguous and context is still healthy, continue. Stop only for a real
decision, a phase boundary, a technical block, or degraded context quality —
never merely because a commit count was reached.

Each commit must have:

- has one clear purpose
- has focused tests green
- has authoritative gate green
- has diff inspected
- has this ledger updated

Intervention is required for:

- semantic choices
- API compatibility choices
- packaging/public-surface choices
- two plausible architectures
- a failing test suggesting a frozen invariant is wrong
- release feature scope changes

## Implementer Prompt

```text
Read AGENTS.md, RELEASE-1.0.md, current git status, and recent history. We are
finishing SignalTree for a public 1.0 release. Work autonomously through the
current release phase only. Always characterize correctness/complexity issues
before changing production, preserve frozen architecture invariants, keep
unrelated dirt untouched, make one conceptual change per commit, run focused
validation followed by the authoritative relevant test/build/lint gates, update
RELEASE-1.0.md after each checkpoint, and continue to the next item in the
current phase while the next step is unambiguous. Stop the phase when its gate
is satisfied or when a genuine product/API/semantic decision is required. Do
not do speculative optimization or start the next release phase.
```

## Reviewer Prompt

```text
Do not modify code initially. Adversarially audit HEAD against the release
invariants and RELEASE-1.0.md. Treat historical findings as stale. Identify
only current release blockers with concrete evidence. Rank them. Do not
recommend speculative optimizations.
```

## Current Sequence From Here

**NEXT SESSION:** (1) re-test `isDev` rigorously per the falsifier in "OPEN —
second instance" — public-import property, whole declaration tree, no location
assumption; (2) AST characterization scan for the value-space route; (3) decide
public intent for `isDev` / `createFormSignal` / `HydrateMode` and each scan hit
BEFORE repairing anything; (4) repair only intended public contracts; (5) packed
gate with legitimate peers installed. The alias-target hypothesis is REFUTED — do
not re-run it. Formerly this asked whether `stripInternal` strips a public alias
whose target is `@internal`; See "OPEN — second
instance" under Phase 2. Answered by an isolated fixture on the production
tsconfig/plugin path, with no API changes during the measurement; then decide
whether `isDev` / `createFormSignal` / `HydrateMode` are intended public API at
all before touching their tags. Nothing in the API cleanup queue starts before
the packed gate is green, because the declaration artifact is not yet trustworthy
enough to measure the API being frozen.

The plugin-stage question is ANSWERED: the plugin emits the broken declaration
(`stripInternal` under `tsconfig.lib.prod.json`), not a later Nx/Rollup step.

1. Finish `stored()`/persistence atomic consequence semantics.
2. Add final heterogeneous atomicity forcing test.
3. Perform fresh correctness/complexity audit of HEAD.
4. Fix every release-blocking audit finding.
5. Freeze public API.
6. Add exhaustive public type/API tests.
7. Establish Angular/TS/Node compatibility matrix.
8. Audit built package output.
9. `npm pack` every publishable package.
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
