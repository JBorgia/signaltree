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
presents _"open extension registration survives the null"_ with the same
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

Note the careful shape of (1) versus (2). A _new_ executable counterexample can
legitimately reopen something frozen; that is the stated reopen condition. A
_passing legacy test_ is not a counterexample — it demonstrates that current code
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

The burden is **prove it is necessary** — never _prove the old form is
unnecessary_. The second lets legacy survive by default and has drifted in
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

## RULE 0p — NULL ADMISSIBILITY (same level as the zero-legacy rule)

> **A null must falsify an INDEPENDENTLY EARNED contract. It may not define that
> contract by the distinctions it chooses to preserve.**

This is not test guidance. It determines whether an experiment is
**architecturally admissible at all**. An inadmissible experiment produces
evidence that cannot be used, however green it runs.

### The ordering this rule imposes

```text
candidate function
      v
independent contract
      v
OPPOSITE contract
      v
PREMISE ATTACK
      v
ONLY THEN null construction
      v
measurement
      v
PREMISE ATTACK on the interpretation
      v
architectural conclusion
```

The audit stops being _"build a null and see whether it works"_ and becomes
_"first prove there is something legitimate for a null to falsify."_ That is the
guard whose absence explains nearly every error below.

### Why this exists

Every significant error in the frontier/collections derivations had one shape: the
incumbent _mechanism_ was removed while one of its semantic _assumptions_ stayed
embedded in the null. The null came back green because it was built to answer a
question whose answer it already partly encoded.

```text
P3          assumed undo must produce A            -> invented contract
tap         sampled after every mutation           -> STRONGER observation than any
                                                      real consumer
stored      used TestBed.tick()                    -> WEAKER durability timing than
                                                      the incumbent it judged
rekey       remove+add                             -> answered a weaker identity
                                                      question
E2          `current === after`                    -> value equality substituted
                                                      for authorship
E2-S        "held reference must revive"           -> incumbent handle semantics
                                                      became the requirement
E2-S0       retargeting called "wrong-row"         -> reference semantics became
                                                      the requirement
E2-S00      object-reference compare               -> identity reappeared INSIDE
                                                      the identity-free null
computed    framework realization                  -> leaked into kernel evidence
```

Executable falsifiers reliably catch _"the implementation doesn't do what we
thought."_ They cannot catch _"we never established it should do what the test
asserts."_

## PRE-REGISTRATION — complete BEFORE any null is implemented

```text
FUNCTION                 stated without incumbent nouns
INDEPENDENT CONTRACT     what must be POSSIBLE — not what currently happens
OPPOSITE CONTRACT        <-- LOAD-BEARING
                         the strongest plausible alternative, stated FAIRLY,
                         and why it is invalid.
                         NO ANSWER => STOP. Nothing legitimate to falsify.
HIDDEN DISTINCTIONS      does the claim depend on any of:
                           value vs identity        history vs current state
                           address vs identity      author vs value
                           lifetime vs key          timing
                           observation frequency    framework behaviour
                           mutable vs immutable representation
NULL PERMISSIONS         what information may the null use?
FORBIDDEN INFORMATION    what would smuggle the incumbent back in?
FAILURE CONDITION        what exact result kills the null?
SURVIVAL CONDITION       what exact result earns the FUNCTION — not merely
                         reproduces current behaviour?
```

**Worked example.** For E2-S00:

```text
PROPOSED   a retained lookup must not retarget after key reuse
OPPOSITE   a lookup IS an address, and therefore SHOULD retarget
WHY IS THE OPPOSITE IMPOSSIBLE?   ... no answer available
```

No answer, so there was nothing to falsify. Implementation should never have
started.

## NEUTRAL LANGUAGE — mandatory until the contract earns itself

Much of the contamination entered through **names, not code**. Each of these
labelled a result before the contract had earned the classification.

```text
FORBIDDEN before the function survives
  wrong · correct · original subject · alias · owner · stale
  should preserve · must survive · destroyed · surviving contribution

PREFER
  the current occupant changed
  a previously acquired observation now returns X
  value before / value after
  the key was reused
  the implementation distinguishes A from B
```

After the contract survives, semantic language becomes legitimate.

## COMMIT DISCIPLINE

```text
MEASUREMENTS      may commit freely
INTERPRETATIONS   may NOT commit until the premise attack closes
VOCABULARY        measurement commits must use OBSERVATION-ONLY language
```

Without the third clause, _"measurements commit freely"_ recreates the exact
contamination channel that `wrong-row read` travelled through. A conclusion one
level too strong survives long enough for the next derivation to inherit it, and
the corrective commit arrives after the damage. The cost of a high commit rate is
not the commits — it is the vocabulary they publish.

## COMMAND VERDICT GATE

```text
If a required gate returns NON-ZERO:

  architectural conclusion commit = FORBIDDEN

until exactly one is true:

  1  the defect is reproduced and fixed
  2  the failure is classified as a test/infrastructure fault, WITH EVIDENCE
  3  a rerun succeeds AND the original failure is explicitly recorded as
     UNRESOLVED / NON-REPRODUCIBLE

A later green result does NOT turn an earlier red verdict green.
```

## THE HOSTILE MATRIX IS A CHALLENGE MATRIX, NOT A CONTRACT GENERATOR

```text
SAME VALUE / DIFFERENT CAUSE          ABA
DIFFERENT VALUE / SAME IDENTITY       ordinary update
SAME KEY / DIFFERENT MEMBERSHIP       remove + reuse
DIFFERENT KEY / SAME MEMBERSHIP       only if rekey independently survives
SAME FINAL STATE / DIFFERENT HISTORY  add/remove, round-trip mutation
NESTED PATH                            siblings preserved
ASYNC INTERLEAVING                     begins, state changes, resumes
FRAMEWORK-FREE                         no framework realization in a semantic test
INCUMBENT-FREE                         no entityMap / SubjectId / effect vocabulary
```

Per case, exactly one disposition:

```text
APPLICABLE      execute it
NOT APPLICABLE  state which independently earned contract makes it irrelevant
NOT CLEARED     leave open
FORBIDDEN       adding the property to the contract merely because the matrix
                contains it
```

Otherwise the testing framework manufactures semantics — solving the old problem
by requiring every candidate to satisfy nine properties it never promised.

### EMPTY LOWER RUNGS ARE NOT A DEFECT

