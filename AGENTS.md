# AGENTS.md

Guidance for AI agents working with this repository. Two audiences: contributors changing SignalTree source, and agents consuming `@signaltree/*` packages in downstream apps.

## Do not write RFCs

We make the change. `TODO.md` is where decided-but-not-done work lives; put it
there and go do it.

`docs/rfcs/` is an ARCHIVE of decisions already taken, kept for the options that
were **rejected** and why — that is what stops them being re-proposed. An RFC is
what an OUTSIDE contributor writes to propose something. Creating
`docs/rfcs/00NN-my-idea.md` for internal work produces a document that reads as
pending when the work has shipped: four RFC statuses said "proposed" or "Accepted"
for work already in a release, and 0012 claimed it had not shipped when all three
of its items had.

## Release work

Read [`RELEASE-1.0.md`](RELEASE-1.0.md) before release-related work.

### Continuous execution rule

Continue working autonomously through the current release phase.

After completing an item:

1. Run focused validation.
2. Run the required authoritative test/build/lint gates.
3. Inspect `git status` and `git diff`.
4. Commit only files belonging to that conceptual change.
5. Update `RELEASE-1.0.md` with the completed item, commit hash, validation performed, and any newly discovered work.
6. Immediately select the next highest-priority unchecked item in the same phase.
7. Continue without asking for permission.

Do not stop merely to:

- report progress
- ask whether to continue
- ask permission to run normal tests
- ask permission to make an obvious follow-up fix
- ask permission to commit a validated isolated change
- choose between equivalent implementation details

For every release slice:

1. Inspect current HEAD, relevant implementation, and the nearest existing tests.
2. Identify the cheapest falsifier.
3. Add characterization before production changes when practical.
4. Make the smallest change that closes the demonstrated problem.
5. Run focused validation first.
6. Run the authoritative relevant test/build/lint gates before checkpointing.
7. Review `git diff` and `git status`.
8. Commit only files belonging to the slice.
9. Update `RELEASE-1.0.md` after the checkpoint.
10. Report the invariant proven, files changed, tests run, commit hash, and next recommended unchecked item.

## STOP and ask Jonathan only when a real decision is required

A decision is required if:

- two materially different public API designs are viable
- a frozen architecture invariant appears to be wrong
- fixing a test requires changing documented semantics
- a backward-compatibility/product-scope decision is required
- a feature must be removed, deferred, or substantially redesigned
- the change affects package naming/versioning/public exports
- security or destructive operations require authorization
- the next step cannot be determined from `RELEASE-1.0.md`
- tests expose contradictory requirements
- proceeding would require modifying unrelated user work

When stopping, provide:

```text
DECISION REQUIRED

Question:
<one precise question>

Why it matters:
<short explanation>

Option A:
<consequences>

Option B:
<consequences>

Recommendation:
<recommended option and reason>

Work completed before stopping:
<commits/tests>
```

### Failed test rule

A failed test is not itself a reason to stop.

If the failure has an unambiguous local fix consistent with the current architecture and task, repair it, rerun validation, and continue.

Stop only if resolving the failure requires choosing or changing semantics, API, scope, compatibility, or another release invariant.

### Commit authority

The agent may create local git commits without requesting approval when:

- the change is one conceptual release item
- relevant focused tests pass
- authoritative required gates pass
- staged files have been inspected
- unrelated dirty files are excluded

Do not push, publish, tag, merge, or rewrite shared history without explicit user authorization.

Do not:

- optimize already-green paths
- mix infrastructure work with kernel work
- alter unrelated dirty files
- change frozen causal semantics without a red correctness test
- weaken public types to simplify runtime implementation
- start the next release phase in the same session unless the current phase gate is satisfied

## For Contributors

Quick-reference distilled from [`.cursorrules`](.cursorrules). That file remains the full rulebook — read it before non-trivial changes.

### Stack

- **Package manager**: pnpm 8+ (required — do not use npm/yarn for workspace ops)
- **Monorepo tool**: Nx
- **Language**: TypeScript (strict, no `any`; prefer `unknown`)
- **Builds**: Rollup for packages & guardrails, Angular CLI for the demo app
- **Tests**: Vitest
- **Node**: 18+ LTS

### Common commands

```bash
# Install
pnpm install

# Build
pnpm run build:all            # all packages
nx build core                 # single package
pnpm run build:production     # production build

# Test
pnpm run test:all
nx test core
pnpm nx test guardrails --pool=forks --poolOptions.forks.singleFork

# Lint / format
pnpm run lint:all
pnpm run lint:fix:all

# Demo
pnpm start                    # dev server
pnpm nx build demo --configuration=production
```

