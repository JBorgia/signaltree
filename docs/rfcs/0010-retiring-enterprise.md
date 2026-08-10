# RFC 0010 — Retiring `@signaltree/enterprise`

- **Status:** **EXECUTED — enterprise removed in 14.0.0** (`be8460b5`).
  `packages/enterprise` is gone from the repo, the package is unpublished for 14.x,
  and 13.5.0 carries a deprecation notice on npm naming `tree.updateAndReport()`
  as the replacement. A historical record, not a request for comment.
- **Date:** 2026-08-05
- **Ships in:** 13.5.0
- **Supersedes:** the "fix `updateOptimized`" track in RFC 0008 §open-items

## Summary

Deprecate `@signaltree/enterprise` on npm. Do not unpublish it. Move
`updateAndReport()` into the role — it already provided the useful half of what
the package was for. (`onPathChange` was ported and then CUT before release;
see the Decision section.)

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

| Workload (2,000 leaves)        | `updateOptimized()` | `updateAndReport()` | Ratio                |
| ------------------------------ | ------------------- | ------------------- | -------------------- |
| 10% of leaves changed          | ~0.53 ms            | ~0.08 ms            | **~7x slower**       |
| identical re-fetch (all no-op) | ~0.14 ms            | ~0.07 ms            | **~2x slower**       |
| every leaf changed             | ~24-27 ms           | ~0.12-0.17 ms       | **~160-190x slower** |

At 500 leaves: ~4-4.5x, ~1.2-1.6x, ~43x.

An earlier revision of this RFC published a single pair, 6.8x/14.4x, without
naming the workload. Independent re-measurement during audit did not reproduce
those exact figures — they sit roughly double the 10%-changed ratio and an order
of magnitude under full replacement. The DIRECTION is robust and reproduced in
every workload tried; the specific pair was not, so it is replaced by the range
and the workloads it was measured over. A comparative number without its
workload is the same mistake as the "2-5x faster" claim this RFC exists to
correct.

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
`onPathChange` was ~15 lines over `updateAndReport`, was ported, and was then
cut before release — see the Decision section. Core's
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
- `scheduler` / `thread-pools` — dead subpath exports: no caller anywhere in the
  repo and no tests. (They were _mentioned_ — in this plan's predecessor and on
  a demo benchmark page — but never documented as an API, and an earlier draft
  of this RFC overstated that as "no docs".) `thread-pools` shipped
  `createMockPool()`, a test double, to production consumers; `scheduler`'s
  advertised "yield to the event loop" was `await Promise.resolve()`, a
  microtask, which does not yield.
- A prototype-pollution sink in patch application, reachable from any
  `JSON.parse`-sourced payload (fixed in 13.5.0 — deprecated is not the same as
  vulnerable).

## Options considered

| #   | Option                                                                   | Verdict                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fix the array defect, keep the package                                   | **Rejected.** Attempted twice, reverted twice. And the correct fix — making array leaves a _filter over `diff.changes`_ rather than a parallel walk — makes the package a thin, slower wrapper over `updateAndReport()`. Fixing it proves it redundant. |
| 2   | Rewrite the diff engine for speed                                        | **Rejected.** The cost is the walk itself, and the walk is the package.                                                                                                                                                                                 |
| 3   | Repurpose as an observability package (path index, stats, heatmaps)      | **Rejected.** `updateAndReport()` covers the real use case; the rest is a devtools concern, and `devTools()` already exists in core.                                                                                                                    |
| 4   | Fold it into core behind a flag                                          | **Rejected.** Adds bundle and a second write path to core for a slower implementation.                                                                                                                                                                  |
| 5   | Unpublish                                                                | **Rejected.** Breaks every existing lockfile that resolves it, for no benefit.                                                                                                                                                                          |
| 6   | **Deprecate, keep published, harvest `updateAndReport()`'s correctness** | **Accepted.**                                                                                                                                                                                                                                           |

## Decision

1. `npm deprecate @signaltree/enterprise` with a message pointing at
   `tree.updateAndReport()`. Entry added to
   `scripts/deprecate-packages.sh`.
2. Keep it published. Security fixes only; no features, and the array defect is
   documented rather than fixed.
3. Fix the over-reporting bug in `updateAndReport()` (done, 13.5.0).
   `onPathChange` was ported to core and then CUT before release: it had no
   consumers, and the change-notification design points at a pull shape rather
   than the push shape it had.
