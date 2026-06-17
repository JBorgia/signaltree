import { isSignal, signal, WritableSignal } from '@angular/core';

import type { TreeNode } from '../types';
import {
  isBuiltInObject,
  isEntityMapMarker,
  type MemoryManager,
} from '../utils';

/**
 * Creates a lazy signal tree using Proxy for on-demand signal creation.
 *
 * Lives in its own module (not `utils.ts`) so it ships ONLY when the `lazy()`
 * feature is opted in via `@signaltree/core/lazy`. `signal-tree.ts` no longer
 * imports it, so the lazy proxy machinery + `SignalMemoryManager` tree-shake out
 * of bundles that don't use lazy mode.
 */
export function createLazySignalTree<T extends object>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean,
  basePath = '',
  memoryManager?: MemoryManager
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

    // Clear from memory manager if provided
    if (memoryManager) {
      memoryManager.dispose();
    }
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

      // Check if value is already an EntitySignal (materialized by entities())
      // EntitySignal has addOne and all methods
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as { addOne?: unknown }).addOne === 'function' &&
        typeof (value as { all?: unknown }).all === 'function'
      ) {
        return value;
      }

      // Preserve EntityMapMarker so entities can materialize them later
      if (isEntityMapMarker(value)) return value;

      // Check memory manager cache first
      if (memoryManager) {
        const cached = memoryManager.getSignal(path);
        if (cached) return cached;
      }

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
            path,
            memoryManager
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
          signalCache.set(path, fallbackSignal as WritableSignal<unknown>);

          // Cache in memory manager
          if (memoryManager) {
            memoryManager.cacheSignal(
              path,
              fallbackSignal as WritableSignal<unknown>
            );
          }

          return fallbackSignal;
        }
      }

      try {
        const newSignal = signal(value, { equal: equalityFn });
        signalCache.set(path, newSignal as WritableSignal<unknown>);

        // Cache in memory manager
        if (memoryManager) {
          memoryManager.cacheSignal(path, newSignal as WritableSignal<unknown>);
        }
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
