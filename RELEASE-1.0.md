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

0d. **FROZEN CONTRACT — a branch node IS a `NodeAccessor<T>`, not an Angular
`Signal<T>`.** This is the rule most at risk during the 15.0 type/API cleanup,
because an agent simplifying `SignalTree`/`ISignalTree`, neutral authoring types,
or enhancer contracts can look at `NodeAccessor` and conclude it "could just be
`Signal<T>`". It cannot.

The model:

```
NodeAccessor<T>   what a SignalTree branch IS
Signal<T>         one way a framework can OBSERVE it
```

Plain object branches such as `tree.$.user` must keep all three call forms:

```ts
tree.$.user(); // read User
tree.$.user({ age: 44 }); // partial / deep branch merge
tree.$.user((c) => ({ ...c, age: c.age + 1 })); // functional update
```

and must stay structurally navigable — `tree.$.user.name`, `tree.$.user.age`.

Required, non-negotiable:

- Do NOT add `.set()` / `.update()` to `NodeAccessor`.
- Do NOT make branch accessors pass Angular's `isSignal()`.
- Preserve the distinction: branch `NodeAccessor<T>` is the SignalTree
  structural/state API; a leaf signal is the framework reactive primitive.
- A branch MAY be reactive when called inside Angular `computed()` / `effect()`
  without itself being an Angular Signal. That is the intended design, not a gap.
- If an Angular API genuinely requires a real `Signal<T>` for a branch, supply it
  through an EXPLICIT adapter/view — never by changing `NodeAccessor<T>`.
- Prefer that branch-to-Signal view be READ-ONLY unless a writable semantic
  contract is separately justified. Angular's `.set()` must not ambiguously mean
  SignalTree deep merge.

Permanent contract tests to add and retain:

```
node()                     reads the exact typed snapshot
node(partial)              deep-merges, preserves omitted state
node(curr => next)         functional update
nested branch navigation   intact
branch  isSignal()         false
leaf    isSignal()         true in the Angular realization
computed(() => node())     reacts correctly
```

Any proposed change to these semantics is a **breaking architectural decision
requiring an explicit counterexample** — not routine type/API cleanup. This
distinction also belongs in the Gate-B realistic type/runtime matrix.

0e. **15.0 HARD-CUTOFF RULE. No compatibility surface may preserve an API path,
type decomposition, package dependency, or runtime protocol that the 15.0
architecture has assigned to a different semantic owner. Migration
documentation replaces shims.**

15.0 is the point where the old architecture stops being REPRESENTABLE, not
merely where a preferred API appears alongside it. The test, applied whenever
someone asks "should we keep an alias just in case?":

```
Does keeping it allow consumers to continue expressing the old architecture?

YES -> delete it in 15.0.
NO  -> compatibility may be harmless; evaluate normally.
```

> **Do not preserve an architectural boundary violation just because we can
> write a compatibility shim for it.** In a major, a shim becomes tomorrow's
> compatibility obligation.

Four cutoff tests:

1. **One semantic concept, one public owner.** `SignalTree<T>` survives;
   `ISignalTree` goes private. `NodeAccessor` owns branch semantics; `TreeNode`
   is the `$` structural view. Enhancer identity and capability dependencies
   have separate authorities. No aliases that let consumers keep coding against
   the discarded ontology.
2. **One operation, one canonical protocol.** Enhancers go through `.with()`;
   no `composeEnhancers` escape hatch. State is addressed through `$`; no root
   surface. Cite only protocols this release plan has actually accepted — an
   example here reads as a 15.0 commitment.
3. **The package boundary is PHYSICAL, not documentary.** When
   `@signaltree/authoring` exists: no Angular runtime dependency, no dependency
   back on core, no `core/authoring` compatibility subpath, no workspace-source
   imports, no framework realization primitives masquerading as neutral
   contracts. If something cannot cross cleanly it stays on the realization
   side — do not weaken the boundary to ease migration.
4. **Old grammar must fail at COMPILE/IMPORT time**, not be silently routed:

```
tree.count                  compile error
SignalTreeBase<T>           no export
ISignalTree<T>              no public export
composeEnhancers            no export
@signaltree/core/authoring  no shim once the package extraction lands
provided.has(req) || appliedNames.has(req)   never — two namespaces again
```

The goal for 15.0 is not "new API available". It is: **there is one obvious way
to express each SignalTree concept, and the old architectural divisions are no
longer part of the public language.**

Once `GATE B` freezes, the ontology is FINISHED. Gates C-G prove and ship that
architecture; they must not discover that half of 14.x was left reachable for
convenience.

0f. **DEFECT DISPOSITION. 14.x stays maintained while 15.0 is built. A major
release is not an excuse to leave a known 14.x bug unfixed.**

```
If behavior in 14.x is objectively defective and can be corrected WITHOUT
intentionally breaking the supported 14.x contract
    -> document it and ship it in a 14.x PATCH.

If fixing it requires changing the public contract, removing an API path, or
enforcing the new architectural division
    -> it belongs to 15.0.
```

Every finding gets exactly one of three dispositions:

| disposition | meaning |
| --- | --- |
| **14.x DEFECT -> PATCH** | incorrect implementation or documentation under the EXISTING 14.x contract. Fix on the 14.x line, document, patch-release, and ensure 15.0 inherits the correction. |
| **15.0 BREAKING CORRECTION** | 14.x publicly promised or permitted the wrong thing; correcting it necessarily changes consumer-visible semantics. Document the defect against 14.x; the contract change lands only in 15.0. |
| **15.0 ARCHITECTURAL CUTOFF** | not necessarily a 14.x bug — a supported old design deliberately removed or reassigned in the major. |

Each 14.x defect needs a record carrying:

```
Affected versions        Impact
Observed behavior        Workaround, if any
Expected behavior        Patch disposition / target version
Regression test added    15.0 disposition
```

**STANDING GATE-B REQUIREMENT.** Before `GATE B` freezes, review every
`KNOWN DEFECT`, `TRANSITIONAL` marker, and audit-discovered inconsistency and
classify it explicitly. **No defect may disappear into the major-release ledger
without a 14.x disposition.** Expect this to bite hardest during the built-in
enhancer migration, where runtime behaviour is most likely to disagree with
documented 14.x semantics.

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

#### RESOLVED — one cause, two source presentations

`stripInternal` is the single production cause for every instance found. Proven by
toggling ONE variable on the production plugin path and searching the whole output
tree (121 `.d.ts` files):

|                    | `stripInternal: true`        | `stripInternal: false`                      |
| ------------------ | ---------------------------- | ------------------------------------------- |
| `createFormSignal` | declarations 0, references 5 | declarations 1 (`form.d.ts`)                |
| `HydrateMode`      | declarations 0, references 3 | declarations 1 (`materialize-markers.d.ts`) |

It is reached through two SOURCE presentations, not two mechanisms:

| presentation | shape                                                                             | detectable by `getJSDocTags()`? |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------- |
| direct       | the declaration's own leading `@internal`                                         | yes                             |
| orphan       | an EARLIER `@internal` docblock still sitting in the declaration's leading trivia | **NO**                          |

`createFormSignal` is direct (own tag at `form.ts:342`). `HydrateMode` is orphan:
`materialize-markers.ts` closes an `@internal` docblock at line 43, has a banner
comment, opens a fresh docblock at 49, and declares `HydrateMode` at 71 with NO
declaration in between — so the orphaned tag is in its leading trivia.
`ts.getJSDocTags()` on that declaration reports `[none]`.

> **For SignalTree's production TypeScript emit, `getJSDocTags()` is not sufficient
> to predict `stripInternal`.** An orphaned `@internal` block in a declaration's
> leading comment trivia can cause stripping even when the parsed declaration
> reports no `internal` JSDoc tag.

This retroactively explains `DefaultKey`: the earlier in-file fix exported it and
left an orphaned `@internal` above the new docblock, which is why exporting looked
correct and changed nothing.

**THE EARLIER AST SCAN IS INVALIDATED.** It used `getJSDocTags()`, so it measured
attached-JSDoc semantics as a proxy for the emitter's LEXICAL behaviour. Its "3
defects" result understates the true count. Do not patch it with a special case for
`HydrateMode` — replace the measurement.

Two more of my own conclusions were wrong for the recorded reason and are corrected
here: "removing `createFormSignal`'s tag didn't help" (the tag is demonstrably the
cause) and the earlier `isDev` refutation. Both trusted a check never verified
against a fresh artifact. Fourth occurrence of that failure mode this session.

#### The measurement that can CLOSE the declaration chapter

Stop hunting symbols one at a time and stop trying to reimplement TypeScript's rules
for what counts as internal. Run the production declaration emit twice and diff:

```
stripInternal: true   vs   stripInternal: false
        |
        v
anything present ONLY in the `false` output
that is still REFERENCED by the `true` output
        =
broken declaration closure
```

That directly measures the dangerous property and is presentation-agnostic — it
catches ordinary type references, default generic helpers, orphaned comment blocks,
`typeof` value queries, and any fourth syntactic form. A leading-trivia scan is
still useful as a candidate FINDER, never as the oracle.

#### Repairs — deterministic, product intent already frozen

