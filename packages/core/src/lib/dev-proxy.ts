import type { SignalTree } from './types';

const ENHANCER_METHOD_MAP: Record<
  string,
  { enhancer: string; preset: string }
> = {
  effect: { enhancer: 'withEffects()', preset: 'createMinimalTree' },
  subscribe: { enhancer: 'withEffects()', preset: 'createMinimalTree' },
  batch: { enhancer: 'withBatching()', preset: 'createProdTree' },
  batchUpdate: { enhancer: 'withBatching()', preset: 'createProdTree' },
  memoize: { enhancer: 'withMemoization()', preset: 'createProdTree' },
  memoizedUpdate: { enhancer: 'withMemoization()', preset: 'createProdTree' },
  clearMemoCache: { enhancer: 'withMemoization()', preset: 'createProdTree' },
  getCacheStats: { enhancer: 'withMemoization()', preset: 'createProdTree' },
  undo: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  redo: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  getHistory: { enhancer: 'withTimeTravel()', preset: 'createDevTree' },
  connectDevTools: { enhancer: 'withDevTools()', preset: 'createDevTree' },
  disconnectDevTools: { enhancer: 'withDevTools()', preset: 'createDevTree' },
  entities: { enhancer: 'withEntities()', preset: 'createDevTree' },
};

export function wrapWithDevProxy<T>(tree: SignalTree<T>): SignalTree<T> {
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
  }) as SignalTree<T>;
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