```text
If a candidate depends on a behaviour NOT PRESENT in the frozen premises, do not
use measurement or repository archaeology to supply it FOR THAT CANDIDATE.
Close or park the row.

If a row's independently frozen premises ARE sufficient to decide the function, it
MAY be reasoned abstractly WITHOUT measuring current behaviour.
Rungs 1 and 2 are NOT prerequisites for a function verdict.
```

A rung-3 verdict reached on sufficient premises is legitimate with rungs 1 and 2
empty. What is illegitimate is **filling a premise gap with measurement.**

Recorded because an interpretation reviewer once explained a row's undecidability as
_"rung 3 entered with 1 and 2 empty — that is out of order"_, and the author adopted
it and generalized it to four unopened rows. That framing implies measurement would
have decided the row, which is the same "provisional against measurement" error
already struck elsewhere, returning in ladder clothing. **The ladder describes what
evidence supports what claim. It does not require a row to produce evidence it does
not need.**

## EVIDENCE LADDER — and a single experiment advances it by ONE STEP ONLY

```text
1  MEASURED CURRENT BEHAVIOUR
        v   requires observation only
2  AN ALTERNATIVE MODEL REPRODUCES / DIFFERS
        v   requires a PREMISE ATTACK
3  THE FUNCTION IS REQUIRED
        v   requires a representation-null comparison
4  A REPRESENTATION PROPERTY IS REQUIRED
        v   requires competing realizations
5  A PARTICULAR CARRIER SURVIVES
```

_"A held reference revives after undo"_ earns **step 1**. Nothing more. The
one-step limit is stronger than "no finding skips more than one step", because a
sufficiently seductive test will otherwise produce
`measurement -> therefore the function survives -> therefore SubjectId` inside a
single interpretation.

## THREE PASSES, FORMALLY SEPARATED

```text
AUTHOR PASS          pre-register · implement · measure · state a NARROW finding
PREMISE ATTACK       attack the FUNCTION and the OPPOSITE CONTRACT, before any
                     architectural conclusion.
                     FORBIDDEN from discussing how to implement the candidate.
                     Its only question: WHY DOES THIS FUNCTION NEED TO EXIST?
REPRESENTATION ATTACK   only after the function survives
```

The premise attack's implementation ban is what preserves Rule 0j's subtraction
discipline: a reviewer who starts designing the mechanism has already granted it.

**Structural limit, recorded plainly.** One agent deriving the requirement,
designing the null, implementing it, debugging it, interpreting it and writing the
verdict is prone to confirmation bias whatever the discipline. Once the words
_"wrong-row read"_ are written, the classification precedes the contract. **A
checklist cannot make an author independent of their own framing** — the controller
can only make the omission visible. An empty OPPOSITE CONTRACT field is therefore
a stop condition, not a note.

## DELEGATION POLICY — independence is the point, not headcount

The old rule was _"only use subagents when explicitly requested."_ Replaced:

> **Use subagents whenever epistemic independence materially improves the
> decision. Keep writes and final architectural authority centralized.**

Antagonistic review is **automatic at row boundaries**. It is not something to ask
permission for each time.

### Differentiated packets — the load-bearing part

Five agents that all see _"I think SubjectId is necessary because key reuse causes
wrong-row aliasing"_ are not five reviews. They are one frame, five times. What
buys independence is giving them **deliberately different information and
incentives**:

```text
AGENT A — FUNCTION KILLER
  gets   frozen premises + candidate function ONLY
  job    show this function should not exist
  default disposition: NOTHING SURVIVES

AGENT B — ABSENCE ARCHITECT
  gets   the same material
  job    give the strongest coherent architecture in which the function is ABSENT

AGENT C — NULL BREAKER
  gets   the earned contract + the proposed null ONLY
  job    find where the null is weaker than, stronger than, or different from the
         contract — or smuggles information in
         (timing · identity · observation frequency · framework · incumbent leaks)

AGENT D — INTERPRETATION REVIEWER
  gets   pre-registration + raw command output ONLY. NOT the author's conclusion.
  job    state the MAXIMUM conclusion the evidence supports
```

**Contextual independence is achieved by withholding, not by adding.** A packet
carrying the author's rationale inherits the author's premise and the gate is
wasted.

### Competing hypotheses in parallel, then arbitration

For an uncertain row, fork the positions instead of inventing one and then trying
to disprove yourself:

```text
H0  NOTHING is needed
H1  keyed address semantics suffice
H2  stable incarnation identity is required
H3  the function belongs OUTSIDE SignalTree
```

One agent argues each from the same frozen premises. The primary agent
**arbitrates**. That is a healthier role separation than deriver-and-self-critic,
which is what produced this session's error run.

### Where NOT to delegate

Not for a grep, a test run, a mechanical refactor, a lint failure, or an obvious
measurement — that produces prose without epistemic value. Delegate when the
question contains:

```text
must exist · owns · identity · semantic · minimum · equivalent
replace · delete · survives · architecture
```

Those are exactly the decisions where a framing error is expensive.

### Reviewers may review each other, bounded

For the highest-cost closures:

```text
Deriver -> Antagonist finding -> Deriver response -> a SECOND antagonist sees BOTH
```

**Only new evidence extends the loop.** Restating a position does not.

### Subagents do not write architecture

They return bounded findings and nothing else:

```text
CLAIM
CLASS                      MEASURABLE · DERIVABLE · POLICY · FROZEN · OUT-OF-ROW
WHY
FALSIFIER
SEVERITY
WHAT THIS DOES NOT ESTABLISH
```

The primary agent owns synthesis and commits. Otherwise competing architectural
truths accumulate in the repo and the ledger stops being a single record.

## THE THREE GUIDELINE GAPS THAT PERMITTED THE E4 SYNTHESIS ERRORS

Recorded because the corrections alone would not prevent a recurrence. Each gap is
stated with the failure it allowed.

### GAP 1 — Gate 2 was routed only after a MEASUREMENT

The protocol flow read:

```text
... null pre-registration -> experiment -> RAW ARTIFACT -> GATE 2 -> conclusion
```

E4-G produced **no experiment** — Gate 1 forbade construction. So the flow appeared
to terminate before Gate 2, and skipping it looked compliant. It was not: the row
still produced a **synthesis**, and that synthesis is where every overclaim entered.