```
createFormSignal   KEEP  -> remove its declaration's own @internal
HydrateMode        KEEP  -> remove the orphaned @internal docblock above it
```

No API redesign, no barrel changes, no `stripInternal` config change. Verify each
INDEPENDENTLY before combining: build exit 0, fresh artifacts, whole-tree
declaration AND reference search, packed declaration, external consumer against the
packed artifact, exact intended public type. For `HydrateMode` prove the emitted
union is exactly `'merge' | 'restore' | 'rehydrate' | 'transfer'` and that the public
hook/event declarations resolve to it. For `createFormSignal` prove the function
SIGNATURE is present, not merely that a re-export mentions the name.

#### FROZEN — do not reopen

```
isDev             KEEP        createFormSignal   KEEP
HydrateMode       KEEP        stripInternal      KEEP ENABLED
re-export chains  NOT causal  barrel widening    NOT a fix
```

The re-export-chain hypothesis was never tested and does not need to be: one
compiler variable explained both cases.

#### Third fixture presentation

Add the orphan presentation to the permanent closure fixture — a regression case for
the bug that defeated source inspection, not a new rule:

```ts
/** @internal */

// banner comment, no declaration in between

/** Public support type. */
export type PublicSupport = 'a' | 'b';
```

Assert the gate detects `PublicSupport` disappearing while a public declaration still
references it. This exercises Rule 0c; it is not a new rule.

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

**SCOPE LIMIT.** The expected result is that `isDev` tagged is stripped, and that
removing only its own `@internal` restores the declaration, root importability, and
a boolean-compatible consumer type. If the table shows that, **the mechanism is
closed — do not investigate declaration tooling further.** Go straight to the
product question, and require POSITIVE evidence for keeping `isDev`, since it is
already deletion-favoured by the utility audit. Only if the table FALSIFIES the
same-mechanism explanation is a fresh-artifact investigation warranted.

**The packed gate is where declaration work ENDS.** Once packed + declared peers +
external consumer + no workspace resolution + `skipLibCheck: false` + `tsc` exit 0
is green, add the two-route regression fixture and return to API reduction. Do not
continue improving the declaration machinery past that point.

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

**GREEN at `629b3b7d`.** Measured, not asserted: fresh `npm pack` of
`dist/packages/core`, installed into a project OUTSIDE the workspace together with
all REQUIRED declared peers (`@angular/core`, `tslib`) — optional `rxjs`
deliberately omitted — no tsconfig path aliases, no
monorepo source resolution, `skipLibCheck: false` — `tsc --noEmit` exits 0 with zero
errors.

The fixture has reach rather than merely importing the package. It exercises every
declaration family that broke during this chapter, and carries three negative
controls that pass only if the shipped types are precise:

| family             | assertion                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `isDev`            | `boolean`; rejects `string`                                                                                                      |
| `HydrateMode`      | all four members accepted; `'nope'` rejected                                                                                     |
| `createFormSignal` | callable at its emitted signature (the value re-export the differential cannot see)                                              |
| `entityMap`        | `DefaultKey` / computed-slice declarations resolve                                                                               |
| `timeTravel`       | `entry.state.count: number`, `.profile.name: string`, rejects `string` — receiver-derived inference surviving the packed `.d.ts` |

One failure during construction was correctly classified as a FIXTURE defect, not a
package defect: the fixture invented an `initial` member on `EntityConfig`. No
package was installed to make `tsc` pass — only declared peers — so an undeclared
dependency could not hide behind the harness.

#### Negative controls — `tools/check-declaration-closure-fixtures.mjs`

The production gate reporting zero is only meaningful if the checker can FAIL when
it should. Three synthetic inputs, one per discovered presentation, each asserting
the full semantic property rather than "the declaration disappeared":

```
production emit succeeds
stripping removes declaration X
a SURVIVING emitted declaration still depends on X
the checker reports X as broken closure
```

| case            | stripped               | still depends on it          | detected |
| --------------- | ---------------------- | ---------------------------- | -------- |
| A type-space    | `FixtureInternalType`  | `FixturePublicType`          | yes      |
| B value-space   | `fixtureInternalFn`    | `fixturePublicFn` (`typeof`) | yes      |
| C orphan trivia | `FixtureOrphanSupport` | `FixtureOrphanConsumer`      | yes      |

Stripping an implementation-only declaration is CORRECT. The defect is a removed
declaration plus a surviving shipped dependency, which is why each case asserts all
three conditions.

Fixture names are deliberately distinctive so the checker's bare-identifier keying
cannot collide with a real declaration and mask a result — testing the checker that
exists rather than presupposing the module-qualified rewrite. The marker token
appears in each fixture ONCE, in the position under test, and nowhere else: prose
mentioning it re-arms the behaviour.

### GATE B DECLARATION CLOSURE — GREEN. Investigation CLOSED.

Reopen only on a packed-consumer counterexample. No module-qualified rewrite, no
export-specifier enhancement, no further `stripInternal` archaeology. The two
documented checker approximations stay until an actual falsifier demands otherwise;
the packed external consumer is the stronger oracle.

HISTORICAL: `56572c5d` proved the entity-map instance is gone. It did not prove
the packed consumer gate passes: the temp consumer had no `node_modules`, so
`@angular/core` was unresolved (fixture defect), and the `isDev` instance was a real
package defect — both since resolved.

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
| Public type contracts | what do those names mean to TypeScript?   | not yet systematic — targeted contract tests are sufficient for 1.0. `SignalTree<T>` is now covered by `signal-tree-type-matrix.typing.spec.ts` (`9f0d1464`) |
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

1. ~~Delete `SignalTreeBase`.~~ **DONE** — characterized `9f0d1464`, deleted
   `6a515699`. See "Slice 1 — `SignalTreeBase`" below.
2. ~~Delete `composeEnhancers`.~~ **DONE** — characterized `2f46115b`, deleted
   `6c3d73a8`, equivalence claim refuted and corrected `d09525d6`, migration
   `2ae531c1`. See "Slice 2" below.
3. ~~Migrate remaining built-ins to `Enhancer<Methods>`, one at a time.~~ **DONE** — all six migrated, one per commit: `batching` `cc7ad43f`, `timeTravel` `cfbd4985`, `devTools` `a0ebaf3f`, `serialization` `7850acf8`, `persistence` `37e59e1c`, `transactions` `5fa0053e`. Protocol prerequisites first: capability authority `681ffb8e`, continuity across identity replacement `7a6bd4c9`. <- item #4 is NEXT
   **Also owns the `requires` namespace defect** found in slice 2 (below), and
   the transitional tests in `planned-enhancer-dependencies.spec.ts` that record
   it. Those tests are NOT a compatibility contract — changing the behaviour
   means updating them, not restoring the bug.
4. Remove the realization-facing `.with()` overload; add heterogeneous variadic
   `.with(...enhancers)` with runtime order-equivalence tests and an
   identity-replacing enhancer case.
   **ITS RECORDED JUSTIFICATION NO LONGER HOLDS.** The overload's docblock said
   it exists because "core's built-ins are declared `<T>(tree: ISignalTree<T>)
   => ISignalTree<T> & Methods`". After item #3 that is FALSE — all six are
   `Enhancer<Methods>`. Core no longer justifies it. That is NOT proof it is
   unused: `guardrails`, `realtime`, `schema` and `ng-forms` still declare
   enhancers against `ISignalTree`, and THAT is what must be measured before
   deleting. The stale premise is corrected in `types.ts` so the next reader
   does not treat it as current evidence either way.

   **Also delete the three built-in `.with()` overrides** (`batching.ts:355`,
   `time-travel.ts:2820`, `devtools-impl.ts:1733`). `7a6bd4c9` made the
   canonical `with` overwrite them on adoption. `batching`'s and `timeTravel`'s
   are then dead machinery; `devTools`' is NOT — see the correction below —
   but under Rule 0e the canonical path should be the SOLE owner, not merely the
   winner. Do not keep them because the fix tolerates them.
5. Realistic `SignalTree` vs `ISignalTree` matrix (state containing nested
   object + `entityMap` + marker + primitive leaf, with negative controls).
   **The annotation/constructor alignment half is DONE** (`243dd5fb`,
   `215568cb`) — the constructor's return now satisfies `SignalTree<T>`
   positively. What remains is internalizing `ISignalTree` **BEHIND**
   `SignalTree<T>` — `SignalTree<T>` is the public name and it stays; only its
   current representation becomes private. EXTEND
   `signal-tree-type-matrix.typing.spec.ts`; do not start a new file.
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

### Slice 1 — `SignalTreeBase` DELETED (`9f0d1464`, `6a515699`)

Rationale is ontological, not aesthetic: the name asserted a base/derived
relationship with `SignalTree<T>` that never existed. Both aliases expanded to
`ISignalTree<T> & TreeNode<T>`, so "base" was a synonym wearing a taxonomy.

```
PROPERTY   SignalTreeBase has no independent supported semantic contract.
FALSIFIER  a consumer or API contract where replacing SignalTreeBase with
           SignalTree changes expressible type semantics, inference,
           assignability, or public capability.
