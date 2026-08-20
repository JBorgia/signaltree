# SignalTree 15 — Current Architectural Context

**This file is AUTHORITATIVE.** It is the worldview a fresh model — human or
otherwise — should hold before touching anything. It is deliberately compact;
the reasoning lives in [RFC 0016](../rfcs/0016-signaltree-15-candidate-architecture.md)
and [RELEASE-1.0.md](../../RELEASE-1.0.md).

Updated at every architectural closure, in or immediately after the closing
commit. `git show <ref>:docs/architecture/SIGNALTREE-15-CONTEXT.md` reconstructs
the accepted worldview at any point.

## Epistemic hierarchy — read this first

```text
AUTHORITATIVE      this file · frozen invariants · current dispositions ·
                   current frontier · current methodology rules
SUPPORTING         executable falsifier specs · measurements · git commits
HISTORICAL         previous RFC states · SignalTree 14 implementation ·
                   conversation transcripts
NON-AUTHORITATIVE  superseded conclusions · legacy public API · earlier model
                   summaries
```

**Conversation transcripts are the most dangerous input.** This derivation has
made and then withdrawn several confident intermediate conclusions. A transcript
presents *"open extension registration survives the null"* with the same
prominence as the correction that withdrew it three exchanges later. Consult
transcripts for provenance; never for current truth.

### Authority order — when sources disagree

```text
1  a NEW deterministic counterexample: an executable falsifier or observed
   control flow that contradicts a claim
2  frozen invariant / frozen disposition
3  this file
4  current RFC matrix / release controller
5  git history and prior checkpoints
6  conversation transcripts
7  SignalTree 14 code, docs, tests, public API
```

**A lower layer may challenge a higher one only by supplying NEW deterministic
evidence — never by contradiction alone.**

Note the careful shape of (1) versus (2). A *new* executable counterexample can
legitimately reopen something frozen; that is the stated reopen condition. A
*passing legacy test* is not a counterexample — it demonstrates that current code
does what current code does, which is layer 7 wearing a green check.

## North star

```text
Greenfield architecture. SignalTree 14 is EVIDENCE ONLY.
No compatibility requirement. The FUNCTION is the goal, never the form.
```

## Burden of proof

```text
Nothing inherited survives by default.
Legacy may reveal a USE CASE; a function must independently earn existence.
If the function fails, there is NO replacement, form, or "smaller version"
question.
```

The burden is **prove it is necessary** — never *prove the old form is
unnecessary*. The second lets legacy survive by default and has drifted in
before.

## Methodology rules (RELEASE-1.0.md carries them in full)

Each carries the failure that earned it. **A rule can be understood
linguistically and still violated in intent; the scar names the pattern it
defends against.**

```text
0j  subtraction-only; physical deletion follows architectural deletion
      EARNED BY  a deleted mechanism's corpse contaminating the next experiment

0k  "Angular has a primitive" is evidence, not a falsifier — derive the
    FUNCTION before comparing primitives
      EARNED BY  derived() cited as deletion precedent when only a SPELLING had
                 died and the capability was reshaped

0l  legacy mechanisms are evidence repositories, not migration targets
      EARNED BY  the extension audit repeatedly turning public APIs into
                 presumed requirements

0m  DX capability is evidence; DX spelling is not architecture.
    A semantic deletion does not imply a DX prohibition.
      EARNED BY  a derived RUNTIME restriction almost becoming an AUTHORING
                 prohibition

0n  major-version continuity is non-semantic; no internal 14->15 adapter
      EARNED BY  publicness acting as a survival bonus — "it is documented and
                 exercised, therefore the null is harder"

0o  legacy continuity is never a premise; replacement-seeking is prohibited
      EARNED BY  the burden drifting from "prove it is necessary" to "prove the
                 old form is unnecessary", requiring a human to interrupt with
                 "we don't need to keep that"
```

### Provenance — date evidence before weighting it

Last shipped release: **`v14.1.1`**, 2026-08-11. Three buckets, not two:

```text
INHERITED LEGACY       pre-v14.1.1  -> Rule 0o, evidence only
15-EFFORT, GATE A      post, frozen -> frozen by THIS effort; deterministic
                                       counterexample to reopen
15-EFFORT, NOT FROZEN  post, unreviewed -> MOST scrutiny; may serve a design the
                                       derivation has since deleted
```

