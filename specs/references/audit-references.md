# Audit References — 2026-04 Cycle

## Source files examined (M1)

| File | Role in audit |
|---|---|
| `packages/core/README.md` | Primary public doc — most findings source here |
| `packages/core/src/index.ts` | Public API contract — what's actually exported |
| `packages/core/src/lib/types.ts` | TypeScript interface definitions — ISignalTree, EntityNode, CallableWritableSignal |
| `packages/core/src/lib/signal-tree.ts` | signalTree() factory implementation — leaf signal creation, .with() single-arg |
| `packages/core/src/lib/entity-signal.ts` | EntitySignal implementation — addOne/updateOne/byId/entityMap methods |
| `packages/core/src/lib/constants.ts` | Error message definitions — numeric codes in production |
| `packages/core/src/lib/markers/entity-map.ts` | entityMap() marker — self-registration pattern |
| `packages/core/src/enhancers/entities/entities.ts` | Deprecated entities() enhancer — throws at runtime |
| `packages/core/src/enhancers/effects/effects.ts` | effects() enhancer — exists but not exported |
| `packages/core/src/enhancers/time-travel/time-travel.ts` | timeTravel enhancer — correctly exported |
| `packages/shared/package.json` | Version drift evidence: 9.0.1 vs 9.2.1 |
| `docs/README.md` | Docs index — version claim 7.6.0 |

## Comparison target

| Reference | Used for |
|---|---|
| `@ngrx/signals@^20.1.0` (package.json) | M2 NgRx SignalStore scaffold — withEntities, patchState, updateEntity, withComputed, withHooks |

## Methodology documents (self-referential)

| File | Contents |
|---|---|
| `specs/design/audit-architecture.md` | Full audit design, surface matrix, M1–M5 workstream specs |
| `specs/technical/measurement-protocol.md` | Bundle size format, DX notes schema, benchmark protocol |
| `specs/design/second-pair-of-eyes.md` | Fresh-session review protocol for NgRx artifacts |
| `specs/design/severity-examples.md` | P0/P1/P2/P3 worked examples |
| `specs/design/phase2-critique.md` | Phase 2 coverage matrix (50 cells, 6 criticals resolved) |
