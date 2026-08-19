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
