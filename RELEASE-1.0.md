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

0g. **KERNEL-FIRST GREENFIELD DERIVATION. For every capability, derive the
optimal implementation assuming the current 15.0 kernel exists and NO prior
SignalTree API, package, implementation, or compatibility constraint ever
existed. Existing mechanisms are revealed only AFTER the kernel-native design is
stated. A useful legacy capability does NOT justify its legacy abstraction.**

The decision order, and it is not negotiable:

```
1  GREENFIELD FUNCTION   what capability should exist in an ideal SignalTree 15?
2  KERNEL-NATIVE DESIGN  given the kernel we have, how would we build it if no
                         previous API or package had ever existed?
3  OWNERSHIP             kernel / causal / consequence / publication / adapter /
                         application
4  PUBLIC NECESSITY      does an EXTERNAL implementer genuinely need access?
5  MINIMUM SURFACE       if so, the smallest kernel-native primitive
6  COMPARE               only now, look at the existing mechanism
7  MIGRATION COST        ignore for architecture; record afterwards as execution
```

Step 2 is the one that was missing:

> **Given the kernel, would we invent this abstraction today?**

If no, then having users, tests, docs, third-party value, or completed
conversion work is NOT sufficient to keep its current FORM.

**This applies to INTERNAL machinery as much as public API.** A private
mechanism can be legacy-shaped too. Users never seeing it does not make it
harmless if it forces the kernel through the wrong lifecycle or duplicates an
authority.

0i. **SEMANTIC ROLES ARE DISTINCT AND NARROW. Marker, enhancer, adapter,
consequence and causal integration are different semantic roles. A feature must
EARN its role from its greenfield function. "It needs to plug into SignalTree
somehow" is NOT justification for an enhancer or a marker.**

```
                         SignalTree kernel
                               |
        +----------------------+----------------------+
        |                      |                      |
   compilation            capabilities           publication
        |                      |                      |
     MARKERS               ENHANCERS               ADAPTERS
  what state IS         what the tree CAN DO    how outsiders interact
```

Plus two roles the kernel made explicit:

```
CONSEQUENCE   acts BECAUSE surviving committed truth exists, without becoming
              mutation authority
CAUSAL        owns why/how semantic state changed across time
```

**THE CLASSIFIER:**

```
describes WHAT A POSITION IS                        -> MARKER
adds WHAT THE TREE CAN SEMANTICALLY DO              -> ENHANCER
connects SignalTree to an EXTERNAL REPRESENTATION   -> ADAPTER
acts AFTER surviving committed truth                -> CONSEQUENCE
explains WHY/HOW state changed over time            -> CAUSAL AUTHORITY
```

A feature may use several internally; its PUBLIC ABSTRACTION follows its
PRIMARY OWNER.

**AMENDMENT — THESE ROLES ARE NOT AN EXHAUSTIVE ONTOLOGY.** They are mutually
distinguishable WHERE APPLICABLE, not a complete list of SignalTree concepts.
Plenty of things are none of them: compiler functionality, construction syntax,
queries/read models, utilities, policies, services, derived computations,
framework-local helpers.

> **If a function does not naturally fit one of the five, DO NOT MANUFACTURE A
> ROLE FOR IT.**

Otherwise we replace "everything is an enhancer" with "everything must fit our
new five boxes" — the same form-first error with better vocabulary.

**THE ENHANCER TEST, stated sharply:**

> If I apply this, has the SEMANTIC BEHAVIOUR of the SignalTree itself changed?

```
tree.with(transactions()); tree.transaction(...)
   -> the tree ACQUIRED transaction semantics                  ENHANCER holds

tree.with(formBridge()); tree.getAngularForm(...)
   -> the tree owns the same truth, writes, identity, causality as before.
      An Angular object now presents that truth.               ENHANCER FAILS
```

The second is `Enhancer` used as *"a convenient way to attach methods to the
tree"* rather than *"a semantic extension of the tree"*. Rule 0g exists to
eliminate exactly that.

**Before the kernel, making everything an enhancer was defensible — the tree
object was the only integration point. It no longer is.** In 15.0 these are
SEMANTIC CATEGORIES WITH NARROW OWNERSHIP, not generic hooks.

#### CONSEQUENCE FOR COMPLETED WORK — item #3 must be re-audited

Migrating six built-ins to `Enhancer<Methods>` proved the PROTOCOL is neutral
and coherent. Under Rule 0h that says nothing about whether each of those
features should BE an enhancer. Do not conclude *"we built an excellent neutral
enhancer model, therefore schema/realtime/ng-forms must fit it"*. Conclude
*"we built an excellent neutral enhancer model — now determine which functions
are actually enhancers"*.

**PRELIMINARY CLASSIFICATION — every row needs its own 0g derivation; none is a
disposition:**

```
transactions   tree acquires transaction semantics        ENHANCER plausible
timeTravel     temporal/causal capability                 installation form UNPROVEN;
                                                          causal owner already matters
batching       notification timing of realization         UNPROVEN — may be
                                                          publication-side
serialization  DOWNGRADED to UNPROVEN. "tree can serialize itself" assumed the
               conclusion. Apply the test literally: does installing it change
               the tree's SEMANTIC BEHAVIOUR, or merely provide a REPRESENTATION
               of existing truth? `serialize(tree)` as a utility/service may be
               the honest shape rather than `tree.with(serialization())`.
persistence    OWNER FROZEN — governed CONSEQUENCE over surviving committed
               truth, settled in Gate A and NOT reopened here.
               PUBLIC INSTALLATION FORM — should it be installed via an
               Enhancer? UNPROVEN. Rule 0i may reject the installation form
               without touching the semantics.
schema         derived subsystem over truth               UNPROVEN
devTools       external diagnostic projection             ADAPTER hypothesis
guardrails     authoring-time diagnostics                 UNPROVEN
realtime       external synchronization                   UNPROVEN — adapter,
                                                          consequence or other,
                                                          per product function
formBridge     Angular Reactive Forms interop             ADAPTER ownership DERIVED
                                                          (`b4e1ebd5`); enhancer
                                                          form REJECTED; marker
                                                          dependency SEVERED
                                                          (`2937ecbb`)
```

**The persistence row is the pattern to copy:** a FROZEN semantic owner and an
UNPROVEN installation form are different questions. Rule 0i attacks installation
mechanisms without reopening settled semantics.

#### MARKERS GET THE SAME HOSTILITY

`registerMarkerProcessor` existing does not mean feature packages should invent
markers. For each of `entityMap`, `stored`, `status`, `form`, `asyncSource`,
`asyncQuery`, `compared`:

> If the kernel existed first, would this concept genuinely be encoded in the
> DECLARATIVE SEMANTIC STATE DESCRIPTION?

**"Describes what a position is" is NECESSARY BUT NOT SUFFICIENT.** Otherwise
almost any adjective earns a marker — validated, remote, audited, visible,
editable, cached — and we simply move generic extension machinery from enhancers
into markers. A marker must additionally earn CONSTRUCTION-TIME COMPILATION:

```
Does this declare an INTRINSIC SEMANTIC PROPERTY of a position
AND must that property participate in CONSTRUCTION / COMPILATION?
   YES -> marker plausible
   NO  -> marker probably wrong
```

`entityMap` looks strong because structural/entity identity affects how the
graph is COMPILED. Angular forms clearly fails. `form()` is precisely why the
stronger test is needed.

```
entityMap   carries structural/identity meaning            MARKER plausible
stored      encodes durable-storage semantics on a position — check against the
            persistence-CONSEQUENCE architecture before assuming
form        THE INTERESTING ONE — see below
```

**`form` — separate two things that are currently one word.** "This subtree
participates in form/validation SEMANTICS" is not the same as "Angular Reactive
Forms / Signal Forms INTEGRATION". If they separate cleanly, the architecture is:

```
SignalTree semantic form marker
   |-- schema / validation semantics
   |-- Angular Reactive Forms ADAPTER
   +-- Angular Signal Forms ADAPTER
```

rather than Angular forms concerns embedded in SignalTree enhancers. A
HYPOTHESIS to derive — not something to preserve from today's `form()`.

**The contamination test for a marker:** would you accept
`signalTree({ profile: reactiveFormBridge(...) })`? No — that puts Angular
presentation concerns into the semantic state definition. So Reactive Forms
interop is not a marker concern either.

0h. **MIGRATION COST IS NON-SEMANTIC. Migration difficulty, consumer count,
already-completed conversion work, documentation volume and compatibility effort
have ZERO weight in determining the 15.0 architectural endpoint.**

```
CORRECT    determine ideal endpoint -> freeze it -> measure blast radius -> migrate
FORBIDDEN  measure blast radius -> adjust the endpoint to make migration easier
```

None of these are architectural arguments:

```
"this would change 40 call sites, maybe keep an alias"
"we already migrated this enhancer, probably keep it"
"deleting this breaks the demo, maybe it is required"
```

They describe how much EXECUTION follows a decision, never which decision is
right. Under Rule 0e, the forbidden ordering is precisely how old ontology
survives a major release.

### DISPOSITION VOCABULARY — `DELETE` alone conflates function with form

```
KEEP         function AND current abstraction are kernel-optimal
REDESIGN     function survives; current abstraction does NOT
MOVE         function survives under a DIFFERENT semantic owner
INTERNALIZE  function survives but is not a PUBLIC capability
DELETE       the FUNCTION itself is unnecessary
UNPROVEN     function or ownership has not earned survival
```

`REDESIGN` is the one that was missing, and it is where most legacy lands:
a capability can be valuable while its abstraction is wrong.

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

### DEMO EVIDENCE — what a real application actually reaches for

Measured by parsing every `import { … } from '@signaltree/*'` in
`apps/demo/src` (excluding specs), multi-line aware. **METHOD NOTE:** the first
attempt used a single-line regex and silently missed multi-line imports —
including `guardrails`, which it reported as unused. Corrected before any
conclusion was drawn. This is evidence about CURRENT DEMO USAGE, which is one
signal about function, not proof of it.

**The authoring SDK is barely used by an application.** Six symbols, once each:

```
onHydrateDecision, onTreeError          observation hooks
createEnhancer, ENHANCER_META,
  resolveEnhancerOrder                  enhancer authoring
registerMarkerProcessor                 marker authoring
```

That is 6 of ~36 `./authoring` exports.

**ZERO demo usage — the symbols this whole MUT investigation is about:**

```
interceptLeafSignals     0     the mechanism schema depends on
getPathNotifier          0     the candidate observation substrate
withWriteContext         0
getActiveWriteContext    0
```

No application reaches for leaf interception, the notifier, or write context.
They are used only by core internals and by `@signaltree/schema`'s
implementation.

**OVERCLAIM CORRECTED.** This previously read: "if the only consumers of a
public observation protocol are the library's own internals, it is not serving
an authoring function." **That does not follow.** An authoring SDK is precisely
the kind of API that may have near-zero ordinary application usage —
`registerMarkerProcessor` and `createEnhancer` are obvious cases, and the demo's
own usage is dominated by higher-level APIs exactly as it should be. The
supportable inference is narrower:

> Zero demo usage removes **"ordinary application need"** as a justification.
> It does NOT remove **"third-party implementer need"**.

Which is what MUT-0 exists to determine.

**Other zero-usage results relevant to the survival audit:**

```
plannedSignalTree        0     the second construction concept
transactions             0     as an enhancer import
asReadonly               0
isSignalTree             0
```

**Counter-evidence worth recording — things a real app DOES use:**

```
ISignalTree              5 files   <- MIGRATION IMPACT, not a keep-argument.
clearStoragePrefix       1
flushAllStoredSignals    1         <- the three "global authority" symbols
invalidateTag            1            already flagged as suspicious: each has
                                      exactly one real consumer.
```

**EVIDENCE HIERARCHY — demo usage is a witness, never the judge.**

```
GREENFIELD FUNCTION
      -> required semantic owner
      -> does third-party implementation require access?
      -> minimum public capability
      -> existing consumers / demo usage as SUPPORTING evidence
```

NOT `demo uses it -> keep` / `demo doesn't -> delete`. That methodology would
delete the extension SDK of almost every library.

**`ISignalTree` is the worked example of doing this correctly.** Five demo files
import it — and the answer is still not "keep":

```
used by real consumers?                 YES  (5 files)
semantic concept independently needed?  YES
correct 15.0 owner?                     SignalTree<T>
=> migrate consumers, DELETE the ISignalTree public vocabulary
```

The usage count sized the migration. It did not decide the architecture.

**ng-forms shape — evidence for the adapter hypothesis:**

```
signalForm      6 files   from @signaltree/ng-forms/signals
createFormTree  2
ngFormValidators 2
formBridge      2         <- the ENHANCER is the least-used entry point
```

**OVERCLAIM CORRECTED.** Usage frequency cannot establish ontology. It tells us
consumers reach for the Angular-facing APIs more often; it does NOT tell us
`formBridge` has the wrong ontology. The audit question is functional:

> What function does `formBridge` provide that `signalForm` / the Angular
> adapter does not?

```
merely bridges realization into Angular Forms  -> Angular adapter owns it
independently adds semantic tree capability    -> enhancer may be correct
redundant with signalForm                      -> DELETE
```

What the frequency DOES support is refusing the reverse error: do not force
`formBridge` through `Enhancer<TAdded>` merely to enable deleting the
realization overload. That would let a deletion procedure drive the ontology.

### MUT-0 — GREENFIELD SURVIVAL INVENTORY (runs BEFORE MUT-2)

**THE RULE THIS SLICE ENFORCES:**

> Existing code may prove a FUNCTION is useful. It may NEVER prove its current
> ABSTRACTION is necessary. Derive function and ownership with the current API
> names HIDDEN; reveal the existing mechanism only after the greenfield
> requirement is stated.

**TWO SEPARATE VERDICTS, never conflated.** A concept can be perfectly
implemented and still be DELETE:

```
CORRECTLY IMPLEMENTED?     <- what the last ~150 commits proved
NECESSARY?                 <- what MUT-0 asks
```

This applies with FULL FORCE to work already converted. `Enhancer<TAdded>` being
neutral and coherent does not establish that it belongs in 15.0. Declaration
closure being correct does not justify every shipped declaration. Authoring
being framework-neutral does not prove every authoring symbol belongs in the
extracted package. Those proofs remain valuable and are not reopened — they
simply answer a different question.

#### Template — CURRENT FORM is filled in LAST, deliberately

```
FUNCTION            what capability must exist?
OWNER               which frozen 15.0 authority naturally owns it?
PUBLIC NEED         must a THIRD-PARTY IMPLEMENTER have access?
                    why can SignalTree not own the integration itself?
MINIMUM PRIMITIVE   smallest capability that provides the function
CURRENT FORM        <- LAST. Prevents designing around PathNotifier,
                       Enhancer, formBridge, etc. by reflex.
DISPOSITION         KEEP / INTERNALIZE / MOVE / SPLIT / DELETE / UNPROVEN
```

`PUBLIC NEED` is the question the demo evidence cannot answer and MUT-0 must:
zero application usage removes "ordinary application need", never "third-party
implementer need".

#### Three levels of need — never collapse them

```
CORE-INTERNAL          core needs it; no contract crosses a package boundary
FIRST-PARTY PACKAGE    schema/realtime/ng-forms need it; may justify an
                       INTERNAL SHARED contract, NOT a public protocol
THIRD-PARTY SDK        arbitrary extension authors need it; only this level
                       justifies public authoring surface
```

`@signaltree/schema` being separately published does NOT prove third-party need.
Demo evidence cannot answer any of these; first-party consumption cannot answer
the third.

#### Order — highest architectural gravity first, not alphabetical

```
1  SYNCHRONIZATION / INTEGRATION FUNCTIONS  (deliberately NOT named
   "observation" — that phrase pre-selects an abstraction)
2  Enhancer / createEnhancer / ENHANCER_META / resolveEnhancerOrder
3  schema integration
4  realtime integration
5  ng-forms / formBridge / signalForm
6  guardrails
7  persistence integration
8  devTools integration
9  plannedSignalTree
10 global storage / tag authorities
```

Then outward. The hypothesis worth testing first, because confirming it would
delete a large amount of machinery:

```
history / undo / redo / rollback  -> causal authority
transactions                      -> semantic/causal authority
persistence                       -> governed consequence
realtime                          -> governed consequence?
schema                            -> derived invalidation from committed truth
devtools                          -> diagnostic projection
Angular                           -> publication / reactivity
ng-forms                          -> Angular adapter?
```

None of those rows obviously requires `observeEveryMutation(callback)`. If they
all place cleanly with their owning authority, the generic observation concept
disappears rather than being redesigned.

Conversely, if a genuine third-party function emerges — e.g. "a custom semantic
extension must be notified when its registered positions participate in a
settled semantic transaction" — then a public capability IS proven, and can be
designed at minimum size without inheriting 14.x form.

### ANGULAR SUPPORT RANGE — **DECIDED: 21 and 22. Angular 20 excluded.**

**MY FRAMING OF THIS WAS WRONG AND IS RETRACTED.** `a52f0124` said:

```
IF 22+ ONLY -> the Reactive Forms function falls outside the product boundary
            -> formBridge becomes a DELETE candidate
```

**That does not follow.** It conflates THREE independent things:

```
framework version   which Angular majors we support
forms paradigm      Reactive Forms vs Signal Forms vs Template-driven
SignalTree form     enhancer vs adapter
```

Reactive Forms is a **current, supported, distinct forms system in Angular 22** —
not a legacy path being replaced by Signal Forms. Angular's own guidance
presents them as different approaches for different cases, recommending Signal
Forms for new signal-based apps while existing Reactive Forms apps continue on
Reactive Forms. So SignalTree-to-`FormGroup` interoperability is a legitimate
greenfield requirement **on every supported major**, including 22-only.

That makes the subtraction result STRONGER, not weaker: **the Reactive Forms
function is independent of Angular-major compatibility.** The range determines
whether a SECOND forms integration is available, never whether the first has
value.

**SECOND CORRECTION — "/signals has a hard Angular 22 requirement".** Signal
Forms exist in Angular 21+; they became STABLE in 22. The repo's own comment
says so precisely — *"`@angular/forms` ships **stable** Signal Forms via the
`./signals` subpath starting in v22.0.0"*. So the boundary is **SignalTree
PRODUCT POLICY** — do not build a stable integration contract on an Angular API
that did not yet carry Angular's stability guarantee — not a technical absence
in 21. Defensible, but it must be stated as policy.

#### The decision

```
@signaltree/*                    peer Angular ^21 || ^22
Angular 20                       OUT of the 15.0 product boundary
Angular 21                       supported
Angular 22                       supported, primary development target
@signaltree/ng-forms/signals     Angular 22+ (stability policy)
```

**Rationale is PRODUCT HORIZON, and note it is the compatibility-UNfriendly
choice** — supporting another major would be the easier path, so Rule 0h is not
being violated in reverse. Angular support status, as supplied by the reviewer
from Angular's published release page (external evidence, not measured by me):

```
Angular 22   Active   active to June 2027, LTS to June 2028
Angular 21   LTS      to June 2027
Angular 20   LTS      to 28 November 2026
```

