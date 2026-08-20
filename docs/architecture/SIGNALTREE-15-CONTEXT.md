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
                              tap: DELETION WITHDRAWN. Event identity is NOT
                              reducible to resulting state — add-then-remove and
                              1->2->1 both leave the final state unchanged while
                              tap sees both events, and a `computed` diff is
                              pull-based so it cannot guarantee a read between
                              mutations. The function EXISTS; its OWNER is
                              undecided, and the kernel-scope null (undo already
                              records per-turn effects at tree scope) is UNRUN.
                              intercept: no function — a write-path guard is the
                              same category error as status, and its async form
                              FAILS OPEN. That deletion STANDS.
subject-identity substrate    AUDITED — SOUND. Entirely third-bucket
                              (post-2026-08-11, empty commit bodies, planRekey
                              revised 3x in 4 days). No aliasing on key reuse;
                              collision/self/missing policies safe; undo lands
                              consistent. ONE CONFINED DEFECT: after `changeId`
                              the member's own `id` field disagrees with its
                              slot. Load-bearing — it is the stated reason
                              `setOne(entity)` cannot exist. OPEN form question.
stored                        NOT EARNED, both halves — on CORRECTED reasoning.
                              The claim "the null is strictly better" is
                              WITHDRAWN: the old outbound null wrote from an
                              effect() needing a tick, so it proved "durable after
                              a tick", a weaker contract than the incumbent was
                              judged against. Re-run against a genuinely
                              synchronous write, the null satisfies the contract
                              and so does `debounceMs: 0`, while the default
                              debounce does not. The incumbent DOES reach a third
                              point the naive nulls miss — 20 sets to ONE write,
                              durable on demand via flush(). An app can write that
                              too (timer plus drain), so DX not function, but the
                              trade was misdescribed. INBOUND: reading the
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
                              F3 is ordinary app data and `nodeMap` shows no requirement
                              for reconstruction into an ALREADY-COMPILED target
                              topology (the tree knows its own shape). F5 is free —
                              the snapshot is a plain JS value; the limit is the
                              transport. Derived is already absent from the
                              snapshot, so no exclusion mechanism is needed.
                              Cycles ARE reachable via an array leaf — a real
                              constraint on codec choice, not a SignalTree
                              function.
  M3 STRENGTHENED, NOT PROVEN the envelope and a bare array reconstruct
                              identically across a JSON boundary, so crossing a
                              process boundary adds NO representation
                              requirement. But the bare array is accepted by
                              entityMap's OWN hydrate hook (entity-map.ts:386-388,
                              `Array.isArray(value) ? value : value.all`) — the
                              mechanism M4 would delete. It proves the envelope
                              carries nothing the CURRENT hydrate needs; it does
                              NOT prove a collection with no specialization can
                              reconstruct by the uniform rule. The mechanism under
                              sentence cannot be its own equivalence proof — same
                              error class as the changeId reversal.
  M3/M4 PHYSICAL DELETION     **BLOCKED**, but the blocker MOVED. The
                              conforming-collection prototype RAN
                              (conforming-collection-prototype.spec.ts, no marker
                              anywhere) and established SIX properties: read,
                              membership, granularity, representation with NO
                              envelope, reconstruction with NO hydrate hook, and
                              a full JSON round trip. The 7th, canonicality, is
                              unmeasurable here because of a 15-branch UNDO
                              REGRESSION (below). So the remaining blocker is the
                              regression, not the theorem.
  FRONTIER UNDO ENGINE        DERIVED (option 3 — derive before touching). Its
                              RETENTION justification is REFUTED on measurement.
                              bench-retention-arms, 10k x 50, 3 runs each:
                                arm      snapshot(main)   frontier(branch)
                                scalar   0.112-0.127      0.189-0.191   1.6x worse
                                sameRow  3.951-3.960      3.959-3.961   PARITY
                                allRows  23.045-23.046    88.344-88.352 3.83x worse
                              sameRow is decisive: ONE row of 10,000 updated 50x
                              should retain the DELTA under effect-level
                              recording; it retains the whole N-pointer array at
                              ~8.3 bytes/pointer, identical to snapshots. So the
                              engine pays snapshot cost narrow and 3.83x wide,
                              REFUSES non-scalar leaf undo, and costs ~5,000 lines
                              against an 885-line predecessor that satisfies U1-U5
                              and handles arrays/Date/Map/Set.
                              UNMEASURED and still able to earn it: E2 precision,
                              E3 scoped undo, E4 explicit transaction grouping
                              (6be8d3e2). No claim the engine is worthless — only
                              that its stated motivation is not delivered.
                              CORRECTED FRAMING (5 corrections, RFC 0016):
                              (1) REVERT is NOT a permitted disposition — that is
                              Rule 0l. If none earns: DELETE the realization, then
                              DERIVE the minimum from zero. The 885-line engine is
                              an equivalence WITNESS, not a destination.
                              (2) The RETAINER IS NOT ATTRIBUTED. A width-dependent
                              signature was measured, not a mechanism; the 23-vs-88
                              gap actually favours MULTIPLE retained
                              representations over one inefficient one. Heap-
                              retainer attribution is OWED.
                              (3) U5 splits: U5a history-step grouping (14.x
                              plausibly satisfies) vs U5b explicit transaction
                              semantics (not established, different contract).
                              The null was built to U5a and scored against U5b.
                              (4) Motivation cannot be reconstructed from
                              empty-bodied commits — "candidate advantage not
                              delivered", not "justification refuted".
                              (5) NEW FRACTURE LINE: causal/turn semantics may be
                              SEPARABLE from confirmed-undo storage. They have been
                              treated as one thing because COLOCATED. Turn
                              identity, authorship, speculation/confirmation and
                              atomic grouping may survive while the effect-level
                              retained log, reversal planner and current realizer
                              delete — which would unblock collection canonicality
                              WITHOUT repairing applyTurnEffects.
                              E2 DOWNGRADED — its null is falsified TWICE.
                              (a) ABA: `current === turn.after` infers authorship
                              from VALUE EQUALITY. With later out-of-stack work
                              B->C->B, the rule reverts to A and DESTROYS surviving
                              truth; correct answer is a no-op leaving B. The
                              snapshot null cannot reach it — who wrote the current
                              value is not in the values.
                              (b) the P3 repair spreads patch() over the retained
                              root, so a nested path replaces its parent branch and
                              siblings vanish (profile.age -> undefined).
                              E2-A settled: the public surface has NO selective
                              per-turn reversal (undo/redo/canUndo/canRedo/
                              getHistory/resetHistory/jumpTo/getCurrentIndex), so
                              P2 is E3's question and is REMOVED from E2. P1 and P3
                              stay — both LIFO.
                              HISTORY REWRITING is NOT EARNED: B DID exist, so
                              factual history (T2 observed B->C) must be
                              distinguished from effective reversal baseline
                              (A->C). Layering sharpens to causal / evidence /
                              reversal-representation / physical.
                              EARNED THEOREM, narrow: semantic precision needs
                              causal information, and P3 gives NO evidence that
                              information must be stored as the confirmed undo
                              payload. NOT "confirmed undo can use snapshots".
                              reversal-planner NOT upgraded to delete candidate.
                              E2-C DONE. The modelled P3 contract is NOT FROZEN
                              anywhere — it was a proposed semantic, and building a
                              null to it repeated the assumed-contract failure.
                              REAL behaviour: a pending write is visible in truth
                              but adds NO history entry; confirm() historicises;
                              rollback of a superseded pending turn changes neither
                              truth nor history; confirmed undo -> 'B'; redo ->
                              'C'; the nested variant preserves the untouched
                              sibling. So 'B' is exactly what the "naive" snapshot
                              null gave — the two representations are
                              INDISTINGUISHABLE and P3 DISTINGUISHES NOTHING.
                              ABA on the real kernel also reverts to 'A',
                              destroying a live pending turn's contribution, so the
                              effect log does NOT carry authorship either.
                              ReversalEffect consumes owner/before/after/path/
                              ownerPath (all snapshot-derivable; the docblock says
                              path is "not semantic identity") plus subjectId and
                              structural, which are not. WHO decides T1 stops
                              contributing? NOBODY — measured; the decision is not
                              made anywhere.
                              STILL NOT UPGRADED: precision-eliminates-effect-
                              retention NOT PROVED; reversal-planner UNPROVEN.
                              What narrowed: the remaining justification reduces to
                              TWO fields — subjectId (necessity already WITHDRAWN
                              via E-REKEY) and structural (reduces to the same
                              rekey question). NOT licensed: "snapshots are
                              sufficient" — this is EQUIVALENCE on two scenarios
                              whose contract is unspecified, not correctness.
                              CORRECTED: `structural` does NOT reduce to rekey —
                              that half is WITHDRAWN (it let one row sentence a
                              whole mechanism). Enumerated: StructuralEffect =
                              'add'|'remove'|'rekey', PLUS structuralContext
                              ("durable canonical history... required to realize
                              this existence transition after the original
                              mutation context is gone") and subjectPositions
                              (positions supplying payload to realize add/remove
                              "without becoming independent value participants").
                              COVERAGE-vs-PARTICIPANT is a distinction a value diff
                              cannot express, independent of rekey. E-REKEY killed
                              ONE justification for SubjectId, NOT subject-lifetime
                              identity.
                              The invented P3 theorem (undo T2 => A) is STRUCK from
                              the frozen set — measured behaviour is C->B, and a
                              requirement for 'A' is UNPROVEN. If pending surviving
                              truth SHOULD survive confirmed undo that is a NEW
                              requirement which must earn itself.
                              E4 is UNBLOCKED. E2-S and E4 are INDEPENDENT rows.
  E2-S DONE — POSITIVE       The FIRST measured capability canonical before/after
                             truth cannot reproduce, INDEPENDENT of rekey. Same key,
                             same value, opposite identity outcome: UNDO of a remove
                             REVIVES the original subject (held ref -> 1) while an
                             ordinary RE-ADD leaves it DEAD. And key reuse across
                             undo does NOT alias in the real system, whereas the
                             subject-free null (array leaf + memoised byId) DOES —
                             a reference held to the second subject reports the
                             first subject's 111.
                             DOWNGRADED — the experiment EMBEDDED its contract.
                             "held must refer to the restored original subject" was
                             an ASSUMPTION, never established; nothing says a handle
                             obtained before removal must survive removal at all.
                             Same class as the invented P3 theorem. The subject-free
                             null also bakes in a key-cached handle contract, so
                             refuting it refutes THAT null for CURRENT entityMap
                             reference semantics — not canonical truth's sufficiency
                             for an independently required function.
                             Rule 0n applies to SIX-DAY-OLD code: observing
                             SubjectId behaviour does not earn SubjectId.
                             CORRECTED: current subject-generation distinction
                             MEASURED; value-only key-cached null REFUTED for
                             reproducing it; subject-lifetime identity as a V15
                             REQUIREMENT **UNPROVEN**.
                             ALSO RETRACTED: "coverage-vs-participant is a
                             distinction a value diff cannot express" — true
                             representationally, semantically UNPROVEN.
                             NEXT IS NOT "effect log vs identity beside snapshots"
                             (that assumes identity survived). It is E2-S0:
                             Contract A (handles are membership-lifetime refs;
                             revive on undo; never alias) vs Contract B (handles
                             observe current keyed membership; removal permanently
                             invalidates; undo requires reacquisition). What
                             capability exists under A that is IMPOSSIBLE under B?
                             Then: minimum identity property, THEN carrier —
                             candidates include SubjectId, per-key generation
                             counter, opaque membership token, slot+incarnation.
  E2-S0 DONE                 THREE contracts, not two — E2-S's null was the third.
                             Q1: the identity-free contract (B') is HARMFUL — a
                             handle to tmp-1@111 reads 999 after key reuse. Not
                             stale, WRONG, silently. Q2: contract B is NOT
                             identity-free either — remove then identical re-add
                             gives byte-identical values, so no value-only rule can
                             invalidate. So IDENTITY BEYOND VALUES IS REQUIRED —
                             the first thing here earned as a FUNCTION rather than
                             observed. Its MINIMUM is a PER-KEY GENERATION: a Map, a
                             counter and one revision signal, no SubjectId, no
                             reclamation, no effect log. Q3: NOTHING requires
                             revival over reacquisition — an ordinary Angular
                             projection re-derives from its key automatically after
                             a restore, and a captured handle carries its key so it
                             can always reacquire. B costs a reacquisition, not a
                             capability.
                             NOT EARNED: subject-lifetime identity, reclamation
                             coordination, revival-on-undo, SubjectId as carrier.
                             NOT established: that revival is worthless.
  E2-S0 DOWNGRADED — LAYER LEAK. It built candidate semantics from signal/computed
                             and let TWO ANGULAR construction findings into the
                             architectural record. Demoted to test-infrastructure
                             evidence; the computed-in-computed one is explicitly
                             NOT generalized (Angular permits a computed depending
                             on a computed — one ephemeral construction failed).
                             Rule: neutralize dependency, don't genericize Angular
                             — and don't use Angular to PROVE the null.
                             THREE overclaims corrected: (1) "identity beyond
                             values is REQUIRED" -> CONDITIONAL; "wrong-row read"
                             presupposes lookup means "the member that occupied k
                             when I acquired this", and under ADDRESS semantics the
                             retarget is CORRECT. (2) "per-key generation is the
                             MINIMUM" -> sufficient-in-model only; a global
                             monotonic incarnation token is a rival and may be
                             smaller, since the per-key map retains an entry for
                             every key ever seen — which is itself lifetime
                             pressure, so "reclamation not earned" was premature.
                             (3) Q3 -> "no capability requiring revival was found in
                             the EXERCISED shapes"; and "a handle carries its key"
                             is itself a design choice.
  E2-S00 DONE (KERNEL)       e2s00-member-access.kernel.spec.ts, 8 rows, ZERO
                             framework imports. No exercised shape is IMPOSSIBLE
                             under ADDRESS: keyed observation, selection, callback-
                             by-key all expressible, and retarget-on-reuse is
                             correct rather than aliasing. The deferred completion
                             is the only shape where retargeting is observable, and
                             staleness is DETECTABLE with no identity mechanism —
                             canonical members are immutable, so a reference
                             compare against the captured member returns STALE.
                             NOT CLEARED: transaction/undo, persistence, and a
                             consumer that cannot re-resolve because it never had
                             the key. So the antecedent is UNPROVEN.
                             ARCHITECTURE: address-based observation and identity-
                             bearing reference are SEPARABLE APIs — if a stable
                             membership reference ever earns itself it need not be
                             the lookup.
  E2-S00-D                   The address null had a HIDDEN IDENTITY MECHANISM:
                             `c.at(k) !== captured` is JS OBJECT IDENTITY. So it
                             showed "address + retained object-ref identity", not
                             "address + values". And since patch is immutable, an
                             ordinary update replaces the object too — so the guard
                             reports STALE for BOTH same-member-evolution and
                             different-member-key-reuse. INDISTINGUISHABLE.
                             Contract A is not merely conservative: measured over
                             three edits it returns STALE/STALE/STALE, so a save on
                             a row the user keeps editing NEVER LANDS.
                             WITHDRAWN: "retained identity would make that more
                             convenient, not possible." If Contract B is required
                             (follow the same membership across value evolution,
                             reject key reuse) then identity IS required and
                             address+value+object-ref cannot supply it.
                             NOT decided: which contract is required. Two escapes
                             keep identity unearned, both APPLICATION choices —
                             never-reused keys (uuid rather than recycled), or a
                             domain-level version/server id.
  NEUTRALITY IS THREE GUARDS framework-neutral =/= legacy-neutral =/=
                             assumption-neutral. WITHDRAWN: "framework-neutral was
                             the first null that couldn't encode incumbent
                             semantics." The neutral spec still imports unearned
                             assumptions: members are IMMUTABLE, key reuse MATTERS,
                             deferred work SHOULD detect replacement, a lookup can
                             sensibly be ADDRESS-based.
                             NOTE an attribution error caught by measurement: an
                             earlier draft claimed the revival was "merely
                             resolve-on-read" and would also happen on re-add. It
                             does not.
                              (superseded) E2 first pass claimed write-set
                              precision IS snapshot-derivable
                              (P1 reverts the touched position and leaves
                              unrelated later truth; P2 correctly no-ops once a
                              successor owns the position). SEMANTIC precision
                              under speculation is NOT reachable by diffing
                              adjacent roots — P3 (T1 pending A->B, T2 confirmed
                              B->C, rollback T1, undo T2) lands on B, not A. The
                              missing ingredient is NOT a storage representation
                              but a DECISION: rollback must stop a dead turn's
                              contribution being anyone's baseline. ~10 lines of
                              history rewriting make the snapshot null pass P3 and
                              redo. So precision no longer justifies effect-
                              retained history; reversal-planner becomes a DELETE
                              CANDIDATE pending E4/E3. CAVEAT: P3 is a MODEL of the
                              speculation contract, not the shipped
                              transactions/rollbackPendingTurnAt path — re-run
                              against the real mechanism before acting.
                              ORDER: PRE-E2 (is undo storage separable from causal
                              reasoning?) -> E2 precision -> E4 at U5b -> E3, and
                              E3 only after asking whether scoped undo survives its
                              own null. E2's null is NOT restoreState(entry.state):
                              snapshot STORAGE is not snapshot RESTORATION — a
                              snapshot history can retain full roots while undo
                              computes a targeted delta by diffing adjacent roots
                              under structural sharing.
  UNDO REGRESSION (15)        `isSupportedEffect` (time-travel.ts:1680-1694, from
                              06785300 — the SubjectId commit) refuses any
                              NON-SCALAR leaf effect: arrays, Date, Map, Set,
                              object leaves. `tree.undo()` THROWS "Unsupported
                              scoped undo effect at rows". The identical scenario
                              PASSES on main/14.x. GATE-RELEVANT.
  DERIVATION E REOPENED       E's granularity row measured NAIVE WHOLE-ARRAY
                              REPLACEMENT (`rows.set([{a},{b}])` — fresh literals
                              for both). Under REFERENCE-PRESERVING update
                              (`c.map(r => r.id===id ? {...r,...ch} : r)`) plus a
                              memoised per-key computed, an ordinary array IS
                              granular. The conjunction was the SOLE argument for
                              the collection function surviving, so E's positive
                              verdict is CHALLENGED — not overturned, because the
                              canonicality leg is unmeasurable here. NOTE: byId
                              via find() is O(n) vs entityMap's O(1) Map — a FORM
                              pressure at 10k-50k widths, not a function
                              difference.
                              Remaining theorem: can the earned collection
                              semantics be realized through a uniform accessor
                              read/write contract with NO snapshot/hydrate
                              specialization? The prototype must NOT be built on
                              entityMap underneath.
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
