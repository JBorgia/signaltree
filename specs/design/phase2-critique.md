# Phase 2 — Adversarial Critique (full findings)

Coverage matrix and finding detail for the SignalTree audit's Phase 2 lens-pass.

**Activated lenses:** 7 universal + 3 conditional (Process/Workflow, Game Theory, Linguistics/Grammar). 9 conditional lenses not activated (justifications in `.versus/state.json` D13).

## Critical findings (🔴)

### C1 — M1 Static review · Implementability lens
**Failure mode:** 11 surfaces × 5 questions = 55 cells. Single-pass static review by one AI session will exhaust context and produce shallow findings on later surfaces.
**Fix path (Phase 3):** Define a per-surface chunking strategy. Each surface = its own sub-session. Output of each sub-session = JSON rows appended to findings.json + a 200-word "what was checked" summary that survives across sessions.

### C2 — M2 Scaffold-and-build · Scientific lens
**Failure mode:** Bundle-size and DX claims rest on build configuration. Without a locked protocol (production mode, AOT, ivy, tree-shaking, source maps off, gzip-vs-brotli, identical Angular CLI version), comparison numbers are not reproducible by a stranger and findings can't be cited as evidence.
**Fix path (Phase 3):** Author `specs/technical/measurement-protocol.md` covering bundle, runtime, DX-time, and TS-error count measurement. Both implementations must build with identical configs. Protocol committed to the repo before M2 starts.

### C3 — M2 Scaffold-and-build · Game Theory lens
**Failure mode:** Maintainer-AI knows SignalTree's idioms better than NgRx SignalStore's idioms. M2's NgRx implementation is at risk of being a strawman — using non-idiomatic NgRx that makes SignalTree look better than it really does.
**Fix path (Phase 3):** "Second-pair-of-eyes" rule. Before M2 closes, the NgRx implementation is reviewed by a fresh Claude session given only NgRx SignalStore official docs (and explicitly NOT given the SignalTree implementation or the audit context). Reviewer agent must answer "is this idiomatic NgRx? what would you rewrite?" Findings are filed against M2.

### C4 — M3 Adversarial AI test · Assumptions lens
**Failure mode:** "Fresh Claude session given only public docs" is fictional — the model's training data contains Angular state-management knowledge. The session is not naive about the problem space, only about the specific library.
**Fix path (Phase 3):** Control for prior knowledge two ways: (a) explicit prompt scaffold ("you have access only to the linked docs; do NOT draw on memorized libraries; if you reach for an API not in the docs, stop and search the docs again"); (b) document residual risk in the transcript header — "this transcript controls for library-specific recall but not framework-level recall; agent's general Angular Signals fluency was assumed."

### C5 — M4 Benchmark gap-fix · Scientific lens
**Failure mode:** Existing benchmarks may not document machine specs, repetition counts, statistical confidence, or output format. Re-running them fresh produces numbers but no methodology. Findings citing perf become opinion-grade.
**Fix path (Phase 3):** Bench protocol locked in `specs/technical/measurement-protocol.md` (same doc as C2 fix). Required fields: hardware, OS, Node version, Angular version, NgRx SignalStore version, repetition count (≥10), warmup runs, statistical summary (median + p90), output format (JSON), random seed where applicable.

### C6 — M4 Benchmark gap-fix · Game Theory lens
**Failure mode:** Apples-to-apples bench harness can be subtly biased — running SignalTree in its most-optimized mode but NgRx with default settings (or vice versa) produces a misleading delta.
**Fix path (Phase 3):** Bench protocol mandates per-side optimal configuration. Each library declares its "optimal config" as a JSON object committed alongside the bench code. Reviewer (second-pair-of-eyes) confirms each side's config matches the library's official perf recommendations.

## Important findings (🟡)

### M1 Static review

- **(Assumptions)** M1 assumes existing source and docs are honest representations. Risk: zombie examples (docs referencing removed APIs), or strict-mode-dependent claims that fail under loose-mode TS. **Fix:** M1 must verify any API mentioned in docs/JSDoc still exists and behaves as documented; flag mismatches as P0 broken claims.
- **(Scientific)** M1 lacks a static-analysis checklist; findings risk being opinion-grade. **Fix:** define a per-surface checklist (e.g. for `core`: type-depth probe at N=20 levels, callable-vs-getter parity, JSON-init+update round-trip, error message readability).
- **(Performance)** Tier-1 deep audit of `core` (recursive type inference) is multi-day. Risk of runaway. **Fix:** time-box M1 at 5 days; if not done at day 5, ship partial findings and continue M2 in parallel.
- **(Process)** M1 → M2 handoff is informal in current architecture. Risk: M2 starts without M1's findings to inform the scaffold. **Fix:** define a `M1-to-M2-handoff.md` artifact that summarizes M1's observations relevant to scaffold-and-build (which APIs to test, which type-depths to stress).
- **(Linguistics)** Severity definitions (P0/P1/P2/P3) are written but not operationalized with examples. Two reviewers could file the same finding at different severities. **Fix:** add 2–3 worked examples per severity tier in the audit's methodology section.