```text
CORRECTED ROUTING — Gate 2 applies to a SYNTHESIS, not to a measurement.

Any row that produces a written conclusion passes Gate 2, including:
  a row closed NOT ESTABLISHED with no experiment
  a row closed by measurement
  a row closed by arbitration

THE RAW MATERIAL for Gate 2 is whatever the row actually produced:
  reviewer reports, or the measurement artifact, or both.
  NEVER the author's synthesis.

A row that reaches NULL FORBIDDEN is NOT exempt. It is the case most in need of
review, because there is no measurement to discipline the prose.
```

### GAP 2 — nothing required the row CLOSED to be the row OPENED

E4/U5b was a broad transaction-semantics row. The packet tested concealment,
conclusion modes and nesting. The closure was then written against the broad name.
No rule forbade the rename.

```text
SCOPE INVARIANCE — the row closed MUST be the row opened.

At closure, restate the pre-registered question VERBATIM and answer only it.
If the packet tested a narrower question than the row name, the row is RENAMED to
what was tested and the original row REMAINS OPEN with its untested contracts
enumerated.

A closure may never be broader than its packet. Widening is a NEW row.
```

### GAP 3 — an absence architecture's PARTS were treated as findings

Reviewer B's job is to exhibit a coherent world without the candidate. Nothing said
what weight the components of that world carry. So `turn-coalesced notification`,
invented because B needed _something_ in that slot, was recorded as a "surviving
container obligation."

```text
AN ABSENCE ARCHITECTURE IS AN EXISTENCE PROOF, NOT A DESIGN.

Its function: to show the candidate is not necessary.
Its parts carry NO derivation weight. Each is a DEFERRED CANDIDATE that must pass
its own row — premise attack included — before it is anything.

Specifically FORBIDDEN: recording a component as "surviving", "earned", "derived",
or "the answer" because the absence architect required it to build a coherent
world. That inverts the reviewer's role from killing into designing, which Rule 0j
forbids: kill first, derive later.

The same applies symmetrically to the function killer: its supporting arguments are
not theorems. See the DO NOT INFER precedent.
```

### CLOSURE CHECKLIST — run before writing any row conclusion

```text
[ ] restate the pre-registered question VERBATIM
[ ] is the conclusion answering exactly that question, no wider?     (GAP 2)
[ ] list every claim in the conclusion. For each: which reviewer output or
    measurement supports it, quoted?
[ ] does any claim rest on a component of an absence architecture?   (GAP 3)
    -> demote to DEFERRED CANDIDATE
[ ] does any claim promote a reviewer's supporting argument to a theorem?
    -> demote, per DO NOT INFER
[ ] how many evidence-ladder steps does the conclusion advance?      (must be <= 1)
[ ] has GATE 2 seen the raw material without this synthesis?         (GAP 1)
```

The checklist is not a substitute for Gate 2. It is what makes Gate 2's job small.

### TWO RULES THIS ROW EARNED

```text
NO BORROWED RUNGS
  If rung 1 (measured behaviour) is NOT ENTERED, rung 2 (alternative model
  comparison) is NOT ENTERED either — an analytical equivalence witness cannot
  occupy a rung defined by comparison against measurement.
  An analytical witness is PRESENT but OUTSIDE the ladder.
  "Rung N at best, on borrowed footing" is FORBIDDEN phrasing: it is an escape
  hatch around the no-skipping rule.

UNDERDETERMINED IS A TERMINAL STATE, NOT A WORK ORDER
  When the premises do not decide a candidate:
    -> CLOSE the row
    -> record a PARKED REOPENING CONDITION
    -> STOP

  FORBIDDEN: going on to establish the missing premises so the candidate becomes
  testable. Each missing premise is itself a CANDIDATE FACT, and some are
  candidate FUNCTIONS. Adopting one because it makes another row testable is
  replacement-after-deletion in a new form.

  MISSING FACTS ARE NOT AUTOMATICALLY MISSING REQUIREMENTS. Premise silence may
  be correct, because the function may not independently arise.

  A falsifier produced by a closed row is a REOPENING CONDITION, never a queue.

  AND: do not benchmark a mechanism with no architectural standing. Measuring it
  lends it gravity through sunk effort. A cost becomes owed only when a SURVIVING
  function forces a decision between two representations.
```

### GATE 2 IS NOT EXEMPT FROM THE RULES IT ENFORCES

```text
Gate 2 may produce REOPENING CONDITIONS.
Gate 2 may NOT create follow-up work whose ONLY purpose is to make a CLOSED
CANDIDATE DECIDABLE.
```

Observed once, on its second application: the reviewer correctly detected that the
premises did not decide a candidate, and then wrote _"two obligations follow"_ —
including a cheap check to run and a question to settle. Both existed only to make
the closed candidate decidable. That is the transition the underdetermined-is-
terminal rule forbids, committed by the gate that enforces it.

**A reviewer's strongest alternative interpretation is EVIDENCE ABOUT THE ROW, not
a work order.**

### THE NULL COMES AFTER BOTH GATES

```text
Gate 1 kills it           -> Gate 2 BOUNDS the interpretation -> close
Gate 1 finds a contract   -> Gate 2 CONFIRMS that inference   -> only THEN
                             preregister a null
```

Gate 1 can establish that a candidate deserves testing. Gate 2 must first verify
the survival interpretation has not itself jumped a premise. **A row does not need
an experiment — reaching the correct disposition is the success criterion.**

### THE SINGLE INVARIANT ALL GATES SERVE

Adding a new mechanism at each newly discovered boundary leak does not converge:
each is compliant with its own letter and leaks where it does not reach.

> **Every stage is subordinate to the same burden rules. No reviewer, gate,
> experiment, absence witness, or synthesis has authority to manufacture the
> premise needed by the next stage.**

That covers premise attack, null construction, interpretation review and closure
with one rule instead of four, and it is what every observed failure violated.

### THE OPPOSITE CONTRACT MUST NOT STIPULATE AN ANSWER

```text
A pre-registered OPPOSITE CONTRACT may not contain a clause that DECIDES a
question the row might need to decide.
```

Observed on U5b-A. The opposite contract was written as _"the grouping premise
governs only confirmed reversal granularity"_ — which handed the null the answer to
precisely the question a reviewer then identified as undecided by the premises. Any
closure leaning on the null's wording was leaning on a stipulation, and the phrase
had to be recorded as **the author's wording, not a finding.**

```text
BEFORE OPENING A ROW, check the opposite contract for:
  clauses beginning "only" / "merely" / "nothing but"
  any clause that ASSERTS the scope of a frozen premise rather than CITING it
  any clause that would be a FINDING if a reviewer produced it
```

