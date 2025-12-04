import { Signal, WritableSignal } from '@angular/core';

import type { SecurityValidatorConfig } from './security/security-validator';

/**
 * SignalTree Core Types v2.0.2
 * MIT License - Copyright (c) 2025 Jonathan D Borgia
 */

// ============================================
// CORE TYPE DEFINITIONS
// ============================================

/**
 * Helper type preventing ambiguity when a node itself stores a function value.
 * In that case direct callable set(fn) would clash with the update(fn) signature.
 * We exclude raw function values from the direct-set overload so users must use .set(fn)
 * (after transform) instead of callable form, while updater form still works.
 */
export type NotFn<T> = T extends (...args: unknown[]) => unknown ? never : T;

// ============================================
// TYPESCRIPT AUGMENTATIONS FOR DX SUGAR
// ============================================

/**
 * Augment Angular's WritableSignal to support callable syntax for DX.
 * This is purely TypeScript-level - the transform converts these calls to .set/.update
 */
declare module '@angular/core' {
  interface WritableSignal<T> {
    (value: NotFn<T>): void;
    (updater: (current: T) => T): void;
  }
}

// ============================================
// CORE TYPE DEFINITIONS
// ============================================

/**
 * Primitive types for type checking
 */
export type Primitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | symbol;

/**
 * Built-in object types that should be treated as primitive values
 * (Keep this list in sync with runtime isBuiltInObject)
 */
export type BuiltInObject =
  // Core JS
  | Date
  | RegExp
  | ((...args: unknown[]) => unknown)
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | ArrayBuffer
  | DataView
  | Error
  | Promise<unknown>
  // Typed Arrays
  | Uint16Array
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
 * Helper type to unwrap signals and remove any signal-specific properties
 */
export type Unwrap<T> = T extends WritableSignal<infer U>
  ? U
  : T extends Signal<infer U>
  ? U
  : T extends BuiltInObject
  ? T // Preserve built-in objects exactly as they are
  : T extends readonly unknown[]
  ? T // Preserve arrays exactly as they are
  : T extends object
  ? { [K in keyof T]: Unwrap<T[K]> }
  : T;

/**
 * Node accessor interface - unified API for get/set/update via function calls.
 * Overloads:
 *  (): T                     - getter
 *  (value: NotFn<T>): void   - direct set (blocked when T is itself a function)
 *  (updater: (T)=>T): void   - functional update
 */
export interface NodeAccessor<T> {
  (): T;
  (value: T): void;
  (updater: (current: T) => T): void;
}

/**
 * Signalified node with callable interface
 */
export type AccessibleNode<T> = NodeAccessor<T> & TreeNode<T>;

/**
 * Deep signalification type - converts object properties to signals recursively
 * - Leaves (primitives, arrays, functions, built-ins): Raw Angular WritableSignal<T>
 * - Nested objects: NodeAccessor<T> (callable) + recursive TreeNode<T> properties
 */
// WritableSignal with callable set/update overloads (purely type-level augmentation)
export type CallableWritableSignal<T> = WritableSignal<T> & {
  (value: NotFn<T>): void;
  (updater: (current: T) => T): void;
};

export type TreeNode<T> = {
  [K in keyof T]: T[K] extends readonly unknown[]
    ? CallableWritableSignal<T[K]> // Arrays get callable overloads
    : T[K] extends object
    ? T[K] extends Signal<unknown>
      ? T[K]
      : T[K] extends BuiltInObject
      ? CallableWritableSignal<T[K]> // Built-ins as callable writable signals
      : T[K] extends (...args: unknown[]) => unknown
      ? CallableWritableSignal<T[K]> // Function leaves as callable writable signals
      : AccessibleNode<T[K]> // Nested objects
    : CallableWritableSignal<T[K]>; // Primitives
};

/**
 * Utility type to remove signal-specific methods from a type
 * Used by cleanUnwrap to return the original type shape
 */
export type RemoveSignalMethods<T> = T extends infer U ? U : never;

// ============================================
// DEEP PATH TYPES FOR NESTED ENTITY ACCESS
// ============================================

/**
 * Generate all possible dot-notation paths through a nested object type
 * For example, given { a: { b: { c: number } } }, generates:
 * "a" | "a.b" | "a.b.c"
 *
 * Used to support nested entity access like tree.entities<E>('app.data.users')
 * Depth is limited to 5 levels to prevent TypeScript "excessively deep" errors
 */
export type DeepPath<
  T,
  Prefix extends string = '',
  Depth extends readonly number[] = []
