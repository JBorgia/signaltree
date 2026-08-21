# SignalTree 15 — the product-core map

**Status:** product architecture checkpoint, 2026-08-21. **Not a derivation row,
not a gate series, and not a source of dispositions.**

This document lays the user-visible product surface against the agnostic kernel
vocabulary, once, in one place. It exists because the derivation has been running
function-first for many rows and has never assembled a product-side view — so
nobody can currently answer _"which of the things a user can see does the kernel
have to represent?"_ without reading a 10,000-line ledger.

## What this is, and what it is not

```text
IT IS      an editorial placement of the product surface against kernel concepts,
           for planning and for orientation
IT IS NOT  a verdict on any function, a closure of any row, a new procedure
           layer, or evidence about anything
```

**Authority.** This file sits at layer 5 of
[SIGNALTREE-15-CONTEXT.md](SIGNALTREE-15-CONTEXT.md)'s authority order — below
frozen invariants, below the context file, below the RFC matrix. Where a
`PRODUCT CLASS` in this document and a recorded disposition in
[RFC 0016](../rfcs/0016-signaltree-15-candidate-architecture.md) disagree, **the
RFC wins and this file is wrong.** The two-column shape of the map below exists
to make that impossible to miss: `LEDGER STATE` is cited, `PRODUCT CLASS` is
this document's own provisional placement.

**What it may never be used for.** A `PRODUCT CLASS` of `kernel primitive` is
not an argument that a function survived. A class of `app responsibility` is not
an argument that a function is unnecessary. Filling a cell here has no evidential
weight of any kind, and a later derivation that contradicts a cell here is not
in conflict with anything — it is simply the derivation doing its job.

### One prohibition carried in explicitly

