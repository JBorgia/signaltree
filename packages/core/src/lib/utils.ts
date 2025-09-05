import { isSignal, Signal, signal, WritableSignal } from '@angular/core';

import { SIGNAL_TREE_CONSTANTS } from './constants';

/** Symbol to mark callable signals - using global symbol to match across files */
const CALLABLE_SIGNAL_SYMBOL = Symbol.for('NodeAccessor');

/**
 * SignalTree Utility Functions v1.1.6
 * Core utilities for signal tree operations
 */
import type { TreeNode, NodeAccessor } from './types';

/** Deep equality */
export function equal<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;

  const typeA = typeof a;
  const typeB = typeof b;
  if (typeA !== typeB) return false;
  if (typeA !== 'object') return false;

  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp)
    return a.source === b.source && a.flags === b.flags;

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

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => equal(item, (b as unknown as unknown[])[i]));
  }

  if (Array.isArray(b)) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => k in objB && equal(objA[k], objB[k]));
}

export const deepEqual = equal;

/** Runtime built-in detection (keep in sync with types BuiltInObject) */
export function isBuiltInObject(v: unknown): boolean {
  if (v === null || v === undefined) return false;

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

  try {
    const NodeBuffer = (globalThis as { Buffer?: unknown })?.Buffer;
    if (
      NodeBuffer &&
      v instanceof (NodeBuffer as new (...args: unknown[]) => unknown)
    )
      return true;
  } catch {
    /* ignore */
  }

  return false;
}

/**
 * Checks if a value is a node accessor created by makeNodeAccessor
 */
export function isNodeAccessor(value: unknown): value is NodeAccessor<unknown> {
  return (
    typeof value === 'function' && value && CALLABLE_SIGNAL_SYMBOL in value
  );
}

/**
 * Checks if a value is either an Angular signal or a callable signal
 * This is useful for packages that need to work with both types
 */
export function isAnySignal(value: unknown): boolean {
  return isSignal(value) || isNodeAccessor(value);
}

/** Small LRU cache used by parsePath */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  constructor(private maxSize: number) {}
  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.delete(key);
    this.cache.set(key, value);
  }
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
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

const pathCache = new LRUCache<string, string[]>(
  SIGNAL_TREE_CONSTANTS.MAX_PATH_CACHE_SIZE
);

export function parsePath(path: string): string[] {
  const cached = pathCache.get(path);
  if (cached) return cached;
  const parts = path.split('.');
  pathCache.set(path, parts);
  return parts;
}

export function composeEnhancers<T>(
  ...enhancers: Array<(tree: T) => T>
): (tree: T) => T {
  return (tree: T) => enhancers.reduce((t, e) => e(t), tree);
}

/**
 * Creates a lazy signal tree using Proxy for on-demand signal creation
 */
