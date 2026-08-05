/**
 * @packageDocumentation
 *
 * # @signaltree/enterprise — DEPRECATED as of 13.5.0
 *
 * Use `tree.updateAndReport()` and `tree.onPathChange()` from `@signaltree/core`.
 * Both are built in, need no enhancer, and are measurably faster than this
 * package: the diff engine benchmarks slower in every workload measured — at
 * 2,000 leaves, ~7x when 10% of leaves change, ~2x on an identical re-fetch and
 * ~160-190x when every leaf changes — and the ratio grows with tree size.
 *
 * The reason is structural rather than a tuning problem. Core leaves are
 * `signal(value, { equal })` with a deep equality check and a reference-
 * equality short-circuit, so "write only what actually changed" is already
 * core behaviour and costs nothing. The diff engine walks the entire state to
 * decide which writes to skip — writes that were already no-ops.
 *
 * ## Migration
 *
 * ```ts
 * // Before
 * const tree = signalTree(state).with(enterprise());
 * const result = tree.updateOptimized(payload);
 * if (result.changed) sync(result.changedPaths);
 *
 * // After — no enhancer needed
 * const tree = signalTree(state);
 * const changed = tree.updateAndReport(payload);
 * if (changed.length) sync(changed);
 * ```
 *
 * | Enterprise                 | Core replacement                             |
 * | -------------------------- | -------------------------------------------- |
 * | `updateOptimized(p)`       | `updateAndReport(p)` — returns changed paths |
 * | `onPathChange(fn)`         | none yet — use `updateAndReport(p)` per call |
 * | `snapshot()` / `restore()` | `const s = tree(); ... tree(s)`              |
 * | `updateAuto(p)`            | `tree(p)`                                    |
 * | `getPathIndex()`           | no replacement (was debug-only)              |
 *
 * `updateAndReport()` is also STRICTER about what counts as a change: it
 * reports only paths whose leaf signal actually accepted the write, so a
 * re-fetched payload identical to current state reports nothing. The diff
 * engine reported those as changes.
 *
 * ## Known defect in this package (not being fixed)
 *
 * `updateOptimized()` silently drops writes that target an array. An array in
 * a SignalTree is ONE leaf signal, while the diff engine emits element-level
 * paths (`users.1`) that the apply step cannot consume; it reports
 * `changed: true` and writes nothing. Two fixes were attempted and both were
 * withdrawn for introducing worse defects than the one they closed. Write
 * arrays through the leaf instead — `tree.$.users.set(newUsers)` — or move to
 * `updateAndReport()`, which handles arrays correctly.
 *
 * The package stays published so existing installs keep resolving. It receives
 * security fixes only.
 */
export * from './lib/diff-engine';
export * from './lib/path-index';
export * from './lib/update-engine';
export * from './lib/enterprise-enhancer';