Shipping a greenfield major in August 2026 built around a version that goes
unsupported in ~3 months creates immediate legacy obligation. Angular 21 remains
supported to June 2027, so excluding it would discard a real supported user base.

#### Resulting product

```
Angular 21    SignalTree + Reactive Forms integration
Angular 22    SignalTree + Reactive Forms integration + Signal Forms integration
```

#### Consequence for `formBridge` — the FORM is still UNPROVEN

```
FUNCTION      SignalTree <-> Angular Reactive Forms interoperability
              SURVIVES, on BOTH supported majors, independent of the range
CURRENT FORM  an ENHANCER mutating a tree to add `AngularFormsMethods` and a
              Map<string, AngularFormBridge>
              UNPROVEN under Rule 0g — the subtraction test proved the function
              and did NOT rescue the form
DISPOSITION   REDESIGN CANDIDATE
```

**The next test, with the name erased:** given the 15.0 kernel, the Angular
publication architecture, and a requirement to interoperate with
`FormGroup`/Reactive Forms, what would we build today?

```
SUSPECTED (unproven)        vs        CURRENT
SignalTree truth                      tree.with(formBridge())
   -> Angular publication                -> mutate SignalTree realization
   <-> Reactive Forms adapter            -> add getAngularForm(), bridge Map
   <-> FormGroup / FormControl
```

An adapter over published realization may be the kernel-native answer. That must
be DERIVED, not assumed — and it bears directly on #4a, where migrating
`formBridge` to `Enhancer<TAdded>` would be converting a form that may not
survive.

**Realtime R0 is UNBLOCKED** — the Angular conditional no longer hangs over the
inventory.

### V1.1 — DOES A FIRST-PARTY VALIDATION FACILITY SURVIVE? — **NO COUNTEREXAMPLE FOUND**

```
NULL   SignalTree ships NO validation evaluator/package.
       A user reads a value/snapshot, passes it to their own validator/schema,
       and receives that validator's native result.

       What REQUIRED SignalTree workflow becomes impossible?
```

Four candidate counterexamples, no fifth escape hatch.

#### A — SignalTree-specific snapshot semantics — **FAILS**

Does validation require a coherent read that ordinary access cannot provide?
No. `tree()` and `tree.$.order()` already ARE coherent reads — the frozen
atomicity invariant guarantees no external consumer observes intermediate
heterogeneous state. Nothing new is needed, and per the corrected cross-field
model the owner of coherent multi-position reads would be READ SEMANTICS
anyway, not validation.

#### B — marker/kernel-aware meaning — **FAILS**

Is there a REQUIRED rule whose meaning cannot be represented by the resulting
snapshot? **MEASURED across REPRESENTATIVE structural / storage / status / async
marker classes** — not an exhaustive enumeration, and the claim does not need
one:

```
users  (entityMap)     {"all":[{"id":1,"name":"Ada"},{"id":2,"name":"Bob"}]}
load   (status)        {"state":"NOT_LOADED","error":null}
theme  (stored)        "light"
remote (asyncSource)   {"value":[]}
plain                  42
```

Markers flatten to plain data, and that data carries what rules judge: entity
collections arrive as arrays with their domain keys, status arrives with its
state, stored/async arrive as values. Uniqueness, existence, membership,
cross-entity and status-dependent rules are all expressible.

The one gap found — `asyncSource` snapshots `{value}` WITHOUT load state — is
**not a validation gap**. "Do not validate while loading" is about WHEN to
validate, not WHAT is valid, and the caller already decides whether to call.

**THE ARGUMENT IN ITS HARDER-TO-FALSIFY FORM**, which does not depend on
exhaustive coverage:

> **No established validation requirement needs MARKER IDENTITY rather than the
> VALUE exposed by the read surface.**

If a future marker carries semantically meaningful information omitted from its
value projection, that is a NEW counterexample to evaluate then. It does not
justify preserving a validation facility now.

#### C — issue-to-tree correspondence — **FAILS**

**CORRECTED — do NOT claim issues locate by "domain keys".** A validator's issue
path over that snapshot is typically structural, e.g. `all[0].name`. The entity's
domain key merely happens to sit INSIDE the value; it is not necessarily the
locator. The sufficient argument is narrower and does not depend on that claim:

```
explicit validation evaluates snapshot X
its issues describe snapshot X
no baseline requirement says those issues must retain SEMANTIC IDENTITY across
  future topology changes
```

That alone removes any need for `PositionId`, rekey-stable issue ownership, or
tree-addressed results. A later requirement that *"a result stays attached to
entity 42 across reorder/rekey"* would be a CONTINUOUSLY MAINTAINED PROJECTION
and must be derived independently.

#### D — cross-format normalization — **FAILS, and it is the dangerous one**

Standard Schema ALREADY IS the cross-format interoperability boundary; that is
its entire purpose. SignalTree normalizing validator libraries on top of it adds
a layer over an existing standard.

> **"A normalized result shared across multiple formats" is the last refuge of a
> package whose real function has disappeared.** The question is not whether
> normalization is useful, but whether users need SIGNALTREE to normalize
> validation libraries — or whether SignalTree should support a standard
> validation interface and get out of the way.

#### RESULT — **PROPOSED REVERSAL of V0.6**

```
APPLICATION VALIDATION IS USEFUL              YES  (never in doubt)
SIGNALTREE MUST PROVIDE A VALIDATION FACILITY NO   (no counterexample found)
```

The honest 15.0 shape becomes:

```ts
const value  = tree.$.order();
const result = await mySchema['~standard'].validate(value);
```

plus DOCUMENTATION showing validation libraries how to consume SignalTree truth.
V0's product decision is then satisfied without a package.

#### What this makes `@signaltree/schema`

Its measured surface does something `validate(value, rules)` does not: it
maintains a CONTINUOUS, per-path validation projection wired into the tree, with
`isValid`/`errors`/`pending` as live signals, using Angular's `signal`/`computed`.

**That extra function is exactly the one V0 excluded from the baseline** —
continuous currency, i.e. observation. And observation is Angular-owned.

```
FUNCTION       explicit validation of truth      -> user's own validator + docs
FUNCTION       CONTINUOUS validation projection  -> Angular observation layer
CURRENT FORM   Angular-coupled tree enhancer
               shipped as a SignalTree package   -> DELETE CANDIDATE
```

**CORRECTED — Angular-owned does NOT mean forms-adapter-owned.** I wrote that
the surviving function belongs "beside the two forms adapters". The first arrow
is supported; the second is not. An Angular app may reasonably want
`validation.errors()` / `validation.isValid()` in a component **without using
Angular Forms at all**.

```
ESTABLISHED    function: maintain an Angular-reactive validation projection over
                         SignalTree truth
               owner:    Angular observation / integration layer
NOT ESTABLISHED owner:   Reactive Forms or Signal Forms adapter
```

The forms adapters may CONSUME it; that does not make them its owner. Concluding
otherwise would repeat the same error in reverse — correctly pulling validation
out of SignalTree, then shoving all validation observation into "forms" because
forms happen to consume it.

```
@signaltree/schema PACKAGE                 DELETE CANDIDATE
explicit validation function               DELETE from the SignalTree product
                                           -> validator ecosystem + docs
continuous Angular validation projection   FUNCTION UNPROVEN; owner is the
                                           Angular layer IF it survives
current tree-enhancer form                 REJECTED
```

**Do NOT preserve the package while that question is open.**

### V0.6 — **REVERSED AND CLOSED**

```
APPLICATION VALIDATION IS USEFUL              YES
SIGNALTREE MUST PROVIDE VALIDATION            NO
KERNEL VALIDATION ONTOLOGY                    NONE
VALIDATION OBSERVATION                        NONE
NORMALIZED VALIDATION-RESULT ONTOLOGY         NONE

15.0 GUIDANCE
  read SignalTree truth
  -> validate with the validator/schema the application already uses
```

The last clause is load-bearing and comes from V1.1-D, probably the deepest
result of the slice: **Standard Schema already supplies interoperability.**
SignalTree wrapping validator ecosystems in a second normalized representation
would be an invented layer.

**THEREFORE THE V1 SCAFFOLDING IS ALSO DELETED — not parked as "maybe later":**

```
validate(value, rules)   Result   Issue   rules
```

Those were DERIVATION SCAFFOLDING that let the question be asked precisely. They
are not surviving SignalTree concepts and must not sit in the architecture as
future options.

**WHAT V1.1 ACTUALLY ESTABLISHED**, stated at full strength:

> After removing observation, installation, markers, addressing, identity,
> retained state and normalization, **there is no remaining SignalTree-owned
> validation function.**

Not merely "we could not find coupling". The audit found a requirement we had
INVENTED OURSELVES — and deleted it.

### V1 — VALIDATION FACILITY, MINIMAL CONTRACT — **DERIVED PROPOSAL, NOT FROZEN**

Derived from `validate(node, rules)` with `@signaltree/schema`, `form()`,
enhancers, paths and Angular signals hidden. Each responsibility proven
independently; everything else absent unless required.

#### R1 — EVALUATION

What does the evaluator minimally need? A VALUE to judge, and RULES to judge it
by. So the first question is what the first parameter actually has to be:

```
CANDIDATE A   validate(value, rules)         caller reads; evaluator gets a snapshot
CANDIDATE B   validate(() => value, rules)   evaluator reads on demand
CANDIDATE C   validate(nodeAccessor, rules)  evaluator holds a SignalTree node
```

**Under EXPLICIT evaluation, A suffices.** The caller already holds the tree; it
reads and passes `tree.$.order()`. B and C are only needed if the evaluator must
re-read on its own initiative — which is precisely the CONTINUOUS-CURRENCY
function that V0 placed outside the baseline.

**RETRACTED — the cross-field closure argument.** I wrote that a rule needing
other parts of the tree simply CLOSES OVER them. That smuggles live SignalTree
reads back in through the rule body:

```ts
validate(order(), (value) => {
  const customer = tree.$.customer();   // ambient SECOND read
});
```

The supposedly pure `value + rules -> result` operation can then observe TWO
DIFFERENT MOMENTS OF TRUTH. Even where JS execution makes most cases safe in
practice, the architecture is wrong: a snapshot evaluator must not secretly
acquire more truth through closures when input consistency matters.

**CORRECTED MODEL — all dependencies belong in the EXPLICIT validation input**
unless a live-reader model is separately specified and proven:

```ts
validate({ order: tree.$.order(), customer: tree.$.customer() }, rules);
// or, when a subtree snapshot already contains everything:
validate(tree.$.order(), orderRules);
```

Cross-field validation still does not prove SignalTree coupling — but for a
STRONGER reason than the one I gave. And it raises a real candidate: if
SignalTree must supply a COHERENT MULTI-POSITION SNAPSHOT, that could be genuine
SignalTree-specific functionality — **but its owner would be SNAPSHOT/READ
SEMANTICS, not validation.** Do not give validation ownership of a primitive it
merely consumes.

```
R1 RESULT   the evaluator needs a VALUE and RULES.
            It does NOT need NodeAccessor, paths, PositionId, revisions, or any
            kernel primitive.
```

#### R2 — RESULT

Minimum normalized shape:

```
{ valid: boolean, issues: Issue[] }
Issue: a message + a location RELATIVE TO THE VALIDATED VALUE
```

Location must be relative to the validated value, not a tree address —
otherwise the result type acquires a tree-addressing ontology it does not need.
Normalizing a rule format's native issue shape into this is the **ADAPTER's**
job, not the evaluator's.

#### R3 — ASYNC LIFECYCLE — **COLLAPSES**

The stated responsibility was *"obsolete async runs must never overwrite newer
results"*. Attack it directly:

> **Overwrite WHAT?**

Under explicit evaluation the facility STORES NOTHING. `await validate(…)`
returns a value to the caller. With no retained result, there is nothing an
obsolete run could overwrite — staleness is only a problem for something holding
a mutable current-result slot.

```
R3 RESULT   NOT a facility responsibility. Whoever RETAINS a result owns
            deciding which result to keep — the Angular adapter, or any consumer
            building a continuous projection. No generation counters, no
            revisions, no invocation registry in the primitive.
```

That also removes the last candidate reason to touch kernel identity.

#### THE SMALLEST SUFFICIENT PUBLIC CONTRACT

```
validate(value, rules) -> Result | Promise<Result>
```

- **SYNC/ASYNC SHAPE IS UNPROVEN.** The argument that always-Promise imposes
  microtask semantics is valid, but it does not establish that a
  `Result | Promise<Result>` UNION is optimal — a union pushes uncertainty onto
  every caller. `validate` + `validateAsync`, always-async, or a format-driven
  distinction are all live. **This cannot be settled until we know what `rules`
  actually are.**

```
ASYNC LIFECYCLE OWNERSHIP    COLLAPSED — keep this result
PUBLIC SYNC/ASYNC API SHAPE  UNPROVEN
```
- no stored state, no registration, no installation, no tree coupling.

#### REJECTED ALTERNATIVES, each with its falsifier

```
tree.with(validation())      REJECTED. Installation changes nothing the tree
                             semantically DOES; hanging methods off a tree is
                             the formBridge mistake.
                             FALSIFIER: a validation capability that alters
                             tree semantics.

validated() marker           REJECTED. No construction-time semantic
                             requirement.
                             FALSIFIER: validation that must participate in
                             graph COMPILATION.

continuous validation obj    REJECTED from the baseline. That bundles a SECOND
                             function — observation/invalidation.
                             FALSIFIER: V0's continuous-currency question
                             reopening.

pending in the primitive     REJECTED. No stored state -> nothing pends.
                             FALSIFIER: a required result the caller cannot
                             derive from the promise it is already holding.

rule registry / registration REJECTED. The caller holds its own rules.
                             FALSIFIER: rules that must be discoverable by a
                             party that does not hold them.

dependency tracking          REJECTED. Explicit evaluation reads what it needs
                             at call time.
                             FALSIFIER: continuous currency being required.

NodeAccessor parameter       REJECTED for the baseline (see R1).
                             FALSIFIER: the evaluator needing to re-read on its
                             own initiative.
```

#### THE SEVERE FINDING — and it must not be buried

The derived primitive has **ZERO SignalTree coupling**. It is a pure function
over a value and rules. Which raises the question this derivation is obliged to
ask:

> **If the facility needs nothing from SignalTree, why is it a SignalTree
> package rather than any existing validation library?**

```
(a) IT SHOULD NOT BE. A caller can already write
    `await someSchema.parseAsync(tree.$.order())`. V0's product decision would
    then be satisfied by DOCUMENTATION, not by a package.
(b) SOME SIGNALTREE COUPLING IS GENUINELY REQUIRED and this derivation has not
    yet found it.
```

**This is unresolved and is the next thing to attack.** Candidate couplings that
would justify (b), none yet proven:

```
- validating a SUBTREE where the shape must be derived from tree structure
  rather than supplied by the caller
- marker-aware validation (entityMap collections, async markers) where reading
  a raw snapshot loses semantics the rules need
- issue locations that must survive tree topology changes
- a normalized result shape shared across MULTIPLE rule formats, which is
  integration value rather than evaluation value
```

**Do not answer this by adding coupling to justify the package.** If (a) is
true, the honest 15.0 outcome is that the validation FUNCTION is satisfied
without a first-party evaluator — which would REOPEN V0.6's answer rather than
implement it.

### V0 — **CLOSED. PRODUCT DECISION FROZEN.**

```
PRODUCT DECISION       **REOPENED at `238b971d` — see V1.1.** V1 derived a
                       primitive with ZERO SignalTree coupling, which falsifies
                       the reasoning that produced this line. Everything else in
                       this block REMAINS FROZEN.
OWNERSHIP              downstream DERIVED facility over SignalTree truth
FRAMEWORK              framework-neutral BY FUNCTION (neutrality follows from
                       ownership; it was not chosen independently)
KERNEL VALIDATION      NONE
ONTOLOGY
DEFAULT EXECUTION      EXPLICIT evaluation
CONTINUOUS CURRENCY    NOT part of the baseline contract
ANGULAR                owns reactive observation and lifecycle for Angular
                       validation experiences
STANDARD SCHEMA        format/interoperability ADAPTER, not a second authority
@signaltree/schema     REDESIGN candidate; package and API not yet derived
```

**THE REASONING THAT WAS WRONG, recorded because the shape of the error
matters.** The argument ran: `await validate(tree.$.order(), orderRules)` is
generally useful, THEREFORE SignalTree should provide `validate`. That does not
follow. Once V1 erased SignalTree and derived `validate(value, rules)`, the
function is no longer *validate SignalTree state* — it is *validate a JavaScript
value*. **The value having come from SignalTree gives SignalTree no ownership
claim over the operation.**

```
STILL FROZEN
  kernel application-validation ontology   NONE
  authoritative refusal                    NOT ESTABLISHED
  validation observation                   NOT KERNEL-OWNED
  continuous currency                      NOT BASELINE
  Angular observation/lifecycle            ANGULAR-OWNED
  validation enhancer                      UNJUSTIFIED
  validation marker                        UNJUSTIFIED

REOPENED
  15.0 ships a general first-party
  validation facility                      UNPROVEN
```

The original functional argument is preserved below for the record, but it
proves only that the CAPABILITY is useful — never that SignalTree must PROVIDE
it. Validation of SignalTree state is useful *without Angular Forms existing at
all*:

```ts
const result = await validate(tree.$.order, orderRules);
if (!result.valid) { … }
```

Nothing there is Angular-specific, form-specific or presentation-specific — it
is useful in services, imports, workflows, pre-submit checks and background
processing. Angular Forms being one major consumer does not make Angular the
semantic owner of the operation. Putting validation *only* inside Angular Forms
would make a general state concern subordinate to a UI integration.

**THE DISTINCTION THAT SPLITS THE PRODUCT:**

```
VALIDATING TRUTH                        general, SignalTree-adjacent  -> WE PROVIDE
OBSERVING TRUTH SO VALIDATION STAYS     framework/runtime-specific    -> WE DO NOT
CURRENT
```

Providing only the first preserves *"SignalTree owns truth, Angular owns
observation"* — and prevents validation from being used to smuggle a generic
mutation observer back into the kernel.

**THE CONTRACT, negatively stated:**

```
SignalTree 15 provides OPTIONAL, DESCRIPTIVE validation of current truth.
It does NOT:
  make validation part of kernel truth      refuse writes by default
  own validation observation                require Angular
  require continuous validity               require mutation events
  require public PositionId/path ontology
```

#### Two constraints carried into the derivation

**NOT AN ENHANCER** unless a later derivation proves installation changes what
the tree semantically DOES. The primitive currently looks like
`validate(node, rules)`, not `tree.with(validation(…))` — installing an
evaluator onto a tree so methods can hang off it would repeat the `formBridge`
mistake exactly.

**NOT A MARKER** — `signalTree({ profile: validated(…) })` is unjustified unless
a separate CONSTRUCTION-TIME semantic requirement appears.

#### Consequence for `form()`

**WORDING CORRECTED — `form()` has not lost its "last" justification.** It has
lost two large INHERITED ones — Angular Reactive Forms integration (RF-M1) and
validation ownership (V0/V1.1). Precisely:

> **`form()` now inherits NO justification from Angular interop or from
> validation. Its remaining functions must independently justify BOTH themselves
> AND any construction-time `form` marker.**

