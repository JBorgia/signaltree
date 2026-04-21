---
name: signaltree-enterprise
description: Guides AI agents applying @signaltree/enterprise to large SignalTree state for diff-based bulk updates, optimized partial writes, and path-index monitoring. Triggers on @signaltree/enterprise, updateOptimized, bulk updates, large state tree, diff engine, path index, getPathIndex, 500+ signals, enterprise enhancer.
---

# Using @signaltree/enterprise

## When to use this package

Reach for `@signaltree/enterprise` when the tree has grown past a few hundred signals and a single user action replaces a significant portion of state — think dashboards hydrating 1,000 entities from an API, tick-driven tables re-applying an incoming snapshot, or migrations that rewrite a subtree. The enhancer diffs `Partial<T>` against the current tree and only writes the signals whose values actually changed, which in practice is 2–5× faster than a naive `tree.update(s => ({ ...s, entities: nextEntities }))` for large flat collections. For small or mostly-static trees, skip it — the base `update()` is already cheap and the ~2.4 KB gzipped cost is not worth it.

## Install

```bash
npm install @signaltree/core @signaltree/enterprise
```

Peer range (from `peerDependencies`): `@angular/core ^20`, `@signaltree/core ^9`. The enhancer has no other runtime dependencies.

## Mental model

The base `update()` call walks your updater return value and writes into every reachable signal; for large replacement writes, most of those writes are identity-equal and just add overhead. `enterprise()` adds two capabilities:

1. **`updateOptimized(updates, options?)`** — runs a structural diff between `updates` and the current state, generates a patch list, and only calls `.set()` on leaf signals whose values actually differ. Returns a `UpdateResult` with `changed`, `duration`, `changedPaths`, and optional `stats`.
2. **`getPathIndex()`** — returns a `PathIndex` built lazily on first use. Useful for devtools, instrumentation, and perf dashboards. Callers can iterate `changedPaths` from an update result against the index to know which computeds will re-run.

The enhancer is zero-overhead until the first `updateOptimized` call — the `PathIndex` and `OptimizedUpdateEngine` are both lazily constructed.

## Core usage

### Apply the enhancer

```ts
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

interface AppState {
  [key: string]: unknown;
  entities: Record<string, { id: string; name: string; updatedAt: string }>;
  filters: { search: string; status: 'all' | 'active' | 'archived' };
  lastSyncAt: string | null;
}

const initial: AppState = {
  entities: {},
  filters: { search: '', status: 'all' },
  lastSyncAt: null,
};

const tree = signalTree(initial).with(enterprise());
```

### Bulk replace with `updateOptimized`

```ts
async function syncFromServer() {
  const entities = await fetchEntities(); // Record<string, Entity>

  const result = tree.updateOptimized({
    entities,
    lastSyncAt: new Date().toISOString(),
  });

  console.log(
    `Applied ${result.changedPaths.length} path changes in ${result.duration}ms`
  );
}
```

`updateOptimized` accepts a `Partial<T>` (not an updater function). It walks only the keys you provided, so other branches of the tree are completely untouched.

### Tune the diff

```ts
tree.updateOptimized(
  { entities: nextEntities },
  {
    // Treat arrays as unordered bags — useful when the server returns
    // items in a different order but you only care about membership.
    ignoreArrayOrder: true,
    // Stop diffing below this depth; replace whole subtree instead.
    maxDepth: 6,
    // Provide a custom equality for heavy leaf values (e.g., Dates, Buffers).
    equalityFn: (a, b) =>
      a === b ||
      (a instanceof Date && b instanceof Date && a.getTime() === b.getTime()),
    // Batch writes in chunks to keep each microtask short.
    autoBatch: true,
    batchSize: 500,
  }
);
```

### Use the result

```ts
const result = tree.updateOptimized({ entities: nextEntities });

if (result.changed) {
  telemetry.record('tree.bulk_update', {
    paths: result.changedPaths.length,
    ms: result.duration,
  });
}
```

## Advanced / less-obvious

- **`getPathIndex()` for monitoring.** The `PathIndex` returned by `tree.getPathIndex()` holds the dotted paths of every leaf signal. Pair it with `result.changedPaths` to build a heatmap of which subtrees churn most. It is `null` until the first `updateOptimized` call, so branch-guard before accessing: `const idx = tree.getPathIndex(); if (idx) { ... }`.
- **The enhancer does not replace `update()`.** Keep using `tree.update(...)` for small, targeted writes; reach for `updateOptimized` only when you are applying a large `Partial<T>` or replacing collections. Mixing both in the same component is expected.
- **Diff cost scales with the size of `updates`, not the whole tree.** So `tree.updateOptimized({ filters: { search: 'foo', status: 'active' } })` is O(1) regardless of how many entities sit in `entities`.
- **License note.** `@signaltree/enterprise` is BSL-1.1, unlike the MIT core and most siblings. Check the license for your deployment before shipping.

## Gotchas

- Do not pass `undefined` at a path you want to clear; the diff engine treats it as "no change." Pass `null` (or the slot's empty sentinel) explicitly.
- `ignoreArrayOrder: true` treats arrays as sets — only use it when item identity is stable via deep equality, otherwise reorders will be silently missed.
- `updateOptimized` returns `changed: false` when nothing differed; do not assume it always mutates.
- `getPathIndex()` reflects the tree after the most recent `updateOptimized` call. If you mutate via plain `update()` between two optimized writes, the index is incrementally rebuilt on the next optimized write — it is not stale, but it is not live either.
- The enhancer relies on the signals at each path existing on the tree at enhancer-apply time. Dynamically added paths (beyond the initial shape) are not automatically indexed; force a rebuild by calling `updateOptimized({})` or rebuild the index externally.

## Pointer back

For overall SignalTree mental model, see `../SKILL.md`.