A stipulation inside the instrument is indistinguishable from a result once the row
closes. This is a defect of the INSTRUMENT, and it is the author's, not a
reviewer's.

## MANDATORY INDEPENDENT REVIEW — two gates, not optional tools

> **No architectural null may run without an independent PREMISE ATTACK, and no
> architectural conclusion may land without an independent INTERPRETATION ATTACK.**

This is part of the evidence standard, not process overhead. The standing
"no subagents unless asked" restriction is **lifted for read-only antagonistic
architectural review** and for nothing else.

```text
candidate row
      v
PREMISE REVIEWER  (Reviewer A — FUNCTION KILLER)
      v
BLOCKER? -- yes --> resolve / mark UNPROVEN / abandon the row
      v no
null pre-registration
      v
experiment
      v
RAW ARTIFACT  (command · exit status · output)
      v
RESULT REVIEWER  (Reviewer B — NULL BREAKER)
      v
BLOCKER? -- yes --> resolve BEFORE any conclusion
      v no
architectural conclusion
```

**A row that reaches NULL CONSTRUCTION FORBIDDEN does NOT exit this flow.** It skips
the experiment and goes straight to GATE 2 with the reviewer reports as its raw
material. Gate 2 gates the SYNTHESIS, not the measurement.

### GATE 1 — premise review. The reviewer MAY REJECT THE FUNCTION ITSELF.

Handing over "the function statement and the proposed contract" already smuggles
the first premise in. The packet carries frozen premises plus a clearly marked
_candidate_:

```text
ZERO STATE
  known surviving invariants: ...

CANDIDATE FUNCTION — UNPROVEN
  ...

PROPOSED CONTRACT — UNPROVEN
  ...

Attack in order:
  1  Why must this FUNCTION exist at all?
  2  What becomes impossible if it does not?
  3  Can surviving primitives already provide the capability?
  4  State the strongest coherent OPPOSITE CONTRACT.
  5  What assumption is embedded in the proposed wording?
  6  What information would a null be FORBIDDEN to use?
  7  Is there actually an earned contract available to falsify?

If function survival is not established:
  STOP — NULL CONSTRUCTION FORBIDDEN.
```

### GATE 2 — interpretation review. Raw evidence only, never the conclusion.

```text
RAW MEASUREMENT      command · exit status · output/artifact
PREREGISTERED CLAIM  ...

Ask:
  1  What was actually measured?
  2  Did the null use information FORBIDDEN by pre-registration?
  3  Did framework / current-implementation / legacy semantics leak in?
  4  Does the result advance: current behaviour · model equivalence ·
     function survival · representation necessity · current-representation
     survival?
  5  Is the proposed conclusion more than ONE evidence step beyond the result?
  6  State the strongest ALTERNATIVE interpretation.
```

### The reviewer gets LESS context, not more

Contextual independence is achievable even within one model family — by
withholding. **Excluded from a premise packet:**

```text
the expected outcome            the author's rationale
the proposed replacement design v14 mechanisms
current representation details, unless genuinely necessary
loaded vocabulary — "wrong", "alias", "restore original", "stale", "owner"
```

Only frozen architecture and the candidate question go in. A premise packet
contaminated with the author's reasoning inherits the author's premise, which
defeats the gate.

### Two roles, deliberately different failure modes

```text
REVIEWER A — FUNCTION KILLER
  Default disposition: NOTHING SURVIVES.
  Job: show the candidate function is unnecessary.

REVIEWER B — NULL BREAKER
  Assume the function survived.
  Job: show the null is weaker than, or different from, the contract — or that it
  smuggles information in.
```

Merging these into "review this" makes it easy for both to be missed. **Neither
reviewer proposes the replacement architecture** — that is Rule 0j: kill first,
derive later. A reviewer who starts designing the mechanism has already granted it.

### A BLOCKER CANNOT BE DISMISSED BY DISAGREEMENT

A `BLOCKS-CLOSE` finding closes only through the existing classification, never by
the author explaining why they disagree:

```text
MEASURABLE     one experiment settles it
DERIVABLE      attack the premise / the inference
POLICY         explicit arbitration
FROZEN         a deterministic falsifier is required
OUT-OF-ROW     PARK
```

### Row wording must not arrive pre-shaped

_"Does `structural` need more than canonical truth?"_ is already
representation-shaped — it names the incumbent's field. Start one level up:

```text
What independently surviving function, if any, requires information that cannot
be reconstructed from canonical truth at confirmed-reversal time?
```

Then let the reviewer attack whether even _that_ function exists. Only after
survival: _what information property is required?_ Only then: _what representation
carries it?_ This keeps `structural`, `SubjectId`, effects, snapshots and
generation tokens out of the question until they are earned.

### Why the misses happened — recorded, because it is the finding

This session ran with:

```text
one reasoner + executable tests + RETROSPECTIVE external review
```

Executable tests caught implementation flaws well. External review caught premise
flaws well. What was missing was putting the second mechanism **before the commit
boundary**. An adversarial-review harness already existed in this repo
(`tools/cross-review/`, and the read-only `release-reviewer` subagent) and went
unused while increasingly elaborate self-checklists were written instead. **That
should have been surfaced far earlier rather than simulated.**

## GATE 1 RESULT — the identity row is BLOCKED, and the falsifier is now precise

Two independent premise reviewers, differentiated packets, no repo access.

```text
A (function killer)     FUNCTION SURVIVAL NOT ESTABLISHED   3x BLOCKS-CLOSE
B (absence architect)   A COHERENT ABSENCE ARCHITECTURE EXISTS
DISPOSITION             NULL CONSTRUCTION FORBIDDEN for the row as worded
```

**The falsifier the identity question has needed all along** (B8). Exhibit ONE
required capability satisfying ALL THREE:

```text
1  a consumer legitimately holds a per-member reference across a
   remove -> revert boundary
2  the reference CANNOT be re-obtained by key after the revert
3  the thing it references CANNOT be reconstructed as a pure function of the
   restored canonical value

4  preserving that continuity is a SIGNALTREE/KERNEL responsibility — NOT
   application, adapter, or consumer-owned state

(1)+(2) alone       = a DERIVED-LAYER defect (the handle should have been
                      key-addressed and memoized)
(1)+(2)+(3) alone   = information exists somewhere; OWNER UNPROVEN
ALL FOUR            = membership-lifetime identity survives
```

