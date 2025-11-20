---
applyTo: '**'
---

# SignalTree Release Process

## Critical: DO NOT Skip These Steps

Publishing broken packages to npm damages user trust and creates support burden. This process is **mandatory** for all releases.

## Pre-Release Checklist (Required)

Before running ANY release commands, verify:

### 1. Working Directory is Clean

```bash
git status
# Must show: "nothing to commit, working tree clean"
```

If there are uncommitted changes, commit or stash them first.

### 2. You're on the main branch and up-to-date

```bash
git checkout main
git pull origin main
```

### 3. All dependencies are installed

```bash
pnpm install --frozen-lockfile
```

### 4. Full validation passes

```bash
npm run validate:all
```

This runs:

- Linting (`lint:all`)
- Tests (`test:all`)
- Builds (`build:all`)
- Type declaration verification (`validate:types`)
- Package structure checks
- Export validation

**If any validation step fails, DO NOT proceed with release.**

## Release Commands (Use Nx Release)

SignalTree uses Nx's built-in release workflow. **Do not use custom scripts or manual version bumping.**

### Patch Release (Bug fixes)

```bash
pnpm nx release patch --yes
```

### Minor Release (New features, backward compatible)

```bash
pnpm nx release minor --yes
```

### Major Release (Breaking changes)

```bash
pnpm nx release major --yes
```

## What `nx release` Does

1. **Bumps versions** in all package.json files
2. **Updates CHANGELOG.md** from conventional commits
3. **Creates git commit** with message "chore(release): publish X.X.X"
4. **Creates git tag** vX.X.X
5. **Attempts to publish** to npm (requires authentication)

## npm Authentication

### First Time Setup (One-Time)

1. Create an automation token at https://www.npmjs.com/settings/counterreset/tokens

   - Click "Generate New Token"
   - Select "Automation" type (bypasses 2FA)
   - Copy the token

2. Add to `.npmrc` (workspace root):

   ```
   //registry.npmjs.org/:_authToken=npm_YOUR_TOKEN_HERE
   ```

3. **NEVER commit .npmrc with the token** - it's in .gitignore

### Publishing

If `nx release` fails at the publish step (common with 2FA), publish packages manually:

```bash
# Already versioned by nx release, just need to publish
cd dist/packages/core && npm publish
cd ../enterprise && npm publish
cd ../ng-forms && npm publish
cd ../callable-syntax && npm publish
cd ../types && npm publish
cd ../utils && npm publish
cd ../guardrails && npm publish
```

Or retry the publish step:

```bash
pnpm nx release publish
```

### Push to GitHub

After successful npm publish:

```bash
git push origin main --follow-tags
```

This pushes:

- The release commit
- The version tag (triggers GitHub release)

## Post-Release Verification (Required)

### 1. Verify npm packages

Visit https://www.npmjs.com/package/@signaltree/core and confirm:

- New version is published
- Package size is reasonable (check "Unpacked Size")
- Types are included in file list

### 2. Test installation in clean project

```bash
mkdir /tmp/test-signaltree && cd /tmp/test-signaltree
npm init -y
npm install @signaltree/core@latest
node -e "import('@signaltree/core').then(m => console.log(typeof m.signalTree))"
# Should print: "function"
```

### 3. Create GitHub release

- Go to https://github.com/JBorgia/signaltree/releases
- Click "Draft a new release"
- Select the version tag (vX.X.X)
- Copy CHANGELOG.md entry for this version
- Publish release

## Common Mistakes (DO NOT DO THESE)

❌ **DO NOT** manually edit version numbers in package.json
❌ **DO NOT** skip validation steps
❌ **DO NOT** publish with uncommitted changes
❌ **DO NOT** forget to push tags after publishing
❌ **DO NOT** use `npm version` or `npm publish` directly on packages
❌ **DO NOT** publish without running `validate:types` first
❌ **DO NOT** ignore build warnings

## Emergency Rollback

If you publish a broken release:

### 1. Deprecate the broken version immediately

```bash
npm deprecate @signaltree/core@X.X.X "Broken release, use X.X.Y instead"
npm deprecate @signaltree/enterprise@X.X.X "Broken release, use X.X.Y instead"
# ... repeat for all packages
```

### 2. Fix the issue locally

### 3. Release a new patch version

```bash
pnpm nx release patch --yes
```

### 4. Document the issue

Update CHANGELOG.md with details about what went wrong and how it was fixed.

## Release Types Reference

### Patch (X.X.N)

- Bug fixes
- Documentation updates
- Performance improvements (no API changes)
- Type declaration fixes
- Build configuration fixes

### Minor (X.N.0)

- New features (backward compatible)
- New APIs added
- New enhancers or utilities
- Deprecations (with backward compatibility)

### Major (N.0.0)

- Breaking API changes
- Removed deprecated features
- Changed behavior of existing APIs
- Updated minimum dependency versions

## Validation Script Details

### `npm run validate:types`

Checks for stray `dist/**/*.d.ts` files that would break TypeScript resolution.

**Why it exists**: Nx's typeDefinitions plugin generates incorrect re-export files. Our `package.json` files array excludes them, but this script ensures no regression occurs.

**What it catches**:

- Incorrect package.json files configuration
- Nx plugin behavior changes after upgrades
- Build pipeline modifications that break type exports

**If it fails**: Review `.github/instructions/type-declarations-fix.md` for the solution.

## Pre-Release Testing Strategy

For major/minor releases with significant changes:

1. **Test locally** with `npm link` or `file:` protocol
2. **Publish to Verdaccio** (local npm registry) first
3. **Test Angular integration** (apps/demo)
4. **Run performance benchmarks** (`npm run perf:run`)
5. **Check bundle sizes** (`npm run size:check`)

## Communication

After releasing:

1. **Announce on GitHub Discussions** (if significant changes)
2. **Update documentation** at https://signaltree.dev
3. **Respond to issues** that the release addresses
4. **Monitor npm download stats** for anomalies

## Troubleshooting

### "This operation requires a one-time password"

→ Your npm account has 2FA enabled. Create an automation token (see Authentication section).

### "Version X.X.X already exists"

→ You're trying to republish an existing version. Bump the version and try again.

### "Package validation failed"

→ Run `npm run validate:all` to see detailed errors. Fix them before releasing.

### "Git working directory is dirty"

→ Commit or stash your changes before releasing.

### Build fails on CI but passes locally

→ Check that you've pushed all changes and that `pnpm-lock.yaml` is committed.

## Summary

1. ✅ Validate everything (`npm run validate:all`)
2. ✅ Use Nx release commands (`pnpm nx release patch/minor/major --yes`)
3. ✅ Publish to npm (automated or manual fallback)
4. ✅ Push tags to GitHub (`git push origin main --follow-tags`)
5. ✅ Verify on npm and test installation
6. ✅ Create GitHub release with changelog

**Never skip validation. Never publish broken packages.**
