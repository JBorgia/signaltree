# RFC 0010 — Retiring `@signaltree/enterprise`

- **Status:** Accepted
- **Date:** 2026-08-05
- **Ships in:** 13.5.0
- **Supersedes:** the "fix `updateOptimized`" track in RFC 0008 §open-items

## Summary

Deprecate `@signaltree/enterprise` on npm. Do not unpublish it. Move
`onPathChange` into `@signaltree/core`, where `updateAndReport()` already
provided the other half of what the package was for.

## Why this RFC exists

The immediate trigger was a data-loss defect: `updateOptimized()` silently drops
any write targeting an array. Two fixes were written, tested, and reverted —
each introduced defects worse than the one it closed. Rather than attempt a
third, the question was widened to whether the package should exist at all.

It should not. The evidence below is the reason, and the array defect is
incidental to it.

## Evidence

### 1. The headline performance claim is inverted

`@signaltree/enterprise` was sold on faster bulk updates — "2–5x" in the README,
the skill and the demo page. That number was never measured against
`@signaltree/core`. Measured against `tree.updateAndReport()`, which returns the
same changed paths:

| Leaves | `updateOptimized()` | `updateAndReport()` | Ratio            |
| ------ | ------------------- | ------------------- | ---------------- |
| 500    | 0.1370 ms           | 0.0201 ms           | **6.8x slower**  |
| 2,000  | 0.5797 ms           | 0.0404 ms           | **14.4x slower** |

The gap widens with tree size, which is the opposite of the package's stated
scaling story ("use it at 500+ signals").

**This is structural, not a tuning problem.** Core leaves are
`signal(value, { equal })` — deep equality plus a reference-equality
short-circuit. "Only write what actually changed" is therefore already core
behaviour and costs nothing extra. The diff engine walks the entire state to
decide which writes to skip, and the writes it skips were already no-ops. It
pays O(state) to avoid work that was already free. No optimization changes that
shape; the only way to win is to not do the walk.

### 2. It no longer offers anything core lacks

`changedPaths` and `updateAndReport()` return the same information.
`onPathChange` is ~15 lines over `updateAndReport` and is now in core. Core's
own source already carried the comment that `updateAndReport` exists
"without pulling in the `@signaltree/enterprise` diff engine" — the
supersession was recognised in code before it was recognised in the docs.

### 3. It fails our own packaging rule

RFC 0007 says a package earns separation by pulling in a dependency core should
not carry. `@signaltree/enterprise` has **zero independent runtime
dependencies**. By our own stated rule it should never have been a package.

### 4. Its remaining surface is defective or dead

- `updateOptimized()` — silently drops array writes (see below).
- `snapshot()` — `structuredClone`, so it throws `DataCloneError` on any tree
  holding a function. `tree()` has no such limit.
- `getPathIndex()` — already deprecated as debug-only.
- `scheduler` / `thread-pools` — dead subpath exports: no caller, no tests, no
  docs. `thread-pools` shipped `createMockPool()`, a test double, to production
  consumers; `scheduler`'s advertised "yield to the event loop" was
  `await Promise.resolve()`, a microtask, which does not yield.
- A prototype-pollution sink in patch application, reachable from any
  `JSON.parse`-sourced payload (fixed in 13.5.0 — deprecated is not the same as
  vulnerable).

## Options considered

| # | Option | Verdict |
| - | ------ | ------- |
| 1 | Fix the array defect, keep the package | **Rejected.** Attempted twice, reverted twice. And the correct fix — making array leaves a *filter over `diff.changes`* rather than a parallel walk — makes the package a thin, slower wrapper over `updateAndReport()`. Fixing it proves it redundant. |
| 2 | Rewrite the diff engine for speed | **Rejected.** The cost is the walk itself, and the walk is the package. |
| 3 | Repurpose as an observability package (path index, stats, heatmaps) | **Rejected.** `onPathChange` in core covers the real use case; the rest is a devtools concern, and `devTools()` already exists in core. |
| 4 | Fold it into core behind a flag | **Rejected.** Adds bundle and a second write path to core for a slower implementation. |
| 5 | Unpublish | **Rejected.** Breaks every existing lockfile that resolves it, for no benefit. |
| 6 | **Deprecate, keep published, harvest `onPathChange`** | **Accepted.** |

