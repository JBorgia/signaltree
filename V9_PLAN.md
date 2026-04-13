# SignalTree v9 — Comprehensive Improvement Plan

**Current version**: 9.0.0
**Target version**: 9.0.0
**Breaking changes**: Allowed (documented below)
**Guiding principle**: Sharpen the ethos. State is data. Use Angular directly. Ship less, mean more.

---

## Table of Contents

1. [Philosophy Realignment](#1-philosophy-realignment)
2. [API Surface Reduction (Breaking)](#2-api-surface-reduction-breaking)
3. [Production Hygiene](#3-production-hygiene)
4. [Subpath Exports & Bundle Architecture](#4-subpath-exports--bundle-architecture)
5. [Memoization Enhancer Overhaul](#5-memoization-enhancer-overhaul)
6. [Destroy & Lifecycle](#6-destroy--lifecycle)
7. [Benchmarks & Honesty](#7-benchmarks--honesty)
8. [Testing Gaps](#8-testing-gaps)
9. [Documentation Rewrite](#9-documentation-rewrite)
10. [CI/CD Hardening](#10-cicd-hardening)
11. [Enhancer Composition Safety](#11-enhancer-composition-safety)
12. [Enterprise Reassessment](#12-enterprise-reassessment)
13. [README Rewrite](#13-readme-rewrite)
14. [Breaking Changes Summary](#14-breaking-changes-summary)
15. [Checklist](#15-checklist)

---

## 1. Philosophy Realignment

### Problem

The v7 ethos says "Use Angular directly" and "SignalTree only provides markers for what Angular doesn't have." But the API surface tells a different story — 150+ exports, 8 memoization variants, 3 devtools variants, deprecated entities that still ship, async helpers that duplicate Angular patterns, and marketing copy that leads with performance claims over the actual value proposition.

### Goal

v9 should be the release where the API matches the ethos. Every export should pass the test: _"Does this provide something Angular doesn't have, or does it make the reactive-JSON pattern possible?"_

### Actions

- [ ] Audit every export against the ethos test (see Section 2)
- [ ] Remove exports that duplicate Angular functionality
- [ ] Move niche exports to subpath imports
- [ ] Rewrite the tagline messaging to lead with DX, not performance

---

## 2. API Surface Reduction (Breaking)

### Exports to Remove

These exports duplicate Angular functionality, are deprecated, or are internal:

| Export                      | Reason for Removal                            | Migration                             |
| --------------------------- | --------------------------------------------- | ------------------------------------- |
| `entities()`                | Deprecated v7, already throws                 | Remove entirely                       |
| `enableEntities()`          | Deprecated v7, already throws                 | Remove entirely                       |
| `highPerformanceEntities()` | Deprecated v7, already throws                 | Remove entirely                       |
| `createAsyncOperation()`    | Duplicates Angular `resource()`               | Use `resource()` directly             |
| `trackAsync()`              | Duplicates Angular `resource()`               | Use `resource()` directly             |
| `enableDevTools()`          | Alias of `devTools()`                         | Use `devTools()`                      |
| `enableSerialization()`     | Alias of `serialization()`                    | Use `serialization()`                 |
| `enableTimeTravel()`        | Alias of `timeTravel()`                       | Use `timeTravel()`                    |
| `fullDevTools()`            | Variant of `devTools()` — pass config instead | `devTools({ ...fullConfig })`         |
| `productionDevTools()`      | Variant of `devTools()` — pass config instead | `devTools({ production: true })`      |
| `batchingWithConfig`        | Alias of `batching()`                         | Use `batching()`                      |
| `applySerialization()`      | Manual application — enhancer handles this    | Use `.with(serialization())`          |
| `applyPersistence()`        | Manual application — enhancer handles this    | Use `.with(persistence())`            |
| `highPerformanceBatching()` | Pre-config variant                            | `batching({ highPerformance: true })` |

### Memoization Exports to Remove (see Section 5)

| Export                         | Reason         | Migration                                  |
| ------------------------------ | -------------- | ------------------------------------------ |
| `selectorMemoization()`        | Config variant | `memoization({ preset: 'selector' })`      |
| `computedMemoization()`        | Config variant | `memoization({ preset: 'computed' })`      |
| `deepStateMemoization()`       | Config variant | `memoization({ preset: 'deep' })`          |
| `highFrequencyMemoization()`   | Config variant | `memoization({ preset: 'highFrequency' })` |
| `highPerformanceMemoization()` | Config variant | `memoization({ preset: 'performance' })`   |
| `lightweightMemoization()`     | Config variant | `memoization({ preset: 'lightweight' })`   |
| `shallowMemoization()`         | Config variant | `memoization({ preset: 'shallow' })`       |

### Exports to Move to Subpath Imports

| Export                                | New Import Path                 | Reason                                   |
| ------------------------------------- | ------------------------------- | ---------------------------------------- |
| `SecurityValidator`                   | `@signaltree/core/security`     | Most apps don't validate untrusted input |
| `SecurityPresets`                     | `@signaltree/core/security`     | Same                                     |
| `SecurityEvent` / `SecurityEventType` | `@signaltree/core/security`     | Same                                     |
| `SecurityValidatorConfig`             | `@signaltree/core/security`     | Same                                     |
| `createEditSession()`                 | `@signaltree/core/edit-session` | Niche feature                            |
| `EditSession<T>`                      | `@signaltree/core/edit-session` | Same                                     |
| `UndoRedoHistory<T>`                  | `@signaltree/core/edit-session` | Same                                     |
| `TREE_PRESETS`                        | `@signaltree/core/presets`      | Convenience, not core                    |
| `createPresetConfig()`                | `@signaltree/core/presets`      | Same                                     |
| `validatePreset()`                    | `@signaltree/core/presets`      | Same                                     |
| `getAvailablePresets()`               | `@signaltree/core/presets`      | Same                                     |
| `combinePresets()`                    | `@signaltree/core/presets`      | Same                                     |
| `createDevTree()`                     | `@signaltree/core/presets`      | Same                                     |
| `createProdTree()`                    | `@signaltree/core/presets`      | Same                                     |
| `createMinimalTree()`                 | `@signaltree/core/presets`      | Same                                     |
| `createStorageAdapter()`              | `@signaltree/core/storage`      | Niche                                    |
| `createIndexedDBAdapter()`            | `@signaltree/core/storage`      | Niche                                    |

### Exports to Keep in Main Barrel

Core factory and types:

- `signalTree`, `ISignalTree`, `TreeNode`, `TreeConfig`, `NodeAccessor`, `CallableWritableSignal`, `AccessibleNode`, `Primitive`

Markers (things Angular doesn't have):

- `entityMap`, `status`, `stored`, `form` (and their types/guards)

Enhancers (one function each):

- `batching`, `memoization`, `timeTravel`, `devTools`, `serialization`, `persistence`

Derived state:

- `derivedFrom`, `externalDerived`, and associated types

Essential utilities:

- `equal`, `deepEqual`, `isNodeAccessor`, `isAnySignal`, `composeEnhancers`, `createEnhancer`

**Target**: Reduce from ~150 exports to ~50-60.

---

## 3. Production Hygiene

### 3a. Strip console statements from production builds

**Problem**: 20+ `console.warn()` calls survive production builds. The `ngDevMode` guard exists but isn't consistently applied, and the build doesn't drop console calls.

**Actions**:

- [ ] Audit every `console.warn`, `console.log`, `console.error` in `packages/core/src/`
- [ ] Wrap ALL dev-only console calls in `if (typeof ngDevMode === 'undefined' || ngDevMode)` consistently
- [ ] Add `drop: ['console', 'debugger']` to the Rollup production build config (per build-pipeline.instructions.md)
- [ ] Alternatively, introduce `__DEV__` compile-time constant with `define: { __DEV__: 'false' }` in prod builds
- [ ] Verify with a post-build grep: `grep -r "console\." dist/packages/core/` should return zero results

### 3b. Consistent ngDevMode usage

**Problem**: Some code paths check `ngDevMode`, others check `process.env.NODE_ENV`, others don't check at all.

**Actions**:

- [ ] Standardize on a single `isDev()` utility function in `constants.ts`
- [ ] Replace all inline checks with the utility
- [ ] Ensure the dev proxy (`dev-proxy.ts`) is completely eliminated in prod builds
- [ ] Add a CI step that verifies dev-only code doesn't appear in `dist/`

---

## 4. Subpath Exports & Bundle Architecture

### Problem

Single barrel export means consumers who import `signalTree` also pull the bundler's attention to security, presets, edit sessions, and storage adapters. While tree-shaking can eliminate unused code, subpath exports make guarantees explicit.

### Actions

- [ ] Add subpath exports to `packages/core/package.json`:

```json
{
  "exports": {
    ".": {
      "types": "./src/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./security": {
      "types": "./src/security.d.ts",
      "import": "./dist/security.js"
    },
    "./presets": {
      "types": "./src/presets.d.ts",
      "import": "./dist/presets.js"
    },
    "./storage": {
      "types": "./src/storage.d.ts",
      "import": "./dist/storage.js"
    },
    "./edit-session": {
      "types": "./src/edit-session.d.ts",
      "import": "./dist/edit-session.js"
    },
    "./package.json": "./package.json"
  }
}
```

- [ ] Create the corresponding entry point files (`security.ts`, `presets.ts`, etc.)
- [ ] Update Rollup config to generate these as separate entry points (per rollup-entry-points.instructions.md)
- [ ] Update the main barrel to NOT re-export subpath content
- [ ] Add a migration note for users importing from the main barrel

---

## 5. Memoization Enhancer Overhaul

### Problem

This is the biggest ethos misalignment in the library. Angular's `computed()` already memoizes by reference equality. The memoization enhancer adds a second cache layer that is:

- Redundant for `computed()` signals (Angular handles this)
- 8 variant functions that are just config presets
- Confusing for users who don't understand when it helps vs when it's overhead

### v9 Approach

**Keep memoization, but be honest about scope.** It helps in exactly two cases:

1. **Deep/shallow equality** — when reference equality misses semantically-equal objects
2. **Explicit cache keys** — when you want to cache expensive function results outside of Angular's signal graph

### Actions

- [ ] Remove the 7 variant functions (see Section 2) — replace with `memoization({ preset: '...' })`
- [ ] Remove `memoize()`, `memoizeShallow()`, `memoizeReference()` standalone functions — these aren't tree-related. If users want standalone memoization, they can use `lodash.memoize` or similar
- [ ] Remove `clearAllCaches()` global function — caches should be per-tree, cleared via `tree.clearCache()`
- [ ] Remove `getGlobalCacheStats()` — diagnostics should be per-tree via `devTools()`
- [ ] Add clear documentation: "When to use memoization() vs Angular's computed()"
- [ ] Consider renaming to `caching()` to distinguish from Angular's built-in signal memoization

### What Stays

- `memoization(config?)` — the enhancer itself
- Per-tree `.clearCache()` and `.getCacheStats()` methods added by the enhancer
- Config presets accessed via `memoization({ preset: 'shallow' })` etc.

---

## 6. Destroy & Lifecycle

### Problem

`destroy()` only cleans up the `SignalMemoryManager` (for lazy trees). It doesn't:

- Clean up enhancer state (batching intervals, memoization caches, devtools connections)
- Remove path notifier listeners
- Null out signal references for GC

Enhancers can override `destroy` (it's writable), but there's no standardized cleanup contract.

### Actions

- [ ] Define an `EnhancerCleanup` contract: enhancers that need cleanup must register a dispose function
- [ ] `destroy()` iterates all registered cleanup functions in reverse order
- [ ] Test that after `destroy()`, the tree and all enhancer state is eligible for GC
- [ ] Add `tree.destroyed` readonly boolean signal so components can react to disposal
- [ ] Document lifecycle best practices: when to call `destroy()`, what happens if you don't

---

## 7. Benchmarks & Honesty

### Problem

The README claims "85% memory reduction", "50% bundle size reduction", and "zero-cost abstractions" without methodology. The benchmark suite includes a "Not Supported" scenario that still appears in reports. The frequency weighting claims "40,000+ developer surveys" but the methodology isn't verifiable.

### Actions

- [ ] **Remove unsubstantiated claims** from README:
  - "85% memory reduction" — reduction compared to what? Under what conditions?
  - "50% bundle size reduction" — vs what baseline?
  - "zero-cost abstractions" — NodeAccessor adds function call overhead. It's _minimal_, not zero
- [ ] **Remove or reframe "Rapid Sequential Updates"** benchmark scenario
- [ ] **Add honest benchmark**: `signalTree()` vs hand-written `signal()` for the same state shape — show the actual overhead
- [ ] **Add benchmark**: tree with enhancers vs tree without — quantify each enhancer's cost
- [ ] **Reframe README performance section**: Lead with "How it works" (recursive signals, NodeAccessor), not "How fast it is"
- [ ] **Soften frequency weighting claims**: Say "informed by industry surveys" not "40,000+ developer surveys" unless you can cite the specific surveys
- [ ] **Add a performance methodology doc** that explains exactly how benchmarks are run, what the baseline is, and how to reproduce

---

## 8. Testing Gaps

### 8a. Memory stress tests

- [ ] Create `packages/core/src/lib/memory/memory-stress.spec.ts`
- [ ] Test: create tree with 10K+ nodes, perform 1000 rapid updates, measure heap growth
- [ ] Test: create and destroy 100 trees with enhancers, verify no retention
- [ ] Test: lazy tree with large state, access subset of paths, verify unused signals aren't created

### 8b. Enhancer cleanup tests

- [ ] Test: `.with(batching())` + `.destroy()` → no pending microtasks
- [ ] Test: `.with(memoization())` + `.destroy()` → caches cleared, no WeakRef leaks
- [ ] Test: `.with(devTools())` + `.destroy()` → DevTools disconnected, no listeners
- [ ] Test: `.with(timeTravel())` + `.destroy()` → history cleared, no snapshots retained
- [ ] Test: `.with(serialization())` + `.destroy()` → storage adapters closed

### 8c. Enhancer composition edge cases

- [ ] Test: applying same enhancer twice throws or warns (e.g., `.with(batching()).with(batching())`)
- [ ] Test: enhancer order dependencies are enforced
- [ ] Test: `.derived()` + `.with()` composition preserves computed identity

### 8d. Schema-level type tests

- [ ] Create `packages/core/src/lib/types.spec-d.ts` (tsd or vitest typecheck)
- [ ] Verify `TreeNode<{ a: number }>` produces correct signal types
- [ ] Verify `entityMap<T, K>()` type resolves to `EntitySignal<T, K>`
- [ ] Verify incompatible trees can't be assigned to each other
- [ ] Verify `NodeAccessor` call signatures are correctly typed

---

## 9. Documentation Rewrite

### 9a. Architecture guide (expand)

The architecture guide is the best document in the project. Expand it:

- [ ] Add "When to use which enhancer" decision flowchart
- [ ] Add "Common anti-patterns" section with examples
- [ ] Add "Scaling from feature to enterprise" progression

### 9b. Performance patterns guide

- [ ] Rewrite `docs/performance/performance-patterns.md` with actionable patterns
- [ ] Include: batching best practices, when memoization helps, entityMap query patterns
- [ ] Include: "Don't do this" anti-patterns (e.g., the 10M-iteration memoization demo)

### 9c. Migration guide: v8 → v9

- [ ] Document every breaking change with before/after code
- [ ] Provide a codemod or find-and-replace guide for removed exports
- [ ] Group changes by category: import path changes, removed APIs, renamed APIs

### 9d. Migration guide: NgRx Signals → SignalTree

- [ ] Side-by-side comparison of equivalent patterns
- [ ] What maps 1:1, what doesn't, what to watch out for

### 9e. API reference cleanup

- [ ] Remove all "alias" documentation — if the alias is gone, the docs for it are gone
- [ ] Ensure every remaining export has a one-liner description and usage example

---

## 10. CI/CD Hardening

- [ ] **Bundle size budget**: Add CI step that fails if `@signaltree/core` dist exceeds 26KB gzipped (current: 25.63KB)
- [ ] **Dev-code leak check**: CI step greps `dist/` for `console.warn`, `console.log`, `ngDevMode` — fails if found
- [ ] **Export count check**: CI step counts exports from `index.ts` — fails if exceeding budget (target: 60)
- [ ] **Publish provenance**: Add `--provenance` flag to npm publish for supply chain security
- [ ] **Tree-shaking verification**: CI step that imports `signalTree` only and checks final bundle doesn't include enhancer code

---

## 11. Enhancer Composition Safety

### Problem

Nothing prevents `.with(batching()).with(batching())` — same enhancer applied twice. No runtime check for conflicting enhancers.

### Actions

- [ ] Each enhancer sets a symbol on the tree when applied (e.g., `Symbol.for('SignalTree:batching')`)
- [ ] `.with()` checks for the symbol before applying — throws in dev mode, warns in prod
- [ ] Verify enhancer dependency ordering: if enhancer B `requires` enhancer A, throw if A not present
- [ ] Document the composition contract for third-party enhancer authors

---

## 12. Enterprise Reassessment

### Problem

Enterprise provides `updateOptimized()` (diff-based updates), path indexing, and thread pools. The diff-based update is the feature most users would want, but it's gated behind a separate package.

### v9 Decision

- [ ] **Keep enterprise as a separate package** — the thread pool and scheduler are genuinely niche
- [ ] **Consider moving `updateOptimized()` to core** — but only if it doesn't increase core bundle by >2KB
- [ ] If not moved, add clear documentation on when to reach for enterprise vs core
- [ ] Evaluate: is the enterprise package used by anyone besides Cartula? If not, consider deprecating and moving useful parts to core

---

## 13. README Rewrite

### Current Problem

The README reads like a pitch deck. It leads with performance claims, has multiple "What's New" sections that push older content down, and buries the actual value proposition (reactive JSON, dot-notation, invisible reactivity).

### v9 README Structure

```
1. One-liner: "Reactive JSON for Angular"
2. 3-line code example showing signalTree({...}) → $.path.to.value()
3. Install: npm install @signaltree/core
4. Quick Start (10 lines of real code)
5. Core Concepts (state is data, dot-notation, markers)
6. Enhancers (table: name, one-line description)
7. Comparison with alternatives (honest table)
8. Links: Docs, Architecture Guide, API Reference, Changelog
```

### Actions

- [ ] Remove all "What's New" sections — that's what CHANGELOG.md is for
- [ ] Remove or move performance comparison tables — they belong in docs/performance/
- [ ] Remove "Technical details behind bundle size reductions" from README — it's docs material
- [ ] Remove "Production-ready enhancements" checklist from README — it's defensive marketing
- [ ] Lead with the mental model, not the metrics
- [ ] Keep the README under 200 lines

---

## 14. Breaking Changes Summary

For the v8 → v9 migration guide:

| Change                                                                        | Type        | Migration                                              |
| ----------------------------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| Removed `entities()`, `enableEntities()`, `highPerformanceEntities()`         | Removal     | Already throws in v8. Remove import                    |
| Removed `enableDevTools()`, `fullDevTools()`, `productionDevTools()`          | Removal     | Use `devTools(config)`                                 |
| Removed `enableSerialization()`, `applySerialization()`, `applyPersistence()` | Removal     | Use `.with(serialization())` or `.with(persistence())` |
| Removed `enableTimeTravel()`                                                  | Removal     | Use `timeTravel()`                                     |
| Removed `batchingWithConfig`, `highPerformanceBatching()`                     | Removal     | Use `batching(config)`                                 |
| Removed `createAsyncOperation()`, `trackAsync()`                              | Removal     | Use Angular `resource()`                               |
| Removed 7 memoization variants                                                | Removal     | Use `memoization({ preset: '...' })`                   |
| Removed `memoize()`, `memoizeShallow()`, `memoizeReference()`                 | Removal     | Use standalone memoization library                     |
| Removed `clearAllCaches()`, `getGlobalCacheStats()`                           | Removal     | Use per-tree `.clearCache()` / `.getCacheStats()`      |
| `SecurityValidator` moved to `@signaltree/core/security`                      | Import path | Update import                                          |
| Presets moved to `@signaltree/core/presets`                                   | Import path | Update import                                          |
| Storage adapters moved to `@signaltree/core/storage`                          | Import path | Update import                                          |
| Edit session moved to `@signaltree/core/edit-session`                         | Import path | Update import                                          |
| `destroy()` now calls all enhancer cleanup functions                          | Behavior    | Should be transparent; test cleanup                    |
| Duplicate enhancer application throws in dev mode                             | Behavior    | Remove duplicate `.with()` calls                       |

---

## 15. Checklist

### Phase 1: API Cleanup (Breaking Changes)

- [x] Remove deprecated `entities()` exports (3 functions)
- [x] Remove all alias exports (`enableDevTools`, `enableSerialization`, `enableTimeTravel`, `batchingWithConfig`, `highPerformanceBatching`)
- [x] Remove async helpers (`createAsyncOperation`, `trackAsync`)
- [x] Remove memoization variants (7 functions)
- [x] Remove standalone memoize functions (3 functions)
- [x] Remove global memoization utilities (`clearAllCaches`, `getGlobalCacheStats`)
- [x] Remove devtools variants (`fullDevTools`, `productionDevTools`)
- [x] Remove manual application functions (`applySerialization`, `applyPersistence`)
- [x] Verify all tests still pass after removals
- [x] Update internal usage if any of these were used in the demo app or tests

### Phase 2: Subpath Exports

- [x] Create `packages/core/src/security.ts` entry point
- [x] Create `packages/core/src/presets.ts` entry point
- [x] Create `packages/core/src/storage.ts` entry point
- [x] Create `packages/core/src/edit-session.ts` entry point
- [x] Update `packages/core/package.json` exports field
- [x] Update Rollup config for multiple entry points
- [x] Remove moved exports from main barrel
- [x] Verify tree-shaking works with subpath imports

### Phase 3: Production Hygiene

- [x] Audit all console.\* calls in packages/core/src/
- [x] Wrap all dev-only console calls in ngDevMode guard (already guarded)
- [~] Add `drop: ['console', 'debugger']` to Rollup production config (skipped: console calls are already ngDevMode-guarded; stripping at library level would remove legitimate error reporting)
- [x] Standardize on single `isDev()` utility
- [x] Verify dev-proxy.ts is eliminated in prod builds
- [x] Add CI check: grep dist/ for console statements

### Phase 4: Lifecycle & Cleanup

- [x] Define `EnhancerCleanup` contract
- [x] Implement cleanup registration in `.with()`
- [x] Update `destroy()` to call all registered cleanup functions
- [x] Add `tree.destroyed` readonly signal
- [x] Implement cleanup in batching enhancer
- [x] Implement cleanup in memoization enhancer
- [x] Implement cleanup in devtools enhancer
- [x] Implement cleanup in timeTravel enhancer
- [x] Implement cleanup in serialization/persistence enhancer

### Phase 5: Enhancer Safety

- [x] Add duplicate-enhancer detection (symbol-based)
- [x] Add dependency validation in `.with()`
- [x] Test: same enhancer twice throws
- [x] Test: missing dependency throws
- [x] Document enhancer contract for third-party authors

### Phase 6: Testing

- [x] Memory stress tests (10K+ nodes)
- [x] Rapid create/destroy cycle tests (100 trees)
- [x] Enhancer cleanup tests (each enhancer)
- [x] Schema-level type tests (vitest expectTypeOf)
- [x] Duplicate enhancer tests
- [x] Lazy tree threshold behavior tests

### Phase 7: Benchmarks & Honesty

- [x] Remove "Rapid Sequential Updates" scenario or reframe (already reframed with disclaimers)
- [x] Remove unsubstantiated claims from README (README rewritten)
- [x] Add honest benchmark: signalTree vs raw signal() overhead
- [x] Add benchmark: tree + enhancers vs tree without
- [x] Quantify devTools overhead when disabled
- [x] Write performance methodology doc

### Phase 8: Documentation

- [x] README rewrite (under 200 lines, lead with mental model)
- [x] v8 → v9 migration guide with before/after code
- [x] Expand architecture guide (decision flowchart, anti-patterns)
- [x] Rewrite performance patterns guide
- [x] Add "When to use memoization" doc (included in performance patterns guide)
- [ ] NgRx Signals migration guide (deferred to post-release)

### Phase 9: CI/CD

- [x] Bundle size budget in CI (v9-budget-checks.js)
- [x] Dev-code leak detection in CI (v9-budget-checks.js)
- [x] Export count budget in CI (39 value exports under 60 budget)
- [x] Publish provenance (`--provenance`)
- [x] Tree-shaking verification test

### Phase 10: Final Validation

- [x] All tests pass
- [x] Demo app builds
- [x] `npm pack --dry-run` shows clean dist/
- [x] Tree-shaking test passes
- [x] Bundle size within budget
- [x] All tests pass
- [x] CHANGELOG.md updated
- [x] Migration guide complete
- [ ] Tag v9.0.0
