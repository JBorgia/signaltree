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
 * `__proto__` is the ONLY name that must be refused outright: it is an accessor
 * on Object.prototype, so reading it walks off the tree and writing it mutates
 * every object in the process.
 *
 * `constructor` and `prototype` are dangerous only as a FALL-THROUGH to the
 * prototype chain, which the own-property check at each trap already prevents —
 * an own `constructor` reads back the user's own value and can never yield
 * `Object`. Blocklisting them by name (as a previous revision did) silently
 * DELETED legitimate state: `signalTree({ constructor: 'x' }, lazy)` unwrapped
 * to `{}`, eager and lazy trees disagreed, and `makeNodeAccessor` is written as
 * a concise method specifically so `prototype` works as a state key. Two guards
 * that each cover the real hole beat one that also eats data.
 */
function isUnsafeKey(key: string | symbol): boolean {
  return key === '__proto__';
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

      // SECURITY: never hand out a view of the prototype chain. This trap used
      // `key in target`, which WALKS it — so `$.__proto__` resolved to
      // Object.prototype, got wrapped in a nested writable Proxy below and
      // cached, handing any holder of the tree a live handle on
      // Object.prototype.
      //
      // A lazy node's raw target has no child index (signals are created on
      // demand, so there is nothing to index yet), so the structural equivalent
      // here is an OWN-PROPERTY read: the prototype chain is simply never
      // consulted. `__proto__` is refused by name on top because a
      // `defineProperty` write can mint an own `__proto__`, which would satisfy
      // an own-ness check forever — the exact two-call bypass found by audit.
      // `constructor`/`prototype` deliberately get NO name check: own-ness
      // already stops the fall-through, and blocking them by name silently
      // deleted legitimate state under those keys and made lazy and eager trees
      // disagree.
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
