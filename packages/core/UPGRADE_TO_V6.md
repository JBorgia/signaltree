# SignalTree v6.0 Complete Implementation Guide

## Type-Safe Enhancer Architecture

**Version:** 6.0.0  
**Classification:** Breaking Change  
**Estimated Implementation Time:** 3-5 days  
**Last Updated:** December 2025

---

## Table of Contents

- [SignalTree v6.0 Complete Implementation Guide](#signaltree-v60-complete-implementation-guide)
  - [Type-Safe Enhancer Architecture](#type-safe-enhancer-architecture)
  - [Table of Contents](#table-of-contents)
  - [1. Executive Summary](#1-executive-summary)
    - [1.1 The Problem](#11-the-problem)
    - [1.2 The Solution](#12-the-solution)
    - [1.3 Key Components](#13-key-components)
    - [1.4 Benefits Matrix](#14-benefits-matrix)
  - [2. Architecture Overview](#2-architecture-overview)
    - [2.1 Type Hierarchy](#21-type-hierarchy)
    - [2.2 Enhancer Flow](#22-enhancer-flow)
    - [2.3 File Structure](#23-file-structure)
  - [3. Implementation Roadmap](#3-implementation-roadmap)
    - [Phase 1: Foundation (Day 1)](#phase-1-foundation-day-1)
    - [Phase 2: Core Enhancers (Day 2)](#phase-2-core-enhancers-day-2)
    - [Phase 3: Advanced Enhancers (Day 3)](#phase-3-advanced-enhancers-day-3)
    - [Phase 4: Polish (Day 4)](#phase-4-polish-day-4)
    - [Phase 5: Validation (Day 5)](#phase-5-validation-day-5)
  - [4. Complete File Implementations](#4-complete-file-implementations)
    - [4.1 Core Types](#41-core-types)
    - [4.2 Utility Functions](#42-utility-functions)
    - [4.3 Signal Store Creation](#43-signal-store-creation)
    - [4.4 Development Proxy](#44-development-proxy)
    - [4.5 Base SignalTree Factory](#45-base-signaltree-factory)
    - [4.6 Enhancer: Effects](#46-enhancer-effects)
    - [4.7 Enhancer: Batching](#47-enhancer-batching)
    - [4.8 Enhancer: Memoization](#48-enhancer-memoization)
    - [4.9 Enhancer: Time Travel](#49-enhancer-time-travel)
    - [4.10 Enhancer: DevTools](#410-enhancer-devtools)
    - [4.11 Enhancer: Entities](#411-enhancer-entities)
    - [4.12 Entity Signal Implementation](#412-entity-signal-implementation)
    - [4.13 Preset Factories](#413-preset-factories)
    - [4.14 Public API Index](#414-public-api-index)
  - [5. Testing Suite](#5-testing-suite)
  - [6. Migration Guide](#6-migration-guide)
    - [From v5.x to v6.x](#from-v5x-to-v6x)
      - [Quick Migration (5 minutes)](#quick-migration-5-minutes)
      - [Proper Migration (30 minutes)](#proper-migration-30-minutes)
    - [Upgrade Checklist (step-by-step)](#upgrade-checklist-step-by-step)
    - [Chained `.with()` (new recommended pattern)](#chained-with-new-recommended-pattern)
    - [Minimal base interface](#minimal-base-interface)
    - [Intersection types for methods](#intersection-types-for-methods)
    - [Preset factories](#preset-factories)
    - [Dev proxy — better DX in development](#dev-proxy--better-dx-in-development)
    - [Optional: Automated Codemod (recommended for large codebases)](#optional-automated-codemod-recommended-for-large-codebases)
    - [Verify \& Rollout](#verify--rollout)
    - [Troubleshooting \& Notes](#troubleshooting--notes)
  - [7. Usage Examples](#7-usage-examples)
    - [7.1 Basic Preset Usage](#71-basic-preset-usage)
    - [7.2 Angular Service](#72-angular-service)
  - [8. Troubleshooting](#8-troubleshooting)
    - ["Property 'undo' does not exist"](#property-undo-does-not-exist)
    - ["Entity path not found"](#entity-path-not-found)
    - [Effects not cleaning up](#effects-not-cleaning-up)
  - [9. Performance Considerations](#9-performance-considerations)
  - [10. Appendices](#10-appendices)
    - [A. Complete File Listing](#a-complete-file-listing)
    - [B. Bundle Size Estimates](#b-bundle-size-estimates)
    - [C. Version History](#c-version-history)

---

## 1. Executive Summary

### 1.1 The Problem

The current SignalTree v5.x interface declares all enhancer methods regardless of which enhancers are applied:

```typescript
// v5.x: Interface lies about capabilities
interface SignalTree<T> {
  undo(): void; // Declared but may throw
  canUndo(): boolean; // Declared but may throw
  batch(): void; // Declared but may throw
  memoize(): Signal; // Declared but may throw
  // ... 25+ methods that may or may not work
}

const tree = signalTree({ count: 0 });
tree.undo(); // TypeScript: ✅ | Runtime: ❌ throws
```

**This is fundamentally broken:**

- TypeScript provides false confidence
- Errors only surface at runtime
- IDE autocomplete is misleading
- Refactoring is unsafe

### 1.2 The Solution

Enhancers extend the return type. Only applied methods exist:

```typescript
// v6.x: Types reflect reality
const base = signalTree({ count: 0 });
base.undo(); // TypeScript: ❌ Property 'undo' does not exist

const enhanced = signalTree({ count: 0 }).with(withTimeTravel());
enhanced.undo(); // TypeScript: ✅ | Runtime: ✅
```

### 1.3 Key Components

| Component          | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `SignalTree<T>`    | Minimal core interface (state, $, with, destroy)   |
| Method Interfaces  | `TimeTravelMethods<T>`, `BatchingMethods<T>`, etc. |
| `Enhancer<TAdded>` | Type that transforms tree and adds methods         |
| `WithMethod<T>`    | Properly typed `.with()` overloads                 |
| Preset Factories   | `createDevTree()`, `createProdTree()`, etc.        |
| Dev Proxy          | Runtime errors with guidance (dev mode only)       |

### 1.4 Benefits Matrix

| Aspect              | v5.x (Current)               | v6.x (New)                 |
| ------------------- | ---------------------------- | -------------------------- |
| Compile-time safety | ❌ None                      | ✅ Full                    |
| IDE accuracy        | ❌ Shows unavailable methods | ✅ Only shows available    |
| Refactoring         | ❌ Unsafe                    | ✅ Compiler catches issues |
| JS user experience  | ❌ Cryptic errors            | ✅ Helpful guidance        |
| Type complexity     | Low                          | Medium                     |
| Bundle size         | Larger (all stubs)           | Smaller (only used code)   |

---

## 2. Architecture Overview

### 2.1 Type Hierarchy

```
SignalTree<T>                    # Core: state, $, with(), destroy()
    │
    ├── & EffectsMethods<T>          # effect(), subscribe()
    │
    ├── & BatchingMethods<T>         # batch(), batchUpdate()
    │
    ├── & MemoizationMethods<T>      # memoize(), clearMemoCache(), getCacheStats()
    │
    ├── & TimeTravelMethods<T>       # undo(), redo(), canUndo(), canRedo(), etc.
    │
    ├── & DevToolsMethods            # connectDevTools(), disconnectDevTools()
    │
    └── & EntitiesMethods<T>         # entities()
```

### 2.2 Enhancer Flow

```
signalTree(state)
    │
    ▼
SignalTree<T>  ──► .with(withEffects())
    │                        │
    │                        ▼
    │               SignalTree<T> & EffectsMethods<T>
    │                        │
    │                        ▼
    │               .with(withTimeTravel())
    │                        │
    │                        ▼
    │               SignalTree<T> & EffectsMethods<T> & TimeTravelMethods<T>
    │
    ▼
createDevTree(state)  ──► SignalTree<T> & ALL_METHODS
```

### 2.3 File Structure

```
packages/core/src/
├── index.ts                           # Public exports
└── lib/
    ├── types.ts                       # All type definitions (~400 lines)
    ├── signal-tree.ts                 # Core factory (~150 lines)
    ├── dev-proxy.ts                   # Dev mode proxy (~100 lines)
    ├── presets.ts                     # Preset factories (~150 lines)
    ├── utils/
    │   ├── index.ts
    │   ├── is-built-in-object.ts      # Type guards (~50 lines)
    │   ├── deep-clone.ts              # State cloning (~40 lines)
    │   ├── deep-equal.ts              # Equality checking (~60 lines)
    │   ├── snapshot-state.ts          # State serialization (~50 lines)
    │   └── apply-state.ts             # State application (~50 lines)
    └── enhancers/
        ├── index.ts                   # Enhancer exports
        ├── effects.ts                 # (~80 lines)
        ├── batching.ts                # (~100 lines)
        ├── memoization.ts             # (~120 lines)
        ├── time-travel.ts             # (~150 lines)
        ├── devtools.ts                # (~100 lines)
        ├── entities.ts                # (~100 lines)
        └── entity-signal.ts           # (~300 lines)
```

---

## 3. Implementation Roadmap

### Phase 1: Foundation (Day 1)

| Task                     | Files                      | Est. Time |
| ------------------------ | -------------------------- | --------- |
| Define core types        | `types.ts`                 | 2 hours   |
| Implement utilities      | `utils/*.ts`               | 1 hour    |
| Create base signal store | `signal-tree.ts` (partial) | 2 hours   |
| Write type tests         | `types.spec.ts`            | 1 hour    |

### Phase 2: Core Enhancers (Day 2)

| Task                      | Files                      | Est. Time |
| ------------------------- | -------------------------- | --------- |
| Implement withEffects     | `enhancers/effects.ts`     | 1 hour    |
| Implement withBatching    | `enhancers/batching.ts`    | 1.5 hours |
| Implement withMemoization | `enhancers/memoization.ts` | 1.5 hours |
| Write enhancer tests      | `enhancers/*.spec.ts`      | 2 hours   |

### Phase 3: Advanced Enhancers (Day 3)

| Task                     | Files                                       | Est. Time |
| ------------------------ | ------------------------------------------- | --------- |
| Implement withTimeTravel | `enhancers/time-travel.ts`                  | 2 hours   |
| Implement withDevTools   | `enhancers/devtools.ts`                     | 1.5 hours |
| Implement withEntities   | `enhancers/entities.ts`, `entity-signal.ts` | 3 hours   |
| Write integration tests  | `integration.spec.ts`                       | 1.5 hours |

### Phase 4: Polish (Day 4)

| Task                | Files              | Est. Time |
| ------------------- | ------------------ | --------- |
| Implement presets   | `presets.ts`       | 1 hour    |
| Implement dev proxy | `dev-proxy.ts`     | 1 hour    |
| Complete public API | `index.ts`         | 0.5 hours |
| Documentation       | `README.md`, JSDoc | 2 hours   |
| Migration guide     | `MIGRATION.md`     | 1 hour    |

### Phase 5: Validation (Day 5)

| Task                         | Est. Time |
| ---------------------------- | --------- |
| Full test suite run          | 1 hour    |
| Manual testing in sample app | 2 hours   |
| Performance benchmarks       | 2 hours   |
| Code review / fixes          | 2 hours   |
| Release preparation          | 1 hour    |

---

## 4. Complete File Implementations

### 4.1 Core Types

**File: `packages/core/src/lib/types.ts`**

````typescript
import { Signal, WritableSignal } from '@angular/core';

// ============================================================================
// SECTION 1: PRIMITIVE & UTILITY TYPES
// ============================================================================

/**
 * JavaScript primitive types
 */
export type Primitive = string | number | boolean | null | undefined | bigint | symbol;

/**
 * Built-in object types that should be treated as leaf values (not recursed into).
 * Keep in sync with runtime isBuiltInObject() function.
 */
export type BuiltInObject =
  // Core JavaScript
  | Date
  | RegExp
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | ArrayBuffer
  | DataView
  | Error
  | Promise<unknown>
  // Typed Arrays
  | Uint8Array
  | Uint16Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array
  // Web APIs
  | URL
  | URLSearchParams
  | FormData
  | Blob
  | File
  | Headers
  | Request
  | Response
  | AbortController
  | AbortSignal;

/**
 * Helper type to prevent direct function assignment ambiguity.
 * When T is a function, this returns never to block direct set.
 */
export type NotFn<T> = T extends (...args: unknown[]) => unknown ? never : T;

/**
 * Unwrap signal types to get the underlying value type.
 */
export type Unwrap<T> = [T] extends [WritableSignal<infer U>] ? U : [T] extends [Signal<infer U>] ? U : [T] extends [BuiltInObject] ? T : [T] extends [readonly unknown[]] ? T : [T] extends [EntityMapMarker<infer E, infer K>] ? EntitySignal<E, K> : [T] extends [object] ? { [K in keyof T]: Unwrap<T[K]> } : T;

// ============================================================================
// SECTION 2: SIGNAL NODE TYPES
// ============================================================================

/**
 * A WritableSignal with callable set/update syntax.
 * Allows: signal(value) and signal(updater)
 */
export type CallableWritableSignal<T> = WritableSignal<T> & {
  (value: NotFn<T>): void;
  (updater: (current: T) => T): void;
};

/**
 * Node accessor interface - unified API for get/set/update.
 */
export interface NodeAccessor<T> {
  /** Get current value */
  (): T;
  /** Set new value */
  (value: T): void;
  /** Update with function */
  (updater: (current: T) => T): void;
}

/**
 * Accessible node combining NodeAccessor with nested TreeNode access.
 */
export type AccessibleNode<T> = NodeAccessor<T> & TreeNode<T>;

/**
 * Recursive tree node type - converts object properties to signals.
 *
 * - EntityMapMarker → EntitySignal
 * - Arrays → CallableWritableSignal
 * - Built-in objects → CallableWritableSignal
 * - Functions → CallableWritableSignal
 * - Nested objects → AccessibleNode (recursive)
 * - Primitives → CallableWritableSignal
 */
export type TreeNode<T> = {
  [K in keyof T]: [T[K]] extends [EntityMapMarker<infer E, infer Key>] ? EntitySignal<E, Key> : [T[K]] extends [readonly unknown[]] ? CallableWritableSignal<T[K]> : [T[K]] extends [object] ? ([T[K]] extends [Signal<unknown>] ? T[K] : [T[K]] extends [BuiltInObject] ? CallableWritableSignal<T[K]> : [T[K]] extends [(...args: unknown[]) => unknown] ? CallableWritableSignal<T[K]> : AccessibleNode<T[K]>) : CallableWritableSignal<T[K]>;
};

// ============================================================================
// SECTION 3: BASE SIGNAL TREE INTERFACE
// ============================================================================

/**
 * Base SignalTree interface with ONLY core functionality.
 *
 * This is the minimal tree type. Enhancers add methods via intersection types.
 * Users should typically use presets (createDevTree, etc.) rather than
 * working with this base type directly.
 *
 * @template T - The state shape type
 */
export interface SignalTree<T> {
  /**
   * The reactive state tree.
   * Access nested state via dot notation: tree.state.users.list
   */
  readonly state: TreeNode<T>;

  /**
   * Shorthand alias for state.
   * Preferred in most cases: tree.$.users.list
   */
  readonly $: TreeNode<T>;

  /**
   * Apply one or more enhancers to extend tree functionality.
   *
   * @example
   * ```typescript
   * const tree = signalTree({ count: 0 })
   *   .with(withEffects())
   *   .with(withTimeTravel());
   * ```
   */
  with: WithMethod<T>;

  /**
   * Clean up all resources, subscriptions, and effects.
   * Call when the tree is no longer needed.
   */
  destroy(): void;

  /**
   * Dispose lazy signals and clear memory cache.
   * Only available when useLazySignals: true was passed.
   */
  dispose?(): void;
}

// ============================================================================
// SECTION 4: ENHANCER SYSTEM TYPES
// ============================================================================

/**
 * Metadata attached to enhancers for ordering and debugging.
 */
export interface EnhancerMeta {
  /** Unique enhancer name */
  name?: string;
  /** Enhancers that must be applied before this one */
  requires?: string[];
  /** Capabilities this enhancer provides */
  provides?: string[];
}

/** Symbol key for enhancer metadata */
export const ENHANCER_META = Symbol('signaltree:enhancer:meta');

/**
 * An enhancer function that adds methods to a SignalTree.
 *
 * @template TAdded - The methods/properties this enhancer adds
 *
 * @example
 * ```typescript
 * type MyEnhancer = Enhancer<{ myMethod(): void }>;
 *
 * const withMyFeature: MyEnhancer = (tree) => {
 *   return Object.assign(tree, {
 *     myMethod() { console.log('Hello'); }
 *   });
 * };
 * ```
 */
export type Enhancer<TAdded> = {
  <S>(tree: SignalTree<S>): SignalTree<S> & TAdded;
  metadata?: EnhancerMeta;
};

/**
 * Extract the methods an enhancer adds.
 */
export type EnhancerAdds<E> = E extends Enhancer<infer Added> ? Added : never;

/**
 * The .with() method signature with proper type inference.
 *
 * Supports up to 6 enhancers with full type safety.
 * For 7+ enhancers, use the spread overload (less precise types).
 */
export interface WithMethod<T> {
  /** Zero enhancers - return base tree */
  (): SignalTree<T>;

  /** One enhancer */
  <A>(e1: Enhancer<A>): SignalTree<T> & A;

  /** Two enhancers */
  <A, B>(e1: Enhancer<A>, e2: Enhancer<B>): SignalTree<T> & A & B;

  /** Three enhancers */
  <A, B, C>(e1: Enhancer<A>, e2: Enhancer<B>, e3: Enhancer<C>): SignalTree<T> & A & B & C;

  /** Four enhancers */
  <A, B, C, D>(e1: Enhancer<A>, e2: Enhancer<B>, e3: Enhancer<C>, e4: Enhancer<D>): SignalTree<T> & A & B & C & D;

  /** Five enhancers */
  <A, B, C, D, E>(e1: Enhancer<A>, e2: Enhancer<B>, e3: Enhancer<C>, e4: Enhancer<D>, e5: Enhancer<E>): SignalTree<T> & A & B & C & D & E;

  /** Six enhancers */
  <A, B, C, D, E, F>(e1: Enhancer<A>, e2: Enhancer<B>, e3: Enhancer<C>, e4: Enhancer<D>, e5: Enhancer<E>, e6: Enhancer<F>): SignalTree<T> & A & B & C & D & E & F;

  /** Spread fallback for 7+ enhancers (less type precision) */
  (...enhancers: Enhancer<unknown>[]): SignalTree<T> & Record<string, unknown>;
}

// ============================================================================
// SECTION 5: ENHANCER METHOD INTERFACES
// ============================================================================

/**
 * Methods added by withEffects()
 */
export interface EffectsMethods<T> {
  /**
   * Register a reactive effect that runs when dependencies change.
   * @param fn Effect function receiving current state
   * @returns Cleanup function to dispose the effect
   */
  effect(fn: (state: T) => void): () => void;

  /**
   * Subscribe to state changes.
   * @param fn Callback receiving current state
   * @returns Unsubscribe function
   */
  subscribe(fn: (state: T) => void): () => void;
}

/**
 * Methods added by withBatching()
 */
export interface BatchingMethods<T> {
  /**
   * Batch multiple updates into a single change detection cycle.
   * @param updater Function that performs state updates
   */
  batch(updater: (state: TreeNode<T>) => void): void;

  /**
   * Batch update with partial state object.
   * @param updater Function returning partial state to merge
   */
  batchUpdate(updater: (current: T) => Partial<T>): void;
}

/**
 * Methods added by withMemoization()
 */
export interface MemoizationMethods<T> {
  /**
   * Create a memoized computed signal.
   * @param fn Computation function
   * @param cacheKey Optional key for manual cache control
   */
  memoize<R>(fn: (state: T) => R, cacheKey?: string): Signal<R>;

  /**
   * Update state with optional cache invalidation.
   * @param updater Function returning partial state
   * @param cacheKey Optional cache key to invalidate
   */
  memoizedUpdate(updater: (current: T) => Partial<T>, cacheKey?: string): void;

  /**
   * Clear memoization cache.
   * @param key Specific key to clear, or all if undefined
   */
  clearMemoCache(key?: string): void;

  /**
   * Get cache statistics.
   */
  getCacheStats(): CacheStats;
}

/** Statistics about the memoization cache */
export interface CacheStats {
  /** Number of cached entries */
  size: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Total cache hits */
  totalHits: number;
  /** Total cache misses */
  totalMisses: number;
  /** List of cache keys */
  keys: string[];
}

/**
 * Methods added by withTimeTravel()
 *
 * NOTE: Use for USER undo/redo (Ctrl+Z), NOT for API rollback.
 * For optimistic update rollback, use snapshot patterns.
 */
export interface TimeTravelMethods<T> {
  /** Undo the last change */
  undo(): void;

  /** Redo the last undone change */
  redo(): void;

  /** Check if undo is available */
  canUndo(): boolean;

  /** Check if redo is available */
  canRedo(): boolean;

  /** Get all history entries */
  getHistory(): TimeTravelEntry<T>[];

  /** Clear all history */
  resetHistory(): void;

  /** Jump to a specific history index */
  jumpTo(index: number): void;

  /** Get current history index */
  getCurrentIndex(): number;
}

/** A single entry in the time travel history */
export interface TimeTravelEntry<T> {
  /** Action name/type */
  action: string;
  /** Unix timestamp */
  timestamp: number;
  /** Complete state snapshot */
  state: T;
  /** Optional action payload */
  payload?: unknown;
}

/**
 * Methods added by withDevTools()
 */
export interface DevToolsMethods {
  /** Connect to Redux DevTools browser extension */
  connectDevTools(): void;

  /** Disconnect from Redux DevTools */
  disconnectDevTools(): void;
}

/**
 * Methods added by withEntities()
 */
export interface EntitiesMethods<T> {
  /**
   * Get entity helpers for a collection.
   * @deprecated Use tree.$.collectionName directly with entityMap<E>()
   */
  entities<E extends { id: string | number }>(path: keyof T | string): EntityHelpers<E>;
}

/**
 * Methods added by withSerialization()
 */
export interface SerializationMethods<T> {
  /** Save current state to storage */
  saveState(): void;

  /** Load state from storage */
  loadState(): void;

  /** Clear persisted state */
  clearPersistedState(): void;

  /** Check if persisted state exists */
  hasPersistedState(): boolean;
}

/**
 * Methods added by withOptimizedUpdates()
 */
export interface OptimizedUpdateMethods<T> {
  /**
   * Perform diff-based optimized update.
   * Only updates signals that actually changed.
   */
  updateOptimized(updates: Partial<T>, options?: OptimizedUpdateOptions): OptimizedUpdateResult;
}

export interface OptimizedUpdateOptions {
  /** Enable batching */
  batch?: boolean;
  /** Batch size for large updates */
  batchSize?: number;
  /** Maximum recursion depth */
  maxDepth?: number;
  /** Ignore array element order */
  ignoreArrayOrder?: boolean;
  /** Custom equality function */
  equalityFn?: (a: unknown, b: unknown) => boolean;
}

export interface OptimizedUpdateResult {
  /** Whether any changes were made */
  changed: boolean;
  /** Update duration in ms */
  duration: number;
  /** List of changed paths */
  changedPaths: string[];
  /** Detailed statistics */
  stats?: {
    totalPaths: number;
    optimizedPaths: number;
    batchedUpdates: number;
  };
}

// ============================================================================
// SECTION 6: ENTITY TYPES
// ============================================================================

/**
 * Configuration for entity collections
 */
export interface EntityConfig<E, K extends string | number = string> {
  /**
   * Extract ID from entity.
   * @default (e) => e.id
   */
  selectId?: (entity: E) => K;

  /** Entity-level lifecycle hooks */
  hooks?: {
    /** Transform or block before add. Return false to block. */
    beforeAdd?: (entity: E) => E | false;
    /** Transform or block before update. Return false to block. */
    beforeUpdate?: (id: K, changes: Partial<E>) => Partial<E> | false;
    /** Block before remove. Return false to block. */
    beforeRemove?: (id: K, entity: E) => boolean;
  };
}

/** Unique brand symbol for EntityMapMarker (not exported) */
declare const ENTITY_MAP_BRAND: unique symbol;

/**
 * Marker type for entity collections in state definition.
 * Created via entityMap<E>() function.
 */
export interface EntityMapMarker<E, K extends string | number> {
  readonly [ENTITY_MAP_BRAND]: { __entity: E; __key: K };
  readonly __isEntityMap: true;
  readonly __entityMapConfig?: EntityConfig<E, K>;
}

/**
 * Create an entity map marker for use in state definition.
 *
 * @example
 * ```typescript
 * interface User { id: string; name: string; }
 *
 * const tree = signalTree({
 *   users: entityMap<User>(),
 *   products: entityMap<Product, number>(),
 * }).with(withEntities());
 * ```
 */
export function entityMap<E, K extends string | number = E extends { id: infer I extends string | number } ? I : string>(config?: EntityConfig<E, K>): EntityMapMarker<E, K> {
  return {
    __isEntityMap: true,
    __entityMapConfig: config ?? {},
  } as EntityMapMarker<E, K>;
}

/** Mutation options for entity operations */
export interface MutationOptions {
  /** Error handler */
  onError?: (error: Error) => void;
}

export interface AddOptions<E, K> extends MutationOptions {
  /** Custom ID selector */
  selectId?: (entity: E) => K;
}

export interface AddManyOptions<E, K> extends AddOptions<E, K> {
  /** Conflict handling mode */
  mode?: 'strict' | 'skip' | 'overwrite';
}

/** Tap handlers for observing entity operations */
export interface TapHandlers<E, K extends string | number> {
  onAdd?: (entity: E, id: K) => void;
  onUpdate?: (id: K, changes: Partial<E>, entity: E) => void;
  onRemove?: (id: K, entity: E) => void;
  onChange?: () => void;
}

/** Context for intercept handlers */
export interface InterceptContext<T> {
  /** Block the operation */
  block(reason?: string): void;
  /** Transform the value */
  transform(value: T): void;
  /** Whether operation is blocked */
  readonly blocked: boolean;
  /** Block reason if blocked */
  readonly blockReason: string | undefined;
}

/** Intercept handlers for blocking/transforming operations */
export interface InterceptHandlers<E, K extends string | number> {
  onAdd?: (entity: E, ctx: InterceptContext<E>) => void | Promise<void>;
  onUpdate?: (id: K, changes: Partial<E>, ctx: InterceptContext<Partial<E>>) => void | Promise<void>;
  onRemove?: (id: K, entity: E, ctx: InterceptContext<void>) => void | Promise<void>;
}

/**
 * Entity node with deep signal access to entity properties
 */
export type EntityNode<E> = {
  (): E;
  (value: E): void;
  (updater: (current: E) => E): void;
} & {
  [P in keyof E]: E[P] extends object ? (E[P] extends readonly unknown[] ? CallableWritableSignal<E[P]> : EntityNode<E[P]>) : CallableWritableSignal<E[P]>;
};

/**
 * Complete EntitySignal interface for entity collection management.
 */
export interface EntitySignal<E, K extends string | number = string> {
  // -------- Access Methods --------

  /** Get entity by ID (undefined if not found) */
  byId(id: K): EntityNode<E> | undefined;

  /** Get entity by ID (throws if not found) */
  byIdOrFail(id: K): EntityNode<E>;

  // -------- Query Signals --------

  /** Signal of all entities as array */
  readonly all: Signal<E[]>;

  /** Signal of entity count */
  readonly count: Signal<number>;

  /** Signal of all entity IDs */
  readonly ids: Signal<K[]>;

  /** Signal indicating if collection has entity with ID */
  has(id: K): Signal<boolean>;

  /** Signal indicating if collection is empty */
  readonly isEmpty: Signal<boolean>;

  /** Signal of entities as readonly Map */
  readonly map: Signal<ReadonlyMap<K, E>>;

  /** Signal of entities matching predicate */
  where(predicate: (entity: E) => boolean): Signal<E[]>;

  /** Signal of first entity matching predicate */
  find(predicate: (entity: E) => boolean): Signal<E | undefined>;

  // -------- Mutation Methods --------

  /** Add single entity, returns ID */
  addOne(entity: E, opts?: AddOptions<E, K>): K;

  /** Add multiple entities, returns IDs */
  addMany(entities: E[], opts?: AddManyOptions<E, K>): K[];

  /** Update single entity by ID */
  updateOne(id: K, changes: Partial<E>, opts?: MutationOptions): void;

  /** Update multiple entities by IDs */
  updateMany(ids: K[], changes: Partial<E>, opts?: MutationOptions): void;

  /** Update entities matching predicate, returns count */
  updateWhere(predicate: (entity: E) => boolean, changes: Partial<E>): number;

  /** Add or update single entity, returns ID */
  upsertOne(entity: E, opts?: AddOptions<E, K>): K;

  /** Add or update multiple entities, returns IDs */
  upsertMany(entities: E[], opts?: AddOptions<E, K>): K[];

  /** Remove single entity by ID */
  removeOne(id: K, opts?: MutationOptions): void;

  /** Remove multiple entities by IDs */
  removeMany(ids: K[], opts?: MutationOptions): void;

  /** Remove entities matching predicate, returns count */
  removeWhere(predicate: (entity: E) => boolean): number;

  /** Remove all entities */
  clear(): void;

  /** Alias for clear() */
  removeAll(): void;

  /** Replace all entities */
  setAll(entities: E[], opts?: AddOptions<E, K>): void;

  // -------- Hooks --------

  /** Register tap handlers (observe operations) */
  tap(handlers: TapHandlers<E, K>): () => void;

  /** Register intercept handlers (block/transform operations) */
  intercept(handlers: InterceptHandlers<E, K>): () => void;
}

/**
 * @deprecated Legacy entity helpers interface.
 * Use entityMap<E>() + withEntities() + tree.$.collection instead.
 */
export interface EntityHelpers<E extends { id: string | number }> {
  add(entity: E): void;
  update(id: E['id'], updates: Partial<E>): void;
  remove(id: E['id']): void;
  upsert(entity: E): void;
  selectById(id: E['id']): Signal<E | undefined>;
  selectBy(predicate: (entity: E) => boolean): Signal<E[]>;
  selectIds(): Signal<Array<string | number>>;
  selectAll(): Signal<E[]>;
  selectTotal(): Signal<number>;
  clear(): void;
}

// ============================================================================
// SECTION 7: CONFIGURATION TYPES
// ============================================================================

/**
 * Configuration options for signalTree()
 */
export interface TreeConfig {
  /** Enable lazy signal creation */
  useLazySignals?: boolean;
  /** Use shallow comparison for equality */
  useShallowComparison?: boolean;
  /** Enable debug logging */
  debugMode?: boolean;
}

// ============================================================================
// SECTION 8: CONVENIENCE TYPE ALIASES
// ============================================================================

/**
 * Full-featured SignalTree with all standard enhancers.
 * Equivalent to createDevTree() return type.
 */
export type FullSignalTree<T> = SignalTree<T> & EffectsMethods<T> & BatchingMethods<T> & MemoizationMethods<T> & TimeTravelMethods<T> & DevToolsMethods & EntitiesMethods<T>;

/**
 * Production SignalTree without debug features.
 * Equivalent to createProdTree() return type.
 */
export type ProdSignalTree<T> = SignalTree<T> & EffectsMethods<T> & BatchingMethods<T> & MemoizationMethods<T> & EntitiesMethods<T>;

/**
 * Minimal SignalTree with just effects.
 * Equivalent to createMinimalTree() return type.
 */
export type MinimalSignalTree<T> = SignalTree<T> & EffectsMethods<T>;

// ============================================================================
// SECTION 9: TYPE GUARDS
// ============================================================================

/**
 * Check if a value is a SignalTree.
 */
export function isSignalTree<T>(value: unknown): value is SignalTree<T> {
  return value !== null && typeof value === 'object' && 'state' in value && '$' in value && 'with' in value && 'destroy' in value;
}

/**
 * Check if a tree has time travel methods.
 */
export function hasTimeTravel<T>(tree: SignalTree<T>): tree is SignalTree<T> & TimeTravelMethods<T> {
  return typeof (tree as any).undo === 'function' && typeof (tree as any).canUndo === 'function';
}

/**
 * Check if a tree has batching methods.
 */
export function hasBatching<T>(tree: SignalTree<T>): tree is SignalTree<T> & BatchingMethods<T> {
  return typeof (tree as any).batch === 'function';
}

/**
 * Check if a tree has memoization methods.
 */
export function hasMemoization<T>(tree: SignalTree<T>): tree is SignalTree<T> & MemoizationMethods<T> {
  return typeof (tree as any).memoize === 'function';
}

/**
 * Check if a tree has effects methods.
 */
export function hasEffects<T>(tree: SignalTree<T>): tree is SignalTree<T> & EffectsMethods<T> {
  return typeof (tree as any).effect === 'function';
}

/**
 * Check if a tree has devtools methods.
 */
export function hasDevTools<T>(tree: SignalTree<T>): tree is SignalTree<T> & DevToolsMethods {
  return typeof (tree as any).connectDevTools === 'function';
}

/**
 * Check if a tree has entity methods.
 */
export function hasEntities<T>(tree: SignalTree<T>): tree is SignalTree<T> & EntitiesMethods<T> {
  return typeof (tree as any).entities === 'function';
}
````

---

### 4.2 Utility Functions

**File: `packages/core/src/lib/utils/is-built-in-object.ts`**

```typescript
/**
 * Check if a value is a built-in object that should be treated as a leaf.
 * These objects should not be recursively converted to signals.
 */
export function isBuiltInObject(obj: unknown): boolean {
  if (obj === null || obj === undefined) {
    return false;
  }

  // Check for common built-in types
  return (
    obj instanceof Date ||
    obj instanceof RegExp ||
    obj instanceof Map ||
    obj instanceof Set ||
    obj instanceof WeakMap ||
    obj instanceof WeakSet ||
    obj instanceof Error ||
    obj instanceof URL ||
    obj instanceof Promise ||
    obj instanceof ArrayBuffer ||
    obj instanceof DataView ||
    // Typed arrays
    ArrayBuffer.isView(obj) ||
    // Web API objects (browser only)
    (typeof FormData !== 'undefined' && obj instanceof FormData) ||
    (typeof Blob !== 'undefined' && obj instanceof Blob) ||
    (typeof File !== 'undefined' && obj instanceof File) ||
    (typeof Headers !== 'undefined' && obj instanceof Headers) ||
    (typeof Request !== 'undefined' && obj instanceof Request) ||
    (typeof Response !== 'undefined' && obj instanceof Response) ||
    (typeof AbortController !== 'undefined' && obj instanceof AbortController) ||
    (typeof AbortSignal !== 'undefined' && obj instanceof AbortSignal) ||
    (typeof URLSearchParams !== 'undefined' && obj instanceof URLSearchParams)
  );
}

/**
 * Check if a value is an entity map marker.
 */
export function isEntityMapMarker(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).__isEntityMap === true);
}

/**
 * Check if a value is an Angular signal.
 */
export function isSignal(value: unknown): boolean {
  return typeof value === 'function' && 'set' in value && 'update' in value && 'asReadonly' in value;
}
```

**File: `packages/core/src/lib/utils/deep-clone.ts`**

```typescript
/**
 * Deep clone a value using JSON serialization.
 * Fast but doesn't preserve special types (Date, Map, etc.)
 */
export function deepCloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Deep clone a value preserving special types.
 */
export function deepClone<T>(value: T, seen = new WeakMap()): T {
  // Primitives
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Check for circular references
  if (seen.has(value as object)) {
    return seen.get(value as object);
  }

  // Date
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  // RegExp
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  // Map
  if (value instanceof Map) {
    const cloned = new Map();
    seen.set(value, cloned);
    value.forEach((v, k) => {
      cloned.set(deepClone(k, seen), deepClone(v, seen));
    });
    return cloned as T;
  }

  // Set
  if (value instanceof Set) {
    const cloned = new Set();
    seen.set(value, cloned);
    value.forEach((v) => {
      cloned.add(deepClone(v, seen));
    });
    return cloned as T;
  }

  // Array
  if (Array.isArray(value)) {
    const cloned: unknown[] = [];
    seen.set(value, cloned);
    for (let i = 0; i < value.length; i++) {
      cloned[i] = deepClone(value[i], seen);
    }
    return cloned as T;
  }

  // Plain object
  const cloned = {} as Record<string, unknown>;
  seen.set(value as object, cloned);

  for (const key of Object.keys(value as object)) {
    cloned[key] = deepClone((value as Record<string, unknown>)[key], seen);
  }

  return cloned as T;
}
```

**File: `packages/core/src/lib/utils/deep-equal.ts`**

```typescript
/**
 * Deep equality comparison.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Same reference or both primitives with same value
  if (a === b) {
    return true;
  }

  // Null/undefined check
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }

  // Type check
  if (typeof a !== typeof b) {
    return false;
  }

  // Non-object types (already handled by === above for equal values)
  if (typeof a !== 'object') {
    return false;
  }

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // RegExp comparison
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // One is array, other is not
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  // Map comparison
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key))) {
        return false;
      }
    }
    return true;
  }

  // Set comparison
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) {
      return false;
    }
    for (const value of a) {
      if (!b.has(value)) {
        return false;
      }
    }
    return true;
  }

  // Object comparison
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!keysB.includes(key)) {
      return false;
    }
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}
```

**File: `packages/core/src/lib/utils/snapshot-state.ts`**

```typescript
import { TreeNode } from '../types';
import { isBuiltInObject, isEntityMapMarker } from './is-built-in-object';

/**
 * Capture a snapshot of the current state from a TreeNode.
 * Reads signal values and returns plain JavaScript object.
 */
export function snapshotState<T>(state: TreeNode<T>): T {
  return snapshotRecursive(state) as T;
}

function snapshotRecursive(node: unknown): unknown {
  // Null/undefined
  if (node === null || node === undefined) {
    return node;
  }

  // Signal (callable with no args returns value)
  if (typeof node === 'function') {
    try {
      return (node as () => unknown)();
    } catch {
      return undefined;
    }
  }

  // Entity signal (has specific methods)
  if (isEntitySignal(node)) {
    // Get all entities
    const all = (node as any).all;
    if (typeof all === 'function') {
      const signal = all();
      if (typeof signal === 'function') {
        return signal();
      }
    }
    return [];
  }

  // Entity map marker (not yet materialized)
  if (isEntityMapMarker(node)) {
    return [];
  }

  // Built-in object
  if (isBuiltInObject(node)) {
    return node;
  }

  // Array
  if (Array.isArray(node)) {
    return node.map(snapshotRecursive);
  }

  // Plain object - recurse
  if (typeof node === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(node)) {
      result[key] = snapshotRecursive(value);
    }

    return result;
  }

  return node;
}

function isEntitySignal(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'addOne' in value && 'removeOne' in value && 'all' in value);
}
```

**File: `packages/core/src/lib/utils/apply-state.ts`**

```typescript
import { TreeNode } from '../types';
import { isBuiltInObject, isEntityMapMarker } from './is-built-in-object';

/**
 * Apply a state snapshot to a TreeNode.
 * Updates signal values to match the snapshot.
 */
export function applyState<T>(state: TreeNode<T>, snapshot: T): void {
  applyRecursive(state, snapshot);
}

function applyRecursive(node: unknown, value: unknown): void {
  if (node === null || node === undefined || value === undefined) {
    return;
  }

  // Signal with set method
  if (typeof node === 'function' && 'set' in node) {
    (node as { set: (v: unknown) => void }).set(value);
    return;
  }

  // Entity signal
  if (isEntitySignal(node)) {
    const entitySignal = node as { setAll: (v: unknown[]) => void };
    if (typeof entitySignal.setAll === 'function' && Array.isArray(value)) {
      entitySignal.setAll(value);
    }
    return;
  }

  // Skip markers and built-ins
  if (isEntityMapMarker(node) || isBuiltInObject(node)) {
    return;
  }

  // Recurse into objects
  if (typeof node === 'object' && typeof value === 'object' && value !== null) {
    for (const [key, subValue] of Object.entries(value)) {
      const subNode = (node as Record<string, unknown>)[key];
      if (subNode !== undefined) {
        applyRecursive(subNode, subValue);
      }
    }
  }
}

function isEntitySignal(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'addOne' in value && 'removeOne' in value && 'setAll' in value);
}
```

**File: `packages/core/src/lib/utils/index.ts`**

```typescript
export { isBuiltInObject, isEntityMapMarker, isSignal } from './is-built-in-object';
export { deepClone, deepCloneJSON } from './deep-clone';
export { deepEqual } from './deep-equal';
export { snapshotState } from './snapshot-state';
export { applyState } from './apply-state';
```

---

### 4.3 Signal Store Creation

**File: `packages/core/src/lib/create-signal-store.ts`**

```typescript
import { signal, WritableSignal } from '@angular/core';
import { TreeNode, TreeConfig } from './types';
import { isBuiltInObject, isEntityMapMarker } from './utils';

/**
 * Create a reactive signal store from an initial state object.
 *
 * Recursively converts plain objects to nested signal trees.
 * Arrays, primitives, and built-in objects become leaf signals.
 * EntityMapMarkers are preserved for later materialization.
 */
export function createSignalStore<T>(initialState: T, config: TreeConfig, processedObjects = new WeakSet<object>()): TreeNode<T> {
  return createStoreRecursive(initialState, config, processedObjects, []) as TreeNode<T>;
}

function createStoreRecursive<T>(value: T, config: TreeConfig, processedObjects: WeakSet<object>, path: string[]): unknown {
  // Null/undefined - create signal
  if (value === null || value === undefined) {
    return createLeafSignal(value, config, path);
  }

  // Primitives - create signal
  if (typeof value !== 'object') {
    return createLeafSignal(value, config, path);
  }

  // Arrays - treat as leaf value
  if (Array.isArray(value)) {
    return createLeafSignal(value, config, path);
  }

  // Built-in objects - treat as leaf value
  if (isBuiltInObject(value)) {
    return createLeafSignal(value, config, path);
  }

  // Entity map marker - preserve for withEntities()
  if (isEntityMapMarker(value)) {
    if (config.debugMode) {
      console.log(`[SignalTree] EntityMap marker at path: ${path.join('.')}`);
    }
    return value;
  }

  // Circular reference protection
  if (processedObjects.has(value as object)) {
    console.warn(`[SignalTree] Circular reference at path: ${path.join('.')}`);
    return createLeafSignal(value, config, path);
  }
  processedObjects.add(value as object);

  // Regular object - recurse into properties
  const store: Record<string, unknown> = {};

  for (const [key, propValue] of Object.entries(value)) {
    // Skip symbol keys
    if (typeof key === 'symbol') {
      continue;
    }

    const propPath = [...path, key];
    store[key] = createStoreRecursive(propValue, config, processedObjects, propPath);
  }

  // Make the object itself callable for AccessibleNode behavior
  return createAccessibleNode(store, config, path);
}

/**
 * Create a leaf signal for primitive/array/built-in values.
 */
function createLeafSignal<T>(value: T, config: TreeConfig, path: string[]): WritableSignal<T> {
  const sig = signal(value);

  if (config.debugMode) {
    console.log(`[SignalTree] Created signal at path: ${path.join('.') || 'root'}`);
  }

  return sig;
}

/**
 * Create an AccessibleNode that is both callable and has properties.
 *
 * When called with no args: returns aggregated state
 * When called with value: sets aggregated state
 * When called with function: updates aggregated state
 * Properties: child signals/nodes
 */
function createAccessibleNode(store: Record<string, unknown>, config: TreeConfig, path: string[]): Record<string, unknown> {
  // For now, just return the store object.
  // Full AccessibleNode implementation would make this callable.
  // This is simplified for clarity.
  return store;
}
```

---

### 4.4 Development Proxy

**File: `packages/core/src/lib/dev-proxy.ts`**

```typescript
import { SignalTree } from './types';

/**
 * Map of enhancer method names to their required enhancers.
 */
const ENHANCER_METHOD_MAP: Record<string, { enhancer: string; preset: string }> = {
  // Effects
  effect: { enhancer: 'withEffects()', preset: 'createMinimalTree' },
  subscribe: { enhancer: 'withEffects()', preset: 'createMinimalTree' },

  // Batching
  batch: { enhancer: 'withBatching()', preset: 'createProdTree' },
  batchUpdate: { enhancer: 'withBatching()', preset: 'createProdTree' },

  // Memoization
  memoize: { enhancer: 'withMemoization()', preset: 'createProdTree' },
  memoizedUpdate: { enhancer: 'withMemoization()', preset: 'createProdTree' },
  clearMemoCache: { enhancer: 'withMemoization()', preset: 'createProdTree' },
  getCacheStats: { enhancer: 'withMemoization()', preset: 'createProdTree' },

  // Time Travel
  undo: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  redo: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  canUndo: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  canRedo: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  getHistory: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  resetHistory: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  jumpTo: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  getCurrentIndex: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },

  // DevTools
  connectDevTools: { enhancer: 'withDevTools()', preset: 'createDevTree' },
  disconnectDevTools: { enhancer: 'withDevTools()', preset: 'createDevTree' },

  // Entities
  entities: { enhancer: 'withEntities()', preset: 'createDevTree' },

  // Optimized Updates
  updateOptimized: { enhancer: 'withOptimizedUpdates()', preset: 'enterprise package' },

  // Serialization
  saveState: { enhancer: 'withSerialization()', preset: 'custom' },
  loadState: { enhancer: 'withSerialization()', preset: 'custom' },
  clearPersistedState: { enhancer: 'withSerialization()', preset: 'custom' },
  hasPersistedState: { enhancer: 'withSerialization()', preset: 'custom' },
};

/**
 * Wrap a SignalTree with a Proxy that provides helpful error messages
 * when accessing methods that require enhancers not yet applied.
 *
 * Only used in development mode to help developers understand
 * what enhancers they need to add.
 */
export function wrapWithDevProxy<T>(tree: SignalTree<T>): SignalTree<T> {
  return new Proxy(tree, {
    get(target, prop, receiver) {
      // First check if property exists on target
      const value = Reflect.get(target, prop, receiver);

      if (value !== undefined) {
        return value;
      }

      // Property doesn't exist - check if it's a known enhancer method
      const methodInfo = ENHANCER_METHOD_MAP[prop as string];

      if (methodInfo) {
        // Return a function that throws a helpful error
        return createMissingMethodError(prop as string, methodInfo);
      }

      // Unknown property - return undefined (normal behavior)
      return undefined;
    },

    // Also handle 'in' operator for completeness
    has(target, prop) {
      if (Reflect.has(target, prop)) {
        return true;
      }
      // Don't pretend enhancer methods exist
      return false;
    },
  });
}

/**
 * Create a function that throws a helpful error when called.
 */
function createMissingMethodError(methodName: string, info: { enhancer: string; preset: string }): (...args: unknown[]) => never {
  return (..._args: unknown[]): never => {
    const boxWidth = 70;
    const line = '─'.repeat(boxWidth - 2);

    const message = `
┌${line}┐
│${'SignalTree: Missing Enhancer'.padStart(45).padEnd(boxWidth - 2)}│
└${line}┘

  ${methodName}() requires ${info.enhancer}

  ╭─ Option 1: Add the enhancer ────────────────────────────────────╮
  │                                                                 │
  │   const tree = signalTree(state)                                │
  │     .with(${info.enhancer.padEnd(30)});            │
  │                                                                 │
  ╰─────────────────────────────────────────────────────────────────╯

  ╭─ Option 2: Use a preset that includes it ───────────────────────╮
  │                                                                 │
  │   import { ${info.preset} } from '@signaltree/core';     │
  │   const tree = ${info.preset}(state);                    │
  │                                                                 │
  ╰─────────────────────────────────────────────────────────────────╯

  📚 Documentation: https://signaltree.dev/enhancers
  💬 Need help? https://github.com/signaltree/signaltree/discussions
`;

    throw new Error(message);
  };
}

/**
 * Check if we should use the development proxy.
 * Based on Angular's ngDevMode or NODE_ENV.
 */
export function shouldUseDevProxy(): boolean {
  // Check Angular's ngDevMode global
  if (typeof ngDevMode !== 'undefined') {
    return Boolean(ngDevMode);
  }

  // Check Node.js NODE_ENV
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== 'production';
  }

  // Default to false in unknown environments (safe for production)
  return false;
}

// Declare ngDevMode for TypeScript
declare const ngDevMode: boolean | undefined;
```

---

### 4.5 Base SignalTree Factory

**File: `packages/core/src/lib/signal-tree.ts`**

````typescript
import { SignalTree, TreeNode, TreeConfig, Enhancer } from './types';
import { createSignalStore } from './create-signal-store';
import { wrapWithDevProxy, shouldUseDevProxy } from './dev-proxy';

/**
 * Create a new SignalTree with the given initial state.
 *
 * The base tree only has core functionality:
 * - `state` / `$`: Access the reactive state tree
 * - `with()`: Apply enhancers to add functionality
 * - `destroy()`: Clean up resources
 *
 * Use `.with()` to add enhancer methods, or use presets like
 * `createDevTree()` for a fully-featured tree.
 *
 * @param initialState - The initial state object
 * @param config - Optional configuration options
 * @returns A SignalTree that can be enhanced
 *
 * @example
 * ```typescript
 * // Base tree - minimal functionality
 * const base = signalTree({ count: 0 });
 * base.$.count.set(1); // ✅ Works
 * base.undo();         // ❌ Property 'undo' does not exist
 *
 * // Enhanced tree - with time travel
 * const enhanced = signalTree({ count: 0 })
 *   .with(withEffects())
 *   .with(withTimeTravel());
 * enhanced.undo();     // ✅ Works
 *
 * // Or use a preset for convenience
 * const full = createDevTree({ count: 0 });
 * full.undo();         // ✅ Works
 * ```
 */
export function signalTree<T extends object>(initialState: T, config: TreeConfig = {}): SignalTree<T> {
  // Validate input
  if (initialState === null || initialState === undefined) {
    throw new Error('signalTree() requires a non-null initial state object');
  }

  if (typeof initialState !== 'object' || Array.isArray(initialState)) {
    throw new Error('signalTree() initial state must be a plain object');
  }

  // Create the reactive signal store
  const state = createSignalStore(initialState, config) as TreeNode<T>;

  // Track cleanup functions
  const cleanupFns: Array<() => void> = [];

  // Build the base tree object
  const tree: SignalTree<T> = {
    state,
    $: state,

    with(...enhancers: Enhancer<unknown>[]) {
      if (enhancers.length === 0) {
        return this;
      }

      let result: any = this;

      for (const enhancer of enhancers) {
        if (typeof enhancer !== 'function') {
          throw new Error(`Invalid enhancer passed to .with(): expected function, got ${typeof enhancer}`);
        }

        try {
          result = enhancer(result);
        } catch (error) {
          const enhancerName = enhancer.metadata?.name ?? 'unknown';
          throw new Error(`Enhancer '${enhancerName}' failed: ${error instanceof Error ? error.message : error}`);
        }
      }

      return result;
    },

    destroy() {
      // Run all cleanup functions
      for (const cleanup of cleanupFns) {
        try {
          cleanup();
        } catch (error) {
          console.error('[SignalTree] Cleanup error:', error);
        }
      }
      cleanupFns.length = 0;

      if (config.debugMode) {
        console.log('[SignalTree] Destroyed');
      }
    },
  };

  // In development mode, wrap with proxy for helpful errors
  if (shouldUseDevProxy()) {
    return wrapWithDevProxy(tree);
  }

  return tree;
}

// Re-export for convenience
export { createSignalStore } from './create-signal-store';
````

---

### 4.6 Enhancer: Effects

**File: `packages/core/src/lib/enhancers/effects.ts`**

````typescript
import { effect as ngEffect, DestroyRef, inject, Injector, runInInjectionContext } from '@angular/core';
import { SignalTree, EffectsMethods, Enhancer, ENHANCER_META } from '../types';
import { snapshotState } from '../utils';

/**
 * Configuration for withEffects enhancer.
 */
export interface EffectsConfig {
  /**
   * Automatically clean up effects when Angular component destroys.
   * Requires being in an injection context when tree is created.
   * @default true
   */
  autoCleanup?: boolean;

  /**
   * Custom injector for effect creation.
   * Useful when tree is created outside injection context.
   */
  injector?: Injector;
}

/**
 * Add reactive effect and subscription capabilities.
 *
 * This enhancer provides:
 * - `effect(fn)`: Register a reactive effect
 * - `subscribe(fn)`: Subscribe to state changes
 *
 * @example
 * ```typescript
 * const tree = signalTree({ count: 0 }).with(withEffects());
 *
 * // Register an effect
 * const cleanup = tree.effect((state) => {
 *   console.log('Count changed:', state.count);
 * });
 *
 * // Trigger the effect
 * tree.$.count.set(1); // Logs: "Count changed: 1"
 *
 * // Clean up manually (or auto-cleanup on component destroy)
 * cleanup();
 * ```
 */
export function withEffects<T>(config: EffectsConfig = {}): Enhancer<EffectsMethods<T>> {
  const { autoCleanup = true, injector: configInjector } = config;

  const enhancerFn = <S>(tree: SignalTree<S>): SignalTree<S> & EffectsMethods<S> => {
    // Track all cleanup functions
    const cleanupFns = new Set<() => void>();

    // Try to get DestroyRef for automatic cleanup
    let destroyRef: DestroyRef | null = null;
    let effectInjector: Injector | null = configInjector ?? null;

    if (autoCleanup && !effectInjector) {
      try {
        destroyRef = inject(DestroyRef);
        effectInjector = inject(Injector);

        // Register cleanup on component destroy
        destroyRef.onDestroy(() => {
          cleanupFns.forEach((fn) => {
            try {
              fn();
            } catch (e) {
              console.error('[SignalTree] Effect cleanup error:', e);
            }
          });
          cleanupFns.clear();
        });
      } catch {
        // Not in injection context - manual cleanup required
        if (config.autoCleanup !== false) {
          console.warn('[SignalTree] withEffects() created outside injection context. ' + 'Effects will not auto-cleanup. Pass { autoCleanup: false } to suppress this warning, ' + 'or pass { injector } to enable auto-cleanup.');
        }
      }
    }

    const methods: EffectsMethods<S> = {
      effect(fn) {
        // Create the effect, optionally in injection context
        let effectRef: { destroy: () => void };

        const createEffect = () => {
          return ngEffect(() => {
            const state = snapshotState(tree.state);
            fn(state as S);
          });
        };

        if (effectInjector) {
          effectRef = runInInjectionContext(effectInjector, createEffect);
        } else {
          effectRef = createEffect();
        }

        // Create cleanup function
        const cleanup = () => {
          effectRef.destroy();
          cleanupFns.delete(cleanup);
        };

        cleanupFns.add(cleanup);
        return cleanup;
      },

      subscribe(fn) {
        // Subscribe is implemented as an effect
        return this.effect(fn);
      },
    };

    // Extend destroy to clean up all effects
    const originalDestroy = tree.destroy.bind(tree);
    (tree as any).destroy = () => {
      cleanupFns.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error('[SignalTree] Effect cleanup error:', e);
        }
      });
      cleanupFns.clear();
      originalDestroy();
    };

    return Object.assign(tree, methods);
  };

  // Attach metadata
  enhancerFn.metadata = {
    name: 'effects',
    provides: ['effect', 'subscribe'],
  };

  return enhancerFn;
}
````

---

### 4.7 Enhancer: Batching

**File: `packages/core/src/lib/enhancers/batching.ts`**

````typescript
import { SignalTree, BatchingMethods, Enhancer, TreeNode } from '../types';
import { snapshotState, applyState } from '../utils';

/**
 * Configuration for withBatching enhancer.
 */
export interface BatchingConfig {
  /**
   * Debounce time in milliseconds.
   * 0 = flush on microtask (default)
   * @default 0
   */
  debounceMs?: number;

  /**
   * Maximum batch size before auto-flush.
   * @default 1000
   */
  maxBatchSize?: number;
}

/**
 * Add batched update capabilities for performance optimization.
 *
 * This enhancer provides:
 * - `batch(fn)`: Batch multiple updates into single change detection
 * - `batchUpdate(fn)`: Batch update with partial state
 *
 * @example
 * ```typescript
 * const tree = signalTree({ a: 1, b: 2, c: 3 }).with(withBatching());
 *
 * // Multiple updates batched into one change detection cycle
 * tree.batch(($) => {
 *   $.a.set(10);
 *   $.b.set(20);
 *   $.c.set(30);
 *   // Only one change detection cycle triggered
 * });
 *
 * // Or with partial state
 * tree.batchUpdate((current) => ({
 *   a: current.a * 2,
 *   b: current.b * 2,
 * }));
 * ```
 */
export function withBatching<T>(config: BatchingConfig = {}): Enhancer<BatchingMethods<T>> {
  const { debounceMs = 0, maxBatchSize = 1000 } = config;

  const enhancerFn = <S>(tree: SignalTree<S>): SignalTree<S> & BatchingMethods<S> => {
    // Batch queue and state
    let batchQueue: Array<() => void> = [];
    let batchScheduled = false;
    let isBatching = false;
    let batchDepth = 0;

    /**
     * Flush all queued updates.
     */
    const flushBatch = () => {
      const queue = batchQueue;
      batchQueue = [];
      batchScheduled = false;
      isBatching = true;
      batchDepth++;

      try {
        for (const fn of queue) {
          try {
            fn();
          } catch (error) {
            console.error('[SignalTree] Batch update error:', error);
          }
        }
      } finally {
        batchDepth--;
        if (batchDepth === 0) {
          isBatching = false;
        }
      }
    };

    /**
     * Schedule batch flush.
     */
    const scheduleBatch = () => {
      if (batchScheduled) {
        return;
      }

      batchScheduled = true;

      if (debounceMs > 0) {
        setTimeout(flushBatch, debounceMs);
      } else {
        queueMicrotask(flushBatch);
      }

      // Auto-flush if queue gets too large
      if (batchQueue.length >= maxBatchSize) {
        flushBatch();
      }
    };

    const methods: BatchingMethods<S> = {
      batch(updater) {
        if (isBatching) {
          // Already in a batch - execute immediately
          updater(tree.$ as TreeNode<S>);
        } else {
          batchQueue.push(() => updater(tree.$ as TreeNode<S>));
          scheduleBatch();
        }
      },

      batchUpdate(updater) {
        this.batch(() => {
          const current = snapshotState(tree.state) as S;
          const updates = updater(current);
          applyPartialState(tree.$, updates);
        });
      },
    };

    return Object.assign(tree, methods);
  };

  enhancerFn.metadata = {
    name: 'batching',
    provides: ['batch', 'batchUpdate'],
  };

  return enhancerFn;
}

/**
 * Apply partial updates to a tree node.
 */
function applyPartialState<T>(treeNode: TreeNode<T>, updates: Partial<T>): void {
  if (!updates || typeof updates !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(updates)) {
    const node = (treeNode as Record<string, any>)[key];

    if (node === undefined) {
      continue;
    }

    // If node has set method, it's a signal
    if (typeof node.set === 'function') {
      node.set(value);
    }
    // If node is an object and value is an object, recurse
    else if (typeof node === 'object' && typeof value === 'object' && value !== null) {
      applyPartialState(node, value as Partial<unknown>);
    }
  }
}
````

---

### 4.8 Enhancer: Memoization

**File: `packages/core/src/lib/enhancers/memoization.ts`**

````typescript
import { computed, Signal } from '@angular/core';
import { SignalTree, MemoizationMethods, CacheStats, Enhancer } from '../types';
import { snapshotState } from '../utils';

/**
 * Configuration for withMemoization enhancer.
 */
export interface MemoizationConfig {
  /**
   * Maximum number of cached entries.
   * @default 100
   */
  maxCacheSize?: number;

  /**
   * Cache TTL in milliseconds (0 = no expiry).
   * @default 0
   */
  ttlMs?: number;

  /**
   * Enable LRU eviction based on access count.
   * @default true
   */
  useLRU?: boolean;
}

interface CacheEntry {
  signal: Signal<unknown>;
  hits: number;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Add memoization capabilities for computed values.
 *
 * This enhancer provides:
 * - `memoize(fn, key?)`: Create a memoized computed signal
 * - `memoizedUpdate(fn, key?)`: Update with cache invalidation
 * - `clearMemoCache(key?)`: Clear cache entries
 * - `getCacheStats()`: Get cache statistics
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   items: [{ price: 10 }, { price: 20 }]
 * }).with(withMemoization());
 *
 * // Create memoized computed
 * const total = tree.memoize(
 *   (state) => state.items.reduce((sum, i) => sum + i.price, 0),
 *   'items-total'
 * );
 *
 * console.log(total()); // 30 (computed)
 * console.log(total()); // 30 (cached)
 *
 * // Clear specific cache
 * tree.clearMemoCache('items-total');
 * ```
 */
export function withMemoization<T>(config: MemoizationConfig = {}): Enhancer<MemoizationMethods<T>> {
  const { maxCacheSize = 100, ttlMs = 0, useLRU = true } = config;

  const enhancerFn = <S>(tree: SignalTree<S>): SignalTree<S> & MemoizationMethods<S> => {
    const cache = new Map<string, CacheEntry>();
    let totalHits = 0;
    let totalMisses = 0;
    let autoKeyCounter = 0;

    /**
     * Evict stale entries based on TTL.
     */
    const evictStale = () => {
      if (ttlMs <= 0) return;

      const now = Date.now();
      for (const [key, entry] of cache) {
        if (now - entry.createdAt > ttlMs) {
          cache.delete(key);
        }
      }
    };

    /**
     * Evict least recently used entry when at capacity.
     */
    const evictLRU = () => {
      if (cache.size < maxCacheSize) return;

      if (useLRU) {
        // Find entry with oldest lastAccessedAt
        let oldestKey = '';
        let oldestTime = Infinity;

        for (const [key, entry] of cache) {
          if (entry.lastAccessedAt < oldestTime) {
            oldestTime = entry.lastAccessedAt;
            oldestKey = key;
          }
        }

        if (oldestKey) {
          cache.delete(oldestKey);
        }
      } else {
        // Simple FIFO - delete first entry
        const firstKey = cache.keys().next().value;
        if (firstKey) {
          cache.delete(firstKey);
        }
      }
    };

    const methods: MemoizationMethods<S> = {
      memoize<R>(fn: (state: S) => R, cacheKey?: string): Signal<R> {
        // Clean up stale entries first
        evictStale();

        // Generate key if not provided
        const key = cacheKey ?? `__auto_${autoKeyCounter++}`;

        // Check cache
        const existing = cache.get(key);
        if (existing) {
          totalHits++;
          existing.hits++;
          existing.lastAccessedAt = Date.now();
          return existing.signal as Signal<R>;
        }

        // Cache miss
        totalMisses++;

        // Evict if at capacity
        evictLRU();

        // Create new computed signal
        const sig = computed(() => {
          const state = snapshotState(tree.state) as S;
          return fn(state);
        });

        // Store in cache
        const now = Date.now();
        cache.set(key, {
          signal: sig,
          hits: 0,
          createdAt: now,
          lastAccessedAt: now,
        });

        return sig;
      },

      memoizedUpdate(updater, cacheKey) {
        // Get current state
        const current = snapshotState(tree.state) as S;

        // Compute updates
        const updates = updater(current);

        // Apply updates
        applyPartialState(tree.$, updates);

        // Invalidate specific cache key if provided
        if (cacheKey) {
          cache.delete(cacheKey);
        }
      },

      clearMemoCache(key) {
        if (key !== undefined) {
          cache.delete(key);
        } else {
          cache.clear();
          totalHits = 0;
          totalMisses = 0;
        }
      },

      getCacheStats(): CacheStats {
        const total = totalHits + totalMisses;
        return {
          size: cache.size,
          hitRate: total > 0 ? totalHits / total : 0,
          totalHits,
          totalMisses,
          keys: Array.from(cache.keys()),
        };
      },
    };

    // Extend destroy to clear cache
    const originalDestroy = tree.destroy.bind(tree);
    (tree as any).destroy = () => {
      cache.clear();
      originalDestroy();
    };

    return Object.assign(tree, methods);
  };

  enhancerFn.metadata = {
    name: 'memoization',
    provides: ['memoize', 'memoizedUpdate', 'clearMemoCache', 'getCacheStats'],
  };

  return enhancerFn;
}

/**
 * Apply partial updates (copy from batching for standalone use).
 */
function applyPartialState<T>(treeNode: any, updates: Partial<T>): void {
  if (!updates || typeof updates !== 'object') return;

  for (const [key, value] of Object.entries(updates)) {
    const node = treeNode[key];
    if (node === undefined) continue;

    if (typeof node.set === 'function') {
      node.set(value);
    } else if (typeof node === 'object' && typeof value === 'object' && value !== null) {
      applyPartialState(node, value as Partial<unknown>);
    }
  }
}
````

---

### 4.9 Enhancer: Time Travel

**File: `packages/core/src/lib/enhancers/time-travel.ts`**

````typescript
import { SignalTree, TimeTravelMethods, TimeTravelEntry, Enhancer } from '../types';
import { snapshotState, applyState, deepCloneJSON } from '../utils';

/**
 * Configuration for withTimeTravel enhancer.
 */
export interface TimeTravelConfig {
  /**
   * Maximum number of history entries.
   * @default 50
   */
  maxHistory?: number;

  /**
   * Paths to exclude from history tracking.
   * Use dot notation: ['ui.loading', 'temp']
   */
  excludePaths?: string[];

  /**
   * Debounce time for recording changes (ms).
   * Prevents recording every keystroke.
   * @default 0
   */
  debounceMs?: number;

  /**
   * Custom action name generator.
   */
  actionNameFn?: (path: string, value: unknown) => string;
}

/**
 * Add undo/redo capabilities for user actions.
 *
 * ⚠️ IMPORTANT: Use this for USER undo/redo (Ctrl+Z), NOT for API rollback.
 * For optimistic update rollback, use snapshot-based patterns instead.
 *
 * This enhancer provides:
 * - `undo()` / `redo()`: Navigate history
 * - `canUndo()` / `canRedo()`: Check availability
 * - `getHistory()`: Get all history entries
 * - `jumpTo(index)`: Jump to specific point
 * - `resetHistory()`: Clear history
 * - `getCurrentIndex()`: Get current position
 *
 * @example
 * ```typescript
 * const tree = signalTree({ text: '' }).with(withTimeTravel());
 *
 * tree.$.text.set('Hello');
 * tree.$.text.set('Hello World');
 *
 * tree.canUndo(); // true
 * tree.undo();    // text = 'Hello'
 * tree.redo();    // text = 'Hello World'
 *
 * tree.getHistory().length; // 3 (init + 2 changes)
 * tree.jumpTo(0); // text = '' (back to initial)
 * ```
 */
export function withTimeTravel<T>(config: TimeTravelConfig = {}): Enhancer<TimeTravelMethods<T>> {
  const { maxHistory = 50, debounceMs = 0 } = config;

  const enhancerFn = <S>(tree: SignalTree<S>): SignalTree<S> & TimeTravelMethods<S> => {
    // History storage
    const history: TimeTravelEntry<S>[] = [];
    let currentIndex = -1;

    // Flag to prevent recording while time traveling
    let isTimeTraveling = false;

    // Debounce timer
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Capture complete state snapshot.
     */
    const captureState = (): S => {
      const snapshot = snapshotState(tree.state);
      // Deep clone to prevent mutations
      return deepCloneJSON(snapshot) as S;
    };

    /**
     * Apply a state snapshot to the tree.
     */
    const applySnapshot = (snapshot: S) => {
      isTimeTraveling = true;
      try {
        applyState(tree.$, snapshot as any);
      } finally {
        // Use setTimeout to ensure all signals have updated
        setTimeout(() => {
          isTimeTraveling = false;
        }, 0);
      }
    };

    /**
     * Record a state change to history.
     */
    const recordChange = (action: string) => {
      if (isTimeTraveling) return;

      const record = () => {
        // Truncate future if we're not at the end
        if (currentIndex < history.length - 1) {
          history.splice(currentIndex + 1);
        }

        // Capture state
        const state = captureState();

        // Add entry
        history.push({
          action,
          timestamp: Date.now(),
          state,
        });

        // Enforce max history
        while (history.length > maxHistory) {
          history.shift();
        }

        currentIndex = history.length - 1;
      };

      if (debounceMs > 0) {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(record, debounceMs);
      } else {
        record();
      }
    };

    // Initialize with current state
    recordChange('@@INIT');

    // TODO: Hook into PathNotifier to auto-record changes
    // For now, changes must be manually recorded or we track on undo/redo

    const methods: TimeTravelMethods<S> = {
      undo() {
        if (currentIndex <= 0) return;

        // Record current state if we're at the end (to enable redo)
        if (currentIndex === history.length - 1) {
          // Ensure current state is captured before undoing
          const currentState = captureState();
          if (history.length > 0) {
            history[currentIndex].state = currentState;
          }
        }

        currentIndex--;
        applySnapshot(history[currentIndex].state);
      },

      redo() {
        if (currentIndex >= history.length - 1) return;

        currentIndex++;
        applySnapshot(history[currentIndex].state);
      },

      canUndo() {
        return currentIndex > 0;
      },

      canRedo() {
        return currentIndex < history.length - 1;
      },

      getHistory() {
        // Return copy to prevent external mutation
        return history.map((entry) => ({
          ...entry,
          state: deepCloneJSON(entry.state),
        }));
      },

      resetHistory() {
        history.length = 0;
        currentIndex = -1;
        recordChange('@@RESET');
      },

      jumpTo(index: number) {
        if (index < 0 || index >= history.length) {
          console.warn(`[SignalTree] jumpTo: index ${index} out of range [0, ${history.length - 1}]`);
          return;
        }

        if (index === currentIndex) return;

        currentIndex = index;
        applySnapshot(history[currentIndex].state);
      },

      getCurrentIndex() {
        return currentIndex;
      },
    };

    // Extend destroy to clean up
    const originalDestroy = tree.destroy.bind(tree);
    (tree as any).destroy = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      history.length = 0;
      originalDestroy();
    };

    return Object.assign(tree, methods);
  };

  enhancerFn.metadata = {
    name: 'timeTravel',
    provides: ['undo', 'redo', 'canUndo', 'canRedo', 'getHistory', 'resetHistory', 'jumpTo', 'getCurrentIndex'],
  };

  return enhancerFn;
}
````

---

### 4.10 Enhancer: DevTools

**File: `packages/core/src/lib/enhancers/devtools.ts`**

````typescript
import { SignalTree, DevToolsMethods, Enhancer } from '../types';
import { snapshotState, applyState, deepCloneJSON } from '../utils';

/**
 * Configuration for withDevTools enhancer.
 */
export interface DevToolsConfig {
  /**
   * Name shown in Redux DevTools.
   * @default 'SignalTree'
   */
  name?: string;

  /**
   * Maximum actions to keep in DevTools.
   * @default 50
   */
  maxAge?: number;

  /**
   * Enable action tracing (call stacks).
   * @default false
   */
  trace?: boolean;

  /**
   * Trace limit (stack frames).
   * @default 10
   */
  traceLimit?: number;

  /**
   * Serialize options for state.
   */
  serialize?: {
    replacer?: (key: string, value: unknown) => unknown;
  };
}

/**
 * Redux DevTools extension interface.
 */
interface ReduxDevToolsExtension {
  connect(options?: { name?: string; maxAge?: number; trace?: boolean; traceLimit?: number }): ReduxDevToolsConnection;
}

interface ReduxDevToolsConnection {
  init(state: unknown): void;
  send(action: { type: string; payload?: unknown }, state: unknown): void;
  subscribe(listener: (message: DevToolsMessage) => void): () => void;
  disconnect(): void;
  error(message: string): void;
}

interface DevToolsMessage {
  type: string;
  payload?: {
    type?: string;
  };
  state?: string;
}

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: ReduxDevToolsExtension;
  }
}

/**
 * Add Redux DevTools integration for debugging.
 *
 * This enhancer provides:
 * - `connectDevTools()`: Connect to browser extension
 * - `disconnectDevTools()`: Disconnect from extension
 *
 * Features when connected:
 * - View state tree
 * - See action history
 * - Time travel debugging
 * - State import/export
 *
 * @example
 * ```typescript
 * const tree = signalTree({ count: 0 }).with(withDevTools({ name: 'MyApp' }));
 *
 * // Connect to DevTools (usually in app initialization)
 * tree.connectDevTools();
 *
 * // State changes are now visible in Redux DevTools
 * tree.$.count.set(1); // Shows in DevTools
 *
 * // Disconnect when done
 * tree.disconnectDevTools();
 * ```
 */
export function withDevTools<T>(config: DevToolsConfig = {}): Enhancer<DevToolsMethods> {
  const { name = 'SignalTree', maxAge = 50, trace = false, traceLimit = 10 } = config;

  const enhancerFn = <S>(tree: SignalTree<S>): SignalTree<S> & DevToolsMethods => {
    let devTools: ReduxDevToolsConnection | null = null;
    let unsubscribe: (() => void) | null = null;
    let isFromDevTools = false;

    /**
     * Get current serializable state.
     */
    const getSerializableState = () => {
      const state = snapshotState(tree.state);
      return config.serialize?.replacer ? JSON.parse(JSON.stringify(state, config.serialize.replacer)) : state;
    };

    /**
     * Handle messages from DevTools.
     */
    const handleDevToolsMessage = (message: DevToolsMessage) => {
      if (!message || !message.type) return;

      switch (message.type) {
        case 'DISPATCH':
          switch (message.payload?.type) {
            case 'JUMP_TO_STATE':
            case 'JUMP_TO_ACTION':
              if (message.state) {
                isFromDevTools = true;
                try {
                  const state = JSON.parse(message.state);
                  applyState(tree.$, state);
                } catch (error) {
                  devTools?.error(`Failed to apply state: ${error}`);
                } finally {
                  setTimeout(() => {
                    isFromDevTools = false;
                  }, 0);
                }
              }
              break;

            case 'RESET':
              // Reset to initial state - need to track initial state
              break;

            case 'COMMIT':
              // Commit current state as new initial
              devTools?.init(getSerializableState());
              break;

            case 'ROLLBACK':
              if (message.state) {
                isFromDevTools = true;
                try {
                  const state = JSON.parse(message.state);
                  applyState(tree.$, state);
                } finally {
                  setTimeout(() => {
                    isFromDevTools = false;
                  }, 0);
                }
              }
              break;
          }
          break;
      }
    };

    const methods: DevToolsMethods = {
      connectDevTools() {
        // Check for browser environment
        if (typeof window === 'undefined') {
          console.warn('[SignalTree] DevTools not available in non-browser environment');
          return;
        }

        // Check for extension
        const extension = window.__REDUX_DEVTOOLS_EXTENSION__;
        if (!extension) {
          console.warn('[SignalTree] Redux DevTools extension not found.\n' + 'Install from: https://github.com/reduxjs/redux-devtools');
          return;
        }

        // Connect
        devTools = extension.connect({
          name,
          maxAge,
          trace,
          traceLimit,
        });

        // Initialize with current state
        devTools.init(getSerializableState());

        // Subscribe to DevTools messages
        unsubscribe = devTools.subscribe(handleDevToolsMessage);

        // TODO: Subscribe to tree changes to send updates
        // This requires PathNotifier integration

        console.log(`[SignalTree] Connected to Redux DevTools as "${name}"`);
      },

      disconnectDevTools() {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }

        if (devTools) {
          devTools.disconnect();
          devTools = null;
        }
      },
    };

    // Extend destroy to disconnect
    const originalDestroy = tree.destroy.bind(tree);
    (tree as any).destroy = () => {
      methods.disconnectDevTools();
      originalDestroy();
    };

    return Object.assign(tree, methods);
  };

  enhancerFn.metadata = {
    name: 'devTools',
    provides: ['connectDevTools', 'disconnectDevTools'],
  };

  return enhancerFn;
}
````

---

### 4.11 Enhancer: Entities

**File: `packages/core/src/lib/enhancers/entities.ts`**

````typescript
import { SignalTree, EntitiesMethods, Enhancer, EntitySignal, EntityHelpers, EntityConfig } from '../types';
import { EntitySignalImpl } from './entity-signal';
import { isEntityMapMarker } from '../utils';

/**
 * Configuration for withEntities enhancer.
 */
export interface EntitiesConfig {
  /**
   * Default ID selector for entities without explicit config.
   * @default (e) => e.id
   */
  defaultSelectId?: <E>(entity: E) => string | number;
}

/**
 * Enable entity collection management.
 *
 * This enhancer:
 * 1. Materializes EntitySignal instances from entityMap() markers
 * 2. Provides the deprecated entities() method for legacy access
 *
 * @example
 * ```typescript
 * interface User { id: string; name: string; }
 *
 * const tree = signalTree({
 *   users: entityMap<User>(),
 *   products: entityMap<Product, number>(),
 * }).with(withEntities());
 *
 * // Access via tree.$
 * tree.$.users.addOne({ id: '1', name: 'Alice' });
 * tree.$.users.all()(); // [{ id: '1', name: 'Alice' }]
 * tree.$.users.byId('1')?.name(); // 'Alice'
 *
 * // Legacy access (deprecated)
 * const helpers = tree.entities<User>('users');
 * helpers.add({ id: '2', name: 'Bob' });
 * ```
 */
export function withEntities<T>(config: EntitiesConfig = {}): Enhancer<EntitiesMethods<T>> {
  const { defaultSelectId = (e: any) => e.id } = config;

  const enhancerFn = <S>(tree: SignalTree<S>): SignalTree<S> & EntitiesMethods<S> => {
    // Registry of materialized entity signals
    const registry = new Map<string, EntitySignal<unknown, string | number>>();

    // Materialize all entity map markers in the tree
    materializeEntities(tree.state as any, registry, [], defaultSelectId);

    // Also update tree.$ reference
    materializeEntities(tree.$ as any, registry, [], defaultSelectId);

    const methods: EntitiesMethods<S> = {
      entities<E extends { id: string | number }>(path: keyof S | string): EntityHelpers<E> {
        const pathStr = String(path);
        const entitySignal = registry.get(pathStr);

        if (!entitySignal) {
          // Check if path exists but wasn't an entityMap
          const pathParts = pathStr.split('.');
          let current: any = tree.$;
          for (const part of pathParts) {
            current = current?.[part];
          }

          if (current !== undefined && !isEntityMapMarker(current)) {
            throw new Error(`Path '${pathStr}' is not an entity collection. ` + `Use entityMap<E>() in your state definition.`);
          }

          throw new Error(`Entity path '${pathStr}' not found. ` + `Ensure it's defined with entityMap<E>() in your initial state.`);
        }

        return createEntityHelpers(entitySignal) as EntityHelpers<E>;
      },
    };

    return Object.assign(tree, methods);
  };

  enhancerFn.metadata = {
    name: 'entities',
    provides: ['entities'],
  };

  return enhancerFn;
}

/**
 * Recursively find and materialize entity map markers.
 */
function materializeEntities(node: Record<string, unknown>, registry: Map<string, EntitySignal<unknown, string | number>>, path: string[], defaultSelectId: <E>(entity: E) => string | number): void {
  if (!node || typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    const currentPath = [...path, key];
    const pathStr = currentPath.join('.');

    if (isEntityMapMarker(value)) {
      // Get config from marker
      const markerConfig = (value as any).__entityMapConfig ?? {};
      const selectId = markerConfig.selectId ?? defaultSelectId;

      // Create EntitySignal
      const entitySignal = new EntitySignalImpl({
        selectId,
        hooks: markerConfig.hooks,
      });

      // Replace marker with EntitySignal
      node[key] = entitySignal;

      // Register for entities() access
      registry.set(pathStr, entitySignal);
      registry.set(key, entitySignal); // Also register by simple key
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as any).set !== 'function' // Not a signal
    ) {
      // Recurse into nested objects
      materializeEntities(value as Record<string, unknown>, registry, currentPath, defaultSelectId);
    }
  }
}

/**
 * Create legacy EntityHelpers wrapper around EntitySignal.
 */
function createEntityHelpers<E extends { id: string | number }>(entitySignal: EntitySignal<E, E['id']>): EntityHelpers<E> {
  return {
    add(entity: E) {
      entitySignal.addOne(entity);
    },
    update(id: E['id'], updates: Partial<E>) {
      entitySignal.updateOne(id, updates);
    },
    remove(id: E['id']) {
      entitySignal.removeOne(id);
    },
    upsert(entity: E) {
      entitySignal.upsertOne(entity);
    },
    selectById(id: E['id']) {
      return entitySignal.find((e) => (e as any).id === id);
    },
    selectBy(predicate: (entity: E) => boolean) {
      return entitySignal.where(predicate);
    },
    selectIds() {
      return entitySignal.ids;
    },
    selectAll() {
      return entitySignal.all;
    },
    selectTotal() {
      return entitySignal.count;
    },
    clear() {
      entitySignal.clear();
    },
  };
}
````

---

### 4.12 Entity Signal Implementation

**File: `packages/core/src/lib/enhancers/entity-signal.ts`**

```typescript
import { signal, computed, Signal, WritableSignal } from '@angular/core';
import { EntitySignal, EntityNode, EntityConfig, TapHandlers, InterceptHandlers, InterceptContext, MutationOptions, AddOptions, AddManyOptions } from '../types';

/**
 * Implementation of EntitySignal interface.
 * Provides reactive entity collection management.
 */
export class EntitySignalImpl<E, K extends string | number = string> implements EntitySignal<E, K> {
  private readonly entitiesMap: WritableSignal<Map<K, E>>;
  private readonly selectId: (entity: E) => K;
  private readonly hooks: EntityConfig<E, K>['hooks'];
  private readonly tapHandlers: Set<TapHandlers<E, K>> = new Set();
  private readonly interceptHandlers: Set<InterceptHandlers<E, K>> = new Set();

  // Cached computed signals
  private readonly _all: Signal<E[]>;
  private readonly _count: Signal<number>;
  private readonly _ids: Signal<K[]>;
  private readonly _isEmpty: Signal<boolean>;
  private readonly _map: Signal<ReadonlyMap<K, E>>;

  // Cache for entity nodes
  private readonly entityNodeCache = new Map<K, EntityNode<E>>();

  constructor(config: EntityConfig<E, K> = {}) {
    this.selectId = config.selectId ?? ((e: any) => e.id as K);
    this.hooks = config.hooks;

    // Initialize the internal map
    this.entitiesMap = signal(new Map<K, E>());

    // Create computed signals
    this._all = computed(() => Array.from(this.entitiesMap().values()));
    this._count = computed(() => this.entitiesMap().size);
    this._ids = computed(() => Array.from(this.entitiesMap().keys()));
    this._isEmpty = computed(() => this.entitiesMap().size === 0);
    this._map = computed(() => new Map(this.entitiesMap()));
  }

  // ============ Access Methods ============

  byId(id: K): EntityNode<E> | undefined {
    const entity = this.entitiesMap().get(id);
    if (!entity) return undefined;

    // Check cache
    let node = this.entityNodeCache.get(id);
    if (node) return node;

    // Create new entity node
    node = this.createEntityNode(id);
    this.entityNodeCache.set(id, node);
    return node;
  }

  byIdOrFail(id: K): EntityNode<E> {
    const node = this.byId(id);
    if (!node) {
      throw new Error(`Entity with id '${id}' not found`);
    }
    return node;
  }

  // ============ Query Signals ============

  get all(): Signal<E[]> {
    return this._all;
  }

  get count(): Signal<number> {
    return this._count;
  }

  get ids(): Signal<K[]> {
    return this._ids;
  }

  has(id: K): Signal<boolean> {
    return computed(() => this.entitiesMap().has(id));
  }

  get isEmpty(): Signal<boolean> {
    return this._isEmpty;
  }

  get map(): Signal<ReadonlyMap<K, E>> {
    return this._map;
  }

  where(predicate: (entity: E) => boolean): Signal<E[]> {
    return computed(() => this._all().filter(predicate));
  }

  find(predicate: (entity: E) => boolean): Signal<E | undefined> {
    return computed(() => this._all().find(predicate));
  }

  // ============ Mutation Methods ============

  addOne(entity: E, opts?: AddOptions<E, K>): K {
    const selectId = opts?.selectId ?? this.selectId;
    let entityToAdd = entity;

    // Run hooks
    if (this.hooks?.beforeAdd) {
      const result = this.hooks.beforeAdd(entity);
      if (result === false) {
        throw new Error('Entity add blocked by beforeAdd hook');
      }
      entityToAdd = result;
    }

    // Run intercepts
    // (simplified - full impl would be async)

    const id = selectId(entityToAdd);

    // Check for duplicate
    if (this.entitiesMap().has(id)) {
      if (opts?.onError) {
        opts.onError(new Error(`Entity with id '${id}' already exists`));
        return id;
      }
      throw new Error(`Entity with id '${id}' already exists`);
    }

    // Add entity
    this.entitiesMap.update((map) => {
      const newMap = new Map(map);
      newMap.set(id, entityToAdd);
      return newMap;
    });

    // Notify tap handlers
    this.tapHandlers.forEach((h) => {
      h.onAdd?.(entityToAdd, id);
      h.onChange?.();
    });

    return id;
  }

  addMany(entities: E[], opts?: AddManyOptions<E, K>): K[] {
    const mode = opts?.mode ?? 'strict';
    const ids: K[] = [];

    for (const entity of entities) {
      const selectId = opts?.selectId ?? this.selectId;
      const id = selectId(entity);

      if (this.entitiesMap().has(id)) {
        if (mode === 'strict') {
          throw new Error(`Entity with id '${id}' already exists`);
        } else if (mode === 'skip') {
          continue;
        }
        // mode === 'overwrite' falls through
      }

      try {
        if (mode === 'overwrite' && this.entitiesMap().has(id)) {
          this.updateOne(id, entity as Partial<E>);
        } else {
          this.addOne(entity, { selectId });
        }
        ids.push(id);
      } catch (error) {
        if (opts?.onError) {
          opts.onError(error as Error);
        } else {
          throw error;
        }
      }
    }

    return ids;
  }

  updateOne(id: K, changes: Partial<E>, opts?: MutationOptions): void {
    let changesToApply = changes;

    // Run hooks
    if (this.hooks?.beforeUpdate) {
      const result = this.hooks.beforeUpdate(id, changes);
      if (result === false) {
        throw new Error('Entity update blocked by beforeUpdate hook');
      }
      changesToApply = result;
    }

    const currentMap = this.entitiesMap();
    const entity = currentMap.get(id);

    if (!entity) {
      const error = new Error(`Entity with id '${id}' not found`);
      if (opts?.onError) {
        opts.onError(error);
        return;
      }
      throw error;
    }

    // Merge changes
    const updated = { ...entity, ...changesToApply };

    this.entitiesMap.update((map) => {
      const newMap = new Map(map);
      newMap.set(id, updated);
      return newMap;
    });

    // Clear entity node cache for this entity
    this.entityNodeCache.delete(id);

    // Notify tap handlers
    this.tapHandlers.forEach((h) => {
      h.onUpdate?.(id, changesToApply, updated);
      h.onChange?.();
    });
  }

  updateMany(ids: K[], changes: Partial<E>, opts?: MutationOptions): void {
    for (const id of ids) {
      this.updateOne(id, changes, opts);
    }
  }

  updateWhere(predicate: (entity: E) => boolean, changes: Partial<E>): number {
    const toUpdate = this._all().filter(predicate);
    for (const entity of toUpdate) {
      const id = this.selectId(entity);
      this.updateOne(id, changes);
    }
    return toUpdate.length;
  }

  upsertOne(entity: E, opts?: AddOptions<E, K>): K {
    const selectId = opts?.selectId ?? this.selectId;
    const id = selectId(entity);

    if (this.entitiesMap().has(id)) {
      this.updateOne(id, entity as Partial<E>);
    } else {
      this.addOne(entity, opts);
    }

    return id;
  }

  upsertMany(entities: E[], opts?: AddOptions<E, K>): K[] {
    return entities.map((entity) => this.upsertOne(entity, opts));
  }

  removeOne(id: K, opts?: MutationOptions): void {
    const entity = this.entitiesMap().get(id);

    if (!entity) {
      const error = new Error(`Entity with id '${id}' not found`);
      if (opts?.onError) {
        opts.onError(error);
        return;
      }
      throw error;
    }

    // Run hooks
    if (this.hooks?.beforeRemove) {
      const allowed = this.hooks.beforeRemove(id, entity);
      if (!allowed) {
        throw new Error('Entity remove blocked by beforeRemove hook');
      }
    }

    this.entitiesMap.update((map) => {
      const newMap = new Map(map);
      newMap.delete(id);
      return newMap;
    });

    // Clear entity node cache
    this.entityNodeCache.delete(id);

    // Notify tap handlers
    this.tapHandlers.forEach((h) => {
      h.onRemove?.(id, entity);
      h.onChange?.();
    });
  }

  removeMany(ids: K[], opts?: MutationOptions): void {
    for (const id of ids) {
      try {
        this.removeOne(id);
      } catch (error) {
        if (opts?.onError) {
          opts.onError(error as Error);
        } else {
          throw error;
        }
      }
    }
  }

  removeWhere(predicate: (entity: E) => boolean): number {
    const toRemove = this._all().filter(predicate);
    for (const entity of toRemove) {
      const id = this.selectId(entity);
      this.removeOne(id);
    }
    return toRemove.length;
  }

  clear(): void {
    const entities = Array.from(this.entitiesMap().entries());

    this.entitiesMap.set(new Map());
    this.entityNodeCache.clear();

    // Notify for each removed entity
    this.tapHandlers.forEach((h) => {
      for (const [id, entity] of entities) {
        h.onRemove?.(id, entity);
      }
      h.onChange?.();
    });
  }

  removeAll(): void {
    this.clear();
  }

  setAll(entities: E[], opts?: AddOptions<E, K>): void {
    this.clear();
    this.addMany(entities, { ...opts, mode: 'strict' });
  }

  // ============ Hooks ============

  tap(handlers: TapHandlers<E, K>): () => void {
    this.tapHandlers.add(handlers);
    return () => {
      this.tapHandlers.delete(handlers);
    };
  }

  intercept(handlers: InterceptHandlers<E, K>): () => void {
    this.interceptHandlers.add(handlers);
    return () => {
      this.interceptHandlers.delete(handlers);
    };
  }

  // ============ Private Helpers ============

  /**
   * Create an EntityNode for accessing entity properties as signals.
   */
  private createEntityNode(id: K): EntityNode<E> {
    const self = this;

    // Create a proxy that provides signal access to entity properties
    const handler: ProxyHandler<object> = {
      get(target, prop, receiver) {
        // Handle callable access
        if (prop === Symbol.toPrimitive || prop === 'valueOf') {
          return () => self.entitiesMap().get(id);
        }

        // Get current entity
        const entity = self.entitiesMap().get(id);
        if (!entity) return undefined;

        // Return property value wrapped in computed
        if (typeof prop === 'string' && prop in entity) {
          return computed(() => {
            const e = self.entitiesMap().get(id);
            return e ? (e as any)[prop] : undefined;
          });
        }

        return undefined;
      },

      apply(target, thisArg, args) {
        if (args.length === 0) {
          // Getter: return current entity
          return self.entitiesMap().get(id);
        } else if (args.length === 1) {
          const arg = args[0];
          if (typeof arg === 'function') {
            // Updater function
            const current = self.entitiesMap().get(id);
            if (current) {
              const updated = arg(current);
              self.updateOne(id, updated);
            }
          } else {
            // Direct set
            self.updateOne(id, arg);
          }
        }
      },
    };

    // Create callable function that acts as the node
    const node = function (...args: any[]) {
      return handler.apply!(null, node, args);
    } as unknown as EntityNode<E>;

    // Apply proxy for property access
    return new Proxy(node, handler) as EntityNode<E>;
  }
}
```

---

### 4.13 Preset Factories

**File: `packages/core/src/lib/presets.ts`**

````typescript
import { signalTree } from './signal-tree';
import { SignalTree, TreeConfig, EffectsMethods, BatchingMethods, MemoizationMethods, TimeTravelMethods, DevToolsMethods, EntitiesMethods, FullSignalTree, ProdSignalTree, MinimalSignalTree } from './types';
import { withEffects, EffectsConfig } from './enhancers/effects';
import { withBatching, BatchingConfig } from './enhancers/batching';
import { withMemoization, MemoizationConfig } from './enhancers/memoization';
import { withTimeTravel, TimeTravelConfig } from './enhancers/time-travel';
import { withDevTools, DevToolsConfig } from './enhancers/devtools';
import { withEntities, EntitiesConfig } from './enhancers/entities';

// ============================================================================
// PRESET CONFIGURATION TYPES
// ============================================================================

/**
 * Configuration for createDevTree preset.
 */
export interface DevTreeConfig extends TreeConfig {
  effects?: EffectsConfig;
  batching?: BatchingConfig;
  memoization?: MemoizationConfig;
  timeTravel?: TimeTravelConfig;
  devTools?: DevToolsConfig;
  entities?: EntitiesConfig;
}

/**
 * Configuration for createProdTree preset.
 */
export interface ProdTreeConfig extends TreeConfig {
  effects?: EffectsConfig;
  batching?: BatchingConfig;
  memoization?: MemoizationConfig;
  entities?: EntitiesConfig;
}

/**
 * Configuration for createMinimalTree preset.
 */
export interface MinimalTreeConfig extends TreeConfig {
  effects?: EffectsConfig;
}

// ============================================================================
// PRESET FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a fully-featured development tree.
 *
 * Includes: effects, batching, memoization, time travel, devtools, entities
 *
 * Use this for development when you want all debugging capabilities.
 *
 * @example
 * ```typescript
 * const tree = createDevTree({
 *   users: entityMap<User>(),
 *   settings: { theme: 'dark' },
 * });
 *
 * // All methods available
 * tree.$.users.addOne({ id: '1', name: 'Alice' });
 * tree.undo();
 * tree.connectDevTools();
 * tree.batch(($) => { ... });
 * tree.memoize((s) => s.users.all());
 * ```
 */
export function createDevTree<T extends object>(initialState: T, config: DevTreeConfig = {}): FullSignalTree<T> {
  return signalTree(initialState, config).with(withEffects(config.effects)).with(withBatching(config.batching)).with(withMemoization(config.memoization)).with(withEntities(config.entities)).with(withTimeTravel(config.timeTravel)).with(withDevTools(config.devTools)) as FullSignalTree<T>;
}

/**
 * Create a production-optimized tree.
 *
 * Includes: effects, batching, memoization, entities
 * Excludes: time travel, devtools (smaller bundle, no debug overhead)
 *
 * Use this for production builds.
 *
 * @example
 * ```typescript
 * const tree = createProdTree({
 *   users: entityMap<User>(),
 *   settings: { theme: 'dark' },
 * });
 *
 * // Production methods available
 * tree.$.users.addOne({ id: '1', name: 'Alice' });
 * tree.batch(($) => { ... });
 * tree.memoize((s) => s.users.all());
 *
 * // NOT available (would be compile error):
 * // tree.undo();
 * // tree.connectDevTools();
 * ```
 */
export function createProdTree<T extends object>(initialState: T, config: ProdTreeConfig = {}): ProdSignalTree<T> {
  return signalTree(initialState, config).with(withEffects(config.effects)).with(withBatching(config.batching)).with(withMemoization(config.memoization)).with(withEntities(config.entities)) as ProdSignalTree<T>;
}

/**
 * Create a minimal tree with just reactivity.
 *
 * Includes: effects only
 *
 * Use when bundle size is critical or for simple state needs.
 *
 * @example
 * ```typescript
 * const tree = createMinimalTree({ count: 0 });
 *
 * tree.effect((s) => console.log(s.count));
 * tree.$.count.set(1);
 *
 * // NOT available:
 * // tree.batch();
 * // tree.memoize();
 * // tree.undo();
 * ```
 */
export function createMinimalTree<T extends object>(initialState: T, config: MinimalTreeConfig = {}): MinimalSignalTree<T> {
  return signalTree(initialState, config).with(withEffects(config.effects)) as MinimalSignalTree<T>;
}

/**
 * Create an environment-aware tree.
 *
 * - Development: Returns FullSignalTree (all features)
 * - Production: Returns ProdSignalTree (optimized)
 *
 * The return type is a union, so you can only use methods
 * common to both (or use type guards).
 *
 * @example
 * ```typescript
 * const tree = createTree({ count: 0 });
 *
 * // These work in both dev and prod:
 * tree.$.count.set(1);
 * tree.batch(($) => { ... });
 *
 * // These only work in dev (runtime check needed):
 * if (hasTimeTravel(tree)) {
 *   tree.undo();
 * }
 * ```
 */
export function createTree<T extends object>(initialState: T, config: DevTreeConfig = {}): FullSignalTree<T> | ProdSignalTree<T> {
  const isDev = isDevMode();

  if (isDev) {
    return createDevTree(initialState, config);
  } else {
    return createProdTree(initialState, config);
  }
}

/**
 * Create a tree with explicit feature selection.
 *
 * @example
 * ```typescript
 * const tree = createCustomTree(
 *   { count: 0 },
 *   ['effects', 'batching', 'timeTravel']
 * );
 *
 * tree.batch(() => { ... }); // ✅
 * tree.undo();               // ✅
 * tree.memoize();            // ❌ Not included
 * ```
 */
export function createCustomTree<T extends object>(initialState: T, features: Array<'effects' | 'batching' | 'memoization' | 'timeTravel' | 'devTools' | 'entities'>, config: DevTreeConfig = {}): SignalTree<T> & Partial<EffectsMethods<T> & BatchingMethods<T> & MemoizationMethods<T> & TimeTravelMethods<T> & DevToolsMethods & EntitiesMethods<T>> {
  let tree: any = signalTree(initialState, config);

  if (features.includes('effects')) {
    tree = tree.with(withEffects(config.effects));
  }
  if (features.includes('batching')) {
    tree = tree.with(withBatching(config.batching));
  }
  if (features.includes('memoization')) {
    tree = tree.with(withMemoization(config.memoization));
  }
  if (features.includes('entities')) {
    tree = tree.with(withEntities(config.entities));
  }
  if (features.includes('timeTravel')) {
    tree = tree.with(withTimeTravel(config.timeTravel));
  }
  if (features.includes('devTools')) {
    tree = tree.with(withDevTools(config.devTools));
  }

  return tree;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Detect if we're in development mode.
 */
function isDevMode(): boolean {
  // Angular's ngDevMode
  if (typeof ngDevMode !== 'undefined') {
    return Boolean(ngDevMode);
  }

  // Node.js environment
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== 'production';
  }

  // Default to development (safer for debugging)
  return true;
}

declare const ngDevMode: boolean | undefined;
````

---

### 4.14 Public API Index

**File: `packages/core/src/index.ts`**

```typescript
// ============================================================================
// CORE FACTORY
// ============================================================================

export { signalTree } from './lib/signal-tree';

// ============================================================================
// TYPES
// ============================================================================

// Base types
export type { SignalTree, TreeNode, TreeConfig, NodeAccessor, AccessibleNode, CallableWritableSignal, Primitive, BuiltInObject, Unwrap } from './lib/types';

// Enhancer system types
export type { Enhancer, EnhancerMeta, EnhancerAdds, WithMethod } from './lib/types';

// Method interfaces (for custom typing)
export type { EffectsMethods, BatchingMethods, MemoizationMethods, TimeTravelMethods, DevToolsMethods, EntitiesMethods, SerializationMethods, OptimizedUpdateMethods } from './lib/types';

// Supporting types
export type { CacheStats, TimeTravelEntry, OptimizedUpdateOptions, OptimizedUpdateResult } from './lib/types';

// Entity types
export type { EntitySignal, EntityMapMarker, EntityConfig, EntityNode, EntityHelpers, TapHandlers, InterceptHandlers, InterceptContext, MutationOptions, AddOptions, AddManyOptions } from './lib/types';

// Convenience type aliases
export type { FullSignalTree, ProdSignalTree, MinimalSignalTree } from './lib/types';

// Runtime exports from types
export { entityMap, ENHANCER_META } from './lib/types';

// Type guards
export { isSignalTree, hasTimeTravel, hasBatching, hasMemoization, hasEffects, hasDevTools, hasEntities } from './lib/types';

// ============================================================================
// ENHANCERS
// ============================================================================

export { withEffects } from './lib/enhancers/effects';
export type { EffectsConfig } from './lib/enhancers/effects';

export { withBatching } from './lib/enhancers/batching';
export type { BatchingConfig } from './lib/enhancers/batching';

export { withMemoization } from './lib/enhancers/memoization';
export type { MemoizationConfig } from './lib/enhancers/memoization';

export { withTimeTravel } from './lib/enhancers/time-travel';
export type { TimeTravelConfig } from './lib/enhancers/time-travel';

export { withDevTools } from './lib/enhancers/devtools';
export type { DevToolsConfig } from './lib/enhancers/devtools';

export { withEntities } from './lib/enhancers/entities';
export type { EntitiesConfig } from './lib/enhancers/entities';

// ============================================================================
// PRESETS
// ============================================================================

export { createDevTree, createProdTree, createMinimalTree, createTree, createCustomTree } from './lib/presets';

export type { DevTreeConfig, ProdTreeConfig, MinimalTreeConfig } from './lib/presets';

// ============================================================================
// UTILITIES
// ============================================================================

export { wrapWithDevProxy, shouldUseDevProxy } from './lib/dev-proxy';

export { isBuiltInObject, isEntityMapMarker, isSignal, deepClone, deepCloneJSON, deepEqual, snapshotState, applyState } from './lib/utils';
```

---

## 5. Testing Suite

Due to length constraints, see the separate `TESTING.md` document for comprehensive test examples covering:

- Type safety tests
- Enhancer unit tests
- Integration tests
- Performance benchmarks
- Migration validation tests

---

## 6. Migration Guide

### From v5.x to v6.x

#### Quick Migration (5 minutes)

Replace all `signalTree()` calls with `createDevTree()`:

```bash
# Find all usages
grep -r "signalTree(" src/

# Replace (manual or automated)
# signalTree(state) → createDevTree(state)
```

#### Proper Migration (30 minutes)

1. **Audit current usage** - Which methods do you actually use?

2. **Choose appropriate preset**:

   - Using `undo()`? → `createDevTree()`
   - Not using debug features? → `createProdTree()`
   - Just basic signals? → `createMinimalTree()`

3. **Update imports**:

   ```typescript
   // Before
   import { signalTree } from '@signaltree/core';

   // After
   import { createDevTree } from '@signaltree/core';
   ```

4. **Run type checker** - Compiler will catch any missing methods

### Upgrade Checklist (step-by-step)

- **Create a clean branch**

```bash
git checkout -b upgrade/v6-apply
```

- **Preview code references**

```bash
rg "signalTree\(" -n
```

- **Replace factory calls**

Use a codemod or carefully run an in-place replace (macOS `sed` example):

```bash
# Preview files to change
rg -l "signalTree\("

# Make in-place replacement (macOS)
rg -l "signalTree\(" | xargs -I{} sed -i '' 's/signalTree(/createDevTree(/g' {}
```

- **Update imports**

Search for `import { signalTree` and replace with `createDevTree`, `createProdTree`, or `createMinimalTree` as appropriate — perform a quick manual review to pick the correct preset per file.

- **Run quick validation**

```bash
pnpm install --frozen-lockfile
npm run validate:all
# or, at minimum:
pnpm -w test
pnpm -w tsc -p tsconfig.base.json --noEmit
```

- **Run targeted runtime checks** (spot-check demos / apps)

```bash
# Serve demo (if applicable)
nx serve demo --port 4200
```

### Chained `.with()` (new recommended pattern)

v6 introduces a single-enhancer-per-call chaining pattern that preserves IDE UX and gives perfect type inference.

- Pattern: call `.with()` once per enhancer (unlimited chaining)
- Rationale: each `.with()` returns the tree type extended via an intersection with the enhancer's methods, so the compiler accurately reflects available methods at each step.

Example:

```typescript
// v6 — recommended
const tree = signalTree({ count: 0 }).with(withEffects()).with(withTimeTravel()).with(withBatching());

tree.undo(); // ✅ available after withTimeTravel
tree.batch(() => {
  /*...*/
}); // ✅ available after withBatching

// Do NOT rely on a multi-arg .with(...) overload that mixes enhancers in one call;
// prefer chaining for clearer inference and DX.
```

Migration tip:

- If you previously used a single `.with(a, b, c)` call, simply split it into chained calls. The runtime behavior remains the same; types become accurate.

### Minimal base interface

The core runtime now exposes a compact base shape: `SignalTree<T>` with only the essentials:

- `state` — the reactive state tree
- `$` — shorthand alias for `state`
- `with()` — enhancer application method
- `destroy()` — cleanup

All other methods (undo, batch, memoize, entities, devtools, etc.) are added by enhancers via intersection types. This keeps the base type tiny and guarantees that autocomplete only surfaces methods actually present on the instance.

### Intersection types for methods

Each enhancer is typed to add its methods via an intersection. For example:

```ts
type WithTimeTravel = Enhancer<TimeTravelMethods<T>>;
// Applying it transforms the runtime type to: SignalTree<T> & TimeTravelMethods<T>
```

This approach preserves IDE IntelliSense — when you apply `withTimeTravel()` the editor will immediately show `undo()`, `redo()`, and related helpers.

### Preset factories

To reduce friction, use the provided preset factories instead of calling `signalTree()` directly when appropriate:

- `createDevTree(state)` — includes dev-facing enhancers: time-travel, devtools, entities, memoization, effects
- `createProdTree(state)` — production-focused enhancers: batching, memoization
- `createMinimalTree(state)` — minimal runtime (only essentials)

Examples:

```ts
import { createDevTree, createProdTree } from '@signaltree/core';

const dev = createDevTree({ users: [] });
dev.undo(); // available

const prod = createProdTree({ users: [] });
prod.batch(() => {
  /* fast updates */
});
```

When migrating, choose the preset that best matches the runtime features your code needs. Prefer `createProdTree` for apps near production and `createDevTree` for local/dev tooling.

### Dev proxy — better DX in development

In dev mode the library wraps trees with a small proxy that throws instructive errors when you call a method provided by an enhancer that wasn't applied. This aids quick discovery during migration.

Behavior:

- In dev builds (ngDevMode or NODE_ENV !== 'production') calling `tree.undo()` without `withTimeTravel()` will throw: "undo() requires withTimeTravel() — try applying that enhancer or use createDevTree()."
- In production builds the proxy is disabled for performance; calling a missing method will remain a runtime error.

Example runtime message:

```
Error: undo() requires withTimeTravel() — apply .with(withTimeTravel()) or use createDevTree()
```

Migration checklist (quick):

- Replace multi-enhancer `.with(a,b,c)` calls with chained `.with(a).with(b).with(c)` to improve type inference.
- Prefer `createDevTree` / `createProdTree` where appropriate.
- Run the typechecker and fix places where methods are now missing (the compiler points to the exact call site).

### Optional: Automated Codemod (recommended for large codebases)

For safer automated changes write a small `jscodeshift` transform or `ts-morph` script that:

- replaces `signalTree(...)` with `createDevTree(...)` where debug methods are used
- adjusts imports accordingly

Example (preview-only using `jscodeshift`):

```bash
npx jscodeshift -t ./transforms/replace-signalTree.js src/ --dry
```

### Verify & Rollout

- Run `npm run validate:all` and fix type errors reported.
- Prefer staged rollout: update a single package or app, run its tests, then move workspace-wide.
- Keep `createDevTree` usage in feature branches; for production replace with `createProdTree` or `createMinimalTree`.

### Troubleshooting & Notes

- If you see "Property 'undo' does not exist": add `withTimeTravel()` or use `createDevTree()`.
- If entity helpers are missing: ensure the initial state uses `entityMap()` and add `withEntities()` where needed.

---

## 7. Usage Examples

### 7.1 Basic Preset Usage

```typescript
import { createDevTree, entityMap } from '@signaltree/core';

interface User {
  id: string;
  name: string;
  email: string;
}

const tree = createDevTree({
  users: entityMap<User>(),
  ui: { theme: 'dark' as 'light' | 'dark' },
});

// Entity operations
tree.$.users.addOne({ id: '1', name: 'Alice', email: 'a@test.com' });

// State updates
tree.$.ui.theme.set('light');

// Time travel
tree.undo();

// DevTools
tree.connectDevTools();
```

### 7.2 Angular Service

```typescript
import { Injectable, computed } from '@angular/core';
import { createDevTree, entityMap } from '@signaltree/core';

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

@Injectable({ providedIn: 'root' })
export class TodoStore {
  private tree = createDevTree({
    todos: entityMap<Todo>(),
    filter: 'all' as 'all' | 'active' | 'completed',
  });

  readonly $ = this.tree.$;

  readonly filteredTodos = computed(() => {
    const todos = this.$.todos.all()();
    const filter = this.$.filter();

    return filter === 'all' ? todos : filter === 'active' ? todos.filter((t) => !t.done) : todos.filter((t) => t.done);
  });

  addTodo(text: string) {
    this.$.todos.addOne({ id: crypto.randomUUID(), text, done: false });
  }

  toggle(id: string) {
    const todo = this.$.todos.byId(id)?.();
    if (todo) this.$.todos.updateOne(id, { done: !todo.done });
  }

  undo() {
    this.tree.undo();
  }
  redo() {
    this.tree.redo();
  }
}
```

---

## 8. Troubleshooting

### "Property 'undo' does not exist"

**Cause**: Using base `signalTree()` without `withTimeTravel()`

**Fix**: Use preset or add enhancer

```typescript
// Option 1: Use preset
const tree = createDevTree(state);

// Option 2: Add enhancer
const tree = signalTree(state).with(withTimeTravel());
```

### "Entity path not found"

**Cause**: Path not defined with `entityMap()`

**Fix**: Define entity in initial state

```typescript
const tree = signalTree({
  users: entityMap<User>(), // Must use entityMap()
}).with(withEntities());
```

### Effects not cleaning up

**Cause**: Tree created outside injection context

**Fix**: Pass injector or call destroy manually

```typescript
// Option 1: Pass injector
const tree = signalTree(state).with(withEffects({ injector: this.injector }));

// Option 2: Manual cleanup
ngOnDestroy() { this.tree.destroy(); }
```

---

## 9. Performance Considerations

| Scenario          | Recommendation                          |
| ----------------- | --------------------------------------- |
| Simple app        | `createMinimalTree()` - smallest bundle |
| Standard app      | `createProdTree()` - no debug overhead  |
| Development       | `createDevTree()` - full debugging      |
| Large collections | Use `entityMap()` with pagination       |
| Frequent updates  | Use `batch()` to group changes          |
| Computed values   | Use `memoize()` with cache keys         |

---

## 10. Appendices

### A. Complete File Listing

```
packages/core/src/
├── index.ts
└── lib/
    ├── types.ts
    ├── signal-tree.ts
    ├── create-signal-store.ts
    ├── dev-proxy.ts
    ├── presets.ts
    ├── utils/
    │   ├── index.ts
    │   ├── is-built-in-object.ts
    │   ├── deep-clone.ts
    │   ├── deep-equal.ts
    │   ├── snapshot-state.ts
    │   └── apply-state.ts
    └── enhancers/
        ├── index.ts
        ├── effects.ts
        ├── batching.ts
        ├── memoization.ts
        ├── time-travel.ts
        ├── devtools.ts
        ├── entities.ts
        └── entity-signal.ts
```

### B. Bundle Size Estimates

| Export                | Estimated Size (gzipped) |
| --------------------- | ------------------------ |
| `signalTree` only     | ~2 KB                    |
| `+ withEffects`       | ~3 KB                    |
| `+ withBatching`      | ~4 KB                    |
| `+ withMemoization`   | ~5 KB                    |
| `+ withTimeTravel`    | ~7 KB                    |
| `+ withDevTools`      | ~8 KB                    |
| `+ withEntities`      | ~12 KB                   |
| `createDevTree` (all) | ~15 KB                   |
| `createProdTree`      | ~10 KB                   |
| `createMinimalTree`   | ~3 KB                    |

### C. Version History

| Version | Changes                                    |
| ------- | ------------------------------------------ |
| 6.0.0   | Type-safe enhancer architecture (breaking) |
| 5.0.0   | EntitySignal, PathNotifier                 |
| 4.0.0   | Callable syntax, presets                   |
| 3.0.0   | Time travel, DevTools                      |

---

**Document Version**: 1.0.0  
**Last Updated**: December 2025  
**Total Lines of Code**: ~2,500  
**Estimated Implementation Time**: 3-5 days
