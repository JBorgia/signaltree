# SignalTree 15 — the four product decisions, and what they oblige

**Status:** PRODUCT DECISION RECORD. The four items reserved by
[the product-core map](signaltree-15-product-core-map.md) on 2026-08-21 were
**decided the same day by the author on product/DX authority.** This file records
them, and derives what they oblige for kernel responsibilities, adapter seams and
feature placement.

## Authority — three levels, deliberately kept apart

```text
LEVEL 1   THE FOUR DECISIONS
          An authoritative product INPUT to the method, exactly like the P3
          freeze: stipulating premises IS the author's job. NOT theorems. No
          reviewer derived them, no gate established them, no experiment
          produced them.

LEVEL 2   THE ENTAILMENTS in this document
          ENTAILED  follows from the decision's own words plus already-frozen
                    text. Citable.
          INFERRED  needs a step THIS DOCUMENT supplied. Citable only as a
                    candidate, and the supplied step is named every time.

LEVEL 3   the product-core map's PRODUCT CLASS column
          editorial placement, zero evidential weight. Unchanged in status.
```

The map is explicit that its own cells carry no weight. That is why the decisions
and their entailments live **here** and not there: an authoritative input and its
consequences cannot sit inside a document whose preamble declares itself
weightless.

## The citation rule — mandatory

```text
CITE AS    "DR-n, decided by the author on product authority 2026-08-21, reads ..."
           "DR-n SUPPLIED the antecedent; the consequent therefore holds"

NEVER AS   "U5b established ..."          "the derivation showed ..."
           "Gate 1 granted ..."           "E2-S0 proved identity is required"
           "the reviewers agreed ..."     "the map decided ..."
```

## What none of the four do

```text
NOT an answer to U5b. The family is EXHAUSTED, NOT ANSWERED — UNDERDETERMINED,
  FUNCTION NOT ESTABLISHED, NOT OPENABLE AS WORDED. No decision here converts any
  of that into a verdict, in either direction.
NOT a licence to revive a frozen deletion. Naming a mechanism is not reviving it.
NOT an establishment of any kernel function. A product promise says which layer
  answers to the user. It does not say which layer implements, and it never
  supplies a function.
NOT a settlement of any carrier, any layer assignment, or any spelling. Spelling
  remains separately reserved in full.
```

---

## DR-1 — the member-access contract

> **The product supports REFERENCE semantics for acquired entity/member handles,
> while keyed lookup remains ADDRESS semantics.**

**This is not the shape the question had.** The map posed DR-1 as a binary —
`ADDRESS` **xor** `REFERENCE` for "the member-access contract". The decision
returns **two contracts on two different access forms**. Everything downstream
that pre-computed on the binary has to be re-read, including the map's own
statement that DR-1 decides "whether P-E's kernel concept is `dynamic structural
store` alone or `dynamic structural store + SubjectId`" — the answer is neither,
because the identity requirement landed on an access **form** rather than on the
store, and its carrier is open.

### E1-1 · ENTAILED — two access forms, and they must be distinguishable

```text
KEYED LOOKUP     resolves the CURRENT OCCUPANT of the key. Retargets on reuse.
                 No identity beyond the key required.
ACQUIRED HANDLE  bound to ONE membership. REFUSES to retarget after key reuse.
                 Identity beyond key+value required.
```

One access form cannot carry both contracts — they disagree on exactly the case
that distinguishes them. So the product surface must make **acquiring a handle a
distinct act from resolving a key**. What that act is _spelled_ is not decided
here and is separately reserved.

### E1-2 · ENTAILED — E2-S0's conditional discharges, consequent only

`e2s0-identity-function.spec.ts` recorded _"identity beyond values is REQUIRED"_
as **CONDITIONAL on an unproven antecedent** — the antecedent being that a
retained handle must not retarget. DR-1 supplies that antecedent for the
acquired-handle form, **by product decision**. The consequent therefore holds for
that form. Cite it as _"DR-1 supplied the antecedent"_, never as _"E2-S0
established identity is required"_ — the file's own header records the downgrade.

### E1-3 · ENTAILED — `SubjectId` is NOT revived, and no carrier is settled

The same file measured a **per-key generation counter** — a `Map` and an integer
over a plain array leaf — as producing exactly the refusal DR-1 asks for, and
recorded it as **sufficient-in-model, not minimal**. A rival global monotonic
incarnation token is named there and is untested.

```text
DR-1 REQUIRES   some identity beyond key+value, for the acquired-handle form
DR-1 SETTLES    no carrier whatsoever
STILL UNPROVEN  SubjectId's necessity · per-key generation's minimality ·
                the incarnation-token rival, which is untested
