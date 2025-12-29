import { createEntitySignal } from '../entity-signal';
import { isEntityMapMarker } from '../utils';

import type {
  SignalTreeBase as SignalTree,
  EntitiesEnabled,
  Enhancer,
  EntitySignal,
} from '../types';

export interface EntitiesConfig {
  defaultSelectId?: <E>(entity: E) => string | number;
}

export function withEntities(
  config: EntitiesConfig = {}
): <S>(tree: SignalTree<S>) => SignalTree<S> & EntitiesEnabled {
  const { defaultSelectId } = config;
  const inner = <S>(tree: SignalTree<S>): SignalTree<S> & EntitiesEnabled => {
    function materialize(node: any, path: string[] = []) {
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node)) {
        const currentPath = [...path, k];
        const pathStr = currentPath.join('.');
        if (isEntityMapMarker(v)) {
          const cfg = (v as any).__entityMapConfig ?? {};
          const sig = createEntitySignal(
            cfg,
            (tree as any).__pathNotifier,
            pathStr
          );
          node[k] = sig;
        } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          materialize(v, currentPath);
        }
      }
    }

    materialize((tree as any).state, []);
    materialize((tree as any).$, []);

    // Mark that entities have been materialized at runtime. Consumers should
    // use `tree.$.prop` which is typed as `EntitySignal` by `TreeNode<T>`.
    (tree as any).__entitiesEnabled = true;
    return tree as SignalTree<S> & EntitiesEnabled;
  };

  (inner as any).metadata = {
    name: 'withEntities',
    provides: ['entitiesEnabled'],
  };

  return inner;
}