Those remaining functions — `dirty`/`touched`, `submitting`, `wizard`,
`reset`/`clear`/`patch` — are underived. The target shape:

```
              validation facility
              /                 \
   Reactive Forms adapter   Signal Forms adapter
              \                 /
              SignalTree truth
```

not `form()` owning validators + Angular Reactive Forms + Signal Forms + wizard
+ touched + submitting. After the facility's API is frozen, `form()` can be
audited with essentially ALL of its inherited justifications stripped.

#### Next — kernel-first derivation, everything hidden

Derive the facility's minimal API with `@signaltree/schema`, `form()`,
enhancers, paths, Angular signals and the current API ALL HIDDEN. Only three
candidate responsibilities:

```
EVALUATION       run rules against current readable truth
RESULT           normalized validity / errors
ASYNC LIFECYCLE  obsolete async runs must never overwrite newer results
```

**Even `pending` may not belong in the primitive.** `await validate(…)` needs no
persistent pending model; a consumer wanting `pending` / `isValid` / `errors` /
`lastResult` maintains that operational projection around the evaluator.

Package naming (`@signaltree/schema` -> `@signaltree/validation`?) is FORM and is
deliberately NOT decided — Rule 0g, function first.

### MUT-0 ROW — VALIDATION OWNERSHIP — **OPEN. Higher priority than realtime R0.**

Promoted ahead of realtime because RF-M1 produced evidence that 15.0 may carry
**TWO AUTHORITIES FOR ONE SEMANTIC FUNCTION**, which can contaminate `form()`,
schema, both Angular forms adapters and marker design simultaneously. Realtime is
a self-contained product question; this is not.

**RETRACTED NULL HYPOTHESIS.** This row opened with *"SignalTree has exactly ONE
semantic validation authority unless falsified"*. That **already assumes
SignalTree should own validation semantics at all**, which has not been earned.
Rule 0g requires deleting REQUIREMENTS too — and "we currently have two
validation systems" is not evidence that we need one.

#### V0 — DOES SIGNALTREE OWN VALIDATION AT ALL? (runs FIRST)

```
ASSUME NONE OF IT EXISTS
  no form()          no validators()      no schemas()
  no @signaltree/schema                   no Angular forms
  no path-based validation API

Given ONLY the 15.0 kernel: what validation capability, if any, should
SignalTree DELIBERATELY provide?
```

**A/B/C ARE NOT MUTUALLY EXCLUSIVE — CORRECTED.** They were framed as rival
architectures; they are INDEPENDENT OWNERSHIP AXES, and **B + C is a perfectly
legitimate result**:

```
SignalTree kernel                     owns truth only
first-party validation package        derives verdicts from truth
Zod / Valibot / Standard Schema       supply rule formats via adapters
```

Critically: **"not kernel semantics" does NOT imply "SignalTree should have no
validation package."** A package can be extremely valuable while remaining
strictly downstream of truth. Ask five independent questions instead of picking
a winner:

```
V0.1  does the KERNEL own any validation semantics?
V0.2  should the PRODUCT ship a first-party validation facility, even if
      validation is NOT kernel semantics?
V0.3  if yes, what does that facility own — policy? evaluation? result
      projection?
V0.4  which parts are merely ADAPTERS to external rule formats?
V0.5  does any of it require public kernel integration BEYOND READING TRUTH?
```

#### V0.0 — THE FIRST QUESTION: DESCRIPTIVE or AUTHORITATIVE?

Do not let the word "validation" collapse two radically different products:

```
DESCRIPTIVE    "this current truth violates these rules"
               -> a downstream derived system is very plausible
AUTHORITATIVE  "this semantic operation is ILLEGAL and must not commit"
               -> kernel / PREPARE integration potentially REQUIRED
```

**STATUS — measured behaviour, NOT a frozen greenfield decision.** My previous
wording, "V0.0 is now measured, not open", overstated it. Correctly:

```
MEASURED          no existing workflow demonstrates write refusal
DERIVED DEFAULT   do NOT introduce authoritative validation without an
                  independently required function that needs PREPARE refusal
PRODUCT SEMANTICS still falsifiable if such a function is discovered
```

Rule 0g forbids current behaviour from settling a greenfield product question.
This keeps the burden of proof where it belongs without making 14/15-dev
behaviour the specification.

**MEASURED — both current systems are DESCRIPTIVE. Neither refuses a write.**

```
@signaltree/schema   documented "observe-only … never blocks writes"
form() / FormSignal  `set(values)` NEVER consults validity. The only two
                     `if (!valid) return false` sites in the whole marker are
                     wizard `next()` and `goTo()` — WORKFLOW NAVIGATION, not
                     state refusal.
```

So **no measured function requires write refusal**, and nothing yet justifies
promoting validation into PREPARE or kernel semantics. Historical behaviour is
not normative — but it also means we must not casually INVENT write-refusal
semantics we have never had.

The wizard finding also reinforces the form-session decomposition: wizard gating
is WORKFLOW CONSUMING validation as an input, not validation itself.

#### V0.0b — APPLICATION VALIDATION vs KERNEL INVARIANTS

A third thing hides under the same word, and conflating them would drag
structural correctness into this cleanup:

```
KERNEL INVARIANT        required for SignalTree's OWN correctness
                        e.g. entity identity cannot be duplicated
APPLICATION VALIDATION  user/domain policy over state
                        e.g. "email must look valid"
DOMAIN INVARIANT        e.g. "order.total must equal sum(lines)" — could be
                        any of the three depending on product semantics
```

> **"The kernel owns no application validation" does NOT mean "the kernel never
> refuses invalid state."** The kernel may enforce its own structural/semantic
> invariants without owning a general user validation system. `entityMap`
> constraints must not be swept into this row.

**THE DECISIVE FALSIFIER, and it is simpler than the inventory below.** Before
enumerating async, errors and cross-position dependencies, assume:

```
SignalTree           owns current truth
validation consumer  reads truth -> derives verdict
```

> **What user-visible capability becomes IMPOSSIBLE if SignalTree itself owns
> ZERO validation semantics?**

Attack that null with: sync validation, cross-field validation, subtree
validation, async validation, errors, isValid, pending, manual validate,
automatic recomputation, Standard Schema support. If all are satisfiable without
changing the semantic state engine, that is strong evidence against A.

The null has real support: `NodeAccessor`s provide readable state, so no mutation
interception, paths, marker ownership or causal records are automatically
needed. An async evaluator can also own its own operational concerns —
*read truth -> validate against input X -> newer input arrives -> old result is
stale -> publish only the surviving result* — WITHOUT `pending` becoming
SignalTree truth. **And solve staleness with an EVALUATOR-LOCAL GENERATION
COUNTER, not physical revisions**, unless the required semantics demand kernel
identity: *run 41 starts, run 42 starts, 41 resolves -> ignore, 42 resolves ->
publish.*

**RETRACTED FROM MY OWN ARGUMENT — "publication machinery provides reactive
realization".** That is ANGULAR-specific. The frozen invariant is *"Angular owns
observation"*, so a FRAMEWORK-NEUTRAL validation package cannot casually lean on
Angular publication to solve automatic currency. Two questions must be split:

```
CAN validation be COMPUTED from truth?          -> reads suffice
HOW does a NEUTRAL system know WHEN to recompute? -> the real falsifier
```

**BUT FIRST — IS NEUTRALITY EVEN REQUIRED? MEASURED: NO, not today.**

```
@signaltree/schema imports `signal`, `computed`, `Signal` from '@angular/core'
                   and declares an @angular/core PEER DEPENDENCY
```

The current validation package is **not framework-neutral**. So "a
framework-neutral validation package" is a requirement I was about to INVENT,
not one that exists. It must earn its place like any other:

**V0.6 REPLACED — neutrality is not a free-standing switch.** Asking it
independently permits an OWNERLESS MIDDLE GROUND:

```
REJECTED SHAPE
a general "SignalTree validation" package that REQUIRES Angular for observation
-> the public abstraction says SignalTree; the actual owner is Angular
   realization
```

Neutrality should FALL OUT of ownership, so V0.6 becomes the higher-order
product question:

> **Does SignalTree 15 deliberately ship a GENERAL FIRST-PARTY VALIDATION
> FACILITY, independent of any UI/framework integration?**

```
YES -> neutrality FOLLOWS from the owner's function
       SignalTree truth -> neutral evaluator -> Standard Schema / custom rules
       Angular observation is OPTIONAL downstream realization

NO  -> no general facility is needed. Do NOT neutralize `@signaltree/schema`;
       question whether the package should exist in its current conceptual role
       at all. Validation then lives in the Angular forms adapters.
```

Do not preserve a generic Angular-coupled validation package merely because one
exists today.

**The burden of proof for KERNEL ownership is therefore very high — and the
automatic-currency falsifier only applies CONDITIONALLY on V0.6.**

#### THE MATRIX — three columns, not one binary

`NEEDS SIGNALTREE-SPECIFIC SUPPORT` is separated from `NEEDS VALIDATION
SEMANTICS IN KERNEL`, because the answers differ and collapsing them is what
produced the old observer machinery.

```
CAPABILITY            KERNEL VALIDATION   KERNEL          SIGNALTREE-SPECIFIC
                      SEMANTICS?          INTEGRATION?    SUPPORT?
--------------------  -----------------   -------------   -------------------
sync evaluation       NO                  NO              reads only
manual validate()     NO                  NO              reads only
errors / isValid      NO                  NO              derived result
Standard Schema       NO                  NO              format adapter
async evaluation      NO                  NO              reads only
pending               NO                  NO              evaluator state
staleness/cancel      NO                  NO              evaluator-local
                                                          generation counter
cross-field deps      NO                  NO*             reads only
subtree validation    NO                  NO*             reads only
AUTOMATIC CURRENCY    NO                  REAL FALSIFIER  conditional on V0.6
authoritative refusal YES (PREPARE)       YES             ONLY if the product
                                                          requires refusal —
                                                          nothing measured does
```

`*` **UNDER EXPLICIT EVALUATION these collapse from MAYBE to NO.** Cross-field
and subtree rules are simply THINGS THE EVALUATOR READS. Several values
participating does not imply a dependency-NOTIFICATION system. Both MAYBEs
existed only because continuous currency was being assumed.

**CORRECTED SUMMARY.** "Every capability answers NO to kernel validation
semantics" was too absolute — authoritative refusal answers YES if that product
function is ever required. Methodologically stronger:

> **Every CURRENTLY ESTABLISHED validation requirement can be satisfied with
> ZERO application-validation semantics in the kernel. No established
> requirement falsifies that null.**

**The shape this produces is internally consistent and worth stating:**

```
VALIDATION SEMANTICS IN KERNEL     NO
SIGNALTREE-SPECIFIC INTEGRATION    MAYBE (one row)
FIRST-PARTY VALIDATION PACKAGE     plausibly YES
```

Those three are perfectly compatible — which is exactly why A/B/C had to stop
being rival architectures.

#### AUTOMATIC CURRENCY MUST EARN ITS OWN EXISTENCE FIRST

Do not inherit it as a requirement merely because today's schemas are reactive.

```
FUNCTION     what user outcome requires always-current validity?
WITHOUT IT   what becomes IMPOSSIBLE rather than merely less convenient?
```

Two materially different product promises:

```
EXPLICIT   await validation.run(); validation.errors();
           Angular Forms handles its own triggering
CONTINUOUS validation.isValid() must ALWAYS correspond to current truth
```

**GREENFIELD BASELINE — EXPLICIT EVALUATION.** Adopt this as the default:

> Validation evaluation is EXPLICIT unless a specific product function
> independently requires continuously-current derived validation.

```
BASELINE   const result = await validate(node, rules);
           result.valid; result.errors;
NOT        validation.isValid()  // a perpetual promise to track future truth
```

Because *"evaluate current truth against rules"* is unquestionably validation,
while *"remain continuously synchronized with future truth"* is a SECOND
function — observation/invalidation of changing dependencies. Those must not be
silently bundled. Angular layers the second naturally, because Angular owns
observation; a future non-Angular adapter supplies its own mechanism.

Only if CONTINUOUS is required, AND V0.6 says a general neutral facility is
required, does the falsifier bite. And even then the result is **NOT** "validation belongs in the
kernel". It is:

```
zero kernel VALIDATION ontology still survives
+ some narrow neutral dependency-invalidation integration may be required
```

#### THE ARCHITECTURE TO ATTACK NEXT

```
SignalTree kernel -> truth -> NodeAccessor / reads
                                   |
                          validation evaluator
                        /          |          \
                custom rules   Standard    other formats
                                Schema
                                   |
                          validation result
                          /                \
              Angular Reactive        Angular Signal
               Forms adapter           Forms adapter
                          \                /
                    Angular observation / lifecycle
```

```
kernel owns application validation      NO
kernel owns validation observation      NO
evaluator owns evaluation               YES
format adapters own input translation   YES
Angular owns reactive observation       YES
```

Whether that evaluator deserves a FIRST-PARTY PACKAGE is the remaining product
question — i.e. V0.6.

#### `@signaltree/schema` — the audit question, sharpened

Do NOT ask *"should `@signaltree/schema` become neutral?"* Ask:

> Assuming 15.0 deliberately ships a general validation facility, ERASE
> `@signaltree/schema`. What would the optimal evaluator + Standard Schema
> integration look like today?

Then reveal the package. Candidate outcome, to be tested rather than assumed:

```
FUNCTION       first-party validation + Standard Schema interoperability   KEEP
CURRENT FORM   Angular-signal-backed schema ENHANCER attached to a tree
                                                        likely DELETE / REDESIGN
GREENFIELD     neutral evaluator + Standard Schema format adapter
FORM                                                    HYPOTHESIS to test
```

If V0.6 answers NO, even the FUNCTION does not survive as a SignalTree concern.

**Audit it as a possible evaluator / format adapter — NOT as an enhancer, and
NOT as the canonical authority by inheritance.**

**CRITICAL DISTINCTION — dependency invalidation is NOT mutation observation.**
The minimum sufficient information may be only:

```
"something relevant to dependency set D may have changed"   -> then REREAD truth
```

with NO before, no after, no path, no mutation kind, no event envelope, and no
`PositionId` exposure. That preserves everything MUT-0 row 1 established, and it
is a far better question than *"what replaces `interceptLeafSignals`?"*

Only AFTER V0 does the one-authority falsifier run, and then in its corrected
form: *can every SURVIVING validation function be satisfied by one
non-overlapping semantic authority?*

**A counterexample must identify TWO GENUINELY DIFFERENT FUNCTIONS.** These are
representation and format differences until proven otherwise:

```
one API uses fields          one API uses paths
one API uses functions       one API takes StandardSchema
```

**VALIDATION MAY ITSELF SPLIT.** "One canonical authority" means ONE OWNER PER
SEMANTIC RESPONSIBILITY, not one giant subsystem:

```
VALIDATION POLICY     which rules apply to which semantic targets/dependencies
VALIDATION EXECUTION  run sync/async rules against current truth
VALIDATION RESULT     errors / validity / pending derived projection
FORMAT ADAPTERS       Standard Schema, Angular validator fns, custom validators
```

That shape would let Standard Schema survive WITHOUT `@signaltree/schema` being
a second authority. The evaluator itself may also belong outside SignalTree.
Both open.

#### A. THE FUNCTION INVENTORY — derived with names hidden

```
DECLARATION      how are rules attached to semantic state?
EVALUATION       who runs them, against what truth?
DERIVED STATE    who owns errors / valid / invalid?
DEPENDENCY       how does a rule know it must recompute?
ASYNC            who owns pending / cancellation / staleness?
COMPOSITION      how do field, subtree and whole-graph rules combine?
EXTERNAL INTEROP how do Angular forms systems consume the result?
```

#### B. MEASURED — the two current surfaces are NEAR-ISOMORPHIC

```
form() / FormSignal                    @signaltree/schema
--------------------------------       ----------------------------------
valid:      Signal<boolean>            isValid:   Signal<boolean>
errors:     Signal<Partial<Record<     errors:    Signal<Readonly<Record<
              keyof T, string|null>>>              string, string|null>>>
errorList:  Signal<string[]>           errorList: Signal<readonly string[]>
validate(): Promise<boolean>           validate():     Promise<boolean>
validateField(k): Promise<boolean>     validatePath(p): Promise<boolean>
—                                      pending / pendingPaths / isPendingAt
—                                      errorsAt / isValidAt / schemaFor /
                                       boundPaths / compact
```

**Same concept, two vocabularies.** Differences that might be SEMANTIC rather
than historical packaging, and must be adjudicated rather than assumed:

```
SCOPE       form: keyed by field WITHIN one form (`keyof T`)
            schema: keyed by dot-path ACROSS the tree (`string`)
DECLARATION form: inline per-field validator functions
            schema: StandardSchema objects per path (Zod/Valibot/ArkType/…)
ASYNC       schema models pending explicitly; form exposes only a Promise
```

**DO NOT ATTACK THE SCOPE DIFFERENCE FIRST.** Both sides are
REPRESENTATION-SHAPED, and NEITHER is the kernel's semantic identity model:

```
keyof T    TypeScript object structure
dot-path   MUTABLE ADDRESS structure
PositionId semantic/topological identity   <- the kernel's actual model
```

So the greenfield question is not *"field scope or path scope?"* but:

> **What semantic THING is being validated, and what DEPENDENCIES may its rule
> have?**

**AND DO NOT PROMOTE `PositionId` INTO VALIDATION'S PUBLIC ONTOLOGY.** That
would be another nearby-kernel-structure promotion. The kernel may internally
compile a dependency such as *"`profile.name` depends on `profile.country`"*
into semantic identities while a rule author still writes something like
`validate(tree.$.profile.name, …)` or a schema object over a subtree. The
question is:

```
does validation need stable semantic dependency identity INTERNALLY?
NOT: should validation's PUBLIC ontology expose PositionId?
```

The answer may well be **internal YES / public NO.**

e.g. *validate position P using truth at P, Q and R*, or *validate subtree S
against current committed truth*. Both `keyof T` and dot-paths may vanish from
the internal model entirely — which is precisely the kind of thing this audit
exists to catch.

**FALSIFIER:** *can every required validation workflow be expressed through ONE
canonical authority without losing a genuinely distinct semantic capability?*
If yes, two owners are wrong. If no, state precisely why both exist and give
them NON-OVERLAPPING ownership.

#### C. A SEPARATE FUNCTION FOUND INSIDE `form()`

`FormSignal` bundles validation with something else entirely:

```
VALIDATION        valid, errors, errorList, validate, validateField
FORM-SESSION      dirty, touched, submitting, touch, touchAll, reset, clear,
                  patch, wizard
```

Form-session state is **not validation**, and under the Rule 0i amendment it may
be none of the five roles.

**AND IT IS NOT ONE COHERENT FUNCTION EITHER.** Do not treat the leftover bundle
as a single surviving thing:

```
dirty / touched      interaction / session concepts
submitting           process state
wizard               workflow / navigation
reset / clear / patch operations
```

Those may each have different owners. So the question after validation is
resolved is NOT *"does the remaining form-session bundle justify `form()`?"* but:

> **What INDEPENDENTLY REQUIRED functions remain inside the historical form
> bundle?**

`form()` may disappear even if several of its functions survive elsewhere.