```

### E1-4 · INFERRED — the sharpest consequence: exclusivity, or kernel identity

**The step this document supplied:** whatever carries handle identity must
observe **every** membership change, or its refusals are unsound.

If a structural holder is also writable by an ordinary whole-value `.set`, an
application can replace the membership without the identity carrier observing it.
Every acquired handle's refusal then becomes unsound in both directions — it will
fail to refuse across an unobserved replacement, or refuse spuriously. So DR-1
entails one of:

```text
(a)  a structural holder has NO whole-value write on the public surface.
     Membership changes only through its own membership operations, so a carrier
     ABOVE the kernel can mediate.
(b)  the kernel supplies the identity, and exclusivity is unnecessary.
```

**Not blocked by the frozen boundary.** P-F freezes `.set(v)` _"where writable"_,
so a structural holder being non-`set`-writable is consistent with the freeze as
worded. Which of (a) / (b) is correct is a **derivation** question — cost and
necessity — not a product one, and it is not opened here.

### E1-5 · ENTAILED — the member-access row is at most `KA`, and this narrows it

`KP` requires that no layer above the kernel can supply the property. E2-S0's
`collectionB` was built **in ordinary code over a plain array leaf, above the
kernel**, and produced the refusal. So the `KP` test is FALSE as measured, unless
(a) above turns out to be unavailable. Placement: **`KA`**, carrier open.

### E1-6 · INFERRED — DERIVATION E's rival gets a wider burden; E is not settled

**The step this document supplied:** the challenger's construction is the same
one E2-S0 measured.

DERIVATION E is REOPENED and CHALLENGED **on granularity**, the rival being
_"reference-preserving update plus a memoised per-key computed"_. That rival is
E2-S0's `B′`, which was measured to **retarget silently**. Under DR-1 a rival must
now supply granularity **and** handle refusal.

```text
THIS IS      a wider burden on the RIVAL
THIS IS NOT  evidence for entityMap, and not a repair of E's verdict
E REMAINS    CHALLENGED
```

### E1-7 · ENTAILED — DR-1 clears exactly one of DR-4's open scenarios

Three scenarios were recorded `NOT CLEARED` for deferred-completion acceptance.
DR-1 clears **one**: _"a consumer that cannot re-resolve because it never had the
key"_ — under DR-1 such a consumer holds an acquired handle, and refusal is
promised for it. **Transaction/undo and persistence stay NOT CLEARED** and are
cleared by nothing in this document.

---

## DR-2 — failed-mutation neutrality

> **Failed-mutation neutrality is a SignalTree product promise.**

### E2-1 · ENTAILED — P-B has an owner, and it is not a function

The map's reading 3 named four properties that nothing owned. This is the first
to get an owner: **the product**. It does **not** establish a kernel function —
`U5b-B` closed `FUNCTION NOT ESTABLISHED` for refusal/failure and that closure is
untouched. A promise says which layer answers to the user; it does not say which
layer implements, and it is not evidence of anything.

### E2-2 · ENTAILED — no conflict with the frozen rollback-refusal line

Worth writing down because it will be raised as one. Frozen: _"a rollback REFUSAL
is not a success — surviving truth FLUSHES"_, and `RELEASE-1.0.md`'s outcome
table: _"rollback REFUSED before compensation | authored state still survives |
flush surviving truth."_ That reads like a failed operation leaving a durable
residue.

It is not. In that row **the mutation took and the rollback failed** — there is no
not-taken mutation for neutrality to be about. The frozen line is the
anti-pretence rule DR-2 depends on, not a counterexample to it.

### E2-3 · ENTAILED — a BOUND on DR-2: failed compensation is out of scope

_"Compensation begins then fails catastrophically"_ is recorded as a catastrophic
boundary that **errors and never pretends rollback succeeded**. That state is
user-encounterable, and DR-2 does not promise it away. DR-2 is a promise about
**mutations that did not take**, not about **compensations that did not
complete.** Anyone reading it as the latter has widened it.

### E2-4 · ENTAILED — the shipped async-`intercept` fail-open is a promise violation

It was recorded as _"published-surface drift"_. Under DR-2 it is a **violation of
a product promise** on the published 14.x surface: a guard that refuses a write
does not actually refuse it, because `InterceptHandlers => void | Promise<void>`
lets an async handler resolve after the mutation proceeds. The unpublished
fail-closed fix (`ST2033`) is therefore **required-by-promise**, not hygiene. No
version and no runtime change is made here — the reclassification is the entire
effect.

### E2-5 · ENTAILED — DR-2 does NOT revive `intercept`, and deletion DISCHARGES the clause

The reflex reading is that promising neutrality rescues the write-path guard. It
does not: neutrality is a promise about **outcomes**, a guard is a **mechanism**,
and `intercept`'s deletion **stands** (_"a write-path guard is the same category
error as `status`"_).

Better than neutral — **deletion satisfies the guard clause vacuously.** With no
async guard there is no guard that fails to refuse. Discharging a promise by
removing the surface that could break it is legitimate, and it is the same shape
Reading A gives DR-4 below.

### E2-6 · INFERRED — DR-2 splits across DR-3

**The step this document supplied:** the split of the promise into two
user-visible surfaces.

```text
TRUTH SURFACE    no residual state from a mutation that did not take
                 -> leans on ALREADY-FROZEN kernel refusal semantics
