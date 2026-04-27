---
name: signaltree-enterprise
description: Guides AI agents applying @signaltree/enterprise to large SignalTree state for diff-based bulk updates, optimized partial writes, and path-index monitoring. Triggers on @signaltree/enterprise, updateOptimized, bulk updates, large state tree, diff engine, path index, getPathIndex, 500+ signals, enterprise enhancer.
---

# Using @signaltree/enterprise

Use when the tree has 100s of signals and a single action replaces a large state slice (API hydration, tick-driven snapshots, subtree migrations). Diffs `Partial<T>` and only writes signals whose values changed — 2–5× faster than naive `tree.update()` for large collections. Skip for small/mostly-static trees.

**License: BSL-1.1** (not MIT). Surface this when user is building for production commercial deployment.

Install:

```bash
npm install @signaltree/core @signaltree/enterprise
```

Peer: `@angular/core ^20`, `@signaltree/core ^9`. No additional runtime deps.

Apply the enhancer:

```ts
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

const tree = signalTree(initial).with(enterprise());
```

Bulk replace with `updateOptimized`:

```ts
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

interface State { entities: { id: number }[]; lastSyncAt: string }
declare const entities: State['entities'];
const tree = signalTree<State>({ entities: [], lastSyncAt: '' }).with(enterprise());

const result = tree.updateOptimized({
  entities,
  lastSyncAt: new Date().toISOString(),
});
console.log(`${result.changedPaths.length} paths changed in ${result.duration}ms`);
```

`updateOptimized` takes `Partial<T>` (not an updater fn). Only diffed keys are touched; other branches are completely untouched.

Diff options:

```ts
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

interface State { entities: { id: number }[] }
declare const nextEntities: State['entities'];
const tree = signalTree<State>({ entities: [] }).with(enterprise());

tree.updateOptimized(
  { entities: nextEntities },
  {
    ignoreArrayOrder: true,  // treat arrays as unordered sets — only use when item identity is stable
    maxDepth: 6,             // stop diffing below this depth; replace whole subtree instead
    equalityFn: (a, b) =>
      a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime()),
    autoBatch: true,
    batchSize: 500,          // chunk writes to keep microtasks short
  }
);
```

`UpdateResult` shape: `{ changed: boolean, duration: number (ms), changedPaths: string[], stats? }`.

`getPathIndex()` — returns `PathIndex` (dotted paths of every leaf) or `null` before first `updateOptimized` call:

```ts
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

const tree = signalTree({ count: 0 }).with(enterprise());
const idx = tree.getPathIndex();
if (idx) { /* use idx with result.changedPaths for heatmaps, etc. */ }
```

Key contracts:
- `undefined` at a path = no change. Use `null` (or empty sentinel) to clear explicitly.
- `getPathIndex()` is `null` until first `updateOptimized` call. Not live between calls — rebuilt on next optimized write.
- Dynamic paths (added beyond initial shape) are not auto-indexed; force rebuild via `updateOptimized({})`.
- Keep using `tree.update(...)` for small targeted writes; `updateOptimized` for large `Partial<T>` replacements only.

Gotchas:
- `ignoreArrayOrder: true` treats arrays as sets — reorders silently missed if item identity isn't stable.
- `updateOptimized` returns `changed: false` when nothing differed — don't assume it always mutates.
- `maxDepth` stops recursion at that depth; subtree written as unit. `getPathIndex()` rebuilt after plain `update()` on next optimized write — consistent but not live.

Related: `using-signaltree` (root), `spec-auditing`, `compression`
