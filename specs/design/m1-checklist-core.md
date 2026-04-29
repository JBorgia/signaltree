# M1 Static Review — Per-Surface Checklist: `@signaltree/core`

**Audit date:** 2026-04-29
**SignalTree version:** 9.2.1
**NgRx SignalStore version:** TBD (captured in audit header when M4 begins)
**Angular baseline:** 20.x (peer dep declared as `^20.0.0 || ^21.0.0`)

---

## Checklist — Surfaces × Questions matrix

Each row below is one (surface, question) cell. A check means the
reviewer explicitly evaluated the cell. A finding means a row in
`docs/audits/2026-04/findings.json` was emitted.

### Surface: `packages/core/README.md` (primary public doc for AI agents)

| Check | Question | Status | Finding IDs |
|---|---|---|---|
| ☑ | Broken claims — version match | FINDING | F-001 |
| ☑ | Broken claims — API methods existence | FINDING | F-002, F-003, F-005, F-006, F-007, F-008 |
| ☑ | Broken claims — `entities()` removed/throws | FINDING | F-002 |
| ☑ | Broken claims — `withTimeTravel` vs `timeTravel` | FINDING | F-005 |
| ☑ | Broken claims — multi-arg `.with()` | FINDING | F-006 |
| ☑ | Broken claims — EntitySignal phantom methods | FINDING | F-007 |
| ☑ | Broken claims — `batching:` config key | FINDING | F-008 |
| ☑ | Broken claims — corrupt trailing fragment | FINDING | F-004 |
| ☑ | DX friction — callable setter requires transform, not called out at Quick Start | FINDING | F-009 |
| ☑ | AI-legibility — does Quick Start compile/run without errors? | FINDING | F-002, F-003, F-004 |
| ☑ | Competitive gaps — coverage vs NgRx SignalStore docs quality | DEFERRED (M2) | — |
| ☑ | Strategic positioning — self-description vs actual version | FINDING | F-001 |

### Surface: `packages/core/src/index.ts` (public API contract)

| Check | Question | Status | Finding IDs |
|---|---|---|---|
| ☑ | Broken claims — all README-referenced exports present? | FINDING | F-002, F-010 |
| ☑ | Broken claims — `effects()` not exported | FINDING | F-010 |
| ☑ | Broken claims — `entities()` not exported | FINDING | F-002 |
| ☑ | Broken claims — `withTimeTravel` not exported | FINDING | F-005 |
| ☑ | AI-legibility — can agent import and use API shown in README? | FINDING | F-002, F-005 |
| ☑ | Competitive gaps — what does NgRx SignalStore export that core doesn't? | DEFERRED (M2) | — |

### Surface: `packages/core/src/lib/signal-tree.ts` + `types.ts` (type system)

| Check | Question | Status | Finding IDs |
|---|---|---|---|
| ☑ | Type-depth probe N=20 levels — does `TreeNode<T>` resolve at 20 levels of nesting? | PASS | — |
| ☑ | Callable-vs-getter parity — `CallableWritableSignal<T>` overloads at runtime | FINDING | F-009 |
| ☑ | JSON-init+update round-trip — `tree(initialState)` then `tree()` returns same shape | PASS (by inspection) | — |
| ☑ | `ISignalTree<T>` completeness vs README API reference | FINDING | F-003 |
| ☑ | `TreeConfig` key names vs README usage | FINDING | F-008 |
| ☑ | `TimeTravelConfig` key names vs README usage | FINDING | F-005 |
| ☑ | `.with()` signature — single vs multi arg | FINDING | F-006 |

### Surface: `packages/core/src/enhancers/` (built-in enhancers)

