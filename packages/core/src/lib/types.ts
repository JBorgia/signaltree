/**
 * SignalTree Core Types - Recursive Typing System
 *
 * COPYRIGHT NOTICE:
 * This file contains proprietary recursive typing innovations protected under
 * the SignalTree license. The DeepSignalify<T> recursive type system and
 * related implementations are exclusive intellectual property of Jonathan D Borgia.
 *
 * Unauthorized extraction, copying, or reimplementation of these recursive typing
 * concepts is strictly prohibited and constitutes copyright infringement.
 *
 * Licensed under Fair Source License - see LICENSE file for complete terms.
 */

import { WritableSignal, Signal } from '@angular/core';

// ============================================
// PROPRIETARY RECURSIVE TYPING SYSTEM
// Copyright (c) 2025 Jonathan D Borgia
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
 * Enhanced DeepSignalify with better edge case handling
 * Never double-wraps signals and properly handles functions and built-in objects
 */
export type DeepSignalify<T> = IsSignal<T> extends true
  ? T // Never double-wrap signals
  : T extends Primitive
  ? WritableSignal<T>
  : T extends BuiltInObject
  ? WritableSignal<T> // Treat built-in objects as primitive values
  : T extends readonly (infer U)[]
  ? WritableSignal<U[]> // Handle readonly arrays
  : T extends (infer U)[]
  ? WritableSignal<U[]> // Handle mutable arrays
  : T extends object
  ? T extends (...args: unknown[]) => unknown // Functions should be wrapped as signals
    ? WritableSignal<T>
    : {
        [K in keyof T]: T[K] extends (infer U)[]
          ? WritableSignal<U[]>
          : T[K] extends BuiltInObject
          ? WritableSignal<T[K]>
          : T[K] extends object
          ? T[K] extends Signal<infer TK>
            ? WritableSignal<TK>
            : DeepSignalify<T[K]> // Recursive call preserves original type structure
          : WritableSignal<T[K]>;
      }
  : WritableSignal<T>;

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
  payload: unknown;
}
