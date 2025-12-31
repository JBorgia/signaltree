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

## Configuration

See [docs/guardrails](../../docs/guardrails) for complete documentation.

## License

MIT