#### D. ANGULAR STAYS STRICTLY DOWNSTREAM — with one nuance

The RF-M1 contamination finding (`formGroup`, `formControl`, `angularErrors`,
`asyncPending` written onto the marker) must be removed regardless of which
authority survives. But do NOT delete a concept merely for sitting next to
Angular baggage:

```
Angular FormControl/FormGroup refs   clearly ADAPTER-owned
Angular error representation         ADAPTER-owned
validation PENDING                   see below — three separate UNPROVEN questions
```

**"Schema already models pending as domain state" was TOO STRONG and is
retracted.** What is established is only that `@signaltree/schema` publicly
models pending as reactive derived state. That does not establish it belongs to
SignalTree's semantic truth. It may simply be OPERATIONAL STATE OF AN EVALUATOR:

```
truth -> async validation process -> pending / result
```

And there is a reason for active suspicion: undo/redo/rollback should almost
certainly NOT treat *"a validator promise is currently unresolved"* as authored
domain history. Keep all three questions separate:

```
pending concept required?   POTENTIALLY
owner?                      UNPROVEN
part of semantic state?     UNPROVEN
```

Current public visibility must not promote its ontology.

#### E. SEQUENCING — `form()` is NOT audited yet

Its survival is entangled with this row. If validators are the only semantic
content left in `form()`, assigning validation ownership may collapse most of
the marker's reason to exist — so auditing it now would test it against
semantics that may move.

```
NOW    validation ownership      -> canonical validation semantics
THEN   form() marker survival    -> what remains after validation is assigned?
                                    (form-session state is the live candidate)
THEN   realtime R0
```

**RF-M1's lesson generalized:** the adapter did not need "form-ness", it needed
VALIDATION METADATA. Accidental coupling of that kind is exactly what this audit
exists to expose.

### RULE 0g DERIVATION — Reactive Forms interoperability — **RESULT: REDESIGN / MOVE**

First full application of Rule 0g. Requirement stated with the existing name and
mechanism withheld:

> A supported Angular application using Reactive Forms must interoperate a
> SignalTree-backed state model with `FormGroup`/`FormControl` **without
> creating a second authority for application truth.**

**THE DECIDING FALSIFIER:** does this require CHANGING THE SEMANTIC CAPABILITIES
of a SignalTree, or merely ADAPTING between Angular's forms model and an already
published SignalTree realization?

**MEASURED — it is purely adaptive.** The implementation is bidirectional sync
and nothing else:

```
createFormGroupFromValues(...)                 build FormGroup from marker values
formGroup.valueChanges.subscribe -> set(...)   FormGroup  -> SignalTree
effect(() => syncSignalToControl(), {injector}) SignalTree -> FormGroup
```

No new semantic capability is added to the tree. **So the enhancer is the wrong
owner.**

#### Three findings that make this conclusive, not merely stylistic

**1. It requires an Angular INJECTION CONTEXT the enhancer cannot guarantee.**
It imports `inject`, `Injector`, `DestroyRef`, and its config carries escape
hatches — with this comment:

> *"Injector for reactive FormSignal -> FormGroup sync (auto-injected if in
> injection context). **Without one, signal-side writes only reach the FormGroup
> at creation time.**"*

A tree-mutating enhancer applied via `tree.with(...)` may run anywhere, so the
integration **silently degrades to one-way** when the context is absent.
**CORRECTED WORDING:** an Angular-owned adapter can make Angular
lifecycle/injection context an EXPLICIT CONSTRUCTION REQUIREMENT, whereas a
generic tree enhancer cannot assume one. (Not "always has it by construction" —
that overstates it and does not need to be true for the argument to hold.) The
escape hatch is a symptom of the wrong owner, not a convenience.

**2. Lifecycle owner is mismatched.** Cleanup keys on `DestroyRef` — Angular
injector/component lifetime. The enhancer attaches to TREE lifetime. Those are
different lifetimes, and the tree's is usually longer.

**3. Cardinality is wrong — REINFORCING evidence, not foundational.** Findings 1
and 2 already convict the enhancer form; this row would need an independent
requirement for multiple simultaneous `FormGroup`s over one subtree to carry
weight on its own. `formBridge: Map<string, AngularFormBridge>` keyed by path is
SINGLETON STATE ON THE TREE. Two components each wanting their own
`FormGroup` over the same `form()` marker — a routine Angular scenario — collide.
The natural cardinality of a forms binding is PER COMPONENT, not per tree.

#### The eight questions

```
1 synchronization owner  BIDIRECTIONAL, and the write-back must go through the
                         canonical SignalTree write path — never a second authority
2 what is truth          FormGroup carries UI state (dirty/touched/pristine) that
                         must NOT enter SignalTree semantics. Only VALUES cross.
3 identity needed        public node accessors suffice — no PositionId, no
                         realization identity. Evidence for adapter, not kernel.
4 topology change        UNRESOLVED — entity add/remove/rekey under a bound form.
                         Must be answered by whatever owns the adapter.
5 validation owner       TWO independently-owned systems bridged explicitly;
                         `@signaltree/schema` already owns its side
6 must it be tree.method()?  NO. Nothing measured requires `tree.getAngularForm(p)`
                         over `createReactiveFormsAdapter(node, …)`
7 multiple FormGroups?   YES, legitimately -> tree-attached singleton bridge state
                         is inherited architecture (see finding 3)
8 lifecycle owner        Angular injection context / component — NOT tree lifetime
```

#### Disposition

```
FUNCTION       SignalTree <-> Reactive Forms interoperability          KEEP
CURRENT FORM   tree-mutating enhancer + AngularFormsMethods +
               tree-attached bridge Map                                DELETE
GREENFIELD     Angular-owned adapter over SignalTree publication /
FORM           node accessors, with Angular lifecycle ownership        KEEP
DISPOSITION    REDESIGN / MOVE TO OWNER
```

```
                  DERIVED                          CURRENT
SignalTree NodeAccessor /             tree.with(formBridge())
  published Angular view                 -> mutates realization
   <-> Angular-owned RF adapter          -> adds getAngularForm() + Map
   <-> FormGroup / FormControl           -> hopes for an injection context
```

**WHICH SIDE OF THE PUBLICATION BOUNDARY the adapter consumes is NOT PROVEN.**
Question 3 concluded public node accessors suffice — so forcing the adapter
through an Angular publication abstraction could itself be an unnecessary layer.
Left open deliberately.

**CONSEQUENCE FOR #4a — `formBridge` must NOT be migrated to
`Enhancer<TAdded>`.** That would convert a form this derivation concludes should
not survive, purely to enable deleting the realization overload. Rule 0h: the
deletion procedure does not get to drive the ontology.

**STILL OPEN, and honestly so:** question 4 (topology change under a bound form)
is unanswered by either design, and the derived adapter's exact surface is not
specified — this slice establishes OWNERSHIP, not API.

#### RF-M1 — does Reactive Forms interop justify the `form()` MARKER?

Removing the enhancer while preserving the same architecture one level down in
the marker would be a hollow win. Null assumption: **no `form()` marker exists.**
Can an Angular-owned adapter implement the complete function from an arbitrary
suitable `NodeAccessor<T>`?

**MEASURED — everything the bridge takes from the marker:**

```
formSignal()                              read values      -> NodeAccessor gives this
formSignal.set(formValues)                write values     -> NodeAccessor gives this
formSignal.valid                          validity signal  -> DERIVED from validators
mergeMarkerValidators(formSignal, …)      VALIDATORS       -> the ONLY real dependency
```

**ANSWER: values need no marker. The marker contributes exactly ONE thing —
DECLARED VALIDATION RULES attached to the position.**

So Reactive Forms interop does not depend on "form-ness" at all. It depends on
*"where are this subtree's validation rules?"* — **a VALIDATION-OWNERSHIP
question, not a forms-interop one.** And validation already has a second owner in
`@signaltree/schema`, so 15.0 currently has TWO validation systems and the forms
adapter is coupled to one of them by accident of history.

**WORSE — the bridge CONTAMINATES the semantic marker with Angular objects:**

```ts
(formSignal as …)['formGroup']     = …
(formSignal as …)['formControl']   = …
(formSignal as …)['angularErrors'] = …
(formSignal as …)['asyncPending']  = …
```

Angular presentation state written onto a SignalTree semantic marker. That is
the contamination Rule 0i's marker test forbids, happening in the opposite
direction from the one anticipated.

```
RF-M1 RESULT   Reactive Forms interop does NOT justify `form()` as a marker
               -> sever the architectural dependence
               -> `form()` faces its own MUT-0 survival audit on whatever
                  semantics genuinely remain (validation declaration? dirty?
                  submission?), inheriting NOTHING from forms integration
```

**This does NOT delete `form()`.** It may independently own real semantics. It
simply may not inherit survival from Reactive Forms integration.

### SUBTRACTION TEST — `formBridge` — **FUNCTION SURVIVES; FORM UNPROVEN**

Pulled forward as a cheap functional falsifier: delete it and ask what capability
disappears that `signalForm` cannot provide. It was expected to be an obsolete
pre-Signal-Forms bridge. **It is not**, and the evidence is the project's own
documentation.

```
CONSUMERS   exactly ONE real call site —
            apps/demo/.../form-marker-demo.component.ts:357
            everything else is README prose and code-sample STRINGS
```

That count alone would have looked like a deletion. It is not, because:

```
signalForm()   Angular SIGNAL FORMS   requires @angular/forms/signals, Angular 22+
formBridge()   Angular REACTIVE FORMS interop (FormGroup), Angular 20/21
```

The demo states it outright: *"Requires Angular 22+ (`@angular/forms/signals`).
The classic `formBridge()` (Reactive Forms) remains available for Angular 20/21
apps."* And the peer range is `^20 || ^21 || ^22` on both `core` and `ng-forms`.

**These are two DIFFERENT Angular form systems, not old and new versions of one.**
`formBridge` provides `getAngularForm(path)` and a `Map` of `AngularFormBridge`
— FormGroup interop — which `signalForm` does not and cannot provide on Angular
20/21.

```
FUNCTIONAL FALSIFIER
  workflow lost if deleted?      YES — Reactive Forms interop on Angular 20/21
  signalForm covers it?          NO  — different API, requires Angular 22+
  only demos/tests/docs?         NO  — the function is real; the low usage count
                                       reflects the demo having one page per
                                       feature, not disuse
```

**LESSON — the subtraction test earned its place by REFUTING a deletion.** One
consumer plus "it looks superseded" was a deletion-shaped story. The audit's
value is symmetric: it must be as willing to find a real function as to delete a
mechanism, or it becomes a demolition process with extra steps.

**THE REAL QUESTION IT EXPOSED, which is a genuine 15.0 product decision:**

```
Does SignalTree 15.0 support Angular 20/21, or require 22+?

supports 20/21  -> formBridge is REQUIRED; deleting it removes forms interop
                   for the majority of the supported range
requires 22+    -> formBridge's reason to exist evaporates and it becomes a
                   real DELETE candidate
```

The peer range currently says `^20 || ^21 || ^22`. **DECISION REQUIRED — the
supported Angular range is a release-scope question, not a cleanup.**

**CORRECTION UNDER RULE 0g — my "KEEP" verdict conflated FUNCTION with FORM.**
The subtraction test proved the function is real. It proved nothing about the
abstraction. Rule 0g step 2 has not been run:

```
FUNCTION      Angular Reactive Forms integration for the supported range
              -> SURVIVES (subject to the Angular-range decision)
CURRENT FORM  an ENHANCER that mutates a tree to add `AngularFormsMethods`
              and a `Map<string, AngularFormBridge>`
              -> UNPROVEN

KERNEL-NATIVE QUESTION, NOT YET ASKED:
  given the 15.0 kernel and no prior API, would Angular forms integration be
  built as a tree-mutating enhancer at all — or as an ADAPTER over published
  realization?
      Angular forms adapter  <->  published SignalTree realization

DISPOSITION   REDESIGN CANDIDATE, not KEEP
```

If the kernel-native answer is an adapter, then the enhancer form is wrong even
though the functionality is valuable — and that is exactly the case `REDESIGN`
exists for. It also bears directly on #4a: forcing `formBridge` through
`Enhancer<TAdded>` would then be migrating a form that should not survive.

### REALTIME FUNCTION RESET — start at R0, OWNERSHIP

Do not begin by asking what realtime needs. Ask whether it is SignalTree's
concern at all — a package name is itself inherited architecture.

```
R0  does optimal SignalTree promise ANY remote-state semantics?
    NO  -> realtime is an integration/product OUTSIDE SignalTree semantics,
           and its needs MUST NOT shape the kernel
    YES -> state exactly which remote guarantee SignalTree owns
```

Only then choose among four DIFFERENT PRODUCTS:

```
A  STATE CONVERGENCE     eventually make remote equal surviving committed truth
B  CHANGE PROPAGATION    transmit eligible committed changes efficiently
C  OPERATION REPLICATION transmit semantic operations, not resulting state
D  CAUSAL REPLICATION    preserve ordering, conflicts, identity, supersession
```

**SEMANTIC NECESSITY vs PERFORMANCE OPTIMIZATION — keep these apart.** If
convergence is the function, a delta may be a bandwidth optimization, not a
semantic requirement. This must never become "therefore SignalTree needs a
transition API".

**DO NOT ASSUME these are requirements:** deltas, `source`-based echo
suppression, remote-write metadata, or change notification. Echo suppression
especially — an optimal design might have the integration know which inbound
operation it submitted, or use causal/origin identity. The existing `source`
flag is not automatically the right concept.

Answer BEFORE reading the current protocol:

```
1 is remote sync a SignalTree responsibility at all?
2 what correctness guarantee is promised — eventual convergence, ordered
  replication, causal convergence, offline reconciliation?
3 is the transmitted unit semantically significant, or an optimization?
4 does realtime need causal MEANING, or only committed truth?
5 who owns conflict resolution — SignalTree, adapter, backend, application?
6 are remote writes ORDINARY semantic operations on arrival, or is there a
  special remote-write ontology?           <- avoids a parallel architecture
7 what does a third-party implementer need — transport adapter, serializer,
  conflict policy, commit notification?
```

Neither outcome implies a generic observer: "only committed truth" points to a
purpose-specific consequence; "genuinely needs causal operations" points to the
CAUSAL AUTHORITY.

### MUT-0 ROW 1 — SYNCHRONIZATION / INTEGRATION — **DRAFT PROPOSAL, NOT A DISPOSITION**

Deliberately NOT called "observation". Derived with current API names hidden
until step F.

#### A. REQUIRED FUNCTIONS — outcomes 15.0 must provide

```
A1  a non-kernel capability stays CORRECT as SignalTree truth changes
A2  durable storage reflects surviving committed truth
A3  Angular re-renders from published truth
A4  authored operations retain causal meaning (undo/redo/rollback)
A5  a capability may decline to act on changes it should ignore
```

Note what is NOT listed: "a subsystem is notified of mutations". That is a
MECHANISM, not an outcome.

#### B. WHICH FROZEN AUTHORITY ALREADY OWNS EACH

```
A2  governed persistence consequence      OWNED, frozen
A3  Angular publication                   OWNED, frozen (F2)
A4  causal kernel                         OWNED, frozen (F3)
A5  attribution on the semantic operation OWNED in principle — see E
A1  <- the only genuinely open row
```

A2-A4 need nothing new. They were never observation problems.

#### C. THE NULL DESIGN — assume NONE of it exists

Assume there is no generic observer, no mutation bus, no public write context,
and no leaf interception. Can A1 still be implemented?

**MEASURED — the shape exists:**

```ts
interface CausalTurn {
  readonly id: TurnId;
  readonly effects: readonly CausalEffect[];
  readonly participants: readonly PositionId[];   // <- AFFECTED SEMANTIC POSITIONS
  readonly state: TurnState;
}
```

**COMPLETENESS FALSIFIER — RUN, AND IT FAILS. My own draft is refuted.**

The draft claimed "affected semantic identity, transaction granularity and
settlement lifecycle ALL exist already". That is TRUE OF `CausalTurn` and FALSE
as a statement about ordinary truth changes. Measured:

```
new TurnStore()   constructed in exactly ONE place:
                  packages/core/src/enhancers/transactions/transactions.ts:926

TurnStore in lib/ zero construction sites — turns are NOT part of ordinary
                  tree construction
```

**`CausalTurn` is TRANSACTION-SCOPED, not tree-wide.** An ordinary
`signalTree()` leaf write produces no turn at all. So the model
`turn settles -> participants -> invalidate` does not see ordinary writes, and
`CausalTurn` is a TEMPTING NEARBY STRUCTURE rather than a proven invalidation
source.

This is the same class of error the whole slice exists to prevent: I found a
structure that already had the right FIELDS and promoted it before checking its
COVERAGE.

**What survives, and ONLY as a scoped hypothesis:** invalidate by semantic
identity at a settled boundary, then reread truth. That is a
**SCHEMA / CURRENT-TRUTH-CONSUMER hypothesis**, NOT a universal SignalTree
architecture.

**Do NOT now hunt for "the real universal invalidation source".** That is the
same proximity trap one level up: having found `CausalTurn` insufficient, the
reflex is to look for whatever else emits affected positions for everything.
**There may correctly be no such thing.** A plausible optimal design has no
universal channel at all:

```
authored semantic operation  -> causal authority gets meaning
physical semantic commit     -> current-truth consumers invalidate
structural operation         -> topology/compiler invalidation
persistence                  -> governed consequence
realtime                     -> purpose-specific committed consequence
Angular                      -> publication
```

The completeness failure is itself evidence for this: one structure did not
cover everything because covering everything may not be one structure's job.

**COMPLETENESS REQUIREMENT, now explicit.** Before any invalidation source is
adopted, prove it covers every semantically meaningful way truth can change:

```
ordinary authored write          multi-position semantic transaction
speculative write                confirmation with no new value change
rollback                         confirmed undo / redo
derived / internal realization   hydrate / restore
structural entity operations
```

Some rows may correctly produce NO invalidation — but that must be a semantic
decision, not an accident of which enhancer happens to construct a store.

A dependent capability would then need no mutation stream:

```
turn settles
   -> participants: PositionId[]
   -> capability's dependencies on those positions invalidate
   -> capability READS CURRENT TRUTH from the tree
   -> derived state recomputed
```

**The event need not carry the value at all.** SignalTree owns truth (F1); a
mutation payload would be a second copy of it. Schema's measured requirements
confirm this — it already ignores `prev`, and `next` is obtainable by reading.

#### D. PUBLIC NECESSITY — if a primitive IS needed, at which level?

```
CORE-INTERNAL        certainly sufficient for A2/A3/A4
FIRST-PARTY PACKAGE  schema and realtime would consume A1. An internal shared
                     contract satisfies that WITHOUT a public protocol.
THIRD-PARTY SDK      UNPROVEN. No measured consumer. COUNTEREXAMPLE NEEDED:
                     an extension only a third party could write, requiring
                     position-level invalidation.
```

#### E. THE ONE CANDIDATE MISSING PRIMITIVE

**RETRACTED — "schema's irreducible requirement".** Previously this said
suppression by `intent`/`source` was schema's irreducible extra requirement.
That is a fact about the CURRENT IMPLEMENTATION, promoted to a derived
requirement. We have established only that today's schema reads those fields.
We have NOT established that optimal 15.0 schema should have a
suppression-by-source/intent concept at all.