49 non-spec production files postdate the release; 26 are GATE A kernel.
`transactions` and `tree-capabilities.ts` are 15-effort and were cited in closed
rows as inherited evidence — the conclusions stand (both delete-direction) but
**a 15-effort artifact must never be cited as evidence that a practice is
established.**

Per-row provenance for the OPEN rows, measured as churn since `v14.1.1`:

```text
entity-map.ts        13+/5-      of  471   ~97% inherited
entity-signal.ts     1872+/353-  of 2970   ~63% POST-RELEASE  <- the real
                                            implementation behind entityMap
stored.ts            211+/120-   of 1003   ~21% churn
linked.ts            unchanged   of   82   pure legacy — 0o applies cleanly
readonly.ts          0+/75-                 deletions only (STATUS-DEL)
serialization.ts     83+/16-     of 1352
materialize-markers  98+/18-     of  725
```

**The `entityMap` row is majority 15-effort work**, which `entity-map.ts`'s
13-line churn conceals. Audit it in three buckets from the start.

Standing measurement discipline, each earned by a real failure in this audit:

```text
migrate FUNCTIONS, not markers      a fixture choice can manufacture evidence
a lexical hit is neither presence   runId missed by vocabulary; getTurnStatus
  nor dependency                    and entity.status counted falsely
colocation never establishes        plannedSignalTree · status · entity-loader ·
  ownership                         asyncQuery — four instances
measure where the behaviour lives   a 102-line re-export manufactured a false
                                    absence
one hook serving N consumers is     separate consumer requirements before
  not one function                   assigning ownership
regression coverage confers no      only an architectural falsifier for a frozen
  survival                          claim has standing
```

## Frozen invariants — do not re-derive

```text
SignalTree owns truth · Angular owns observation · causal history owns meaning
PositionId != SubjectId != SlotIndex != key/path
PREPARE -> PRIVATE COMMIT -> PROJECT -> PUBLISH -> CONSEQUENCE
atomicity is externally observable coherence, not a revision count
durability authority is TREE-SCOPED; unresolved scopes hold consequences;
  foreign-tree scopes never interfere
a rollback REFUSAL is not a success — surviving truth FLUSHES
the derived projection contract (RFC 0015), in full
```

GATE A is SATISFIED; the kernel is frozen at `4f7a2169`.

## Current matrix