export function createLazySignalTree<T extends object>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean,
  basePath = ''
): TreeNode<T> {
  const signalCache = new Map<string, WritableSignal<unknown>>();
  const nestedProxies = new Map<string, unknown>();
  const nestedCleanups = new Map<string, () => void>();

  const cleanup = () => {
    nestedCleanups.forEach((fn) => {
      try {
        fn();
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
      if (prop === '__cleanup__') return cleanup;

      if (typeof prop === 'symbol') {
        return (target as Record<string | symbol, unknown>)[prop];
      }

      if (prop === 'valueOf' || prop === 'toString') {
        return (target as Record<string | symbol, unknown>)[prop];
      }

      const key = prop as string;
      const path = basePath ? `${basePath}.${key}` : key;

      if (!(key in target)) return undefined;

      const value = (target as Record<string, unknown>)[key];

      if (isSignal(value)) return value;

      if (signalCache.has(path)) return signalCache.get(path);
      if (nestedProxies.has(path)) return nestedProxies.get(path);

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
          const fallbackSignal = signal(value, { equal: equalityFn });
          signalCache.set(path, fallbackSignal);
          return fallbackSignal;
        }
      }

      try {
        const newSignal = signal(value, { equal: equalityFn });
        signalCache.set(path, newSignal);
        return newSignal;
      } catch (error) {
        console.warn(`Failed to create signal for path "${path}":`, error);
        return value;
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
        (target as Record<string, unknown>)[key] = value;

        const cachedSignal = signalCache.get(path);
        if (cachedSignal && 'set' in cachedSignal) {
          (cachedSignal as WritableSignal<unknown>).set(value);
        }

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

  return proxy as TreeNode<T>;
}

/**
 * Unwraps a signal or signal tree into a plain JS value shaped as T.
 * NOTE: Runtime strips the dynamic set/update helpers; call sites receive T.
 */
export function unwrap<T>(node: TreeNode<T>): T;
export function unwrap<T>(node: NodeAccessor<T> & TreeNode<T>): T;
export function unwrap<T>(node: NodeAccessor<T>): T;
export function unwrap<T>(node: unknown): T;
export function unwrap<T>(node: unknown): T {
  if (node === null || node === undefined) {
    return node as T;
  }

  // Handle callable signals first
  if (isNodeAccessor(node)) {
    // For NodeAccessors, don't call them - read from their properties directly
    // This prevents infinite recursion when NodeAccessor calls unwrap(accessor)
    const result = {} as Record<string, unknown>;

    for (const key in node as unknown as Record<string, unknown>) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

      // Skip function prototype properties only, not user properties
      if (key === 'length' || key === 'prototype') continue;

      // Special handling for 'name' - if it's a signal or NodeAccessor, include it
      if (key === 'name') {
        const value = (node as unknown as Record<string, unknown>)[key];
        if (!isSignal(value) && !isNodeAccessor(value)) {
          // Skip if it's just the function name property
          continue;
        }
      }

      const value = (node as unknown as Record<string, unknown>)[key];

      if (isNodeAccessor(value)) {
        result[key] = unwrap(value);
      } else if (isSignal(value)) {
        const unwrappedValue = (value as Signal<unknown>)();
        if (
          typeof unwrappedValue === 'object' &&
          unwrappedValue !== null &&
          !Array.isArray(unwrappedValue) &&
          !isBuiltInObject(unwrappedValue)
        ) {
          result[key] = unwrap(unwrappedValue);
        } else {
          result[key] = unwrappedValue;
        }
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !isBuiltInObject(value)
      ) {
        result[key] = unwrap(value);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }
  if (isSignal(node)) {
    const value = (node as Signal<unknown>)();
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !isBuiltInObject(value)
    ) {
      return unwrap(value) as T;
    }
    return value as T;
  }

  if (typeof node !== 'object') {
    return node as T;
  }

  if (Array.isArray(node)) {
    return node as T;
  }

  if (isBuiltInObject(node)) {
    return node as T;
  }

  const result = {} as Record<string, unknown>;

  for (const key in node as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

    if (key === 'set' || key === 'update') {
      const v = (node as Record<string, unknown>)[key];
      if (typeof v === 'function') continue;
    }

    const value = (node as Record<string, unknown>)[key];

    if (isNodeAccessor(value)) {
      const unwrappedValue = value();
      if (
        typeof unwrappedValue === 'object' &&
        unwrappedValue !== null &&
        !Array.isArray(unwrappedValue) &&
        !isBuiltInObject(unwrappedValue)
      ) {
        result[key] = unwrap(unwrappedValue);
      } else {
        result[key] = unwrappedValue;
      }
    } else if (isSignal(value)) {
      const unwrappedValue = (value as Signal<unknown>)();
      if (
        typeof unwrappedValue === 'object' &&
        unwrappedValue !== null &&
        !Array.isArray(unwrappedValue) &&
        !isBuiltInObject(unwrappedValue)
      ) {
        result[key] = unwrap(unwrappedValue);
      } else {
        result[key] = unwrappedValue;
      }
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !isBuiltInObject(value)
    ) {
      result[key] = unwrap(value);
    } else {
      result[key] = value;
    }
  }

  const symbols = Object.getOwnPropertySymbols(node as object);
  for (const sym of symbols) {
    const value = (node as Record<symbol, unknown>)[sym];
    if (isNodeAccessor(value)) {
      const unwrappedValue = value();
      if (
        typeof unwrappedValue === 'object' &&
        unwrappedValue !== null &&
        !Array.isArray(unwrappedValue) &&
        !isBuiltInObject(unwrappedValue)
      ) {
        (result as Record<symbol, unknown>)[sym] = unwrap(unwrappedValue);
      } else {
        (result as Record<symbol, unknown>)[sym] = unwrappedValue;
      }
    } else if (isSignal(value)) {
      const unwrappedValue = (value as Signal<unknown>)();
      if (
        typeof unwrappedValue === 'object' &&
        unwrappedValue !== null &&
        !Array.isArray(unwrappedValue) &&
        !isBuiltInObject(unwrappedValue)
      ) {
        (result as Record<symbol, unknown>)[sym] = unwrap(unwrappedValue);
      } else {
        (result as Record<symbol, unknown>)[sym] = unwrappedValue;
      }
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

  return result as unknown as T;
}
