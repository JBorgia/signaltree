import { isSignal, Signal, signal, WritableSignal } from '@angular/core';
import { create } from 'domain';
import { config } from 'process';

import { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './constants';
import { OptimizedUpdateEngine } from './performance/update-engine';
import { SecurityValidator } from './security/security-validator';
import { equal, isBuiltInObject, unwrap } from './utils';

// Global symbol for NodeAccessor identification
const NODE_ACCESSOR_SYMBOL = Symbol.for('NodeAccessor');

import type {
  TreeNode,
  TreeConfig,
  TreePreset,
  EntityHelpers,
  TimeTravelEntry,
  EnhancerWithMeta,
  ChainResult,
  NodeAccessor,
  EntityMapMarker,
  SignalTreeBase,
  Enhancer,
} from './types';
// Type alias for internal use - general enhancer shape used locally
type LocalUnknownEnhancer = EnhancerWithMeta<unknown, unknown>;

// Extended tree type with optional updateEngine
interface SignalTreeWithEngine<T> extends SignalTreeBase<T> {
  updateEngine?: OptimizedUpdateEngine;
}

// Note: Callable syntax is supported via optional build-time transform only.
// No runtime Proxy wrapping is applied to writable signals to keep zero-cost semantics.

/**
 * Creates a callable NodeAccessor for nested objects WITHOUT a backing signal
 * This accessor reads from and writes to child signals directly
 */
function makeNodeAccessor<T>(): NodeAccessor<T> {
  const accessor = function (arg?: unknown): T | void {
    if (arguments.length === 0) {
      // Read from child signals - use the accessor itself as the context
      return unwrap(accessor);
    }

    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      const currentValue = unwrap(accessor) as T;
      const newValue = updater(currentValue);
      recursiveUpdate(accessor, newValue);
    } else {
      // Direct set
      recursiveUpdate(accessor, arg);
    }
  } as NodeAccessor<T>;

  (accessor as NodeAccessor<T> & Record<symbol, boolean>)[
    NODE_ACCESSOR_SYMBOL
  ] = true;
  return accessor;
}

/**
 * Creates a NodeAccessor for the root tree that manages a backing signal
 */
function makeRootNodeAccessor<T>(
  readSignal: Signal<T>,
  writeSignal: WritableSignal<T>
): NodeAccessor<T> {
  const accessor = function (arg?: unknown): T | void {
    if (arguments.length === 0) {
      return readSignal();
    }

    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      writeSignal.set(updater(readSignal()));
    } else {
      writeSignal.set(arg as T);
    }
  } as NodeAccessor<T>;

  (accessor as NodeAccessor<T> & Record<symbol, boolean>)[
    NODE_ACCESSOR_SYMBOL
  ] = true;
  return accessor;
}

function recursiveUpdate(target: unknown, updates: unknown): void {
  if (!updates || typeof updates !== 'object') {
    return;
  }

  let targetObj: Record<string, unknown>;

  // Handle NodeAccessor (function) as target
  if (isNodeAccessor(target)) {
    targetObj = target as unknown as Record<string, unknown>;
  } else if (target && typeof target === 'object') {
    targetObj = target as Record<string, unknown>;
  } else {
    return;
  }

  const updatesObj = updates as Record<string, unknown>;

  for (const key in updatesObj) {
    if (!(key in targetObj)) {
      continue;
    }

    const targetProp = targetObj[key];
    const updateValue = updatesObj[key];

    if (isSignal(targetProp)) {
      // Leaf signal - check if it's writable
      if ('set' in targetProp && typeof targetProp.set === 'function') {
        (targetProp as WritableSignal<unknown>).set(updateValue);
      }
    } else if (isNodeAccessor(targetProp)) {
      // For nested objects, check if updateValue is an object for recursive update
      if (updateValue && typeof updateValue === 'object') {
        recursiveUpdate(targetProp, updateValue);
      } else {
        // Direct value assignment
        targetProp(updateValue);
      }
    }
  }
}

/**
 * Checks if a value is a NodeAccessor
 */
export function isNodeAccessor(value: unknown): value is NodeAccessor<unknown> {
  return (
    typeof value === 'function' &&
    value &&
    (value as unknown as Record<symbol, unknown>)[NODE_ACCESSOR_SYMBOL] === true
  );
}

// ============================================
// PERFORMANCE HEURISTICS
// ============================================

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
  if (config.batchUpdates && config.useMemoization) return true;
  const estimatedSize = precomputedSize ?? estimateObjectSize(obj);
  return estimatedSize > SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD;
}

