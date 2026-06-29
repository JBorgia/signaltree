# SignalTree Migration Guide

> **SignalTree** — Reactive JSON for Angular. JSON branches, reactive leaves.

## 11.0.0

> **Two breaking changes, both mechanical and both opt-in surfaces.** The v11 theme: SignalTree's optional/heavy subsystems — security validation and lazy/memory — are now explicitly opt-in so they tree-shake out of bundles that don't use them. The bare-tree floor drops ~29% (7.5KB → 5.3KB gzip). If you pass neither `security` nor `lazy` to `signalTree(...)` and don't ship `devTools()` to production, **nothing changes for you** — upgrade and move on.

### 1. `security` config must be wrapped with `security()`

The `security` option used to take a raw `SecurityValidatorConfig`. Because `signalTree()` statically referenced the `SecurityValidator` class, the validator (~1KB gzip) shipped in **every** bundle even when no app used it — the opposite of what the `@signaltree/core/security` subpath was meant to achieve. In v11 the validator is **injected**: `signalTree` only calls an opt-in feature, so the validator is tree-shaken out unless you import it.

**Before (≤10.x):**

```ts
import { signalTree } from '@signaltree/core';

const tree = signalTree(state, {
  security: { preventXSS: true, maxStringLength: 10_000 },
});
```

**After (11.0.0):**

```ts
import { signalTree } from '@signaltree/core';
import { security } from '@signaltree/core/security';

const tree = signalTree(state, {
  security: security({ preventXSS: true, maxStringLength: 10_000 }),
});
```

`SecurityPresets` move the same way:

```ts
// Before
signalTree(state, { security: SecurityPresets.strict().getConfig() });
// After
import { security, SecurityPresets } from '@signaltree/core/security';
signalTree(state, { security: security(SecurityPresets.strict().getConfig()) });
```