### M2 Scaffold-and-build

- **(Assumptions)** Audit assumes the nested-entity-editor (invoice + line items) is implementable in BOTH libraries. If NgRx SignalStore can't express deeply-nested editable state cleanly, the comparison is biased before it starts. **Fix:** before M2 commits to the feature, validate NgRx SignalStore can express the invoice schema (or pick a different feature that's fair to both).
- **(Performance)** "DX notes" is soft data — how is DX measured? **Fix:** define DX-notes schema = { time_to_first_compiling_invoice, ts_errors_hit, retries_to_get_typing_right, count_of_workarounds, subjective_1to5_with_rationale }.
- **(Process)** What if M2's SignalTree implementation reveals a P0 bug? Halt or continue? **Fix:** define exception path — if a P0 lands during M2, M2 still ships with the bug-as-finding; audit doesn't halt unless the bug makes the comparison meaningless.
- **(Linguistics)** "Same feature" needs a definitional contract — schema, behavior, edge cases. **Fix:** write `specs/examples/feature-contract.md` that both implementations target.

### M3 Adversarial AI test

- **(Architectural)** M3 is single-pass in the architecture. What if the agent needs 2 sessions to make progress? **Fix:** define how multi-session transcripts are merged (chronological with session-boundary markers; each session attempts the same prompt fresh).
- **(Scientific)** Single session = N=1. Statistically meaningless. **Fix:** run M3 ≥2 times with independent fresh sessions; flag findings only if the failure mode appears in both.
- **(Process)** Loop policy if the agent fails partway. **Fix:** explicit policy = "agent gets 3 retries on any single sub-task; if all 3 fail, mark sub-task as agent-failure-finding and continue."
- **(Game Theory)** Does the agent know it's being tested? Hawthorne risk. **Fix:** prompt does not mention "this is an audit" or "we are evaluating SignalTree." Frame as a normal "build me X" request.
- **(Linguistics)** Prompt given to agent is a contract. **Fix:** prompt is versioned in `specs/examples/m3-prompts/` with hash, so different M3 runs are comparable.

### M4 Benchmark gap-fix

- **(Assumptions)** M4 assumes existing benchmarks can re-run locally. Risk: GPU dependency, specific Node version, CI-only env. **Fix:** M4's first sub-task = verify reproducibility of existing harness on a clean local checkout; if it doesn't reproduce, that itself is a P0 finding.
- **(Architectural)** M4 must produce JSON output (not console logs) so findings.json can cite specific numbers with file:line references. **Fix:** lock JSON output schema in measurement protocol.
- **(Implementability)** Brainstorm + diff + fix + run is 5+ days. T3 stretch. **Fix:** time-box M4 at 5 days; the T3→T2 stop-rule explicitly drops M4 if not on track at week 3.
- **(Process)** When M4 drops, what carries forward? **Fix:** if M4 is dropped, RFC includes an explicit "perf claims unverified — see follow-up cycle" section; existing claims in SignalTree's docs are flagged P0 unless audit-validated.

### M5 RFC synthesis

- **(Assumptions)** M5 assumes findings.json captures everything synthesis needs. Risk: cross-cutting themes invisible per-row. **Fix:** M5 includes a "themes pass" — read findings.json and identify recurring patterns (e.g. "multiple findings in the AI-legibility column point to a single doc-structure problem"). Themes get their own RFC section.
- **(Scientific)** Top-3 redesigns must reference established prior art. **Fix:** each redesign cites at least one prior art (e.g. Pinia stores, Solid stores, Zustand slices, Effector domains) for the API shape it borrows from.
- **(Process)** What if findings.json contains contradictions (rare but possible across workstreams)? **Fix:** M5's first sub-task = conflict-resolution pass; conflicts surface to maintainer for arbitration before synthesis.
- **(Game Theory)** Top-3 ranking risks motivated reasoning toward easy redesigns. **Fix:** ranking criterion documented BEFORE selecting (e.g. "rank by: P0/P1 finding count addressed × estimated adoption-impact ÷ implementation-effort"). Selection follows from criterion mechanically.
- **(Linguistics)** "Concrete redesign" — pseudocode vs real types? **Fix:** each redesign includes compilable TS type signatures, not pseudocode. RFC includes a `signatures.ts` file readers can paste into a tsconfig to see if it type-checks.

## Concentration patterns

- **Scientific rigor (systemic):** 4 of 5 modules have Scientific-lens findings. Resolution = single Audit Rigor Protocol doc (`specs/technical/measurement-protocol.md`) covering measurement, bench protocol, and prior-art citation rules.
- **Adversarial fairness (systemic):** 4 of 5 modules have Game Theory findings. Resolution = "second-pair-of-eyes" rule applied to every NgRx-side artifact (M2 NgRx code, M3 prompt, M4 NgRx bench config), enforced via a fresh Claude session given only NgRx-favoring context.
