# SignalTree + Angular Reactivity Investigation (RESOLVED)

## Issue Summary

**Original Problem**: SignalTree signals appeared to NOT trigger Angular's `effect()` re-execution when their values change.

**Root Cause (RESOLVED)**: This was NOT a SignalTree bug. It was caused by a **dual Angular instance problem** when using `pnpm link` for local development. Two separate `@angular/core` modules were loaded, each with their own `Symbol('SIGNAL')`, causing `isSignal()` to return `false` for SignalTree signals.

**Solution**: Install SignalTree from npm instead of using symlinks for local development.

## ✅ RESOLVED (December 17, 2025)

### The Real Root Cause: Dual Angular Instance

When using `pnpm link` to develop SignalTree locally:

```
consumer-app/node_modules/@signaltree/core → SYMLINK → /signaltree/dist/packages/core
                                                        ↓
                                              bundler resolves @angular/core
                                              from /signaltree/node_modules/
                                                        ↓
                                              @angular/core@20.3.11 (DIFFERENT!)

consumer-app/node_modules/@angular/core → @angular/core@20.2.3 (consumer's version)
```

**Result**: Two Angular instances, two different `Symbol('SIGNAL')` values, `isSignal()` returns `false`.

### Proof of Resolution

After installing from npm (`pnpm add @signaltree/core@5.1.2`):

```typescript
import { isSignal } from '@angular/core';

console.log('isSignal($.loading.state):', isSignal($.loading.state)); // true ✅
```

Effects now properly re-run when SignalTree signals change.

## Previous Investigation (Superseded)

The investigation below was conducted before identifying the root cause. The conclusions about "SignalTree being broken" were incorrect - the library works correctly when installed properly.

### What We Observed (Misinterpreted)

```typescript
// Regular Angular signal - worked
effect(() => {
  const state = testSignal();
  console.log('testSignal changed'); // RE-RAN ✅
});

// SignalTree signal - didn't work (due to dual Angular instance)
effect(() => {
  const state = $.loading.state();
  console.log('SignalTree changed'); // DID NOT re-run ❌ (misdiagnosed)
});
```

### Why Demo App Worked But v3 Didn't

| App  | SignalTree Source       | Angular Resolution | Result    |
| ---- | ----------------------- | ------------------ | --------- |
| Demo | TypeScript source paths | Single instance    | ✅ Works  |
| v3   | Symlinked dist          | Dual instance      | ❌ Broken |

The demo app's `tsconfig.json` maps `@signaltree/core` directly to TypeScript source:

```json
{
  "paths": {
    "@signaltree/core": ["packages/core/src/index.ts"]
  }
}
```

This bypasses the symlink issue entirely since there's no separate package resolution.

## Solutions

### For Production/Integration Testing

Always install from npm:

```bash
pnpm add @signaltree/core@5.1.2
```

### For Local Development with Symlinks

1. **Match Angular versions** between workspaces
2. **Use pnpm overrides** to force resolution
3. **Configure bundler dedupe** settings

See: [LOCAL_DEVELOPMENT_SYMLINK_ISSUE.md](./LOCAL_DEVELOPMENT_SYMLINK_ISSUE.md) for detailed solutions.

## Key Lessons

1. **SignalTree is NOT broken** - the issue was purely environmental
2. **Symlinks can cause module duplication** with singleton dependencies
3. **Symbol identity matters** - `Symbol('SIGNAL') !== Symbol('SIGNAL')`
4. **Test with npm packages** before investigating library "bugs"
5. **Version mismatches can cause subtle issues** even when code appears identical

## Code Locations

### Documentation

- `/signaltree/docs/LOCAL_DEVELOPMENT_SYMLINK_ISSUE.md` - Comprehensive guide

### Test Component

- `/signaltree/apps/demo/src/app/examples/features/fundamentals/examples/effect-reactivity-test/` - Verification component

---

**Last Updated**: December 17, 2025  
**Status**: ✅ RESOLVED - Dual Angular Instance Issue  
**Root Cause**: pnpm link causes separate @angular/core module instances
