import { createEntitySignal } from '../entity-signal';
import { isEntityMapMarker } from '../utils';

import type { SignalTree, EntitiesMethods, Enhancer } from '../types';

export interface EntitiesConfig {
  defaultSelectId?: <E>(entity: E) => string | number;
}

export function withEntities<T>(
  config: EntitiesConfig = {}
): Enhancer<EntitiesMethods<T>> {
  const { defaultSelectId } = config;

  const enhancer = <S>(
    tree: SignalTree<S>
  ): SignalTree<S> & EntitiesMethods<S> => {
    const registry = new Map<string, unknown>();

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
          registry.set(pathStr, sig);
          registry.set(k, sig);
        } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          materialize(v, currentPath);
        }
      }
    }

    materialize((tree as any).state, []);
    materialize((tree as any).$, []);

    const methods: EntitiesMethods<S> = {
      entities(path) {
        const p = String(path);
        const found = registry.get(p) as any;
        if (!found) throw new Error(`Entity path '${p}' not found`);
        return found as unknown as any;
      },
    };

    return Object.assign(tree, methods);
  };

  (enhancer as any).metadata = { name: 'withEntities', provides: ['entities'] };
  return enhancer as unknown as Enhancer<EntitiesMethods<T>>;
}
