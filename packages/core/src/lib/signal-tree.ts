/**
 * SignalTree Core Implementation - Recursive Typing Engine
 *
 * COPYRIGHT NOTICE:
 * This file contains the proprietary recursive typing implementation protected
 * under the SignalTree license. The signal-store pattern, recursive type-runtime
 * alignment, and "initiation defines structure" paradigm are exclusive intellectual
 * property of Jonathan D Borgia.
 *
 * The createSignalStore and createLazySignalTree functions implement patented
 * approaches to recursive type preservation that are strictly protected.
 *
 * Licensed under Fair Source License - see LICENSE file for complete terms.
 */

import {
  signal,
  WritableSignal,
  Signal,
  computed,
  effect,
  inject,
  DestroyRef,
  isSignal,
} from '@angular/core';
import type {
  SignalTree,
  DeepSignalify,
  TreeConfig,
  TreePreset,
  Middleware,
  PerformanceMetrics,
  EntityHelpers,
  AsyncActionConfig,
  AsyncAction,
  TimeTravelEntry,
} from './types';
import { createLazySignalTree, equal } from './utils';

/**
 * Creates an equality function based on configuration.
 *
 * @param useShallowComparison - If true, uses Object.is for comparison; otherwise uses deep equality
 * @returns A function that compares two values for equality
 *
 * @example
 * ```typescript
 * const shallowEqual = createEqualityFn(true);
 * const deepEqual = createEqualityFn(false);
 *
 * shallowEqual({ a: 1 }, { a: 1 }); // false (different objects)
 * deepEqual({ a: 1 }, { a: 1 }); // true (same structure and values)
 * ```
 */
function createEqualityFn(useShallowComparison: boolean) {
  return useShallowComparison ? Object.is : equal;
}

/**
 * Core function to create a basic SignalTree with enhanced safety.
 * This provides the minimal functionality without advanced features.
 *
 * CRITICAL: Uses flexible typing - accepts ANY type T, not T
 *
 * @template T - The state object type (NO constraints - maximum flexibility)
 * @param obj - The initial state object
 * @param config - Configuration options for the tree
 * @returns A basic SignalTree with core functionality
 *
 * @example
 * ```typescript
 * const tree = create({
 *   count: 0,
 *   user: { name: 'John', age: 30 },
 *   items: [1, 2, 3],
 *   metadata: new Map(),  // Any object type!
 *   fn: () => 'hello'     // Even functions!
 * }, {
 *   useLazySignals: true,
 *   useShallowComparison: false
 * });
 *
 * // Access nested signals
 * console.log(tree.$.count()); // 0
 * tree.$.user.name.set('Jane');
 * ```
 */
function create<T>(obj: T, config: TreeConfig = {}): SignalTree<T> {
  const equalityFn = createEqualityFn(config.useShallowComparison ?? false);
  const useLazy = config.useLazySignals ?? true;

  // Create signals using signal-store pattern for perfect type inference
  const signalState = useLazy
    ? createLazySignalTree(obj as object, equalityFn)
    : createSignalStore(obj, equalityFn);

  const resultTree = {
    state: signalState,
    $: signalState, // $ points to the same state object
  } as SignalTree<T>;

  enhanceTree(resultTree);
  return resultTree;
}

/**
 * Creates signals using signal-store pattern for perfect type inference.
 * This is the key function that preserves exact type relationships recursively.
 * Based on the original signal-store pattern that maintains type information.
 *
 * @template T - The object type to process (preserves exact type structure)
 * @param obj - The object to convert to signals
 * @param equalityFn - Function to compare values for equality
 * @returns A deeply signalified version maintaining exact type structure
 *
 * @example
 * ```typescript
 * const store = createSignalStore({
 *   user: { name: 'John', age: 30 },
 *   settings: { theme: 'dark' }
 * }, Object.is);
 *
 * // Perfect type inference maintained throughout
 * store.user.name.set('Jane');
 * console.log(store.settings.theme()); // 'dark'
 * ```
 */
function createSignalStore<T>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean
): DeepSignalify<T> {
  const store: Partial<DeepSignalify<T>> = {};

  // Helper to detect built-in objects that should be treated as primitives
  const isBuiltInObject = (v: unknown): boolean => {
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
      v instanceof Promise
    );
  };

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isObj = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v) &&
      !isBuiltInObject(v);

    // Enhanced safety: Never double-wrap signals
    if (isSignal(value)) {
      (store as Record<string, unknown>)[key] = value;
    } else if (isObj(value)) {
      // CRITICAL: Recursive call with type preservation - THIS IS THE KEY!
      // Uses the signal-store pattern to maintain exact type relationships
      (store as Record<string, unknown>)[key] = createSignalStore(
        value,
        equalityFn
      );
    } else {
      // Create signal for primitives, arrays, and built-in objects
      (store as Record<string, unknown>)[key] = signal(value, {
        equal: equalityFn,
      });
    }
  }

  return store as DeepSignalify<T>;
}

