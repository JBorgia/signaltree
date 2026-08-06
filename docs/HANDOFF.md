# Handoff — state of play as of 2026-08-06

Written to hand a long session to fresh eyes. Read §1 and §7 first; the rest is
reference.

Everything marked **MEASURED** was actually run. Everything marked
**UNVERIFIED** was not. That distinction matters more than usual here: this
session found and retracted several confident claims that turned out to be
wrong, including some of its own.

---

## 1. Where things stand in one paragraph

**13.5.0 is published to npm** (8 packages, tag `v13.5.0`). It is a large
performance release with one breaking change. **13.6.0 is committed but
unreleased**, containing a security fix and two new diagnostics. There is a
**live investigation** into a class of defect around snapshots and rehydration
where three consumer paths are still broken — that is the most valuable thread
to pick up, and it is documented in
[`docs/architecture/snapshot-rehydration.md`](./architecture/snapshot-rehydration.md).
One uncommitted change is **suspected to be at the wrong layer** and is flagged
in §4.

---

## 2. Published — 13.5.0 (live on npm)

| Area        | Change                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Perf        | `tree()` is memoised and structurally shared. Whole-state read with nothing changed: **1,400 µs → 0.058 µs** |
| Perf        | Time travel is **flat in state size**: 50 writes over 10k rows, **340.60 ms → 0.04 ms**                      |
| Perf        | Serialisation change detection is O(1) reference compare, not `JSON.stringify` polling                       |
| New         | `compared()` / `byKeys()` — opt-in per-leaf equality                                                         |
| New         | **ST2018** — warns when a collection is modelled as a plain array leaf                                       |
| Fixed       | A held `byId()` reference died permanently across remove → re-add                                            |
| Fixed       | `timeTravel()` deep-cloned itself whenever _any_ tree in the process flushed                                 |
| ⚠️ Breaking | `tree()` returns a memoised, dev-frozen object. Mutating a snapshot throws in dev                            |

Release notes for the GitHub release page are written and staged at
`RELEASE-NOTES-13.5.0.md` (gitignored). **They were never posted** — the `gh`
CLI is authenticated as `jborgia_ttrax`, which has read-only access to
`JBorgia/signaltree`.

---

## 3. Committed, unreleased — 13.6.0

| Area         | Change                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Security** | `stored()` leaked the caller's `storage` contents into snapshots via the array path. Fixed at the marker (`options` is now non-enumerable), which closes the class rather than the one path |
| New          | **ST2020** duplicate `stored()` keys; **ST2021** marker inside an array                                                                                                                     |
| Changed      | `entityMap` snapshots carry entities only — `map` used to serialise as `{}` while holding 10,000 entities                                                                                   |
| Docs         | `onError` recovery recipe; RFC 0011 with 12–13 options per judgement call                                                                                                                   |

---

## 4. Uncommitted right now — READ BEFORE TOUCHING

Two files, both in this commit if you take the handoff commit as-is:

1. **`packages/core/src/lib/utils.ts`** — contains two distinct changes:
   - `status()` now materialises to `{ state, error }` instead of 8 keys.
     **This one is sound.** The six predicates are pure functions of those two.
   - A `LOADING → NotLoaded` normalisation inside `applyState()`.
     **⚠️ This one is suspected wrong and needs review.** `applyState` is used
     by **devtools replay only** (MEASURED — it is the sole caller). Persistence
     does not go through it. So the fix landed on the one path where exact
     restoration is arguably correct, and left every path that matters
     untouched. The _problem_ it addresses is real (§5.2); the _placement_ is
     probably not.
2. **`packages/core/src/lib/rehydration.spec.ts`** — 10 tests pinning the
   rehydrate contract. These pass and are worth keeping regardless of what
   happens to the `applyState` change; several will need updating if the
   normalisation moves.

---

## 5. The open investigation — snapshots vs rehydration

Full detail in
[`docs/architecture/snapshot-rehydration.md`](./architecture/snapshot-rehydration.md).
Summary:

