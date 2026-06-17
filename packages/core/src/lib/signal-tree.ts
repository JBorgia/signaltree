import { isSignal, signal, untracked, WritableSignal } from '@angular/core';

import { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './constants';
import { batchScope } from './internals/batch-scope';
import { SignalTreeBuilder } from './internals/builder-types';
import { ProcessDerived } from './internals/derived-types';
import {
  _recordTreeConstruction,
  isRegisteredMarker,
  materializeMarkers,
} from './internals/materialize-markers';
import { applyDerivedFactories } from './internals/merge-derived';
import { getPathNotifier } from './path-notifier';
import { equal, isBuiltInObject, unwrap } from './utils';

import type {
  TreeNode,
  TreeConfig,
  NodeAccessor,
  EntityMapMarker,
  ISignalTree,
  EnhancerMeta,
} from './types';

import { ENHANCER_META } from './types';
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
  // Security is injected (v11+): the validator + its recursive walk live in
  // `@signaltree/core/security` and are carried on `config.security` by the
  // `security()` helper. Core no longer statically imports SecurityValidator,
  // so it tree-shakes out of every bundle that doesn't opt in. Validation still
  // runs synchronously here during construction.
  const security = config.security;
  if (!security) return;

  // Fail-closed: a present-but-malformed `security` (e.g. a pre-v11 raw config
  // object passed by an untyped/JS consumer who didn't migrate to `security()`)
  // must NOT silently skip validation — that is fail-open for a security
  // control. TS consumers get a compile error from the `SecurityFeature` type;
  // this guard catches the JS/`any`/dynamic case and fails loudly instead.
  const sec = security as { __signalTreeSecurity?: unknown; validate?: unknown };
  if (sec.__signalTreeSecurity !== true || typeof sec.validate !== 'function') {
    throw new Error(SIGNAL_TREE_MESSAGES.SECURITY_INVALID);
  }

  security.validate(obj);
}

// =============================================================================
// NODE ACCESSOR CREATION
// =============================================================================

/**
 * Creates a NodeAccessor function that wraps a TreeNode.
 *
 * NodeAccessors are functions that:
 * - Can be called with no args to get the unwrapped state
 * - Can be called with a value to set state
 * - Can be called with an updater function to transform state
 * - Have enumerable properties for child nodes (signals or nested accessors)
 *
 * ## Auto-Batching for Partial Updates
 *
 * When called with an object argument (partial update), all child signal
 * writes are wrapped in a batchScope, resulting in a single change detection
 * cycle instead of multiple cycles.
 *
 * ```typescript
 * // Single CD cycle (auto-batched)
 * $.tickets({ startDate, endDate, count });
 *
 * // Individual CD cycles (not batched)
 * $.tickets.startDate.set(startDate);
 * $.tickets.endDate.set(endDate);
 * $.tickets.count.set(count);
 * ```
 *
 * ## Writable Properties for Deep Merge
 *
 * Properties are defined with `writable: true` to support the deep merge pattern.
 * When derived state is merged into a namespace and then processed by
 * materializeMarkers(), it needs to replace markers with their signal forms.
 */