FROZEN: Gate 1 changes only on a DETERMINISTIC FAILURE, demonstrated not argued.
"NO EXPERIMENT" IS ITSELF A SUCCESSFUL ARCHITECTURAL RESULT — a row ending in
NULL CONSTRUCTION FORBIDDEN has produced evidence.
A's F1 is PREMISE-RELATIVE: "no additional observable obligation beyond canonical
restoration has been NAMED" — NOT "all observability is state".
B's architecture is an EQUIVALENCE WITNESS, not a destination: it earns no
snapshot history, no tree diffing, no representation.
ORDERING: an explicit canonical KEY SEQUENCE can represent required enumeration
order; no intrinsic subject-order mechanism is thereby earned.

**Every prior row reached (1) and (2) at most. None tested (3).** That is the
retroactive explanation for the whole E2-S / E2-S0 / E2-S00 error run.

Two independent convergences with no shared context:

```text
key collision requires OUT-OF-ORDER revert, which the premises never granted.
  Under strict reverse order the intervening add reverts first and no collision
  arises. Importing selective revert then blaming the record is CIRCULAR.
  -> this invalidates the E2-S2 contrast: its aliasing row performed an ARBITRARY
     WRITE (`rows.set([...])`), not a revert.

reference continuity is ADDRESSING STABILITY, not information. Addresses are a
  static function of keys.
```

Also converged with the earlier `E-ORD` measurement: B's absence architecture is
closed only if enumeration order is an explicit canonical KEY SEQUENCE — which is
the "ordinary array of keys" null already measured as strictly stronger than the
incumbent's intrinsic order.

**Scope:** the candidate is refuted RELATIVE TO THESE PREMISES, not in general. It
becomes true the moment a member carries identity or lifetime that is not a
canonical value. That is the next row, worded to B8's three parts — never to the
incumbent's fields.

## GATE 1 — CONTINUATION ROW CLOSED, no experiment, no replacement question

```text
ROW       pre-obtained member-observation continuity across remove -> reversal
SURVIVAL  NOT ESTABLISHED
BLOCKER   no independently surviving workflow becomes impossible under
          address-resolved present / absent / restored observation
NULL      FORBIDDEN
NEXT      NOTHING for this function. Close the row.
```

The premises reach _"the restored member is observable again"_ and stop. Nothing
reaches _"the observation obtained beforehand must still designate it."_

**No product decision is owed.** Asking whether SignalTree _wants_ the missing
premise converts NOT ESTABLISHED into _would we like this?_ — resurrection by
another route. A later independently-earned capability reopens it from zero.

### DO NOT INFER — antagonistic review overreached in three places

Negative architecture is as manufacturable as positive architecture.

```text
"parts 3 and 4 are mutually exclusive"      OVERREACH — reads P1 as "owns
  canonical values AND MAY OWN NOTHING ELSE". Kernel REALIZATION METADATA (turn
  ids, revisions, slots, retained history) is not canonical application truth.
  CORRECTED: part 3 does not ESTABLISH part 4; an independent OWNERSHIP argument
  is required, and none exists in P1-P6.

"a partial observer contradicts P2"          OVERREACH — P2 makes absence
  representable in canonical STATE; it does not require every observation API to
  be total. `valid | suspended | invalidated` is coherent, merely UNEARNED.

"value-binding creates two authorities"      OVERREACH — it could behave
  value -> unavailable -> value. Unearned, not impossible.

ALSO NOT INFERRED: all observation is canonical state · the kernel can never own
non-canonical metadata · identity can never survive
```

### P6, phrased safely

```text
Confirmed reversal currently grants LIFO undo/redo.
Selective or arbitrary earlier-turn reversal is NOT GRANTED.
RULE: a row may not REQUIRE selective/out-of-order reversal unless that function
independently earns itself.
```

Enough to invalidate E2-S2 without freezing "LIFO forever" as a prohibition.

### B8+ is retired

The four-part criterion was a useful probe and had become representation-shaped.
The upstream result is what stands: **no independently surviving workflow
requiring pre-obtained continuity has been NAMED.** No B9 — proving an absence
harder is not learning something.

### Closure principle

```text
A row SUCCEEDS when it reaches the correct epistemic disposition.
"UNPROVEN / no experiment permitted" is a valid successful closure.
```

## UNDO-E4-G — closed per GATE 2's scope limit

```text
C1 pre-conclusion visibility   NOT ESTABLISHED    C3 conclude by un-observing  NOT EST
C2 conclude never-visible      NOT ESTABLISHED    C4 runtime nesting           NOT EST
NULL FORBIDDEN
```

Gate 2 ruled a closure may state ONLY: the four verdicts, two premise-reading
notes, and the unmet falsifier. Two earlier syntheses exceeded that.

```text
PREMISE-READING NOTES
  P4 grants exclusion from the REVERTIBLE RECORD only, NOT invisibility
  P6 vs async-speculation-out-of-order — TENSION FLAGGED OPEN, not derived

FALSIFIER (i) consumer reachable only via the canonical read path (ii) speculative
value required AT the canonical address (iii) async decision — all three at once.
SPECIFIED, NEVER EXERCISED.

LADDER  Rung 1 MEASURED BEHAVIOUR      NOT ENTERED
        Rung 2 MODEL COMPARISON        NOT ENTERED   (no measured behaviour to
                                                      compare against)
        analytical absence witness     PRESENT, but OUTSIDE the ladder
        candidate advancement          ZERO
        "rung 2 on borrowed footing" WITHDRAWN — it would be an escape hatch
        around the no-skipping rule.
```

**CONVERGENCE IS NOT CORROBORATION.** A and B had the SAME frozen premises, so
their agreement is premise-correlated, not independent empirical support. Opposite
JOBS is not opposite INFORMATION.

**C1 is NOT ESTABLISHED, NOT REFUTED, UNDERDETERMINED BY CURRENT PREMISES.** Every
rebuttal depends on the composer being able to restructure the writers, which no
premise grants.

**MISSING FACTS ARE NOT AUTOMATICALLY MISSING REQUIREMENTS.** "The row failed the
premise set" is WITHDRAWN — it implies the premises are deficient; nothing shows
that, and silence may be correct because the function does not independently arise.

"The entitled next move is a re-run request" is WITHDRAWN as too permissive.
Fixing the missing premises to make C1 testable would MANUFACTURE them — and
"reads may interleave" and "the container must support independently authored
writers" are candidate FACTS, the second potentially a major function.

