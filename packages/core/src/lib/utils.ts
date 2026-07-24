import { effect, Injector, isSignal, runInInjectionContext, Signal, signal, WritableSignal } from '@angular/core';
import { deepEqual, isBuiltInObject, parsePath } from '@signaltree/shared';

declare const ngDevMode: boolean | undefined;

/** Symbol to mark callable signals - must match symbol used by signal-tree */
const CALLABLE_SIGNAL_SYMBOL = Symbol.for('SignalTree:NodeAccessor');

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
export function isEntityMapMarker(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { __isEntityMap?: unknown }).__isEntityMap === true
  );
}

/**
 * Check if a value is a branded loader feature produced by `loader()`.
 *
 * Kept here (a shake-safe, dependency-free property check) rather than in
 * `./markers/loader` on purpose: `entity-map.ts` calls this guard on every
 * materialized collection, so if the guard lived alongside `loader()` it would
 * statically pull the loader module — and its `attachLoader` import — into
 * every `entityMap()` consumer, defeating the whole tree-shake boundary. Mirror
 * of {@link isEntityMapMarker}.
 */
export function isLoaderFeature(
  value: unknown
): value is { __signalTreeLoader: true; attach(entity: unknown): void } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { __signalTreeLoader?: unknown }).__signalTreeLoader === true &&
      // Also require a callable `attach` — the guard's return type promises it,
      // and the factory relies on this to fail closed: a hand-forged brand
      // without `attach` must be rejected at the call site ([ST2004]), not slip
      // through and TypeError inside the marker processor's swallowed try/catch.
      typeof (value as { attach?: unknown }).attach === 'function'
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

// NodeAccessor and TreeNode are defined in ./types.ts (canonical location)
import type { NodeAccessor, TreeNode } from './types';

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
 * Checks if a value is a non-null object or function — the permissive
 * "can this have own enumerable children worth recursing into" test that
 * every hand-written tree walker in this codebase needs. Node accessors and
 * leaf signals are callable (`typeof === 'function'`); plain nested state
 * literals are plain objects (`typeof === 'object'`) — a walker that only
 * accepts one of the two silently skips half the tree.
 *
 * This is intentionally broader than {@link isNodeAccessor} or
 * {@link isAnySignal}, which check for a *specific* shape. Use this as the
 * "should I keep walking?" guard before those narrower checks decide what
 * to do with the value.
 *
 * Typed as a guard narrowing to `object` (which in TypeScript includes
 * callables), so callers can pass the value to `Object.keys()` /
 * `WeakSet#has()` without re-asserting what the guard already proved.
 */
export function isTraversableNode(value: unknown): value is object {
  return (
    value != null && (typeof value === 'object' || typeof value === 'function')
  );
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
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.warn(
          '[SignalTree] toWritableSignal called without injection context; pass Injector for reactivity.'
        );
      }
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
      } else if (typeof value === 'function') {
        // Skip functions so snapshots stay plain-data.
        continue;
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

    if (typeof value === 'function' && !isNodeAccessor(value) && !isSignal(value)) {
      // Skip plain functions so snapshots stay plain-data.
      continue;
    }

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

    if (typeof value === 'function' && !isNodeAccessor(value) && !isSignal(value)) {
      // Skip plain functions so snapshots stay plain-data.
      continue;
    }

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

  // Special-case EntitySignal-like nodes: restore via setAll() when possible
  // so internal storage stays consistent.
  if (
    stateNode &&
    typeof stateNode === 'object' &&
    typeof (stateNode as any).setAll === 'function' &&
    snapshot &&
    typeof snapshot === 'object' &&
    Array.isArray((snapshot as any).all)
  ) {
    try {
      (stateNode as any).setAll((snapshot as any).all);
      return;
    } catch {
      // fall back to generic application
    }
  }

  for (const key of Object.keys(snapshot as Record<string, unknown>)) {
    const val = (snapshot as Record<string, unknown>)[key];
    const target = (stateNode as Record<string, unknown>)[key];

    if (isNodeAccessor(target)) {
      if (val && typeof val === 'object') {
        try {
          applyState(
            target as unknown as TreeNode<unknown>,
            val as unknown as any
          );
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
    } else if (
      target &&
      typeof target === 'object' &&
      val &&
      typeof val === 'object' &&
      !Array.isArray(target) &&
      !Array.isArray(val)
    ) {
      try {
        applyState(target as unknown as TreeNode<unknown>, val as unknown as any);
      } catch {
        try {
          (stateNode as Record<string, unknown>)[key] = val as unknown;
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
