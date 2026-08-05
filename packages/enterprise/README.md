# @signaltree/enterprise

> # ⚠️ Deprecated as of 13.5.0
>
> **Use `tree.updateAndReport()` from `@signaltree/core`.** They are built in, need no enhancer, add no bundle, and are faster than this package.
>
> This package remains published so existing installs keep resolving, and will receive security fixes only. No new features, and the array defect below is not being fixed.

## Why it was retired

**The headline performance claim was inverted.** Measured against `tree.updateAndReport()` — which returns the same changed paths — `updateOptimized()` is:

| Workload (2,000 leaves)       | `updateOptimized()` | `updateAndReport()` | Result             |
| ----------------------------- | ------------------- | ------------------- | ------------------ |
| 10% of leaves changed         | ~0.53 ms            | ~0.08 ms            | **~7x slower**     |
| identical re-fetch (all no-op)| ~0.14 ms            | ~0.07 ms            | **~2x slower**     |
| every leaf changed            | ~24-27 ms           | ~0.12-0.17 ms       | **~160-190x slower** |

At 500 leaves the same workloads measure ~4-4.5x, ~1.2-1.6x and ~43x. The ratio
grows with tree size in every workload, which is the opposite of the scaling
story the package was sold on ("use it at 500+ signals").

The long-standing "2-5x faster" claim was never measured against core. Numbers
are means over 50 timed iterations after warm-up, payloads generated outside the
timed loop; they will differ on your hardware, so treat the RATIOS as the
finding, not the absolute times.

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
| `tree.onPathChange(fn)`                   | **no direct replacement yet** — use `tree.updateAndReport(p)` at the call site; a subscription API is being designed |
| `tree.snapshot()`                         | `const snap = tree()`                               |
| `tree.restore(snap)`                      | `tree(snap)`                                        |
| `tree.updateAuto(p)`                      | `tree(p)`                                           |
| `tree.getPathIndex()`                     | no replacement — was debug-only, already deprecated |
| `enterprise({ autoOptimizeThreshold: n })` | drop it — core has one write path                   |

### Two rows above are an IMPROVEMENT, not an equivalence

`restore()` and `updateAuto()` do not merely have a core equal — the core form
is **more correct**, because both inherit the array defect:

- `tree.restore(snap)` → `tree(snap)`. Restoring `{a, b:{c,d}, arr:[1,2,3]}`
  after mutating it leaves `arr` at its mutated value while reporting
  `arr.0`, `arr.1`, `arr.2` as changed — three paths it never wrote. `tree(snap)`
  restores the array. Neither deletes keys absent from the snapshot; both merge.
- `tree.updateAuto(p)` → `tree(p)`, but only exactly equivalent when NO
  `autoOptimizeThreshold` is set (then `updateAuto` is a plain passthrough). With
  a threshold, a payload over it routes through the diff engine and drops array
  writes; `tree(p)` applies them.

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

`./scheduler` and `./thread-pools` subpath exports are gone. Both were dead — no caller anywhere in the repo and no tests. (They were *mentioned* in the v9 plan and on a demo page, but never documented as an API.) And `thread-pools` only ever exported `createMockPool()`, a test double that should never have shipped to production consumers. `scheduler`'s advertised "yield to the event loop" was `await Promise.resolve()`, a microtask, which does not yield.

## License

Business Source License 1.1 (BSL-1.1) — see [LICENSE](../../LICENSE). Converts to MIT on the Change Date specified in the license.

## Related packages

- [@signaltree/core](../core) — where `updateAndReport()` and `onPathChange()` now live
- [@signaltree/ng-forms](../ng-forms) — Angular forms integration
- [@signaltree/callable-syntax](../callable-syntax) — callable syntax transform