**The idea.** A snapshot exists to **rehydrate a tree that already exists**, not
to carry enough to **reconstruct** one. `signalTree(initialState)` has already
built the shape, the markers and every signal — so a snapshot only needs leaf
**values**. Anything the live node can recompute is structure. The library
already follows this for `.derived()` and violated it for every marker.

**MEASURED blast radius** (`status()` and `entityMap`, published 13.5.0 vs the
working tree):

| area                       | 13.5.0        | working tree |
| -------------------------- | ------------- | ------------ |
| `tree()` (public read API) | ❌ 8 / 5 keys | ✅ 2 / 1     |
| `snapshotState()`          | ❌ 8 keys     | ✅ 2         |
| `JSON.stringify(tree())`   | ❌ `"map":{}` | ✅           |
| **`serialization()`**      | ❌ THROWS     | ❌ THROWS    |
| **`timeTravel` undo**      | ❌ silent     | ❌ silent    |
| **`tree(partial)`**        | ❌ silent     | ❌ silent    |
| `applyState()` (devtools)  | ✅            | ✅           |

**5.1 `serialization()` throws on `status()` and `entityMap`.** MEASURED,
pre-existing (identical in published 13.5.0). It emits **17 keys** for a
`status()` node — 2 state, 6 computeds, **9 setter methods** — then
`deserialize` tries to `.set()` each one back and a computed has no setter.
`stored()` and `form()` survive only because their nodes happen to materialise
to a scalar or a values object. Luck of shape.

**5.2 A persisted `LOADING` deadlocks on rehydrate.** MEASURED. `loading()`
true blocks a "don't fetch while loading" guard, `idle()` false blocks an
idle-gated fetch, `settled()` false blocks anything awaiting settlement — and
nothing is in flight to change any of them.

**5.3 `timeTravel` undo silently does not restore marker state.** MEASURED,
pre-existing. Undo appears to succeed and leaves `status()`/`entityMap` at their
post-change values. Arguably ranks with 5.1.

**5.4 Three restore paths disagree.** `applyState` (devtools only) restores an
entityMap; `serialization()`'s private `updateSignals` throws; `tree(partial)`
silently no-ops.

**The generalisable lesson**, and the reason this is worth a fresh pair of eyes:
three of these were fixed at three different layers before anyone noticed they
were one defect. When the read path emits structure and the write path expects
values, every consumer breaks differently, so the bugs never look related.

---

## 6. Everything else still open

| #   | Item                                                | Notes                                                                                                                                                                                         |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Rotate the npm token**                            | It is live, has publish rights to all 8 packages, and was pasted in plaintext in the session transcript three times. It was _not_ actually revoked despite an earlier belief that it had been |
| 2   | GitHub release notes for 13.5.0                     | Staged at `RELEASE-NOTES-13.5.0.md`; `gh` lacks write access                                                                                                                                  |
| 3   | Deploy the demo                                     | What's New, `compared()` docs and `llms.txt` are committed but not live                                                                                                                       |
| 4   | Verify the demo benchmark in Chrome                 | Every number this session is Node 24.3 / V8 13.6                                                                                                                                              |
| 5   | `tree({rows: [...]})` does not restore an entityMap | Silent no-op, pre-existing. Part of §5.4                                                                                                                                                      |
| 6   | `callable-syntax` mangles non-leaf calls            | RFC 0008: _"the premise is falsified, not the implementation."_ A design decision, not a bug fix                                                                                              |
| 7   | Split dev/prod bundle budget lines                  | RFC 0011 §4 option 10 — judged the best alternative and deferred rather than done under a release. `check-devmode-foldable` already measures the production number                            |
| 8   | 15 stale local branches                             | 25 merged ones were deleted; the rest are unmerged and need judgement                                                                                                                         |

---

## 7. Things this session got wrong — do not repeat

Recorded because each cost real time and several shipped before being caught.

1. **Benchmarking arms in one process.** An in-process race produced a **7.5×
   phantom that moved when an unrelated arm was added**. One process per arm.
   The rule is in `docs/architecture/design-thesis-and-benchmarking-rules.md`
   and was itself _reversed_ mid-session when measurement contradicted it.
