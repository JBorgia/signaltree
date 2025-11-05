# Migration Guide: v4.0.0 Package Consolidation

## Overview

As of v4.0.0, all SignalTree enhancers have been **consolidated into `@signaltree/core`** for better tree-shaking, smaller bundles, and simplified maintenance.

This guide will help you migrate from the old separate package structure to the new consolidated structure.

---

## What Changed?

### Deprecated Packages

The following standalone packages are **no longer maintained** and have been consolidated into `@signaltree/core`:

- ❌ `@signaltree/batching` → Use `withBatching` from `@signaltree/core` ✅ **Deprecated on npm**
- ❌ `@signaltree/memoization` → Use `withMemoization` from `@signaltree/core` ✅ **Deprecated on npm**
- ❌ `@signaltree/devtools` → Use `withDevtools` from `@signaltree/core` ✅ **Deprecated on npm**
- ❌ `@signaltree/entities` → Use entity helpers from `@signaltree/core` ✅ **Deprecated on npm**
- ❌ `@signaltree/middleware` → Use `withMiddleware` from `@signaltree/core` ✅ **Deprecated on npm**
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
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';
import { withEntities } from '@signaltree/entities';
import { withMiddleware } from '@signaltree/middleware';
import { withTimeTravel } from '@signaltree/time-travel';
import { ecommercePreset, dashboardPreset } from '@signaltree/presets';
import { withSerialization } from '@signaltree/serialization';
```

#### After (v4.0.0+ - Consolidated)

```typescript
// ✅ New way - single package import
import { signalTree, withBatching, withMemoization, withDevtools, withEntities, withMiddleware, withTimeTravel, withSerialization, ecommercePreset, dashboardPreset } from '@signaltree/core';
```

### Step 3: Verify Functionality

The **API remains 100% compatible** - only import statements change. Your existing code should work without modifications:

```typescript
// Your existing code works exactly the same
const tree = signalTree(state).with(withBatching(), withMemoization(), withDevtools());
```

---

## Migration Examples

### Example 1: Basic Batching + Memoization

**Before:**

```typescript
// ❌ v3.x
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';

const tree = signalTree(state).with(withBatching(), withMemoization());
```

**After:**

```typescript
// ✅ v4.0.0+
import { signalTree, withBatching, withMemoization } from '@signaltree/core';

const tree = signalTree(state).with(withBatching(), withMemoization());
```

### Example 2: Full Stack with DevTools

**Before:**

```typescript
// ❌ v3.x
import { signalTree } from '@signaltree/core';
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';
import { withTimeTravel } from '@signaltree/time-travel';
import { withEntities } from '@signaltree/entities';

const tree = signalTree(state).with(withBatching(), withMemoization(), withEntities(), withTimeTravel(), withDevtools());
```

**After:**

```typescript
// ✅ v4.0.0+
import { signalTree, withBatching, withMemoization, withDevtools, withTimeTravel, withEntities } from '@signaltree/core';

const tree = signalTree(state).with(withBatching(), withMemoization(), withEntities(), withTimeTravel(), withDevtools());
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
import { withSerialization } from '@signaltree/serialization';

const tree = signalTree(state).with(
  withSerialization({
    autoSave: true,
    key: 'app-state',
  })
);
```

**After:**

```typescript
// ✅ v4.0.0+
import { signalTree, withSerialization } from '@signaltree/core';

const tree = signalTree(state).with(
  withSerialization({
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
import { signalTree, withBatching } from '@signaltree/core';
// withMemoization, withDevtools, etc. are tree-shaken out
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
2. Update import to use `@signaltree/core`: `import { withBatching } from '@signaltree/core'`
3. Clear your `node_modules` and reinstall: `rm -rf node_modules && npm install`

### Issue: TypeScript errors after migration

**Problem:**

```
Module '"@signaltree/core"' has no exported member 'withBatching'.
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

**Recommendation**: Migrate to v4.0.0+ as soon as possible to benefit from improvements and ensure ongoing support.
