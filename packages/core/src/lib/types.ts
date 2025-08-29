/**
 * SignalTree Core Types v1.1.6
 * MIT License - Copyright (c) 2025 Jonathan D Borgia
 */
import { Signal, WritableSignal } from '@angular/core';

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
 */
// types.ts

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
  // ✅ Typed arrays (match isBuiltInObject)
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array
  // ✅ Web platform objects you already detect at runtime
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
 * Helper type to remove SignalTree's set/update methods from nested objects when unwrapping
 * Preserves all built-in object methods and only removes our dynamically added methods
 */
export type RemoveSignalMethods<T> = T extends WritableSignal<infer U>
  ? U
  : T extends Signal<infer U>
  ? U
  : T extends BuiltInObject
  ? T // Preserve built-in objects exactly as they are
  : T extends readonly unknown[]
  ? T // Preserve arrays exactly as they are
  : T extends object
  ? {
      [K in keyof T as K extends 'set' | 'update'
        ? never
        : K]: RemoveSignalMethods<T[K]>;
    }
  : T;

/**
 * Deep signalification type - converts object properties to signals recursively
 */
export type DeepSignalify<T> = {
  [K in keyof T]: T[K] extends readonly unknown[]
    ? WritableSignal<T[K]> // Arrays become single signals
    : T[K] extends object
    ? T[K] extends Signal<unknown>
      ? T[K] // Don't double-wrap signals
      : T[K] extends BuiltInObject
      ? WritableSignal<T[K]>
      : T[K] extends (...args: unknown[]) => unknown
      ? WritableSignal<T[K]>
      : DeepSignalify<T[K]> & {
          set(partial: Partial<T[K]>): void;
          update(updater: (current: T[K]) => Partial<T[K]>): void;
        } // Nested objects get recursive treatment
    : WritableSignal<T[K]>;
};

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
  ? H extends EnhancerWithMeta<Start, infer O>
    ? R extends Array<EnhancerWithMeta<unknown, unknown>>
      ? ChainResult<O, R>
      : O
    : unknown
  : Start;

/**
 * Overload set for .with() method
 */
export interface WithMethod<T> {
  (): SignalTree<T>;
  <O1>(e1: (input: SignalTree<T>) => O1): O1;
  <O1, O2>(e1: (input: SignalTree<T>) => O1, e2: (input: O1) => O2): O2;
  <O1, O2, O3>(
    e1: (input: SignalTree<T>) => O1,
    e2: (input: O1) => O2,
    e3: (input: O2) => O3
  ): O3;
  <O1, O2, O3, O4>(
    e1: (input: SignalTree<T>) => O1,
    e2: (input: O1) => O2,
    e3: (input: O2) => O3,
    e4: (input: O3) => O4
  ): O4;
  (
    ...enhancers: Array<
      EnhancerWithMeta<unknown, unknown> | ((...args: unknown[]) => unknown)
    >
  ): unknown;
}

// ============================================
// SIGNAL TREE INTERFACE
// ============================================

/**
 * Main SignalTree type with all methods
 */
export type SignalTree<T> = {
  /** The reactive state object */
  state: DeepSignalify<T>;

  /** Shorthand alias for state */
  $: DeepSignalify<T>;

  /** Core methods */
  unwrap(): RemoveSignalMethods<T>;
  update(updater: (current: RemoveSignalMethods<T>) => Partial<T>): void;
  with: WithMethod<T>;
  destroy(): void;

  /** Enhanced functionality */
  effect(fn: (tree: RemoveSignalMethods<T>) => void): void;
  subscribe(fn: (tree: RemoveSignalMethods<T>) => void): () => void;
  batchUpdate(updater: (current: RemoveSignalMethods<T>) => Partial<T>): void;
  memoize<R>(
    fn: (tree: RemoveSignalMethods<T>) => R,
    cacheKey?: string
  ): Signal<R>;

  /** Performance methods */
  optimize(): void;
  clearCache(): void;
  invalidatePattern(pattern: string): number;
  getMetrics(): PerformanceMetrics;

  /** Middleware */
  addTap(middleware: Middleware<T>): void;
  removeTap(id: string): void;

  /** Entity helpers */
  asCrud<E extends { id: string | number }>(
    entityKey?: keyof T
  ): EntityHelpers<E>;

  /** Async actions */
  asyncAction<TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config?: AsyncActionConfig<T, TResult>
  ): AsyncAction<TInput, TResult>;

  /** Time travel */
  undo(): void;
  redo(): void;
  getHistory(): TimeTravelEntry<T>[];
  resetHistory(): void;
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
  findById(id: E['id']): Signal<E | undefined>;
  findBy(predicate: (entity: E) => boolean): Signal<E[]>;
  selectIds(): Signal<Array<string | number>>;
  selectAll(): Signal<E[]>;
  selectTotal(): Signal<number>;
  findAll(): Signal<E[]>;
  clear(): void;
}

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
    typeof value === 'object' &&
    'state' in value &&
    '$' in value &&
    'unwrap' in value &&
    'update' in value &&
    'with' in value &&
    'destroy' in value
  );
}