```text
derived projection contract   FROZEN (RFC 0015)
status                        DELETE — physically gone
asyncSource / asyncQuery      DELETE — frozen, still physically present
.with() / post-exposure       DELETE — function has no surviving use case
  composition
feature -> feature dependency DELETE — zero measured
substrate requirement         INTRINSIC to declaration kind; no public
                              protocol earned
generic declaration identity  NOT EARNED — cardinality differs per function
M1/M2 third-party extension   CLOSED — NOT EARNED
  registerMarkerProcessor       legacy mechanism, no entitlement
  MarkerProcessor               no survival basis
  registry perf questions       MOOT
entity-loader cache           no SignalTree ownership earned; PARKED pending
                              entityMap
M3 snapshot/representation    ANSWERED — a realized value's state IS
                              identifiable by a uniform rule: IT IS WHAT THE
                              ACCESSOR RETURNS. The hook exists only where a
                              declaration kind declines to conform, and its one
                              implementer's non-conformance is a shape accident,
                              not a property of collections: entityMap's accessor
                              is a bare non-callable OBJECT while every other
                              position is a signal, and `stored` proves in this
                              codebase that methods ride on a callable signal.
                              snapshot hook + `{all:[...]}` envelope: DELETE
                              candidates. "Declaration kinds own their
                              representation": NOT EARNED. Derivation result, NOT
                              a landed change — conformance has real blast radius
                              (time-travel.ts:2030 reads `child.all`).
M4 reconstruction             ANSWERED — YES, by a uniform rule. The
                              representational half dissolves under M3
                              conformance (asyncSource proves it on a gradient:
                              CALLABLE, src() already returns the value its hook
                              re-wraps, failing only isSignal — hooks track
                              DISTANCE FROM A SIGNAL). The ownership half is
                              itself uniform: both predicates reduce to
                              `mode === 'rehydrate' && owns-a-live-source`. The
                              PROPERTY decides, not the kind — a loaderless
                              collection accepts, the same kind with a loader
                              declines — and the MODE decides, not the data:
                              identical bytes apply under `transfer`. And both
                              triggers are DELETE candidates (asyncSource frozen;
                              entityMap's `load` comes from loader(), Outcome A),
                              so the predicate can never fire. hydrate hook:
                              DELETE candidate. Mode-dependence is REAL and is
                              evidence to CARRY, not a hook to keep.
entity-loader ownership       CLOSED — Outcome A already found no SignalTree
                              cache/freshness function, parked only pending
                              entityMap. entityMap now SURVIVES independently, so
                              the park lifts and the verdict stands. A3
                              (tree-scoped registry-free addressing of policy
                              holders) remains the one un-run remainder.
M5 decision observability     DELETES. Measured, not grepped: every
                              reconstruction path exercised with a listener
                              attached (rehydrate+loader, transfer, rehydrate
                              without loader, merge, restore/undo) emits a SINGLE
                              POINT — decision 'declined', reason
                              'loader-owns-source', mode 'rehydrate'. Its two
                              call sites are exactly the predicates M4 showed can
                              never fire. Half the declared vocabulary
                              ('normalised', 'no-request-survives-boundary') is
                              STATUS-DEL residue describing a mechanism that no
                              longer exists. onHydrateDecision and friends:
                              DELETE candidates. The DX insight — a silent
                              refusal is a real failure — is kept as EVIDENCE and
                              does not earn a reporting bus ahead of a decision
                              to report.
collections FUNCTION          **SURVIVES** — dynamic membership + granular
                              observation over CANONICAL truth. First positive
                              result in the audit. Each ordinary alternative
                              misses exactly one axis: an array lacks
                              granularity, a record lacks membership (fixed at
                              construction; no write path reopens it), app-held
                              signals lack canonicality (E5 PATH A).
collections FORM              **DERIVED — E CLOSED.** All 31 public members
                              accounted for. Five are the minimum: addOne,
                              removeOne, byId, byIdOrFail, ids. Seven are derived
                              projections (all count empty asMap find where has).
                              Thirteen are bulk/convenience — atomicity across
                              them belongs to the TRANSACTION KERNEL, not the
                              collection. `changeId` was recorded as EARNED
                              and is **WITHDRAWN**: the row proved it behaves
                              differently from remove+add, never that any
                              workflow REQUIRES a held reference to follow — and
                              the behaviour it measured REVERSES shipped 14.1.2
                              (ST2031 "resolves undefined and always will", added
                              by 80f41e94 WITH rationale, removed by b47598a1
                              with an EMPTY BODY). Only the five minimum members
                              are established; E's positive verdict is confined
                              to the FUNCTION. Ordering is a real function the
                              zero-state under-derived, but the intrinsic order
                              is WEAKER than an ordinary array of keys (no move /
                              reorder / sort / swap; only setAll, which rebuilds
                              membership) — so `prepend*` are membership ops and
                              ordering belongs to the application. activeId /
                              activeEntity / setActiveId / clearActiveId: NO
                              FUNCTION — the docblock records them as elf/Akita
                              feature parity and names its own alternative, and a
                              plain position + byId gives IDENTICAL granularity.
                              tap: no function — the pull surface already
                              delivers it (O(width) diff vs O(delta) push is FORM
                              pressure). intercept: no function — a write-path
                              guard is the same category error as status, and its
                              async form FAILS OPEN (public type invites
                              `Promise<void>`; call sites never await).
subject-identity substrate    AUDITED — SOUND. Entirely third-bucket
                              (post-2026-08-11, empty commit bodies, planRekey
                              revised 3x in 4 days). No aliasing on key reuse;
                              collision/self/missing policies safe; undo lands
                              consistent. ONE CONFINED DEFECT: after `changeId`
                              the member's own `id` field disagrees with its
                              slot. Load-bearing — it is the stated reason
                              `setOne(entity)` cannot exist. OPEN form question.
stored                        NOT EARNED, both halves. INBOUND: reading the
                              store in the state literal reaches it completely,
                              and {version, migrate} is a spelling for a branch
                              the read path already expresses. OUTBOUND: the
                              ordinary effect null is STRICTLY BETTER — it is
                              already durable after set(), while the debounced
                              incumbent leaves the store EMPTY until flush(), and
                              `debounceMs: 0` is exactly the null. So flush(),
                              the page-hide drain and flushAllStoredSignals()
                              repair a hazard the DEBOUNCE introduced. Coalescing
                              is the one thing the null misses and is PERFORMANCE
                              -> form pressure. Verdict is about ownership in a
                              greenfield architecture, NOT about the shipped
                              13.3.0 work, which is a real fix to a real bug. It
                              also disposes of the stored() traversal-invisibility
                              defect rather than requiring a fix. NOTE: stored's
                              `{__v, data}` envelope IS load-bearing (migrate
                              dispatches on __v) — do not over-generalise M3.
linked                        NOT EARNED. A 4-line pass-through to Angular's
                              `linkedSignal`; "derived-but-writable" is ANGULAR'S
                              function. The null holds at runtime on both call
                              forms, and writability at the type level comes from
                              ProcessDerived, not from `linked`. It DID fail once:
                              Angular's overload lets `equal` participate in
                              inference so V collapses to `unknown`, while
                              LinkedOptions annotates `NoInfer<V>` — the first
                              incumbent in this audit to contribute something the
                              null missed. But `linkedSignal<S,V>({...})` with
                              explicit type arguments recovers it exactly, so the
                              contribution is an ANNOTATION SAVED, not a behaviour
                              gained. Rule 0m -> DX pressure, not a derivation.
serialization                 NOT EARNED for its core function, and it CLEARS
                              the M-cluster cut. F1 is not satisfied by `tree()`
                              alone — the snapshot's freeze is per-node and does
                              not reach leaf values, so an array leaf aliases
                              live state (documented utils.ts:462-486, pinned by
                              snapshot-aliasing.spec.ts, deliberately unfixed on
                              measurement: +54us vs 1.0us on 50k, and freeze
                              cannot stop Date.setFullYear/Map.set/Set.add). A
                              codec's COPY is the boundary. F2 is `tree(payload)`.
                              F3 is ordinary app data and `nodeMap` is REDUNDANT
                              (the target tree knows its own shape). F5 is free —
                              the snapshot is a plain JS value; the limit is the
                              transport. Derived is already absent from the
                              snapshot, so no exclusion mechanism is needed.
                              Cycles ARE reachable via an array leaf — a real
                              constraint on codec choice, not a SignalTree
                              function.
  ** M3 IS NOW A SYSTEM THEOREM ** the collection's `{all:[...]}` envelope and a
                              BARE ARRAY reconstruct identically across a JSON
                              process boundary, with versioning and a sibling
                              plain position present. The envelope carries no
                              reconstruction information the bare value lacks.
readonly / diagnostics        OPEN — after the cut, per the agreed sequence
final authoring grammar       DEFERRED to one system-wide DX pass
```

