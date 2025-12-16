# Migrating to @signaltree/guardrails v1.1

Use this guide when upgrading from the legacy v1.0 release (standalone enhancer) to v1.1 (workspace-integrated package).

## 1. Package Installation

```bash
pnpm add -D @signaltree/guardrails
```

- Remove any references to the docs-only package (`docs/guardrails/package.json`); the publishable package now lives at `packages/guardrails`.
- Ensure the new build target (`pnpm nx build guardrails`) is part of your CI workflow.

## 2. Update Imports

```diff
- import { withGuardrails } from '@signaltree/guardrails/dev';
+ import { withGuardrails } from '@signaltree/guardrails';
```

Factories moved to a dedicated entry point:

```diff
- import { createFeatureTree } from '@signaltree/guardrails';
+ import { createFeatureTree } from '@signaltree/guardrails/factories';
```

## 3. Config Changes

The v1.1 enhancer accepts expanded configuration:

- `budgets.maxMemory` and `budgets.maxRecomputations` now drive new budget checks.
- `analysis.warnParentReplace` may emit diff-ratio warnings if you enable it.
- Memory leak detection is opt-in via `memoryLeaks.enabled`.

Example:

```ts
withGuardrails({
  budgets: {
    maxUpdateTime: 16,
    maxMemory: 8,
    maxRecomputations: 200,
  },
  memoryLeaks: {
    enabled: true,
    retentionThreshold: 50,
  },
  analysis: {
    warnParentReplace: true,
  },
});
```

## 4. Release & Metrics Scripts

The workspace now includes guardrails in:

- `scripts/release.sh`
- `scripts/publish-all.sh`
- `scripts/test-coverage.sh`
- `scripts/consolidated-bundle-analysis.js`
- `scripts/perf-suite.js`

If you maintain forks or downstream pipelines, pull the updated scripts to make sure guardrails is linted, tested, and published.

## 5. API Notes

- Guardrails augments the tree instance with `__guardrails`, containing `getReport`, `getStats`, `suppress`, and `dispose`.
- Reports now include memory growth rate, recomputation totals, and hot-path snapshots.
- Disposal automatically unregisters middleware hooks to avoid dev-mode leaks.

## 6. Demo & Docs

- The Angular demo exposes a `/guardrails` page showing the new telemetry panel.
- All docs moved to `docs/guardrails` (package renamed to `@signaltree/guardrails-docs` to avoid Nx collisions).

## 7. Breaking Changes

- Node 18+ (or browsers with `performance.now`) is required for the new timing metrics.
- Vitest-based tests run in-band when collecting coverage to stabilize timing-sensitive specs.

## 8. Checklist

- [ ] Update dependencies (`pnpm install`)
- [ ] Replace legacy imports
- [ ] Enable desired budgets/memory options
- [ ] Run `pnpm nx test guardrails --coverage`
- [ ] Run `node scripts/perf-suite.js`
- [ ] Publish via `./scripts/release.sh`
