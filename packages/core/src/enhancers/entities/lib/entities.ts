import { createEntitySignal } from '../../../lib/entity-signal';
import { getPathNotifier } from '../../../lib/path-notifier';
import { isNodeAccessor } from '../../../lib/utils';

import type {
  EntityConfig,
  EntityMapMarker,
  SignalTreeBase,
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

function materializeEntities<T>(
  tree: SignalTreeBase<T>,
  notifier = getPathNotifier()
): void {
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
}

/**
 * Entities enhancer that materializes EntitySignal collections from entityMap markers.
 */
export function withEntities(config: EntitiesEnhancerConfig = {}) {
  const { enabled = true } = config;

  return function enhanceWithEntities<T>(tree: SignalTreeBase<T>): Omit<
    SignalTreeBase<T>,
    'state' | '$'
  > & {
    state: EntityAwareTreeNode<T>;
    $: EntityAwareTreeNode<T>;
  } {
    if (!enabled) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return tree as any;
    }

    materializeEntities(tree);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tree as any;
  };
}

export function enableEntities() {
  return withEntities({ enabled: true });
}

export function withHighPerformanceEntities() {
  return withEntities({ enabled: true });
}
