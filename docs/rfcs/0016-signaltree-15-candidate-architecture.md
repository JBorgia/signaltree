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
                        component, 10 in another. Multiple durable consequences
                        per tree is not merely legitimate, it is the NORMAL case.
                        -> plural, by a wide margin.
```

**That pair alone refutes a generic rule.** "One declaration of each kind" is
false for durable consequences; "duplicates are always fine" is not obviously
true for a singular authority. There is no single rule to be had.

#### Cardinality per function, with its semantic basis

| Function | Cardinality | Semantic basis | Generic id needed? |
|---|---|---|---|
| transaction authority | idempotent / canonicalizing | already a per-tree singleton; no config to conflict | no |
| temporal history policy | 0..1 (candidate) | two configured histories over ONE causal lineage would compete | no — the OWNER is singular |
| durable consequence | 0..N | **MEASURED plural** | no — distinguished by external target |
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

Recorded as an open consequence, not a proposal: **do not assume all surviving
optional authoring inputs belong in a common collection.** The `features: []`
candidate must survive this too, and the step-7 criteria now have a seventh
question to answer — whether one property can honestly hold things with
different cardinalities.

#### `name` is explicitly out of scope here

A human-readable label may later survive for diagnostics or devtools. That is a
DIFFERENT function with a different owner, and it gets audited when diagnostics
does. *"We need a useful diagnostic label"* must never become *"therefore
declaration identity exists"*.

### Table F — legacy dispositions (a ledger, not an agenda)

| Legacy symbol | What it happened to provide | Disposition |
|---|---|---|
| `.with()` | sequential accumulation; late-application syntax | **DELETE** (function extracted, no surviving use) |
| `Enhancer` | authoring + realization + type contribution, conflated in one callable | functions extracted; form UNPROVEN — do NOT run an "Enhancer null" |
| `plannedSignalTree` | preconstruction capability planning | function relocates to ordinary compilation; public form UNPROVEN |
| `bind()` | binding to an already-constructed host | reference evidence only |
| `requires` / `provides` | an attempt at ordering + dependency validation | reference evidence only — evidence that someone anticipated a dependency problem, not evidence of the right solution |
| `name` | enhancer identity | reference evidence only |
| `capabilities` | substrate requirement declaration | the one legacy field whose FUNCTION is measured and exercised |

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
| 15 | `status()` | T2 | — | — | — | marker; own NULL: *what semantic state does it carry that ordinary signals do not?* |
| 16 | `loader()` | T2 | — | — | — | marker; own NULL: *what acquisition capability is lost?* |
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
| 38 | `invalidateTag` / tags | — | — | — | — | tag authority |
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
| 15 | `status()` | — | — | **NOT RUN** | — | NULL NOT RUN |
| 16 | `loader()` | — | — | **NOT RUN** | — | NULL NOT RUN |
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

Two, both incidental to the RFC and both real:

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
