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

That is the Rule 0k error in a new mask. Rule 0k caught *"Angular has a
primitive, therefore delete the feature."* This is *"a smaller abstraction
exists, therefore demote the feature."* Same invalid inference, same direction of
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

| Draft claim | Status | Governing result |
|---|---|---|
| `linked()` sits under `derived:` | **CONTRADICTS** | RFC 0015: `linked()` as derived is REFUTED; function, owner and placement are all three UNPROVEN. Current `.derived()` placement is the conflation, not a precedent. |
| persistence is an Operation with `trigger: AFTER_COMMIT` and a definition-time `source` | **CONTRADICTS, twice** | Frozen persistence invariants: the durability gate is TREE-SCOPED and SCOPE-BASED — *"commit-ness is NEVER inferred from where the JavaScript call happened"*; and invariant 7 — durable consequences *"resolve surviving truth at EXECUTION time, never a value captured when the write was authored."* |
| Operation authority is a six-value enum (OBSERVE / REALIZE / CONSEQUENCE / INGRESS / AUTHOR / RECONCILE) | **OVERBUILT** | MUT-2C froze that a two-valued authored/realized classification is decisive in the measured capture path, is caller-supplied and unverified, and that **its owner is NOT PROVED**. Six values rest on an unowned two. |
| `resource` / `loader` / `status` / `compared` / `serialization` lower to sugar or policy | **PREMATURE** | Rule 0k Tier 2: each gets its own NULL and its own verdict. None has been run. |

### Two corrections in the other direction

The review that produced this RFC also overstated twice. Both corrections stand.

**1. Derived `PositionId` is UNPROVEN, not contradicted.** RFC 0015's
`Identity — DELETE` answered a narrower question: whether *cross-derived
composition* requires an identity relationship. It established that downstream
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
So `asReadonly` narrows *mutation capability on `$`*, while `_` would expose
*intentional command invocation*, which is not a state write at all. `_` may
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

**Consequence for ordering:** the default becomes *extensions are
order-independent unless a surviving function proves otherwise*. Capability union
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
`type Final = A & B & C` as an *unchecked* lowering. And the declarative model is
strictly better positioned here than the chain: a compiler that sees the complete
set before construction can detect the collision, which sequential `.with()`
structurally cannot.

### Ledger rows

| Concept | Direction |
|---|---|
| extension/plugin function | likely SURVIVES |
| construction capability declaration (`capabilities`) | **SURVIVES — measured, exercised in production** |
| generic "enhancer" runtime abstraction | UNPROVEN |
| chained `.with()` as primary extension API | strong REDESIGN/DELETE candidate — its type-accumulation defense is REFUTED |
| `plannedSignalTree()` function | SURVIVES |
| `plannedSignalTree()` as a separate public constructor | strong REDESIGN candidate |
| extension descriptors in the initial declaration | strong candidate |
| `requires`/`provides` ordering graph | highly suspect; audit independently |
| "enhancer" as the future NOUN (`(tree) => tree`) | suspect — inherently post-construction |
| naive intersection of contributions | **REFUTED as a lowering** — silent last-wins shadowing |
| inert extension declaration | **type-proved feasible** |

## Amendment 2 — the matrix becomes FUNCTION-FIRST

**Status unchanged: CANDIDATE. Nothing here is frozen.**

Tables A-D are organised by CONCEPT, and concept means *legacy symbol*. That was
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

| Function | Status | Coverage, and by what evidence | Legacy sources (evidence only) |
|---|---|---|---|
| select optional tree behaviour at authoring time | survives | PROVED-IN-MODEL (declarative init candidate) | `.with()` call sites, built-ins |
| know required substrate capabilities before construction | **SURVIVES — measured** | PROVED-IN-MODEL | `plannedSignalTree`, `EnhancerMeta.capabilities` |
| contribute public/type surface | **SURVIVES** | PROVED-IN-MODEL (SHAPE-T0, inert declarations) | `Enhancer<TAdded>`, `this & TAdded` |
| bind runtime behaviour to the constructed tree/kernel | **SURVIVES** | PROVED-IN-MODEL (T1 CASE 1) | enhancer bodies |
| alter final callable behaviour | **SURVIVES** | PROVED-IN-MODEL (T1 CASE 2) | batching / timeTravel / devTools replacement |
| register teardown / lifetime behaviour | **SURVIVES** | **LANDED** — `registerCleanup` is already tree-owned and unrelated to `.with()` | `registerCleanup` |
| reject conflicting public contributions | **SURVIVES** | PROVED-IN-MODEL, both halves (T0-G static, T1 CASE 3 runtime) | nothing — the old system had no such check |
| **semantic duplicate / exclusivity rule** — *what combinations of declarations are actually invalid, independent of public-key collisions?* | **OPEN** | T1 CASE 6 refused via an explicit id; SUFFICIENT, never proved minimal | `name`, `.with()` duplicate guard |
| **realization dependency satisfaction** — *does one realization genuinely require something established by another, and if so what fact must the compiler know?* | **OPEN** | T1 CASE 5 showed an internal order SUFFICES; the dependency itself may be an artifact of the prototype's publish/consume | `requires`, `provides`, `resolveEnhancerOrder` |
| **substrate requirement determination** — *how does the compiler know which substrate capabilities are required before construction?* | **OPEN** | `TREE_CAPABILITY_DEPENDENCIES` already models capability-to-capability implication internally | `capabilities` |
| invoke contributed capabilities after exposure | **SURVIVES** | **LANDED** — an ordinary runtime API, never composition | `realtime.connect()`, every enhancer method |
| **compose new capabilities after exposure** | **DELETE — no surviving use found** | n/a | `.with()` |
| replace public tree identity | **NOT A FUNCTION** | n/a — mechanism debt of post-construction application | the three replacing built-ins |
| sequentially accumulate types | **NOT A FUNCTION** | n/a — declarative typing handles it | `this & TAdded` |
| preserve an enhancer chain | **NOT A FUNCTION** | n/a — mechanism self-maintenance | the redefined `.with()` on replacements |

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
representation" — each of which smuggles its answer into its name: *identity*
presumes an id, *ordering* presumes an order, *representation* presumes the fact
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
*opportunity* to be config-dependent, and it isn't — which is evidence for A
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

