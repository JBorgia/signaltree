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
> collided with `createFormTree` from `@signaltree/ng-forms`. The deprecated
> `createFormTree` alias was removed in v12.

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
_neither_. If `default` pointed at the no-op, those consumers would silently get
dead guardrails **even in development** (this shipped as a real bug — the
site-audit "guardrails dead" finding). Missing-condition consumers therefore err
toward the _functional_ build; only an explicit `production` condition selects
the no-op. Production bundles are unaffected: any production-mode bundler sets
the `production` condition and gets `dist/noop.js`.

This contract is pinned by `scripts/verify-guardrails-default-condition.mjs`
(`npm run validate:guardrails-exports`), which resolves the built package with
Node's real resolver under each condition set.

## Change detection — how it decides something happened

Guardrails prefers the core PathNotifier (event-driven, precise paths), and
**the PathNotifier only fires for entity-collection writes** — plus plain leaf
writes when the devtools enhancer is attached, since devtools installs a
leaf-signal interceptor. A tree of plain objects and signals with neither
produces no notifier events at all.

It used to use that strategy alone, and warn every plain-object user that
monitoring "is change-blind" whether or not it actually was. **A polling
backstop now runs alongside it**, so nothing is missed, and the warning fires
only when the backstop has caught a change the notifier did not — a report
rather than a guess.

The backstop is affordable because the change check is a snapshot REFERENCE
comparison. `tree()` returns the identical object when nothing changed and a
new one when something did, so "did anything happen" is O(1) and exact:

|                                  | idle poll                             |
| -------------------------------- | ------------------------------------- |
| the clone-and-diff this replaced | 32.5µs (100 branches) · 122.8µs (400) |
| reference compare                | **0.080µs · 0.045µs**                 |

To skip the notifier entirely and use polling alone:

```typescript
guardrails({
  changeDetection: { disablePathNotifier: true },
  customRules: [...],
});
```

## Catch mutations where they happen — `strictImmutability`

**Recommended in development.** One thing reference identity cannot see is a
value mutated IN PLACE:

```typescript
tree.$.rows().push(newRow); // no signal fires — the snapshot is the same object
```

By default guardrails copies each array/`Map`/`Set`/`Date` and re-checks them,
which finds the mutation up to one poll later and infers its path by diffing.
Freezing finds it _at the mutating line_:

```typescript
guardrails({
  changeDetection: { strictImmutability: true },
});

tree.$.rows().push(newRow);
// TypeError: Cannot add property 3, object is not extensible
//     at TradeGridComponent.addRow (trade-grid.component.ts:88:22)
```

A stack trace pointing at your bug beats a diff telling you a path changed. It
also enforces a contract the library already documents — a `tree()` snapshot is
read-only — and with it on, per-container copying is skipped entirely, because
nothing can mutate in place without throwing first.

**Off by default, deliberately.** It makes development behave differently from
production, and the snapshot SHARES leaf values with what you passed in:
freezing `tree.$.rows()` freezes the array you handed to `.set()`. If your own
code reuses and mutates that array, it will now throw — which is the bug, but
finding it this way is your call. NgRx ships `strictStateImmutability` opt-in
for the same reason.

One gap, stated rather than papered over: `Object.freeze` does not stop
`Map.set` or `Set.add`, so those containers have their CONTENTS frozen and fall
back to an O(1) size check.

## Configuration

See [docs/guardrails](../../docs/guardrails) for complete documentation.

## License

MIT
