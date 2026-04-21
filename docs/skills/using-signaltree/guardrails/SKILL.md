---
name: signaltree-guardrails
description: Guides AI agents attaching @signaltree/guardrails as a dev-only enhancer for SignalTree performance budgets, hot-path detection, memory-leak monitoring, and anti-pattern rules. Automatically noop in production via conditional package exports. Triggers on @signaltree/guardrails, performance budget, dev-only enhancer, anti-pattern detection, hot path analysis, memory leak detection, P95/P99 reporting, intent suppression.
---

# Using @signaltree/guardrails

## When to use this package

Reach for `@signaltree/guardrails` during development when a tree is large enough that you want automated feedback on "is this update expensive," "is this subtree thrashing," or "is this component reading the whole root when it only needs one field." The enhancer instruments every update, tracks hot paths, watches memory growth, and runs a rule registry (plus your custom rules) against each change, then reports issues through console (or a custom reporter). In production builds, the package **silently switches to a no-op implementation** through its `exports` map — the enhancer call remains in your source but costs zero.

Skip the enhancer in hot-path production code paths; that is handled automatically, but it is still good practice to apply it only where you want diagnostics during development.

## Install

```bash
npm install --save-dev @signaltree/guardrails
```

Peer range (from `peerDependencies`): `@signaltree/core ^9`. The package also lists `@signaltree/shared ^7.1.0` as a peer dependency, but consumers **do not** install it separately — it is a private workspace package that is pulled in transitively through `@signaltree/core`. Do not add `@signaltree/shared` to your `package.json`; npm will fail to resolve it.

## Mental model

`guardrails(config?)` is a standard SignalTree enhancer: `signalTree(init).with(guardrails({ ... }))`. Internally it wraps every `update()` call, stamps a start/end time, diffs the affected paths, and runs each configured rule against the update context.

Three axes of configuration:

1. **Budgets** — wall-clock thresholds for update time, memory, recomputation rate, and tree depth. Violations raise issues at the configured `mode` (`'warn'` logs to console, `'throw'` throws, `'silent'` just records).
2. **Hot paths** — automatic detection of paths updated above a threshold rate. Useful for finding loops that accidentally re-apply the same patch.
3. **Rules** — the built-in `rules` registry (e.g., `rules.noDeepNesting(n)`, `rules.noFunctionsInState()`, `rules.maxPayloadSize(kb)`, `rules.noSensitiveData()`) plus any custom `GuardrailRule<T>` objects.

Production behavior is controlled at the package level: the `production` condition in `package.json` `exports` resolves `@signaltree/guardrails` to `./dist/noop.js`, so bundlers in `production` mode see an empty-shell `guardrails()` that returns the input tree unchanged.

## Core usage

### Basic — performance budget and console warnings

```ts
import { signalTree } from '@signaltree/core';
import { guardrails } from '@signaltree/guardrails';

interface AppState {
  [key: string]: unknown;
  items: Array<{ id: string; value: number }>;
  ui: { search: string };
}

const tree = signalTree<AppState>({
  items: [],
  ui: { search: '' },
}).with(
  // `guardrails(config)` has no call-site type parameter; the config
  // accepts its own generic internally but infers from usage.
  guardrails({
    mode: 'warn',
    budgets: {
      maxUpdateTime: 16,       // ms per update
      maxRecomputations: 100,  // per second
      maxTreeDepth: 8,
    },
    hotPaths: { enabled: true, threshold: 10, topN: 5 },
    reporting: { console: true, interval: 5000 },
  })
);
```

### Memory-leak detection and intent-aware suppression

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
      // Silence budget warnings during specific kinds of updates.
      autoSuppress: ['hydrate', 'reset', 'bulk', 'migration'],
      respectMetadata: true,
    },
  })
);

// Tagging an update as an intent silences warnings once.
// The payload is a regular object; guardrails looks for a `metadata` field
// alongside the top-level state update, so supply it on the returned object
// (or on a state branch that carries it, e.g. a `meta` leaf) and
// re-apply the real write normally.
tree.$.entities(hydrated);
```

### Custom rule

```ts
import { signalTree } from '@signaltree/core';
import { guardrails, rules } from '@signaltree/guardrails';

const tree = signalTree({ ui: { when: '' } }).with(
  guardrails({
    customRules: [
      rules.noDeepNesting(6),
      rules.noSensitiveData(),
      {
        name: 'no-date-strings-in-ui',
        severity: 'warning',
        // `test` returns true when the rule fires; `message` supplies the
        // diagnostic. The rule runs per changed leaf; `context.path` is the
        // dotted path (array), `context.value` is the new leaf value.
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

## Advanced / less-obvious

- **Pre-baked feature trees from the `/factories` subpath.** `@signaltree/guardrails/factories` exports `createFeatureTree`, `createAngularFeatureTree`, `createAppShellTree`, `createPerformanceTree`, and `createTestTree`, each of which layers a curated `guardrails()` config for its use case — strict 4ms budgets for the app shell, throw-on-violation for tests, relaxed for caches. Useful when a team wants guardrails without deciding every knob up front.

  ```ts
  import { signalTree } from '@signaltree/core';
  import { createAppShellTree } from '@signaltree/guardrails/factories';

  const shell = createAppShellTree(signalTree, initial);
  ```

- **`mode: 'throw'` for tests.** Wiring `guardrails({ mode: 'throw' })` into a test harness makes an over-budget update fail the test rather than just warn. Combine with the test factory for a sensible default.

- **Intent metadata.** The `UpdateMetadata` shape accepts `intent: 'hydrate' | 'reset' | 'bulk' | 'migration' | 'user' | 'system'` and `source: 'serialization' | 'time-travel' | 'devtools' | 'user' | 'system'`. Combine with `suppression.autoSuppress` to enforce a policy.

- **P50/P95/P99 reporting.** The built-in reporter summarizes percentile update times per interval. For external dashboards, pass `reporting.customReporter: (report) => fetch('/telemetry', ...)` and keep the console quiet.

## Gotchas

- Do **not** install `@signaltree/shared` manually. It is a workspace-private package, and npm will fail to resolve a direct install. The peer declaration is there so bundler tooling knows what to hoist during SignalTree's own build.
- Guardrails adds real overhead per update. Never apply it in a production Angular config; rely on the package's `production` export condition to noop it. If your bundler does not set the `production` condition, guard the enhancer call yourself (e.g., `isDevMode() ? guardrails({...}) : ((t) => t)`).
- `maxTreeDepth` counts nested object depth, not path length. A tree with one 12-deep branch trips a `maxTreeDepth: 10` budget even if the rest of the tree is flat.
- `trackDownstream: true` for hot paths walks consumer computeds; it is more accurate but noticeably slower on large trees. Leave it off unless you are actively chasing a re-computation cycle.
- Memory-leak checks depend on `structuredClone` when available; environments without it fall back to JSON cloning and skip non-serializable values. That is fine for state, but be aware of the limitation.

## Pointer back

For overall SignalTree mental model, see `../SKILL.md`.
