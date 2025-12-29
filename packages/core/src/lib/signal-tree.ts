import { isSignal, signal, WritableSignal } from '@angular/core';

import { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './constants';
import { SignalMemoryManager } from './memory/memory-manager';
import { SecurityValidator } from './security/security-validator';
import { createLazySignalTree, equal, isBuiltInObject, unwrap } from './utils';

import type {
  TreeNode,
  TreeConfig,
  NodeAccessor,
  EntityMapMarker,
  SignalTreeBase,
  Enhancer,
} from './types';

// =============================================================================
// INTERNAL SYMBOLS
// =============================================================================

const NODE_ACCESSOR_SYMBOL = Symbol.for('SignalTree:NodeAccessor');

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isNodeAccessor(value: unknown): value is NodeAccessor<unknown> {
  return (
    typeof value === 'function' &&
    (value as unknown as Record<symbol, unknown>)[NODE_ACCESSOR_SYMBOL] === true
  );
}

function isEntityMapMarker(
  value: unknown
): value is EntityMapMarker<unknown, string | number> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)['__isEntityMap'] === true
  );
}

// =============================================================================
// UTILITIES
// =============================================================================

function createEqualityFn(useShallowComparison: boolean) {
  return useShallowComparison ? Object.is : equal;
}

function estimateObjectSize(
  obj: unknown,
  maxDepth = SIGNAL_TREE_CONSTANTS.ESTIMATE_MAX_DEPTH,
  currentDepth = 0
): number {
  if (currentDepth >= maxDepth) return 1;
  if (obj === null || obj === undefined) return 0;
  if (typeof obj !== 'object') return 1;

  let size = 0;

  try {
    if (Array.isArray(obj)) {
      size = obj.length;
      const sampleSize = Math.min(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_ARRAY,
        obj.length
      );
      for (let i = 0; i < sampleSize; i++) {
        size += estimateObjectSize(obj[i], maxDepth, currentDepth + 1) * 0.1;
      }
    } else {
      const keys = Object.keys(obj);
      size = keys.length;
      const sampleSize = Math.min(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_OBJECT,
        keys.length
      );
      for (let i = 0; i < sampleSize; i++) {
        const value = (obj as Record<string, unknown>)[keys[i]];
        size += estimateObjectSize(value, maxDepth, currentDepth + 1) * 0.5;
      }
    }
  } catch {
    return 1;
  }

  return Math.floor(size);
}

function shouldUseLazy(
  obj: unknown,
  config: TreeConfig,
  precomputedSize?: number
): boolean {
  if (config.useLazySignals !== undefined) return config.useLazySignals;
  if (config.debugMode || config.enableDevTools) return false;
  const estimatedSize = precomputedSize ?? estimateObjectSize(obj);
  return estimatedSize > SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD;
}

// =============================================================================
// SECURITY VALIDATION
// =============================================================================

function validateTree<T>(obj: T, config: TreeConfig): void {
  if (!config.security) return;

  const validator = new SecurityValidator(config.security);

  function validate(value: unknown, path: string[]): void {
    if (value === null || value === undefined) return;

    if (typeof value !== 'object') {
      validator.validateValue(value);
      return;
    }

    if (isBuiltInObject(value)) return;

    if (Array.isArray(value)) {
      value.forEach((item, i) => validate(item, [...path, String(i)]));
      return;
    }

    for (const key of Object.keys(value as Record<string, unknown>)) {
      try {
        validator.validateKey(key);
      } catch (error) {
        throw new Error(
          `${(error as Error).message}\nPath: ${[...path, key].join('.')}`
        );
      }

      const val = (value as Record<string, unknown>)[key];

      try {
        validator.validateValue(val);
      } catch (error) {
        throw new Error(
          `${(error as Error).message}\nPath: ${[...path, key].join('.')}`
        );
      }

      validate(val, [...path, key]);
    }
  }

  validate(obj, []);
}

// =============================================================================
// NODE ACCESSOR CREATION
// =============================================================================

function makeNodeAccessor<T>(store: TreeNode<T>): NodeAccessor<T> {
  const accessor = function (arg?: unknown): T | void {
    if (arguments.length === 0) {
      return unwrap(store);
    }

    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      const current = unwrap(store) as T;
      recursiveUpdate(store, updater(current));
    } else {
      recursiveUpdate(store, arg);
    }
  } as NodeAccessor<T>;

  (accessor as unknown as Record<symbol, boolean>)[NODE_ACCESSOR_SYMBOL] = true;

  // Copy store properties onto accessor
  for (const key of Object.keys(store as object)) {
    Object.defineProperty(accessor, key, {
      value: (store as Record<string, unknown>)[key],
      enumerable: true,
      configurable: true,
    });
  }

  return accessor;
}

function recursiveUpdate(target: unknown, updates: unknown): void {
  if (!updates || typeof updates !== 'object') return;

  const targetObj = isNodeAccessor(target)
    ? (target as unknown as Record<string, unknown>)
    : (target as Record<string, unknown>);

  for (const [key, value] of Object.entries(
    updates as Record<string, unknown>
  )) {
    const prop = targetObj[key];
    if (prop === undefined) continue;

    if (isSignal(prop) && 'set' in prop) {
      (prop as WritableSignal<unknown>).set(value);
    } else if (isNodeAccessor(prop)) {
      if (value && typeof value === 'object') {
        recursiveUpdate(prop, value);
      } else {
        prop(value);
      }
    }
  }
}