RESULT     no counterexample -> deleted
```

The falsifier was UNIVERSAL, not sampled: `Equal<SignalTree<T>,
SignalTreeBase<T>>` at a free unresolved `T` is a statement about every
instantiation. It was proven able to fire before it was trusted — mutating the
alias to `ISignalTree<T>` turned the universal row and all five sampled rows
red, and mutating it to `ISignalTree<unknown> & TreeNode<T>` additionally turned
the member-level `bind` row red. `registerCleanup` cannot distinguish either
mutation because its member type does not mention `T`; recorded rather than
papered over.

**`packages/core/src/lib/signal-tree-type-matrix.typing.spec.ts` is permanent
and is the third GATE B dimension for the one type consumers annotate with.**
It closes the recorded `api-inventory` blind spot for `SignalTree<T>`
specifically: the inventory compares symbol sets and metadata, so it cannot see
a type-shape change to a symbol that keeps its name. Dimensions pinned: root
object tree, primitive root, nested access, markers, `entityMap`, enhancer
accumulation, `bind`/`destroy`/`registerCleanup`, negative controls. Rows are
invariant identity, not assignability — assignability passes on a widened type.
Section 0 pins that the `Equal` helper is not vacuous.

Rule 0d is pinned there deliberately: the three branch call forms, structural
navigability at depth, and `branch is not a signal` are exactly what a type
cleanup erodes while every runtime test stays green.

Two things learned that outlive the slice:

- **`state` is NOT on `SignalTree<T>`.** It is a `SignalTreeBuilder` member, so
  it exists on what `signalTree()` returns but not on the type consumers
  annotate with. The first draft of the matrix asserted it; `tsc` refuted it.
  Now a negative control.
- **`api-inventory --check` output does not prove the absence of metadata
  drift.** It prints symbol-set changes and then reports "SURFACE CHANGED",
  staying silent about metadata drift on RETAINED symbols even though such
  drift also fails the comparison. Confirming an intended delta therefore means
  regenerating the baseline and diffing the JSON, not reading `--check`. Done
  here: exactly the nine-line `SignalTreeBase` block, core 207 -> 206, every
  other package byte-identical.

Ladder at `6a515699`: tsc typecheck green; `nx build core` exit 0 with fresh
artifacts (`SignalTree` declared in the emitted `types.d.ts`, `SignalTreeBase`
absent from the whole `dist` tree); vitest 1715 passed / 20 skipped / 1 todo;
`nx lint core` green; `check-declaration-closure` stripped-but-referenced=0;
closure fixtures 3/3; `nx run-many -t build --all` with only the documented
`demo:build:production` noise.

#### Matrix corrected at `cd49e9a0` — and it found a live defect

Review of `9f0d1464` caught the matrix doing three things a PERMANENT gate must
not do. All three are fixed; the deletion at `6a515699` is unaffected and
stands.

| defect | why it was wrong |
| --- | --- |
| froze `SignalTree<T> === ISignalTree<T> & TreeNode<T>` | freezes a decomposition queue item 7 schedules for DELETION; the file would contradict the plan and have to be edited by the slice doing the work |
| `declare const primitiveTree: SignalTree<number>` | measured that an ANNOTATION is expressible and called it a product contract. The constructor is `T extends object`. Rule 0 category error, and it committed the release to a capability nobody chose |
| every row used `declare const … : SignalTree<T>` | proved only "given a value already typed `SignalTree<T>`, these semantics follow" — never that a consumer calling `signalTree()` gets them |

The rule this establishes for every future contract matrix:

> Assert what a consumer can DO. Never assert the implementation decomposition,
> and never assert a capability merely because the type system can express it.

**LIVE DEFECT found the moment the constructor path was measured.** The
canonical annotation does not accept the documented constructor:

```ts
const tree: SignalTree<MyState> = signalTree({ ... }); // does NOT compile
```

There are **TWO independent mismatches**, and the second is invisible until the
first is neutralized. This was nearly recorded as "`bind()` is the ONLY
incompatibility" on the strength of one elaborated error — a proxy for a
property it does not measure, since **TypeScript stops at the first decisive
member incompatibility**. The one-variable experiment refuted it.

| # | mismatch | which side is wrong |
| --- | --- | --- |
| 1 | builder `bind()` -> `(value?: S) => S \| void`; `ISignalTree.bind()` -> `NodeAccessor<S>` | the **declaration**. Runtime copies the base tree's `bind` verbatim (`signal-tree.ts:1802`) and it returns `NodeAccessor<T>` (`signal-tree.ts:1365`) |
| 2 | `SignalTree<T>` = `ISignalTree<T> & TreeNode<T>` requires the STATE KEYS on the tree object; the builder does not declare them | the **annotation**. The runtime root has no state keys at all |

Mismatch 2 is the serious one and it inverts the first diagnosis. Executed
runtime probe on `signalTree({ count, tags, user })`:

```
Object.keys(tree)   []
tree.count          undefined
Object.keys(tree.$) [ 'count', 'tags', 'user' ]
```

Meanwhile `declare const t: SignalTree<S>; t.count` typechecks green as
`CallableWritableSignal<number>`. **The canonical public tree type promises a
root-level state surface that does not exist at runtime.** `types.ts` still
explains the `& TreeNode<T>` as "properties copied to the root callable ...
legacy consumers rely on this"; that copying does not happen for state keys —
the only copy loop in `signal-tree.ts:1762` copies ENHANCER result keys.

So `SignalTreeBuilder` is HONEST and `SignalTree<T>` OVER-PROMISES. Making the
builder satisfy the annotation as written would mean inventing a root surface
the design deliberately puts behind `$`. Mismatch 1 alone is the drift class
`internals/builder-types.ts` documents for `destroyed`, `registerCleanup` and
`updateAndReport` — each runtime-present but type-missing, each repaired
separately, each caught by an accident rather than a gate. Matrix section B6 is
now that gate. `name` is absent from the missing-property list only because a
function already has `Function.prototype.name`.

Corroborating, and it may matter more than either defect: **nothing in this repo
or its docs annotates with `SignalTree<T>`.** Every call site infers from
`signalTree()`; the only `: SignalTree<` outside the matrix is one RFC
signature. A "canonical public tree type" that no code uses, that rejects the
constructor's return, and that describes a runtime shape which does not exist is
a candidate for being the wrong abstraction rather than a broken one.

#### DECIDED and CLOSED — `243dd5fb`, `215568cb`

**Decision: keep `SignalTree<T>` as the sole canonical consumer type, remove the
false root surface, align builder `bind` separately, prove constructor
assignability positively.**

Landed as two commits, one variable each, in that order:

| commit | one variable | proven result |
| --- | --- | --- |
| `243dd5fb` | `SignalTree<T>` -> `ISignalTree<T>` | assignment still RED; sole remaining blocker is now exactly `bind(...)(...)` returning `void \| RootState`, verified by reading the elaborated error |
| `215568cb` | `SignalTreeBuilder.bind` -> `NodeAccessor<TSource>` | assignment GREEN, no `@ts-expect-error` |

Endpoint now asserted positively in matrix section C:

```
runtime grammar      tree.$
public annotation    tree.$
constructor return   satisfies the public annotation
bind runtime/type    aligned
```

**Rejected — root property copying.** Adding state keys to the runtime root
would create `tree.count()` alongside `tree.$.count()`: two ways to address one
node, the duplicate grammar this API deliberately does not have. It also
contradicts the `$`-centric design every call site already uses.

**Rejected — deleting `SignalTree<T>`.** That it is barely annotated in-repo is
weak evidence: local code relies on inference, while a public library still
needs a nameable type for `function inspect(tree: SignalTree<AppState>)` and
`interface Store { tree: SignalTree<AppState> }`. Deleting it would leave
consumers choosing among `SignalTreeBuilder`, `ISignalTree`, or
`ReturnType<typeof signalTree>` — the opposite of one obvious path per concept.

Settled ontology:

```
SignalTree<T>          public semantic tree contract   <- the name that survives
SignalTreeBuilder<…>   construction / inference machinery
ISignalTree<T>         implementation vocabulary, queued for internalization
TreeNode<T>            the shape behind tree.$
NodeAccessor<T>        semantic branch/root callable
```

`SignalTree<T> = ISignalTree<T>` is the correct CURRENT REPRESENTATION, not the
final algebra. The docblock says so explicitly, because item 7 internalizes
`ISignalTree` BEHIND `SignalTree` — `SignalTree` is not the thing that
disappears.

**Wording that must not be collapsed.** The two mismatches pointed in OPPOSITE
directions and the loose phrase "the builder is honest" was wrong as a general
statement:

```
root-state mismatch   SignalTree<T>          OVER-promised
bind mismatch         SignalTreeBuilder      UNDER-promised
```

**FROZEN — state is addressed through `$`, and only through `$`.** Matrix
section A1 now holds `@ts-expect-error` rows for `tree.count` / `tree.user`
beside green `tree.$.count()` / `tree.$.user()`, so the root surface cannot
return by a re-added `& TreeNode<T>`, by runtime property copying, or by any
other route.

**What no other gate could have caught.** `api-inventory --check` was CLEAN
across both commits — the symbol set never changed, and it structurally cannot
see a type-shape change. A public type was describing a different API grammar
from the runtime and typechecking access to properties that do not exist. This
is the case for the type-contract dimension existing at all.

#### Newly discovered — not this slice

- **The `6e7bf16a` "Measured public surface" table above is stale.** It records
  core 209 / `ng-forms` 34 / internal-decl 17; the tracked baseline before this
  slice was core 207 / `ng-forms` 29 / internal-decl 19. The table is labelled
  with its commit and is left as the historical measurement it is — but do not
  cite those numbers as current. `tools/api-baseline.json` is the live figure.
- **`nx test core` swallows the vitest reporter output.** A failing run prints
  only "Running target test for project core failed" with no test name, at any
  `--output-style` and with `--verbose`. During this slice the nx-mediated suite
  alternated fail / pass / fail and Nx itself flagged the task as flaky, while
  three consecutive direct runs were green at the ledger's exact counts. So the
  known timing flakiness is confirmed, but it is currently UNDIAGNOSABLE through
  the documented command. `npx vitest run` from `packages/core` reports
  normally — the `ngModule null` failure applies to running from the repo ROOT,
  not from the package directory. This belongs with the Phase 5 flaky-spec item:
  a release gate that cannot say which test failed is not a usable gate.

### Slice 2 — `composeEnhancers` DELETED (`2f46115b`, `6c3d73a8`, `d09525d6`)

**DECISION, final.** `composeEnhancers` DELETE confirmed. It is an opaque
alternate composition grammar, not a runtime-equivalent helper. Consumer
characterization showed single-enhancer application is type-invalid;
multi-enhancer application loses accumulated additions; composed child enhancers
bypass canonical metadata/dependency validation and differ from chained
`.with()` for identity-replacing enhancers. Canonical replacement is ordered
`.with(a).with(b)`. Variadic `.with(...)` remains a separate later decision and
was NOT coupled to this.

Migration: `docs/guides/migration-v14-v15.md` (`2ae531c1`).

```
P1 REACHABILITY   declared lib/utils.ts; exported ONLY from ./authoring
                  (left the root barrel in v12). Zero internal consumers, zero
                  tests, zero package-to-package consumers, zero demo use.
                  Taught in ENHANCERS.md, skills reference, generated llms/SKILL.

