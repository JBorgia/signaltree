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

If any source conflicts with this file, **this file wins** unless the source
supplies a deterministic counterexample.

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

```text
0j  subtraction-only; physical deletion follows architectural deletion
0k  "Angular has a primitive" is evidence, not a falsifier — derive the
    FUNCTION before comparing primitives
0l  legacy mechanisms are evidence repositories, not migration targets
0m  DX capability is evidence; DX spelling is not architecture.
    A semantic deletion does not imply a DX prohibition.
0n  major-version continuity is non-semantic; no internal 14->15 adapter
0o  legacy continuity is never a premise; replacement-seeking is prohibited
```

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
entityMap                     OPEN — legacy gets LAST look
stored                        OPEN — split inbound/outbound before reading it
linked                        OPEN — derived placement refuted; owner unproven
readonly / serialization /    OPEN
  diagnostics
final authoring grammar       DEFERRED to one system-wide DX pass
```

## Current frontier

**M3 — snapshot / representation.** The question is *not* "does a snapshot hook
survive" but **"is a realized value's state identifiable by a uniform rule?"**
Six consumers route through one producer; their requirements are unseparated, and
separating them is M3's work, not its premise. The admissible evidence base is
**one** implementation (`entityMap`), three tokens long.

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
