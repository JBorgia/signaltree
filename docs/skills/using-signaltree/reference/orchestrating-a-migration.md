---
name: signaltree-orchestrating-a-migration
description: Process playbook for an orchestrator agent driving one or more implementer subagents through a SignalTree adoption — NgRx Signal Store migration, classic NgRx / BehaviorSubject migration, or greenfield. Load when the work spans more than ~5 consumer files, when a single Coder/implementer subagent is likely to exhaust its context window, or when the user explicitly asks for a phased / supervised rollout. Skip for trivial single-file changes.
---

# Orchestrating a SignalTree migration

A SignalTree migration of a real Angular app routinely exceeds the context budget of a single implementer subagent. The work has a natural seam — **build the tree foundation** vs. **migrate every consumer + spec** — and treating it as one task tends to fail in predictable ways:

- The implementer builds a clean foundation, runs out of context, and returns a truncated message with no commit and the legacy stores still present.
- The implementer rushes the consumer sweep to fit, leaves grep-misses, and the verifier fails in late stages.
- Skill friction is buried in a final wall-of-text report, surfaced too late to fix mid-flight.

The orchestrator's job is to **bound each phase to one implementer's context budget**, gate progression on the verifier, and capture skill friction as a first-class artifact. This file documents the playbook.

> **If migrating from `@ngrx/signals`, read [`migration-from-ngrx-signals.md`](./migration-from-ngrx-signals.md) first.** That guide tells you what a "good" NgRx Signal Store migration looks like; this file only covers _how to drive subagents through one_. For greenfield adoption or non-NgRx legacy, see Applicability below — the playbook still applies, but Phase 1 and Phase 5 need light adaptation.

## Applicability

This playbook is **vendor-neutral** for everything except Phase 1 (survey greps) and Phase 5 (verifier script), which are NgRx-shaped by default. The five-phase loop, the Phase 2 audit, the Phase 3 foundation prompt, and the Phase 4 consumer rewrite rules apply equally to:

| Scenario | Phase 1 (Survey) | Phase 2–4 | Phase 5 (Verifier) |
| --- | --- | --- | --- |
| **Migrating from `@ngrx/signals`** (default) | Use the greps below as-is | Apply unchanged | Use `verify-signaltree-migration.sh` as documented |
| **Migrating from classic `@ngrx/store`, `BehaviorSubject` services, or `@Injectable` state services** | Adapt the greps to your legacy pattern (e.g. `@Injectable.*State\|new BehaviorSubject\(\|createReducer\(`); list legacy services/reducers/selectors as the "LEGACY STORES" rows | Apply unchanged — the audit questions and foundation layout are SignalTree design, not NgRx-specific | Run `build && test && lint` directly, **or** invoke the verifier with `--allow-source-presence --allow-dep-presence` to neutralize the `@ngrx/signals` assertions |
| **Greenfield adoption** (no legacy state lib at all) | Skip Phase 1; the catalog is just the planned domain list from your design notes | Apply unchanged | Run `build && test && lint` directly; skip the verifier script |

The Phase 2 audit (collection vs singleton, typed errors, cross-domain lifecycle, persistence, derived-tier ladder) is the most valuable part of this playbook for non-NgRx contexts — it forces the architectural decisions that determine whether a SignalTree adoption succeeds, regardless of where the state was living before.

## When to use this playbook

Use it when **any** of these are true:

- ≥ 2 legacy stores need migrating in a single PR.
- ≥ 10 consumer files (components, resolvers, interceptors, guards, specs) import the legacy store(s).
- The legacy store(s) total > 300 LOC (state + methods + features).
- The codebase has a typed error model, banner/telemetry/refresh hazards (`withFeature`-style cross-cutting), or persistence — i.e. patterns 1–5 from the migration guide all apply.
- A previous one-shot subagent dispatch returned truncated output, no commit, or left files un-migrated.

