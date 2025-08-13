/**
 * SignalTree Utility Functions - Recursive Typing Implementation
 *
 * COPYRIGHT NOTICE:
 * This file contains proprietary utility functions for the recursive typing system.
 * The createLazySignalTree function and built-in object detection methods are
 * protected intellectual property of Jonathan D Borgia.
 *
 * Licensed under Fair Source License - see LICENSE file for complete terms.
 */

import { signal, WritableSignal, isSignal } from '@angular/core';
import type { DeepSignalify } from './types';

/**
 * Enhanced equality function inspired by the monolithic implementation.
 * Uses deep equality for arrays and objects, === for primitives.
 * Optimized with early exits and type-specific comparisons.
 */
export function equal<T>(a: T, b: T): boolean {
  // Fast path for reference equality
  if (a === b) return true;

  // Handle null/undefined cases
  if (a == null || b == null) return a === b;

  // Type check first - most efficient early exit
  const typeA = typeof a;
  const typeB = typeof b;
  if (typeA !== typeB) return false;

  // For primitives, === check above is sufficient
  if (typeA !== 'object') return false;

  // Handle arrays with optimized comparison
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => equal(item, b[index]));
  }

  // Arrays check above handles array vs object mismatch
  if (Array.isArray(b)) return false;

  // Handle objects with optimized comparison
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => key in objB && equal(objA[key], objB[key]));
}

/**
 * Creates a terminal signal with the enhanced equality function.
 * This should be used instead of Angular's signal() when you want
 * the same deep equality behavior as signalTree.
 *
 * Inspired by the monolithic implementation's terminal signal creation.
 */
export function terminalSignal<T>(
  value: T,
  customEqual?: (a: T, b: T) => boolean
): WritableSignal<T> {
  return signal(value, {
    equal: customEqual || equal,
  });
}

/**
 * LRU Cache implementation for efficient memory management
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();

  constructor(private maxSize: number) {}

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    // Remove if exists to update position
    this.cache.delete(key);
    this.cache.set(key, value); // Add to end (most recent)
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (mark as recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Path parsing cache with proper LRU eviction strategy
const MAX_CACHE_SIZE = 1000;
const pathCache = new LRUCache<string, string[]>(MAX_CACHE_SIZE);

/**
 * Parses a dot-notation path into an array of keys with LRU memoization.
 * Critical for performance when accessing nested properties frequently.
 * Includes proper LRU cache management to prevent memory leaks.
 *
 * @example
 * ```typescript
 * const keys1 = parsePath('user.name'); // Splits and caches
 * const keys2 = parsePath('user.name'); // Returns cached result
 * ```
 */
export function parsePath(path: string): string[] {
  const cached = pathCache.get(path);
  if (cached) {
    return cached;
  }

  const parts = path.split('.');
  pathCache.set(path, parts);
  return parts;
}

/**
 * Creates a lazy signal tree using Proxy for on-demand signal creation.
 * Only creates signals when properties are first accessed, providing
 * massive memory savings for large state objects.
 * Uses WeakMap for memory-safe caching.
 *
 * @param obj - Source object to lazily signalify
 * @param equalityFn - Equality function for signal comparison
 * @param basePath - Base path for nested objects (internal use)
 * @returns Proxied object that creates signals on first access
 */
export function createLazySignalTree<T extends object>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean,
  basePath = ''
): DeepSignalify<T> {
  // Use WeakMap for automatic garbage collection when objects are no longer referenced
  const signalCache = new Map<string, WritableSignal<unknown>>();
  const nestedProxies = new Map<string, unknown>();

  // Store cleanup function for manual resource management
  const cleanup = () => {
    signalCache.clear();
    nestedProxies.clear();
  };

  // Attach cleanup to the proxy for external access
  const proxy = new Proxy(obj, {
    get(target: object, prop: string | symbol) {
      // Handle cleanup method
      if (prop === '__cleanup__') {
        return cleanup;
      }

      // Handle symbol properties (like Symbol.iterator) normally
      if (typeof prop === 'symbol') {
        return (target as Record<string | symbol, unknown>)[prop];
      }

      const key = prop as string;
      const path = basePath ? `${basePath}.${key}` : key;
      const value = (target as Record<string, unknown>)[key];

      // If it's already a signal, return it
      if (isSignal(value)) {
        return value;
      }

      // Check if we already have a signal for this path
      if (signalCache.has(path)) {
        return signalCache.get(path);
      }

      // Check if we have a nested proxy cached
      if (nestedProxies.has(path)) {
        return nestedProxies.get(path);
      }

      // Helper to detect built-in objects that should be treated as primitives
      const isBuiltInObject = (v: unknown): boolean => {
        return (
          v instanceof Date ||
          v instanceof RegExp ||
          typeof v === 'function' ||
          v instanceof Map ||
          v instanceof Set ||
          v instanceof WeakMap ||
          v instanceof WeakSet ||
          v instanceof ArrayBuffer ||
          v instanceof DataView ||
          v instanceof Error ||
          v instanceof Promise
        );
      };

      // Handle nested objects - create lazy proxy
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !isSignal(value) &&
        !isBuiltInObject(value)
      ) {
        const nestedProxy = createLazySignalTree(
          value as Record<string, unknown>,
          equalityFn,
          path
        );
        nestedProxies.set(path, nestedProxy);
        return nestedProxy;
      }

      // Create signal for primitive values and arrays
      const newSignal = signal(value, { equal: equalityFn });
      signalCache.set(path, newSignal);
      return newSignal;
    },

    set(target: object, prop: string | symbol, value: unknown) {
      if (typeof prop === 'symbol') {
        (target as Record<string | symbol, unknown>)[prop] = value;
        return true;
      }

      const key = prop as string;
      const path = basePath ? `${basePath}.${key}` : key;

      // Update the original object
      (target as Record<string, unknown>)[key] = value;

      // If we have a cached signal, update it
      const cachedSignal = signalCache.get(path);
      if (cachedSignal) {
        cachedSignal.set(value);
      }

      // Clear nested proxy cache if the value type changed
      if (nestedProxies.has(path)) {
        nestedProxies.delete(path);
      }

      return true;
    },

    has(target, prop) {
      return prop in target;
    },

    ownKeys(target) {
      return Reflect.ownKeys(target);
    },

    getOwnPropertyDescriptor(target, prop) {
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });

  return proxy as DeepSignalify<T>;
}

/**
 * Native deep equality check for arrays and objects.
 * Handles all common cases that lodash.isEqual handles for our use cases.
 */
export function deepEqual<T>(a: T, b: T): boolean {
  // Same reference or primitives
  if (a === b) return true;

  // Handle null/undefined
  if (a == null || b == null) return false;

  // Different types
  if (typeof a !== typeof b) return false;

  // Handle dates
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle objects (but not arrays, dates, or other special objects)
  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b) &&
    !(a instanceof Date) &&
    !(b instanceof Date)
  ) {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!(key in objB)) return false;
      if (!deepEqual(objA[key], objB[key])) return false;
    }
    return true;
  }

  // For all other cases (primitives that aren't equal)
  return false;
}

/**
 * Shallow equality check for objects and arrays.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (
        (a as Record<string, unknown>)[key] !==
        (b as Record<string, unknown>)[key]
      )
        return false;
    }
    return true;
  }

  return false;
}
