/**
 * SignalTree Constants
 * Centralized configuration values and messages
 */

export const SIGNAL_TREE_CONSTANTS = {
  /** Cache configuration */
  MAX_PATH_CACHE_SIZE: 1000,

  /** Performance thresholds */
  LAZY_THRESHOLD: 50,
  ESTIMATE_MAX_DEPTH: 3,
  ESTIMATE_SAMPLE_SIZE_ARRAY: 3,
  ESTIMATE_SAMPLE_SIZE_OBJECT: 5,

  /** Default values */
  DEFAULT_CACHE_SIZE: 100,
  DEFAULT_BATCH_SIZE: 10,
} as const;

export const SIGNAL_TREE_MESSAGES = {
  /** Error messages */
  NULL_OR_UNDEFINED: 'Cannot create SignalTree from null or undefined',
  CIRCULAR_REF:
    '[SignalTree] Circular reference detected, creating reference signal',
  UPDATER_INVALID: 'Updater must return an object',

  /** Warning messages */
  LAZY_FALLBACK: '[SignalTree] Lazy creation failed, falling back to eager:',
  SIGNAL_CREATION_FAILED: '[SignalTree] Failed to create signal for key',
  UPDATE_PATH_NOT_FOUND: '[SignalTree] Cannot update non-existent path:',
  UPDATE_FAILED: '[SignalTree] Update failed, attempting rollback:',
  ROLLBACK_FAILED: '[SignalTree] Rollback failed for path:',
  CLEANUP_ERROR: '[SignalTree] Error during cleanup:',
  PRESET_UNKNOWN: 'Unknown preset: %s, using default configuration',

  /** Debug messages */
  STRATEGY_SELECTION:
    '[SignalTree] Creating tree with %s strategy (estimated size: %d)',
  TREE_DESTROYED: '[SignalTree] Tree destroyed',
  UPDATE_TRANSACTION: '[SignalTree] Update transaction:',

  /** Feature warnings */
  BATCH_NOT_ENABLED:
    '⚠️ batchUpdate() called but batching is not enabled.\nTo enable batch updates, install @signaltree/batching',
  MEMOIZE_NOT_ENABLED:
    '⚠️ memoize() called but memoization is not enabled.\nTo enable memoized computations, install @signaltree/memoization',
  MIDDLEWARE_NOT_AVAILABLE:
    '⚠️ addTap() called but middleware support is not available.',
  ENTITY_HELPERS_NOT_AVAILABLE:
    '⚠️ asCrud() called but entity helpers are not available.',
  ASYNC_ACTIONS_NOT_AVAILABLE:
    '⚠️ asyncAction() called but async actions are not available.',
  TIME_TRAVEL_NOT_AVAILABLE:
    '⚠️ undo() called but time travel is not available.',
  OPTIMIZE_NOT_AVAILABLE:
    '⚠️ optimize() called but tree optimization is not available.',
  CACHE_NOT_AVAILABLE: '⚠️ clearCache() called but caching is not available.',
  PERFORMANCE_NOT_ENABLED:
    '⚠️ invalidatePattern() called but performance optimization is not enabled.',

  /** Enhancer messages */
  ENHANCER_ORDER_FAILED:
    '[SignalTree] Failed to resolve enhancer order, using provided order',
  ENHANCER_CYCLE_DETECTED:
    '[SignalTree] Could not fully order enhancers (cycle detected), falling back to provided order',
  ENHANCER_REQUIREMENT_MISSING:
    "[SignalTree] Enhancer '%s' requires '%s' but it is not available",
  ENHANCER_PROVIDES_MISSING:
    "[SignalTree] Enhancer '%s' promised '%s' but it was not found on the resulting tree",
  ENHANCER_FAILED: "[SignalTree] Enhancer '%s' failed:",
  ENHANCER_NOT_FUNCTION: 'Enhancer at index %d is not a function',

  /** Context messages */
  EFFECT_NO_CONTEXT: 'Effect requires Angular injection context',
  SUBSCRIBE_NO_CONTEXT: 'Subscribe requires Angular injection context',
} as const;