P2 CAPABILITY     NOT equivalent. See the correction below.

P3 TYPE           broken in BOTH arities, DIFFERENTLY:
                    composeEnhancers(A)     cannot be applied at all — `T`
                                            infers from the RETURN and is then
                                            demanded as input, so the enhancer
                                            requires the additions it exists to
                                            add
                    composeEnhancers(A, B)  applies, silently erases every
                                            addition
                  Not "erasure in both". The distinction was a real finding.
```

**The taught example never compiled.** `ENHANCERS.md` imported `composeEnhancers`
from `@signaltree/core`, where it had not existed since v12, and passed enhancer
FACTORIES where enhancers are required (TS2345 + TS2769 when reproduced
verbatim). The adjacent "recommended" example was also wrong — it used a
variadic `.with()` that does not exist. Both replaced with a form that was
compiled before being written down.

#### CORRECTION — I claimed runtime equivalence and it was refuted (`d09525d6`)

`2f46115b`/`6c3d73a8` stated P2 as "no unique runtime capability" on evidence
covering only ordinary `signalTree()` with mutating enhancers. Two falsifiers on
the uncovered protocol boundaries both fired. History was NOT rewritten; the
wrong claim stays and `d09525d6` is the correction.

```
P2a  plannedSignalTree dependency validation
     separate  .with(late).with(early).build()
               THREW "late requires base to be applied first", log ["early"]
               -> fail-CLOSED, `late` never ran
     composed  .with(composeEnhancers(late, early)).build()
               ok, log ["late","early"]
               -> fail-OPEN, ran with its requirement unmet

P2b  identity-replacing enhancer
     chained   2nd enhancer observed {symbol: null, prop: null}; final: neither
     composed  2nd enhancer observed {symbol: set, prop: true}; final: both
```

The guard lives INSIDE `.with()` and runs before the enhancer is invoked. A
composed fold calls its children directly, so they never reach it — no duplicate
detection, no dependency validation, no ordering, no capability collection. The
metadata-hiding was also an accidental escape hatch for forcing raw source order;
removed deliberately, since an undocumented way to defeat a fail-closed check is
not a feature and nothing used it.

**THE LESSON, and it was paid for twice in this chapter:**

> A green representative example does not prove equivalence of two API paths.
> Test the protocol boundaries where their implementations differ.

The first instance was `SignalTree<T>` (Section A and Section B both green while
they disagreed — fixed by a positive JOIN assertion). The second is this one.

NOT MEASURED, and not an open prerequisite: whether composing also hid child
CAPABILITIES from `buildTreePlan`. The probe could not observe the build plan.
Reopen only if a concrete item-#3 decision depends on it.

#### ROUTED FORWARD — enhancer metadata defect, item #3 owns it

`requires` currently resolves against two different namespaces:

```
resolveEnhancerOrder   edge only when `a.provides.has(req)`   -> CAPABILITY
.with() guard          `appliedEnhancers.has(req)`            -> NAME
```

so a requirement is satisfiable only when an enhancer is BOTH named `x` AND
declares `provides: ['x']`. Measured across all four spellings:

| `requires` | provider `name` | provider `provides` | result |
| --- | --- | --- | --- |
| `base` | `provider` | `['base']` | THROWS |
| `provider` | `provider` | `['base']` | THROWS |
| `provider` | `provider` | `['provider']` | OK, reordered |
| `base` | `base` | `['base']` | OK, reordered |

Both natural spellings fail. Characterized in
`packages/core/src/lib/planned-enhancer-dependencies.spec.ts` as **CURRENT
BEHAVIOUR, NOT FROZEN SEMANTICS** — the file carries a DO-NOT-FREEZE banner
saying that if those rows go red because the namespace was made coherent, the
TESTS get updated, not the implementation. That file also pins the durable
guarantee worth keeping: dependency validation is fail-closed.

### Item #3 opening measurement — `requires` has no coherent semantic owner

Item #3 starts here, NOT with `batching`. The metadata inconsistency sits
underneath the protocol the built-ins participate in, so the contract has to be
settled before nine signatures are migrated to target it.

**PROPERTY: what does `requires: ['x']` semantically name?**

```
A  enhancer identity / name
B  provided capability
C  something else explicitly modelled
```

Measured against docs, metadata types, built-ins, the ordering implementation,
the validation guard, and the third-party authoring contract — NOT inferred from
the field names.

#### The concepts, separated

| field | type | consumed by | means |
| --- | --- | --- | --- |
| `name` | `string` | `.with()` duplicate detection, `.with()` dependency guard | identity |
| `provides` | `string[]` | `resolveEnhancerOrder` edges | capability token |
| `requires` | `string[]` | `resolveEnhancerOrder` (as CAPABILITY), `.with()` guard (as NAME) | **two authorities, disagreeing** |
| `capabilities` | `TreeCapability[]` | `buildTreePlan` -> `collectRequestedTreeCapabilities` | tree SUBSTRATE capability — a separate, typed axis; not part of this question |
| `description` | `string` | docs only | — |

#### Evidence — every source says CAPABILITY except the guard

```
docs/guides/custom-enhancers.md:22-24
    provides: ['myEnhancer'],   // "Capabilities this enhancer adds"
    requires: ['serialization'] // "Capabilities that must be applied first"

docs/guides/custom-markers-enhancers.md:770-773   <- the decisive one
    { name: 'withAudit', provides: ['audit'], requires: ['logger'] }
    name != provides, and the comment reads
    "Requires withLogger to be applied first"

packages/core/src/enhancers/index.ts:20-22  (createEnhancer JSDoc)
    { name: 'myEnhancer', provides: ['feature1'], requires: ['feature2'] }
    name != provides
```

**Two of those three documented examples CANNOT WORK TODAY** — same class as the
`composeEnhancers` example slice 2 found. `withAudit` requires `'logger'`, which
under the guard needs an applied enhancer NAMED `logger`; the enhancer that
provides it is named `withLogger`. It throws.

**Proven on a REAL built-in, not a fixture.** `persistence` declares
`{ name: 'persistence', provides: ['persistence', 'serialization'] }` — a
capability it does not own as a name. Applying it and then an enhancer declaring
`requires: ['serialization']`:

```
plannedSignalTree({count:0}).with(persistence({key})).with(consumer).build()
  -> THREW: Enhancer "consumer" requires "serialization" to be applied first
