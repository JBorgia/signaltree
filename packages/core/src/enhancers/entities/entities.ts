import { createEntitySignal } from '../../lib/entity-signal';
import { getPathNotifier } from '../../lib/path-notifier';

import type {
  EntityConfig,
  EntityMapMarker,
  SignalTreeBase,
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
 * Contract: (config?) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & EntitiesEnabled
 */
export function withEntities(
  config: EntitiesEnhancerConfig = {}
): <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & EntitiesEnabled {
  // ← Explicit signature
  const { enabled = true } = config;

  return <S>(tree: SignalTreeBase<S>): SignalTreeBase<S> & EntitiesEnabled => {
    if (!enabled) {
      (tree as { __entitiesEnabled?: true }).__entitiesEnabled = true;
      return tree as SignalTreeBase<S> & EntitiesEnabled;
    }

    const notifier = getPathNotifier();

    function materialize(node: unknown, path: string[] = []) {
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (isEntityMapMarker(v)) {
          const cfg = (v as Marker).__entityMapConfig ?? {};
          const sig = createEntitySignal(
            cfg as EntityConfig<Record<string, unknown>, string | number>,
            notifier,
            path.concat(k).join('.')
          );
          try {
            (node as Record<string, unknown>)[k] = sig;
          } catch {
            /* ignore */
          }
          try {
            (tree as unknown as Record<string, unknown>)[k] = sig;
          } catch {
            /* ignore */
          }
        } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          materialize(v, path.concat(k));
        }
      }
    }

    materialize(tree.state);
    materialize((tree as { $?: unknown }).$);

    (tree as { __entitiesEnabled?: true }).__entitiesEnabled = true;

    return tree as SignalTreeBase<S> & EntitiesEnabled;
  };
}

export function enableEntities(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & EntitiesEnabled {
  return withEntities();
}

export function withHighPerformanceEntities(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & EntitiesEnabled {
  return withEntities();
}