The config shape, validation behavior, and construction-time timing are **unchanged** — only the wrapper and import path differ. TypeScript will flag every call site that needs updating (the option's type changed from `SecurityValidatorConfig` to `SecurityFeature`).

### 2. Lazy signals are now opt-in via `lazy()`

Lazy signal creation used to switch on automatically for large state (>50 estimated nodes). Because `signalTree()` statically imported the lazy Proxy machinery + `SignalMemoryManager` to do that, ~2.6KB shipped in **every** bundle — even trees that never went lazy. In v11 lazy is injected, so it tree-shakes out unless you opt in.

**Only affects you if** you relied on automatic lazy mode for large trees, or set `useLazySignals: true`. If so, inject the feature:

```ts
// Before (≤10.x) — automatic for large state, or:
const tree = signalTree(largeState, { useLazySignals: true });

// After (11.0.0)
import { lazy } from '@signaltree/core/lazy';
const tree = signalTree(largeState, { lazy: lazy() });            // auto-threshold applies
const forced = signalTree(state, { lazy: lazy(), useLazySignals: true }); // force lazy
```

Once `lazy: lazy()` is present, the size threshold and `useLazySignals`/`debugMode` overrides behave exactly as before. Without it, trees are always eager — functionally identical for reads/writes, just signals created up front. Most apps (small/medium state) never needed lazy mode and require **no change**.

### 3. Removed deprecated aliases (`is`-prefix predicates + `tree.state`)

Two sets of long-deprecated (since v10.3 / v10) aliases were removed. Both are mechanical find-and-replace; TypeScript flags every site.

| Removed | Use instead |
|---|---|
| `status().isLoading` / `.isLoaded` / `.isError` / `.isNotLoaded` | `.loading` / `.loaded` / `.hasError` / `.notLoaded` |
| `entityMap().isEmpty` | `.empty` |
| `tree.state` | `tree.$` (same reference — `state` was always an alias for `$`) |

```ts
// Before                          // After
tree.$.load.isLoading();           tree.$.load.loading();
tree.$.users.isEmpty();            tree.$.users.empty();
tree.state.user.name();            tree.$.user.name();
```

For a non-reactive full snapshot, call `tree()` (unchanged).

### Also in 11.0.0 (no action required)

- **New `defineStore()`** — wrap a tree factory in an injectable Angular service: `export const CounterStore = defineStore(() => signalTree({ count: 0 }))`, then `inject(CounterStore)`. The idiomatic DI entry point (comparable to NgRx SignalStore's `signalStore()`); `destroy()` is tied to the injector's `DestroyRef`. Purely additive — existing tree usage is unchanged.
- **New `linked()`** — derived-but-writable signal for `.derived()`, comparable to NgRx `withLinkedState` (wraps Angular's `linkedSignal`). `linked({ source: () => $.options(), computation: (opts, prev): Opt | undefined => ... })` gives a value that derives from a source, is user-writable (`.set()`), and re-derives on source change (sticky selection). Purely additive.
- **Bundle floor reduced ~29%** — injecting both `SecurityValidator` and the lazy/memory machinery drops the bare-tree floor 7.5KB → **5.3KB gzip** (~8.1KB with `entityMap` in use). A blocking CI budget gate prevents silent regressions.
- **`devTools()` fully prod-stripped** — production builds (`ngDevMode` false) tree-shake the entire devtools implementation, so `.with(devTools())` no longer ships ~12KB to prod (a devtools-using tree drops ~11.3KB → 5.1KB gzip). Dev builds are unchanged — full devtools as before.
- **Honest bundle docs** — the "smaller than NgRx SignalStore" claim was false (SignalStore is ~2.3KB; SignalTree is larger). Docs now frame bundle as *capability-per-KB + zero-deps*, not "smallest". See measured numbers in the benchmark.
- Includes the 10.5.0/10.6.0 additions (body-granular `entityMap`, `sortComparer`, `[ST####]` error codes, dev-mode guardrails) and the published-package fixes for `@signaltree/guardrails` and `@signaltree/callable-syntax`.

## 9.0.1

> **Why a patch?** v9.0.0 was only just released; adoption of the removed APIs is minimal. These changes are technically breaking but shipped as `9.0.1`. Pin to `9.0.0` if you were using `memoization()` or preset factories and need time to migrate.

### Memoization enhancer removed

The `memoization()` enhancer and all preset variants (`shallowMemoization`, `lightweightMemoization`, `computedMemoization`, `selectorMemoization`, `highPerformanceMemoization`) have been removed. Use Angular's built-in `computed()` instead — it provides equivalent caching behavior with zero runtime overhead and smaller bundles.

**Before (9.0.0):**

```ts
import { signalTree, memoization, batching } from '@signaltree/core';

const tree = signalTree(state).with(batching()).with(memoization());

const totalPrice = tree.memoize((s) => s.cart.items.reduce((n, i) => n + i.price, 0), 'totalPrice');
```

**After (9.0.1):**

```ts
import { computed } from '@angular/core';
import { signalTree, batching } from '@signaltree/core';

const tree = signalTree(state).with(batching());

const totalPrice = computed(() => tree.$.cart.items().reduce((n, i) => n + i.price, 0));
```

### Preset factories and subpath export removed

- `@signaltree/core/presets` subpath is gone.
- `TREE_PRESETS`, `createDevTree()`, `createProdTree()`, `createMinimalTree()` and other preset helpers are removed. Compose enhancers directly with `.with()`.

### Guardrails: `maxRecomputations` budget removed

`GuardrailsConfig.budgets.maxRecomputations` has been dropped (the feature relied on the deleted memoization accounting). Remove it from your config:

```ts
// Before
guardrails({ budgets: { maxUpdateTime: 16, maxRecomputations: 100 } });

// After
guardrails({ budgets: { maxUpdateTime: 16 } });
```

`RuntimeStats.recomputationCount` and `recomputationsPerSecond` still exist as always-`0` fields for backwards-compatible consumers.

### Upgrade checklist

1. Remove `memoization` / preset factory imports from `@signaltree/core`.
2. Replace `.with(memoization())` calls with Angular `computed()` at the consumer site.
3. Remove `maxRecomputations` from any guardrails `budgets` config.
4. Drop `@signaltree/core/presets` from your `package.json` / imports.

---

## v4.0.0 Package Consolidation

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
// Your existing code works exactly the same — chain `.with()` calls (one enhancer per call)
const tree = signalTree(state).with(batching()).with(memoization()).with(withDevtools());
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

const tree = signalTree(state).with(batching()).with(memoization());
```

**After:**

```typescript
// ✅ v4.0.0+
import { signalTree, batching, memoization } from '@signaltree/core';

const tree = signalTree(state).with(batching()).with(memoization());
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

const tree = signalTree(state).with(batching()).with(memoization()).with(entities()).with(withTimeTravel()).with(withDevtools());
```

**After:**

```typescript
// ✅ v4.0.0+
import { signalTree, batching, memoization, withDevtools, withTimeTravel, entities } from '@signaltree/core';

const tree = signalTree(state).with(batching()).with(memoization()).with(entities()).with(withTimeTravel()).with(withDevtools());
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

> **⚠️ Outdated section (kept for history).** This was written against the old
> v5→v6 version plan; that scheme never shipped — the project is now at **v11**
> and `@signaltree/ng-forms` targets Angular `^20 || ^21`. The "v6.0" milestones
> below did not execute as described. For the current supported-Angular range
> and any remaining legacy-bridge behavior, treat the
> [`@signaltree/ng-forms` package README](../../packages/ng-forms/README.md) as
> authoritative, not this section.

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
