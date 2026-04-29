# Audit Architecture (Phase 1 output)

This is the architecture for the **2026-04 SignalTree audit** itself, not for SignalTree.

## 1. Decomposition — Surfaces × Questions matrix

### Surfaces (rows)

| Tier | Surface |
|---|---|
| T1 deep | `@signaltree/core` |
| T2 light | `@signaltree/callable-syntax`, `@signaltree/enterprise`, `@signaltree/ng-forms`, `@signaltree/events`, `@signaltree/guardrails`, `@signaltree/realtime` |
| Doc surface (in scope) | README + landing docs, API ref + JSDoc, tutorials / migration guides / recipes, examples app(s) + benchmarks |
| Out of scope | `@signaltree/shared` (internal; flag version drift only), Akita/NGXS/Elf comparisons, zoneless/SSR/hydration deep dive |

### Questions (columns)

1. **Broken claims** — does the docs/README/pitch overstate vs reality?
2. **DX friction on golden path** — what trips a new user in the first 30 minutes?
3. **AI-legibility for agents** — would a fresh Cursor/Claude/Copilot session actually use this?
4. **Competitive capability gaps** — what does NgRx SignalStore (and reasonable comparators) ship that SignalTree doesn't?
5. **Strategic positioning** — why won't an honest evaluator pick this even when it's technically the right choice?

Each (surface, question) cell is a finding bucket. Empty cells are valid findings of "no gap detected."

## 2. Interfaces — Findings DB is the universal contract

All workstreams produce rows in `docs/audits/2026-04/findings.json`:

```json
{
  "id": "F-001",
  "surface": "core",
  "question": "broken-claims",
  "severity": "P0|P1|P2|P3",
  "evidence_refs": [
    "packages/core/src/lib/recursive-types.ts:142",
    "specs/examples/signaltree/invoice-editor/notes.md#deep-update-fail"
  ],
  "proposed_action": "...",
  "status": "open|verified|deferred|rejected"
}
```

The RFC (`docs/audits/2026-04/rfc.md`) reads only from `findings.json` plus manually-authored synthesis sections (executive summary, methodology, top-3 redesigns). Scaffold-and-build artifacts and AI-agent transcripts live as evidence files; they are referenced by `evidence_refs[]`, never inlined into RFC prose.

## 3. Workstream sequencing (3 methods, serial)

```
[Static review of source + docs]
            │
            ▼
[Scaffold-and-build: nested entity editor (invoice + line items)
  in SignalTree AND NgRx SignalStore — line counts, bundle, DX notes]
            │
            ▼
[Adversarial AI-agent test: fresh Claude session given only public docs,
  asked to build the SAME feature; transcript captured]
            │
            ▼
[Synthesis: findings.json + RFC narrative + top-3 concrete redesigns]
```

Why this order: static review surfaces obvious gaps and seeds realistic feature prompts. Scaffold-and-build proves the feature is buildable so the AI test can be apples-to-apples. AI test runs last so any agent failure localizes the AI-legibility gap (rather than a feature-spec gap).

## 4. Cross-cutting principles (all four bound)

