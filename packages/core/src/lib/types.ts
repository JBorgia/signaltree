/**
 * SignalTree Core Types - Recursive Typing System
 *
 * MIT License
 * Copyright (c) 2025 Jonathan D Borgia
 */

import { WritableSignal, Signal } from './adapter';

// ============================================
// RECURSIVE TYPING SYSTEM
// MIT License - Copyright (c) 2025 Jonathan D Borgia
// ============================================

/**
 * NO MORE StateObject constraint!
 * We don't need this at all - remove it or make it accept anything
 */

// REPLACE WITH: Just use generic T with no constraints

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
 * Enhanced detection for better edge case handling
 */
export type BuiltInObject =
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
  | URL
  | URLSearchParams
  | FormData
  | Blob
  | File;

export type IsPrimitive<T> = T extends Primitive ? true : false;
export type IsBuiltInObject<T> = T extends BuiltInObject ? true : false;

/**
 * Signal detection
 */
export type IsSignal<T> = T extends Signal<unknown> ? true : false;
export type IsWritableSignal<T> = T extends WritableSignal<unknown>
  ? true
  : false;

/**
 * Enhanced DeepSignalify type that makes nested objects callable
 * Handles all edge cases: signals, arrays, built-ins, functions, complex unions
 */
// DeepPartial utility for sparse updates
export type DeepPartial<T> = T extends BuiltInObject
  ? T
  : T extends (...args: unknown[]) => unknown
  ? T
  : T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export type DeepSignalify<T> = {
  [K in keyof T]: T[K] extends (infer U)[]
    ? WritableSignal<U[]>
    : T[K] extends object
    ? T[K] extends Signal<unknown>
      ? T[K]
      : T[K] extends BuiltInObject
      ? WritableSignal<T[K]>
      : T[K] extends (...args: unknown[]) => unknown
      ? WritableSignal<T[K]>
      : DeepSignalify<T[K]> &
          (() => T[K]) & {
            update(updater: (current: T[K]) => T[K] | DeepPartial<T[K]>): void;
            set(value: T[K] | DeepPartial<T[K]>): void;
          }
    : WritableSignal<T[K]>;
} & (() => T) & {
    update(updater: (current: T) => T | DeepPartial<T>): void;
    set(value: T | DeepPartial<T>): void;
  };

/**
 * SignalTree type - NO CONSTRAINTS on T
 */
export type SignalTree<T> = {
  /**
   * The reactive state object with deep signal conversion
   */
  state: DeepSignalify<T>;

  /**
   * Shorthand alias for state - also callable to unwrap entire tree
   */
  $: DeepSignalify<T>;

  /**
   * Core methods
   */
  unwrap(): T;
  update(updater: (current: T) => T | DeepPartial<T>): void;
  update(
    updater: (current: T) => T | DeepPartial<T>,
    options?: { label?: string; payload?: unknown }
  ): void;
  set(value: T | DeepPartial<T>): void;
  set(
    value: T | DeepPartial<T>,
    options?: { label?: string; payload?: unknown }
  ): void;
  getVersion(): number;
  select<R>(selector: (state: T) => R, cacheKey?: string): Signal<R>;
  effect(fn: (tree: T) => void): void;
  subscribe(fn: (tree: T) => void): () => void;
  destroy(): void;

  /**
   * Pipe method for composition
   */
  pipe(): SignalTree<T>;
  pipe<R1>(fn1: (tree: SignalTree<T>) => R1): R1;
  pipe<R1, R2>(fn1: (tree: SignalTree<T>) => R1, fn2: (arg: R1) => R2): R2;
  pipe<R1, R2, R3>(
    fn1: (tree: SignalTree<T>) => R1,
    fn2: (arg: R1) => R2,
    fn3: (arg: R2) => R3
  ): R3;

  // Extended features (stub implementations)
  batchUpdate(updater: (current: T) => T | DeepPartial<T>): void;
  memoize<R>(fn: (tree: T) => R, cacheKey?: string): Signal<R>;
  optimize(): void;
  clearCache(): void;
  invalidatePattern(pattern: string): number;
  getMetrics(): PerformanceMetrics;
  addTap(middleware: Middleware<T>): void;
  removeTap(id: string): void;
  asCrud<E extends { id: string | number }>(
    entityKey?: keyof T
  ): EntityHelpers<E>;
  asyncAction<TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config?: AsyncActionConfig<T, TResult>
  ): AsyncAction<TInput, TResult>;
  undo(): void;
  redo(): void;
  getHistory(): TimeTravelEntry<T>[];
  resetHistory(): void;
};

