# SignalTree Validation & Quality Gates Quick Reference

## Quick Commands

### Run Full Validation

```bash
npm run validate
# or
bash scripts/pre-publish-validation.sh
```

### Run Individual Checks

```bash
# Dependencies
pnpm install --frozen-lockfile

# Linting
npm run lint:all

# Tests
npm run test:all

# Test Coverage
bash scripts/test-coverage.sh

# Build
npm run build:all

# Package Verification
bash scripts/verify-packages.sh

# Distribution Files
npm run validate:dist

# Package Exports
npm run validate:exports

# Documentation
npm run validate:docs

# Bundle Analysis
node scripts/consolidated-bundle-analysis.js
```

## Pre-Release Checklist

- [ ] Working directory is clean (no uncommitted changes)
- [ ] All dependencies installed and lockfile up to date
- [ ] All tests passing
- [ ] Linting passing
- [ ] All packages build successfully
- [ ] Bundle sizes within limits
- [ ] Documentation up to date (especially CHANGELOG.md)
- [ ] npm authentication configured

## Release Process

### Standard Release

```bash
# Patch (4.0.12 → 4.0.13)
npm run release

# Minor (4.0.12 → 4.1.0)
npm run release:minor

# Major (4.0.12 → 5.0.0)
npm run release:major
```

### What Happens During Release

1. **Pre-Publish Validation** - Runs all 13 validation checks
2. **Version Backup** - Creates rollback point
3. **Version Update** - Bumps all package versions
4. **Build** - Builds all packages for production
5. **Commit** - Commits version changes
6. **Tag** - Creates git tag
7. **Push** - Pushes to GitHub
8. **Publish** - Publishes to npm
9. **Cleanup** - Removes backup files

### If Something Fails

The release script **automatically rolls back**:
- Restores original versions
- Cleans build artifacts
- Removes git tags
- Resets working directory

**No manual cleanup needed!**

## Validation Pipeline Details

### 1. Clean Working Directory ✅
**Check**: `git status --porcelain`  
**Purpose**: Ensures no uncommitted changes  
**Severity**: Error (blocks release)

### 2. Dependencies ✅
**Check**: `pnpm install --frozen-lockfile`  
**Purpose**: Verifies lockfile consistency  
**Severity**: Error (blocks release)

### 3. TypeScript Configs ✅
**Check**: Verify tsconfig.json files exist  
**Purpose**: Ensures type checking configuration  
**Severity**: Error (blocks release)

### 4. Linting ✅
**Check**: `npm run lint:all`  
**Purpose**: Code quality and standards  
**Severity**: Error (blocks release)

### 5. Unit Tests ✅
**Check**: `npm run test:all`  
**Purpose**: All tests must pass  
**Severity**: Error (blocks release)

### 6. Test Coverage ✅
**Check**: `bash scripts/test-coverage.sh`  
**Purpose**: Coverage meets thresholds  
**Severity**: Error (blocks release)  
**Thresholds**:
- Statements: 80%
- Branches: 75%
- Functions: 80%
- Lines: 80%

### 7. Build ✅
**Check**: `npm run build:all`  
**Purpose**: Production builds succeed  
**Severity**: Error (blocks release)

### 8. Package Verification ✅
**Check**: `bash scripts/verify-packages.sh`  
**Purpose**: package.json validation  
**Severity**: Error (blocks release)

### 9. Distribution Files ✅
**Check**: `bash scripts/verify-dist.sh`  
**Purpose**: All expected files exist  
**Severity**: Error (blocks release)

### 10. Bundle Analysis ✅
**Check**: `node scripts/consolidated-bundle-analysis.js`  
**Purpose**: Bundle sizes within limits  
**Severity**: Error (blocks release)  
**Limits**:
- core: 15KB (5KB gzipped)
- ng-forms: 10KB (4KB gzipped)
- callable-syntax: 5KB (2KB gzipped)
- enterprise: 8KB (3KB gzipped)
- guardrails: 12KB (4KB gzipped)

### 11. Sanity Checks ✅
**Check**: `node scripts/sanity-checks.js`  
**Purpose**: Build output validation  
**Severity**: Error (blocks release)

### 12. Performance Benchmarks ⚠️
**Check**: `node scripts/perf-suite.js`  
**Purpose**: Performance metrics  
**Severity**: Warning (logs only)

### 13. Documentation ⚠️
**Check**: `bash scripts/validate-docs.sh`  
**Purpose**: Documentation completeness  
**Severity**: Warning (logs only)

## Common Issues

### "Working directory has uncommitted changes"

```bash
# Review changes
git status

# Commit or stash
git add -A && git commit -m "your message"
# or
git stash
```

### "Tests failed"

```bash
# Run tests to see details
npm run test:all

# Run specific package tests
npm run test:core
```

### "Build failed"

```bash
# Clean and rebuild
npm run clean:build

# Check for TypeScript errors
npx tsc --noEmit
```

### "Bundle size exceeded"

```bash
# Analyze bundle
npm run analyze:bundle

# Review what changed
git diff HEAD~1 packages/*/src/
```

### "Linting failed"

```bash
# Auto-fix what's possible
npm run lint:fix:all

# Review remaining issues
npm run lint:all
```

## Manual Rollback (if needed)

If automatic rollback fails:

```bash
# Reset to previous commit
git reset --hard HEAD~1

# Remove tag locally
git tag -d v4.0.12

# Remove tag remotely (careful!)
git push origin --delete v4.0.12

# Clean build artifacts
rm -rf dist packages/*/dist

# Reinstall dependencies
pnpm install
```

## Configuration Files

- **`.release-rules.json`** - Validation rules and thresholds
- **`RELEASE_PROCESS.md`** - Comprehensive release documentation
- **`scripts/pre-publish-validation.sh`** - Main validation script
- **`scripts/release.sh`** - Release automation script

## Best Practices

1. **Always validate before releasing**
   ```bash
   npm run validate
   ```

2. **Keep CHANGELOG.md updated**
   - Add entries before releasing
   - Include version and date

3. **Run validation after major changes**
   ```bash
   npm run quality:check
   ```

4. **Test in clean environment periodically**
   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   npm run validate
   ```

5. **Monitor bundle sizes**
   ```bash
   npm run size:report
   ```

## Need Help?

- Check [RELEASE_PROCESS.md](../../RELEASE_PROCESS.md) for detailed documentation
- Review script output for specific error messages
- Check logs in `/tmp/` directory for detailed output
- Open an issue on GitHub if stuck

## Emergency Contacts

For critical release issues:
1. Check recent commits for similar issues
2. Review GitHub Actions logs
3. Verify npm authentication
4. Contact maintainers via GitHub

---

**Last Updated**: 2024-11-13  
**Version**: 1.0.0