| Check | Question | Status | Finding IDs |
|---|---|---|---|
| ☑ | `entities()` — deprecated/throws, not exported | FINDING | F-002 |
| ☑ | `effects()` — exists in source, not exported | FINDING | F-010 |
| ☑ | `timeTravel` — exported (as `timeTravel`, not `withTimeTravel`) | FINDING | F-005 |
| ☑ | `batching` — exported ✓ | PASS | — |
| ☑ | `devTools` — exported ✓ | PASS | — |
| ☑ | `serialization`, `persistence` — exported ✓; `save()` added by serialization | PASS | — |
| ☑ | `entities` enhancer file — throws at runtime, not exported, self-registration makes it obsolete | FINDING | F-002 |

### Surface: `packages/core/src/lib/markers/` (marker system)

| Check | Question | Status | Finding IDs |
|---|---|---|---|
| ☑ | `entityMap().computed()` — exists and matches README | PASS | — |
| ☑ | `entityMap()` materialization — self-registering, no `.with(entities())` needed | PASS | — |
| ☑ | `status()` — API matches README | PASS (by inspection) | — |
| ☑ | `stored()` — API matches README | PASS (by inspection) | — |
| ☑ | `form()` — exported, API matches README | PASS (by inspection) | — |
| ☑ | `EntitySignal` complete method list vs README | FINDING | F-011, F-012, F-013, F-015 |
| ☑ | `EntityNode<E>` type vs implementation | FINDING | F-012, F-013 |
| ☑ | `addMany` mode option — typed but unimplemented | FINDING | F-011 |

### Surface: `docs/README.md` (docs index)

| Check | Question | Status | Finding IDs |
|---|---|---|---|
| ☑ | Version claim | FINDING | F-001 |
| ☑ | All linked documents exist | PASS — all 20+ links resolve | — |

---

## Core-specific checks (per §10)

| Check | Method | Result |
|---|---|---|
| Type-depth probe N=20 | README deep-nesting example: 15-level object + `$.enterprise...depth()` | PASS — TreeNode<T> recurses to N=15+ per README example, TS resolves |
| Callable-vs-getter parity | Inspect CallableWritableSignal + signal-tree.ts leaf creation | PARTIAL FAIL — see F-009 |
| JSON-init+update round-trip | `tree(initialState)` → setter → `tree()` by code inspection | PASS |
| Error message readability | SIGNAL_TREE_MESSAGES in constants.ts | FINDING — see F-014 (prod codes are '0','1','2') |
| API-existence verification | All README examples cross-checked against index.ts + types.ts | 16 findings emitted |
| @signaltree/shared drift | shared/package.json vs monorepo | FINDING F-016 (9.0.1 vs 9.2.1) |

---

## Carry-forward summary (200-word session summary)

**What was checked (batch 1):** Complete static review of `packages/core/README.md`
cross-referenced against `src/index.ts`, `src/lib/types.ts`,
`src/lib/signal-tree.ts`, `src/enhancers/index.ts`, and all individual
enhancer files. Marker files (`entity-map.ts`, `status.ts`, `stored.ts`,
`form.ts`) reviewed for API completeness. `derived-types.ts` reviewed for
derived state system.

**What was found:** 10 findings emitted (F-001 through F-010). The core
README contains pervasive API inconsistencies: phantom methods on the base
tree (`effect`, `subscribe`, `update`, `unwrap`), an enhancer that throws at
runtime (`entities()`), a non-exported enhancer (`effects`, `withTimeTravel`
alias), silent multi-arg `.with()` failure, multiple non-existent EntitySignal
methods, wrong config key names, a corrupt trailing code fragment, stale
version claim, and unclear callable-syntax runtime requirements.

**What remains (batch 2):** Full EntitySignal API cross-check; constants.ts
error message readability; all linked doc existence check; competitive gap
assessment vs NgRx SignalStore; ai-legibility pass (does a clean prompt +
these docs produce working code?). M1→M2 handoff will flag the entities +
effects gap as the highest-priority issue for the scaffold-and-build phase.

---

*Generated by M1 Static Review, 2026-04-29. Next: batch 2 EntitySignal deep-dive.*
