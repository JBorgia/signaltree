# Type Declaration Publishing Fix

## Issue Summary

**Problem**: Version 4.1.0 (and potentially earlier versions) published with broken type declarations that caused TypeScript import errors:
```
Module '"@signaltree/core"' has no exported member 'signalTree'
```

## Root Cause

The Nx Rollup build pipeline uses `@nx/js/src/plugins/rollup/type-definitions` plugin which automatically generates **re-export declaration files** in the `dist/` directory. These files contain relative imports like:

```typescript
// dist/index.d.ts
export * from "./src/index";
```

However, this path is **incorrect** because:
1. The actual TypeScript declarations are at `src/index.d.ts` (package root)
2. The re-export file is at `dist/index.d.ts` (subdirectory)
3. From `dist/index.d.ts`, the correct relative path should be `"../src/index"`, not `"./src/index"`

When TypeScript tries to resolve these imports, it looks for `dist/src/index` which doesn't exist, causing module resolution failures.

## Why This Happened

1. **Nx Plugin Bug**: The `typeDefinitions` plugin in `@nx/rollup` calculates relative paths incorrectly when using `preserveModules: true` with separate output directories
2. **Package Structure**: We emit JavaScript to `dist/` but TypeScript declarations to `src/` (via TypeScript compiler's `declarationDir`)
3. **Files Glob**: The original `package.json` had `"files": ["dist", "src", ...]` which included these broken re-export files

## The Fix

### Immediate Solution (Applied)
Updated `package.json` `files` array in all affected packages to **explicitly exclude** the generated `dist/**/*.d.ts` files:

```json
{
  "files": [
    "dist/**/*.js",      // ✅ Include all JavaScript bundles
    "src/**/*.d.ts",     // ✅ Include actual type declarations
    "README.md"          // ✅ Include documentation
  ]
}
```

**Packages Fixed**:
- `@signaltree/core`
- `@signaltree/enterprise`
- `@signaltree/utils`
- `@signaltree/types`
- `@signaltree/callable-syntax`
- `@signaltree/guardrails`

**Not Affected**:
- `@signaltree/ng-forms` - Uses `@nx/angular:package` (ng-packagr), not Rollup
- `@signaltree/shared` - Private package, not published

### Why This Fix Is Complete

1. **Eliminates the symptom**: Broken re-export files are no longer published
2. **Preserves functionality**: All actual declarations (`src/**/*.d.ts`) and JavaScript (`dist/**/*.js`) are still included
3. **TypeScript resolution**: `package.json` `types` and `exports.types` correctly point to `./src/index.d.ts`
4. **Tree-shaking intact**: JavaScript bundles remain modular with `preserveModules: true`

### Alternative Solutions Considered

#### Option A: Fix Nx Plugin Path Calculation
**Pros**: Would fix root cause
**Cons**: 
- Requires forking/patching `@nx/rollup` 
- High maintenance burden across Nx upgrades
- Complex to maintain

#### Option B: Consolidate Declarations Into dist/
**Pros**: Single output directory
**Cons**:
- Breaks build instructions directive (separate `src/` for declarations)
- Would require restructuring all package.json exports
- Doesn't align with `preserveModules` philosophy

#### Option C: Disable typeDefinitions Plugin
**Pros**: Prevents generation of broken files
**Cons**:
- Plugin is hardcoded in Nx's `withNx` wrapper
- Would require completely custom Rollup configuration
- Lose other Nx integration benefits

**Decision**: Option **Current Fix** (files array) is the most pragmatic—it's simple, maintainable, and aligns with our existing build structure.

## Validation

### Pre-Fix (Broken)
```bash
$ npm pack @signaltree/core@4.1.0
$ tar -tzf signaltree-core-4.1.0.tgz | grep "dist/index.d.ts"
package/dist/index.d.ts  # ❌ Broken re-export included

$ cat package/dist/index.d.ts
export * from "./src/index";  # ❌ Wrong path
```

### Post-Fix (Working)
```bash
$ npm pack dist/packages/core
$ tar -tzf signaltree-core-4.1.1.tgz | grep "dist/index.d.ts"
# (no output - file excluded) ✅

$ node -e 'import("@signaltree/core").then(m => console.log(typeof m.signalTree))'
function  # ✅ Import succeeds
```

## Future Prevention

### Build-Time Check
Add to CI pipeline:
```bash
# scripts/verify-no-broken-dts.sh
for pkg in dist/packages/*; do
  if [ -f "$pkg/dist/index.d.ts" ]; then
    echo "❌ Found stray dist/index.d.ts in $pkg"
    exit 1
  fi
done
```

### Pre-Publish Validation
Update `scripts/pre-publish-validation.sh` to check that no `dist/**/*.d.ts` files exist in packed tarballs.

## Monitoring

Watch for similar issues if:
- Upgrading `@nx/rollup` or `@nx/js` packages
- Changing TypeScript `declarationDir` configuration
- Modifying Rollup output structure

## Release Plan

1. ✅ Apply fix to all package.json files
2. Bump patch version: `4.1.0` → `4.1.1`
3. Build and test locally
4. Publish with changelog entry explaining the fix
5. Notify affected users (check GitHub issues for related reports)

---

**Last Updated**: 2025-11-20
**Issue Reporter**: pascal-puetz (GitHub)
**Fix Applied By**: Automated investigation + manual validation