4. Remove the dead `scheduler` / `thread-pools` subpath exports.
5. Correct the inverted performance claim everywhere it shipped — README, agent
   skill, enhancer JSDoc, demo page — rather than quietly deleting it.

## Migration

| Enterprise                               | Core replacement                                 |
| ---------------------------------------- | ------------------------------------------------ |
| `signalTree(s).with(enterprise())`       | `signalTree(s)`                                  |
| `tree.updateOptimized(p)`                | `tree.updateAndReport(p)`                        |
| `result.changedPaths` / `result.changed` | the returned array / `changed.length > 0`        |
| `tree.onPathChange(fn)`                  | none yet — `updateAndReport(p)` at the call site |
| `tree.snapshot()` / `tree.restore(s)`    | `const s = tree()` / `tree(s)` — see note        |
| `tree.updateAuto(p)`                     | `tree(p)` — see note                             |
| `tree.getPathIndex()`                    | no replacement                                   |

`updateAndReport()` is **stricter** about what counts as a change: it reports
only paths whose leaf actually accepted the write, so a re-fetched payload
identical to current state reports `[]`. The diff engine reported every key in
it. Consumers will correctly do less work, not less-correct work.

**Two of those rows are an upgrade, not an equivalence** — verified by audit,
because "equivalent" was asserted here without being tested:

- `restore()` inherits the array defect. Restoring a snapshot over mutated state
  leaves arrays at their MUTATED value while reporting their element paths as
  changed — paths it never wrote. `tree(snap)` restores them. Neither deletes
  keys absent from the snapshot; both merge.
- `updateAuto()` is exactly equivalent to `tree(p)` only when no
  `autoOptimizeThreshold` is configured (it is then a plain passthrough). With a
  threshold, any payload over it routes through the diff engine and drops array
  writes.
- `snapshot()` → `tree()` IS equivalent for plain data, and `tree()` is strictly
  more capable: `structuredClone` throws `DataCloneError` on a tree holding a
  function.

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

## The bundle-size gate does not measure this package

The published cost was "~2.4KB", corrected to "~3.1KB", and re-measurement
during audit put it at **~3.8KB gzipped** (11.4KB raw) for a tree-shaken
consumer importing only `enterprise()`. Three numbers for one artefact, none of
them checked by CI.

The reason CI never caught it: `scripts/consolidated-bundle-analysis.js`
measures `dist/packages/enterprise/dist/index.js`, which is a **235-byte
re-export barrel** (146 B gzipped), against a claimed budget of 6026 B. The
check passes by measuring the wrong file, and the script even emits its own
"may be a re-export barrel" warning while doing so.

Not fixed here — the package is being retired, so the gate that matters is the
one on core, which `scripts/v9-budget-checks.js` measures correctly against
tree-shaken consumer bundles. Recorded so the barrel-measuring pattern is not
trusted for any other package.

## Follow-up found while writing this, not fixed here

`updateAndReport()`, `batchUpdate()` and the root call form `tree(partial)` are
all typed `Partial<T>`, which is **shallow**. A nested partial —
`tree({ user: { name: 'Grace' } })` — works correctly at runtime (the merge is
deep; omitted keys are preserved, and `llms.txt` teaches exactly this as
"Partial / deep-merge update") but does **not** typecheck. Caught by the skills
doc linter while documenting the migration target.

Not fixed here because a correct `DeepPartial<T>` has to stop at arrays, `Date`,
`Map`/`Set`, branded types, signals and every marker, and getting that wrong
would silently widen or break the accepted shape across the whole write API.
That deserves its own pass with the generated typing-subset suite as the gate,
not a change tacked onto a deprecation. Workaround meanwhile: pass the complete
nested object, or write the branch directly (`tree.$.user({ name: 'Grace' })`).

## Lessons recorded

- **An unmeasured comparative claim is a liability.** "2–5x faster" survived
  years of docs, a demo page and an agent skill without anyone comparing it to
  the library it ships alongside. Comparative performance claims need a
  reproducible measurement against the _in-house alternative_, not only against
  competitors.
- **A package with no external dependency is a feature wearing a package's
  clothes.** RFC 0007's rule caught this; it just was not applied retroactively.
- **Two reverted fixes are a signal about the design, not the developer.** Both
  attempts were competent and both failed for the same underlying reason: the
  diff engine's model of state and the tree's model of state disagree about what
  an array is.
