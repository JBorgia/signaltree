import { isSignal } from '@angular/core';

import { createEntitySignal } from '../../lib/entity-signal';
import { getPathNotifier } from '../../lib/path-notifier';
import { isNodeAccessor } from '../../lib/utils';

import type {
  EntityConfig,
  EntityMapMarker,
  ISignalTree,
  EntitiesEnabled,
} from '../../lib/types';

// Match whatever config the type test expects
export interface EntitiesEnhancerConfig {
  enabled?: boolean;
}

type Marker = EntityMapMarker<Record<string, unknown>, string | number> & {
  __entityMapConfig?: EntityConfig<Record<string, unknown>, string | number>;
};

function isEntityMapMarker(value: unknown): value is Marker {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)['__isEntityMap'] === true
  );
}

/**
 * v6 Entities Enhancer
 *
 * Recursively traverses the signal tree and converts all `entityMap()` markers
 * into fully-functional EntitySignal instances with CRUD operations.
 *
 * ## Deep Merge Support
 *
 * This enhancer properly supports the deep merge pattern by recursing into
 * **NodeAccessors** (function-based wrappers around nested state). This is
 * critical because:
 *
 * 1. When derived state is merged into a namespace containing entityMaps,
 *    the namespace becomes a NodeAccessor (function with properties)
 * 2. NodeAccessors have `typeof === 'function'`, not `'object'`
 * 3. Without the `isNodeAccessor()` check, entityMaps nested inside
 *    NodeAccessors would be skipped and never materialized
 *
 * ## Example
 *
 * ```typescript
 * const tree = signalTree({
 *   tickets: {
 *     entities: entityMap<Ticket, number>(),
 *     activeId: null,
 *   }
 * }).derived(($) => ({
 *   tickets: {
 *     active: derived(() => $.tickets.entities.byId($.tickets.activeId())?.())
 *   }
 * })).with(entities());
 *
 * // $.tickets is a NodeAccessor (function), not a plain object
 * // The entities() enhancer still processes $.tickets.entities because
 * // it checks isNodeAccessor() and recurses into function-based nodes
 * ```
 *
 * Contract: (config?) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & EntitiesEnabled
 */
export function entities(
  config: EntitiesEnhancerConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & EntitiesEnabled {
  const { enabled = true } = config;
  return <T>(tree: ISignalTree<T>): ISignalTree<T> & EntitiesEnabled => {
    if (!enabled) {
      (tree as { __entitiesEnabled?: true }).__entitiesEnabled = true;
      return tree as unknown as ISignalTree<T> & EntitiesEnabled;
    }

    const notifier = getPathNotifier();

    function materialize(node: unknown, path: string[] = []) {
      if (!node || (typeof node !== 'object' && typeof node !== 'function'))
        return;

      // Handle both plain objects and NodeAccessors (which are functions with properties)
      // NodeAccessors are created by signalTree for nested state - they're functions
      // that can be called to get/set state, but also have enumerable properties
      // for child nodes. We need to recurse into them to find entityMap markers.
      const isAccessor = isNodeAccessor(node);
      if (typeof node === 'function' && !isAccessor) return;

      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (isEntityMapMarker(v)) {
          // Found an entityMap marker - convert to EntitySignal
          const cfg = (v as Marker).__entityMapConfig ?? {};
          const sig = createEntitySignal(
            cfg as EntityConfig<Record<string, unknown>, string | number>,
            notifier,
            path.concat(k).join('.')
          );
          try {
            // Assign the EntitySignal to replace the marker
            // NodeAccessor properties must be writable for this to work
            (node as Record<string, unknown>)[k] = sig;
          } catch {
            /* ignore - property may be read-only on non-writable NodeAccessors */
          }
          try {
            (tree as unknown as Record<string, unknown>)[k] = sig;
          } catch {
            /* ignore */
          }
        } else if (isNodeAccessor(v)) {
          // ==================================================================
          // CRITICAL FOR DEEP MERGE: Recurse into NodeAccessors
          // ==================================================================
          // When derived state is merged into a namespace, the namespace
          // becomes a NodeAccessor. Without this check, we'd skip function
          // types entirely and miss any entityMaps nested inside.
          //
          // Example: $.tickets is a NodeAccessor containing $.tickets.entities
          // We must recurse into $.tickets to find and process the entityMap.
          // ==================================================================
          materialize(v, path.concat(k));
        } else if (
          typeof v === 'object' &&
          v !== null &&
          !Array.isArray(v) &&
          !isSignal(v)
        ) {
          materialize(v, path.concat(k));
        }
      }
    }

    materialize(tree.state);
    materialize((tree as { $?: unknown }).$);

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
