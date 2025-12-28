import { applyState, snapshotState } from '../utils';

import type { SignalTree, DevToolsMethods, Enhancer } from '../types';
export interface DevToolsConfig {
  name?: string;
  maxAge?: number;
}

export function withDevTools<T>(
  config: DevToolsConfig = {}
): Enhancer<DevToolsMethods> {
  const { name = 'SignalTree', maxAge = 50 } = config;

  const enhancer = <S>(
    tree: SignalTree<S>
  ): SignalTree<S> & DevToolsMethods => {
    let conn: any = null;
    let unsub: (() => void) | null = null;
    let isFromDev = false;

    const getState = () => snapshotState((tree as any).state);

    const handle = (message: any) => {
      if (!message || !message.type) return;
      if (
        message.type === 'DISPATCH' &&
        message.payload?.type === 'JUMP_TO_STATE' &&
        message.state
      ) {
        isFromDev = true;
        try {
          applyState((tree as any).$, JSON.parse(message.state));
        } finally {
          setTimeout(() => (isFromDev = false), 0);
        }
      }
    };

    const methods: DevToolsMethods = {
      connectDevTools() {
        if (typeof window === 'undefined') return;
        const ext = (window as any).__REDUX_DEVTOOLS_EXTENSION__;
        if (!ext) return;
        conn = ext.connect({ name, maxAge });
        conn.init(getState());
        unsub = conn.subscribe(handle);
      },
      disconnectDevTools() {
        if (unsub) {
          unsub();
          unsub = null;
        }
        if (conn) {
          conn.disconnect();
          conn = null;
        }
      },
    };

    const originalDestroy = (tree as any).destroy?.bind(tree);
    (tree as any).destroy = () => {
      methods.disconnectDevTools();
      originalDestroy?.();
    };

    return Object.assign(tree, methods);
  };

  (enhancer as any).metadata = {
    name: 'withDevTools',
    provides: ['connectDevTools', 'disconnectDevTools'],
  };
  return enhancer as unknown as Enhancer<DevToolsMethods>;
}
