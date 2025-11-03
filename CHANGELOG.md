# Changelog

All notable changes to SignalTree will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';

// Multiple package installations required
```

**After (consolidated in core):**

```typescript
import { createSignalTree, withBatching, withMemoization, withDevtools } from '@signaltree/core';

// Single package provides everything
```

##### Deprecated Packages

The following packages are now **deprecated** and will no longer receive updates:

- `@signaltree/batching` → Use `withBatching` from `@signaltree/core`
- `@signaltree/memoization` → Use `withMemoization` from `@signaltree/core`
- `@signaltree/devtools` → Use `withDevtools` from `@signaltree/core`
- `@signaltree/entities` → Use entity helpers from `@signaltree/core`
- `@signaltree/middleware` → Use `withMiddleware` from `@signaltree/core`
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

- `withSelectorMemoization()` - Fast selector caching (reference equality, 10 entries)
- `withComputedMemoization()` - Balanced computed properties (shallow equality, 100 entries)
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
- `runSelectorBenchmark()` now uses `withSelectorMemoization()`
- `runComputedBenchmark()` now uses `withComputedMemoization()`
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
import { withBatching } from '@signaltree/batching';
import { withMemoization } from '@signaltree/memoization';
import { withDevtools } from '@signaltree/devtools';

// Multiple package installations required
```

**After (consolidated in core):**

```typescript
import { createSignalTree, withBatching, withMemoization, withDevtools } from '@signaltree/core';

// Single package provides everything
```

##### Deprecated Packages

The following packages are now **deprecated** and will no longer receive updates:

- `@signaltree/batching` → Use `withBatching` from `@signaltree/core`
- `@signaltree/memoization` → Use `withMemoization` from `@signaltree/core`
- `@signaltree/devtools` → Use `withDevtools` from `@signaltree/core`
- `@signaltree/entities` → Use entity helpers from `@signaltree/core`
- `@signaltree/middleware` → Use `withMiddleware` from `@signaltree/core`
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

- **SignalTree**: `withMiddleware()` - before/after state update interception
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
