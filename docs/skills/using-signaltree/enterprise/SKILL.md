---
name: signaltree-enterprise
description: Migrating off the deprecated @signaltree/enterprise package to tree.updateAndReport() and tree.onPathChange() in @signaltree/core. Triggers on @signaltree/enterprise, updateOptimized, enterprise enhancer, diff engine, path index, getPathIndex, updateAuto, bulk updates on a large state tree, 500+ signals, diff-based patching.
---

# @signaltree/enterprise is DEPRECATED — use core

**Do not add `@signaltree/enterprise` to any project.** As of 13.5.0 it is deprecated and superseded by two methods built into `@signaltree/core`. If you are reading this because a user asked for diff-based bulk updates, change tracking, or "what changed" reporting on a large tree, the answer is core — no enhancer, no extra package, no extra bundle.

If the project already depends on it, migrate it off using the table below.

## Use this instead

```ts
import { signalTree } from '@signaltree/core';

interface State {
  entities: { id: number }[];
  lastSyncAt: string;
}

const tree = signalTree<State>({ entities: [], lastSyncAt: '' });
const entities: State['entities'] = [{ id: 1 }];

// Apply a partial update, get back the dot-paths that actually changed.
const changed = tree.updateAndReport({
  entities,
  lastSyncAt: new Date().toISOString(),
});
if (changed.length) console.log(`${changed.length} paths changed`);

// Or subscribe to every root write.
const off = tree.onPathChange((paths) => console.log('changed:', paths));
off();
```

## Migration table

| Deprecated enterprise API                  | Core replacement                                    |
| ------------------------------------------ | --------------------------------------------------- |
| `signalTree(s).with(enterprise())`         | `signalTree(s)` — drop the enhancer                 |
| `tree.updateOptimized(p)`                  | `tree.updateAndReport(p)` — returns `string[]`      |
| `result.changedPaths`                      | the returned array itself                           |
| `result.changed`                           | `changed.length > 0`                                |
| `tree.onPathChange(fn)`                    | `tree.onPathChange(fn)` — same signature            |
| `tree.snapshot()`                          | `const snap = tree()`                               |
| `tree.restore(snap)`                       | `tree(snap)`                                        |
| `tree.updateAuto(p)`                       | `tree(p)`                                           |
| `tree.getPathIndex()`                      | no replacement — was debug-only, already deprecated |
| `enterprise({ autoOptimizeThreshold: n })` | drop it — core has one write path                   |
| diff options (`maxDepth`, `equalityFn`, …) | drop them — core writes leaf-by-leaf, no diff pass  |

**Two of those rows are an upgrade, not a swap.** `restore()` and `updateAuto()`
both inherit the array defect below: `restore()` leaves arrays at their mutated
value while reporting their element paths as changed, and `updateAuto()` drops
array writes for any payload over a configured `autoOptimizeThreshold`. The core
forms handle arrays correctly. Without a threshold, `updateAuto` is a plain
passthrough and is exactly equivalent.

## Why it was deprecated

State this accurately if a user asks, because the package's own older docs claimed the opposite:

- **It is slower, not faster.** Measured against `tree.updateAndReport()`, which returns the same paths, at 2,000 leaves: **~7x slower** when 10% of leaves change, **~2x** on an identical re-fetch, **~160-190x** when every leaf changes. At 500 leaves: ~4x, ~1.5x, ~43x. The ratio grows with tree size in every workload — the opposite of the scaling story it was sold on. The old "2-5x faster" claim was never measured against core.
- **The reason is structural.** Core leaves are `signal(value, { equal })` — deep equality plus a reference-equality short-circuit — so "only write what changed" is already core behaviour. The diff engine pays O(state) to skip writes that were already no-ops.
- **It has a live data-loss defect** (below) that is not being fixed.
- **It adds ~3.8KB gzipped** for that.

## Known defect in the deprecated package

`updateOptimized()` **silently drops any write targeting an array** — reports `changed: true`, lists the paths, writes nothing. An array is one leaf signal, but the diff engine emits element-level paths (`users.1`) the apply step cannot consume.

If you find code relying on this, it is already broken. Fix it by migrating, or as a stopgap write the array through its leaf:

```ts
import { signalTree } from '@signaltree/core';

const tree = signalTree({ users: [] as { id: number }[] });
const nextUsers = [{ id: 1 }, { id: 2 }];

tree.$.users.set(nextUsers); // works
```

## Behaviour differences to flag during migration

1. **`updateAndReport()` is stricter about "changed".** It reports only paths whose leaf actually accepted the write, so a re-fetched payload identical to current state reports `[]`. The diff engine reported every key in it. Code that logs or syncs on those counts will correctly do less work.
2. **Core's `onPathChange` fires for every root write** — `tree({...})`, `batchUpdate()` and `updateAndReport()` — not just `updateOptimized()`. It does **not** fire for direct leaf writes (`tree.$.a.b.set(x)`), which bypass the root.
3. **`snapshot()` used `structuredClone`** and threw `DataCloneError` on a tree holding a function. `tree()` has no such limit.
4. **`undefined` at a path still means "no change"** in core. Use `null` or an empty sentinel to clear a value explicitly.

## If the package must stay for now

It remains published and receives security fixes only. Do not add new call sites. Do not present it as a performance option.

Related: `using-signaltree` (root), `spec-auditing`