2. **Three published figures were wrong**: `entityMap` "56×" (really 28.5×),
   array leaf "8× slower" (really parity), whole-state read "2.25× slower"
   (really four orders of magnitude).
3. **Two benchmark fixtures were no-ops** — writing the value already present,
   which is `deepEqual`'s worst case. Inflated a 53–218 ms workload to 385 ms.
4. **A "fix" for that introduced a worse bug**: a shared pass counter whose
   stride was the arm count, so results depended on how many arms were racing.
5. **"Time travel doesn't record direct leaf writes"** was asserted in two
   documents and repeated several times. It was false and is now retracted and
   pinned by tests. An undo feature that silently drops writes looks exactly
   like one that works — that has to be a test, never a reading of the source.
6. **"Incremental materialisation costs the write path nothing"** was wrong.
   Root partial updates are ~17 ns slower. Challenged as machine noise,
   re-measured with the versions in **alternating order** across 23 runs; the
   ranges do not overlap.
7. **Fixing symptoms at the layer where they surfaced** — see §5. Twice.
8. **A commit went in on a red suite** because `... | grep "Failed tasks"`
   _exits 0 when it finds that string_, so the `&&` chain continued. Verify by
   exit code.
9. **Two timing assertions were flaky** — absolute wall-clock budgets that
   passed alone and failed under parallel CI. Assert ratios.

---

## 8. Repo conventions worth knowing

- **Verify by exit code**, not by grepping output. See §7.8.
- **Tests:** `npx nx test core`, or `npx vitest run` from `packages/core`.
  Running bare `vitest` from the repo root gives `ngModule null`.
- **Gates that must pass before a release:** `nx run-many -t test/lint/build`,
  `tools/check-bundle-budget.mjs`, `tools/check-devmode-foldable.mjs`,
  `scripts/lint-skills.mjs`, `scripts/verify-version-claims.js`,
  `scripts/verify-release-state.js`.
- **Releasing:** `./scripts/release.sh minor` owns bump → changelog finalize →
  validate → signed tag → publish, and rolls back cleanly on failure (it did,
  once, on the bundle budget). It is interactive; pipe `yes |`. Needs
  `NPM_TOKEN`.
- **`ngDevMode` guards must be written INLINE.** A hoisted `const DEV` does not
  fold under esbuild.
- **Scratch files:** `zz-*` is gitignored (`.mjs` under `scripts/benchmarks/`,
  `.spec.ts` under `packages/`). Delete them when done — a stray
  `zz-dx-probe.spec.ts` was failing in the suite and is invisible to
  `git status`.
- **`@signaltree/shared` is `private: true`** and bundled into core. Its version
  lagging is NOT drift and needs no action. This was wrongly flagged twice.
- **Benchmark harnesses** need `scripts/benchmarks/dist-core` — a gitignored
  symlink. Recreate with
  `nx build core && ln -sfn ../../dist/packages/core scripts/benchmarks/dist-core`.

---

## 9. Where the reasoning lives

| Document                                                    | Contents                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `docs/architecture/design-thesis-and-benchmarking-rules.md` | The architecture's thesis, the benchmarking rules, the full-state anti-pattern, and 14 realisations |
| `docs/architecture/optimisation-options.md`                 | 41 optimisation options across 9 families, each MEASURED / REASONED / REJECTED                      |
| `docs/architecture/snapshot-rehydration.md`                 | The open investigation in §5                                                                        |
| `docs/rfcs/0011-13.6.0-questionable-changes.md`             | 12–13 options for each judgement call in 13.6.0, each with a recommendation and a "⚠️ Trap"         |
| `docs/rfcs/0008-post-13.3-open-items.md`                    | Older open items; items 1–3 are now closed                                                          |
| `docs/errors/README.md`                                     | Every `ST####` code → cause → fix                                                                   |

The convention in the RFCs is worth keeping: numbered options, a recommendation,
a runner-up, and an explicit **⚠️ Trap** naming the option that looks right and
is not. Several traps in RFC 0011 are options that were actively attractive and
lost only to measurement.
