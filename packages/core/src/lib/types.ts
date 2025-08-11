import { WritableSignal, Signal } from '@angular/core';

/**
 * @fileoverview Core types for SignalTree modular architecture
 *
 * Contains only the essential types needed for the basic signalTree functionality.
 * This keeps the core package minimal (~5KB) while other features are added via composition.
 */

// ============================================
// CORE TYPES AND INTERFACES
// ============================================

// Branded type for better type safety
declare const __treeId: unique symbol;
export type TreeId = string & { readonly [__treeId]: never };

// Define primitive types for better type constraints
type Primitive = string | number | boolean | null | undefined | bigint | symbol;

// Serializable types - more restrictive than unknown
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SerializableValue[]
  | { [key: string]: SerializableValue };

// Valid state object constraint - more restrictive than Record<string, unknown>
export type StateObject = Record<string | number | symbol, SerializableValue>;

// Helper type to check if a type is a primitive
type IsPrimitive<T> = T extends Primitive ? true : false;

// Deep signalify type with proper generic constraints
export type DeepSignalify<T> = IsPrimitive<T> extends true
  ? WritableSignal<T>
  : T extends (infer U)[]
  ? WritableSignal<U[]>
  : T extends Record<string, unknown>
  ? T extends Signal<infer TSignal>
    ? WritableSignal<TSignal>
    : { [K in keyof T]: DeepSignalify<T[K]> }
  : WritableSignal<T>;

// Helper type for unwrapping signal states back to original types
export type UnwrapSignalState<T> = T extends WritableSignal<infer U>
  ? U
  : T extends Record<string, unknown>
  ? { [K in keyof T]: UnwrapSignalState<T[K]> }
  : T;

/**
 * Main signal tree type that preserves hierarchical structure
 */
export type SignalState<T extends StateObject> = DeepSignalify<T>;

/**
 * Core SignalTree interface with only essential functionality.
 * Additional features are added via composition using the .pipe() method.
 */
export interface SignalTree<T extends StateObject> {
  /**
   * The reactive state object with deep signal conversion.
   */
  state: SignalState<T>;

  /**
   * Shorthand alias for `state`.
   */
  $: SignalState<T>;

  /**
   * Extracts the current plain object value from the signal tree.
   */
  unwrap(): T;

  /**
   * Updates the tree state using a partial update function.
   */
  update(updater: (current: T) => Partial<T>): void;

  /**
   * Creates a side effect that runs when the tree state changes.
   */
  effect(fn: (tree: T) => void): void;

  /**
   * Subscribes to tree state changes with manual unsubscribe control.
   */
  subscribe(fn: (tree: T) => void): () => void;

  /**
   * Completely destroys the tree and cleans up all resources.
   */
  destroy(): void;

  /**
   * Fluent API for composing features using function composition with strong typing
   */
  pipe(): SignalTree<T>;
  pipe<R1>(fn1: (tree: SignalTree<T>) => R1): R1;
  pipe<R1, R2>(fn1: (tree: SignalTree<T>) => R1, fn2: (arg: R1) => R2): R2;
  pipe<R1, R2, R3>(
    fn1: (tree: SignalTree<T>) => R1,
    fn2: (arg: R1) => R2,
    fn3: (arg: R2) => R3
  ): R3;
  pipe<R1, R2, R3, R4>(
    fn1: (tree: SignalTree<T>) => R1,
    fn2: (arg: R1) => R2,
    fn3: (arg: R2) => R3,
    fn4: (arg: R3) => R4
  ): R4;
  pipe<R1, R2, R3, R4, R5>(
    fn1: (tree: SignalTree<T>) => R1,
    fn2: (arg: R1) => R2,
    fn3: (arg: R2) => R3,
    fn4: (arg: R3) => R4,
    fn5: (arg: R4) => R5
  ): R5;

  // Extended features (provided by feature packages)
  batchUpdate(updater: (current: T) => Partial<T>): void;
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
}

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
}

// ============================================
// MIDDLEWARE TYPES
// ============================================

export interface Middleware<T> {
  id: string;
  before?: (action: string, payload: unknown, state: T) => boolean;
  after?: (action: string, payload: unknown, state: T, newState: T) => void;
}

// ============================================
// PERFORMANCE TYPES
// ============================================

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
  findById(id: E['id']): Signal<E | undefined>;
  findAll(): Signal<E[]>;
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