Two consumers of something with an independently established owner. *Causal
history owns meaning* was already frozen; this is that invariant showing up as a
dependency graph with no feature-to-feature edges in it.

**`serialization` is the sharpest case.** Persistence observing committed truth
could very easily have been modeled as *"persistence requires transactions"*,
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
in one collection. Which combinations are semantically invalid, and *why*?

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

| Function | Cardinality | Semantic basis | Generic id needed? |
|---|---|---|---|
| transaction authority | idempotent / canonicalizing | already a per-tree singleton; no config to conflict | no |
| temporal history policy | 0..1 (candidate) | two configured histories over ONE causal lineage would compete | no — the OWNER is singular |
| persistence-declared position | 0..N | **MEASURED plural** | no — distinguished by its position |
| call interception | 0..N, compositional | three built-ins intercept today and coexist | no |
| cleanup registration | 0..N, additive | `registerCleanup` is a list | no |
| substrate requirement | set, idempotent | union; repetition is meaningless | no |

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
is not *"reject a second `timeTravel` declaration"*. It is *"one history policy
per causal lineage"* — a property of the owner. An authority that is singular
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
does. *"We need a useful diagnostic label"* must never become *"therefore
declaration identity exists"*.

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

The wording matters: several rows say *"no survival earned from the extension
function audit"* rather than `DELETE`. Their extension-system justification is
dead, but an unrelated function could theoretically save part of one later — a
diagnostic label being the obvious candidate. Writing an unconditional deletion
would make a future diagnostics audit look like it was reopening a freeze.

| Legacy mechanism | Basis | Disposition |
|---|---|---|
| `.with()` | its function — post-exposure composition — is DELETE | **DELETE**, no compatibility adapter (Rule 0l) |
| `Enhancer<TAdded>` | bundled authoring + type contribution + realization; each now has a separate owner | **DELETE / REDESIGN** as a callable abstraction; no adapter |
| `plannedSignalTree()` | its function — complete planning before construction — survives under the compiler | **DELETE / REDESIGN** as a separate constructor |
| `capabilities` (public field) | requirements measured intrinsic; no author protocol earned | public field **DELETE candidate**; the internal compiler knowledge survives |
| `requires` | the realization-dependency function is DELETE | **DELETE** |
| `provides` | no dependency protocol remains for it to serve | **no survival earned from the extension function audit** |
| `name` | generic duplicate identity not earned | **no identity survival earned**; diagnostics naming unexamined |
| `bind()` | connecting a callable to an already-built host disappeared with the construction model | **no survival earned here**; internal realization may need something, derived separately |
| `ENHANCER_META` | a bundle whose members now have different owners | **decompose mechanically**; do not preserve the bundle because one member survives |

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

That directly contradicts the SignalTree-15 draft's assertion that *"lifecycle
belongs to execution, not resources"*. Whether or not that assertion is a good
idea, it describes something the current system has never had: there is no
execution to own a lifecycle here, only an enum-shaped state position with
convenience setters. So `status` is evidence for *"applications want to record
where they are in a workflow"* — a claim about ordinary state — and evidence for
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
evidence only. The old draft's claim that *"lifecycle belongs to execution"* is
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

> *"AI coding agents trained on Promise-state vocabularies (success/start/fail)
> frequently reach for these method names ... rather than fight the linguistic
> gravity, we accept them."*

That is a naming accommodation. It cannot earn a primitive.

### The implementation's own comment refutes the operation reading

From the hydrate path:

> *"`Loaded` is a statement about DATA, not about an operation — if the data was
> persisted alongside it, 'the data is loaded' is true on arrival."*

The code already knows this describes data, not execution.

### Function-by-function coverage

| # | Function | Covered by | SignalTree-owned? |
|---|---|---|---|
| A | record a workflow state | an ordinary store position holding an enum | no |
| B | read it | an ordinary accessor | no |
| C | transition it | an ordinary write | no |
| D | reset it | a write of the initial value | no |
| E | convenience predicates (`loading`, `loaded`, `idle`, `hasError`, `settled`) | ordinary derived projections — exactly the frozen store-only contract | no |
| F | persist / hydrate | whatever rules ordinary store positions independently receive | no |
| G | causal participation | ordinary authored-state rules | no |
| H | transition legality | **nothing — measured absent** | n/a |
| I | lifecycle observation | **nothing — measured absent** | n/a |