```

The capability a shipping enhancer advertises is not honoured. `provides` is
consulted for ORDERING and ignored for VALIDATION.

**Why every built-in hides the defect:** all of them declare `name ===
provides[0]` (`batching`/`['batching']`, `devTools`/`['devTools']`,
`transactions`/`['transactions']`, `serialization`/`['serialization']`,
`timeTravel`/`['timeTravel']`). The accidental intersection is satisfied, so
nothing in-repo fails. `persistence` is the one built-in that declares a second
capability, and that second capability is exactly what does not work.

Historical note, not a proposal: `docs/archive/UPGRADE_TO_V6.md` used `provides`
for METHOD names (`['undo','redo','canUndo',…]`). The vocabulary drifted from
"methods added" to "capability token" without the guard following.

#### Backward-compatibility fact that constrains the decision

Today a requirement is satisfiable only when `provider.name === req` AND
`provider.provides` includes `req`. So today's working set is a SUBSET of both
candidate semantics — **A and B are each strictly backward compatible for
everything that currently works.** Nothing in-repo breaks under either. The
choice is therefore about which contract is correct, not about migration risk.

#### DECISION REQUIRED — see the session report

Recommendation is **B (capability)**, with `name` retained as identity for
duplicate detection only. Under A, `provides` loses its only consumer and
becomes vestigial, and all three documented authoring examples stay wrong.

Do NOT keep the current intersection. "Satisfiable only when the provider is
both NAMED x and PROVIDES x" has no coherent semantic owner and forces authors
into a redundant spelling to make dependencies work at all.

`planned-enhancer-dependencies.spec.ts` records the current behaviour and is
banner-marked DO NOT FREEZE; its two DEFECT rows are EXPECTED to go red when this
is resolved.

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

## 14.x DISPOSITION LEDGER (Rule 0f)

**Two axes, not one label.** A finding can be both a defect 14.x users are
living with AND a surface 15.0 removes; collapsing those understates the first.

```
14.x ACTION   PATCH CODE | PATCH DOCS / KNOWN ISSUE | NEEDS CONSUMER PROOF | NO ACTION
15.0 DISP.    INHERIT PATCH | BREAKING CORRECTION | ARCHITECTURAL CUTOFF | TOOLING DEBT
```

**Every first-column claim below was measured AT THE `v14.1.1` TAG**, not
inferred from 15.0-dev HEAD. That distinction is load-bearing: this queue has
twice produced a wrong conclusion by characterizing HEAD and reasoning backward
about an older release. Method: `git show v14.1.1:<path>` and compare the
decisive lines.

| Finding | Verified at `v14.1.1` | 14.x action | 15.0 disposition |
| --- | --- | --- | --- |
| `requires` resolved against NAMES while the sorter matches `provides` | guard `appliedEnhancers.has(dep)`; sorter `a.provides.has(req)` (`enhancers/index.ts:91`) — the disagreement is real at 14.1.1 | **PATCH CODE** | inherit (`681ffb8e`) |
| enhancer marked applied BEFORE it succeeds | `appliedEnhancers.add(meta.name)` precedes `return enhancer(tree)` | **PATCH CODE** | inherit |
| anonymous enhancer's `requires` silently ignored | whole block gated on `if (meta?.name)` | **PATCH CODE** | inherit |
| `ENHANCERS.md` composition example cannot compile | imports `composeEnhancers` from `@signaltree/core`, where `index.ts:303` carries only a REMOVAL COMMENT ("removed from the root barrel in v12"); also passes enhancer FACTORIES | **PATCH DOCS** | corrected docs continue |
| `withAudit` guide example cannot work | `{ name: 'withAudit', provides: ['audit'], requires: ['logger'] }` — `name !== provides`, unsatisfiable under the name-based guard | **PATCH DOCS** | ditto |
| `createEnhancer` JSDoc example cannot work | `provides: ['feature1'], requires: ['feature2']` — same shape | **PATCH DOCS** | ditto |
| builder `bind()` under-promise | `bind(thisArg?: unknown): (value?: TSource) => TSource \| void` (`builder-types.ts:70`) | **NEEDS CONSUMER PROOF** — see below | corrected (`215568cb`); SURVIVAL is a separate question, item 9 |
| false `SignalTree<T>` root-state surface | `export type SignalTree<T> = ISignalTree<T> & TreeNode<T>` (`types.ts:1297`) | **PATCH DOCS / KNOWN ISSUE** — do not silently make a breaking type correction on 14.x | **BREAKING CORRECTION** (`243dd5fb`) |
| `composeEnhancers` broken types + bypass semantics | implementation byte-identical (`utils.ts:377`) | **PATCH DOCS / DEPRECATION** — see the warning below | **ARCHITECTURAL CUTOFF** (`6c3d73a8`) |
| `SignalTreeBase` | present (`types.ts:1298`); no defect | **NO ACTION** | **ARCHITECTURAL CUTOFF** (`6a515699`) |
| **identity-replacing enhancers silently disable the enhancer protocol** | `Object.defineProperty(enhancedTree, 'with', …)` in `batching.ts`, `time-travel.ts`, `devtools-impl.ts` — independently present in all three at the tag; the replacement `with` only type-checks its argument and calls `enhancer(enhancedTree)` | **PATCH CODE** | **BLOCKS #3b** — see below |
| stale generated API-surface docs | **NOT MEASURED at 14.1.1** — the staleness found was relative to HEAD source | **UNCLASSIFIED** | 15.0 cleanup (`7772effa`) |
| `nx test core` unreliable + swallows the reporter; `api-inventory` member/shape blind spot | tooling, not a consumer contract | **NO ACTION** | **TOOLING DEBT** — Phase 5 |

### BLOCKER for #3b — the enhancer protocol does not survive its own built-ins

Found while characterizing `batching` for #3b, before touching its signature.
**All three identity-replacing built-ins redefine `.with()` on their replacement
tree, and the redefinition carries no metadata guard at all.** Measured:

```
                              unsatisfied requirement    duplicate name
plain tree                    THROWS                     THROWS
after .with(batching())       no throw                   no throw
```

`batching.ts:355`, `time-travel.ts:2820`, `devtools-impl.ts:1733` — each
installs a `with` that validates only `typeof enhancer === 'function'` and then
calls `enhancer(enhancedTree)` directly. No duplicate detection, no dependency
validation, no capability publication.

This is the SAME defect class as `composeEnhancers` — a fail-closed check
bypassed by an alternate application path — and it **defeats the `681ffb8e`
repair in exactly the configurations most real apps use**, since batching,
devTools and timeTravel are the common enhancers. The protocol is disabled for
the remainder of the chain from the moment any of them is applied.

**Why this is not a #3b sub-task.** MEASURED: the bookkeeping
(`appliedEnhancerNames`, `providedEnhancerCapabilities`) is per-tree closure
state inside `create()`, and a replacement tree is a new object that does not
reach it. Also measured: the original `with` invokes `enhancer(tree)` against the
ORIGINAL receiver, so naive delegation would hand the enhancer the
pre-replacement tree.

HYPOTHESIS, NOT YET PROVEN — that the fix requires factoring the guard into a
reusable "apply against THIS receiver" operation sharing one tree's bookkeeping.
That is a candidate implementation shape, not a derived requirement. The
SEMANTIC requirement is proven; the implementation must be selected from the
falsifier matrix below, not assumed.

#### Falsifier matrix — run BEFORE choosing an implementation

Two independent properties, and an implementation can satisfy one while failing
the other:

```
1. protocol bookkeeping follows the semantic tree lineage across replacement
2. enhancer invocation uses the CURRENT realization, not the original receiver
```

```
A  provides[cap] -> REPLACE -> requires[cap]          must PASS
B  REPLACE -> provides[cap] -> requires[cap]          must PASS
C  REPLACE -> requires[missing]                       must FAIL before it runs
D  REPLACE -> A -> A                                  duplicate must FAIL
E  REPLACE -> throwing provides[cap] -> requires[cap] contributes NEITHER
F  REPLACE -> B                                       B receives CURRENT tree
G  provider -> batching -> timeTravel -> requires[provider cap]
                                                      survives MULTIPLE handoffs
```

G matters because a fix that repairs only the first replacement would pass A-F.

**Recommended sequencing — do NOT fold this into #3b.** It is a shared-protocol
defect, not a per-enhancer one, and #3b must not absorb fixes to other built-ins.
Treat it as `#3a-2`, the same shape as `#3a`: repair the protocol first, then
migrate built-ins onto a protocol that is actually coherent. Migrating
`batching`'s signature while its runtime silently drops the protocol would type a
contract the implementation does not honour.

DECISION REQUIRED before proceeding — see the session report.

### Do NOT "repair" `composeEnhancers` runtime semantics in a 14.x patch

Making it traverse the canonical `.with()` boundary instead of invoking children
directly would change ordering, dependency-validation outcomes, duplicate
detection and identity-replacement behaviour. That is a semver-BREAKING change
wearing a bug-fix costume. A documentation/deprecation patch discharges the 14.x
maintenance obligation; deletion stays the 15.0 answer.

### Required postcondition for the enhancer-bookkeeping patch

```
validate prerequisites -> invoke enhancer -> enhancer SUCCEEDS -> publish
                                                                  identity +
                                                                  capabilities
```

A throwing enhancer must contribute NEITHER identity NOR capabilities.

### `bind()` — NEEDS CONSUMER PROOF, and the question is bigger than the type

Do not classify this as a 14.x type defect yet. Repairing the declaration of a
surface 15.0 may delete would MANUFACTURE a 14.x contract rather than honour
one. Sequence:

```
Is bind() an independently supported 14.x CONSUMER contract?
  NO  -> internalize/delete question; do not "fix" its declaration on 14.x
  YES -> characterize the real public semantics, THEN ask whether the
         declaration is defective and patchable
```

An apparently more accurate declaration can still be breaking under TypeScript
assignability, so a real 14.x consumer matrix is required either way.