> = Depth['length'] extends 5
  ? never
  : {
      [K in keyof T]: K extends string
        ? T[K] extends readonly unknown[]
          ? `${Prefix}${K}` // Array found - include this path
          : T[K] extends object
          ? T[K] extends Signal<unknown>
            ? never // Skip Angular signals
            : T[K] extends BuiltInObject
            ? never // Skip built-in objects
            : T[K] extends (...args: unknown[]) => unknown
            ? never // Skip functions
            : `${Prefix}${K}` | DeepPath<T[K], `${Prefix}${K}.`, [...Depth, 1]> // Nested object - recurse
          : never // Skip primitives
        : never;
    }[keyof T];

/**
 * Safely access a value at a deep path in a type
 * For example: DeepAccess<{ a: { b: User[] } }, 'a.b'> => User[]
 *
 * Used to infer the entity type from a path string
 */
export type DeepAccess<
  T,
  Path extends string
> = Path extends `${infer First}.${infer Rest}`
  ? First extends keyof T
    ? DeepAccess<T[First] & object, Rest>
    : never
  : Path extends keyof T
  ? T[Path]
  : never;

// ============================================
// ENHANCER SYSTEM TYPES
// ============================================

/** Enhancer metadata for optional auto-ordering */
export interface EnhancerMeta {
  name?: string;
  requires?: string[];
  provides?: string[];
}

/** Enhancer function that may carry metadata */
export type Enhancer<Input = unknown, Output = unknown> = (
  input: Input
) => Output;

/** Enhancer with optional metadata attached */
export type EnhancerWithMeta<Input = unknown, Output = unknown> = Enhancer<
  Input,
  Output
> & { metadata?: EnhancerMeta };

/** Symbol key for enhancer metadata */
export const ENHANCER_META = Symbol('signaltree:enhancer:meta');

/** Infer the final result type after applying enhancers */
export type ChainResult<
  Start,
  E extends Array<EnhancerWithMeta<unknown, unknown>>
> = E extends [infer H, ...infer R]
  ? // If enhancer accepts SignalTree<any> (non-generic enhancer), treat it as compatible
    H extends EnhancerWithMeta<SignalTree<unknown>, infer O>
    ? R extends Array<EnhancerWithMeta<unknown, unknown>>
      ? ChainResult<O, R>
      : O
    : H extends EnhancerWithMeta<infer I, infer O>
    ? Start extends I
      ? R extends Array<EnhancerWithMeta<unknown, unknown>>
        ? ChainResult<O, R>
        : O
      : unknown
    : unknown
  : Start;

/**
 * Simplified overload set for .with() method
 * Reduced from 20+ complex overloads to basic patterns that TypeScript can infer.
 * For complex enhancer chains, use applyEnhancer() helper or type assertions.
 */
export interface WithMethod<T> {
  (): SignalTree<T>;
  <O>(enhancer: (input: SignalTree<T>) => O): O;
  <O1, O2>(e1: (input: SignalTree<T>) => O1, e2: (input: O1) => O2): O2;
  <O1, O2, O3>(
    e1: (input: SignalTree<T>) => O1,
    e2: (input: O1) => O2,
    e3: (input: O2) => O3
  ): O3;
  // Basic EnhancerWithMeta overloads
  <O>(enhancer: EnhancerWithMeta<SignalTree<T>, O>): O;
  <O1, O2>(
    e1: EnhancerWithMeta<SignalTree<T>, O1>,
    e2: EnhancerWithMeta<O1, O2>
  ): O2;
  <O1, O2, O3>(
    e1: EnhancerWithMeta<SignalTree<T>, O1>,
    e2: EnhancerWithMeta<O1, O2>,
    e3: EnhancerWithMeta<O2, O3>
  ): O3;
}

// ============================================
// SIGNAL TREE INTERFACE
// ============================================

/**
 * Main SignalTree type with all methods
 */
