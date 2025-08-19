/**
 * SignalTree Utility Functions v1.1.6 - MIT License
 * @see https://github.com/JBorgia/signaltree/blob/main/LICENSE
 */

import { signal, WritableSignal, isSignal } from '@angular/core';
import type { DeepSignalify } from './types';

/**
 * Enhanced deep equality function optimized for SignalTree operations.
 *
 * Performs comprehensive equality checking for all JavaScript types including
 * primitives, objects, arrays, Date, RegExp, Map, Set, and other built-ins.
 * Optimized with early exits and type-specific comparisons for maximum performance.
 *
 * @template T - The type of values being compared
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns True if values are deeply equal, false otherwise
 *
 * @example
 * ```typescript
 * // Primitive comparisons
 * equal(42, 42);           // true
 * equal('hello', 'hello'); // true
 * equal(null, undefined);  // false
 *
 * // Object comparisons
 * equal({ a: 1, b: 2 }, { a: 1, b: 2 }); // true
 * equal({ a: 1 }, { a: 1, b: 2 });       // false
 *
 * // Array comparisons
 * equal([1, 2, 3], [1, 2, 3]);           // true
 * equal([1, [2, 3]], [1, [2, 3]]);       // true (deep)
 *
 * // Complex types
 * equal(new Date('2023-01-01'), new Date('2023-01-01')); // true
 * equal(/abc/gi, /abc/gi);                               // true
 * equal(new Set([1, 2]), new Set([1, 2]));               // true
 * equal(new Map([['a', 1]]), new Map([['a', 1]]));       // true
 * ```
 *
 * @example
 * ```typescript
 * // Usage in SignalTree for change detection
 * const state = signalTree({
 *   user: { name: 'John', age: 30 }
 * });
 *
 * // Internal equal() usage prevents unnecessary updates
 * state.user.set({ name: 'John', age: 30 }); // No change detected
 * state.user.set({ name: 'Jane', age: 30 }); // Change detected
 * ```
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

  // Handle Date objects specifically
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle RegExp objects specifically
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  // Handle other built-in objects that need special comparison
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !equal(value, b.get(key))) return false;
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  // Handle arrays with optimized comparison
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => equal(item, b[index]));
  }

  // Arrays check above handles array vs object mismatch
  if (Array.isArray(b)) return false;

  // Handle regular objects with optimized comparison
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => key in objB && equal(objA[key], objB[key]));
}

/**
 * Creates a terminal signal with enhanced deep equality comparison.
 *
 * Alternative to Angular's signal() that uses SignalTree's deep equality
 * function for change detection. Useful when you need standalone signals
 * with the same equality semantics as SignalTree.
 *
 * @template T - The type of the signal value
 * @param value - Initial value for the signal
 * @param customEqual - Optional custom equality function (defaults to deep equal)
 * @returns A WritableSignal with deep equality comparison
 *
 * @example
 * ```typescript
 * // Standard Angular signal with reference equality
 * const standardSignal = signal({ count: 0 });
 * standardSignal.set({ count: 0 }); // Triggers update (different reference)
 *
 * // Terminal signal with deep equality
 * const terminalSig = terminalSignal({ count: 0 });
 * terminalSig.set({ count: 0 }); // No update (same value)
 * terminalSig.set({ count: 1 }); // Triggers update (different value)
 * ```
 *
 * @example
 * ```typescript
 * // Custom equality function
 * const userSignal = terminalSignal(
 *   { id: 1, name: 'John' },
 *   (a, b) => a.id === b.id // Only compare by ID
 * );
 *
 * userSignal.set({ id: 1, name: 'Jane' }); // No update (same ID)
 * userSignal.set({ id: 2, name: 'Jane' }); // Triggers update (different ID)
 * ```
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
 * Parses a dot-notation path into an array of keys with intelligent caching.
 *
 * Converts string paths like 'user.profile.name' into arrays ['user', 'profile', 'name']
 * for efficient nested property access. Uses LRU caching to optimize performance
 * for frequently accessed paths while preventing memory leaks.
 *
 * @param path - Dot-notation path string to parse
 * @returns Array of property keys for nested access
 *
 * @example
 * ```typescript
 * // Basic path parsing
 * parsePath('user.name');           // ['user', 'name']
 * parsePath('data.items.0.title');  // ['data', 'items', '0', 'title']
 * parsePath('settings');            // ['settings']
 *
 * // Cached for performance
 * parsePath('user.profile.name');   // Parses and caches
 * parsePath('user.profile.name');   // Returns cached result
 * ```
 *
 * @example
 * ```typescript
 * // Used internally for nested state access
 * const store = signalTree({
 *   user: { profile: { name: 'John' } }
 * });
 *
 * // Internally uses parsePath for efficient access
 * store.user.profile.name.set('Jane');
 *
 * // Or with string paths in extensions
 * setNestedValue(store, 'user.profile.name', 'Bob');
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
 * Only creates signals when properties are first accessed.
 *
 * @see https://github.com/JBorgia/signaltree/blob/main/docs/api/create-lazy-signal-tree.md
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
  // Use Map instead of WeakMap for better control over cleanup
  const signalCache = new Map<string, WritableSignal<unknown>>();
  const nestedProxies = new Map<string, unknown>();

  // Track cleanup functions for nested proxies
  const nestedCleanups = new Map<string, () => void>();

  // Enhanced cleanup function
  const cleanup = () => {
    // Clean up all nested proxies first
    nestedCleanups.forEach((cleanupFn) => {
      try {
        cleanupFn();
      } catch (error) {
        console.warn('Error during nested cleanup:', error);
      }
    });
    nestedCleanups.clear();

    // Clear caches
    signalCache.clear();
    nestedProxies.clear();
  };

  // Enhanced built-in object detection
  const isBuiltInObject = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;

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
      v instanceof Promise ||
      v instanceof URL ||
      v instanceof URLSearchParams ||
      v instanceof FormData ||
      v instanceof Blob ||
      (typeof File !== 'undefined' && v instanceof File)
    );
  };

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

      // Handle inspection methods
      if (prop === 'valueOf' || prop === 'toString') {
        return (target as Record<string | symbol, unknown>)[prop];
      }

      const key = prop as string;
      const path = basePath ? `${basePath}.${key}` : key;

      // Safety check for property existence
      if (!(key in target)) {
        return undefined;
      }

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

      // Handle nested objects - create lazy proxy
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !isSignal(value) &&
        !isBuiltInObject(value)
      ) {
        try {
          const nestedProxy = createLazySignalTree(
            value as Record<string, unknown>,
            equalityFn,
            path
          );

          nestedProxies.set(path, nestedProxy);

          // Store cleanup function for nested proxy
          const proxyWithCleanup = nestedProxy as { __cleanup__?: () => void };
          if (typeof proxyWithCleanup.__cleanup__ === 'function') {
            nestedCleanups.set(path, proxyWithCleanup.__cleanup__);
          }

          return nestedProxy;
        } catch (error) {
          console.warn(
            `Failed to create lazy proxy for path "${path}":`,
            error
          );
          // Fallback: create a signal for the object
          const fallbackSignal = signal(value, { equal: equalityFn });
          signalCache.set(path, fallbackSignal);
          return fallbackSignal;
        }
      }

      // Create signal for primitive values, arrays, and built-in objects
      try {
        const newSignal = signal(value, { equal: equalityFn });
        signalCache.set(path, newSignal);
        return newSignal;
      } catch (error) {
        console.warn(`Failed to create signal for path "${path}":`, error);
        return value; // Return raw value as fallback
      }
    },

    set(target: object, prop: string | symbol, value: unknown) {
      if (typeof prop === 'symbol') {
        (target as Record<string | symbol, unknown>)[prop] = value;
        return true;
      }

      const key = prop as string;
      const path = basePath ? `${basePath}.${key}` : key;

      try {
        // Update the original object
        (target as Record<string, unknown>)[key] = value;

        // If we have a cached signal, update it
        const cachedSignal = signalCache.get(path);
        if (cachedSignal && 'set' in cachedSignal) {
          (cachedSignal as WritableSignal<unknown>).set(value);
        }

        // Clear nested proxy cache if the value type changed
        if (nestedProxies.has(path)) {
          // Clean up the nested proxy
          const nestedCleanup = nestedCleanups.get(path);
          if (nestedCleanup) {
            nestedCleanup();
            nestedCleanups.delete(path);
          }
          nestedProxies.delete(path);
        }

        return true;
      } catch (error) {
        console.warn(`Failed to set value for path "${path}":`, error);
        return false;
      }
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
 * Alias for the enhanced equal function for backward compatibility.
 */
export const deepEqual = equal;

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
