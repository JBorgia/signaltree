# Guardrails Troubleshooting Guide

## Installation Issues

### `MultipleProjectsWithSameNameError: @signaltree/guardrails`

Nx detects both `packages/guardrails` and `docs/guardrails` as the same project name. Fix by ensuring:

- `packages/guardrails/project.json` → `"name": "guardrails"`
- `docs/guardrails/project.json` → `"name": "guardrails-docs"`

Then run:

```bash
pnpm nx reset
```

### Jest Cannot Find Tests

Guardrails coverage runs in-band to avoid glob parsing issues. If you see:

```
No tests found, exiting with code 1
```

Run:

```bash
pnpm nx test guardrails --runInBand --passWithNoTests
```

## Runtime Diagnostics

### No Telemetry Available

Symptom: `tree.__guardrails` is `undefined`.

Checklist:

- Ensure your build runs in dev mode (`process.env.NODE_ENV !== 'production'`).
- Confirm `withGuardrails({ enabled: () => true })` returns truthy.
- Verify the tree exposes path notifications/hooks (PathNotifier or entity hooks).

### Memory Budget Warnings

The reports now include `signalCount` and `memoryGrowthRate`. To adjust sensitivity:

```ts
withGuardrails({
  memoryLeaks: {
    enabled: true,
    retentionThreshold: 100, // default
    growthRate: 0.3, // default 0.2
  },
});
```

### Recomputation Budget Failures

Guardrails tracks operations executed per second. If tests fail intermittently, increase tolerance:

```ts
withGuardrails({
  budgets: {
    maxRecomputations: 500,
  },
});
```

## Release & Publishing

- Run `pnpm nx build guardrails` before `./scripts/release.sh`.
- Guardrails publishing happens from `packages/guardrails` (the docs package is non-publishable).

## Bundle Analysis

`node scripts/perf-suite.js` requires the Nx builds to exist. If you hit build failures, execute:

```bash
NX_IGNORE_LOCKFILE_HASH=1 pnpm nx run-many --target=build --projects=core,enterprise,ng-forms,callable-syntax,shared,types,utils,guardrails --configuration=production
pnpm nx build demo --configuration=production
```

## Demo App

- The `/guardrails` route uses `__guardrails` telemetry. Ensure dev mode is enabled (`ng serve --configuration development`).
- If the telemetry panel is blank, check the browser console; guardrails warns when middleware hooks are missing.
