import type { ISignalTree } from './types';

const ENHANCER_METHOD_MAP: Record<
  string,
  { enhancer?: string; message?: string }
> = {
  effect: {
    message:
      "effect() is not available — use Angular's native effect(() => tree.$.path()) instead. " +
      '(The effects() enhancer that provided it is deprecated.)',
  },
  subscribe: {
    message:
      "subscribe() is not available — use Angular's native effect(() => tree.$.path()) instead. " +
      '(The effects() enhancer that provided it is deprecated.)',
  },
  batch: { enhancer: 'batching()' },
  batchUpdate: { enhancer: 'batching()' },
  undo: { enhancer: 'timeTravel()' },
  redo: { enhancer: 'timeTravel()' },
  getHistory: { enhancer: 'timeTravel()' },
  connectDevTools: { enhancer: 'devTools()' },
  disconnectDevTools: { enhancer: 'devTools()' },
};

export function wrapWithDevProxy<T>(tree: ISignalTree<T>): ISignalTree<T> {
  return new Proxy(tree, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (value !== undefined) return value;
      const info = ENHANCER_METHOD_MAP[String(prop)];
      if (info)
        return () => {
          throw new Error(
            info.message ?? `${String(prop)}() requires ${info.enhancer}`
          );
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