function makeNodeAccessor<T>(store: TreeNode<T>): NodeAccessor<T> {
  const accessor = function (arg?: unknown): T | void {
    // GET - no argument
    if (arguments.length === 0) {
      return unwrap(store) as unknown as T;
    }

    // UPDATE with function - auto-batch
    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      const current = unwrap(store) as T;
      batchScope(() => recursiveUpdate(store, updater(current)));
      return;
    }

    // PARTIAL UPDATE with object - auto-batch
    if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
      batchScope(() => recursiveUpdate(store, arg as Partial<T>));
      return;
    }

    // FULL SET with primitive/array - single value, no batch needed
    recursiveUpdate(store, arg);
  } as NodeAccessor<T>;

  (accessor as unknown as Record<symbol, boolean>)[NODE_ACCESSOR_SYMBOL] = true;

  // Copy store properties onto accessor
  // CRITICAL: Properties must be writable to allow materializeMarkers()
  // to replace markers with their signal forms. Without writable: true,
  // this assignment silently fails in non-strict mode, causing runtime errors
  // like "$.users.upsertOne is not a function".
  for (const key of Object.keys(store as object)) {
    Object.defineProperty(accessor, key, {
      value: (store as Record<string, unknown>)[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return accessor;
}

/** Dev-mode: paths already warned about for ref-identical no-op writes. */
const warnedNoopPaths = new Set<string>();

function recursiveUpdate(
  target: unknown,
  updates: unknown,
  out?: string[],
  pathPrefix = ''
): void {
  if (!updates || typeof updates !== 'object') return;

  const targetObj = isNodeAccessor(target)
    ? (target as unknown as Record<string, unknown>)
    : (target as Record<string, unknown>);

  for (const [key, value] of Object.entries(
    updates as Record<string, unknown>
  )) {
    const prop = targetObj[key];
    if (prop === undefined) continue;

    const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (isSignal(prop) && 'set' in prop) {
      const sig = prop as WritableSignal<unknown>;
      // Ref-equality short-circuit: skip the .set() entirely when the
      // incoming value is identical to the current value. Saves the
      // function-call + Angular's internal equality check + any glitch
      // tracking. Wrapped in untracked() so reading the current value
      // never accidentally creates a reactive dependency.
      const current = untracked(() => sig());
      if (current === value) {
        // Dev-mode footgun guard: a merge write whose value is reference-
        // identical to the current value is a no-op. For objects/arrays this
        // almost always means the caller mutated the value in place and re-set
        // the SAME reference, expecting an update — which silently does
        // nothing. Warn once per path. (Primitives re-set to the same value
        // are normal idempotent writes and are not flagged.)
        if (
          (typeof ngDevMode === 'undefined' || ngDevMode) &&
          value !== null &&
          typeof value === 'object' &&
          !warnedNoopPaths.has(childPath)
        ) {
          warnedNoopPaths.add(childPath);
          console.warn(
            `SignalTree: write at "${childPath}" was skipped — the value is ` +
              `reference-identical to the current value. If you mutated an ` +
              `object/array in place, create a NEW reference (spread/slice/map) ` +
              `so the change is observed. [ST2003]`
          );
        }
        continue;
      }
      sig.set(value);
      if (out) out.push(childPath);
    } else if (isNodeAccessor(prop)) {
      if (value && typeof value === 'object') {
        recursiveUpdate(prop, value, out, childPath);
      } else {
        (prop as (v: unknown) => void)(value);
        if (out) out.push(childPath);
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
    // Entity map markers - preserve for entities() enhancer
    if (isEntityMapMarker(value)) {
      store[key] = value;
      continue;
    }

    // All markers (built-in status/stored/form/asyncSource + user-registered)
    // are caught here via the dynamic processor registry. Built-in markers
    // self-register when their factory runs — and the factory always runs
    // inside the state literal (`signalTree({ x: status() })` evaluates
    // `status()` before `signalTree()`), so the processor is registered before
    // this check. Detecting them through the registry (instead of importing
    // `isStatusMarker`/`isStoredMarker` directly) keeps `markers/status` and
    // `markers/stored` out of the bundle when those markers are never used.
    if (isRegisteredMarker(value)) {
      store[key] = value;
      continue;
    }

    // Dev-mode warning: object has Symbol keys but no registered processor
    // This catches the common mistake of forgetting to register before tree creation
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.getOwnPropertySymbols(value).length > 0
      ) {
        console.warn(
          `SignalTree: Object at "${key}" has Symbol keys but doesn't match any ` +
            `registered marker processor. If this is a custom marker, ensure ` +
            `registerMarkerProcessor() is called BEFORE creating the tree.`
        );
      }
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
): ISignalTree<T> {
  if (initialState === null || initialState === undefined) {
    throw new Error(SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED);
  }

  // Security validation
  validateTree(initialState, config);

  const equalityFn = createEqualityFn(config.useShallowComparison ?? false);
  // Lazy mode is opt-in (v11): it only runs when the `lazy` feature is injected
  // via `@signaltree/core/lazy`. Without it the size estimate is skipped and the
  // tree is always eager, so the lazy proxy + memory manager tree-shake out.
  const lazyFeature = config.lazy;
  const useLazy = lazyFeature
    ? shouldUseLazy(initialState, config, estimateObjectSize(initialState))
    : false;

  // Dev-mode: `useLazySignals: true` is a silent no-op without the lazy feature.
  // Warn rather than let a perf-sensitive opt-in vanish unnoticed on upgrade.
  if (
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    config.useLazySignals === true &&
    !lazyFeature
  ) {
    console.warn(SIGNAL_TREE_MESSAGES.LAZY_NOT_INJECTED);
  }

  // Create signal store
  let signalState: TreeNode<T>;
  let disposeLazy: (() => void) | undefined;

  // Configure global PathNotifier batching based on tree config (opt-out via config.batchUpdates=false)
  // Default: batching enabled unless explicitly disabled
  try {
    getPathNotifier().setBatchingEnabled(
      Boolean(config.batchUpdates !== false)
    );
  } catch {
    // ignore failures (shouldn't happen)
  }

  if (lazyFeature && useLazy && typeof initialState === 'object') {
    try {
      const built = lazyFeature.build(initialState, equalityFn);
      signalState = built.tree as TreeNode<T>;
      disposeLazy = built.dispose;
    } catch (error) {
      console.warn(SIGNAL_TREE_MESSAGES.LAZY_FALLBACK, error);
      signalState = createSignalStore(initialState, equalityFn);
      disposeLazy = undefined;
    }
  } else {
    signalState = createSignalStore(initialState, equalityFn);
  }

  // Create root callable function
  const tree = function (arg?: unknown): T | void {
    if (arguments.length === 0) {
      return unwrap(signalState) as unknown as T;
    }

    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      const current = unwrap(signalState) as T;
      recursiveUpdate(signalState, updater(current));
    } else {
      recursiveUpdate(signalState, arg);
    }
  } as ISignalTree<T>;

  // Mark as NodeAccessor
  (tree as unknown as Record<symbol, boolean>)[NODE_ACCESSOR_SYMBOL] = true;

  // Lifecycle: cleanup registry and destroyed flag
  const cleanupFns: Array<() => void> = [];
  const destroyedSig = signal(false);
  const appliedEnhancers = new Set<string>();

  // Add core properties
  Object.defineProperty(tree, '$', {
    value: signalState,
    enumerable: false,
    writable: false,
  });

  /**
   * Apply a single enhancer to this SignalTree instance and return the enhanced tree.
   *
   * Enhancers extend the tree with additional capabilities (batching, time travel, dev tools, entities, serialization, etc).
   *
   * Usage:
   * ```ts
   * const enhanced = tree.with(batching());
   * // Chain multiple enhancers:
   * const fullyEnhanced = tree
   *   .with(batching())
   *   .with(timeTravel({ maxHistorySize: 100 }))
   *   .with(devTools({ treeName: 'MyTree' }));
   * ```
   *
   * Supported enhancers and their options:
   *
   * - `batching(config?: BatchingConfig)`
   *   - Batches change detection notifications for performance.
   *   - Signal writes are always synchronous.
   *   - Options: `enabled`, `notificationDelayMs`.
   *
   * - `timeTravel(config?: TimeTravelConfig)`
   *   - Enables undo/redo and state history.
   *   - Options: `maxHistorySize`, `includePayload`, `actionNames`, `enabled`.
   *
   * - `devTools(config?: DevToolsConfig)`
   *   - Integrates with browser devtools and logs state changes.
   *   - Options: `treeName`, `enableBrowserDevTools`, `enableLogging`, `performanceThreshold`, `enabled`.
   *
   * - `entities(config?: EntitiesEnhancerConfig)`
   *   - Enables entity map support for normalized collections.
   *   - Options: `enabled`.
   *
   * - `serialization(config?: SerializationConfig)`
   *   - Adds state serialization and persistence helpers.
   *   - Options: `includeMetadata`, `replacer`, `reviver`, `preserveTypes`, `maxDepth`.
   *
   * @template R The return type of the enhancer (usually the enhanced tree).
   * @param enhancer A function that takes the current tree and returns an enhanced tree.
   * @returns The enhanced tree with additional methods or capabilities.
   * @see BatchingConfig, TimeTravelConfig, DevToolsConfig, EntitiesEnhancerConfig, SerializationConfig
   */
  Object.defineProperty(tree, 'with', {
    value: function <R>(enhancer: (tree: ISignalTree<T>) => R): R {
      if (typeof enhancer !== 'function') {
        throw new Error('Enhancer must be a function');
      }

      // Duplicate detection via enhancer metadata
      const meta = (enhancer as unknown as Record<symbol, EnhancerMeta>)[
        ENHANCER_META
      ] ??
        (enhancer as unknown as { metadata?: EnhancerMeta }).metadata;

      if (meta?.name) {
        if (appliedEnhancers.has(meta.name)) {
          throw new Error(
            `Enhancer "${meta.name}" has already been applied to this tree. ` +
            `Each enhancer can only be applied once.`
          );
        }
        // Dependency validation
        if (meta.requires) {
          for (const dep of meta.requires) {
            if (!appliedEnhancers.has(dep)) {
              throw new Error(
                `Enhancer "${meta.name}" requires "${dep}" to be applied first.`
              );
            }
          }
        }
        appliedEnhancers.add(meta.name);
      }

      return enhancer(tree) as R;
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // bind()
  Object.defineProperty(tree, 'bind', {
    value: function (thisArg?: unknown): NodeAccessor<T> {
      // Use native Function.prototype.bind to avoid calling this custom
      // `bind` property (which would cause infinite recursion).
      return Function.prototype.bind.call(
        tree,
        thisArg
      ) as unknown as NodeAccessor<T>;
    },
    enumerable: false,
    // Allow enhancers or consumers to bind/override if necessary
    writable: true,
    configurable: true,
  });

  // destroy()
  Object.defineProperty(tree, 'destroy', {
    value: function (): void {
      if (destroyedSig()) return; // Already destroyed
      destroyedSig.set(true);
      // Run registered cleanup functions (enhancers, subscriptions, etc.)
      for (const fn of cleanupFns) {
        try {
          fn();
        } catch {
          // Swallow errors during cleanup to ensure all cleanups run
        }
      }
      cleanupFns.length = 0;
      if (disposeLazy) {
        disposeLazy();
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

  // destroyed (readonly signal)
  Object.defineProperty(tree, 'destroyed', {
    value: destroyedSig.asReadonly(),
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // registerCleanup()
  Object.defineProperty(tree, 'registerCleanup', {
    value: function (fn: () => void): void {
      if (typeof fn === 'function') {
        cleanupFns.push(fn);
      }
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // clearCache(): compatibility stub for older DX and enhancers that expect
  // a global clearCache helper on the tree. Enhancers may replace this with
  // a real implementation (e.g. memoization). Default is a no-op.
  Object.defineProperty(tree, 'clearCache', {
    value: () => {
      /* no-op default */
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  // batchUpdate(): default pass-through for when batching is not enabled.
  // Applies the update immediately using the same internal recursiveUpdate
  // logic so consumers can call `tree.batchUpdate(...)` regardless of
  // whether the batching enhancer is active.
  Object.defineProperty(tree, 'batchUpdate', {
    value: function (arg?: unknown): void {
      if (arguments.length === 0) return;

      if (typeof arg === 'function') {
        const updater = arg as (current: T) => T;
        const current = unwrap(signalState) as T;
        recursiveUpdate(signalState, updater(current));
      } else {
        recursiveUpdate(signalState, arg);
      }
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  // updateAndReport(): apply a partial update and return the dot-paths of
  // signals that actually changed (after ref-equality short-circuit).
  // Useful for partial server-payload sync, change-log/audit trails, and
  // targeted persistence without pulling in the @signaltree/enterprise
  // diff engine.
  Object.defineProperty(tree, 'updateAndReport', {
    value: function (arg?: unknown): string[] {
      if (arguments.length === 0) return [];
      const out: string[] = [];
      if (typeof arg === 'function') {
        const updater = arg as (current: T) => T;
        const current = unwrap(signalState) as T;
        batchScope(() => recursiveUpdate(signalState, updater(current), out));
      } else if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
        batchScope(() => recursiveUpdate(signalState, arg, out));
      } else {
        recursiveUpdate(signalState, arg, out);
      }
      return out;
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  // Copy state properties to root for direct access (DEPRECATED - will be removed in v7)
  // Consumers should use tree.$ for state access
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
 * Returns ISignalTree<T> with only core functionality.
 * Use .with() to add enhancers for additional features.
 *
 * @example
 * ```typescript
 * import { computed } from '@angular/core';
 * import { signalTree } from '@signaltree/core';
 *
 * // Minimal tree
 * const tree = signalTree({ count: 0 });
 *
 * // With effects
 * const tree = signalTree({ count: 0 }).with(effects());
 *
 * // With multiple enhancers
 * const tree = signalTree({ count: 0 })
 *   .with(effects())
 *   .with(timeTravel())
 *   .with(batching());
 *
 * // With derived state (v7) - chained syntax
 * const tree = signalTree({ count: 0 })
 *   .derived(($) => ({
 *     doubled: computed(() => $.count() * 2)
 *   }));
 *
 * // With derived state (v7) - second argument syntax
 * const tree = signalTree(
 *   { count: 0 },
 *   ($) => ({
 *     doubled: computed(() => $.count() * 2)
 *   })
 * );
 * ```
 */
// Overload: with derived factory as second argument
export function signalTree<T extends object, TDerived extends object>(
  initialState: T,
  derivedFactory: ($: TreeNode<T>) => TDerived
): SignalTreeBuilder<T, TreeNode<T> & ProcessDerived<TDerived>>;

// Overload: with config object
export function signalTree<T extends object>(
  initialState: T,
  config?: TreeConfig
): SignalTreeBuilder<T, TreeNode<T>>;

// Implementation
export function signalTree<T extends object, TDerived extends object>(
  initialState: T,
  configOrDerived?: TreeConfig | (($: TreeNode<T>) => TDerived)
): SignalTreeBuilder<T, TreeNode<T>> {
  // Determine if second arg is a derived factory or config
  const isFactory = typeof configOrDerived === 'function';
  const config: TreeConfig = isFactory ? {} : configOrDerived ?? {};

  const baseTree = create(initialState, config);
  const builder = createBuilder<T, TreeNode<T>>(baseTree);

  // If derived factory provided, apply it immediately
  if (isFactory) {
    return builder.derived(
      configOrDerived as ($: TreeNode<T>) => TDerived
    ) as unknown as SignalTreeBuilder<T, TreeNode<T>>;
  }

  return builder;
}

// =============================================================================
// BUILDER FACTORY
// =============================================================================

/**
 * Creates a SignalTreeBuilder that wraps an ISignalTree and adds:
 * - .derived() method for adding derived state layers
 * - Lazy finalization (derived factories run on first $ access)
 */
function createBuilder<TSource extends object, TAccum = TreeNode<TSource>>(
  baseTree: ISignalTree<TSource>
): SignalTreeBuilder<TSource, TAccum> {
  const derivedQueue: Array<($: unknown) => object> = [];
  let isFinalized = false;

  const finalize = () => {
    if (isFinalized) return;
    isFinalized = true;

    // Step 1: Materialize ALL markers (entityMap, status, stored, etc.)
    // This must happen BEFORE derived processing so that derived factories
    // can reference entity methods, status signals, and stored signals.
    materializeMarkers(baseTree.$);
    // Record that a tree has been constructed so registerMarkerProcessor()
    // can warn if user-defined markers are registered AFTER the fact.
    _recordTreeConstruction();

    // Step 2: Apply all queued derived factories
    if (derivedQueue.length > 0) {
      applyDerivedFactories(baseTree.$, derivedQueue);
    }
  };

  // Create callable builder function that delegates to baseTree
  const builder = function (arg?: unknown): TSource | void {
    // Delegate to baseTree's call signature
    if (arguments.length === 0) {
      return (baseTree as unknown as () => TSource)();
    }
    return (baseTree as unknown as (arg: unknown) => void)(arg);
  } as SignalTreeBuilder<TSource, TAccum>;

  // Mark as NodeAccessor
  (builder as unknown as Record<symbol, boolean>)[NODE_ACCESSOR_SYMBOL] = true;

  // Copy all properties from baseTree to builder
  Object.defineProperty(builder, '$', {
    get() {
      finalize();
      return baseTree.$;
    },
    enumerable: false,
    configurable: true,
  });

  // Override 'with' method to maintain builder chain
  Object.defineProperty(builder, 'with', {
    value: function <TAdded>(
      enhancer: (tree: ISignalTree<TSource>) => ISignalTree<TSource> & TAdded
    ): SignalTreeBuilder<TSource, TAccum> & TAdded {
      // Finalize markers BEFORE passing to enhancer so form(), entityMap(), etc. are materialized
      finalize();
      // Apply enhancer to base tree
      const enhanced = baseTree.with(enhancer);
      // Create a new builder wrapping the enhanced tree
      const newBuilder = createBuilder<TSource, TAccum>(
        enhanced as unknown as ISignalTree<TSource>
      );
      // Copy any additional properties from the enhancer result
      for (const key of Object.keys(enhanced)) {
        if (
          key !== '$' &&
          key !== 'state' &&
          key !== 'with' &&
          key !== 'bind' &&
          key !== 'destroy' &&
          key !== 'destroyed' &&
          key !== 'registerCleanup' &&
          key !== 'derived'
        ) {
          try {
            (newBuilder as unknown as Record<string, unknown>)[key] = (
              enhanced as unknown as Record<string, unknown>
            )[key];
          } catch {
            /* ignore read-only */
          }
        }
      }
      return newBuilder as SignalTreeBuilder<TSource, TAccum> & TAdded;
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // Copy 'bind' method from baseTree (if it exists)
  if (typeof baseTree.bind === 'function') {
    Object.defineProperty(builder, 'bind', {
      value: baseTree.bind.bind(baseTree),
      enumerable: false,
      writable: false,
      configurable: true,
    });
  } else {
    Object.defineProperty(builder, 'bind', {
      value: () => builder,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }

  // Copy 'destroy' method from baseTree (if it exists)
  // Note: writable: true allows enhancers like guardrails() to override destroy
  if (typeof baseTree.destroy === 'function') {
    Object.defineProperty(builder, 'destroy', {
      value: baseTree.destroy.bind(baseTree),
      enumerable: false,
      writable: true,
      configurable: true,
    });
  } else {
    Object.defineProperty(builder, 'destroy', {
      value: () => {
        /* noop */
      },
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }

  // Copy 'destroyed' signal from baseTree
  if (baseTree.destroyed) {
    Object.defineProperty(builder, 'destroyed', {
      value: baseTree.destroyed,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }

  // Copy 'registerCleanup' from baseTree
  if (typeof baseTree.registerCleanup === 'function') {
    Object.defineProperty(builder, 'registerCleanup', {
      value: baseTree.registerCleanup.bind(baseTree),
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }

  // Forward 'updateAndReport' from baseTree (apply partial update +
  // return changed paths). Defined as non-enumerable on baseTree, so it
  // isn't picked up by the generic key copy above.
  Object.defineProperty(builder, 'updateAndReport', {
    value: function (this: unknown, arg?: unknown): string[] {
      finalize();
      const fn = (baseTree as unknown as Record<string, unknown>)[
        'updateAndReport'
      ] as ((a?: unknown) => string[]) | undefined;
      return fn ? fn.call(baseTree, arg) : [];
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // Forward 'batchUpdate' from baseTree (mirrors the existing internal
  // helper; needed because non-enumerable properties don't reach the
  // builder via the generic copy loop).
  Object.defineProperty(builder, 'batchUpdate', {
    value: function (this: unknown, arg?: unknown): void {
      finalize();
      const fn = (baseTree as unknown as Record<string, unknown>)[
        'batchUpdate'
      ] as ((a?: unknown) => void) | undefined;
      if (fn) fn.call(baseTree, arg);
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  // Add derived() method
  Object.defineProperty(builder, 'derived', {
    value: function <TDerived extends object>(
      factory: ($: TAccum) => TDerived
    ): SignalTreeBuilder<TSource, TAccum & ProcessDerived<TDerived>> {
      if (isFinalized) {
        throw new Error(
          'SignalTree: Cannot add derived() after tree.$ has been accessed. ' +
            'Chain all .derived() calls before accessing $.'
        );
      }
      derivedQueue.push(factory as ($: unknown) => object);
      // Return same builder - types are updated at compile time
      return builder as unknown as SignalTreeBuilder<
        TSource,
        TAccum & ProcessDerived<TDerived>
      >;
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  return builder;
}