```text
CORRECT TRANSITION   close the row, with a PARKED REOPENING CONDITION:
  if an independently derived workflow later establishes interleaved observation,
  container-only independently authored writers, or the three-part
  captive-read-path conjunction, C1 reopens FROM ZERO.
The falsifier is a REOPENING CONDITION, not a work queue.
OVERLAY BENCHMARK    NOT OWED — measuring an architecture with no standing gives
                     the witness gravity through sunk effort.
```

**FORBIDDEN on this row:** "refuted/impossible" · "observation model settled" · "no
workflow needs C1" · "grouping is ONLY reversal granularity" · "P4 handles
cancellation" · "nesting adds nothing" · "the falsifier was tested" ·
"dispensable therefore remove" · "P6 is wrong".

**UNDO-E4 (transaction semantics at U5b) REMAINS OPEN** — atomicity, refusal,
persistence consequences, authorship and pending rollback were never in the
question.

**Gate 2 DEMONSTRATED VALUE ON ITS FIRST APPLICATION**, catching the absent rung 1,
the convergence overclaim, the P6 mis-labelling, and the falsifier readable as
tested — two of which had already survived an external review of the corrected
write-up. That justifies keeping it given the low downside; it does NOT establish a
general error-reduction rate from one trial.

## UNDO-E3 — PARTIAL / SELECTIVE REVERSAL: NOT GRANTED

```text
SURVIVAL     NOT GRANTED     WHY  no independently required workflow demonstrated
NOT REFUTED  may be useful under contracts not currently earned
NULL         FORBIDDEN       NEXT nothing for UNDO-E3
MEASUREMENT  NONE REQUIRED for this closure
```

**The absence witness is CONDITIONAL and INCOMPLETE.** Forward correction requires
knowing the target value, and no historical-value access contract is granted.
**P3 does NOT imply readable historical values** — it requires the ability to
REALIZE a previous configuration, which an implementation could satisfy with
inverse operations, compressed deltas, opaque restore tokens, persistent structural
nodes, or checkpoint-plus-replay, none of which exposes arbitrary historical
position values. A boundary read is a NEW INFORMATION SURFACE. That WEAKENS the
witness; it does NOT strengthen partial reversal.

### PARKED REOPENING CONDITIONS — conditions, NOT queues

```text
MULTI-CONTRIBUTOR   if independent derivation later establishes multi-author
                    confirmed history requiring one author's contribution to be
                    withdrawn while another survives -> reopen.
                    NO provenance row is owed now.
REVERSAL-OWNED      if an independently derived function establishes a property
PROPERTY            unreachable by ordinary writes, that must participate in
                    reversal, AND must sometimes reverse independently of its step
                    -> reopen FROM ZERO. NO repo search owed now.
```

### THREE CLAIMS WITHDRAWN — from the interpretation review itself

```text
"one non-writable restorable position makes the candidate NECESSARY"
  It does not. That is characterization of the incumbent. Five things are needed:
  the property independently required; reversible; inside a coarse step; a workflow
  requiring it reversed while another contribution from that step survives; and
  whole-step-plus-forward unable to serve it. And if the property is kernel-private
  and deliberately unwritable, that may argue AGAINST exposing partial reversal.
  SEARCHING THE IMPLEMENTATION FOR ONE IS FORBIDDEN — that lets the incumbent
  manufacture the requirement.

"convergent independent invention is evidence the NEED is real"
  Contradicts the same review's finding that A/B agreement is not independent
  corroboration. MAXIMUM SUPPORTED: evidence that the forward-write equivalence has
  an UNPROVEN VALUE-RECOVERY PRECONDITION.

"the refusal is provisional against measurement"
  Measurement of WHAT? Repo measurement yields incumbent behaviour and cannot
  advance FUNCTION REQUIRED. Correct: NOT GRANTED UNDER CURRENTLY EARNED CONTRACTS,
  reopening only on NEW INDEPENDENT SEMANTIC EVIDENCE. A measurement may SUPPORT a
  later derivation; it cannot SUBSTITUTE for one.
```

### META — Gate 2 is not exempt from the rules it enforces

It detected underdetermination correctly, then converted its own strongest
alternative into "two obligations" including a "cheap check" to run — the exact
transition forbidden one commit earlier.

```text
NEW HARD RULE
Gate 2 may produce REOPENING CONDITIONS. It may NOT create follow-up work whose
only purpose is to make a CLOSED CANDIDATE DECIDABLE.
```

## U5b-A — ONE COHERENT CANONICAL TRANSITION: UNDERDETERMINED (terminal)

```text
A NOT ESTABLISHED · B coherent absence EXISTS but conditional + fails on one named
class · GATE 2 UNDERDETERMINED, neither earned nor refuted · NULL FORBIDDEN
TERMINAL, not "rejected". No author may report it as rejected.
```

### Established narrowly

```text
P5 does NOT grant forward-path atomicity — grouping recovers the RECORD, not
   prevention. Any "already granted" argument is dead.
P4 grants NO CONCEALMENT — excludes from the record, not from observation.
The candidate's force is a RELOCATION of P3's "boundaries a user would recognize"
   from the reversal path to the forward path.
A large fraction of multi-position coherence needs are DECOMPOSITION ARTIFACTS and
   dissolve under re-addressing/derivation with no transition facility.
UNGRANTED FACTS (not defaults): whether reversion is observationally atomic;
   whether every composed writer is restructurable by its caller.
```

### MY INSTRUMENT WAS DEFECTIVE

The opposite contract said grouping "governs only confirmed reversal granularity" —
**handing the null the answer** to the exact question later found undecided. That
phrase is the AUTHOR'S WORDING, NOT A FINDING. New rule installed: an opposite
contract may not stipulate an answer to a question the row might need to decide.

### CONFLICT — mostly charter artifact, ONE genuine residuum

A answered "required by the premises?" (no); B answered "can absence be built?"
(yes, with a non-empty uncovered class). That class is characterised by exactly the
grants A's falsifier names missing, and B lists them as its OWN falsifier — so B's
forced case is the sharpest SPECIFICATION of the missing grant, not a counterexample.

```text
UNRESOLVED, internal to the premises: is P3's "boundaries a user would recognize"
OBSERVATIONAL or DESCRIPTIVE? B's F7 needs no external grant, and A CONCEDES the
premise B needs. Neither was asked; neither answered.
```

