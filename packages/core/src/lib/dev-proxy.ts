import type { ISignalTree } from './types';

const ENHANCER_METHOD_MAP: Record<
  string,
  { enhancer: string }
> = {
  effect: { enhancer: 'effects()' },
  subscribe: { enhancer: 'effects()' },
  batch: { enhancer: 'batching()' },
  batchUpdate: { enhancer: 'batching()' },
  undo: { enhancer: 'timeTravel()' },
  redo: { enhancer: 'timeTravel()' },
  getHistory: { enhancer: 'timeTravel()' },
  connectDevTools: { enhancer: 'devTools()' },
  disconnectDevTools: { enhancer: 'devTools()' },
  entities: { enhancer: 'entities()' },
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
