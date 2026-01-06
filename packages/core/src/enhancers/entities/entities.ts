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
 * This enhancer will be removed in v8.
 *
 * Contract: (config?) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & EntitiesEnabled
 */
export function entities(
  config: EntitiesEnhancerConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & EntitiesEnabled {
  // Show deprecation warning in development
  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    console.warn(
      'SignalTree: entities() enhancer is deprecated in v7. ' +
        'EntityMap markers are now automatically processed. ' +
        'Remove .with(entities()) from your code. ' +
        'This enhancer will be removed in v8.'
    );
  }

  const { enabled = true } = config;
  return <T>(tree: ISignalTree<T>): ISignalTree<T> & EntitiesEnabled => {
    // No-op - markers are already processed by materializeMarkers() in finalize()
    // Just mark as enabled for backward compatibility checks
    (tree as { __entitiesEnabled?: true }).__entitiesEnabled = true;
    return tree as ISignalTree<T> & EntitiesEnabled;
  };
}

export function enableEntities(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & EntitiesEnabled {
  return entities();
}

export function highPerformanceEntities(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & EntitiesEnabled {
  return entities();
}

/**
 * @deprecated Use `entities()` instead. This legacy `withEntities`
 * alias will be removed in a future major release.
 */
export const withEntities = Object.assign(entities, {
  highPerformance: highPerformanceEntities,
  enable: enableEntities,
});
