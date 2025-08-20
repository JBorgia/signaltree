# Devtools & Snapshot API (Phase 4)

The SignalTree devtools integration provides a lightweight global registry and snapshot helpers for debugging and performance inspection during development.

## Enabling

Enable by passing `enableDevTools: true` (automatically enabled by the `development` preset):

```ts
import { signalTree } from '@signaltree/core';

const tree = signalTree({ count: 0 }, { enableDevTools: true, trackPerformance: true });
```

## What It Adds

When enabled:

- Tree is registered in a global registry (not in production `NODE_ENV`)
- `snapshot()` returns a plain unwrapped clone of current state
- `snapshotMeta()` returns { name, version, state, metrics?, created }
- Automatic unregistration on `tree.destroy()`

## API

```ts
import { listTrees, snapshotTree, getTree } from '@signaltree/core';

listTrees(); // string[] of devtools ids
snapshotTree(id, { includeMetrics: true });
getTree(id); // underlying SignalTree instance
```

Instance helpers (only present when `enableDevTools`):

```ts
const plain = tree.snapshot();
const meta = tree.snapshotMeta();
```

## Metrics

If `trackPerformance: true` the snapshotMeta will include metrics:

- updates
- computations
- cacheHits / cacheMisses (future use)
- averageUpdateTime (EMA ms)

## Production Behavior

In `NODE_ENV=production` registration functions are inert and return empty results. Bundle tooling can tree-shake devtools usage when you guard it by `if (process.env.NODE_ENV !== 'production')`.

## Example

```ts
const store = signalTree({ users: [], filter: 'all' }, { enableDevTools: true, trackPerformance: true });
store.update((s) => ({ filter: 'active' }));
console.log(store.snapshotMeta());
```

## Future Enhancements

- Event stream (state change log)
- Inspector UI package
- Adapter-specific visual tooling