HISTORY SURFACE  no cancelling step PAIR where there should be zero steps
                 (greenfield criterion 2c)
                 -> a property of the STEP, which DR-3 places on the ADAPTER
```

So DR-2's history half is an **adapter** obligation and its truth half is largely
**already frozen kernel**. This is the placement result, and it is `INFERRED`
because the split is this document's.

### E2-7 · INFERRED — placement: `transactions()` SPLITS; error authority becomes `KA`

```text
transactions()  refusal / neutrality role   ->  KA   (adapter over frozen kernel
                                                     refusal semantics, with a
                                                     product promise behind it)
                SPECULATIVE role            ->  still UNPLACED
error authority (onTreeError, SignalTreeRollbackError)  ->  KA
                a promise that a refusal is encounterable AS a refusal requires a
                reportable refusal. Branded-factory FORM stays undisposed.
```

**The map's prohibition holds verbatim and extends to DR-2:** U5b's exhaustion is
not a verdict on the speculative function, and neither is this promise.

---

## DR-3 — the user-recognizable history step

> **The user-recognizable history step is a kernel-supported ADAPTER obligation,
> not a kernel primitive. The kernel supplies commit / publish / position facts;
> the history adapter owns the user-action step.**

### E3-1 · ENTAILED — `PositionId` needs no intention companion. This is the highest-leverage result

The map recorded that DR-3 decides _"whether `PositionId` needs an
intention/authorship companion in the kernel at all."_ The adapter answer
**removes that prospective requirement.** It is a **narrowing** of kernel
responsibility, which is the direction Rule 0j wants, and it deletes nothing that
existed: it withdraws an obligation that was never established.

### E3-2 · ENTAILED — the kernel's P-A obligation is now a CLOSED list

Given by the decision's own words:

```text
OWED       commit facts · publish facts · position facts
NOT OWED   a user-action concept · an intention field · a step · an authorship
           stamp · a grouping of turns into anything
