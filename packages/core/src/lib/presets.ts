import { withBatching } from '../enhancers/batching';
import { withDevTools } from '../enhancers/devtools';
import { withEffects } from '../enhancers/effects';
import { withEntities } from '../enhancers/entities';
import { withMemoization } from '../enhancers/memoization';
import { withTimeTravel } from '../enhancers/time-travel';
import { signalTree } from './signal-tree';

/**
 * v6 Preset Factories
 *
 * Pre-configured tree factories that chain multiple enhancers.
 * Types flow naturally through the chain - no casts needed.
 */
import type {
  SignalTreeBase,
  TreeConfig,
  BatchingConfig,
  MemoizationConfig,
  TimeTravelConfig,
  DevToolsConfig,
  BatchingMethods,
  MemoizationMethods,
  TimeTravelMethods,
  DevToolsMethods,
  EffectsMethods,
  EntitiesEnabled,
} from './types';

// ============================================================================
// Config Types
// ============================================================================

export interface DevTreeConfig extends TreeConfig {
  effects?: Record<string, never>; // No config for effects currently
  batching?: BatchingConfig;
  memoization?: MemoizationConfig;
  timeTravel?: TimeTravelConfig;
  devTools?: DevToolsConfig;
  entities?: Record<string, never>; // No config for entities currently
}

export interface ProdTreeConfig extends TreeConfig {
  effects?: Record<string, never>;
  batching?: BatchingConfig;
  memoization?: MemoizationConfig;
  entities?: Record<string, never>;
}

export interface MinimalTreeConfig extends TreeConfig {
  effects?: Record<string, never>;
}

// ============================================================================
// Result Types (Composed from Enhancer Methods)
// ============================================================================

/**
 * Full development tree with all enhancers
 */
export type FullSignalTree<T> = SignalTreeBase<T> &
  EffectsMethods<T> &
  BatchingMethods &
  MemoizationMethods<T> &
  EntitiesEnabled &
  TimeTravelMethods &
  DevToolsMethods;

/**
 * Production tree without dev tools and time travel
 */
export type ProdSignalTree<T> = SignalTreeBase<T> &
  EffectsMethods<T> &
  BatchingMethods &
  MemoizationMethods<T> &
  EntitiesEnabled;

/**
 * Minimal tree with just effects
 */
export type MinimalSignalTree<T> = SignalTreeBase<T> & EffectsMethods<T>;

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a fully-featured development tree with all enhancers.
 *
 * Includes: effects, batching, memoization, entities, time-travel, devtools
 *
 * @param initialState - Initial state object
 * @param config - Configuration for each enhancer
 * @returns Enhanced SignalTree with all development features
 *
 * @example
 * ```typescript
 * const tree = createDevTree({
 *   users: [],
 *   filter: '',
 *   ui: { loading: false }
 * }, {
 *   devTools: { name: 'MyApp' },
 *   timeTravel: { maxHistorySize: 100 }
 * });
 *
 * // All methods available
 * tree.batch(() => { ... });
 * tree.memoize(state => ...);
 * tree.undo();
 * tree.connectDevTools();
 * ```
 */
export function createDevTree<T extends object>(
  initialState: T,
  config: DevTreeConfig = {}
): FullSignalTree<T>;
export function createDevTree(): {
  enhancer: <Tree extends SignalTreeBase<any>>(
    tree: Tree
  ) => Tree &
    EffectsMethods<any> &
    BatchingMethods &
    MemoizationMethods<any> &
    EntitiesEnabled &
    TimeTravelMethods &
    DevToolsMethods;
};
export function createDevTree<T extends object>(
  initialState?: T,
  config: DevTreeConfig = {}
): any {
  // If no initial state provided, return the enhancer chain so callers
  // can apply it to an existing tree (demo usage pattern).
  if (arguments.length === 0) {
    const enhancer = <Tree extends SignalTreeBase<any>>(tree: Tree) =>
      tree
        .with(withEffects())
        .with(withBatching())
        .with(withMemoization())
        .with(withEntities())
        .with(withTimeTravel())
        .with(withDevTools());

    return { enhancer };
  }

  const base = signalTree(initialState as T, config);

  // Chain enhancers - types accumulate automatically with v6 pattern
  const enhanced = base
    .with(withEffects())
    .with(withBatching(config.batching))
    .with(withMemoization(config.memoization))
    .with(withEntities())
    .with(withTimeTravel(config.timeTravel))
    .with(withDevTools(config.devTools));

  return enhanced as unknown as FullSignalTree<T>;
}

/**
 * Create a production-optimized tree without dev tools.
 *
 * Includes: effects, batching, memoization, entities
 * Excludes: time-travel, devtools (for performance)
 *
 * @param initialState - Initial state object
 * @param config - Configuration for each enhancer
 * @returns Enhanced SignalTree optimized for production
 *
 * @example
 * ```typescript
 * const tree = createProdTree({
 *   users: [],
 *   cache: {}
 * }, {
 *   memoization: { maxCacheSize: 500 },
 *   batching: { debounceMs: 16 }
 * });
 * ```
 */
export function createProdTree<T extends object>(
  initialState: T,
  config: ProdTreeConfig = {}
): ProdSignalTree<T> {
  const base = signalTree(initialState, config);

  const enhanced = base
    .with(withEffects())
    .with(withBatching(config.batching))
    .with(withMemoization(config.memoization))
    .with(withEntities());

  return enhanced as unknown as ProdSignalTree<T>;
}

/**
 * Create a minimal tree with just effects.
 *
 * Includes: effects only
 * Use for: Simple state management without extra overhead
 *
 * @param initialState - Initial state object
 * @param config - Configuration options
 * @returns Minimal SignalTree with effects
 *
 * @example
 * ```typescript
 * const tree = createMinimalTree({ count: 0 });
 *
 * tree.effect(state => {
 *   console.log('Count changed:', state.count);
 * });
 * ```
 */
export function createMinimalTree<T extends object>(
  initialState: T,
  config: MinimalTreeConfig = {}
): MinimalSignalTree<T> {
  const base = signalTree(initialState, config);

  const enhanced = base.with(withEffects());

  return enhanced as unknown as MinimalSignalTree<T>;
}

// ============================================================================
// Convenience Aliases
// ============================================================================

/**
 * Alias for createDevTree
 */
export const devTree = createDevTree;

/**
 * Alias for createProdTree
 */
export const prodTree = createProdTree;

/**
 * Alias for createMinimalTree
 */
export const minimalTree = createMinimalTree;

// ============================================================================
// Custom Preset Builder
// ============================================================================

/**
 * Build a custom preset by chaining specific enhancers.
 *
 * @example
 * ```typescript
 * // Create a tree with just batching and memoization
 * const tree = buildTree({ items: [] })
 *   .add(withBatching())
 *   .add(withMemoization())
 *   .done();
 * ```
 */
export function buildTree<T extends object>(
  initialState: T,
  config: TreeConfig = {}
) {
  let tree: SignalTreeBase<T> = signalTree(initialState, config);

  return {
    /**
     * Add an enhancer to the tree
     */
    add<R>(enhancer: (t: typeof tree) => R) {
      tree = enhancer(tree) as unknown as SignalTreeBase<T>;
      return this;
    },

    /**
     * Finalize and return the enhanced tree
     */
    done() {
      return tree;
    },
  };
}
