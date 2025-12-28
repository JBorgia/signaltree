import { effect, Injector, isSignal, runInInjectionContext, Signal, signal, WritableSignal } from '@angular/core';
import { deepEqual, isBuiltInObject, parsePath } from '@signaltree/shared';

/** Symbol to mark callable signals - using global symbol to match across files */
const CALLABLE_SIGNAL_SYMBOL = Symbol.for('NodeAccessor');

/**
 * SignalTree Utility Functions v1.1.6
 * Core utilities for signal tree operations
 */

export { deepEqual };
export { deepEqual as equal };
export { isBuiltInObject };
export { parsePath };

/**
 * Check if a value is an EntityMapMarker
 * Used to preserve entity map markers during lazy signal tree creation
 */
function isEntityMapMarker(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { __isEntityMap?: unknown }).__isEntityMap === true
  );
}

/**
 * Generic memory manager interface for lazy signal trees
 */
export interface MemoryManager {
  getSignal(path: string): WritableSignal<unknown> | undefined;
  cacheSignal(path: string, signal: WritableSignal<unknown>): void;
  dispose(): void;
}

/**
 * Minimal type definitions for utils package
 * (Full definitions are in @signaltree/types)
 */

export interface NodeAccessor<T> {
  (): T;
  (value: T): void;
  (updater: (current: T) => T): void;
}

export type TreeNode<T> = {
  [K in keyof T]: T[K] extends readonly unknown[]
    ? WritableSignal<T[K]>
    : T[K] extends object
    ? T[K] extends Signal<unknown>
      ? T[K]
      : T[K] extends (...args: unknown[]) => unknown
      ? WritableSignal<T[K]>
      : NodeAccessor<T[K]>
    : WritableSignal<T[K]>;
};

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

/**
 * Converts a NodeAccessor (SignalTree slice or whole tree) into a WritableSignal
 * compatible with Angular's Signal Forms connect() API and other APIs that expect WritableSignal.
 *
 * Creates a two-way binding between the NodeAccessor and a WritableSignal:
 * - Reads all leaf values from the NodeAccessor and exposes them as a signal
 * - Writes to the WritableSignal update the underlying NodeAccessor
 *
 * **Important**: This function uses `effect()` internally for synchronization, which requires
 * an injection context. It can be called in:
 * - Component/directive/pipe class field initializers
 * - Component/directive/pipe constructors
 * - Functions called from within an injection context
 *
 * @template T - The type of the node value
 * @param node - The NodeAccessor to convert (can be a slice or whole tree)
 * @returns A WritableSignal that stays in sync with the NodeAccessor
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   user: { name: '', email: '' }
 * });
 *
 * // Convert slice to WritableSignal for Angular Signal Forms
 * const userSignal = toWritableSignal(tree.$.user);
 * formControl.connect(userSignal); // ✅ Works with connect()
 *
 * // Leaves are already WritableSignal - no conversion needed
 * nameControl.connect(tree.$.user.name); // ✅ Already a WritableSignal
 * ```
 */
export function toWritableSignal<T>(
  node: NodeAccessor<T>,
  injector?: unknown
): WritableSignal<T> {
  // Create a signal initialized with the current node value
  const sig = signal(node());

  // Capture original setter before overriding so tree->signal sync doesn't write back and loop
  const originalSet = sig.set.bind(sig);

  // Effect to sync tree (NodeAccessor) changes into the writable signal
  // We intentionally track dependencies inside node() so updates to any leaf propagate.
  const runner = () => {
    originalSet(node() as T);
  };
  if (injector) {
    runInInjectionContext(injector as Injector, () => effect(runner));
  } else {
    try {
      effect(runner);
    } catch {
      console.warn(
        '[SignalTree] toWritableSignal called without injection context; pass Injector for reactivity.'
      );
    }
  }

  // Override set to write back to the NodeAccessor, then update local signal
  sig.set = (value: T) => {
    node(value);
    originalSet(value);
  };

  // Override update to write back using set pathway
  sig.update = (updater: (current: T) => T) => {
    sig.set(updater(sig()));
  };

  return sig;
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

      // Check if value is already an EntitySignal (materialized by withEntities())
      // EntitySignal has addOne and all methods
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as { addOne?: unknown }).addOne === 'function' &&
        typeof (value as { all?: unknown }).all === 'function'
      ) {
        return value;
      }

      // Preserve EntityMapMarker so withEntities can materialize them later
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

/**
 * Snapshot the current tree state into a plain JS object by unwrapping signals.
 */
export function snapshotState<T>(state: TreeNode<T>): T {
  return unwrap(state as unknown) as T;
}

/**
 * Apply a plain JS snapshot onto a TreeNode (state.$) by writing into signals or node accessors.
 * This is a shallow/apply operation suitable for devtools/time-travel use-cases.
 */
export function applyState<T>(stateNode: TreeNode<T>, snapshot: T): void {
  if (snapshot === null || snapshot === undefined) return;
  if (typeof snapshot !== 'object') return;

  for (const key of Object.keys(snapshot as Record<string, unknown>)) {
    const val = (snapshot as Record<string, unknown>)[key];
    const target = (stateNode as Record<string, unknown>)[key];

    if (isNodeAccessor(target)) {
      if (val && typeof val === 'object') {
        try {
          applyState(target as unknown as TreeNode<unknown>, val as unknown as any);
        } catch {
          try {
            (target as any)(val);
          } catch {
            // swallow
          }
        }
      } else {
        try {
          (target as any)(val);
        } catch {
          // ignore
        }
      }
    } else if (isSignal(target)) {
      try {
        (target as any).set?.(val);
      } catch {
        try {
          (target as any)(val);
        } catch {
          // ignore
        }
      }
    } else {
      try {
        (stateNode as Record<string, unknown>)[key] = val as unknown;
      } catch {
        // ignore
      }
    }
  }
}

export function deepCloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
