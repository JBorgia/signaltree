# Releasing SignalTree

> Added with the release-pipeline hardening (v12 audit intake, 2026-07-24).
> The sanctioned publish path is **CI** (`.github/workflows/publish.yml`);
> `scripts/release.sh` remains for emergencies only.

## Sanctioned path: publish from CI

1. Land the release on `main`: version bumps in all `package.json`s
   (`node tools/generate-version-env.cjs` for the demo constants) and a
   `## <version> (YYYY-MM-DD)` CHANGELOG heading — the changelog gate blocks
   otherwise.
2. Create and push a **signed** tag for the exact commit: `git tag -s -m "Release vX.Y.Z" vX.Y.Z && git push origin vX.Y.Z`.
3. The tag push runs `release.yml`, which first **verifies the tagged
   commit** (frozen install, lint, typecheck, tests, builds, built-barrel
   resolution, guardrails-exports, taught-symbols, version-claims,
   tarball-consumer gate, changelog entry) and only then creates the GitHub
   release.
4. Actions → "Publish to npm (CI)" → Run workflow with the tag. This runs
   `publish.yml`, which **reruns the same full gate set against the tag**,
   builds production, and publishes all 8 packages with `NPM_TOKEN`
   (`scripts/ci-publish.sh`, provenance enabled). Re-runs are safe:
   already-published versions are skipped. (Note: releases created by
   `release.yml` do not auto-trigger `publish.yml` — `GITHUB_TOKEN` events
   never trigger other workflows — so the dispatch step is deliberate.)

## Owner setup (one-time)

- **`NPM_TOKEN` secret** — create a *granular* npm automation token with
  read/write on the `@signaltree/*` packages; add it under GitHub →
  Settings → Secrets and variables → Actions → `NPM_TOKEN`.
- **Tag protection** — Settings → Rules → Rulesets: a tag ruleset for `v*`
  restricting creation to the owner.
- **Required check** — branch protection on `main` requiring the
  `Validate` workflow, so only gated commits can become tags. The publish
  workflow's own `verify` job is the last line regardless.

## Emergency path: local release.sh

`./scripts/release.sh [major|minor|patch] [skip-tests]` still performs the
full local flow (validate → bump → build → changelog gate → signed tag →
publish → push).

- `skip-tests` **no longer bypasses validation**: it sets `FAST_VALIDATE=1`,
  which skips only unit tests, coverage, and benchmarks. All correctness
  gates (builds, barrel + export parity, tarball-consumer, taught-symbols,
  version-claims, guardrails-exports, size, release-state, skill lint)
  still run and still block. There is no flag that skips them.
- `npm run publish:all` now runs the full `npm run validate` suite first —
  no publish path dodges the gates.
