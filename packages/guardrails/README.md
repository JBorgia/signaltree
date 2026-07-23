# @signaltree/guardrails

> Development-only performance monitoring and anti-pattern detection for SignalTree

## Features

- ✅ **Zero production cost** - Dev-only via conditional exports
- ✅ **Performance budgets** - Update time, memory, recomputations
- ✅ **Hot path analysis** - Automatic detection with heat scores
- ✅ **Memory leak detection** - Retention and growth tracking
- ✅ **Custom rules engine** - Team-specific policies
- ✅ **Intent-aware suppression** - Smart noise reduction
- ✅ **Percentile reporting** - P50/P95/P99 metrics

## Installation

```bash
npm install --save-dev @signaltree/guardrails
```

## Quick Start

```typescript
import { signalTree } from '@signaltree/core';
import { guardrails } from '@signaltree/guardrails';

const tree = signalTree({ count: 0 }).with(
  guardrails({
    budgets: { maxUpdateTime: 16 },
    hotPaths: { threshold: 10 },
  })
);
```

## Using Factories

```typescript
import { signalTree } from '@signaltree/core';
import { createFeatureTree } from '@signaltree/guardrails/factories';

const tree = createFeatureTree(
  signalTree,
  { data: [] },
  {
    name: 'dashboard',
    guardrails: true,
  }
);
```

Available factories: `createFeatureTree`, `createAngularFeatureTree`,
`createAppShellTree`, `createPerformanceTree`, `createGuardedFormTree`,
`createCacheTree`, `createTestTree`.

> **Renamed:** `createFormTree` is now `createGuardedFormTree` — the old name
> collided with `createFormTree` from `@signaltree/ng-forms`. The old export
> remains as a deprecated alias until the next major.

## How the dev/prod builds are selected (conditional exports)

The package ships two builds behind [conditional exports](https://nodejs.org/api/packages.html#conditional-exports):

| Resolution condition        | Build                             |
| --------------------------- | --------------------------------- |
| `development`               | `dist/index.js` — real guardrails |
| `production`                | `dist/noop.js` — zero-cost no-op  |
| `default` (neither present) | `dist/index.js` — real guardrails |

**Why `default` maps to the real implementation:** the `development`/`production`
conditions are set by bundlers (Vite, webpack, esbuild `--conditions`), not by
Node itself — plain `node`, many test runners, and unconfigured bundlers set
*neither*. If `default` pointed at the no-op, those consumers would silently get
dead guardrails **even in development** (this shipped as a real bug — the
site-audit "guardrails dead" finding). Missing-condition consumers therefore err
toward the *functional* build; only an explicit `production` condition selects
the no-op. Production bundles are unaffected: any production-mode bundler sets
the `production` condition and gets `dist/noop.js`.

This contract is pinned by `scripts/verify-guardrails-default-condition.mjs`
(`npm run validate:guardrails-exports`), which resolves the built package with
Node's real resolver under each condition set.

## Configuration

See [docs/guardrails](../../docs/guardrails) for complete documentation.

## License

MIT
