# Migrating from v8 to v9

> **Historical.** For migrating to the current major see [MIGRATION.md](./MIGRATION.md#901). In 9.0.1 the `memoization` enhancer and all preset factories referenced below were removed — use Angular's built-in `computed()` instead.

## Breaking Changes

### Removed Exports

The following convenience aliases were removed from `@signaltree/core`. Replace with the config-based API:

| Removed                     | Replacement                                                                   |
| --------------------------- | ----------------------------------------------------------------------------- |
| `highPerformanceBatching()` | `batching({ notificationDelayMs: 0 })`                                        |
| `shallowMemoization()`      | `memoization({ equality: 'shallow', ttl: 60000 })`                            |
| `lightweightMemoization()`  | `memoization({ equality: 'reference', maxCacheSize: 100, enableLRU: false })` |
| `computedMemoization()`     | `memoization({ equality: 'deep' })`                                           |
| `selectorMemoization()`     | `memoization({ equality: 'deep', enableLRU: true })`                          |
| `enableBatching()`          | `batching()`                                                                  |
| `enableMemoization()`       | `memoization()`                                                               |
| `enableTimeTravel()`        | `timeTravel()`                                                                |
| `enableEffects()`           | `effects()`                                                                   |
| `enableDevTools()`          | `devTools()`                                                                  |
| `fullDevTools()`            | `devTools({ enableBrowserDevTools: true, enableLogging: true })`              |
| `productionDevTools()`      | `devTools({ enableBrowserDevTools: false, enableLogging: false })`            |
| `entities()`                | Removed — use `entityMap()` marker directly                                   |

### Moved to Subpath Imports

These exports moved out of the main barrel to reduce bundle size:

```typescript
// Before (v8)
import { SecurityValidator, SecurityPresets } from '@signaltree/core';
import { createEditSession } from '@signaltree/core';
import { TREE_PRESETS } from '@signaltree/core';

// After (v9)
import { SecurityValidator, SecurityPresets } from '@signaltree/core/security';
import { createEditSession } from '@signaltree/core/edit-session';
import { TREE_PRESETS } from '@signaltree/core/presets';
```

### Duplicate Enhancer Detection

Applying the same enhancer twice now throws:

```typescript
// v8: silently applied twice (resource leak)
tree.with(batching()).with(batching());

// v9: throws Error('Enhancer "batching" has already been applied')
```

### Lifecycle Changes

`destroy()` now automatically runs all enhancer cleanup functions. You no longer need to manually disconnect DevTools or flush auto-save before destroying a tree.

```typescript
// v8: manual cleanup required
tree.disconnectDevTools();
tree.__flushAutoSave?.();
tree.destroy();

// v9: just destroy — cleanup is automatic
tree.destroy();
```

New APIs:

- `tree.destroyed()` — signal indicating if tree is destroyed
- `tree.registerCleanup(fn)` — register custom cleanup for `destroy()`

## Migration Steps

1. **Update imports**: Replace removed convenience aliases with config-based calls
2. **Move subpath imports**: `SecurityValidator`, `createEditSession`, `TREE_PRESETS`
3. **Remove duplicate `.with()` calls**: If you applied the same enhancer twice, remove the duplicate
4. **Remove manual cleanup**: If you called `disconnectDevTools()` before `destroy()`, it's now automatic
5. **Run tests**: `npm run validate:all`