/**
 * Enhances a tree with basic functionality (unwrap, update, pipe).
 * Adds core methods that every SignalTree needs for basic operation.
 *
 * @template T - The state object type
 * @param tree - The tree to enhance with basic functionality
 * @returns The enhanced tree with unwrap, update, and pipe methods
 *
 * @example
 * ```typescript
 * const basicTree = { state: signalState, $: signalState };
 * enhanceTree(basicTree);
 *
 * // Now has basic methods:
 * const currentState = basicTree.unwrap();
 * basicTree.update(state => ({ ...state, count: state.count + 1 }));
 * const enhancedTree = basicTree.pipe(withSomeFeature());
 * ```
 */
function enhanceTree<T>(tree: SignalTree<T>): SignalTree<T> {
  /**
   * Unwraps the current state by reading all signal values.
   * Recursively converts the signal tree back to plain JavaScript values.
   *
   * @returns The current state as a plain object
   *
   * @example
   * ```typescript
   * const tree = signalTree({
   *   user: { name: 'John', age: 30 },
   *   count: 0
   * });
   *
   * tree.$.user.name.set('Jane');
   * tree.$.count.set(5);
   *
   * const currentState = tree.unwrap();
   * // { user: { name: 'Jane', age: 30 }, count: 5 }
   * ```
   */
  tree.unwrap = (): T => {
    // Recursively unwrap with proper typing
    const unwrapObject = <O>(obj: DeepSignalify<O>): O => {
      if (typeof obj !== 'object' || obj === null) {
        return obj as O;
      }

      const result = {} as Record<string, unknown>;

      for (const key in obj) {
        const value = (obj as Record<string, unknown>)[key];

        if (isSignal(value)) {
          result[key] = (value as Signal<unknown>)();
        } else if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          // Nested signal state
          result[key] = unwrapObject(value as DeepSignalify<object>);
        } else {
          result[key] = value;
        }
      }

      return result as O;
    };

    return unwrapObject(tree.state as DeepSignalify<T>);
  };

  /**
   * Updates the state using an updater function.
   * The updater receives the current state and returns a partial update.
   * Automatically handles nested signal updates.
   *
   * @param updater - Function that receives current state and returns partial updates
   *
   * @example
   * ```typescript
   * const tree = signalTree({
   *   user: { name: 'John', age: 30 },
   *   count: 0,
   *   todos: []
   * });
   *
   * // Simple update
   * tree.update(state => ({ count: state.count + 1 }));
   *
   * // Nested update
   * tree.update(state => ({
   *   user: { ...state.user, age: state.user.age + 1 },
   *   todos: [...state.todos, { id: 1, text: 'New todo' }]
   * }));
   *
   * // Conditional update
   * tree.update(state =>
   *   state.count < 10
   *     ? { count: state.count + 1 }
   *     : { count: 0, user: { ...state.user, name: 'Reset' } }
   * );
   * ```
   */
  tree.update = (updater: (current: T) => Partial<T>) => {
    const currentValue = tree.unwrap();
    const partialObj = updater(currentValue);

    // Recursively update with better typing
    const updateObject = <O>(
      target: DeepSignalify<O>,
      updates: Partial<O>
    ): void => {
      for (const key in updates) {
        if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;

        const updateValue = updates[key];
        const currentSignalOrState = (target as Record<string, unknown>)[key];

        if (isSignal(currentSignalOrState)) {
          // Direct signal update
          (currentSignalOrState as WritableSignal<unknown>).set(updateValue);
        } else if (
          typeof updateValue === 'object' &&
          updateValue !== null &&
          !Array.isArray(updateValue) &&
          typeof currentSignalOrState === 'object' &&
          currentSignalOrState !== null
        ) {
          // Nested object - recurse
          updateObject(
            currentSignalOrState as DeepSignalify<object>,
            updateValue as Partial<object>
          );
        }
      }
    };

    updateObject(tree.state as DeepSignalify<T>, partialObj);
  };

  // Pipe implementation for function composition with improved type safety
  tree.pipe = (<TResult = SignalTree<T>>(
    ...fns: Array<(input: unknown) => unknown>
  ): TResult => {
    if (fns.length === 0) {
      return tree as unknown as TResult;
    }

    // Type-safe reduce with proper function composition
    return fns.reduce((acc, fn) => {
      if (typeof fn !== 'function') {
        throw new Error('All pipe arguments must be functions');
      }
      return fn(acc);
    }, tree as unknown) as TResult;
  }) as SignalTree<T>['pipe'];

  // Stub implementations for advanced features (will log warnings)
  tree.batchUpdate = (updater: (current: T) => Partial<T>) => {
    console.warn(
      '⚠️ batchUpdate() called but batching is not enabled.',
      '\nTo enable batch updates, install @signaltree/batching'
    );
    // Fallback: Just call update directly
    tree.update(updater);
  };

  tree.memoize = <R>(fn: (tree: T) => R, cacheKey?: string): Signal<R> => {
    console.warn(
      '⚠️ memoize() called but memoization is not enabled.',
      '\nTo enable memoized computations, install @signaltree/memoization'
    );
    // Fallback: Use simple Angular computed without memoization
    void cacheKey; // Mark as intentionally unused
    return computed(() => fn(tree.unwrap()));
  };

  tree.effect = (fn: (tree: T) => void) => {
    try {
      effect(() => fn(tree.unwrap()));
    } catch (error) {
      // Fallback for test environments without injection context
      console.warn('Effect requires Angular injection context', error);
    }
  };

  tree.subscribe = (fn: (tree: T) => void): (() => void) => {
    try {
      const destroyRef = inject(DestroyRef);
      let isDestroyed = false;

      const effectRef = effect(() => {
        if (!isDestroyed) {
          fn(tree.unwrap());
        }
      });

      const unsubscribe = () => {
        isDestroyed = true;
        effectRef.destroy();
      };

      destroyRef.onDestroy(unsubscribe);
      return unsubscribe;
    } catch (error) {
      // Fallback for test environment - call once immediately
      console.warn('Subscribe requires Angular injection context', error);
      fn(tree.unwrap());
      return () => {
        // No-op unsubscribe
      };
    }
  };

  // Stub implementations for performance features
  tree.optimize = () => {
    console.warn(
      '⚠️ optimize() called but tree optimization is not available.',
      '\nTo enable optimization, install @signaltree/memoization'
    );
  };

  tree.clearCache = () => {
    console.warn(
      '⚠️ clearCache() called but caching is not available.',
      '\nTo enable caching, install @signaltree/memoization'
    );
  };

  tree.invalidatePattern = (): number => {
    console.warn(
      '⚠️ invalidatePattern() called but performance optimization is not enabled.',
      '\nTo enable pattern invalidation, install @signaltree/memoization'
    );
    return 0;
  };

  tree.destroy = () => {
    // Clean up lazy signal proxies if they exist
    const state = tree.state as unknown;
    if (state && typeof state === 'object' && '__cleanup__' in state) {
      (state as { __cleanup__: () => void }).__cleanup__();
    }

    // Basic cleanup for non-enhanced trees
    console.log('[MEMORY-CLEANUP] Basic tree destroyed');
  };

  tree.getMetrics = (): PerformanceMetrics => {
    console.warn(
      '⚠️ getMetrics() called but performance tracking is not enabled.',
      '\nTo enable performance tracking, install @signaltree/middleware'
    );
    // Return minimal metrics when tracking not enabled
    return {
      updates: 0,
      computations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageUpdateTime: 0,
    };
  };

  // Stub implementations for middleware
  tree.addTap = (middleware: Middleware<T>) => {
    console.warn(
      '⚠️ addTap() called but middleware support is not available.',
      '\nTo enable middleware, install @signaltree/middleware'
    );
    void middleware; // Mark as intentionally unused
  };

  tree.removeTap = (id: string) => {
    console.warn(
      '⚠️ removeTap() called but middleware support is not available.',
      '\nTo enable middleware, install @signaltree/middleware'
    );
    void id; // Mark as intentionally unused
  };

  // Stub implementations for entity helpers
  tree.asCrud = <E extends { id: string | number }>(): EntityHelpers<E> => {
    console.warn(
      '⚠️ asCrud() called but entity helpers are not available.',
      '\nTo enable entity helpers, install @signaltree/entities'
    );
    return {} as EntityHelpers<E>;
  };

  // Stub implementations for async actions
  tree.asyncAction = <TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config: AsyncActionConfig<T, TResult> = {}
  ): AsyncAction<TInput, TResult> => {
    console.warn(
      '⚠️ asyncAction() called but async actions are not available.',
      '\nTo enable async actions, install @signaltree/async'
    );
    void operation;
    void config;
    return {} as AsyncAction<TInput, TResult>;
  };

  // Stub implementations for time travel
  tree.undo = () => {
    console.warn(
      '⚠️ undo() called but time travel is not available.',
      '\nTo enable time travel, install @signaltree/time-travel'
    );
  };

  tree.redo = () => {
    console.warn(
      '⚠️ redo() called but time travel is not available.',
      '\nTo enable time travel, install @signaltree/time-travel'
    );
  };

  tree.getHistory = (): TimeTravelEntry<T>[] => {
    console.warn(
      '⚠️ getHistory() called but time travel is not available.',
      '\nTo enable time travel, install @signaltree/time-travel'
    );
    return [];
  };

  tree.resetHistory = () => {
    console.warn(
      '⚠️ resetHistory() called but time travel is not available.',
      '\nTo enable time travel, install @signaltree/time-travel'
    );
  };

  return tree;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Creates a reactive signal tree with smart progressive enhancement.
 *
 * MAXIMUM FLEXIBILITY: Accepts ANY type T - no StateObject constraint!
 * This is the key difference from constrained approaches.
 *
 * Features auto-enable on first use. Uses intelligent defaults based on
 * environment (development vs production). Enhanced with safety features
 * to prevent common issues like signal double-wrapping.
 *
 * @template T - ANY type (no constraints for maximum flexibility)
 * @param obj - The initial state object to convert into a reactive tree
 * @returns A SignalTree with auto-enabling features
 *
 * @example
 * ```typescript
 * // Works with ANY object - no constraints!
 * const tree = signalTree({
 *   count: 0,
 *   users: [],
 *   metadata: new Map(),  // Non-plain objects work!
 *   fn: () => 'hello',    // Functions work!
 *   symbol: Symbol('id')  // Symbols work!
 * });
 *
 * // Core functionality always works
 * tree.state.count.set(5);
 * tree.update(state => ({ count: state.count + 1 }));
 *
 * // Composition with pipe
 * tree.pipe(
 *   withBatching(),
 *   withMemoization(),
 *   withTimeTravel()
 * );
 * ```
 */
