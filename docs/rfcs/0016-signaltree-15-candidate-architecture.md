# RFC 0016 — The SignalTree 15 candidate architecture, as a matrix

Status: **CANDIDATE — NOTHING FROZEN.** No cell of this document may be cited as
authority. It exists to hold a shape while the evidence that would earn it is
still being gathered.

Companion to [RFC 0015](0015-derived-projection-contract.md), which is the only
part of this picture that is actually frozen.

## Why this is a matrix and not a design

A candidate architecture was drafted that framed `signalTree()` as a compiler
from a declarative authoring language into a visible state topology plus hidden
behavior wiring over a small physical/causal kernel. The compiler framing is
worth keeping. The rest of the draft did something this release process
explicitly forbids: it assigned lowering targets — `loader → Operation`,
`compared → Policy`, `resource → Position + Operation` — to concepts whose
FUNCTION has never been derived.

That is the Rule 0k error in a new mask. Rule 0k caught _"Angular has a
primitive, therefore delete the feature."_ This is _"a smaller abstraction
exists, therefore demote the feature."_ Same invalid inference, same direction of
travel, and `form()` is what it cost last time.

So the deliverable is the grid, not the algebra. **The `LOWERING HYPOTHESIS`
column starts blank for every row and is filled only by a NULL that earns it.**
Empty cells are the finding. Rows that need two or more lowering targets are the
"multiple concepts cobbled together" signal. Combinations that recur across many
earned rows are the evidence that Position / Operation / Policy / Command really
are a minimal basis — and if they do not recur, the basis is wrong.

## What is kept from the candidate draft

**The compiler / lowering boundary.** This is the genuinely new contribution and
it is already supported by measured structure rather than by hope. The marker
analysis for the `@signaltree/authoring` split proved the mechanism exists
today:

```text
authorship factory  ->  inert descriptor { [X_MARKER]: true, config }
                            ->  materializer
                                    ->  framework create*Signal realization
```

with **zero** Angular primitives in any authorship factory across all five
marker modules, and every Angular primitive confined to `create*Signal`. The
architecture the repo has been building for twenty commits is a lowering
pipeline; it had simply never been named as one.

The useful principle that follows, and the reason the framing earns its place:

> **Rich authoring concepts may disappear during lowering.** A concept can be
> valuable at the authoring surface and have no representative in the kernel.

That is the honest form of the `REDESIGN` disposition, and it lets a concept
survive as sugar without the kernel growing a runtime object for it.

Everything else from the draft is a row in the grid below, not a conclusion.

## Ledger — where the candidate draft contradicted frozen results

Recorded so the draft cannot be mined later as if it agreed with the freeze.

| Draft claim                                                                                              | Status                 | Governing result                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `linked()` sits under `derived:`                                                                         | **CONTRADICTS**        | RFC 0015: `linked()` as derived is REFUTED; function, owner and placement are all three UNPROVEN. Current `.derived()` placement is the conflation, not a precedent.                                                                                                                                     |
| persistence is an Operation with `trigger: AFTER_COMMIT` and a definition-time `source`                  | **CONTRADICTS, twice** | Frozen persistence invariants: the durability gate is TREE-SCOPED and SCOPE-BASED — _"commit-ness is NEVER inferred from where the JavaScript call happened"_; and invariant 7 — durable consequences _"resolve surviving truth at EXECUTION time, never a value captured when the write was authored."_ |
| Operation authority is a six-value enum (OBSERVE / REALIZE / CONSEQUENCE / INGRESS / AUTHOR / RECONCILE) | **OVERBUILT**          | MUT-2C froze that a two-valued authored/realized classification is decisive in the measured capture path, is caller-supplied and unverified, and that **its owner is NOT PROVED**. Six values rest on an unowned two.                                                                                    |
| `resource` / `loader` / `status` / `compared` / `serialization` lower to sugar or policy                 | **PREMATURE**          | Rule 0k Tier 2: each gets its own NULL and its own verdict. None has been run.                                                                                                                                                                                                                           |

### Two corrections in the other direction

The review that produced this RFC also overstated twice. Both corrections stand.

**1. Derived `PositionId` is UNPROVEN, not contradicted.** RFC 0015's
`Identity — DELETE` answered a narrower question: whether _cross-derived
composition_ requires an identity relationship. It established that downstream
projections consume values rather than references. It did **not** establish that
a derived projection cannot hold a stable semantic position identity, and
"no causal identity / no persistence identity" is fully compatible with one. The
correct ledger:

```text
DERIVED PositionId              UNPROVEN
DERIVED causal authorship       NO   (frozen projection contract)
DERIVED persistence identity    NO   (frozen projection contract)
```

**2. `asReadonly` and `_` are different axes, not competitors.** The claim that
`_` would make `asReadonly` "the tree without `_`" does not hold, because the
proposed `$` still permits canonical store writes (`tree.$.search.set('Ada')`).
So `asReadonly` narrows _mutation capability on `$`_, while `_` would expose
_intentional command invocation_, which is not a state write at all. `_` may
still fail its own survival audit; it does not fail it by redundancy with
`asReadonly`.

### The sharpened NULL for `_`

The candidate function is known, so the NULL should be stated against it rather
than against a vague alternative:

> **Does SignalTree need to compile intentionally-invokable behavior into the
> same typed semantic topology as its Positions — including position and subject
> association — or is an ordinary typed application service fully equivalent?**

If the service is equivalent, `_` is application architecture, not SignalTree
architecture. `_` survives only if something like subject-scoped command
association, or the compiled topology itself, cannot be reproduced externally
without duplicating SignalTree semantics. Note the competitor is not
hypothetical: a readonly `$` paired with a separate `@Injectable` Ops service for
writes is already the documented production architecture on `defineStore`.

## Amendment 1 — the construction-shape hypothesis

Added after B2-1 item 0 measured something the original draft did not anticipate.
**Status unchanged: CANDIDATE. Nothing here is frozen.**

### What was measured, and it is not a hypothesis

`plannedSignalTree()` can inspect requested capabilities BEFORE the substrate is
constructed. Chained `.with()` structurally cannot, because the tree already
exists by the time an enhancer is applied. Ordinary `signalTree()` therefore
installs all four capabilities always; `plannedSignalTree().build()` installs
what the enhancers' `capabilities` metadata actually asked for, and that metadata
is exercised in production (`transactions` -> `['causal-runtime']`, `timeTravel`
-> `['causal-runtime','temporal-snapshots']`).

That is a sequencing property inherent in the API SHAPE, not a defect in the
implementation of `.with()`.

### The hypothesis it motivates

> The extension FUNCTION may survive; the post-construction enhancer CHAIN
> probably does not.

Shape, with the name deliberately unsettled — `extensions`, `features`, `using`
are all placeholders and none is chosen:

```text
signalTree({ store, derived, <extension descriptors>, ... })
        |
        +-- discover everything first: required capabilities, semantic topology,
        |   conflicts, realization requirements
        |
        +-- construct ONCE, correctly
```

against today's `construct -> modify -> modify again`. This fits the compiler
framing that Amendment 0 kept, and it is the first evidence that the framing
predicts something rather than merely re-describing what exists.

**Consequence for `plannedSignalTree`:** if the primary constructor receives
extension descriptors, it can see them all before constructing, so the surviving
function no longer needs a second public constructor. Function SURVIVES, public
FORM becomes a strong REDESIGN candidate.

**Consequence for ordering:** the default becomes _extensions are
order-independent unless a surviving function proves otherwise_. Capability union
is commutative — `[timeTravel(), transactions()]` and its reverse request the
same substrate — so no procedural ordering is needed for the one axis that is
actually exercised. A genuine ordering relationship would have to earn itself
independently rather than being inherited from the enhancer model.

### The governing null

> Assume there is no chained `.with()`. Given a single declarative
> `signalTree({...})` that receives extension descriptors before compilation,
> what SignalTree-owned function becomes impossible?

If the answer is "none", `.with()` dies even though extension functionality
survives completely.

### PROBE — not refuted at the type level, and NOT a spec

The obvious falsifier is typing: `.with()` accumulates through `this & TAdded`,
and `this`-polymorphism is what carries prior accumulations along a chain. A
tuple must reproduce that. A scratch probe with the guards RFC 0015 taught —
an `IsAny` detector applied INSIDE the projector, an operation that cannot
survive imprecision (`any + any`), and three negative controls — compiles clean:

```text
tuple accumulation      tree.transaction / tree.undo / tree.redo    resolve
store type              $.count: number, $.name: string             survive
derived inference       derived.doubled: number                     correct
$ inside projector      IsAny<typeof $> assignable to false         NOT any
negative controls       unknown method / missing key / wrong type   all fire
```

Note this does not contradict RFC 0015: its refutation was about a facade
depending on SIBLING DERIVED RETURN inference, and extension descriptors are
ordinary values whose types are known without checking any projector body, so
they do not enter the deferred pass in the way that degraded.

**A probe is not a spec.** It used a simplified `Tree<T>`, not the real
`ISignalTree`/`TreeNode`/`NodeAccessor` with callable trees and
`this`-polymorphism. The encoding is NOT REFUTED; it is not established either,
and RFC 0015's own false green is the reason that distinction is worth stating.

### SHAPE-T0 RESULT — two positive facts, not one negative one

`packages/core/src/lib/declarative-extension-contract.typing.spec.ts`. Recording
this as "not refuted" understates it in one direction and overstates it in
another, so it is stated as what was actually proved:

```text
DECLARATIVE TYPE ACCUMULATION      PROVED FEASIBLE
SEQUENTIAL this & TAdded REQUIRED  REFUTED
NAIVE UNCHECKED INTERSECTION       REFUTED
FINAL COLLISION RULE               UNPROVEN
```

**Fact 1.** For non-colliding contributions, public type accumulation does not
require sequential enhancer application. The declaration is inert — not
callable, never handed a host tree — and store typing, nested `NodeAccessor`
behavior, derived inference, the callable-tree contract and multiple contributed
capabilities all survive simultaneously. That removes the strongest plausible
defense of the chained form.

**Fact 2.** Plain intersection is insufficient as the final lowering strategy.
Two incompatible contributions to the same key become an overloaded member with
NO declaration-site error, and the LAST one wins under probing — so declaration
order silently decides which survives.

Fact 2 does not count against the declarative model. It counts against
`type Final = A & B & C` as an _unchecked_ lowering. And the declarative model is
strictly better positioned here than the chain: a compiler that sees the complete
set before construction can detect the collision, which sequential `.with()`
structurally cannot.

### Ledger rows

| Concept                                                | Direction                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| extension/plugin function                              | likely SURVIVES                                                             |
| construction capability declaration (`capabilities`)   | **SURVIVES — measured, exercised in production**                            |
| generic "enhancer" runtime abstraction                 | UNPROVEN                                                                    |
| chained `.with()` as primary extension API             | strong REDESIGN/DELETE candidate — its type-accumulation defense is REFUTED |
| `plannedSignalTree()` function                         | SURVIVES                                                                    |
| `plannedSignalTree()` as a separate public constructor | strong REDESIGN candidate                                                   |
| extension descriptors in the initial declaration       | strong candidate                                                            |
| `requires`/`provides` ordering graph                   | highly suspect; audit independently                                         |
| "enhancer" as the future NOUN (`(tree) => tree`)       | suspect — inherently post-construction                                      |
| naive intersection of contributions                    | **REFUTED as a lowering** — silent last-wins shadowing                      |
| inert extension declaration                            | **type-proved feasible**                                                    |

## Amendment 2 — the matrix becomes FUNCTION-FIRST

**Status unchanged: CANDIDATE. Nothing here is frozen.**

Tables A-D are organised by CONCEPT, and concept means _legacy symbol_. That was
right while the question was "which of these survives". It is wrong now, because
three separate times in the extension cluster a FUNCTION survived while its
MECHANISM evaporated — and each time, auditing the noun would have preserved the
mechanism.

Under [Rule 0l](../../RELEASE-1.0.md), legacy mechanisms are evidence
repositories, not migration targets. So the architecture rows become FUNCTIONS,
and the old symbols move to an evidence column where they cannot vote on the
shape.

```text
                 OLD SYSTEM
                     |  evidence only
                     v
             FUNCTION EXTRACTION
                     v
               HOSTILE NULL
             /                \
     function dies        function survives
                                v
                         ownership audit
                                v
                  does the derived architecture
                     already supply it?
                    /                  \
                  yes                   no
                   v                     v
                 DONE            GREENFIELD DERIVE
                                         v
                                 minimum primitive
                                         v
                                     LOWERING
```

Only afterwards do we look horizontally and ask whether independently derived
functions recur enough to justify a common concept. That is where a compiler IR,
a policy concept, a declaration concept or a command topology may emerge — not
because `Enhancer` needed replacing.

### Table E — EXTENSION CLUSTER, functional inventory

Columns: what the function is · whether the derived architecture already covers
it · where the evidence came from. `LEGACY SOURCES` is citation only.

| Function                                                                                                                                                         | Status                              | Coverage, and by what evidence                                                                                           | Legacy sources (evidence only)                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| select optional tree behaviour at authoring time                                                                                                                 | survives                            | PROVED-IN-MODEL (declarative init candidate)                                                                             | `.with()` call sites, built-ins                  |
| know required substrate capabilities before construction                                                                                                         | **SURVIVES — measured**             | PROVED-IN-MODEL                                                                                                          | `plannedSignalTree`, `EnhancerMeta.capabilities` |
| contribute public/type surface                                                                                                                                   | **SURVIVES**                        | PROVED-IN-MODEL (SHAPE-T0, inert declarations)                                                                           | `Enhancer<TAdded>`, `this & TAdded`              |
| bind runtime behaviour to the constructed tree/kernel                                                                                                            | **SURVIVES**                        | PROVED-IN-MODEL (T1 CASE 1)                                                                                              | enhancer bodies                                  |
| alter final callable behaviour                                                                                                                                   | **SURVIVES**                        | PROVED-IN-MODEL (T1 CASE 2)                                                                                              | batching / timeTravel / devTools replacement     |
| register teardown / lifetime behaviour                                                                                                                           | **SURVIVES**                        | **LANDED** — `registerCleanup` is already tree-owned and unrelated to `.with()`                                          | `registerCleanup`                                |
| reject conflicting public contributions                                                                                                                          | **SURVIVES**                        | PROVED-IN-MODEL, both halves (T0-G static, T1 CASE 3 runtime)                                                            | nothing — the old system had no such check       |
| **semantic duplicate / exclusivity rule** — _what combinations of declarations are actually invalid, independent of public-key collisions?_                      | **OPEN**                            | T1 CASE 6 refused via an explicit id; SUFFICIENT, never proved minimal                                                   | `name`, `.with()` duplicate guard                |
| **realization dependency satisfaction** — _does one realization genuinely require something established by another, and if so what fact must the compiler know?_ | **OPEN**                            | T1 CASE 5 showed an internal order SUFFICES; the dependency itself may be an artifact of the prototype's publish/consume | `requires`, `provides`, `resolveEnhancerOrder`   |
| **substrate requirement determination** — _how does the compiler know which substrate capabilities are required before construction?_                            | **OPEN**                            | `TREE_CAPABILITY_DEPENDENCIES` already models capability-to-capability implication internally                            | `capabilities`                                   |
| invoke contributed capabilities after exposure                                                                                                                   | **SURVIVES**                        | **LANDED** — an ordinary runtime API, never composition                                                                  | `realtime.connect()`, every enhancer method      |
| **compose new capabilities after exposure**                                                                                                                      | **DELETE — no surviving use found** | n/a                                                                                                                      | `.with()`                                        |
| replace public tree identity                                                                                                                                     | **NOT A FUNCTION**                  | n/a — mechanism debt of post-construction application                                                                    | the three replacing built-ins                    |
| sequentially accumulate types                                                                                                                                    | **NOT A FUNCTION**                  | n/a — declarative typing handles it                                                                                      | `this & TAdded`                                  |
| preserve an enhancer chain                                                                                                                                       | **NOT A FUNCTION**                  | n/a — mechanism self-maintenance                                                                                         | the redefined `.with()` on replacements          |

Note what is absent from the left column: `Enhancer`, `bind()`, `requires`,
`provides`, `plannedSignalTree`. **Those are not functions.** They are possible
historical implementations of functions that are.

**Two evidence statuses, deliberately not merged.** `LANDED` means the existing
shipped architecture already supplies the function. `PROVED-IN-MODEL` means only
the SHAPE-T0/T1 prototypes demonstrated it. Both mean "no new greenfield
primitive has been shown necessary" — they are not the same claim, and merging
them would let a prototype's success read as production truth.

**The three OPEN rows are named as questions on purpose.** Earlier drafts called
them "duplicate identity", "realization ordering" and "substrate dependency
representation" — each of which smuggles its answer into its name: _identity_
presumes an id, _ordering_ presumes an order, _representation_ presumes the fact
already exists and only needs encoding. Rule 0l applies to our own phrasing.

### DERIVATION 1 — substrate requirement determination

**Null:** assume authors declare no substrate capabilities at all. Can the
compiler determine every required substrate property from the semantic
declarations themselves?

Three sources tested separately, because only the third could earn a public
protocol.

```text
A  INTRINSIC     the declaration KIND fully determines the requirement
B  CONFIGURABLE  the requirement varies with author-selected options
C  THIRD-PARTY   the compiler cannot know unless the declaration says so
```

#### Measured

```text
A  2 of 2 production cases, and both are unconditional
     transactions()  capabilities: ['causal-runtime']
                     the factory takes NO CONFIG AT ALL, so its requirement
                     cannot vary
     timeTravel(cfg) capabilities: ['causal-runtime','temporal-snapshots']
                     the factory DOES take config (including `enabled`), and
                     the capabilities literal does not reference it

B  ZERO instances. Not refuted as possible — simply never exercised, including
   by the one factory that has options available to vary it.

C  STRUCTURALLY IMPOSSIBLE TODAY:
     `TreeCapability` is exported from NEITHER `index.ts` NOR `authoring.ts`
     the custom-markers-enhancers guide never teaches the field
     zero third-party capability declarations exist in the workspace
```

The `timeTravel` row is the one that matters. It is the only case with the
_opportunity_ to be config-dependent, and it isn't — which is evidence for A
rather than merely absence of evidence for B.

#### Result

```text
FUNCTION            compiler must know required substrate before construction
                    SURVIVES — measured and exercised

SOURCE              INTRINSIC in every measured case

PUBLIC PROTOCOL     NOT EARNED. The compiler can hold the
                    declaration-kind -> substrate mapping itself; a public
                    field carrying a fact SignalTree already knows is a
                    restatement, not information.

GREENFIELD MINIMUM  none. No new primitive is needed for the measured cases.
```

An application should not have to write `transactions({ capabilities:
['causal-runtime'] })` when SignalTree already knows that transactions entail a
causal runtime.

#### The half-exposed protocol, worth recording

`capabilities` sits on `EnhancerMeta`, which is reachable through the exported
`ENHANCER_META` symbol — but its value type `TreeCapability` is **not public**.
So the current protocol is exposed enough for a third party to write, and not
typed enough for them to write correctly: they would be authoring bare strings
against a closed internal enum. That is a defect in the current form regardless
of which way the function resolves.

#### What would change the answer

Only source C, and it is currently impossible by construction rather than merely
unused. If a third-party declaration ever genuinely needs to request a
SignalTree substrate facility, a protocol could be earned then — and Rule 0j-1
says a rejected artifact does not require a replacement design now. Note the
capability set is a CLOSED SET OF SIGNALTREE-OWNED FACILITIES
(`mutation-capture`, `position-topology`, `causal-runtime`,
`temporal-snapshots`), so such a protocol would be a REQUEST against a known
vocabulary, not an open declaration of arbitrary needs. That is a much smaller
thing than the current field implies.

### DERIVATION 2 — realization dependency satisfaction: **OUTCOME A. Function DELETE.**

**Null:** assume declarations cannot depend on declarations, realizers cannot
consume another declaration's public facade, and source order has no semantic
meaning. Each realization receives only its own configuration, compiler-owned
information, kernel-owned services, and tree lifetime registration. What
surviving use case becomes impossible?

Answer: **none found.**

#### The measurement that decides it

Cross-feature imports exist in the codebase — and every single one is in a SPEC
file:

```text
serialization/persistence-commit-ordering.spec.ts  -> ../transactions
time-travel/documented-defects.spec.ts             -> ../serialization
time-travel/time-travel.spec.ts                    -> ../transactions

PRODUCTION cross-feature imports                    ZERO
```

Those specs test that two INDEPENDENT consumers of the same kernel authority
behave correctly together — persistence ordering while a transaction is open, for
instance. Testing an interaction is not a dependency, and reading the spec
imports as one would have manufactured exactly the relationship this derivation
exists to test.

#### What the realizations actually consume — all class A

```text
transactions   causal-types · causal-write-mode · intercept-leaf-signals ·
               mutation-capture-runtime · path-notifier · position-registry ·
               owned-mutation · commit-consequence · turn-store ·
               pending-rollback · applied-history · realization-context ·
               tree-realization-adapter · write-context

time-travel    causal-types · causal-write-mode · intercept-leaf-signals ·
               mutation-capture-runtime · path-notifier · position-registry ·
               tree-realization-adapter · write-context · visit-tree

serialization  commit-consequence · materialize-markers

devtools       intercept-leaf-signals · path-notifier · write-context

batching       visit-tree
```

```text
A  kernel semantic authority     ALL measured consumption
B  tree lifecycle service        registerCleanup (already LANDED)
C  author configuration          yes
D  another feature's PUBLIC contribution   ZERO
E  another realization's PRIVATE object    ZERO
```

Only D or E could establish a genuine dependency, and both are empty.

**The import scan alone would NOT have earned this result.** Feature coupling can
hide behind a registry, a shared token, a global map or a lookup API without any
direct cross-feature import. What earns Outcome A is the CONSUMPTION
CLASSIFICATION — D and E measured empty, with everything consumed being
independently owned kernel material. The import scan is corroboration, not the
argument.

#### The shape, which the release invariants already predicted

`transactions` and `time-travel` share eight kernel modules. That is not
"transactions provides X, timeTravel requires X" — it is:

```text
                    +-- transactions
   causal authority-+
                    +-- timeTravel
```

Two consumers of something with an independently established owner. _Causal
history owns meaning_ was already frozen; this is that invariant showing up as a
dependency graph with no feature-to-feature edges in it.

**`serialization` is the sharpest case.** Persistence observing committed truth
could very easily have been modeled as _"persistence requires transactions"_,
because a transaction plainly affects when state settles. It is not. It consumes
`commit-consequence` — the durability authority — directly. The frozen
persistence semantics put the authority in the right place, and the absence of a
`requires` edge is the consequence.

#### The T1 prototype's own dependency is confirmed an artifact

T1 CASE 5 used `producer.publish('token')` / `consumer.consume('token')`. Treated
as suspect and now resolved: the prototype OFFERED `publish`/`consume`, so the
dependency it demonstrated was created by the harness. CASE 5 established only
that IF such a dependency existed, internal pre-EXPOSE realization could satisfy
it. It is not evidence that SignalTree has one — and the production measurement
says it does not.

#### Result

```text
REALIZATION DEPENDENCY FUNCTION      DELETE — no surviving use case
GREENFIELD MINIMUM                   none
PUBLIC DEPENDENCY PROTOCOL           cannot be earned from this function
ORDER REVERSAL                       moot; with zero edges there is nothing
                                     for an order to express
```

Order reversal was not run as a characterization because it can only discover
coupling, and the import measurement already shows there is none to discover at
the module level.

#### Scope limit

This measures the SURVIVING built-in and first-party realizations. It does not
prove no future feature could need another's output. If one ever does, outcome C
would apply and the FACT to communicate would be derived then — not called
`requires`, not assumed to be a string token, not assumed to be an order.

### DERIVATION 3 — semantic multiplicity: **cardinality differs per function. No generic identity earned.**

**Null:** assume no declaration id, no name-based duplicate rule, no generic
duplicate detector, and no assumption that all optional authoring inputs belong
in one collection. Which combinations are semantically invalid, and _why_?

Excluded up front, because they are already owned elsewhere: incompatible public
contribution keys (contribution collision, T0-G/T1 CASE 3), repeated substrate
requests (set union, idempotent), realization order (Derivation 2, DELETE).

#### The two measurements that decide it, and they point OPPOSITE ways

```text
transactions()          getOrCreateInternalTransactionRuntime() returns the
                        EXISTING runtime if one is present — the authority is
                        ALREADY a per-tree singleton, and the factory takes no
                        config, so two declarations are literally identical.
                        -> outcome A: canonicalize. Nothing fails.

stored()                MEASURED IN REAL CODE: 12 occurrences in one demo
                        component, 10 in another.
                        -> multiple PERSISTENCE-DECLARED POSITIONS per tree are
                           normal. See the scope limit below; this row proves
                           less than it first appears.
```

**SCOPE LIMIT on the `stored()` row, because it is easy to over-read.**

```text
MEASURED
  multiple persistence-declared POSITIONS per tree are normal

NOT PROVED BY THIS MEASUREMENT
  multiple independently governed durability CONSEQUENCE instances or targets
  future `stored()` ownership
  future persistence authoring cardinality
```

`stored()` is already semantically suspect — its outbound durability and inbound
hydration have DIFFERENT frozen authorities — so it must not do architectural
work here beyond what it measured. What it establishes is narrow and sufficient:
a per-kind uniqueness rule would reject code that is currently normal.

**That pair refutes a generic rule.** "One declaration of each kind" is false for
persistence-declared positions; "duplicates are always fine" is not obviously
true for a singular authority. There is no single rule to be had.

#### Cardinality per function, with its semantic basis

| Function                      | Cardinality                 | Semantic basis                                                 | Generic id needed?                 |
| ----------------------------- | --------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| transaction authority         | idempotent / canonicalizing | already a per-tree singleton; no config to conflict            | no                                 |
| temporal history policy       | 0..1 (candidate)            | two configured histories over ONE causal lineage would compete | no — the OWNER is singular         |
| persistence-declared position | 0..N                        | **MEASURED plural**                                            | no — distinguished by its position |
| call interception             | 0..N, compositional         | three built-ins intercept today and coexist                    | no                                 |
| cleanup registration          | 0..N, additive              | `registerCleanup` is a list                                    | no                                 |
| substrate requirement         | set, idempotent             | union; repetition is meaningless                               | no                                 |

**Every row answers "no" to a generic id.** Where instances must be
distinguished — durable consequences — the distinguishing fact is SEMANTIC (the
external target), not an invented identity. That is the outcome that matters:

```text
GENERIC DECLARATION IDENTITY     NOT EARNED
GENERIC DUPLICATE GUARD          NOT EARNED
per-function CARDINALITY         SURVIVES, and differs per function
```

#### Exclusivity is a property of the AUTHORITY, not of the declaration

The temporal-history row is the only singular candidate, and even there the rule
is not _"reject a second `timeTravel` declaration"_. It is _"one history policy
per causal lineage"_ — a property of the owner. An authority that is singular
cannot be doubled regardless of how many declarations mention it, which is
exactly how `transactions` already behaves without any duplicate guard.

**Honesty about this row:** that `transactions` canonicalizes is MEASURED.
That two configured `timeTravel` declarations would genuinely conflict is
INFERRED from the config being meaningful and from the absence of any
canonicalizing `getOrCreate` in that module. If the singular/plural split ever
becomes load-bearing, it needs a bounded prototype rather than this inference.

#### This challenges the `features: []` assumption

We have been picturing one homogeneous collection. **That premise is not
earned.** If durable consequences are plural and distinguished by external
target, while a history policy is singular and owner-bound, then a flat array
plus a runtime duplicate rule is exactly the kind of generic mechanism this
audit keeps deleting. A grammar that makes the invalid combination
UNREPRESENTABLE is preferable to one that detects it — and structural
impossibility is not available inside a homogeneous array.

**Stated precisely, because "refuted" would overstate it:**

```text
flat `features: []` as the final grammar      UNPROVEN / CHALLENGED
a generic duplicate rule over that array      REFUTED / NOT EARNED
```

A compiler COULD accept a flat collection and enforce differing cardinalities
structurally or at the type level; that has not been shown impossible. The
discovery is not "arrays cannot work". It is stronger and more methodological:

> **We have no evidence that these independently derived functions belong to one
> common authoring category at all.**

Recorded as an open consequence, not a proposal: do not assume all surviving
optional authoring inputs share a collection. The `features: []` candidate must
survive this too, and the step-7 criteria gain a question — whether one property
can honestly hold things with different cardinalities.

#### `name` is explicitly out of scope here

A human-readable label may later survive for diagnostics or devtools. That is a
DIFFERENT function with a different owner, and it gets audited when diagnostics
does. _"We need a useful diagnostic label"_ must never become _"therefore
declaration identity exists"_.

### EXTENSION-SYSTEM FUNCTIONAL EXTRACTION — **CLOSED**

```text
DELETED FUNCTIONS
  post-exposure composition                      no surviving use case
  feature -> feature realization dependency      zero measured

NOT EARNED
  author-supplied substrate requirement protocol
  generic declaration identity / duplicate rule

SURVIVING FUNCTIONS, with owners
  preconstruction substrate knowledge   compiler / construction
  runtime realization                   construction / runtime realization
  final callable interception           finalization
  teardown registration                 tree lifetime          [LANDED]
  public type contribution              type compiler
  contribution collision, both halves   compiler
  substrate authority                   kernel
```

#### The principle Derivation 3 actually produced

> **Multiplicity and exclusivity belong to the semantic authority or function,
> never to a generic declaration-identity system.**

`transactions` is the worked example: its per-tree runtime already canonicalizes,
so a duplicate MENTION does not create a duplicate AUTHORITY, and no duplicate
guard is involved. Do not promote the `timeTravel` singleton READING to frozen
architecture without a bounded proof if it ever becomes load-bearing.

### Table F — legacy dispositions

Mechanical. **No further NULLs are run against these nouns** — they are mapped
onto answers derived independently of them.

The wording matters: several rows say _"no survival earned from the extension
function audit"_ rather than `DELETE`. Their extension-system justification is
dead, but an unrelated function could theoretically save part of one later — a
diagnostic label being the obvious candidate. Writing an unconditional deletion
would make a future diagnostics audit look like it was reopening a freeze.

| Legacy mechanism              | Basis                                                                                  | Disposition                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `.with()`                     | its function — post-exposure composition — is DELETE                                   | **DELETE**, no compatibility adapter (Rule 0l)                                           |
| `Enhancer<TAdded>`            | bundled authoring + type contribution + realization; each now has a separate owner     | **DELETE / REDESIGN** as a callable abstraction; no adapter                              |
| `plannedSignalTree()`         | its function — complete planning before construction — survives under the compiler     | **DELETE / REDESIGN** as a separate constructor                                          |
| `capabilities` (public field) | requirements measured intrinsic; no author protocol earned                             | public field **DELETE candidate**; the internal compiler knowledge survives              |
| `requires`                    | the realization-dependency function is DELETE                                          | **DELETE**                                                                               |
| `provides`                    | no dependency protocol remains for it to serve                                         | **no survival earned from the extension function audit**                                 |
| `name`                        | generic duplicate identity not earned                                                  | **no identity survival earned**; diagnostics naming unexamined                           |
| `bind()`                      | connecting a callable to an already-built host disappeared with the construction model | **no survival earned here**; internal realization may need something, derived separately |
| `ENHANCER_META`               | a bundle whose members now have different owners                                       | **decompose mechanically**; do not preserve the bundle because one member survives       |

**`ENHANCER_META` is the row most at risk of a lazy answer.** It currently
carries `name`, `provides`, `requires`, `capabilities` and `description`. Four of
those five have no surviving extension-cluster function, and the fifth
(`capabilities`) survives as internal knowledge rather than as an author-supplied
field. Preserving the envelope because one member has an internal analogue would
reconstruct the conflation the audit just took apart.

## Amendment 3 — ASYNC / LOAD / STATUS: discovery pass

**Status: CANDIDATE. This is a discovery pass, not a disposition.** Rule 0l
applies: `asyncSource`, `asyncQuery`, `loader` and `status` are evidence sources.
Nothing here asks whether they survive.

Measured from the authored contracts and the realized reader surfaces.

### What the family actually PROVIDES

```text
acquisition                     load, query
input binding                   input, initialInput            (asyncQuery only)
input shaping                   debounce, filter, equal        (asyncQuery only)
result placement                data, results
pending representation          loading
failure representation          error
reacquisition                   refresh(), rerun()
reset                           reset()
laziness                        lazy
hydration/snapshot participation hydrate, snapshot
manual lifecycle state machine  status: start(), setLoading(), setLoaded(),
                                setNotLoaded(), setSuccess(), succeed(),
                                idle, loading, loaded, notLoaded, error,
                                hasError, settled
```

### CORRECTION — this section was measured against the wrong files

The original scan covered `async-source.ts`, `async-query.ts`, `status.ts` and
`loader.ts`. **`loader.ts` is a 102-line tree-shaking re-export**; the machinery
lives in `entity-loader.ts` (720 lines) behind `attachLoader`, and `loader()`
exists to make an `entityMap` cache-aware. So the absence claims below were made
against a file that contains almost nothing.

**Re-measured, the family is TWO TIERS with very different capability:**

```text
TIER 1 — asyncSource / asyncQuery        bare acquisition
  cancellation                  ABSENT
  cache policy / TTL            ABSENT
  invalidation                  ABSENT
  tags                          ABSENT
  generation / request counter  ABSENT
  stale-result exclusion        PATH-DEPENDENT (see below)

TIER 2 — entity-loader, reached via loader() on entityMap
  staleTime                     PRESENT   (8 references)
  stale-while-revalidate        PRESENT   (5)
  tag-based invalidation        PRESENT   (tags 10, invalidat* 20)
  deduplication                 1 mention — unverified
  cancellation / abort          ABSENT
  generation / in-flight guard  ABSENT     <- WRONG. See Derivation A2:
                                              a run-id guard IS present
                                              (entity-loader.ts:450, 475, 488,
                                              508) and dedup IS real (:573,
                                              :592). Both corrected there.

BOTH TIERS
  retry                         ABSENT as a mechanism; the only occurrences are
                                the WORD in two status.ts comments
```

So cache policy and invalidation DO exist in SignalTree — attached to
`entityMap`, which Rule 0k already rates the strongest survival candidate. That
is a materially different starting point for the acquisition audit than "the
family provides nothing", and the earlier claim is withdrawn.

#### METHODOLOGY RULE, earned by this mistake

> **A facade can manufacture an ABSENCE result just as a legacy abstraction can
> manufacture a REQUIREMENT. Measure the implementation that owns the behaviour
> before deriving anything from absence.**

Rule 0l guards against a legacy noun dictating the solution. This is its mirror:
a 102-line re-export dictated a false emptiness, and every downstream disposition
would have inherited it. Absence is only evidence when it is measured where the
behaviour would live.

### Stale-result exclusion is PATH-DEPENDENT, which is worse than absent

`asyncSource`'s `runLoad()` begins with `currentSub?.unsubscribe()`:

```text
Observable loader
  stale LANDING through the prior subscription   PROTECTED (unsubscribe)
  cancellation of the underlying external work   SOURCE-DEPENDENT, not guaranteed

Promise loader
  stale LANDING                                  UNPROTECTED — the previous
                                                 `.then` still runs and still
                                                 calls `dataSignal.set(value)`,
                                                 guarded only by
                                                 `if (destroyed) return`, which
                                                 is teardown, not staleness
  cancellation of the underlying external work   ABSENT
```

**Unsubscribing excludes stale DELIVERY; it does not cancel the work.** Whether
the HTTP request is actually aborted depends entirely on the Observable the caller
returned. So the precise defect is that `AsyncSourceLoader<T>` promises one
abstraction over two execution models while providing **no uniform concurrency
contract** for either.

`AsyncSourceLoader<T> = () => Observable<T> | Promise<T>` accepts both. **So the
same API is safe or unsafe depending on which the caller happens to return**, with
nothing in the type or the docs marking the difference. A uniform absence would at
least be uniform.

**Two consequences, and the second is the important one.**

**1. Genuinely absent capabilities cannot be "preserved".** Cancellation and a
generation/in-flight guard are absent from BOTH tiers. Proposing them is ADDING
capability, a much higher bar than carrying a function forward: an absent
capability does not become a requirement just because the audit listed it as a
candidate. Each would need its own use case and owner from zero.

**2. `asyncSource`/`asyncQuery` are UNSAFE UNDER OVERLAPPING CONCURRENT
EXECUTIONS unless some external mechanism serializes them.** With no generation
counter, two overlapping `refresh()` calls can complete out of order and the
EARLIER-STARTED, LATER-COMPLETING one overwrites the newer result. The bound
matters: a caller that guarantees serialization is unaffected, so "unsound for
real concurrent work" would be broader than the evidence. It is a defect in the
measured model, not a function to carry forward — and it means the family's
apparent value is smaller than its surface suggests.

### `status` is APPLICATION-DRIVEN, which contradicts the original draft

`status` exposes `start()`, `setLoading()`, `setLoaded()`, `setNotLoaded()`,
`setSuccess()`, `succeed()`. **The application writes it.** It is not derived from
an operation and it observes nothing.

That directly contradicts the SignalTree-15 draft's assertion that _"lifecycle
belongs to execution, not resources"_. Whether or not that assertion is a good
idea, it describes something the current system has never had: there is no
execution to own a lifecycle here, only an enum-shaped state position with
convenience setters. So `status` is evidence for _"applications want to record
where they are in a workflow"_ — a claim about ordinary state — and evidence for
nothing about operation lifecycles.

### `asyncSource` vs `asyncQuery` overlap

Their surfaces are nearly identical — `data`, `error`, `loading`, `reset()`,
acquisition, plus one reacquisition verb each (`refresh()` / `rerun()`). The whole
of `asyncQuery`'s difference is INPUT: `input`, `initialInput`, `debounce`,
`filter`, `equal`. That is a candidate for two names over one function plus an
input-binding concern, but it is not derived here and must not be assumed.

### What the next pass must do

For each function above, in this order: use case, owner, whether the
already-derived architecture (store / derived / application service / causal
kernel / tree lifetime / external adapter) already supplies it, then NULL, then
greenfield minimum only if a real gap remains.

The honest possible outcome — and it must stay available — is that the entire old
async concept dissolves into store positions, derived projections and ordinary
application operations, and **SignalTree 15 has no async feature at all.** That
would not be a missing replacement. It would be a successful derivation.

## DERIVATION S1 — `status`: **no SignalTree-owned function survives**

Rule 0l. `status`, `StatusMarker`, `StatusSignal` and their methods are legacy
evidence only. The old draft's claim that _"lifecycle belongs to execution"_ is
NOT used as evidence that such an execution exists.

### The two questions that cannot be inferred from method names, measured

**H — transition legality: ZERO.** Every setter is the same two lines:

```ts
setLoading()    { stateSignal.set(LoadingState.Loading);   errorSignal.set(null); }
setLoaded()     { stateSignal.set(LoadingState.Loaded);    errorSignal.set(null); }
setNotLoaded()  { stateSignal.set(LoadingState.NotLoaded); errorSignal.set(null); }
setError(err)   { stateSignal.set(LoadingState.Error);     errorSignal.set(err);  }
reset()         { stateSignal.set(LoadingState.NotLoaded); errorSignal.set(null); }
```

No validation. `Error -> Loaded` without an intervening `Loading` is accepted;
duplicate `start()` is accepted; any state from any state is accepted. **This is
not a state machine SignalTree owns — it is unconstrained assignment.**

**I — automatic lifecycle observation: ZERO.** Nothing in core drives status from
an execution. `asyncSource`, `asyncQuery`, `loader` and `entity-loader` contain no
reference to any status setter or to `StatusMarker`. The only internal caller is
`status.ts`'s own HYDRATE path replaying a previously persisted value — restoring
a stored value, not observing an operation.

So `status` supplies **no execution-lifecycle observation function whatsoever**,
and the architectural prose asserting that ontology described something the
implementation never had.

### Three of the six setters are documented DX, not function

`start()`, `setSuccess()` and `succeed()` are byte-identical aliases of
`setLoading`/`setLoaded`, and the source says why:

> _"AI coding agents trained on Promise-state vocabularies (success/start/fail)
> frequently reach for these method names ... rather than fight the linguistic
> gravity, we accept them."_

That is a naming accommodation. It cannot earn a primitive.

### The implementation's own comment refutes the operation reading

From the hydrate path:

> _"`Loaded` is a statement about DATA, not about an operation — if the data was
> persisted alongside it, 'the data is loaded' is true on arrival."_

The code already knows this describes data, not execution.

### Function-by-function coverage

| #   | Function                                                                    | Covered by                                                            | SignalTree-owned? |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------- |
| A   | record a workflow state                                                     | an ordinary store position holding an enum                            | no                |
| B   | read it                                                                     | an ordinary accessor                                                  | no                |
| C   | transition it                                                               | an ordinary write                                                     | no                |
| D   | reset it                                                                    | a write of the initial value                                          | no                |
| E   | convenience predicates (`loading`, `loaded`, `idle`, `hasError`, `settled`) | ordinary derived projections — exactly the frozen store-only contract | no                |
| F   | persist / hydrate                                                           | whatever rules ordinary store positions independently receive         | no                |
| G   | causal participation                                                        | ordinary authored-state rules                                         | no                |
| H   | transition legality                                                         | **nothing — measured absent**                                         | n/a               |
| I   | lifecycle observation                                                       | **nothing — measured absent**                                         | n/a               |

### The one candidate invariant, and it is INCONSISTENT

Every non-error setter clears `errorSignal`. That coupling — "moving to a
non-error state discards the previous error" — is the only rule in the whole
surface that is not plain assignment.

**It contradicts the module's own stated intent.** The hydrate comment says:

> _"`Error` survives so a retry guard can report that the last attempt failed"_

but `setLoading()` — which is exactly what a retry does — CLEARS the error. So the
error survives a page reload and does not survive pressing retry. The retention
policy differs between the hydration path and the transition path.

That is a defect, and it is evidence about ownership — but stated precisely:

```text
MEASURED       current status error-retention behaviour is inconsistent
NOT EARNED     a SignalTree-owned generic error-retention invariant
BEST OWNER     application/domain, ABSENT an independently derived
               acquisition authority
```

The contradiction proves SignalTree has not established a coherent owner or
invariant here. It does NOT prove every possible error-retention policy must be
domain-owned: a future independently derived acquisition function could
legitimately own _"retain the last failure while the next attempt is pending"_.
Recorded this way so A1 cannot appear to reopen S1 if acquisition turns out to
have real execution state. An application wanting the behaviour the comment
describes is simply not served by the current coupling.

### Verdict

```text
OUTCOME A — every useful function is ordinary application state

status SignalTree FUNCTION        DELETE
StatusMarker / StatusSignal       legacy form, no survival earned here
LoadingState enum                 an ordinary domain value; not a primitive
workflow state itself             SURVIVES as ordinary store truth,
                                  application/domain-owned meaning
error-retention coupling          a domain policy, currently inconsistent;
                                  no SignalTree owner found
```

Ownership shape, pinned so the draft's imagined execution runtime cannot be
laundered back in:

```text
APPLICATION / DOMAIN   owns the meaning and the transitions
        v
STORE                  records canonical state
        v
DERIVED                optionally projects convenience predicates
```

No replacement `status` is designed. Its setters are not moved onto another
SignalTree abstraction. No operation lifecycle is created to preserve an ontology
the old system never had.

### Why this matters beyond `status`

This is the proof that Rule 0l generalises past the extension cluster. A
437-line feature with fourteen public members, its own marker, its own realized
signal type, its own contract file and its own reader allowlist reduces to **two
store positions and some derived predicates** — and the two capabilities its API
most implied (a state machine and lifecycle observation) are measurably absent.
The method is not merely deleting enhancer machinery; it is exposing false
ontology.

## DERIVATION T2 — entity-bound cache/freshness: **NOT entity-semantic. Outcome A.**

**Null:** assume `entityMap` survives but SignalTree provides no loader,
stale-time, SWR, tags or invalidation. An application cache/service can fetch and
write results into the entity map. What becomes impossible **without duplicating
SignalTree-owned entity semantics**?

That last clause is the whole test. The answer is: **nothing.**

### What actually keys the cache — measured

```text
cache identity        the loader's SCOPE — `stableStringify(params)`, i.e. the
                      EXTERNAL REQUEST's arguments
freshness             per-scope: `lastLoadedAtSignal` + `nowMs()`
single-flight dedup   PRESENT and real — `inFlight`, `inFlightParams`,
                      `inFlightResolve` (this corrects the earlier
                      "1 mention, unverified")
invalidation          an `invalidated` flag plus tag matching
landing               `entity.setAll(rows)` — the ORDINARY PUBLIC entityMap API
```

### The decisive measurement

**`entity-loader.ts`'s cache logic contains ZERO references to `SubjectId`,
`selectId`, entity keys, or entity removal.**

That answers the delete/recreate falsifier structurally, without needing an
experiment: freshness metadata cannot follow a semantic subject lifetime across
deletion and recreation, because it never referenced entity identity in the first
place. Delete an entity and recreate it under the same key — scope freshness is
untouched, because the two axes are orthogonal.

So, against the falsifier _"what exact `entityMap` semantic fact would an external
cache have to duplicate?"_:

```text
entity has a key                   not used by the cache
SubjectId / subject lifetime       not used by the cache
rekeying                           not used by the cache
structural membership              not used by the cache

request params identify a request  <- the ONLY cache identity, and every
                                      ordinary cache already has it
```

An application cache would duplicate **nothing SignalTree owns**. It keys on the
external request, and it lands through `setAll`, which is public.

### Answering the sub-questions

```text
invalidation meaning   "the cached ACQUISITION RESULT for this scope is stale,
                       re-run it" — NOT "canonical entity truth is no longer
                       authoritative". It sets a flag consulted by the next
                       load; canonical entity data is untouched until new rows
                       arrive.

freshness describes    THIS LOADER'S LAST ACQUISITION FOR THIS SCOPE. Not the
                       external resource, not the entity subject, not the
                       canonical value. Two maps over the same external
                       resource would each hold their own freshness — they
                       share nothing.

tags                   an index over CACHE ENTRIES for bulk reacquisition.
                       Remove the cache and a tag means nothing; no entity
                       carries one.

entity lifetime        cache state and entity lifetime never interact, so
                       there is no current behaviour to credit or fault.
```

### Two passes ran this, and only one of them executed anything

The measurements above were taken by reading the implementation. A second pass
then ran them as tests — `entity-loader-a2-falsifiers.spec.ts`, 10 measurements
against HEAD. They agree on the verdict and on entity-blindness, which is
corroboration rather than repetition. They disagreed on concurrency, and the
executable pass won; that correction is recorded above.

One precision the reading pass got slightly wrong in the other direction: the
IN-MEMORY cache is **single-scope**, not per-scope keyed (`:111-112`; multi-scope
LRU is explicitly deferred, RFC 0003 §5). Switching scope replaces the one entry.
Only PERSISTENCE is keyed per scope (`key::stableStringify(params)`, `:343`). So
"cache" overstates it: what exists in memory is a LAST-FETCH RECORD.

### The falsifiers, measured

`entity-loader-a2-falsifiers.spec.ts`, 10 measurements, all passing against HEAD.
They record what the implementation does; the two marked DEFECT are not
contracts to preserve.

```text
F1   same map key, NEW semantic subject (remove w1, add a different w1)
     -> loaded() true, lastLoadedAt unchanged, load() does not refetch.
     The substitution is invisible to the cache.

F2   clear() the entire collection
     -> loaded() true, load() no-ops. An empty collection reads FRESH.

F1b  add a locally-known entity
     -> not stale. Freshness is a fact about the last FETCH, never about
     the collection's contents.

F3   one external resource behind two collections in one tree
     -> TWO fetches, TWO independent freshness facts; invalidating one
     leaves the other fresh.

F3b  tags address COLLECTIONS, and only within one tree
     -> invalidateTag(treeA,'customers') === 1; treeB untouched.

F4   earlier-started, later-completing load
     -> cannot land. Run-id guard PRESENT (:450, :475, :488, :508),
     covering the Promise path too. CORRECTS Amendment 3.

F5   DEFECT: invalidate() issued while a fetch is in flight
     -> erased by that fetch's completion (settleSuccess does
     invalidated.set(false), :482). The pre-change value lands and reads
     FRESH for the whole staleTime window.

F6   DEFECT: refresh() while a fetch is in flight
     -> returns the pre-change in-flight promise (:592). Documented as
     "force a reload, ignoring staleTime/scope-match" — it does not ignore
     in-flight dedup.

F7   swr: true + invalidate()
     -> loaded() stays true. `swr` collapses loaded() into has-ever-loaded.

F8   landing
     -> setAll(rows) REPLACES. A locally-added row is discarded by the next
     successful load. Landing has no merge policy, so it cannot be said to
     respect entity identity or lifetime — it discards both.
```

### Function extraction, with the MEASURED owner of each

```text
FUNCTION              MECHANISM AT HEAD                        OWNER AS MEASURED
cache entry identity  (loader closure, last params); params    acquisition
                      compared by stableStringify. ONE entry:  INSTANCE
                      in-memory cache is single-scope by
                      design (:111-112, RFC 0003 §5). Not a
                      keyed cache — a last-fetch record.
freshness             lastLoadedAt timestamp + invalidated     acquisition
                      flag + scope-equality + staleMs (:411)   INSTANCE
                      — not the resource (F3), not the
                      subject (F1), not the entities (F1b/F2)
stale-while-reval.    ONE boolean inside ONE computed          nothing; a
                      (:300-302). No revalidation              display-state
                      orchestration exists.                    policy
invalidation          invalidated.set(true) (:604-606).        cache policy
                      Nothing else. Rows stay readable and
                      authoritative.
tag association       Set<string> on the collection node       cache policy
                      (:658-660) + a tree walk (:688-719).     index
                      No per-entity tags exist anywhere.
acquisition           app-supplied loadFn(params); loader      APPLICATION
                      invokes it (kickoff microtask / load /   supplies it
                      refresh)
landing               entity.setAll(rows) — whole-array        ordinary
                      replacement (F8)                         canonical write
lifetime              DestroyRef.onDestroy (:323-341) —        ANGULAR INJECTOR
                      injector lifetime. Entity removal and    lifetime; NOT
                      SubjectId death invalidate nothing       entity lifetime
                      (F1, F2).
scope                 per attachLoader instance; persist per   loader instance
                      `key::stableStringify(params)` (:343);   (+ tree, for tags
                      invalidateTag per tree                   only)
```

### Invalidation: the ownership audit, because the WORD sounds semantic

The three things `invalidate` could mean are distinguishable at HEAD, and only
one of them exists:

```text
CANONICAL INVALIDITY      "this entity value is no longer authoritative"
                          ABSENT. Rows are untouched and keep serving (F5).

CACHE STALENESS           "this acquisition result should be refreshed"
                          PARTIAL. There is no cached result distinct from
                          the rows to mark stale — only a boolean beside them.

REACQUISITION INTENT      "please fetch again"
                          THIS IS WHAT EXISTS. One flag whose only effects
                          are: un-skip the next load(), and flip loaded()
                          false unless swr.
```

So `invalidate()` is reacquisition intent plus a display flag. It is not
canonical invalidity, and it is not even eviction. Nothing here needs entity
semantics to express, and the term must not be carried forward as though it
denoted authority over truth.

### Freshness is not persisted — and the implementation already agrees

Treated independently of the loader bundle, as `status` was:

```text
entity data            PERSISTED (write-through of entity.all(), :419-428)
freshness timestamp    NOT persisted
invalidation tags      NOT persisted
in-flight request      NOT persisted
error / loading        NOT persisted
```

`seedFromSnapshot` (:430-438) calls `setAll(rows)` and deliberately does NOT set
`lastLoadedAt`, so seeded rows are stale and revalidate. The implementation's own
choice is therefore that **rows are candidate durable truth and freshness is
ephemeral policy** — evidence against freshness being canonical truth, from the
code that would benefit most from the opposite. Whether rows deserve to survive
reconstruction belongs to the `stored()` / hydration authority and is NOT derived
here.

### The two defects sharpen the separation rather than arguing for ownership

A cache with SWR and invalidation creates MORE opportunity for overlapping
executions, and F5/F6 are what that costs at HEAD: an invalidation event —
precisely the SSE/SignalR "plants changed" seam `invalidateTag` is documented
for — is silently destroyed if it arrives while a pre-change request is open, and
the resulting pre-change data reads fresh for the full `staleTime`. The run-id
guard (F4) prevents obsolete data from LANDING but does nothing about obsolete
data being MARKED FRESH.

Two consequences:

1. **A surviving cache function would not save `loader()`.** Freshness policy and
   correct acquisition are separable, and only one of them is even close to
   right here.
2. **The defect is not a function to carry forward.** Fixing it would be ADDING
   capability, at the same higher bar Amendment 3 set for cancellation.

### The hostile equivalence, and what survives it

```text
application cache/service
  owns timestamp / stale policy / in-flight promise / run id / tags
        v
  calls collection.setAll(rows)
        v
entityMap  (structural canonical state)
```

Every measured behaviour is reproducible this way, because the loader itself
consumes nothing but `all()` and `setAll()`. What the colocated version buys is a
nicer API, automatic refetch, and less application code — explicitly the list
that does NOT earn a primitive.

### Verdict

```text
OUTCOME A — ordinary cache policy, colocated with an entity map

SignalTree-owned cache/freshness FUNCTION    NOT FOUND
staleTime / SWR / tags / dedup               real, useful, and ORDINARY
loader() as a bundle                         no survival earned here
entityMap structural identity                untouched by this derivation
lifetime coupling                            injector lifetime only; entity
                                             death and rekeying are inert
persist / hydration                          DEFERRED to the stored()/hydration
                                             authority; freshness is NOT durable
tree-scoped tag addressing                   the one candidate remainder ->
                                             A3, NULL NOT RUN
```

**The colocation was the illusion.** `loader()` reads as entity-aware caching
because it is spelled inside `entityMap(...)`; it is a per-request cache that
happens to write through the entity map's public API. Rule 0k rates `entityMap`
the strongest survival candidate, and this derivation deliberately does not let
that rating extend to an adjacent mechanism — proximity is not ownership.

### What this does NOT establish

**One candidate remainder, and it is not entity-bound.** `invalidateTag` walks
`tree.$` to find tagged collections with NO global registry, so nothing leaks on
teardown (`:680-686`). An application registry of handles would have to solve
that itself. That is STRUCTURAL REACHABILITY — which SignalTree does own — and it
touches the frozen `durability authority is TREE-SCOPED` shape. It is the one
thing here that might be a real function, and it must earn its own derivation:

```text
A3 — TREE-SCOPED, REGISTRY-FREE ADDRESSING OF POLICY HOLDERS
  Does anything need to address, by name, every policy holder reachable
  from a tree — and is teardown safety enough to earn it?
  NULL NOT RUN.
```

Note what A3 is not: it addresses cache-policy holders, not entities, and it
would survive with `entityMap` regardless of whether any loader does.

It does not prove entity-aware cache semantics could never be valuable
(Outcome B). It proves the CURRENT one is not entity-aware. If a future
derivation independently establishes that cache validity must follow semantic
subject lifetime — surviving deletion, recreation and rekeying, with stale work
rejected against that lifetime — that would be a genuinely different and much
more interesting function, and it would be derived from zero rather than
recovered from here.

**CORRECTED — a generation guard IS present.** This pass claimed there was none
and that an older revalidation could still land after a newer load. Measured
(F4), that is wrong: `runId`/`myRun` gates every settle callback
(`entity-loader.ts:450, :475, :488, :508`), on the Promise path as well as the
Observable one, so an earlier-started, later-completing load cannot land. Tier 2
is materially better protected here than Tier 1, where the Promise path has no
exclusion at all.

The real concurrency holes are elsewhere, and both ship today (F5, F6): an
invalidation issued while a fetch is in flight is DESTROYED by that fetch's
completion, and `refresh()` returns the pre-change in-flight request instead of
forcing a reload. So the guard protects against obsolete data LANDING and does
nothing about obsolete data being MARKED FRESH. The conclusion the earlier
wording reached still holds, for different reasons: cache policy surviving would
not have rescued the acquisition mechanism.

## DERIVATION M — GENERIC MARKER MACHINERY: opening measurement

Run against the post-STATUS-DEL surface. Rule 0l: the marker protocol is
evidence, not architecture. **The null is not "do we need markers?"** but:

> What becomes impossible in a greenfield compiler if declaration kinds are
> recognised and lowered DIRECTLY, with no generic runtime `Marker` concept?

paired with Rule 0m's companion:

> Would eliminating the runtime marker ontology prevent any authoring capability
> that direct declaration compilation could not preserve?

### The measured contract is FOUR members, not a large protocol

`materialize-markers.ts:97` —

```ts
interface MarkerProcessor {
  check: (value) => boolean; // declaration recognition
  create: (marker, notifier, path, ctx, parentPositionId) => unknown;
  snapshot?: (node) => unknown; // OPTIONAL
  hydrate?: (node, value, mode: HydrateMode) => void;
}
```

`snapshot` and `hydrate` are OPTIONAL, and the docblock records that omitting
`snapshot` means _"my node is already a plain signal, the normal walk handles
me"_ — true of `stored()` **and nothing else today**.

### THE CODEBASE ALREADY WARNS ABOUT THIS EXACT AUDIT

Verbatim from the stamp docblock:

> _"⚠️ There is NO `owns()` hook. Earlier revisions of this comment referred to
> one as though it existed, and a research doc then repeated it as fact — the
> exact stale-comment-becomes-canon failure this codebase keeps hitting."_

Ownership is decided INSIDE each marker's `hydrate`, which already receives the
mode. That is a fifth function someone previously believed existed and does not.
It is the same class as this session's four vocabulary collisions, and it is why
this derivation measures the contract rather than adopting an inventory.

### Presumed functions that are NOT marker concerns — measured

```text
traversal participation    visit-tree contains ZERO marker references.
                           Traversal is marker-BLIND.
teardown / lifetime        NO marker calls registerCleanup. Zero.
capability / substrate     markers declare NO capabilities — that axis belongs
                           to enhancer metadata (Derivation 1)
lazy realization           a TREE OPTION, `signalTree(state, { lazy: lazy() })`,
                           not a marker function
serialization hook         not separate — it IS `snapshot`, already in the
                           contract
```

Five presumed rows placed elsewhere or dissolved before the derivation begins.

### FIVE AUDIT ENTRY POINTS — not yet five functions

> **The measured protocol exposes four hooks plus one adjacent reporting
> mechanism. These are FIVE AUDIT ENTRY POINTS, not five architectural
> functions.** Each must be decomposed by OBSERVED BEHAVIOUR before ownership is
> assigned.

**Two symmetric risks, and I only guarded against one.** Presumed functions can
collapse because the code never implements them — that guard worked, five rows
dissolved. But **one protocol member can BUNDLE several independently meaningful
functions**, which is exactly what `Enhancer` did with authoring, realization and
type contribution. Reading four hooks as four functions would let protocol shape
manufacture an architecture just as surely as the presumed fourteen would have.

| Entry point | Hook                | Behaviours to measure before assigning ownership                                                                                                                |
| ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1          | `check`             | declaration recognition · discrimination from ordinary values · kind dispatch                                                                                   |
| M2          | `create`            | runtime realization · backing-state creation · public-surface creation · owner/PositionId association · notifier integration · construction-context consumption |
| M3          | `snapshot`          | tree-snapshot projection · marker-specific omission/transformation · the representation its several consumers require                                           |
| M4          | `hydrate`           | payload application · acceptance/refusal · normalization · restore-vs-rehydrate · **authority decision** · live-state mutation · diagnostic reason production   |
| M5          | `onHydrateDecision` | observability of refusal/normalization · audience · machine-readable consumer need                                                                              |

**`create` is the clearest suspect.** Its signature —
`create(marker, notifier, path, ctx, parentPositionId)` — already names four
distinct concerns in its parameters alone. It is an implementation envelope until
measurement says otherwise.

**And `hydrate` is the second.** The `owns()` warning cuts both ways: the absence
of an `owns()` HOOK does not prove the absence of an ownership FUNCTION. The
docblock says ownership is decided INSIDE `hydrate`, so `hydrate` is bundling at
least payload application and an authority decision. This is where the inventory
may legitimately EXPAND — into measured functions, not presumed protocol nouns.

### Corrections to my own phrasing

**M3 / serialization.** _"The serialization hook is not separate — it IS
`snapshot`"_ is mechanically true of the current protocol and is NOT a semantic
conclusion. The accurate statement:

> There is no separate marker-level serialization hook; current serialization
> REUSES `snapshot`.

The same hook may today service `tree()`, temporal capture, serialization, SSR
transfer, persistence payloads and reconstruction input — consumers with
potentially different ownership and representation requirements. That distinction
matters when serialization gets its own derivation.

**M5 / colocation.** I placed `onHydrateDecision` in the marker inventory because
it lives in the same module. **That is the colocation error I rejected five times
this session, applied to my own row.** Corrected:

```text
M5  reconstruction-decision observability
    CURRENT IMPLEMENTATION   adjacent to marker hydration
    OWNER                    UNPROVEN
```

The real question is who needs to know that reconstruction declined or normalised
something, and why — which may be reconstruction diagnostics, developer
diagnostics, persistence diagnostics, adapter reporting, or no independently
necessary function at all.

### Order — M1+M2 first, jointly

Not mechanically M1 through M5. `check` and `create` are the only MANDATORY
members and therefore the best candidates for a real compiler/declaration
substrate. The joint null:

> **Can surviving declaration kinds be compiler-recognised and lowered DIRECTLY
> into their realized state and API, without preserving a generic runtime
> `MarkerProcessor` abstraction?**

If yes:

```text
check + create   ->  a compiler implementation protocol
generic runtime Marker ontology  ->  DELETE
declaration-specific lowering    ->  may survive
```

M3/M4/M5 then run as a separate **representation / reconstruction cluster**,
with their current membership in `MarkerProcessor` given no weight in deciding
their future owner. They may migrate out of declaration realization entirely —
which would be the result that dissolves the generic `Marker` concept rather
than merely shrinking it.

### DX pressure for M1/M2, recorded now (Rule 0m)

> **Can users declare rich state constructs inline with ordinary state, without
> knowing a Marker protocol exists?**

That capability is worth preserving. It does NOT require `Marker`,
`MarkerProcessor`, `MARKER_META`, `check` or `create` to be user-visible — or to
survive internally as a common abstraction. The greenfield target is allowed to
be `declaration grammar -> compiler recognises kinds -> kind-specific lowering ->
ordinary compiled topology`, with no generic marker runtime anywhere.

### Rule 0j-2 constraint on this derivation

`asyncSource` and `asyncQuery` are frozen DELETE and still physically present.
**Their `create`/`snapshot`/`hydrate` implementations must not drive this
derivation.** Behaviour is measured primarily across `entityMap` and `stored`,
the declaration kinds with no deletion disposition; the pending-deletion ones are
noted separately where they differ.

**The restore-vs-rehydrate distinction is deliberately NOT listed as its own
row.** It is a parameter of M4, and whether it is a generic distinction or an
artifact of deleted features is one of the questions M4 must answer.

## DERIVATION M1+M2 — `create` MEASURABLY BUNDLES, and per-kind variation proves it

Measured across `entityMap` and `stored` — the two declaration kinds with no
deletion disposition. `asyncSource`/`asyncQuery` are excluded per Rule 0j-2.

### The decisive evidence is a PARAMETER THAT IS DELIBERATELY UNUSED

```ts
// stored.ts:525
export function createStoredSignal<T>(
  marker: StoredMarker<T>,
  _notifier?: unknown,        // <- underscore-prefixed, typed `unknown`
  path?: string,
  context?: { … },
  parentPositionId?: number
)
```

`stored` does not use the notifier **at all** — 0 references. `entityMap` passes
it straight into `createEntitySignal`. So **notifier integration is not intrinsic
to "realization"**; it is one kind's requirement wearing a shared parameter.

**Stated at the strength the evidence supports:** per-kind non-use of a shared
input is EVIDENCE of an envelope, not proof on its own — an interface may
legitimately pass a superset context. What makes it decisive is the COMBINATION
below: `stored` ignores notification entirely while `entityMap` independently
varies notification, capability-gated PositionId allocation, public-surface
augmentation and feature attachment. Those are semantically different behaviours
behind one callback.

### What `create` does, measured from `entity-map.ts:259-300`

```text
1  read the declaration's config          marker.__entityMapConfig
2  query construction capabilities        context.hasCapability('position-topology')
                                          context.hasCapability('mutation-capture')
3  create the realized runtime value      createEntitySignal(...)
4  integrate the write notifier           passed through — entityMap YES, stored NO
5  associate owner/position identity      context.allocatePositionId(parentPositionId)
                                          CAPABILITY-GATED: falls back to () => undefined
6  contribute PUBLIC SURFACE              computed slices attached to the signal
7  attach a declaration-specific feature  loader().attach(...)
```

Seven behaviours behind one hook, and **(4), (5), (6) and (7) all vary by kind or
by capability.** Position allocation is not even unconditional within one kind —
it is gated on `position-topology`, degrading to `() => undefined`.

### Consequences for the derivation

```text
M2 "pre-exposure realization"   NOT one function — an implementation envelope,
                                the same shape `Enhancer` had

candidate separable functions   declaration-config consumption
                                construction-capability query
                                runtime realization
                                write-notification integration      per-kind
                                owner/position association          capability-gated
                                public-surface contribution         per-kind
                                declaration-specific feature wiring per-kind
```

None of those is yet assigned an owner. What is established is only that the hook
is not atomic, so no ownership may be assigned to `create` as a whole.

### What this suggests about the joint M1+M2 null — NOT yet an answer

The null asks whether surviving declaration kinds can be compiler-recognised and
lowered directly without a generic runtime `MarkerProcessor`. The measurement is
consistent with that — the shared hook carries a parameter one kind ignores, a
position allocator that degrades to a no-op, and per-kind surface and feature
wiring — which is what an over-general envelope looks like rather than a
load-bearing abstraction.

**But consistency is not proof.** The registry also buys two things the docblock
names explicitly and this derivation has not yet weighed: **lazy
self-registration keeps an unused marker's machinery out of the bundle**, and
**the O(1) stamp keeps one third-party predicate off every node's hot path**.
Both are implementation-strategy claims rather than semantic ones, and both must
be answered before the envelope is called unnecessary. A greenfield compiler that
recognises kinds directly may achieve both more cheaply — or may not.

### DX pressure (Rule 0m)

Nothing measured here touches the authoring capability. `stored('key', v)` and
`entityMap({...})` are inline declarations beside ordinary state; the user never
names `MarkerProcessor`, `check` or `create`. **Whatever happens to the envelope,
the capability is unaffected** — which is exactly the separation Rule 0m exists
to keep visible.

## M1+M2-R1 — a real public extension CONTRACT. **Not yet a surviving function.**

**CORRECTION TO MY OWN INFERENCE.** I wrote that open declaration-kind
registration "survives the null". That is one step too far, and it let PUBLICNESS
become the new legacy bonus — the same error class as every other in this audit,
in a new disguise. What the evidence below establishes, precisely:

```text
HISTORICAL / PUBLIC USE CASE      PROVED
  users can define custom inline declaration kinds outside core and have
  SignalTree realize them into custom tree APIs

SURVIVING FUNCTION                UNPROVEN
  that SignalTree 15 must support an open set of third-party declaration kinds

SURVIVING MECHANISM               UNPROVEN
  that a global runtime registerMarkerProcessor() registry must exist
```

The demo advertises _"markers AND enhancers"_ in one breath — and the enhancer
half of that same sentence was already found to have no surviving function. Being
taught and advertised identifies a capability worth examining; it cannot settle
the architecture.

**The matrix row is therefore the CAPABILITY, not the API:**

> _A package outside core can introduce a new inline declaration form that
> participates in SignalTree construction and contributes its realized state and
> API, without requiring a core release._

```text
registerMarkerProcessor        PUBLIC, exported from @signaltree/core/authoring
                               (deliberately narrowed OUT of the root in v7)

internal callers               use a DIFFERENT function —
                               registerBuiltinMarkerProcessor — so the public one
                               exists FOR third parties, not as core's own path

taught                         docs/guides/custom-markers-enhancers.md:117
                               teaches it as the extension contract

exercised                      custom-extensions-demo registers TWO custom
                               declaration kinds — isCounterMarker,
                               isSelectionMarker — with their own processors

advertised                     nav + home components: "Build your own markers and
                               enhancers — registerMarkerProcessor() and .with()
                               chains"
```

**Contrast with everything else this audit has deleted.** `.with()` had zero
genuine post-exposure use; `asyncSource`/`asyncQuery` had zero consumers; the
substrate-capability protocol was structurally unusable because its value type was
private. Here the contract is public, documented, demonstrated with two
independent custom kinds, and advertised as a product capability.

**Honest bound.** The demo is first-party code demonstrating a third-party
pattern, so this proves the contract is OFFERED, TAUGHT and EXERCISABLE — not
that an external consumer depends on it today. That is still materially stronger
evidence than anything the deleted mechanisms produced, and under the standing
rule that TP need cannot be refuted by workspace evidence, it is enough to stop.

**Consequence:** "keeps one third-party predicate off every node" is not
obviously solving a phantom requirement — but the requirement it serves is still
unproven as a SURVIVING one, so it cannot yet justify the mechanism either.

## M1+M2-R2 — the "hot path" phrasing OVERSTATES the workload

Measured where recognition actually executes:

```text
LINEAR PREDICATE SCAN  (MARKER_PROCESSORS iteration, isRegisteredMarker)
  signal-tree.ts:1033   the construction walk over the state literal
  lazy-tree.ts:120      lazy materialization
  signal-tree.ts:464    a DEV-ONLY warning — ngDevMode-guarded, sampled to
                        ENTITY_ARRAY_SAMPLE elements, and memoised per key

  NOT on writes · NOT on every tree() · NOT on snapshots

O(1) STAMP LOOKUP  (PROCESSOR_STAMP)
  utils.ts:632          snapshot/unwrap — this one DOES run per tree() snapshot
  serialization.ts      hydrate paths
```

So the two mechanisms sit on different paths. The linear scan the stamp exists to
avoid is **construction-time and lazy-materialization-time**, executed once per
declaration node per tree — an O(n) walk that already has to happen. The stamp
itself is on the snapshot path.

**Another instance of the stale-comment lesson, in a subtler form:** the docblock
accurately describes a real optimization while its phrase "hot path" overstates
the architectural weight of the code path it optimizes. A per-node predicate scan
during a construction walk is a performance detail; the same phrase would carry
very different weight if it ran per mutation. Do not accept a comment's
characterization of WORKLOAD as a measurement of it.

### Where this leaves M1+M2 — OPEN, and harder than the last measurement suggested

```text
open declaration-kind registration   REAL public contract — survives the null
constant-time recognition           function real; current form UNPROVEN
tree-shaking of unused kinds        function real; current form UNPROVEN
create() as one function            REFUTED — it is an envelope
"hot path" justification            OVERSTATED — construction-time, not runtime
```

The remaining question is no longer _"does a generic registry survive?"_ but:

> **Given a real open-set extension requirement, is today's `MarkerProcessor` —
> four bundled hooks, a shared `create` envelope, a linear predicate array and a
> stamp — the minimum form that serves it?**

That is a much narrower question, and it is where M1+M2 resumes. Rule 0m is
unaffected either way: the authoring capability is inline declaration beside
ordinary state, and no user names `MarkerProcessor`.

## M1+M2-R3 — the registry has **none of the properties of a runtime registry**

The three things R1 conflated, separated and measured:

```text
OPEN SET                  third parties define kinds core does not know
PRE-CONSTRUCTION          those kinds participate when a tree is compiled
RUNTIME REGISTRY          a global mutable registerMarkerProcessor(check, create)
```

**Measured against the actual mechanism:**

```text
unregister / deregister    DOES NOT EXIST
                           (the one lexical hit is `hasUnregisteredSymbolKeys`,
                            an unrelated function — vocabulary collision again)
per-tree registries        NONE — one global `MARKER_PROCESSORS: MarkerProcessor[]`
ordering / priority        NONE
duplicate registration     SILENT NO-OP — `if (alreadyRegistered) return`
late registration          DEV-WARNED against, in two places:
                             the registry warns when registering after a tree
                             has been built
                             signal-tree.ts:1050 tells users to register
                             "BEFORE creating the tree"
```

**So the mechanism is an append-only, global, unordered, unremovable collection
whose own diagnostics tell users to populate it before construction.**

**Stated precisely — the array IS mutable at runtime.** What has no evidence is
that runtime dynamism is a required FUNCTION:

```text
RUNTIME MUTABILITY               physically exists in 14.x
RUNTIME DYNAMISM AS A FUNCTION   no evidence
PRE-CONSTRUCTION DECLARATION SET accurately describes intended usage
SURVIVAL OF THE CAPABILITY IN 15 still UNPROVEN
```

That distinction stops another implementation observation from becoming
architecture.

Its only dynamism — "you may call this at any time" — is precisely the property
its own warnings discourage using.

### What this does to the three candidates

```text
OPEN SET                  CANDIDATE — the capability is real
PRE-CONSTRUCTION BOUNDARY CANDIDATE — and it is what the code actually
                          enforces, by warning
RUNTIME REGISTRY          the mechanism exhibits NONE of the properties that
                          would make runtime dynamism load-bearing. Its
                          mutable-global form is earning nothing measurable.
```

That is the strongest available evidence that the registry is an **implementation
form for a pre-construction extension boundary**, not the function itself.

**Still not concluded:** whether the third-party declaration capability survives
greenfield derivation at all. That question is upstream of everything here, and
it is where M1+M2 resumes:

> **Does the third-party custom-declaration capability itself survive, and if so
> what is the minimum external authoring/compiler boundary that provides it?**

If it survives, this is a legitimate EXTERNAL boundary — unlike a shim between
15.0 and rejected 14.x internals — and its minimum form gets derived from zero.
If it does not, the current public API remains valuable historical evidence with
no architectural entitlement.

**Nothing is frozen:** not a descriptor, symbol, `kind` field, plugin object,
callback shape, registration syntax, or compiler protocol.

## M1+M2-E0 — the two concrete custom declarations **collapse to ordinary composition**

Evidence: `declaration-extensibility-e0.spec.ts`, 3 executable rows.

**Null:** SignalTree 15 has a CLOSED set of compiler-recognised declaration
forms. **Falsifier:** produce a valuable third-party use case that cannot be
correctly implemented with already-earned primitives without participating in
compilation before exposure.

Functions extracted from the two custom declarations the demo actually defines —
`counter` and `selection` — never from "custom marker":

| #   | Function                                                                                   | Reproduced without any protocol?                                                           |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| E1  | inline authoring — a library construct appears beside ordinary tree state                  | **YES** — `signalTree({ counter: makeCounter(10, 5), plain: 1 })`                          |
| E2  | type transformation — declaration type becomes a different realized type                   | **MOOT** — the author builds the REALIZED thing directly, so there is nothing to transform |
| E3  | writable state exposed through the tree                                                    | **YES** — reads and writes work                                                            |
| E3b | **canonical SignalTree truth**                                                             | **UNPROVEN** — accessibility is weaker than canonicality                                   |
| E4  | derived / public surface contribution                                                      | **YES** — a `computed` member and four methods survive construction                        |
| E5  | compiler integration — topology, ownership, notification services unavailable to user code | **NOT EXERCISED** by either example                                                        |
| E6  | representation participation — special snapshot/reconstruction                             | **NOT EXERCISED**; the value appears in `tree()` by the ordinary path                      |
| E7  | package encapsulation — an external package ships all of it                                | **YES** — `makeCounter` is an ordinary exported function                                   |

Nesting works too, with no path or position protocol involved.

### TWO CORRECTIONS to this row

**E3 was overstated.** The probe reproduced _writable state exposed through the
tree_, not _canonical SignalTree truth_. Canonicality is the stronger claim: if
the internal Angular signal has no kernel slot, no PositionId/SubjectId where
required, bypasses physical commit, escapes causal attribution, is not restored
by undo, or persists differently, then it is not equivalent to ordinary canonical
state — even though `tree.$.counter.increment()` works and `tree()` reads `3`.

**And E0 answers one question using another as an assumption.** The probe imports
`signal`/`computed` from `@angular/core` and relies on SignalTree's
"Existing signals — preserve" rule. That rule is **itself UNPROVEN greenfield
machinery**:

```text
A  does third-party declaration extensibility need a marker protocol?
B  does SignalTree 15 want arbitrary prebuilt ANGULAR signals accepted as
   declarations / canonical state?
```

E0 answers A while assuming B. The architecture direction has been _neutral
kernel -> framework realization_, not _author-supplied Angular signal treated as
a canonical declaration_. So `isSignal` preservation must not become the new
accidental spelling merely because it defeated the old marker example — that
would be a legacy mechanism manufacturing the replacement.

**Result stated at its actual strength:**

> Under the CURRENT "preserve existing Angular signals" behaviour, the two
> demonstrated custom-marker examples require no marker protocol.

NOT yet: _under the greenfield architecture, independently earned primitives
reproduce them._

### The sharp finding: the protocol compensates for a SHAPE, not a semantic

The tree already preserves any `isSignal` value verbatim
(`signal-tree.ts:1054`: _"Existing signals - preserve"_). My probe builds on a
real Angular `signal` and attaches methods and a `computed` — so `isSignal` stays
true and the construct passes through intact.

**The demo's `createCounter` returns `(() => valueSignal()) as CounterSignal` — a
plain closure, NOT an Angular signal.** It fails `isSignal`, which is precisely
why it needed a marker.

> **For the two concrete custom-marker examples, no demonstrated semantic
> requires the marker protocol.** Their user-facing behaviour is reproducible
> under the current preserved-signal path, and the protocol's demonstrated
> differentiator is acceptance/transformation of a NON-SIGNAL DECLARATION SHAPE.

### Where a survival case would have to come from

E5 and E6 — and **neither demo example exercises either**. Nothing in `counter`
or `selection` touches `PositionId`, `SubjectId`, the causal runtime, the
notifier, commit authority or persistence consequence. They are ordinary signals
with methods.

**Not concluded.** This falsifies the strongest CONCRETE evidence for the
capability; it does not prove no E5/E6 use case exists. A construct genuinely
requiring pre-exposure topology allocation, ownership establishment or storage
layout participation — unobtainable after `signalTree()` returns — would be real
evidence for an external compiler boundary. None has been produced.

And even if one were, it would establish only that boundary. Not `Marker`, not
`MarkerProcessor`, not the four-hook bundle, not global registration.

**The next test is an EQUIVALENCE FORK, not a single question.** Asking only
"are preserved signals second-class?" would be too weak, because a second-class
result does NOT rescue compiler extensibility:

```text
PATH A   preserved external signal
         -> causal ownership · rollback · undo · commit participation

PATH B   ORDINARY CANONICAL STATE + library API composed around the accessor
         const tree = signalTree({ counter: 10 })
         const counter = makeCounterApi(tree.$.counter)
         -> the same properties
```

**If B satisfies everything even when A fails, third-party compiler
extensibility still has no survival evidence.** That is the real E5 falsifier,
and it is strictly stronger than discovering today's shortcut is second-class.

Persistence failure in path A would likewise prove only that a preserved Angular
signal is not canonical truth — persistence is already derived as a consequence
OF committed canonical truth, so it cannot own something that never became
canonical.

### DX pressure (Rule 0m)

Reusable third-party abstractions stay ergonomic under the closed-language null —
`makeCounter()` is an ordinary function and the construct sits inline beside
ordinary state. Whether such abstractions must be able to EXTEND THE DECLARATION
GRAMMAR is a different and still unproven question.

## M1+M2-E5 — THE FORK RESOLVES. **Third-party compiler extensibility has no survival evidence.**

Evidence: `declaration-extensibility-e5-fork.spec.ts`, 5 executable rows.

Both candidate paths run against the same kernel properties, because asking only
_"are preserved signals second-class?"_ would have been too weak to settle
anything.

```text
PATH A   a prebuilt Angular signal preserved by the tree
PATH B   ORDINARY canonical state, library API composed AROUND the accessor
```

| Property                                        | PATH A — preserved signal                   | PATH B — canonical + composed API      |
| ----------------------------------------------- | ------------------------------------------- | -------------------------------------- |
| captured by undo                                | **NO** — value stays 11 after `tree.undo()` | **YES** — restored to 10               |
| derived composition                             | yes                                         | **YES** — `computed` over the accessor |
| transaction rollback through the generic kernel | not tested; moot                            | **YES**                                |
| ordinary canonical truth in the snapshot        | reachable, not canonical                    | **YES**                                |

### Two results, and the second is the one that closes the question

**1. A preserved Angular signal is NOT canonical truth.** Measured, not inferred:
its write never becomes authored history, so `undo()` cannot restore it. This
confirms E3b — accessibility is weaker than canonicality — and upgrades it from
UNPROVEN to **measured FALSE**. The "Existing signals — preserve" path produces a
value that is reachable through the facade while escaping the causal kernel.

**2. PATH B satisfies everything PATH A fails.** A library can put its value in
ORDINARY CANONICAL STATE and compose its API around the tree's own accessor —
gaining undo, transaction rollback, snapshot participation and derived
composition, none of which require extending the declaration language.

> **Therefore third-party compiler extensibility has NO survival evidence.** The
> demonstrated capability — a package shipping a reusable typed abstraction that
> sits beside ordinary state — is obtainable with already-earned primitives.

This is strictly stronger than the second-class finding: even though PATH A
fails, PATH A's failure does not rescue the compiler-extension case, because
PATH B never needed it.

### Disposition — and there is NO "smaller form" left to derive

**If the function did not survive, there is no form question.** Asking _"what is
the minimum `MarkerProcessor`?"_ or _"what is the minimum registration
mechanism?"_ would be deriving a shape for something that failed its null.

```text
M1  third-party / open recognition        CLOSED — NOT EARNED
M2  generic third-party realization       CLOSED — NOT EARNED

registerMarkerProcessor                   legacy mechanism, no entitlement
MarkerProcessor                           no current survival basis
open predicate registry                   moot
tree-shaking / stamp / predicate-scan     MOOT — optimizations of machinery
                                          whose function did not survive
```

**What MAY still survive is a different question entirely:** machinery needed by
SIGNALTREE-OWNED declaration forms. That is **DEFERRED**, and deliberately:

> Given only declaration forms that independently survive as SignalTree-owned
> concepts, what is the minimum construction machinery needed to recognise and
> lower them?

It cannot be answered now, because it depends on the `entityMap` and `stored`
derivations — and **if `entityMap` fails its own null and `stored` decomposes
into other mechanisms, there may be zero special declaration forms left.**
Building their common compiler abstraction now, merely because two legacy
survivors are still physically present, would be the colocation error one more
time. That shared abstraction may only emerge if later rows independently force
it.

Rule 0n governs the disposition: 14.x's public contract is historical evidence
and users needing it may remain on the old major.

### Rule 0m check — stated precisely, because "survives intact" is too strong

Path B reproduces the SEMANTIC capability and the PACKAGE ABSTRACTION. It does
NOT reproduce the historical authoring experience:

```text
14.x    signalTree({ counter: counter(...) })
        tree.$.counter.increment()

Path B  const tree = signalTree({ counter: 10 })
        const counter = makeCounterApi(tree.$.counter)
        counter.increment()
```

_"A third-party abstraction can be declared inline and appear naturally in the
tree's typed API"_ is NOT reproduced. **And that is acceptable** — Rule 0m does
not require preserving it now; it requires not converting a semantic result into
a DX prohibition.

```text
SEMANTIC REQUIREMENT
  third-party compiler extensibility        NOT EARNED

DX CAPABILITY
  reusable typed third-party abstraction    PRESERVED

DX PRESSURE
  library abstractions feeling naturally colocated with tree state and
  tree API                                  DEFERRED to the final DX pass

SPECIFIC HISTORICAL SPELLING
  inline declaration -> augmented tree.$    NO ENTITLEMENT
```

The final DX pass may yet find a way to offer something resembling
`tree.$.counter.increment()` WITHOUT letting packages extend the declaration
grammar — or may conclude the composed form is the better architecture. Neither
is decided here, which is exactly what Table G exists to hold.

### A DECLARATION-ADMISSION QUESTION surfaced, and it is not a "defect" yet

```text
CURRENT BEHAVIOUR      arbitrary existing Angular signals are preserved
                       (signal-tree.ts:1054)
MEASURED CONSEQUENCE   such state may escape canonical/causal machinery —
                       readable and writable through tree.$, invisible to undo
DISPOSITION            UNPROVEN. Derive when the declaration-admission and
                       publication boundary is audited.
```

**Deliberately NOT called an architectural defect.** It is defective relative to
current expectations, but greenfield may simply decide that **prebuilt Angular
signals are not admissible canonical declarations at all** — which would DELETE
the problem rather than repair it. Calling it a defect now would presuppose that
admitting them is correct and only their treatment is wrong.

## DERIVATION M3/M4/M5 — REPRESENTATION / RECONSTRUCTION (queued)

**Precondition.** M1/M2 third-party declaration extension is CLOSED — NOT
EARNED. **`MarkerProcessor` membership confers ZERO ownership.** Do not derive a
generic marker abstraction from the fact that `entityMap` and `stored` currently
share hooks.

**Contamination guard.** `asyncSource`/`asyncQuery` remain frozen DELETE and
cannot sponsor any row here; `status` is already gone. Evidence comes from
independently unresolved or surviving functions — primarily `entityMap`, `stored`
and the generic consumers — never from mechanisms already sentenced.

**Order: M3, then M4, then M5.** Not bundled, and specifically not M4+M5 merely
because reporting currently originates during hydration.

### M3 — SNAPSHOT / REPRESENTATION

```text
NULL      no declaration-specific snapshot hook is required
QUESTION  what valuable function becomes impossible if snapshots are produced
          entirely from realized canonical truth?
MEASURE   every current consumer of snapshotMarkerNode / processor.snapshot,
          resolved by CONTROL FLOW: tree() · temporal capture · serialization ·
          persistence · SSR/transfer · anything else
CRITICAL  one hook serving several consumers does NOT prove one representation
          satisfies one architectural function. Separate consumer requirements
          BEFORE assigning ownership.
```

M3 first because it can establish an early boundary — _realized canonical truth
-> representation_ versus _declaration kind -> special representation_. If the
former wins, the generic-marker case is weakened before reconstruction is
touched.

### M4 — RECONSTRUCTION

```text
NULL       no generic declaration-specific hydrate hook is required
DECOMPOSE  payload application · acceptance/refusal · normalization ·
           authority decision · restore-vs-rehydrate · live canonical mutation ·
           diagnostic reason production
QUESTION   which independently survive, and who owns each?
DO NOT     presume HydrateMode survives · presume restore-vs-rehydrate survives ·
PRESUME    presume declaration kinds own reconstruction · read one hook as one
           function
```

The most hostile of the three: `hydrate` is already known to bundle authority,
transformation, refusal, mode semantics and mutation.

### M5 — DECISION OBSERVABILITY

```text
NULL      reconstruction refusal/normalization requires no generic reporting
          mechanism
QUESTION  who actually CONSUMES the decision, and what next action depends on it?
OWNERS    reconstruction · diagnostics · persistence · adapter · dev tooling ·
          nobody
GUARD     `onHydrateDecision` living beside marker hydration carries ZERO weight
```

Last, because **there may be no decision worth reporting once M4 decomposes.**

### The cluster need not resolve uniformly

```text
M3 survives somewhere · M4 partly survives elsewhere · M5 deletes ·
MarkerProcessor still deletes
```

is a permissible outcome. Nothing requires one verdict across three entry points.

## DERIVATION M3 — opening measurement: **the admissible evidence base is n=1**

Rule 0o applied: the function is stated before the hook is opened, and legacy
gets last look.

### ZERO-STATE

```text
Assume SignalTree 14 never existed.

SURVIVING ARCHITECTURE   canonical store truth · read-only derived projections ·
                         causal authority · persistence as a post-commit
                         consequence under a tree-scoped durability gate

FUNCTION                 produce an external DATA representation of tree state

WHAT REQUIRES IT         reading the whole tree as plain data; handing a payload
                         to a durable consequence; transferring state across a
                         process boundary; recording a history entry

WHAT BREAKS WITHOUT IT   all four — the tree would be readable only
                         position-by-position through its accessors

CAN SURVIVORS SOLVE IT   a uniform walk over realized canonical truth produces
                         it, PROVIDED every realized value's state is
                         identifiable
```

That proviso is the whole of M3. **The question is not "does a snapshot hook
survive" but "is a realized value's state identifiable by a uniform rule?"**

### Consumers, by control flow — six, through ONE producer

```text
tree()                       the public whole-tree read
snapshotState()              internal capture
serialization enhancer       delegates to public unwrap (serialization.ts:471)
devtools                     devtools-impl.ts:1250
time-travel                  history entries
stored                       durable payload
```

All six route through `unwrap()`/`buildFromStore` in `lib/utils.ts`. **Per the
standing caution, one producer serving six consumers does NOT establish that one
representation satisfies one architectural function** — their requirements are
not yet separated, and that separation is M3's work, not its premise.

### A GENERAL state-vs-behaviour rule already exists

`buildFromStore` decides inclusion in this order:

```text
1  DERIVED_STAMP present            -> SKIP.   general rule: "recomputable, so
                                     not state; freezing it yields a value that
                                     was true once"
2  snapshotMarkerNode(value)        -> USE IT. the kind-specific hook
3  plain function, not accessor,
   not signal                       -> SKIP + ST2008 warning
4  isNodeAccessor                   -> recurse
```

So **step 1 is already a general, kind-blind rule for excluding non-state.** The
kind-specific hook at step 2 is not the only mechanism in play, and its existence
is not explained by "snapshots must omit behaviour" — that is step 1's job.

### The admissible evidence base is ONE implementation

Contamination guard (`asyncSource`/`asyncQuery` are frozen DELETE and cannot
sponsor this row):

```text
ADMISSIBLE
  entityMap   snapshot: (node) => ({ all: node.all() })
  stored      OMITS the hook — "my node is already a plain signal, the normal
              walk handles me"

INADMISSIBLE (frozen DELETE, recorded only so the count is honest)
  asyncSource  snapshot: (node) => ({ value: node() })
  asyncQuery   snapshot: (node) => ({ value: node() })
```

**Among survivors, exactly one declaration kind implements the hook, and its
entire body is three tokens.** That is the whole evidence base for a
declaration-specific representation function.

### The sharp question M3 must answer

`entityMap` says its state is `node.all()`. The deleted markers said theirs was
`node()`. `stored` says the ordinary walk already handles it.

```text
READING A   genuine per-kind representation — different kinds legitimately have
            different "which read is my state" answers, and no uniform rule can
            know them

READING B   the realized values have INCONSISTENT CONVENTIONS about which read
            returns state, and the hook is absorbing that inconsistency
```

Reading B is live because the ST2008 branch exists at all: its comment records
that an unbranded callable marker's value _"vanishes from the snapshot and from
everything built on one"_ — a failure caused by realized shape, not by
representation semantics.

**Not concluded.** Distinguishing A from B requires separating the six consumers'
requirements first, per the standing caution. That is the next step, and it must
not be short-circuited by the fact that one hook currently serves all of them.

## M3 — CONSUMER SEPARATION: **there are not six consumers. There is one representation.**

Evidence: `m3-representation.spec.ts`, plus control-flow inspection of each
call site.

### The six collapse

```text
tree()            the memoised public read
snapshotState()   ROUTES THROUGH THE SAME MEMO — its docblock says so explicitly:
                  every consumer "was rebuilding the entire tree on every call
                  while tree() next door returned a memoised result"
serialization     `toJSON = () => tree()`. PURE DELEGATION, and its comment notes
                  "there is one materialiser again"
time-travel       `snapshotState(this.tree.$)` — same producer
devtools          same producer, then applies its OWN second transform
                  (`buildSerializedState`) before JSON comparison
stored            NOT A CONSUMER — see below
```

**So the standing caution resolves in an unexpected direction.** I flagged that
one hook serving six consumers does not prove one representation satisfies one
function. Measured, there are not six requirements to separate: four entry points
share one memoised representation, devtools adds a transform it owns, and the
sixth was miscounted.

That does not vindicate the hook — it narrows its justification. **The hook can no
longer be defended by "different consumers need different things."** It must be
defended by the single consumer requirement needing per-kind knowledge.

### `stored` is not a consumer, and its own docblock is stale

`stored.ts:331` warns that _"`tree()` / `unwrap()` skip stored values"_. **That is
stale.** `stored.ts:850` records the fix — conforming to the signal/accessor
protocol that traversal already branches on. Measured:

```text
signalTree({ theme: stored('k','light',{storage}), plain: 1 })
tree()  ->  { theme: 'light', plain: 1 }
```

`stored` supplies **no snapshot hook and needs none.** It is indistinguishable
from ordinary state in the representation, because it conforms to the uniform
protocol rather than extending it. **That is one surviving declaration kind
demonstrating the null.**

### `entityMap` introduces a SYNTHETIC key

```text
signalTree({ rows: entityMap({ selectId }), plain: 1 })
tree()  ->  { rows: { all: [ {...} ] }, plain: 1 }
```

The author wrote `entityMap({ selectId })`. The representation says
`{ all: [...] }`. **The `all` key exists nowhere in the declaration** — it is
invented by the hook's return value.

```text
ordinary state   plain: 1
stored           theme: 'light'          the value itself
entityMap        rows: { all: [...] }    a WRAPPER around the value
```

And a collection's obvious plain-data representation is the array.

### Two readings of the n=1 evidence

```text
A  a collection genuinely has named sub-structure worth representing, which no
   uniform rule could know

B  `{ all: node.all() }` follows the HOOK'S RETURN CONVENTION rather than a
   semantic need — the deleted markers returned `{ value: node() }`, so the
   contract is "return an object whose keys become the snapshot shape", and
   `all` was simply the natural key to pick
```

**Reading B is now the stronger of the two**, on three grounds: `stored`
demonstrates a declaration kind needing no hook at all; the synthetic key has no
declaration counterpart; and the wrapper shape matches the deleted markers'
convention rather than anything about collections.

**Not concluded.** What would settle it is whether a uniform rule can identify a
collection's state — i.e. whether the entityMap accessor can conform to the
protocol the way `stored` does, rather than being described by a hook. That is
M3's remaining question, and it is downstream of the `entityMap` derivation
proper, which has not run.

## M3 — THE HOOK ABSORBS A SHAPE MISMATCH. Reading B is confirmed executably.

Evidence: `m3-uniform-rule.spec.ts`, 3 rows.

The uniform walk decides by three guards — `DERIVED_STAMP`, `isSignal`,
`isNodeAccessor`. So the null reduces to: **is a declaration kind's state
reachable through them?**

```text
stored      isSignal(node)        TRUE
            -> its state IS its read. No hook, no convention, no synthetic key.
            -> tree() gives { theme: 'light' }

entityMap   isSignal(node)        FALSE
            isNodeAccessor(node)  FALSE
            -> NEITHER uniform guard reaches it
            -> its enumerable surface is mostly METHODS
```

**So the hook does not exist because collections have special representation
semantics. It exists because the realized accessor satisfies neither shape guard
the walk uses.** That is Reading B, confirmed by measurement rather than
inference.

### The codebase already contains the precedent — and the remedy

`stored.ts:850` records that `stored` USED to have exactly this defect:

> _"It used to be `(() => sig())` with methods bolted on — a plain callable that
> satisfied neither `isSignal` nor `isNodeAccessor`. Every traversal in the
> library branches on exactly those two guards, so a stored leaf fell through all
> of them: omitted from `tree()`/`unwrap()`, skipped by a merge write through its
> parent, and REPLACED with a raw value by `applyState`… **Conforming to the
> protocol that already exists fixes every one of those at once**, with no
> changes outside this file."_

Same defect. Same two guards. And the remedy chosen was **conformance, not a
hook** — which is why `stored` needs no `snapshot` today.

`entityMap` is the same shape with the other remedy applied.

### What this establishes, and what it does not

```text
ESTABLISHED
  the snapshot hook's demonstrated job is absorbing a SHAPE mismatch
  the only surviving implementer fails both uniform guards
  the other surviving kind needed no hook once it conformed
  in-repo precedent exists for fixing this class by conformance

NOT ESTABLISHED
  that entityMap SHOULD conform — its accessor shape may be justified by
  functions this row has not examined (structural writes, key addressing,
  subject lifetime). That is the entityMap derivation's question, not M3's.
```

**M3's mechanism question is answered; its disposition waits on `entityMap`.**
If the accessor conforms, the hook has no remaining implementer among survivors
and deletes. If the accessor's shape is independently earned, then a
representation function survives — but it would be _"a realized value must be
able to declare its state when its shape hides it"_, which is a narrower and
differently-owned thing than _"declaration kinds own their representation"_.

### Rule 0m check

No DX capability is at stake either way. `tree()` returning
`{ rows: { all: [...] } }` versus `{ rows: [...] }` is a representation detail
the author never writes. **The synthetic `all` key is not a DX pressure to
preserve** — it is an artifact, and no measured use case depends on it.

## PROVENANCE CLASSIFICATION — a third bucket the audit has been collapsing

**The last shipped release is `v14.1.1` (2026-08-11). 367 commits sit after it.**
That boundary discriminates something this audit has not been tracking, and the
omission has mislabelled evidence in at least two closed rows.

```text
INHERITED LEGACY        pre-v14.1.1, shipped
                        -> Rule 0o: evidence only, no survival weight

15-EFFORT, GATE A       created after v14.1.1, frozen by the kernel freeze
                        -> frozen, but frozen BY THIS EFFORT. Reopenable only by
                           deterministic counterexample — the ordinary rule.

15-EFFORT, NOT FROZEN   created after v14.1.1, never through the derivation
                        -> UNREVIEWED NEW WORK. Deserves the MOST scrutiny and
                           has been getting the least, because it reads as
                           "current code" and therefore as inherited.
```

The third bucket is the gap. **A 15-effort artifact is not legacy — Rule 0o does
not apply to it — but it also has not earned survival, and it may have been built
to serve a design the derivation has since deleted.**

### Measured

```text
production files added since v14.1.1        49  (non-spec)
  of which causal-runtime / atomic-state    26  GATE A kernel
  everything else                           23
```

The other 23 include `transactions.ts`, `tree-capabilities.ts`, `physical/*`,
`owned-metadata.ts`, `owned-mutation.ts`, `position-registry.ts`,
`commit-consequence.ts`, `mutation-capture-runtime.ts`, and the three marker
`*.contract.ts` files.

### Two closed rows used 15-effort artifacts as INHERITED evidence

**`transactions` did not exist at v14.1.1.** No file matching it in the release
tree. It is entirely a SignalTree 15 creation.

```text
DERIVATION 1   cited transactions' `capabilities: ['causal-runtime']` as evidence
               that substrate requirement is INTRINSIC to declaration kind — one
               of only TWO declarations, and it turns out to be work from this
               effort rather than inherited practice

DERIVATION 2   measured transactions' consumption of kernel internals to
               establish zero feature->feature dependency

STATUS-DEL     leaned on transactions.spec rollback coverage as a frozen theorem
```

**`tree-capabilities.ts` is also 15-effort.** Derivation 1 audited
`TREE_CAPABILITY_ORDER` and `TREE_CAPABILITY_DEPENDENCIES` as though inherited.

### Does this invalidate those conclusions? NO — but it changes their weight

Both rows resolved in the DELETION direction: _no public substrate protocol
earned_, _zero feature-to-feature dependency_. **15-effort provenance makes a
deletion finding EASIER to justify, not harder** — there is no shipped-ecosystem
argument to answer, and Rule 0n does not even need invoking.

What it changes is the reverse case. **A 15-effort artifact must never be cited
as evidence that a practice is established.** Derivation 1's "intrinsic in every
measured case" rested on n=2, and one of the two was a design decision made
during this effort. The conclusion stands; the phrase "measured practice"
overstated what n=1-inherited-plus-n=1-self-authored supports.

### Consequence: `tree-capabilities.ts` needs its own look

It exists to serve `plannedSignalTree`'s pre-construction planning. That
function survives; **its public form is a REDESIGN candidate and no public
capability protocol was earned.** So a 15-effort file may be machinery built for
a design decision now in question — exactly the third-bucket hazard.

Not reopened here. Recorded as a row for the construction-model cluster when the
declaration-lowering question resumes.

### Standing rule this adds

> **Date the evidence before weighting it.** Anything created after `v14.1.1` is
> not inherited practice. It may be frozen kernel work, or it may be unreviewed
> new work built for a design the derivation has since changed — and the second
> deserves more scrutiny than legacy, not less.

## DERIVATION E — COLLECTIONS: zero-state, before `entityMap` is opened

Rule 0o: legacy gets LAST look. The functions are stated without naming the
mechanism, and the evidence is dated before it is weighted.

### ZERO-STATE

```text
Assume SignalTree 14 never existed.

SURVIVING ARCHITECTURE   canonical store truth · read-only derived projections ·
                         causal authority · PositionId != SubjectId != SlotIndex
                         (FROZEN) · persistence as post-commit consequence

FUNCTION UNDER           hold many like-shaped values as canonical truth
CONSIDERATION
```

Decomposed without legacy nouns:

```text
E-a  hold many like-shaped values as canonical truth
E-b  address one of them
E-c  establish membership — add, remove
E-d  identify one ACROSS TIME: is this "the same thing" after an update?
E-e  write to one without rewriting all
E-f  OBSERVE one without observing all
E-g  order them
E-h  index or query them
E-i  attribute a structural change causally
```

**What the surviving architecture already answers.** (E-a) is ordinary canonical
truth — the store already holds arrays and records. (E-i) is the frozen causal
authority. And **(E-d) is already FROZEN**: `SubjectId` is defined as structural
and entity lifetime, so SignalTree has a frozen concept of identity-across-time
independent of any collection mechanism.

**What ordinary state can already do.** With a plain array in canonical state:
(E-b) address by finding in application code; (E-c) membership by setting the
array; (E-g) ordering by sorting; (E-h) indexing by a derived projection.

**What it cannot.** Writing one element replaces the array reference, so
(E-e) rewrites everything and (E-f) is impossible — every observer of the
collection recomputes when any element changes.

> **The candidate surviving functions are therefore E-e and E-f: granular write
> and granular observation.** They are the two an array in ordinary canonical
> state structurally cannot provide, and they are what (E-d)'s frozen identity
> exists to make addressable across time.

That is the null to attack — **not** "does `entityMap` survive".

### PROVENANCE — the row splits along the release boundary

Measured against `v14.1.1` (2026-08-11). `entity-signal.ts` is the real
implementation; the marker file `entity-map.ts` is a thin declaration front
(13+/5- of 471 lines) and conceals this.

```text
entity-signal.ts   1872+ / 353-  of 2970 lines   ~63% POST-RELEASE

INHERITED (Rule 0o applies — evidence only)
  addOne             2025-12-10
  byIdOrFail         2025-12-10     the public collection API: shipped,
  changeId           2026-08-06     exercised, a real user surface

15-EFFORT (third bucket — unreviewed, MOST scrutiny)
  SubjectId wiring       2026-08-11  (release day — effectively the boundary)
  subjectMetadataEnabled 2026-08-13  post-release
```

**The split maps exactly onto the zero-state.** The COLLECTION functions
(addressing, membership) are inherited and shipped. The IDENTITY-ACROSS-TIME
machinery is this effort's own work — and it is what the frozen
`PositionId != SubjectId != SlotIndex` invariant rests on.

So `SubjectId` being frozen is a statement about **decisions made during this
effort**, not inherited practice. That is legitimate — GATE A froze it — but it
means the identity machinery cannot be cited as evidence that entity identity is
an established need. It is evidence that this effort concluded it was one.

### How this row runs

```text
1  attack E-e / E-f: can granular write and granular observation be obtained
   without a collection primitive? (the real null)
2  audit the 15-effort identity machinery in the third bucket — built for a
   design that must itself be re-derived, not assumed
3  ONLY THEN open entityMap, to see whether it names a use case missed above
```

## DERIVATION E — THE NULL CORRECTS ITSELF. The surviving function is **dynamic membership WITH granular reactivity**.

Evidence: `e-granularity.spec.ts`, 7 executable rows.

### The zero-state's answer was wrong, and the measurement says why

The zero-state concluded that E-e (granular write) and E-f (granular
observation) were the only candidates, because an array cannot provide them.
**Both fall to an ordinary record keyed by id** — and measuring that revealed the
function the zero-state had mis-assigned.

```text
ARRAY in ordinary state
  granular observation   NO  — a watcher of row `a` recomputes when `b` changes,
                              because a write replaces the whole reference
  dynamic membership     YES — set() adds and removes freely

RECORD keyed by id, in ordinary state
  granular observation   YES — each nested position is its own signal; a watcher
                              of `a` does NOT recompute when `b` changes
  granular write         YES — `a`'s identity is preserved, not merely its value
  dynamic membership     NO  — and not merely awkward: INEXPRESSIBLE
```

**The membership finding is the sharp one.** A nested accessor is not a settable
signal — it is a callable that MERGES — so:

```text
tree.$.rows.set                       undefined
tree.$.rows({ b: {...} })             `b` is NOT added
                                      `a` is NOT removed
```

The tree materialises `rows` with the keys present at construction, and a merge
write reaches only those positions. **A record's membership is fixed at
construction.**

### The 2x2

```text
                       dynamic membership    granular observation
  array                       YES                    NO
  record                      NO                     YES
  entityMap                   YES                    YES
```

**`entityMap` occupies a cell neither ordinary shape reaches**, and the two
ordinary shapes fail on opposite axes. That is a structural gap, not a
convenience.

### Restated function

> **E-c + E-f jointly: add and remove members at runtime, while observing one
> member without observing all.**

Not "collections". Not "entityMap". The two axes are individually available and
jointly unavailable, and it is the CONJUNCTION that no ordinary canonical shape
provides.

### What this does NOT yet establish

```text
that SignalTree must own it   — an application could keep a record of
                                independently created signals outside the tree,
                                as the E5 fork did for a counter. Whether such
                                values are canonical truth is the same question
                                that fork already answered NO for.
that entityMap's FORM survives — its API surface, selectId, the marker
                                declaration, `all()`, sorting, predicates and
                                bulk operations are untested here
that identity-across-rekey survives — `changeId` preserves a row across a key
                                change and a record has no mechanism at all, but
                                whether that function is required is unmeasured
```

The conjunction is a real gap in ordinary canonical state. **Whether SignalTree
should close it, and in what form, is the next step** — and per the provenance
split, the identity machinery it would rest on is 15-effort work that has not
been through this process.

## DERIVATION E — **FUNCTION SURVIVES.** The first positive result in this audit.

Evidence: `e-membership-reachability.spec.ts`, 6 rows, on top of
`e-granularity.spec.ts`.

### No tree write path can add a member to a granular shape

Every write path the tree offers was exhausted:

```text
nested accessor merge     tree.$.rows({ b: … })          `b` NOT added
root callable merge       tree({ rows: { b: … } })       `b` NOT added
updater form              tree(current => ({ … }))       `b` NOT added
TOP-LEVEL record          not a nesting-depth artifact   `b` NOT added
existing positions        still fully granular           unaffected
```

A record's membership is fixed at construction, and **no API reopens it.**

### The completing check — canonicality

The E5 fork established that an application CAN hold independently created
signals, and that their writes **escape authored history**. So the conjunction
only names a real gap if it is delivered over CANONICAL truth. Measured:

```text
entityMap: addOne -> updateOne -> undo()   the write IS restored
```

Canonical. Contrast PATH A of the E5 fork, where a preserved external signal's
write was NOT captured by undo.

### The three-way result

```text
                          dynamic     granular      canonical
                          membership  observation   truth
  ordinary array             YES          NO          YES
  ordinary record            NO           YES         YES
  app-held signals           YES          YES         NO   (E5 PATH A)
  entityMap                  YES          YES         YES
```

**Each ordinary alternative misses exactly one axis, and they miss different
ones.** No two-out-of-three shape reaches the corner.

### Disposition

```text
FUNCTION      dynamic membership + granular observation, over canonical truth
              SURVIVES — unreachable by any ordinary shape or write path
OWNER         SignalTree. The canonical axis is what excludes an application
              from providing it: the E5 fork already measured that app-held
              signals are not canonical truth.
FORM          UNPROVEN. Nothing about entityMap's API, `selectId`, the marker
              declaration, `all()`, sorting, predicates, bulk operations or
              identity-across-rekey is established by this row.
```

**This is the first FUNCTION SURVIVES verdict in the audit.** Every prior row
resolved to DELETE or NOT EARNED — post-exposure composition, feature-to-feature
dependency, generic declaration identity, third-party compiler extensibility,
status, acquisition, input orchestration, request cache ownership. The
subtractive run was not a foregone conclusion; this row shows the method returns
a positive when the evidence supports one.

**And the form question is now genuinely open rather than presumed.** Per Rule
0o, a surviving function does not entitle its incumbent mechanism to anything —
the greenfield minimum must be derived from zero, and per the provenance split
the identity machinery any candidate would rest on is 15-effort work that has not
been through this process.

## DERIVATION E — FORM: legacy's last look, and the surface classified

The minimum was derived from zero BEFORE `entityMap` was opened, per Rule 0o:

```text
GREENFIELD MINIMUM for "dynamic membership + granular observation over canonical
truth"

  add / remove a member          membership
  address one member by key      the granular position
  enumerate members              so derived projections can be built over it
```

Then the incumbent was opened, to see what it names that the minimum missed. Its
public surface is **31 members**.

### Classified

```text
THE MINIMUM (5)
  addOne · removeOne             membership
  byId · byIdOrFail              granular position access
  ids                            enumeration

DERIVED PROJECTION over enumeration (6)
  all · count · empty · asMap · find · where · has
  -> ordinary derived, given `ids` and `byId`

BULK / CONVENIENCE (13)
  addMany · removeMany · updateMany · upsertMany · prependMany
  setAll · clear · updateOne · upsertOne · replaceOne
  removeWhere · updateWhere · prependOne
  -> repeated single operations. ATOMICITY across them is the transaction
     kernel's job, not the collection's.

ORDERING (2)
  prependOne · prependMany
  -> implies the collection HAS an order. The zero-state assigned ordering to
     derived sorting, which does NOT preserve insertion order as identity.
     UNRESOLVED — this is something legacy names that the minimum did not.

IDENTITY ACROSS REKEY (1)
  changeId
  -> the E-d hard case. Derived in the zero-state, omitted from the minimum.
     UNRESOLVED.

APPLICATION SELECTION STATE (4)  <- see below
  activeId · activeEntity · setActiveId · clearActiveId

OBSERVATION HOOKS (2)
  intercept · tap                UNEXAMINED
```

### `activeId` / `activeEntity` — feature parity, and the source says so

Evidence: `e-active-selection.spec.ts`, 2 rows.

The docblock records its own provenance with unusual candour:

> _"Added in 14.0.0 after a capability audit found **elf and Akita both ship
> it** and every team otherwise hand-rolls `activeId: null` plus a derived
> lookup. `activeEntity` resolves through `byId`, so it is O(1) and invalidates
> only when THAT row changes — finer-grained than the filtered-stream versions
> the other libraries offer."_

**Feature parity is not a derived function**, and the docblock names its own
alternative in the same sentence. The only architectural claim is granularity, so
that is what was tested:

```text
built-in activeEntity            watcher does NOT recompute when another row changes
selectedId position + byId()     watcher does NOT recompute — IDENTICAL
```

The granularity comes from `byId`, which is in the minimum and is public. The
comparison in the docblock is against _filtered streams_ — a different technique
that neither candidate uses.

```text
activeId / activeEntity / setActiveId / clearActiveId
  FUNCTION   "which member is selected" — APPLICATION WORKFLOW STATE
  OWNER      the application, exactly as `status` was
  SURVIVES   NO — reachable by an ordinary canonical position plus a derived
             lookup, with identical granularity
```

Same category error as `status`: a workflow concern absorbed into a SignalTree
primitive. **4 of 31 members.**

### Where this leaves the form

```text
MINIMUM CONFIRMED     5 members
REDUCIBLE             6 derived + 13 bulk/convenience  = 19 members
NO FUNCTION           4 selection members
LEGACY NAMES SOMETHING THE MINIMUM MISSED
  ordering / insertion position   2 members   UNRESOLVED
  identity across rekey           1 member    UNRESOLVED
UNEXAMINED
  intercept · tap                 2 members
```

The last two groups are the point of giving legacy the last look: **ordering and
rekey identity are functions the zero-state under-derived**, and they are what
the incumbent contributes to the derivation rather than merely instantiating.

## DERIVATION E — the two rows legacy CONTRIBUTED, resolved

Evidence: `e-ordering-rekey.spec.ts`, 6 rows.

Giving the incumbent the last look surfaced two functions the zero-state did not
derive. Each was run against its own null. **They resolve in opposite
directions**, which is the argument for doing the last look at all.

### E-ORD — ordering: the intrinsic order is STRICTLY WEAKER than the null

```text
MEASURED   the collection has an intrinsic order; prependOne puts 'z' first,
           and both ids() and all() report ['z','a','b']
MEASURED   the surface contains NO move / moveOne / reorder / sort / swap /
           insertAt. The only route to a different order is setAll — DESTROY
           AND REBUILD MEMBERSHIP.
NULL       an ordinary `order: string[]` position plus byId: same order, same
           granularity, AND it can rearrange without touching membership in one
           canonical write.
```

An order that is _data_ (drag-to-reorder, server relevance) is exactly the case
derived sorting cannot express — so the zero-state under-derived, and legacy was
right to name it. But the incumbent's answer is worse than the ordinary one: an
intrinsic order with no reorder operation is not an ordering facility, it is an
artifact of insertion.

```text
ORDERING
  FUNCTION   REAL — an order that is data, not a function of content
  OWNER      NOT the collection. An ordinary canonical array of keys, ordered
             by the application, granular through byId.
  prependOne / prependMany   membership operations that incidentally address a
             position. No ordering function of their own.
```

### E-REKEY — `changeId`: the function SURVIVES, and the form carries a defect

```text
MEASURED   held = byId('tmp-1'); changeId('tmp-1','server-99')
           -> byId('tmp-1') undefined, byId('server-99').n() === 5
           -> held.n() === 5            THE HELD REFERENCE FOLLOWS
NULL       removeOne + addOne
           -> byId('server-99').n() === 5
           -> held.n() === undefined    THE HELD REFERENCE IS ORPHANED
```

The null **fails**, so the function is real: a member's key changes while the
member stays the same member, and everything already bound to it must follow.
This is the first function the incumbent contributed that the zero-state missed
AND that survives its own null.

It follows by SUBJECT identity, not by key — which is the 15-effort `SubjectId`
machinery, still in the third provenance bucket and still owed a hostile audit.

**The cost, measured, not argued:**

```text
after changeId('tmp-1','server-99'):
  rows.ids()                  ['server-99']     the collection's key
  rows.byId('server-99')().id 'tmp-1'           the member's own identity
```

SPLIT IDENTITY. Two separate docblocks name it, and it is load-bearing: it is
the stated reason `setOne(entity)` cannot exist, because deriving the key via
`selectId(entity)` would be _a silent wrong-slot write_. The public surface was
shaped around a defect rather than the defect being fixed.

```text
REKEY IDENTITY
  FUNCTION   REAL — survives its null
  FORM       the current form publishes a split identity and shapes the write
             surface around it. CARRIED FORWARD as an open form question:
             a member whose key is derived by selectId must not be able to
             disagree with the slot it occupies.
```

### Methodology note — Rule 2, committed inside a falsifier

The first run of E-ORD asserted no reorder operation exists using
`/move|reorder|sort|swap|insertAt/i`. It failed on `removeOne` / `removeMany` /
`removeWhere` — **"remove" contains "mov"**. The same substring-collision class
as `getTurnStatus`, this time inside the instrument rather than the measurement.
It failed loudly instead of quietly inflating a count, which is the argument for
executable falsifiers over prose: the harness caught the analyst.

## SUBJ-AUDIT — the subject-identity substrate, provenance-dated and audited

Evidence: `e-subject-identity-audit.spec.ts`, 6 rows.

E-REKEY made this load-bearing: identity-across-rekey survives its null, and it
works by SUBJECT identity. So the substrate underneath it was dated.

```text
v14.1.1 tag              2026-08-11 09:14
SubjectId                2026-08-11 22:29   feat(history): cut over public undo
                                            to frontier authority
subjectMetadataEnabled   2026-08-13         feat(history): scaffold causal kernel
planRekey                2026-08-13         revised 2026-08-15 TWICE
```

**Entirely third-bucket.** 15-effort, unreviewed, days old, and `planRekey`
churned three times in four days. Every one of those commits has an **empty
body**, so there is no recorded rationale to read — in a repository whose own
rules require commit messages to say _why_. The audit therefore had to be
executable rather than archaeological.

Note the origin: `SubjectId` entered through a **history** commit, not an entity
one. Origin establishes ownership no better than colocation does, in either
direction — and E-REKEY already measured the collection's use working in a tree
with no history attached, so the collection's need is independent of where the
mechanism came from.

### Result — the substrate is SOUND

Every edge the docblocks imply was run:

```text
KEY REUSE     changeId('tmp-1'->'server-99'), then a DIFFERENT member takes
              'tmp-1'. The held reference still reports the ORIGINAL subject
              (5), the new member reports its own (777). NO ALIASING — a freed
              key does not resurrect as a wrong-row read.

COLLISION     changeId onto an occupied key THROWS "Cannot change id to b:
              already in use". Both members intact, neither merged, held
              reference undisturbed.

SELF          changeId('a','a') is a no-op. No throw, no churn.

MISSING       changeId on an absent key THROWS "Entity with id zzz not found".
              State unchanged.

UNDO          undo across a snapshot taken through the split identity lands with
              ids() and byId() in agreement, and all().length === ids().length.

ROUND TRIP    rekey and rekey back HEALS the split — but only because the stale
              id field happened to match the key it returned to. It reconciles
              by COINCIDENCE, not by repair.
```

The one defect is the one the docblocks already name, and it is **confined**:
after a rekey the member's own `id` field disagrees with its slot. That is an
observable inconsistency in a member's self-description, not a corruption of the
collection — every structural invariant holds across all six rows.

```text
SUBJECT-IDENTITY SUBSTRATE
  PROVENANCE   third bucket, entirely post-v14.1.1, no rationale recorded
  AUDIT        PASSES — no aliasing, safe collision/self/missing policies,
               undo-consistent
  DEFECT       split identity, confined to the member's own id field.
               Load-bearing: it is the stated reason `setOne(entity)` cannot
               exist. CARRIED as an open form question, not a blocker.
```

## DERIVATION E — `tap` and `intercept`, the last two members

Evidence: `e-hooks.spec.ts`, 5 rows. Provenance: both introduced 2025-12-10
(`feat: add new Map-based entity types`) — **inherited legacy, first bucket**.
Consumers: the demo app only; nothing in `packages/` outside tests.

### `tap` — push observation over a complete pull surface

```text
MEASURE   tap reports change identity: ['add:a:1', 'upd:a:{"n":2}', 'rem:a']
NULL      the same three events recovered by diffing all() across writes
```

ANG-V0-D already established the collection's CRUD is fully visible through its
own read surface. The only thing push adds is **change identity delivered
directly** rather than recovered by diff — O(delta) against O(width).

That is a performance property of a mechanism, not a function the pull surface
fails to deliver. Under the standing rule that performance is a form question,
`tap` does not earn a function of its own.

```text
tap
  FUNCTION   "observe what changed" — ALREADY DELIVERED by the pull surface
  SURVIVES   NO as a distinct function. The O(delta)/O(width) gap is real and
             is recorded as a FORM pressure, not a derivation.
```

### `intercept` — a write-path authority, and the async form FAILS OPEN

`intercept` is different in kind from `tap`: it can **block or transform a
mutation before it lands**, which is genuinely not reachable from a pull surface
— a pull observer only ever sees what landed.

So the question is not reachability but **ownership**: is a write-path guard a
collection function? Blocking and transforming writes is validation and
authorization — the same category as `status` (workflow) and `activeId`
(selection). The application can check before it calls `addOne`. The one
justification that would survive — a third party holding the collection and
needing to be policed — is **already dead**: M1/M2 closed third-party extension
NOT EARNED.

And the mechanism carries a defect that argues against carrying it forward at
all:

```text
MEASURED   sync interceptor:  ctx.block('negative') -> throws, ids() stays []
MEASURED   async interceptor: addOne does NOT throw, ids() === ['bad'],
                              byId('bad').n() === -1,
                              and the handler DID call ctx.block()
```

`InterceptHandlers.onAdd` is declared `=> void | Promise<void>`. **The public
type invites the async form**, and every call site iterates handlers in a plain
synchronous loop with no `await`. An async validator or authorization check
therefore commits the write and then rejects it into nothing.

A guard that silently fails open is worse than no guard, because it is relied
upon. This is the shape an async permission check would naturally take.

Also vestigial: `InterceptContext` exposes `blocked` and `blockReason` as if a
handler could consult or set them. `block()` throws out of the loop, so
`ctx.blocked` is observably always `false`.

```text
intercept
  FUNCTION   write-path guard — NOT a collection function. Same category error
             as status and activeId; the third-party justification is closed.
  DEFECT     async handlers fail open, invited by the published type
  DISPOSITION  DELETE candidate. Not carried forward as a form question — the
             function is not earned, so the form question does not arise.
```

### Derivation E — CLOSED

```text
31 public members accounted for

  5   THE MINIMUM                    addOne removeOne byId byIdOrFail ids
  7   DERIVED PROJECTION             all count empty asMap find where has
 13   BULK / CONVENIENCE             atomicity belongs to the transaction kernel
  1   REKEY IDENTITY  changeId       SURVIVES — split-identity form question open
  2   ORDERING        prepend*       membership ops; intrinsic order weaker than
                                     an ordinary array of keys
  4   SELECTION       activeId*      NO FUNCTION — feature parity
  2   HOOKS           tap intercept  NO FUNCTION — one already delivered by the
                                     pull surface, one a category error with a
                                     fail-open defect
```

The FUNCTION survives — E is still the audit's first positive verdict. Of the
form, **five members are the minimum and one more is earned**.

## M3 — RESOLVED. The snapshot hook has NO EARNED IMPLEMENTER.

Evidence: `m3-conformance.spec.ts`, 5 rows.

M3 asked whether a realized value's state is identifiable by a **uniform rule**.
Consumer separation had already removed the "divergent consumers" defence, and
the mechanism question had already established that the walk decides by three
guards, that `stored` conforms via `isSignal` and needs no hook, and that
`entityMap` satisfies neither guard. What remained was whether `entityMap`'s
shape is **forced by what a collection is** or is **an implementation choice**.

### Measured

```text
plain leaf     isSignal  true      typeof function
stored         isSignal  true      typeof function   + set/update/clear/reload/flush
entityMap      isSignal  FALSE     typeof OBJECT     — not even callable

tree()  ->  { rows: { all: [ {id:'a',n:1} ] },   <- an ENVELOPE
              theme: 'light',                     <- the value
              plain: 1 }                          <- the value
```

Representation is **not uniform**, and the collection is the only position that
publishes a wrapper instead of its value.

### The hook's stated cause is a shape accident

The source records it plainly:

> _"`ids`, `count`, `empty` and `map` are all derived from `all` — and `map` is a
> JS `Map`, which JSON cannot represent, so it used to serialise as `{}`: a
> snapshot claiming the collection was EMPTY while holding 10,000 entities."_

Confirmed by measurement — `JSON.parse(JSON.stringify(asMap()))` is `{}`.

But that failure is only reachable **because the walk meets an object and must
guess which of its members is the state**. A signal has nothing to guess about:
its state is what it returns. And the value the hook selects, `node.all()`, is
exactly what a callable accessor would have returned on its own.

### The precedent is in this codebase

`stored` is a callable signal that ALSO carries its own surface — `set`,
`update`, `clear`, `reload`, `flush` — and it needs no hook, appearing in the
representation as its plain value. So "an accessor with methods" is not the
obstacle; the collection simply declines to be callable.

`stored` had the identical defect and was fixed by **conformance, not a hook**.

### The envelope creates the ambiguity it resolves

Both payload shapes are accepted, because _"an entityMap SNAPSHOT always emits
`{ all: [...] }`, so a bare array can never be mistaken for the snapshot shape."_
Measured: `tree({rows: [...]})` and `tree({rows: {all: [...]}})` both apply.

The disambiguation is only necessary because a second canonical shape exists. A
conforming accessor publishes the array, and there is nothing to disambiguate.

### Disposition

```text
M3   ANSWERED — YES, a realized value's state IS identifiable by a uniform rule:
     IT IS WHAT THE ACCESSOR RETURNS.

     The hook exists only where a declaration kind DECLINES TO CONFORM. Its one
     implementer's non-conformance is not forced by the collection function —
     E derived that function's form as byId / ids / addOne / removeOne /
     changeId, all of which are members, and `stored` proves members ride on a
     callable signal in this codebase today.

     snapshot hook                DELETE candidate — no earned implementer
     `{ all: [...] }` envelope    DELETE candidate — publishes the array
     "declaration kinds own        NOT EARNED
       their representation"
```

**Note this is a derivation result, not a landed change.** Making the collection
accessor conform is a separate piece of work with its own blast radius —
`time-travel.ts:2030` reads `child.all` directly, and the hydrate path's
bare-array acceptance would become the only form.

### CORRECTION — a recorded reading refuted by its own measurement

`SIGNALTREE-15-CONTEXT.md` recorded, explicitly labelled as _"a reading of E's
result, not a measured disposition"_, that E's closure would fire M3's **second**
branch — that the collection's earned form requires a shape neither guard
accepts, so what survives is _"a realized value must be able to declare its state
when its shape hides it."_

The measurement fires the **first** branch instead. The earned form is a set of
members, and members ride on a callable signal. The label is why this cost a
paragraph rather than a retraction.

## M4 — RECONSTRUCTION. Split result: the representational half dissolves, the ownership half survives and is BLOCKED.

Evidence: `m4-reconstruction.spec.ts`, 4 rows.

M4 is M3's mirror: is a realized value **reconstructible** by a uniform rule?
`hydrate` has exactly two implementers, `entityMap` and `asyncSource`, and
`asyncSource` is already a frozen DELETE — so on the far side of that deletion
`hydrate` reduces to ONE implementer, exactly as `snapshot` did. Per Rule 0l
`asyncSource` is measured here as an evidence repository, not as a thing to
preserve.

### The conformance spectrum — this strengthens M3

`asyncSource` sits BETWEEN a plain leaf and `entityMap`, and measuring it turns
M3's single data point into a gradient:

```text
                isSignal   callable   surface        hook?
plain leaf        YES        YES       —              NO
stored            YES        YES       + methods      NO
asyncSource       no         YES       + methods      YES
entityMap         no         NO        + methods      YES
```

`asyncSource` is **callable, and `src()` returns `[7]` — the exact value its own
hook re-publishes as `{ value: [7] }`**. It fails `isSignal` only because it is
not built on an Angular signal primitive; it carries a
`Symbol(SignalTree:MarkerProcessor)` instead, with a `refresh/set/update/reset`
surface.

So the hook re-publishes, inside an envelope, a value the accessor already
returns correctly. **The hook is needed in exact proportion to the accessor's
distance from a signal, and nothing in either declaration kind's FUNCTION
requires that distance.** M3's result was not a peculiarity of collections.

### The envelope is a systematic habit

```text
tree()  ->  { rows:  { all:   [ ... ] },     two kinds, two envelope keys,
              src:   { value: [ 7 ]   },     both wrapping a SINGLE value
              plain: 1 }                     ordinary positions publish bare
```

### What actually survives: DECLINE ON OWNERSHIP

Both implementers do the same non-representational thing:

```text
asyncSource   mode 'rehydrate' -> DECLINE, reason 'loader-owns-source':
              "the loader has already re-run and its result is newer."
entityMap     loader-backed    -> DECLINE:
              "Writing the tree snapshot over it does not add a second opinion,
               it WINS PERMANENTLY."
```

This is **not** representation, so M3's conformance result does not dissolve it.
A uniform rule cannot express it: _"set the position to the payload"_ has no way
to know another mechanism holds fresher truth.

And it is **mode-dependent**. `HydrateMode` is `merge | restore | rehydrate |
transfer`, and `asyncSource` declines only `rehydrate` — a storage payload of
unknown age — while accepting `transfer`, an SSR handoff that is the freshest
thing available. RFC 0014 measured declining transfer at 54.3KB wasted for 500
rows. **The same payload is authoritative or stale depending on where it came
from.**

### Disposition — BLOCKED, and not on `entityMap`

```text
M4 representational half   DISSOLVES under M3 conformance. The `{all}` and
                           `{value}` envelopes and the payload-shape handling
                           are the same shape accident M3 measured.

M4 ownership half          CANDIDATE FUNCTION: "a position may decline
                           reconstruction when another authority owns its
                           content, and the decision is a function of the MODE."
                           Survives its uniform-rule null.

                           BUT both declines cite the SAME competing authority —
                           a LOADER — and loader ownership is PARKED with "no
                           SignalTree ownership earned" (entity-loader cache).
                           If the loader earns no ownership, there is no
                           competing authority, and the decline has nothing to
                           protect.
```

**Next frontier: entity-loader ownership.** It was parked pending `entityMap`;
`entityMap` is now closed, and M4 cannot resolve until the loader question does.

## M4 — CLOSED. The decline is a UNIFORM RULE, and both its triggers are DELETE candidates.

Evidence: `m4-decline-uniformity.spec.ts`, 4 rows.

M4's ownership half survived a uniform-rule null of the shape _"set the position
to the payload"_. But the two implementers' predicates are, in full:

```text
asyncSource   mode === 'rehydrate'
entityMap     mode === 'rehydrate' && typeof node.load === 'function'
```

One rule over one declared property — _"this position owns a live source"_ —
which `asyncSource` satisfies by construction and `entityMap` satisfies per
instance. Measured:

```text
loaderless collection, rehydrate   payload APPLIES      -> ids ['stored']
same kind + a loader, rehydrate    payload DECLINED     -> ids ['live']
same position, transfer            payload APPLIES      -> ids ['ssr']
empty / full / malformed payloads  declined IDENTICALLY -> the predicate never
                                                          inspects `value`
```

**The property decides, not the declaration kind** — the same kind does both
things depending on one declared bit. And the mode decides, not the data — the
identical bytes are authoritative under `transfer` and stale under `rehydrate`,
which is exactly RFC 0014's 54.3KB regression.

So the decline needs **no per-kind hook**: it is a uniform rule over
`(mode, owns-a-live-source)`. That is M3's result reached from the other
direction — the publish side and the reconstruct side both dissolve into uniform
rules, and the hook in each case was absorbing something expressible uniformly.

### And the rule has no surviving trigger

```text
asyncSource            frozen DELETE
entityMap's `load`     supplied by loader(), which OUTCOME A found earns no
                       SignalTree ownership ("SignalTree-owned cache/freshness
                       FUNCTION: NOT FOUND")
```

On the far side of both dispositions, `typeof node.load === 'function'` is never
true and no declaration kind owns a live source. **The predicate can never
fire.**

```text
M4   ANSWERED — YES, a realized value is reconstructible by a uniform rule.

     hydrate hook            DELETE candidate — no earned implementer, and on
                             the far side of the loader and asyncSource
                             dispositions, no surviving trigger either
     mode-dependence         REAL and CORRECTLY DERIVED. `HydrateMode` is "a
                             property of the CALL SITE, not of the data", and
                             rehydrate/transfer want opposite answers. This is
                             evidence to CARRY, not a hook to keep.
     decline-on-ownership    a real function with NO surviving instance in 15's
                             candidate set. If a live-source-owning position is
                             ever derived (Outcome B), the rule is uniform and
                             still needs no per-kind hook.
```

### Incidental measurement — a malformed payload is silently ignored

`serialize()` emits `{ data, metadata }`. A hand-written bare state object
(`{ rows: {...} }`, no envelope) applies **nothing** and reports **nothing** — no
throw, no dev warning. Found by writing the test wrongly; the first run failed
because the payload was ignored, not because the decline fired.

Not a derivation result, and not chased here. Recorded because it is the same
failure shape the entityMap hydrate docblock already calls the worst version of
this — _"a partial hydrate is harder to notice than a failed one"_ — except this
one applies nothing at all while still returning normally.

## M5 — DELETES. The reported vocabulary is a single point, and half of it is dead.

Evidence: `m5-decision-observability.spec.ts`, 2 rows.

M5's queued statement predicted this: _"Last, because there may be no decision
worth reporting once M4 decomposes."_

### Measured, not grepped

Methodology Rule 2 forbids reading a lexical absence as evidence, so every
reconstruction path reachable from the public surface was exercised with a
listener attached — `rehydrate` with a loader, `transfer` on the same position,
`rehydrate` with no loader, `merge` via a root call, and `restore` via
time-travel undo.

```text
DECLARED   decision  'declined' | 'normalised'
           reason    'loader-owns-source' | 'no-request-survives-boundary'

EMITTED    decision  { 'declined' }
           reason    { 'loader-owns-source' }
           mode      { 'rehydrate' }
```

A single point. Two call sites produce it — `entity-map.ts:352` and
`async-source.ts:160` — and **M4 established that both predicates can never fire**
once `asyncSource` and `loader()` take their dispositions.

### Half the vocabulary is STATUS-DEL residue

`'normalised'` and `'no-request-survives-boundary'` describe one behaviour:
normalising `LOADING` to `NotLoaded` across a process boundary. That behaviour
belonged to `status`, which STATUS-DEL physically removed. The event docblock
still reads _"Which marker decided, e.g. `entityMap`, `status`."_

The types outlived the mechanism — the same defect class as
`InterceptContext.blocked`: a published vocabulary describing something that
cannot happen. Third instance in this pass, which makes it a pattern worth
naming.

### Consumers

```text
packages/**   NONE outside tests
apps/demo     whats-new-14 page — a live demonstration of the capability
```

### Disposition

```text
M5   DELETE. No surviving decision to report.

     onHydrateDecision / reportHydrateDecision / HydrateDecisionEvent /
     HydrateDecision / HydrateReason        DELETE candidates

     The underlying INSIGHT is kept as evidence, not as a mechanism: a silent
     refusal is a real DX failure, and the docblock's account of it stands —
     "a developer whose payload was silently declined had no way to see it."
     If a future derivation reintroduces a position that declines
     reconstruction, that DX pressure comes with it. It does not earn a
     reporting bus in advance of a decision to report.
```

### The M-cluster resolves NON-UNIFORMLY, exactly as permitted

The queued statement allowed it explicitly: _"Nothing requires one verdict across
three entry points."_

```text
M3  ANSWERED — uniform rule (state is what the accessor returns); hook DELETES
M4  ANSWERED — uniform rule (mode + owns-a-live-source); hook DELETES, and on
               the far side of the loader/asyncSource dispositions the predicate
               has no surviving trigger
M5  DELETES  — nothing left to report
MarkerProcessor  still DELETES
```

Three entry points, three different routes, one direction. The cluster's shared
finding is that **every hook in it was absorbing something expressible
uniformly** — M3 a shape accident, M4 a two-input predicate, M5 the reporting of
a decision that no longer occurs.

## CROSS-CUTTING FINDING — PUBLISHED-SURFACE DRIFT

Three independent derivations in this pass each turned up the same defect shape,
so it is named here rather than left scattered across three entries.

**A published type describes behaviour that cannot happen.**

```text
1  InterceptContext.blocked / blockReason
   Exposed as if a handler could consult or set them. `block()` throws out of
   the loop, so `ctx.blocked` is observably ALWAYS false.
   Evidence: e-hooks.spec.ts

2  InterceptHandlers.onAdd/onUpdate/onRemove  =>  void | Promise<void>
   The type INVITES an async handler. Every call site iterates handlers in a
   plain synchronous loop with no await, so an async guard FAILS OPEN: the write
   commits and `ctx.block()` lands nowhere.
   Evidence: e-hooks.spec.ts

3  HydrateDecision 'normalised' / HydrateReason 'no-request-survives-boundary'
   Never emitted from any path. They described `status`'s LOADING -> NotLoaded
   normalisation, and STATUS-DEL physically removed the mechanism while leaving
   the vocabulary. The event docblock still says "e.g. `entityMap`, `status`".
   Evidence: m5-decision-observability.spec.ts
```

### Why this is a finding and not tidying

Each one is a place where **a consumer would reasonably rely on something that
does not happen**, and the type is what invites the reliance. (2) is the severe
case — it is the shape an async permission check naturally takes, and it fails
silently in the permissive direction.

They also differ in origin, which rules out a single sloppy commit:

```text
1 and 2   INHERITED LEGACY (2025-12)  — drift that accumulated
3         15-EFFORT RESIDUE           — drift this effort CREATED, by deleting a
                                        mechanism and leaving its vocabulary
```

(3) is the one to take personally: STATUS-DEL was executed in this pass, in two
deliberate commits, and it still left published types behind.

### Consequence for the gate

Deletion is not complete when the mechanism is gone; it is complete when the
**vocabulary that described it** is gone too. And any surface carried into 15
must be checked for type/behaviour agreement, because three of three probed
surfaces had drifted.

```text
GATE ADDITION (candidate)
  For every surviving public type: is every declared member REACHABLE, and does
  every declared signature do what it says? Executable, not by inspection —
  all three of these were invisible to reading and obvious to a test.
```

## DERIVATION — `linked`. NOT EARNED, and the null failed once before holding.

Evidence: `linked-null.spec.ts` (4 runtime rows) + `linked-inference.typing.spec.ts`
(4 gated type rows).

`linked` is 82 lines whose implementation is four:

```ts
if (typeof arg === 'function') return linkedSignal(arg);
const { source, computation, equal } = arg;
return linkedSignal({ source, computation, ...(equal ? { equal } : {}) });
```

A pass-through to Angular's `linkedSignal`, with the same two call forms Angular
already offers. Its docblock attributes the type-level writability to the
`ProcessDerived` fix — which lives in the derived pipeline, **not here** — so the
null is: use `linkedSignal` directly inside `.derived()`.

### The null holds at runtime, on both forms

```text
sticky selection across a source change   identical
short form, override then re-derive       identical
writable at runtime                       identical
writable AT THE TYPE LEVEL, no cast       identical  (ProcessDerived's doing)
```

### It FAILED on `equal` — the one real contribution

```text
linkedSignal({ source, computation, equal: (a, b) => a.boxed === b.boxed })
  TS2769  No overload matches this call
          '(a: {boxed:number}, b: {boxed:number}) => boolean' is not assignable
          to 'ValueEqualityFn<unknown>'
```

Angular's overload lets `equal` participate in inference, so `V` collapses to
`unknown`. `LinkedOptions` annotates `equal?: (a: NoInfer<V>, b: NoInfer<V>)`, so
`V` resolves from `computation`'s return instead. **`linked` is not a pure
pass-through at the type level** — the first time in this audit an incumbent
turned out to contribute something the null missed.

### But the null is REACHABLE, which settles it

```ts
linkedSignal<number, Boxed>({ source, computation, equal }); // compiles
```

Explicit type arguments recover the behaviour exactly. So the contribution is an
**annotation saved**, not a behaviour gained.

```text
linked
  FUNCTION   "derived-but-writable" — ANGULAR'S, not SignalTree's
  CONTRIBUTION  a type-inference fix over a third-party signature, on one option
  SURVIVES   NO. Rule 0m: the CAPABILITY is reachable; only the spelling differs.
             Recorded as DX pressure (Table G), not a derivation.
```

### Methodology — the type claim was ungated, and my first alarm was wrong

The whole derivation turns on a compile-time fact, and vitest does not typecheck.
Running `tsc` by hand surfaced it. But the first thing I did with `tsc` was point
it at `packages/core/tsconfig.spec.json` and report **853 errors across 85
files** — a config **nothing runs**.

The configured gates are both CLEAN:

```text
typecheck:source   tsc -p tsconfig.typecheck-all.json        0 errors
                   strict, all package + demo source, EXCLUDES **/*.spec.ts
typecheck:typing   tsc -p core/tsconfig.typecheck.json       0 errors
                   ONLY *.typing.spec.ts + enhancers/typing/**
```

So ordinary `.spec.ts` files are typechecked by no gate — **by design**. The
`*.typing.spec.ts` convention exists precisely so type-level assertions get
gated, and the repo was already right. The correct action was to put the claim
where the gate reaches it, which is what
`linked-inference.typing.spec.ts` does.

Same error class as measuring `loader.ts` instead of `entity-loader.ts`:
**measure the thing that actually runs.** Third instance of it in this effort,
and the second time the false alarm was mine.

## DERIVATION — `stored`, SPLIT INBOUND / OUTBOUND. Neither half is earned.

Evidence: `stored-null.spec.ts`, 7 rows.

Stated from zero, before opening the incumbent:

```text
OUTBOUND   a position's current value must survive the death of this process
INBOUND    at construction, a position must take the value it held in a
           PREVIOUS process rather than its literal default
```

Genuinely separable — a telemetry value is written and never read back, a seeded
config is read and never written — so each got its own null.

### INBOUND — the null reaches it completely

```text
NULL        signalTree({ theme: read('theme', 'light') })      -> 'dark'
INCUMBENT   signalTree({ theme: stored('theme', 'light') })    -> 'dark'
MIGRATION   a v1 bare string read into a v2 object shape, as an ordinary branch
            in the read function                               -> works
```

`{ version, migrate }` is a spelling for a branch the read path can already
express. **INBOUND: NOT EARNED.**

### OUTBOUND — the null is STRICTLY BETTER, and the machinery is self-inflicted

```text
NULL       effect(() => store.setItem(k, JSON.stringify(tree.$.theme())))
           after set('dark'): ALREADY DURABLE. Process death loses nothing.

INCUMBENT  stored(..., { debounceMs: 100 }); set('dark')
           signal says 'dark', STORE IS EMPTY.
           Process death here LOSES THE WRITE.
           Durable only after an explicit flush().

INCUMBENT  stored(..., { debounceMs: 0 }); set('dark')
           durable inside set()'s own stack — IDENTICAL to the null.
```

So `flush()`, the page-hide drain and `flushAllStoredSignals()` exist to repair a
hazard **the debounce introduced**. With no debounce there is nothing to drain.
The 13.3.0 durability work is correct _as a fix_, and it is fixing a
self-inflicted problem.

### What the null does NOT reach

```text
COALESCING   20 sets -> measurably fewer store writes
```

Real, and the naive effect null does not do it. It is a **performance property**,
which under the standing rule is a FORM question, not a function.

```text
stored
  OUTBOUND FUNCTION   "survive process death" — delivered by an ordinary effect
                      over an ordinary key/value store, MORE reliably than the
                      debounced incumbent
  INBOUND FUNCTION    "take a previous process's value" — delivered by reading
                      the store in the state literal
  CONTRIBUTION        write coalescing (performance) + the repair machinery that
                      coalescing necessitates
  SURVIVES            NO on both halves. Coalescing is recorded as FORM pressure.
```

This is a verdict about **ownership in a greenfield architecture**, not about the
quality of the shipped work: 13.3.0 durability is a real fix to a real bug. The
derivation says the function is not SignalTree's to own, not that the code was
wrong.

Note also the pre-existing defect this touches: `stored`'s traversal invisibility
(nested markers leak raw markers into `tree()`, and an explicit `storage:` option
leaks into snapshots). A verdict of NOT EARNED disposes of that defect rather
than requiring it to be fixed.

### The envelope, for once, is LOAD-BEARING

`stored` writes `{"__v":1,"data":"dark"}`. Unlike M3's `{all}` and `{value}`,
this envelope carries information the bare value cannot: `__v` is what `migrate`
dispatches on. Recorded so the M3 envelope finding is not over-generalised — the
objection there was to envelopes that wrap a single value and add nothing.

## CROSS-CUTTING FINDING (second) — SELF-INFLICTED NECESSITY

A second shape now has three instances, and it is distinct from published-surface
drift:

**A mechanism creates the problem that justifies its own machinery.**

```text
1  M3   the `{ all: [...] }` envelope exists so a bare array can be told apart
        from the snapshot shape — an ambiguity that exists ONLY because the
        envelope does. A conforming accessor publishes the array and there is
        nothing to disambiguate.

2  stored   the debounce creates a window where a set() is not durable, and
        flush() + the page-hide drain + flushAllStoredSignals() exist to close
        it. `debounceMs: 0` has no window and needs none of them.

3  entityMap   the snapshot hook exists because the walk meets an object and
        must guess which member is state — a guess that exists ONLY because the
        accessor is not a signal.
```

In each case the machinery is _correct_, and in each case the thing it corrects
was introduced one layer down. **The derivation question is never "is this
machinery right?" but "what made it necessary?"** — because if the answer is
another SignalTree choice, both can leave together.

## WITHDRAWAL — E-REKEY's positive verdict. It rested on an unrecorded reversal of shipped behaviour.

E-REKEY was recorded as _"the first function the incumbent contributed that the
zero-state missed AND that survives its own null."_ **That verdict is withdrawn.**
It was invalid twice over, and the second reason is the serious one.

### 1. It proved a difference, not a requirement

The measurement was: a held reference survives `changeId`, and remove+add orphans
it. That shows the two paths **behave differently**. It never showed any workflow
_requires_ the held reference to follow rather than re-reading `byId(newId)`.

### 2. The behaviour measured is NOT what ships — and reverses a documented decision

Published **14.1.2** (2026-08-17, the current latest) does the OPPOSITE, on
purpose. From the shipped `dist/lib/entity-signal.js`:

> **[ST2031]** _"reading a node held from `byId(from)` after `changeId(from, to)`
> — it resolves undefined **and always will**. changeId drops the old per-entity
> signal **on purpose**: aliasing it would share one signal with a future
> `addOne({ id: from })`, which is a worse failure than this one. Re-read with
> `byId(to)`, or hold the id and call `byId(id())` at the point of use rather
> than holding the node across a rekey."_

Provenance of the two decisions:

```text
80f41e94   2026-08-10   feat(core)!: replaceOne + node-callable replaces, and
                        ST2031 for held nodes
                        -> "changeId drops the old per-entity signal ON PURPOSE
                            (aliasing it would share one signal with a future
                            addOne of the retired id, A WORSE FAILURE).
                            CORRECT BEHAVIOUR that was impossible to debug from
                            the call site."
                        Full rationale recorded. SHIPPED in 14.1.1 and 14.1.2.

b47598a1   2026-08-13   feat(core): atomically realize entity rekeys with scalar
                        state
                        -> ST2031 removed. Held references now follow.
                        EMPTY COMMIT BODY. No recorded rationale.
```

So a derivation verdict was built on top of an **unexplained reversal of a
decision this repository had explicitly called correct**, three days after it
shipped.

### How the provenance rule failed here

The three-bucket classification was applied to the **machinery** — `SubjectId`,
`planRekey`, `subjectMetadataEnabled` were all correctly dated to the third
bucket and audited. It was never applied to the **behaviour** the machinery
produces. Dating the mechanism is not dating the semantics.

```text
NEW RULE (candidate)
  Provenance applies to OBSERVED BEHAVIOUR, not only to code. Before treating a
  measured behaviour as evidence of a function, check what the RELEASED artifact
  does. `npm pack` the current published version and read it — git tags are not
  the record of what shipped (14.1.2 has no tag), and HEAD is not the record of
  what users have.
```

### What the evidence still supports

The reversal is **not obviously wrong**. `80f41e94`'s stated hazard was that
aliasing a retired key would share one signal with a future `addOne` of that key.
Measured on this branch (`e-ordering-rekey.spec.ts`, THE REVERSED HAZARD row):
after `changeId('tmp-1' -> 'server-99')` and a fresh `addOne({id:'tmp-1', n:777})`,
the held reference still reports `5` and the new member reports `777`. **No
aliasing.** The new design appears to have dissolved the hazard by keying on
subject identity rather than on the key.

That is a reason to derive it properly. It is not a reason to assume it.

### The question, restated as two

```text
Q1  WHICH BEHAVIOUR IS CORRECT?
    drop-and-warn (shipped 14.1.x, rationale recorded) vs follow-the-subject
    (this branch, no rationale recorded). A shipped contract says "always will
    resolve undefined"; the branch makes it resolve. That is a behaviour change
    users can observe, currently unannounced.

Q2  IS IDENTITY-ACROSS-REKEY REQUIRED AT ALL?
    UNPROVEN IN EITHER DIRECTION. The null that matters is not "remove+add" but
    "does any required workflow break if the holder must re-read byId(newId)?"
    NOT RUN.
```

Both go to cross-review, Q1 first, with the ST2031 text and both implementations
attached.

### Consequence for Derivation E

E's form summary said _five members are the minimum and one more is earned_. With
`changeId` withdrawn, **only the five minimum members are established**, and E's
positive result is now confined to the FUNCTION (dynamic membership + granular
observation over canonical truth), not to any member beyond the minimum.

## DERIVATION — SERIALIZATION, FROM ZERO. Not earned, and it CLEARS the M-cluster cut.

Evidence: `serialization-zero-state.spec.ts`, 12 rows. The 1352-line serializer
was opened LAST, per Rule 0o, specifically so it could not re-legitimise the
M3/M4 hooks by virtue of currently calling them.

### The functions, stated before the incumbent was opened

```text
F1 EXTERNALIZE   produce a value carrying canonical truth that survives leaving
                 this process
F2 INTERNALIZE   take such a value and make a tree hold that truth again
F3 IDENTIFY      the external value must say enough about itself that
                 internalizing it is correct
F4 BOUNDARY      whether to BELIEVE the payload depends on where it came from
F5 TRANSPORT     the external form must not assume one transport
F6 REFUSAL       only if independently required
```

### F1 — `tree()` alone does NOT satisfy it, and that is the useful finding

The snapshot's node objects are frozen (dev only), so `snap.user.name = x`
throws. But the freeze is **per node and does not reach leaf values**: an array
leaf is handed out by reference, unfrozen, and `snap.user.pets` **is** the live
array.

This is not a new defect. It is documented at `utils.ts:462-486` and pinned by
`snapshot-aliasing.spec.ts` (5 rows), and deliberately not fixed on measurement:
copying leaf values costs **+54µs against 1.0µs on a 50k array**, and
`Object.freeze` stops `Array.push` while `Date.setFullYear`, `Map.set` and
`Set.add` ignore it entirely — _"half a guarantee reads as a whole one."_

So `tree()` is read-only **by contract**, aliasing live truth. An external
representation that aliases internal truth has not actually left the process.

**The null already closes it: a codec COPIES.** Measured — mutating
`JSON.parse(JSON.stringify(tree()))` leaves the tree untouched. The copy IS the
boundary, and it is work the transport was going to do anyway.

### F2 / F3 — the write path reconstructs, and `nodeMap` is redundant

```text
fresh({ user: {...}, rows: [...], n: 7 })   no metadata, no nodeMap
  -> branches restored, leaves restored, collection restored
```

`metadata.nodeMap` records _"where the target tree contains branch nodes (objects
with set/update) or root-as-signal markers"_ and `deserialize` consumes it at
`:630-651`. But **the target tree was built from its own literal and already
knows which paths are branches.** It is not carrying information the destination
lacks.

Version identification is ordinary application data — `{ v: 2, data: tree() }`,
with the branch on `v` in application code, exactly as the `stored` derivation
found for `{ version, migrate }`. An unknown key in a payload is simply dropped
by the write path.

### F5 — the canonical read representation is CODEC-AGNOSTIC (not "free")

```text
JSON             Date -> string, Set -> {}, Map -> {}, undefined key -> GONE
structuredClone  Date, Set and Map all survive intact
```

The limit is the **transport**, not the tree — but "the snapshot is a plain JS
value so F5 is free" was too loose, and this table is why. `tree()` can carry
`Date`, `Map`, `Set`, cycles and shared mutable references, and JSON silently
destroys four of those.

Stated precisely: **the canonical read representation commits to no encoding**,
so transport-specific encoding need not be SignalTree-owned. That is a stronger
claim than transport neutrality and it is the one the measurement supports.

### What the null genuinely surfaces as a requirement

**Cycles are reachable — scoped.** A plain object in the literal becomes a
branch, but an array leaf holds arbitrary values, so `items.set([cyclic])`
succeeds and `JSON.stringify(tree())` then throws.

```text
CURRENTLY REACHABLE      cyclic canonical leaf values
IF STILL ADMISSIBLE      a JSON-oriented codec needs a cycle policy
OWNER                    the external-representation boundary, not necessarily
                         SignalTree
```

Value admission is itself unresolved (cf. the preserved-Angular-signal admission
question), so greenfield may require canonical values to satisfy an
inert/serializable constraint. **Current permissiveness must not manufacture a
permanent codec requirement.**

### S-2 — derived is already excluded, by construction

```text
signalTree({a,b}).derived($ => ({ sum }))    ->  tree() keys are ['a','b']
```

`sum` is absent. Externalizing a computed would be a category error — it is not
canonical truth, and restoring it would install a stale value that should have
been recomputed. **No exclusion mechanism is needed; the snapshot never contained
it.**

### THE M3 GENERALIZATION TEST — STRENGTHENED, NOT PROVEN (see CONTAMINATION)

This is what serialization was sequenced first to decide.

```text
stored position      tree() === { theme: 'light' }      the plain VALUE, no
                     round-trips and restores            envelope, as M3 predicts

collection           tree().rows === { all: [...] }      the ENVELOPE
                     restores through JSON               ✓
                     A BARE ARRAY restores IDENTICALLY   ✓
```

`fresh({ rows: [{id:'a',n:1},{id:'b',n:2}], n: 1 })` reconstructs `ids()`,
`byId('b').n()` and the sibling leaf. **The envelope carries no reconstruction
information the bare value lacks** — measured across a process boundary, against
JSON, with versioning and a sibling plain position present.

#### ⚠️ CONTAMINATION — this row does not finish the proof

The bare array is accepted by **`entityMap`'s own hydrate hook**:

```ts
const all = Array.isArray(value) ? value : (value as { all?: unknown }).all;
// entity-map.ts:386-388
```

That hook is the mechanism M4 proposes to delete. So the row proves:

```text
✓  the `{all:[...]}` envelope carries no information the CURRENT entityMap
   hydrate implementation needs
✗  a collection with NO snapshot/hydrate specialization can publish and
   reconstruct through the uniform accessor rule
```

Those are different theorems and the second is the one the deletion requires.
**The mechanism under sentence cannot serve as its own equivalence proof** — the
same error as measuring `changeId` on the branch that had silently reversed it,
two derivations earlier.

The same contamination applies to F2's collection clause. Branches and ordinary
leaves establish F2 cleanly; the collection reconstructing "with no metadata"
establishes only that `nodeMap` is unnecessary for the _current_ special-cased
path. That is enough to attack `nodeMap`. It is not enough to delete the special
reconstruction path.

M3 said _"a realized value's state is what the accessor returns."_ Serialization
**strengthens** it: crossing a process boundary introduces no ADDITIONAL
representation requirement, against JSON, with versioning and a sibling plain
position present. It does not elevate it to a system theorem, because the
uncontaminated experiment has not been run.

### Verdict

```text
serialization as a SignalTree-owned enhancer   NOT EARNED for its core function

  F1  needs a COPY -> the codec's job; `tree()` + codec is the null
  F2  `tree(payload)` — already the write path
  F3  ordinary application data; nodeMap is REDUNDANT
  F4  resolved by M4 (mode is a call-site property)
  F5  free — the snapshot is a plain JS value
  F6  not independently required here

  save / load / clear     persistence — `stored`'s territory, already NOT EARNED
  replacer / reviver      pass-throughs to JSON
  preserveTypes           a codec, and the ecosystem ships several
  handleCircular          a real hazard, still a codec's job
  maxDepth                a guard, not a function
```

```text
SERIALIZATION RESULT

serialization enhancer core function   NOT EARNED — provisionally strong
{all:[...]} representation envelope    no independent SERIALIZATION information
                                       found
nodeMap                                no requirement found for reconstruction
                                       into an ALREADY-COMPILED target topology
                                       (leaves room for dynamic unknown-topology
                                       construction, which has no survival
                                       evidence anyway)
M3 representation theorem              STRENGTHENED — external serialization
                                       does not require the envelope
M3/M4 PHYSICAL DELETION                **BLOCKED** on the conforming-collection
                                       prototype
```

**The remaining theorem, stated exactly:**

> Can the earned collection semantics be realized through a uniform accessor
> read/write contract with **no snapshot/hydrate specialization**?

Serialization did the work it was sequenced to do — it establishes that nothing
about crossing a process boundary introduces an additional representation
requirement. It did not finish the proof.

### Scope stated honestly

This derived the **surface** (11 methods, 7 config options, the metadata shape)
and measured the mechanisms that could plausibly be functions the null lacks:
`nodeMap`, circularity, type preservation, derived exclusion, and the round trip
itself. It did **not** read all 1352 lines.

**RETRACTED:** an earlier revision said a hidden function "will surface at the
subtraction as a failing test rather than a silent gap." That is exactly the
absence inference Methodology Rule 2 forbids — a function with no adequate
regression test disappears silently, and subtraction is a falsifier, not
exhaustive discovery.

```text
The remaining implementation is NOT ENTITLED to survival, and subtraction CAN
expose missed dependencies. Failure to expose one is NOT proof that none existed.
```

Before deleting a 1352-line subsystem, a cheap semantic last-look is owed — not
a deep read, an enumeration: public methods, public options, external consumers,
distinct outbound dependencies, distinct reconstruction paths, and which metadata
fields are actually CONSUMED rather than merely emitted. Most of that is covered
above; the consumed-metadata enumeration is not, and deletion does not complete
the discovery proof.

## THE CONFORMING-COLLECTION PROTOTYPE — six properties uncontaminated, and it CHALLENGES E

Evidence: `conforming-collection-prototype.spec.ts`, 7 rows. **Nothing in it
touches `entityMap`, `loader`, or any marker** — that constraint is the point,
since the contaminated serialization row proved only that the envelope carries
nothing the _current hydrate hook_ needs.

The collection is an ORDINARY ARRAY LEAF plus ordinary derived helpers:

```ts
all:    () => leaf()
ids:    computed(() => leaf().map(r => r.id))
byId:   memoised per key — computed(() => leaf().find(r => r.id === id))
addOne: leaf.update(c => [...c, row])
removeOne: leaf.update(c => c.filter(r => r.id !== id))
updateOne: leaf.update(c => c.map(r => r.id === id ? {...r, ...changes} : r))
```

### Results

```text
READ            ✓  the accessor yields the value
MEMBERSHIP      ✓  add / remove dynamic post-construction
GRANULARITY     ✓  watcher on byId('a') does NOT recompute when 'b' updates,
                   NOR when another member is added or removed — and still
                   reacts to its own member
REPRESENTATION  ✓  tree() === { rows: [...], n: 1, user: {...} }
                   NO ENVELOPE. Same generic rule as the sibling leaf and the
                   sibling branch, because the walk sees an ordinary signal.
RECONSTRUCTION  ✓  tree({ rows: [...], n: 5 }) restores by the ordinary write
                   path. NO hydrate hook exists for this position.
ROUND TRIP      ✓  full JSON boundary, and granularity survives it
CANONICALITY    ✗  CONTINGENT — see the regression below
IDENTITY        —  deferred; rekey NECESSITY is withdrawn and unproven
```

**Six properties are established with no marker in the picture.** That is the
uncontaminated evidence the deletion required, for everything except canonicality.

### The 7th property is blocked by a REGRESSION, not by array leaves

```text
this branch   tree.undo() THROWS "Unsupported scoped undo effect at rows"
main (14.x)   the identical scenario PASSES — array row AND scalar control
```

Measured by running the same scenario on both branches. The gate is
`isSupportedEffect`, `time-travel.ts:1680-1694`:

```ts
case 'set':
  return (isScalarValue(before) && isScalarValue(after))
      || (subject === undefined && ownerPath !== path);
```

An array is not scalar, and a top-level leaf is its own owner, so both clauses
fail. Introduced by **`06785300` (2026-08-11 22:29, "feat(history): cut over
public undo to frontier authority")** — the same third-bucket commit that
introduced `SubjectId`.

```text
FINDING — 15-BRANCH UNDO REGRESSION
  Undo refuses ANY non-scalar leaf write: arrays, and by the same rule Date /
  Map / Set / plain-object leaves. Works on the published 14.x lineage. Not a
  property of the shapes; a property of the new undo engine.
  GATE-RELEVANT. Blocks the prototype's canonicality row and must be fixed or
  consciously accepted before the M cut.
```

### AND IT CONTAMINATES DERIVATION E

On this branch, `entityMap` passes canonicality because it emits
**subject-bearing** effects, which `isSupportedEffect` admits, while an ordinary
array does not. E's canonicality column was therefore measuring the undo engine's
admission rule, not a difference between the two shapes.

### The bigger challenge: E's GRANULARITY row

E recorded the conjunction that justified the collection function surviving at
all:

```text
                    dynamic     granular      canonical
ordinary array         YES         NO           YES
ordinary record        NO          YES          YES
entityMap              YES         YES          YES
```

The prototype passes granularity **on an ordinary array**. The two measurements
differ in the WRITE, not the read:

```text
E's row          tree.$.rows.set([{id:'a',n:1}, {id:'b',n:99}])
                 -> fresh object literals for BOTH members, so 'a' changes
                    reference and every observer of 'a' recomputes

the prototype    c.map(r => r.id === id ? {...r, ...changes} : r)
                 -> only the TARGET member is replaced; every other reference is
                    carried across, so byId('a') yields an identical value and
                    Object.is stops propagation
```

E measured **naive whole-array replacement**, which is what a careless array write
looks like — not the array leaf's ceiling. Reference-preserving immutable update
is ordinary application code, and with a memoised per-key `computed` it delivers
granularity.

```text
E's ARRAY row, corrected
  granular under whole-array replacement        NO
  granular under reference-preserving update    YES

CONSEQUENCE
  The CONJUNCTION was the sole argument for the collection function surviving.
  If an ordinary array leaf provides dynamic membership AND granular observation
  AND canonicality (the last on 14.x), then no declaration kind is required to
  hold a collection, and E's positive verdict is CHALLENGED — not yet overturned,
  because the canonicality leg is currently unmeasurable on this branch.
```

### What is NOT established, stated plainly

**Performance is a real difference and it is a FORM question, not a function
one.** `byId` here is `find()` — O(n) per read against `entityMap`'s O(1) Map
lookup, and `ids` is an O(n) map on every membership change. At the widths this
repo benchmarks (10k–50k rows) that is not a footnote. It does not bear on
whether the FUNCTION requires a declaration kind, which is what the prototype
was built to test, but it will dominate the FORM decision.

The prototype also does not attempt `changeId`; rekey necessity is withdrawn and
unproven, so there is nothing yet to satisfy.

### Disposition

```text
M3/M4 PHYSICAL DELETION   still BLOCKED, but the blocker has MOVED:
                          not "can a conforming collection reconstruct by the
                          uniform rule" — measured, yes, six ways — but the
                          undo regression that makes the canonicality leg
                          unmeasurable here.

DERIVATION E              REOPENED on the granularity row. The conjunction needs
                          re-deriving against reference-preserving writes.

NEW GATE ITEM             the 15-branch non-scalar-leaf undo regression.
```

## THREE CORRECTED CLOSURE FALSIFIERS — two verdicts REVERSE

All three earlier verdicts proved a DIFFERENCE and were recorded as if they had
proved a REQUIREMENT (or its absence). Re-run against proper nulls, two reverse
and one is sharpened.

---

### 1. `stored` OUTBOUND — "the null is strictly better" is WITHDRAWN

Evidence: `stored-outbound-corrected.spec.ts`, 5 rows.

**The old null was invalid.** It wrote to storage from an `effect()`, which needs
`TestBed.tick()` to flush — so it established _"durable after a tick"_, a weaker
contract than the one the incumbent was judged against. Comparing a debounced
mechanism to an async null and calling the null "strictly better" was not a fair
measurement.

The corrected null is a genuinely synchronous consequence — the write path that
changes the value also writes the store, same stack, no scheduler:

```text
CONTRACT   after the call RETURNS, the store already holds the new value

corrected synchronous null      SATISFIES     store has '"dark"' on the next line
incumbent, default debounce     FAILS         signal 'dark', store NULL
incumbent, debounceMs: 0        SATISFIES     durable in set()'s own stack
```

**But the incumbent reaches a point the null does not.** Measured:

```text
synchronous null    20 sets -> 20 writes, always durable
debounce only       20 sets -> coalesced, NO durability point
incumbent + flush() 20 sets -> ONE write, durable on demand
```

Coalescing **with an explicit durability point** is a third option, and it is the
incumbent's actual contribution. The earlier pass missed it by comparing against
an async null.

```text
stored OUTBOUND
  FUNCTION ("survive process death")    still NOT EARNED — reachable
                                        synchronously in ordinary code
  WITHDRAWN CLAIM                       "the null is strictly better". False.
  REAL TRADE                            durability-per-write vs coalescing;
                                        reaching BOTH needs pending-write
                                        machinery, which an application can also
                                        write (a timer plus a drain). DX, not
                                        function — but the trade is real and was
                                        misdescribed.
```

---

### 2. `tap` — VERDICT REVERSED. Event identity is NOT reducible to state.

Evidence: `tap-rekey-necessity.spec.ts`, 3 rows.

E-TAP concluded the pull surface already delivers it, recovered by diff. **The
diff null only worked because it observed between every mutation.**

```text
add 'a' then remove 'a'        final state IDENTICAL to doing nothing
                              tap saw ['add:a','rem:a']
update n 1->2 then 2->1        start === end
                              tap saw ['a:{"n":2}','a:{"n":1}']

diff sampled BETWEEN each      both events recovered
diff sampled only at the END   { added: [], removed: [] } — INVISIBLE
```

A `computed` is pull-based: it samples when READ, not when written. No consumer
can guarantee a read between every mutation.

```text
tap
  PREVIOUS VERDICT   "no function — already delivered by the pull surface"
  CORRECTED          WITHDRAWN. Mutation-event identity is NOT reducible to
                     resulting state.
  REMAINING QUESTION OWNERSHIP, not existence. Is "observe every mutation event"
                     a COLLECTION function, or the transaction/history kernel's?
                     Undo already records per-turn effects — the same information
                     at tree scope. That is the null that should have been run,
                     and it has NOT been run.
```

---

### 3. `changeId` — the gap is now PRECISE, and necessity is still unproven

Evidence: `tap-rekey-necessity.spec.ts`, 2 rows.

The null shipped 14.x recommends (ST2031): _"hold the id and call `byId(id())` at
the point of use rather than holding the node across a rekey."_

```text
holder keeps the ID      changeId + selectedId.set(newKey)   -> WORKS, n === 5
holder keeps only NODE   node.().id === 'tmp-1'  (STALE)
                         byId('tmp-1') === undefined
                         -> CANNOT recover the new key
```

So the re-read null requires the holder to learn the new key from somewhere else.
**The collection does not tell it, and the member misreports itself** — the split
identity both designs carry. That is the ordinary Angular input shape: a component
handed a node, with no id and no collection reference.

```text
changeId
  ESTABLISHED     a node-only holder cannot recover after a rekey
  NOT ESTABLISHED that follow-the-subject is the answer. Cheaper repairs exist
                  and neither is derived:
                    (a) fix the split identity so the member reports its real key
                    (b) notify holders of the rekey
  NECESSITY       still UNPROVEN. The gap is now stated precisely instead of
                  asserted.
```

---

### Net effect on the matrix

```text
E's form, previously   "five minimum members established, changeId withdrawn,
                        tap and intercept deleted"

now                    tap's deletion is WITHDRAWN — its function exists, its
                        OWNER is undecided, and the kernel-scope null is unrun
                       changeId's gap is precise but necessity unproven
                       intercept's deletion STANDS (category error + fail-open;
                        untouched by these corrections)
                       stored still NOT EARNED, on corrected reasoning
```

**Pattern across all three:** every one of these verdicts came from a null that
was easier to satisfy than the contract it was being compared against —
`effect()` instead of a synchronous write, a diff that samples at every step,
remove+add instead of "does any workflow break." The methodology's own rule
covers it and was not applied: _state the contract precisely, then build the null
to that contract, not to a convenient approximation of it._

## DERIVATION — THE FRONTIER UNDO ENGINE. Its candidate retention advantage is NOT DELIVERED.

> **Read the FIVE CORRECTIONS section that follows before using any conclusion
> here.** The measurement stands; four of the conclusions drawn from it were
> withdrawn or narrowed.

Run under option 3: derive the engine before touching it, rather than patch
third-bucket code that may not survive its own derivation.

### The function, from zero

```text
U1  return canonical truth to a state it previously held
U2  the states returned to must be ones a user recognises as STEPS
U3  advance again after returning (redo)
U4  exclude some state from history
U5  group multiple writes into one logical step
```

### The null is not hypothetical — it SHIPS

```text
                        main / 14.x              this branch (frontier)
time-travel.ts          885 lines                3,068 lines
causal-runtime/         ABSENT                   ~2,834 prod + ~6,456 spec
mechanism               stack of whole-state     effect-level causal recording
                        snapshots; restoreState  (turn store, reversal planner,
                        (entry.state)            realization adapter, subject
                                                 reclamation)
non-scalar leaf undo    WORKS                    THROWS
provenance              shipped                  d8824b91, 2026-08-13, third
                                                 bucket, empty-bodied commits
```

The null satisfies U1–U5 today, in 885 lines, and handles arrays, `Date`, `Map`
and `Set` correctly. So effect-level recording must earn its ~5,000 additional
lines against a WORKING predecessor.

### What it was supposed to buy: bounded retention. MEASURED — it does not.

`tools/bench-retention-arms.mjs`, 10k rows × 50 writes, `--expose-gc`, baseline
taken after seeding. **Three runs each, both engines built with
`nx build core --skip-nx-cache`.**

```text
arm        snapshot (main)          frontier (branch)        ratio
scalar     0.112  0.127  0.112      0.189  0.189  0.191      ~1.6x WORSE
sameRow    3.951  3.960  3.951      3.959  3.959  3.961      PARITY
allRows    23.045 23.046 23.046     88.344 88.352 88.351     3.83x WORSE
```

Variance is ±0.01 MB. These are not noise.

**`sameRow` is the decisive arm.** It updates ONE row of a 10,000-row collection,
fifty times. Effect-level recording exists precisely so that retention tracks the
DELTA rather than the width — one changed row per entry, not ten thousand
pointers. It is **identical to snapshots**, at the bench's documented ~8.3
bytes-per-pointer, which is the signature of retaining the whole N-pointer array
per entry.

So the engine pays the snapshot cost on the narrow path and **3.8× the snapshot
cost** on the wide one.

### Combined with the correctness regression

```text
retention, narrow write   parity with the 885-line null
retention, wide write     3.83x worse
retention, scalar only    1.6x worse
non-scalar leaf undo      REFUSED (arrays, Date, Map, Set) — the null handles all
cost                      ~5,000 additional lines of production code
```

On every axis measured, the frontier engine is equal to or worse than the engine
it replaced.

### What this does NOT establish — stated plainly

Three possible justifications remain **UNMEASURED**, and the engine could still
earn on any of them:

```text
E2  PRECISION          undo only what a turn touched, leaving concurrent state
                       alone. Snapshots restore wholesale.
E3  SCOPED UNDO        undo one position's history independently of the tree's.
E4  TRANSACTION GROUP  6be8d3e2 "add explicit transaction grouping" — U5 at a
                       granularity snapshots may not reach.
```

Also unmeasured: whether a _conforming_ collection (plain array leaf) changes the
retention picture for either engine, and whether the engine is **incomplete
mid-cutover** rather than wrong — the `isSupportedEffect` throw reads like a guard
on unfinished work, and the commits that would say so have empty bodies.

**No claim is made that the engine is worthless.** The claim is narrower and it is
measured: _the retention justification that motivated it is not delivered, and the
implementation currently regresses correctness against its predecessor._

### Consequence for the sequence

This is why option 3 was the right call. Had the regression been "fixed" first,
the fix would have been ~5,000 lines of third-bucket code repaired to reach parity
with an 885-line predecessor on the axis that motivated replacing it.

> ⚠️ **THE BLOCK BELOW IS SUPERSEDED — read C1 in the corrections section that
> follows.** "REVERT to the snapshot engine" was WITHDRAWN as a Rule 0l violation:
> legacy gets no automatic restoration rights. The corrected disposition is DELETE
> what earns nothing, then DERIVE the minimum from zero. Retained verbatim as the
> record of what was claimed.

```text
NEXT   derive E2 / E3 / E4 against the snapshot null. If none earns, the
       disposition is REVERT to the snapshot engine, not repair the frontier one —
       and the non-scalar regression disappears with it rather than needing a fix.
       If one DOES earn, the fix is justified and its shape follows from which.

BLOCKED MEANWHILE
       the conforming-collection prototype's CANONICALITY row
       Derivation E's canonicality column
       the M-cluster physical cut
```

## FRONTIER DERIVATION — FIVE CORRECTIONS before anything builds on it

The measurement stands. Four of the five conclusions drawn from it did not.

---

### C1. "REVERT to the snapshot engine" is WITHDRAWN — it violates Rule 0l

The write-up said:

```text
If E2/E3/E4 do not earn:  REVERT to the snapshot engine
```

That grants legacy **automatic restoration rights**, which is precisely what
Rule 0l forbids: _legacy mechanisms are evidence repositories, not migration
targets._ The rule was in front of me and I wrote the violation anyway. It also
lets 14.x win by default merely because the 15 mechanism failed — the v14-gravity
failure mode this audit exists to police.

**Corrected branch:**

```text
E2 / E4 / E3 all fail
       ↓
the frontier effect/causal REALIZATION has no independently earned function
       ↓
DELETE that architecture
       ↓
DERIVE the minimum undo realization FROM ZERO against the frozen contract
```

The 885-line snapshot engine's standing:

```text
PROVED       a much smaller implementation satisfies important portions of the
             contract, including non-scalar leaves
NOT PROVED   that its architecture is the right SignalTree 15 architecture
```

The greenfield minimum may land on snapshots, on snapshots plus a small
step/grouping layer, on immutable-root references with selective exclusion, or on
a hybrid. **"Revert" is not a permitted disposition; "delete, then derive" is.**

---

### C2. The retainer is NOT attributed — the claim is narrowed

Withdrawn: _"it retains the whole N-pointer array per entry."_

What was measured is a **signature**: at 10k × 50 same-row writes the frontier
system retains ~3.96 MB, consistent with the snapshot system's N-pointer slope at
the bench's documented ~8.3 bytes/pointer. That identifies the _shape_ of the
retention, not the object graph that owns it.

Asserting the mechanism from the signature is the error `RELEASE-1.0.md` already
polices in the form-marker case — _"the stack frame says WHERE THE REFUSAL IS
RAISED, not where the contamination originated."_ Same class, committed two
sections later.

Live candidates, none excluded:

```text
A  the turn/effect store retains whole collection projections
B  time-travel still retains a parallel snapshot representation ALONGSIDE
   retained causal effects
C  structural-history metadata retains the projection
D  materialised entity projections / descriptors retain it
E  several of these compose to the same slope
```

The `allRows` result — 23 MB against 88 MB — actively _favours_ B or E over "the
effect representation is merely inefficient": 3.83× looks like **more than one
retained representation**, not one inefficient one.

```text
SAFE WORDING
  The frontier system exhibits a width-dependent retention signature
  indistinguishable from whole-state snapshots on the narrow case. The owning
  retainer is NOT YET ATTRIBUTED.

OWED
  retention attribution — heap-retainer inspection for one retained entity array,
  or component ablation. Does NOT block E2/E4/E3, but DOES block any causal claim
  about which subsystem is responsible.
```

---

### C3. U5 was one property doing two jobs — split it

The write-up asserted both _"the 14.x null satisfies U1–U5"_ and _"E4:
transaction grouping — U5 at a granularity snapshots may not reach."_ Those cannot
both stand.

```text
U5a  HISTORY-STEP GROUPING
     several writes appear as ONE undo step
     -> 14.x plausibly satisfies this

U5b  EXPLICIT TRANSACTION SEMANTICS
     boundaries interact correctly with nested writes, refusal, rollback, causal
     attribution, persistence consequences, and possibly
     speculation/confirmation
     -> NOT established for 14.x, and NOT the same contract
```

The null was built to U5a and scored against U5b. That is the failure named one
commit earlier — _build the null to the contract, not to a convenient
approximation of it_ — repeated immediately.

---

### C4. "Its retention justification is REFUTED" → narrowed

Empty commit bodies mean the engine's original motivation **cannot be
reconstructed**. Inferring it from a benchmark is the same absence inference the
audit keeps catching.

```text
WITHDRAWN   "its retention justification is refuted"
CORRECTED   "the candidate retention advantage that could justify effect-level
             recording is NOT DELIVERED by the current implementation"
```

Retention may never have been the motivation. Precision, speculation/confirmation,
rollback semantics, structural identity, compensation and persistence
consequences are all candidate motivations — which is exactly why E2/E4/E3 matter.

---

### C5. NEW — separate CAUSAL SEMANTICS from UNDO STORAGE. This may be the fracture line.

Not previously considered, and it reframes the whole fork. The causal kernel and
the undo storage representation have been treated as one thing **because they are
colocated** — the colocation error, applied to the largest subsystem in the
codebase.

```text
NULL TO RUN BEFORE E2

  Does the representation used to RETAIN CONFIRMED UNDO HISTORY need to be the
  same representation used to REASON ABOUT CAUSAL TURNS?

  PRIOR: UNPROVEN.
```

If it does not, the disposition space is far richer than survive-or-revert:

```text
MAY SURVIVE                          MAY DELETE
  turn identity                        effect-level retained undo log
  authorship / attribution             reversal planner
  speculation / confirmation           the current realizer
  atomic transaction grouping
  persistence-consequence attribution  DERIVE SEPARATELY
                                         confirmed-undo representation
```

That outcome would remove thousands of lines **while keeping the genuinely novel
15 semantics** — and it would not require repairing the non-scalar
`applyTurnEffects` path at all, because that path would be deleted rather than
fixed. Collection canonicality gets unblocked without fixing the wrong subsystem.

---

### Revised order and framing

```text
PRE-E2  is confirmed-undo storage separable from causal-turn reasoning?
E2      PRECISION — and the null is NOT `restoreState(entry.state)`.
        Snapshot STORAGE is not snapshot RESTORATION: a snapshot history may
        retain full roots while undo computes a TARGETED delta by diffing
        adjacent roots under structural sharing. The real question is whether a
        snapshot-DERIVED mechanism satisfies precision without the causal effect
        ontology.
E4      TRANSACTION SEMANTICS at U5b, not U5a
E3      SCOPED UNDO — but FIRST ask whether scoped undo survives its own null at
        all: if SignalTree supported only whole-turn undo, what valuable workflow
        becomes impossible or semantically wrong? If none, derive no machinery.
```

## PRE-E2 — IS CONFIRMED-UNDO STORAGE SEPARABLE FROM CAUSAL-TURN REASONING?

Measured by coupling, before any redesign. The whole causal kernel has **exactly
two production consumers** outside itself, and their dependence is sharply
asymmetric.

```text
consumer            causal-runtime modules touched
transactions.ts     6   applied-history · causal-types · pending-rollback
                        realization-context · tree-realization-adapter · turn-store
time-travel.ts      2   causal-types · tree-realization-adapter
```

The specific imports:

```text
transactions   AppliedHistory, CausalEffect, PositionId, rollbackPendingTurnAt,
               createRealizationContextSource, createTreeRealizationAdapter,
               defineTreeRealizationDescriptors, defineTreeRealizationPort,
               getTreeRealizationDescriptors, getTreeRealizationPort,
               rememberTreeRealizationDescriptor

time-travel    getTreeRealizationPort, rememberTreeRealizationDescriptor,
               ReversalEffect (type)
```

### Result — a LOW-COUPLING BOUNDARY is visible. Ownership is NOT established.

> **CORRECTION.** An earlier revision concluded _"the causal kernel's real client
> is the transaction system, not the undo system."_ **Withdrawn.** That assigns
> semantic ownership from DIRECT-IMPORT evidence, and `direct import ≠ semantic
dependency` — the same vocabulary rule that governs lexical hits. A module can
> depend on facts whose authority originates elsewhere without importing their
> source. The topology could plausibly be:
>
> ```text
> turn-store -> transactions establishes/maintains causal history
>            -> realization descriptors / port
>            -> time-travel consumes the resulting consequences
> ```
>
> in which case time-travel would still not import `turn-store` while confirmed
> undo depended on facts it owns. **That control flow has not been inspected.**
>
> ```text
> DIRECT STRUCTURAL COUPLING   strongly asymmetric — MEASURED
> SEPARATION FEASIBILITY       STRONG EVIDENCE
> SEMANTIC INDEPENDENCE        UNPROVEN
> OWNERSHIP                    UNPROVEN
> ```

**`turn-store` — the module that retains turns — is consumed by `transactions`
ONLY. `time-travel` never touches it.** Time-travel's entire dependence on the
causal kernel is the realization _port_ (a way to apply effects to the tree) plus
one type.

So the causal kernel's real client is the **transaction** system, not the undo
system. Undo currently rides on the realization port; it does not consume turn
identity, applied history, pending rollback or realization context.

```text
EVIDENCE FOR SEPARABILITY   strong. Separating them would not require inventing a
                            boundary — it would require ENFORCING one that the
                            import graph already almost describes. The weaker
                            consumer needs a narrow interface today.

NOT ESTABLISHED             that they MUST be separate, or that undo's use of the
                            realization port is removable. Coupling measures how
                            it IS wired, not what is necessary — the same rule
                            that says colocation never establishes ownership
                            applies symmetrically here.
```

### What this changes about the fork

The disposition space the corrections opened is not speculative — it maps onto
module boundaries that exist:

```text
LIKELY SEPARABLE, serving TRANSACTIONS   turn-store, applied-history,
                                         pending-rollback, realization-context
SHARED MECHANISM                         tree-realization-adapter (the port both
                                         use to apply effects)
UNDO-SPECIFIC                            reversal-planner, and the
                                         isSupportedEffect gate inside
                                         time-travel
```

**CORRECTED conditional.** E2 can only remove _precision_ as a justification. It
cannot establish that `reversal-planner` has no other surviving role under E4
transaction semantics, E3 scoped undo, confirmed redo, pending rollback, or
subject/rekey semantics.

```text
IF E2 SUCCEEDS
  precision ceases to justify effect-retained confirmed history and the current
  confirmed reversal path

  reversal-planner / effect-reversal machinery become DELETE CANDIDATES

  FINAL disposition still waits on E4 and E3 failing to give them another
  function
```

That keeps E2 from sentencing code E4 might independently earn.

## E2 — PRECISION. Write-set precision is snapshot-derivable. Semantic precision needs a causal DECISION, not an effect log.

Evidence: `e2-precision-null.spec.ts`, 5 rows. The null is built from zero and is
**not** `restoreState(entry.state)` — it retains full roots and computes a
targeted delta by diffing them.

```ts
writeSet(before, after)   paths where two retained roots differ; `before === after`
                          short-circuits, so structural sharing keeps it cheap
undoTurn(turn, current)   for each touched path, revert ONLY IF current truth
                          still holds what the turn put there — otherwise a later
                          turn owns that position
```

### The ladder

```text
P1  unrelated later truth
    a=0 b=0 · T1: a->1 · later b->1 · undo T1
    -> a === 0, b === 1                                   PASS

P2  same position, later confirmed work
    x=A · T1: A->B · T2: B->C · undo T1
    -> patches === [] and x stays 'C'                     PASS (and it DEFINES
       the contract: T1 no longer owns the position, so write-set precision
       declines to touch it — produced by the rule, not special-cased)

P3  speculative predecessor
    x=A · T1 pending A->B · T2 confirmed B->C · rollback T1 · undo T2
    REQUIRED: x === 'A'

    naive adjacent-root diff        -> x === 'B'          FAIL
    with rollback REWRITING history -> x === 'A'          PASS
                                       redo returns 'C'   PASS
```

**P3 is the decisive row and the naive null fails it.** `T2.before` encodes `B`,
a state contributed by a turn that no longer survives, so "diff adjacent retained
roots" is itself a convenient approximation — the same error class as the nulls
corrected earlier, in a new form.

### What the missing ingredient actually is

It is **not** a different storage representation. It is a _decision_: when T1 is
rolled back, its contribution must stop being anyone's baseline. Implemented as
~10 lines that rewrite successors' retained `before` for the paths T1 touched,
the snapshot null passes P3 and redo.

```text
causal layer        decides WHAT historical meaning survives
history repr.       stores enough truth to realise that decision
physical layer      applies the resulting canonical values
```

So the layers separate cleanly, and **effect-level RETAINED STORAGE is not what
P3 requires — history REWRITING on rollback is.** Causal reasoning can operate on
a snapshot representation.

### Disposition

```text
PRECISION as a justification for effect-retained confirmed history   REMOVED

reversal-planner / effect-reversal machinery   DELETE CANDIDATES, no longer
                                              justified by precision
FINAL disposition                             still waits on E4 (U5b transaction
                                              semantics) and E3 failing to give
                                              them another function
```

### Scope, stated plainly

**The P3 scenario is a MODEL of the speculation/rollback contract, not an
exercise of the shipped mechanism.** It was constructed directly rather than
driven through `transactions` / `rollbackPendingTurnAt`, so the real pending-turn
semantics may differ from what was modelled — and if they do, P3 must be re-run
against them before the disposition is acted on. What is established is that _a_
snapshot-derived mechanism can satisfy the contract as stated, which is what E2
was asked.

Also unbenchmarked: the `writeSet` diff's cost at width. It short-circuits on
shared references, so the expectation is O(changed), but that is an expectation,
not a measurement.

## E2 — DOWNGRADED. Its null is falsified twice, and the earned theorem is narrower.

Evidence: `e2b-authorship.spec.ts`, 3 rows. Two independent holes in E2's own
null, both reproduced against the algorithm unchanged.

### HOLE 1 — ABA. `undoTurn` mistakes value equality for causal authorship.

```ts
if (get(current, p) === get(turn.after, p)) revert(p); // "T1 still owns this"
```

That implication is false, and it negates the exact distinction this architecture
exists to preserve: **value equality is not causal authorship.**

```text
x = A · T1 authors 'B' · later work: B -> C -> B   (outside the stack)

current 'B' === T1.after 'B'
  -> the rule emits 1 patch and reverts x to 'A'      MEASURED
  -> surviving later truth DESTROYED

CORRECT: T1 lost the position the moment later work wrote 'C'. Authorship did
not return with the value. `undo T1` must be a NO-OP and x must remain 'B'.
```

The snapshot null **cannot** reach that conclusion, because the information it
needs — _who wrote the current value_ — is not in the values.

### HOLE 2 — the P3 repair clobbers siblings on a nested path

```text
{ profile: { name: 'n1', age: 30 } } · T1 name->'n2' · T2 name->'n3' · rollback T1

patch('profile.name','n1') === { profile: { name: 'n1' } }
{ ...before, ...patch }  replaces the WHOLE `profile` branch

MEASURED  t2.before.profile.age === undefined
          Object.keys(t2.before.profile) === ['name']
```

The scalar P3 could not surface it. So _"~10 lines solve it"_ was a **proof
sketch**, not an equivalence implementation.

### E2-A — the contract boundary, settled by the public surface

```text
undo · redo · canUndo · canRedo · getHistory · resetHistory · jumpTo(index)
· getCurrentIndex
```

**No selective per-turn reversal exists**, and `jumpTo` is cursor navigation, not
"reverse turn N while later turns survive." So P2's premise belongs to **E3**, and
letting it define E2's contract would have earned E2 by assuming the next row's
function. **P2 is removed from E2.**

P1 and P3 stay, because both are LIFO: P1 undoes the top of the stack while a
position changed _outside_ the stack must survive; P3 undoes the newest confirmed
turn. ABA also arises under LIFO, for the same reason as P1 — so the hole stands
independently of the boundary.

### `history rewriting` is NOT EARNED — it conflates two things

The P3 repair mutated `T2.before` from `B` to `A`. But **`B` did exist.** T1
produced it and T2 genuinely executed from it.

```text
FACTUAL HISTORY              what T2 actually observed        B -> C
EFFECTIVE REVERSAL BASELINE  what remains once dead causal
                             contributions are removed        A -> C
```

Those are different concepts and must not be forced into one representation. The
sharpened layering:

```text
causal layer            decides which contributions survive
history / evidence      preserves what actually occurred
reversal representation derives the effective before/after for undo
physical layer          applies the result
```

They may ultimately be one structure. That is **not granted**.

### Corrected checkpoint

```text
snapshot-derived changed-path identification        PROVED-IN-MODEL
naive adjacent-root reversal                        REFUTED (P3)
causal decision independent of storage repr.        STRONGLY SUPPORTED
snapshot-derived reversal representation            FEASIBLE — one scalar model
value equality as an ownership test                 REFUTED (ABA)
"write-set precision is snapshot-derivable"         WITHDRAWN
history rewriting                                   NOT EARNED
precision eliminates effect-retained history        NOT PROVED
reversal-planner / effect-reversal                  still UNPROVEN — NOT
                                                    upgraded to DELETE CANDIDATE
```

**The theorem actually earned, stated narrowly:**

> Semantic precision requires causal information, and the P3 example provides no
> evidence that the causal information must itself be stored as the confirmed
> undo payload.

That is meaningful. It is not _"confirmed undo can therefore use snapshots."_

### OWED before E4

```text
E2-C   run the frozen P3 through the REAL path — transactions, pending turn,
       confirmation, rollbackPendingTurnAt, confirmed undo — then ask whether a
       reversal representation can consume the REAL causal decision without
       retaining the current effect log. Include a NESTED-PATH variant so no
       baseline correction can pass by clobbering siblings.
```

Only when E2-C is green does `PRECISION JUSTIFICATION -> REMOVED` become
writable. **E4 does not start before that.**

## E2-C — THE REAL CAUSAL PATH. Characterization first, and the model's contract was NOT frozen.

Evidence: `e2c-real-causal-path.spec.ts`, 5 rows. Driven through the real
`transaction()` / `confirm()` / `rollback()` / `undo()` / `redo()` path.

### First: the contract E2 modelled does not exist

E2 asserted that after `T1 pending A->B`, `T2 confirmed B->C`, `rollback T1`,
confirmed undo _must_ land on `A`. **Nothing in this repository freezes that.** It
was a proposed semantic, and building a null to it repeated the exact failure the
audit keeps catching — a null built to an assumed contract.

### Characterized public behaviour

```text
transactions() publishes ONLY `transaction()`. getConfirmedTurnCount /
getPendingTurnIds and friends are on the INTERNAL runtime, not the public tree.
timeTravel() publishes `transaction()` on its own.

pending write            visible in canonical truth IMMEDIATELY, adds NO history
                         entry
confirm()                historicises — one entry appears
rollback() of a pending
turn already superseded  truth UNCHANGED ('C'), history NOT rewritten
confirmed undo           -> 'B'
redo                     -> 'C'
nested variant           -> name 'B', and the untouched sibling `age` SURVIVES
```

### The E2-decisive observation

**`B` is exactly what E2's "naive" snapshot null produced, and exactly what E2
labelled WRONG.** The effect-log representation and the snapshot-derived
representation are **indistinguishable** on this scenario. No causal decision
about T1's death is consumed: history is not rewritten, and the recorded baseline
is reversed as-is.

So **P3 distinguishes nothing.** The row E2 called "the row that decides E2"
decides neither representation, because both produce the same value and no
contract says which is right.

### And ABA — the real kernel does not distinguish authorship either

```text
T1 CONFIRMED A->B                     hist +1
later PENDING turn: B -> C -> B       hist UNCHANGED (production-valid
                                      out-of-history work, per row 1)
current truth 'B', authored by the PENDING turn
undo                                  -> 'A'
```

The pending turn's surviving contribution is **destroyed** — the same outcome as
E2-B's ABA falsifier against the snapshot null. So the information E2-B showed
snapshots lack is **not being used by the real system either**.

Whether landing on `A` is a defect is a separate question these rows deliberately
do not answer. They record.

### What confirmed reversal actually consumes

`ReversalEffect` (`causal-types.ts:37-51`):

```text
owner: PositionId       position identity      -> snapshot-derivable (write-set diff)
before / after          values                 -> snapshot-derivable
path / ownerPath        addresses; the docblock says explicitly "not semantic
                        identity"              -> snapshot-derivable
subjectId?              semantic identity      -> NOT derivable
structural?             add / remove / rekey    -> PARTIALLY derivable: a diff sees
                                                  a key appear or disappear, but
                                                  not a rekey as an identity MOVE
```

```text
WHO DECIDES that T1 stops contributing to T2's baseline?   NOBODY — measured.
WHERE IS THAT FACT STORED?                                 NOWHERE. The decision
                                                           is not made.
```

### Disposition — deliberately NOT upgraded

```text
precision eliminates effect-retained history   STILL NOT PROVED
reversal-planner / effect-reversal             STILL UNPROVEN

WHAT NARROWED
  the remaining justification for effect-level retention reduces to exactly TWO
  fields: `subjectId`, whose necessity is ALREADY WITHDRAWN (E-REKEY), and
  `structural`, which reduces to the same rekey question.

WHAT IS NOT LICENSED
  "snapshots are sufficient." The measurement shows EQUIVALENCE on two hostile
  scenarios, not CORRECTNESS — and since the contract on both is unspecified,
  equivalence is all that is available. Two mechanisms agreeing does not make
  either right.
```

**E4 remains blocked** until the rekey question resolves `structural`, because
that is now the only field carrying a candidate function a value diff cannot
reproduce.

## CORRECTIONS — the invented P3 theorem, the `structural` overclaim, and E4's block

### 1. REMOVE the invented P3 theorem from the record

This was never a SignalTree invariant. It was proposed in review, adopted by me as
a contract, and used as an architectural falsifier. **Struck.**

```text
STRUCK — NOT A FROZEN THEOREM
  A · T1 pending A->B · T2 confirmed B->C · rollback T1 leaves C
  undo T2 => A · redo => C
```

Replaced by what is actually established:

```text
MEASURED CURRENT BEHAVIOUR (e2c-real-causal-path.spec.ts)

  A
  T1 pending    A -> B        visible in truth, NO history entry
  T2 confirmed  B -> C        confirm() historicises
  rollback superseded T1      canonical truth remains C
                              confirmed history baseline remains B
  undo T2                     C -> B
  redo T2                     B -> C

SEMANTIC REQUIREMENT FOR 'A' INSTEAD OF 'B'      UNPROVEN

If pending surviving truth SHOULD survive confirmed undo, that is a NEW semantic
requirement that must earn itself — not something the implementation owes today.
```

The same applies to ABA: it proves value equality cannot establish authorship. It
does **not** prove confirmed undo is required to preserve pending authorship.

### 2. `structural` does NOT reduce to the rekey question — WITHDRAWN

E2-C claimed the remaining justification reduces to `subjectId` (withdrawn) and
`structural` (_"reduces to the same rekey question"_). **The second half is
withdrawn.** It repeats the error of letting one row sentence a whole mechanism.

Enumerated, not grepped:

```text
StructuralEffect = 'add' | 'remove' | 'rekey'
```

plus two fields the earlier pass did not account for:

```text
structuralContext?: StructuralHistoryEffect
  "Producer-authored structural information required to realize this existence
   transition AFTER THE ORIGINAL MUTATION CONTEXT IS GONE. This is durable
   canonical history... planners derive [current subject state] separately."

subjectPositions?: readonly PositionId[]
  "positions [that] may supply payload needed to physically realize add/remove
   WITHOUT BECOMING INDEPENDENT VALUE PARTICIPANTS in the turn."
```

**Coverage-versus-participant is a distinction a value diff cannot express**, and
it is independent of rekey. Candidate structural semantics therefore include
membership add/remove, subject creation and reclamation, key reuse, and collection
structural lifetime — none disposed of by rekey failing.

**And E-REKEY did not kill `SubjectId` globally.** It killed one proposed
justification for it. Subject-lifetime identity is a separate question that has
not been derived.

### 3. E4 is UNBLOCKED

E4 was blocked because E2 might have been secretly rediscovering a core causal
responsibility of the effect log. **E2-C answered that**: the P3 baseline
transformation does not exist in the contract or the implementation, ABA authorship
preservation is not established semantics, and confirmed reversal consumes its
recorded baseline as-is. So there is no unknown giant semantic responsibility for
E4 to wait behind, and serializing an independently derived transaction row behind
an unrelated representation field is poor methodology.

```text
TWO INDEPENDENT OPEN ROWS — neither blocks the other

E2-S  does STRUCTURAL confirmed reversal require representation beyond canonical
      before/after truth?
E4    does explicit transaction semantics independently require causal/effect
      machinery?

FINAL DISPOSITION waits on BOTH.
```

### The conclusion actually earned, restated

```text
SCALAR REVERSAL
  the effect log has demonstrated NO semantic advantage over retained canonical
  before/after truth.

NOT       "snapshots are sufficient"
NOT       "effects can be deleted"

STILL CANDIDATE DISTINGUISHERS
  structural subject / membership semantics   -> E2-S
  transaction semantics                       -> E4
  scoped undo, only if it independently survives -> E3
```

## E2-S — STRUCTURAL. The first capability canonical values CANNOT reproduce.

Evidence: `e2s-structural-null.spec.ts`, 5 rows. Membership went first because
dynamic membership already survived independently, so confirmed reversal of
membership has a real function whether or not rekey does.

### Membership add/remove — both mechanisms manage it

```text
add 'c' -> undo -> ['a','b'] -> redo -> ['a','b','c']      REAL SYSTEM: works
```

No divergence here.

### Subject revival vs key reuse — WHERE THEY DIVERGE

```text
REAL SYSTEM
  add 'a' · hold byId('a') · remove 'a'        held -> undefined
  UNDO the removal                             held -> 1     REVIVED

  add 'a' · hold byId('a') · remove 'a'        held -> undefined
  ordinary RE-ADD {id:'a', n:1}                held -> undefined   STILL DEAD
  (a fresh byId('a') finds the new member at 1)
```

**Same key. Same value. Opposite identity outcome.** The system distinguishes _"the
original member came back"_ from _"a new member took the key"_ — and that
distinction is **invisible in the values**.

```text
KEY REUSE ACROSS UNDO
  add {k,111} · remove k · add {k,999} · hold byId('k') -> 999
  undo (the reuse-add)   -> []
  undo (the removal)     -> [{k,111}]
  held reference to the SECOND subject   -> undefined      NO ALIASING

SUBJECT-FREE NULL (ordinary array leaf, byId as a memoised computed)
  same sequence, then restore the original value — the best a value-only
  representation can do
  held reference to the SECOND subject   -> 111            ALIASED
```

The null reports the _first_ subject's data through a reference held to the
_second_, because a value-keyed lookup cannot tell them apart.

### Result

```text
FIRST MEASURED CAPABILITY that canonical before/after truth CANNOT reproduce,
and it is INDEPENDENT OF REKEY:

  distinguishing "this key is occupied again" from "this same member is back"
  requires identity that does not live in the values.
```

```text
WHAT THIS EARNS      subject-lifetime identity has a POSITIVE, INDEPENDENT
                     justification. E-REKEY withdrew its only previous one;
                     this supplies a different one.
WHAT IT DOES NOT     it does NOT establish that the current EFFECT LOG is the
                     right carrier for that identity — only that SOME identity
                     beyond values is required. Identity could travel alongside a
                     snapshot representation.
                     It does NOT revive rekey, whose necessity remains withdrawn.
```

### An attribution error, recorded

An earlier draft of the revival row asserted the restoration was "merely
resolve-on-read" and would happen for an ordinary re-add too — reasoning from the
`entity-signal.ts` docblock about resolving the per-entity signal on every read.
**Measured: it does not.** The held reference lives after UNDO and stays dead after
RE-ADD. The claim was written as a test rather than as prose, which is why the
measurement caught it instead of the record carrying it forward.

### Where the derivation now stands

```text
SCALAR REVERSAL          effect log earns nothing over retained canonical truth
STRUCTURAL REVERSAL      identity beyond values IS required — measured
NEXT QUESTION            must that identity be carried BY the effect log, or can
                         it accompany a snapshot representation?
STILL INDEPENDENT        E4 (transaction semantics), E3 (scoped undo, only if it
                         survives its own null)
```

## E2-S — DOWNGRADED. The experiment embedded the contract it was testing.

E2-S concluded _"subject-lifetime identity has a POSITIVE, INDEPENDENT
justification."_ **Withdrawn.** That jumps from

```text
CURRENT BEHAVIOUR distinguishes subject generations
```

to

```text
SignalTree 15 NEEDS subject-lifetime identity
```

which is the survival jump this audit exists to prevent. Worse, the falsifier
_assumed_ the contract:

```ts
const held = rows.byId('a');
remove('a');
undo();
held must refer to the restored ORIGINAL subject   // <- WHY MUST IT?
```

Nothing established that a handle obtained before removal must survive removal at
all. Same class as the invented P3 theorem: the contract was written into the test.

**And the subject-free null bakes in its own handle contract** — cache by key, so
the same `computed` survives and key reuse aliases. Refuting it refutes _that_
null for _current entityMap reference semantics_. It does not show canonical
before/after truth is insufficient for an independently required function, because
retained member-reference identity has not been shown to be one.

**Rule 0n applies to six-day-old code.** Current-frontier continuity is exactly as
non-semantic as v14 continuity. Observing `SubjectId` behaviour does not earn
`SubjectId`.

### Corrected record

```text
CURRENT SUBJECT-GENERATION DISTINCTION          MEASURED
VALUE-ONLY KEY-CACHED NULL                      REFUTED for reproducing it
SUBJECT-LIFETIME IDENTITY AS A V15 REQUIREMENT  UNPROVEN
```

### Also retracted: coverage-versus-participant

The corrections entry said _"coverage-versus-participant is a distinction a value
diff cannot express."_ Representationally true; **semantically unproven.** The
`subjectPositions` docblock describes how the incumbent causal model works. Before
it carries survival weight:

```text
What breaks if every piece of state needed for reconstruction is simply part of
the retained reversal representation?
Why must SignalTree distinguish a causal PARTICIPANT from a reconstruction
PAYLOAD PROVIDER?
```

There may be a good answer about authorship and undo eligibility. The docblock
cannot supply it.

### The order that must come first

Not _"does identity live in the effect log or beside snapshots"_ — that already
assumes identity survived.

```text
FUNCTION       must a member have a semantic lifetime distinct from its key/value?
     |
   if YES
     v
MINIMUM        what identity PROPERTY is required?
     |
     v
CARRIER        what representation should hold it?
```

Candidate carriers, none earned by observation: `SubjectId`, a per-key generation
counter, an opaque membership token, a handle-bound lifetime token, compiled slot
plus incarnation.

### E2-S0 — the derivation that must run

```text
CONTRACT A   handles are MEMBERSHIP-LIFETIME references
             old handle can revive on undo; key reuse must never alias

CONTRACT B   handles are OBSERVATIONS OF CURRENT KEYED MEMBERSHIP
             removal permanently invalidates; undo requires reacquisition

QUESTION     what user or kernel capability exists under A that becomes
             IMPOSSIBLE under B?
```

If A independently wins, E2-S becomes excellent supporting evidence. If B
suffices, the revival behaviour is incumbent semantics and the
`SubjectId`/reclamation structure may still disappear.

## E2-S0 — IDENTITY IS REQUIRED. Subject LIFETIME is not. A per-key generation suffices.

Evidence: `e2s0-identity-function.spec.ts`, 5 rows. The function derived from zero
before any representation was considered.

**Three contracts, not two** — and E2-S's null silently implemented the third:

```text
A    handles are MEMBERSHIP-LIFETIME references — revive on undo, never alias
B    handles OBSERVE CURRENT KEYED MEMBERSHIP, WITH invalidation — removal
     permanently invalidates, undo requires reacquisition
B'   the same WITHOUT invalidation — handles silently re-point to whatever
     occupies the key
```

### Q1 — B′ is HARMFUL

```text
hold byId('tmp-1') @ 111 · remove · a different member takes 'tmp-1' @ 999
held reads 999
```

Not stale — **wrong**. Another member's data, no error, no signal. And key reuse is
not hypothetical: `80f41e94`'s own docblock worries about _"a future addOne of the
retired id"_, and optimistic temp-id creation produces exactly this cycle.

### Q2 — B is NOT identity-free either, and the minimum is a GENERATION

```text
remove 'a' then re-add {id:'a', n:1}
JSON of the two occupancies is IDENTICAL
-> no value-only rule can decide a handle from the first must not read the second
```

**So some identity beyond key+value IS REQUIRED.** This is the first thing in this
derivation earned as a _function_ rather than observed as behaviour.

Its minimum, built in ordinary code — a `Map`, a counter, and one revision signal:

```text
add / remove bump the key's generation
a handle binds (key, generation) at acquisition
read = generation matches ? find(key) : undefined

hold @111 · remove -> undefined · reuse @999 -> STILL undefined · fresh handle -> 999
```

No `SubjectId`, no reclamation coordinator, no effect log.

### Q3 — nothing requires REVIVAL over reacquisition

```text
ordinary Angular shape: a parent derives from a key it holds, children get VALUES
  add a,b · derive selected from selectedId · remove 'a' -> undefined
  restore the membership snapshot          -> selected reads 1 AUTOMATICALLY
```

The derived projection reacquires by itself, because it re-derives from the key on
every read. And the only consumer revival serves — one that _captured_ a handle —
carries its own key and can always reacquire:

```text
captured.read() after restore   -> undefined (by design under B)
byId(captured.key).read()       -> 1
```

**Contract B costs a reacquisition. It does not cost a capability.**

### Result

```text
IDENTITY BEYOND VALUES                       REQUIRED — earned as a function
MINIMUM PROPERTY                             a per-key GENERATION
SUBJECT-LIFETIME IDENTITY                    NOT EARNED
RECLAMATION COORDINATION                     NOT EARNED
REVIVAL-ON-UNDO                              NOT EARNED — no capability found
`SubjectId` AS THE CARRIER                   NOT EARNED — a counter suffices
```

**Not established:** that revival is worthless. It may be better DX, and a consumer
that _cannot_ know its key would need it — no such consumer has been demonstrated.

### Two null-construction findings, both Angular idiom

Both caught by measurement, both would have silently corrupted the result:

```text
1  A generation check that SHORT-CIRCUITS before reading the tracked signal drops
   the dependency. The projection returned `undefined` without reading rows, so it
   never re-evaluated after a restore — while a freshly acquired handle read the
   row correctly.

2  Returning a `computed` from a function called INSIDE another computed breaks
   propagation. `byId()` runs during the outer evaluation, so the inner computed
   was recreated every pass and the outer projection stopped invalidating. Fixed
   by making the handle's `read` a PLAIN FUNCTION and letting callers memoise at
   their own level.
```

Third and fourth time a null has had a subtle flaw. Every one was found by running
it rather than reading it.

## E2-S0 DOWNGRADED again — a LAYER LEAK, plus three overclaims. E2-S00 runs framework-neutral.

### The layer leak — the most important correction

E2-S0 built its candidate semantics out of `signal` and `computed`, then reported
two findings about Angular construction lifetimes **inside the architectural
record**. That is a boundary violation, not a kernel result.

```text
KERNEL                                FRAMEWORK REALIZATION
  membership                            Angular Signal
  address / key                          computed()
  incarnation, IF required               dependency tracking
  read semantics                         template observation
  invalidation semantics
```

The rule already on the books is _neutralize dependency, don't genericize
Angular._ The subtler version of the mistake was using Angular to **prove the
null**, so Angular behaviour became semantic evidence.

**Demoted to test-infrastructure evidence, carrying no architectural weight:**

```text
- a generation check that short-circuits before reading a tracked signal drops the
  dependency
- returning a `computed` from a function called inside another computed did not
  propagate invalidation IN THAT CONSTRUCTION
```

The second is explicitly **not** generalized: Angular plainly permits a computed
to depend on a computed. What failed was one ephemeral construction and its
lifetime. `e2s0-identity-function.spec.ts` is relabelled ANGULAR REALIZATION
EVIDENCE; the semantic derivation moved to
`e2s00-member-access.kernel.spec.ts`, which imports no framework at all.

### Three overclaims corrected

**1. "Identity beyond values is REQUIRED" -> CONDITIONAL.** Q1's "wrong-row read"
presupposes that `lookup(k)` means _"the member that occupied k when I acquired
this."_ Under a keyed-address reading, `held -> 999` is exactly correct. The
antecedent was never derived.

```text
IF a captured handle must stay bound to the incarnation it came from,
THEN key+value are insufficient after key reuse, and a generation/incarnation
     token is ONE sufficient answer.
```

**2. "Per-key generation is the MINIMUM" -> sufficient-in-model, not minimal.**
Rivals: a global monotonic incarnation token, an opaque occupant token, slot plus
incarnation. A global token may be _smaller_ — the per-key map retains an entry for
every key ever seen, **which is itself lifetime pressure**, so
_"reclamation coordination is not earned"_ was premature too.

**3. Q3 restated negatively.** Not _"nothing requires revival"_ but _"no capability
requiring revival was found in the exercised consumer shapes."_ And _"a captured
handle carries its own key"_ is itself an API design choice — a handle need not
expose its key, and there need not be a handle object at all.

## E2-S00 — MEMBER ACCESS, derived framework-neutral

Evidence: `e2s00-member-access.kernel.spec.ts`, 8 rows, **zero framework
imports**. A plain holder; no reactivity, no signals, no dependency graph.

```text
ADDRESS      lookup(k) resolves the CURRENT OCCUPANT of k. Reuse retargets.
REFERENCE    an acquired handle stays bound to ONE incarnation.
EPHEMERAL    resolve now; no retained-reference contract at all.

ONLY QUESTION: what becomes IMPOSSIBLE under ADDRESS or EPHEMERAL?
```

```text
keyed observation      expressible — including retarget-on-reuse, which is
                       CORRECT under ADDRESS, not aliasing
selection              expressible — a dangling key is resolved like any
                       foreign key
callback by key         expressible — resolves at invocation
deferred completion    expressible, and this is the ONLY shape where
                       retargeting is observable
```

### The deferred completion, and why it does not earn identity

```text
save('tmp-1') starts · key retired · a DIFFERENT member takes 'tmp-1'
completion lands -> { id:'tmp-1', n:999, saved:true }      wrong DOMAIN outcome
```

But staleness is **detectable with no identity mechanism at all**: canonical
members are immutable, so a re-added member is a different object and a reference
compare distinguishes them.

```text
captured = at('tmp-1') · save(k, captured) · reuse intervenes
  -> 'STALE', and the new occupant is untouched
CONTROL, nothing intervenes -> 'APPLIED'
```

Retained membership identity would make that _more convenient_. It does not make
it **possible**.

### Result

```text
no exercised shape becomes IMPOSSIBLE under ADDRESS semantics

NOT EXERCISED, therefore NOT CLEARED
  transaction / undo interaction
  persistence
  a consumer holding a reference it CANNOT re-resolve because it never had the key

-> E2-S0's antecedent remains UNPROVEN, and with it the requirement for identity
   beyond values.
```

**Architectural note.** If a stable membership reference ever earns itself, it need
not be the lookup. Address-based observation and identity-bearing reference are
**separable APIs**, and keeping them separate stops a lookup from carrying a
subject-lifetime ontology it never needed — which is the north-star position that
address and identity are different questions.

## E2-S00-D — the address null had a HIDDEN IDENTITY MECHANISM. Overclaim withdrawn.

Evidence: `e2s00-member-access.kernel.spec.ts`, now 12 rows, still **zero
framework imports**.

### The hidden mechanism

```ts
const captured = c.at('tmp-1');
if (c.at(k) !== captured) return 'STALE'; // <- JAVASCRIPT OBJECT IDENTITY
```

So E2-S00 did not show _"address + values suffice."_ It showed _"address +
retained object-reference identity suffices for that particular sequence."_

### And the guard cannot make the distinction it needs

`patch` is immutable, so an ordinary update replaces the object too:

```text
SAME member, new value      k {n:111} -> patch {n:112}, membership untouched
                            guard -> STALE
DIFFERENT member, key reused k {n:111} -> remove -> add {n:999}
                            guard -> STALE

INDISTINGUISHABLE
```

### Contract A is not merely conservative — it is BROKEN for an ordinary workflow

Measured over three edits, each re-invalidating the in-flight attempt:

```text
verdicts = ['STALE', 'STALE', 'STALE']
```

A save on a row the user keeps editing **never lands**, though nothing was ever
removed or reused.

### WITHDRAWN

```text
"Retained identity would make that MORE CONVENIENT, not POSSIBLE."
```

If the required function is Contract B, address + value + object-reference
comparison **cannot** supply it.

```text
CONTRACT A   invalidated by ANY intervening value change
             object-reference or version observation suffices
             COST: save-while-editing never completes

CONTRACT B   follows the same membership across ordinary value evolution, but
             REJECTS a key reused by a different member
             COST: requires distinguishing evolution from replacement — a
             membership-INCARNATION property, i.e. IDENTITY
```

**Which contract is required is not decided here.** Two escape routes would keep
identity unearned, and both are application choices rather than measurements:

```text
- keys that are NEVER REUSED (uuid temp ids rather than recycled ones) make the
  replacement case unreachable, and ADDRESS is then safe
- a domain-level version or server id lets the APPLICATION distinguish evolution
  from replacement in its own data
```

## THREE KINDS OF NEUTRALITY — they are not the same guard

Another overclaim, withdrawn: _"the framework-neutral version is the first one
that couldn't encode incumbent semantics, because it had no incumbent primitives
to borrow from."_ Framework neutrality prevents **Angular** contamination. It does
not prevent incumbent or unexamined assumptions.

```text
framework-neutral   =/=   legacy-neutral   =/=   assumption-neutral
```

The "neutral" spec still imports assumptions, none of them yet earned:

```text
canonical members are IMMUTABLE
key reuse MATTERS
deferred work SHOULD detect replacement
a lookup can sensibly be ADDRESS-based
```

Each needs its own guard. Framework neutrality was necessary and is not
sufficient.

### Checkpoint

```text
ADDRESS / EPHEMERAL semantics
  keyed lookup                                   works
  selection                                      works
  callback-by-key                                works
deferred work across reuse
  ADDRESS blindly retargets                      MEASURED
  object-ref guard prevents that case            MEASURED
  guard distinguishes evolution from reuse       REFUTED
contract A's cost (save-while-editing fails)     MEASURED
stable membership-reference function             STILL UNPROVEN
identity requirement                             STILL CONDITIONAL
Angular dependency findings                      REALIZATION ONLY
```

Nothing here reopens `SubjectId` or the effect log. Nothing here closes identity
either.

## GATE 1 — FIRST APPLICATION. NULL CONSTRUCTION FORBIDDEN.

Two independent premise reviewers, differentiated packets, no repository access,
no author rationale, no loaded vocabulary. The row was worded one level above the
incumbent's field:

> _"At the moment a previously recorded operation is reverted, the system requires
> information that cannot be reconstructed from the canonical values recorded
> before and after that operation."_ — CANDIDATE, UNPROVEN

```text
REVIEWER A  (function killer)     VERDICT: FUNCTION SURVIVAL NOT ESTABLISHED
REVIEWER B  (absence architect)   VERDICT: A COHERENT ABSENCE ARCHITECTURE EXISTS
```

**Gate disposition: NULL CONSTRUCTION FORBIDDEN for this row as worded.**

### A's blockers

```text
F1  no third category exists. Anything observable through the read channel is a
    value at a position, so it is already in the before/after pair; anything not
    observable is outside what revert owes. The candidate needs something INSIDE
    the revert obligation but OUTSIDE the state representation. The premises
    admit no such thing.                                        BLOCKS-CLOSE

F2  the candidate contradicts the revert success criterion itself — restoring the
    before-values of all touched positions reaches the target configuration BY
    DEFINITION. Self-defeating, not merely unproven.             BLOCKS-CLOSE

F3  truth value flips on the undefined granularity of "operation". If it means
    the group, false. If it means a single write, trivially true and establishes
    only that the record has SHAPE. The interesting claim survives neither.
                                                                 BLOCKS-CLOSE

F4  the reconstruction budget was set at one operation's value pair, when a
    revert legitimately has the whole record, the exclusion policy, the group
    structure and current state.                                 MAJOR / FROZEN
```

And the disqualifier: **nothing was named that becomes impossible.** A's phrasing
is worth keeping — _"a survival claim that cannot name its own casualty has not
earned a row."_

### B's absence architecture, and the two contracts it costs

B built a working world without the function: a paired-projection journal
recording `(beforeRoot, afterRoot)` projected onto the tracked region, with
revert applying the **structural diff** of the two projections to current state.

```text
recorded unit is COARSE (the whole group's root pair)
applied unit is MINIMAL (the leaf-granularity diff)
```

That plank is what makes nested writes safe without clobbering untouched
siblings — and it is free under immutability.

It is closed only if two things are canonical VALUES rather than derived state:

```text
B7  (i) enumeration order, as an explicit key sequence
    (ii) member identity, as the key itself
    Both are state-container contracts, cheap to state, testable.
```

### THE CONVERGENCE — and the falsifier that was owed for six rounds

Independently, with no shared context, both reviewers landed on the same two
things:

```text
A F7 / B B3   the key-collision case requires OUT-OF-ORDER revert, which the
              premises never granted. Under strict reverse order the intervening
              add reverts first and no collision arises. Importing selective
              revert and then blaming the record is circular.

A F8 / B B8   reference continuity is a contract about ADDRESSING STABILITY, not
              information. Addresses are a static function of keys.
```

**B8 states the three-part falsifier the identity question has needed all along:**

```text
Exhibit ONE required capability satisfying ALL THREE:
  1  a consumer legitimately holds a per-member reference across a
     remove -> revert boundary
  2  the reference CANNOT be re-obtained by key after the revert
  3  the thing it references CANNOT be reconstructed as a pure function of the
     restored canonical value

Satisfying only (1) and (2) shows a DERIVED-LAYER defect — the handle should have
been key-addressed and memoized — and does NOT establish the candidate.
Satisfying (3) as well establishes it.
```

That criterion retroactively explains the whole preceding error run: **every prior
row reached (1) and (2) at most, and none ever tested (3).**

### Scope of the refutation, stated as B stated it

The candidate is not refuted in general. It is refuted **relative to these
premises**, and becomes true the moment a member carries identity or lifetime that
is not a canonical value. That is the row to run next — worded to B8's three
parts, not to the incumbent's fields.

### Cost

```text
two reviewers · ~45k subagent tokens · ~5 minutes wall clock
outcome: one experiment stopped before construction, one contradiction found in
         already-committed work, and a precise falsifier supplied for a question
         that had survived six rounds of self-review
```

### GATE 1 — FOUR WORDING CORRECTIONS before anything builds on it

**1. A's F1 is premise-relative, not a general theorem.** _"Anything observable is
a value at a position"_ is too broad for the constitution — temporal events,
authorship, ordering, lifecycle can all be observable without reducing to a
current value pair. What survives is narrower:

```text
Given the CURRENTLY EARNED revert contract, no additional observable obligation
beyond canonical restoration has been NAMED.
```

_"All observability is state"_ does not enter the constitution.

**2. B's architecture is an EQUIVALENCE WITNESS, not a destination.** The
coarse-pair + leaf-diff design shows the candidate function is not necessary under
these premises. It does **not** earn snapshot history, tree diffing, its
performance profile, or any particular representation.

**3. B8 IS FOUR PARTS, NOT THREE.** Three parts prove that _some_ information
exists outside canonical truth — which could then be converted accidentally into a
SignalTree-owned identity function. The ownership audit has to come before
representation, again:

```text
B8+ — exhibit a capability where ALL FOUR hold:

  1  a consumer must retain a per-member reference across remove -> revert
  2  it cannot reacquire by surviving address/key
  3  it cannot reconstruct the required referent from restored canonical truth
  4  preserving that continuity is a SIGNALTREE/KERNEL responsibility — not
     application, adapter, or consumer-owned state

All four are required before membership-lifetime identity survives.
(1)+(2) alone = a derived-layer defect. (1)+(2)+(3) alone = information exists
somewhere, owner unproven.
```

**4. The ordering convergence must not re-earn intrinsic ordering.** Clean
statement:

```text
Where deterministic enumeration order is required, an explicit canonical KEY
SEQUENCE can represent it. No intrinsic subject-order mechanism is thereby earned.
```

### E2-S2 — EVIDENTIARY RECLASSIFICATION, applied

```text
ARCHITECTURAL FALSIFIER    WITHDRAWN
WHY                        relies on out-of-order / arbitrary restoration that the
                           confirmed-undo contract does not grant. Its "null"
                           row performs `rows.set([...])` — an arbitrary write,
                           not a revert.
REMAINS AS                 implementation characterization / model test
DOES NOT ESTABLISH         any identity requirement for confirmed LIFO reversal
```

Applied in the spec file itself, not merely noted here — otherwise the corpse
stays searchable and contaminates the next row.

### Premise-relativity of the continuity convergence

_"Reference continuity is addressing stability, not information"_ is held
**premise-relative**. The next row is precisely where it can be falsified: if
something associated with a membership lifetime cannot be recovered from canonical
truth or address AND the kernel must preserve it, continuity begins carrying
semantic information.

### GATE 1 IS FROZEN

One successful use is not grounds for tuning it. It changes only on a
**deterministic failure** — a case where the gate admits an inadmissible
experiment, or blocks an admissible one, demonstrated rather than argued.

### The result that was missing from this process

```text
"NO EXPERIMENT" IS ITSELF A SUCCESSFUL ARCHITECTURAL RESULT.
```

A row that ends in NULL CONSTRUCTION FORBIDDEN has produced evidence: that the
contract was never earned. Before Gate 1 there was no way for the process to
return that outcome, so every row terminated in a measurement — which is why
unearned contracts kept becoming experiments.

## GATE 1 — SECOND APPLICATION. Continuation row CLOSED, no experiment.

```text
ROW      pre-obtained member-observation continuity across remove -> confirmed
         reversal

A (function killer)     FUNCTION SURVIVAL NOT ESTABLISHED
B (absence architect)   A COHERENT ABSENCE ARCHITECTURE EXISTS

SURVIVAL          NOT ESTABLISHED
BLOCKER           no independently surviving workflow becomes impossible under
                  address-resolved present / absent / restored observation
OPPOSITE CONTRACT COHERENT
NULL              FORBIDDEN
```

### The durable result, and it is small

A's F1 is the clean one: the premises carry you all the way to _"the restored
member is observable again"_ and stop. Nothing carries you to _"the observation
obtained before the removal must still designate it."_ That gap is the missing
function.

B exhibited the coherent absence: observe key k, get the value while present,
absence while removed, the restored value after reversal. No continuity object
required.

And A's F6 caught contamination in my own wording — _"that member"_ presupposes
cross-gap sameness, while _"the surviving key"_ simultaneously hands the opposing
architecture enough address information to reacquire. The criterion conceded the
point it was testing.

**That is sufficient to close the row. It sentences the CANDIDATE, not every
conceivable future identity function.**

### DO NOT INFER — the reviewers overreached in three places

Antagonistic review can manufacture negative architecture exactly as self-review
manufactured positive architecture. Refuting implementations nobody has justified
is the same error with the sign flipped.

```text
NOT ESTABLISHED, and NOT to be recorded as theorems:

"parts 3 and 4 are mutually exclusive"
  -> OVERREACH. It reads P1 as "SignalTree owns canonical values AND MAY OWN
     NOTHING ELSE". Those are not equivalent. Kernel REALIZATION METADATA is not
     canonical application truth — turn ids, revisions, physical slots, retained
     history are all categories a kernel could legitimately own without their
     being canonical user values.
  CORRECTED: part 3 does not ESTABLISH part 4. If required information is absent
     from canonical truth, an INDEPENDENT OWNERSHIP ARGUMENT is required before
     assigning custody to SignalTree. No such argument exists in P1-P6.

"a partial observer contradicts P2"
  -> OVERREACH. P2 makes absence representable in CANONICAL STATE; it does not
     require every observation API to be total. `valid | suspended | invalidated`
     is coherent. It simply has no EARNED REASON to exist, which is all the gate
     needs.

"value-bound observation creates two authorities"
  -> OVERREACH. It assumes a value-bound observation must keep returning the
     removed value. It could behave value -> unavailable -> value with no dual
     authority. Again: unearned, not impossible.

ALSO NOT INFERRED
  all observation is canonical state
  the kernel can never own non-canonical metadata
  identity can never survive
```

### P6, phrased safely

```text
Confirmed reversal currently grants LIFO undo / redo.
Selective or arbitrary earlier-turn reversal is NOT GRANTED.

USABLE RULE: a row may not REQUIRE selective or out-of-order reversal unless that
function independently earns itself.
```

That is enough to invalidate E2-S2 without freezing "LIFO forever" as a permanent
prohibition.

### E2-S2 — architectural weight WITHDRAWN

Its supposed null performed an **arbitrary write** (`rows.set([...])`) rather than
the granted reversal operation. A collision requiring a state transition that
cannot arise under granted LIFO reversal means the row was never testing the
claimed mechanism. Retained as characterization; carries no architectural weight.

### B8+ HAS REACHED THE END OF ITS USEFULNESS

The four-part criterion was a useful adversarial probe and is now becoming
representation-shaped — _"cannot reconstruct referent"_, _"non-canonical
information"_, _"container custody"_. The upstream result is the one that matters
and it is simpler:

```text
No independently surviving workflow requiring pre-obtained continuity has been
NAMED.
```

Stop there. **No B9.** Proving the absence harder is not the same as learning
something.

### One argument worth keeping, because it cuts the other way

B's F5, on an operation begun before the removal and completing after the
reversal: a surviving handle _"resolves silently and conceals that the
configuration moved under the operation"_ — the "undo got undone" defect. Absence
surfaces the conflict; continuity hides it.

Recorded as an observation about that scenario. **Not** as a theorem that
continuity is always harmful.

### NEXT — nothing for this function

```text
NOT ESTABLISHED -> NOTHING -> close the row.
```

**No product decision is owed.** Asking "does SignalTree want to claim the missing
premise?" converts NOT ESTABLISHED into _would we LIKE this?_, which is
resurrection by another route. If persistence, transactions, an adapter, or a
demonstrated consumer later produces a capability that genuinely requires
cross-removal continuity, **that function reopens the question from zero.**

The row ends without an experiment AND without a replacement question. That is
subtraction discipline operating before implementation instead of after it.

### A principle worth preserving, restated

```text
A row SUCCEEDS when it reaches the correct epistemic disposition.
"UNPROVEN / no experiment permitted" is a valid successful closure.
```

Not "no experiment is a result" — that invites the reading that running something
is the default requirement.

## UNDO-E4-G — GROUP CONCEALMENT / CONCLUSION. Closed per GATE 2's scope limit.

> **This entry is bounded by Gate 2.** An interpretation reviewer saw the
> pre-registration and the raw reviewer output WITHOUT the author's synthesis, and
> ruled that a closure of this row may state **only**: the four sub-claim verdicts,
> two premise-reading notes, and the unmet falsifier. Nothing else. Two earlier
> syntheses exceeded that; this one does not.

### The four verdicts

```text
C1  pre-conclusion visibility governance      NOT ESTABLISHED
C2  conclude never-visible                    NOT ESTABLISHED
C3  conclude by un-observing                   NOT ESTABLISHED
C4  runtime nested-group semantics             NOT ESTABLISHED
NULL                                           FORBIDDEN
```

C1 asserts a **mechanism** (container-governed withholding) in place of the
requirement it serves ("no observer sees a partial group"). C2 and C3 terminate at
the same canonical configuration as write-then-revert-as-one-step, leaving a
record-content residue: a cancelled group would linger as redoable. C4 as worded is
permission-shaped and asserts no requirement.

### The two premise-reading notes

```text
P4 grants exclusion from the REVERTIBLE RECORD only, NOT invisibility. Excluded
   positions remain readable positions.

P6 (LIFO only) is in TENSION with asynchronous speculation resolved out of order.
   FLAGGED OPEN — not resolved, and NOT derived.
```

### The unmet falsifier — SPECIFIED, NOT EXERCISED

```text
i    a consumer reachable ONLY through the canonical read path, not through a value
ii   the speculative value required AT the canonical address
iii  the accept/decline decision ASYNCHRONOUS

All three at once. It was never instantiated.
```

### LADDER POSITION — NO RUNG ENTERED

```text
Rung 1  MEASURED CURRENT BEHAVIOUR        NOT ENTERED
Rung 2  ALTERNATIVE MODEL COMPARISON      NOT ENTERED
Rungs 3-5                                 UNTOUCHED

ANALYTICAL ABSENCE WITNESS   PRESENT — but OUTSIDE the evidence ladder entirely
CANDIDATE ADVANCEMENT        ZERO
```

**"Rung 2 at best, on borrowed footing" is WITHDRAWN.** If rung 1 is absent then
rung 2 has not been reached: an analytical equivalence witness cannot occupy the
"alternative model reproduces MEASURED behaviour" rung when there is no measured
behaviour to reproduce. Allowing a borrowed rung would make it an escape hatch
around the no-skipping rule installed one commit earlier.

### CONVERGENCE IS NOT CORROBORATION

An earlier synthesis called the A/B agreement _"unusually strong evidence because
opposite jobs independently expose the same missing premise."_ **Withdrawn.**

```text
A and B were given the SAME FROZEN PREMISES. Their agreement is PREMISE-CORRELATED,
not independent empirical corroboration.
```

Opposite _jobs_ is not opposite _information_. This is the second time the value of
withholding context was overstated by treating role-difference as independence.

### THE STRONGEST ALTERNATIVE INTERPRETATION — recorded because it may be right

> **The row did not fail the candidate; it failed the premise set.**

Every rebuttal to C1 — write once at the end, compute-then-write, write at a common
ancestor, redirect readers to a derived view — depends on **the composer being able
to restructure the writers.** No frozen premise grants that. Both reviewers then
land on the identical decisive configuration, and neither showed it impossible or
excluded; it was simply never instantiated. Meanwhile both concede the underlying
requirement is real: torn observation is the candidate's strongest foothold, and it
generates _"no observer sees a partial group"_.

```text
C1   NOT ESTABLISHED · NOT REFUTED · UNDERDETERMINED BY CURRENT PREMISES
```

**MISSING FACTS ARE NOT AUTOMATICALLY MISSING REQUIREMENTS.** It may be exactly
correct for the premises to remain silent, because C1's function does not
independently arise.

So the phrase _"the row failed the premise set"_ is WITHDRAWN — it reads as though
the frozen premises are deficient and need expanding. Nothing has shown that. The
accurate statement is **the current premises do not determine the candidate.**

And _"the entitled next move is a re-run request"_ is WITHDRAWN as too permissive.
Going and fixing the missing premises so C1 becomes testable would MANUFACTURE
them. Each is itself a candidate fact, and two are potentially major architectural
functions in their own right:

```text
"reads may interleave with a multi-write operation"
    -> may be true, false, framework-owned, or irrelevant
"the container must support independently authored writers that cannot be
 restructured"
    -> a candidate FUNCTION. It cannot be adopted because adopting it makes C1
       testable.
```

**CORRECT TRANSITION — close, with a condition, not a queue:**

```text
UNDO-E4-G   UNDERDETERMINED under current premises  ->  CLOSE THE ROW

PARKED REOPENING CONDITION
  If an independently derived workflow later establishes any of
    - interleaved observation
    - container-only independently authored writers
    - the three-part captive-read-path conjunction
  then C1 reopens FROM ZERO.

The three-part falsifier is a REOPENING CONDITION, not a work queue.
```

**And the overlay benchmark is NOT OWED.** Measuring the cost of an architecture
that has earned no standing would give the absence witness architectural gravity
purely through sunk effort. It becomes owed only if a later surviving function
produces an actual decision between two representations.

### OVERCLAIMS EXPLICITLY FORBIDDEN on this row

```text
"C1-C4 are refuted / incoherent / impossible"   A says the opposite: interleaved
     observation is "a plausible model — merely absent"; retraction after
     publication is "coherent and merely indistinguishable"
"the observation model is settled"               open in BOTH directions
"no workflow needs C1"                          only that none was NAMED; no search
                                                was performed
"grouping is ONLY about reversal granularity"    established as SPECIFIABLE that
                                                way, not as SUFFICIENT
"P4 handles cancellation"                        only record traces; says nothing
                                                about observability
"nesting adds nothing"                           independent inner abort while the
                                                outer continues is a conceded,
                                                unmeasured expressiveness loss
"the falsifier was tested"                       specified, not exercised
"dispensable, therefore remove it"               dispensability-in-principle is not
                                                a decision
"P6 is wrong / selective reversion licensed"     both reviewers decline this
```

### SCOPE — what this row does NOT close

**UNDO-E4 (transaction semantics at U5b) remains OPEN.** Atomicity as a general
property, refusal/failure handling, persistence consequences, authorship and
pending rollback appear nowhere in the pre-registered question; neither reviewer was
tasked on them and neither produced evidence about them.

### METHODOLOGY — Gate 2 paid for itself on first use

```text
GATE 1  ran twice, worked both times
GATE 2  first run — and it caught, from raw output alone:
          the absent rung 1 / zero rungs advanced
          convergence-as-corroboration  (an author claim, twice made)
          the P6 tension recorded as DERIVED when it is FLAGGED OPEN
          the falsifier readable as tested when it was never run
          the under-determined-vs-unearned reframe
```

Two of those had already survived an external review of the corrected write-up.
A gate reading raw evidence without the synthesis saw things a reader of the
synthesis did not.

**Stated at the right strength: Gate 2 DEMONSTRATED VALUE ON ITS FIRST
APPLICATION.** One successful comparison justifies keeping it, given the low
downside. It does NOT establish a general measured error-reduction rate — that
would be a claim from a single trial.

## ROW NAMING KEY — three distinct E-series collide. Always qualify.

A bare `E2` / `E3` / `E4` is **ambiguous across three unrelated series** in this
ledger. This is a live contamination hazard: conflating rows is how an unearned
conclusion from one series gets inherited by another. **Qualify every reference.**

```text
SERIES 1 — EXTENSION / DECLARATION inventory   (RFC 0016, the E1-E7 table)
  E1  inline authoring                      E5  compiler integration
  E2  type transformation                   E6  representation participation
  E3  writable state through the tree        E7  package encapsulation
  E3b canonical SignalTree truth
  E4  derived / public surface contribution
  QUALIFY AS: EXT-E1 .. EXT-E7

SERIES 2 — FRONTIER UNDO derivation
  E2  precision                E3  scoped undo (survival not yet asked)
  E4  transaction semantics at U5b  — STILL OPEN
  E2-S / E2-S0 / E2-S00 / E2-C   identity + member-access sub-rows
  E2-B                            falsifiers of E2's own null
  E4-G                            group concealment / conclusion  — CLOSED
  QUALIFY AS: UNDO-E2 .. UNDO-E4, and UNDO-E4-G

SERIES 3 — DERIVATION E, collections
  E-ORD · E-REKEY · E-TAP · E-INT · E5-fork · E-granularity · E-membership
  (already prefixed — no collision)
```

### Known conflations to guard against

```text
"E4 survives"        EXT-E4 (derived/public surface) was measured YES.
                     UNDO-E4 (transaction semantics) is OPEN and untested.
                     These are unrelated. A bare "E4 survives" is unusable.

"E2 precision"       UNDO-E2. NOT EXT-E2 (type transformation), which is MOOT for
                     an unrelated reason.

"E3"                 EXT-E3 measured YES (writable state). UNDO-E3 (scoped undo)
                     has not even had its survival question asked.
```

**Rule:** a row reference in any commit message, spec docblock or ledger entry
must carry its series prefix, or name the row in words. Bare letters-plus-digits
are forbidden.

## UNDO-E3 — PARTIAL / SELECTIVE REVERSAL

```text
SURVIVAL      NOT GRANTED
WHY           no independently required workflow has been demonstrated that
              becomes impossible under whole-step LIFO reversal plus ordinary
              forward correction
NOT REFUTED   partial reversal may be useful under contracts not currently earned
NULL          FORBIDDEN
NEXT          NOTHING for UNDO-E3
MEASUREMENT   NONE REQUIRED for this closure
```

### The absence witness is CONDITIONAL and INCOMPLETE

Forward correction requires knowing the target value, and **no historical-value
access contract is granted.**

**P3 does NOT imply readable historical values.** The absence architect claimed a
boundary-read accessor is _"not a new mechanism — P3 cannot be satisfied without
retaining prior configurations, so the data already exists."_ That does not follow.
P3 requires the ability to REALIZE a previous configuration. An implementation
could satisfy it with:

```text
inverse operations · compressed deltas · opaque restore tokens
persistent structural nodes · checkpoint plus replay information
```

none of which exposes arbitrary historical position values to callers. So a
boundary read is a **NEW INFORMATION SURFACE**, not an accessor over something P3
makes semantically available.

```text
CONSEQUENCE  the forward-write absence witness is INCOMPLETE unless target-value
             acquisition is independently solved.
             This WEAKENS the witness. It does NOT strengthen partial reversal.
```

### PARKED REOPENING CONDITIONS — conditions, not queues

```text
MULTI-CONTRIBUTOR CASE
  If independent derivation later establishes multi-author confirmed history with
  a requirement to withdraw one author's contribution while another survives,
  reopen UNDO-E3.
  NOT A ROW OWED NOW. No provenance row is owed merely because partial reversal
  would become interesting if provenance existed.

REVERSAL-OWNED PROPERTY NOT REACHABLE BY ORDINARY WRITES
  If an independently derived function later establishes a property that
    - cannot be reconstructed or written through ordinary canonical writes, AND
    - must participate in confirmed reversal, AND
    - must sometimes be reversed independently of the rest of its step,
  then reopen partial reversal FROM ZERO.
  NOT A REPO SEARCH OWED NOW.
```

### WITHDRAWN — two claims from the interpretation review itself

**1. "One non-writable restorable position makes the candidate NECESSARY."** It
does not. Finding opaque kernel bookkeeping `X` in the record establishes only:

```text
CURRENT IMPLEMENTATION  reversal can restore information unavailable to
                        application writes
```

To reach a required function you would need all five of:

```text
1  X is independently required
2  X must be reversible
3  X participates in a coarse confirmed step
4  a legitimate workflow requires reversing X or a subset while PRESERVING another
   contribution from that same step
5  whole-step LIFO plus forward correction cannot satisfy that workflow
```

Without all five it is characterization of the incumbent. **And if `X` is
kernel-private and deliberately unwritable, that may argue AGAINST exposing partial
reversal of it.**

Searching the implementation hoping to find such a property is **forbidden** — that
is letting the incumbent manufacture the requirement again.

**2. "Convergent independent invention is evidence the NEED is real."** Withdrawn —
it contradicts the same review's own finding that A/B agreement is not independent
corroboration, since they shared premises and instructions. Both cannot carry
weight.

```text
MAXIMUM SUPPORTED STATEMENT
  evidence that the proposed forward-write equivalence has an UNPROVEN
  VALUE-RECOVERY PRECONDITION
```

A workflow might already know the intended correction; it might be computed from
domain state; or selective correction may never independently arise.

**3. "The refusal is provisional against measurement."** Withdrawn. Measurement of
_what_? Measuring the current repository yields incumbent behaviour, which cannot
by itself advance `FUNCTION REQUIRED`. Correct form:

```text
NOT GRANTED UNDER CURRENTLY EARNED CONTRACTS.
Reopens only if NEW INDEPENDENT SEMANTIC EVIDENCE establishes the function.
An implementation measurement may SUPPORT such a derivation later; it cannot
SUBSTITUTE for one.
```

Otherwise the process starts believing enough repo archaeology can overturn a
zero-state survival failure.

### META — GATE 2 NEEDS THE SAME SUBTRACTION DISCIPLINE

The interpretation reviewer correctly detected underdetermination, then converted
its own strongest alternative into _"two obligations follow"_ — including a
_"cheap check"_ to run. That is precisely the transition forbidden one commit
earlier: **a falsifier produced by a closed row is a reopening condition, never a
queue.**

```text
NEW HARD RULE

Gate 2 may produce REOPENING CONDITIONS. It may NOT create follow-up work whose
only purpose is to make a CLOSED CANDIDATE DECIDABLE.

A gate is not exempt from the rules it enforces.
```

## UNDO-E4 / U5b — PREREGISTERED AS A FAMILY

> **⚠️ HISTORICAL PREREGISTRATION — SUPERSEDED IN PART. Do not read the sub-row
> statuses below as current.** This section records the family as it was
> preregistered. **U5b-A has since reached a TERMINAL disposition of
> UNDERDETERMINED** — see
> [U5b-A — ONE COHERENT CANONICAL TRANSITION: UNDERDETERMINED. Terminal.](#u5b-a--one-coherent-canonical-transition-underdetermined-terminal)
> below, which also records that this section's own opposite contract for A was
> **defective as written**. Current status of the family:
>
> ```text
> U5b-A   TERMINAL — UNDERDETERMINED. Not rejected. NULL FORBIDDEN.
> U5b-B   CLOSED — FUNCTION NOT ESTABLISHED. Both gates run. NULL FORBIDDEN.
> U5b-C   UNOPENED — and NOT OPENABLE AS WORDED (borrowed antecedents)
> U5b-D   TERMINAL — UNDERDETERMINED, not decidable as posed. NULL FORBIDDEN.
>         Both gates run, three seats. See the U5b-D disposition record.
> U5b-E   NOT OPENED — and NOT OPENABLE AS WORDED. Five contaminants, none
>         implementer-repairable. NO SEAT RAN, no verdict on the function.
>         OPENS ONLY on a NEW HUMAN-AUTHORED candidate statement (author, 2026-08-20).
> ```
>
> **THE FAMILY IS EXHAUSTED UNDER THIS PREREGISTRATION.** Every row is terminal or
> not openable. Rewording C or E is RESERVED TO THE AUTHOR, and "no row was
> openable" is a fact about five instruments — never a verdict on the functions.

The previous failure came partly from bundling several functions under one row
name. These five can survive or die **independently**, so they are preregistered
separately and opened one at a time. **A is opened first; B through E remain
UNOPENED until A reaches a disposition.** That keeps the family from
cross-contaminating itself.

```text
GRANTED   P1-P6 only, plus any other independently frozen premise CITED PER ROW.
FORBIDDEN in every packet — incumbent vocabulary:
  prepare · commit · publish · effect · transaction · turn · pending rollback
  causal attribution · speculation
  (unless a term is independently frozen AND genuinely necessary to state a
   premise, in which case cite the freeze)
```

### U5b-A — ONE COHERENT CANONICAL TRANSITION [SUPERSEDED — see the terminal record]

**The wording below is the AS-PREREGISTERED text, retained for audit. Its opposite
contract was later found to stipulate an answer.** The disposition is
UNDERDETERMINED and TERMINAL.

```text
CANDIDATE   several related writes must become one externally coherent canonical
            transition
DECISIVE    what independently valuable workflow becomes impossible if applications
            instead use the currently earned canonical write and grouping semantics?
OPPOSITE    there is no distinct atomicity function. Callers construct valid
            values before each individual write; P5 governs only confirmed reversal
            granularity and does not itself relocate coherence to the forward path.
```

Do **not** read the opposite as proving that callers can precompute every final
multi-position result, choose arbitrary mutation granularity, or validate a whole
candidate configuration before the container is touched. P1 grants only that a
value exists for the write being performed. The absence argument is burden-based:
P1-P6 do not yet establish a forward-path observation/interleaving model under
which mid-sequence incoherence is an earned SignalTree-owned concern.

### U5b-B — REFUSAL / FAILURE [CLOSED — see the disposition record]

```text
CANDIDATE   an attempted multi-write transition may fail such that none of its
            canonical consequences occur
DECISIVE    what requires failure to be container-governed rather than validation
            occurring before canonical mutation?
```

**Both lines above are DEFECTIVE AS WRITTEN.** The full packet, with the defects
recorded rather than silently repaired, is at
[U5b-B — REFUSAL / FAILURE: PREREGISTRATION PACKET](#u5b-b--refusal--failure-preregistration-packet).

### U5b-C — CONSEQUENCE COORDINATION [UNOPENED — and NOT OPENABLE AS WORDED]

```text
CANDIDATE   consequences outside canonical state must be coordinated with the
            success or refusal of the canonical transition
DECISIVE    what independently requires SignalTree to own that coordination rather
            than an already-earned consequence owner or adapter?
```

**RECORDED DEFECT — not repaired, because repairing it is a semantic choice.** The
candidate's wording rests on **two antecedents supplied by sibling rows, both of
which failed to establish them**:

```text
"the canonical transition"   U5b-A's candidate. TERMINAL — UNDERDETERMINED.
"refusal"                    U5b-B's candidate. FUNCTION NOT ESTABLISHED.
```

So C as worded asks what must be coordinated with the success or refusal of a thing
that is not established to exist, and a refusal that is not established to be a
container notion. Opening it as written forces one of two forbidden moves:

```text
INHERIT A's and B's dispositions as priors for C
  -> forbidden. A sibling's verdict is EVIDENCE ABOUT THAT SIBLING. Struck for A
     into B; struck again here for B into C. The rule is symmetric.
REWORD the candidate to remove the borrowed antecedents
  -> a semantic choice about what C is even asking, RESERVED to the human author.
     Rewording a frozen preregistration to make it answerable IS the contamination.
```

**This is a finding about C's instrument, NOT a verdict on C's function.** C may
survive, die, or be underdetermined on its own evidence once it has wording that does
not borrow. Nothing here is a work order, and no measurement or archaeology may be
used to supply either antecedent.

```text
D and E, checked for the same defect while the check was cheap:
  U5b-D  "several writes must retain a shared semantic fact beyond merely reverting
         as one confirmed step" — rests on P5 grouping, which IS granted. NO
         BORROWED ANTECEDENT FOUND. Structurally the cleanest unopened row.
  U5b-E  "an unconfirmed transition requires container-owned semantics for later
         acceptance or withdrawal" — uses "transition" again, and defers to
         "whatever speculative semantics have ALREADY independently survived",
         which is currently NOTHING. Same borrowing hazard as C, less acute.

NOT A PRIORITY RULING. Which row opens next, and in what order, is the author's.
```

### U5b-D — SHARED ATTRIBUTION [UNOPENED]

```text
CANDIDATE   several writes must retain a shared semantic fact beyond merely
            reverting as one confirmed step
DECISIVE    what becomes impossible if the only surviving fact is the grouped
            canonical transition?
```

Stated deliberately without a name for the fact. **Only if the answer is yes should
vocabulary for it emerge.**

### U5b-E — UNCONFIRMED TRANSITION WITHDRAWAL [UNOPENED]

```text
CANDIDATE   an unconfirmed transition requires container-owned semantics for later
            acceptance or withdrawal
DECISIVE    what independently valuable workflow cannot be expressed using
            currently earned canonical state plus whatever speculative semantics
            have ALREADY independently survived?
```

## TWO ORDERING FIXES

### The null comes after BOTH gates

```text
OLD   Gate 1 kills it            -> close
      Gate 1 finds a contract    -> preregister a null

NEW   Gate 1 kills it            -> Gate 2 BOUNDS the interpretation -> close
      Gate 1 finds a contract    -> Gate 2 CONFIRMS that inference   -> only then
                                    preregister a null
```

Gate 1 can establish that a candidate deserves testing. **Gate 2 must first verify
that the survival interpretation has not itself jumped a premise.** A row does not
need an experiment; reaching the correct disposition is the success criterion.

### GATE 2 HARD LIMIT — goes in the packet, not just the methodology

```text
YOU MAY
  bound the supported conclusion · identify overclaims · record conflicts
  state PARKED REOPENING CONDITIONS

YOU MAY NOT
  create a follow-up experiment
  request repository archaeology
  propose that a missing premise be established
  turn an absence witness into a benchmark target
  create work whose purpose is to make THIS candidate decidable

A strongest alternative interpretation is EVIDENCE ABOUT THE ROW, not a work order.
```

## THE INVARIANT ALL OF THIS SERVES

Adding another mechanism at each newly discovered boundary leak is not the answer —
each one is compliant with its own letter and leaks where it does not reach. The
useful invariant is single:

> **Every stage is subordinate to the same burden rules. No reviewer, gate,
> experiment, absence witness, or synthesis has authority to manufacture the
> premise needed by the next stage.**

That covers premise attack, null construction, interpretation review, and closure
with one rule instead of four, and it is what the observed failures actually
violated.

## U5b-A — ONE COHERENT CANONICAL TRANSITION: UNDERDETERMINED. Terminal.

```text
A (killer)    FUNCTION SURVIVAL NOT ESTABLISHED
B (absence)   A COHERENT ABSENCE EXISTS — but conditional on three things it cannot
              guarantee, and FAILS OUTRIGHT on one named class
GATE 2        UNDERDETERMINED — NEITHER EARNED NOR REFUTED
NULL          FORBIDDEN
DISPOSITION   TERMINAL. Not "rejected". No author may report it as rejected.
DEFENDER      NONE. This row was closed BEFORE the defender charter existed. Both
              seats were same-direction. The charter is NOT retroactive and this
              row is NOT reopened by it.
P3            Closed against a SPLIT P3. Frozen 2026-08-20 on the agentful wording,
              which does NOT satisfy this row's parked reopening condition #1 —
              the freeze settles the text, not its observational content.
```

### What is established, narrowly

```text
1  P5 does NOT grant forward-path atomicity. Both reviewers converge: grouping
   supplies recovery of the RECORD, not prevention. Any argument that the
   forward-path claim is already granted is dead.
2  P4 grants NO CONCEALMENT — it excludes positions from the revertible record,
   not from observation. The "stage in excluded positions" route is not
   privacy-backed.
3  The candidate's apparent force comes from a RELOCATION, not a derivation.
   P3's "boundaries a user would recognize" is a granted coherence requirement on
   the REVERSAL path; the wording transposes it to the forward path.
4  A large fraction of multi-position coherence requirements are DECOMPOSITION
   ARTIFACTS and dissolve under re-addressing and derivation with no transition
   facility. The candidate's necessary domain is strictly smaller than its wording
   suggests.
5  The premises do NOT decide whether reversion is observationally atomic, nor
   whether every composed writing unit is restructurable by its caller. Both are
   ungranted facts, not open questions with a default.
6  Whether every position pair has a common addressable ancestor is UNDETERMINED —
   the premises grant neither a root nor a hierarchy.
```

### THE INSTRUMENT WAS DEFECTIVE — my error

The pre-registered OPPOSITE CONTRACT stipulated that grouping _"governs only
confirmed reversal granularity."_

```text
That HANDS THE NULL THE ANSWER to the exact question B's F7 says is undecided.
Any closure leaning on the null's wording is leaning on a STIPULATION.
```

`"grouping is confined to reversal granularity"` is therefore **not a finding** — it
is my packet's wording. This is a construction defect of the row's instrument and it
bounds how much weight the null's survival can carry.

### CONFLICT — mostly charter artifact, ONE genuine residuum

**Reconcilable part.** A was asked whether the function is _required by the premise
set_ and said no for all cases. B was asked to _build the absence_ and said a
construction exists with a non-empty uncovered class. That class — opaque writer +
illegal intermediate + unmediated observer — is characterised by exactly the grants
A's own falsifier names as missing, and B lists _"all composed writing units are
restructurable by their caller"_ as its own falsifier. So B's forced case is not a
counterexample to A; it is **the sharpest available specification of the missing
grant.** Compatible findings — and B's route is the more valuable one: A found the
gap by inspection, B found it by hitting it while trying to build around it.

**UNRESOLVED RESIDUUM — do not flatten.** B's F7 does _not_ depend on an external
grant. P3's own wording — _"a configuration PREVIOUSLY HELD"_, _"boundaries a user
would recognize"_ — may already entail a step-granular observer of whole
configurations. And **A concedes the premise B needs**: A calls those boundaries
_"a genuine, granted coherence requirement"_, objecting only to their relocation.
Both touch the same load-bearing text from opposite sides and neither resolves it.

```text
UNRESOLVED   is P3's "boundaries a user would recognize" OBSERVATIONAL or merely
             DESCRIPTIVE? Neither reviewer was asked; neither answered.
             This is INTERNAL to the frozen premises, not a difference of
             assignment.
```

### CLOSURE — F7 is correct, and a disposition is still available

Both directions require deciding reversal observational atomicity:

```text
IF reversion IS observationally atomic  -> the container already possesses
   coherent multi-position machinery, and the opposite contract's "there is no
   distinct atomicity function" is FALSE AS WRITTEN. The candidate becomes a
   SYMMETRY claim about an existing function, not a request for a new one.
IF record-granular only  -> the opposite contract survives, at the stated price:
   revert is OBSERVABLY TORN, and a half-reverted configuration corresponds to no
   configuration ever held — straining P3's own words.
```

The available disposition avoids deciding it: **record UNDERDETERMINED and
terminate.** Underdetermined is terminal, not deferred.

### BRANCH A IS STRUCK — and A's case collapses to one leg

A's Branch A ("the positions have a common ancestor, so write that one position")
reproduces an argument this effort already withdrew. A had no way to know that, and
correctly so — context was withheld. But the objection bites on **premise-internal**
grounds, without needing concurrency:

```text
P1 writes REPLACE VALUES, so writing an ancestor replaces sibling values within it
  -> the write's extent EXCEEDS the intended positions
An ancestor-granular write is ONE RECORDED write spanning its siblings
  -> reverting it reverts siblings that were never part of the operation
And if any sibling under that ancestor is P4-EXCLUDED, an ancestor-granular write
  CANNOT HONOUR THE EXCLUSION AT ALL
```

So the sibling-granularity objection is a **conflict with P3 and P4**, not a cost
note.

```text
CONSEQUENCE  A's F2 collapses into F1 — "unavoidable multiplicity is a defect only
             under the missing premise" is F1 restated.
             A's verdict rests on ONE leg, not two.
```

### LADDER — only rung 3, entered OUT OF ORDER

```text
Rung 1 measured behaviour        NOT ENTERED
Rung 2 model vs MEASURED         NOT ENTERED — B's construction was compared
                                 against PREMISES. It LOOKS like rung 2 and is not;
                                 this is the most likely misreading available.
Rung 3 function required         ENTERED, NOT PASSED — the only rung entered
Rung 4 representation property   NOT ENTERED — B's invariant-forest constraints are
                                 costs of an alternative, conditional on rung 3
                                 resolving the other way
Rung 5 carrier                   NOT ENTERED
```

**CORRECTED — "rung 3 with 1 and 2 empty is out of order" is WITHDRAWN as an
account of why this row is undecidable, and must NOT be generalized.**

Empty lower rungs are not the cause. **The cause is that the candidate depends on a
behaviour the frozen premises do not grant** — an entity able to observe the
interval between two writes. Measurement could not have supplied that; supplying it
by measurement is the forbidden move. Reading the emptiness of rungs 1-2 as the
defect implies measurement would have decided the row, which is the
"provisional against measurement" error already struck on UNDO-E3, returning in
ladder clothing.

```text
THE NARROW RULE

If a candidate depends on a behaviour NOT PRESENT in the frozen premises, do not
use measurement or repository archaeology to supply it FOR THAT CANDIDATE. Close
or park the row.

If a row's independently frozen premises ARE sufficient to decide the function, it
MAY be reasoned abstractly WITHOUT measuring current behaviour. Rungs 1 and 2 are
not prerequisites for a function verdict.
```

So a rung-3 verdict on sufficient premises is legitimate with rungs 1-2 empty. What
is illegitimate is filling a PREMISE GAP with measurement.

**What measurement CAN and CANNOT do — stated at the strength the evidence allows,
because the weaker form of this rule has now been re-derived twice from opposite
directions (UNDO-E3's "provisional against measurement", then U5b-A's ladder
framing).**

```text
MEASUREMENT MAY
  SUPPORT a derivation that is INDEPENDENTLY MOTIVATED — one whose function
  requirement is already carried by premises earned without reference to the
  measurement. There it supplies magnitude, feasibility, cost, or a
  counterexample to a claim the derivation actually made.

MEASUREMENT MAY NOT
  MANUFACTURE THE FUNCTION REQUIREMENT. No quantity of observed behaviour
  converts "the premises do not require this" into "this is required", because
  the observation's subject is an implementation that was never the authority on
  what is necessary.
```

The test is the DIRECTION OF DEPENDENCE, not the order of operations:

```text
LEGITIMATE    the requirement stands without the measurement, and the measurement
              informs the requirement's magnitude or its realizability
FORBIDDEN     the requirement does not stand until the measurement is admitted
```

So _"measure first, then derive"_ is not itself the error, and _"derive first,
then measure"_ is not itself a defence. A measurement taken before a derivation may
legitimately inform it; a measurement taken after one may still be the only thing
holding it up. **Ask what the requirement rests on, not what happened first.**

### CORROBORATION — NO for the verdict; weakly YES for the gap's location

> **⚠️ CORRECTED. "Both read the same stipulated text" is FALSE**, and false at the
> one clause this row's disposition turns on. The packets diverged at P3: A was
> issued _"at boundaries **a user would recognize** as discrete steps"_, B the
> agentless _"at **recognizable** step boundaries"_. Verbatim texts and the
> divergence are recorded under
> [P1-P6 — THE FROZEN PREMISES WERE NEVER RECORDED](#p1-p6--the-frozen-premises-were-never-recorded-transcribed-here).
>
> **What the correction does NOT do:** it does not restore corroboration for the
> verdict. The common-cause argument below was used to DENY corroboration, and the
> denial stands on other grounds — both reviewers were pointed at the same target,
> and neither held a defender charter.
>
> **What it does do, and the direction is against the record's own conclusion:** the
> paragraph below credits B with reaching the wall by an independent route. But B
> was never shown the observer-bearing phrase, so B's failure to raise a perceiving
> entity is **not** independent arrival at the same wall — it is silence about a
> clause absent from its packet. The "weakly YES for the gap's location" claim is
> therefore **weaker than recorded**, not stronger.

Both read the **same stipulated text** and noticed the same silence. Agreement on an
absence in a shared input is common-cause — verification that the text says what it
says. Most agreed items are direct premise readings of that kind. And A's apparent
breadth shrinks: Branch A struck, F2 collapsed, so **A contributes one argument, not
several.**

What does corroborate, and only this far: B reached the same wall by a **different
failure route** — unable to close two situations without introducing new observer
and control surfaces, then reporting against its own interest that two of them
together _"reconstitute the candidate."_ Independent-route arrival is moderate
evidence the wall is load-bearing rather than an artifact of A's framing. It
corroborates **where the gap is**, not that the candidate fails.

### PARKED REOPENING CONDITIONS — conditions, NOT tasks

Each satisfied only if some **independently motivated** row happens to grant it:

```text
- P3's "boundaries a user would recognize" is settled as OBSERVATIONAL
- a grant appears that a read may occur between two writes by the same caller
- a grant appears that a write sequence may terminate partway
- a grant appears that composed writing units may be UNRESTRUCTURABLE by their
  caller within a row's scope
```

**None may be pursued, established, or benchmarked in order to make this candidate
decidable.**

### STRONGEST ALTERNATIVE — assembled from pieces both supplied, neither joined

> **⚠️ PROVENANCE CORRECTED — this alternative rests on ONE reviewer's premise
> text, not on a shared one.** The phrase it turns on, _a user would recognize_,
> appeared **only in A's packet.** B's P3 was agentless. So this is not "assembled
> from pieces both supplied": the observer-bearing half came from A's text alone,
> and B could not have supplied or contested it.
>
> The argument is **not withdrawn** — it is a legitimate reading of A's P3, and its
> conclusion (that the undecidability relocates to P3's observational content) is
> now visibly the same question as _which P3 wording is frozen_. But it may not be
> cited as bilateral, and its strength is that of a single-text reading.

> **P3 already contains the observer, and the candidate is not a new function but
> the forward-path statement of an obligation P3 imposes.**

Neither of P3's clauses is per-position: _configuration_ quantifies over whole-state
snapshots, _a user would recognize_ over an entity that perceives them. If the
premise set contains a step-granular whole-configuration observer, it contains it
for reasons **wholly independent of this candidate** — granted for reversion, not
imported to win the row. Then B's parity step lands: reverting a group as several
ordinary writes exhibits a configuration **never held**, which P3 forbids on its
face; to satisfy "previously held" on reversal, the forward path must only ever have
held recognisable configurations. **The obligation propagates backward from P3 with
no new grant.**

It still does not close the row — it requires "a user would recognize" to be
observational and "previously held" to constrain the forward path, and P1-P6 say
neither. **It relocates the undecidability** from _"is there an observer?"_ to
_"what is P3's observational content?"_

### FORBIDDEN on this row

```text
"the candidate is refuted / unnecessary"
"B established a class where the candidate is NECESSARY"   (conditional; B says so)
"P5/P6 already cover it"                                   (refuted by both)
"grouping is confined to reversal granularity"             (MY STIPULATION, not a
                                                            finding)
"reversion is observationally atomic" OR "observably torn" (premises decide neither)
"co-location is the answer"                                (not established free)
"the absence architecture is a design"                     (existence proof only)
"scaffolding 2+3 give the behaviour without the candidate" (B: they ARE it,
                                                            relabelled)
"write-position injection is the repair"                   (weakest known; enforceable
                                                            nowhere)
"A's Branch A shows one write always suffices"             (STRUCK)
"P4+P5 have a defect to fix"                               (latent today; only the
                                                            candidate's language would
                                                            make it a promise)
"two reviewers agreeing corroborates the verdict"
```

## U5b-B — REFUSAL / FAILURE: PREREGISTRATION PACKET

**STATUS: THE ROW IS NOW CLOSED — FUNCTION NOT ESTABLISHED.** This section is
retained as the AS-DRAFTED INSTRUMENT, for audit of what the reviewers were and were
not given. The disposition is at
[U5b-B — REFUSAL / FAILURE: FUNCTION NOT ESTABLISHED](#u5b-b--refusal--failure-function-not-established-both-gates-run).
Gate 1 was opened against this packet with the P3 divergence disclosed to both
reviewers rather than silently resolved. This section is the instrument, written
before the row is opened, because U5b-A established that a defective instrument
contaminates every result downstream of it and cannot be repaired retroactively.

### Why this row is openable at all despite U5b-A's blocker

U5b-A closed UNDERDETERMINED on a specific missing grant: **an entity able to
observe the interval between two writes.** If U5b-B needed that same grant it would
be closed before it opened, and opening it would be resurrection by relabelling.

The packet's claim to independence — **marked as a construction property of this
row, NOT as a finding, and explicitly exposed to Gate 1 rejection**:

```text
U5b-A asks about a state DURING a sequence.
U5b-B asks about the state AT REST AFTER a sequence that did not complete.

A terminal state is reachable by an ordinary read. So the row can be stated
WITHOUT an interval observer.
```

```text
IF GATE 1 FINDS this row cannot be stated without an interval observer
  -> U5b-B CLOSES as inheriting U5b-A's blocker. It does not become a request to
     establish the observer. That is the forbidden move, already struck twice.
```

This is a **falsifiable premise of the packet**, not a granted one. It is the first
thing Gate 1 should attack.

### CANDIDATE — as preregistered, retained verbatim, and DEFECTIVE

```text
AS PREREGISTERED (frozen wording, do not edit in place)
  an attempted multi-write transition may fail such that none of its canonical
  consequences occur
```

**Recorded defect, not repaired:** _"such that none of its canonical consequences
occur"_ is an **all-or-nothing shape written into the candidate.** It states a
property of the remedy, so a reviewer evaluating the candidate as worded is
evaluating a solution rather than a function. This is the same class of defect as
U5b-A's opposite contract, caught this time before the row opened.

The defect is recorded rather than silently corrected because rewording a frozen
preregistration to be more answerable **is** the contamination. Gate 1 receives
both the frozen wording and this note, and **may reject the candidate on the
strength of the defect alone.**

```text
STRICTLY WEAKER RESTATEMENT — offered alongside, not substituted
  a sequence of writes may not run to completion, and the container may owe
  semantics for what is then true
```

It removes the all-or-nothing clause and **replaces it with nothing.** It does not
say what those semantics are, whether any are owed, or that "not running to
completion" is a state the premises admit.

### DECISIVE QUESTION — as preregistered, and DEFECTIVE

```text
AS PREREGISTERED (frozen wording)
  what requires failure to be container-governed rather than validation occurring
  before canonical mutation?
```

**Recorded defect, not repaired:** the clause _"rather than validation occurring
before canonical mutation"_ presents pre-write validation as **the** alternative.
U5b-A's own closure states that P1 grants only that a value exists for the write
being performed, and warns in terms against reading anything as _"callers can
validate a whole candidate configuration before the container is touched."_ So the
frozen question offers a rival whose availability is **itself disputed** — a
disputed-scope clause of exactly the kind that must not appear.

```text
STRICTLY WEAKER RESTATEMENT — the disputed rival REMOVED, nothing put in its place
  what independently valuable workflow becomes impossible if the container has no
  semantics for a sequence of writes that does not run to completion?
```

Gate 1 answers the restatement. The frozen wording travels with it so the reviewer
can see what was removed and object to the removal.

### OPPOSITE POSITION — symmetric with the candidate, and UNPROVEN

U5b-A's instrument failed because its opposite contract carried a **premise
reading** presented as background rather than as a proposition under test. The fix
is symmetry: both sides are unproven positions offered for attack, and neither is
stated in the voice of an established fact.

```text
OPPOSITE POSITION — UNPROVEN. Offered for attack on the same footing as the
candidate. NOT a verdict, NOT a premise reading, NOT the author's view.

  Failure of a write sequence is a caller-side concern, and the container owes no
  semantics for it.
```

**Does a route to its invalidity exist?** The gate's stop-condition requires that
one be _available_, not that it be correct. One is available and is recorded
unevaluated:

```text
ROUTE, UNEVALUATED — P4 (exclusion from the revertible record) and P5 (grouping
several writes into one confirmed step) already place the container in the business
of deciding what constitutes one step. A sequence that does not run to completion
may have no step boundary the container can have recorded. If so, the container's
own record — not the caller's data — is left in a condition the premises do not
describe, and "caller-side concern" would not reach it.

NOT ASSERTED: that the premises fail to describe it. That is the row's question.
```

Because a route exists, **the packet clears the stop-condition.** No answer would
have meant STOP.

### WHAT THE OPPOSITE POSITION DOES NOT ASSERT — the anti-stipulation ledger

This field did not exist for U5b-A. It is the direct repair. **Every item is a
question this row might need to decide, and the opposite position is therefore
silent on it.**

```text
NOT ASSERTED  that pre-write validation of a whole candidate configuration is
              available to callers under P1-P6
NOT ASSERTED  that reversal is available as a remedy for a sequence that did not
              run to completion — whether such a sequence is a "confirmed step"
              under P5/P6 is open
NOT ASSERTED  that a sequence CAN terminate partway. U5b-A parked exactly this as
              a reopening condition; the row must not assume it, and must not
              pursue it in order to become decidable
NOT ASSERTED  that "failure" is one thing rather than several unrelated things
NOT ASSERTED  that the container currently has, or lacks, such semantics.
              Implementation behaviour is not in evidence on this row at all
NOT ASSERTED  that the caller is capable of repairing partial consequences
NOT ASSERTED  that partial consequences are undesirable
```

The last is deliberate. _"Partial consequences are bad"_ is a value judgement that
would supply the function requirement by assumption, which is the P3-invented-theorem
error in a new costume.

### STIPULATION-LEAKAGE SELF-CHECK

The check U5b-A did not have, run against this packet. **The test: does any clause
ANSWER a question the row might need to decide?**

```text
CLAUSE                                    ANSWERS A ROW QUESTION?   DISPOSITION
candidate, frozen wording                 YES — all-or-nothing      DEFECT RECORDED,
                                          shape                     wording retained
decisive question, frozen wording         YES — offers a disputed   DEFECT RECORDED,
                                          rival as THE rival        weaker restatement
                                                                    supplied
weaker candidate restatement              NO                        admissible
weaker decisive restatement               NO                        admissible
opposite position, one sentence           NO — asserts nothing      admissible
                                          about P1-P6
route-to-invalidity                       NO — marked UNEVALUATED   admissible
independence claim (state at rest)        NO — marked FALSIFIABLE,  admissible
                                          Gate 1 may reject it
```

```text
STANDING TEST, applied per clause
  Would this sentence COUNT AS A FINDING if a reviewer produced it?
  If yes, it does not belong in the packet — the packet would be pre-empting the
  reviewer's output with the author's wording.
```

Applied: _"the premises do not establish container-owned failure semantics"_ is
**rejected from this packet.** It would be Reviewer A's verdict, and putting it in
the instrument would hand A its conclusion. The admitted form asserts nothing about
the premises at all.

### FORBIDDEN IMPORTED CONCEPTS

Family-level, from the U5b preregistration:

```text
prepare · commit · publish · effect · transaction · turn · pending rollback
causal attribution · speculation
```

Row-specific, because each names a solution shape or a foreign discipline's
semantics, and using one would smuggle in the answer:

```text
SOLUTION-SHAPED     rollback · all-or-nothing · atomic · partial commit ·
                    compensating action · saga · two-phase · retry · idempotent
FOREIGN DISCIPLINE  isolation level · durability guarantee · ACID · journal ·
                    write-ahead · savepoint
U5b-A's VOCABULARY  observer · interleaving · intermediate configuration · torn ·
                    observationally atomic · forward-path coherence
                    (importing any of these re-opens A's blocker inside B)
INCUMBENT           entityMap · SubjectId · effect log · turn store ·
                    reversal planner
```

```text
PERMITTED   the container · a sequence of writes · did not run to completion ·
            what is true afterwards · the record · a caller
```

If the row cannot be stated in the permitted vocabulary, **that is a finding about
the row**, not a licence to widen the vocabulary.

### WHAT MUST NOT BE INHERITED FROM U5b-A

U5b-A is a sibling, not a parent. It grants this row nothing.

```text
DO NOT INHERIT
1  "grouping is confined to reversal granularity"
     A's author stipulation. Never was a finding. Carries into no row.
2  "reversion is observationally atomic" OR "observably torn"
     The premises decide neither. Both remain unavailable here.
3  A's UNDERDETERMINED disposition
     A verdict about A's candidate. It is not a prior, a presumption, or a
     prediction for B. B may survive, die, or be underdetermined on its own
     evidence.
4  A's blocker as a settled bar on the family
     The missing interval observer blocks candidates that NEED it. Whether B needs
     it is the first thing Gate 1 decides — see the independence claim above.
5  B's uncovered class (opaque writer + illegal intermediate + unmediated observer)
     It is specified in terms of INTERMEDIATE states. Importing it drags the
     observer problem in through the side door.
6  A's Branch A, the common-ancestor write
     STRUCK on premise-internal grounds. Not available as an argument here.
7  "callers can validate a whole candidate configuration before the container is
   touched"
     Explicitly warned against on A. It is in this packet's anti-stipulation
     ledger, not its premises.
8  A's four parked reopening conditions
     They are A's conditions for A. They are not preconditions for B, and B must
     not be framed as the row that establishes them.
9  Any framing in which two reviewers agreeing corroborates a verdict
     Premise-correlated. Struck three times now.

MAY BE CITED — but only as what it is
  A's record is EVIDENCE ABOUT A. If B cites it, B cites it as "the U5b-A closure
  records X", never as "X is established".
```

### WHAT OPENING GATE 1 WOULD REQUIRE

Recorded so the next step is unambiguous and **nothing here reads as authorization**:

```text
1  a Gate 1 packet built from this section, carrying: the frozen premises; the
   frozen candidate AND its recorded defect; the weaker restatements; the opposite
   position; the independence claim marked falsifiable
2  WITHHELD from the reviewer: this packet's own reasoning about why the row is
   openable, the author's expectations, and U5b-A's synthesis
3  Reviewer A (function killer) and the absence architect, independently
4  Gate 2 on the raw reports before any conclusion — and Gate 2 may produce
   reopening conditions ONLY, never work orders

NOT AUTHORIZED BY THIS SECTION: any of the above. The packet is the instrument.
Opening the row is a separate decision.
```

## U5b-B — REFUSAL / FAILURE: FUNCTION NOT ESTABLISHED. Both gates run.

```text
GATE 1  Reviewer A (function killer)     FUNCTION SURVIVAL — NOT ESTABLISHED
        Reviewer B (absence architect)   A COHERENT ABSENCE ARCHITECTURE EXISTS,
                                         under the WEAKER restatement only
GATE 2  DISPOSITION                      FUNCTION NOT ESTABLISHED
NULL    FORBIDDEN
NEXT    NOTHING for this function
MEASUREMENT  NONE PERFORMED on this row, at any rung
DEFENDER     NONE. Closed before the defender charter existed; both seats were
             same-direction. The charter is NOT retroactive and does not reopen
             this row.
P3           Divergence was DISCLOSED to both reviewers and left unresolved. The
             2026-08-20 freeze does not disturb the closure: no leg of it runs
             through P3's perceiving entity, and both reviewers affirmed the row
             needs no interval observer.
```

**Not "refuted".** Gate 2's qualification is part of the disposition: this is the
null standing undisturbed, not a refutation. The opposite position was carried on
equal footing and **remains equally unproven** — neither reviewer established it,
and A explicitly declined to.

### MAXIMUM SUPPORTED CONCLUSION — Gate 2's wording, one sentence

> Under P1-P6 as frozen, no reviewer — under either charter, either P3 wording, or
> either candidate wording — produced a workflow that becomes impossible absent the
> candidate function, and the one candidate-shaped residue offered depends on
> multi-writer, caller-mortality and cross-lifetime-durability conditions that
> P1-P6 do not grant; the function is therefore **not established, which is not the
> same as shown unnecessary.**

### THE INDEPENDENCE CLAIM SURVIVED — and the row did not close on it

The packet's falsifiable construction claim was that the row concerns state **at
rest**, so it needs no entity observing the interval between two writes. Both
reviewers **affirmed it**, and neither used such an entity. So U5b-B did **not**
close by inheriting U5b-A's blocker. That route did not fire.

It cost something anyway, and both reviewers said so from opposite charters:

```text
A   the claim is TRUE but "fatal to the row rather than helpful to it" — a
    configuration left by writes 1..k of an intended 1..n is IDENTICAL, under every
    read the premises grant, to one a caller deliberately produced by performing
    exactly writes 1..k. "Did not run to completion" is not a value at a position,
    and P2 absence does not supply it either, since absence is a value a COMPLETED
    write can produce.
B   the claim is true but its STATED GROUND is false — "a terminal state is
    reachable by an ordinary read" conflates reaching a configuration with knowing
    it is terminal. B repaired the ground: termination is known at the issuing
    site, which is a fact held at rest, not an observation between writes.
```

### WHAT WAS ACTUALLY ESTABLISHED — five items, all weaker than they look

```text
E1  neither reviewer PRODUCED a workflow that becomes impossible under P1-P6.
    An absence of production, NOT a demonstration of non-existence.
E2  the frozen candidate CANNOT STATE ITSELF in the vocabulary P1-P6 supply.
    A: "attempted", "fail" and "its canonical consequences" all reach outside it.
    B: "the container has no name for a sequence."
    Reached from opposite charters. This is the strongest positive result — and it
    is a result about the WORDING AND THE PREMISE SET, not about the function.
E3  the construction claim survives (above). The closing-finding did not fire.
E4  P3/P5/P6 are UNDERDETERMINED about step individuation when a group does not
    close. A reaches it as a two-horned dilemma, B as the "LIFO-top question".
    Unprompted, bilateral, and OUT-OF-ROW.
E5  all of the above is CONDITIONAL on an antecedent the packet declined to
    assert — that a sequence can terminate partway.
    A: "the candidate's antecedent is supplied by the candidate."
    B: "if it cannot, the row is empty and everything is conditional."
```

### THE A/B CONFLICT — adjudicated as a DOUBLE MISMATCH, not a conflict

A said nothing can be named; B named _"safely consuming state written by a party you
cannot modify, after that party stopped partway."_ Gate 2 found this is not a
contradiction:

```text
SCOPE     A quantified over P1-P6. B quantified over P1-P6 PLUS an imported world.
QUESTION  A answered "what workflow becomes impossible?". B answered "what class
          does my own construction fail to cover?" AN UNCOVERED CLASS IS NOT A
          CAPABILITY LOSS.
AGREEMENT On the operative point they AGREE: B says covering it requires
          container-side standing knowledge that a sequence is owed, surviving the
          caller, and that this "would have to be granted outright" — which is A's
          position in substance.
```

**B's _"the row is not empty"_ is the strongest overclaim in the raw material** and
is rejected. It is two steps out — uncovered class → workflow → independently
valuable workflow — and each step needs an ungranted condition.

### B'S DECISIVE CLASS RESTS ON FIVE UNGRANTED CONDITIONS

Gate 2 enumerated what U1/U2 requires against what P1-P6 grant:

```text
C1  a caller/writer as a persisting entity with identity   NOT GRANTED
C2  more than one writer to the same container             NOT GRANTED
C3  a writer the reader CANNOT MODIFY                      NOT GRANTED
C4  caller mortality / abnormal termination                NOT GRANTED
C5  state persisting beyond the writing party              NOT GRANTED
C6  a sequence CAN stop partway                            EXPLICITLY NOT ASSERTED
C7  telling residue from intent has independent value      EXPLICITLY WITHHELD
```

And the classes do not multiply the evidence: **U1, U2, U2b and U3 cluster entirely
in one ungranted region** — multi-writer, mortal, durable callers. They are one
region named four ways, not four findings.

This is the narrow rule applying exactly as written: **a candidate depending on
behaviour absent from the frozen premises is closed or parked, and measurement may
not supply it.** The conditions are parked below, as conditions.

### PRE-REGISTRATION VIOLATIONS FOUND BY GATE 2 — recorded, both directions

```text
B  imported a whole world P1-P6 do not contain: caller identity, multiple writers,
   an unmodifiable writer, caller mortality, state outliving its writer.
   "Every noun in that clause except 'state' is ungranted."
B  used the value judgement the packet explicitly WITHHELD — "SAFELY consuming",
   "RESIDUE vs intent", false positives as "the TOLERABLE direction".
   A had flagged this exact trap; B walked into it.
B  foreign-discipline import, substantial: F1-F5 is a crash-failure taxonomy;
   "lost update" is an isolation anomaly; "conditional write" is compare-and-swap;
   "write acknowledgement" is replication. These terms ARRIVE WITH ENTAILMENTS, and
   those entailments are exactly the ungranted conditions U1/U2 needed. The
   discipline import IS the mechanism by which B's decisive class got its premises.
A  imported a burden default the packet did not grant — "a tie resolves against
   adding". Equal footing does not contain a tiebreak. Does not change the outcome
   (the candidate failed on its own account) but A's reasoning exceeded its licence
   in that line.
NEITHER  no implementation or framework leakage. Clean on that axis.
```

### LADDER — rung 3 attempted, NOT cleared. Rungs 1-2 empty BY CONSTRUCTION.

```text
1  measured current behaviour        NOT ENTERED — no measurement on this row
2  alternative model reproduces      NOT ENTERED
3  THE FUNCTION IS REQUIRED          ENTERED, NOT PASSED
4  representation property required   UNREACHABLE
5  a particular carrier survives      UNREACHABLE
```

Per the narrow rule, empty rungs 1-2 are **not a defect** here and did not cause the
outcome. A rung-3 attempt on sufficient premises is legitimate. What Gate 2 adds is
sharper: the attempt was made on a premise set that **per E2 cannot express the
candidate at all.**

### STRONGEST ALTERNATIVE — the instrument is the finding, not the candidate

> **If a candidate is unstatable in its own premise set, "not established" is not a
> verdict about the function — it is a verdict that P1-P6 lacks the vocabulary to
> pose the question.**

On this reading the row was never testable; its closure carries no information about
whether such a function is needed under any richer premise set; and the apparent
convergence is convergence on the premise set's expressive limits rather than on the
candidate's merits. It explains E2, explains why the P3 ambiguity changed no verdict,
explains why B had to import a foreign world to make the row non-empty, and explains
why neither reviewer could construct a falsifiable contract.

**Evidence about the row. NOT a work order, and not a licence to widen P1-P6.**

### CORROBORATION — NO, and the instrument design is why

```text
THE KILL WAS PRE-DISCLOSED. The packet handed both reviewers the "names a remedy,
  not a function" defect BEFORE they reasoned. Both headline rejections restate a
  finding the instrument supplied. B: "the recorded defect is exactly right."
  Agreement on a pre-disclosed conclusion is shared input, not corroboration.
BOTH CHARTERS POINTED THE SAME WAY. "Function killer" and "absence architect" both
  succeed by defeating the candidate. THERE WAS NO DEFENDER CHARTER. Two adversaries
  of one target agreeing is redundancy. Independence requires OPPOSED INCENTIVES,
  and these were not opposed.
THE VARIED FACTOR COLLAPSED. P3 wording was the nominal between-reviewer variant,
  but BOTH reviewers reported under BOTH wordings, so it discriminated nothing.
  Role was the only live factor — see above.
```

What the agreement licenses, weakly, and only this far:

```text
1  the construction claim's survival — NOT pre-disclosed as true, affirmed from
   opposite charters, neither used an interval-observing entity
2  failure of the WEAKER restatement — not pre-disclosed, and reached by
   INCOMPATIBLE routes (A: unfalsifiable and empty; B: answered and therefore
   closed). Convergence on outcome via disjoint reasoning is the strongest
   corroborated element here.
3  step-individuation underdetermination — unprompted, bilateral, out-of-row
```

### FORBIDDEN on this row

```text
"the candidate is refuted / unnecessary"        NOT ESTABLISHED =/= refuted
"the container owes no semantics"               the opposite position is EQUALLY
                                                 UNPROVEN; A declined to establish it
"B named a workflow, so the row is not empty"   two steps out, on ungranted premises
"partial consequences are undesirable"          WITHHELD by the packet; B assumed it
"A and B agreeing corroborates the verdict"     pre-disclosed kill, same-direction
                                                 charters, collapsed variant
"P1-P6 should be widened"                       the strongest alternative is evidence,
                                                 not a licence
"U1/U2/U2b/U3 are four findings"                one ungranted region, named four ways
```

### PARKED REOPENING CONDITIONS — conditions, NOT tasks

Each satisfied only if some **independently motivated** row happens to grant it:

```text
- multiple writers PLUS caller mortality PLUS state outliving its writer
  (C2 + C4 + C5) are granted for their own reasons. Then B's residue class becomes
  nameable and a candidate of this shape is reachable again.
- P3/P5/P6 step individuation is settled elsewhere, determining whether a
  non-closing group leaves a recorded step. A's dilemma then collapses to one horn.
  A CONSEQUENCE TO NOTICE, NOT A REASON TO SETTLE IT.
- a grant appears that a write sequence may terminate partway (C6). Shared with
  U5b-A, and still not pursuable from either row.
```

**None may be pursued, established, or benchmarked to make this candidate decidable.**

### INSTRUMENT DEFECT FOUND BY GATE 2 — affects every Gate 1 run so far

```text
Gate 1 has NEVER had a defender charter. Reviewer A (function killer) and Reviewer B
(absence architect) BOTH succeed by defeating the candidate. Every "survival not
established" this method has produced was reached by two same-direction adversaries.

This does NOT invalidate the closures. A candidate that cannot name its own casualty
fails regardless of who is asking. What it invalidates is any reading of A/B
agreement as INDEPENDENT CORROBORATION — and that reading has now been struck four
times, each time as if it were a fresh error, when the cause is structural.

WHETHER TO ADD A DEFENDER CHARTER IS RESERVED. It changes what "survival" MEANS in
this method, which is a semantic choice about the standard of evidence, not a repair.
NOT A WORK ORDER.
```

> **SUPERSEDED 2026-08-20 — the defender charter was GRANTED, constrained to public
> API / DX / core-semantic rows. See the DEFENDER CHARTER section. The paragraph
> above is retained because its account of WHY the choice was not the implementer's
> is unchanged.**

## U5b-D — SHARED ATTRIBUTION: PREREGISTRATION PACKET

**STATUS: OPENABLE. The packet below is the repaired instrument.** Two defects were
found in the frozen preregistration; both are repairable **without semantic choice**,
both repairs are **strictly weakening**, and — following the U5b-B precedent — the
frozen wording is retained verbatim beside each repair rather than edited in place.

### ROW CLASS DECLARATION — required before the row opens

```text
ROW CLASS   CORE SEMANTIC
            The candidate asks what the container MEANS by a group of writes: is
            grouping exhausted by reversal granularity, or does a group carry
            anything else?

DEFENDER    SEATED. Core-semantic rows are in the charter's scope.
            This is the FIRST row to open with three Gate 1 seats.
```

Declared here, before opening, as the charter requires — so the class cannot be
chosen afterward to fit a desired seating.

### DEFECT 1 — the DECISIVE QUESTION borrows U5b-A's failed antecedent

**This is the defect that made U5b-C unopenable, and it is present in D.** The
cheap check performed when C was closed quoted **only D's candidate line** and
concluded `NO BORROWED ANTECEDENT FOUND`. D's decisive line was never quoted, and
the borrowed noun is in it.

```text
AS PREREGISTERED (frozen wording, retained, not edited in place)
  what becomes impossible if the only surviving fact is the grouped canonical
  transition?
```

```text
"the grouped canonical TRANSITION"
   "canonical transition" is U5b-A's candidate noun — "several related writes must
   become one externally coherent canonical transition". U5b-A is TERMINAL —
   UNDERDETERMINED. The noun names a thing this family has NOT established exists.

As worded, D asks what becomes impossible if the only surviving fact is a thing
whose existence is undetermined. That is C's defect exactly, and the rule against
it is symmetric: struck for A into B, for B into C, and now for A into D.
```

**Why the repair involves no semantic choice.** P5 supplies its own words for what
is granted. Substituting them removes A's noun and **puts nothing in its place**:

```text
REPAIRED DECISIVE QUESTION — the borrowed noun replaced with P5's granted content
  what independently valuable workflow becomes impossible if the only fact that
  survives about several grouped writes is that they revert as one step?
```

```text
WHAT CHANGED     a noun naming an unestablished thing -> the premise's own wording
WHAT WAS ADDED   nothing
DIRECTION        strictly weakening: the question now demands an IMPOSSIBLE
                 workflow, matching the burden form used on every other row
```

### DEFECT 2 — the CANDIDATE carries an unearned qualifier

```text
AS PREREGISTERED (frozen wording, retained)
  several writes must retain a shared semantic fact beyond merely reverting as one
  confirmed step
```

```text
"CONFIRMED" appears in NEITHER P5 NOR P6.
  P5 grants: "Several writes may be GROUPED so that they revert as one step."
  P6 grants: LIFO stepping; selective or arbitrary earlier-step reversion NOT
             granted.

Neither premise qualifies a step as confirmed or unconfirmed. The qualifier's
nearest source in this ledger is U5b-A's opposite contract — "P5 governs only
confirmed reversal granularity" — which was STRUCK as an author stipulation that
handed the null its answer. Carrying the word into D risks carrying the struck
stipulation with it.

"MERELY" is mildly loaded. It presupposes that reverting as one step is a lesser
thing. Recorded; not decisive on its own.
```

```text
REPAIRED CANDIDATE — qualifier dropped, nothing substituted
  several writes must retain a shared fact beyond reverting as one step
```

```text
DIRECTION  strictly weakening. "One step" is a WIDER class than "one confirmed
           step", so the fact must now exceed MORE, and the candidate is
           correspondingly harder to establish.
```

**Left alone deliberately:** _"shared semantic fact"_ stays unnamed. The original
preregistration's note — _"stated deliberately without a name for the fact; only if
the answer is yes should vocabulary for it emerge"_ — is the strongest thing about
this row's wording and is preserved intact.

### INDEPENDENCE CLAIM — a construction property, FALSIFIABLE, not a finding

```text
U5b-A closed on a missing grant: an entity able to observe the interval between two
writes.

D'S CLAIM TO INDEPENDENCE
  D asks what a group RETAINS. A retained fact is examinable at rest — before any
  reversal, after one, or with no reversal ever occurring. D never asks what is
  true DURING a sequence.

IF GATE 1 FINDS D cannot be stated without an interval observer
  -> D CLOSES as inheriting U5b-A's blocker. It does NOT become a request to
     establish the observer. That move has been struck three times.
```

Exposed to Gate 1 as the first thing to attack.

### THE FROZEN PREMISES THIS ROW IS OPENED AGAINST

Quoted verbatim from the frozen section, **including P3 as frozen by the 2026-08-20
product decision**. This is the first row opened against a P3 that is not split.

```text
P1. A state container holds canonical application state as addressable positions.
    Reads observe positions; writes replace values at positions immutably.
P2. A collection of members with dynamic keyed membership is required: members
    addressable by key, key set enumerable, a key's absence is itself a
    representable value.
P3. An operation may be REVERTED: canonical state returns to a configuration it
    previously held, at boundaries a user would recognize as discrete steps, and
    can be advanced again afterwards.
P4. Some positions may be excluded from the revertible record.
P5. Several writes may be GROUPED so that they revert as one step. This is already
    granted. The candidate must exceed it.
P6. Reversion currently grants last-in-first-out stepping. Selective or arbitrary
    earlier-step reversion is NOT GRANTED, and a row may not require it unless that
    function independently earns itself.
```

```text
WHAT THE P3 FREEZE GIVES THIS ROW
  the TEXT, unsplit. Both killers and the defender read the same clause.

WHAT IT DOES NOT GIVE THIS ROW
  any grant that the perceiving entity observes between writes, or at finer
  resolution than a step. The freeze settled the words, not their observational
  content, and U5b-A's parked condition #1 remains parked.

If any seat's argument turns on P3's agent having sub-step resolution, that is a
FINDING that the row needs an ungranted condition — recorded, never pursued.
```

### OPPOSITE POSITION — UNPROVEN, symmetric with the candidate

```text
OPPOSITE POSITION — UNPROVEN. Offered for attack on the same footing as the
candidate. NOT a verdict, NOT a premise reading, NOT the author's view.

  Grouping is exhausted by reversal granularity. A group of writes retains nothing
  beyond reverting as one step, and the container owes nothing further.
```

Deliberately silent about what callers can or cannot do instead. An opposite that
asserted _"callers can hold such a fact at a canonical position"_ would answer a
question this row may need to decide.

**Does a route to its invalidity exist?** The stop-condition requires one be
_available_, not correct.

```text
ROUTE, UNEVALUATED — P4 grants that some positions may be excluded from the
revertible record. The premises therefore already recognize that a position's
RELATIONSHIP TO THE RECORD is itself a decision with two settings.

Consider a fact describing a group, held at a canonical position under P1. It is
either inside the revertible record or outside it (P4). Inside: reverting the group
also reverts the description. Outside: the description survives a reversal that
removed what it describes. If NEITHER placement is coherent, the incoherence sits in
the container's own record rather than in caller data, and "the container owes
nothing further" would not reach it.

NOT ASSERTED: that either placement is incoherent. That is the row's question.
```

Because a route exists, **the packet clears the stop-condition.**

### ANTI-STIPULATION LEDGER — what the packet is silent on

Every item is a question this row might need to decide.

```text
NOT ASSERTED  that any consumer of a shared fact exists
NOT ASSERTED  that a fact shared by several writes is desirable, or that its
              absence is a loss. "It would be better to have one" is a value
              judgement that supplies the requirement by assumption — the
              invented-P3-theorem error in a new costume
NOT ASSERTED  that "semantic fact" names anything. The candidate withholds a name
              and no seat may supply one
NOT ASSERTED  that a group has any identity distinct from its member writes
NOT ASSERTED  that grouping IS confined to reversal granularity
NOT ASSERTED  that grouping is NOT confined to reversal granularity
              — the symmetric pair is deliberate. A's struck stipulation would
                DECIDE this row outright, and so would its negation
NOT ASSERTED  that a group persists as a durable thing at all, before or after
              reversal
NOT ASSERTED  that reversal ever in fact occurs for a given group
NOT ASSERTED  that a caller may choose a position's placement relative to the
              revertible record. P4 grants that SOME positions may be excluded; who
              decides, and on what basis, is not granted
NOT ASSERTED  that the container currently has or lacks such a fact. Implementation
              behaviour is not in evidence on this row at any rung
```

### STIPULATION-LEAKAGE SELF-CHECK

```text
STANDING TEST, per clause
  Would this sentence COUNT AS A FINDING if a reviewer produced it?
  If yes, it does not belong in the packet.
```

```text
CLAUSE                                   ANSWERS A ROW QUESTION?   DISPOSITION
candidate, frozen wording                YES — "confirmed"         DEFECT RECORDED,
                                         imports a struck          wording retained,
                                         stipulation               repair alongside
decisive question, frozen wording        YES — presumes A's        DEFECT RECORDED,
                                         canonical transition      repair alongside
                                         exists
repaired candidate                       NO                        admissible
repaired decisive question               NO                        admissible
opposite position                        NO — asserts nothing      admissible
                                         about caller capability
route-to-invalidity                      NO — marked UNEVALUATED   admissible
independence claim                       NO — marked FALSIFIABLE   admissible
P3-freeze scope note                     NO — restates a recorded  admissible
                                         decision's limits
```

Applied and **rejected from this packet**: _"P1-P6 give a group no content beyond
reversal"_ — that is Reviewer A's verdict, and seating it in the instrument would
hand A its conclusion. Also rejected: _"a caller can simply store the fact"_ — that
is the defender's obstacle to clear or the killer's rival to offer, not the
author's assertion.

### FORBIDDEN IMPORTED CONCEPTS

```text
FAMILY-LEVEL (U5b preregistration)
  prepare · commit · publish · effect · transaction · turn · pending rollback
  causal attribution · speculation

ROW-SPECIFIC — each NAMES THE SOLUTION, and using one decides the row by vocabulary
  label · tag · metadata · annotation · reason · intent · description · provenance
  correlation id · batch id · changeset · commit message · audit trail · history
  entry · group name · undo label

U5b-A's VOCABULARY (importing any re-opens A's blocker inside D)
  observer · interleaving · intermediate configuration · torn ·
  observationally atomic · forward-path coherence

INCUMBENT
  entityMap · SubjectId · effect log · turn store · reversal planner · time-travel

PERMITTED
  several writes · grouped · revert as one step · the record · a position · a value
  a caller · what is true afterward · the container
```

If the row cannot be stated in the permitted vocabulary, **that is a finding about
the row**, not a licence to widen the vocabulary.

### WHAT MUST NOT BE INHERITED FROM A, B, OR C

Siblings, not parents. They grant this row nothing.

```text
1  A's "grouping governs only confirmed reversal granularity"
     Author stipulation, STRUCK, never a finding. It would DECIDE D outright and is
     the single most dangerous import into this row.
2  A's UNDERDETERMINED disposition, as a prior or a prediction
3  A's blocker (the missing interval observer), as a settled bar on the family.
     Whether D needs it is what the independence claim exposes.
4  A's struck Branch A, the common-ancestor write
5  B's FUNCTION NOT ESTABLISHED, as a prior or a prediction
6  B's five ungranted conditions — writer identity, multiple writers, an
     unmodifiable writer, caller mortality, state outliving its writer.
     If a D casualty needs one, that is a RECORDED CONDITION, not a foundation.
7  C's non-openability finding. It is about C's INSTRUMENT, not about any function
8  Any framing in which two or three seats agreeing corroborates a verdict when
     they read the same premises. Premise-correlated. Struck four times; the
     defender charter is the structural answer, and it does not license the old
     reading between the two killers
9  From the P3 freeze: any reading that the perceiving entity was DERIVED, or that
     it observes at finer resolution than a step

MAY BE CITED — only as what it is
  "the U5b-A closure records X", never "X is established".
```

## U5b-D — SHARED ATTRIBUTION: UNDERDETERMINED. Not decidable as posed. Terminal.

```text
A (killer)       FUNCTION SURVIVAL NOT ESTABLISHED
B (absence)      A COHERENT ABSENCE EXISTS, CONDITIONAL on eight ungranted
                 conditions — and B reports it may have RELOCATED the candidate
                 into caller-space rather than eliminated it
D (defender)     NO ADMISSIBLE DEFENCE FOUND
GATE 2 / interp  UNDERDETERMINED
GATE 2 / charter NO ADMISSIBLE DEFENCE FOUND, but the row is NOT DECIDABLE AS
                 POSED and the defender's headline concealed that

DISPOSITION      UNDERDETERMINED. TERMINAL. Not "rejected", not "refuted".
NULL             FORBIDDEN
MEASUREMENT      NONE, at any rung. Every claim on this row is analytic over a
                 frozen text.
DEFENDER         SEATED. First row in this derivation with three Gate 1 seats.
```

### THE HEADLINE FINDING — the defender could not have failed informatively

**This is the most important thing the row produced, it is about the METHOD rather
than the candidate, and it lands on the author's own packet.**

The packet praised its own decision to leave the shared fact **unnamed** as _"the
strongest thing about this row's wording."_ Gate 2 established that the same choice
**guaranteed the defender's null result in advance**:

```text
Seat A: "with the fact unnamed the candidate quantifies over arbitrary content,
which has no failing case."

Gate 2 drew the symmetric half that no Gate 1 seat drew:
  an unnameable existential has NO SUCCEEDING CASE EITHER.

So D's failure to name a casualty is the GUARANTEED OUTPUT OF THE CHARTER DESIGN,
not evidence about the candidate.
```

```text
CONSEQUENCE, and it is binding

The charter's "DEFENDER FINDS NOTHING -> THE CLOSURE STRENGTHENS" branch
MUST NOT FIRE on this row. The defender was not in a position to fail
informatively, so its null carries near-zero weight as corroboration.
```

Both things about the unnamed fact are true at once and the record carries the
tension rather than resolving it: leaving it unnamed **prevented** the row from
being decided by vocabulary, and it **also** made a defence unstateable. A row that
forbids every name for the thing it is testing has bought neutrality at the price of
decidability.

```text
⚠️ THE TENSION IS RESOLVED FOR THIS ROW BY AUTHOR DECISION 2026-08-20, AGAINST THE
   FIRST HALF. Two clauses of that decision bear on it: the naming rule
   ("incumbent-neutral does not mean function-anonymous") and its explicit finding
   that U5b-D "supplied no sufficiently named semantic proposition to defend". So
   the unnamedness is a DEFECT IN THE CANDIDATE, not a purchase of neutrality.

   AND THE ROW'S TERMINAL ISSUE IS THEREFORE TWO-PART: the instrument guaranteed the
   null AND the row supplied no sufficiently named semantic proposition to defend.
   NEITHER RESCUES THE OTHER — the corrected D1's requirement (1) is not satisfiable
   by this candidate, so repairing the procedure would not make the row answerable.

   DISPOSITION UNDISTURBED. Not reopened, no seat re-run, no rewording.
```

### WHICH DISPOSITION BRANCH FIRED — both readings argued, then chosen

All three seats independently located the row's decision on the same unmade grant:
**whether the record is readable by a caller, separately from reading positions.**
A's condition R, B's C1, D's C3.

```text
COMMON-CAUSE READING
  All three read identical premise text. P1 says "Reads observe positions" and no
  premise mentions reading the record. Noticing that is one property of the premise
  set restated three times. Under the standing rule — struck four times in this
  ledger — agreement traceable to shared text is worth NOTHING as corroboration.

SAME-MISSING-GRANT READING
  The three arrivals are not concordant; they are MUTUALLY CONTRADICTORY IN WHAT
  THEY DEMAND OF THE SAME SWITCH.
      A's condition R   the CANDIDATE requires the record READABLE
      B's C1            the ABSENCE requires the record NOT READABLE
      D's C3            recorded as the reopener, against its own interest
  Common cause looks like three seats asserting the SAME reading of a premise. Two
  seats asserting OPPOSITE required settings of one unmade grant is the signature of
  a bivalent pivot.
```

```text
CHOSEN: the SAME MISSING GRANT branch. UNDERDETERMINED.

STRENGTH IS BOUNDED TO EXACTLY ONE THING — the LOCATION of the gap. It corroborates
NO claim about whether the function is required. And the missing grant is TERMINAL:
it may not be reissued as a task.
```

### THE PIVOT IS DISSOLVING, NOT DECIDING — and this forecloses the usual bad move

Seat B: _"if a readable record holding per-step positions and values were granted,
then several writes would already retain something beyond reverting as one step,
with no new function at all."_

```text
RECORD READABLE     the candidate's content is satisfied BY PREMISE.
                    No function established.
RECORD UNREADABLE   B's absence stands, conditional on C2-C8.
                    No function established.

UNDER EITHER SETTING, NO FUNCTION IS ESTABLISHED.
```

**So this row cannot be resolved in the candidate's favour by supplying the missing
grant.** That forecloses the standing illicit move of reading UNDERDETERMINED as
"pending a grant we should go get."

```text
QUALIFICATION, recorded against B. C1 arguably overreaches. A readable record whose
contents include the step boundary would expose the fact "these writes revert as one
step" — which is the P5 grant merely made OBSERVABLE. Whether making a granted fact
observable constitutes retaining something BEYOND it is a definitional question the
premises do not settle. The first horn is softer than B states. Recorded as B's
CONSTRUCTION, not as established.
```

### PREMISE-WIDENING AUDIT — all three seats, and the pattern is the finding

Gate 2 found the **same species of move in every seat**, disclosed in one and
undisclosed in two.

```text
SEAT  WIDENING                                          DISCLOSED?  LOAD-BEARING FOR
A     "P4 already grants exactly one way for anything    NO          A's BLOCKS-CLOSE 5
      to survive reversion" — P4 says some positions
      MAY be excluded; A converts a permission into a
      uniqueness-and-exhaustiveness claim
A     "there is no third case under the granted          NO          A's whole dichotomy
      premises"
B     "the container has exactly two places anything     NO          B's central claim
      can sit — positions and the record. No third                   that "beyond" has
      place." P1-P6 never state this                                 nowhere to live
D     "steps are totally ordered", inferred from         YES         Rival B, which
      P6's "last-in-first-out stepping"                              DEFEATED defences
D     "the boundaries, in both directions, are the       YES         the re-advance
      steps"                                                         sub-case
```

```text
THE PATTERN: every closure in all three reports rests on an EXHAUSTIVENESS CLAIM
that is an ARGUMENT FROM SILENCE in the frozen text. And there is direct internal
evidence the frozen set is UNFINISHED rather than exhaustive — the P3/P4 tension,
flagged independently by B and D, where reverting recorded positions while excluded
positions stay put yields configurations canonical state never held.

A premise set with a known unresolved internal tension cannot support closures
derived from its silences.
```

Two consequences drawn, neither of which changes the disposition:

```text
1  D's Rival B — the construction that DEFEATED defences — rests on a disclosed
   ungranted inference. So part of the defender's failure is MANUFACTURED BY AN
   UNGRANTED GRANT, and D's null is weaker than D reported, in the CANDIDATE's
   favour.
2  B's credit, recorded: B's own C3 self-reports that "P6's LIFO presupposes a
   single stack but does not say so" — correct handling of exactly the species of
   gap B elsewhere committed silently.
```

### SEAT A's CENTRAL INFERENCE IS SCOPE-LIMITED, not general

A: _"a fact with no expression in positions and values cannot make any workflow over
canonical state impossible."_

```text
SOUND      P1 fixes the observable surface at positions. A fact with no positional
           expression changes no read.
UNSOUND 1  The decisive question asks for an INDEPENDENTLY VALUABLE WORKFLOW. A
           silently substitutes "a workflow over canonical state" — which DEFINES
           B's one failure class out of existence by fiat rather than answering it.
           B withdrew that class on other grounds, so no casualty results, but A's
           claim MUST NOT be recorded as a general result.
UNSOUND 2  "Distinguishes no two STATES" is not "distinguishes no two WORKFLOWS."
           Workflows can be history-sensitive at identical states. D closed the
           obvious case (re-advance) — so A's inference is PATCHED FROM ANOTHER
           SEAT, and that patch rests on D's disclosed ungranted inference.
```

A's indistinguishability claim is additionally **a rung-2 statement asserted from
rung zero** — "an alternative model reproduces the behaviour", with no model built
and nothing observed. Demoted to a conjecture about the frozen text.

### SEAT B RELOCATED THE CANDIDATE — how far that damages the absence

B, against its own interest: _"C2 works by having the caller retain, outside the
container, exactly a shared fact about several writes that outlives their reverting
as one step. My architecture does not show that fact is unnecessary. It shows the
container is not where it lives."_

```text
The candidate reads "several WRITES must retain..." and writes live in the container
(P1), so the container-scoped reading is the better textual fit. On that reading
relocation is a GENUINE ABSENCE and B's architecture survives.

THE DAMAGE IS A DOWNGRADE IN KIND, not a refutation:
  FROM  "the shared fact is unnecessary"
  TO    "the container is not shown to be its necessary carrier"

C7 reaches the same place independently of C2: where two groups touch overlapping
recorded positions with different repair rules, selecting the rule after a reversion
requires knowing which group was reverted.

FURTHER, not drawn by B: the caller-with-memory is machinery P1-P6 do not furnish,
so the relocation is not a construction purely from the frozen text.

"A PARTICULAR CARRIER SURVIVES" is the TOP RUNG. B's relocation admission is a
refusal to climb it, correctly. The absence architecture is therefore NOT CITABLE as
evidence about carriers in EITHER direction.
```

### THE REOPENING-CONDITION SET IS DISPUTED THREE WAYS — recorded as disputed

The disposition is stable under all three readings. Only the **conditions** differ,
and conditions are **not work orders**, so the dispute is recorded rather than
resolved. Manufacturing a resolution here would be manufacturing decidability.

The disputed object is the defender's strongest construction — **two groupings open
at once whose writes fall among one another** — which D built, kept, and correctly
identified as the only thing that resists Rival A. D dismissed it on two legs.

```text
LEG (i)   P5 grants ONE grouping; it is silent on two open at once with interleaved
          writes. UNCONTESTED BY ANYONE. Sufficient on its own to defeat the
          casualty, which is why the verdict holds regardless of the dispute below.

LEG (ii)  D: "even granted, reverting one while the other stands is reversion of a
          portion that is not the LIFO top, which P6 forbids."

  READING 1 — D's own. P6 bars it.
  READING 2 — the charter audit. LEG (ii) IS UNSOUND. P6 grants "last-in-first-out
          STEPPING" and P5 makes a grouping "one STEP", so the unit of LIFO is the
          step. Two groupings closing in sequence are two steps in sequence, and
          reverting the later-closing one IS the top step. Leg (ii) requires reading
          P6 as ordering WRITES, which contradicts P5. On this reading the casualty
          reopens on C1 ALONE — one light silence in P5, not the heavy P6 grant —
          and would then be an ADMISSIBLE DEFENCE, not a gap.
  READING 3 — RAISED BY THE CONTROLLER, UNREVIEWED, and it cuts against reading 2.
          P3 grants that "canonical state returns to a CONFIGURATION IT PREVIOUSLY
          HELD". With writes interleaved w1(G1) w2(G2) w3(G1) w4(G2), reverting G1
          alone yields {w2,w4 applied, w1,w3 not} — a configuration the container
          NEVER HELD. So the bar may be P3, which NEITHER D NOR THE AUDITOR NAMED,
          rather than P6. If so the casualty needs a relaxation of P3 as well as C1,
          and reading 2's "reopens on C1 alone" is too generous.
```

```text
DISPOSITION ON THE DISPUTE: UNRESOLVED, AND LEFT SO.
  Reading 3 is the controller's, is UNREVIEWED, and is recorded at the same status
  as the other two — not promoted because the controller wrote it. Resolving it
  would settle what the reopening conditions are, and this row has no standing to
  do that: reopening conditions are not pursued.

STRUCK FROM THIS ROW REGARDLESS: D's C5, "a resolution of the P3/P4 tension." It
names a DELIVERABLE SOMEONE MUST PRODUCE, not a premise that could be granted, and
D itself said the tension "exists with or without the candidate". Out of row.
Recorded instead as an observation against the premise set.
```

### WHAT IS ESTABLISHED, NARROWLY

```text
1  Three seats — one of them charged to succeed by finding a casualty — produced
   ZERO admissible casualties under P1-P6. This is a fact about the seats' output,
   NOT about the world, and per the headline finding its evidential weight is near
   zero because the null was charter-guaranteed.
2  A conditionally coherent absence exists, contingent on eight ungranted
   conditions. Coherence-under-conditions is a CONSISTENCY RESULT over the premise
   set, not a finding that the function is unnecessary.
3  The candidate AS WORDED has no falsifiable contract. The fact is unnamed, so it
   quantifies over arbitrary content: no failing case AND no succeeding case.
4  The row's decision rests on a grant P1-P6 do not make, and supplying that grant
   DISSOLVES the row rather than deciding it.
```

### WHAT IS NOT ESTABLISHED

```text
NOT   that the candidate is refuted
NOT   that the OPPOSITE POSITION holds. A's indistinguishability claim is itself
      conditional on the record being unreadable, so the opposite inherits the same
      gap and remains EXACTLY AS UNPROVEN as it started
NOT   that grouping is exhausted by reversal granularity
NOT   that grouping is NOT exhausted by reversal granularity
NOT   anything about a carrier, in either direction
NOT   that the closure is corroborated by three seats agreeing
```

### THE STRONGEST ALTERNATIVE INTERPRETATION — may be right

> The procedure could not have produced any other output, so the row produced **no
> information about the candidate at all**. What it produced is a **diagnosis of the
> premise set**: record readability unspecified, the P3/P4 tension unresolved, LIFO's
> single-stack unspecified, one-versus-many open groupings unspecified. On this
> reading the three verdicts are artefacts of an under-specified premise set being
> interrogated by seats that each closed its silences by argument-from-silence.

It converges on the same disposition by a different route, which is why the
disposition is safe even though the reasoning under it is contested.

## DEFENDER CHARTER — FIRST-OUTING AUDIT. Three repairs applied, two RESERVED.

> **⚠️ R1 AND R2 WERE RESOLVED BY THE AUTHOR ON 2026-08-20.** This section is the
> AUDIT RECORD and is retained unedited, because the reasoning that identified the
> two gaps is still the reason they had to be settled from outside this ledger. The
> decision itself is in
> [DEFENDER PROCESS REPAIR](#defender-process-repair--2026-08-20-r1-and-r2-resolved-by-the-author).
> Cite the repair, not this section, for what the procedure now is.

The charter was granted and used on the same day. An independent audit of **the seat
as an instrument** — given the charter and the defender's report only, and
deliberately NOT the killers' reports — returned:

> _"It discharged its charge — narrowly. It produced the one artefact no killer
> would have produced, but its centre of gravity was killer work, one leg of its
> central dismissal is unsound on the frozen text, and its reopening-condition set is
> wrong in the direction that makes closure look more durable than it is."_

```text
EVIDENCE THE SEAT DID NOT COLLAPSE INTO A THIRD KILLER — weighted decisive
  it BUILT the alternating-groupings casualty, KEPT it, and correctly identified it
    as the only construction resisting its own strongest rival. A killer does not
    manufacture the one argument that survives its own best weapon and then flag it
  it refused two free wins for the closure side: declined to claim the P3/P4
    tension, and flagged two of its own inferences as unearned KNOWING they were
    load-bearing FOR ITS ANTI-CANDIDATE REASONING
  clean on the no-archaeology rule, under the exact temptation predicted for it

EVIDENCE OF DRIFT TOWARD THE ROOM'S DISPOSITION
  the seat produced ZERO instances of admissible output #2 — it never pushed against
    a killer once
  Rival A and Rival B are stated as UNIVERSALS, not as defeats of the specific
    casualty in hand. That is killer inventory, now sitting in the record
  its own self-audit contains the confession, offered as a virtue: "Where finer
    resolution would have helped a defence, I closed it against the candidate
    instead." A defender resolving a silence AGAINST what it defends is drift
```

### REPAIR 1 — APPLIED. Rule 1 is BIDIRECTIONAL, and a flagged inference quarantines the verdict

```text
An inference beyond the frozen wording is a BREACH REGARDLESS OF WHICH SIDE IT
FAVOURS. The rule's rationale is directional; its text is not, and the text governs.
The premise set is SHARED and the closure INHERITS it — a NOT-ESTABLISHED closure
resting on a widened premise is exactly as unsound as an ESTABLISHED one. In a
derivation struck four times for over-crediting closure, a widening that STRENGTHENS
closure is the more dangerous species, not the safer one.

Any inference flagged as load-bearing must be QUARANTINED: the verdict is restated
without it, or the verdict is marked provisional.

THE SELF-AUDIT SECTION IS NOW MANDATORY for every seat, not just the defender. It
was unprompted here and was the single most valuable thing the seat produced.
```

Applied retroactively to this row: D's Rival B is quarantined, and D's verdict stands
**on Rival A alone**.

### REPAIR 2 — APPLIED. A rival may be constructed only as narrowly as the casualty in hand

```text
A rival construction may be built ONLY as narrow as needed to defeat the SPECIFIC
casualty just stated, and must be WRITTEN AS the defeat of that casualty.
Universally quantified rivals are killer output and are out of scope for the
defender.

This also closes a Rule 5 loophole the outing exposed: Rule 5 bars designing the
CANDIDATE's mechanism, and the seat designed the RIVAL's mechanism in some detail
instead. That aperture is where the killer work entered.
```

### REPAIR 3 — APPLIED. The headline verdict must carry any non-decidability finding

```text
The report contained TWO dispositions — "no admissible defence found" and "the row
is not decidable as posed" — and only the first was in the headline. THE GATE READS
HEADLINES.

REQUIRED FORM: "NO ADMISSIBLE DEFENCE FOUND; ROW NOT DECIDABLE AS POSED ON <conditions>"

Without this, a preserved non-decidability finding is consumed as clean corroborated
closure — the exact misreading struck four times, arriving in a new costume through
the seat built to prevent it.
```

### RESERVED TO THE HUMAN AUTHOR — two repairs an implementer may not make

```text
R1  THE CHARTER CONTAINS AN INTERNAL CONTRADICTION AS WRITTEN.

    Admissible output #2 is "a demonstration that a rival construction THE KILLERS
    RELY ON is unavailable under the frozen premises."

    Burden rule 4 gives the defender THE SAME WITHHELD PACKET AS THE KILLERS — so
    the defender never sees the killers' rivals and CANNOT ATTACK THEM. Output #2 is
    UNREACHABLE. As written the charter permits a null verdict from a seat that never
    touched the killers, which is the structural gap the seat exists to close.

    PROPOSED, NOT APPLIED: a second pass. Pass 1 sealed and independent as now; pass
    2 seeded with the killers' RIVAL CONSTRUCTIONS ONLY — not their verdicts, not
    their rationale — with the defender permitted only to disqualify them.

    WHY RESERVED: it changes what a defence IS and what withholding protects. That
    is a semantic choice about the standard of evidence, on the same footing as the
    decision to seat a defender at all.

R2  THE DEFENDER HAS NO STATED DISPOSITION.

    The killers have one ("nothing survives"). The defender was given none, so it
    defaulted to the room's — and said so out loud.

    PROPOSED, NOT APPLIED: "the candidate stands as required until a rival is shown
    AVAILABLE from the frozen text. Silence in the premises is not a grant to the
    rival either: where the premises are silent on a fact a casualty needs, the row
    is NOT DECIDABLE and the silence is recorded as a condition. The defender may not
    close a silence against the candidate."

    WHY RESERVED: a disposition is precisely what makes a seat adversarial. Setting
    the defender's is setting the burden of proof for every future row in scope.

NEITHER IS A WORK ORDER. Rows may open under the charter as it stands, carrying this
audit. The next defender outing inherits repairs 1-3 and the unrepaired R1/R2.
```

> **⚠️ THE LAST SENTENCE IS SUPERSEDED.** "Rows may open under the charter as it
> stands" was REVERSED by author decision on 2026-08-20: no further U5b row opens
> until the procedure is repaired, and it now is. The clause is retained because the
> reasoning behind it — a gap may not become a task — remains correct; what it got
> wrong was inferring that a defective instrument may therefore keep running.

## P1-P6 — THE FROZEN PREMISES WERE NEVER RECORDED. Transcribed here.

**This section is TRANSCRIPTION, not authorship.** Every packet in this derivation
says `GRANTED P1-P6 only`, and until now **P1-P6 had no verbatim statement anywhere
in this repository or its history.** The text existed only inside the reviewer
prompts of a single session. A premise set that lives only in an ephemeral
transcript is not frozen — it is remembered, and it drifted. See the divergence
below, which is not hypothetical.

The wording below is quoted **exactly as issued**. Where variants were issued, all
variants are given. **No variant is promoted to canonical here** — choosing between
them is a semantic act with authority over every row in the family, and it is
recorded below as a decision this ledger does not have the standing to make.

### AS ISSUED to Reviewer A (function killer), U5b-A / "grouping row"

```text
P1. A state container holds canonical application state as addressable positions.
    Reads observe positions; writes replace values at positions immutably.
P2. A collection of members with dynamic keyed membership is required: members
    addressable by key, key set enumerable, a key's absence is itself a
    representable value.
P3. An operation may be REVERTED: canonical state returns to a configuration it
    previously held, at boundaries a user would recognize as discrete steps, and
    can be advanced again afterwards.
P4. Some positions may be excluded from the revertible record.
P5. Several writes may be GROUPED so that they revert as one step. This is already
    granted. The candidate must exceed it.
P6. Reversion currently grants last-in-first-out stepping. Selective or arbitrary
    earlier-step reversion is NOT GRANTED, and a row may not require it unless that
    function independently earns itself.
```

### AS ISSUED to Reviewer B (absence architect), the SAME row

```text
P3. An operation may be REVERTED: canonical state returns to a configuration it
    previously held, at recognizable step boundaries, and can be advanced again.
P5. Several writes may be GROUPED so that they revert as one step. THIS IS ALREADY
    GRANTED — your architecture has it.
P6. Reversion grants last-in-first-out stepping. Selective or arbitrary earlier-step
    reversion is NOT granted.
```

P1, P2 and P4 were issued identically. P5 and P6 differ only in role framing and in
a restatement of the same grant — **not material.**

### THE MATERIAL DIVERGENCE IS P3, AND IT IS THE WORST POSSIBLE CLAUSE

> **RESOLVED 2026-08-20 by the human author — see
> [FREEZE EVENT — P3 is frozen on the AGENTFUL wording](#freeze-event--2026-08-20-p3-is-frozen-on-the-agentful-wording-as-a-product-decision).
> The agentful text is the premise; the agentless variant is RETIRED. What follows
> is the AUDIT RECORD of what each reviewer was actually shown, and it stays here
> unedited for that purpose. Do not quote P3 from this section — quote it from the
> freeze event.**

```text
A RECEIVED   "at boundaries A USER WOULD RECOGNIZE as discrete steps"
B RECEIVED   "at RECOGNIZABLE step boundaries"
```

The second is **agentless.** The phrase carrying a perceiving entity — _a user
would_ — is absent from B's packet. And U5b-A's terminal disposition relocates its
undecidability to precisely this clause: _"what is P3's observational content?"_

**Two entries in the U5b-A record are therefore false as written**, and are
corrected in that section:

```text
1  "Both read the SAME stipulated text"
     False at the decisive clause.

2  the STRONGEST ALTERNATIVE, built on "neither 'configuration' nor 'a user would
   recognize' is per-position"
     Built on wording ONLY A RECEIVED. B's silence about a perceiving entity is
     not evidence — B was never shown the phrase.
```

### An earlier variant, showing the drift is not a one-off

The continuation-row packets issued **five** premises, and P2 lacked the
absence-as-value clause that later packets carry:

```text
P2. A collection of members with dynamic keyed membership survives as a required
    capability: members can be added and removed after construction, each member
    is addressable by a key, and the set of keys can be enumerated.
P5. Several writes may be grouped so they revert as one step.
    [no P6 was issued at all]
```

So across this derivation the granted premise set **changed in count and in content
between rows**, with no freeze commit and no drift record. Rows closed against
`P1-P6` were closed against different premise sets.

### THE RULE THIS INSTALLS

```text
A packet MUST QUOTE the frozen premises from this section verbatim.
PARAPHRASING THEM INTO A PACKET IS FORBIDDEN — that is the channel the P3
divergence travelled through, and paraphrase is how "frozen" quietly became
"restated from memory, per reviewer, per row".

Any change to premise TEXT is a FREEZE EVENT: it is committed here, dated, with
the rows already closed against the previous text listed.
```

### RESERVED — not a defect this ledger may repair [RESOLVED 2026-08-20 by the human author]

```text
P3's wording was UNRESOLVED and RESERVED TO THE HUMAN AUTHOR.

Picking a variant decides whether the premise set contains a perceiving entity.
That single choice bears on U5b-A's terminal disposition, on the observational
content question its closure names, and on every future row in the family. An
implementer choosing it — in either direction — would be supplying by fiat the
premise the whole method exists to stop being supplied.

NOT A WORK ORDER. Nothing may be pursued, measured, or benchmarked in order to
settle it. It is recorded as reserved, and rows that do not depend on it proceed.
```

**The author has now decided it.** The record of that decision is the freeze event
immediately below. The paragraph above is retained unedited because it states why
the decision was not the implementer's to make, and that reasoning is still the
reason the decision had to come from outside this ledger.

## FREEZE EVENT — 2026-08-20. P3 is frozen on the AGENTFUL wording, as a PRODUCT DECISION.

**Authority: the human author. This is the first freeze event under the rule
installed above, and it is the template for any future one.**

### THE FROZEN TEXT

```text
P3. An operation may be REVERTED: canonical state returns to a configuration it
    previously held, at boundaries a user would recognize as discrete steps, and
    can be advanced again afterwards.
```

The variant issued to Reviewer B — _"at recognizable step boundaries"_ — is
**RETIRED**. It is not an alternative reading, a fallback, or a weaker form that a
row may fall back to. It was a transcription divergence, and it no longer exists in
the premise set. It remains visible in the transcription section above **only as the
audit record of what B was actually shown.**

### WHAT KIND OF ACT THIS IS — read this before citing P3 anywhere

```text
THIS IS        a PRODUCT / DX FREEZE. The author is stipulating what SignalTree
               must offer its users, in the author's own voice, on product
               authority. Stipulating the premises is exactly the author's job;
               that is what makes them premises.

THIS IS NOT    a theorem. No reviewer derived it. No gate established it. No
               experiment produced it. It is not the output of this method — it is
               an INPUT to it.
```

**The distinction is load-bearing and is the whole reason the freeze is worded this
way.** A premise that arrives as a product decision may be _used_; a premise that is
narrated as a _finding_ acquires evidentiary weight it never earned, and the next
row inherits it as established. That inheritance is the failure this ledger has
recorded more times than any other.

```text
FORBIDDEN FORMS OF CITATION
  "the reviewers established that P3 contains a perceiving entity"
  "P3's agentful wording survived Gate 1"
  "A and B agreed on the observational reading"
  "the perceiving entity is earned"

REQUIRED FORM
  "P3, as frozen by product decision on 2026-08-20, reads '... at boundaries a
   user would recognize as discrete steps ...'"
```

Reviewer B's silence about a perceiving entity remains **not evidence** — B was
never shown the phrase. Freezing the phrase does not retroactively convert that
silence into assent. Reviewer A's acceptance of the phrase is likewise **not
evidence** that it is right; A was handed it as a premise, and reviewers do not
validate premises by working from them.

### WHAT THIS FREEZE DOES NOT DECIDE — the parked condition is STILL PARKED

This is the trap the freeze is most likely to be misread into, so it is stated
before any row is allowed to cite it.

```text
U5b-A's parked reopening condition #1 reads:

    "P3's 'boundaries a user would recognize' settled as OBSERVATIONAL"

That condition is NOT satisfied by this freeze.

SETTLED BY THE FREEZE      WHICH WORDS ARE IN P3
NOT SETTLED BY THE FREEZE  WHAT THOSE WORDS GRANT
```

The freeze settles the **text**. It does not settle the **observational content** of
the text, and those are different questions:

```text
GRANTED, because it is now in the frozen text
  P3 speaks of a user recognizing step boundaries.

NOT GRANTED, and NOT to be read in
  that an entity may observe the interval BETWEEN two writes inside one step
  that a configuration exhibited mid-sequence is observable at all
  that "recognize a boundary" and "observe a state" are the same capability
  that the perceiving entity has any resolution finer than the step
```

U5b-A closed UNDERDETERMINED on a missing grant of **an entity able to observe the
interval between two writes.** Nothing above supplies that entity. A reading under
which it does supply it is _available_ — U5b-A's own STRONGEST ALTERNATIVE records
it — but **an available reading is not a grant**, and an implementer adopting it
would be committing the exact substitution this freeze event exists to prevent:
turning a product stipulation about reversal granularity into a derived
observational model of the forward path.

```text
CONSEQUENTLY
  U5b-A stays TERMINAL — UNDERDETERMINED. It is NOT reopened by this freeze.
  Whether P3's frozen wording is OBSERVATIONAL is a SEPARATE question, still
  reserved, and still not a work order.
```

### ROWS ALREADY CLOSED AGAINST THE PREVIOUS TEXT

Required by the freeze rule. **Listing a row here is disclosure, not
re-adjudication.** No disposition below is changed by this freeze; each is recorded
with the specific reason the freeze does not disturb it.

```text
ROW                          PREMISE TEXT IT SAW              EFFECT OF THE FREEZE

U5b-A                        A: agentful · B: agentless       NONE on the
  TERMINAL — UNDERDETERMINED SPLIT AT THE DECISIVE CLAUSE     disposition.
                                                              UNDERDETERMINED is a
                                                              non-verdict; it does
                                                              not become a verdict
                                                              because the text
                                                              settled. The two
                                                              false record entries
                                                              were already
                                                              corrected in
                                                              4f263c4a.

U5b-B                        divergence DISCLOSED to both     NONE. B closed on the
  CLOSED — NOT ESTABLISHED   reviewers, unresolved            absence of any
                                                              workflow, and both
                                                              reviewers AFFIRMED
                                                              that B needs no
                                                              interval observer. No
                                                              leg of that closure
                                                              runs through P3's
                                                              agent.

GATE 1 FIRST APPLICATION     five premises, weaker P2,        NOT ASSESSED. These
GATE 1 SECOND APPLICATION    NO P6 AT ALL                     rows diverge from the
UNDO-E4-G                                                     frozen set in P2 and
  all NOT ESTABLISHED                                         P6, which THIS freeze
                                                              does not touch. Their
                                                              premise-set drift is
                                                              recorded above and
                                                              remains open as a
                                                              separate disclosure.
```

**The last line is deliberate.** Fixing P3 does not repair the P2/P6 drift, and
this freeze event must not be cited as having tidied the premise set generally. It
froze one clause.

## DEFENDER CHARTER — Gate 1 gains a third seat, on named rows only

**Authority: the human author, 2026-08-20.** This resolves reserved item 2. Like
the P3 freeze it is a **decision about the standard of evidence**, not a finding,
and it changes what SURVIVAL MEANS from this point forward. It is **not
retroactive** — see the non-retroactivity clause below.

### THE PROBLEM IT ADDRESSES, restated without overstating it

```text
FUNCTION KILLER and ABSENCE ARCHITECT both succeed by DEFEATING the candidate.
Every "not established" so far was therefore reached by two SAME-DIRECTION
adversaries.

THIS DID NOT INVALIDATE THOSE CLOSURES. A candidate that cannot name its own
casualty fails no matter who asks.

WHAT IT DID INVALIDATE is any reading of A/B agreement as INDEPENDENT
CORROBORATION. That misreading has been struck four times as though it were a
fresh error on each occasion. The cause is structural, and the charter is the
structural answer.
```

### SCOPE — the charter applies to NAMED ROW CLASSES ONLY

```text
APPLIES TO
  PUBLIC API rows          what consumers can express, and how
  DX rows                  what a consumer must do to express it
  CORE SEMANTIC rows       what the container MEANS by a state, a write, a
                           reversal, a membership, an identity

DOES NOT APPLY TO
  mechanical cleanup       deletions, renames, dead-code removal, file moves,
                           vocabulary corrections, packaging, version hygiene
```

Seating a defender on a cleanup row would manufacture a reason to keep something
whose only claim is that it exists — which is Rule 0j inverted, and legacy
surviving by default is the exact failure the burden rule was written against.

```text
THE ROW CLASS IS DECLARED IN THE PACKET, BEFORE THE ROW OPENS.
Declaring it afterward would let the class be chosen to fit the desired seating.
```

### THE DEFENDER IS BOUND BY THE SAME BURDEN RULES — no exemptions

This is the part that makes the seat safe. **A defender who may reach for anything
the killers may not would not be a third perspective; it would be a licence to
manufacture premises, dressed as balance.**

```text
1  QUOTE THE FROZEN PREMISES VERBATIM
     Same rule, same section, same prohibition on paraphrase. A defender who
     restates a premise "in effect" has widened it, and widening a premise is how
     a defence wins without arguing.

2  NO REPOSITORY ARCHAEOLOGY, NO MEASUREMENT
     The defender may not cite the implementation, git history, a benchmark, a
     shipped API, an issue, or a downstream consumer. Those establish that
     something EXISTS, never that it is REQUIRED. This prohibition is identical to
     the killers' and is the single most likely place a defender would cheat,
     because the incumbent is the most available evidence in the room.

3  A MISSING PREMISE IS A STOP, NOT A WORK ORDER
     "This would be established if we also granted X" is a FINDING that the row is
     not decidable as posed. It may be recorded as a reopening CONDITION. It may
     never be converted into a task, an experiment, a measurement, or a request
     that the author grant X. The defender has no more standing to generate work
     from a gap than a reviewer does.

4  NO IMPLEMENTATION-INCUMBENT LEAKAGE
     The defender receives the same packet as the killers, under the same
     withholding: no author rationale, no expected outcome, no proposed design, no
     incumbent vocabulary, no sibling row's verdict. A defence built from the
     incumbent's shape is an argument that the incumbent exists.

5  THE DEFENDER MAY NOT PROPOSE THE MECHANISM
     Rule 0j, unchanged and applied symmetrically. Kill first, derive later — and
     defend first, derive later. A defender who starts designing the mechanism has
     granted the function, exactly as a reviewer who does so has.
```

### WHAT A DEFENDER MUST PRODUCE — and what it may not

```text
THE CHARGE
  Argue, from the frozen premises alone, that the candidate function is REQUIRED:
  name a concrete workflow that becomes IMPOSSIBLE — not harder, not uglier, not
  more verbose — if the function does not exist.

  ⚠️ WIDENED 2026-08-20: "becomes IMPOSSIBLE OR WRONG".
  The author stated the widening at requirement (2) OF D1. It REACHES THIS CHARGE
  because the charge is the ONLY channel through which a casualty is produced — a
  defender held to IMPOSSIBLE here could never produce the casualty (2) contemplates,
  which would scope the author's widening out of operation entirely.
  ENTAILED, and recorded rather than smuggled: D3 is defined over CASUALTIES, so
  widening what counts as one reaches D3 too. That is a consequence of the decision,
  not a separate widening, and it is disclosed here so nobody has to rediscover it.
  "Not harder / not uglier / not more verbose" is UNCHANGED and still excludes
  ergonomics.

ADMISSIBLE OUTPUT
  a named casualty workflow, expressible in the permitted vocabulary
  a demonstration that a rival construction the killers rely on is unavailable
    under the frozen premises
  an explicit statement that NO admissible defence was found

INADMISSIBLE OUTPUT
  ergonomics, familiarity, "users expect", "every other library"
    -> these belong in Table G (DX PRESSURE LEDGER) and carry NO function weight
  a casualty that requires an ungranted condition
    -> record the condition, do not lean on it
  the incumbent's behaviour offered as the requirement
```

### HOW A DEFENCE INTERACTS WITH A CLOSURE

```text
DEFENDER FINDS NOTHING ADMISSIBLE
  The closure STRENGTHENS, and for the first time legitimately: the row was
  attacked from two directions AND defended from the third, and no casualty
  appeared. This is the corroboration the A/B pair never actually supplied.

DEFENDER NAMES A CASUALTY
  The row does NOT thereby survive. The casualty goes to the killers, who must
  answer it on the frozen premises. A defence is a challenge to the closure, not a
  verdict against it.

DEFENDER AND KILLERS REACH THE SAME MISSING GRANT
  The row is UNDERDETERMINED, and this is a STRONGER underdetermination result
  than a same-direction pair could produce — the gap survived an attempt to
  exploit it as well as attempts to widen it.
```

```text
⚠️ AND THE RULE THAT GOVERNS ALL THREE BRANCHES — author, 2026-08-20:

    OPPOSITION FAILURE ALONE IS NEVER SURVIVAL.

A candidate does not survive because the killers failed to defeat it, because a
rival was disqualified, because the premises are silent, or because the defence
was not refuted. Survival requires the POSITIVE burden to be discharged: a named
workflow, impossible or wrong without the function, possible with it, supplied by
THIS candidate. Absence of refutation is not establishment — in either direction.
```

```text
STILL FORBIDDEN, and the charter does not soften it:
  the defender's report is EVIDENCE ABOUT THE DEFENCE. It is not a premise, not a
  prior for any sibling row, and not citable as "the defender established X".

⚠️ NARROWED 2026-08-20. The third clause is the ONLY text in this ledger that can be
  READ as saying the defender may not establish survival — read literally it bars the
  seat from establishing anything at all. Nothing SAYS that, and nothing proposed
  removing D1; this clause is over-broad, not wrong in intent.
  WHAT IS FORBIDDEN, and it is unchanged: citing a defender report as establishing a
  fact about the ARCHITECTURE — "the defender established that a shared fact must be
  retained". It remains not a premise and not a sibling prior.

IMPLEMENTER CONSTRUCTION, FLAGGED AND STRIKEABLE: the author's decision addresses
  what D1 REQUIRES, not how a D1 is cited, and supplied no citation formula. The
  wording below is the implementer's minimal reading of a corrected D1 and may be
  struck without disturbing the decision:
      "the defence was adversarially confirmed on the frozen premises"
```

### NON-RETROACTIVITY

```text
No closed row is reopened by this charter. U5b-A and U5b-B were closed WITHOUT a
defender, and each record now carries a note saying so.

A closed row may be reopened by a defence ONLY if the author reopens it. Running a
defender at a closed row in order to see whether it reopens is a WORK ORDER
GENERATED FROM A METHOD CHANGE, and it is forbidden on the same grounds as every
other work order generated from a gap.
```

## DEFENDER PROCESS REPAIR — 2026-08-20. R1 AND R2 RESOLVED BY THE AUTHOR.

> **⚠️ THIS SECTION WAS AUDITED THE SAME DAY AND SIX OF ITS CLAUSES ARE AMENDED OR
> WITHDRAWN.** Read
> [THE TWO-PASS REPAIR — FIRST-DAY AUDIT](#the-two-pass-repair--first-day-audit-it-leaks-in-fifteen-places)
> BEFORE citing anything below. Specifically: **C-iii as written below is WRONG** — it
> widened the author's condition and is narrowed by the audit. **The
> DEFENCE-STATEABILITY DECLARATION is WITHDRAWN**, and with it C-ii is unassessable, so
> **the strengthening branch is INOPERATIVE.** The author's decisions — two passes, the
> five dispositions, the ordering, R2b's reservation — are UNCHANGED by the audit; what
> changed is implementer text around them.

**Authority: the human author, 2026-08-20.** This resolves both items the
first-outing audit reserved. Like the P3 freeze and the charter itself this is a
**decision about the standard of evidence**, not a finding. No reviewer produced it,
no gate established it, no experiment supports it. It is an INPUT to the method.

```text
CITE IT AS   "the defender procedure, as repaired by author decision on 2026-08-20"
NEVER AS     "the audit established that two passes are required"
             "the defender charter was validated and extended"
             "R1/R2 were resolved by the first outing"
```

The audit **exposed** R1 and R2. It had no standing to settle either, said so, and
did not. What follows is the author's answer, and the reasons given below are the
author's reasons — they are not evidence for the decision, they are the content of it.

### THE ORDERING DECISION — the instrument is repaired BEFORE the next row opens

```text
DECIDED   No further U5b row opens until the defender procedure is repaired.
```

This reverses the audit's own closing line — _"rows may open under the charter as it
stands, carrying this audit"_ — and the reversal is deliberate. That line was written
to avoid generating a work order from a method gap, which was the correct instinct
about **tasks** and the wrong conclusion about **sequence**.

```text
WHAT THE AUDIT WAS RIGHT ABOUT
  a gap may not become a task. Nothing may be measured, dug, or benchmarked to
  settle R1 or R2, and nothing was.

WHAT IT GOT WRONG
  it treated "do not generate work from a gap" as implying "proceed with the
  defective instrument". Those are different. Declining to ACT on a gap is
  discipline; declining to WAIT for the author to close one is haste.
```

The concrete cost of not waiting is on the record: U5b-D was the charter's first
outing and it produced a defender null that **could not have been informative**, plus
two unsound legs, and the row consumed three seats to reach a disposition that is
partly an artefact of its own instrument. Opening U5b-E under the same instrument
would have bought a second such row.

```text
THIS IS A SEQUENCING DECISION, NOT A WORK ORDER
  It creates no task. It stops one.
```

### R1 — RESOLVED. THE DEFENDER RUNS IN TWO PASSES.

The contradiction the audit found stands as stated: admissible output #2 asks the
defender to disqualify **a rival the killers rely on**, while burden rule 4 withholds
the killers' reports, so output #2 was unreachable and a defender could return a null
having never touched a killer. That is the structural gap the seat exists to close,
and it was open on the seat's first outing.

```text
PASS 1 — SEALED. Unchanged from the charter as granted.

  RECEIVES   the frozen premises, QUOTED VERBATIM
             the candidate / opposite packet, exactly as the killers receive it
  RECEIVES NOTHING ELSE. No killer output of any kind exists in pass 1's input,
             because at the time pass 1 runs it may not exist at all.
  PRODUCES   a named casualty workflow, or an explicit statement that none was found
```

```text
PASS 2 — CONDITIONAL. Fires ONLY IF a killer raised a RIVAL CLAIM.

  TRIGGER    at least one killer's reasoning relies on a rival construction or an
             absence alternative — i.e. on the assertion that some other way of
             obtaining the capability is AVAILABLE under the frozen premises.
             No rival raised -> pass 2 DOES NOT RUN, and the packet records that it
             was NOT REQUIRED rather than skipped.

  RECEIVES   the pass 1 input, AND
             the rival claims and absence alternatives, and ONLY those — stated as
             bare constructions, stripped to what is needed to test whether each is
             available under the frozen premises

  DOES NOT RECEIVE
             any killer's VERDICT or disposition
             any killer's RATIONALE, reasoning chain, or self-audit
             REVIEWER IDENTITY — which seat produced which rival
             IMPLEMENTATION DETAIL of any kind, current or proposed
             the author's expectation, the sibling rows' outcomes, the packet's own
               anti-stipulation reasoning
```

```text
WHAT PASS 2 MAY PRODUCE — and this list is CLOSED

  1  a demonstration that a specific rival is UNAVAILABLE under the frozen premises
     (admissible output #2, now reachable for the first time)
  2  an explicit statement that no rival is disqualifiable
  3  a finding that disqualifying a rival would require an ungranted condition
     -> the condition is RECORDED. It is not pursued, and it is not leaned on.

WHAT PASS 2 MAY NOT PRODUCE

  a NEW casualty. Casualties are pass 1 work, and only pass 1 work.
```

**Why the new-casualty bar is load-bearing rather than tidiness.** A casualty
invented after seeing the opposition is reverse-engineered to evade it, and it would
arrive with no way to tell whether the frozen premises produced it or the rivals did.
Pass 1's seal is what makes a casualty attributable to the premises. Pass 2 exists to
test a defence that already exists, not to grow one.

```text
AMENDMENT TO BURDEN RULE 4 — the only rule this repair changes

  BEFORE  "the defender receives the same packet as the killers, under the same
           withholding"
  AFTER   Rule 4 governs PASS 1 ABSOLUTELY and is unchanged there.
          In PASS 2 the withholding is NARROWED TO EXACTLY the four exclusions
          listed above, and to nothing less.

Rules 1, 2, 3 and 5 are UNCHANGED AND APPLY TO BOTH PASSES. In particular pass 2
may not cite the implementation, may not convert a missing premise into a work
order, and may not propose a mechanism — including the RIVAL's mechanism, per
repair 2.
```

**Two asymmetries this creates, recorded rather than smoothed over.**

```text
1  THE DEFENDER SEES THE KILLERS' RIVALS; THE KILLERS NEVER SEE THE DEFENDER'S
   CASUALTY IN A SECOND PASS.
   Accepted, because the charter already routes a named casualty back to the
   killers — "the casualty goes to the killers, who must answer it on the frozen
   premises." That answer-back channel is the killers' pass 2 and predates this
   repair. What was missing was the defender's, and this supplies it. The seats are
   symmetric at the charter level even though the mechanisms differ in name.

2  PASS 2 DISCLOSES THAT OPPOSITION EXISTS.
   A defender told "here are rival constructions" learns that a killer found
   something to rely on. That is a genuine leak and it is bounded: a killer may
   rely on a rival whether its verdict lands for or against, so the existence of a
   rival discloses NO VERDICT. Reviewer identity is withheld precisely so the leak
   cannot be resolved into "the absence architect built this, therefore the absence
   held."
```

### R2 — RESOLVED IN PART. THE DEFENDER'S DISPOSITIONS ARE A CLOSED SET OF FIVE.

The audit found the defender had no stated disposition, defaulted to the room's, and
**said so out loud** — _"where finer resolution would have helped a defence, I closed
it against the candidate instead."_ The author's answer is a disposition **taxonomy**
rather than a presumption. Exactly one is PRIMARY, and per repair 3 the headline
carries it.

```text
D1  SURVIVAL ESTABLISHED
      ⚠️ AS WRITTEN HERE THIS IS SUPERSEDED. The author corrected D1 on 2026-08-20
      to ADVERSARIAL CONFIRMATION ONLY, under five conjunctive requirements. See
      "D1 CORRECTED" below and use that text. The disposition is KEPT, not removed.

      An admissible casualty was found: a named workflow that becomes IMPOSSIBLE
      under the frozen premises if the function does not exist, depending on NO
      ungranted condition, stated in the permitted vocabulary.

D2  SURVIVAL NOT ESTABLISHED
      Pass 1 found no admissible casualty, and — where pass 2 ran — no rival was
      disqualifiable. The candidate was STATEABLE and TESTABLE throughout, so the
      seat was in a position to have succeeded and did not.

D3  DEFENCE AVAILABLE BUT PREMISE-DEPENDENT
      A casualty exists and is coherent, but it requires a condition the frozen
      premises do not grant. The condition is RECORDED as a reopening condition and
      NOT LEANED ON. This is the disposition that must not be silently collapsed
      into D2 — "found nothing" and "found something that needs a grant" are
      different facts about the row, and only the first is a fact about the seat.

D4  DEFENCE BLOCKED BY UNNAMED / UNDERSPECIFIED CANDIDATE
      No defence is STATEABLE because the candidate does not say what it asserts is
      required. It quantifies over arbitrary content, so it has no failing case AND
      no succeeding case. The seat could not have failed informatively.
      THIS IS A FINDING ABOUT THE INSTRUMENT, NOT ABOUT THE FUNCTION.

D5  OUT-OF-ROW
      The defensible thing the seat located is not what the row asks about — a
      different function, a different carrier, a different owner. Recorded and
      PARKED. It is not evidence for or against this row's candidate, and it is not
      a licence to open the row it points at.
```

```text
D1 DOES NOT MAKE THE ROW SURVIVE — and this preserves the charter unchanged.

The charter reads: "DEFENDER NAMES A CASUALTY -> The row does NOT thereby survive.
The casualty goes to the killers, who must answer it on the frozen premises. A
defence is a challenge to the closure, not a verdict against it."

That clause is UNTOUCHED. D1 is the DEFENDER'S disposition — "I discharged my
charge" — not the ROW's. A row reaches survival only after the killers answer the
casualty and fail to defeat it.

The naming tension is recorded rather than resolved by renaming: "survival
established" is the author's term for D1, and it means survival of the DEFENCE, not
of the row. Any citation must say which.

⚠️ CLARIFICATION, NOT A CORRECTION — this clause never said the defender may not
establish survival, and it is not being repaired. It separates ADMISSIBILITY from
ADJUDICATION: a corrected D1 discharges the DEFENCE's burden; it does not decide the
ROW. Recorded because the corrected D1 makes the distinction load-bearing, and the
audit confirmed this separation is what keeps D1 from being a veto.
```

### HOW EACH DISPOSITION AFFECTS GATE 2

```text
DISPOSITION  WHAT GATE 2 DOES WITH IT

D1           The casualty is RAW MATERIAL routed to the killers. Gate 2 does not
             adjudicate it and does not treat it as a verdict against the closure.
             If the killers cannot answer it on the frozen premises, Gate 2 records
             the closure as CHALLENGED and the row does not close as NOT ESTABLISHED.

D2           The ONLY disposition that can strengthen a closure, and only under the
             three conditions below. Absent them, Gate 2 records the null as
             NON-INFORMATIVE and closure strength is unchanged.

D3           Closure DOES NOT STRENGTHEN. The condition is recorded. Gate 2 must
             state explicitly that a premise-dependent defence was found, because
             a D3 read as a D2 converts "the premises are silent here" into "there
             is nothing here" — the argument-from-silence move every seat on U5b-D
             committed.

D4           Closure DOES NOT STRENGTHEN, and Gate 2 must additionally record that
             THE ROW'S INSTRUMENT IS DEFECTIVE. A D4 is grounds to question whether
             the row was openable, independently of any verdict it received.

D5           Carries NO weight in either direction. Gate 2 records it and parks it.
```

### THE STRENGTHENING BRANCH IS NOW CONDITIONAL — three conditions, ALL required

The charter's original branch read: _"DEFENDER FINDS NOTHING ADMISSIBLE -> the
closure STRENGTHENS, and for the first time legitimately."_ That is now gated.

```text
CLOSURE STRENGTHENS ONLY IF ALL THREE HOLD

C-i    THE DISPOSITION IS D2. Not D3, not D4, not D5.

C-ii   THE CANDIDATE WAS NAMEABLE AND TESTABLE — a succeeding case was statable in
       principle, in the permitted vocabulary, before the seat ran.

C-iii  ⚠️ AS WRITTEN HERE THIS CLAUSE IS WRONG — SEE THE FIRST-DAY AUDIT.
       THE DEFENDER HAD ACCESS TO ACTUAL RIVAL CLAIMS — pass 2 RAN, or the packet
       records that no killer relied on a rival so pass 2 was NOT REQUIRED.
       A defender that never saw a rival because the procedure could not deliver
       one has not tested the closure; it has restated the packet.

       THE SECOND DISJUNCT MAKES THE CLAUSE VACUOUSLY TRUE IN EXACTLY THE CASE IT
       EXCLUDES, and it widened the author's stated condition. NARROWED BY THE
       AUDIT to: satisfied ONLY by pass 2 RUNNING with at least one rival received.

ANY ONE FAILING -> the null is NON-INFORMATIVE. Recorded as such, in the headline.
```

**C-ii is assessed from the PACKET, never from the outcome.** Deciding nameability
after seeing a null would be circular in the most convenient possible direction —
every uninformative null would be reclassified as informative, or every inconvenient
one as blocked, depending on which the author preferred. So:

### DEFENCE-STATEABILITY DECLARATION — a new REQUIRED PACKET FIELD

> **⚠️ WITHDRAWN THE SAME DAY.** The audit defeated it with its own no-naming
> constraint: the safest compliant completion is a restatement of D1, which is
> completable for every candidate, so C-ii would go green everywhere — including on the
> row this field was invented to catch. The two available patches pull against each
> other. **The field is withdrawn, not patched**, and C-ii is left unassessable. The
> text below is retained as the record of what was tried and why it failed.

**Status: DERIVED, MECHANICAL.** This is not a further semantic decision; it is the
only non-circular way to evaluate C-ii, and it is recorded as an implementer's
construction so it can be struck if the author disagrees.

```text
REQUIRED IN EVERY PACKET THAT SEATS A DEFENDER, DECLARED BEFORE THE ROW OPENS

  A SUCCEEDING CASE WOULD LOOK LIKE
    the SHAPE — not the content — of a workflow whose impossibility would establish
    this candidate. Stated in the permitted vocabulary. No name for the thing under
    test is supplied or implied.

  IF THIS FIELD CANNOT BE COMPLETED
    the row is D4 BY CONSTRUCTION, before any seat runs, and the packet says so.
```

The field is answerable without deciding the row: it asks what a win would look
like, not whether one exists. U5b-D's packet could not have completed it — the fact
was required to stay unnamed, and an unnamed existential admits no shape — which is
precisely the diagnosis Gate 2 reached **after** three seats had run.

```text
WHAT THE FIELD IS NOT
  not a requirement to NAME the thing under test. Refusing to name it remains
    available and remains the strongest defence against deciding a row by
    vocabulary.
  not a stipulation. A shape is not a claim that anything has that shape.

⚠️ THE FIRST CLAUSE IS REVERSED BY THE AUTHOR 2026-08-20. Refusing to name the
   observable semantic property under test is now a DEFECT IN THE CANDIDATE, not a
   virtue: "incumbent-neutral does not mean function-anonymous." The field itself
   stays withdrawn; this text is historical and the naming rule governs.
```

### WHAT R2 DOES NOT SETTLE — carried forward as RESERVED ITEM R2b

The audit's R2 proposed a **presumption** — _"the candidate stands as required until
a rival is shown available from the frozen text ... the defender may not close a
silence against the candidate."_ The author supplied a **disposition taxonomy**
instead. These are different objects and only one of them has been decided.

```text
DECIDED    the CLASSIFICATION of what a defender returns, and what Gate 2 may do
           with each class

NOT DECIDED  the seat's DEFAULT LEAN. When the premises are silent on a fact a
           casualty needs, does the defender:
             (a) record the silence as a condition and return D3 — or
             (b) close the silence against the candidate and return D2?

The taxonomy makes the two OUTCOMES distinguishable, which the charter did not, and
that is a real repair: a defender that closes silences against the candidate can no
longer have its output consumed as a clean D2 without saying so.

But it does not tell the seat WHICH TO DO. The observed drift — "where finer
resolution would have helped a defence, I closed it against the candidate instead" —
is a choice between (a) and (b), and it is STILL UNGOVERNED.
```

```text
R2b  RESERVED TO THE HUMAN AUTHOR. Setting the defender's default lean sets the
     burden of proof for every row in scope, in the same way seating the defender
     at all did. An implementer choosing it would be supplying the standard of
     evidence by fiat.

     NOT A WORK ORDER. Rows may open under the repaired procedure carrying R2b
     open, because the taxonomy makes an unsettled lean VISIBLE in the output: a
     seat that closed a silence against the candidate now has to return D2 and a
     seat that recorded it has to return D3, and Gate 2 treats those differently.
     The unrepaired gap is no longer silent, which is the condition under which
     proceeding is legitimate.

     ⚠️ THE JUSTIFICATION ABOVE WAS FALSE AS WRITTEN — the audit built the
     indistinguishable pair. A taxonomy is a set of LABELS, not a disclosure
     requirement, and no clause obliged a seat to enumerate the silences it closed,
     so the choice was visible only when the seat picked the visible branch. The
     audit adds the disclosure requirement that makes the claim true. R2b itself is
     UNDISTURBED and still reserved.
```

There is one further consequence R2b does not reach, and it is flagged here as a
question rather than answered:

```text
DOES A D4 BAR THE ROW FROM OPENING AT ALL?

U5b-D opened with its central fact deliberately unnamed, and its own packet called
that "the strongest thing about this row's wording". Gate 2 later found the same
choice guaranteed the defender's null. BOTH ARE TRUE. Leaving the fact unnamed
prevented the row being decided by vocabulary AND made a defence unstateable.

Whether an unnameable candidate is:
    NOT OPENABLE, like U5b-C's borrowed antecedents — or
    OPENABLE, with the defender seat simply declared uninformative in advance
is a SEMANTIC CHOICE about what this method is for. Not decided here. Recorded with
R2b.

⚠️ ONE HALF OF "BOTH ARE TRUE" IS WITHDRAWN — and note the derivation, because the
   author did not rule on this paragraph directly. The 2026-08-20 decision records
   U5b-D's terminal issue as including "it supplied no sufficiently named semantic
   proposition to defend". That IS a ruling that the unnamedness was a defect in the
   candidate. So "it prevented the row being decided by vocabulary" no longer stands
   as a countervailing virtue for THIS row.
   NOT CLAIMED: that the author ruled on the general even-handedness of the
   paragraph, or supplied a verdict on packets other than U5b-D's.
   STILL RESERVED: whether an anonymous candidate may open a row at all.
```

### NON-RETROACTIVITY — unchanged, and it binds this repair too

```text
No closed row is reopened by this repair. U5b-A, U5b-B and U5b-D stay closed on
their recorded dispositions.

Re-running a defender at U5b-D under the two-pass procedure to see whether it
reopens is FORBIDDEN — a work order generated from a method change, on exactly the
grounds the charter already states.

An AUDIT of a closed row against the repaired procedure is permitted and is a
different act: it classifies what the row already produced, and may not alter the
disposition. The U5b-D audit immediately below is that, and nothing more.
```

## U5b-D — AUDIT UNDER THE REPAIRED DEFENDER PROCEDURE. Disposition UNDISTURBED.

**This is a CLASSIFICATION EXERCISE, not a re-adjudication.** It asks one question:
what would the repaired procedure have recorded, given what the row actually
produced? It runs no seat, invents no evidence, and changes no verdict.

```text
WHAT THIS AUDIT MAY DO        classify existing output against the new taxonomy
                              identify which new provisions the row would have
                                tripped
                              state whether the disposition is disturbed

WHAT IT MAY NOT DO            re-run any seat, including a pass-2 defender
                              simulate what a pass-2 defender WOULD have found
                              alter, soften, or strengthen the disposition
                              reopen the row
```

**The refusal to simulate pass 2 is deliberate and is the audit's main
self-restriction.** Asking "what would the defender have said if handed A's and B's
rivals?" is running the seat with the author's own hand, and its output would be
indistinguishable from a retroactive rewrite by fiat. The charter's non-retroactivity
clause bars it and so does the standing rule that no stage may manufacture the
premise the next stage needs.

### CLASSIFICATION — what D's defender output becomes under the closed set

```text
AS RECORDED   "NO ADMISSIBLE DEFENCE FOUND"
              plus, buried and not in the headline, "the row is not decidable as
              posed"

UNDER THE CLOSED SET

PRIMARY       D4 — DEFENCE BLOCKED BY UNNAMED / UNDERSPECIFIED CANDIDATE
              The packet required the shared fact to remain unnamed and forbade
              every available name for it. Seat A observed such a claim has no
              failing case; Gate 2 drew the symmetric half — no succeeding case
              either. A defence was NOT STATEABLE. That is the D4 definition
              verbatim.

SECONDARY     D3 in part — the alternating-groupings casualty WAS built, kept, and
              dismissed on conditions the premises do not grant (C1's silence in
              P5, and per the unresolved dispute possibly P3 as well). A casualty
              that exists but needs a grant is D3, not "nothing found".

NOT           D2. The seat was never in a position to succeed.
NOT           D1. No casualty survived its own rival, and the surviving rival is
              now quarantined by repair 1 anyway.
```

**The as-recorded headline was neither of these**, which is the concrete cost repair
3 was written against: a D4-plus-D3 row reported itself as a bare null.

### THE STRENGTHENING BRANCH — it fails ALL THREE conditions, not one

Gate 2 already blocked the branch on this row, by an explicit override: _"the
charter's 'DEFENDER FINDS NOTHING -> THE CLOSURE STRENGTHENS' branch MUST NOT FIRE on
this row."_ That override was correct and was reached ad hoc. Under the repaired
procedure the same result is REACHED BY RULE:

```text
C-i    DISPOSITION IS D2               FAILS — it is D4, with a D3 component
C-ii   CANDIDATE NAMEABLE / TESTABLE   FAILS — the packet could not have completed
                                       the stateability declaration; the fact was
                                       required to stay unnamed
C-iii  DEFENDER SAW ACTUAL RIVALS      FAILS — pass 2 did not exist. Both killers
                                       relied on rival constructions (A's dichotomy,
                                       B's caller-side relocation), so pass 2 would
                                       have been REQUIRED, not merely available
```

```text
THE AUDIT'S ONE SUBSTANTIVE FINDING

The Gate 2 override was an EXCEPTION granted by one gate on one row. It is now a
CLASSIFICATION any gate must reach on any row with these properties. An exception
protects the row it is granted on; a rule protects the rows nobody thought to
examine.

This does not make the override retroactively better-founded. It was correct on its
own reasoning and remains exactly as well-founded as it was.
```

### WHAT THE AUDIT DOES NOT CHANGE

```text
DISPOSITION            UNDERDETERMINED, not decidable as posed, TERMINAL.
                       UNDISTURBED.
NULL                   still FORBIDDEN
THE PIVOT              still dissolving rather than deciding — under either setting
                       of record-readability no function is established
THE THREE-WAY DISPUTE  still UNRESOLVED and still not pursued
D's QUARANTINED RIVAL  still quarantined; D's verdict still stands on Rival A alone
```

```text
AND IT ESTABLISHES NOTHING NEW ABOUT THE CANDIDATE. Not one clause above bears on
whether several writes must retain a shared fact. The row produced no information
about that on the day, and an audit of the procedure cannot produce information the
procedure did not gather.
```

### ONE THING THE AUDIT FOUND THAT IS NOT A CLASSIFICATION

```text
C-iii FAILED ON D IN THE STRONGEST POSSIBLE WAY: pass 2 would have been REQUIRED.

Both killers' central reasoning ran through a rival construction — A's "no third
case under the granted premises", B's caller-side relocation of the fact. Under the
repaired procedure a defender WOULD have been handed both, stripped of verdict,
rationale and identity, and charged with showing them unavailable.

WHAT FOLLOWS FROM THIS: nothing about the row. It is a fact about the PROCEDURE'S
COVERAGE — the first row it ran on was a row where the missing pass was not
optional. It is recorded because it bounds how much the charter's first outing can
be cited for at all, in EITHER direction.

WHAT DOES NOT FOLLOW, and may not be written anywhere: that the row would have
closed differently. Nobody knows, nobody may find out, and the disposition does not
depend on it.
```

## U5b-E — UNCONFIRMED TRANSITION WITHDRAWAL: NOT OPENABLE AS WORDED.

**STATUS: NOT OPENED. NO SEAT RAN. NO DISPOSITION ON THE FUNCTION.** This is an
INSTRUMENT FINDING, in the same class as U5b-C's, and it is emphatically not a
verdict. The row's function may survive, die, or be underdetermined on its own
evidence once it has wording that does not carry the defects below.

```text
⚠️ REAFFIRMED BY AUTHOR DECISION 2026-08-20. E DOES NOT OPEN unless a NEW
   HUMAN-AUTHORED CANDIDATE STATEMENT is provided. Not a reworded E, not an
   implementer restatement, not a repair derived from the naming rule.

   E AS WORDED REMAINS NOT OPENABLE. And E2 is now DOUBLY disqualifying: "semantics"
   was already an unnamed fact, and under "incumbent-neutral does not mean
   function-anonymous" function-anonymity is a DEFECT rather than a neutral choice.

   FORBIDDEN: reading the naming rule as instructions for rewording E. The rule
   DIAGNOSES; it does not author.
```

### HOW THIS CHECK WAS RUN — both lines, independently, deliberately uninformed

The cheap check that cleared D quoted **only D's candidate line** and missed a
borrowed antecedent sitting in D's decisive line. That failure is the reason this
check was constructed differently:

```text
BOTH LINES inspected with equal weight
INSPECTED BY a reader given the frozen premises VERBATIM, the family's forbidden
             vocabulary, the four sibling BARE DISPOSITIONS with no reasoning
             attached, and E's two lines quoted exactly
WITHHELD     this ledger's own reading of E, the author's expectation, every
             sibling row's rationale, the repository, the implementation
FORBIDDEN    archaeology, measurement, proposing a rewording, proposing an
             experiment
ASKED FOR    per-clause hazard classification, a repair-routing classification, a
             single verdict, EXPLICIT FALSE-POSITIVE GUARDS, and a self-audit
```

The false-positive requirement earned its place immediately — see the NOT-A-DEFECT
list below, which overturned two flags this ledger was carrying.

### THE CONTAMINANTS — five, across both lines

```text
CANDIDATE, frozen wording
  "an unconfirmed transition requires container-owned semantics for later acceptance
   or withdrawal"

E1  "an unconfirmed transition" + "for later acceptance or withdrawal"
    BORROWED ANTECEDENT, from U5b-B. An "unconfirmed" transition is one whose
    canonical consequences have not occurred, and "withdrawal" presupposes the same
    non-occurrence — P3 returns canonical state to "a configuration it previously
    held", which presupposes the write DID occur. The object both clauses
    presuppose is U5b-B's candidate: "an attempted multi-write transition may fail
    such that none of its canonical consequences occur." B is FUNCTION NOT
    ESTABLISHED. P1 grants only that "writes replace values at positions
    immutably"; a write issued but not applied is granted nowhere.

E2  "semantics"
    UNNAMED FACT — U5b-D's terminal defect, verbatim in shape. "requires ...
    semantics" asserts a requirement without naming what is required, so it
    quantifies over arbitrary content: no failing case AND no succeeding case.
    A row cannot complete the DEFENCE-STATEABILITY DECLARATION with this wording,
    which makes it D4 BY CONSTRUCTION before any seat runs.

E3  "unconfirmed" · "acceptance" · "withdrawal", AS A SET
    BANNED VOCABULARY, reconstituted. The family bans `prepare · commit · publish ·
    effect · transaction · turn · pending rollback · causal attribution ·
    speculation`. "unconfirmed" does the work of PREPARE and PENDING; "acceptance"
    the work of COMMIT; "withdrawal" the work of PENDING ROLLBACK. The set spells
    TRANSACTION in unbanned syllables.

E4  "container-owned"
    CARRIER / OWNER CLAUSE. It names what holds the capability before the
    capability is established to be required — the top rung asked at the bottom.
    Same species as the struck row wording "Does `structural` need more than
    canonical truth?", which named the incumbent's field.
```

```text
DECISIVE QUESTION, frozen wording
  "what independently valuable workflow cannot be expressed using currently earned
   canonical state plus whatever speculative semantics have ALREADY independently
   survived?"

E5  "plus whatever speculative semantics have ALREADY independently survived"
    THREE DEFECTS IN ONE CLAUSE.
      (a) BANNED WORD, not a near-synonym — "speculative" is the stem of
          "speculation", which the family preregistration bans outright.
      (b) DEFERRAL TO AN EMPTY SET. Every sibling disposition is negative: A
          UNDERDETERMINED, B NOT ESTABLISHED, C NOT OPENABLE, D UNDERDETERMINED.
          Nothing speculative has independently survived. The family
          preregistration said so when E was written — "which is currently
          NOTHING" — and recorded it as a hazard rather than a bar.
      (c) PRESUPPOSES ITS OWN CATEGORY. It treats "speculative semantics" as a
          coherent kind that may already have survived, which is the thing E exists
          to test.
```

### THE DEFECTS ARE NOT SEVERABLE — two structural findings

```text
1  NO SINGLE-WORD EXCISION REPAIRS THE CANDIDATE.
   The B-borrowing is carried REDUNDANTLY. Delete "unconfirmed" and "later
   acceptance or withdrawal" re-imports it; delete the purpose clause and
   "unconfirmed" re-imports it. Only a restatement removes it, and a restatement is
   a semantic act.

2  THE INSTRUMENT IS NON-DISCRIMINATING — rigged in BOTH directions at once.
   If E5's addend is empty, the baseline collapses to P1-P6 and any
   unconfirmed-transition workflow is inexpressible BY CONSTRUCTION — the candidate
   wins on the packet's arithmetic. If instead a seat leans on the unstated value
   bar, every offered workflow can be refused as not independently valuable — the
   null wins on the packet's bar. Neither outcome would be evidence about the
   function.
```

### REPAIR ROUTING — and this is what separates E from D

D was OPENABLE because both its defects were repairable **without semantic choice**:
each substituted a premise's own words for a borrowed noun, or dropped an unearned
qualifier, and both were strictly weakening. **Not one of E's five is in that class.**

```text
E1  "unconfirmed" / "acceptance or withdrawal"   SEMANTIC CHOICE. Removal dissolves
                                                 the subject and repairs nothing.
E2  "semantics"                                  SEMANTIC CHOICE. Not removable,
                                                 only FILLABLE — and any name the
                                                 premises do not grant creates a
                                                 FRESH borrowed antecedent.
E3  banned-vocabulary set                        NEITHER. Relexicalising a banned
                                                 concept LAUNDERS it. The
                                                 contaminant is the concept.
E4  "container-owned"                            DUAL. Strictly weakening on
                                                 content, but it changes the row's
                                                 question from LOCUS to EXISTENCE.
                                                 Routed up on the second reading.
E5  the addend clause                            UNCLASSIFIABLE BY AN IMPLEMENTER.
                                                 Empty set -> removal is a no-op.
                                                 Non-empty -> removal changes the
                                                 baseline in the candidate's
                                                 favour. Deciding which is deciding
                                                 the row.
```

```text
VERDICT: NOT OPENABLE AS WORDED.

MINIMUM SUFFICIENT SET, on its own: { E5 }.
  Load-bearing, referent empty on the recorded dispositions, uses a banned word
  directly, and presupposes the category under test.

TWO FURTHER INDEPENDENTLY SUFFICIENT SETS — so curing E5 would not rescue the row:
  { E2 } alone           — unnamed fact; any verdict is an artefact of the wording
  { E1a, E1b } jointly   — and only jointly, since neither is excisable alone
```

### WHAT IS NOT A DEFECT — recorded because a false positive costs as much as a miss

**Two of these overturn flags this ledger was carrying before the check ran.**

```text
"transition" IN ISOLATION — NOT a borrowed antecedent.
  This ledger had it flagged as U5b-A's candidate noun, by analogy with C, where
  "the canonical transition" was decisive. WRONG for E. A single write producing a
  new configuration is inside P1. What E borrows is not the noun; it is the
  NON-OCCURRENCE that "unconfirmed" and "withdrawal" presuppose, and that comes
  from B, not A. Flagging the noun would have mis-attributed the defect to the
  wrong sibling and pointed any future repair at the wrong clause.

"currently earned canonical state" — NOT an unknowable deferral.
  Symmetry with E5 makes this look like the same defect. It is not: the granted set
  is frozen and exhaustive, so the referent resolves to exactly P1-P6. Determinate.

"requires" — the requirement frame is the CORRECT burden direction. The defect is
  the object of the verb, never the verb.
"cannot be expressed" — the what-becomes-impossible frame is legitimate and is the
  form used on every row in this family.
"later" — ordinary temporal ordering. P3 already grants "can be advanced again
  afterwards". Carries no presupposition of its own.
"workflow" — broader than P3's "boundaries a user would recognize as discrete
  steps", but a user-recognizable unit is partly granted. MARGINAL, not decisive.
```

### CONSEQUENCE FOR THE FAMILY — and it is a DECISION REQUIRED, not a work order

```text
U5b-A  TERMINAL — UNDERDETERMINED
U5b-B  CLOSED — FUNCTION NOT ESTABLISHED
U5b-C  NOT OPENABLE AS WORDED — borrowed antecedents from A and B
U5b-D  TERMINAL — UNDERDETERMINED, not decidable as posed
U5b-E  NOT OPENABLE AS WORDED — five contaminants, none implementer-repairable

THE FAMILY IS EXHAUSTED UNDER ITS OWN PREREGISTRATION. Every row is either
terminal or not openable, and the two unopenable rows can be reworded only by the
author.
```

```text
WHAT AN IMPLEMENTER MAY NOT DO HERE, and the temptation is strongest at exactly
this point:

  REWORD C or E to make them answerable
    -> the frozen preregistration would be edited to fit the instrument that can
       process it. That IS the contamination, stated in the C record and unchanged.
  DECLARE the family closed because every row failed
    -> "no row was openable" is a fact about five instruments. Reading it as
       "transaction-shaped functions are not required" would convert an
       instrument-quality result into an architectural verdict, which is the
       four-times-struck move in its purest available form.
  OPEN a sixth row of the author's own devising to cover the ground
    -> a work order generated from a gap.
```

### THE CROSS-CUTTING FINDING THIS CHECK PRODUCED — bigger than E

The inspection flagged `"independently valuable"` in E's decisive question as an
**unstated evidentiary standard**: no test for value, and none for what makes value
independent, so any produced workflow can be denied as not independently valuable and
any absence attributed to the bar rather than to the premises.

**That clause is not E's. It is family boilerplate.**

```text
U5b-A  "what independently valuable workflow becomes impossible if applications
        instead use the currently earned canonical write and grouping semantics?"
U5b-D  "what independently valuable workflow becomes impossible if the only fact
        that survives about several grouped writes is that they revert as one step?"
        (the REPAIRED question, which that packet's own leakage self-check passed as
        ADMISSIBLE)
U5b-E  "what independently valuable workflow cannot be expressed using ..."
```

The inspecting reader flagged it in E only because it had no cross-row context. With
that context the finding does not become smaller — it becomes **wider**, and it
changes what it is:

```text
IT IS NOT      a reason E specifically is unopenable. E is unopenable on E1-E5, all
               of which are E's own, and the verdict does not use this clause.
IT IS          an open question about the standard EVERY decisive question in this
               family was asked against, including two rows already closed.
```

```text
HANDLING — deliberately conservative, in three parts

1  NOTHING IS REOPENED. A and D stay terminal. This finding does not disturb a
   disposition, and per the non-retroactivity rule it may not be used to.
2  IT IS NOT SILENTLY REPAIRED. Supplying a test for "independently valuable" sets
   what counts as evidence of a function across the whole family. That is the
   author's, on the same footing as seating a defender.
3  IT IS RECORDED AS A LIVE UNCERTAINTY over closed rows, not as a defect in them.
   The honest statement is: two terminal rows were asked a question containing an
   unstated bar, and nobody has established whether any seat's reasoning turned on
   it. Nobody may go and find out — that would be re-adjudicating closed rows.
```

**Why it is recorded rather than acted on.** The alternative was to say nothing,
since it bears on rows this session may not touch. But an unstated bar in the
standard question form is exactly the kind of thing that survives long enough for
the next derivation to inherit, and this ledger has recorded that failure more times
than any other. Recording it costs nothing and creates no task.

## THE TWO-PASS REPAIR — FIRST-DAY AUDIT. It leaks in fifteen places.

**The repaired procedure was audited as an instrument, on the day it landed, by a
reader given the procedure text and NOTHING ELSE** — no repository, no sibling row,
no ledger, no author rationale, and no indication which clauses were the author's and
which were the implementer's. Its charge was to find loopholes, with a default
disposition that the procedure leaks, and to attach a concrete scenario to every
finding.

```text
IT RETURNED NINETEEN. Roughly fifteen are real, and the most important one is a
defect in a clause the IMPLEMENTER wrote while transcribing the author's decision.
```

**The single largest structural finding, quoted, because it names the shape:** _"every
gate is built to screen the defender's NULL, and nothing screens the defender's
POSITIVE, the killers' phrasing, or a run that never happened."_

### THE WORST ONE FIRST — C-iii WIDENED THE AUTHOR'S CONDITION

```text
THE AUTHOR'S CONDITION, verbatim
  "...unless the candidate was nameable/testable and the defender had access to
   actual rival claims."

WHAT THE IMPLEMENTER WROTE
  "C-iii  THE DEFENDER HAD ACCESS TO ACTUAL RIVAL CLAIMS — pass 2 RAN, or the packet
          records that no killer relied on a rival so pass 2 was NOT REQUIRED."
```

The second disjunct makes C-iii **vacuously true in exactly the case it was written to
exclude.** A criterion named "had access to actual rival claims" is satisfied
precisely when there were none to have access to.

```text
THIS IS PREMISE-WIDENING BY THE IMPLEMENTER, in the transcription of a decision.
Same species as every widening this ledger has struck: a permission ("pass 2 need not
run when there is nothing for it to do") converted into a satisfaction ("therefore the
corroboration condition is met"). Those are different claims and only the first is
defensible.
```

**And the trigger is controlled by the killers, at zero cost to them.** Pass 2 fires
only if a killer's reasoning relies on a rival — the assertion that some other way of
obtaining the capability is AVAILABLE. Both killer seats can reach their own success
condition without ever asserting that:

```text
KILLER writes a pure entailment denial — "the premises nowhere grant the need this
  candidate asserts; necessity does not follow." No rival asserted.
ABSENCE ARCHITECT writes an architecture in which the capability is NOT NEEDED, rather
  than sourced elsewhere. No rival asserted.

-> pass 2 NOT REQUIRED -> C-iii satisfied -> the defender never saw one word of
   opposition -> THE CLOSURE STRENGTHENS.
```

`"nothing survives"` is served as well by denial as by alternative, and denial is
**cheaper**, because it exposes nothing to pass 2. The procedure therefore rewards the
phrasing that disables its own corroboration check.

```text
COMPOUNDING, and the asymmetry is the tell
  C-ii is explicitly armoured against outcome contamination — "assessed from the
    PACKET, never from the outcome."
  C-iii HAS NO SUCH ARMOUR. Nothing says WHO classifies whether a killer relied on a
    rival, or WHEN. In the NOT REQUIRED case the classification is plausibly made
    after the null is already in hand.
  The cost gradient is one-sided: declaring "no rival" is free and strengthens;
    declaring "rival" costs a dispatch.
```

```text
CORRECTION APPLIED — NARROWING, back to the author's literal words

C-iii  THE DEFENDER HAD ACCESS TO ACTUAL RIVAL CLAIMS.
       Satisfied ONLY by: pass 2 RAN and the defender received at least one rival
       construction.

  NO RIVAL WAS RAISED -> C-iii FAILS -> the null is NON-INFORMATIVE for
  corroboration. Recorded in the headline. The row still closes on its own merits;
  what it does not do is gain strength from a defender that met no opposition.

This is a correction of the implementer's text, not a new decision. It restores the
author's condition and removes nothing the author granted.
```

```text
RESIDUAL QUESTION — RESERVED, and it must not be answered by an implementer
  Under the narrowed reading, a row where BOTH killers argued by entailment denial can
  never strengthen, however sound the closure. Is that the intended cost of the
  author's condition, or does "had access to actual rival claims" contemplate some
  weaker sufficiency?
  NOT A WORK ORDER. The conservative reading is in force meanwhile, because it is the
  one that cannot manufacture corroboration.
```

### THE STATEABILITY DECLARATION IS WITHDRAWN

The implementer invented this field to make C-ii assessable without circularity, and
marked it `DERIVED, MECHANICAL — strike it if wrong`. **It is wrong, and the audit
defeated it with its own constraint.**

```text
THE FIELD          "a succeeding case would look like ___" — the SHAPE, not the
                   content, stated in the permitted vocabulary, SUPPLYING NO NAME for
                   the thing under test.

THE DEFEAT         The more row-specific content the shape carries, the closer it
                   comes to naming the thing under test — which the field forbids. So
                   the safest compliant completion is the emptiest one:

  "a named workflow, stated in the permitted vocabulary, that is impossible under the
   frozen premises in the absence of the candidate"

That is a restatement of D1's own definition. It names nothing, breaks no rule, and is
completable for EVERY candidate — including the arbitrary-content candidates the field
was invented to catch. C-ii then goes GREEN EVERYWHERE.
```

**The scenario that kills it is U5b-D re-run.** Same packet, same deliberately unnamed
fact, declaration completed with the sentence above, C-ii passes _"assessed from the
PACKET"_, pass 1 returns the same null, killers phrase without rivals — and the
closure strengthens on the exact row whose null Gate 2 ruled could not have been
informative. **The repair is defeated by its own no-naming constraint.**

```text
AND THE TWO AVAILABLE PATCHES PULL AGAINST EACH OTHER
  make the shape row-specific enough to be non-vacuous
    -> it PRE-SHAPES THE SEARCH. A shape-of-succeeding-case IS a partial expected
       outcome: it tells pass 1 which family of workflows to look in, and by omission
       which not to. The withholding rule bars "no expected outcome"; the field
       re-admits a sanctioned fragment of it. And nothing anywhere requires the
       declared shape to be EXHAUSTIVE, so a false null becomes author-generated and
       gate-invisible.
  keep it general enough not to pre-shape
    -> it is vacuous, per above.
```

Two further handles the field hands the author, both of which disappear with it:

```text
D4 BY CONSTRUCTION IS SELF-CERTIFYING. No standard governs "cannot be completed" and
  nobody adjudicates the claim. An author who suspects a defender WOULD defend can
  write "no shape is statable without naming the thing" -> no defender runs -> no
  defence is ever recorded -> the failure is booked against the instrument.
THE FIELD WAS NEVER FROZEN. Premises are frozen and pass 1 is sealed; the declaration
  is neither. C-ii forbids judging nameability FROM THE OUTCOME; it does not forbid
  EDITING THE PACKET after the outcome.
```

```text
DISPOSITION: THE FIELD IS WITHDRAWN. Not patched.

CONSEQUENCE, stated plainly rather than worked around:
  C-ii has NO non-circular assessment mechanism.
  -> C-ii is UNASSESSABLE.
  -> THE STRENGTHENING BRANCH IS INOPERATIVE until the author supplies one.

That is the conservative outcome and it is the correct default. A closure that cannot
demonstrate its corroboration simply does not gain strength; it still closes on its
own evidence. Nothing else in the procedure depends on the field.
```

**RESERVED TO THE AUTHOR:** how C-ii is assessed, if it is assessable at all. The
tension above may be fatal to the whole condition rather than to one field, and
deciding that is a decision about the standard of evidence.

### THE DISPOSITION SET IS NOT EXHAUSTIVE — and the holes favour strengthening

```text
H1  A STOP LANDS IN D2. "A missing premise is a STOP" produces no casualty, and D2
    asks only that "pass 1 found no admissible casualty" — LITERALLY TRUE of a stopped
    run. Nothing routes a STOP away from D2. So the STRONGEST disposition is reachable
    by a seat that performed no test, and D2's own second sentence — "the candidate
    was STATEABLE and TESTABLE throughout, so the seat was in a position to have
    succeeded and did not" — becomes a false statement in the record.
    -> RULE APPLIED: a STOP MAY NOT be recorded as D2, and does not satisfy C-i.
       A STOP with a casualty in view is D3. A STOP with none is recorded as a STOP,
       and the row does not strengthen.

H2  PASS 2 DISQUALIFIES A RIVAL, PASS 1 FOUND NO CASUALTY -> FITS NOTHING. Not D1 (no
    casualty), not D2 (D2 requires "no rival was disqualifiable", and one was), not
    D3/D4/D5. This is the most consequential thing the defender can produce — it
    demolishes the opposition's escape route — and the taxonomy cannot express it.
    -> CONSERVATIVE CONSEQUENCE, applied: no disposition applies, so C-i FAILS and the
       row does not strengthen. NAMING A SLOT IS THE AUTHOR'S — a disposition for
       "the rival fell but no casualty was found" decides what disqualification is
       worth, which is a standard-of-evidence choice.

H3  PREMISE INCONSISTENCY HAS NO SLOT. The STOP rule covers ABSENCE, not CONTRADICTION.
    Where two frozen premises conflict, a casualty is constructible for ANY candidate
    and "depending on NO ungranted condition" is satisfied — the conditions WERE
    granted, they merely conflict. This is not hypothetical: the P3/P4 tension is on
    the record, flagged independently by two seats on U5b-D.
    -> RULE APPLIED: an inconsistency is a FINDING ABOUT THE PREMISE SET. It is never
       a casualty and never a rival. Recorded, not pursued.
```

### PRIMACY WAS UNASSIGNED, WHICH MADE C-i AUTHOR-SELECTABLE

`"exactly one is PRIMARY"` named no rule and no owner. Since C-i is evaluated against
the primary, **whoever picked the primary picked whether the closure could strengthen.**

```text
THE SCENARIO: a run that is truly BOTH D3 and D2 — a casualty needing an ungranted
condition, and no casualty in the world the premises actually grant. Record it as
"PRIMARY: D2, secondary: D3", and C-i passes, the closure strengthens, and the
reopening condition — the entire product of D3 — never reaches the headline. Worse with
D4, which exists to report that the INSTRUMENT is broken.
```

```text
PRECEDENCE APPLIED — mechanical, and derived from D2's OWN TEXT rather than chosen

  D4  >  D3  >  STOP  >  D5  >  D2

D2 asserts the candidate "was STATEABLE and TESTABLE throughout". If D4 applies it was
not, and if D3 applies the seat was not in a position to succeed on the granted set.
So D2 is the WEAKEST claim in the set and cannot outrank a condition that contradicts
its own text. D1 is scored separately: it concerns what was FOUND, not what was not.

GATE 2 MAY RE-DERIVE PRIMACY. Without this, C-i is mechanical and keyed to a label, so
the gate can describe a mis-primacy and not cure it — it can complain, but it cannot
un-strengthen. Re-derivation is within Gate 2's existing remit to bound the supported
conclusion.
```

### D1 HAD NO CONTRAST REQUIREMENT — a vacuous casualty established survival

```text
D1 required a workflow "that becomes IMPOSSIBLE ... if the function does not exist."
NOTHING REQUIRED IT TO BE POSSIBLE IF THE FUNCTION DOES EXIST. A workflow impossible
in both worlds satisfies the letter.

TIGHTENING APPLIED: an admissible casualty must be IMPOSSIBLE without the function AND
POSSIBLE with it. Implicit in the word "casualty"; it was not written, and the audit
found it in one pass.

⚠️ SUBSUMED AND STRENGTHENED 2026-08-20. The author's corrected D1 requires not merely
that the workflow be possible WITH the function, but that THE CANDIDATE SUPPLIES that
function — requirement (3). "Possible with something" was still satisfiable by a
function the candidate does not name.
```

**And note the shape the audit named.** The recorded first-outing error was a null that
could not have been informative, so the gate was built to screen **nulls** — and the
mirror-image defect on the **positive** side was entirely ungated. A vacuous D1 also
fails C-i, so it BLOCKS a strengthening the evidence may actually support.

### PASS 2's NEW-CASUALTY BAR IS SIMULTANEOUSLY TOO STRONG AND TOO WEAK

The stated rationale governs **invention**. The rule barred **all** new casualties, and
omitted the escape hatch the same procedure used one paragraph earlier for a
structurally identical hazard — `RECORDED and not leaned on`.

```text
TOO STRONG. Pass 2 inspects rival R, finds R IS available, and in doing so discovers
that pass 1's casualty W never turned on the ground W claimed — it turned on a
different granted premise. The honest output is "W stands, on a corrected ground."
That is none of outputs (1)-(3), and re-grounding is plausibly "a NEW casualty".
Compliance forces output (2), "no rival is disqualifiable", which next to a
known-defective W reads as the defence collapsing. -> D2, C-i passes, closure
strengthens, and AN ADMISSIBLE CASUALTY IS DESTROYED BY A BAR WRITTEN AGAINST
FABRICATION.

TOO WEAK. Pass 2 receives a rival that plainly defeats W, cannot disqualify it and
cannot RETRACT W. The record stands at D1 + "no rival disqualifiable", headline
SURVIVAL ESTABLISHED. The killers are handed a casualty the defender has already
abandoned. D2 is explicitly conditioned on pass 2 ("where pass 2 ran"); D1 IS
CONDITIONED ON NOTHING.

⚠️ THE LAST CLAUSE IS NO LONGER TRUE. The corrected D1 is conditioned on requirement
(4): where rivals were raised, they must be DEFEATED in pass 2. A D1 standing next to
"no rival disqualifiable" is now unreachable, which is the hole this finding named.
```

```text
TWO OUTPUTS ADDED — both consistent with the stated rationale, neither an invention

  (4)  RECORD that a pass 1 casualty's stated GROUND is defective, with the
       corrected ground RECORDED AND NOT LEANED ON. The casualty is not re-grounded
       for scoring purposes; the defect is disclosed.
  (5)  WITHDRAW a pass 1 casualty. Withdrawal cannot be reverse-engineering to evade
       opposition — it runs AGAINST the seat's own interest, which is the strongest
       admissibility signal available. D1 requires a casualty that has NOT been
       withdrawn.

THE BAR ON NEW CASUALTIES STANDS. Pass 1's seal is still what makes a casualty
attributable to the premises.
```

Also corrected: pass 2's output (3) — _"disqualifying a rival would require an
ungranted condition"_ — was booking as D2, because D3 spoke only of a premise-dependent
**casualty**. **D3 now covers premise-dependent DISQUALIFICATION as well.** The
disposition set was written in the vocabulary of casualties, pass 2 speaks the
vocabulary of rivals, and the mismatch resolved toward strengthening every time.

### THE ASYMMETRY CLAIM WAS WRONG — and it recreates the four-times-struck error

The implementer wrote that the defender-sees-rivals asymmetry is **compensated**,
because the charter already routes a named casualty to the killers. **That claim does
not survive.**

```text
PASS 2 RECEIVES        rivals "stated as bare constructions, stripped", with killer
                       rationale, reasoning chain, self-audit and IDENTITY withheld
THE KILLERS RECEIVE    the casualty. NO stripping clause. NO withholding of the
                       defender's reasoning chain. NO anonymisation.

AND THERE CANNOT BE A CLEAN ONE: "W is impossible without F" cannot be stated without
stating why. THE IMPOSSIBILITY CLAIM IS THE RATIONALE.
```

```text
THE CONSEQUENCE, and it is the serious one

Both killers now hold the defender's stated ground — "...because the premises grant
only single-writer attachment." Both attack that step. THEY AGREE. And their
agreement is COMMON-CAUSE AGAIN, now sourced from the DEFENDER'S TEXT rather than the
premise text.

Every anti-common-cause rule in this ledger was built around shared PREMISE text. None
of it contemplates the defender's own argument becoming a shared input. The error
struck four times recurs through a channel the procedure has no rule against.
```

```text
APPLIED — restating a struck rule for the channels that lacked it

KILLER AGREEMENT ON A CASUALTY carries NO corroborative weight. Two seats attacking
the same stated ground is one attack counted twice.

IN A D4 ROW, KILLER AGREEMENT LIKEWISE CARRIES NONE. The gate apparatus bounds what
may be concluded from the DEFENDER'S null and says nothing about a closure resting on
killer agreement alone — so on a candidate the packet itself concedes has no failing
case and no succeeding case, the ORIGINAL four-times-struck error sat at full weight,
in precisely the rows flagged as broken.
```

### TWO ORDERING LEAKS, both of which feed the C-iii defect

```text
L1  THE KILLERS MAY BE DISPATCHED WITH THE CASUALTY IN HAND. Pass 1 may run first, and
    nothing sequences killer dispatch relative to casualty delivery. A killer holding
    the casualty has both motive and material to attack it DIRECTLY rather than offer
    an alternative — which is exactly the phrasing that leaves pass 2 NOT REQUIRED. The
    defender's own disclosure CAUSES the condition that disables its corroboration.
    -> APPLIED: the killers' initial reports are COMMITTED before any casualty is
       delivered. Derived from the seal's own rationale, which is attributability.

L2  NO RECIPROCAL BAR ON THE KILLERS. The defender may not produce a new casualty after
    seeing rivals; NOTHING STOPS A KILLER PRODUCING A NEW RIVAL AFTER SEEING THE
    CASUALTY. The hazard the bar exists to prevent was left open on the side holding
    TWO of three seats, whose default disposition is "nothing survives".
    -> APPLIED: a rival that post-dates the casualty is RECORDED AS SUCH, and pass 2
       receives that fact. It is not barred — a killer answering a casualty is the
       charter's own mechanism — but an answer-shaped rival may not be scored as an
       independently available construction.
```

### THE R2b JUSTIFICATION WAS FALSE — and this one was the implementer's argument

The implementer justified opening rows with R2b (the defender's default lean) undecided
on the grounds that _"the taxonomy makes the choice VISIBLE in the output."_ **The audit
constructed the indistinguishable pair and the claim does not hold.**

```text
RECORD SILENCE -> D3 with a named condition -> VISIBLE
CLOSE IT AGAINST THE CANDIDATE -> D2, whose definition requires nothing about
  silences, and pass 1's permitted outputs are only "a named casualty, or an explicit
  statement that none was found."

NO CLAUSE OBLIGED A SEAT TO ENUMERATE THE SILENCES IT CLOSED. So the choice was
visible only when the seat picked the visible branch. A taxonomy is a set of LABELS,
not a DISCLOSURE REQUIREMENT.
```

```text
THE PAIR — token-identical at every level the headline carries

A  premises silent on concurrent observation. Seat considers a two-consumer workflow,
   resolves the silence AGAINST the candidate, writes: "No admissible casualty found.
   D2."
B  premises explicitly grant single-consumer-only. Seat finds no casualty for that
   reason, writes: "No admissible casualty found. D2."

In A a reopening condition exists and is never recorded. C-i, C-ii, C-iii all pass.
A STRENGTHENS THE CLOSURE ON A SILENTLY EXERCISED UNDECIDED DEFAULT. Gate 2 reviews
raw output and cannot recover it, because A's output never mentions the silence.
```

```text
REPAIR APPLIED — the disclosure requirement that makes the claim TRUE

PASS 1 MUST ENUMERATE EVERY SILENCE IT CLOSED, and in which direction.
An unenumerated silence makes the report INCOMPLETE, not D2.

This does not decide R2b. It makes R2b's exercise VISIBLE, which is what the
implementer's justification asserted and the text did not deliver. R2b REMAINS
RESERVED.
```

Second-order finding, recorded: the undecided lean is **the single knob that moves rows
between D3 (blocks strengthening) and D2 (permits it)**. The gate's decisive input was
at seat discretion and unlogged — and because the seat is not told the author's
expectation, this is not gaming but **uncontrolled variance**, which is worse for any
comparison across rows.

### WHAT THE AUDIT CONFIRMED AS SOUND — recorded, because it bounds the damage

```text
C-ii's "assessed from the PACKET, never from the outcome" is the CORRECT CUT. Post-hoc
  nameability assessment is circular in whichever direction the assessor prefers. The
  defect is WHO AUTHORS THE ARTEFACT, not the rule — which is why the field went and
  the rule stayed.
"NOT REQUIRED rather than skipped" is load-bearing, not pedantry: it converts a silent
  absence into a positive claim someone must own. The defect was that nothing checked
  the claim.
PASS 1's SEAL, including permission to run before killer output exists. Attribution
  requires it. The problem was the ordering's OTHER consequence (L1), not the seal.
D5's "zero weight in either direction" is load-bearing in an underappreciated way:
  because D5 fails C-i, narrowly framing a row so every casualty falls out of scope
  does NOT buy a strengthening — it COSTS one. The obvious framing exploit was already
  closed.
D1's "survival of the DEFENCE, not of the ROW" is the correct separation of
  admissibility from adjudication, and is what keeps D1 from being a veto.
```

### THE AUDIT'S OWN FLAGGED INFERENCES — carried, not laundered

Per Repair 1, an inference beyond the text quarantines the finding it supports.

```text
AGAINST ITS OWN FINDINGS, flagged by the auditor
  it assumed pass 1 receives the stateability declaration. IF THE DECLARATION WERE
    WITHHELD FROM PASS 1, the pre-shaping finding DIES OUTRIGHT. The field is withdrawn
    on the VACUITY finding, which does not depend on this.
  the interpretation gate sees raw output, which mitigates the primacy findings more
    than its framing credits: demoted material is de-headlined, not destroyed. Its
    claim is narrower than it reads — the gate can DESCRIBE, and had no quoted
    authority to override a mechanically-satisfied C-i. That is why the repair GRANTS
    the authority rather than assuming it.
  the severity of the H2 hole assumes an author would reach for D2 as nearest fit.
    The HOLE is textual; the mislabelling is a prediction about behaviour.

FAVOURING ITS FINDINGS, flagged
  that the unquoted burden rules contain no "state your alternative" duty, and no
    stripping clause on casualty->killer delivery. BOTH VERIFIED TRUE against the
    charter text by the implementer: the charter says only "the casualty goes to the
    killers, who must answer it on the frozen premises."
  that packet authorship and completability adjudication are unassigned. TRUE.
  that primacy selection was unconstrained. TRUE — no rule existed.
```

### WHAT THIS AUDIT DID NOT DO

```text
NOT   reopen any row. U5b-A, B and D stay closed on their recorded dispositions.
NOT   change the U5b-E non-openability finding, which rests on E's own wording and on
      no clause repaired here.
NOT   decide R2b, C-ii's assessment mechanism, the H2 slot, or the C-iii residual.
NOT   generate a task. Every reserved item above is a STOP.
```

```text
AND IT DOES NOT VALIDATE THE PROCEDURE. Fifteen leaks found on one pass by one reader
is evidence about how much was WRONG, never evidence that what remains is right. The
next outing inherits an instrument that has been audited once, not an instrument that
has been established.
```

## D1 CORRECTED — SURVIVAL ESTABLISHED IS ADVERSARIAL CONFIRMATION ONLY

**Authority: the human author, 2026-08-20.** Like the P3 freeze and the charter
itself this is a **decision about the standard of evidence**, not a finding. No
reviewer derived it, no gate established it, no experiment produced it. It is an
INPUT to the method.

```text
CITE IT AS   "D1, as corrected by author decision on 2026-08-20, requires ..."
NEVER AS     "the audit established the five requirements" · "D1 was validated" ·
             "the defender charter now proves survival"
```

> **READING THIS SECTION.**
>
> ```text
> THE AUTHOR'S, and nothing else is
>   the FIVE REQUIREMENTS, quoted in their own block
>   the sentence "opposition failure alone is never survival"
>   the NAMING RULE
>   the two row clauses — U5b-D not reopened, U5b-E not opened
>   the retention of the two-pass model and normalized rival packets
>
> THE IMPLEMENTER'S — every other block in this section, including
>   "WHAT THE CORRECTION CHANGES, clause by clause"  (entirely)
>   "NOTHING PROPOSED REMOVING D1"                   (entirely)
>   the LIVE UNCERTAINTIES U1-U5                     (entirely)
>   each block marked GLOSS / READING / UNPACKING / CONSTRUCTION
> ```
>
> The blanket statement above is what governs; the per-block labels are convenience.
> This section was audited for transcription fidelity twice, by readers given the
> decision verbatim and the diff and nothing else. **That is a fact about process,
> not a certificate.** The labels exist because the connective text around a quoted
> decision is where widening enters.

### THE DISPOSITION IS KEPT. It is not removed and it was never to be removed.

The first-day audit found the positive side of the taxonomy ungated — _"every gate
is built to screen the defender's NULL, and nothing screens the defender's POSITIVE,
the killers' phrasing, or a run that never happened."_ **This correction addresses
the POSITIVE only.** The other two branches of that sentence are untouched here and
must not be read as repaired by it. The remedy is **not** to delete the positive; it
is to give it a burden at least as heavy as the one the null carries.

```text
D1  SURVIVAL ESTABLISHED — ADVERSARIAL CONFIRMATION ONLY

All FIVE hold, conjunctively. Any one failing -> NOT D1.

  (1) THE CANDIDATE NAMES A CONCRETE SEMANTIC FUNCTION

  (2) THE POSITIVE BURDEN IS MET BY A CONCRETE INDEPENDENTLY VALUABLE WORKFLOW OR
      CAPABILITY THAT BECOMES IMPOSSIBLE OR WRONG WITHOUT IT

  (3) THE CANDIDATE SUPPLIES THAT FUNCTION

  (4) ACTUAL NORMALIZED RIVAL CLAIMS FROM A/B ARE DEFEATED IN PASS 2 WHEN RAISED

  (5) NO UNEARNED PREMISE OR INCUMBENT CARRIER IS IMPORTED
```

The five above are the author's words. **Everything below is the implementer's
reading of them**, recorded separately so it can be struck without touching the
decision. None of it is a further requirement.

```text
IMPLEMENTER GLOSS — STRIKEABLE, adds nothing to the five

  on (1)  a candidate that does not say what it asserts is required cannot be
          defended, and a defence built for it defends nothing. WHICH DISPOSITION
          such a row takes is NOT decided here — the decision says only NOT D1.
  on (2)  "not harder, not uglier, not more verbose" is the charter's existing
          exclusion and is untouched; those remain Table G, zero function weight.
  on (3)  impossible-in-both-worlds fails, and so does rescued-by-a-function-the-
          candidate-does-not-name.
  on (4)  a casualty standing beside "no rival was disqualifiable" is not D1.
  on (5)  reads onto the existing burden rules 1, 2 and 4 and Rule 0j. A casualty
          impossible only under an assumed carrier is a carrier claim inside a
          function seat.
```

### OPPOSITION FAILURE ALONE IS NEVER SURVIVAL

That sentence is the author's, verbatim, and it is recorded as a rule.

```text
IMPLEMENTER UNPACKING — STRIKEABLE. Cases the sentence covers on its face:
  the killers failed to defeat the candidate
  a rival was disqualified and nothing positive was produced
  the premises are silent where a refutation would have to live
  the defence was not refuted

NOT CLAIMED HERE: that the decision reaches the NULL side as well. A non-informative
null already fails to strengthen a closure under C-i/C-ii/C-iii, on its own footing,
and the author's sentence is about SURVIVAL — the positive. The symmetry is available
and is NOT being asserted as part of this decision.
```

**IMPLEMENTER READING, STRIKEABLE** — the five are conjunctive either way, so
striking this makes nothing optional: (2) and (3) are a _burden_ rather than a test
the opposition must fail, and (4) is a _further_ hurdle on top of that burden, never
a substitute for it.

### WHAT THE CORRECTION CHANGES, clause by clause

```text
THE BAR              requirement (2) reads "IMPOSSIBLE OR WRONG". A WIDENING, and
                     the author's to make. IT REACHES THE CHARTER'S GENERAL CHARGE,
                     because that charge is the only channel a casualty is produced
                     through — leaving it at IMPOSSIBLE would scope the widening out
                     of operation. ENTAILED CONSEQUENCE, disclosed: D3 is defined
                     over casualties, so it widens too.

"WRONG"              IMPLEMENTER GLOSS, STRIKEABLE, and flagged again at U2: the
                     reading in force is "produces an incorrect result under the
                     frozen premises". The author supplied the word and no test.
                     It does NOT mean unidiomatic, surprising, unfamiliar, or
                     unlike another library — that much follows from the charter's
                     existing ergonomics exclusion, not from a new gloss.

D1's CONTRAST        the audit's "impossible without AND possible with" is subsumed
                     by (3), which additionally requires ATTRIBUTION to the
                     candidate.

D1's CONDITIONING    the audit recorded "D1 IS CONDITIONED ON NOTHING". Now false:
                     (4) conditions it on pass 2 wherever a rival was raised.

"NOT CITABLE AS      over-broad as written — read literally it bars the seat from
 THE DEFENDER        establishing anything. NARROWED to what it meant: no defender
 ESTABLISHED X"      report establishes a fact about the ARCHITECTURE. Still not a
                     premise, still not a sibling prior, still not a row verdict.
                     THE REPLACEMENT CITATION FORMULA IS THE IMPLEMENTER'S and is
                     flagged as strikeable at the clause itself — the decision
                     addresses what D1 REQUIRES, not how a D1 is cited.

ROW vs DEFENCE       UNCHANGED. D1 is the DEFENCE's disposition. The casualty still
                     routes to the killers, who answer it on the frozen premises.
                     Separating admissibility from adjudication is what keeps D1
                     from being a veto — and it is NOT a bar on the seat
                     establishing anything.

TWO PASSES           UNCHANGED, and now load-bearing for the positive as well as
                     the null. Pass 1 stays SEALED; pass 2 stays CONDITIONAL on a
                     killer having relied on a rival.

NORMALIZED RIVAL     NAMED, not redefined. It is the existing pass-2 delivery:
 PACKET              rival claims and absence alternatives as bare constructions,
                     with killer VERDICTS, killer RATIONALE, REVIEWER IDENTITY and
                     IMPLEMENTATION DETAIL withheld.
```

### NOTHING PROPOSED REMOVING D1 — recorded so the correction is not over-claimed

The ledger was searched for text saying the defender may not establish survival, or
that SURVIVAL ESTABLISHED should be struck. **No clause SAYS either.** The first-day
audit attacked D1's _looseness_, not its existence, and explicitly recorded D1's
row/defence separation as SOUND.

```text
WHAT WAS ACTUALLY THERE — one clause, over-broad rather than wrong

  "not citable as 'the defender established X'"
    the only text in the ledger that CAN BE READ as barring the seat from
    establishing anything. Narrowed above to the architectural claim it meant.

NO DISPOSITION WAS RESTORED, because none had been removed. The correction adds a
burden to D1; it does not resurrect it. Recording this is the point — a correction
that invents the defect it repairs is the same error in the opposite direction.
```

### THE NAMING RULE — incumbent-neutral does not mean function-anonymous

```text
A CANDIDATE MUST NAME THE OBSERVABLE SEMANTIC PROPERTY BEING TESTED.

INCUMBENT-NEUTRAL   states no entityMap, no SubjectId, no effect log, no carrier,
                    no v14 noun. STILL REQUIRED.
FUNCTION-ANONYMOUS  states no observable property at all — "semantics", "a shared
                    fact", "coordination". NO LONGER PERMITTED.

The two were conflated. Withholding the INCUMBENT'S VOCABULARY protects the
derivation. Withholding the PROPERTY UNDER TEST destroys the instrument: an
unnamed existential has no failing case AND no succeeding case, so every seat
returns a null that could not have been informative.
```

```text
WHAT THE RULE DOES   makes function-anonymity a DEFECT IN THE CANDIDATE. It is a
                     requirement ON CANDIDATES, stated forward.

WHERE SUCH A CANDIDATE LANDS — by D4's OWN unchanged definition, not by a new rule
  D4 already reads "no defence is STATEABLE because the candidate does not say what
  it asserts is required." A function-anonymous candidate has exactly that property,
  so a seat facing one reaches D4 on the taxonomy as it stands. The naming rule adds
  no disposition and needs none.

WHAT THE RULE DOES NOT DO — and the implementer may not supply either
  it does NOT re-create PACKET-TIME PRE-CLASSIFICATION. Declaring a row D4 BEFORE
    any seat runs was the mechanism of the DEFENCE-STATEABILITY DECLARATION, and
    that field is WITHDRAWN. D4 reached BY A SEAT is unchanged and unaffected.
  it does NOT bar a row from OPENING. That question was already reserved to the
    author and stays reserved.
  it is NOT A LICENCE TO REWORD. The implementer may not restate an existing
    candidate to satisfy the rule. Rewording is semantic authorship.
```

### U5b-D IS NOT REOPENED, and its terminal issue is TWO-PART

```text
DISPOSITION   UNDERDETERMINED, terminal. UNCHANGED. Not rejected, not refuted.
NULL          FORBIDDEN, as before.
NOT RE-RUN    no seat, no pass-2 simulation. Re-running a defender at a closed row
              under a corrected procedure is a work order generated from a method
              change, and it is forbidden.
```

```text
THE TERMINAL ISSUE, STATED CORRECTLY — it was recorded too narrowly before

  PREVIOUSLY   "the defender's null was guaranteed by the charter design in
               advance" — i.e. the defect was in the INSTRUMENT.

  ALSO TRUE, and it is the part that was under-recorded:
               THE ROW SUPPLIED NO SUFFICIENTLY NAMED SEMANTIC PROPOSITION TO
               DEFEND. The candidate required its central fact to stay unnamed.
               That is a defect in the CANDIDATE, not only in the seat's charter.

BOTH ARE TERMINAL AND NEITHER RESCUES THE OTHER. Repairing the defender procedure
does not make U5b-D answerable, because a corrected D1 still requires (1) — a
concrete named semantic function — and the row never had one.
```

This closes a reading the earlier record left open: that U5b-D was a victim of a
defective instrument and would become decidable once the instrument was repaired.
**It would not.** Under the corrected D1 the row fails requirement (1) before any
seat runs.

### U5b-E DOES NOT OPEN

```text
STATUS        NOT OPENED, NOT OPENABLE AS WORDED. Unchanged. Five contaminants
              (E1-E5), none implementer-repairable. No seat has run.
E2 IS NOW     doubly disqualifying — "semantics" was already an unnamed fact, and
              the naming rule makes function-anonymity a defect rather than a
              neutral wording choice.
OPENS ONLY ON  a NEW HUMAN-AUTHORED CANDIDATE STATEMENT. Not a reworded E, not an
              implementer restatement, not a repair derived from the naming rule.
FORBIDDEN     treating the naming rule as instructions for how to reword E. The
              rule diagnoses; it does not author.
```

**And the family stays exhausted.** "No U5b row was openable" still may not be read
as "transaction-shaped functions are not required" — that converts an instrument
result into an architectural verdict, and the correction above changes nothing about
which functions are established.

### LIVE UNCERTAINTIES THIS CORRECTION INHERITS OR CREATES

Recorded, not repaired. Supplying a test for any of them would set the standard of
evidence by fiat, which is the move this method exists to prevent.

```text
U1  "INDEPENDENTLY VALUABLE" is still an UNSTATED BAR. Requirement (2) uses it, and
    the ledger already records it as untested family-wide — any workflow can be
    denied as not independently valuable. The correction inherits this; it does not
    fix it.

U2  "OR WRONG" HAS NO TEST beyond the negative bar. "Produces an incorrect result
    under the frozen premises" is the reading in force, and it is the implementer's
    conservative gloss on the author's word, flagged as such.

U3  (4) SAYS "WHERE RAISED". So a D1 reached with ZERO rivals raised satisfies (4)
    vacuously. This is deliberately ASYMMETRIC with C-iii, which the audit narrowed
    so that no rival raised -> C-iii FAILS. The asymmetry is coherent (C-iii gates
    the strengthening of a CLOSURE; (4) gates a POSITIVE) but whether the author
    intends the positive to be reachable without opposition is NOT SETTLED.
    IMPLEMENTER-ADDED DISCLOSURE, strikeable: a D1 record MUST state whether any
    rival was raised, so no later citation reads it as having survived opposition
    that never existed. This changes no disposition.

U4  R2b — the defender's DEFAULT LEAN on a silence — remains reserved and untouched.

U5  C-ii's assessment mechanism remains withdrawn, so the STRENGTHENING BRANCH FOR
    NULLS IS STILL INOPERATIVE. The correction is about D1 and does not revive it.
```

```text
NO CLAUSE HERE IS A WORK ORDER. Nothing may be measured, benchmarked, or dug out of
repository history on the strength of any of it. No row is reopened. No candidate is
reworded.
```

## Table G — DX PRESSURE LEDGER

**Deliberately a SEPARATE table, not a column.** An `OPTIMAL DX` column inside
the architectural matrix would be filled with concrete syntax within a week, and
then defended. This records CAPABILITY only. See
[Rule 0m](../../RELEASE-1.0.md).

Its job is to catch one specific failure: converting _"the runtime does not need
this machinery"_ into _"the author may not express this"_. Those are different
claims, and lowering is what separates them.

| Function                     | Semantic result                                                      | DX capability worth preserving                      | Semantics forbid it?                                                                             | DX status |
| ---------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| derived projections          | canonical -> read-only projection; no runtime derived->derived graph | compose named projections naturally                 | **NO** — candidate lowering is transitive expansion to canonical inputs (HYPOTHESIS, not proved) | UNPROVEN  |
| optional behaviour selection | compile before exposure; no post-exposure composition                | declare optional behaviour concisely in one place   | **NO** — a declaration form is unconstrained by the absence of a chain                           | UNPROVEN  |
| external acquisition         | application/service-owned                                            | bind an acquired result into tree state easily      | **NO** — ownership says who executes, not how authoring reads                                    | DEFERRED  |
| input -> acquisition         | Angular/application reactive layer                                   | express "when this changes, fetch" without ceremony | **NO**                                                                                           | DEFERRED  |
| workflow state (`status`)    | ordinary store truth + derived predicates                            | name a workflow state and read its predicates       | **NO** — the predicates are ordinary projections                                                 | DEFERRED  |
| request cache policy         | ordinary request cache, no SignalTree ownership                      | declare staleness/invalidation near the data        | **NO**                                                                                           | DEFERRED  |
| commands (`_`)               | function itself UNPROVEN                                             | colocated, typed, intentional actions               | **N/A** — no function to constrain yet                                                           | UNPROVEN  |
| entity collections           | not yet derived                                                      | address entities by key with good inference         | **UNDETERMINED**                                                                                 | UNPROVEN  |

**Status vocabulary, because the distinction is load-bearing:**

```text
NO             semantics ARE derived and do not prohibit the capability
UNDETERMINED   semantic derivation has not closed far enough to answer
N/A            the underlying function has not earned existence
```

**UNPROVEN must never be silently read as NO** — that would presume a capability
eligible on the strength of an unfinished derivation.

**Corrected summary.** Six of the eight rows read NO; one is N/A and one is
UNDETERMINED. So the honest claim is:

> Every derived semantic result examined so far has FAILED to prohibit its
> corresponding authoring capability. **No semantic derivation has yet earned a
> DX prohibition.** Rows whose function or semantics remain unproven stay
> UNDETERMINED or N/A.

An earlier draft of this section said "every row reads NO", which overstated the
evidence by two rows. The weaker claim is the stronger one, because it asserts
nothing beyond what was measured.

### `derived` — two propositions, kept apart

```text
SEMANTIC THEOREM              PROVED (RFC 0015)
  finite acyclic projection composition is expressible as a function of
  canonical truth

AUTHORING/COMPILER CLAIM      UNPROVEN
  SignalTree can recognise named projection references, expand them
  transitively, detect cycles, preserve typing, and realize them WITHOUT
  derived->derived runtime edges
```

Only the FIRST supports reopening the DX capability. The second is what an
implementation would have to earn, and it is untested. The mathematical
substitution is easy; building the authoring compiler without runtime `a -> b`
topology is the real falsifier, and it is what:

```ts
derived: { a: ($) => $.x() + 1, b: ($) => $.a() * 2 }
```

would have to be measured against. Stating it as fact would let LOWERING
HYPOTHESIS quietly become LOWERING PROVED.

### What must NOT go in this table

```text
$.subtotal()          derived.subtotal        derive(subtotal)
features: [...]       using: [...]            extensions: [...]
tree._.users.reload()
```

None of those is frozen, and recording one here would make it look like it were.
The capability is _"let authors compose named projections naturally"_; the
spelling is a later, single, system-wide decision.

### Extend this treatment to the rest of the matrix

Tables A-D's remaining rows must be converted the same way as they come up. Do
**not** ask "does `asyncSource()` survive?" Ask what applications were getting:
represent pending/value/error, trigger acquisition, invalidate, retry, connect a
result to tree state, track request identity — then ask which of those are
SignalTree-owned, which the store/derived/command architecture already provides,
and what is left that ordinary application code cannot express well. The old
concept may evaporate entirely, or one function may survive and produce a small
new primitive.

`stored()` is the sharpest case, because its two halves already have DIFFERENT
frozen authorities. Do not ask what a new `stored()` looks like. Ask separately
how committed truth produces durable consequences, how external durable state
enters construction, whether a position needs a declarative durability policy,
and whether hydration belongs to that same declaration. Only if those converge
independently should a combined concept reappear.

And `derived` is the worked example: its function was never "preserve
`.derived()`", it was "represent read-only projections of canonical state". The
object-literal form survived because it fit the independently derived function —
not because the old system had derived state.

### Methodological warning worth keeping in the RFC

Amendment 3 measured `loader.ts` — a 102-line tree-shaking re-export — and
concluded the family provided nothing. A2 then measured the 720-line
implementation and found the discovery pass had TWO of its Tier 2 rows backwards
(the generation guard and dedup are present, F4). **Measuring a facade instead of
the implementation can manufacture an absence result just as easily as taking a
legacy abstraction at its word can manufacture a requirement.** Both failures
produce confident, wrong dispositions; both are cheap to avoid by checking line
count and call graph before believing a scan.

## HEAD RECONCILIATION — F1-F8 read in full, and what each falsifier earns

Recorded after two false-absence errors made a summary-based derivation
untrustworthy. **HEAD plus executable evidence wins over anything asserted in
conversation.** T2 stays CLOSED; this adds precision, and corrects nothing.

| F#  | Property under test                                                              | Observed                                                                                                                                          | Proves                                                                                                                                  | Does NOT prove                                                |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| F1  | same map key, NEW semantic subject (`removeOne('w1')` then add a different `w1`) | `loaded()` true, `lastLoadedAt()` unchanged, `load()` does not refetch                                                                            | the substitution is INVISIBLE to the cache — identity/lifetime are not consulted                                                        | that it _should_ react; no desired behaviour is asserted      |
| F2  | `clear()` the whole collection                                                   | still `loaded()`, no refetch                                                                                                                      | entity lifetime does not participate in freshness                                                                                       | that emptiness ought to invalidate                            |
| F1b | a locally added entity                                                           | still fresh, no refetch                                                                                                                           | freshness is a fact about the LAST FETCH, not about contents                                                                            | anything about merge policy                                   |
| F3  | one external resource behind two collections in one tree                         | `calls === 2`; invalidating `left` leaves `right` fresh                                                                                           | freshness is per LOADER INSTANCE, not per resource — the ownership test failing                                                         | that sharing would be better                                  |
| F3b | `tags` + `invalidateTag` across two trees                                        | returns 1; treeA stale, treeB fresh                                                                                                               | tags address COLLECTIONS and the authority is TREE-SCOPED                                                                               | that entities carry tags — none do                            |
| F4  | earlier-started, later-completing load (scope `west` then `east`)                | the obsolete completion cannot land; `params()` is `east`                                                                                         | **stale LANDING is protected**, on the Promise path, by the `runId`/`myRun` guard                                                       | that same-scope overlap is protected; the test crosses scopes |
| F5  | `invalidate()` during flight                                                     | **DEFECT** — `settleSuccess()` does `invalidated.set(false)`, so the invalidation is erased; no refetch for 30 min, pre-change value marked fresh | invalidation does not survive a concurrent completion                                                                                   | anything about acquisition execution as such                  |
| F6  | `refresh()` during flight                                                        | **DEFECT** — `calls` stays 1                                                                                                                      | `refresh()` breaks its OWN documented contract, "force a reload, ignoring `staleTime`/scope-match" — it does not bypass in-flight dedup | that dedup itself is wrong                                    |
| F7  | `swr: true` then `invalidate()`                                                  | `loaded()` true, `loading()` false                                                                                                                | `swr` collapses `loaded()` into HAS-EVER-LOADED — the staleness flag becomes unreadable                                                 | that stale-while-revalidate is implemented at all             |
| F8  | landing over a locally added entity                                              | `setAll(rows)` discards it; `ids()` is `['w1']`                                                                                                   | landing has NO merge policy, so it cannot be said to respect entity identity or lifetime — **it discards both**                         | that a merge policy is wanted                                 |

### The Tier-2 theorem, stated precisely

F5/F6/F7 falsify the **cache/invalidation ORCHESTRATION**, not "the acquisition
mechanism" in the broad sense. Which contract each breaks:

```text
F4  cross-scope stale-LANDING exclusion            HOLDS
F5  invalidation durability across a completion     BROKEN  (cache policy)
F6  refresh()'s own documented force-reload         BROKEN  (cache policy)
F7  the swr option's implied contract               BROKEN  (cache policy)
```

So: **stale data cannot LAND, but stale data can be MARKED FRESH.** Those are
different functions, and only the second is broken. Nothing here is an
acquisition-execution contract, and the old combined `loader` concept must not be
allowed to re-bundle them.

**F8 strengthens Outcome A beyond what the reading-based pass claimed.** Landing
does not merely use the ordinary public API — it DISCARDS entity identity, since
`setAll` drops a locally known row the server did not return. A mechanism that
throws entity identity away is not an entity-semantic mechanism.

### METHODOLOGY RULE 2 — earned by the `runId` mistake

> **An absence claim cannot be established by an incomplete vocabulary search.
> Search for the BEHAVIOUR, not for the names you expect its implementation to
> use.**

A grep for `generation|requestId|inFlight` missed `runId`/`myRun` and produced a
confident false absence that was committed as a finding. A grep is DISCOVERY
evidence. A defensible absence claim needs one of:

```text
control-flow inspection of every settlement path
an executable overlapping-run falsifier
a structural proof that no state can distinguish runs
```

Any of the three would have caught `runId` immediately. This sits beside the
facade rule: one manufactures absence from the wrong FILE, the other from the
wrong VOCABULARY.

## NEW EVIDENCE for A1's input-binding question — no disposition

`async-query.ts:284-288` binds input to acquisition with **Angular `effect()`
plus an RxJS `trigger$` Subject**, the effect calling `untracked(() =>
trigger$.next(v))`.

```text
ESTABLISHES     the current mechanism is reactive orchestration built from
                Angular + RxJS primitives
DOES NOT        establish that the OWNER is application/framework
ESTABLISH
```

The null still to run, unchanged: _if SignalTree does not own input->acquisition
orchestration, what SignalTree semantic fact would external Angular/RxJS
composition have to duplicate?_ If the answer is nothing, this measurement
becomes strong corroboration that the orchestration was colocated inside
SignalTree rather than owned by it — the fourth instance of the colocation
warning.

## DERIVATION A1-1 — external acquisition ownership: **NOT EARNED**

Evidence: `async-source-a1-equivalence.spec.ts`, six executable falsifiers.

**Null:** assume SignalTree never invokes user-supplied async acquisition
functions; applications perform external work and commit results through
ordinary public tree writes. What independently required SignalTree semantic
function becomes impossible?

**Method.** Methodology Rule 2 says an ABSENCE claim cannot rest on an
incomplete vocabulary search. The symmetric discipline applies to a POSITIVE
equivalence claim: it must not rest on one toy rewrite. So each behaviour is
exercised against the real marker and against `plainAcquire` — a signal triple
plus an async function, which is what a service would write — under the SAME
assertions.

| #     | Behaviour                           | Result                                                                                       |
| ----- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| A1-C1 | eager initial acquisition           | reproduced exactly                                                                           |
| A1-C2 | `lazy`                              | reproduced by NOT CALLING. `lazy` names the absence of an eager call; it is not a capability |
| A1-C3 | overlapping refresh, Promise source | **the marker lets the obsolete completion WIN**; `plainAcquire` guards it in four lines      |
| A1-C4 | failure recording                   | reproduced exactly                                                                           |
| A1-C5 | `reset`                             | reproduced exactly                                                                           |
| A1-C6 | landed value vs authored write      | indistinguishable — same value, same unwrap participation                                    |

**A1-C3 is the row that matters.** The ordinary application version is not merely
equivalent, it is STRICTLY BETTER: a four-line generation guard gives it
stale-completion exclusion that the marker's Promise path does not have. A
function whose ordinary replacement is more correct than the abstraction has not
established ownership.

### Consumption

```text
asyncSource   0 consumers outside core
asyncQuery    0 consumers outside core
```

Not in the demo, not in any first-party package. Evidence, not a verdict — the
equivalence falsifiers are what carry the argument.

### Disposition

```text
EXTERNAL ACQUISITION EXECUTION

USE CASE            real
OWNER               application / service / integration layer
SIGNALTREE FUNCTION not earned — nothing SignalTree uniquely owns was required
                    to reproduce any measured behaviour
```

Nothing SignalTree-owned appeared on the list of things the external version had
to duplicate: no tree semantic identity, no causal attribution, no atomic commit
authority, no validation or refusal, no tree-owned lifetime, no publication
guarantee. What the marker supplies over `plainAcquire` is colocation and fewer
lines — DX, which cannot earn a primitive.

**No `asyncSource` replacement is designed.** A1-2, input-binding ownership,
remains OPEN and is not answered by this row.

**The concurrency defect stays out of the ownership argument.** A1-C3 proves the
current abstraction has no uniform concurrency semantics across the loader types
it accepts. It does not argue for or against SignalTree owning acquisition — same
treatment as the Tier-2 defects. If acquisition ever survives under SignalTree
ownership, it becomes a greenfield correctness requirement; if it does not, it
belongs to whatever execution owner survives.

## DERIVATION A1-2 — input -> acquisition orchestration: **NOT EARNED**

Evidence: `async-query-a1-2-equivalence.spec.ts`, six executable falsifiers,
stable across five consecutive runs.

**Null:** assume SignalTree never automatically performs external work because a
tree-visible input changed. Angular/RxJS composition may observe that input and
invoke acquisition externally. **What SignalTree semantic fact must that external
composition duplicate?**

### The measured pipeline is stock, end to end

```text
inputSignal -> effect() -> trigger$ (Subject)
  -> filter(config.filter)
  -> debounceTime(config.debounce)
  -> distinctUntilChanged(config.equal)
  -> merge(rerun$)
  -> switchMap(query)
  -> tap(set results / error / loading)
```

Every stage is an Angular or RxJS primitive. Nothing in it reads tree topology,
position identity, causal state, or any other SignalTree authority.

| #     | Behaviour                            | Result                                                                               |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| A1-Q1 | input change drives acquisition      | reproduced by `toObservable` + `switchMap`                                           |
| A1-Q2 | equal successive inputs suppressed   | reproduced by `distinctUntilChanged`                                                 |
| A1-Q3 | `filter` skips inputs                | reproduced by an ordinary `filter`                                                   |
| A1-Q4 | stale exclusion                      | **`switchMap` does it on BOTH sides**                                                |
| A1-Q5 | `rerun` bypasses dedup               | reproduced by merging a `Subject` after the dedup stage                              |
| A1-Q6 | outside an Angular injection context | **input changes silently stop driving queries**                                      |
| A1-Q7 | `debounce` coalescing rapid input    | reproduced by `debounceTime` — three rapid sets, one query                           |
| A1-Q8 | **teardown owner**                   | **the binding OUTLIVES `tree.destroy()`**                                            |
| A1-Q9 | **equality domain**                  | `equal` compares INPUT VALUES; two distinct objects with equal fields are suppressed |

### A1-Q8 — the best remaining counterexample, and it fails

A binding whose lifetime were a tree POSITION or a `SubjectId` would be a real
ownership claim: external code could not obtain that lifetime without duplicating
SignalTree identity semantics. Measured, it is not one.

```text
async-query.ts:213   inject(DestroyRef, { optional: true })
async-query.ts:271   takeUntilDestroyed(destroyRef)
async-query.ts:290   effect(..., { manualCleanup: false })

registerCleanup       never called
tree reference        none held
```

The lifetime owner is the **Angular injection context's owner** — a component or
service. Executably: after `tree.destroy()` with `tree.destroyed() === true`, a
further `input.set()` still drives a query. The tree never owned the binding, so
an external `effect()` obtains the identical lifetime by the identical mechanism,
`inject(DestroyRef)`, duplicating nothing tree-owned.

### A1-Q9 — the comparison domain

`equal = Object.is` at :194, applied as `distinctUntilChanged(equal)` at :227. The
domain is the INPUT VALUE. Two distinct object identities carrying equal fields
are suppressed by a field comparator, and no tree concept is reachable from the
comparator at all. Generic reactive equality, not semantic identity.

### Pipeline order, corrected

The measured order is `debounceTime -> filter -> distinctUntilChanged`, not
filter-first as an earlier note in this file said. `rerun$` merges in AFTER dedup,
which is why it bypasses both debounce and equality suppression.

### A1-Q4 corrects the family framing AGAIN

`asyncQuery` IS protected against stale landing — `switchMap` unsubscribes the
previous inner source. So the three concurrency pictures differ:

```text
asyncSource, Observable loader   protected by unsubscribe
asyncSource, Promise loader      UNPROTECTED
asyncQuery, either               protected by switchMap
entity-loader                    protected by runId/myRun
```

Three of four protect stale landing; the exception is the one path with no
cancellation primitive available. **"The async family has no stale-result
exclusion" was wrong three times over** — first from the wrong file, then from
the wrong vocabulary, and it would have been wrong again here from generalising
across markers that do not share an implementation.

### A1-Q6 is the ownership row

Outside an injection context, `effect()` throws, the marker swallows it, and
input changes stop driving queries — silently. The orchestration does not merely
USE Angular primitives; **it does not function without Angular's context.** And
`plainQuery` has exactly the same requirement: `toObservable()` also asserts an
injection context.

So the external composition duplicates nothing SignalTree-specific. It needs
Angular — same as the marker.

### Disposition — Outcome A

Every input-binding behaviour is reproducible with ordinary public state plus
Angular/RxJS composition. Nothing on the ownership list appeared: no `PositionId`
semantics, no `SubjectId` lifetime, no commit authority, no causal attribution,
no tree-owned topology relationship, no publication ordering. What external code
needs is: read the signal, observe changes, debounce, filter, compare, invoke a
function.

```text
INPUT -> ACQUISITION ORCHESTRATION

USE CASE            real
OWNER               Angular / application reactive layer
SIGNALTREE FUNCTION not earned
```

### Harness defect, recorded

An earlier draft passed ONE shared `query` closure to both the marker and the
plain composition, so a single counter tallied both pipelines; Q5 read 4 where it
expected 3. That was a defect in the falsifier, not in either subject. Each side
now has its own counter. Noted because a miscounting harness is exactly the kind
of thing that produces a confident wrong disposition.

## TIER 1 — CLOSED. `asyncSource` / `asyncQuery` legacy dispositions

Both A1 questions return NOT EARNED, so A1 is no longer suspended.

```text
A1-1  external acquisition execution      owner: application / service
A1-2  input -> acquisition orchestration  owner: Angular / application reactive
```

| Legacy                         | What it happened to provide                            | Disposition                                                                                                               |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `asyncSource`                  | acquisition + pending/error state + refresh/reset/lazy | **DELETE** — every behaviour reproduced by `plainAcquire`, and A1-C3's plain version is strictly MORE correct             |
| `asyncQuery`                   | the same, plus input binding and shaping               | **DELETE** — the pipeline is stock Angular/RxJS and requires Angular's context to work at all                             |
| `status`                       | workflow state recording                               | **DELETE** (S1) — two store positions and derived predicates                                                              |
| `loader` / entity-loader cache | request-scoped cache policy                            | **no SignalTree ownership earned** (T2/A2) — parked, not deleted, pending the `entityMap` derivation it is spelled inside |

**The surviving functions and their owners:**

```text
external work            application / service
input orchestration      Angular / application reactive layer
canonical result         store
workflow + error state   ordinary store positions
projections              derived
request cache policy     ordinary cache — no owner earned in SignalTree
```

**SignalTree async primitive: nothing left.** That is a successful derivation,
not a missing replacement — no successor is designed, and Rule 0l forbids an
adapter whose only purpose is preserving a rejected form.

**What is NOT concluded.** `entityMap` itself is untouched by any of this; only
the cache spelled inside it was audited. `stored()`'s hydration half remains for
the persistence derivation. And the concurrency defects stay in the ledger as
correctness falsifiers against any future feature that claims acquisition
ownership — they are not repairs owed on a deleted mechanism.

## DERIVATION A1 — bare acquisition: **SUSPENDED, not closed**

Rule 0l. Suspended because the discovery pass measured a re-export: the family
is TWO TIERS with materially different capability, and an audit that treats it
as homogeneous produces a manufactured absence result. Tier 1's facts stand as
measured; the disposition does not follow from them yet.

```text
TIER 1 — BARE ACQUISITION

result landing
  ordinary signal writes only

causal semantics
  none measured

atomic landing
  none measured

subject identity
  none measured

persistence consequence
  none measured

concurrency protection
  Observable path: previous subscription prevents stale landing
  Promise path: no stale-result exclusion

acquisition ownership
  OPEN

input-binding ownership
  OPEN
```

**Hard boundary, and it is the point of suspending rather than continuing:**
Tier 2 is a SEPARATE EVIDENCE SOURCE, not "the more capable async
implementation". Nothing measured in `entity-loader.ts` may be credited back to
`asyncSource` / `asyncQuery` unless those concepts independently provide it. A
run-id guard in the loader is not evidence that acquisition-as-such is
adequately implemented anywhere else, and A2's findings below carry no
disposition for Tier 1.

## Frozen baseline this matrix may not re-derive

- `SignalTree owns truth · Angular owns observation · causal history owns meaning`
- `PositionId != SubjectId != SlotIndex != key/path`
- `PREPARE → PRIVATE COMMIT → PROJECT → PUBLISH → CONSEQUENCE`
- All expected fallible semantic work precedes private commit; PROJECT reflects
  committed truth and never determines authority; persistence is post-commit.
- Atomicity is externally observable coherence, not a count of revision bumps. A
  semantic transaction may span more than one private substrate commit; no
  observer, publication adapter or persistence consequence may see an
  intermediate heterogeneous state.
- The durability authority is TREE-SCOPED; unresolved scopes hold that tree's
  durable consequences; foreign-tree scopes never interfere.
- A rollback REFUSAL is not a rollback success: surviving authoritative truth
  FLUSHES.
- The derived projection contract (RFC 0015), in full.

## Legend

```text
FROZEN         established by a recorded derivation; reopen only on a concrete
               deterministic counterexample
DERIVED        a derivation ran and recorded a result; nothing was frozen
MEASURED       a fact about HEAD, carrying no disposition
CANDIDATE      hypothesis only
NULL NOT RUN   no derivation has been attempted
—              deliberately blank. Filling it requires running the NULL.
```

Tier is [Rule 0k](../../RELEASE-1.0.md)'s four-tier triage: **T1** finish MUT
first · **T2** auditable after MUT, own NULL each · **T3** needs its own
derivation once the kernel settles · **T4** package verdicts last.

---

## Table A — Function and ownership

MUT-0's rule governs this table: existing code may prove a FUNCTION is useful, it
may NEVER prove its current ABSTRACTION is necessary. `FUNCTION` and `OWNER` are
therefore blank wherever the NULL has not been run — filling them from the
current implementation is the exact reflex MUT-0 exists to block.

`PUBLIC NEED` uses the three levels that must never be collapsed:
**CI** core-internal · **FP** first-party package · **TP** third-party SDK.

| #   | Concept                            | Tier | Function                                                                              | Owner                                              | Public need | Current form (MEASURED at HEAD)                                                                                                                                                                                |
| --- | ---------------------------------- | ---- | ------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `signalTree()` construction        | —    | construct a tree from a declaration                                                   | —                                                  | TP          | `signalTree(obj)`; callable tree; `.with()` chain                                                                                                                                                              |
| 2   | store / canonical truth            | —    | hold authoritative state                                                              | SignalTree (FROZEN)                                | TP          | nested signals over slot substrate                                                                                                                                                                             |
| 3   | `$` state facade                   | —    | address state                                                                         | SignalTree (FROZEN cutoff test 2: no root surface) | TP          | `tree.$`, `tree.state`                                                                                                                                                                                         |
| 4   | derived projection                 | T3   | —                                                                                     | —                                                  | TP          | `derived:` block contract FROZEN; `.derived()` chain is a DELETE candidate                                                                                                                                     |
| 5   | `derivedFrom()`                    | T3   | PROVED — TS7006 at a module boundary is real                                          | —                                                  | TP          | exported helper; form unsettled                                                                                                                                                                                |
| 6   | `linked()`                         | T3   | —                                                                                     | —                                                  | —           | wraps `linkedSignal`; writable; reads own prior value; lives in `.derived()` for facade access only                                                                                                            |
| 7   | `asReadonly()`                     | —    | narrow mutation capability on `$`                                                     | —                                                  | TP          | type-level narrowing; not an `as any` guard                                                                                                                                                                    |
| 8   | `entityMap`                        | T3   | —                                                                                     | —                                                  | TP          | SubjectId frozen; Angular supplies no normalized identity                                                                                                                                                      |
| 9   | `byKeys`                           | T3   | —                                                                                     | —                                                  | —           | entity key selection                                                                                                                                                                                           |
| 10  | `stored()`                         | T3   | —                                                                                     | persistence consequence (FROZEN)                   | TP          | realization UNPROVEN                                                                                                                                                                                           |
| 11  | `persistence()` enhancer           | T3   | —                                                                                     | persistence consequence (FROZEN)                   | —           | enhancer                                                                                                                                                                                                       |
| 12  | storage adapters                   | T3   | —                                                                                     | —                                                  | TP          | `core/storage`; emits **no** external imports                                                                                                                                                                  |
| 13  | `serialization`                    | T2   | —                                                                                     | —                                                  | —           | enhancer                                                                                                                                                                                                       |
| 14  | `compared()`                       | T2   | —                                                                                     | —                                                  | —           | marker; own NULL: _what does SignalTree itself need to know about equality?_                                                                                                                                   |
| 15  | `status()`                         | T2   | none survives (S1)                                                                    | application/domain (S1)                            | —           | marker; **S1: FUNCTION DELETE** — application-written setters, no lifecycle observed                                                                                                                           |
| 16  | `loader()`                         | T2   | — (bundle NULL not run)                                                               | **not entity semantics (T2)**                      | —           | marker; own NULL: _what acquisition capability is lost?_ — T2: the cache is ENTITY-BLIND (only `all()`/`setAll()`); run-id guard + dedup PRESENT; invalidation is reacquisition intent; two mid-flight defects |
| 17  | `asyncSource()`                    | T2   | —                                                                                     | —                                                  | —           | marker                                                                                                                                                                                                         |
| 18  | `asyncQuery()`                     | T2   | —                                                                                     | —                                                  | —           | marker; NULL must include the input→result relationship                                                                                                                                                        |
| 19  | `batching()`                       | T1   | —                                                                                     | —                                                  | —           | enhancer                                                                                                                                                                                                       |
| 20  | `transactions()`                   | T1   | —                                                                                     | —                                                  | —           | enhancer; tree-local gate FROZEN                                                                                                                                                                               |
| 21  | `timeTravel()` / history           | T1   | —                                                                                     | —                                                  | —           | enhancer; separate from causal runtime (MEASURED, not a disposition)                                                                                                                                           |
| 22  | `trackHistory`                     | T1   | —                                                                                     | —                                                  | —           | survives in `lib/form-history/` after FORM-DEL; **retained mechanically, not an audited survivor**                                                                                                             |
| 23  | undo / redo / rollback             | T1   | —                                                                                     | —                                                  | —           | cross-tree contamination defect found during F7, OPEN                                                                                                                                                          |
| 24  | merge / branch                     | T1   | —                                                                                     | —                                                  | —           | deferred product question; preconditions MEASURED and DO NOT HOLD                                                                                                                                              |
| 25  | `devTools()`                       | T1   | —                                                                                     | —                                                  | —           | MUT-0 hypothesis: diagnostic projection                                                                                                                                                                        |
| 26  | enhancer protocol                  | T1   | —                                                                                     | —                                                  | TP?         | `.with()` canonical; `composeEnhancers` DELETED; `SignalTreeBase` DELETED; `bind()` needs consumer proof; `requires` has no coherent semantic owner                                                            |
| 27  | marker processor protocol          | T1   | —                                                                                     | —                                                  | TP?         | `registerMarkerProcessor`, marker symbols, reader allowlists                                                                                                                                                   |
| 28  | write context                      | T1   | —                                                                                     | —                                                  | —           | `getActiveWriteContext` / `withWriteContext`; `causalMode` field decisive at the capture gate (FROZEN)                                                                                                         |
| 29  | `PathNotifier`                     | T1   | —                                                                                     | —                                                  | —           | **candidate substrate only.** Ordinary leaf writes produce ZERO events through it                                                                                                                              |
| 30  | `interceptLeafSignals`             | T1   | —                                                                                     | —                                                  | —           | does not wrap a leaf's `.set` at all                                                                                                                                                                           |
| 31  | error authority                    | —    | —                                                                                     | —                                                  | TP          | `onTreeError`, `SignalTreeRollbackError`; branded factories were RFC 0004 plan-of-record                                                                                                                       |
| 32  | hydration                          | T1   | —                                                                                     | —                                                  | —           | `onHydrateDecision`, `HydrateMode`; ingress, distinct from persist                                                                                                                                             |
| 33  | SSR state transfer                 | —    | —                                                                                     | —                                                  | —           | RFC 0014; distinct ingress                                                                                                                                                                                     |
| 34  | lazy / incremental materialization | —    | —                                                                                     | —                                                  | —           | `core/lazy`, threshold-driven; unassigned to any layer                                                                                                                                                         |
| 35  | `security`                         | —    | —                                                                                     | —                                                  | TP          | `core/security`; emits **no** external imports                                                                                                                                                                 |
| 36  | audit tracker                      | —    | —                                                                                     | —                                                  | —           | `createAuditTracker` / `createAuditCallback`                                                                                                                                                                   |
| 37  | `edit-session`                     | —    | —                                                                                     | —                                                  | TP          | `core/edit-session`                                                                                                                                                                                            |
| 38  | `invalidateTag` / tags             | —    | CANDIDATE: address policy holders reachable from a tree by tag (**A3, NULL NOT RUN**) | —                                                  | —           | tag authority; T2: tags index COLLECTIONS not entities; registry-free `tree.$` walk is the one candidate remainder                                                                                             |
| 39  | `isDev` / dev-only gating          | —    | —                                                                                     | —                                                  | —           | **blocking GATE B**; "guardrails dead in prod" NEEDS RECONCILIATION                                                                                                                                            |
| 40  | `defineStore`                      | —    | Angular DI integration                                                                | Angular (realization)                              | TP          | injectable wrapper; `expose: 'readonly'`                                                                                                                                                                       |
| 41  | `plannedSignalTree`                | —    | —                                                                                     | —                                                  | —           | MUT-0 order item 9                                                                                                                                                                                             |
| 42  | `toWritableSignal`                 | —    | —                                                                                     | —                                                  | TP          | one of only 3 symbols exposing Angular in a public TYPE                                                                                                                                                        |
| 43  | `_` command facade                 | —    | **CANDIDATE** (see sharpened NULL above)                                              | —                                                  | —           | **DOES NOT EXIST.** No `_`, no Command, no Operation, no `OperationId` anywhere in any package                                                                                                                 |
| 44  | `@signaltree/events`               | T4   | —                                                                                     | —                                                  | —           | root emits `zod` only — the neutrality shape the others should reach                                                                                                                                           |
| 45  | `@signaltree/guardrails`           | T4   | —                                                                                     | —                                                  | —           | no Angular anywhere                                                                                                                                                                                            |
| 46  | `@signaltree/ng-forms`             | T4   | —                                                                                     | —                                                  | —           | Angular adapter?; `/audit` is a pure re-export                                                                                                                                                                 |
| 47  | `@signaltree/realtime`             | T4   | —                                                                                     | —                                                  | —           | reset to R0 OWNERSHIP; emits `@angular/core`                                                                                                                                                                   |
| 48  | `@signaltree/shared`               | T4   | —                                                                                     | —                                                  | —           | version drift flagged                                                                                                                                                                                          |
| 49  | `@signaltree/authoring`            | —    | make the descriptor/realization split physical                                        | —                                                  | TP          | **DOES NOT EXIST.** Phase 2, IN PROGRESS                                                                                                                                                                       |

---

## Table B — Constraints, falsifiers, disposition

| #     | Concept                                                             | Governing constraints it must satisfy                                                                                                                                            | Constraint status                                  | NULL / falsifier                                           | Disposition                                                                  | Evidence status                                  |
| ----- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| 1     | `signalTree()` construction                                         | old grammar must fail at compile/import time                                                                                                                                     | FROZEN (cutoff test 4)                             | —                                                          | KEEP                                                                         | MEASURED                                         |
| 2     | store / canonical truth                                             | SignalTree owns truth; PREPARE precedes PRIVATE COMMIT                                                                                                                           | FROZEN                                             | —                                                          | KEEP                                                                         | FROZEN                                           |
| 3     | `$` state facade                                                    | one operation one protocol; no root surface                                                                                                                                      | FROZEN (cutoff tests 1-2)                          | —                                                          | KEEP                                                                         | FROZEN                                           |
| 4     | derived projection                                                  | read-only · direct projection of store truth · no derived→derived · no causal identity · no persistence identity · nested namespaces · composes into `$` · no terminal collision | FROZEN (RFC 0015)                                  | ran; recorded                                              | contract FROZEN, `.derived()` cut NOT AUTHORIZED                             | FROZEN + DERIVED                                 |
| 5     | `derivedFrom()`                                                     | —                                                                                                                                                                                | —                                                  | ran                                                        | function PROVED, form unsettled                                              | DERIVED                                          |
| 6     | `linked()`                                                          | must not re-enter `derived:` without a new falsifier                                                                                                                             | DERIVED (refutation)                               | **NOT RUN**                                                | UNPROVEN ×3 (function, owner, placement)                                     | DERIVED (refutation only)                        |
| 7     | `asReadonly()`                                                      | type-only narrowing; not a bypass guard                                                                                                                                          | MEASURED                                           | —                                                          | —                                                                            | MEASURED                                         |
| 8     | `entityMap`                                                         | SubjectId is structural lifetime                                                                                                                                                 | FROZEN                                             | **NOT RUN**                                                | strong survival candidate                                                    | CANDIDATE                                        |
| 10    | `stored()`                                                          | all 8 persistence invariants; execution-time truth resolution; tree-scoped gate                                                                                                  | FROZEN                                             | realization NULL **NOT RUN**                               | owner FROZEN, realization UNPROVEN                                           | FROZEN owner                                     |
| 13    | `serialization`                                                     | —                                                                                                                                                                                | —                                                  | **NOT RUN**                                                | —                                                                            | NULL NOT RUN                                     |
| 14    | `compared()`                                                        | —                                                                                                                                                                                | —                                                  | **NOT RUN**                                                | —                                                                            | NULL NOT RUN                                     |
| 15    | `status()`                                                          | —                                                                                                                                                                                | —                                                  | RUN (S1)                                                   | **FUNCTION DELETE**; workflow state survives as ordinary store truth         | DERIVED                                          |
| 16    | `loader()`                                                          | entity coupling: none measured                                                                                                                                                   | —                                                  | RUN for cache/freshness ownership (T2); bundle **NOT RUN** | T2 OUTCOME A: cache/freshness/invalidation/tags are application cache policy | DERIVED (partial — `loader()` itself undisposed) |
| 17    | `asyncSource()`                                                     | —                                                                                                                                                                                | —                                                  | **NOT RUN**                                                | —                                                                            | NULL NOT RUN                                     |
| 18    | `asyncQuery()`                                                      | —                                                                                                                                                                                | —                                                  | **NOT RUN**                                                | —                                                                            | NULL NOT RUN                                     |
| 19    | `batching()`                                                        | observational atomicity                                                                                                                                                          | FROZEN                                             | blocked on MUT                                             | —                                                                            | T1                                               |
| 20    | `transactions()`                                                    | tree-local gate; foreign scopes never interfere; refusal FLUSHES; scope settlement must survive a throwing compensation                                                          | FROZEN                                             | MUT-3 two-tree falsifier                                   | —                                                                            | partially FROZEN                                 |
| 21-24 | `timeTravel()` / `trackHistory` / undo-redo-rollback / merge-branch | causal history owns meaning                                                                                                                                                      | FROZEN (invariant only)                            | MUT-3                                                      | —                                                                            | T1, merge preconditions FAIL                     |
| 26    | enhancer protocol                                                   | `.with()` only; no escape hatch; enhancer identity and capability dependencies have separate authorities                                                                         | FROZEN (cutoff tests 1-2)                          | MUT-0 item 2                                               | —                                                                            | **blocking GATE B**                              |
| 28    | write context                                                       | classification is caller-supplied and unverified, reachable from a published subpath, and takes effect                                                                           | FROZEN (behaviour only)                            | ownership NULL **NOT RUN**                                 | —                                                                            | FROZEN (behaviour), owner UNPROVEN               |
| 29    | `PathNotifier`                                                      | —                                                                                                                                                                                | —                                                  | join test already refutes promotion                        | **NOT the observation boundary**                                             | DERIVED (R1)                                     |
| 30    | `interceptLeafSignals`                                              | —                                                                                                                                                                                | —                                                  | —                                                          | —                                                                            | MEASURED                                         |
| 43    | `_` command facade                                                  | must not manufacture PositionIds for facade organization                                                                                                                         | **CANDIDATE** — proposed by the draft, not derived | **sharpened NULL above — NOT RUN**                         | —                                                                            | CANDIDATE                                        |

Rows omitted from Table B are those where no governing constraint and no stated
falsifier yet exist; their Table A row already reads `NULL NOT RUN`.

**The lowering boundary is deliberately NOT a constraint in row 1.** The
compiler/lowering framing is a strong CANDIDATE interpretation of measured
structure — the descriptor → materializer → realization pipeline is real and was
measured for the authoring split — but it is not a GATE A invariant and nothing
has frozen it. It was removed from row 1 for exactly the reason this RFC exists:
in six months someone will read the table and not the preamble, and a framing
sitting in a column headed "constraints" reads as settled. If the framing is ever
earned, it earns its way in through filled rows, not by being the heading they
were written under.

---

## Table C — Lowering hypothesis grid

**Every cell in the four category columns is blank by design.** `VISIBLE IN $`
is a measured fact about HEAD and carries no lowering commitment; it is included
so the grid is anchored to something real.

A concept earns a category mark only from its own NULL. A row that ends up
marked in two or more categories is a **cobbled concept** — that is the signal
this table exists to produce.

| #   | Concept                            | Visible in `$` today (MEASURED) | Position? | Hidden behavior?           | Policy? | Public command? | Lowering hypothesis |
| --- | ---------------------------------- | ------------------------------- | --------- | -------------------------- | ------- | --------------- | ------------------- |
| 2   | store / canonical truth            | yes                             | —         | —                          | —       | —               | —                   |
| 4   | derived projection                 | yes (frozen: composes into `$`) | —         | —                          | —       | —               | —                   |
| 6   | `linked()`                         | yes, via `.derived()`           | —         | —                          | —       | —               | —                   |
| 8   | `entityMap`                        | yes                             | —         | —                          | —       | —               | —                   |
| 10  | `stored()`                         | yes (marker surface)            | —         | consequence (FROZEN owner) | —       | —               | —                   |
| 13  | `serialization`                    | no                              | —         | —                          | —       | —               | —                   |
| 14  | `compared()`                       | no                              | —         | —                          | —       | —               | —                   |
| 15  | `status()`                         | yes                             | —         | —                          | —       | —               | —                   |
| 16  | `loader()`                         | yes                             | —         | —                          | —       | —               | —                   |
| 17  | `asyncSource()`                    | yes                             | —         | —                          | —       | —               | —                   |
| 18  | `asyncQuery()`                     | yes                             | —         | —                          | —       | —               | —                   |
| 20  | `transactions()`                   | no                              | —         | —                          | —       | —               | —                   |
| 21  | `timeTravel()` / history           | no                              | —         | —                          | —       | —               | —                   |
| 25  | `devTools()`                       | no                              | —         | —                          | —       | —               | —                   |
| 26  | enhancer protocol                  | n/a                             | —         | —                          | —       | —               | —                   |
| 32  | hydration                          | no                              | —         | ingress                    | —       | —               | —                   |
| 34  | lazy / incremental materialization | n/a                             | —         | —                          | —       | —               | —                   |
| 43  | `_` command facade                 | n/a                             | —         | —                          | —       | —               | —                   |

The only two pre-filled behavior cells are the ones already frozen
independently: `stored()` has a persistence-consequence owner, and hydration is
an ingress distinct from persistence.

**What that proves, and what it does not.** It proves that persistence and
hydration require DIFFERENT AUTHORITY. It does **not** prove that the surviving
`stored()` function owns both. Those are two separate facts, and only the first
is established.

The joining claim — _"hydration is semantically part of the `stored()` authoring
concept"_ — has never been derived. Current form couples them:
`loadFromStorage()` in `markers/stored.ts` is shared by init and `reload()` and
carries versioning and migration, so today one descriptor does span an outbound
consequence and an inbound acquisition. But that is CURRENT FORM, and this RFC's
whole method is that current form may prove a function is useful and may never
prove its abstraction is necessary. Reading a cobbled concept out of the
implementation would be the exact inference Table A's blank `FUNCTION` column
exists to block.

So whether `stored()` is a cobbled concept is not a finding of this grid. It is a
direct question for `stored()`'s own derivation, and the coupling gives that
derivation a sharper falsifier than it had:

> **Assume `stored()` provides the persistence consequence only. What
> independently required function, if any, requires hydration to remain part of
> that same authoring concept?**

If the answer is none, the current `stored()` is a cobbling of outbound
persistence and inbound acquisition — and that will be a real result when it is
earned, not before.

---

## Table D — Kernel participation axes

Blank means the NULL has not been run. `n/a` means the concept is not a state
concept at all.

| #     | Concept                          | Identity needed?                                         | Tree scope?                                               | Subject scope?                                | Causal participation?                 | Lifecycle needed? |
| ----- | -------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- | ------------------------------------- | ----------------- |
| 2     | store / canonical truth          | PositionId + SlotIndex (FROZEN)                          | yes (FROZEN)                                              | —                                             | yes (FROZEN)                          | no                |
| 4     | derived projection               | **UNPROVEN** (see ledger)                                | —                                                         | —                                             | **no** (FROZEN)                       | no                |
| 6     | `linked()`                       | —                                                        | —                                                         | —                                             | **UNPROVEN — the whole question**     | —                 |
| 8     | `entityMap`                      | SubjectId (FROZEN)                                       | —                                                         | yes (FROZEN)                                  | —                                     | —                 |
| 10    | `stored()`                       | —                                                        | yes — tree-scoped durability (FROZEN)                     | —                                             | no — post-commit consequence (FROZEN) | —                 |
| 15    | `status()`                       | —                                                        | —                                                         | —                                             | —                                     | —                 |
| 16    | `loader()`                       | —                                                        | —                                                         | —                                             | —                                     | —                 |
| 17-18 | `asyncSource()` / `asyncQuery()` | —                                                        | —                                                         | —                                             | —                                     | —                 |
| 20    | `transactions()`                 | —                                                        | yes — tree-local, foreign scopes never interfere (FROZEN) | —                                             | —                                     | —                 |
| 21    | `timeTravel()` / history         | PositionId (MEASURED)                                    | MUT-3                                                     | —                                             | —                                     | —                 |
| 32    | hydration                        | —                                                        | —                                                         | —                                             | —                                     | —                 |
| 43    | `_` command facade               | must NOT manufacture PositionIds for facade organization | —                                                         | subject association is the candidate function | —                                     | —                 |

Column `LIFECYCLE NEEDED?` is deliberately empty everywhere except where frozen.
The candidate draft asserted _"lifecycle belongs to execution, not resources"_ —
plausible, and entirely unearned. Filling this column from the current
`status()` implementation would be MUT-4's forbidden move: letting what existing
code wants define the contract.

---

## How a cell gets filled

1. State the NULL for the concept, with its current API name **hidden** (MUT-0).
2. Derive FUNCTION, then OWNER, then PUBLIC NEED at the correct one of the three
   levels, then MINIMUM PRIMITIVE.
3. Only then reveal CURRENT FORM and compare.
4. Only then propose a `LOWERING HYPOTHESIS`, and only if the derived function
   actually requires a kernel representative. A concept may lower to nothing.
5. Record the DISPOSITION from the six-term vocabulary — KEEP / REDESIGN / MOVE /
   INTERNALIZE / DELETE / UNPROVEN — never `DELETE` where the function survives
   and only the abstraction is wrong.

The basis question is answered by the filled grid, not before it: if
Position / Operation / Policy / Command recur across many independently-earned
rows, they are the minimal basis. If earned rows keep needing a fifth category,
or keep leaving three of four blank, the basis is wrong and should be redrawn
from what the rows actually needed.

### The rule that makes the grid worth building

> **A repeated shape in CURRENT FORM is not evidence for a primitive. A
> primitive is earned only when the same lowering requirement recurs across
> independently derived surviving FUNCTIONS.**

This is the whole point of the grid in one sentence, and it is the protection
against the largest remaining failure mode. Five markers sharing a
descriptor/materializer shape today proves that one implementation strategy was
applied five times. It does not prove those five concepts need the same kernel
representative — it may equally mean the shape was convenient, or copied, or
that four of the five should not exist. Recurrence in Table A's `CURRENT FORM`
column therefore carries no weight at all; recurrence in the `LOWERING
HYPOTHESIS` column carries all of it, and only because every cell there was
filled by a NULL that ran with the current API name hidden.

## Sequencing this does not change

MUT-3 (scope) and MUT-4 (consumers) are not run. Until MUT-3 establishes the
tree-scope boundary, no behavior abstraction can be trusted to absorb
persistence, history or causal behavior, because it cannot yet express:

```text
an operation performed solely against tree A
must not alter a semantic result obtained solely from tree B
```

And GATE B is blocked by the declaration artifact, not by architecture. Nothing
in the API cleanup queue starts before the packed gate is green.

**Do not build the Operation / Execution / Lifecycle / Command algebra next.**

## Findings surfaced while building this matrix

Four, all incidental to the RFC and all real:

1. **`ENTITY_LOADER_READERS` is an orphan.** It is exported from
   `@signaltree/core/authoring` and referenced only by `lib/readonly.ts`. No
   `entityLoader` factory is exported from any entrypoint. A public reader
   allowlist for a factory that does not exist is a GATE B API-cleanup item.
2. **`tools/api-baseline.json` is stale.** It still carries `form`,
   `FORM_MARKER`, `FORM_READERS`, `FORM_WIZARD_READERS`, `createFormSignal`,
   `isFormMarker` and the entire `schema` package, all of which were deleted by
   FORM-DEL and SCHEMA-DEL. Any `--check` run against it compares HEAD to an
   architecture that no longer exists. Re-baseline before it is used to defend
   the export freeze.
3. **An invalidation issued mid-flight is destroyed by the completing load.**
   `settleSuccess` does `invalidated.set(false)` (`entity-loader.ts:482`), so a
   change event arriving while a pre-change request is open is silently
   swallowed: the pre-change value lands and reads FRESH for the whole
   `staleTime` window. This hits the exact seam `invalidateTag` is documented for
   (an SSE/SignalR "plants changed" event). Measured as T2/F5. Ships today.
4. **`refresh()` does not ignore in-flight dedup.** It is documented as "force a
   reload, ignoring `staleTime`/scope-match", but an equal-params request already
   in flight is returned as-is (`:592`), so a refresh triggered by a change event
   resolves with pre-change data. Measured as T2/F6. Ships today.
