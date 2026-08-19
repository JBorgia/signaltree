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
M3 snapshot/representation    OPEN — CURRENT FRONTIER
M4 reconstruction             QUEUED
M5 decision observability     QUEUED
entityMap / collections       OPEN — zero-state done. Candidate surviving
                              functions are GRANULAR WRITE and GRANULAR
                              OBSERVATION; everything else an array in ordinary
                              canonical state already does. Public collection API
                              is INHERITED (2025-12); the SubjectId/identity
                              machinery is 15-EFFORT (post-2026-08-11) and is
                              what the frozen identity invariant rests on.
stored                        OPEN — split inbound/outbound before reading it
linked                        OPEN — derived placement refuted; owner unproven
readonly / serialization /    OPEN
  diagnostics
final authoring grammar       DEFERRED to one system-wide DX pass
```

## Current frontier

**M3 — snapshot / representation.** The question is *not* "does a snapshot hook
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

**Disposition waits on `entityMap`.** If its accessor conforms, the hook has no
surviving implementer and deletes. If the shape is independently earned, what
survives is *"a realized value must be able to declare its state when its shape
hides it"* — narrower and differently owned than *"declaration kinds own their
representation"*.

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

## Do not reopen without a deterministic counterexample

```text
GATE A and every frozen invariant above
the RFC 0015 derived projection contract
any disposition recorded as frozen in RELEASE-1.0.md
```

*"Should we preserve X because 14.x had it?"* is not a valid question and is
answered mechanically by Rule 0n/0o.