// ============================================
// SECURITY VALIDATION
// ============================================

/**
 * Validates an object tree using SecurityValidator if configured
 * Throws if validation fails
 */
function validateTree<T>(
  obj: T,
  config: TreeConfig,
  path: string[] = []
): void {
  if (!config.security) {
    return; // No validation needed
  }

  const validator = new SecurityValidator(config.security);

  function validate(value: unknown, currentPath: string[]): void {
    // Validate primitives and null/undefined
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value !== 'object') {
      // Validate the value (this will catch functions)
      validator.validateValue(value);
      return;
    }

    // Skip built-in objects
    if (isBuiltInObject(value)) {
      return;
    }

    // Validate arrays
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        validate(item, [...currentPath, String(index)]);
      });
      return;
    }

    // Validate object keys and values
    // Use Reflect.ownKeys to catch all keys including __proto__
    const keys = [
      ...Object.keys(value as Record<string, unknown>),
      ...Object.getOwnPropertyNames(value),
    ];
    const uniqueKeys = [...new Set(keys)];

    for (const key of uniqueKeys) {
      if (typeof key === 'symbol') continue;

      // Validate the key
      try {
        validator.validateKey(key);
      } catch (error) {
        const err = error as Error;
        throw new Error(
          `${err.message}\nPath: ${[...currentPath, key].join('.')}`
        );
      }

      // Get the value
      const val = (value as Record<string, unknown>)[key];

      // Validate the value
      try {
        validator.validateValue(val);
      } catch (error) {
        const err = error as Error;
        throw new Error(
          `${err.message}\nPath: ${[...currentPath, key].join('.')}`
        );
      }

      // Recursively validate nested objects
      validate(val, [...currentPath, key]);
    }
  }

  validate(obj, path);
}

function createEqualityFn(useShallowComparison: boolean) {
  return useShallowComparison ? Object.is : equal;
}

// ============================================
// SIGNAL CREATION
// ============================================