**THE RULE THIS VIOLATED, now explicit:**

> Delete REQUIREMENTS as aggressively as we delete MECHANISMS. A legacy
> requirement preserved uncritically is as damaging as a legacy mechanism, and
> harder to see — it arrives wearing the words "we need".

`CausalTurn` carries `id`, `effects`, `participants`, `state` — no attribution.
Whether anything SHOULD is downstream of a function question nobody has asked.

```
MINIMUM MISSING PRIMITIVE (stated without reference to current APIs)

  attribution of a settled semantic operation must be readable by whatever
  decides whether a dependent capability should react to it.
```

**DO NOT conclude "therefore it belongs on the turn".** That would repeat the
error above — attaching metadata to whichever structure is nearby. The
attribution's SEMANTIC OWNER AND GRANULARITY are unresolved:

```
could ONE semantic transaction contain changes with DIFFERENT
source / intent / suppression policy?
```

If yes, turn-level attribution is too coarse. Candidate owners — semantic
operation, individual instruction, causal effect, transaction — are all open.
**MUT-2 must DERIVE the owner, not inherit it from proximity.**

#### F. ONLY NOW — the existing forms, and provisional dispositions

```
interceptLeafSignals    finds Angular signals and wraps their setters.
                        CORRECTION: this does NOT categorically contradict
                        F1/F2. Angular IS permitted to observe Angular
                        realization — that is its ownership. The narrower and
                        correct argument:
                          as a NEUTRAL SEMANTIC AUTHORING primitive
                            -> very likely DELETE: it derives semantic change
                               from framework realization rather than from
                               SignalTree-owned truth
                          as an ANGULAR-LOCAL implementation technique
                            -> judge independently, by function
                        Otherwise Rule 0e degenerates into "no code may ever
                        look at a signal".              -> DELETE CANDIDATE

PathNotifier /          global process-wide mutation bus; flattens
getPathNotifier         MutationEnvelope into 8 positional args; requires
                        consumers to filter foreign trees. Global authority in
                        a tree-owned architecture.  -> INTERNALIZE or DELETE

write-context APIs      raw ambient write context. If attribution belongs on
                        the turn (E), owning subsystems receive it directly and
                        no consumer needs the raw context. -> INTERNALIZE
                                                              (provisional)

MutationEnvelope        the RICHEST existing shape, and the one closest to
                        being unnecessary — a turn already names participants,
                        and truth is readable.        -> likely INTERNAL only
```

**PROVISIONAL ROW-1 RESULT — all weakened to CANDIDATE pending the falsifiers:**

```
generic PUBLIC mutation observation    NOT-NEEDED CANDIDATE (strong)
leaf interception                      DELETE CANDIDATE (strong: observes
                                       framework realization, contradicts
                                       F1/F2; zero application usage)
public mutation bus                    DELETE / INTERNALIZE CANDIDATE
public write context                   INTERNALIZE / REPLACE CANDIDATE
MutationEnvelope                       INTERNAL IMPLEMENTATION CANDIDATE —
                                       explicitly NOT delete-on-the-strength-of
                                       turn participants. A structure can be
                                       wrong as PUBLIC authoring abstraction
                                       and exactly right internally for
                                       physical/causal machinery.
invalidation source                    UNPROVEN — NOT CausalTurn
attribution owner                      UNPROVEN — do not assume the turn
```

**"No event needs values" is NOT frozen.** It holds for capabilities deriving
from CURRENT TRUTH. It would not hold for recording "A -> B happened", sending
a delta to a replica, or an incremental transformation that cannot be
reconstructed. Keep only the weaker rule: *current-truth consumers should not
receive copied state unless proven necessary.*

**COUNTEREXAMPLES THAT WOULD OVERTURN THIS:**

```
X1  a capability that CANNOT recompute from current truth and must see the
    transition itself (before/after)
X2  a capability needing per-physical-commit granularity (contradicts F8+F9)
X3  a third-party extension that cannot be written without a public hook
X4  attribution that cannot live on the turn without breaking causal semantics
X5  a capability needing to REFUSE — none measured; schema is observe-only
```

#### FUNCTION RESET — runs BEFORE X1

X1 as previously written still assumed several EXISTING feature requirements are
requirements of the optimal design. Reset each candidate's function first,
ignoring its current API and protocol:

```
REALTIME    what must optimal 15.0 realtime ACCOMPLISH?
            "make remote state converge to surviving committed truth"
              -> current truth may suffice
            "replicate semantic operations preserving concurrency meaning"
              -> operation/delta information is probably fundamental
            These are DIFFERENT PRODUCTS with different information needs.
            Derive from the intended function, never from what the current
            implementation happens to send.

DEVTOOLS    SEPARATE THESE FIRST — they may not be one capability.
vs AUDIT    inspector: show current state + diagnostics -> current truth
            audit:     immutable "A -> B happened" provenance -> transitions
            Even if audit needs transitions, it may consume CAUSAL RECORDS or a
            dedicated audit consequence — not a generic mutation stream.

SCHEMA      what must validation ACCOMPLISH?
            Does optimal schema have source/intent suppression AT ALL?
            If it survives, derive its SEMANTICS from the product function
            before worrying about timing.
```

#### X1 SPLIT INTO THREE CLAIMS OF INCREASING STRENGTH

Binary X1 permits the bad inference *"realtime needs A->B, therefore SignalTree
needs a public mutation observer"*. Split:

```
X1a  does ANY legitimate non-causal capability require historical TRANSITION
     information rather than current truth?
X1b  if yes, must it come from a SHARED semantic mechanism, or can its owning
     subsystem receive it through a PURPOSE-SPECIFIC integration?
X1c  if a shared mechanism is needed INTERNALLY, must THIRD-PARTY implementers
     have PUBLIC access to it?
```

A capability needing transitions can still land as
`semantic commit authority -> purpose-specific consequence` with **zero public
observer API**, preserving the null design at the SDK level. Only X1c reaching
"yes" creates public surface.

**AND NOT WITH `timeTravel`.**

`timeTravel` is a CONTAMINATED candidate: it IS the authority that owns causal
history, so of course undo needs before/after. That proves only "causal history
needs transition information", which is already frozen — and using it would
falsely resurrect `MutationEnvelope` as a public concept because the causal
kernel needs data that belongs INSIDE the causal kernel.

Attack X1 from OUTSIDE the owning authority:

```
realtime        does outbound sync need the transition/delta, or can it
                serialize current committed truth?
devtools/audit  is there a promised function that must say "A -> B happened",
                rather than display current truth?
schema          does any validation behaviour depend on the TRANSITION rather
                than final truth + operation policy?
```

**SCHEMA'S REAL FALSIFIER IS SUPPRESSION TIMING, not `prev`/`next`.** Given

```
T1 changes P7 with "suppress schema"
T2 changes P7 normally
```

and coalesced invalidation, "P7 changed -> eventually reread truth" is ambiguous
between: do not validate the value produced by T1; do not SCHEDULE validation
because of T1; or keep the previous verdict until an eligible operation occurs.
Those differ when T2 arrives quickly. That schema ignores `prev` does NOT prove
identity + current truth + policy reproduces its function.

#### Not yet: running the demo

Runtime exercise would characterize CURRENT BEHAVIOUR more richly, which is
precisely what must not define the architecture. Defer it until a function
SURVIVES MUT-0 and we need to characterize what that surviving function must
preserve.

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

**REVISED — the phase conclusion and the public-surface conclusion are separate
claims, and only the first is derived.**

```
FROZEN-DERIVED     refusal, if it exists at all, must occur during PREPARE
UNPROVEN           that any PUBLIC PREPARE participation API should exist
```

F4/F5 constrain WHERE refusal can happen. They say nothing about whether an
external plugin protocol is required there. If SignalTree itself, schema
compilation, or another built-in semantic subsystem performs all necessary
refusal during PREPARE, no public tier is needed. No current consumer requires
it: schema is observe-only by design, guardrails is a diagnostic.
COUNTEREXAMPLE NEEDED: a real authoring case that must PREVENT a write rather
than report on it.

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

**REVISED — separating what F8+F9 prove from what they do not.**

```
FROZEN-DERIVED  the semantic transaction boundary is the EARLIEST COHERENT
                point at which committed truth could be consumed without
                exposing heterogeneous physical commits
UNPROVEN        that any general PUBLIC consumption API should exist there
```

F8 + F9 establish a property of the LIFECYCLE: a semantic transaction may span
several private commits, and no external consumer may observe an intermediate
heterogeneous state — so anything consuming committed transitions must respect
transaction granularity, never per-substrate-commit. That is a real constraint.

It does NOT establish that the authoring SDK needs a public `CommittedObserver`.
The previous draft made exactly that leap. Whether ANY public API exposes this
boundary is MUT-0's question.

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

**REVISED CENTRAL RESULT.** The previous draft concluded "the SDK plausibly
needs one public tier". That was the premature step. Corrected:

```
internal lifecycle boundaries exist          YES, frozen
some subsystems must act at them             YES
ANY public participation API is required     UNPROVEN — possibly NONE
```

"None" must stay a live answer. The subsystems that react to committed truth may
each integrate with the authority that owns the information they need, with no
shared observation contract at all.

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

### ANG-V0 — the Angular question, run against the HARSHEST null — **CLOSED**

V0.6's reversal left exactly one open function: whether an ANGULAR-REACTIVE
VALIDATION PROJECTION must be owned by SignalTree's Angular layer.

The first phrasing was too generous. It named the candidate — "a general
Angular-reactive validation projection" — and asking whether that is required
already concedes that a SignalTree-owned projection OBJECT is the thing under
discussion. Starting from `validation.errors()` / `validation.isValid()` builds
the answer into the question. The null was hardened to:

> **ASSUME `@signaltree/schema` DOES NOT EXIST and SignalTree exposes NO
> validation-specific Angular API. What required Angular workflow becomes
> impossible?**

with the null implementation being ordinary Angular composition:

```
SignalTree publishes Angular-readable truth
            v
       Angular computed / effect
            v
  application-owned validator
            v
     validator-native result
```

Falsifier: **not** "a projection API is convenient" — a REQUIRED WORKFLOW that
cannot be implemented correctly without SignalTree-specific knowledge.

Evidence: `packages/core/src/lib/angular-validation-null.spec.ts`, 21 tests,
GREEN. The file may not import `@signaltree/core/authoring` for the null; the
one section that touches `interceptLeafSignals` does so to characterize it.

#### ANG-V0-A/B — sync

The null tracks every published write form: nested leaf `.set()`, branch
call-form, branch updater, root write, root read after a deep leaf write, and
leaf-scoped reads. It is also already PRECISE — it does not recompute for an
unrelated sibling write, does not recompute for a deep-equal write that never
landed, and a per-field projection recomputes only for its own field
(`nameRuns` stayed 1 while `ageRuns` went to 2).

This kills the strongest sync argument, which was that SignalTree knows WHICH
PATHS a write touched and plain `computed` does not, so the null must
over-validate. Measured: it does not.

#### ANG-V0-C — async, tested separately so it could not rescue the abstraction

The question was never "is manual async validation annoying". It was whether
correct async validation needs information only SignalTree can provide.

An `effect` + an evaluator-local generation counter, owned entirely by the
consumer, handles out-of-order resolution correctly: three runs dispatched
(initial, W1, W2), resolved newest-first, stale verdicts discarded, final state
`verdict-for-second`. Pending/settled fall out as ordinary Angular signals.

Same async ownership result V1 already established, now confirmed in the
Angular-reactive case. No SignalTree semantic primitive was required.

#### ANG-V0-D — is any truth change invisible to the pull surface?

The real reason `@signaltree/schema` exists in its current form is that it does
NOT use `computed`. It attaches `interceptLeafSignals` and validates PUSH-side.
So: is there validation-relevant truth that changes without notifying the
Angular read surface?

Measured across marker classes: `entityMap` CRUD, `status` transitions and
`form`-marker field writes are ALL visible to a plain `computed`. A control
confirms a computed that reads nothing never recomputes, so the section is
falsifiable. A `status` marker projects its VALUE into the root snapshot
(`{ state: 'NOT_LOADED', error: null }`), so a whole-object validator receives
ordinary data, not a marker object.

**No candidate found.**

#### ANG-V0-F — the converse, and the decisive result

D found nothing invisible to pull. F asks the honest converse: does PUSH see
anything PULL misses?

```
CASE                                   PULL      PUSH
nested leaf write, depth 40            saw       MISSED  (seen === [])
lazily materialized node write         saw       saw     ('f299.a')
ARRAY-VALUED LEAF write                saw       MISSED  (seen === [])
entityMap CRUD                         saw       saw     ('rows')
```

**CORRECTED CLAIM.** "Push is a strict subset of pull" asserts a universal
set-theoretic relation the evidence does not reach. The measured claim:

> **In the tested mutation classes, Angular pull observation covered every case
> push covered, and additionally covered ordinary cases push missed. NO
> CAPABILITY ADVANTAGE FOR PUSH WAS ESTABLISHED.**

That is what the four rows support -- two misses, two parities -- and it is
sufficient, because the abstraction needed an advantage and has none. The
privileged mechanism is not more capable than the null, and its own docblock
says why: it
wraps `.set`/`.update` by WALKING THE TREE AT ATTACH TIME, with `maxDepth = 32`,
skipping built-ins and arrays. `computed` has no depth cap and no shape
snapshot; it subscribes to whatever it reads, when it reads it.

The array miss deserves naming. An array-valued leaf — `tags: string[]`,
`items: T[]` — is one of the most ordinary things an application validates, and
the interceptor reports nothing for it.

SCOPE OF THAT CLAIM: measured on `interceptLeafSignals` directly, from core.
`@signaltree/schema` was NOT executed here, so this is not yet a proven
end-to-end schema defect — but schema's continuous invalidation routes through
that callback, so it is the expected consequence.

#### ANG-V0-G — the forms adapter, which INVERTS the last candidate

Candidate 4 was that the forms adapters need a shared Angular validation
projection they cannot get from validator-native results. Measured against
`@signaltree/ng-forms/signals`, which is the only first-party consumer.

`applySignalTreeSchemas` reads exactly two things:

```
tree.schemas.boundPaths()        -> dotted paths
tree.schemas.schemaFor(fullPath) -> the raw StandardSchemaV1 the APP registered
```

then calls Angular's own `validateStandardSchema(field, schema)`.

It reads **`errors()`, `errorList()`, `isValid()`, `pending()`, `pendingPaths()`,
`errorsAt()`, `isValidAt()`, `isPendingAt()`, `validate()`, `validatePath()` —
NONE of them.** The entire validation-projection surface of
`@signaltree/schema` is UNUSED by SignalTree's own forms adapter. Angular Signal
Forms runs the validator itself.

Candidate 4 does not merely fail. It INVERTS: the adapter is already an existence
proof of the correct architecture — the application supplies validators, Angular
runs them, SignalTree publishes truth. The bridge treats `schemas()` as a
**path -> schema REGISTRY**, and that registry's content is the plain object
literal the application handed to `schemas({ schemas: { ... } })`.

The only genuinely tree-aware residue is WILDCARD EXPANSION — resolving
`items.*.name` against actual topology (`WILDCARD`, `compilePattern`,
`enumerateLeafPaths`). Name it honestly: that is PATH-PATTERN EXPANSION OVER
TREE TOPOLOGY, not validation. It is needed only because the registry is keyed
by path, and a bridge given the schema map directly could expand it against the
tree with no enhancer, no installation and no projection.

#### ANG-V0 — RESULT

```
@signaltree/schema PACKAGE                    DELETE
SignalTree validation API                     NONE
SignalTree Angular validation projection      NONE

Angular application
    observes SignalTree using Angular
    validates using its chosen validator
```

The continuous-Angular-projection requirement is DELETED, not relocated. The
package is not moved sideways into the Angular layer; it is deleted, and its
one first-party consumer is rewritten to take the schema map directly.

**WHAT THIS SECTION PROTECTS AGAINST.** "Angular owns observation" must never be
allowed to become "therefore SignalTree ships wrappers for every useful Angular
observation." Those are different claims. The first says Angular mechanisms are
the correct LAYER for observation. It does not make SignalTree responsible for
packaging every `computed`, `effect` or projection an Angular consumer might
want. Precomposed application code attached to a tree is the `formBridge`
failure pattern with computed validation state substituted for `FormGroup`s:

> useful behaviour != semantic capability != reason to hang methods on
> SignalTree.

Final ownership, no fourth owner required:

```
SignalTree     publish state so Angular can observe it
Application    compose computed/effect/resource over that state
Validator      judge the supplied value
Forms adapter  translate between Angular Forms and validator results
```

#### Consequence for the SCHEMA REGRESSION blocker below

The 25 RED schema tests and the leaf-realization root cause are now **MOOT AS A
RELEASE BLOCKER**. The package is deleted, not repaired. What survives from that
investigation is the CORE finding it exposed — ordinary leaf writes do not enter
a canonical semantic mutation pipeline — which belongs to MUT, not to schema,
and is where it was already filed.

#### Consequence for `form()`

`form()` now enters its audit with ZERO validation residue:

```
gone as justifications:
  Reactive Forms integration
  Signal Forms integration
  validation declaration
  validation execution
  validation results
  validation observation
```

Leaving only the underived historical bundle: `dirty`/`touched`, `submitting`,
`wizard`, `reset`/`clear`/`patch`.

**Do not audit `form()` as a unit.** Audit each function independently, then ask
at the END whether any surviving function requires CONSTRUCTION-TIME form
semantics. If none does, the marker dies even if several helpers survive
elsewhere.

## SCHEMA-DEL — EXECUTION BOUNDARY, derived before any production change

Rule 0h: the endpoint is frozen, so the order is ENDPOINT -> BLAST RADIUS ->
MIGRATE. Auditing `form()` while a dead package and its consumer wiring stay in
place would let deleted structure keep shaping the next audit.

```
FROZEN
@signaltree/schema                         DELETE
SignalTree validation API                  NONE
SignalTree Angular validation projection   NONE

NOT ALLOWED
recreating schemas() under another name    new validation registry
a new tree enhancer                        new validation result model
new observer / invalidation machinery      a generic topology utility
```

### THE DERIVATION — what is the minimum input the Signal Forms adapter needs?

The proposed replacement was `applySignalTreeSchemas(form, tree, schemaMap)`,
with wildcard expansion local to the adapter. Run hostile, the answer subtracts
further than that.

**MEASURED — Angular Signal Forms already has a first-class schema mechanism,
and this adapter already supports it.** `signal-form-schema.spec.ts` (3 tests,
pre-existing) exercises `signalForm(tree.$.profile, { injector, schema })` where
`schema` is Angular's own `SchemaFn`, calling Angular's own `disabled()` and
`validate()`. And `validateStandardSchema` — the function the deleted bridge
ends up calling — is an `@angular/forms/signals` export, not ours.

So the application already has, from Angular alone:

```ts
signalForm(tree.$.account, {
  injector,
  schema: (root) => {
    validateStandardSchema(root.username, z.string().min(3));
  },
});
```

