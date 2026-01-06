## [7.0.0] - 2026-01-06

### 🎯 Philosophy: Use Angular Directly

v7 embraces a **minimal marker** philosophy. SignalTree provides markers only for things Angular doesn't have built-in:

| SignalTree Marker      | Purpose                  | Angular Equivalent |
| ---------------------- | ------------------------ | ------------------ |
| `entityMap<T, K>()`    | Normalized collections   | None               |
| `status()`             | Manual async state       | None               |
| `stored(key, default)` | localStorage persistence | None               |

**Everything else → use Angular directly:**

- `computed()` - Derived read-only state
- `linkedSignal()` - Writable derived state
- `resource()` - Async data fetching with auto loading/error

### 📐 The `.derived()` Rule

> **Only use `.derived()` when you need access to `$` (tree state)**

```typescript
signalTree({
  // ✅ Plain values → become signals
  count: 0,
  name: '',

  // ✅ SignalTree markers (Angular doesn't have these)
  users: entityMap<User, number>(),
  usersStatus: status(),
  theme: stored('theme', 'light'),

  // ✅ Angular primitives that DON'T need tree state
  windowWidth: linkedSignal(() => window.innerWidth),
  serverConfig: resource({ loader: () => fetch('/api/config') }),
}).derived(($) => ({
  // ✅ Only things that NEED $ go here
  doubled: computed(() => $.count() * 2),
  selectedUser: computed(() => $.users.byId($.selectedId())?.()),
  userDetails: resource({
    request: () => $.selectedId(),
    loader: ({ request }) => fetch(`/api/users/${request}`),
  }),
}));
```

### 🚀 New Features

#### `status()` Marker - Async Operation State Tracking

Track loading states for async operations with automatic derived signals and helper methods:

```typescript
import { signalTree, status, LoadingState } from '@signaltree/core';

const tree = signalTree({
  users: {
    entities: entityMap<User>(),
    status: status(), // Async state tracking
  },
});

// Derived boolean signals (lazy-created for performance)
tree.$.users.status.isNotLoaded(); // true initially
tree.$.users.status.isLoading(); // false
tree.$.users.status.isLoaded(); // false
tree.$.users.status.isError(); // false

// Helper methods
tree.$.users.status.setLoading(); // Start loading
tree.$.users.status.setLoaded(); // Mark complete
tree.$.users.status.setError(new Error('Failed')); // Set error state
tree.$.users.status.reset(); // Back to NotLoaded
```

**Performance optimizations:**

- Lazy computed signals - `isLoading`, `isLoaded`, etc. only created on first access
- 100 status markers initialize in < 50ms

#### `stored()` Marker - localStorage Persistence

Auto-sync signals to localStorage with debounced writes:

```typescript
import { signalTree, stored } from '@signaltree/core';

const tree = signalTree({
  theme: stored('app-theme', 'light'),
  preferences: stored('user-prefs', { notifications: true }),
});

// Value loads from localStorage on init
tree.$.theme(); // 'light' or restored value

// Auto-saves on change (debounced by default)
tree.$.theme.set('dark'); // Signal updates immediately, storage writes debounced

// Methods
tree.$.theme.clear(); // Reset to default, remove from storage
tree.$.theme.reload(); // Force reload from storage
```

**Performance optimizations:**

- Default 100ms debounce prevents localStorage hammering
- Non-blocking writes via `queueMicrotask()`
- Rapid updates coalesced into single storage write
- Set `debounceMs: 0` for immediate writes when needed

#### Marker Extensibility

Register custom marker processors for advanced use cases:

```typescript
import { registerMarkerProcessor } from '@signaltree/core';

// Register a custom marker type
registerMarkerProcessor(
  isMyMarker, // Type guard
  (marker, notifier, path) => createMySignal(marker) // Factory
);
```

### ⚡ Performance

- **status()**: Lazy computed creation - derived signals only created on access
- **stored()**: Debounced writes (default 100ms) with queueMicrotask for non-blocking I/O
- **Performance budgets**: 100 markers initialize in < 50ms (tested)
- **Auto-batching**: Partial updates via callable are automatically batched

### ⚠️ Deprecations

#### `entities()` Enhancer Deprecated

The `entities()` enhancer is **no longer needed**. EntityMap markers are now automatically processed during tree finalization.

```typescript
// Before (v6)
const tree = signalTree({
  users: entityMap<User, number>(),
}).with(entities()); // Required

// After (v7)
const tree = signalTree({
  users: entityMap<User, number>(),
}); // Just works - no .with(entities()) needed!
```

If you have existing code with `.with(entities())`, it will continue to work (backward compatible) but will show a deprecation warning:

```
SignalTree: entities() enhancer is deprecated in v7. EntityMap markers are now automatically
processed. Remove .with(entities()) from your code. This enhancer will be removed in v8.
```

### 🔄 Auto-Batching

Partial updates via the callable syntax are now automatically batched:

```typescript
const tree = signalTree({
  user: { name: 'Alice', age: 30 },
});

// Partial update - auto-batched (single change detection cycle)
tree.$.user({ name: 'Bob' }); // Only updates name, keeps age: 30

// Function update - also auto-batched
tree.$.user((prev) => ({ ...prev, score: prev.score + 10 }));
```

The `NodeAccessor` type now accepts `Partial<T>` for partial updates.

### 📦 Exports

New exports from `@signaltree/core`:

```typescript
// Status marker
export { status, isStatusMarker, LoadingState } from '@signaltree/core';
export type { StatusMarker, StatusSignal, StatusConfig } from '@signaltree/core';

// Stored marker
export { stored, isStoredMarker } from '@signaltree/core';
export type { StoredMarker, StoredSignal, StoredOptions } from '@signaltree/core';

// Extensibility
export { registerMarkerProcessor } from '@signaltree/core';
```

---

## [6.3.1] - 2026-01-XX

### ⚠️ Breaking Changes

- **core:** `derived()` marker function removed - use `computed()` directly in `.derived()` layers
  - The marker was redundant since `computed()` signals are automatically detected
  - Types (`DerivedMarker`, `isDerivedMarker`) kept for backwards compatibility

```typescript
// Before (removed)
import { derived } from '@signaltree/core';
.derived($ => ({ doubled: derived(() => $.count() * 2) }))

// After (use Angular's computed directly)
import { computed } from '@angular/core';
.derived($ => ({ doubled: computed(() => $.count() * 2) }))
```

### 🐛 Bug Fixes

- **core:** Fixed deep merge of derived state into namespaces containing entityMaps
  - NodeAccessor properties are now `writable: true`, allowing enhancers to replace entityMap markers
  - `entities()` enhancer now properly recurses into NodeAccessors (function-based nodes)
  - Fixes runtime error: `$.namespace.entities.upsertOne is not a function`

### 📖 Details

When using `.derived()` to add computed signals to a namespace that also contains an `entityMap()`, the deep merge was not working correctly. The derived properties were added, but the entityMap methods (like `upsertOne`, `all`, `byId`) were inaccessible.

**Root Cause:** Two related issues:

1. `entities()` enhancer only recursed into plain objects (`typeof === 'object'`), but after derived merge, namespaces become NodeAccessors which are functions
2. NodeAccessor properties were defined with `writable: false`, so when `entities()` tried to replace the entityMap marker with an EntitySignal, the assignment silently failed

**Example that now works:**

```typescript
const tree = signalTree({
  tickets: {
    entities: entityMap<Ticket, number>(),
    activeId: null,
  },
})
  .derived(($) => ({
    tickets: {
      // Deep merge preserves entities while adding active
      active: derived(() => {
        const id = $.tickets.activeId();
        return id != null ? $.tickets.entities.byId(id)?.() : null;
      }),
    },
  }))
  .with(entities());

// All methods now work correctly:
tree.$.tickets.entities.upsertOne({ id: 1, name: 'Test' }); // ✅
tree.$.tickets.entities.all(); // ✅
tree.$.tickets.activeId(); // ✅
tree.$.tickets.active(); // ✅
```