function createSignalStore<T>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean
): TreeNode<T> {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }

  if (Array.isArray(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }

  if (isBuiltInObject(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }

  const store: Partial<TreeNode<T>> = {};
  const processedObjects = new WeakSet<object>();

  if (processedObjects.has(obj as object)) {
    console.warn(SIGNAL_TREE_MESSAGES.CIRCULAR_REF);
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }
  processedObjects.add(obj as object);

  try {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      try {
        if (typeof key === 'symbol') continue;

        if (isEntityMapMarker(value)) {
          // Preserve entity map markers so withEntities can materialize EntitySignals later
          (store as Record<string, unknown>)[key] = value as EntityMapMarker<
            unknown,
            string | number
          >;
          continue;
        }

        if (isSignal(value)) {
          // Preserve existing signals as-is
          (store as Record<string, unknown>)[key] = value;
          continue;
        }

        if (value === null || value === undefined) {
          (store as Record<string, unknown>)[key] = signal(value, {
            equal: equalityFn,
          });
        } else if (typeof value !== 'object') {
          (store as Record<string, unknown>)[key] = signal(value, {
            equal: equalityFn,
          });
        } else if (Array.isArray(value) || isBuiltInObject(value)) {
          (store as Record<string, unknown>)[key] = signal(value, {
            equal: equalityFn,
          });
        } else {
          // Nested object - create recursive structure
          const branch = createSignalStore(value, equalityFn);

          // Create a NodeAccessor for this nested object (no backing signal)
          const callableBranch = makeNodeAccessor<typeof value>();

          // Copy all the nested signal properties onto the callable branch
          for (const branchKey in branch) {
            if (Object.prototype.hasOwnProperty.call(branch, branchKey)) {
              try {
                Object.defineProperty(callableBranch, branchKey, {
                  value: (branch as Record<string, unknown>)[branchKey],
                  enumerable: true,
                  configurable: true,
                });
              } catch {
                // Skip if property can't be defined
              }
            }
          }

          (store as Record<string, unknown>)[key] = callableBranch;
        }
      } catch (error) {
        console.warn(
          `${SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED} "${key}":`,
          error
        );
        (store as Record<string, unknown>)[key] = signal(value, {
          equal: equalityFn,
        });
      }
    }

    const symbols = Object.getOwnPropertySymbols(obj);
    for (const sym of symbols) {
      const value = (obj as Record<symbol, unknown>)[sym];
      try {
        if (isEntityMapMarker(value)) {
          (store as Record<symbol, unknown>)[sym] = value;
          continue;
        }
        if (isSignal(value)) {
          (store as Record<symbol, unknown>)[sym] = value;
        } else {
          (store as Record<symbol, unknown>)[sym] = signal(value, {
            equal: equalityFn,
          });
        }
      } catch (error) {
        console.warn(SIGNAL_TREE_MESSAGES.SIGNAL_CREATION_FAILED, error);
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to create signal store: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }

  return store as TreeNode<T>;
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

// ============================================
// TREE ENHANCEMENT
// ============================================

function enhanceTree<T>(tree: SignalTreeBase<T>, config: TreeConfig = {}): SignalTreeWithEngine<T> {
  // v6 semantics: single-enhancer runtime `.with(enhancer)`
  Object.defineProperty(tree, 'with', {
    value: function <A>(enhancer: EnhancerWithMeta<unknown, A> | Enhancer<unknown, A>) {
      if (typeof enhancer !== 'function') {
        throw new Error('Enhancer must be a function');
      }
      return (enhancer as unknown as Enhancer)(tree as SignalTreeBase<T>) as SignalTreeBase<T> & A;
    },
    enumerable: false,
    configurable: true,
    writable: false,
  });

  return tree as unknown as SignalTreeWithEngine<T>;
}

  // Mark as NodeAccessor
  Object.defineProperty(tree, NODE_ACCESSOR_SYMBOL, {
    value: true,
    enumerable: false,
  });

  // Add state and $ properties first (these are safe)
  Object.defineProperty(tree, 'state', {
    value: signalState,
    enumerable: false,
  });
  Object.defineProperty(tree, '$', { value: signalState, enumerable: false });

  // Add dispose() method for manual cleanup when using lazy signals (stub)
  if (memoryManager) {
    Object.defineProperty(tree, 'dispose', {
      value: () => {
        memoryManager?.dispose();
        const cleanup = (
          signalState as TreeNode<T> & { __cleanup__?: () => void }
        ).__cleanup__;
        if (typeof cleanup === 'function') {
          cleanup();
        }
      },
      enumerable: false,
      writable: false,
    });
  }

  // Enhance tree with methods
  enhanceTree(tree, config);

  // Attach signal state properties to the tree AFTER enhancement
  // This prevents conflicts with built-in methods
  for (const key in signalState) {
    if (Object.prototype.hasOwnProperty.call(signalState, key)) {
      // Skip if the property already exists (from enhancement)
      if (!(key in tree)) {
        try {
          Object.defineProperty(tree, key, {
            value: (signalState as Record<string, unknown>)[key],
            enumerable: true,
            configurable: true,
          });
        } catch {
          // Skip if property can't be defined
        }
      }
    }
  }

  return tree;
}

// ============================================
// PRESET CONFIGURATIONS
// ============================================

const presetConfigs: Record<TreePreset, Partial<TreeConfig>> = {
  basic: {
    useLazySignals: false,
    debugMode: false,
  },
  performance: {
    useLazySignals: true,
    batchUpdates: true,
    useMemoization: true,
    useShallowComparison: true,
  },
  development: {
    useLazySignals: false,
    debugMode: true,
    enableDevTools: true,
    trackPerformance: true,
  },
  production: {
    useLazySignals: true,
    batchUpdates: true,
    useMemoization: true,
    debugMode: false,
  },
};

// ============================================
// PUBLIC API
// ============================================

export function signalTree(
  obj: unknown,
  configOrPreset?: TreeConfig | TreePreset
): any {
  if (typeof configOrPreset === 'string') {
    const config = presetConfigs[configOrPreset];
    if (!config) {
      console.warn(
        SIGNAL_TREE_MESSAGES.PRESET_UNKNOWN.replace(
          '%s',
          String(configOrPreset)
        )
      );
      return create(obj as any, {} as any) as any;
    }
    return create(obj as any, config as any) as any;
  }

  const config = (configOrPreset || {}) as TreeConfig;
  return create(obj as any, config) as any;
}

/**
 * Typed helper to apply a single enhancer to a tree when `.with` inference
 * produces `unknown`. This is a pragmatic escape hatch for tests and
 * migration until `.with` overloads are simplified.
 */
export function applyEnhancer<T, O>(
  tree: SignalTreeBase<T>,
  enhancer: EnhancerWithMeta<SignalTreeBase<T>, O>
): SignalTreeBase<T> & O {
  // Call site still needs a runtime cast since enhancers may be legacy-typed;
  // we keep the external signature strict while using a local cast.
  return (
    enhancer as unknown as (t: SignalTreeBase<T>) => SignalTreeBase<T> & O
  )(tree) as SignalTreeBase<T> & O;
}