export type SignalTree<T> = NodeAccessor<T> & {
  /** The reactive state object */
  state: TreeNode<T>;

  /** Shorthand alias for state */
  $: TreeNode<T>;

  /** Core methods */
  with: WithMethod<T>;
  destroy(): void;

  /**
   * Dispose of the signal tree and clean up memory resources.
   * Only available when using lazy signals (useLazySignals: true).
   *
   * This method:
   * - Clears the memory manager cache (releases WeakRef references)
   * - Calls the cleanup function on the lazy proxy
   * - Allows garbage collection of unused signals
   *
   * @example
   * ```typescript
   * const tree = signalTree({ users: largeUserList }, { useLazySignals: true });
   * // ... use tree
   * tree.dispose(); // Clean up when done
   * ```
   */
  dispose?(): void;

  /** Enhanced functionality */
  effect(fn: (tree: T) => void): void;
  subscribe(fn: (tree: T) => void): () => void;
  batch(updater: (tree: T) => void): void;
  batchUpdate(updater: (current: T) => Partial<T>): void;
  memoize<R>(fn: (tree: T) => R, cacheKey?: string): Signal<R>;
  // Memoization helpers (stubs in core; real impl by withMemoization)
  memoizedUpdate(updater: (current: T) => Partial<T>, cacheKey?: string): void;
  clearMemoCache(key?: string): void;
  getCacheStats(): {
    size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    keys: string[];
  };

  /** Performance methods */
  optimize(): void;
  clearCache(): void;
  invalidatePattern(pattern: string): number;

  /**
   * Optimized update using diff-based patching and batching.
   * Only updates signals that actually changed, providing significant
   * performance improvements for large trees and partial updates.
   *
   * @param updates - Partial updates to apply
   * @param options - Update options (batching, equality, etc.)
   * @returns Update result with performance metrics
   *
   * @example
   * ```typescript
   * const tree = signalTree({ users: largeUserList });
   *
   * // Only updates what changed
   * const result = tree.updateOptimized({
   *   users: { 0: { name: 'Updated' } }
   * });
   *
   * console.log(result.changedPaths); // ['users.0.name']
   * console.log(result.duration); // ~2ms
   * ```
   */
  updateOptimized?(
    updates: Partial<T>,
    options?: {
      batch?: boolean;
      batchSize?: number;
      maxDepth?: number;
      ignoreArrayOrder?: boolean;
      equalityFn?: (a: unknown, b: unknown) => boolean;
    }
  ): {
    changed: boolean;
    duration: number;
    changedPaths: string[];
    stats?: {
      totalPaths: number;
      optimizedPaths: number;
      batchedUpdates: number;
    };
  };
  getMetrics(): PerformanceMetrics;

  /** Middleware */
  addTap(middleware: Middleware<T>): void;
  removeTap(id: string): void;

  /** Entity helpers - supports both top-level keys (type-checked) and nested dot-notation paths (runtime-validated) */
  entities<E extends { id: string | number }>(
    entityKey?: keyof T
  ): EntityHelpers<E>;

  /** Time travel */
  undo(): void;
  redo(): void;
  getHistory(): TimeTravelEntry<T>[];
  resetHistory(): void;
  // Optional convenience helpers provided by time-travel enhancer
  jumpTo?: (index: number) => void;
  canUndo?: () => boolean;
  canRedo?: () => boolean;
  getCurrentIndex?: () => number;

  /** Index signature for enhancer compatibility */
  [key: string]: unknown;
};

// ============================================
// CONFIGURATION TYPES
// ============================================

export type TreePreset = 'basic' | 'performance' | 'development' | 'production';

export interface TreeConfig {
  batchUpdates?: boolean;
  useMemoization?: boolean;
  enableTimeTravel?: boolean;
  useLazySignals?: boolean;
  useShallowComparison?: boolean;
  maxCacheSize?: number;
  trackPerformance?: boolean;
  treeName?: string;
  enableDevTools?: boolean;
  debugMode?: boolean;
  useStructuralSharing?: boolean;

  /**
   * Security validation configuration
   * When enabled, validates keys and values during tree construction and updates
   * to prevent prototype pollution, XSS, and function values.
   *
   * @default undefined (no security validation)
   * @see SecurityValidator for configuration options
   *
   * @example
   * ```ts
   * // Enable all security features
   * const tree = signalTree(state, {
   *   security: {
   *     preventPrototypePollution: true,
   *     preventXSS: true,
   *     preventFunctions: true,
   *     onSecurityEvent: (event) => console.warn('Security event:', event)
   *   }
   * });
   *
   * // Or use a preset
   * const tree = signalTree(state, {
   *   security: SecurityPresets.strict().getConfig()
   * });
   * ```
   */
  security?: SecurityValidatorConfig;
}

// ============================================
// FEATURE TYPES
// ============================================

export interface Middleware<T> {
  id: string;
  before?: (action: string, payload: unknown, state: T) => boolean;
  after?: (action: string, payload: unknown, state: T, newState: T) => void;
}

export interface PerformanceMetrics {
  updates: number;
  computations: number;
  cacheHits: number;
  cacheMisses: number;
  averageUpdateTime: number;
}

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

export interface TimeTravelEntry<T> {
  action: string;
  timestamp: number;
  state: T;
  payload?: unknown;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a value is a SignalTree
 */
export function isSignalTree<T>(value: unknown): value is SignalTree<T> {
  return (
    value !== null &&
    typeof value === 'function' && // It's a callable function
    'state' in value &&
    '$' in value &&
    'with' in value &&
    'destroy' in value
  );
}
