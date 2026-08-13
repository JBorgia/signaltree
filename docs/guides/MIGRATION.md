# Migration Guide: v4.0.0 Package Consolidation

> **SignalTree** — Reactive JSON for Angular. JSON branches, reactive leaves.

## Overview

As of v4.0.0, all SignalTree enhancers have been **consolidated into `@signaltree/core`** for better tree-shaking, smaller bundles, and simplified maintenance.

This guide will help you migrate from the old separate package structure to the new consolidated structure.

---

## What Changed?

### Deprecated Packages

The following standalone packages are **no longer maintained** and have been consolidated into `@signaltree/core`:

- ❌ `@signaltree/batching` → Use `batching` from `@signaltree/core` ✅ **Deprecated on npm**
- ❌ `@signaltree/memoization` → Use `memoization` from `@signaltree/core` ✅ **Deprecated on npm**
- ❌ `@signaltree/devtools` → Use `withDevtools` from `@signaltree/core` ✅ **Deprecated on npm**
- ❌ `@signaltree/entities` → Use entity helpers from `@signaltree/core` ✅ **Deprecated on npm**
- ❌ `@signaltree/middleware` → Removed in v5.0; use entity hooks (`tap`/`intercept`) and enhancers
- ❌ `@signaltree/presets` → Use preset functions from `@signaltree/core` ✅ **Deprecated on npm**
- ❌ `@signaltree/time-travel` → Use `withTimeTravel` from `@signaltree/core` ✅ **Deprecated on npm**

> **Note**: `@signaltree/serialization` was never published as a standalone package - serialization features are available directly in `@signaltree/core`.

### Still Maintained Separately

These packages remain separate:

- ✅ `@signaltree/ng-forms` - Angular forms integration (still separate)
- ✅ `@signaltree/callable-syntax` - Optional DX enhancement (still separate)

---

## Migration Steps

### Step 1: Update Package Dependencies

**Uninstall deprecated packages:**

```bash
npm uninstall @signaltree/batching \
              @signaltree/memoization \
              @signaltree/devtools \
              @signaltree/entities \
              @signaltree/middleware \
              @signaltree/presets \
              @signaltree/time-travel \
              @signaltree/serialization
```

**Install/update core package:**

```bash
npm install @signaltree/core@latest
```

### Step 2: Update Import Statements

#### Before (v3.x - Separate Packages)

```typescript
// ❌ Old way - multiple package installations
import { signalTree } from '@signaltree/core';
import { batching } from '@signaltree/batching';
import { memoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';
import { entities } from '@signaltree/entities';
// Middleware removed; no direct replacement. Use hooks.
import { withTimeTravel } from '@signaltree/time-travel';
import { ecommercePreset, dashboardPreset } from '@signaltree/presets';
import { serialization } from '@signaltree/serialization';
```

#### After (v4.0.0+ - Consolidated)

```typescript
// ✅ New way - single package import
import { signalTree, batching, memoization, withDevtools, withTimeTravel, serialization, ecommercePreset, dashboardPreset } from '@signaltree/core';

// Note: `.with(entities())` was deprecated in v6 and removed in v7 — remove any calls in your code.
// Note: devTools auto-connects to Redux DevTools and supports time-travel dispatch.
```

### Step 3: Verify Functionality

The **API remains 100% compatible** - only import statements change. Your existing code should work without modifications:

```typescript
// Your existing code works exactly the same
const tree = signalTree(state).with(batching(), memoization(), withDevtools());
```

---

## Migration Examples

### Example 1: Basic Batching + Memoization

**Before:**

```typescript
// ❌ v3.x
import { signalTree } from '@signaltree/core';
import { batching } from '@signaltree/batching';
import { memoization } from '@signaltree/memoization';

const tree = signalTree(state).with(batching(), memoization());
```

**After:**

```typescript
// ✅ v4.0.0+
import { signalTree, batching, memoization } from '@signaltree/core';

const tree = signalTree(state).with(batching(), memoization());
```