```

Anything beyond the three must earn itself as its own row.

### E3-3 · ENTAILED — consistent with the frozen triple, and NOT derived from it

_"SignalTree owns truth · Angular owns observation · causal history owns
meaning"_ assigns meaning to **causal history**, and under DR-3 the history
adapter is where the step's meaning lives. So DR-3 is **one available reading** of
the frozen text — and, in the phrasing the P3 freeze record already established,
**an available reading is not a grant.** DR-3 is supplied by product decision, not
extracted from the invariant.

### E3-4 · INFERRED — a NEW adapter seam, and the real work DR-3 creates

**The step this document supplied:** that the grouping fact is not among the three
the kernel owes.

An adapter that groups turns into a step needs a fact saying **which turns belong
to one user action**. Commit, publish and position facts are all per-turn or
per-location, and the measured failure is precisely a per-turn count — a 12-way
concurrent `mergeMap` fan-out, **one** user action, **12** steps. User-action
knowledge lives at the **call site**.

So DR-3 entails a seam by which **a call site demarcates a span of turns**, with
the kernel exposing the span while knowing nothing about what a step means.

```text
DOES SUCH A SEAM EXIST TODAY?   MEASURABLE. Not measured here.
CANDIDATE WITH THE RIGHT SHAPE  the causalMode write context — FROZEN as
                                behaviour (caller-supplied, unverified, and it
                                takes effect), OWNER UNPROVEN.
                                DR-3 gives that open owner question a shape it
                                did not have. This is a CANDIDACY, not a finding.
```

### E3-5 · ENTAILED — two measured criteria RELOCATE

Greenfield criterion 2 (_a step boundary moves because a developer added or
removed an `await`_) and criterion 2b (_12 steps for one action, measured at 12
today_) become **adapter acceptance criteria**. Under DR-3 they were never kernel
criteria: a kernel that satisfies turn indivisibility perfectly can still fail
both. **Relocating them is not weakening them** — they stay falsifiable and stay
unmet.

### E3-6 · ENTAILED — placement

```text
the history STEP (what one Ctrl+Z means)   UNPLACED -> KA
user-facing scoped undo / redo             UNPLACED -> KA
    and the 15-branch non-scalar-leaf undo REGRESSION still blocks measurement.
    DR-3 changes which layer OWNS the feature and nothing about that block.
timeTravel() / jumpTo / getHistory         KA, unchanged, and still explicitly
                                           separate from undo
trackHistory / form history                LC, unchanged — "retained mechanically,
                                           not an audited survivor" — but there is
                                           now a NAMED obligation to audit it
                                           against
```

---

## DR-4 — async acceptance / cancellation

> **Async acceptance/cancellation is promised for SignalTree-owned async helpers
> (`asyncSource`, `asyncQuery`, loader-backed `entityMap`) and is application
> responsibility for arbitrary app promises.**

### E4-1 · ENTAILED — the APP half is decided outright

For an arbitrary application promise, acceptance/cancellation is **app
responsibility**. SignalTree does not promise to coordinate a promise it did not
create. Placement: the deferred-completion row's **app half → `AR`**.

### E4-2 · ENTAILED — the app half is not bare, because DR-1 reaches it

A consumer that acquired a handle gets refusal from **DR-1**, inside a SignalTree
helper or not. So "app responsibility" here means the application owns the
**coordination** — what to do about a refused completion — **not** that it must
build its own identity mechanism. The two are routinely conflated and the
distinction is the whole content of this entailment.

### E4-3 · ENTAILED — P-D stays on the list of six, by DECISION

The map's DR-4 asked whether P-D is a property at all. A promise over any
non-empty scope answers yes, and P-D's own _"if independently needed"_ conditional
is **discharged by decision — never by evidence.** The antecedent remains
derivationally unproven, and **P-D may not be cited as derived.**

### E4-4 · BLOCKED — see DECISION REQUIRED

---

## DECISION REQUIRED — DR-4's scope

DR-4 names three carriers. Their recorded ledger state:

```text
asyncSource()             frozen DELETE, still physically present. RFC 0016's
                          Rule 0j-2 constraint and its contamination guard:
                          "cannot sponsor any row here"
asyncQuery()              frozen DELETE, still physically present. Same guard
loader()                  AR — T2 Outcome A: cache / freshness / invalidation /
                          tags are APPLICATION cache policy