**Measured, and it is why this is not routine cleanup.** Every meaningful use is
one pattern — capture the original callable, then replace tree identity —
at `batching.ts:305`, `devtools-impl.ts:1670`, `time-travel.ts:2134`, and taught
at `custom-markers-enhancers.md:800`. Two of those three CAST AROUND the declared
type (`as unknown as { bind: (t: unknown) => … }`), so the declaration was not
functioning as a contract for the code that needed it. And `bind` is the NAMED
cause of the variance failure that forced the fixed `EnhancerHost`
(`types.ts:1476`): `NodeAccessor<T>` has input positions, so `ISignalTree<Model>`
is not assignable to a host declaring `bind(): NodeAccessor<unknown>`.

So it intersects the callable-tree ontology AND the neutral enhancer boundary —
do not bury it beside `deepEqual`. The audit property for item 9:

> Does SignalTree semantically own a public "bound callable accessor" concept,
> or is `bind()` merely the mechanism enhancer realizations use to preserve the
> pre-wrapper invocation path?

Falsifier for deletion: a supported consumer behaviour that requires
`tree.bind(...)`, cannot be expressed through the canonical tree/authoring
contracts without loss, and is not merely machinery for wrapping the callable.

**NOT PROVEN, do not repeat as fact:** that a closure `(...args) => tree(...args)`
is semantically equivalent to `bind()`. That was asserted in session and
retracted — it needs a real falsifier over read/update call forms, mutation
context and metadata, identity-replacement behaviour, `this` semantics, and the
wrapper's property/prototype copying.

### Branch mechanics are execution, not classification

A live 14.x maintenance branch is NOT required to classify. Prove the defect
against supported 14.x source first; create the branch from the latest supported
14.x state when patch work is actually scheduled.

## Item #4 — DISCOVERY COMPLETE, neither deletion earned yet

Two independent claims, measured separately. Neither is clean, and one of them
corrects a claim I made in `7a6bd4c9`.

### A — delete the realization-facing `.with()` overload: NOT EARNED

Measured by REMOVING the overload from both `ISignalTree` and
`SignalTreeBuilder` and building the workspace. Four public enhancers in three
packages still require it, compiler-proven:

```
ng-forms    formBridge   <T>(tree: ISignalTree<T>) => ISignalTree<T> & AngularFormsMethods
schema      schemas      <T>(tree: ISignalTree<T>) => ISignalTree<T> & SchemaMethods
guardrails  guardrails   <Tree extends ISignalTree<any>>(tree: Tree) => Tree & {…}
```

**`realtime` / `supabaseRealtime` are concrete-tree too but did NOT surface** —
every `.with(...)` call site for them is inside JSDoc, so no compiled consumer
exercised them. That is INFERRED, not proven, and needs its own type-contract
test: "no build caller happened to instantiate it" is not evidence that a public
declaration is safe.

**Measurement lesson worth keeping:** a literal-shape grep is not an exhaustive
public-type falsifier. `guardrails` was missed by searching for
`(tree: ISignalTree<T>) => ISignalTree<T> &` because it expresses the same
semantic dependency through a generic constraint,
`<Tree extends ISignalTree<any>>(tree: Tree) => Tree & …`. The compiler was the
direct measure; the text search was a proxy.

### B — delete the three built-in `.with()` overrides: TRUE FOR TWO, FALSE FOR ONE

```
batching    pure forwarder                      -> vestigial, safe to delete
timeTravel  pure forwarder                      -> vestigial, safe to delete
devTools    forwarder + composition reporting   -> NOT vestigial
```

`devtools-impl.ts`'s override pushes the enhancer name onto a `compositionChain`,
calls `trackComposition(...)`, and sends a `SignalTree/with` action to Redux
DevTools. Found because deleting it made `compositionChain` an unused variable —
lint caught what reading one sibling's body had not.

**CORRECTION to `7a6bd4c9`.** That commit stated "Overwriting the built-ins'
`with` loses nothing — theirs only forwarded." That is true for two of three and
FALSE for `devTools`. The claim came from reading `batching`'s body and
generalizing. History is not rewritten; this entry and the corrected comment in
`signal-tree.ts` are the current authority.

