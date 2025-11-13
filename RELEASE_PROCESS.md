# SignalTree Release Process

This document outlines the comprehensive release process for SignalTree packages, including all validation checks and quality gates.

## Overview

The SignalTree release process is designed to ensure maximum quality and consistency across all published packages. Every release goes through extensive automated validation before any code is published to npm.

## Pre-Release Checklist

Before initiating a release, ensure:

1. ✅ All feature work is complete and merged to `main`
2. ✅ CHANGELOG.md is updated with release notes
3. ✅ All tests pass locally
4. ✅ No uncommitted changes in working directory
5. ✅ You have npm authentication configured (automation token)
6. ✅ You are on the correct branch (typically `main`)

## Release Commands

### Standard Release

```bash
# Patch release (4.0.12 → 4.0.13)
bash scripts/release.sh patch

# Minor release (4.0.12 → 4.1.0)
bash scripts/release.sh minor

# Major release (4.0.12 → 5.0.0)
bash scripts/release.sh major
```

### Non-Interactive Release

For CI/CD environments:

```bash
bash scripts/release.sh patch --yes
```

### Skip Tests (Not Recommended)

Only use when tests have been run separately:

```bash
bash scripts/release.sh patch skip-tests
```

## Validation Pipeline

The release script runs a comprehensive validation pipeline before making any changes:

### 1. Clean Working Directory ✅
- Ensures no uncommitted changes
- **Severity**: Error (blocks release)

### 2. Dependency Installation ✅
- Runs `pnpm install --frozen-lockfile`
- Verifies lockfile consistency
- **Severity**: Error (blocks release)

### 3. Type Checking ✅
- Runs TypeScript compiler across all packages
- Ensures type safety
- **Severity**: Error (blocks release)

### 4. Linting ✅
- Runs ESLint on all packages
- Enforces code quality standards
- Checks for dependency issues
- **Severity**: Error (blocks release)

### 5. Unit Tests ✅
- Runs all unit tests across packages
- Includes specialized guardrails tests
- **Severity**: Error (blocks release)

### 6. Test Coverage ✅
- Generates coverage reports
- Validates coverage thresholds:
  - Statements: 80%
  - Branches: 75%
  - Functions: 80%
  - Lines: 80%
- **Severity**: Error (blocks release)

### 7. Build All Packages ✅
- Builds all packages in dependency order
- Verifies production builds
- **Severity**: Error (blocks release)

### 8. Package Verification ✅
- Validates `package.json` configurations
- Checks exports and entry points
- Verifies peer dependencies
- **Severity**: Error (blocks release)

### 9. Distribution Files ✅
- Checks all expected dist files exist
- Verifies index files, type definitions
- Special checks for conditional exports (guardrails)
- **Severity**: Error (blocks release)

### 10. Bundle Size Analysis ✅
- Analyzes bundle sizes (raw and gzipped)
- Validates against maximum allowed sizes:
  - `@signaltree/core`: 15KB (5KB gzipped)
  - `@signaltree/ng-forms`: 10KB (4KB gzipped)
  - `@signaltree/callable-syntax`: 5KB (2KB gzipped)
  - `@signaltree/enterprise`: 8KB (3KB gzipped)
  - `@signaltree/guardrails`: 12KB (4KB gzipped)
- **Severity**: Error (blocks release)

### 11. Sanity Checks ✅
- Verifies build outputs are correct
- Checks for common issues
- **Severity**: Error (blocks release)