### The one candidate invariant, and it is INCONSISTENT

Every non-error setter clears `errorSignal`. That coupling — "moving to a
non-error state discards the previous error" — is the only rule in the whole
surface that is not plain assignment.

**It contradicts the module's own stated intent.** The hydrate comment says:

> *"`Error` survives so a retry guard can report that the last attempt failed"*

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
legitimately own *"retain the last failure while the next attempt is pending"*.
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

So, against the falsifier *"what exact `entityMap` semantic fact would an external
cache have to duplicate?"*:

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
  check:     (value) => boolean;                    // declaration recognition
  create:    (marker, notifier, path, ctx, parentPositionId) => unknown;
  snapshot?: (node) => unknown;                     // OPTIONAL
  hydrate?:  (node, value, mode: HydrateMode) => void;
}
```

`snapshot` and `hydrate` are OPTIONAL, and the docblock records that omitting
`snapshot` means *"my node is already a plain signal, the normal walk handles
me"* — true of `stored()` **and nothing else today**.

### THE CODEBASE ALREADY WARNS ABOUT THIS EXACT AUDIT

Verbatim from the stamp docblock:

> *"⚠️ There is NO `owns()` hook. Earlier revisions of this comment referred to
> one as though it existed, and a research doc then repeated it as fact — the
> exact stale-comment-becomes-canon failure this codebase keeps hitting."*

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

| Entry point | Hook | Behaviours to measure before assigning ownership |
|---|---|---|
| M1 | `check` | declaration recognition · discrimination from ordinary values · kind dispatch |
| M2 | `create` | runtime realization · backing-state creation · public-surface creation · owner/PositionId association · notifier integration · construction-context consumption |
| M3 | `snapshot` | tree-snapshot projection · marker-specific omission/transformation · the representation its several consumers require |
| M4 | `hydrate` | payload application · acceptance/refusal · normalization · restore-vs-rehydrate · **authority decision** · live-state mutation · diagnostic reason production |
| M5 | `onHydrateDecision` | observability of refusal/normalization · audience · machine-readable consumer need |

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

**M3 / serialization.** *"The serialization hook is not separate — it IS
`snapshot`"* is mechanically true of the current protocol and is NOT a semantic
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

The demo advertises *"markers AND enhancers"* in one breath — and the enhancer
half of that same sentence was already found to have no surviving function. Being
taught and advertised identifies a capability worth examining; it cannot settle
the architecture.

**The matrix row is therefore the CAPABILITY, not the API:**

> *A package outside core can introduce a new inline declaration form that
> participates in SignalTree construction and contributes its realized state and
> API, without requiring a core release.*

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

The remaining question is no longer *"does a generic registry survive?"* but:

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

| # | Function | Reproduced without any protocol? |
|---|---|---|
| E1 | inline authoring — a library construct appears beside ordinary tree state | **YES** — `signalTree({ counter: makeCounter(10, 5), plain: 1 })` |
| E2 | type transformation — declaration type becomes a different realized type | **MOOT** — the author builds the REALIZED thing directly, so there is nothing to transform |
| E3 | writable state exposed through the tree | **YES** — reads and writes work |
| E3b | **canonical SignalTree truth** | **UNPROVEN** — accessibility is weaker than canonicality |
| E4 | derived / public surface contribution | **YES** — a `computed` member and four methods survive construction |
| E5 | compiler integration — topology, ownership, notification services unavailable to user code | **NOT EXERCISED** by either example |
| E6 | representation participation — special snapshot/reconstruction | **NOT EXERCISED**; the value appears in `tree()` by the ordinary path |
| E7 | package encapsulation — an external package ships all of it | **YES** — `makeCounter` is an ordinary exported function |

Nesting works too, with no path or position protocol involved.

### TWO CORRECTIONS to this row

**E3 was overstated.** The probe reproduced *writable state exposed through the
tree*, not *canonical SignalTree truth*. Canonicality is the stronger claim: if
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

E0 answers A while assuming B. The architecture direction has been *neutral
kernel -> framework realization*, not *author-supplied Angular signal treated as
a canonical declaration*. So `isSignal` preservation must not become the new
accidental spelling merely because it defeated the old marker example — that
would be a legacy mechanism manufacturing the replacement.

**Result stated at its actual strength:**

> Under the CURRENT "preserve existing Angular signals" behaviour, the two
> demonstrated custom-marker examples require no marker protocol.

NOT yet: *under the greenfield architecture, independently earned primitives
reproduce them.*

### The sharp finding: the protocol compensates for a SHAPE, not a semantic

The tree already preserves any `isSignal` value verbatim
(`signal-tree.ts:1054`: *"Existing signals - preserve"*). My probe builds on a
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
*"are preserved signals second-class?"* would have been too weak to settle
anything.

```text
PATH A   a prebuilt Angular signal preserved by the tree
PATH B   ORDINARY canonical state, library API composed AROUND the accessor
```

| Property | PATH A — preserved signal | PATH B — canonical + composed API |
|---|---|---|
| captured by undo | **NO** — value stays 11 after `tree.undo()` | **YES** — restored to 10 |
| derived composition | yes | **YES** — `computed` over the accessor |
| transaction rollback through the generic kernel | not tested; moot | **YES** |
| ordinary canonical truth in the snapshot | reachable, not canonical | **YES** |

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

**If the function did not survive, there is no form question.** Asking *"what is
the minimum `MarkerProcessor`?"* or *"what is the minimum registration
mechanism?"* would be deriving a shape for something that failed its null.

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

*"A third-party abstraction can be declared inline and appear naturally in the
tree's typed API"* is NOT reproduced. **And that is acceptable** — Rule 0m does
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

M3 first because it can establish an early boundary — *realized canonical truth
-> representation* versus *declaration kind -> special representation*. If the
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
that an unbranded callable marker's value *"vanishes from the snapshot and from
everything built on one"* — a failure caused by realized shape, not by
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

`stored.ts:331` warns that *"`tree()` / `unwrap()` skip stored values"*. **That is
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

> *"It used to be `(() => sig())` with methods bolted on — a plain callable that
> satisfied neither `isSignal` nor `isNodeAccessor`. Every traversal in the
> library branches on exactly those two guards, so a stored leaf fell through all
> of them: omitted from `tree()`/`unwrap()`, skipped by a merge write through its
> parent, and REPLACED with a raw value by `applyState`… **Conforming to the
> protocol that already exists fixes every one of those at once**, with no
> changes outside this file."*

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
representation function survives — but it would be *"a realized value must be
able to declare its state when its shape hides it"*, which is a narrower and
differently-owned thing than *"declaration kinds own their representation"*.

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

Both rows resolved in the DELETION direction: *no public substrate protocol
earned*, *zero feature-to-feature dependency*. **15-effort provenance makes a
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

> *"Added in 14.0.0 after a capability audit found **elf and Akita both ship
> it** and every team otherwise hand-rolls `activeId: null` plus a derived
> lookup. `activeEntity` resolves through `byId`, so it is O(1) and invalidates
> only when THAT row changes — finer-grained than the filtered-stream versions
> the other libraries offer."*

**Feature parity is not a derived function**, and the docblock names its own
alternative in the same sentence. The only architectural claim is granularity, so
that is what was tested:

```text
built-in activeEntity            watcher does NOT recompute when another row changes
selectedId position + byId()     watcher does NOT recompute — IDENTICAL
```

The granularity comes from `byId`, which is in the minimum and is public. The
comparison in the docblock is against *filtered streams* — a different technique
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

An order that is *data* (drag-to-reorder, server relevance) is exactly the case
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
`selectId(entity)` would be *a silent wrong-slot write*. The public surface was
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
rules require commit messages to say *why*. The audit therefore had to be
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

> *"`ids`, `count`, `empty` and `map` are all derived from `all` — and `map` is a
> JS `Map`, which JSON cannot represent, so it used to serialise as `{}`: a
> snapshot claiming the collection was EMPTY while holding 10,000 entities."*

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

Both payload shapes are accepted, because *"an entityMap SNAPSHOT always emits
`{ all: [...] }`, so a bare array can never be mistaken for the snapshot shape."*
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

`SIGNALTREE-15-CONTEXT.md` recorded, explicitly labelled as *"a reading of E's
result, not a measured disposition"*, that E's closure would fire M3's **second**
branch — that the collection's earned form requires a shape neither guard
accepts, so what survives is *"a realized value must be able to declare its state
when its shape hides it."*

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
A uniform rule cannot express it: *"set the position to the payload"* has no way
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

M4's ownership half survived a uniform-rule null of the shape *"set the position
to the payload"*. But the two implementers' predicates are, in full:

```text
asyncSource   mode === 'rehydrate'
entityMap     mode === 'rehydrate' && typeof node.load === 'function'
```

One rule over one declared property — *"this position owns a live source"* —
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
this — *"a partial hydrate is harder to notice than a failed one"* — except this
one applies nothing at all while still returning normally.

## M5 — DELETES. The reported vocabulary is a single point, and half of it is dead.

Evidence: `m5-decision-observability.spec.ts`, 2 rows.

M5's queued statement predicted this: *"Last, because there may be no decision
worth reporting once M4 decomposes."*

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
still reads *"Which marker decided, e.g. `entityMap`, `status`."*

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

The queued statement allowed it explicitly: *"Nothing requires one verdict across
three entry points."*

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
linkedSignal<number, Boxed>({ source, computation, equal })   // compiles
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
The 13.3.0 durability work is correct *as a fix*, and it is fixing a
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

In each case the machinery is *correct*, and in each case the thing it corrects
was introduced one layer down. **The derivation question is never "is this
machinery right?" but "what made it necessary?"** — because if the answer is
another SignalTree choice, both can leave together.

## WITHDRAWAL — E-REKEY's positive verdict. It rested on an unrecorded reversal of shipped behaviour.

E-REKEY was recorded as *"the first function the incumbent contributed that the
zero-state missed AND that survives its own null."* **That verdict is withdrawn.**
It was invalid twice over, and the second reason is the serious one.

### 1. It proved a difference, not a requirement

The measurement was: a held reference survives `changeId`, and remove+add orphans
it. That shows the two paths **behave differently**. It never showed any workflow
*requires* the held reference to follow rather than re-reading `byId(newId)`.

### 2. The behaviour measured is NOT what ships — and reverses a documented decision

Published **14.1.2** (2026-08-17, the current latest) does the OPPOSITE, on
purpose. From the shipped `dist/lib/entity-signal.js`:

> **[ST2031]** *"reading a node held from `byId(from)` after `changeId(from, to)`
> — it resolves undefined **and always will**. changeId drops the old per-entity
> signal **on purpose**: aliasing it would share one signal with a future
> `addOne({ id: from })`, which is a worse failure than this one. Re-read with
> `byId(to)`, or hold the id and call `byId(id())` at the point of use rather
> than holding the node across a rekey."*

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

E's form summary said *five members are the minimum and one more is earned*. With
`changeId` withdrawn, **only the five minimum members are established**, and E's
positive result is now confined to the FUNCTION (dynamic membership + granular
observation over canonical truth), not to any member beyond the minimum.

## Table G — DX PRESSURE LEDGER

**Deliberately a SEPARATE table, not a column.** An `OPTIMAL DX` column inside
the architectural matrix would be filled with concrete syntax within a week, and
then defended. This records CAPABILITY only. See
[Rule 0m](../../RELEASE-1.0.md).

Its job is to catch one specific failure: converting *"the runtime does not need
this machinery"* into *"the author may not express this"*. Those are different
claims, and lowering is what separates them.

| Function | Semantic result | DX capability worth preserving | Semantics forbid it? | DX status |
|---|---|---|---|---|
| derived projections | canonical -> read-only projection; no runtime derived->derived graph | compose named projections naturally | **NO** — candidate lowering is transitive expansion to canonical inputs (HYPOTHESIS, not proved) | UNPROVEN |
| optional behaviour selection | compile before exposure; no post-exposure composition | declare optional behaviour concisely in one place | **NO** — a declaration form is unconstrained by the absence of a chain | UNPROVEN |
| external acquisition | application/service-owned | bind an acquired result into tree state easily | **NO** — ownership says who executes, not how authoring reads | DEFERRED |
| input -> acquisition | Angular/application reactive layer | express "when this changes, fetch" without ceremony | **NO** | DEFERRED |
| workflow state (`status`) | ordinary store truth + derived predicates | name a workflow state and read its predicates | **NO** — the predicates are ordinary projections | DEFERRED |
| request cache policy | ordinary request cache, no SignalTree ownership | declare staleness/invalidation near the data | **NO** | DEFERRED |
| commands (`_`) | function itself UNPROVEN | colocated, typed, intentional actions | **N/A** — no function to constrain yet | UNPROVEN |
| entity collections | not yet derived | address entities by key with good inference | **UNDETERMINED** | UNPROVEN |

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
The capability is *"let authors compose named projections naturally"*; the
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

| F# | Property under test | Observed | Proves | Does NOT prove |
|---|---|---|---|---|
| F1 | same map key, NEW semantic subject (`removeOne('w1')` then add a different `w1`) | `loaded()` true, `lastLoadedAt()` unchanged, `load()` does not refetch | the substitution is INVISIBLE to the cache — identity/lifetime are not consulted | that it *should* react; no desired behaviour is asserted |
| F2 | `clear()` the whole collection | still `loaded()`, no refetch | entity lifetime does not participate in freshness | that emptiness ought to invalidate |
| F1b | a locally added entity | still fresh, no refetch | freshness is a fact about the LAST FETCH, not about contents | anything about merge policy |
| F3 | one external resource behind two collections in one tree | `calls === 2`; invalidating `left` leaves `right` fresh | freshness is per LOADER INSTANCE, not per resource — the ownership test failing | that sharing would be better |
| F3b | `tags` + `invalidateTag` across two trees | returns 1; treeA stale, treeB fresh | tags address COLLECTIONS and the authority is TREE-SCOPED | that entities carry tags — none do |
| F4 | earlier-started, later-completing load (scope `west` then `east`) | the obsolete completion cannot land; `params()` is `east` | **stale LANDING is protected**, on the Promise path, by the `runId`/`myRun` guard | that same-scope overlap is protected; the test crosses scopes |
| F5 | `invalidate()` during flight | **DEFECT** — `settleSuccess()` does `invalidated.set(false)`, so the invalidation is erased; no refetch for 30 min, pre-change value marked fresh | invalidation does not survive a concurrent completion | anything about acquisition execution as such |
| F6 | `refresh()` during flight | **DEFECT** — `calls` stays 1 | `refresh()` breaks its OWN documented contract, "force a reload, ignoring `staleTime`/scope-match" — it does not bypass in-flight dedup | that dedup itself is wrong |
| F7 | `swr: true` then `invalidate()` | `loaded()` true, `loading()` false | `swr` collapses `loaded()` into HAS-EVER-LOADED — the staleness flag becomes unreadable | that stale-while-revalidate is implemented at all |
| F8 | landing over a locally added entity | `setAll(rows)` discards it; `ids()` is `['w1']` | landing has NO merge policy, so it cannot be said to respect entity identity or lifetime — **it discards both** | that a merge policy is wanted |

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

The null still to run, unchanged: *if SignalTree does not own input->acquisition
orchestration, what SignalTree semantic fact would external Angular/RxJS
composition have to duplicate?* If the answer is nothing, this measurement
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

| # | Behaviour | Result |
|---|---|---|
| A1-C1 | eager initial acquisition | reproduced exactly |
| A1-C2 | `lazy` | reproduced by NOT CALLING. `lazy` names the absence of an eager call; it is not a capability |
| A1-C3 | overlapping refresh, Promise source | **the marker lets the obsolete completion WIN**; `plainAcquire` guards it in four lines |
| A1-C4 | failure recording | reproduced exactly |
| A1-C5 | `reset` | reproduced exactly |
| A1-C6 | landed value vs authored write | indistinguishable — same value, same unwrap participation |

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

| # | Behaviour | Result |
|---|---|---|
| A1-Q1 | input change drives acquisition | reproduced by `toObservable` + `switchMap` |
| A1-Q2 | equal successive inputs suppressed | reproduced by `distinctUntilChanged` |
| A1-Q3 | `filter` skips inputs | reproduced by an ordinary `filter` |
| A1-Q4 | stale exclusion | **`switchMap` does it on BOTH sides** |
| A1-Q5 | `rerun` bypasses dedup | reproduced by merging a `Subject` after the dedup stage |
| A1-Q6 | outside an Angular injection context | **input changes silently stop driving queries** |
| A1-Q7 | `debounce` coalescing rapid input | reproduced by `debounceTime` — three rapid sets, one query |
| A1-Q8 | **teardown owner** | **the binding OUTLIVES `tree.destroy()`** |
| A1-Q9 | **equality domain** | `equal` compares INPUT VALUES; two distinct objects with equal fields are suppressed |

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

| Legacy | What it happened to provide | Disposition |
|---|---|---|
| `asyncSource` | acquisition + pending/error state + refresh/reset/lazy | **DELETE** — every behaviour reproduced by `plainAcquire`, and A1-C3's plain version is strictly MORE correct |
| `asyncQuery` | the same, plus input binding and shaping | **DELETE** — the pipeline is stock Angular/RxJS and requires Angular's context to work at all |
| `status` | workflow state recording | **DELETE** (S1) — two store positions and derived predicates |
| `loader` / entity-loader cache | request-scoped cache policy | **no SignalTree ownership earned** (T2/A2) — parked, not deleted, pending the `entityMap` derivation it is spelled inside |

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

| # | Concept | Tier | Function | Owner | Public need | Current form (MEASURED at HEAD) |
|---|---|---|---|---|---|---|
| 1 | `signalTree()` construction | — | construct a tree from a declaration | — | TP | `signalTree(obj)`; callable tree; `.with()` chain |
| 2 | store / canonical truth | — | hold authoritative state | SignalTree (FROZEN) | TP | nested signals over slot substrate |
| 3 | `$` state facade | — | address state | SignalTree (FROZEN cutoff test 2: no root surface) | TP | `tree.$`, `tree.state` |
| 4 | derived projection | T3 | — | — | TP | `derived:` block contract FROZEN; `.derived()` chain is a DELETE candidate |
| 5 | `derivedFrom()` | T3 | PROVED — TS7006 at a module boundary is real | — | TP | exported helper; form unsettled |
| 6 | `linked()` | T3 | — | — | — | wraps `linkedSignal`; writable; reads own prior value; lives in `.derived()` for facade access only |
| 7 | `asReadonly()` | — | narrow mutation capability on `$` | — | TP | type-level narrowing; not an `as any` guard |
| 8 | `entityMap` | T3 | — | — | TP | SubjectId frozen; Angular supplies no normalized identity |
| 9 | `byKeys` | T3 | — | — | — | entity key selection |
| 10 | `stored()` | T3 | — | persistence consequence (FROZEN) | TP | realization UNPROVEN |
| 11 | `persistence()` enhancer | T3 | — | persistence consequence (FROZEN) | — | enhancer |
| 12 | storage adapters | T3 | — | — | TP | `core/storage`; emits **no** external imports |
| 13 | `serialization` | T2 | — | — | — | enhancer |
| 14 | `compared()` | T2 | — | — | — | marker; own NULL: *what does SignalTree itself need to know about equality?* |
| 15 | `status()` | T2 | none survives (S1) | application/domain (S1) | — | marker; **S1: FUNCTION DELETE** — application-written setters, no lifecycle observed |
| 16 | `loader()` | T2 | — (bundle NULL not run) | **not entity semantics (T2)** | — | marker; own NULL: *what acquisition capability is lost?* — T2: the cache is ENTITY-BLIND (only `all()`/`setAll()`); run-id guard + dedup PRESENT; invalidation is reacquisition intent; two mid-flight defects |
| 17 | `asyncSource()` | T2 | — | — | — | marker |
| 18 | `asyncQuery()` | T2 | — | — | — | marker; NULL must include the input→result relationship |
| 19 | `batching()` | T1 | — | — | — | enhancer |
| 20 | `transactions()` | T1 | — | — | — | enhancer; tree-local gate FROZEN |
| 21 | `timeTravel()` / history | T1 | — | — | — | enhancer; separate from causal runtime (MEASURED, not a disposition) |
| 22 | `trackHistory` | T1 | — | — | — | survives in `lib/form-history/` after FORM-DEL; **retained mechanically, not an audited survivor** |
| 23 | undo / redo / rollback | T1 | — | — | — | cross-tree contamination defect found during F7, OPEN |
| 24 | merge / branch | T1 | — | — | — | deferred product question; preconditions MEASURED and DO NOT HOLD |
| 25 | `devTools()` | T1 | — | — | — | MUT-0 hypothesis: diagnostic projection |
| 26 | enhancer protocol | T1 | — | — | TP? | `.with()` canonical; `composeEnhancers` DELETED; `SignalTreeBase` DELETED; `bind()` needs consumer proof; `requires` has no coherent semantic owner |
| 27 | marker processor protocol | T1 | — | — | TP? | `registerMarkerProcessor`, marker symbols, reader allowlists |
| 28 | write context | T1 | — | — | — | `getActiveWriteContext` / `withWriteContext`; `causalMode` field decisive at the capture gate (FROZEN) |
| 29 | `PathNotifier` | T1 | — | — | — | **candidate substrate only.** Ordinary leaf writes produce ZERO events through it |
| 30 | `interceptLeafSignals` | T1 | — | — | — | does not wrap a leaf's `.set` at all |
| 31 | error authority | — | — | — | TP | `onTreeError`, `SignalTreeRollbackError`; branded factories were RFC 0004 plan-of-record |
| 32 | hydration | T1 | — | — | — | `onHydrateDecision`, `HydrateMode`; ingress, distinct from persist |
| 33 | SSR state transfer | — | — | — | — | RFC 0014; distinct ingress |
| 34 | lazy / incremental materialization | — | — | — | — | `core/lazy`, threshold-driven; unassigned to any layer |
| 35 | `security` | — | — | — | TP | `core/security`; emits **no** external imports |
| 36 | audit tracker | — | — | — | — | `createAuditTracker` / `createAuditCallback` |
| 37 | `edit-session` | — | — | — | TP | `core/edit-session` |
| 38 | `invalidateTag` / tags | — | CANDIDATE: address policy holders reachable from a tree by tag (**A3, NULL NOT RUN**) | — | — | tag authority; T2: tags index COLLECTIONS not entities; registry-free `tree.$` walk is the one candidate remainder |
| 39 | `isDev` / dev-only gating | — | — | — | — | **blocking GATE B**; "guardrails dead in prod" NEEDS RECONCILIATION |
| 40 | `defineStore` | — | Angular DI integration | Angular (realization) | TP | injectable wrapper; `expose: 'readonly'` |
| 41 | `plannedSignalTree` | — | — | — | — | MUT-0 order item 9 |
| 42 | `toWritableSignal` | — | — | — | TP | one of only 3 symbols exposing Angular in a public TYPE |
| 43 | `_` command facade | — | **CANDIDATE** (see sharpened NULL above) | — | — | **DOES NOT EXIST.** No `_`, no Command, no Operation, no `OperationId` anywhere in any package |
| 44 | `@signaltree/events` | T4 | — | — | — | root emits `zod` only — the neutrality shape the others should reach |
| 45 | `@signaltree/guardrails` | T4 | — | — | — | no Angular anywhere |
| 46 | `@signaltree/ng-forms` | T4 | — | — | — | Angular adapter?; `/audit` is a pure re-export |
| 47 | `@signaltree/realtime` | T4 | — | — | — | reset to R0 OWNERSHIP; emits `@angular/core` |
| 48 | `@signaltree/shared` | T4 | — | — | — | version drift flagged |
| 49 | `@signaltree/authoring` | — | make the descriptor/realization split physical | — | TP | **DOES NOT EXIST.** Phase 2, IN PROGRESS |

---

## Table B — Constraints, falsifiers, disposition

| # | Concept | Governing constraints it must satisfy | Constraint status | NULL / falsifier | Disposition | Evidence status |
|---|---|---|---|---|---|---|
| 1 | `signalTree()` construction | old grammar must fail at compile/import time | FROZEN (cutoff test 4) | — | KEEP | MEASURED |
| 2 | store / canonical truth | SignalTree owns truth; PREPARE precedes PRIVATE COMMIT | FROZEN | — | KEEP | FROZEN |
| 3 | `$` state facade | one operation one protocol; no root surface | FROZEN (cutoff tests 1-2) | — | KEEP | FROZEN |
| 4 | derived projection | read-only · direct projection of store truth · no derived→derived · no causal identity · no persistence identity · nested namespaces · composes into `$` · no terminal collision | FROZEN (RFC 0015) | ran; recorded | contract FROZEN, `.derived()` cut NOT AUTHORIZED | FROZEN + DERIVED |
| 5 | `derivedFrom()` | — | — | ran | function PROVED, form unsettled | DERIVED |
| 6 | `linked()` | must not re-enter `derived:` without a new falsifier | DERIVED (refutation) | **NOT RUN** | UNPROVEN ×3 (function, owner, placement) | DERIVED (refutation only) |
| 7 | `asReadonly()` | type-only narrowing; not a bypass guard | MEASURED | — | — | MEASURED |
| 8 | `entityMap` | SubjectId is structural lifetime | FROZEN | **NOT RUN** | strong survival candidate | CANDIDATE |
| 10 | `stored()` | all 8 persistence invariants; execution-time truth resolution; tree-scoped gate | FROZEN | realization NULL **NOT RUN** | owner FROZEN, realization UNPROVEN | FROZEN owner |
| 13 | `serialization` | — | — | **NOT RUN** | — | NULL NOT RUN |
| 14 | `compared()` | — | — | **NOT RUN** | — | NULL NOT RUN |
| 15 | `status()` | — | — | RUN (S1) | **FUNCTION DELETE**; workflow state survives as ordinary store truth | DERIVED |
| 16 | `loader()` | entity coupling: none measured | — | RUN for cache/freshness ownership (T2); bundle **NOT RUN** | T2 OUTCOME A: cache/freshness/invalidation/tags are application cache policy | DERIVED (partial — `loader()` itself undisposed) |
| 17 | `asyncSource()` | — | — | **NOT RUN** | — | NULL NOT RUN |
| 18 | `asyncQuery()` | — | — | **NOT RUN** | — | NULL NOT RUN |
| 19 | `batching()` | observational atomicity | FROZEN | blocked on MUT | — | T1 |
| 20 | `transactions()` | tree-local gate; foreign scopes never interfere; refusal FLUSHES; scope settlement must survive a throwing compensation | FROZEN | MUT-3 two-tree falsifier | — | partially FROZEN |
| 21-24 | `timeTravel()` / `trackHistory` / undo-redo-rollback / merge-branch | causal history owns meaning | FROZEN (invariant only) | MUT-3 | — | T1, merge preconditions FAIL |
| 26 | enhancer protocol | `.with()` only; no escape hatch; enhancer identity and capability dependencies have separate authorities | FROZEN (cutoff tests 1-2) | MUT-0 item 2 | — | **blocking GATE B** |
| 28 | write context | classification is caller-supplied and unverified, reachable from a published subpath, and takes effect | FROZEN (behaviour only) | ownership NULL **NOT RUN** | — | FROZEN (behaviour), owner UNPROVEN |
| 29 | `PathNotifier` | — | — | join test already refutes promotion | **NOT the observation boundary** | DERIVED (R1) |
| 30 | `interceptLeafSignals` | — | — | — | — | MEASURED |
| 43 | `_` command facade | must not manufacture PositionIds for facade organization | **CANDIDATE** — proposed by the draft, not derived | **sharpened NULL above — NOT RUN** | — | CANDIDATE |

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

| # | Concept | Visible in `$` today (MEASURED) | Position? | Hidden behavior? | Policy? | Public command? | Lowering hypothesis |
|---|---|---|---|---|---|---|---|
| 2 | store / canonical truth | yes | — | — | — | — | — |
| 4 | derived projection | yes (frozen: composes into `$`) | — | — | — | — | — |
| 6 | `linked()` | yes, via `.derived()` | — | — | — | — | — |
| 8 | `entityMap` | yes | — | — | — | — | — |
| 10 | `stored()` | yes (marker surface) | — | consequence (FROZEN owner) | — | — | — |
| 13 | `serialization` | no | — | — | — | — | — |
| 14 | `compared()` | no | — | — | — | — | — |
| 15 | `status()` | yes | — | — | — | — | — |
| 16 | `loader()` | yes | — | — | — | — | — |
| 17 | `asyncSource()` | yes | — | — | — | — | — |
| 18 | `asyncQuery()` | yes | — | — | — | — | — |
| 20 | `transactions()` | no | — | — | — | — | — |
| 21 | `timeTravel()` / history | no | — | — | — | — | — |
| 25 | `devTools()` | no | — | — | — | — | — |
| 26 | enhancer protocol | n/a | — | — | — | — | — |
| 32 | hydration | no | — | ingress | — | — | — |
| 34 | lazy / incremental materialization | n/a | — | — | — | — | — |
| 43 | `_` command facade | n/a | — | — | — | — | — |

The only two pre-filled behavior cells are the ones already frozen
independently: `stored()` has a persistence-consequence owner, and hydration is
an ingress distinct from persistence.

**What that proves, and what it does not.** It proves that persistence and
hydration require DIFFERENT AUTHORITY. It does **not** prove that the surviving
`stored()` function owns both. Those are two separate facts, and only the first
is established.

The joining claim — *"hydration is semantically part of the `stored()` authoring
concept"* — has never been derived. Current form couples them:
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

| # | Concept | Identity needed? | Tree scope? | Subject scope? | Causal participation? | Lifecycle needed? |
|---|---|---|---|---|---|---|
| 2 | store / canonical truth | PositionId + SlotIndex (FROZEN) | yes (FROZEN) | — | yes (FROZEN) | no |
| 4 | derived projection | **UNPROVEN** (see ledger) | — | — | **no** (FROZEN) | no |
| 6 | `linked()` | — | — | — | **UNPROVEN — the whole question** | — |
| 8 | `entityMap` | SubjectId (FROZEN) | — | yes (FROZEN) | — | — |
| 10 | `stored()` | — | yes — tree-scoped durability (FROZEN) | — | no — post-commit consequence (FROZEN) | — |
| 15 | `status()` | — | — | — | — | — |
| 16 | `loader()` | — | — | — | — | — |
| 17-18 | `asyncSource()` / `asyncQuery()` | — | — | — | — | — |
| 20 | `transactions()` | — | yes — tree-local, foreign scopes never interfere (FROZEN) | — | — | — |
| 21 | `timeTravel()` / history | PositionId (MEASURED) | MUT-3 | — | — | — |
| 32 | hydration | — | — | — | — | — |
| 43 | `_` command facade | must NOT manufacture PositionIds for facade organization | — | subject association is the candidate function | — | — |

Column `LIFECYCLE NEEDED?` is deliberately empty everywhere except where frozen.
The candidate draft asserted *"lifecycle belongs to execution, not resources"* —
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
