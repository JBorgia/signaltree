# Benchmark Recovery Plan

Date: 2025-10-31
Branch: compare/phase2-implementations_DEMO

## Purpose

This file documents the current state of the realistic benchmark work and provides a short, actionable recovery plan so a developer can resume progress quickly if this session or environment is lost.

## What was implemented (high level)

- Added `cold-start` as a first-class benchmark scenario (measures store/library init time).
- Wired `cold-start` and `subscriber-scaling` into the orchestrator (`benchmark-orchestrator.component.ts`).
- Implemented `runColdStartBenchmark` for SignalTree in:
  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/signaltree-benchmark.service.ts`
- Subscriber-scaling implementations exist for: SignalTree, NgRx (Store), NgRx Signals, Akita, Elf, NgXs.
- Memory-profiling utilities and `attemptGarbageCollection()` are present in `benchmark-runner.ts` and used across services.
- Bundle analysis automation script added: `scripts/consolidated-bundle-analysis.js` (build + gzipped size checks).
- Two demo pages were added and routed:
  - `architecture-overview` (component files under `apps/demo/src/app/pages/architecture-overview/`)
  - `bundle-analysis` (component files under `apps/demo/src/app/pages/bundle-analysis/`)
  - Routes were added in `apps/demo/src/app/app.routes.ts` and nav links added in `apps/demo/src/app/components/navigation/navigation.component.ts`.

## Pending / next-highest-priority work

1. Cold-start parity

   - Implement `runColdStartBenchmark(config?: { warmup?: number }): Promise<number>` in the following files (pattern follows SignalTree's implementation):
     - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngrx-benchmark.service.ts`
     - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngrx-signals-benchmark.service.ts`
     - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/akita-benchmark.service.ts`
     - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/elf-benchmark.service.ts`
     - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngxs-benchmark.service.ts`
   - Each implementation should:
     - Optionally do `warmup` instances to avoid first-time JIT noise.
     - Create a realistic initial state (comparable size across libs).
     - Register 1–3 selectors/computeds and "touch" them.
     - Measure start/end time and return milliseconds.
     - Do a light synchronous teardown (unsubscribe, snapshot) if applicable.

2. UI controls

   - Add UI inputs in the orchestrator for:
     - Deep-nested `depth` (integer), rather than only constants.
     - Subscriber count (integer) so `subscriber-scaling` can be parameterized per run.

3. Memory consistency

   - Ensure every library service route uses `benchmark-runner` with `forceGC` the same way and returns `memoryDeltaMB` consistently.

4. Bundle-analysis automation in CI
   - Wire `scripts/consolidated-bundle-analysis.js` into a CI job that runs on demand or scheduled and stores `artifacts/consolidated-bundle-results.json`.

## Quick commands (macOS / zsh)

Run TypeScript check:

```bash
npx tsc -p tsconfig.base.json --noEmit
```

Serve demo (local dev):

```bash
pnpm nx serve demo --port 4200
# or use the VS Code task: Serve Demo App
```

Run bundle analysis (local, requires builds):

```bash
node scripts/consolidated-bundle-analysis.js
```

Run the demo build (production):

```bash
pnpm nx build demo --configuration=production
```

Run tests (if needed):

```bash
pnpm nx test demo --skipBuild
```

## Where to look (important files)

- Orchestrator & scenarios:

  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/benchmark-orchestrator.component.ts`
  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/scenario-definitions.ts`
  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/benchmark-runner.ts`

- Per-library benchmark services (implementations live here):

  - `.../services/signaltree-benchmark.service.ts` (cold start implemented)
  - `.../services/ngrx-benchmark.service.ts`
  - `.../services/ngrx-signals-benchmark.service.ts`
  - `.../services/akita-benchmark.service.ts`
  - `.../services/elf-benchmark.service.ts`
  - `.../services/ngxs-benchmark.service.ts`

- Demo pages added:

  - `apps/demo/src/app/pages/architecture-overview/`
  - `apps/demo/src/app/pages/bundle-analysis/`
  - Routes: `apps/demo/src/app/app.routes.ts`
  - Nav: `apps/demo/src/app/components/navigation/navigation.component.ts`

- Bundle analysis script:

  - `scripts/consolidated-bundle-analysis.js`

- Submission / API:
  - `api/realistic-benchmark.ts`
  - Client submission: `apps/demo/src/app/services/realistic-benchmark.service.ts`

## How to implement cold-start parity (short checklist)

1. Copy pattern from `signaltree-benchmark.service.ts` -> `runColdStartBenchmark`
2. In each service:
   - Create a small initial state (e.g., 100 items + meta) using that library's idioms.
   - Apply library-appropriate enhancers or presets so measured work is comparable.
   - Create/register a couple of selectors / derived values.
   - Invoke selectors to seed caches.
   - Measure time via `performance.now()` differences and return ms.
   - Light teardown (unsubscribe / destroy store) if available.
3. Run `npx tsc --noEmit`, then run the demo and trigger `cold-start` scenario in the orchestrator.

## If you crash / need to hand off

- Open this file and follow the prioritized next steps.
- If you need an immediate quick fix to show cold-start results for demos, you can implement the simplest version in other services that mirrors SignalTree but uses that library's store creation + a minimal selector chain.

## Notes & caveats

- Memory results rely on `performance.memory` (Chrome) and `attemptGarbageCollection()` best-effort. Interpret memory numbers cautiously.
- Bundle sizes depend on building production artifacts; demo UI shows estimates unless you run the build+script.
- Some generated or added files (e.g., `.vscode/tasks.json`) may be noisy. Tidy them only if desired.

## Contact points in repo

- Orchestrator: `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/benchmark-orchestrator.component.ts`
- SignalTree benchmark impl (reference): `signaltree-benchmark.service.ts`
- Bundle script: `scripts/consolidated-bundle-analysis.js`

## Recovery checklist (quick)

- Pull the branch: `git checkout compare/phase2-implementations_DEMO`
- Run TypeScript check: `npx tsc -p tsconfig.base.json --noEmit`
- Start demo: `pnpm nx serve demo --port 4200`
- Open demo and run benchmarks or implement missing `runColdStartBenchmark` methods per above.

---

(End of recovery plan)