### 12. Performance Benchmarks ⚠️
- Runs performance benchmark suite
- Generates performance metrics
- **Severity**: Warning (logs but doesn't block)

### 13. Documentation Validation ⚠️
- Checks required documentation files exist
- Verifies CHANGELOG includes current version
- Validates package-level READMEs
- **Severity**: Warning (logs but doesn't block)

## Release Steps

Once validation passes, the release script:

1. **Creates Version Backup**
   - Stores original versions for rollback capability

2. **Updates Package Versions**
   - Updates workspace `package.json`
   - Updates all package `package.json` files
   - Updates inter-package dependencies

3. **Builds Packages**
   - Builds in dependency order
   - Core package first, then dependents

4. **Commits Changes**
   - Commits version bumps with standardized message

5. **Creates Git Tag**
   - Tags release as `v{version}`

6. **Pushes to GitHub**
   - Pushes commit and tag to origin

7. **Publishes to npm**
   - Publishes all packages with `--access public`
   - Handles already-published versions gracefully

8. **Cleanup**
   - Removes backup files
   - Displays success summary

## Rollback Mechanism

If any step fails, the script automatically:

1. ✅ Restores original package versions
2. ✅ Cleans up build artifacts
3. ✅ Removes created git tags (local and remote)
4. ✅ Resets git working directory
5. ✅ Displays error summary

No manual cleanup required!

## Configuration Files

### `.release-rules.json`
Comprehensive configuration for validation rules, including:
- Check definitions and commands
- Severity levels (error/warning)
- Package list
- Coverage and bundle size thresholds

### `scripts/pre-publish-validation.sh`
Main validation orchestration script that runs all checks.

### `scripts/verify-dist.sh`
Verifies distribution files after build.

### `scripts/verify-exports.js`
Validates package exports and entry points.

### `scripts/validate-docs.sh`
Checks documentation completeness.

## Troubleshooting

### Validation Fails

If validation fails:

1. Review the error output carefully
2. Fix the reported issues
3. Run validation manually to verify:
   ```bash
   bash scripts/pre-publish-validation.sh
   ```
4. Commit fixes and retry release

### Build Fails Mid-Release

The rollback mechanism will automatically revert changes. No action needed.

### npm Publish Fails

If publishing fails:

1. Check your npm authentication:
   ```bash
   npm whoami
   ```

2. Ensure you have an automation token configured:
   ```bash
   npm config set //registry.npmjs.org/:_authToken=YOUR_TOKEN
   ```

3. Check if the version is already published:
   ```bash
   npm view @signaltree/core versions
   ```

4. If needed, publish manually:
   ```bash
   bash scripts/publish-all.sh
   ```

### Git Tag Already Exists

If the tag already exists locally:

```bash
# Delete local tag
git tag -d v4.0.12

# Delete remote tag (careful!)
git push origin --delete v4.0.12
```

## Manual Validation

Run individual validation checks:

```bash
# Full validation suite
bash scripts/pre-publish-validation.sh

# Individual checks
pnpm test:all
pnpm lint
NX_DAEMON=false pnpm build:all
bash scripts/verify-packages.sh
node scripts/consolidated-bundle-analysis.js
bash scripts/validate-docs.sh
```

## Best Practices

1. **Always run validation before starting a release**
   ```bash
   bash scripts/pre-publish-validation.sh
   ```

2. **Keep CHANGELOG.md up to date**
   - Add entries before releasing
   - Include version number and date

3. **Run performance benchmarks regularly**
   - Update documentation with latest results
   - Track performance regressions

4. **Review bundle sizes**
   - Keep packages under size limits
   - Investigate any size increases

5. **Test in clean environment**
   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   bash scripts/pre-publish-validation.sh
   ```

6. **Never skip validation**
   - Even if you're "just" fixing a typo
   - Quality gates exist for a reason

## Emergency Procedures

### Need to Unpublish

npm allows unpublishing within 72 hours:

```bash
npm unpublish @signaltree/core@4.0.12
```

⚠️ **WARNING**: This breaks dependent projects! Only use in emergencies.

### Need to Deprecate

Instead of unpublishing, deprecate:

```bash
npm deprecate @signaltree/core@4.0.12 "Critical bug, use 4.0.13 instead"
```

## Post-Release Checklist

After successful release:

1. ✅ Verify packages on npm: https://www.npmjs.com/org/signaltree
2. ✅ Check GitHub release created: https://github.com/JBorgia/signaltree/releases
3. ✅ Test installation in clean project:
   ```bash
   npm install @signaltree/core
   ```
4. ✅ Update demo application if needed
5. ✅ Announce release (if major/minor)

## Automation

The release process is designed for both manual and automated use:

- **Manual**: Interactive prompts, detailed output
- **CI/CD**: Use `--yes` flag for non-interactive mode

Example GitHub Actions workflow:

```yaml
name: Release
on:
  workflow_dispatch:
    inputs:
      release_type:
        description: 'Release type'
        required: true
        default: 'patch'
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      
      - name: Configure npm
        run: |
          npm config set //registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}
      
      - name: Release
        run: bash scripts/release.sh ${{ inputs.release_type }} --yes
```

## Support

For questions or issues with the release process:

1. Check this documentation
2. Review `.release-rules.json` for configuration
3. Check script output for detailed error messages
4. Open an issue on GitHub if needed

---

**Last Updated**: 2024-11-13
**Version**: 1.0.0