// ============================================
// OTHER TYPES (keep as-is but update generics)
// ============================================

export type TreePreset = 'basic' | 'performance' | 'development' | 'production';

export interface TreeConfig {
  batchUpdates?: boolean;
  useMemoization?: boolean;
  enableTimeTravel?: boolean;
  historyLimit?: number;
  useLazySignals?: boolean;
  useShallowComparison?: boolean;
  maxCacheSize?: number;
  trackPerformance?: boolean;
  treeName?: string;
  enableDevTools?: boolean;
  debugMode?: boolean;
  useStructuralSharing?: boolean;
  actionTracking?: boolean;
}

export interface Middleware<T> {
  id: string;
  before?: (action: string, payload: unknown, state: T) => boolean;
  after?: (action: string, payload: unknown, state: T, newState: T) => void;
}

export interface PerformanceMetrics {
  /**
   * Total number of state update operations that have occurred on the tree.
   * An "update" is counted whenever the tree's root state version increments
   * (i.e. a call to update / batchUpdate that produces a new object shape).
   * Use this to understand how write-heavy a workload is. A rapidly growing
   * updates number without a proportional increase in user‑visible changes can
   * indicate redundant writes or missing memoization.
   */
  updates: number;
  /**
   * Number of computed derivations (lazy computations, selectors, memoized
   * reads) that have executed since metrics tracking began. This is a proxy
   * for reactive recomputation pressure. High computations relative to
   * updates can reveal over-derivation (too many dependent computeds) or a
   * need to introduce finer‑grained signals.
   */
  computations: number;
  /**
   * Count of successful cache reuses for memoized / computed values. A cache
   * hit means a consumer accessed a computed result whose dependencies did
   * not change, so recomputation was skipped. Higher is generally better and
   * indicates effective memoization.
   */
  cacheHits: number;
  /**
   * Count of times a memoized / computed value had to recompute because one
   * or more of its tracked dependencies changed (or the value was evicted).
   * A growing cacheMisses:cacheHits ratio signals either highly dynamic
   * dependency graphs or insufficient caching granularity.
   */
  cacheMisses: number;
  /**
   * Mean wall‑clock time in milliseconds spent applying each update (not per
   * field, but per root update cycle). This includes propagation + computed
   * invalidation work attributable to that update. Aim to keep this stable.
   * Regressions (increase vs. baseline) often surface scaling issues or new
   * expensive derivations introduced by recent code.
   */
  averageUpdateTime: number;
}

export interface EntityHelpers<E extends { id: string | number }> {
  add(entity: E): void;
  update(id: E['id'], updates: DeepPartial<E>): void;
  remove(id: E['id']): void;
  upsert(entity: E): void;
  findById(id: E['id']): Signal<E | undefined>;
  findBy(predicate: (entity: E) => boolean): Signal<E[]>;
  selectIds(): Signal<Array<string | number>>;
  selectAll(): Signal<E[]>;
  selectTotal(): Signal<number>;
  findAll(): Signal<E[]>;
  clear(): void;
}

export interface AsyncActionConfig<T, TResult> {
  onStart?: (state: T) => DeepPartial<T>;
  onSuccess?: (result: TResult, state: T) => DeepPartial<T>;
  onError?: (error: Error, state: T) => DeepPartial<T>;
  onComplete?: (state: T) => DeepPartial<T>;
}

export interface AsyncAction<TInput, TResult> {
  execute(input: TInput): Promise<TResult>;
  pending: Signal<boolean>;
  error: Signal<Error | null>;
  result: Signal<TResult | null>;
}

export interface TimeTravelEntry<T> {
  action: string;
  timestamp: number;
  state: T;
  payload: unknown;
}