### LADDER — only rung 3, OUT OF ORDER

```text
1 measured NOT ENTERED · 2 model-vs-MEASURED NOT ENTERED (B's construction LOOKS
like rung 2 and is not) · 3 function required ENTERED NOT PASSED · 4,5 NOT ENTERED
CORRECTED: "rung 3 with 1-2 empty is out of order" is WITHDRAWN as the account of
why this row is undecidable, and must NOT be generalized. The cause is that the
candidate depends on a behaviour the premises DO NOT GRANT — measurement could not
have supplied it, and supplying it that way is the forbidden move.
```

```text
THE NARROW RULE
  candidate depends on a behaviour ABSENT from the frozen premises
    -> do NOT use measurement or archaeology to supply it. Close or park.
  premises SUFFICIENT to decide the function
    -> abstract reasoning is legitimate. Rungs 1-2 are NOT prerequisites for a
       function verdict.
Illegitimate is filling a PREMISE GAP with measurement — not an empty rung.
```

### WHAT MEASUREMENT CAN AND CANNOT DO — the load-bearing form

This rule has now been re-derived twice from opposite directions — UNDO-E3's
"provisional against measurement", then U5b-A's ladder framing — so it is stated
once, at full strength, and referenced rather than rediscovered.

```text
MEASUREMENT MAY   SUPPORT a derivation that is INDEPENDENTLY MOTIVATED — one whose
                  function requirement is already carried by premises earned
                  without reference to the measurement. It may then supply
                  magnitude, feasibility, cost, or a counterexample to a claim the
                  derivation actually made.

MEASUREMENT MAY   MANUFACTURE THE FUNCTION REQUIREMENT. No quantity of observed
NOT               behaviour converts "the premises do not require this" into "this
                  is required" — the observation's subject is an implementation
                  that was never the authority on what is necessary.
```

The test is the **direction of dependence, not the order of operations**:

```text
LEGITIMATE   the requirement stands without the measurement, which informs its
             magnitude or realizability
FORBIDDEN    the requirement does not stand until the measurement is admitted
```

"Measure first, then derive" is not itself the error, and "derive first, then
measure" is not itself a defence. **Ask what the requirement rests on, not what
happened first.**

### BRANCH A STRUCK — A's case collapses to ONE leg

"Write the common ancestor" fails on PREMISE-INTERNAL grounds: writes replace
values, so an ancestor write's extent exceeds intent; it is one recorded write
spanning siblings, so reverting reverts siblings never in the operation; and it
CANNOT HONOUR a P4 exclusion on any sibling. A conflict with P3 and P4, not a cost
note. Consequence: A's F2 collapses into F1.

### CORROBORATION: NO for the verdict

Both read the SAME stipulated text; agreement on an absence in shared input is
common-cause. And A's breadth shrinks once Branch A is struck. Weakly YES only for
WHERE the gap is: B reached the same wall by a different failure route and reported
against its own interest that two of its scaffoldings "reconstitute the candidate."

### PARKED REOPENING CONDITIONS — conditions, NOT tasks

```text
- P3's "boundaries a user would recognize" settled as OBSERVATIONAL
- a grant that a read may occur between two writes by the same caller
- a grant that a write sequence may terminate partway
- a grant that composed writers may be UNRESTRUCTURABLE by their caller
NONE may be pursued to make this candidate decidable.
```

### STRONGEST ALTERNATIVE — may be right

P3 may ALREADY contain the observer: neither "configuration" nor "a user would
recognize" is per-position, and if such an observer exists it was granted FOR
REVERSION, independently of this candidate. Then reverting a group as several writes
exhibits a configuration NEVER HELD, which P3 forbids on its face — so the
obligation propagates BACKWARD to the forward path with no new grant. It does not
close the row; it relocates the undecidability from "is there an observer?" to "what
is P3's observational content?"

## U5b FAMILY — current status. Read this before citing any U5b row.

```text
U5b-A  ONE COHERENT CANONICAL TRANSITION   TERMINAL — UNDERDETERMINED
                                           NOT rejected. NULL FORBIDDEN.
U5b-B  REFUSAL / FAILURE                   CLOSED — FUNCTION NOT ESTABLISHED.
                                           Both gates run. NULL FORBIDDEN.
                                           NOT refuted: the null stands undisturbed
                                           and the opposite position is EQUALLY
                                           UNPROVEN.
U5b-C  CONSEQUENCE COORDINATION            UNOPENED
U5b-D  SHARED ATTRIBUTION                  UNOPENED
U5b-E  UNCONFIRMED TRANSITION WITHDRAWAL    UNOPENED
```

### U5b-B — what closed it, and what it did NOT close on

```text
DID NOT close by inheriting U5b-A's blocker. The independence claim (state AT REST,
  no entity observing between two writes) was AFFIRMED by both reviewers.
CLOSED because no workflow was produced that becomes impossible under P1-P6, and
  the one candidate-shaped residue offered (a reader with no prior relationship to
  the writer) rests on FIVE UNGRANTED CONDITIONS: writer identity, multiple writers,
  an unmodifiable writer, caller mortality, state outliving its writer.
STRONGEST POSITIVE RESULT, and it is about the INSTRUMENT: the frozen candidate
  CANNOT STATE ITSELF in the vocabulary P1-P6 supply. Reached from both charters.
STRONGEST ALTERNATIVE: "not established" may be a verdict that P1-P6 lacks the
  vocabulary to POSE the question, not a verdict about the function.
  EVIDENCE ABOUT THE ROW — not a licence to widen P1-P6.
```

## TWO ITEMS RESERVED TO THE HUMAN AUTHOR — BOTH DECIDED 2026-08-20

Both were reserved because an implementer settling them would supply by fiat the
kind of premise this method exists to stop being supplied. **The author has decided
both.** Full records in RFC 0016: the P3 **freeze event** and the **defender
charter**.

### 1 — P3 IS FROZEN ON THE AGENTFUL WORDING

```text
P3. An operation may be REVERTED: canonical state returns to a configuration it
    previously held, at boundaries a user would recognize as discrete steps, and
    can be advanced again afterwards.
```

The agentless variant issued to Reviewer B — _"at recognizable step boundaries"_ —
is **RETIRED**. It is not a fallback reading.

