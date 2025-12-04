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

## Release Commands (Use Release Scripts - NOT nx release directly)

SignalTree has comprehensive release automation in `scripts/release.sh`. **ALWAYS use these npm scripts instead of `nx release` directly.**

### Recommended Release Flow (Automated)

```bash
# For patch releases (bug fixes)
npm run release:patch

# For minor releases (new features, backward compatible)
npm run release:minor

# For major releases (breaking changes)
npm run release:major
```

### What the Release Script Does

The `scripts/release.sh` script provides a complete, reliable release workflow:

1. **Runs comprehensive pre-publish validation** (`scripts/pre-publish-validation.sh`)

   - All tests must pass
   - All builds must succeed
   - Type declarations must be valid
   - Bundle sizes verified
   - Export integrity checked

2. **Bumps versions** in all package.json files (workspace + all packages)

3. **Updates peer dependencies** with correct version constraints

4. **Builds all packages** in production mode

5. **Updates CHANGELOG.md** from conventional commits

6. **Creates git commit** with message "chore(release): publish X.X.X"

7. **Creates git tag** vX.X.X

8. **Publishes to npm** in correct dependency order (core first, then others)

9. **Provides rollback capability** if anything fails

### Why NOT to use `nx release` directly

❌ **DO NOT run `pnpm nx release patch/minor/major` directly**

Problems with direct `nx release`:

- Doesn't update workspace: dependencies correctly (leaves `workspace:*` in package.json)
- May not update all package versions consistently
- No pre-publish validation
- No rollback on failure
- Can publish incomplete/broken packages
- Skips peer dependency updates

### Manual Publishing (Emergency Only)

If the automated script fails and you need to publish manually:

```bash
# 1. Ensure all packages are built
npm run build:all

# 2. Check package versions are correct
for pkg in core types utils callable-syntax guardrails enterprise ng-forms; do
  echo "$pkg: $(grep version packages/$pkg/package.json | head -1)"
done

# 3. Replace workspace: dependencies with real versions
for pkg in guardrails enterprise ng-forms; do
  sed -i '' 's/"workspace:\*"/"^X.X.X"/g' packages/$pkg/package.json
done

# 4. Publish in dependency order (core first!)
cd packages/core && npm publish && cd ../..
cd packages/types && npm publish && cd ../..
cd packages/utils && npm publish && cd ../..
cd packages/callable-syntax && npm publish && cd ../..
cd packages/guardrails && npm publish && cd ../..
cd packages/enterprise && npm publish && cd ../..
cd packages/ng-forms && npm publish && cd ../..

# 5. Commit version changes
git add -A
git commit -m "chore(release): publish vX.X.X"
git tag vX.X.X
git push origin main --follow-tags
```

## npm Authentication

### Authentication Methods

SignalTree packages require npm authentication for publishing. There are two approaches:

#### Method 1: Web Login (Recommended for Local Development)

```bash
npm login --auth-type=web
```

This opens a browser for authentication. **However, if your account has 2FA enabled, publishing will still require OTP codes**, making automated releases difficult.

#### Method 2: Automation Token (Recommended for CI/Releases)

1. Create an automation token at https://www.npmjs.com/settings/counterreset/tokens

   - Click "Generate New Token"
   - Select **"Automation"** type (bypasses 2FA for publishing)
   - Copy the token (starts with `npm_`)

2. **DO NOT add token to workspace `.npmrc`** (it will be rejected by GitHub secret scanning)

3. Add to your **user-level** `~/.npmrc` instead:

   ```
   //registry.npmjs.org/:_authToken=npm_YOUR_TOKEN_HERE
   ```

4. Or set as environment variable (for CI):
   ```bash
   export NPM_TOKEN=npm_YOUR_TOKEN_HERE
   ```

### Critical: Never Commit Tokens

- ❌ **DO NOT** add tokens to workspace `.npmrc`
- ❌ **DO NOT** commit tokens to git
- ✅ **DO** use `~/.npmrc` (user-level config)
- ✅ **DO** use environment variables for CI
- ✅ **DO** use GitHub secrets for Actions

If you accidentally commit a token:

1. Immediately revoke it at npmjs.com
2. Remove from commit history: `git commit --amend` or `git rebase -i`
3. Force push if already pushed: `git push --force`
4. Generate a new token

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

❌ **DO NOT** use `pnpm nx release` directly (use `npm run release:patch/minor/major` instead)
❌ **DO NOT** manually edit version numbers in package.json
❌ **DO NOT** skip validation steps
❌ **DO NOT** publish with uncommitted changes
❌ **DO NOT** forget to push tags after publishing
❌ **DO NOT** use `npm version` or `npm publish` directly on packages
❌ **DO NOT** publish without running `validate:types` first
❌ **DO NOT** ignore build warnings
❌ **DO NOT** leave `workspace:*` dependencies in package.json files before publishing

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
npm run release:patch
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
2. ✅ Use release scripts (`npm run release:patch/minor/major`)
3. ✅ Ensure npm authentication is configured (automation token in `~/.npmrc`)
4. ✅ Push tags to GitHub (`git push origin main --follow-tags`)
5. ✅ Verify on npm and test installation
6. ✅ Create GitHub release with changelog

**Never skip validation. Never publish broken packages.**

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