1. **Evidence-first** — no claim in findings without a reproduction (file:line, command output, AI transcript line, or scaffold diff). Bare assertions get bounced.
2. **Apples-to-apples** — every NgRx comparison uses NgRx SignalStore current version (not classic NgRx); same Angular 20.x; production builds; tree-shaking applied. If a comparison can't be apples-to-apples, the audit must say so explicitly.
3. **Steel-man before strike** — every P0/P1 finding must restate the strongest possible defense of the current design before being filed. Protects against motivated reasoning in either direction (the audit is run by the maintainer's own AI).
4. **Reproducible by stranger** — every artifact (scaffold-and-build folder, AI transcript) includes its own setup README. Works for someone with no prior context.

## 5. Assumptions (locked; re-verify before RFC ships)

| # | Assumption | If wrong |
|---|---|---|
| A1 | Angular 20.x is the comparison baseline | If SignalTree only supports older Angular, that is itself a P0 finding |
| A2 | NgRx SignalStore current version is the comparison target | Versions captured in audit header |
| A3 | AI coding agents are the primary adoption channel for new libraries in 2026 | If wrong, severity tiers must be re-tuned before RFC ships — AI-legibility weights drop |

Deliberately **not** locked: "maintainer is solo/part-time." Audit may surface findings whose fix is larger than 1 week.

## 6. Negative scope (deliberately NOT covered)

- Direct head-to-head comparisons against Akita, NGXS, or Elf (only NgRx SignalStore is the comparator)
- Deep audit of `@signaltree/shared` (internal-only; version drift flagged)
- Code refactors / PRs against SignalTree (this cycle is findings + proposals only; implementation is a follow-up cycle)

In scope but **light**: zoneless/SSR/hydration sanity-check (confirm SignalTree doesn't error in zoneless mode; no deep transferState or SSR-streaming review).

## 7. Workstream modules

| Module | Responsibility | Output |
|---|---|---|
| **M1: Static review** | Read source + docs across all in-scope surfaces; identify discrepancies, dead code, type-claim breakages, doc inaccuracies | findings.json rows (initial) |
| **M2: Scaffold-and-build** | Implement nested entity editor (invoice + line items) in SignalTree AND NgRx SignalStore; capture line counts, bundle size, DX notes | `specs/examples/{signaltree,ngrx-signal-store}/` + findings.json rows + evidence files |
| **M3: Adversarial AI test** | Fresh Claude session given only public docs; asked to build the same feature M2 built; transcript captured | AI transcript file + findings.json rows |
| **M4: Benchmark gap-fix** | Brainstorm what an honest audit *should* benchmark; diff against existing harness; fix gaps; run comparisons | Updated benchmarks + findings.json rows |
| **M5: RFC synthesis** | Read findings.json; write executive summary, methodology, surface sections, top-3 concrete redesigns; ensure version-anchored header | docs/audits/2026-04/rfc.md |

## 8. Stop-rule (T3 → T2 fallback)

Feasibility = T3 Full RFC (3–4 weeks). At the end of week 3, if T3 isn't on track, drop to T2: skip M4 benchmark gap-fix and skip the full top-3 redesigns; ship light proposed-actions instead. Either way, ship.

---

# V(N+1) — Phase 3 integrated updates

Phase 2 produced 6 🔴 critical and 23 🟡 important findings ([phase2-critique.md](phase2-critique.md)). Phase 3 integrates the responses into the architecture below. **Module count unchanged (5). Scope unchanged. Two cross-cutting protocols added; per-module hardening below.**

## 9. Cross-cutting protocols (new)

| Doc | Resolves | Applies to |
|---|---|---|
| [`specs/technical/measurement-protocol.md`](../technical/measurement-protocol.md) | C2, C5, M2-Performance, M4-Architectural, M5-Scientific (systemic Scientific lens) | M2 (bundle), M4 (bench), M5 (citation rules) |
| [`specs/design/second-pair-of-eyes.md`](second-pair-of-eyes.md) | C3, C6, M3-Game Theory (systemic Game Theory lens) | Every NgRx-side artifact across M2, M3, M4 |
| [`specs/design/severity-examples.md`](severity-examples.md) | M1-Linguistics + protects P0–P3 from severity inflation | All workstreams writing to findings.json |

## 10. Per-module hardening (V(N+1))

### M1 Static review
- **Per-surface chunking strategy** (resolves C1): each surface is its own sub-session. Output of each = JSON rows + 200-word "what was checked" carry-forward summary. No single session attempts the full 11×5 matrix.
- **Per-surface checklist** authored before review (resolves M1-Scientific): for `core` — type-depth probe at N=20 levels, callable-vs-getter parity, JSON-init+update round-trip, error message readability.
- **5-day time-box** (resolves M1-Performance): partial findings ship at day 5; M2 starts in parallel rather than blocking.
- **M1→M2 handoff artifact** at `specs/design/m1-to-m2-handoff.md` (resolves M1-Process).
- **API-existence verification** for any docs example (resolves M1-Assumptions).

### M2 Scaffold-and-build
- **Pre-validate NgRx SignalStore can express the invoice schema** before M2 commits to the feature (resolves M2-Assumptions).
- **Build config per measurement-protocol.md** (resolves C2).
- **DX-notes schema locked** (resolves M2-Performance — see measurement-protocol §4).
- **Feature-contract document** at `specs/examples/feature-contract.md` (resolves M2-Linguistics).
- **Exception path:** if a P0 lands during M2, M2 still ships with the bug-as-finding; audit doesn't halt unless the bug makes the comparison meaningless (resolves M2-Process).
- **Second-pair-of-eyes review** of NgRx implementation (resolves C3).

### M3 Adversarial AI test
- **Prior-knowledge control:** explicit prompt scaffold ("you have access only to linked docs; do NOT draw on memorized libraries"); transcript header documents residual risk (resolves C4).
- **≥2 fresh sessions** for N>1 (resolves M3-Scientific). Findings flagged only when the failure mode appears in both.
- **Multi-session merge protocol:** chronological with session-boundary markers; each session attempts the same prompt fresh (resolves M3-Architectural).
- **Retry policy:** 3 retries per sub-task; 3 fails = agent-failure-finding (resolves M3-Process).
- **Hawthorne control:** prompt does not mention "audit" or "evaluation" (resolves M3-Game Theory).
- **Versioned prompt artifacts** at `specs/examples/m3-prompts/` with hashes (resolves M3-Linguistics).
- **Second-pair-of-eyes review** of any NgRx-mention in M3 prompts (resolves cross-cut).

### M4 Benchmark gap-fix
- **Bench protocol per measurement-protocol.md §2** (resolves C5).
- **Reproducibility verification first** as M4 sub-task 1 (resolves M4-Assumptions).
- **JSON output mandatory** (resolves M4-Architectural).
- **5-day time-box** + drop-out path: if not done at week 3, M4 drops; RFC marks "perf claims unverified — see follow-up cycle" (resolves M4-Implementability + M4-Process).
- **Per-side optimal-config declaration** + second-pair-of-eyes review (resolves C6).

### M5 RFC synthesis
- **Themes pass** added as first sub-task — read findings.json, identify recurring patterns (resolves M5-Assumptions).
- **Prior-art citations** required per redesign (resolves M5-Scientific — see measurement-protocol §3).
- **Conflict-resolution sub-task** before synthesis (resolves M5-Process). Conflicts surface to maintainer for arbitration.
- **Top-3 ranking criterion** documented BEFORE selection — `(P0/P1 finding count addressed) × (estimated adoption-impact) ÷ (implementation-effort)` (resolves M5-Game Theory).
- **Compilable TS signatures** in redesigns; `signatures.ts` paste-into-tsconfig sanity check (resolves M5-Linguistics).

## 11. Anti-scope-creep verification

Phase 3 changes are protocol additions, not feature additions. The audit still:

- Decomposes by Surfaces × Questions matrix
- Produces `findings.json` + `rfc.md`
- Uses the four bound principles (evidence-first, apples-to-apples, steel-man, reproducible-by-stranger)
- Targets 3–4 weeks (T3) with drop-to-T2 stop-rule
- Holds the same negative scope (no Akita/NGXS/Elf compare; no shared deep audit; no code refactors this cycle)
- Answers the same central question: "why does an AI coding agent reach for NgRx instead of SignalTree?"

No requirement was cut. No feature was added. WHAT the audit does is unchanged — only HOW the audit guards its own rigor and fairness has hardened.
