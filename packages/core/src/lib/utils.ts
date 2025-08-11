import { signal, WritableSignal, isSignal } from '@angular/core';
import type { DeepSignalify } from './types';

// Path parsing cache for performance optimization
const pathCache = new Map<string, string[]>();

/**
 * Parses a dot-notation path into an array of keys with memoization.
 * Critical for performance when accessing nested properties frequently.
 *
 * @example
 * ```typescript
 * const keys1 = parsePath('user.name'); // Splits and caches
 * const keys2 = parsePath('user.name'); // Returns cached result
 * ```
 */
export function parsePath(path: string): string[] {
  if (!pathCache.has(path)) {
    pathCache.set(path, path.split('.'));
  }
  const cached = pathCache.get(path);
  return cached ?? path.split('.');
}

/**
 * Creates a lazy signal tree using Proxy for on-demand signal creation.
 * Only creates signals when properties are first accessed, providing
 * massive memory savings for large state objects.
 *
 * @param obj - Source object to lazily signalify
 * @param equalityFn - Equality function for signal comparison
 * @param basePath - Base path for nested objects (internal use)
 * @returns Proxied object that creates signals on first access
 */
export function createLazySignalTree<T extends Record<string, unknown>>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean,
  basePath = ''
): DeepSignalify<T> {
  const signalCache = new Map<string, WritableSignal<unknown>>();
  const nestedProxies = new Map<string, unknown>();

  return new Proxy(obj, {
    get(target: Record<string, unknown>, prop: string | symbol) {
      // Handle symbol properties (like Symbol.iterator) normally
      if (typeof prop === 'symbol') {
        return (target as Record<string | symbol, unknown>)[prop];
      }

      const key = prop as string;
      const path = basePath ? `${basePath}.${key}` : key;
      const value = target[key];

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

      // Handle nested objects - create lazy proxy
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !isSignal(value)
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

    set(
      target: Record<string, unknown>,
      prop: string | symbol,
      value: unknown
    ) {
      if (typeof prop === 'symbol') {
        (target as Record<string | symbol, unknown>)[prop] = value;
        return true;
      }

      const key = prop as string;
      const path = basePath ? `${basePath}.${key}` : key;

      // Update the original object
      target[key] = value;

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
  }) as DeepSignalify<T>;
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
 * Standard equality function that uses deep comparison for arrays.
 */
export function equal<T>(a: T, b: T): boolean {
  return Array.isArray(a) && Array.isArray(b) ? deepEqual(a, b) : a === b;
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