**MEASURED (#4c-1) — `7a6bd4c9` IS A REGRESSION.** The first probe was vacuous:
it captured zero both before and after because it never flushed
`scheduleSend`'s `queueMicrotask` + rate-limit timer. A corrected probe installs
the fake extension on `window` (not `globalThis`), awaits both flush stages, and
carries a CONTROL — an ordinary state write that must produce a send, so another
zero cannot be mistaken for a result:

```
                    connected  total  types                        SignalTree/with
7a6bd4c9~1          true       2      ["", "SignalTree/with"]      1
current HEAD        true       2      ["", "SignalTree/n"]         0
```

The control fires at HEAD (`SignalTree/n` from the state write), so the
connection is live and the zero is real. Composition tracking WORKED before the
canonical-`with` adoption and does not now.

Scope: `7a6bd4c9` is unreleased 15.0-dev, so this is NOT a 14.x defect and needs
no 14.x patch — 14.1.1 never had the adoption. It is a 15.0 regression to fix
before release.

Note the pre-fix run reported 1, not 2, for two `.with()` calls: `scheduleSend`
clobbers a second pending explicit action rather than queueing it. That is
pre-existing rate-limit behaviour, unrelated to the adoption, and is not
something this slice changes.

### Sequencing — Gate B may NOT freeze with the overload still present

Retaining a second `.with()` authoring grammar whose only justification is
"some packages have not migrated yet" is exactly what Rule 0e forbids. The
external migrations are therefore on the Gate B critical path, not deferrable.

```
#4c-1  DONE — regression confirmed, then RESOLVED BY DELETION. Burden of proof
       was on keeping and was not met: 0 docs, 0 tests, absent from
       DevToolsMethods and the api-baseline, reachable only via the `__devTools`
       escape hatch. Deleted rather than rescued with an observation hook.
#4a    migrate the external concrete-tree enhancers, ONE AT A TIME
       guardrails / schema / realtime / ng-forms  (item #3 is CLOSED for core;
       this is not reopening it)
#4b    delete the realization overload — only once every public consumer is neutral
#4c    DONE — devTools composition reporting deleted (`a8fbee3a`), then all
       three overrides deleted; canonical `.with()` is the sole owner
#5     variadic .with(...)
```

If one of the four cannot be represented honestly as `Enhancer<TAdded>` without
degrading inference or semantics, STOP — that is a Gate B architecture decision.
Do not keep the overload merely to avoid answering it.

**Endpoint for devTools — the factual half is now settled; the ownership half is
a DECISION.** The tracking is real and currently broken. Keeping a DevTools-owned `.with()` override would restore two
owners immediately after establishing one. The shape that preserves both
properties is `.with()` owning application and DevTools OBSERVING it through a
hook — not DevTools replacing `.with()` to learn that application happened.

## MUT — the 15.0 mutation participation model (DERIVATION SLICE, no production changes)

**Method rule for this slice, and it is the one that keeps being violated:**

> Derive the contract from the frozen semantic model FIRST. Then determine what
> kernel changes are required to satisfy it. Do NOT let what the kernel happens
> to emit today define what the contract can promise — that turns implementation
> limitations into architecture by accident.

### TWO RETRACTIONS before anything is built on them

**R1 — `PathNotifier` is NOT "the greenfield observation boundary".** It is a
CANDIDATE SUBSTRATE. It has attractive ingredients — `MutationEnvelope` carries
semantic identity, the class imports zero Angular, and `emitOwnedMutation`
already forwards envelopes into it — but the join test is decisive against
promoting it: **ordinary leaf writes produce ZERO events through it**, with or
without `timeTravel()`. Calling it "already exists" would repeat the exact error
this queue keeps making: promoting a discovered implementation into the
architecture before its semantics are shown to match the endpoint.

**R2 — `PathNotifierInterceptor` is NOT a PREPARE contract.** Establishing this
from call ORDER rather than from the shape of its return type:

```
runOwnedMutation:  read before -> apply()  -> read after -> emitOwnedMutation
emitOwnedMutation: ... -> notifier.emitMutation(envelope)
emitMutation:      notify(path, envelope.after, envelope.before, …)
```

`envelope.after` is produced by reading AFTER `apply()`. So interceptors are
consulted once the physical mutation has already happened. `{ block, transform }`
is a SYNTACTIC property; running before any live mutation is the SEMANTIC
property of PREPARE, and this does not have it. It may be old-architecture
vocabulary whose semantics never fit the frozen lifecycle.

### What IS established

```
SCHEMA'S REQUIREMENT (measured from its callback)
  needs      path, next value, metadata (intent/source/suppressGuardrails)
  ignores    previous value (`_prev`)
  semantics  OBSERVE-ONLY, never rejects writes

  -> schema needs NO PREPARE participation. That narrows the problem.
  -> but "post-commit" is not yet precise enough: after PRIVATE COMMIT, after
     PROJECT, or after PUBLISH are no longer interchangeable. To be DERIVED.
```

```
CURRENT REALITY (measured)
  plain leaf at HEAD    no intrinsic emitter, no owned positionIds
  interceptLeafSignals  does not wrap the leaf's `.set` at all
  PathNotifier          zero events for plain leaf writes
  emitOwnedMutation     early-returns when positionIds[0] is undefined

  -> ordinary leaf writes participate in NO observation contract today.
```

```
SUBSTRATE FACTS (candidate ingredients, not endorsements)
  MutationEnvelope      positionId, path, ownerPath, before, after, kind,
                        subjectId, structural, attribution
  PathNotifier          zero Angular imports
  subscribe handler     EIGHT POSITIONAL ARGS — flattens the envelope; kind,
                        structural and attribution structure are lost
  getPathNotifier()     PROCESS-GLOBAL SINGLETON; consumers filter other trees
                        themselves (time-travel does exactly this)
```

### MUT-1 — PARTICIPATION MODEL — **DERIVED PROPOSAL, NOT FROZEN**

Answers ONE question: *at which lifecycle phases may external authoring
participants act, and what authority does each phase permit?* No event types, no
mapping of existing classes — those are MUT-2 and later.

Every line below is labelled. Nothing here is ledger truth until reviewed.

#### FROZEN INPUTS used (quoted from Release Invariants)

```
F1  "SignalTree owns truth."
F2  "Angular owns observation."          <- ANGULAR, not "framework"
F3  "Causal history owns meaning."
F4  "All expected fallible semantic work precedes private commit."
F5  "PRIVATE COMMIT consumes prepared instructions only."
F6  "PROJECT reflects committed truth; it never determines authority."
F7  "Persistence is post-commit."
F8  "no observer, publication adapter, persistence consequence, or other
     external consumer may observe an intermediate heterogeneous state."
F9  "a semantic transaction may span more than one private substrate commit"
F10 durable gate is TREE-LOCAL; "Callers describe a consequence; they do not
     decide when it runs."
F11 `PositionId != SubjectId != SlotIndex != key/path`
```

#### Phase-by-phase

**PREPARE — DERIVED PROPOSAL: yes, a public participation tier.**

```
already true at entry   a semantic change has been PROPOSED; nothing is live
may still fail          everything that can legitimately fail
extension may           observe the proposal; REFUSE it
extension MUST NOT      observe other trees; assume it runs once per physical
                        commit; mutate live state
```

Derivation: F4 puts all fallible semantic work here by definition. If refusal is
a supported capability anywhere, it can only be here — refusing after PRIVATE
COMMIT would contradict F5, which admits only prepared instructions.

**OPEN QUESTION — is refusal a capability we actually want to offer third
parties at all?** No current consumer needs it: schema is observe-only by
design, and guardrails is a diagnostic. A refusal tier with zero legitimate
consumers is speculative surface. COUNTEREXAMPLE NEEDED: a real authoring case
that must prevent a write rather than report on it.

**OPEN QUESTION — transformation/normalization.** Distinct from refusal and much
riskier: a transforming participant becomes a co-author of truth, which strains
F1. Recommend excluding it unless a counterexample forces it.

**PRIVATE COMMIT — DERIVED PROPOSAL: NO external participation.**

Direct from F5. It consumes prepared instructions ONLY. Any extension code here
would be either fallible work that F4 says belongs in PREPARE, or an observer
that F8 forbids from seeing intermediate state.

**POST-COMMIT SEMANTIC OBSERVATION — DERIVED PROPOSAL: yes, a public tier, and
the one most consumers want.**

```
already true at entry   accepted semantic truth exists
may still fail          nothing semantic; an observer's own failure is its own
extension may           observe committed truth WITH causal attribution
extension MUST NOT      alter or reject; assume framework publication happened;
                        assume one notification per physical commit
```

Derivation, and this is the non-obvious part: F8 + F9 together mean this tier
CANNOT be per-physical-commit. A semantic transaction may span several private
commits, and no external consumer may observe an intermediate heterogeneous
state — so the observation unit is the SEMANTIC TRANSACTION, not the physical
write. **DERIVED PROPOSAL: a "committed observer" fires once per settled
semantic unit, never once per substrate commit.**

Also derived from F2: this tier must NOT sit behind publication. Angular owns
observation, so an authoring extension that waited for Angular publication would
inherit a framework dependency it has no business having — and would break in
any non-Angular realization.

**PROJECT — DERIVED PROPOSAL: NOT an extension boundary.**

F6 is decisive: projection "never determines authority". Exposing it publicly
would invite extensions to influence realization, and would leak realization
concerns into a semantic authoring contract. Nothing an extension legitimately
needs is first available at PROJECT.

**PUBLISH — DERIVED PROPOSAL: framework-adapter boundary, NOT general authoring
API.**

Direct from F2. The Angular adapter owns this. Ordinary authoring extensions sit
deliberately BELOW publication, which is also what makes them portable across
realizations. **DERIVED PROPOSAL: publication observation is not part of the
neutral authoring SDK.**

**PERSISTENCE CONSEQUENCE — DERIVED PROPOSAL: a governed mechanism, NOT a
general post-commit effect tier.**

F7, F10 and the durable-gate invariant already give this strong, specific
semantics: consequences are gated on tree-local settled state, and "callers
describe a consequence; they do not decide when it runs." Generalizing this into
"any extension may run arbitrary effects after commit" would discard that
governance. An extension wanting arbitrary post-commit work belongs in the
observation tier and owns its own scheduling.

#### Causal meaning stays ORTHOGONAL

Per F3, physical phase and causal meaning are different axes. The same committed
physical mutation may be authored, derived, speculative, confirmed, or the
realization of a rollback/undo/redo.

**DERIVED PROPOSAL, phase-level only:** causal attribution must be ESTABLISHED at
or before PREPARE (the proposal knows who authored it and why) and PRESERVED
through to the observation tier. What history actually receives is MUT-2, not
this slice.

#### The proposed public model, in full

```
1  PREPARE PARTICIPANT             may refuse         OPEN: wanted at all?
2  COMMITTED SEMANTIC OBSERVER     observe only, transaction-granular,
                                   below publication, causally attributed
—  PRIVATE COMMIT / PROJECT        NOT extension boundaries
—  PUBLISH                         Angular adapter only
—  CONSEQUENCE                     governed mechanism, not an observer tier
```

So the neutral authoring SDK plausibly needs **ONE tier** (2), with (1) offered
only if a real refusal consumer exists.

#### Challenge cases — "can this actor's legitimate responsibility be placed
cleanly?", NOT "where does it run today"

```
schema           tier 2. Observe-only by design, needs attribution for
                 suppression. Placing it in PREPARE would grant authority its
                 requirements do not ask for.                        CLEAN
guardrails       tier 2. Authoring-time diagnostics, reports.        CLEAN
devTools         tier 2 for state; publication timing is Angular's.  CLEAN
persistence      CONSEQUENCE, already governed.                      CLEAN
timeTravel       tier 2 + causal axis. OPEN: does recording need more
                 than an observer can see? MUT-2.              NEEDS MUT-2
transactions     NOT an extension of this model — it DEFINES the semantic
                 unit that tier 2 observes.                          CLEAN
realtime         tier 2 inbound; outbound is an ordinary write.      CLEAN
third party      tier 2.                                             CLEAN
Angular adapter  PUBLISH. The only actor there.                      CLEAN
```

**COUNTEREXAMPLE NEEDED before this proposal can be frozen:**

```
C1  an authoring case that must REFUSE a write, not merely report on it
    (absent this, tier 1 is speculative surface and should not ship)
C2  an authoring case that legitimately needs per-PHYSICAL-commit granularity
    (would contradict the transaction-granular derivation from F8+F9)
C3  an authoring case that must observe PROJECT or PUBLISH
    (would contradict F6/F2 and force reopening those boundaries)
C4  a consumer needing transformation rather than refusal
    (would strain F1 — SignalTree owns truth)
```

### The four questions this slice must answer, in order

```
MUT-1  PHASES     which semantic phases may extension authors participate in?
                  PREPARE / PRIVATE COMMIT / PROJECT / PUBLISH / CONSEQUENCE
MUT-2  ONTOLOGY   what identity, value and attribution exist AT EACH PHASE?
MUT-3  SCOPE      how is observation bound to ONE tree lineage rather than
                  process-global state? A global singleton requiring consumers
                  to filter foreign trees is evidence about current plumbing,
                  not a candidate public contract.
MUT-4  CONSUMERS  map schema, causal history, transactions, time travel,
                  persistence, devtools, realtime and third parties onto those
                  contracts — including which need NONE of them.
```

Only AFTER those: *can `MutationEnvelope` + `PathNotifier` be refactored into
this model?* Plausible outcome — envelope survives largely intact, the notifier
becomes a tree-scoped dispatcher, and the flattened callback, the global
singleton, the post-hoc "interceptors" and `interceptLeafSignals` are all
deleted. Or the derivation produces something else; that is why it comes first.

### Where the leaf-realization root cause belongs

AFTER the contract is stated, not before. The question then becomes the useful
one:

> Why do ordinary leaf writes fail to enter the canonical semantic mutation
> pipeline?

rather than the old-mechanism-centred:

> Why does `interceptLeafSignals` not wrap them?

**Do not repair `interceptLeafSignals`. Do not promote `PathNotifier` to public
architecture. `schemas()` migration remains blocked.**

## SCHEMA REGRESSION — BISECTED AND CHARACTERIZED, repair NOT yet chosen

```
FIRST BAD    d8824b91  feat(history): scaffold causal runtime kernel
PARENT       d8824b91~1
RANGE        v14.1.1 .. 0693f683  (193 commits, 7 bisect steps)
PREDICATE    schema's own Nx test target (`vitest run` in packages/schema),
             not a hand-picked invocation — the runner lesson applies to the
             bisect classifier too. `demo:test` deliberately EXCLUDED from the
             predicate: its 4 failures are the same defect and would only add
             noise. It is a repair confirmation instead.
```

### The observable change — CONFIRMED

`d8824b91` does not touch `@signaltree/schema` at all. It changes
`interceptLeafSignals`, the PUBLIC authoring API schema observes writes through.

```
                       leaf `.set` replaced?   callback paths
d8824b91~1             (not measured)          ["count","user.name"]
current HEAD           NO                      []
```

At HEAD the interceptor does not wrap a plain leaf's `.set` AT ALL — the
identity of `leaf.set` is unchanged after `interceptLeafSignals()` runs. So the
callback is not merely filtered; the wrapping never happens.

### MECHANISM — RETRACTED, still unresolved

This section previously asserted the cause was the new early-return:

```ts
const hasOwnedMutationEmitter = hasIntrinsicMutationEmitter(node);
if (hasOwnedMutationEmitter) return false;
```

**That is REFUTED.** Measured on a plain leaf of a default `signalTree()` at
HEAD:

```
own symbols on the leaf   ["Symbol(SIGNAL)"]     <- Angular's only
intrinsic emitter         false
owned positionIds         null
```

With no intrinsic emitter the skip cannot fire, so it is not what stops the
wrapping. The claim was inferred from reading the diff rather than measured, and
it is corrected here rather than left standing.

Two further measurements, both negative, that narrow the search:

- `getPathNotifier().subscribe('**', …)` receives NOTHING for plain leaf writes,
  with or without `timeTravel()` applied. So the new capture path is not
  silently taking over delivery either — nobody observes those writes.
- `emitOwnedMutation` early-returns when `positionIds?.[0]` is `undefined`, and
  plain leaves have no positionIds. That is consistent with the silence but does
  not explain the missing WRAPPING, which happens earlier and independently.

**The effect is confirmed and reproducible; the mechanism is not yet
established.** It needs a focused root-cause pass — most likely on how leaves
are realized in `createSignalStore`/`materialize-markers` at HEAD versus the
parent, not on `interceptLeafSignals`' own diff.

### Direct consequence — this part stands

Schema's callback never fires, so no verdict is ever applied, which is exactly
the observed failure family: `isValid` stays `true` ("expected true to be
false") and the errors map stays empty ("expected undefined to be 'a-err'").
The bisect result and the consequence are solid; only the mechanism above was
overclaimed.

### Why this is the most consequential finding of the slice

`interceptLeafSignals` is exported from `@signaltree/core/authoring`. It is the
supported way a third-party enhancer observes leaf writes, and the ledger
already flags it as the last genuine SDK symbol dragging Angular. Its contract
was narrowed by an internal kernel change, and the only external consumer in the
repo broke silently for ~150 commits.

### Repair hypotheses — CANDIDATES ONLY, not chosen

```
A  restore the public contract: interceptLeafSignals delivers callbacks for
   owned-emitter nodes too, so an external observer sees every leaf write
B  migrate schema onto the new mutation-capture path, accepting that the
   authoring contract narrowed deliberately
```

A treats the narrowing as an unintended break of a supported API; B treats it as
an intentional redesign that schema simply never followed. **Do NOT revert
`d8824b91`** — this branch carries ~150 commits of intentional 15.0 work built
on that kernel; the commit locates where the invariant was lost, it does not
prescribe the endpoint.

The deciding question is whether `interceptLeafSignals` is still meant to be the
supported leaf-observation contract for third-party authors. That is a Gate B
API decision, not a repair detail.

## VALIDATION LADDER — workspace test rung (added at the schema blocker)

**Building a package is not evidence that its runtime contract passes.** The
ladder ran `nx run-many -t build --all` and tested CORE ONLY, so
`@signaltree/schema` sat 25 tests red through ~150 commits while every gate
reported green — and Gate B reasoning repeatedly leaned on "runtime unchanged".

The rung is added NOW, before schema is repaired. It is expected to be RED until
then. That is the information, not noise.

```
1. targeted slice tests          diagnosis — keep these, they read clearly
2. package-specific tests        the package being changed
3. nx run-many -t test --all     nothing else silently red
4. typecheck / lint / build / API / declaration gates
```

Rungs 1-2 stay: `nx test <project>` swallows the reporter, so targeted runs are
still how a failure gets identified. Rung 3 is what stops another package
sitting red unnoticed.

> **GATE B may not claim repository behavioural health until every package test
> target passes.** Record the baseline BY IDENTITY, as with the demo build —
> if `test --all` exposes further failures, characterize them before attributing
> them to a known cause.

**Ask the project's Nx target which runner it uses.** `vitest run --root` gives
false readings for Jest projects — "no tests" for `ng-forms`, "27 failed" for
`demo`. Both were artifacts.

## BLOCKER FOUND DURING #4a-2 — `@signaltree/schema` is 25 tests RED

Found while capturing the pre-migration runtime baseline for `schemas()`.

```
guardrails   62 passed / 1 skipped
realtime     34 passed
schema       25 FAILED / 15 passed      <-- only red package
ng-forms     Jest, not vitest — `nx test ng-forms` exits 0
events      221 passed
shared       80 passed
```

Nine of ten schema spec files fail: `aggregates`, `ancestor`, `compact`,
`smoke`, `suppress`, `sync-fast-path`, `walker-conformance`, `wildcard`,
`write-sequence`. Real assertion failures ("expected true to be false",
"expected undefined to be 'a-err'"), not infrastructure.

**PRE-EXISTING, and proven so rather than assumed.** Two independent checks:

1. Substituting `signal-tree.ts` from before `681ffb8e` (the capability-authority
   repair) reproduces the identical 25/15 split — so neither `681ffb8e` nor
   `7a6bd4c9` caused it.
2. A worktree at the SESSION-START commit `0693f683` reproduces the identical
   25/15 split.

**WHY NOBODY NOTICED — a real gap in the validation ladder.** The ladder runs
`nx run-many -t build --all`, which BUILDS every package, and `vitest run` for
CORE ONLY. No step runs the other packages' tests. A package can be entirely red
and every gate stays green. `nx run-many -t test --all` belongs in the ladder;
its absence is why 25 failures survived to Gate B.

### 14.x disposition (Rule 0f) — MEASURED: 15.0-dev REGRESSION, no 14.x patch

```
v14.1.1                 10 files / 40 tests   ALL PASSING
branch start 0693f683    9 failed / 1 passed   25 failed / 15 passed
current HEAD             9 failed / 1 passed   25 failed / 15 passed
```

Identical test COUNT at the tag and at HEAD — no specs added or removed, the
same tests now fail. So:

```
14.x ACTION        NO ACTION — v14.1.1 is green, nothing to patch
15.0 DISPOSITION   REGRESSION introduced somewhere in this branch's ~150
                   commits. Must be repaired before Gate B.
```

Ownership is not in question: the 15.0 workstream owns getting HEAD green
regardless of where the defect entered. Rule 0f only decided whether there is an
ADDITIONAL 14.x maintenance obligation, and there is not.

### `demo:test` — 4 failures, SAME defect

`nx run-many -t test --all` also fails `demo:test`. Measured rather than
attributed: 26 suites, 25 passed, 4 tests failed, and ALL FOUR are
`SchemaDemoComponent` — downstream of the schema regression, not an independent
defect.

RUNNER-MISMATCH TRAP, hit twice and worth stating as a rule. `vitest run --root
apps/demo` reports "27 failed" and `--root packages/ng-forms` reports "no
tests"; both are ARTIFACTS — those projects run on Jest. Ask the project's Nx
test target what runner it uses; do not assume one runner across the workspace.

### Workspace test baseline, by identity

```
schema:test   25 failed / 15 passed   the regression
demo:test      4 failed / 177 passed  all SchemaDemoComponent, same defect
core:test     documented flaky timing specs (Phase 5); reads clean via
              `npx vitest run --root packages/core`
```

Everything else green: guardrails 62/1 skipped, realtime 34, events 221,
shared 80, ng-forms `nx test` exit 0.

### Effect on #4a-2 — `schemas()` migration is BLOCKED

Rejected the "identical failure set before and after" shortcut. That discipline
is sound for the demo build because those failures are OUTSIDE the package being
changed. Here it would mean changing `@signaltree/schema` while a quarter of its
own behavioural tests are red — which can show the change made nothing worse,
but cannot show the migrated enhancer preserves the behaviour those tests exist
to cover.

Repair schema and establish a green baseline first. The characterization at
`c1213225` stays frozen and is unaffected.

The `schemas()` CONSUMER CONTRACT characterization is unaffected and green — it
is type-only.

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

      **Also make the failure legible.** `nx test core` reports a failure
      without naming the failing test at any `--output-style`, `--verbose`
      included, so the flakiness above currently cannot be diagnosed through the
      documented command — see "Newly discovered" under slice 1. `npx vitest
      run` from `packages/core` reports normally.
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