export function signalTree<T>(obj: T): SignalTree<T>;

/**
 * Creates a reactive signal tree with preset configuration.
 *
 * Uses predefined configurations for common scenarios while still
 * allowing features to auto-enable as needed.
 *
 * @template T - The state object type, must extend Record<string, unknown>
 * @param obj - The initial state object to convert into a reactive tree
 * @param preset - Preset configuration ('basic', 'performance', 'development', 'production')
 * @returns A SignalTree configured with the specified preset
 *
 * @example
 * ```typescript
 * // Optimized for production
 * const prodTree = signalTree(state, 'production');
 *
 * // Full debugging capabilities
 * const devTree = signalTree(state, 'development');
 *
 * // Maximum performance
 * const perfTree = signalTree(state, 'performance');
 * ```
 */
export function signalTree<T>(obj: T, preset: TreePreset): SignalTree<T>;

/**
 * Creates a reactive signal tree with custom configuration.
 *
 * Provides full control over feature enablement while maintaining
 * auto-enabling behavior for unspecified features. Enhanced with safety features.
 *
 * @template T - ANY type (no constraints for maximum flexibility)
 * @param obj - The initial state object to convert into a reactive tree
 * @param config - Custom configuration object
 * @returns A SignalTree configured with custom options
 *
 * @example
 * ```typescript
 * // Custom configuration - works with ANY object!
 * const customTree = signalTree({
 *   data: state,
 *   metadata: new Map(),  // Any object type
 *   fn: () => 'custom'    // Even functions
 * }, {
 *   batchUpdates: true,
 *   useMemoization: true,
 *   maxCacheSize: 500,
 *   treeName: 'MyApp'
 * });
 * ```
 */