### Bundle size limits (enforced in validation)

| Package      | Max size | Max gzipped |
| ------------ | -------- | ----------- |
| `core`       | 15 KB    | 5.8 KB      |
| `ng-forms`   | 10 KB    | 4 KB        |
| `enterprise` | 8 KB     | 3 KB        |
| `guardrails` | 12 KB    | 4 KB        |
| `schema`     | 16 KB    | 6 KB        |

The authoritative gzip gate is [`tools/check-bundle-budget.mjs`](tools/check-bundle-budget.mjs) — the single source of truth for library size claims; every other doc's numbers must trace back to it. Current measured (own-code only; `@angular`/`rxjs`/`tslib` external): bare `signalTree` **5.46 KB** (budget 5.8), a tree using a plain `entityMap()` **8.39 KB** (budget 8.6). A cache-aware `entityMap({ load: loader(...) })` pulls the loader machinery on top; a plain `entityMap()` tree-shakes it out entirely (v12, RFC 0005 §6). Check with `node tools/check-bundle-budget.mjs`.

### Validation pipeline

```bash
npm run validate
```

Runs the 13-step pre-publish pipeline: clean tree, frozen lockfile install, tsconfig sanity, lint, tests, coverage thresholds (80% statements / 75% branches / 80% functions / 80% lines), all-package build, package-config checks, dist-file checks, bundle-size limits, sanity checks, perf benchmarks (warn), docs completeness (warn). See [`.github/VALIDATION_GUIDE.md`](.github/VALIDATION_GUIDE.md).

### Docs & demo currency (hard rule)

Before signing off any release or size/perf change:

- **Refresh published metrics from the GENERATORS, never from `artifacts/*.json`.**
  Every figure in a doc must name the tool that produces it — `tools/size-report.mjs`
  (per-feature bundle deltas), `tools/check-bundle-budget.mjs` (enforced ceilings),
  `tools/bench-compare.mjs` (cross-library collection and undo/redo),
  `tools/bench-vs-signalstore.mjs` (task-level vs `@ngrx/signals`),
  `tools/bench-depth-latency.mjs`, `tools/bench-leaf-equality.mjs`,
  `tools/bench-ssr-payload.mjs`. `tools/check-numeric-claims.mjs` enforces this
  and ratchets the backlog.

  This line used to say "against the latest `artifacts/*.json`", and that was
  the instruction-level cause of a whole class of wrong published numbers.
  `artifacts/` is **gitignored** — untracked local scratch that varies per
  machine, is often absent, and goes stale silently. The copy on this machine
  in August 2026 still listed `enterprise`, a package dropped in 14.0.0, and put
  core at 489 bytes gzip where the real figure is ~5,900 because
  `scripts/perf-suite.js` measures the re-export barrel rather than what a
  consumer ships. Sourcing docs from it propagated all three.

  Read `artifacts/*.json` for exploration if you like. Do not publish from it.

- Rebuild the demo (`pnpm nx build demo --configuration=production`) against the current workspace.
- Flag mismatches or failures — treat them as blocking.

### Private packages

`@signaltree/shared` is `"private": true`, bundled at build time via Rollup, and must never appear in `dependencies` or `peerDependencies` of published packages. Use `devDependencies` only when needed for local development.

### Release flow

```bash
npm run release         # patch
npm run release:minor   # minor
npm run release:major   # major
```

The release script runs `validate`, bumps versions, builds, tags, and publishes — with automatic rollback (restores versions, cleans artifacts, removes local and remote tags) on any failure. See [`RELEASE_PROCESS.md`](RELEASE_PROCESS.md).