## Current frontier

**M3 — snapshot / representation. ANSWERED.** The question is *not* "does a snapshot hook
survive" but **"is a realized value's state identifiable by a uniform rule?"**

Consumer separation is DONE: there are not six requirements. Four entry points
share one memoised representation, devtools adds a transform it owns, and
`stored` is not a consumer at all — it conforms to the ordinary signal protocol
and appears in the representation as a plain value with no hook. So the hook can
no longer be defended by divergent consumer needs.

**Mechanism question ANSWERED.** The walk decides by three guards —
`DERIVED_STAMP`, `isSignal`, `isNodeAccessor`. `stored` conforms (`isSignal` is
true) and needs no hook. `entityMap` satisfies NEITHER guard, so the hook is
absorbing a SHAPE mismatch, not expressing representation semantics. The codebase
contains the precedent: `stored` had the identical defect and was fixed by
conformance, not by a hook.

**RESOLVED — see RFC 0016 § M3.** The reading recorded here previously (that
E's closure would fire the second branch) was **refuted by its own measurement**.
It was labelled unmeasured, which is why it cost a correction rather than a
retraction. The first branch fires: E derived the collection's form as a set of
MEMBERS (`byId`, `ids`, `addOne`, `removeOne`, `changeId`), and members ride on a
callable signal — `stored` does exactly that in this codebase today.

**M4 is measured and SPLIT** (RFC 0016 § M4) — its representational half
dissolves under M3, its ownership half survives but cannot resolve alone.

**Next frontier: ENTITY-LOADER OWNERSHIP.** It was parked pending `entityMap`;
`entityMap` is now closed, and M4's surviving half depends on it. Both hydrate
declines protect a loader's authority — if the loader earns no ownership, there
is no competing authority and the decline has nothing to protect.

## Deferred DX pressures (Table G) — capability, never spelling

```text
compose named projections naturally        semantics do NOT forbid it
declare optional behaviour concisely       semantics do NOT forbid it
reusable third-party typed abstraction     PRESERVED via composition
inline colocated tree API                  pressure remains; no entitlement
commands / `_`                             N/A — no function earned
```

**Frozen spellings: none.** Not `features:`/`extensions:`/`using:`, not
`tree._.x()`, not any `derived` access form.

## Published-surface drift — a NAMED cross-cutting finding

Three independent derivations turned up the same shape: **a published type
describes behaviour that cannot happen.**

```text
InterceptContext.blocked / blockReason        observably always false
InterceptHandlers => void | Promise<void>     async guard FAILS OPEN
HydrateDecision 'normalised' + its reason     never emitted; STATUS-DEL residue
```

The first two are inherited legacy drift; the third is drift **this effort
created**, by deleting `status` and leaving its vocabulary. So: deletion is not
complete when the mechanism is gone, only when the vocabulary that described it
is gone too.

All three were invisible to reading and obvious to a test. Any surface carried
into 15 needs an executable check that every declared member is reachable and
every declared signature does what it says — three of three probed surfaces had
drifted.

## Typechecking — what is gated, and what is not

```text
typecheck:source   tsc -p tsconfig.typecheck-all.json    strict, ALL package +
                   demo source, EXCLUDES **/*.spec.ts            0 errors
typecheck:typing   tsc -p core/tsconfig.typecheck.json   ONLY *.typing.spec.ts
                   and enhancers/typing/**                       0 errors
```

Ordinary `.spec.ts` files are typechecked by **no** gate, by design — the
`*.typing.spec.ts` convention exists so type-level assertions get gated. **Any
derivation resting on a compile-time claim must put it in a `*.typing.spec.ts`
file**, or it is unverified: vitest does not typecheck.

Do not point `tsc` at `packages/core/tsconfig.spec.json` and read the result as
debt — nothing runs that config, and it reports 853 errors across 85 files. That
mistake was made here once already.

## Self-inflicted necessity — a NAMED cross-cutting finding

**A mechanism creates the problem that justifies its own machinery.** Three
instances, distinct from published-surface drift:

```text
M3 envelope   `{all:[...]}` exists so a bare array can be told apart from the
              snapshot shape — an ambiguity that exists only because it does
stored        the debounce creates a non-durable window; flush() + page-hide
              drain + flushAllStoredSignals() close it. debounceMs: 0 has no
              window and needs none of them
entityMap     the snapshot hook exists because the walk must guess which member
              is state — a guess that exists only because the accessor is not a
              signal
```

In each case the machinery is *correct*, and what it corrects was introduced one
layer down. **Never ask "is this machinery right?" — ask "what made it
necessary?"** If the answer is another SignalTree choice, both can leave together.

## Provenance applies to BEHAVIOUR, not only to code

Dating a mechanism is not dating its semantics. The `SubjectId` machinery was
correctly classified third-bucket and audited; the **behaviour it produces** was
never checked against what ships — and it reverses a documented shipped decision
(`changeId` + ST2031). A positive derivation verdict was built on that reversal
and had to be withdrawn.

**Before treating a measured behaviour as evidence of a function:**

```text
npm view @signaltree/core versions --json      git tags are NOT the record —
npm view @signaltree/core time --json          14.1.2 shipped with NO tag
npm pack @signaltree/core@<latest>             then read package/dist/*.js
```

HEAD is not what users have, and `main` is not either — the 14.1.2 version bump
was never committed, so `main/package.json` still reads 14.1.1.

## Do not reopen without a deterministic counterexample

```text
GATE A and every frozen invariant above
the RFC 0015 derived projection contract
any disposition recorded as frozen in RELEASE-1.0.md
```

*"Should we preserve X because 14.x had it?"* is not a valid question and is
answered mechanically by Rule 0n/0o.
