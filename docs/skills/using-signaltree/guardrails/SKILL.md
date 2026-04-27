---
name: signaltree-guardrails
description: Guides AI agents attaching @signaltree/guardrails as a dev-only enhancer for SignalTree performance budgets, hot-path detection, memory-leak monitoring, and anti-pattern rules. Automatically noop in production via conditional package exports. Triggers on @signaltree/guardrails, performance budget, dev-only enhancer, anti-pattern detection, hot path analysis, memory leak detection, P95/P99 reporting, intent suppression.
---

# Using @signaltree/guardrails

Dev-only enhancer — instruments every `update()` call, tracks hot paths, watches memory growth, runs rule registry against each change. In production builds, package exports swap to a noop via the `production` export condition — the enhancer call stays in source but costs zero. If bundler doesn't set `production` condition, guard manually: `isDevMode() ? guardrails({...}) : ((t) => t)`.

Install (dev dependency):

```bash
npm install --save-dev @signaltree/guardrails
```

Peer: `@signaltree/core ^9`. Don't install `@signaltree/shared` — private workspace package; npm will fail to resolve it.

Basic — performance budget + console warnings:

```ts
import { signalTree } from '@signaltree/core';
import { guardrails } from '@signaltree/guardrails';

interface AppState { items: unknown[]; ui: { search: string } }

const tree = signalTree<AppState>({ items: [], ui: { search: '' } }).with(
  guardrails({
    mode: 'warn',                   // 'warn' | 'throw' | 'silent'
    budgets: {
      maxUpdateTime: 16,            // ms per update
      maxTreeDepth: 8,              // nesting depth, not path-segment count
    },
    hotPaths: { enabled: true, threshold: 10, topN: 5 },
    reporting: { console: true, interval: 5000 },
  })
);
```

Memory-leak detection + intent suppression:

```ts
const tree = signalTree(initial).with(
  guardrails({
    memoryLeaks: {
      enabled: true,
      checkInterval: 5000,
      retentionThreshold: 200,
      growthRate: 0.25,
      trackUnread: true,
    },
    suppression: {
      autoSuppress: ['hydrate', 'reset', 'bulk', 'migration'],  // intent values that silence budget warnings
      respectMetadata: true,
    },
  })
);
```

Valid `intent` values: `'hydrate'`, `'reset'`, `'bulk'`, `'migration'`, `'user'`, `'system'`.
Valid `source` values: `'serialization'`, `'time-travel'`, `'devtools'`, `'user'`, `'system'`.

Custom rule (rules run per changed leaf; `context.path` = string[], `context.value` = new leaf value; `test` returns `true` when rule fires):

```ts
import { guardrails, rules } from '@signaltree/guardrails';

const tree = signalTree({ ui: { when: '' } }).with(
  guardrails({
    customRules: [
      rules.noDeepNesting(6),
      rules.noSensitiveData(),
      {
        name: 'no-date-strings-in-ui',
        severity: 'warning',
        test: (context) =>
          context.path[0] === 'ui' &&
          typeof context.value === 'string' &&
          /^\d{4}-\d{2}-\d{2}/.test(context.value as string),
        message: (context) =>
          `ui path "${context.path.join('.')}" holds a date string; use Date in state.`,
      },
    ],
  })
);
```

Built-in rules from `rules` registry: `rules.noDeepNesting(n)`, `rules.noFunctionsInState()`, `rules.maxPayloadSize(kb)`, `rules.noSensitiveData()`.

Pre-baked factory trees (`@signaltree/guardrails/factories`): `createFeatureTree`, `createAngularFeatureTree`, `createAppShellTree` (strict 4ms budget), `createPerformanceTree`, `createTestTree` (`mode: 'throw'`). Accept `(signalTree, initial)`:

```ts
import { createAppShellTree } from '@signaltree/guardrails/factories';
const shell = createAppShellTree(signalTree, initial);
```

Use `mode: 'throw'` in test harnesses to fail tests on over-budget updates. Use `P50/P95/P99` reporting via `reporting.customReporter: (report) => fetch('/telemetry', ...)`.

Gotchas:
- Don't install `@signaltree/shared` — private package, npm resolution fails.
- `maxTreeDepth` counts object nesting depth, not path length. A 12-deep branch trips a `maxTreeDepth: 10` budget even if rest of tree is flat.
- `trackDownstream: true` walks consumer computeds — more accurate, noticeably slower. Only enable when chasing re-computation cycles.
- Memory-leak checks use `structuredClone` when available; falls back to JSON clone (skips non-serializable values).
- Never apply in production without relying on `production` export condition or `isDevMode()` guard.

Related: `using-signaltree` (root), `spec-auditing`, `compression`
