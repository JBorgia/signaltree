import { DEFAULT_PATH_CACHE_SIZE } from '@signaltree/shared';

/**
 * SignalTree Constants
 * Centralized configuration values and messages
 */

export const SIGNAL_TREE_CONSTANTS = {
  /** Cache configuration */
  MAX_PATH_CACHE_SIZE: DEFAULT_PATH_CACHE_SIZE,

  /** Performance thresholds */
  LAZY_THRESHOLD: 50,
  ESTIMATE_MAX_DEPTH: 3,
  ESTIMATE_SAMPLE_SIZE_ARRAY: 3,
  ESTIMATE_SAMPLE_SIZE_OBJECT: 5,

  /** Default values */
  DEFAULT_CACHE_SIZE: 100,
  DEFAULT_BATCH_SIZE: 10,
} as const;

// Full developer-facing messages.
//
// Each message carries a stable, greppable error code `[ST####]`. The code is
// the anchor: search it in your code, a stack trace, or docs/errors/README.md
// (which maps every code to a cause + fix). This keeps the human-readable text
// (an earlier attempt used bare opaque integers like '0'/'1' — abandoned
// because they're meaningless in stack traces) while giving AI agents and
// tooling a stable handle for self-remediation. Codes are append-only and
// never reused: ST1xxx = core/update/enhancer; ST2xxx = entity/markers.
const DEV_MESSAGES = {
  NULL_OR_UNDEFINED: 'null/undefined [ST1001]',
  CIRCULAR_REF: 'circular ref [ST1002]',
  UPDATER_INVALID: 'updater invalid [ST1003]',
  LAZY_FALLBACK: 'lazy fallback [ST1004]',
  SIGNAL_CREATION_FAILED: 'signal creation failed [ST1005]',
  UPDATE_PATH_NOT_FOUND: 'update path not found [ST1006]',
  UPDATE_FAILED: 'update failed [ST1007]',
  ROLLBACK_FAILED: 'rollback failed [ST1008]',
  CLEANUP_ERROR: 'cleanup error [ST1009]',
  PRESET_UNKNOWN: 'unknown preset [ST1010]',
  STRATEGY_SELECTION: 'strategy select [ST1011]',
  TREE_DESTROYED: 'destroyed [ST1012]',
  UPDATE_TRANSACTION: 'update tx [ST1013]',
  BATCH_NOT_ENABLED: 'batching disabled [ST1014]',
  MEMOIZE_NOT_ENABLED: 'memoize disabled [ST1015]',
  MIDDLEWARE_NOT_AVAILABLE: 'middleware missing [ST1016]',
  ENTITY_HELPERS_NOT_AVAILABLE: 'entity helpers missing [ST1017]',
  TIME_TRAVEL_NOT_AVAILABLE: 'time travel missing [ST1018]',
  OPTIMIZE_NOT_AVAILABLE: 'optimize missing [ST1019]',
  UPDATE_OPTIMIZED_NOT_AVAILABLE: 'update optimized missing [ST1020]',
  CACHE_NOT_AVAILABLE: 'cache missing [ST1021]',
  PERFORMANCE_NOT_ENABLED: 'performance disabled [ST1022]',
  ENHANCER_ORDER_FAILED: 'enhancer order failed [ST1023]',
  ENHANCER_CYCLE_DETECTED: 'enhancer cycle [ST1024]',
  ENHANCER_REQUIREMENT_MISSING: 'enhancer req missing [ST1025]',
  ENHANCER_PROVIDES_MISSING: 'enhancer provides missing [ST1026]',
  ENHANCER_FAILED: 'enhancer failed [ST1027]',
  ENHANCER_NOT_FUNCTION: 'enhancer not function [ST1028]',
  EFFECT_NO_CONTEXT: 'no angular context [ST1029]',
  SUBSCRIBE_NO_CONTEXT: 'no angular context [ST1030]',
  SECURITY_INVALID:
    'invalid security config — pass security(config) from @signaltree/core/security, not a raw config object [ST1031]',
  LAZY_NOT_INJECTED:
    'useLazySignals:true has no effect without the lazy feature — pass lazy: lazy() from @signaltree/core/lazy [ST1032]',
} as const;

// Production messages use the same short readable strings as dev.
// The numeric-code approach was abandoned: bare integers ('0','1','2') are
// completely opaque in production stack traces and tooling. The dev strings
// are already concise (<25 chars each) so bundle impact is negligible.
const PROD_MESSAGES = DEV_MESSAGES;

// Prefer Angular's compile-time `ngDevMode` flag. When `ngDevMode` is false
// in production builds, DEV_MESSAGES can be tree-shaken. Fallback to
// process.env when ngDevMode is not present.
declare const ngDevMode: boolean | undefined;
// Avoid referencing the bare `process` identifier to keep builds free of Node
// type assumptions; use globalThis to check env when available.
const _isProdByEnv = Boolean(
  typeof globalThis === 'object' &&
    globalThis !== null &&
    'process' in globalThis &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (globalThis as any).process === 'object' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'env' in (globalThis as any).process &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).process.env.NODE_ENV === 'production'
);

const _isDev =
  typeof ngDevMode !== 'undefined' ? Boolean(ngDevMode) : !_isProdByEnv;

/**
 * Whether the current environment is development mode.
 * Uses Angular's `ngDevMode` when available, otherwise falls back to NODE_ENV.
 * @internal Exported for use by enhancers and internal modules.
 */
export const isDev = _isDev;

export const SIGNAL_TREE_MESSAGES = Object.freeze(
  _isDev
    ? (DEV_MESSAGES as typeof DEV_MESSAGES)
    : (PROD_MESSAGES as typeof DEV_MESSAGES)
);