loader-backed entityMap   entityMap's own function SURVIVES, then CHALLENGED by
                          DERIVATION E REOPENED
```

Two of the three named carriers are **sentenced**, and the third is classed **app
responsibility**. Two readings are available and they produce materially
different work:

```text
READING A — SCOPE-CONDITIONAL
  The promise binds whichever SignalTree-owned async helper EXISTS in 15. The
  three names are cited as the v14 EXAMPLES OF THE CATEGORY, not as commitments
  to keep them. If none survives, the promise binds nothing and P-D collapses to
  AR by vacuity — the same discharge shape as E2-5, where deleting `intercept`
  satisfies DR-2's guard clause.
  COST: changes no disposition. Deletes a package surface as already frozen.

READING B — CARRIER-COMMITTING
  The decision commits 15 to HAVING SignalTree-owned async helpers, which
  REVERSES the asyncSource / asyncQuery deletion and REOPENS loader()'s
  Outcome A.
  COST: reinstates two frozen deletions and reopens a closed row.
```

**The decision cannot be applied without choosing, and nothing here chooses.**
Naming a carrier is not reviving it; inferring the revival would be an
implementer supplying by fiat exactly the class of premise the reserved-items
section exists to prevent.

Not in dispute: **E4-1 holds under both readings** and is recorded as decided.

Ranked below it, and needing its own placement under either reading:
`loader-backed entityMap` is a **composite whose two components carry different
dispositions** (`loader()` = `AR`; `entityMap` = survives-then-challenged).

---

## Kernel responsibilities — the net change

```text
WITHDRAWN — prospective obligations, none of which was ever established
  an intention / authorship companion to PositionId                    DR-3
  a kernel-owned "user action" or "step" concept                       DR-3
  kernel coordination of arbitrary application promises                DR-4 app half

CLOSED LIST for P-A, given by DR-3's own words
  commit facts · publish facts · position facts. Nothing else.

REQUIRED, with the LAYER NOT SETTLED
  identity beyond key+value, for the ACQUIRED-HANDLE FORM ONLY          DR-1
    carriers open: per-key generation (sufficient-in-model, not minimal) ·
    global incarnation token (untested) · SubjectId (necessity UNPROVEN)
  holder-surface exclusivity OR kernel-supplied identity — one of the two,
    and this one is INFERRED                                            E1-4

UNCHANGED, still frozen
  turn indivisibility · observable atomicity · rollback-refusal semantics ·
  tree-scoped durability authority · the public constraint boundary (P-F) ·
  the derived projection contract (RFC 0015) in full
```

**Net direction: three prospective kernel obligations withdrawn, one required with
its layer open.** The kernel got smaller and the adapter layer got the work —
the same adapter layer the map flagged as having had _"almost no derivation
attention."_

## Adapter seams — three named, two of them new

```text
SEAM 1  TURN DEMARCATION                              NEW · UNMEASURED · E3-4
        A call site marks a span of turns as one user action; the kernel exposes
        the span and knows nothing about what a step means.
        Candidate with the right shape: the causalMode write context (behaviour
        FROZEN, OWNER UNPROVEN). Candidacy only.

SEAM 2  MEMBERSHIP MEDIATION                          NEW · UNMEASURED · E1-4
        Every membership change is observable to whatever carries handle
        identity. Requires holder-surface exclusivity, or kernel identity.

SEAM 3  SETTLED-COMMIT CONSEQUENCE                    EXISTS · FROZEN · P-C
        Tree-scoped; unresolved scopes hold that tree's durable consequences;
        foreign-tree scopes never interfere.
        internals/commit-consequence.ts. Untouched by all four decisions.
