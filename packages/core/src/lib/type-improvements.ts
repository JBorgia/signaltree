/**
 * @fileoverview Type Safety Improvements for SignalTree
 *
 * This file contains improved type definitions that provide better type safety
 * and reduce the need for type assertions.
 */

import { WritableSignal, Signal } from '@angular/core';
import type { SignalTree, StateObject } from './types';

// ============================================
// IMPROVED PIPE TYPING
// ============================================

// Better pipe operator typing - supports up to 5 transformations with proper type flow
type PipeOperator1<T, R1> = (input: T) => R1;
type PipeOperator2<T, R1, R2> = [PipeOperator1<T, R1>, PipeOperator1<R1, R2>];
type PipeOperator3<T, R1, R2, R3> = [
  PipeOperator1<T, R1>,
  PipeOperator1<R1, R2>,
  PipeOperator1<R2, R3>
];
type PipeOperator4<T, R1, R2, R3, R4> = [
  PipeOperator1<T, R1>,
  PipeOperator1<R1, R2>,
  PipeOperator1<R2, R3>,
  PipeOperator1<R3, R4>
];
type PipeOperator5<T, R1, R2, R3, R4, R5> = [
  PipeOperator1<T, R1>,
  PipeOperator1<R1, R2>,
  PipeOperator1<R2, R3>,
  PipeOperator1<R3, R4>,
  PipeOperator1<R4, R5>
];

export type PipeOperators<
  T,
  Rs extends readonly unknown[]
> = Rs extends readonly [infer R1]
  ? [PipeOperator1<T, R1>]
  : Rs extends readonly [infer R1, infer R2]
  ? PipeOperator2<T, R1, R2>
  : Rs extends readonly [infer R1, infer R2, infer R3]
  ? PipeOperator3<T, R1, R2, R3>
  : Rs extends readonly [infer R1, infer R2, infer R3, infer R4]
  ? PipeOperator4<T, R1, R2, R3, R4>
  : Rs extends readonly [infer R1, infer R2, infer R3, infer R4, infer R5]
  ? PipeOperator5<T, R1, R2, R3, R4, R5>
  : Array<(input: unknown) => unknown>; // fallback for more than 5

export type PipeResult<
  T,
  Rs extends readonly unknown[]
> = Rs extends readonly []
  ? T
  : Rs extends readonly [unknown]
  ? Rs[0]
  : Rs extends readonly [unknown, infer R2]
  ? R2
  : Rs extends readonly [unknown, unknown, infer R3]
  ? R3
  : Rs extends readonly [unknown, unknown, unknown, infer R4]
  ? R4
  : Rs extends readonly [unknown, unknown, unknown, unknown, infer R5]
  ? R5
  : unknown; // fallback

// ============================================
// BRANDED TYPES FOR BETTER TYPE SAFETY
// ============================================

// Brand for tree instances to prevent mixing
export interface TreeBrand {
  readonly __treeBrand: unique symbol;
}
export type BrandedTree<T extends StateObject> = SignalTree<T> & TreeBrand;

// Brand for enhanced trees
export interface BatchingBrand {
  readonly __batchingBrand: unique symbol;
}
export interface MemoizationBrand {
  readonly __memoizationBrand: unique symbol;
}

export type BatchingTree<T extends StateObject> = BrandedTree<T> &
  BatchingBrand;
export type MemoizationTree<T extends StateObject> = BrandedTree<T> &
  MemoizationBrand;

// ============================================
// STRICTER GENERIC CONSTRAINTS
// ============================================

// More restrictive object types
export type ValidStateObject = Record<string | number | symbol, unknown>;

// Ensure objects are JSON-serializable for better debugging
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue };

export type SerializableState = Record<string, SerializableValue>;

// ============================================
// ENHANCED SIGNAL TYPING
// ============================================

// Better signal detection
export type IsSignal<T> = T extends Signal<unknown> ? true : false;
export type IsWritableSignal<T> = T extends WritableSignal<unknown>
  ? true
  : false;

// Signal unwrapping with proper type preservation
export type UnwrapSignal<T> = T extends WritableSignal<infer U>
  ? U
  : T extends Signal<infer U>
  ? U
  : T;

// ============================================
// CACHE KEY TYPING
// ============================================

// Stronger cache key types
export type CacheKeyPrimitive = string | number | symbol;
export type CacheKey = CacheKeyPrimitive | CacheKeyPrimitive[];

// Cache entry with better typing
export interface TypedCacheEntry<T = unknown> {
  readonly value: T;
  readonly deps: readonly unknown[];
  readonly timestamp: number;
  readonly hitCount: number;
  readonly ttl?: number;
}

// ============================================
// UTILITY TYPES FOR BETTER TYPE CHECKING
// ============================================

// Check if type is object without being too permissive
export type IsObject<T> = T extends Record<PropertyKey, unknown>
  ? T extends unknown[]
    ? false
    : T extends (...args: unknown[]) => unknown
    ? false
    : T extends Signal<unknown>
    ? false
    : true
  : false;

// Better array detection
export type IsArray<T> = T extends readonly unknown[] ? true : false;

// Better primitive detection
export type IsPrimitive<T> = T extends
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | symbol
  ? true
  : false;

// ============================================
// FUNCTION SIGNATURE IMPROVEMENTS
// ============================================

// Better equality function typing
export type EqualityFn<T = unknown> = (a: T, b: T) => boolean;
export type StrictEqualityFn = <T>(a: T, b: T) => boolean;

// Better updater function typing
export type StateUpdater<T> = (current: T) => Partial<T>;
export type StrictStateUpdater<T extends ValidStateObject> = (
  current: T
) => Partial<T>;

// ============================================
// TYPE GUARDS FOR RUNTIME SAFETY
// ============================================

export function isValidStateObject(value: unknown): value is ValidStateObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSerializableValue(
  value: unknown
): value is SerializableValue {
  if (value === null) return true;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true;
  if (Array.isArray(value)) return value.every(isSerializableValue);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(
      isSerializableValue
    );
  }
  return false;
}

export function isCacheKeyPrimitive(
  value: unknown
): value is CacheKeyPrimitive {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'symbol'
  );
}