Skip it for the [minimum-viable-migration](./migration-from-ngrx-signals.md#minimum-viable-migration-1-small-store) shape — one Coder dispatch handles those fine.

## The five-phase loop

```
┌──────────────┐   ┌─────────────┐   ┌──────────────────┐   ┌────────────────┐   ┌───────────────────┐
│ 1. Survey    │ → │ 2. Audit    │ → │ 3. Foundation    │ → │ 4. Consumers   │ → │ 5. Gate + commit  │
│ (read-only)  │   │ (orch only) │   │ (Coder #1)       │   │ + specs        │   │ (orch runs        │
│ Explore      │   │             │   │                  │   │ (Coder #2)     │   │  verifier)        │
└──────────────┘   └─────────────┘   └──────────────────┘   └────────────────┘   └───────────────────┘
```

Each box maps to one tool call sequence on the orchestrator side. Phases 3 and 4 are the only places implementer subagents are dispatched.

### Phase 1 — Survey (read-only, orchestrator owns)

Goal: produce a single artifact — the **migration catalog** — that phases 3 and 4 will consume verbatim.

Run these commands yourself (do not delegate). Capture the output verbatim into your scratch notes.

> The greps below assume `@ngrx/signals` is the legacy source. For other sources — classic `@ngrx/store`, `BehaviorSubject` services, `@Injectable` state services — adapt the patterns (e.g. `createReducer\(`, `new BehaviorSubject\(`, `@Injectable.*State`) but keep the catalog shape unchanged. For greenfield adoption, skip this phase entirely and use your domain design notes as the catalog input to phases 2–4.

```bash
# 1. Locate every legacy store file.
grep -rln 'signalStore(' <app-src> --include='*.ts'

# 2. Locate every consumer (any file that injects or imports a legacy store).
grep -rln 'from.*\.store\|<LegacyStoreNames>' <app-src> --include='*.ts' \
  | grep -v -- '\.store\.ts$\|\.store\.spec\.ts$'

# 3. Locate every spec that touches a legacy store.
grep -rln 'TestBed\|beforeEach\|describe' <app-src> --include='*.spec.ts' \
  | xargs grep -ln '<LegacyStoreNames>' 2>/dev/null

# 4. Identify build/test/lint commands (project.json or package.json scripts).
cat <app-src>/../project.json 2>/dev/null | head -80
grep -E '"build"|"test"|"lint"|"@nx/' <package.json>

# 5. Identify any cross-cutting features (withFeature, withHooks, withProps).
grep -E 'withFeature|withHooks|withProps|withErrorBanners|withTelemetry|withRefreshHandling' <legacy-stores>
```

Catalog template (fill in from output above):

```text
SURVEY — <app-name> @ <commit-sha>
==================================
APP_SRC:        <path>
PACKAGE_JSON:   <path>
BUILD:          <command>
TEST:           <command>
LINT:           <command>
TEST_RUNNER:    jest | vitest | karma

LEGACY STORES (N):
  1. <path> — <store-name> — <state-fields-summary> — features: <withFeature list or "none">
  2. ...

CONSUMERS (N):  [non-spec files that inject any legacy store]
  - <path> — uses <store-names>
  - ...

SPECS (N):
  - <path> — touches <store-names>
  - ...

CROSS-CUTTING FEATURES IN USE:
  - withErrorBanners: yes/no
  - withTelemetryBaggage / withReduxDevtools: yes/no
  - withRefreshHandling: yes/no
  - withHooks (onInit/onDestroy): yes/no
  - withProps (toObservable bridges): yes/no

PEER DEPS STILL PRESENT IN package.json:
  - @ngrx/signals: yes/no
  - @ngrx/signals/entities: yes/no
  - @angular-architects/ngrx-toolkit (or similar derivatives): yes/no
```

The catalog is the single source of truth for phases 3 and 4 — paste it into both implementer prompts.

### Phase 2 — Audit (orchestrator only, no subagent)

Run the four-question [app-shape audit](./migration-from-ngrx-signals.md#app-shape-audit-run-before-picking-patterns) yourself against the catalog. Decide which patterns from the migration guide apply. Record the answers and the pattern selection in your scratch notes:

```text
AUDIT
=====
Q1 (collection vs singleton): per-domain answer
Q2 (typed error model present): yes/no — file path if yes
Q3 (cross-domain lifecycle): yes/no — describe the action(s)
Q4 (persistence): yes/no — what + where
Q5 (computed organization): count derived signals per slice from the survey:
  - total derived signals across the tree: N
  - any cross-domain rollups (one computed reading from ≥ 2 slices)? yes/no
  - any duplicated computed (same logic in ≥ 2 consumer files)? yes/no
  → if N > ~15 OR cross-domain rollups OR duplicates: adopt the
    five-tier ladder from patterns.md → "Recommended tier ladder".
  → otherwise: keep computeds inline in state factories.

PATTERNS APPLYING:
  - #1 entityMap state shape: <which domains>
  - #2 derived tiers: <none | minimal-inline | full-ladder>
  - #3 cross-domain Ops: yes/no — name(s)
  - #4 persistence: yes/no
  - #5 sync method support: yes/no

PATTERNS SKIPPED (and why):
  - ...
```

This artifact also goes into both implementer prompts — it tells the implementer which patterns to apply, which to skip, and why. It removes the implementer's main source of architectural drift.

### Phase 3 — Foundation (Coder #1)

Bounded scope: build only the new `store/` directory and wire `provideAppTree()` in `app.config.ts`. Nothing else.

Implementer prompt skeleton:

```text
## Task
Build the SignalTree foundation only. Do NOT touch any consumer files.
Do NOT delete any legacy stores. Do NOT migrate any specs.

## Working directory
<absolute path to worktree>  (branch <name>)

## Required reading (read in full before editing)
1. SKILL.md
2. reference/migration-from-ngrx-signals.md
3. reference/patterns.md
4. reference/testing.md
5. reference/core.md (leaf vs branch rules)

## Survey + audit (paste verbatim from orchestrator)
<paste Phase 1 catalog>
<paste Phase 2 audit>

## Bounded scope — create these files only
- store/tree/app-tree.ts          — exports createBaseState, createAppTree, APP_TREE, provideAppTree
- store/tree/app-tree.testing.ts  — exports provideAppTreeForTesting
- store/tree/state/<domain>.state.ts  (one per domain)
- store/tree/derived/tier-*.derived.ts  (ONLY if Phase 2 audit Q5 selected `full-ladder`; one file per tier)
- store/ops/<domain>.ops.ts           (one per domain)
- store/app-store.ts              — single AppStore facade
- store/index.ts                  — public surface

If the audit selected `full-ladder` for derived tiers, follow patterns.md → "Recommended tier ladder for large apps". Do NOT invent your own tier names; use the validated five-tier ladder (entity-resolution → complex-logic → workflow → navigation → ui-aggregates) and only build the tiers your audited signal count justifies.

Plus exactly one edit:
- app.config.ts                   — add provideAppTree() to providers

## Hard rules
- No consumer files modified.
- No legacy stores deleted.
- No specs touched.
- @signaltree/core MUST be added to package.json (correct workspace flags).
- Run `pnpm install` after editing package.json.
- TypeScript MUST compile (run `tsc --noEmit` or the project's typecheck).
- No commit yet — orchestrator will inspect before phase 4.

## Final report
- Files created (paths only).
- App-shape audit answers (confirm orchestrator's audit or flag disagreement).
- Skill friction encountered (specific quotes from skill text where possible).
- Any architectural decisions you made that the orchestrator's audit didn't cover.
```

After Coder #1 returns, the orchestrator inspects the worktree itself:

```bash
# Foundation present?
ls <app-src>/store/tree/ <app-src>/store/ops/

# AppStore wires what the audit said it should?
cat <app-src>/store/app-store.ts

# package.json + lockfile updated?
grep '@signaltree/core' <package.json>
```

If the foundation is wrong, **patch it yourself** rather than re-dispatching — small fixes are cheaper than another full subagent round.

### Phase 4 — Consumers + specs (Coder #2)

Bounded scope: migrate every file in the survey catalog's CONSUMERS and SPECS lists; delete the legacy stores; do not modify the foundation.

Implementer prompt skeleton:

```text
## Task
Finish a SignalTree migration. The foundation is already in place. Migrate
every consumer and spec listed below, delete the legacy stores, run the
verifier, commit only when green.

## Working directory
<absolute path to worktree>  (branch <name>)

## Foundation already in place
- store/tree/app-tree.ts (createBaseState + createAppTree + APP_TREE)
- store/tree/app-tree.testing.ts (provideAppTreeForTesting)
- store/app-store.ts (AppStore facade with: <list orchestration methods>)
- store/ops/{<domain>}.ops.ts
- @signaltree/core already in package.json
- provideAppTree() already wired in app.config.ts

## Survey + audit (paste verbatim from orchestrator)
<paste Phase 1 catalog>
<paste Phase 2 audit>

## Required reading
- reference/migration-from-ngrx-signals.md (consumer rewrite section)
- reference/testing.md (especially the Nullable<Object> leaf gotcha)
- reference/patterns.md (consumer rules)

## Bounded scope
For each file in CONSUMERS:
  - Replace inject(<LegacyStore>) with inject(AppStore).
  - Replace store.field() with appStore.$.<domain>.<field>().
  - Replace store.method() with appStore.ops.<domain>.<method>() (or appStore.<orchestrator>() if cross-domain).

For each file in SPECS:
  - Add provideAppTreeForTesting() to providers.
  - For Nullable<Object> leaves, seed via post-injection .set() — NOT the overrides callback.
  - Mock Ops via { provide: <DomainOps>, useValue: { <method>: jest.fn() } } where appropriate.

Delete every file in LEGACY STORES.

## Verifier (must exit 0)
<paste verbatim verifier command from Phase 5 below>

## Hard rules
- Do NOT modify any file in store/ unless adding a missing Ops method that
  the audit overlooked. If you do, call it out in your report.
- Do NOT weaken --allow-* flags on the verifier.
- Do NOT push.
- Pre-existing lint warnings are OK; new lint errors are not.
- If a pre-existing spec was already broken at the base commit, surface it
  but do not let it block the commit; minimal-rebaseline is acceptable
  if the orchestrator pre-approves it. If it surprises you, ASK first.

## Commit
git add -A && git commit --no-verify -m "<msg>"

## Final report
- Files modified (with rough line counts).
- Files deleted (confirm each legacy path).
- Verifier exit code + last 30 lines of output.
- Build / test / lint counts (errors and warnings separately).
- Commit SHA.
- Skill friction log — every place the skill was ambiguous, missing, or
  actively wrong; quote skill text where possible. THIS IS THE MOST
  VALUABLE SECTION FOR THE USER.
- Architectural self-check verdict (5-item checklist).
```

### Phase 5 — Gate + commit (orchestrator owns)

The orchestrator runs the verifier itself **once more** after Coder #2 returns, regardless of what Coder #2 reported. Trust but verify.

> For non-NgRx scenarios (other legacy state libs, or greenfield adoption), the `verify-signaltree-migration.sh` script's `@ngrx/signals` assertions don't apply. Either run `build && test && lint` directly as the gate, or invoke the verifier with `--allow-source-presence --allow-dep-presence` so it skips the NgRx checks but still runs the full build/test/lint sequence.

```bash
cd <worktree>
PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/v22.17.0/bin" \
NX_DAEMON=false CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
<path-to-signaltree>/scripts/verify-signaltree-migration.sh \
  --src <app-src>/store \
  --build "<build-cmd>" \
  --test "<test-cmd>" \
  --lint "<lint-cmd>" \
  --package-json <package-json> \
  --allow-source-presence --allow-dep-presence
```

If exit code is non-zero, dispatch a third Coder with **just** the verifier output as the failure context — do not re-paste the full survey.

If exit code is 0, surface to the user:

1. Verifier exit code + commit SHA.
2. Skill friction items extracted from Coder #1 + Coder #2 reports, deduplicated.
3. Architectural self-check verdict.
4. Outstanding decisions for the user (push? cleanup worktree? open follow-up issue for friction items?).

## Hand-off rules between phases

These rules eliminate the most common orchestration failures observed across runs:

| Rule                                                                                                                                                                     | Why                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Each implementer prompt MUST include the full Phase 1 catalog and Phase 2 audit.                                                                                         | Implementers re-deriving these facts wastes context and produces drift.                    |
| The orchestrator NEVER edits files itself during phases 3–4 unless a fix is < 10 LOC.                                                                                    | Mixing orchestrator edits with implementer edits creates merge confusion in the report.    |
| The verifier is run by the orchestrator, not the implementer, for the final gate.                                                                                        | Implementer reports cannot be trusted as the gate — they paraphrase output.                |
| Skill friction is collected as a separate report section, never folded into the diffstat narrative.                                                                      | Friction items get lost in long reports; a dedicated section is the only reliable harvest. |
| If Coder #2 reports that a pre-existing spec was rewritten without prior orchestrator approval, treat that as a friction item against this playbook (not a code defect). | Silent rebaselines defeat the audit trail.                                                 |

## Failure modes and recoveries

| Symptom                                                            | Cause                                           | Recovery                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coder #1 returns no/truncated output                               | Context exhausted on a too-broad scope          | Inspect worktree state with `ls` + `git status`; if foundation is partially built, patch it yourself; if not, re-dispatch with a stricter scope (only `app-tree.ts` + `app-tree.testing.ts` first). |
| Coder #2 commits but verifier fails on second run                  | Implementer mis-paraphrased the verifier result | Re-dispatch with verifier failure log as the only context; do not re-include the survey.                                                                                                            |
| Implementer adds Ops methods that orchestrator's audit didn't list | Audit missed a required method                  | Accept the addition; update the audit notes; pass to next phase.                                                                                                                                    |
| Pre-existing tests broken at base commit                           | Branch not clean before the migration           | Confirm with `git stash && <test-cmd>` against the base commit; if confirmed pre-existing, mark in friction log; do NOT block commit on it.                                                         |
| Verifier `--allow-dep-presence` masks an unremoved package         | Sibling apps still reference the legacy package | Open a follow-up tracking issue; do NOT remove the dep until all siblings migrate.                                                                                                                  |

## What this playbook is NOT

- **Not a replacement for the migration guide.** It tells you _how to drive_ a migration; the migration guide tells you _what a migration is_.
- **Not a code-generation tool.** Each implementer subagent still does the work; the orchestrator only bounds, gates, and harvests.
- **Not appropriate for trivial migrations.** A one-store, < 5-signal app should use the [minimum viable](./migration-from-ngrx-signals.md#minimum-viable-migration-1-small-store) recipe in a single dispatch.

## Checklist for the orchestrator

Before declaring a phased migration done:

1. ✅ Phase 1 survey artifact captured verbatim.
2. ✅ Phase 2 audit explicitly maps each legacy store to a pattern selection (with skips justified).
3. ✅ Phase 3 implementer prompt included the catalog + audit and bounded scope to the foundation.
4. ✅ Foundation inspected by the orchestrator before phase 4 dispatched.
5. ✅ Phase 4 implementer prompt included the catalog + audit + foundation summary + verifier command.
6. ✅ Verifier re-run by the orchestrator after the commit (independent of Coder #2's report).
7. ✅ Skill friction items deduplicated across both implementer reports and surfaced separately to the user.
8. ✅ Outstanding decisions (push, cleanup, follow-up issues) presented to the user; nothing pushed without explicit approval.