**MINIMUM INPUT REQUIRED FROM SIGNALTREE: NONE.**

Therefore `applySignalTreeSchemas` and the `signalForm(tree, rootPath, subtree)`
overload are DELETED, not rewritten. **Do not build
`applySignalTreeSchemas(form, tree, schemaMap)`** — it would be a thinner
version of the same mistake: SignalTree packaging an Angular composition the
consumer can already write, which is the `formBridge` pattern one more time.

Supporting measurement — the deleted route was never load-bearing. The
`schemas()` call shape has exactly ONE test
(`marker-bridge.spec.ts:422`), and that test asserts only two-way binding
between the FieldTree and the subtree. **It never asserts that a validation
error surfaces.** Two-way binding comes from `toWritableSignal`, which the
marker route provides anyway.

### THE WILDCARD SUBTRACTION — asked, and it deletes too

> Does Angular Signal Forms actually require wildcard declarations like
> `items.*.name`, or is that convenience inherited from `schemas()`?

```
WILDCARD COVERAGE IN packages/ng-forms/src/signals/     ZERO
```

Never supported, never tested, on the Signal Forms side. Wildcard IS an
established product capability — but of the REACTIVE FORMS adapter, which is a
different consumer, and it does not come from `@signaltree/schema`:

```
packages/shared/src/lib/match-path.ts   matchPath(pattern, path), isGlobKey(key)
packages/ng-forms/src/core/ng-forms.ts  glob validator keys ('phones.*.value')
                                        LAZY MATCH-ON-DEMAND — no enumeration,
                                        no registry, no bound-path list
```

So schema's `compilePattern` / `enumerateLeafPaths` / `matchLeaf` is a SECOND
implementation of a capability that already ships elsewhere, in a worse shape
(eager registry vs lazy match). **Deleting `@signaltree/schema` deletes a
duplicate, not a capability.** Nothing is extracted, nothing is generalized, and
no topology utility is created — the surviving implementation is the one already
in use by the adapter that actually has the requirement.

`boundPaths()` and `schemaFor()` existed only because the enhancer compiled a
path registry. The registry dies with the enhancer.

### EXECUTION PLAN — one bounded migration, its own commit

```
1  remove the @signaltree/schema package, workspace entry and path mappings
2  remove schemas() and its types / internals / tests
3  remove the schema dependency from consumers
4  delete the ng-forms/signals schema route; apps use Angular's own `schema:`
5  delete schema-specific release blockers
6  retain ONLY the independent MUT finding
7  run affected package tests / types / lint
8  commit as its own architectural boundary
```

Historical records — CHANGELOGs, `docs/audits/**`, `docs/research/**`,
`docs/rfcs/**` — are NOT rewritten. They record what was true when written.

### ONE EVIDENCE-HYGIENE RULE FOR THE NULL SPEC

`angular-validation-null.spec.ts` must NOT permanently contract the deficiencies
of `interceptLeafSignals`. The POSITIVE Angular-publication tests are the
durable result and stay. The ANG-V0-F negative characterization served its
evidentiary purpose the moment the deletion was decided, and a mechanism already
headed for hostile audit under MUT must not acquire accidental test-backed
legitimacy — a suite asserting `maxDepth = 32` behaviour is a suite that has to
be updated when the mechanism is deleted, which is backwards. F is therefore
marked EVIDENCE, SUPERSEDED and removed at execution; its four measured rows
survive in this ledger, which is where a one-shot measurement belongs.

## MERGE — DEFERRED PRODUCT QUESTION, with preconditions MEASURED

Raised as a forward-looking model, not a slice: if SignalTree gains divergent
causal histories, merging could be modelled on Git's ancestry + three-way merge
rather than on `merge(current, incoming)`.

```
             BASE                 base=A ours=B theirs=A  -> B
              |                   base=A ours=A theirs=C  -> C
        +-----+-----+             base=A ours=B theirs=B  -> B
        |           |             base=A ours=B theirs=C  -> CONFLICT
      OURS        THEIRS
        \         /
          MERGED STATE
```

The genuinely interesting part is SCOPE, not mechanism: Git merges text hunks,
SignalTree would merge SEMANTIC POSITIONS. `ours.users[42].name` vs
`theirs.users[42].age` need not conflict; with `entityMap`, editing entity 42
while another branch adds entity 73 need not treat the collection as one blob.

**CARRIED FORWARD — the narrow form, which is all that is claimed:**

> If SignalTree eventually supports divergent causal histories, model merging as
> ANCESTRY-AWARE RECONCILIATION, keep DETECTION separate from RESOLUTION, and
> allow resolution policy to vary by SEMANTIC SCOPE.

Three sub-claims worth keeping distinct, because they have different owners:

```
DETECTION    "these two semantic changes disagree"     engine, truth-bearing
RESOLUTION   "therefore ours wins"                     policy, replaceable
LEGALITY     "these histories cannot merge at all"     REFUSED, a third outcome
```

Keeping detection replaceable-independent is the load-bearing bit: a strategy
swap must not weaken the truth of conflict detection. And LAST-WRITE-WINS IS ONE
SELECTABLE POLICY, NOT THE DEFINITION OF MERGING. Equally, SignalTree must never
infer policy from type — seeing two numbers and deciding "numbers get summed" is
the domain owner's call, never the framework's.

Also carried: a conflicted merge should NOT immediately become canonical truth.
Git's conflicted index is the right precedent — a candidate merge is a value
OUTSIDE canonical state until committed.

### PRECONDITIONS — MEASURED AT HEAD, and they do not hold

Before any of this is designable, three-way merge needs a merge base. Measured
rather than assumed:

```
CausalTurn = { id, effects, participants, state }
                              causal-runtime/causal-types.ts:30

ANCESTRY GRAPH        ABSENT      no parent / ancestors field on CausalTurn
MERGE BASE            NOT COMPUTABLE
DIVERGENT LINEAGE     ABSENT      TurnStore holds ONE linear
                                  `orderedConfirmedTurnIds` and ONE
                                  `frontiers: Record<PositionId, TurnId>`
BASE DURABILITY       CONTRADICTED
REALTIME CONFLICT     ZERO        no conflict / lastWrite / authoritative
                                  vocabulary anywhere in packages/realtime/src
```

**The eviction finding is the sharp one, stated at exactly its true width.**
`TurnStore` is a CAPACITY-BOUNDED RING that evicts (`capacity`,
`onEvictConfirmedTurn`, and a `'history-evicted'` failure reason on both
pending-turn transitions). The base is by definition OLD -- it is the point
BEFORE the divergence -- so the longer branches live, the more certain its
eviction becomes. The requirement this proves:

> **The current bounded `TurnStore` cannot serve as durable merge ancestry.
> Three-way merging would require an INDEPENDENTLY RETAINED ancestry/base
> concept whose lifetime is NOT governed by the reversible-history capacity.**

**It does NOT prove `merge support -> unbounded TurnStore`.** That inference is
unestablished and must not be smuggled in later. A separately justified design
could retain parent ids, checkpoint identity, a base snapshot or hash, or a
compacted causal summary while still evicting detailed reversible turns. What is
ruled out is only reusing the reversible-history window AS the ancestry.

`frontiers` deserves LESS credit than "exactly what divergence detection
compares". A `PositionId -> latest TurnId` map is potentially useful input, but
WITHOUT ANCESTRY IT CANNOT DISTINGUISH SUCCESSION FROM CONCURRENCY. Given only

```
ours[P]   = T41
theirs[P] = T57
```

nothing answers whether T41 is an ancestor of T57, T57 of T41, or neither -- so
these two shapes are indistinguishable:

```
linear evolution          divergence
T41 -> ... -> T57              Tbase
                               /   \
                             T41   T57
```

Different latest-turn ids are not evidence of divergence. That is a constraint
for realtime, not just for merge.

### TWO DEFECTS IN THE SKETCH, named now so they are not inherited

**1 — the rule address silently picks the one identity kind that cannot cross.**

```ts
rules: [{ at: tree.$.preferences, resolve: 'theirs' }]
```

`tree.$.preferences` is a live NodeAccessor from OUR tree — a REALIZATION HANDLE.
The entire premise of merging is that the two sides diverged, so a rule must
address a position in a tree it is not attached to. Under the frozen invariant
`PositionId != SubjectId != SlotIndex != key/path`, a realization handle is the
one address with no meaning on the other side. Any future merge API must choose
its address kind DELIBERATELY and say which of the four it is; the ergonomic
spelling is what makes this easy to get wrong.

**2 — "the kernel makes it possible" is not "SignalTree should ship it."**

This is the V0.6 trap verbatim, and it is worth stating explicitly one slice
after paying for it. A capability enabling something is not a requirement to
offer it. Merging is a PRODUCT DECISION gated on realtime/multi-writer
semantics actually demanding branching and reconciliation — and three-way
semantic merge is only one candidate product there, alongside CRDTs and
server-authoritative overwrite. The kernel should carry stable identity, causal
ancestry, atomic turns and canonical truth because THOSE are derivable; merge
POLICY is a different layer and must not be pulled into the kernel because it
would be convenient to have it there.

### ONE FALSIFIABLE HYPOTHESIS, worth tracking through MUT

> undo, redo, rollback, branch, merge and conflict resolution are all operations
> over ONE causal-history substrate, not five unrelated features.

As a description of HEAD this is FALSE, and measurably so: `new TurnStore()`
appears in exactly one place — `transactions.ts:926` — so time travel does not
run on the causal runtime, and history, transactions and time travel are three
separate mechanisms today. That makes the statement a DESIGN TARGET with a known
current truth value, which is the useful kind. If MUT's contract lands and those
features still cannot be expressed over the one substrate, the hypothesis is
refuted and the substrate is not what it claims to be.

**STATUS: DEFERRED. No API designed, no kernel requirement created.** Revisit
only when realtime product semantics establish that divergent histories exist.

## SCHEMA REGRESSION — **CLOSED AS MOOT.** Package deleted, not repaired

**The package is gone (SCHEMA-DEL EXECUTED). Nothing below is a release
blocker.** It is kept because the investigation produced one finding that
survives the deletion and belongs to MUT: *ordinary leaf writes do not enter a
canonical semantic mutation pipeline.* Read the rest as evidence for that, not
as work.


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

## VALIDATION LADDER — workspace test rung (rung retained; its trigger is gone)


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

## ~~BLOCKER #4a-2~~ — **VOID.** The 25 RED tests were deleted with the package


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

### 14.x disposition (Rule 0f) — MEASURED: 15.0 BEHAVIOURAL DIVERGENCE from 14.x, no 14.x patch

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

## SCHEMA-DEL — **EXECUTED**

The frozen endpoint, applied. One bounded migration, no new abstraction.

```
DELETED
packages/schema/**                      the whole package, 40 files
packages/ng-forms/src/signals/bridge.ts applySignalTreeSchemas
signalForm(tree, rootPath, subtree)     the schema overload
apps/demo/.../schema-demo/**            the demo page + route
docs/architecture/schema-enhancer-plan.md
docs/skills/using-signaltree/schema/**
```

Config followed the code out: `tsconfig.base.json` path mappings, ng-forms
`package.json` peer + peerDependenciesMeta + devDependency, its `tsconfig.lib`
paths and `jest.config` moduleNameMapper, the demo's asset-copy glob and
`project.json`, `lint-skills` resolver, `ship-skills` package list, the
AI-codegen benchmark library list and scorer, and the pnpm lockfile.

**NOTHING WAS RECREATED.** No `applySignalTreeSchemas(form, tree, schemaMap)`,
no registry, no wildcard utility. The demo, the ng-forms README and `llms*.txt`
now show the surviving pattern, which is ordinary Angular:

```ts
form(
  toWritableSignal(tree.$.user),
  (u) => {
    validateStandardSchema(u.name, z.string().min(2));
  },
  { injector }
);
```

`toWritableSignal()` is PUBLICATION and survives on its own terms. It is what
"SignalTree owns truth, Angular owns observation" actually looks like.

One consequence worth naming: the deleted overload was the only way to build a
Signal Forms `FieldTree` from a NON-MARKER subtree. That capability is not lost,
it is relocated to where it belonged — Angular's own `form()` over a published
writable signal.

### ANG-V0-F removed from the null spec, as required

The negative characterization of `interceptLeafSignals` is gone from
`angular-validation-null.spec.ts`; the 17 positive Angular-publication tests
remain. Its four measured rows live in this ledger. The mechanism's own docblock
in `intercept-leaf-signals.ts` now records that it lost its last external
consumer and shows no measured advantage over `computed`, and that it is queued
for hostile audit under MUT — a comment, not a test contract.

### VERIFICATION — by identity, not by count

```
core:test        1761 passed / 20 skipped / 1 todo    exit 0 ALONE
ng-forms:test    109 passed  (11 suites)              exit 0
demo:test        174 passed  (25 suites)              exit 0  <- was 4 FAILED
guardrails / realtime / events / shared                exit 0
lint  (all projects, + scripts separately)             exit 0
build core/ng-forms/guardrails/realtime/events/shared  exit 0, fresh artifacts
```

`demo:test` was the recorded baseline's only test-rung red — *"4 failed / 177
passed, all SchemaDemoComponent, same defect."* Those four died with the
component. **The workspace test ladder is now green.**

TWO PRE-EXISTING REDS, stated so they are not silently inherited:

```
core:test under PARALLEL run-many
  1 failed: production-scalar-substrate.benchmark.spec.ts
            "public undo-of-remove realizes through one incremental restore"
            10885ms — the documented Phase-5 flaky TIMING class. Green alone.

nx build demo
  4 TS errors, ALL in files this change never touched:
    form-marker-demo.component.html:600,625,627  FormHistoryApi
      'clearHistory' / 'history' do not exist
    packages/core/src/lib/types.ts:638           TS4114 missing 'override'
  Confirmed untouched via `git diff --name-only HEAD`; neither file imports
  the deleted package. Recorded BY IDENTITY so the next build compares
  diagnostics, not counts.
```

The `types.ts:638` TS4114 is worth a look on its own — a missing `override` in
core surfacing only through the demo's compiler settings is a real defect, just
not this one's.

## `form()` AUDIT — seven functions, INDEPENDENTLY

The field is cleared: no schema package, no SignalTree validation ontology, no
Angular validation wrapper, no Reactive Forms justification, no Signal Forms
justification. `form()` inherits nothing.

**The unit of audit is the FUNCTION, not `form()` and not "form session".**
Each gets the same seven rows, with the current implementation revealed LAST
(Rule 0g). Only after all seven dispositions are known:

> Did any surviving function establish an INTRINSIC SEMANTIC PROPERTY OF A
> POSITION that must participate in construction / compilation?

If not, `form()` the MARKER dies — however many useful helpers survive
elsewhere.

**`dirty` and `touched` are deliberately NOT paired.** Frameworks present them
together, which is exactly why the pairing must not be assumed:

```
dirty     a COMPARISON question   has value diverged from some baseline?
touched   an INTERACTION question has a user/UI interaction occurred?
```

Different questions, potentially different owners. Evidence for this section:
`packages/core/src/lib/form-function-audit.spec.ts` (TEMPORARY; deleted when the
dispositions freeze, same protocol as ANG-V0-F).

### AUDIT ROW — F1 `dirty`

```
FUNCTION       Report whether current values differ from a baseline the user
               would recognize as "saved" / "unchanged".
OWNER          Whoever owns the BASELINE. That is the application: only it knows
               when a save succeeded, when a draft was accepted, when a
               server-hydration is the new zero point.
GREENFIELD     const baseline = signal(tree.$.p());
MECHANISM      const dirty = computed(() => !eq(tree.$.p(), baseline()));
               ...and after a successful save: baseline.set(tree.$.p());
SIGNALTREE?    NO. It needs a value read and an equality function. The read is
               already published; the equality is the application's (deep,
               shallow, field-subset, ignore-whitespace are all legitimate and
               domain-dependent).
CONSTRUCTION?  NO -- and MEASURED to be actively harmful, see below.
```

**CURRENT FORM, revealed last.** `initial` is captured at CONSTRUCTION and never
moves:

```ts
const dirty = computed(() => {
  const current = valuesSignal();
  const eq = config.equalityFn ?? defaultEquality;
  return Object.keys(initial).some((k) => !eq(current[k], initial[k]));
});
```

**MEASURED — the marker exposes no way to move the baseline.** `markPristine`,
`commit`, `setInitial`, `setBaseline`, `rebase`, `markClean`: all `undefined`.

**MEASURED — the consequence is a defect, not a preference:**

```
marker.patch({ name: 'Ada' })          dirty() === true
await marker.submit(save)              save SUCCEEDS
                                       dirty() === true   <-- still
marker.reset()                         dirty() === false, name === ''
```

**After a successful save, the form is permanently dirty, and the only way to
clear it is to discard the saved work.** `form().dirty` does not mean "has
unsaved changes" -- the thing every form UI binds it to. It means "differs from
the values this tree was CONSTRUCTED with", and it cannot mean anything else,
BECAUSE the baseline is construction-time.

So construction time is not merely unnecessary for `dirty`. **It is the cause of
the defect.** The null also captures a baseline LATE -- after hydration, after a
server write, after any point the application decides is the zero -- which a
construction-time capture structurally cannot express.

```
DISPOSITION    F1 dirty -> DELETE from SignalTree.
               Function real, owner is the application, mechanism is
               `computed` over a published read and an app-held baseline.
               No SignalTree API, no marker, no construction-time capture.
```

One thing NOT concluded here: this says nothing yet about whether some OTHER
function needs construction time. F1 contributes one row to that question and
nothing more.

### AUDIT ROW — F2 `touched`

```
FUNCTION       Record that a user/UI INTERACTION occurred at a field, so errors
               show for fields the user has visited and hide for ones they
               have not.
OWNER          The interaction / session layer -- view or forms control.
               SignalTree has no inputs, no focus, no blur.
GREENFIELD     const touched = signal<Record<string, boolean>>({});
MECHANISM      const touch = (f) => touched.update(t => ({ ...t, [f]: true }));
SIGNALTREE?    NO
CONSTRUCTION?  NO
UNDO           Baseline truth-undo does NOT imply interaction-undo. Session
               rewind, if ever required, is a SEPARATE product capability.
```

Unlike F1 this is NOT derivable from values -- you cannot recompute "the user
focused this field". Derivability was never the question. The questions are who
writes it, and whether SignalTree's version buys anything.

**MEASURED — no SignalTree VALUE-WRITE path moves `touched`.** Stated at the
width of the experiment: the marker's principal write APIs were exercised, not
every conceivable internal path.

```
marker.patch({ name: 'Ada' })    touched -> { name: false, age: false }
marker.set({ age: 36 })          touched -> { name: false, age: false }
marker.$.name.set('Grace')       touched -> { name: false, age: false }
marker.touch('name')             touched -> { name: true,  age: false }
```

Inspection strengthens the measurement: `touch()` / `touchAll()` mutate
`touchedSignal` directly and are the only writers in the module. So the marker
holds a bag the application fills and reads, with no SignalTree semantics
attached to the contents. A plain `signal<Record<string, boolean>>({})` in the
component is the same object with one less indirection.

**MEASURED — the map shape is frozen at construction** from
`Object.keys(initial)`. The null is not shape-locked and can record
`'phones.0.value'` for a repeated row, a dynamically added control, or a field
the server sent late. Construction time is a CEILING here, not a capability.

