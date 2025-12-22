import { createEntitySignal } from '../../../lib/entity-signal';
import { getPathNotifier } from '../../../lib/path-notifier';
import { isNodeAccessor } from '../../../lib/utils';

import type {
  EntityConfig,
  EntityMapMarker,
  EntitySignal,
  SignalTree,
  EntityAwareTreeNode,
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

function isEntitySignal(
  value: unknown
): value is EntitySignal<unknown, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>)['addOne'] === 'function' &&
    typeof (value as Record<string, unknown>)['all'] !== 'undefined'
  );
}

function materializeEntities<T>(
  tree: SignalTree<T>,
  notifier = getPathNotifier()
): Map<string, EntitySignal<any, string | number>> {
  const registry = new Map<string, EntitySignal<any, string | number>>();
  const state = tree.state as Record<string, unknown>;

  const visit = (
    parent: Record<string, unknown> | undefined,
    key: string,
    value: unknown,
    path: string[]
  ) => {
    const nextPath = [...path, key];

    if (isEntityMapMarker(value)) {
      const basePath = nextPath.join('.');
      const config = (value.__entityMapConfig ?? {}) as EntityConfig<
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        any,
        string | number
      >;
      const entitySignal = createEntitySignal(config, notifier, basePath);

      if (parent) {
        try {
          parent[key] = entitySignal;
        } catch {
          // Ignore assignment failures for non-configurable properties
        }
      }

      try {
        (tree as unknown as Record<string, unknown>)[key] = entitySignal;
      } catch {
        // If property cannot be defined on tree, skip
      }

      registry.set(basePath, entitySignal);
      return;
    }

    if (isNodeAccessor(value)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeAsAny = value as any;
      for (const childKey of Object.keys(nodeAsAny)) {
        visit(nodeAsAny, childKey, nodeAsAny[childKey], nextPath);
      }
      return;
    }

    if (value && typeof value === 'object') {
      for (const childKey of Object.keys(value as Record<string, unknown>)) {
        visit(
          value as Record<string, unknown>,
          childKey,
          (value as Record<string, unknown>)[childKey],
          nextPath
        );
      }
    }
  };

  for (const key of Object.keys(state)) {
    visit(state, key, state[key], []);
  }

  return registry;
}

function resolveEntitySignal<T>(
  tree: SignalTree<T>,
  registry: Map<string, EntitySignal<unknown, string | number>>,
  path: string | keyof T
): EntitySignal<unknown, string | number> {
  const pathStr = String(path);
  const existing = registry.get(pathStr);
  if (existing) return existing;

  const segments = pathStr.split('.');
  let current: unknown = tree.state as Record<string, unknown>;

  for (const segment of segments) {
    if (!current) break;
    current = (current as Record<string, unknown>)[segment];
  }

  if (isEntitySignal(current)) {
    registry.set(pathStr, current);
    return current;
  }

  throw new Error(
    `Entity path '${pathStr}' is not configured. Define it with entityMap() in your initial state.`
  );
}

/**
 * Entities enhancer that materializes EntitySignal collections from entityMap markers.
 */
export function withEntities(config: EntitiesEnhancerConfig = {}) {
  const { enabled = true } = config;

  return function enhanceWithEntities<T>(tree: SignalTree<T>): Omit<
    SignalTree<T>,
    'state' | '$'
  > & {
    state: EntityAwareTreeNode<T>;
    $: EntityAwareTreeNode<T>;
    entities<E, K extends string | number>(
      path: keyof T | string
    ): EntitySignal<E, K>;
  } {
    if (!enabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return tree as any;
    }

    const registry = materializeEntities(tree);

    const enhancedTree = Object.assign(tree, {
      entities<E, K extends string | number>(
        path: keyof T | string
      ): EntitySignal<E, K> {
        return resolveEntitySignal(tree, registry, path) as EntitySignal<E, K>;
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return enhancedTree as any;
  };
}

export function enableEntities() {
  return withEntities({ enabled: true });
}

export function withHighPerformanceEntities() {
  return withEntities({ enabled: true });
}
