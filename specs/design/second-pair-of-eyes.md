# Second-Pair-of-Eyes Rule (Phase 3 cross-cutting fix)

Resolves Phase 2 critical findings **C3** (M2 NgRx-strawman risk), **C6** (M4 apples-to-apples bench config), plus the systemic Game-Theory-lens concentration. Applies to every NgRx-side artifact in the audit.

## Why this exists

The audit is run by the maintainer's own AI. The maintainer-AI has stronger fluency with SignalTree than with NgRx SignalStore. Without a structural countermeasure, every NgRx-side artifact is at risk of being a strawman — non-idiomatic NgRx that makes SignalTree look better than it actually does.

This is **not** a hypothetical risk. It is the predictable failure mode of any audit where one side has a fluency advantage.

## The rule

For every artifact in the audit that represents the **NgRx side** of the comparison, a fresh second-pair Claude session reviews the artifact before it counts as evidence. The reviewer session is given:

- Only NgRx SignalStore official docs (https://ngrx.io/guide/signals)
- Only the NgRx-side artifact under review (the SignalTree side is **not** shared)
- No SignalTree context, no audit context, no Phase 0/1 decisions

The reviewer answers two questions:

1. **Idiomatic check.** "Is this idiomatic NgRx SignalStore? If not, what would you rewrite?"
2. **Steel-man check.** "What is the strongest version of this implementation/config/prompt? What is the artifact missing that an experienced NgRx user would add?"

Reviewer findings are filed against the audit (against the artifact's own module), not against SignalTree. They become 🔴/🟡 findings in the audit's iteration log.

## Artifacts subject to the rule

| # | Artifact | Module | When reviewer runs |
|---|---|---|---|
| A1 | NgRx SignalStore implementation of nested-entity-editor | M2 | After M2's NgRx code passes type-check and runs the feature |
| A2 | NgRx SignalStore optimal-config JSON for benchmarks | M4 | Before benchmark run starts |
| A3 | NgRx SignalStore section of any prompt given to the M3 AI agent | M3 | Before M3 prompt is finalized |
| A4 | Any NgRx perf claim or DX claim that lands in findings.json | M2/M4/M5 | Before the finding row is committed |

## Reviewer-prompt template

Stored at `specs/design/reviewer-prompt-template.md` (to be authored alongside the M2 NgRx implementation). Skeleton:

> You are reviewing an NgRx SignalStore implementation for idiomatic correctness. You have access only to https://ngrx.io/guide/signals and the artifact below. Do NOT use general-purpose state management knowledge — restrict yourself to NgRx SignalStore patterns documented in the linked URL.
>
> [artifact pasted here]
>
> Answer:
> 1. Is this idiomatic NgRx SignalStore? If not, list specific deviations.
> 2. What would you rewrite to make it more idiomatic? Provide concrete code suggestions.
> 3. What is the artifact missing that an experienced NgRx user would add?

## Failure modes the rule does NOT cover

- **Reviewer's own fluency gap.** If the second-pair Claude is also weaker on NgRx than on SignalTree, the review is symmetric but not corrective. Mitigation: reviewer is fed the latest NgRx docs explicitly and instructed not to use memorized knowledge. Residual risk acknowledged.
- **Adversarial collusion.** Both sessions are the same model. Possible they share blind spots. Mitigation: the audit's full top-3 redesigns are also reviewed by the human maintainer, who is the final arbiter (per Versus methodology — operator validates trade-offs).
- **Reviewer-as-rubber-stamp.** If the reviewer prompt is too leading, it returns "looks idiomatic" without engaging. Mitigation: prompt explicitly asks for deviations and concrete rewrites — not yes/no.

## What this rule does NOT do

- It does **not** check the SignalTree side. SignalTree-side fairness is the responsibility of the maintainer + the existing audit lenses.
- It does **not** validate correctness of the feature being implemented — only idiomatic-ness of the NgRx expression of it.
- It does **not** block M2/M3/M4 if the reviewer flags issues. Reviewer findings are themselves audit findings; they get triaged with everything else.