### Example 2: Full Stack with DevTools

**Before:**

```typescript
// ❌ v3.x
import { signalTree } from '@signaltree/core';
import { batching } from '@signaltree/batching';
import { memoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';
import { withTimeTravel } from '@signaltree/time-travel';
import { entities } from '@signaltree/entities';

const tree = signalTree(state).with(batching(), memoization(), entities(), withTimeTravel(), withDevtools());
```

**After:**

```typescript
// ✅ v4.0.0+
import { signalTree, batching, memoization, withDevtools, withTimeTravel, entities } from '@signaltree/core';

const tree = signalTree(state).with(batching(), memoization(), entities(), withTimeTravel(), withDevtools());
```

### Example 3: E-commerce Preset

**Before:**

```typescript
// ❌ v3.x
import { signalTree } from '@signaltree/core';
import { ecommercePreset } from '@signaltree/presets';

const tree = signalTree(state).with(ecommercePreset());
```

**After:**

```typescript
// ✅ v4.0.0+
import { signalTree, ecommercePreset } from '@signaltree/core';

const tree = signalTree(state).with(ecommercePreset());
```

### Example 4: Serialization

**Before:**

```typescript
// ❌ v3.x
import { signalTree } from '@signaltree/core';
import { serialization } from '@signaltree/serialization';

const tree = signalTree(state).with(
  serialization({
    autoSave: true,
    key: 'app-state',
  })
);
```

**After:**

```typescript
// ✅ v4.0.0+
import { signalTree, serialization } from '@signaltree/core';

const tree = signalTree(state).with(
  serialization({
    autoSave: true,
    key: 'app-state',
  })
);
```

---

## Automated Migration Script

You can use this bash script to find and update imports across your codebase:

```bash
#!/bin/bash

# Find all TypeScript files with old imports
echo "Finding files with deprecated imports..."

# List of deprecated packages
PACKAGES=(
  "batching"
  "memoization"
  "devtools"
  "entities"
  "middleware"
  "presets"
  "time-travel"
  "serialization"
)

# Find all files with deprecated imports
for pkg in "${PACKAGES[@]}"; do
  echo "Searching for @signaltree/$pkg imports..."
  grep -r "@signaltree/$pkg" src/ --include="*.ts" --include="*.tsx" || true
done

echo ""
echo "Review the files above and update imports to use @signaltree/core"
echo ""
echo "Example sed command to replace imports (review before running):"
echo "sed -i '' 's/@signaltree\\/batching/@signaltree\\/core/g' your-file.ts"
```

---

## Benefits of Migration

### 1. Smaller Bundle Size

**16.2% reduction** when using multiple enhancers:

- **Before (v3.x)**: ~27.50KB (core + 3 enhancers)
- **After (v4.0.0+)**: ~23.05KB (consolidated)

### 2. Better Tree-Shaking

Consolidated exports enable more efficient bundling:

```typescript
// Only the features you use are included in the bundle
import { signalTree, batching } from '@signaltree/core';
// memoization, withDevtools, etc. are tree-shaken out
```

### 3. Simplified Dependencies

**Before (v3.x):**

```json
{
  "dependencies": {
    "@signaltree/core": "^3.1.0",
    "@signaltree/batching": "^3.1.0",
    "@signaltree/memoization": "^3.1.0",
    "@signaltree/devtools": "^3.1.0",
    "@signaltree/entities": "^3.1.0"
  }
}
```

**After (v4.0.0+):**

```json
{
  "dependencies": {
    "@signaltree/core": "^4.0.0"
  }
}
```

### 4. Version Synchronization

All features now share the same version number, eliminating compatibility issues.

---

## Troubleshooting

### Issue: Import errors after migration

**Problem:**

```
Cannot find module '@signaltree/batching' or its corresponding type declarations.
```

**Solution:**