#### The undo question — answered by OWNERSHIP, not by current failure

The marker's processor registration argues that `touched` must ride in the
snapshot:

> *"`touched` is restored for UNDO/REDO ... Undo must land the user exactly
> where they were, errors and all -- a cleaned-up undo is a lie about what they
> did."*

**THE ARCHITECTURAL ANSWER COMES FIRST, and it is independent of what the code
does today** (Rule 0g -- a current failure may not answer a product question):

```
1. user focuses Name       touched.name = true
2. user edits Name  A -> B
3. user clicks Undo        value B -> A
```

Should step 3 make it false that the user ever visited Name? **No.** They did
interact with it; reverting the value does not un-happen the focus. The same
holds for focus/blur/edit/undo-edit: undoing the edit does not mean the focus
never occurred.

```
value history        causal / state history      SignalTree
interaction history  UI / session history        the view
```

So baseline truth-undo SHOULD NOT rewind interaction state. A product that
genuinely wants SESSION REWIND -- "put the whole editing experience back
exactly as it was" -- is a separate compound capability needing explicit
session-history semantics (focus, scroll, cursor, selection, not just a boolean
map). It must not arrive by making `touched` part of ordinary SignalTree undo.

**SEPARATELY, and NOT as the architectural reason:** the current implementation
does not deliver the fidelity its comment claims. Measured on both paths:

```
setup   patch name='Ada'; touch('name')      -> { name: true,  age: false }
        patch name='Grace'; touch('age')     -> { name: true,  age: true  }

form({ history: history() }).undo()
        values   'Ada'                        CORRECT
        touched  { name: true, age: true }    NOT restored

.with(timeTravel()) -> tree.undo()
        values   { name: 'Ada', age: 0 }      CORRECT
        touched  { name: true, age: true }    NOT restored
```

Descriptively, why: `history()` records `project(ctx.read())` -- values only --
so the snapshot/hydrate pair that carries `touched` is not the path
`form({ history })` undo uses; it keeps its own buffer. And `touch()` /
`touchAll()` do not `announce`, `recordHistory` or `schedulePersist`, measured
directly: a `touch()` plus a `touchAll()` leave `tree.getHistory().length`
unchanged, so no entry ever exists at a distinct touched state. (Free
consequence nobody has claimed: a touch alone therefore never persists either.)

The `snapshot`/`hydrate` touched path is NOT dead -- it has exactly one
consumer, `applyState`, reached only from DEVTOOLS REPLAY
(`devtools-impl.ts:1444`), which passes mode `'restore'`. The comment is
accurate about a mechanism existing and over-claims about which operations use
it.

```
DISPOSITION    F2 touched -> DELETE from SignalTree.
               Function real and genuinely irreducible; owner is the VIEW.
               Undo ownership rejects the coupling on greenfield grounds, not
               because today's code fails.
```

#### 14.x disposition — decided from the 14.x contract, NOT from 15.0

Rule 0f exists to stop exactly the inference "15 deletes it, so skip the 14.x
defect". The earlier draft of this row made that error; corrected here. The
14.x question is asked on its own evidence:

```
A  comment wrong          patch the misleading documentation
B  behaviour wrong        repair if that is the promised 14.x contract
C  non-contractual        record why no customer-facing patch is required
```

**MEASURED, to choose between them:**

```
public docs claiming undo restores touched     NONE
  (README / llms.txt / llms-full.txt / skills: no such claim; the one
   llms-full hit is "password untouched", an unrelated sense of the word)
shipped type-level contract                     NONE
  FormSignal.touched documents only "Per-field touched state"
the claim's location                            an in-function source comment
emitted dist/packages/core/.../form.d.ts        0 occurrences
```

```
14.x DISPOSITION   C, with an A component.
                   No customer-facing patch: the claim is internal and
                   non-contractual, and no published surface promises
                   undo-restores-touched, so no consumer can be relying on it.
                   The misleading INTERNAL comment is still a real defect and
                   should be corrected in whichever 14.x line is live, because
                   the next maintainer will read it and believe it.
15.0 DISPOSITION   ARCHITECTURAL CUTOFF -- the marker goes, comment included.
```

B is rejected on evidence, not convenience: teaching 14.x history to record
interaction state would ADD the coupling this row just rejected on ownership
grounds.

### AUDIT ROWS — F3a `submitting` and F3b `submit()`

**The row was nearly mis-scoped.** `submit()` bundles three independent things:

```
1  operational lifecycle       submittingSignal.set(true / false)
2  validation orchestration    await validateAll()
3  application operation       await handler(valuesSignal())
```

Auditing only #1 would delete the flag and leave `tree.$.p.submit(handler)`
alive purely because it rode alongside it -- the exact pattern this audit keeps
finding in `form()`: **auditing the attached state while preserving the
convenience method that justified the state in the first place.** #2 is already
dead by validation ownership. #3 and the wrapper itself get their own row.

#### F3a `submitting`

Asked in the order that avoids the trap -- NOT "does `form.submit()` toggle a
flag", which answers nothing:

> **What semantic fact does `submitting` represent, WHO CAN KNOW it became true,
> and does that fact describe SignalTree TRUTH or the LIFECYCLE OF AN EXTERNAL
> OPERATION?**

```
FUNCTION       Report that an operation which SENDS state somewhere -- an HTTP
               POST, an IPC call, a save -- is currently in flight.
OWNER          Whoever RUNS the operation. It is the only party that can know it
               started and the only one that learns it finished.
GREENFIELD     const saving = signal(false);
MECHANISM      try { saving.set(true); await save(v); } finally { saving.set(false); }
SIGNALTREE?    NO. SignalTree cannot observe an HTTP request. The subject of the
               operation may be tree values, but the FACT is about the
               operation.
CONSTRUCTION?  NO -- because nothing about submission lifecycle needs graph
               compilation or construction-time specialization of the position.
               Any value can be submitted by an external operation after
               construction.
```

**The construction-time reason is stated carefully.** "An in-flight boolean is
not a property of a position because the same position is submitting sometimes
and not others" was the earlier draft, and it is WRONG as a test: a marker may
declare an intrinsic semantic type whose runtime state changes -- `status()` is
exactly that shape. Changing state does not fail the marker test. Not needing
construction-time specialization does.

**MEASURED — the flag does not mean what its name says.** Only
`marker.submit()` sets it. An application that saves the very same values
through its own service leaves `submitting()` `false` throughout. So it does not
report *"a submission of this state is running"*; it reports *"one particular
API on this marker was called"* -- a fact about an API call, not about truth.

**MEASURED — one boolean cannot describe N concurrent operations:**

```
slow  = marker.submit(async () => { await blocked; return 'slow'; })
        submitting() === true
await marker.submit(async () => 'fast')
        submitting() === false   <-- while `slow` is STILL RUNNING
```

**CHARACTERIZATION, NOT JUSTIFICATION — `status()`.** Core's `status()`
distinguishes NotLoaded / Loading / Loaded / Error and carries the error, where
`submitting` is a boolean collapsing all four. That is *evidence that
`submitting` duplicates an already-recognized operational-state category*. **It
does not justify either abstraction.** `status()` is itself unaudited and does
not get a vote on what should exist; ownership of `submitting` is decided
independently, by who owns the external operation. The inference "legacy A
duplicates legacy B, therefore preserve B" is exactly what this audit rejects.

**PERSISTENCE EXCLUSION, stated at its true width.** The marker excludes
`submitting` from the snapshot, reasoning that restoring it would leave "a form
permanently submitting with nothing running to finish it". An earlier draft
generalized this to *"a field the marker will not persist because it does not
describe the state is a field that does not belong to the state"* -- **too
broad. Non-durability does not prove non-statehood**; plenty of legitimate
runtime state should not survive persistence. The narrow claim: persistence
exclusion is CONSISTENT with `submitting` being transient operational state
whose lifetime is coupled to an operation. **Ownership removes it from
SignalTree, not persistence.**

One argument checked and NOT found: `submit()` does not lock the marker, so
`submitting` is not a write-gate.

```
DISPOSITION    F3a submitting -> DELETE from SignalTree.
```

#### F3b `submit()` — the orchestration wrapper

> Erase `form()`, validation, `submitting` and the current implementation. A
> SignalTree-backed value must be sent through an application-owned async
> operation. What becomes impossible with `await handler(node())`?

Six candidates, none granted in advance.

**MEASURED — no latent SignalTree-specific capability is present in the current
wrapper:**

```
CAUSAL ATTRIBUTION   a submit records nothing; getHistory() unchanged under
                     timeTravel
WRITE GATING         the tree stays writable mid-submit; patch() lands
ERROR OWNERSHIP      a throwing handler propagates exactly as the null does, and
                     no error is retained (`submitError`, `lastError`: undefined)
CANCELLATION         `abort`, `cancel`, `abortSubmit`: undefined
AUTO STATE CHANGE    nothing transitions on success or failure
```

**Those five rows are ABSENCE EVIDENCE, not the architectural falsifier.**
"The current implementation does not do X" must never become "SignalTree should
never do X" -- a distinction that will matter directly when realtime introduces
genuinely causal external operations. What closes the row is greenfield
OWNERSHIP:

```
save / POST / IPC operation      operation owner
errors, cancellation, retries    operation owner
write locking during save        application workflow policy
snapshot timing                  application workflow policy
result-driven tree mutation      an explicit subsequent SignalTree write
```

No orchestration responsibility remains for SignalTree to hold.

#### VALUE-CAPTURE POLICY — the sharpest row, corrected

An earlier draft said the marker "decides wrongly" about when the value is read.
**That is not established, and it let current behaviour answer a semantic
question.** Both policies are legitimate:

```
CALL-TIME CAPTURE          user presses Save at T1 -> submit snapshot T1
POST-VALIDATION CAPTURE    user presses Save -> async validation -> submit
                           currently-valid truth at T2
```

Neither is universally correct. A draft editor may want exactly what was on
screen; a system validating against a moving server may want the currently-valid
value. Others are equally legitimate: reread immediately before send, or refuse
if truth changed meanwhile.

**MEASURED — the current wrapper silently picks one.** `submit()` reads
`valuesSignal()` AFTER awaiting validation, so a write landing between the
button press and the handler is included:

```
marker.submit(h)                 // user presses Save
marker.patch({ name: 'RACED' })  // a write lands during the await
handler receives                 name === 'RACED'
```

The null leaves the choice with the operation owner, who can capture at call
time, after validation, immediately before send, or refuse on change:

```
const submitted = save(tree.$.p());   // this app chose call-time
tree.$.p({ name: 'RACED' });
(await submitted).name === 'Ada'
```

```
NO SIGNALTREE INVARIANT ESTABLISHES ONE CAPTURE INSTANT AS CANONICAL.
Submission snapshot timing is APPLICATION / OPERATION policy.
```

That is the argument -- **SignalTree has no authority to choose the capture
instant**, so choosing one is an unearned policy commitment, not a capability.
The race is retained below as 14.x characterization, where it is genuinely
useful.

```
DISPOSITION    F3b submit() -> DELETE from SignalTree.
               With validation gone, submit() reduces to `await handler(node())`
               plus a capture-instant choice SignalTree has no authority to make
               and a flag whose owner is the operation.
```

**F3 IS THEREFORE A COMPLETE DELETION**, not merely the removal of a boolean.

**F3 FROZEN:**

```
F3a submitting
  FUNCTION      operational in-flight state
  OWNER         external operation owner
  SIGNALTREE    NO
  CONSTRUCTION  NO
  DISPOSITION   DELETE

F3b submit()
  FUNCTION      orchestrate an application-owned operation over tree values
  OWNER         application / operation
  SIGNALTREE    NO
  CONSTRUCTION  NO
  DISPOSITION   DELETE

SIGNALTREE DOES NOT CHOOSE submission snapshot timing, concurrency policy,
cancellation, error retention, or write gating. Those are operation / workflow
semantics.
```

#### 14.x dispositions, decided on 14.x evidence (Rule 0f)

**F3a concurrency -> `14.x DEFECT`** (promoted from DEFECT CANDIDATE once the
contract question was answered):

```
Does the 14.x contract forbid or serialize overlapping submit() calls?
  public docs (README / llms.txt / llms-full.txt)   NO STATEMENT
  JSDoc on submit()                                  NO STATEMENT
  runtime guard                                      NONE -- the call is accepted
  documented meaning of the signal                   "Whether form is currently
                                                      submitting"
```

Nothing forbids them and the API accepts them, so a signal documented as
"currently submitting" reading `false` while an accepted submit promise is still
unresolved is a clean falsifier. **The FIX is a separate decision** and is NOT
made here -- reference counting, serializing, and rejecting-while-active have
different observable semantics and need their own semver call on the 14.x line.

**F3b value coherence -> `14.x DEFECT CANDIDATE`.** Reading values after the
validation await is defensible as "submit what is valid now", and no public text
states which instant is submitted. Recorded with the evidence; the 14.x line
must decide whether the contract implies call-time capture.

### AUDIT ROW — F4 `wizard`

**INTEGRITY NOTE.** Rule 0g wants the current mechanism hidden until last. It
was not, here: the wizard implementation was read earlier in the same session
while inventorying `form()`'s surface. That is declared rather than papered
over, and the row is therefore built on STRUCTURAL MEASUREMENTS that do not
depend on recall.

The null:

> **No concept called "wizard" exists. An application has state, and a UI
> containing several views. What required capability becomes impossible?**

**The bundle is split BEFORE measuring**, so "wizard" cannot smuggle five
separately-owned things through as one:

```
current step                 where am I
allowed transition / guard   may I move
step ordering                what follows what
step completion              is this step done
next / previous              convenience over the above
```

#### The decisive measurement — is the step TREE STATE at all?

```
after goTo(1):
  wizard.currentStep()        1
  JSON.stringify(tree())      {"p":{"values":{...},"touched":{...}}}
                              NO step, NO currentStep, NO 'step' substring
```

**The step index is invisible to the tree's own value.** It is a private signal
that happens to be reachable through a marker. Two more measurements confirm it
is not tree state in any operational sense:

```
timeTravel undo    values rewind 'Grace' -> 'Ada'; currentStep STAYS 1
two next() calls   tree.getHistory().length UNCHANGED
```

So navigation is not persisted, not undone, not serialized, and not recorded.
**A wizard step already behaves as session/routing state that merely lives
inside the tree object graph.** Nothing has to be argued to move it out; it is
already out, in every respect except where the variable is declared.

#### Per-concept ownership

```
CURRENT STEP        Session / routing state. In a real app this is usually the
                    URL -- a step you cannot deep-link to or reload into is a
                    known UX defect, and SignalTree has no routing authority.
                    OWNER: router / session.   SIGNALTREE: NO

STEP ORDERING       A static list the application declares. `['one','two']` is
                    domain data, not tree structure.
                    OWNER: application.        SIGNALTREE: NO

ALLOWED TRANSITION  Workflow policy: "may the user leave this step". Depends on
                    completion rules the application owns -- and, in the current
                    design, on validation, which SignalTree no longer has.
                    OWNER: application.        SIGNALTREE: NO

STEP COMPLETION     "Is this step done" is a domain predicate over values. It is
                    `computed` over a published read, exactly like F1's dirty.
                    OWNER: application.        SIGNALTREE: NO

NEXT / PREVIOUS     Convenience over an integer.
                    OWNER: whoever owns the integer.
```

**MEASURED — the guard does not guard.** `canNext()` is `true` on step 0 of a
freshly constructed wizard with nothing filled in:

```
currentStep() === 0    canNext() === true     nothing completed, nothing valid
goTo(2)                canNext() === false    isLastStep() === true
```

`canNext` answers *"is there a later step"* -- step ARITHMETIC -- not *"may I go
there"*. A template binding `[disabled]="!wizard.canNext()"` therefore enables a
Next button that `next()` may refuse, which is the button-that-does-nothing
defect. Naming aside, this confirms the split above: **ordering and permission
are different concepts, and the current API conflates them.**

#### The null

The entire surface is one integer plus `computed`s over a static list:

```ts
const steps = ['one', 'two', 'three'] as const;
const step  = signal(0);
const stepName = computed(() => steps[step()]);
const canPrev  = computed(() => step() > 0);
const isLast   = computed(() => step() === steps.length - 1);
const next = () => step.update((i) => Math.min(i + 1, steps.length - 1));
```

Measured working. No SignalTree involvement of any kind -- not even a published
read, because **the wizard never touches tree values.**

```
CONSTRUCTION?  NO. Nothing about a step index needs graph compilation or
               construction-time specialization of a position. The step list is
               data the application already has; declaring it at tree-build time
               buys nothing and costs deep-linkability.

DISPOSITION    F4 wizard -> DELETE from SignalTree, and do NOT recombine.
               Five concepts with at least three different owners were travelling
               as one word. Current step is session/routing, ordering and
               completion are application domain, transition permission is
               workflow policy. None is SignalTree's.
```

**14.x (Rule 0f).** `canNext` reporting arithmetic while reading as permission
is a `14.x DEFECT CANDIDATE` -- the JSDoc says "Can navigate forward", which a
consumer would reasonably read as permission, and `next()` can refuse when it is
`true`. Promotion requires checking whether any published example binds a
control to `canNext`; not decided here.

### AUDIT ROWS — F5 `reset`, F6 `clear`, F7 `patch`

Attacked as ORDINARY OPERATIONS before any "form" semantics are granted.

#### F7 `patch` — heaviest burden, taken first

SignalTree already has partial-merge branch writes, so the burden is not "is
`form.patch()` convenient":

> **What operation becomes impossible without a form-specific patch?**

```
FUNCTION       Write some fields of a composite value, leaving the rest.
OWNER          SignalTree -- writing state IS its job.
GREENFIELD     tree.$.p({ name: 'Grace' })
MECHANISM
SIGNALTREE?    YES, and it ALREADY SHIPS IT. The question is whether a SECOND,
               form-specific spelling adds anything.
CONSTRUCTION?  NO.
```

**MEASURED — nothing.**

```
marked.$.p.patch({ name: 'Grace' })    -> { name: 'Grace', age: 36 }
plain.$.p({ name: 'Grace' })           -> { name: 'Grace', age: 36 }
both record history under timeTravel
```

**And the plain branch write is MORE capable: it merges at EVERY DEPTH.**

```
plain.$.p({ a: { y: 99 } })   ->  { a: { x: 1, y: 99 }, b: 3 }
```

`patch` is a shallow spread over one level. So the form-specific spelling is not
even a convenience win where composite values are nested.

```
FUNCTION SURVIVES          partial state update
FORM-SPECIFIC ABSTRACTION  does not

DISPOSITION    F7 patch -> DELETE THE SURFACE. The required function is real and
               is ALREADY OWNED by ordinary SignalTree authoring; `patch()`
               collapses into it, contributing no distinct semantics while being
               strictly less capable.
```

#### F5 `reset`

```
FUNCTION       Return values to a baseline the user calls "unchanged".
OWNER          Whoever owns the BASELINE -- the application. Identical to F1.
GREENFIELD     tree.$.p(baseline())      // one ordinary write
SIGNALTREE?    NO -- the write is already published; the baseline is not
               SignalTree's to hold.
CONSTRUCTION?  NO.
```