```text
THIS IS      a PRODUCT / DX FREEZE, made on the author's product authority.
             Stipulating premises IS the author's job.
THIS IS NOT  a theorem. No reviewer derived it, no gate established it, no
             experiment produced it. It is an INPUT to the method, not an output.

CITE IT AS   "P3, as frozen by product decision on 2026-08-20, reads ..."
NEVER AS     "the reviewers established the perceiving entity" · "the agentful
             wording survived Gate 1" · "A and B agreed on the observational
             reading"
```

**The freeze settles WHICH WORDS ARE IN P3. It does not settle WHAT THEY GRANT.**

```text
NOT GRANTED by the freeze, and not to be read in:
  an entity able to observe the interval BETWEEN two writes inside one step
  that a mid-sequence configuration is observable at all
  that "recognize a boundary" and "observe a state" are the same capability

U5b-A therefore STAYS TERMINAL — UNDERDETERMINED. Its parked reopening condition
("P3's boundaries settled as OBSERVATIONAL") is STILL PARKED. A reading under which
the frozen text supplies the observer is AVAILABLE — A's own strongest alternative
records it — and an available reading is NOT A GRANT.
```

The freeze touches P3 only. The separate P2/P6 drift on the continuation rows
(five premises, weaker P2, no P6) is **not** repaired by it and remains disclosed.

### 2 — GATE 1 GAINS A DEFENDER, ON NAMED ROW CLASSES ONLY

```text
APPLIES TO      public API rows · DX rows · CORE SEMANTIC rows
DOES NOT APPLY  mechanical cleanup — deletions, renames, dead code, moves,
                vocabulary fixes, packaging, version hygiene

The row class is DECLARED IN THE PACKET BEFORE THE ROW OPENS. Declaring it after
would let the class be chosen to fit the desired seating.
```

The defender argues the function is REQUIRED — a workflow that becomes
**impossible**, not harder — and is bound by **the same burden rules as the
killers, with no exemptions**:

```text
quote frozen premises VERBATIM, never paraphrase
NO repository archaeology, NO measurement, NO citing the implementation
a missing premise is a STOP and may become a reopening CONDITION — never a work
  order, task, experiment, or request that the author grant it
no implementation-incumbent leakage; same withheld packet as the killers
may NOT propose the mechanism (Rule 0j applies symmetrically)

INADMISSIBLE: ergonomics, familiarity, "users expect" -> Table G, zero function
weight.
```

```text
DEFENDER FINDS NOTHING      the closure STRENGTHENS — and this is the first
                            legitimate corroboration available, because the A/B
                            pair are SAME-DIRECTION and never supplied it
DEFENDER NAMES A CASUALTY   the row does NOT survive; the casualty goes to the
                            killers to answer on the frozen premises
BOTH HIT THE SAME GAP       UNDERDETERMINED, and more strongly than a
                            same-direction pair could establish
```

**NOT RETROACTIVE.** U5b-A and U5b-B were closed without a defender and are not
reopened. Running a defender at a closed row to see whether it reopens is a work
order generated from a method change, and is forbidden.

**NEITHER DECISION IS A WORK ORDER.** Nothing may be measured, benchmarked or
archaeologically dug on the strength of either.

### PREMISES: QUOTE, NEVER PARAPHRASE

```text
P1-P6 had NO verbatim statement in this repository until 2026-08-20. The text lived
only in one session's reviewer prompts, and it DRIFTED — P3 diverged between two
reviewers on the same row, and an earlier row was reviewed against five premises
with a weaker P2 and no P6 at all.

Rows closed against "P1-P6" were closed against DIFFERENT premise sets.

The verbatim text is now in RFC 0016. A packet MUST QUOTE it. Paraphrasing premises
into a packet is FORBIDDEN — that is the channel the P3 divergence travelled, and
paraphrase is how "frozen" became "restated from memory, per reviewer, per row".
Any change to premise TEXT is a FREEZE EVENT: committed, dated, and listing the rows
already closed against the previous text.
```

The family's original preregistration block in RFC 0016 still shows A as `[OPENED]`
in its frozen wording. **That block is HISTORICAL.** It is marked as superseded in
place; the terminal record later in the same document governs.

### U5b-B stands on its own footing — do not treat A's blocker as the family's

A closed on a missing grant: **an entity able to observe the interval between two
writes.** B's packet claims independence from that grant on one ground, recorded as
a FALSIFIABLE construction property and not as a finding:

```text
A asks about state DURING a sequence · B asks about state AT REST AFTER a sequence
that did not run to completion — reachable by an ordinary read
IF GATE 1 REJECTS THIS -> B CLOSES as inheriting A's blocker. It does NOT become a
request to establish the observer.
```

**B inherits nothing else from A.** Specifically not: "grouping is confined to
reversal granularity" (A's author stipulation, never a finding); "reversion is
observationally atomic" or "torn" (premises decide neither); A's UNDERDETERMINED as
any kind of prior for B; A's uncovered class (specified over INTERMEDIATE states);
A's struck Branch A; "callers can pre-validate a whole configuration"; A's four
parked reopening conditions. Citations of A's record must read _"the U5b-A closure
records X"_, never _"X is established"_.

### The packet records two defects in its own frozen preregistration

Both were caught **before** the row opened — the first time this has happened.

```text
CANDIDATE  "such that none of its canonical consequences occur" writes an
           ALL-OR-NOTHING shape into the candidate, so a reviewer would evaluate a
           remedy rather than a function.
DECISIVE   "rather than validation occurring before canonical mutation" offers
           pre-write validation as THE rival — and its availability is itself
           disputed, per A's own warning about P1.
```

Neither was repaired in place. **Rewording a frozen preregistration to be more
answerable IS the contamination.** Strictly weaker restatements travel alongside,
each removing the defective clause and replacing it with nothing.

```text
NEW REQUIRED FIELD, from A's instrument defect: ANTI-STIPULATION LEDGER
  enumerate what the opposite position does NOT assert — one line per question the
  row might need to decide.

NEW STANDING PER-CLAUSE TEST
  Would this sentence COUNT AS A FINDING if a reviewer produced it?
  If yes, it may not appear in the packet. The instrument would be pre-empting the
  reviewer's output with the author's wording.
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

**M3 — snapshot / representation. ANSWERED.** The question is _not_ "does a snapshot hook
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

In each case the machinery is _correct_, and what it corrects was introduced one
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

_"Should we preserve X because 14.x had it?"_ is not a valid question and is
answered mechanically by Rule 0n/0o.
