// INTERNAL: utilities moved from ../utils.ts
import { signal, WritableSignal, isSignal } from '../adapter';
import type { DeepSignalify } from '../types';

export function valueChanged(oldVal: unknown, newVal: unknown): boolean {
  if (Object.is(oldVal, newVal)) return false;
  if (
    oldVal &&
    newVal &&
    typeof oldVal === 'object' &&
    typeof newVal === 'object'
  ) {
    return !equal(oldVal, newVal);
  }
  return true;
}

export function equal<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  const typeA = typeof a;
  if (typeA !== typeof b) return false;
  if (typeA !== 'object') return false;
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp)
    return a.source === b.source && a.flags === b.flags;
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a)
      if (!b.has(key) || !equal(value, b.get(key))) return false;
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++)
      if (!equal(a[i], (b as unknown[])[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  for (const k of keysA)
    if (!(k in objB) || !equal(objA[k], objB[k])) return false;
  return true;
}

export function terminalSignal<T>(
  value: T,
  customEqual?: (a: T, b: T) => boolean
): WritableSignal<T> {
  return signal(value, { equal: customEqual || equal });
}

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

const pathCache = new LRUCache<string, string[]>(1000);
export function parsePath(path: string): string[] {
  const cached = pathCache.get(path);
  if (cached) return cached;
  const parts = path.split('.');
  pathCache.set(path, parts);
  return parts;
}

export function createLazySignalTree<T extends object>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean,
  basePath = ''
): DeepSignalify<T> {
  const signalCache = new Map<string, WritableSignal<unknown>>();
  const nestedProxies = new Map<string, unknown>();
  const nestedCleanups = new Map<string, () => void>();
  const cleanup = () => {
    nestedCleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        // Swallow cleanup errors quietly
      }
    });
    nestedCleanups.clear();
    signalCache.clear();
    nestedProxies.clear();
  };
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
      if (prop === '__cleanup__') return cleanup;
      if (typeof prop === 'symbol')
        return (target as Record<string | symbol, unknown>)[prop];
      if (prop === 'valueOf' || prop === 'toString')
        return (target as Record<string | symbol, unknown>)[prop];
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
          if (typeof proxyWithCleanup.__cleanup__ === 'function')
            nestedCleanups.set(path, proxyWithCleanup.__cleanup__);
          return nestedProxy;
        } catch {
          // Ignore nested proxy creation errors
        }
      }
      const sig = signal(value, { equal: equalityFn });
      signalCache.set(path, sig);
      return sig;
    },
  });
  return proxy as DeepSignalify<T>;
}