`reset` and `dirty` are the SAME QUESTION seen from two sides -- *"does this
differ from the baseline"* and *"put the baseline back"* -- so `reset` inherits
F1's OWNERSHIP problem exactly:

> **SignalTree has no basis for deciding WHICH historical value is the baseline.**

At least five application meanings are legitimate, and nothing distinguishes
them from inside SignalTree:

```
reset = construction defaults        reset = last explicit checkpoint
reset = last loaded server state     reset = blank / new-record state
reset = last successful save
```

**MEASURED — the current implementation silently picks the first:**

```
patch({ name: 'Ada' });  await submit(save);   // the save SUCCEEDS
reset()                                        // user presses "Revert"
marker().name === ''                           // the BUILD-TIME value
```

An earlier draft called that a DEFECT and asserted Revert "should" return to the
saved values. **Neither is established.** Construction-baseline reset is a
coherent policy; it is simply one of five, chosen without authority. Calling it
wrong would repeat the F3b capture-instant error -- letting one application's
expectation stand in for a SignalTree invariant. It is only a 14.x defect if the
14.x contract promises a different baseline, and it does not: the JSDoc says
"Reset to initial values", which is exactly what it does.

The current `reset()` also clears `touched`, `asyncErrors` and the wizard step --
all now DELETE by F2, validation ownership and F4 respectively. Once those are
gone, `reset()` is one ordinary write of a value the application chose.

```
DISPOSITION    F5 reset -> DELETE THE SURFACE. Restoring an
               application-defined baseline is an ordinary write; the
               baseline is not SignalTree's to choose or to hold.
```

#### F6 `clear`

```
FUNCTION       Set fields to "empty".
OWNER          The DOMAIN. What "empty" means is a domain fact, not a type fact.
GREENFIELD     tree.$.p(EMPTY)   // an application-declared empty value
SIGNALTREE?    NO.
CONSTRUCTION?  NO.
```

**MEASURED — `clear()` infers domain policy from the TypeScript type:**

```
text: 'hello'  ->  ''
count: 7       ->  0
list: [1, 2]   ->  []
obj: { a: 1 }  ->  {}
nul: null      ->  null
bool: true     ->  true      <-- UNCHANGED
```

Two independent problems, both measured.

**1 — the number rule collapses "empty" with a VALID DOMAIN VALUE.** A
`rating: 5` clears to `0`. Zero is a legitimate answer, not the absence of one,
and after `clear()` nothing can distinguish "cleared" from "the user said 0".
Only the domain knows whether the empty rating is `0`, `null` or `undefined`.

**2 — the table is not even internally consistent.** `boolean` is left alone, so
a checkbox the user ticked stays ticked through a "clear". Whatever rule
produced `''` and `0` was not applied to `true`.

This is precisely the antipattern the MERGE row already condemned -- *"SignalTree
must never infer policy from type; seeing two numbers and deciding numbers get
summed is the domain owner's call"* -- shipped and running.

```
DISPOSITION    F6 clear -> DELETE. Type-inferred domain policy SignalTree has no
               authority to choose, and the choice is inconsistent besides.
```

### DEFECT FOUND WHILE MEASURING F7 — cross-tree undo contamination

Not a `form()` question, and it outlives every deletion above. Narrowed by
one-variable experiment:

```
form-marker patch + a second WRITTEN timeTravel tree   THROWS
    Error: Unsupported scoped undo effect at structural-drift
    time-travel.ts:2175 -> applyTurnEffectsThroughRealizationPort

form-marker patch + a second IDLE timeTravel tree      CLEAN
form-marker patch, its tree ALONE                      CLEAN
two PLAIN timeTravel trees, both written               CLEAN
```

**Both conditions are required**: a `form()` marker write AND a concurrent write
to an unrelated `timeTravel()` tree. Two plain trees do not contaminate each
other, so this is not generic time-travel scoping -- the marker's write is what
makes the difference.

**WHAT IS ESTABLISHED, and no more:**

> **An unrelated tree's activity changes whether undo of a valid form-marker
> write succeeds.**

**ROOT CAUSE — UNPROVEN.** An earlier draft asserted "the contaminating
mechanism is in time-travel / the realization port, not in the marker". That is
not measured. The stack frame says WHERE THE REFUSAL IS RAISED, not where the
contamination originated -- and assigning ownership to the place an error throws
is exactly the failure mode this audit has been policing. The experiment
requires a form-marker write, so all of these remain live:

```
form emits incorrectly scoped effects
timeTravel stores global / shared state
the realization port mixes identities
marker hydration uses process-global metadata
an interaction of two otherwise-correct mechanisms
```

```
14.x   DEFECT. `tree.undo()` throws on a tree whose own writes were valid,
       because of activity in a DIFFERENT tree. Nothing in the public contract
       says undo is process-global. Root cause and fix both undecided.
15.0   The specific form-triggered REPRODUCER may well disappear when `form()`
       is deleted. **Do NOT claim the underlying scoping defect is resolved by
       that deletion** until MUT determines why foreign-tree activity affected
       the first tree. What survives the deletion regardless is the warning:
       tree-local causal/undo machinery has demonstrated CROSS-TREE SENSITIVITY
       under at least one supported semantic write path.
MUT-3  DIRECT COUNTEREXAMPLE motivating tree-lineage isolation -- "how is
       observation bound to ONE tree lineage rather than process-global state?"
       Here is a measured case where it is not.
```

### AUDIT ROW — F8, THE OMITTED SURFACES

The seven were not the whole marker. `$`, `set`/`data` and the persistence trio
were never in the list and **must not be deleted by omission** -- a surface that
dies unexamined is a surface that can be resurrected unexamined.

#### F8a `$` — structural navigation

> Does a form position expose any navigation an ordinary compiled
> `NodeAccessor` would not already provide?

**MEASURED — no.** Field read/write through `marker.$.name` matches
`plain.$.p.name` exactly, and the plain branch additionally navigates to
arbitrary depth (`plain.$.p.addr.city`). `$` is INHERITED TREE MACHINERY
presented as form functionality.

It is also strictly WORSE ergonomically, and one measurement shows why that is
not merely taste:

```
plain tree     tree.$.p.name()          the field
form marker    tree.$.p.$.name()        the field
               tree.$.p.name            'formSignalFn'   <-- a STRING
               typeof tree.$.p.length   'number'
```

**DEFECT — the marker is a callable, so field names collide with
`Function.prototype`.** `name` is among the most ordinary field names there is;
on a form marker `tree.$.p.name` silently yields the JavaScript function name,
not an accessor and not a value from this form. `length`, and by the same route
`caller`, `arguments` and `constructor`, are in the same class. A plain branch
has no such hazard.

```
14.x   DEFECT CANDIDATE. Not a crash -- a silent wrong value on a plausible
       field name. Whether it is contractual depends on whether the extra `.$.`
       hop is documented as REQUIRED; not decided here.
DISPOSITION  F8a $ -> DELETE WITH THE MARKER. Nothing to preserve: the
             capability is the tree's, and the marker's version degrades it.
```

#### F8b `set` / `data`

**MEASURED — `set` and `patch` have identical behaviour**, and inspection shows
identical bodies (`{ ...curr, ...values }` + announce + persist + record). Two
names, one function.

**DEFECT — `set` is documented "Set all values at once" and MERGES:**

```
initial { name: 'Ada', age: 36 }
set({ name: 'Grace' })
result  { name: 'Grace', age: 36 }      <-- `age` survived
```

A caller trusting the JSDoc would expect the omitted field to be reset or the
call to be rejected; instead it is a partial merge under a total-write name. It
is also typed `Partial<T>`, which contradicts the prose rather than the code --
so the TYPE tells the truth and the DOC does not.

`data()` is an alias for calling the marker, and is documented as one. Its
stated rationale is that AI agents trained on `FormGroup` / Formik /
react-hook-form reach for `.data()`. **That is a familiarity argument, not a
capability argument** -- exactly the class this audit rejects. An alias does not
survive because it makes an API look familiar.

```
14.x   `set` prose/behaviour mismatch -> DEFECT CANDIDATE. The fix is almost
       certainly documentation (the type already says Partial), but that is the
       14.x line's call.
DISPOSITION  F8b set / data -> DELETE. `set` is `patch` is the branch write;
             `data` is an alias for a call.
```

#### F8c `persistNow` / `reload` / `clearStorage`

Their burden is high before measurement, because GATE A already froze the owner:

> **PERSISTENCE CONSEQUENCE -- a governed mechanism.**

A form marker must not regain survival by carrying manual storage controls whose
semantic owner is frozen elsewhere.

**MEASURED — all three exist, and all three are INERT without a
construction-time `persist` key.** Called on a marker with no `persist`
configured, `persistNow()`, `reload()` and `clearStorage()` all silently do
nothing; `reload()` in particular does not report that there is nothing to
reload from.

```
FUNCTION       force a save, force a reload, drop the stored copy
OWNER          the persistence consequence (GATE A, already frozen), and
               `stored()` is core's existing durability marker, which needs no
               form position
SIGNALTREE?    the CONSEQUENCE is; these three imperative escapes are not
CONSTRUCTION?  the trio is inert without a construction-time key, so the
               construction coupling is real -- but it is persistence's
               construction coupling, borrowed. It establishes nothing about
               FORM-ness.
```

That last row matters for the final question. The trio does depend on something
declared at construction -- but what is declared is a STORAGE KEY, which is
persistence's property, not evidence that a position is intrinsically "a form".

```
DISPOSITION  F8c -> DELETE from the form marker. If imperative
             flush/reload/clear controls are required at all, they are the
             persistence consequence's surface to justify, on its own terms.
14.x   silent no-op `reload()` with no storage configured -> NOTE only, not a
       defect claim: no contract says it should report.
```

## `form()` — WHOLESALE DELETION, and the audit STOPS HERE

**The legacy audit is halted, and not because every method was individually
prosecuted.** Continuing to try each remaining surface would violate the spirit
of Rule 0g: once "form" is shown not to be an intrinsic SignalTree concept, the
old `FormSignal` surface must stop being the UNIT OF ANALYSIS. Whittling a
legacy abstraction down is the wrong direction; deleting it and greenfielding
forward is the right one.

**What the rows did establish is that the abstraction's cohesion is ARTIFICIAL.**
Its pieces have already scattered to at least seven different owners:

```
dirty          baseline comparison            application policy
touched        interaction state              UI / session
submitting     external operation lifecycle   operation owner
submit()       operation orchestration        application
validation     judging a value                validator ecosystem
wizard         step position + workflow       routing / session / app policy
reset          restore a chosen baseline      application + ordinary write
clear          what "empty" means             domain + ordinary write
patch          partial state update           ORDINARY SIGNALTREE AUTHORING
persistence    durability                     the governed consequence (GATE A)
```

Once a supposed abstraction decomposes into that many owners, asking whether its
remaining helper aliases survive is backwards. **Nothing left could establish the
only claim that would save the marker:**

> *this position INTRINSICALLY IS A FORM and must therefore be COMPILED
> differently.*

The single construction-time coupling found anywhere in the audit (F8c) is a
STORAGE KEY -- persistence's property, borrowed. It is not form-ness.

### FROZEN

```
FORM POSITION ONTOLOGY     NONE
form() marker              DELETE
FormMarker                 DELETE
FormSignal                 DELETE as a semantic type
form processor             DELETE
form-specific state model  DELETE
```

Subject to exactly one reopening condition: **a deterministic counterexample
showing some required capability cannot exist without construction-time form
semantics.** Not "the API is nice". Not "users like `.reset()`". Not "Angular
forms need integration". A genuine construction requirement. None was found.

### The legacy surface is now a CHECKLIST, not an agenda

From here the old API gets **zero weight** -- names, grouping, methods, marker
representation, lifecycle and implementation all count for nothing. It survives
only as a capability-discovery list, answering one question: *did it contain a
useful user capability we have not considered?*

```
CAPABILITY                 STATUS
field navigation           already provided by the kernel
whole-value read/write     already provided by the kernel
partial write              already provided by the kernel (deeper, too)
baseline comparison        WORTH GREENFIELDING -- as a checkpoint/baseline
                           concept, NOT as form state
interaction tracking       owned elsewhere (UI / session)
validation                 owned elsewhere (validator ecosystem) -- CLOSED
submission                 owned elsewhere (operation owner) -- CLOSED
workflow navigation        WORTH GREENFIELDING -- as workflow/navigation,
                           NOT as "form state"
storage                    owned elsewhere (persistence consequence, GATE A)
history                    already core's (`history()`, `trackHistory()`)
clear / reset              collapses into baseline + ordinary write
```

**The anchoring trap this avoids.** "What should replace `persistNow()`?" is the
wrong question; `persistNow()` does not get to frame it. The right question is
"given 15.0's persistence architecture, does a user need an imperative
durability control at all?" -- which may answer no.

### The greenfield DX pass — DEFERRED, and hostile by default

Deleting `form()` does not mean deleting good UX, and the freedom to invent
pleasant first-party APIs is explicitly preserved. But the DEFAULT is:

```
DO NOT ADD A SIGNALTREE FEATURE.
```

A capability survives only if first-party support gives SUBSTANTIAL VALUE BEYOND
ORDINARY COMPOSITION. `tree.$.profile({ name: 'Jon' })` already has excellent
DX; `profile.patch({ name: 'Jon' })` adds nothing but a name form libraries
happen to use. `const saving = signal(false)` is already excellent Angular DX;
wrapping it as `tree.$.profile.submitting()` improves nothing unless SignalTree
owns semantics Angular does not. **That is the ANG-V0 lesson applied to DX
rather than to architecture.**

**SEQUENCING: the greenfield pass runs AFTER the core / causal / API owners are
frozen** -- MUT in particular. Some candidate capabilities may collapse further
once those primitives exist, and designing on top of unfrozen primitives would
just re-run this audit later.

### EVIDENCE DISPOSITION — one judgment call, surfaced

`form-function-audit.spec.ts` is deleted under the ANG-V0-F protocol: its
dispositions are frozen, and a suite pinning a doomed mechanism's behaviour
would give it test-backed legitimacy.

**But one of its tests is not about `form()` at all.** The cross-tree
contamination reproducer documents a live defect in TIME TRAVEL, a surviving
mechanism whose root cause is UNPROVEN. Deleting it silently would lose the
reproducer. It also cannot simply be kept, because it REQUIRES `form()` to
trigger -- a permanent test would block the deletion it is filed alongside.

Resolved by recording it here verbatim, as evidence rather than as a live test:

```ts
// THROWS: Unsupported scoped undo effect at structural-drift
const marked = signalTree({
  p: form<Profile>({ initial: { name: 'Ada', age: 36 } }),
}).with(timeTravel());
const other = signalTree({ q: { n: 1 } }).with(timeTravel());
await tick();

marked.$.p.patch({ name: 'Grace' });
other.$.q({ n: 2 });          // an UNRELATED tree
await tick();

marked.undo();                // throws
```

```
CONTROLS (all clean): marker tree alone; second tree idle; two PLAIN trees
                      both written
```

**MUT OBLIGATION.** When `form()` is deleted this reproducer becomes
unrunnable. That is NOT evidence the defect is fixed. MUT must determine why
foreign-tree activity affected the first tree, and must look for a second
trigger path that does not involve `form()`. If none is found, the finding is
recorded as *closed by removal of the only known trigger* -- explicitly not as
*resolved*.

## RULE 0j — SUBTRACTION-ONLY, and PHYSICAL deletion follows ARCHITECTURAL deletion

### 0j-1 — a rejected feature does not require a replacement design

> **During the subtraction audit, a rejected feature does not require a
> replacement design. Preserve only the USER CAPABILITY as a future
> consideration where it looks genuinely useful. Architecture first;
> convenience reconstruction later.**

So the question is never *"what should replace `persistNow()`?"* It is *"does
`persistNow()` belong on this abstraction as written?"* If no: DELETE, and the
replacement is DEFERRED — possibly to nothing.

**DEFERRED CAPABILITY CANDIDATES** — deliberately weak. Not "future SignalTree
features"; these have NOT earned first-party ownership, and the old
implementation gets **no vote** when the pass runs.

```
checkpoint / baseline UX
interaction / touched helpers
workflow / step navigation
operation lifecycle helpers
imperative durability controls
framework integration conveniences
```

The list means only: *things users may find useful enough to reconsider after
stabilization.* Default remains **DO NOT ADD A SIGNALTREE FEATURE.**

### 0j-2 — the corpse does not participate in the next experiment

**ARCHITECTURAL deletion and PHYSICAL deletion are different events, and the gap
between them is a contamination window:**

```
endpoint frozen
      v
dead mechanism REMAINS AT HEAD
      v
next architecture audit observes it
      v
dead mechanism influences the derived contract
```

> **Once a death certificate is signed, executing it is the NEXT EXECUTION
> BOUNDARY — not deferrable work.** Deriving a new contract while declared-dead
> machinery is still live measures the new architecture against something
> already ruled non-architectural.

**This is not cleanup. It is evidence hygiene**, and it directly improves the
next two derivations:

```
WITH form() LIVE     MUT can drift into "how should mutation participation
                     support this weird form write?" — a question about a
                     mechanism with no future standing.
AFTER DELETION       "For the SURVIVING mutation universe, what constitutes
                     participation in one tree/lineage, and can activity
                     belonging to ANOTHER tree alter it?"
```

Git preserves retired experiments; HEAD does not need to. The cross-tree
reproducer is recorded verbatim in this ledger and remains executable at the
audit-boundary commit, which is sufficient — keeping dead production code alive
to host a test is the wrong trade.

### CORRECTED QUEUE

```
1  EXECUTE the frozen deletions
     @signaltree/schema                                DONE (5bd821d3)
     form() / FormMarker / FormSignal / processor       NEXT
2  PROVE the resulting package / type / build surface clean
3  MUT — derive the mutation-participation contract against the SURVIVING
     architecture only
4  Causal owner convergence, including the common-substrate falsifier
5  Remaining survival / package / API audits
6  Stabilization
7  SEPARATE greenfield UX pass, starting from NULL, using the old APIs only as
     a historical capability inventory
```

### BLAST-RADIUS MEASUREMENT for step 1 (taken before executing)

```
ng-forms core/ng-forms.ts        0 marker refs   createFormTree takes plain values
ng-forms wizard/wizard.ts        0 marker refs
ng-forms history/history.ts      0 marker refs
ng-forms enhancer/form-bridge    19 refs         DIES
ng-forms signals/marker-bridge    5 refs         DIES
```

**`@signaltree/ng-forms` SURVIVES the deletion** — most of it never depended on
the marker. What dies is `formBridge()` and `signalForm()` (whose only remaining
overload is the marker one, the schema overload having gone with SCHEMA-DEL).

**CONSEQUENCE TO SURFACE, not to silently resolve:** `createFormTree()` is
currently DEPRECATED IN FAVOUR OF the thing being deleted — its warning tells
users to migrate to the marker plus `formBridge()`. Deleting `form()` therefore
INVERTS a live deprecation. The notice must be removed or re-pointed as part of
the execution; whether `createFormTree()` is itself the right survivor is a
SEPARATE audit and is not decided by this deletion.

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