### Commit conventions

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`.

## For Agents Consuming SignalTree

**There is currently no consumer-facing skill, and that is deliberate.** The
`using-signaltree` skill, its per-package sub-skills, and the harness shims were
deleted in `7696225d` along with the rest of the AI-discoverability artifacts.
They taught APIs that no longer exist and, more importantly, most of what they
taught that was still accurate described concepts that have not been
survival-audited.

Until the surviving public surface freezes, fall back to the package types and
the READMEs. That is the intended behaviour, not a gap to route around: a
missing skill makes an agent read the types; a stale one makes it emit deleted
APIs with conviction.

Writing a replacement is a deferred obligation owed after the API freeze — see
`RELEASE-1.0.md` § "AI DISCOVERABILITY". Do not recreate a pointer shim to the
deleted path; two have already been committed pointing at targets that did not
exist.

## Type-checking gates

`npm run typecheck` runs two passes, and the split is deliberate:

- **`typecheck:typing`** — `packages/core/tsconfig.typecheck.json`, which
  includes ONLY `src/**/*.typing.spec.ts`. Those files are excluded from vitest
  (esbuild strips types without checking them), so `tsc` is the only thing that
  reads them. They carry the `@ts-expect-error` assertions that pin what must
  NOT compile.
- **`typecheck:source`** — `tsconfig.typecheck-all.json`, every package's `src`
  plus `apps/demo/src`, excluding specs.

The second pass was added in 14.0.0 after `npm run typecheck` reported **zero
errors** for a breaking type change that broke 22 call sites — because it had
never covered anything but core's typing specs. The demo build was the only
thing that caught them, and nothing required it to run.

Three things this config has to get right, each of which produced a wave of
false positives while it was being written:

1. **`strict: true` explicitly.** `tsconfig.base.json` sets `strict: false` and
   every package turns it back on individually. Inheriting the loose setting
   broke discriminated-union narrowing and invented an error in
   `async-query.ts` that does not exist.
2. **Include `.d.ts`.** Excluding them dropped `apps/demo/src/benchmarks.d.ts`
   and made three declared `window` globals look undeclared.
3. **`types: ['node', 'vitest/globals']`**, or every spec-adjacent file reports
   `Cannot find name 'describe'`.

**Known debt:** spec files carry ~409 type errors and are excluded from
`typecheck:source` for now. They pass at runtime because vitest never
type-checks them. Narrowing that exclusion is worth doing; do it a directory at
a time rather than in one sweep.

## Publishing to npm

Gates that run immediately before `npm publish`, in this order — all three
publish paths (`ci-publish.sh`, `publish-all.sh`, `release.sh`) call the same
scripts, because two copies and one hole is what caused the drift they exist to
prevent:

1. `scripts/resolve-workspace-specs.mjs` — rewrites `workspace:*` to a real
   range and proves none survive. A published `workspace:*` is not valid semver
   and fails every install.
2. `scripts/verify-publish-artifacts.mjs` — every glob in `files` must resolve
   to a real file in dist. npm ships a tarball missing an unmatched glob without
   a word.
3. `tools/verify-consumer-typecheck.mjs` — packs the tarball, installs it into a
   throwaway project and TYPE-CHECKS consumer code under both `bundler` and
   `node16` resolution. `verify-tarball-consumer.mjs` only proves the resolver
   finds the files; this proves the shipped types compile.

### Two decisions recorded so they are not re-litigated

**No `engines` field, deliberately.** These are browser libraries; nothing in
them depends on a Node version at runtime (core only reads
`globalThis.process?.env.NODE_ENV` behind a guard). The real constraint belongs
to the Angular version the consumer already chose, and our supported range spans
Angular 20–22, whose own Node requirements differ. Declaring a range would
either duplicate Angular's or contradict it, and being wrong here produces
spurious install warnings for a valid setup. `@ngrx/signals` declares none
either. The one arguable exception is `@signaltree/events`, which ships a NestJS
subpath — but the same package also ships an Angular subpath, so a package-level
`engines` would constrain browser consumers for a server-only reason.

**`--strict-libs` on the consumer gate is RED and not gated.** Run
`node tools/verify-consumer-typecheck.mjs --strict-libs` to see it.

_Effect (measured):_ the emitted per-file `.d.ts` reference several names they
never declare — `DefaultKey`, `EntityMapComputedSlices`,
`EntityMapMarkerWithSlices`, `PathNotifierHandler`, `HydrateMode` — and
`index.d.ts` re-exports `isDev` from `lib/constants`, whose emitted declaration
does not contain it. A consumer compiling with `skipLibCheck: false` sees
`TS2304`/`TS2305`.

_Cause:_ `@nx/rollup:rollup` bundles declarations per ENTRY POINT (there are six:
the barrel plus `security`, `lazy`, `edit-session`, `storage`, `authoring`) and
omits declarations it judges unreachable from those exports — while the per-file
`.d.ts` it also emits still reference them.

_Impact:_ none for `skipLibCheck: true`, which is the Angular CLI default and
effectively universal. That is the configuration the gate enforces.

_Two fixes that DO NOT work — both tried, both reverted, recorded so the next
person does not spend the afternoon I did:_

1. **Re-exporting the missing names from the barrel makes it WORSE.** The barrel
   then points at declarations that still are not emitted, turning five `TS2304`s
   into those plus four `TS2305`s.
2. **`stripInternal` is not the cause.** Three of the five names carry
   `@internal`, which makes it a compelling theory. Removing every one of those
   tags and rebuilding clean changed the error list by exactly nothing.

The real fix is in the declaration build — most likely emitting declarations from
`tsc` rather than from the rollup dts bundler. Tracked debt, not a hidden
failure.
