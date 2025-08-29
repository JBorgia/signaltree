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

// Full developer-facing messages
const DEV_MESSAGES = {
  NULL_OR_UNDEFINED: 'null/undefined',
  CIRCULAR_REF: 'circular ref',
  UPDATER_INVALID: 'updater invalid',
  LAZY_FALLBACK: 'lazy fallback',
  SIGNAL_CREATION_FAILED: 'signal creation failed',
  UPDATE_PATH_NOT_FOUND: 'update path not found',
  UPDATE_FAILED: 'update failed',
  ROLLBACK_FAILED: 'rollback failed',
  CLEANUP_ERROR: 'cleanup error',
  PRESET_UNKNOWN: 'unknown preset',
  STRATEGY_SELECTION: 'strategy select',
  TREE_DESTROYED: 'destroyed',
  UPDATE_TRANSACTION: 'update tx',
  BATCH_NOT_ENABLED: 'batching disabled',
  MEMOIZE_NOT_ENABLED: 'memoize disabled',
  MIDDLEWARE_NOT_AVAILABLE: 'middleware missing',
  ENTITY_HELPERS_NOT_AVAILABLE: 'entity helpers missing',
  ASYNC_ACTIONS_NOT_AVAILABLE: 'async actions missing',
  TIME_TRAVEL_NOT_AVAILABLE: 'time travel missing',
  OPTIMIZE_NOT_AVAILABLE: 'optimize missing',
  CACHE_NOT_AVAILABLE: 'cache missing',
  PERFORMANCE_NOT_ENABLED: 'performance disabled',
  ENHANCER_ORDER_FAILED: 'enhancer order failed',
  ENHANCER_CYCLE_DETECTED: 'enhancer cycle',
  ENHANCER_REQUIREMENT_MISSING: 'enhancer req missing',
  ENHANCER_PROVIDES_MISSING: 'enhancer provides missing',
  ENHANCER_FAILED: 'enhancer failed',
  ENHANCER_NOT_FUNCTION: 'enhancer not function',
  EFFECT_NO_CONTEXT: 'no angular context',
  SUBSCRIBE_NO_CONTEXT: 'no angular context',
} as const;

// Compact production messages (very short numeric codes) to keep bundles minimal.
// We map each key to a short numeric string like '0','1','2' to minimize bytes.
const PROD_MESSAGES = (() => {
  const out = {} as Record<keyof typeof DEV_MESSAGES, string>;
  let i = 0;
  for (const k of Object.keys(DEV_MESSAGES) as Array<
    keyof typeof DEV_MESSAGES
  >) {
    out[k] = String(i++);
  }
  return out;
})();

// Prefer Angular's compile-time `ngDevMode` flag. When `ngDevMode` is false
// in production builds, DEV_MESSAGES can be tree-shaken. Fallback to
// process.env when ngDevMode is not present.
declare const ngDevMode: boolean | undefined;
// Avoid referencing the bare `process` identifier to keep builds free of Node
// type assumptions; use globalThis to check env when available.
const _isProdByEnv = Boolean(
  (globalThis as any)?.process?.env?.NODE_ENV === 'production'
);

const _isDev =
  typeof ngDevMode !== 'undefined' ? Boolean(ngDevMode) : !_isProdByEnv;

export const SIGNAL_TREE_MESSAGES = _isDev
  ? (DEV_MESSAGES as typeof DEV_MESSAGES)
  : (PROD_MESSAGES as typeof DEV_MESSAGES);