```

Seams 1 and 2 are this checkpoint's actual output: **two named, unmeasured adapter
seams, each traceable to exactly one decision, neither of which existed as a
stated seam before today.**

## Feature placement delta

`CLASS` remains the map's editorial column. What changed is which cells the four
decisions make placeable.

| Row                              | Was | Now                                      | Basis       |
| -------------------------------- | --- | ---------------------------------------- | ----------- |
| member access contract           | ⚠   | **KA** — carrier open                    | DR-1 / E1-5 |
| the history STEP                 | ⚠   | **KA**                                   | DR-3 / E3-6 |
| user-facing scoped undo / redo   | ⚠   | **KA** — regression still blocks measure | DR-3 / E3-6 |
| error authority                  | ⚠   | **KA** — form undisposed                 | DR-2 / E2-7 |
| `transactions()`                 | ⚠   | **KA** refusal-role · ⚠ speculative-role | DR-2 / E2-7 |
| deferred-completion acceptance   | ⚠   | **AR** app half · ⚠ helper half          | DR-4 / E4-1 |
| `asyncSource()` / `asyncQuery()` | LC  | **⚠ DECISION REQUIRED**                  | DR-4 scope  |
| `loader()`                       | AR  | AR — flagged as a named promise carrier  | DR-4 scope  |
| `entityMap()` · the five members | ⚠   | ⚠ — rival's burden widened, E unsettled  | DR-1 / E1-6 |
| `intercept`                      | LC  | LC — deletion STANDS, clause discharged  | DR-2 / E2-5 |

**The `⚠` count, with the arithmetic shown** (the map's own count, and the map is
editorial):

```text
22  before
-4  fully placed: member access · history STEP · scoped undo/redo · error authority
+1  newly unplaced: asyncSource / asyncQuery, on the DR-4 scope conflict
--
19  after, of which TWO are SPLIT rows whose non-⚠ half is now placed
```

## Property ownership — the map's reading 3, restated

```text
P-A  user-recognizable history step      OWNER: the history ADAPTER          DR-3
P-B  failed-mutation neutrality          OWNER: the PRODUCT, as a promise;
                                         truth half leans on frozen kernel,
                                         history half is adapter              DR-2
P-C  persistence consequence ordering    OWNER FROZEN. Realization unproven   —
P-D  async acceptance / cancellation     app-promise scope: the APPLICATION;
                                         helper scope: BLOCKED on DR-4        DR-4
P-E  entity structural lifecycle         STILL NO OWNER. DERIVATION E REOPENED
P-F  typed reactive JSON shape           FROZEN outright                      —
```

**Four properties owned by nothing → one owned by nothing (P-E) and one owned in
part (P-D).** That is the headline change of the day.

## Concerns

**1. DR-1's answer is not the question's shape.** The map posed a binary; the
decision returned a two-surface split. Recorded faithfully — but anything
downstream that pre-computed on the binary now has a third answer, including the
map's own "`dynamic structural store` alone or `+ SubjectId`" framing. Re-read
rather than translate.

**2. E1-4 is the only entailment with teeth on the frozen surface, and it is
`INFERRED`.** If the supplied step — _the identity carrier must observe every
membership change_ — is wrong, DR-1 costs nothing structurally. It should be
attacked before anything is built on it.

**3. DR-2 gives P-B an owner with no kernel function behind it.** `U5b-B`'s
`FUNCTION NOT ESTABLISHED` is untouched, and that is a coherent state. It is also
exactly the state in which an implementer starts treating the promise as the
missing function's proof. The citation rule is the only guard here, and citation
rules have leaked before by this precise route — the connective clauses added
around a quoted decision are where widening enters.

**4. DR-4 is unusable at its stated scope** until the reading is chosen, and the
two readings differ by two frozen deletions and one closed row.

**5. Three of the four decisions REDUCE kernel obligations.** From an author with
product authority that is entirely legitimate. But a checkpoint that only ever
narrows the kernel should be suspected of narrowing by convenience — and the one
obligation that grew (DR-1's identity requirement) is also the one whose layer is
unsettled, which is the cheapest possible place for it to sit. Flagged for a
hostile look, not acted on.

**6. Nothing here was reviewed adversarially.** Antagonistic review is automatic
at **row** boundaries; this is a checkpoint, not a row, and it opens and closes
nothing. The `INFERRED` entailments — E1-4, E1-6, E2-6, E2-7, E3-4 — are the ones
that would benefit, and E1-4 most of all.