## Decision

1. `npm deprecate @signaltree/enterprise` with a message pointing at
   `tree.updateAndReport()` / `tree.onPathChange()`. Entry added to
   `scripts/deprecate-packages.sh`.
2. Keep it published. Security fixes only; no features, and the array defect is
   documented rather than fixed.
3. Port `onPathChange` to core (done, 13.5.0), fixing the over-reporting bug in
   `updateAndReport()` on the way.
4. Remove the dead `scheduler` / `thread-pools` subpath exports.
5. Correct the inverted performance claim everywhere it shipped — README, agent
   skill, enhancer JSDoc, demo page — rather than quietly deleting it.

## Migration

| Enterprise                                 | Core replacement                                    |
| ------------------------------------------ | --------------------------------------------------- |
| `signalTree(s).with(enterprise())`         | `signalTree(s)`                                     |
| `tree.updateOptimized(p)`                  | `tree.updateAndReport(p)`                           |
| `result.changedPaths` / `result.changed`   | the returned array / `changed.length > 0`           |
| `tree.onPathChange(fn)`                    | `tree.onPathChange(fn)` — same signature            |
| `tree.snapshot()` / `tree.restore(s)`      | `const s = tree()` / `tree(s)`                      |
| `tree.updateAuto(p)`                       | `tree(p)`                                           |
| `tree.getPathIndex()`                      | no replacement                                      |

`updateAndReport()` is **stricter** about what counts as a change: it reports
only paths whose leaf actually accepted the write, so a re-fetched payload
identical to current state reports `[]`. The diff engine reported every key in
it. Consumers will correctly do less work, not less-correct work.

## The array defect, for the record

An array in a SignalTree is a single leaf — one `WritableSignal<T[]>`. The diff
engine is a general-purpose differ that emits element-level paths (`users.1`),
and five of its tests assert that as intended behaviour. The apply step cannot
resolve a path segment past an array leaf, so it drops the patch and reports
`changed: true` anyway.

**Attempt 1** (`caabc9ee`, reverted `2cd3a11c`) rebuilt arrays from element
patches: stale tails on shortening writes (`[1,2,3]` + `[9,2]` → `[9,2,3]`),
class instances downgraded by the clone, a `__proto__` assignment path, and one
signal write per element — 652x slower than a plain `.set()`.

**Attempt 2** (`d4f43b8c`, reverted `2b8f0637`) took arrays whole from the
payload, which fixed all four, but added a second traversal duplicating the
differ's job while honouring none of its contracts: sibling keys containing a
literal dot were dropped, `JSON.parse`-sourced arrays compared unequal forever
(30 of 30 no-op polls reported as changes), circular payloads crashed it, and
`maxDepth` / `ignoreArrayOrder` / `equalityFn` were bypassed.

The diagnosis from that audit is the one worth keeping:
`collapseArrayLeafChanges` should not be a parallel walker, it should be a
**filter over `diff.changes`** — which gets cycle detection, `maxDepth`,
`ignoreArrayOrder`, `equalityFn` and `keyValidator` for free. That is also
precisely the shape that reduces the package to a slower `updateAndReport()`,
which is why option 1 was rejected.

## Lessons recorded

- **An unmeasured comparative claim is a liability.** "2–5x faster" survived
  years of docs, a demo page and an agent skill without anyone comparing it to
  the library it ships alongside. Comparative performance claims need a
  reproducible measurement against the *in-house alternative*, not only against
  competitors.
- **A package with no external dependency is a feature wearing a package's
  clothes.** RFC 0007's rule caught this; it just was not applied retroactively.
- **Two reverted fixes are a signal about the design, not the developer.** Both
  attempts were competent and both failed for the same underlying reason: the
  diff engine's model of state and the tree's model of state disagree about what
  an array is.