// =============================================================================
// SIGNAL STORE CREATION
// =============================================================================

function createSignalStore<T>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean
): TreeNode<T> {
  // Primitives, null, undefined
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }

  // Arrays
  if (Array.isArray(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }

  // Built-in objects (Date, Map, Set, etc.)
  if (isBuiltInObject(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }

  // Regular object - recursive
  const store: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Entity map markers - preserve for withEntities()
    if (isEntityMapMarker(value)) {
      store[key] = value;
      continue;
    }

    // Existing signals - preserve
    if (isSignal(value)) {
      store[key] = value;
      continue;
    }

    // Null, undefined, primitives
    if (value === null || value === undefined || typeof value !== 'object') {
      store[key] = signal(value, { equal: equalityFn });
      continue;
    }

    // Arrays, built-ins
    if (Array.isArray(value) || isBuiltInObject(value)) {
      store[key] = signal(value, { equal: equalityFn });
      continue;
    }

    // Nested object - recurse and wrap in NodeAccessor
    const nested = createSignalStore(value, equalityFn);
    store[key] = makeNodeAccessor(nested);
  }

  return store as TreeNode<T>;
}

// =============================================================================
// CORE CREATE FUNCTION
// =============================================================================

function create<T extends object>(
  initialState: T,
  config: TreeConfig
): SignalTreeBase<T> {
  if (initialState === null || initialState === undefined) {
    throw new Error(SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED);
  }

  // Security validation
  validateTree(initialState, config);

  const equalityFn = createEqualityFn(config.useShallowComparison ?? false);
  const estimatedSize = estimateObjectSize(initialState);
  const useLazy = shouldUseLazy(initialState, config, estimatedSize);

  // Create signal store
  let signalState: TreeNode<T>;
  let memoryManager: SignalMemoryManager | undefined;

  if (useLazy && typeof initialState === 'object') {
    try {
      memoryManager = new SignalMemoryManager();
      signalState = createLazySignalTree(
        initialState,
        equalityFn,
        '',
        memoryManager
      ) as TreeNode<T>;
    } catch (error) {
      console.warn(SIGNAL_TREE_MESSAGES.LAZY_FALLBACK, error);
      signalState = createSignalStore(initialState, equalityFn);
      memoryManager = undefined;
    }
  } else {
    signalState = createSignalStore(initialState, equalityFn);
  }

  // Create root callable function
  const tree = function (arg?: unknown): T | void {
    if (arguments.length === 0) {
      return unwrap(signalState);
    }

    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      const current = unwrap(signalState) as T;
      recursiveUpdate(signalState, updater(current));
    } else {
      recursiveUpdate(signalState, arg);
    }
  } as SignalTreeBase<T>;

  // Mark as NodeAccessor
  (tree as unknown as Record<symbol, boolean>)[NODE_ACCESSOR_SYMBOL] = true;

  // Add core properties
  Object.defineProperty(tree, 'state', {
    value: signalState,
    enumerable: false,
    writable: false,
  });

  Object.defineProperty(tree, '$', {
    value: signalState,
    enumerable: false,
    writable: false,
  });

  // v6 single-enhancer chaining
  Object.defineProperty(tree, 'with', {
    value: function <A>(enhancer: Enhancer<A>): SignalTreeBase<T> & A {
      if (typeof enhancer !== 'function') {
        throw new Error('Enhancer must be a function');
      }
      return enhancer(tree) as SignalTreeBase<T> & A;
    },
    enumerable: false,
    writable: false,
  });

  // bind()
  Object.defineProperty(tree, 'bind', {
    value: function (thisArg?: unknown): NodeAccessor<T> {
      // Use native Function.prototype.bind to avoid calling this custom
      // `bind` property (which would cause infinite recursion).
      return Function.prototype.bind.call(tree, thisArg) as unknown as NodeAccessor<T>;
    },
    enumerable: false,
    // Allow enhancers or consumers to bind/override if necessary
    writable: true,
    configurable: true,
  });

  // destroy()
  Object.defineProperty(tree, 'destroy', {
    value: function (): void {
      if (memoryManager) {
        memoryManager.dispose();
      }
      if (config.debugMode) {
        console.log(SIGNAL_TREE_MESSAGES.TREE_DESTROYED);
      }
    },
    enumerable: false,
    // Allow enhancers (like guardrails) to override/replace `destroy` at runtime.
    writable: true,
    configurable: true,
  });

  // Copy state properties to root for direct access
  for (const key of Object.keys(signalState as object)) {
    if (!(key in tree)) {
      Object.defineProperty(tree, key, {
        value: (signalState as Record<string, unknown>)[key],
        enumerable: true,
        configurable: true,
      });
    }
  }

  return tree;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Create a minimal SignalTree.
 *
 * Returns SignalTreeBase<T> with only core functionality.
 * Use .with() to add enhancers for additional features.
 *
 * @example
 * ```typescript
 * // Minimal tree
 * const tree = signalTree({ count: 0 });
 *
 * // With effects
 * const tree = signalTree({ count: 0 }).with(withEffects());
 *
 * // With multiple enhancers
 * const tree = signalTree({ count: 0 })
 *   .with(withEffects())
 *   .with(withTimeTravel())
 *   .with(withBatching());
 * ```
 */
export function signalTree<T extends object>(
  initialState: T,
  config: TreeConfig = {}
): SignalTreeBase<T> {
  return create(initialState, config);
}
