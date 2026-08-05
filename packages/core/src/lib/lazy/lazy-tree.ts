import { isSignal, signal, WritableSignal } from '@angular/core';

import { isRegisteredMarker } from '../internals/materialize-markers';
import type { TreeNode } from '../types';
import {
  isBuiltInObject,
  isEntityMapMarker,
  type MemoryManager,
} from '../utils';

declare const ngDevMode: boolean | undefined;

/**
 * Property names that must never be read through, written through, or reported
 * as present on a lazy node.
 *
 * `__proto__` is an accessor on Object.prototype, so reading it walks OFF the
 * tree and writing it mutates every object in the process; `constructor` and
 * `prototype` are the two-hop route to the same place.
 *
 * Inlined rather than imported from `@signaltree/shared` on purpose. `shared`
 * is a private package bundled into core, and its consumers build with
 * `stripInternal`, so a guard exported from there resolves as an empty module
 * across that boundary. A security primitive is also better read at its use
 * site than one indirection away.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isUnsafeKey(key: string | symbol): boolean {
  return typeof key === 'string' && UNSAFE_KEYS.has(key);
}

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

      // SECURITY: never hand out a view of the prototype chain. `key in target`
      // walks it, so `$.__proto__` resolved to Object.prototype, and because it
      // is an object it got wrapped in a nested lazy Proxy below and cached —
      // a live, WRITABLE handle on Object.prototype reachable from any code
      // holding the tree. `$.__proto__.isAdmin = true` polluted every object in
      // the process. Own-properties only, and the three prototype-chain keys are
      // refused outright even when own (a `defineProperty` write can mint an own
      // `__proto__`, which would otherwise satisfy the own-ness check forever).
      if (isUnsafeKey(key)) return undefined;
      if (!Object.prototype.hasOwnProperty.call(target, key)) return undefined;

      const value = (target as Record<string, unknown>)[key];

      if (isSignal(value)) return value;

      // Check if value is already an EntitySignal (materialized by entities())
      // EntitySignal has addOne and all methods. Duck-typed on the methods
      // alone — no `typeof value === 'object'` gate, so this keeps matching
      // if the EntitySignal shape ever becomes callable (typeof 'function'),
      // the miss-pattern behind the v11.4/11.5 inert-walker bug class.
      if (
        value != null &&
        typeof (value as { addOne?: unknown }).addOne === 'function' &&
        typeof (value as { all?: unknown }).all === 'function'
      ) {
        return value;
      }

      // Preserve EntityMapMarker so entities can materialize them later
      if (isEntityMapMarker(value)) return value;

      // Lazy trees never run marker materialization: this Proxy is the only
      // path to a value and it does not consult MARKER_PROCESSORS. Before
      // 13.4 that surfaced as a raw marker in snapshots (visibly wrong, and
      // for stored() a storage-contents leak); now that markers materialize
      // into real signals elsewhere, an unmaterialized one here is WORSE — it
      // reads as an opaque getter and its value is dropped from every
      // snapshot silently. Fail loudly instead of corrupting data quietly.
      if (isRegisteredMarker(value)) {
        const message =
          `SignalTree: marker at "${path}" cannot be used in a LAZY tree — it ` +
          `is never materialized. [ST2011]`;
        if (typeof ngDevMode === 'undefined' || ngDevMode) {
          throw new Error(message);
        }
        console.error(message);
        return value;
      }

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

      // SECURITY: `target['__proto__'] = v` invokes the prototype SETTER, so
      // this trap was a direct pollution sink. See the `get` trap.
      if (isUnsafeKey(key)) return false;

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

    // SECURITY: without this trap, Object.defineProperty(proxy, '__proto__', …)
    // forwards to the raw target and mints a REAL own `__proto__` key. That was
    // step one of a two-call bypass: once the own key exists, every downstream
    // own-property guard is satisfied and the second call walks into the
    // prototype. Refuse the write outright rather than rely on own-ness.
    defineProperty(target, prop, descriptor) {
      if (isUnsafeKey(prop)) return false;
      return Reflect.defineProperty(target, prop, descriptor);
    },

    has(target, prop) {
      // Mirrors the `get` trap: a key the proxy will not hand out must not be
      // reported as present, or `in` checks disagree with reads.
      if (isUnsafeKey(prop)) return false;
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