1. Verify you uninstalled the deprecated package: `npm uninstall @signaltree/batching`
2. Update import to use `@signaltree/core`: `import { batching } from '@signaltree/core'`
3. Clear your `node_modules` and reinstall: `rm -rf node_modules && npm install`

### Issue: TypeScript errors after migration

**Problem:**

```
Module '"@signaltree/core"' has no exported member 'batching'.
```

**Solution:**

1. Ensure you're using v4.0.0+: `npm list @signaltree/core`
2. Update to latest: `npm install @signaltree/core@latest`
3. Restart your TypeScript server (VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server")

### Issue: Build/runtime errors

**Problem:** Your code builds but fails at runtime.

**Solution:**

1. Clear build cache: `rm -rf dist .angular/cache`
2. Rebuild: `npm run build`
3. Verify no duplicate installations: `npm ls @signaltree/core`

---

## Need Help?

If you encounter issues during migration:

1. **Check the changelog**: [CHANGELOG.md](./CHANGELOG.md)
2. **Open an issue**: [GitHub Issues](https://github.com/JBorgia/signaltree/issues)
3. **Review documentation**: [README.md](./README.md)

---

## Timeline

- **v3.1.0** (November 2, 2025): Enhancers consolidated into core (soft deprecation)
- **v4.0.0** (November 3, 2025): Breaking change, deprecated packages marked on npm
- **v5.0.0** (Future): Deprecated packages may be unpublished

## **Recommendation**: Migrate to v4.0.0+ as soon as possible to benefit from improvements and ensure ongoing support.

## ng-forms: Angular 17-19 Legacy Bridge Deprecation

### Overview

The `@signaltree/ng-forms` package includes a **manual bidirectional bridge** for Angular 17-19 compatibility. This bridge will be **removed in v6.0** when Angular 21 is released.

**Timeline:**

- **v5.x** (Current): Legacy bridge functional, deprecation warning in dev mode
- **v6.0** (Planned): Legacy bridge removed, Angular 20.3+ required

### Who is Affected?

If you're using `@signaltree/ng-forms` with **Angular 17, 18, or 19**, you'll see this console warning in development:

```
[@signaltree/ng-forms] Legacy Angular 17-19 support is deprecated and will be removed in v6.0.
Please upgrade to Angular 20.3+ to use native Signal Forms. See MIGRATION.md for the upgrade path.
```

### Migration Path

**Option 1: Upgrade to Angular 20.3+ (Recommended)**

Angular 20.3+ includes native Signal Forms with the `connect()` API. `@signaltree/ng-forms` will automatically use this API when available.

```bash
# Upgrade Angular
ng update @angular/core @angular/cli --next

# Verify version (should be 20.3+)
ng version
```

No code changes required - `@signaltree/ng-forms` will detect and use the native API.

**Option 2: Stay on Angular 17-19 (Temporary)**

If you cannot upgrade immediately:

1. The legacy bridge will continue working in v5.x
2. You can suppress the warning by acknowledging the deprecation
3. Plan to upgrade before v6.0 release

**Suppressing the Warning** (not recommended):

```typescript
// Only if you understand the deprecation and have a migration plan
if (globalThis && typeof globalThis === 'object') {
  (globalThis as any).__signaltreeNgFormsLegacyAck = true;
}
```

### What Changes in v6.0?

- **Minimum Angular version**: 20.3+
- **Removed**: Manual bidirectional bridge code
- **Required**: Native Angular Signal Forms (`FormControl.connect()`)
- **Benefit**: Smaller bundle size, better performance, native Angular integration

### Testing the Upgrade

After upgrading to Angular 20.3+:

1. Verify no deprecation warnings in console
2. Test form bindings work correctly
3. Run your form validation tests
4. Check async validators still function

```typescript
// Example test - should work unchanged
const formTree = createFormTree({
  name: '',
  email: '',
});

formTree.$.name.set('Test'); // Should update form control
formTree.form.get('email')?.setValue('test@example.com'); // Should update signal
```
