import type { ISignalTree, EntitiesEnabled } from '../../lib/types';

// Match whatever config the type test expects
export interface EntitiesEnhancerConfig {
  enabled?: boolean;
}

/**
 * @deprecated The entities() enhancer is no longer needed in v7+.
 * EntityMap markers are now automatically processed during tree finalization.
 *
 * ## Migration
 *
 * Before (v6):
 * ```typescript
 * signalTree({ users: entityMap<User>() }).with(entities())
 * ```
 *
 * After (v7):
 * ```typescript
 * signalTree({ users: entityMap<User>() })  // Just works!
 * ```
 *
 * This enhancer was deprecated in v6 and removed in v7.
 *
 * Contract: (config?) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & EntitiesEnabled
 */
export function entities(config: EntitiesEnhancerConfig = {}) {
  // Removed in v7: throw a helpful error at runtime to force callers to remove
  // `.with(entities())` calls. v7+ automatically processes EntityMap markers.
  throw new Error(
    'entities() has been removed. Remove `.with(entities())` from your code; v7+ auto-processes EntityMap markers.'
  );
}

// Keep aliases for backward-compat import names, but they will throw when used.
export const enableEntities = entities;
export const highPerformanceEntities = entities;
export const withEntities = entities;