**Migration:** If you previously used passthrough workarounds to preserve source properties, you can now remove them:

```diff
 .derived(($) => ({
   tickets: {
-    // Remove passthrough workarounds
-    entities: $.tickets.entities,
-    activeId: $.tickets.activeId,
-
     // Only derived state needed
     active: derived(() => /* ... */),
   },
 }))
```

---

## [6.3.0] - 2026-01-XX

### Added

- **Automatic notification batching**: PathNotifier now batches notifications within a microtask by default. Multiple updates to the same path result in a single notification with the final value.
- `getPathNotifier().flushSync()` - Force synchronous flush of pending notifications
- `getPathNotifier().onFlush(callback)` - Subscribe to flush-complete events (useful for time-travel, devtools)
- `signalTree(state, { batching: false })` - Opt-out of automatic batching

### Changed

- Time-travel enhancer now records one snapshot per flush batch (instead of per-update)

### Migration

Tests that assert on immediate subscriber callbacks need updating:

```typescript
// Before
tree.$.count.set(5);
expect(subscriber).toHaveBeenCalled();

// After (option 1)
tree.$.count.set(5);
await Promise.resolve();
expect(subscriber).toHaveBeenCalled();

// After (option 2)
tree.$.count.set(5);
getPathNotifier().flushSync();
expect(subscriber).toHaveBeenCalled();
```

## 6.2.1 (2026-01-04)

### 🐛 Bug Fixes

