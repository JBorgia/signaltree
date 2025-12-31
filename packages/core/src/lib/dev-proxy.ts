import type { ISignalTree } from './types';

const ENHANCER_METHOD_MAP: Record<
  string,
  { enhancer: string; preset: string }
> = {
  effect: { enhancer: 'effects()', preset: 'createMinimalTree' },
  subscribe: { enhancer: 'effects()', preset: 'createMinimalTree' },
  batch: { enhancer: 'batching()', preset: 'createProdTree' },
  batchUpdate: { enhancer: 'batching()', preset: 'createProdTree' },
  memoize: { enhancer: 'memoization()', preset: 'createProdTree' },
  memoizedUpdate: { enhancer: 'memoization()', preset: 'createProdTree' },
  clearMemoCache: { enhancer: 'memoization()', preset: 'createProdTree' },
  getCacheStats: { enhancer: 'memoization()', preset: 'createProdTree' },
  undo: { enhancer: 'timeTravel()', preset: 'createDevTree' },
  redo: { enhancer: 'timeTravel()', preset: 'createDevTree' },
  getHistory: { enhancer: 'timeTravel()', preset: 'createDevTree' },
  connectDevTools: { enhancer: 'devTools()', preset: 'createDevTree' },
  disconnectDevTools: { enhancer: 'devTools()', preset: 'createDevTree' },
  entities: { enhancer: 'entities()', preset: 'createDevTree' },
};

export function wrapWithDevProxy<T>(tree: ISignalTree<T>): ISignalTree<T> {
  return new Proxy(tree, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (value !== undefined) return value;
      const info = ENHANCER_METHOD_MAP[String(prop)];
      if (info)
        return () => {
          throw new Error(`${String(prop)}() requires ${info.enhancer}`);
        };
      return undefined;
    },
    has(target, prop) {
      return Reflect.has(target, prop);
    },
  }) as ISignalTree<T>;
}

export function shouldUseDevProxy(): boolean {
  try {
    if (typeof (globalThis as any).ngDevMode !== 'undefined')
      return Boolean((globalThis as any).ngDevMode);
    if (typeof process !== 'undefined' && (process as any).env?.['NODE_ENV'])
      return (process as any).env['NODE_ENV'] !== 'production';
  } catch (_err) {
    // ignore errors while probing environment
    void 0;
  }
  return false;
}
