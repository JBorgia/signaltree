import { WritableSignal, Signal } from '@angular/core';

/**
 * Fixed types.ts - Remove ALL constraints for maximum flexibility
 */

import { WritableSignal, Signal } from '@angular/core';

// ============================================
// REMOVE ALL CONSTRAINTS - Maximum Flexibility
// ============================================

/**
 * NO MORE StateObject constraint!
 * We don't need this at all - remove it or make it accept anything
 */
// DELETE THIS: export type StateObject = Record<PropertyKey, unknown>;
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

export type IsPrimitive<T> = T extends Primitive ? true : false;

/**
 * Signal detection
 */
export type IsSignal<T> = T extends Signal<unknown> ? true : false;
export type IsWritableSignal<T> = T extends WritableSignal<unknown> ? true : false;

/**
 * DeepSignalify - Works with ANY type T, no constraints
 */
export type DeepSignalify<T> =
  IsSignal<T> extends true
    ? T  // Don't double-wrap signals
    : IsPrimitive<T> extends true
    ? WritableSignal<T>
    : T extends readonly (infer U)[]
    ? WritableSignal<U[]>
    : T extends object  // ANY object, not Record<string, unknown>
    ? { [K in keyof T]: DeepSignalify<T[K]> }
    : WritableSignal<T>;

// ============================================
// ENHANCED TYPE SAFETY SYSTEM
// ============================================

// Branded type for better type safety
declare const __treeId: unique symbol;
export type TreeId = string & { readonly [__treeId]: never };

/**
 * Comprehensive primitive checking (enhanced from other AI's approach)
 * More explicit and safer than basic primitive detection
 */
export type Primitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | symbol;
export type IsPrimitive<T> = T extends Primitive ? true : false;

/**
 * Signal detection with double-wrap protection (from other AI)
 * Prevents accidental double-wrapping of signals
 */
export type IsSignal<T> = T extends Signal<unknown> ? true : false;
export type IsWritableSignal<T> = T extends WritableSignal<unknown>
  ? true
  : false;

// Serializable types - maximally flexible
export type SerializableValue = unknown;

// State object - kept minimal for internal use only, NOT as constraint
export type StateObject = Record<PropertyKey, unknown>;

/**
 * Our flexible DeepSignalify with enhanced safety checks
 * Key difference: NO StateObject constraint - accepts ANY type T
 */
export type DeepSignalify<T> = IsSignal<T> extends true
  ? T // Never double-wrap signals (safety enhancement)
  : IsPrimitive<T> extends true
  ? WritableSignal<T>
  : T extends readonly (infer U)[] // Better array handling
  ? WritableSignal<U[]>
  : T extends Record<string, unknown> // Flexible - accepts any object
  ? { [K in keyof T]: DeepSignalify<T[K]> }
  : WritableSignal<T>;

// Helper type for unwrapping signal states back to original types
export type UnwrapSignalState<T> = T extends WritableSignal<infer U>
  ? U
  : T extends Signal<infer U>
  ? U
  : T extends Record<string, unknown>
  ? { [K in keyof T]: UnwrapSignalState<T[K]> }
  : T;

/**
 * Main signal tree type that preserves hierarchical structure
 */
export type SignalState<T> = DeepSignalify<T>;

/**
 * Enhanced pipe method with better type inference (inspired by other AI)
 * More explicit overloads for better IDE support and type safety
 */
export interface PipeMethod<T> {
  (): SignalTree<T>;
  <R1>(fn1: (tree: SignalTree<T>) => R1): R1;
  <R1, R2>(fn1: (tree: SignalTree<T>) => R1, fn2: (arg: R1) => R2): R2;
  <R1, R2, R3>(
    fn1: (tree: SignalTree<T>) => R1,
    fn2: (arg: R1) => R2,
    fn3: (arg: R2) => R3
  ): R3;
  <R1, R2, R3, R4>(
    fn1: (tree: SignalTree<T>) => R1,
    fn2: (arg: R1) => R2,
    fn3: (arg: R2) => R3,
    fn4: (arg: R3) => R4
  ): R4;
  <R1, R2, R3, R4, R5>(
    fn1: (tree: SignalTree<T>) => R1,
    fn2: (arg: R1) => R2,
    fn3: (arg: R2) => R3,
    fn4: (arg: R3) => R4,
    fn5: (arg: R4) => R5
  ): R5;
}

/**
 * SignalTree type - NO CONSTRAINTS on T
 */
export type SignalTree<T> = {
  /**
   * The reactive state object with deep signal conversion
   */
  state: DeepSignalify<T>;

  /**
   * Shorthand alias for state
   */
  $: DeepSignalify<T>;

  /**
   * Core methods
   */
  unwrap(): T;
  update(updater: (current: T) => Partial<T>): void;
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

  // Extended features
  batchUpdate(updater: (current: T) => Partial<T>): void;
  memoize<R>(fn: (tree: T) => R, cacheKey?: string): Signal<R>;
  optimize(): void;
  clearCache(): void;
  invalidatePattern(pattern: string): number;
  getMetrics(): PerformanceMetrics;
  addTap(middleware: Middleware<T>): void;
  removeTap(id: string): void;
  asCrud<E extends { id: string | number }>(entityKey?: keyof T): EntityHelpers<E>;
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

  isWritableSignal: <T>(value: unknown): value is WritableSignal<T> => {
    return TypeGuards.isSignal(value) && 'set' in value && 'update' in value;
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
}

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

// ============================================
// ENTITY TYPES
// ============================================

export interface EntityHelpers<E extends { id: string | number }> {
  add(entity: E): void;
  update(id: E['id'], updates: Partial<E>): void;
  remove(id: E['id']): void;
  upsert(entity: E): void;
  findById(id: E['id']): Signal<E | undefined>;
  findBy(predicate: (entity: E) => boolean): Signal<E[]>;
  selectIds(): Signal<Array<string | number>>;
  selectAll(): Signal<E[]>;
  selectTotal(): Signal<number>;
  findAll(): Signal<E[]>; // Alias for selectAll for backward compatibility
  clear(): void;
}

// ============================================
// ASYNC TYPES
// ============================================

export interface AsyncActionConfig<T, TResult> {
  onStart?: (state: T) => Partial<T>;
  onSuccess?: (result: TResult, state: T) => Partial<T>;
  onError?: (error: Error, state: T) => Partial<T>;
  onComplete?: (state: T) => Partial<T>;
}

export interface AsyncAction<TInput, TResult> {
  execute(input: TInput): Promise<TResult>;
  pending: Signal<boolean>;
  error: Signal<Error | null>;
  result: Signal<TResult | null>;
}

// ============================================
// TIME TRAVEL TYPES
// ============================================

export interface TimeTravelEntry<T> {
  action: string;
  timestamp: number;
  state: T;
  payload: unknown;
}
