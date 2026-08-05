# @signaltree/enterprise

> # ⚠️ Deprecated as of 13.5.0
>
> **Use `tree.updateAndReport()` and `tree.onPathChange()` from `@signaltree/core`.** They are built in, need no enhancer, add no bundle, and are faster than this package.
>
> This package remains published so existing installs keep resolving, and will receive security fixes only. No new features, and the array defect below is not being fixed.

## Why it was retired

**The headline performance claim was inverted.** Measured against `tree.updateAndReport()` — which returns the same changed paths — `updateOptimized()` is:

| Leaves | `updateOptimized()` | `updateAndReport()` | Result           |
| ------ | ------------------- | ------------------- | ---------------- |
| 500    | 0.1370 ms           | 0.0201 ms           | **6.8x slower**  |
| 2,000  | 0.5797 ms           | 0.0404 ms           | **14.4x slower** |

The gap widens with tree size. The long-standing "2–5x faster" claim was never measured against core.

This is structural, not a tuning problem. Core leaves are `signal(value, { equal })` — deep equality plus a reference-equality short-circuit — so **"only write what actually changed" is already core behaviour, for free**. The diff engine walks the whole state to decide which writes to skip, and the writes it skips were already no-ops. No amount of optimization changes that shape; the work it does is work core does not need to do.

Two further reasons:

- **It no longer offers anything core lacks.** `changedPaths` and `updateAndReport()` return the same information, and `onPathChange` now ships in core.
- **It has no independent runtime dependency**, which puts it on the wrong side of the packaging rule in [RFC 0007](../../docs/rfcs/0007-packaging-principle-and-ng-forms-reslice.md) — a package should exist because it pulls in a dependency core should not.

## Migration

```typescript
// Before
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

const tree = signalTree(state).with(enterprise());
const result = tree.updateOptimized(payload);
if (result.changed) sync(result.changedPaths);

// After — no enhancer, no extra bundle
import { signalTree } from '@signaltree/core';

const tree = signalTree(state);
const changed = tree.updateAndReport(payload);
if (changed.length) sync(changed);
```

| Enterprise                                | Core replacement                                    |
| ----------------------------------------- | --------------------------------------------------- |
| `tree.updateOptimized(p)`                 | `tree.updateAndReport(p)` — returns changed paths   |
| `tree.onPathChange(fn)`                   | `tree.onPathChange(fn)` — same signature            |
| `tree.snapshot()`                         | `const snap = tree()`                               |
| `tree.restore(snap)`                      | `tree(snap)`                                        |
| `tree.updateAuto(p)`                      | `tree(p)`                                           |
| `tree.getPathIndex()`                     | no replacement — was debug-only, already deprecated |
| `enterprise({ autoOptimizeThreshold: n })` | drop it — core has one write path                   |

### Three behaviour differences worth knowing

**1. `updateAndReport()` is stricter about what counts as a change.** It reports only paths whose leaf signal actually accepted the write. A re-fetched payload identical to what you already hold reports `[]`; the diff engine reported every key in it. If you were counting on the old numbers, they were counting no-ops.

**2. `onPathChange` in core fires for every root write** — the call form `tree({...})`, `batchUpdate()` and `updateAndReport()` — not just `updateOptimized()`. It does **not** fire for direct leaf writes (`tree.$.a.b.set(x)`), which bypass the root.

**3. `snapshot()` here used `structuredClone`,** so it threw `DataCloneError` on any tree holding a function. `tree()` has no such limit.

## Known defect (not being fixed)

`updateOptimized()` **silently drops writes that target an array.** It reports `changed: true`, lists the paths, and writes nothing.

An array in a SignalTree is a single leaf — one `WritableSignal<T[]>` — while the diff engine is a general-purpose differ emitting element-level paths (`users.1`). The apply step cannot consume those against a leaf, so it bails and reports success anyway.

Two fixes were attempted and both withdrawn, each having introduced defects worse than the one it closed (silent truncation and prototype injection in the first; dotted-key data loss and spurious writes in the second). Given the package is superseded, it stays documented rather than fixed.

**Workaround** — write the array through its leaf:

```typescript
tree.$.users.set(nextUsers); // works
tree.updateOptimized({ users: nextUsers }); // silently does nothing
```

Or migrate to `updateAndReport()`, which handles arrays correctly.

## Removed in 13.5.0

`./scheduler` and `./thread-pools` subpath exports are gone. Both were dead — no caller anywhere in the repo, no tests, no documentation — and `thread-pools` only ever exported `createMockPool()`, a test double that should never have shipped to production consumers. `scheduler`'s advertised "yield to the event loop" was `await Promise.resolve()`, a microtask, which does not yield.

## License

Business Source License 1.1 (BSL-1.1) — see [LICENSE](../../LICENSE). Converts to MIT on the Change Date specified in the license.

## Related packages

- [@signaltree/core](../core) — where `updateAndReport()` and `onPathChange()` now live
- [@signaltree/ng-forms](../ng-forms) — Angular forms integration
- [@signaltree/callable-syntax](../callable-syntax) — callable syntax transform