- **core:** Preserve `.with()` method through enhancer chains - wrapper-creating enhancers (batching, devTools, timeTravel) now correctly pass the enhanced tree to subsequent enhancers
- **time-travel:** Handle `structuredClone` failure for states containing functions (e.g., entityMap's `idKey`) - falls back to JSON serialization

### 📖 Details

The `.with()` chaining bug occurred because enhancers that create wrapper functions (like batching) were copying the `.with()` method from the original tree. The closure inside `.with()` still referenced the original tree, so subsequent enhancers received an un-enhanced tree and lost methods from previous enhancers.

**Before (broken):**

```typescript
tree.with(batching()).with(devTools()); // devTools receives un-batched tree!
```

**After (fixed):**

```typescript
tree.with(batching()).with(devTools()); // devTools receives batched tree ✅
```

---

## 6.2.0 (2026-01-03)

### ⚠️ BREAKING CHANGES

- **batching:** Removed deprecated BatchingConfig options:
  - `debounceMs` - use `notificationDelayMs` instead
  - `maxBatchSize` - no longer used (signal writes are synchronous)
  - `autoFlushDelay` - was alias for `debounceMs`
  - `batchTimeoutMs` - was alias for `debounceMs`
- **batching:** Backwards compatibility fallbacks removed - users **must** update to use `notificationDelayMs`

### 📖 Migration

```typescript
// Before (deprecated)
tree.with(batching({ debounceMs: 16 }));
tree.with(batching({ maxBatchSize: 100 })); // maxBatchSize is ignored
tree.with(batching({ autoFlushDelay: 50 }));

// After
tree.with(batching({ notificationDelayMs: 16 }));
tree.with(batching()); // No config needed for default behavior
```

**Note:** `debounceMs` in other configs (`PersistenceConfig`, `FieldConfig`) remains valid - only `BatchingConfig` options were removed.

---

## 6.1.0 (2026-01-03)

### ⚠️ BREAKING CHANGES (Behavior)

- **batching:** Signal writes are now **synchronous** - values update immediately when `.set()` is called
  - This is a **breaking behavioral change** but aligns with Angular's signal contract
  - Only change detection notifications are batched to microtask
  - Read-after-write patterns now work correctly without workarounds

### ✨ Features

- **batching:** Add `coalesce()` method for deduplicating rapid same-path updates
  - Use for high-frequency updates (typing, dragging, etc.)
  - Only the final value for each path is written
- **batching:** Add `hasPendingNotifications()` method to check CD notification queue
- **batching:** Add `flushNotifications()` method for manual CD notification flush
- **batching:** Add `notificationDelayMs` config option (replaces `debounceMs`)

### 🗑️ Deprecated

- `flushBatchedUpdates()` - use `tree.flushNotifications()` instead
- `hasPendingUpdates()` - use `tree.hasPendingNotifications()` instead
- `getBatchQueueSize()` - no longer relevant (writes are synchronous)
- `debounceMs` config - use `notificationDelayMs` instead
- `transaction()` - removed (no longer needed since writes are synchronous)

### 📖 Migration

```typescript
// Before: required setTimeout or transaction() for read-after-write
tree.$.selected.haulerId.set(5);
setTimeout(() => {
  const trucks = tree.$.selectableTrucks();
}, 0);

// After: just works™
tree.$.selected.haulerId.set(5);
const trucks = tree.$.selectableTrucks(); // Immediate ✅
```

### 🎯 Design Philosophy

The batching enhancer now aligns with Angular's signal contract:

- `signal.set(x)` updates the value **immediately**
- `signal()` **always** returns the current value
- Effects and change detection run on microtask

This means `batch()` only affects **when** change detection is notified, not **when** values update.

## 6.0.0 (2025-12-31)

### 🩹 Fixes

- **perf:** Fix TDZ bug in `entity-crud-performance.js` benchmark script
  - Resolved a temporal dead zone (TDZ) ReferenceError that prevented performance benchmarks from running during release validation
  - Ensures all performance and release scripts execute successfully

### 🧹 Chores

- Bump all package versions to 6.0.0 after benchmark script fix

## 5.1.5 (2025-01-13)

### 🗑️ Removed

- **core:** Remove `tree.entities()` method from `entities` enhancer
  - The `entities()` method was redundant and confusing - use direct property access instead
  - `tree.entities()` → `tree` (direct access to entity signals)
  - Updated all documentation and examples to reflect this change
  - This simplifies the API and removes unnecessary abstraction

### 📚 Documentation

- **docs:** Add SignalTree architecture guide explaining recommended patterns
- **docs:** Add recommended architecture demo showcasing best practices
- **docs:** Update all documentation to reflect `tree.entities()` removal

### 🛠️ Internal

- **core:** Clean up unused entities method implementation
- **perf:** Fix signal usage in performance scripts after API changes

## 5.1.3 (2025-12-17)

### 🐛 Bug Fixes

- **core:** Fix EntitySignal API consistency - properties return signals directly
  - Changed `EntitySignal<E, K>` interface from method-based (`all(): Signal<E[]>`) to property-based (`all: Signal<E[]>`)
  - Updated runtime type guards and all usage throughout codebase
  - Fixed API inconsistency where interface declared methods but implementation used getters
  - All entity query properties (`all`, `count`, `ids`, `isEmpty`, `map`) now consistently return signals directly

## 5.1.2 (2025-12-17)

### 🐛 Bug Fixes

- **core:** Fix npm package publishing - include dist/ and src/ directories
  - Previous publish was missing the actual JavaScript and TypeScript declaration files
  - Package now correctly includes all required files for installation

## 5.1.1 (2025-12-17)

### 🐛 Bug Fixes

- **core:** Fix EntityMapMarker preservation in lazy signal trees
  - `createLazySignalTree` now preserves `EntityMapMarker` objects instead of wrapping them in proxies
  - This fixes runtime errors where `$.trucks.byId()` was undefined because entity maps weren't materialized
  - Entity maps are now correctly converted to `EntitySignal` instances by `entities()`

## 5.2.0 (2025-12-16)

### 🗑️ Removed

- **core:** Remove `SignalTreeWithBase<T, Constraint>` and `ConstraintAwareTreeNode<T, Constraint>`
  - These were workarounds for using SignalTree with NgRx-style generic enhancers
  - SignalTree is designed for direct state management, not generic enhancer composition
  - Use concrete types with SignalTree instead of generic enhancer patterns
  - If you need reusable patterns, define methods alongside your tree, not as generic enhancers

### 📖 Philosophy

SignalTree is intentionally simple: create a tree, access nested signals directly.
The NgRx-style `withFeature()` enhancer pattern introduces unnecessary abstraction
and TypeScript complexity. Instead:

```typescript
// ✅ SignalTree way: direct and simple
const tree = signalTree({ loading: { state: 'idle', error: null } });
const loadAll$ = () => {
  tree.$.loading.state.set('loading');
  return service.load$().pipe(
    tap(data => tree.$.loading.state.set('loaded')),
    catchError(err => { tree.$.loading.error.set(err); return EMPTY; })
  );
};
return { tree, loadAll$ };

// ❌ Avoid: NgRx-style generic enhancers
function withServiceRead<T extends BaseState>(tree: ISignalTree<T>) { ... }
```

## 5.1.6 (2025-12-29)

### 🚀 Changes

- **core:** Rename enhancer factory helpers from `withX()` to short factories (e.g. `batching()` → `batching()`)
  - Updated demo, examples and tests to use the new factory names
  - Added compatibility alias exports to preserve `with*` names for consumers

### 🛠️ Validation

- **ci:** Fixes and updates to demo build and validation scripts
  - Rebuilt demo assets and updated example imports
  - Updated test fixtures and committed validation fixes

## 5.1.0 (2025-12-16)

### 🚀 Features

- **core:** Add `EntityMapMarker` unique symbol brand for nominal typing

  - Prevents regular objects from structurally matching EntityMapMarker
  - Improves type inference in generic contexts

- **core:** Export additional utility types: `CallableWritableSignal`, `AccessibleNode`, `NodeAccessor`

### 🩹 Fixes

- **core:** Remove index signature from `SignalTree<T>` type

  - Removed `& Record<string, unknown>` that caused `.with()` bracket notation requirement
  - Enables clean dot notation: `tree.with(enhancer)` without bracket notation
  - Enhancers must now explicitly type their return values (better practice anyway)
  - Fixes TS4111 error with `noPropertyAccessFromIndexSignature: true`

- **core:** Fix TreeNode conditional types to prevent distribution over generics
  - Wrap conditional checks in `[T[K]] extends [...]` to prevent distributive behavior

## 5.0.9 (2025-12-16)

### 🩹 Fixes

- **core:** Make `TreeNode<T>` entity-aware by default
  - Add `__isEntityMap` check to `TreeNode<T>` conditional type
  - Entity markers (`entityMap<E>()`) are now treated as leaves, not recursively expanded
  - Fixes type inference when using `signalTree()` with `entityMap()` in initial state
  - No longer requires explicit generic parameter for correct type inference

## 5.0.8 (2025-12-16)

### 🩹 Fixes

- **core:** Ensure postbuild runs during release (skip Nx cache)
  - Add `cache: false` to postbuild target
  - Add `--skip-nx-cache` to release script postbuild step
  - 5.0.7 was cached and skipped the fix

## 5.0.7 (2025-12-16)

### 🩹 Fixes

- **core:** Actually run fix-dts-imports in nx postbuild target
  - Updated core project.json to run the fix script after build
  - 5.0.6 had the script but didn't wire it to the build pipeline

## 5.0.6 (2025-12-16)

### 🩹 Fixes

- **core:** Fix broken type declarations referencing unpublished `@signaltree/shared`
  - Type declarations now inline shared utility types instead of importing them
  - Fixes TypeScript resolution errors when using `@signaltree/core` in consuming projects
  - Added `fix:dts-imports` post-build step to automatically fix type declarations

## 5.0.5 (2025-12-16)

### 🩹 Fixes

- **core:** Fix type inference for `.with()` method chaining
  - Moved index signature from inline `[key: string]: unknown` to intersection `& Record<string, unknown>`
  - Explicit properties like `with`, `state`, `$` now take precedence over index signature
  - Enables dot notation access: `tree.with(enhancer)` instead of `tree['with'](enhancer)`
  - Resolves TS4111: "Property 'with' comes from an index signature"
- **core:** Remove duplicate `entityMap()` function from entity-signal.ts
  - The correct implementation in types.ts returns `EntityMapMarker<E, K>` for proper type inference
  - Removed redundant implementation that returned `unknown`

## 5.0.2 (2025-12-15)

### 🧹 Chores

- Align internal package versions (`shared`, `types`, `utils`) to 5.0.2 to match published artifacts.
- Update release automation: make git tagging idempotent and avoid rollbacks after successful publish.

### 🩹 Fixes

- No user-facing code changes; release process hardening only.

## 5.0.1 (2025-12-15)

### 🩹 Fixes

- Ensure main barrel entrypoints are emitted for packages using Rollup preserveModules (ng-forms, guardrails, callable-syntax) so `dist/index.js` is always present.
- Broaden Angular peer dependency range to `^20.0.0` across all packages to avoid peer conflicts with Angular 21/22 while keeping Angular 20 compatibility.

### 🧹 Chores

- Format Rollup config files and project metadata for consistency.

## 5.0.0 (2025-12-10)

### 💥 BREAKING CHANGES

- **core:** entity system redesigned with marker-based API
  - Replaced `tree.entities<E>(path)` with `entityMap()` in state definition
  - Now accessed via `store.$.fieldName.method()` instead of `helpers.method()`
  - Path-based entity access removed (use direct `$` access instead)
  - Entity helpers API (`setAll`, `addOne`, `byId`, etc.) now reactive signals
  - See RELEASE_v5.0.md for detailed migration guide

### 🚀 Features

- **core:** marker-based entity system with EntitySignal API

  - `EntityMapMarker<T, ID>` type for compile-time safety
  - Full TypeScript support with recursive type inference (20+ nesting levels)
  - Reactive CRUD operations: `setAll()`, `addOne()`, `updateOne()`, `removeOne()`
  - Type-safe computed selectors: `where()`, `byId()`, `count()`, `all()`
  - Observable patterns for reactive queries

- **core:** PathNotifier integration for reactive mutation tracking

  - Internal path-level change tracking for computed selectors
  - Minimal overhead with synchronous and batch operation support
  - Enables advanced reactive patterns without proxy overhead

- **core:** consolidated entity architecture

  - All entity logic unified under single enhancer
  - No separate entity package required
  - Reduced bundle duplication across ecosystem
  - Simplified mental model: entities = state slice with methods

- **core:** enhanced type system

  - Recursive type inference up to 20+ nesting levels
  - Entity marker types for compile-time safety
  - Improved parameter inference for enhancers
  - Full IntelliSense support in editors

- **core:** improved enhancer composition
  - Metadata-driven enhancer ordering system
  - Cleaner `requires`/`provides` declarations
  - Better initialization sequencing
  - Reduced inter-enhancer ordering bugs

### 📊 Performance Improvements

- **Entity operations** (map-based vs array-based)

  - Add single item: +49.4% throughput (12M → 24M ops/sec)
  - Update single item: +60.1% faster execution
  - Lookup by ID: native Map performance (parity with v4.2.1)
  - Remove single item: parity maintained
  - Initial load (setAll 1000 items): +3.5% improvement

- **Bundle size optimization**
  - Consolidated entity architecture reduces duplication
  - 15.9% reduction in total ecosystem size vs separate-package layout
  - Tree-shakeable enhancer exports
  - Minimal PathNotifier overhead

### 📚 Documentation

- New `QUICK_START.md` with step-by-step v5.0 examples
- Updated `QUICK_REFERENCE.md` with EntitySignal API
- Migration guide in RELEASE_v5.0.md
- Moved ARCHITECTURE.md to `docs/ARCHITECTURE.md` for better organization
- Enhanced USAGE_EXAMPLES.md with entity patterns
- NEW: `docs/V5_ENTITY_PERFORMANCE_ANALYSIS.md` for entity perf guidance

### 🩹 Fixes

- Remove circular import in types.ts ([5ed4601](https://github.com/JBorgia/signaltree/commit/5ed4601))
- Add depth limit to DeepPath type to prevent TypeScript infinite recursion ([90e0816](https://github.com/JBorgia/signaltree/commit/90e0816))
- Exclude demo from release pre-build command ([61c7ea8](https://github.com/JBorgia/signaltree/commit/61c7ea8))

### ❤️ Thank You

- Borgia

## 4.2.0 (2025-12-04)

### 🚀 Features

- add support for nested entity paths with dot notation ([e0bef8d](https://github.com/JBorgia/signaltree/commit/e0bef8d))

### 🩹 Fixes

- remove circular import in types.ts ([5ed4601](https://github.com/JBorgia/signaltree/commit/5ed4601))
- add depth limit to DeepPath type to prevent TypeScript infinite recursion ([90e0816](https://github.com/JBorgia/signaltree/commit/90e0816))
- revert entities signature to keyof T for type safety while maintaining runtime nested path support ([28885d3](https://github.com/JBorgia/signaltree/commit/28885d3))
- exclude demo from release pre-build command ([61c7ea8](https://github.com/JBorgia/signaltree/commit/61c7ea8))

### ❤️ Thank You

- Borgia

# Changelog

## Unreleased

### 🚀 Features

- **core:** add support for nested entity paths with dot notation
  - Entities can now be accessed using paths like `tree.entities<User>('app.data.users')`
  - Added `DeepPath<T>` type to enumerate all valid nested array paths
  - Added `DeepAccess<T, Path>` type for type-safe path resolution
  - Backward compatible - top-level keys work exactly as before
  - Performance: ~100-500ns overhead on initialization, memoized thereafter
  - Enables better state organization for domain-driven architectures

### 🔥 Refactoring

- **core:** remove non-functional asyncAction stub and update documentation
  - Removed `tree.asyncAction()` method (was returning empty object)
  - Removed `AsyncActionConfig` and `AsyncAction` type interfaces
  - Updated all documentation to use manual async patterns with `tree.$.loading.set()`
  - Better alternatives: manual async, `createAsyncOperation()`, or `trackAsync()` helpers

## 4.1.7 (2025-12-04)

### 🩹 Fixes

- **core,enterprise:** add types subpath condition to exports field ([57d101f](https://github.com/JBorgia/signaltree/commit/57d101f))
- **guardrails:** update peerDependency to @signaltree/core 4.1.6 ([4e05a85](https://github.com/JBorgia/signaltree/commit/4e05a85))

### ❤️ Thank You

- Borgia

## 4.1.6 (2025-12-04)

### 🚀 Features

- add automated version injection for demo app ([b209d34](https://github.com/JBorgia/signaltree/commit/b209d34))
- add GitHub and npm links to navigation menu ([ec366c6](https://github.com/JBorgia/signaltree/commit/ec366c6))
- **demo:** add automated version constant generator and integrate in navigation ([311d50b](https://github.com/JBorgia/signaltree/commit/311d50b))

### 🩹 Fixes

- **demo:** update displayed SignalTree versions to 4.1.5 ([22d28d6](https://github.com/JBorgia/signaltree/commit/22d28d6))
- **ng-forms:** add proper type declarations and ESM configuration to package.json ([885769f](https://github.com/JBorgia/signaltree/commit/885769f))

### ❤️ Thank You

- Borgia

## 4.1.5 (2025-11-30)

### 🚀 Features

- **benchmarks:** add contextual explanations for enterprise, rapid updates, and subscriber scaling ([94ad851](https://github.com/JBorgia/signaltree/commit/94ad851))

### 🩹 Fixes

- move jest-preset-angular to devDependencies in ng-forms ([a4d7c8c](https://github.com/JBorgia/signaltree/commit/a4d7c8c))
- ignore jest-preset-angular in ng-forms dependency checks ([cc837c8](https://github.com/JBorgia/signaltree/commit/cc837c8))
- remove outdated ng-forms special case in declaration verification ([a08a941](https://github.com/JBorgia/signaltree/commit/a08a941))
- use hardcoded version in navigation component ([d679a15](https://github.com/JBorgia/signaltree/commit/d679a15))
- **benchmarks:** rename 'Large History Size' to 'History Buffer Scaling' for consistency ([a267852](https://github.com/JBorgia/signaltree/commit/a267852))
- **benchmarks:** align rank badges and enterprise badges in results table ([2041375](https://github.com/JBorgia/signaltree/commit/2041375))
- **demo:** use relative logo paths for GitHub Pages subfolder deployment ([318fb22](https://github.com/JBorgia/signaltree/commit/318fb22))
- **demo:** use relative asset paths for documentation README files ([ad3f3eb](https://github.com/JBorgia/signaltree/commit/ad3f3eb))

### ❤️ Thank You

- Borgia

## 4.1.4 (2025-11-28)

### 🚀 Features

- **demo:** add value propositions to all demo pages ([2024c32](https://github.com/JBorgia/signaltree/commit/2024c32))

### 🩹 Fixes

- **demo:** escape curly braces in ng-forms template code block ([98ab328](https://github.com/JBorgia/signaltree/commit/98ab328))
- **demo:** improve benchmark comparison display and update enterprise enhancer page ([526a72e](https://github.com/JBorgia/signaltree/commit/526a72e))
- **demo:** use correct SignalTree callable API instead of non-existent setState method ([15a5547](https://github.com/JBorgia/signaltree/commit/15a5547))

### 🔥 Performance

- **enterprise:** fix large array regression by simplifying diff; guard instrumentation in PathIndex/Scheduler; middleware no-mutation fast path; UI: add scoring formula spacing\n\n- Remove suffix/segmentation array heuristics; keep prefix + whole-array\n- Add PathIndex.enableInstrumentation + setInstrumentation(); guard metrics\n- Guard Scheduler metrics and performance.now() under instrumentation flag\n- Implement middleware no-mutation fast path in core\n- Update demo scoring formula spacing and benchmark text\n- Rebuild enterprise/core; validations pending ([aa75653](https://github.com/JBorgia/signaltree/commit/aa75653))

### ❤️ Thank You

- Borgia

## 4.1.3 (2025-11-21)

### 🚀 Features

- enable automatic benchmark saving without consent requirement ([a8bf071](https://github.com/JBorgia/signaltree/commit/a8bf071))
- Add SignalTree logo and improve demo UX ([66564d5](https://github.com/JBorgia/signaltree/commit/66564d5))
- complete Phase 0 - baseline preparation and shared utilities ([afcbacf](https://github.com/JBorgia/signaltree/commit/afcbacf))
- add package deprecation tooling and migration guide ([a14072a](https://github.com/JBorgia/signaltree/commit/a14072a))
- add OTP support to deprecation script ([9d2913f](https://github.com/JBorgia/signaltree/commit/9d2913f))
- prepare @signaltree/enterprise for npm publication ([1a78a43](https://github.com/JBorgia/signaltree/commit/1a78a43))
- enhance benchmark details dialog with better formatting ([01e43ad](https://github.com/JBorgia/signaltree/commit/01e43ad))
- always show signaltree as first column in benchmark tables ([f383955](https://github.com/JBorgia/signaltree/commit/f383955))
- add comprehensive pre-publish validation and release process automation ([ed84bc0](https://github.com/JBorgia/signaltree/commit/ed84bc0))
- add comprehensive .cursorrules for AI context preloading ([c07695e](https://github.com/JBorgia/signaltree/commit/c07695e))
- **core:** implement SignalMemoryManager with WeakRef and FinalizationRegistry ([3b3be73](https://github.com/JBorgia/signaltree/commit/3b3be73))
- **core:** integrate SignalMemoryManager with lazy trees ([88f92c3](https://github.com/JBorgia/signaltree/commit/88f92c3))
- **demo:** comprehensive demo pages overhaul ([6251ee8](https://github.com/JBorgia/signaltree/commit/6251ee8))
- **demo,core:** Angular Signal Forms demo polish and reactive slice sync ([43b43a6](https://github.com/JBorgia/signaltree/commit/43b43a6))
- **demo/fundamentals:** pin What's New card first and keep stable ordering ([962802f](https://github.com/JBorgia/signaltree/commit/962802f))
- **performance:** add PathIndex, DiffEngine, and OptimizedUpdateEngine ([8db34a3](https://github.com/JBorgia/signaltree/commit/8db34a3))
- **phase2:** complete Phase 2 Performance Architecture implementation ([d3df6c7](https://github.com/JBorgia/signaltree/commit/d3df6c7))
- **security:** add SecurityValidator with function blocking ([590bf83](https://github.com/JBorgia/signaltree/commit/590bf83))
- **security:** integrate SecurityValidator into signalTree ([bde199f](https://github.com/JBorgia/signaltree/commit/bde199f))
- **size:** add size claim verification to prevent barrel-only measurements ([1ca8b59](https://github.com/JBorgia/signaltree/commit/1ca8b59))

### 🩹 Fixes

- update GitHub Packages publishing and repository URLs ([50cbbee](https://github.com/JBorgia/signaltree/commit/50cbbee))
- update GitHub Packages publishing and repository URLs ([d471d93](https://github.com/JBorgia/signaltree/commit/d471d93))
- update Node.js version to 20 and clear Nx cache in CI workflow ([95fe516](https://github.com/JBorgia/signaltree/commit/95fe516))
- improve CI build reliability - explicit production config, disable daemon, add debugging ([1d9fcae](https://github.com/JBorgia/signaltree/commit/1d9fcae))
- correct Nx build and test commands in release script ([07272a8](https://github.com/JBorgia/signaltree/commit/07272a8))
- update outdated version and bundle size information ([d2ff81a](https://github.com/JBorgia/signaltree/commit/d2ff81a))
- correct benchmark duration calculation ([952a490](https://github.com/JBorgia/signaltree/commit/952a490))
- Remove white background from SVG logo and improve sizing ([bcb7aee](https://github.com/JBorgia/signaltree/commit/bcb7aee))
- Reduce hero logo size for better proportions ([599dead](https://github.com/JBorgia/signaltree/commit/599dead))
- resolve npm publishing issues and update to v4.0.1 ([f750e8c](https://github.com/JBorgia/signaltree/commit/f750e8c))
- correct SCSS import paths for new example components ([935fb3c](https://github.com/JBorgia/signaltree/commit/935fb3c))
- update deprecation script for bash 3 compatibility ([4b17fcf](https://github.com/JBorgia/signaltree/commit/4b17fcf))
- remove progressive-rpg-demo component references and fix TS config ([11efa05](https://github.com/JBorgia/signaltree/commit/11efa05))
- update release script to only publish existing packages ([072286e](https://github.com/JBorgia/signaltree/commit/072286e))
- correct file paths in sanity checks script ([8ff6459](https://github.com/JBorgia/signaltree/commit/8ff6459))
- update build scripts to reflect v4.0.0+ package consolidation ([1034ab2](https://github.com/JBorgia/signaltree/commit/1034ab2))
- correct package.json export paths for enterprise and callable-syntax ([ebcb5c5](https://github.com/JBorgia/signaltree/commit/ebcb5c5))
- resolve build issues for callable-syntax and ng-forms packages ([05b0631](https://github.com/JBorgia/signaltree/commit/05b0631))
- resolve linter errors for release ([426c2b1](https://github.com/JBorgia/signaltree/commit/426c2b1))
- transform benchmark data structure for table display ([1e99626](https://github.com/JBorgia/signaltree/commit/1e99626))
- prioritize fallback data for benchmark details ([04a905f](https://github.com/JBorgia/signaltree/commit/04a905f))
- modal backdrop now displays as overlay instead of inline ([ae2d7ed](https://github.com/JBorgia/signaltree/commit/ae2d7ed))
- disable view encapsulation for modal to display as overlay ([d50dc22](https://github.com/JBorgia/signaltree/commit/d50dc22))
- correct data structure for benchmark details modal ([c3cb5ea](https://github.com/JBorgia/signaltree/commit/c3cb5ea))
- add fallback background colors to modal dialog ([#1](https://github.com/JBorgia/signaltree/issues/1))
- use light background for modal dialog ([25166a8](https://github.com/JBorgia/signaltree/commit/25166a8))
- prevent modal CSS variables from affecting table styles ([#212121](https://github.com/JBorgia/signaltree/issues/212121))
- ensure close button is perfectly round ([63035eb](https://github.com/JBorgia/signaltree/commit/63035eb))
- replace all CSS variables with explicit light theme colors in modal ([#212121](https://github.com/JBorgia/signaltree/issues/212121), [#757575](https://github.com/JBorgia/signaltree/issues/757575), [#1976](https://github.com/JBorgia/signaltree/issues/1976))
- remove @signaltree/shared from runtime dependencies ([0c4f957](https://github.com/JBorgia/signaltree/commit/0c4f957))
- add @signaltree/core devDependency to enterprise and fix ng-forms tsconfig paths ([1a4dcaf](https://github.com/JBorgia/signaltree/commit/1a4dcaf))
- update validation scripts to use correct npm scripts ([1b76809](https://github.com/JBorgia/signaltree/commit/1b76809))
- resolve linting errors for pre-publish validation ([915d7c7](https://github.com/JBorgia/signaltree/commit/915d7c7))
- improve PathIndex performance test reliability ([9e8574f](https://github.com/JBorgia/signaltree/commit/9e8574f))
- correct TypeScript path mappings for production builds ([8a71270](https://github.com/JBorgia/signaltree/commit/8a71270))
- correct dist path for TypeScript module resolution ([097959b](https://github.com/JBorgia/signaltree/commit/097959b))
- exclude packages with peer dependencies from pre-publish validation builds ([8bdd003](https://github.com/JBorgia/signaltree/commit/8bdd003))
- update verify-dist script to match actual dist directory structure ([9a680aa](https://github.com/JBorgia/signaltree/commit/9a680aa))
- rewrite verify-dist script to handle both Nx and tsup output structures ([13a7b73](https://github.com/JBorgia/signaltree/commit/13a7b73))
- replace duplicate dist verification logic with call to verify-dist.sh ([7382fb5](https://github.com/JBorgia/signaltree/commit/7382fb5))
- handle missing timeout command on macOS in validation script ([1548f3d](https://github.com/JBorgia/signaltree/commit/1548f3d))
- skip performance benchmarks during validation ([6ebeea2](https://github.com/JBorgia/signaltree/commit/6ebeea2))
- use gtimeout for performance benchmarks on macOS ([4d81cd9](https://github.com/JBorgia/signaltree/commit/4d81cd9))
- remove duplicate TypeScript path mappings that broke SWC ([bc9136f](https://github.com/JBorgia/signaltree/commit/bc9136f))
- improve .gitignore patterns for coverage and artifacts ([5878e7c](https://github.com/JBorgia/signaltree/commit/5878e7c))
- make bundle analysis and performance benchmarks non-blocking ([b3d891a](https://github.com/JBorgia/signaltree/commit/b3d891a))
- override types in guardrails tsconfig to exclude Angular ([c678c91](https://github.com/JBorgia/signaltree/commit/c678c91))
- add TestBed.flushEffects() to fix flaky ng-forms test ([1573b27](https://github.com/JBorgia/signaltree/commit/1573b27))
- add TestBed import for ng-forms test ([cb859b4](https://github.com/JBorgia/signaltree/commit/cb859b4))
- use async/await with setTimeout for ng-forms test instead of TestBed ([c2debb0](https://github.com/JBorgia/signaltree/commit/c2debb0))
- update ng-forms reset test to check form control values instead of signals ([6834db8](https://github.com/JBorgia/signaltree/commit/6834db8))
- remove build-time dependencies from core peerDependencies ([82468cf](https://github.com/JBorgia/signaltree/commit/82468cf))
- ignore rollup packages in dependency-checks lint rule ([b004374](https://github.com/JBorgia/signaltree/commit/b004374))
- remove unnecessary TestBed usage from core tests ([5d11d0f](https://github.com/JBorgia/signaltree/commit/5d11d0f))
- add jest-preset-angular to ignored dependencies in lint config ([8334682](https://github.com/JBorgia/signaltree/commit/8334682))
- apply type declaration fix to all Rollup-built packages + documentation ([d39f81b](https://github.com/JBorgia/signaltree/commit/d39f81b))
- **build:** disable declaration generation to prevent stray .d.ts files ([2b469c6](https://github.com/JBorgia/signaltree/commit/2b469c6))
- **build:** add post-build cleanup for stray .d.ts files ([5f0596b](https://github.com/JBorgia/signaltree/commit/5f0596b))
- **core:** exclude stray dist/\*.d.ts files that conflicted with type resolution ([9e1286e](https://github.com/JBorgia/signaltree/commit/9e1286e))
- **demo:** update home page with correct package installation instructions ([a36477c](https://github.com/JBorgia/signaltree/commit/a36477c))
- **demo:** fix lint errors in ng-forms demo ([948ba76](https://github.com/JBorgia/signaltree/commit/948ba76))
- **enterprise:** remove duplicate WeakRef declaration ([d162bdf](https://github.com/JBorgia/signaltree/commit/d162bdf))
- **ng-forms:** fix conditional field synchronization with nested objects ([8e58e31](https://github.com/JBorgia/signaltree/commit/8e58e31))
- **ng-forms): nested signal path traversal bug chore(build): align declaration layout with Nx preserveModules design chore(validation:** update scripts for src-based d.ts structure ([627551d](https://github.com/JBorgia/signaltree/commit/627551d))
- **phase2:** correct buildFromTree signal detection - reorder type checks ([1451b17](https://github.com/JBorgia/signaltree/commit/1451b17))
- **size:** update size claims to match actual measured values - core ~27KB, enterprise ~7KB, shared ~3.8KB ([f63dc3c](https://github.com/JBorgia/signaltree/commit/f63dc3c))
- **tree-shaking:** verify barrel imports are tree-shakeable, update guidance ([ed6f28e](https://github.com/JBorgia/signaltree/commit/ed6f28e))

### 🔥 Performance

- improve measurement robustness (non-zero medians & hrtime batching) ([b2ae452](https://github.com/JBorgia/signaltree/commit/b2ae452))

### ❤️ Thank You

- Borgia

## 4.1.2 (2025-11-21)

### 🩹 Fixes

- **build:** disable declaration generation to prevent stray .d.ts files ([52d70b7](https://github.com/JBorgia/signaltree/commit/52d70b7))
- **build:** add post-build cleanup for stray .d.ts files ([3ac04f2](https://github.com/JBorgia/signaltree/commit/3ac04f2))
- **demo:** fix lint errors in ng-forms demo ([1d2a7ca](https://github.com/JBorgia/signaltree/commit/1d2a7ca))
- **ng-forms:** fix conditional field synchronization with nested objects ([ce3ec52](https://github.com/JBorgia/signaltree/commit/ce3ec52))
- **ng-forms): nested signal path traversal bug chore(build): align declaration layout with Nx preserveModules design chore(validation:** update scripts for src-based d.ts structure ([816f49c](https://github.com/JBorgia/signaltree/commit/816f49c))

### ❤️ Thank You

- Borgia

## 4.1.1 (2025-11-20)

### 🩹 Fixes

- apply type declaration fix to all Rollup-built packages + documentation ([d39f81b](https://github.com/JBorgia/signaltree/commit/d39f81b))
- **core:** exclude stray dist/\*.d.ts files that conflicted with type resolution ([9e1286e](https://github.com/JBorgia/signaltree/commit/9e1286e))

### ❤️ Thank You

- Borgia

# Changelog

All notable changes to SignalTree will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.0] - 2025-11-18

### Changed

- Migrated all publishable SignalTree packages (`core`, `enterprise`, `callable-syntax`, `guardrails`, `ng-forms`) to the Nx Rollup executor with `preserveModules` output for reliable ESM distribution and tree-shaking.
- Updated guardrails distribution to ship pure ESM entry points with consistent conditional exports and a generated production `noop` module.
- Regenerated package manifests and build graphs so published packages reference Rollup artifacts directly and pull types from source to match preserved module layout.

### Added

- Introduced `tools/build/create-rollup-config.mjs`, centralizing shared Rollup options across libraries.
- Expanded bundle analysis tooling to validate the new dist layouts and enforce gzipped/ungzipped thresholds for every published facade.

### Removed

- Retired the legacy `tsup` build for guardrails and eliminated redundant docs package manifests that previously shadowed published packages.

## [4.0.14] - 2025-11-13

### Fixed

- **Peer Dependencies**: Removed build-time dependencies (rollup packages, jest-preset-angular) from `@signaltree/core` peerDependencies
  - Users no longer need `--legacy-peer-deps` flag to install SignalTree
  - Changed `tslib` from `"*"` to `"^2.0.0"` for more flexible version range
  - Only runtime dependencies (`@angular/core`, `tslib`) are now required as peers

### Added

- **Documentation**: Added comprehensive "Companion Packages" section to `@signaltree/core` README
  - Detailed descriptions of `@signaltree/ng-forms`, `@signaltree/enterprise`, `@signaltree/guardrails`, and `@signaltree/callable-syntax`
  - Installation instructions, features, bundle impact, and when to use each package
  - Package selection guide with typical installation patterns

### Fixed

- Fixed flaky ng-forms test by updating form reset test to check form control values
- Fixed guardrails TypeScript configuration to exclude Angular types
- Removed unnecessary TestBed usage from core enhancer tests

## [4.0.13] - 2025-11-13

### Fixed

- **Peer Dependencies**: Removed build-time dependencies (rollup packages, jest-preset-angular) from `@signaltree/core` peerDependencies
  - Users no longer need `--legacy-peer-deps` flag to install SignalTree
  - Changed `tslib` from `"*"` to `"^2.0.0"` for more flexible version range
  - Only runtime dependencies (`@angular/core`, `tslib`) are now required as peers

### Added

- **Documentation**: Added comprehensive "Companion Packages" section to `@signaltree/core` README
  - Detailed descriptions of `@signaltree/ng-forms`, `@signaltree/enterprise`, `@signaltree/guardrails`, and `@signaltree/callable-syntax`
  - Installation instructions, features, bundle impact, and when to use each package
  - Package selection guide with typical installation patterns

### Fixed

- Fixed flaky ng-forms test by updating form reset test to check form control values
- Fixed guardrails TypeScript configuration to exclude Angular types
- Removed unnecessary TestBed usage from core enhancer tests

## [4.0.6] - 2025-01-04

### Changed

- **Version Alignment**: Aligned all packages to v4.0.6 for consistency
  - `@signaltree/core@4.0.6`
  - `@signaltree/ng-forms@4.0.6`
  - `@signaltree/enterprise@4.0.6`
  - `@signaltree/callable-syntax@4.0.6`

### Fixed

- Fixed export paths for `@signaltree/enterprise` and `@signaltree/callable-syntax` packages
- Corrected package.json files array to match build output structure

## [4.0.2] - 2025-11-04

### Added

#### 🏢 @signaltree/enterprise Package (First Publication)

Introduced enterprise-grade optimizations for large-scale applications as a separate optional package.

**Features:**

- **Diff-Based Updates**: Intelligent change detection that only updates what actually changed
- **Bulk Optimization**: 2-5x faster when updating multiple values simultaneously
- **Change Tracking**: Detailed statistics on adds, updates, and deletes
- **Path Indexing**: Debug helper for understanding signal hierarchy
- **Smart Defaults**: Works out-of-the-box with sensible presets

**Use Cases:**

- Real-time dashboards with 500+ signals
- Data grids with thousands of rows
- Enterprise applications with complex state
- High-frequency data feeds (60Hz+)

**Bundle Cost:** +2.4KB gzipped

**Installation:**

```bash
npm install @signaltree/enterprise
```

**Example:**

```typescript
import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

const tree = signalTree(largeState).with(enterprise());
const result = tree.updateOptimized(newData, { ignoreArrayOrder: true });
console.log(result.stats); // { totalChanges: 15, adds: 3, updates: 10, deletes: 2 }
```

### Changed

#### Documentation Updates

- **README.md**: Added enterprise section to Enhancer Guide with comprehensive examples
- **Installation Examples**: Updated to include enterprise package options
- **Migration Notice**: Clarified that enterprise is a separate optional package
- **Package Structure**: Documented enterprise alongside ng-forms and callable-syntax as optional add-ons
- **docs/overview.md**: Added enterprise to package ecosystem section

#### Release Script

- Updated `scripts/release.sh` to include enterprise package in publish workflow
- Removed deprecated packages (batching, memoization, etc.) that were consolidated into core

### Fixed

- Fixed duplicate WeakRef declaration in enterprise package that caused TypeScript compilation errors
- Corrected import paths in enterprise documentation from `@signaltree/core/enterprise` to `@signaltree/enterprise`

### Published Packages

- @signaltree/core@4.0.2 (includes all enhancers + updated README)
- @signaltree/ng-forms@4.0.2 (updated README)
- @signaltree/enterprise@4.0.2 ⭐ **NEW** (first publication)

## [4.0.0] - 2025-11-03

### Added - November 2, 2025

#### Package Consolidation: All Enhancers Now Available from Core

**Breaking Change**: All SignalTree enhancers have been consolidated into the `@signaltree/core` package for simplified distribution and better tree-shaking.

##### What Changed

- **Consolidated Distribution**: All enhancers (batching, memoization, devtools, entities, middleware, presets, time-travel) are now exported directly from `@signaltree/core`
- **Simplified Imports**: No need to install separate packages - everything is available from the core package
- **Better Tree-Shaking**: Consolidated exports enable more efficient bundling
- **Single Version**: All features now version-locked together

##### Migration Guide

**Before (separate packages):**

```typescript
import { createSignalTree } from '@signaltree/core';
import { batching } from '@signaltree/batching';
import { memoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';

// Multiple package installations required
```

**After (consolidated in core):**

```typescript
import { createSignalTree, batching, memoization, withDevtools } from '@signaltree/core';

// Single package provides everything
```

##### Deprecated Packages

The following packages are now **deprecated** and will no longer receive updates:

- `@signaltree/batching` → Use `batching` from `@signaltree/core`
- `@signaltree/memoization` → Use `memoization` from `@signaltree/core`
- `@signaltree/devtools` → Use `withDevtools` from `@signaltree/core`
- `@signaltree/entities` → Use entity helpers from `@signaltree/core`
- `@signaltree/middleware` → Removed in v5; use entity hooks/enhancers
- `@signaltree/presets` → Use preset functions from `@signaltree/core`
- `@signaltree/time-travel` → Use `withTimeTravel` from `@signaltree/core`

##### Publishing Changes

- **Publish Script Updated**: `scripts/publish-all.sh` now only publishes `@signaltree/core` and `@signaltree/ng-forms`
- **Version Synchronization**: All features now share the same version number
- **Simplified Maintenance**: Single package to maintain instead of 8+ separate packages

### Published Packages

Consolidated packages published to v4.0.0:

- @signaltree/core@4.0.0 ⭐ (includes all enhancers: batching, memoization, devtools, entities, middleware, presets, time-travel)
- @signaltree/ng-forms@4.0.0 (Angular forms integration)

### Bundle Size Improvements

- **16.2% reduction** in total bundle size when using multiple enhancers
- **Eliminated duplication** when importing multiple enhancers from separate packages
- **Better tree-shaking** with consolidated exports

## [3.1.0] - 2025-11-02

### Added - October 10, 2025

#### Package Consolidation: All Enhancers Now Available from Core

**Note**: This release was initially published as 3.1.0 but has been moved to 3.2.0 due to npm version conflicts. The consolidation changes are identical.

### Added

#### Memoization Presets (@signaltree/memoization)

Added optimized preset configurations for common use cases, ensuring benchmark fairness and transparency:

- `selectorMemoization()` - Fast selector caching (reference equality, 10 entries)
- `computedMemoization()` - Balanced computed properties (shallow equality, 100 entries)
- `withDeepStateMemoization()` - Complex nested state (deep equality, 50 entries, LRU)
- `withHighFrequencyMemoization()` - High-frequency operations (shallow equality, 500 entries, LRU)

**Philosophy**: "Benchmark what you ship, ship what you benchmark" - All performance optimizations used in benchmarks are now publicly available.

#### UI Documentation

Added comprehensive memoization presets documentation to benchmark interface:

- Info card explaining preset configurations
- Code examples for users to replicate benchmark performance
- Performance characteristics for each preset
- Bundle impact and optimization details

### Changed

#### Performance Optimization (@signaltree/memoization)

- **Optimized `shallowEqual()` algorithm**: Replaced `Object.keys()` allocation with `for...in` iteration
  - 15-25% faster shallow equality checks
  - Zero allocations per comparison
  - Improved cache hit performance

#### Benchmark Updates

- Updated SignalTree benchmarks to use public preset functions
- `runSelectorBenchmark()` now uses `selectorMemoization()`
- `runComputedBenchmark()` now uses `computedMemoization()`
- Ensures complete transparency and fairness in performance comparisons

### Published Packages

All packages synchronized to v3.0.2:

- @signaltree/core@3.0.2
- @signaltree/batching@3.0.2
- @signaltree/memoization@3.0.2 ⭐ (includes optimizations and presets)
- @signaltree/middleware@3.0.2
- @signaltree/entities@3.0.2
- @signaltree/devtools@3.0.2
- @signaltree/time-travel@3.0.2
- @signaltree/presets@3.0.2
- @signaltree/ng-forms@3.0.2

### Documentation

- Updated `@signaltree/memoization` README with preset documentation
- Added "What's New in v3.0.2" section to memoization docs
- Updated main README with preset examples and v3.0.2 highlights
- Added performance characteristics table for presets

## [3.1.0] - 2025-11-02

### Added - October 10, 2025

#### Package Consolidation: All Enhancers Now Available from Core

**Major Architecture Change**: All SignalTree enhancers have been consolidated into the `@signaltree/core` package for simplified distribution and better tree-shaking.

##### What Changed

- **Consolidated Distribution**: All enhancers (batching, memoization, devtools, entities, middleware, presets, time-travel) are now exported directly from `@signaltree/core`
- **Simplified Imports**: No need to install separate packages - everything is available from the core package
- **Better Tree-Shaking**: Consolidated exports enable more efficient bundling
- **Single Version**: All features now version-locked together

##### Migration Guide

**Before (separate packages):**

```typescript
import { createSignalTree } from '@signaltree/core';
import { batching } from '@signaltree/batching';
import { memoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';

// Multiple package installations required
```

**After (consolidated in core):**

```typescript
import { createSignalTree, batching, memoization, withDevtools } from '@signaltree/core';

// Single package provides everything
```

##### Deprecated Packages

The following packages are now **deprecated** and will no longer receive updates:

- `@signaltree/batching` → Use `batching` from `@signaltree/core`
- `@signaltree/memoization` → Use `memoization` from `@signaltree/core`
- `@signaltree/devtools` → Use `withDevtools` from `@signaltree/core`
- `@signaltree/entities` → Use entity helpers from `@signaltree/core`
- `@signaltree/middleware` → Removed in v5; use entity hooks/enhancers
- `@signaltree/presets` → Use preset functions from `@signaltree/core`
- `@signaltree/time-travel` → Use `withTimeTravel` from `@signaltree/core`

##### Publishing Changes

- **Publish Script Updated**: `scripts/publish-all.sh` now only publishes `@signaltree/core` and `@signaltree/ng-forms`
- **Version Synchronization**: All features now share the same version number
- **Simplified Maintenance**: Single package to maintain instead of 8+ separate packages

### Published Packages

Consolidated packages published to v3.1.0:

- @signaltree/core@3.1.0 ⭐ (includes all enhancers: batching, memoization, devtools, entities, middleware, presets, time-travel)
- @signaltree/ng-forms@3.0.2 (Angular forms integration)

### Bundle Size Improvements

- **16.2% reduction** in total bundle size when using multiple enhancers
- **Eliminated duplication** when importing multiple enhancers from separate packages
- **Better tree-shaking** with consolidated exports

## [Unreleased]

### Added - October 7, 2025

#### Proper Middleware & Async Workflow Implementations

**Phase 2: Re-Implementation with Actual Library APIs**

After initially removing synthetic implementations, benchmarks have been **properly re-implemented** using actual library middleware/plugin and async APIs.

##### Middleware Benchmarks (3 methods)

- **Re-implemented middleware benchmarks** for NgRx Store, NgXs, and Akita using actual library APIs
- **NgRx Store**: Uses actual `@ngrx/store` meta-reducers with `ActionReducer<T>` wrapper pattern
- **NgXs**: Uses actual `@ngxs/store` NgxsPlugin interface with `handle()` method
- **Akita**: Uses actual `@datorama/akita` Store.akitaPreUpdate() override
- **Impact**: Now measures real middleware overhead using each library's native middleware/plugin architecture

##### Async Workflow Benchmarks (3 methods)

- **Re-implemented async workflow benchmarks** for NgRx Store and NgXs using actual async primitives
- **NgRx Store**: Uses actual `@ngrx/effects` with Actions, ofType, mergeMap, switchMap, race, takeUntil
- **NgXs**: Uses actual `@ngxs/store` Actions observable with ofActionDispatched, ofActionSuccessful
- **Akita/Elf**: Remain as lightweight simulations (intentional - no Effects/Actions systems)
- **Impact**: Now measures real async overhead for libraries with Effects/Actions architectures

**Files Modified**:

- `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngrx-benchmark.service.ts`
- `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngxs-benchmark.service.ts`
- `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/akita-benchmark.service.ts`

**Libraries with Proper Implementations**:

- ✅ **SignalTree**: Native middleware and async (already implemented)
- ✅ **NgRx Store**: Meta-reducers (middleware) + Effects (async) - 6/10 methods complete
- ✅ **NgXs**: Plugins (middleware) + Actions (async) - 6/10 methods complete
- ✅ **Akita**: akitaPreUpdate hooks (middleware) - 3/10 methods complete
- ⚠️ **Elf**: No comparable implementations (0/10)
- ❌ **NgRx SignalStore**: No middleware or async primitives (0/10)

#### Documentation

##### Added

- `ASYNC_WORKFLOW_IMPLEMENTATIONS.md` - Comprehensive documentation of async workflow implementations
- Detailed explanation of NgRx Effects vs NgXs Actions architectures
- Rationale for Akita/Elf lightweight simulations

##### Updated

- `MIDDLEWARE_CLEANUP.md` - Updated to reflect Phase 2 re-implementation
- `middleware-capabilities-analysis.md` - Shows 4 libraries with proper implementations
- `missing-implementations-complete.md` - Updated status: middleware and async both completed
- `CHANGELOG.md` - Comprehensive tracking of implementation phases

### Removed - October 7, 2025 (Phase 1)

#### Synthetic Middleware & Async Implementations

**Phase 1: Initial Removal**

- **Removed synthetic middleware benchmarks** that used trivial function calls instead of actual library APIs
- **Removed synthetic async benchmarks** that used generic `setTimeout`/`Promise.all` instead of actual Effects/Actions
- **Reason**: Synthetic implementations didn't represent actual library architectures and provided misleading performance data
- **Impact**: Temporarily showed only SignalTree with these capabilities (before Phase 2 re-implementation)

**Methodology Note**: Libraries have fundamentally different architectures:

**Middleware Systems**:

- **SignalTree**: Middleware removed in v5; use entity tap/intercept hooks
- **NgRx Store**: Meta-reducers - action interception wrapper pattern
- **NgXs**: Plugin system - action lifecycle hooks
- **Akita**: akitaPreUpdate - state transition hooks
- **Elf**: RxJS operators (different paradigm)
- **NgRx SignalStore**: withHooks - lifecycle only, NOT middleware

**Async Systems**:

- **SignalTree**: Native async capabilities
- **NgRx Store**: `@ngrx/effects` - reactive effect streams
- **NgXs**: Actions observable - action-based async
- **Akita**: Limited (queries/observables)
- **Elf**: Limited (RxJS effects)
- **NgRx SignalStore**: None

---

## Historical Note

This changelog was created on October 7, 2025. Prior changes were not formally tracked in a changelog format but can be found in git commit history.

## [4.0.9] - 2025-11-07

### Added

- Home page now highlights Time Travel debugging and splits feature cards by category using the Angular 18 block syntax helpers.
- Local type shims for cross-package builds (`packages/enterprise/src/types/signaltree-core.d.ts`, `packages/ng-forms/src/types/signaltree-core.d.ts`) so enterprise and ng-forms can compile against the consolidated core sources.

### Changed

- Converted the remaining demo templates to Angular 18 block syntax, including the benchmark orchestrator, entities demo, comparison components, metrics dashboard, and shared navigation.
- Reworked the demo home template to use `@if`/`@for` blocks with guard clauses, added async/time travel sections, and refreshed copy to match the v4 package lineup.
- Updated Sass usage in the fundamentals examples to replace deprecated `darken()` helpers with `color.adjust()` and imported `sass:color` where needed.
- Adjusted Jest and Nx TypeScript configs to resolve `@signaltree/*` imports from source (`apps/demo/jest.config.ts`, enterprise/ng-forms tsconfigs) and declared workspace dev dependencies for local packages in `package.json`.

### Fixed

- Ensured `@signaltree/ng-forms` and `@signaltree/enterprise` builds succeed by referencing Angular core symbols explicitly and mapping core exports during compilation.
- Resolved demo unit tests failing to locate `@signaltree/core` by updating moduleNameMapper settings.
