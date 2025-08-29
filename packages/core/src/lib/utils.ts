/**
 * SignalTree Utility Functions v1.1.6
 * Core utilities for signal tree operations
 */
import { isSignal, Signal, signal, WritableSignal } from '@angular/core';

import { SIGNAL_TREE_CONSTANTS } from './constants';


import type { DeepSignalify, RemoveSignalMethods } from './types';
/**
 * Enhanced deep equality function optimized for SignalTree operations.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns True if values are deeply equal, false otherwise
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

  // Handle Date objects
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle RegExp objects
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  // Handle Map objects
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !equal(value, b.get(key))) return false;
    }
    return true;
  }

  // Handle Set objects
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  // Handle arrays
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => equal(item, b[index]));
  }

  // Arrays check above handles array vs object mismatch
  if (Array.isArray(b)) return false;

  // Handle regular objects
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => key in objB && equal(objA[key], objB[key]));
}

/**
 * Alias for backward compatibility
 */
export const deepEqual = equal;

/**
 * Creates a terminal signal with deep equality comparison
 *
 * @param value - Initial value for the signal
 * @param customEqual - Optional custom equality function
 * @returns A WritableSignal with deep equality comparison
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
 * Check if a value is a built-in object type
 */
export function isBuiltInObject(v: unknown): boolean {
  if (v === null || v === undefined) return false;

  // Core JavaScript built-ins
  if (
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
  ) {
    return true;
  }

  // Typed Arrays
  if (
    v instanceof Int8Array ||
    v instanceof Uint8Array ||
    v instanceof Uint8ClampedArray ||
    v instanceof Int16Array ||
    v instanceof Uint16Array ||
    v instanceof Int32Array ||
    v instanceof Uint32Array ||
    v instanceof Float32Array ||
    v instanceof Float64Array ||
    v instanceof BigInt64Array ||
    v instanceof BigUint64Array
  ) {
    return true;
  }

  // Web APIs (when available)
  if (typeof window !== 'undefined') {
    if (
      v instanceof URL ||
      v instanceof URLSearchParams ||
      v instanceof FormData ||
      v instanceof Blob ||
      (typeof File !== 'undefined' && v instanceof File) ||
      (typeof FileList !== 'undefined' && v instanceof FileList) ||
      (typeof Headers !== 'undefined' && v instanceof Headers) ||
      (typeof Request !== 'undefined' && v instanceof Request) ||
      (typeof Response !== 'undefined' && v instanceof Response) ||
      (typeof AbortController !== 'undefined' &&
        v instanceof AbortController) ||
      (typeof AbortSignal !== 'undefined' && v instanceof AbortSignal)
    ) {
      return true;
    }
  }

  // Node.js built-ins (when available)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const NodeBuffer = (globalThis as any)?.Buffer;
    if (NodeBuffer && v instanceof NodeBuffer) {
      return true;
    }
  } catch {
    // Ignore if Buffer is not available
  }

  return false;
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

// Path parsing cache with LRU eviction
const pathCache = new LRUCache<string, string[]>(
  SIGNAL_TREE_CONSTANTS.MAX_PATH_CACHE_SIZE
);

/**
 * Parses a dot-notation path into an array of keys
 *
 * @param path - Dot-notation path string
 * @returns Array of property keys
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
 * Compose multiple enhancers into a single enhancer function
 *
 * @param enhancers - Array of enhancer functions
 * @returns Composed enhancer function
 */
export function composeEnhancers<T>(
  ...enhancers: Array<(tree: T) => T>
): (tree: T) => T {
  return (tree: T) => enhancers.reduce((t, e) => e(t), tree);
}

/**
 * Creates a lazy signal tree using Proxy for on-demand signal creation
 *
 * @param obj - Source object to lazily signalify
 * @param equalityFn - Equality function for signal comparison
 * @param basePath - Base path for nested objects
 * @returns Proxied object that creates signals on first access
 */
export function createLazySignalTree<T extends object>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean,
  basePath = ''
): DeepSignalify<T> {
  const signalCache = new Map<string, WritableSignal<unknown>>();
  const nestedProxies = new Map<string, unknown>();
  const nestedCleanups = new Map<string, () => void>();

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
    signalCache.clear();
    nestedProxies.clear();
  };

  const proxy = new Proxy(obj, {
    get(target: object, prop: string | symbol) {
      // Handle cleanup method
      if (prop === '__cleanup__') {
        return cleanup;
      }

      // Handle symbol properties normally
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

      // Check cache
      if (signalCache.has(path)) {
        return signalCache.get(path);
      }

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

        // Update cached signal if exists
        const cachedSignal = signalCache.get(path);
        if (cachedSignal && 'set' in cachedSignal) {
          (cachedSignal as WritableSignal<unknown>).set(value);
        }

        // Clear nested proxy cache if value type changed
        if (nestedProxies.has(path)) {
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
 * Unwraps the current value from a signal or signal tree
 *
 * @param node - A signal, signal tree, or any value to unwrap
 * @returns The unwrapped value(s) with proper type inference
 */
export function unwrap<T>(
  node: DeepSignalify<T> & Record<string, unknown>
): RemoveSignalMethods<T>;
export function unwrap<T>(node: DeepSignalify<T>): RemoveSignalMethods<T>;
export function unwrap<T>(node: WritableSignal<T>): T;
export function unwrap<T>(node: T): RemoveSignalMethods<T>;
export function unwrap<T>(node: unknown): RemoveSignalMethods<T> {
  // Handle null/undefined
  if (node === null || node === undefined) {
    return node as RemoveSignalMethods<T>;
  }

  // Handle signals directly
  if (isSignal(node)) {
    return (node as Signal<unknown>)() as RemoveSignalMethods<T>;
  }

  // Handle primitives
  if (typeof node !== 'object') {
    return node as RemoveSignalMethods<T>;
  }

  // Handle arrays directly
  if (Array.isArray(node)) {
    return node as RemoveSignalMethods<T>;
  }

  // Build result object, filtering out methods
  const result = {} as Record<string, unknown>;

  for (const key in node) {
    if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

    const value = (node as Record<string, unknown>)[key];

    // Skip runtime-attached methods
    if ((key === 'set' || key === 'update') && typeof value === 'function') {
      continue;
    }

    if (isSignal(value)) {
      result[key] = (value as Signal<unknown>)();
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !isBuiltInObject(value)
    ) {
      // Nested signal state - recurse
      result[key] = unwrap(value);
    } else {
      result[key] = value;
    }
  }

  // Handle symbol properties
  const symbols = Object.getOwnPropertySymbols(node);
  for (const sym of symbols) {
    const value = (node as Record<symbol, unknown>)[sym];
    if (isSignal(value)) {
      (result as Record<symbol, unknown>)[sym] = (value as Signal<unknown>)();
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !isBuiltInObject(value)
    ) {
      (result as Record<symbol, unknown>)[sym] = unwrap(value);
    } else {
      (result as Record<symbol, unknown>)[sym] = value;
    }
  }

  return result as RemoveSignalMethods<T>;
}
