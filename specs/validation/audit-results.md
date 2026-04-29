# Audit Validation Results — 2026-04 Cycle

---

## v2.0 — RFC-1 README Overhaul

**Cycle:** v2.0  
**Completed:** 2026-04-29  
**Scope:** Documentation corrections only — packages/core/README.md and docs/README.md  

### Expected vs Obtained

| Deliverable | Expected | Obtained | Status |
|---|---|---|---|
| F-001 resolved | withTimeTravel → timeTravel everywhere | 13 replacements; 0 remaining | ✅ |
| F-002 resolved | All .with(entities()) functional calls removed | 0 code calls remain (1 comment-only artifact cleaned up) | ✅ |
| F-003 resolved | All 4 phantom tree-root methods removed | tree.update/effect/subscribe/unwrap all removed | ✅ |
| F-004 resolved | Corrupt fragment deleted | 6 orphaned lines removed | ✅ |
| F-005 resolved | maxHistory: → maxHistorySize: | 1 replacement; withTimeTravel removed simultaneously | ✅ |
| F-006 resolved | Multi-arg .with(a(),b()) → chained calls | 4 instances rewritten to chained form | ✅ |
| F-007 resolved | Old entity API (setMany/selectBy/selectTotal/selectIds/selectAll) gone; new API present | 0 old symbols; setAll/where/count/ids/all all present | ✅ |
| F-008 resolved | batching: false → batchUpdates: false | 1 replacement | ✅ |
| F-009 resolved | Callable syntax caveat before first setter | Caveat block with .set()/.update() fallbacks inserted | ✅ |
| F-015 resolved | Entity signal return-type comments corrected | Signal<E[]> vs E[] distinction added | ✅ |
| docs/README.md version | 7.6.0 → 9.2.1 | Corrected | ✅ |
| Automated verification | 25/25 checks pass | 25/25 pass | ✅ |
| No source code changes | packages/core/src/ untouched | 0 .ts files modified | ✅ |
| Correct content preserved | No valid examples removed | Manual review confirmed | ✅ |

### Edge cases encountered

| Case | Resolution |
|---|---|
| Line 128: comment contained `.with(entities())` literally | Stripped comment — was misplaced in a signal-exposure section, not a migration section |
| `tree.updateAndReport()` in F-003 grep results | Preserved — F-003 names only effect/subscribe/update/unwrap; updateAndReport is not phantom |
| `.ids()` grep hit non-entity lines | All 2 matches confirmed to be correct entity API references |
| Shell `grep -c` multiline output in verification script | Rewrote verification in Python to avoid shell comparison artifacts |

---

## v1.0 — Full Audit (M1 Static Review + M2 Scaffold + M5 RFC)

**Cycle:** v1.0  
**Completed:** 2026-04-29  
**Methodology:** Versus Iterative Convergence, T3 Full RFC  

---

## Expected vs Obtained

| Deliverable | Expected | Obtained | Status |
|---|---|---|---|
| findings.json — finding count | ≥10 (P0/P1 concentration) | 16 findings (3×P0, 8×P1, 3×P2, 1×P3) | ✅ |
| findings.json — schema | All required fields per audit-architecture.md §9 | 16/16 findings pass schema check | ✅ |
| M1 static review — surfaces covered | @signaltree/core T3 deep | README, index.ts, types.ts, signal-tree.ts, entity-signal.ts, constants.ts, all enhancers, markers, shared | ✅ |
| M2 — both scaffolds implement O1–O10 | 10 operations each side | SignalTree 10/10, NgRx SignalStore 10/10 | ✅ |
| M2 — DX comparison produces measurable difference | Time-to-compile, TS errors, workarounds | ST: 25 min, 3 errors, 3 workarounds; NgRx: 15 min, 1 error, 0 workarounds | ✅ |
| M2 — derived math correct | Spec values: li-1=110, li-2=200, invoice=300 | All 8 derived values match spec exactly | ✅ |
| RFC — top-3 proposals | Concrete, actionable, effort-estimated | RFC-1 (README overhaul), RFC-2 (EntityNode writes), RFC-3 (export gap) | ✅ |
| M3 adversarial AI test | Fresh-session transcript with error↔finding mapping | NOT RUN — prompt spec complete at specs/examples/m3-prompts/ | ⏳ |
| Second-pair-of-eyes (NgRx) | Fresh-session idiomaticity review transcript | NOT RUN — deferred per user decision | ⏳ |
| M4 bundle size benchmark | Production build gzip/brotli bytes | BLOCKED — no Angular workspace + build environment | ⏳ |

## Assumption validation

| Assumption (Phase 0/1) | Prediction | Outcome |
|---|---|---|
| AI agents are primary adoption channel | Finding severity weighted toward AI-legibility | Confirmed — F-002/F-003/F-007/F-009 are all AI-agent traps |
| NgRx SignalStore is the right comparator | Side-by-side DX comparison meaningful | Confirmed — comparison surfaces real gap in nested entity mutations |
| SignalTree's callable syntax is the core differentiator | F-009 would be P1 | Confirmed — callable syntax in Quick Start without caveat is the most impactful first-time failure |
| entityMap() self-registers (no .with(entities()) needed) | entities() pattern is wrong but documented | Confirmed — entities.ts throws at runtime; entityMap() is correct path |
| EntityNode deep writes are broken | F-012/F-013 would be P1 | Confirmed — entity-signal.ts properties return plain closures; .set() throws |
| T3 scope achievable in one session | 3–4 weeks or equivalent | Partially — M1/M2/M5 complete in one extended session; M3/M4 require external environments |