export function signalTree<T>(obj: T, config: TreeConfig): SignalTree<T>;

/**
 * Implementation of the signalTree factory function.
 */
/**
 * Main SignalTree factory function with superior type inference
 *
 * Key improvements from signal-store.ts approach:
 * 1. Uses Required<T> for better type inference when possible
 * 2. Maintains complete type information through recursion
 * 3. Proper handling of nested objects and arrays
 * 4. No type constraints - maximum flexibility
 */
export function signalTree<T extends Record<string, unknown>>(
  obj: Required<T>,
  configOrPreset?: TreeConfig | TreePreset
): SignalTree<Required<T>>;

export function signalTree<T>(
  obj: T,
  configOrPreset?: TreeConfig | TreePreset
): SignalTree<T>;

export function signalTree<T>(
  obj: T,
  configOrPreset?: TreeConfig | TreePreset
): SignalTree<T> {
  // Handle preset strings
  if (typeof configOrPreset === 'string') {
    console.warn(
      '⚠️ Preset configurations are not available in @signaltree/core.',
      '\nTo use presets, install @signaltree/presets'
    );
    // Fallback to basic configuration
    return create(obj, {});
  }

  // Handle configuration objects or default (smart enhancement)
  const config = configOrPreset || {};
  return create(obj, config);
}
