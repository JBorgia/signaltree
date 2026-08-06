# AGENTS.md

Guidance for AI agents working with this repository. Two audiences: contributors changing SignalTree source, and agents consuming `@signaltree/*` packages in downstream apps.

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

| Package           | Max size | Max gzipped |
| ----------------- | -------- | ----------- |
| `core`            | 15 KB    | 5.8 KB      |
| `ng-forms`        | 10 KB    | 4 KB        |
| `enterprise`      | 8 KB     | 3 KB        |
| `guardrails`      | 12 KB    | 4 KB        |
| `schema`          | 16 KB    | 6 KB        |

The authoritative gzip gate is [`tools/check-bundle-budget.mjs`](tools/check-bundle-budget.mjs) — the single source of truth for library size claims; every other doc's numbers must trace back to it. Current measured (own-code only; `@angular`/`rxjs`/`tslib` external): bare `signalTree` **5.46 KB** (budget 5.8), a tree using a plain `entityMap()` **8.39 KB** (budget 8.6). A cache-aware `entityMap({ load: loader(...) })` pulls the loader machinery on top; a plain `entityMap()` tree-shakes it out entirely (v12, RFC 0005 §6). Check with `node tools/check-bundle-budget.mjs`.

### Validation pipeline

```bash
npm run validate
```

Runs the 13-step pre-publish pipeline: clean tree, frozen lockfile install, tsconfig sanity, lint, tests, coverage thresholds (80% statements / 75% branches / 80% functions / 80% lines), all-package build, package-config checks, dist-file checks, bundle-size limits, sanity checks, perf benchmarks (warn), docs completeness (warn). See [`.github/VALIDATION_GUIDE.md`](.github/VALIDATION_GUIDE.md) and [`docs/VALIDATION_SYSTEM.md`](docs/VALIDATION_SYSTEM.md).

### Docs & demo currency (hard rule)

Before signing off any release or size/perf change:

- Refresh README files, docs, and published metrics against the latest `artifacts/*.json`.
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

If you are helping a user build on top of `@signaltree/*` packages, read [`docs/skills/using-signaltree/SKILL.md`](docs/skills/using-signaltree/SKILL.md) first — that is the canonical vendor-neutral skill with the mental model, quick-start, enhancer decision tree, and pointers into `reference/*.md`. Per-package sub-skills are nested one level deep (`docs/skills/using-signaltree/{ng-forms,enterprise,guardrails,events,realtime}/SKILL.md`); harnesses that scan recursively will discover them automatically, and the primary skill tells agents when to load each one. Cursor and Claude Code shims at `.cursor/skills/using-signaltree/SKILL.md` and `.claude/skills/using-signaltree/SKILL.md` are pointer files that redirect to the canonical location.

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