The `U5b` family (UNDO-E4) is **exhausted, not answered**. Its rows closed
`UNDERDETERMINED`, `FUNCTION NOT ESTABLISHED` and `NOT OPENABLE AS WORDED`.
None of that is evidence that transaction, speculative or coordinated-mutation
functions are unnecessary, and **this document may not be read as converting the
family's exhaustion into an `app responsibility` placement.** Where a product
property depends on one of those functions, the row here reads `⚠ UNPLACED` and
is listed under [DECISION REQUIRED](#decision-required).

---

## The naming rule, at the product level

The derivation's rule, quoted verbatim from
[SIGNALTREE-15-CONTEXT.md](SIGNALTREE-15-CONTEXT.md) § "THE NAMING RULE":

```text
A CANDIDATE MUST NAME THE OBSERVABLE SEMANTIC PROPERTY BEING TESTED.

INCUMBENT-NEUTRAL   no entityMap, no SubjectId, no effect log, no carrier, no v14
                    noun. STILL REQUIRED.
FUNCTION-ANONYMOUS  no observable property at all — "semantics", "a shared fact",
                    "coordination". NO LONGER PERMITTED.
```

**Its product-level application — stated separately, because it is an
application and not the rule itself:**

> A product-core entry must name the property a **user or an application
> developer would notice the absence of**. Withholding the incumbent's spelling
> is still required. Withholding the property is not neutrality; it is an entry
> that cannot be checked, prioritised, or falsified.

This is why the map below is organised around six **named** properties rather
than around the words `history`, `persistence`, `async`, `entities`,
`transactions`. Those five nouns are incumbent feature names. They say nothing
about what breaks for a user when they are gone.

The complementary guardrail already recorded in
[history-positionid-lifetime-and-design-space.md](history-positionid-lifetime-and-design-space.md)
§ "Terminology guardrail" runs the other way and still holds: kernel vocabulary
(`selector`, `effect engine`, `canonical turn store`, `commit policy`) is
**internal**, and must not become the way the product is explained. Naming the
property is mandatory. Naming the machinery in public is forbidden.

---

## The six named product properties

Each is stated with the observation that shows it missing. A property with no
such observation is function-anonymous and does not belong on this list.

### P-A — user-recognizable history step

> One reversal action undoes exactly what the user believes they just did.

```text
MISSING WHEN  a 12-way concurrent mergeMap fan-out — one user action — produces
              12 steps. MEASURED at 12 today
              (history-the-greenfield-target.md §4.1, criterion 2b)
MISSING WHEN  a step boundary moves because a developer added or removed an
              `await` (criterion 2)
NOT THIS      whole-tree time travel, `jumpTo`, keyframe scrubbing — an explicitly
              separate devtools instrument (greenfield-target §7)
```

### P-B — failed-mutation neutrality

> A mutation that did not take leaves nothing a user can encounter.

```text
MISSING WHEN  an aborted optimistic action leaves two cancelling history steps
              rather than zero (greenfield-target criterion 2c)
MISSING WHEN  a guard that refuses a write does not actually refuse it. Shipped
              instance: an async intercept() handler returns a Promise and the
              mutation proceeds — `InterceptHandlers => void | Promise<void>`,
              recorded under "Published-surface drift". Live in 14.1.2 on npm;
              the fail-closed fix is committed and unpublished
NOT THIS      error reporting, retry, or compensation policy
```

### P-C — persistence consequence ordering

> Durable storage never gets ahead of the tree's settled commit state.

Quoted from `packages/core/src/lib/internals/commit-consequence.ts`, which is the
measured realization of the frozen post-commit-consequence authority.

```text
MISSING WHEN  a rollback writes another pending transaction's speculative value
              straight to storage — the defect class that module records
FROZEN        durability authority is TREE-SCOPED; unresolved scopes hold that
              tree's durable consequences; foreign-tree scopes never interfere
```

### P-D — async acceptance / cancellation, **if independently needed**

> A deferred completion either lands on what it began against, or is refused.

The conditional is load-bearing and is not a hedge: no row has established that
SignalTree owns this.

```text
MISSING WHEN  a save begun against a member writes its result onto a DIFFERENT
              member that reused the key
              (e2s00-member-access.kernel.spec.ts, "the deferred completion")
LEDGER        the only shape in which retargeting is observable at all. Every
              other exercised shape is expressible under ADDRESS semantics
STILL OPEN    whether the product PROMISES this, or routes it to the application
```

### P-E — entity structural lifecycle

> Membership change — add, remove, re-key — is first-class, observable and
> attributable, not incidental array replacement.

```text
MISSING WHEN  writing one member replaces the collection reference and every
              observer of the collection recomputes (DERIVATION E zero-state,
              E-e / E-f)
CHALLENGED    under reference-preserving update plus a memoised per-key computed,
              an ordinary array IS granular. "DERIVATION E REOPENED" — E's
              positive verdict is CHALLENGED, not overturned
```

### P-F — typed reactive JSON shape

> `tree.$.a.b.c()` reads, `.set(v)` writes where writable, TypeScript infers the
> shape from the state literal, and the tree stays navigable by ordinary property
> access.

This is the **only one of the six that is frozen**, by
[causal-runtime-contract.md](causal-runtime-contract.md) § "Public constraint
boundary". Note what that section also freezes by omission: construction syntax,
enhancer installation syntax, and every capability-declaration spelling are
explicitly **not** part of the constraint.

---

## The agnostic kernel concepts

Eight concepts, each with its provenance flag. **Three are frozen as distinct
concepts. None of the eight is frozen as a required mechanism**, and the
distinction is the one Rule 0n exists to protect: a concept can be frozen as
_not the same thing as its neighbours_ without anything having earned its
existence.

| Concept                      | Status                                     | What it names                                                                                             | Where it is real today                                                          |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **PositionId**               | FROZEN as distinct; lifetime NOT frozen    | stable identity of the behavioural owner at a location in the shape                                       | `position-registry.ts`; probe found lifetime A sufficient, B not required       |
| **SubjectId**                | FROZEN as distinct; NECESSITY **UNPROVEN** | stable identity of the thing being mutated at that location, across time                                  | `entity-signal.ts`; entirely third-bucket (post-2026-08-11)                     |
| **SlotIndex**                | FROZEN as distinct                         | the physical cell a scalar value occupies in the substrate                                                | `internals/tree-scalar-slot-runtime.ts`, `type SlotIndex = number`              |
| **static child table**       | ⚠ THIS DOCUMENT'S NAME — not frozen        | the compile-time-known child topology of a declared object literal: a fixed key set, addressable by shape | the declaration → topology → materialization path in `signal-tree.ts`           |
| **dynamic structural store** | ⚠ THIS DOCUMENT'S NAME — not frozen        | a holder whose MEMBERSHIP varies at runtime, so its children cannot come from the declaration             | `entity-signal.ts`; `StructuralEffect = 'add' \| 'remove' \| 'rekey'`           |
| **frame commit / publish**   | lifecycle FROZEN; "frame" is measured      | staged writes become truth atomically, then are projected, then published, then produce consequences      | `ScalarSlotMutationFrame`: `beginFrame()` / `set` / `commit()` / `discard()`    |
| **observer adapter**         | boundary FROZEN; the noun is CANDIDATE     | the seam where committed truth becomes framework-observable                                               | `tree-scalar-slot-angular-runtime.ts` — the Angular-only file in the slot layer |
| **consequence adapters**     | authority FROZEN; plural is CANDIDATE      | post-commit sinks that may only run when the tree's commit state is settled                               | `internals/commit-consequence.ts`, gating `stored()` and `persistence()`        |

The frozen invariant these serve, verbatim:

```text
SignalTree owns truth · Angular owns observation · causal history owns meaning
PositionId != SubjectId != SlotIndex != key/path
PREPARE -> PRIVATE COMMIT -> PROJECT -> PUBLISH -> CONSEQUENCE
```

**Two of the eight names are mine and are flagged as such.** `static child table`
and `dynamic structural store` do not appear in any frozen text. They name a real
measured split — a declared object literal's children are known before the tree
exists, a collection's are not — and that split is what makes `PositionId`
sufficient for one and not for the other. But the names are new, and a new name
that circulates for a week becomes a premise. Treat them as descriptive labels
for this map only; a derivation that needs the distinction must earn its own
vocabulary.

---

## The five product classes

```text
KP  KERNEL PRIMITIVE
      the kernel must represent it. No layer above the kernel can supply it,
      because the information it needs is not available above the kernel.

KA  KERNEL-SUPPORTED ADAPTER
      the kernel supplies a fact or a seam; a REPLACEABLE adapter turns that into
      the feature. The kernel does not know the adapter exists.

AS  AUTHORING SUGAR
      expressible in already-surviving primitives. Exists to shorten a
      declaration. Rule 0m governs: the CAPABILITY may be evidence, the SPELLING
      is never architecture.

AR  APP RESPONSIBILITY
      the application owns it. SignalTree offers nothing beyond ordinary state.

LC  LEGACY COMPATIBILITY
      present at HEAD, no SignalTree 15 function claimed, retained pending
      physical deletion. Rule 0l: a legacy mechanism is an EVIDENCE REPOSITORY,
      never a migration target.

⚠   UNPLACED
      cannot be placed without deciding an open semantic question. Listed under
      DECISION REQUIRED. NOT a soft "app responsibility".
```

**A note on `LC`, because the class is nearly a contradiction here.** The frozen
north star reads _"Greenfield architecture. SignalTree 14 is EVIDENCE ONLY. No
compatibility requirement."_ Under that, **nothing may enter SignalTree 15
because 14 had it**, so `LC` cannot be a destination class. What it does describe
is a real transitional state at HEAD: mechanisms already dispositioned for
deletion that are still physically present, plus one — `trackHistory` — recorded
as _"retained mechanically, not an audited survivor."_ Every `LC` row below is
therefore a statement about the current tree, not a commitment about 15.

---

## The map

`LEDGER STATE` cites RFC 0016 / SIGNALTREE-15-CONTEXT. `CLASS` is this
document's provisional placement and carries no weight.

### A — shape and access

| Feature                               | Property | Kernel concepts                                  | Class | Ledger state                                                                      |
| ------------------------------------- | -------- | ------------------------------------------------ | ----- | --------------------------------------------------------------------------------- |
| `signalTree(literal)` construction    | P-F      | static child table                               | KP    | KEEP; old grammar must fail at compile/import time (FROZEN, cutoff 4)             |
| `tree.$.a.b.c()` / `.set` / `.update` | P-F      | PositionId · SlotIndex · frame commit · observer | KP    | FROZEN — the public constraint boundary                                           |
| `tree()` whole read · `tree(partial)` | P-F      | static child table · frame commit                | KP    | `restoreState` is `tree(state)`; the partial merge is the scoped-revert mechanism |
| `$` state facade                      | P-F      | static child table                               | KP    | FROZEN (cutoff 1–2: one operation one protocol, no root surface)                  |
| `asReadonly()`                        | P-F      | —                                                | AS    | MEASURED: type-level narrowing, not a bypass guard                                |
| `plannedSignalTree()`                 | —        | —                                                | ⚠     | explicitly NOT frozen as a public API candidate                                   |
| `toWritableSignal`                    | P-F      | observer adapter                                 | KA    | one of only 3 symbols exposing Angular in a public TYPE                           |

### B — projections

| Feature            | Property | Kernel concepts              | Class | Ledger state                                                                  |
| ------------------ | -------- | ---------------------------- | ----- | ----------------------------------------------------------------------------- |
| `derived:` block   | P-F      | static child table · publish | KP    | contract FROZEN in full (RFC 0015); no causal, no persistence identity        |
| `.derived()` chain | P-F      | —                            | LC    | DELETE candidate; the cut is NOT AUTHORIZED                                   |
| `derivedFrom()`    | P-F      | —                            | AS    | function PROVED (TS7006 at a module boundary is real); form unsettled         |
| `linked()`         | P-F      | —                            | AS    | **NOT EARNED** — "derived-but-writable" is Angular's function; Rule 0m        |
| `compared()`       | P-F      | frame commit (equality gate) | ⚠     | NULL NOT RUN. Its own null: what does SignalTree need to know about equality? |

### C — collections and entity structural lifecycle

| Feature                                                                   | Property  | Kernel concepts                      | Class | Ledger state                                                                                                        |
| ------------------------------------------------------------------------- | --------- | ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------- |
| `entityMap()` — dynamic membership                                        | P-E       | dynamic structural store · SubjectId | ⚠     | FUNCTION **SURVIVES** (first positive result) — then **CHALLENGED** by DERIVATION E REOPENED                        |
| the five minimum members (`addOne` `removeOne` `byId` `byIdOrFail` `ids`) | P-E       | dynamic structural store             | ⚠     | the only members established; all 31 accounted for                                                                  |
| seven derived projections (`all` `count` …)                               | P-E       | —                                    | AS    | derived projections of the above                                                                                    |
| thirteen bulk / convenience members                                       | P-E       | frame commit                         | ⚠     | atomicity across them belongs to the TRANSACTION KERNEL, not the collection                                         |
| `changeId` (re-key)                                                       | P-E       | SubjectId · dynamic structural store | LC    | recorded EARNED and **WITHDRAWN**; the measured behaviour REVERSES shipped 14.1.2                                   |
| `activeId` / `activeEntity` / setters                                     | P-E       | —                                    | AR    | **NO FUNCTION** — docblock records it as elf/Akita parity; a plain position + `byId` is identical                   |
| `byKeys` / entity computed slices                                         | P-E       | —                                    | AS    | entity key selection                                                                                                |
| `tap`                                                                     | P-A · P-E | dynamic structural store · publish   | ⚠     | deletion **WITHDRAWN**; the function EXISTS, its OWNER is undecided, kernel-scope null UNRUN                        |
| `intercept`                                                               | P-B       | frame commit                         | LC    | no function — a write-path guard is the same category error as `status`; deletion STANDS. Its async form FAILS OPEN |
| member access contract (ADDRESS vs REFERENCE)                             | P-D · P-E | SubjectId · dynamic structural store | ⚠     | **NOT DECIDED — which contract is required.** Both escapes are application choices                                  |

### D — durability

| Feature                                     | Property | Kernel concepts      | Class | Ledger state                                                                            |
| ------------------------------------------- | -------- | -------------------- | ----- | --------------------------------------------------------------------------------------- |
| post-commit consequence authority           | P-C      | consequence adapters | KP    | **FROZEN** — tree-scoped; unresolved scopes hold; foreign trees never interfere         |
| `stored()` marker                           | P-C      | consequence adapters | AS    | **NOT EARNED, both halves**, on corrected reasoning. Owner FROZEN, realization UNPROVEN |
| `persistence()` enhancer                    | P-C      | consequence adapters | KA    | owner FROZEN (persistence consequence); enhancer form undisposed                        |
| storage adapters (`core/storage`)           | P-C      | consequence adapters | KA    | emits **no** external imports — already the neutrality shape                            |
| `flushAllStoredSignals()` / page-hide drain | P-C      | consequence adapters | LC    | repairs a hazard the DEBOUNCE introduced; `debounceMs: 0` needs none of them            |
| `serialization()` enhancer                  | P-F      | static child table   | ⚠     | **NOT EARNED** for its core function, and it CLEARS the M-cluster cut                   |
| hydration (`onHydrateDecision`)             | P-F      | static child table   | LC    | hydrate hook: DELETE candidate; both its triggers can never fire                        |
| SSR state transfer                          | P-F      | static child table   | ⚠     | RFC 0014; a distinct ingress. No 15 derivation run                                      |

### E — async

| Feature                          | Property | Kernel concepts          | Class | Ledger state                                                                                                        |
| -------------------------------- | -------- | ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------- |
| `status()`                       | —        | —                        | LC    | **FUNCTION DELETE** — physically gone; workflow state is ordinary truth                                             |
| `loader()`                       | P-D      | —                        | AR    | T2 Outcome A: cache / freshness / invalidation / tags are application cache policy                                  |
| `asyncSource()` / `asyncQuery()` | P-D      | —                        | LC    | DELETE — frozen, still physically present                                                                           |
| `invalidateTag` / tags           | P-D      | —                        | ⚠     | A3 (tree-scoped registry-free addressing of policy holders) is the one un-run remainder                             |
| deferred-completion acceptance   | P-D      | SubjectId · frame commit | ⚠     | the antecedent is **UNPROVEN**; NOT CLEARED for transaction/undo, persistence, or a consumer that never had the key |

### F — history, causality, transactions

| Feature                                     | Property  | Kernel concepts                     | Class | Ledger state                                                                                                  |
| ------------------------------------------- | --------- | ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| causal turn atomicity                       | P-A · P-B | frame commit / publish              | KP    | **FROZEN** — a turn is indivisible everywhere it participates                                                 |
| observable atomicity (not a revision count) | P-A       | frame commit / publish              | KP    | **FROZEN** — a semantic transaction may span more than one substrate commit                                   |
| rollback-refusal semantics                  | P-B       | frame commit · consequence adapters | KP    | **FROZEN** — a refusal is not a success; surviving truth FLUSHES                                              |
| `batching()`                                | P-A       | frame commit                        | KA    | observational atomicity FROZEN; the enhancer's own null is blocked on MUT                                     |
| `transactions()` / `PendingTransaction`     | P-B       | frame commit · consequence adapters | ⚠     | tree-local gate FROZEN; the speculative FUNCTION is not established. **U5b exhaustion is not a verdict here** |
| user-facing scoped undo / redo              | P-A       | PositionId · frame commit           | ⚠     | U5b-A UNDERDETERMINED (terminal). A 15-branch REGRESSION blocks measurement                                   |
| the history STEP (what one Ctrl+Z means)    | P-A       | PositionId · publish                | ⚠     | the greenfield target names a declared user action; nothing froze it                                          |
| `timeTravel()` / `jumpTo` / `getHistory`    | —         | static child table                  | KA    | a devtools instrument, explicitly separated from undo. End users never see it                                 |
| `trackHistory` / form history               | P-A       | PositionId                          | LC    | survives in `lib/form-history/` after FORM-DEL; **retained mechanically, not an audited survivor**            |
| merge / branch                              | —         | —                                   | AR    | deferred product question; preconditions MEASURED and DO NOT HOLD                                             |
| write context (`causalMode`)                | P-A · P-B | PositionId · frame commit           | KP    | FROZEN as BEHAVIOUR (caller-supplied, unverified, and it takes effect); OWNER UNPROVEN                        |

### G — observation, tooling, errors

| Feature                                                    | Property | Kernel concepts      | Class | Ledger state                                                                |
| ---------------------------------------------------------- | -------- | -------------------- | ----- | --------------------------------------------------------------------------- |
| `devTools()`                                               | —        | observer adapter     | KA    | MUT-0 hypothesis: a diagnostic projection                                   |
| `createAuditTracker` / `createAuditCallback`               | —        | consequence adapters | KA    | explicitly NOT the same feature as undo (append-only, different authority)  |
| `PathNotifier`                                             | —        | publish              | LC    | **NOT the observation boundary** — ordinary leaf writes produce ZERO events |
| `interceptLeafSignals`                                     | P-B      | frame commit         | LC    | does not wrap a leaf's `.set` at all                                        |
| error authority (`onTreeError`, `SignalTreeRollbackError`) | P-B      | frame commit         | ⚠     | branded factories were RFC 0004 plan-of-record; no 15 derivation ran        |
| `isDev` / dev-only gating                                  | —        | —                    | ⚠     | **blocking GATE B**; "guardrails dead in prod" NEEDS RECONCILIATION         |
| `edit-session`                                             | P-B      | frame commit         | ⚠     | NULL NOT RUN                                                                |
| `security` subpath                                         | —        | —                    | KA    | emits **no** external imports                                               |
| `lazy` / incremental materialization                       | P-F      | static child table   | ⚠     | threshold-driven; unassigned to any layer                                   |

### H — Angular realization and extension

| Feature                                      | Property | Kernel concepts  | Class | Ledger state                                                                                           |
| -------------------------------------------- | -------- | ---------------- | ----- | ------------------------------------------------------------------------------------------------------ |
| `defineStore()`                              | P-F      | observer adapter | KA    | Angular DI integration; owner Angular (realization)                                                    |
| enhancer protocol (`.with()`)                | —        | —                | ⚠     | `.with()` canonical and FROZEN as the only door; post-exposure composition DELETE. **blocking GATE B** |
| marker processor protocol / `core/authoring` | —        | —                | LC    | M1/M2 CLOSED — third-party extension NOT EARNED; no entitlement                                        |
| `@signaltree/authoring`                      | —        | —                | ⚠     | **DOES NOT EXIST.** Phase 2, in progress                                                               |

### I — packages

| Package                  | Class | Ledger state                                                         |
| ------------------------ | ----- | -------------------------------------------------------------------- |
| `@signaltree/events`     | KA    | root emits `zod` only — the neutrality shape the others should reach |
| `@signaltree/guardrails` | KA    | no Angular anywhere                                                  |
| `@signaltree/ng-forms`   | KA    | Angular adapter?; `/audit` is a pure re-export                       |
| `@signaltree/realtime`   | ⚠     | reset to R0 OWNERSHIP; emits `@angular/core`                         |
| `@signaltree/shared`     | ⚠     | version drift flagged; unpublished                                   |

---

## What the map shows

Four readings. All are observations about the map, not findings about SignalTree.

**1. The `KP` rows are shape and lifecycle only.** All ten trace to one of two
places: the frozen shape/access boundary (P-F) or the frozen commit lifecycle,
tree-scoped authority and turn indivisibility. **Not one `KP` row is a
capability feature** — no history, no persistence realization, no collection, no
async, no transaction appears there. That is the shape a kernel is supposed to
have, and it means the capability surface is entirely `KA` / `AS` / `⚠`, which
in turn means **the 15 product is mostly adapter design, and the adapter layer
has had almost no derivation attention.**

**2. `⚠ UNPLACED` is the largest class** — 22 of 64 rows, against 12 `KA`,
11 `LC`, 10 `KP`, 6 `AS` and 3 `AR`. That is the honest state of a derivation
this far from closure, and inflating those into provisional classes would
manufacture exactly the dispositions the method exists to prevent. The count is
the useful number, not a defect to reduce.

**3. Of the six named properties, one is frozen, one has a frozen owner, and
four have no owner at all.** P-F is frozen outright. P-C has a **frozen owner**
(post-commit consequence, tree-scoped) and an unproven realization. P-A, P-B,
P-D and P-E are each named and each falsifiable, and nothing owns any of them.
**A product cannot ship a property nobody owns**, and this is the first document
to say which four those are.

**4. The `⚠` rows cluster.** They are not scattered: they concentrate on
speculation/transactions, member-access identity, and the history step. Those
three are the same region of the design, and the U5b family was the attempt to
open it. The family is exhausted; the region is not resolved.

## Explicitly not decided here

```text
any spelling. Not `features:`, not `tree._.x()`, not any derived access form
whether entityMap survives — DERIVATION E is REOPENED and CHALLENGED
whether identity beyond values is required — the antecedent is UNPROVEN
whether the speculative function survives — U5b is exhausted, not answered
the 15-branch undo regression, which is untouched by design
```

## DECISION REQUIRED

Four questions block placement of the `⚠` rows. Each is a **semantic or product
decision reserved to the human author** — none is a measurement, none is an
archaeology task, and none of them may be settled by running something.

### DR-1 — Which member-access contract does the product promise?

```text
ADDRESS     lookup(k) resolves the CURRENT OCCUPANT of k. Reuse retargets.
            No identity mechanism required.
REFERENCE   an acquired handle follows ONE membership across value evolution and
            REFUSES to retarget after key reuse. Identity required.
```

The ledger's own words: _"NOT decided: which contract is required."_ It also
records that both escapes from needing identity — never-reused keys, or a
domain-level version/server id — are **application** choices, so this is a
product promise, not a derivation.

**What it decides.** Whether P-E's kernel concept is `dynamic structural store`
alone or `dynamic structural store + SubjectId`. It directly places the
member-access row, the two `entityMap` rows and the deferred-completion row; the
remaining collection `⚠` rows wait on DR-2 instead, because they are blocked by
bulk atomicity rather than by identity.

### DR-2 — Does the product promise failed-mutation neutrality (P-B)?

The greenfield target asserts it as acceptance criterion 2c. `U5b-B` closed
`FUNCTION NOT ESTABLISHED` for refusal/failure. Those do not contradict — a
product may promise a property whose kernel function is unestablished — but the
promise has to be made or withheld before anything can own it.

**What it decides.** Whether `transactions()` and the error authority are `KA`
rows with a kernel obligation behind them, or `AR`.

### DR-3 — Is the user-recognizable history step (P-A) a kernel obligation or an adapter obligation?

```text
KERNEL     the canonical turn IS the history step; the kernel carries intention
ADAPTER    the kernel owes only turn atomicity, and an adapter groups turns into
           steps above it
```

The frozen invariants give turn indivisibility and _"causal history owns
meaning"_ — neither settles which of the two above is meant. The greenfield
target proposes a call-site transaction handle delivered **by** the enhancer,
which is the adapter answer, but nothing froze it.

**What it decides.** Whether `PositionId` needs an intention/authorship
companion in the kernel at all. It is the highest-leverage of the four.

### DR-4 — Does the product promise async acceptance/cancellation (P-D)?

The user-supplied framing already contains the conditional — _"if independently
needed"_ — and the ledger agrees the antecedent is unproven. But the deferred
completion is the one shape where the answer is user-visible, and three
scenarios are recorded as `NOT CLEARED`: transaction/undo, persistence, and a
consumer that cannot re-resolve because it never had the key.

**What it decides.** Whether P-D is a property at all, or whether the row should
be struck from the list of six.

---

**DR-1 and DR-4 are two faces of the same shape** (the deferred completion) but
are separately answerable: the product can promise staleness _detection_ without
promising reference _identity_. Answering one does not answer the other.
