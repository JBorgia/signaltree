import { createEntitySignal } from '../../../lib/entity-signal';
import { getPathNotifier } from '../../../lib/path-notifier';

import type {
  EntityConfig,
  EntityMapMarker,
  SignalTreeBase,
  Enhancer,
  EntitiesEnabled,
} from '../../../lib/types';

interface EntitiesEnhancerConfig {
  enabled?: boolean;
}

type Marker = EntityMapMarker<unknown, string | number> & {
  __entityMapConfig?: EntityConfig<unknown, string | number>;
};

function isEntityMapMarker(value: unknown): value is Marker {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)['__isEntityMap'] === true
  );
}

/**
 * Runtime-only entities enhancer. Type transformations are handled by
 * `TreeNode<T>` at compile time; this enhancer only materializes the
 * runtime EntitySignal instances and attaches a marker.
 */
export function withEntities(
  config: EntitiesEnhancerConfig = {}
): Enhancer<EntitiesEnabled> {
  const { enabled = true } = config;

  return <S>(tree: SignalTreeBase<S>): SignalTreeBase<S> & EntitiesEnabled => {
    if (!enabled) {
      (tree as any).__entitiesEnabled = true;
      return tree as SignalTreeBase<S> & EntitiesEnabled;
    }

    const notifier = getPathNotifier();

    function materialize(node: unknown, path: string[] = []) {
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (isEntityMapMarker(v)) {
          const cfg = (v as any).__entityMapConfig ?? {};
          const sig = createEntitySignal(
            cfg as EntityConfig<any, any>,
            notifier,
            path.concat(k).join('.')
          );
          try {
            (node as any)[k] = sig;
          } catch {
            // ignore non-writable properties
          }
          try {
            (tree as any)[k] = sig;
          } catch {
            // ignore if can't define on tree
          }
        } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          materialize(v, path.concat(k));
        }
      }
    }

    materialize(tree.state);
    materialize((tree as any).$);

    // Attach runtime marker
    (tree as any).__entitiesEnabled = true;

    return tree as SignalTreeBase<S> & EntitiesEnabled;
  };
}

export function enableEntities(): ReturnType<typeof withEntities> {
  return withEntities();
}

export function withHighPerformanceEntities(): ReturnType<typeof withEntities> {
  return withEntities();
}
