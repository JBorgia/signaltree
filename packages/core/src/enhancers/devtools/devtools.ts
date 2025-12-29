/*
 * v6 DevTools Enhancer
 *
 * Contract: (config?) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & DevToolsMethods
 */

import type {
  SignalTreeBase,
  DevToolsMethods,
  DevToolsConfig,
} from '../../lib/types';

interface ReduxDevToolsExtension {
  connect(options?: { name?: string }): {
    init(state: unknown): void;
    send(action: string | { type: string }, state: unknown): void;
    subscribe(
      listener: (message: { type: string; state?: string }) => void
    ): () => void;
    disconnect(): void;
  };
}

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: ReduxDevToolsExtension;
  }
}

export function withDevTools(
  config: DevToolsConfig = {}
): <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & DevToolsMethods {
  const { enabled = true, name, treeName, logActions = false } = config;
  const displayName = name ?? treeName ?? 'SignalTree';

  return <S>(tree: SignalTreeBase<S>): SignalTreeBase<S> & DevToolsMethods => {
    let devTools: ReturnType<ReduxDevToolsExtension['connect']> | null = null;
    let connected = false;
    let unsubscribe: (() => void) | null = null;

    const methods: DevToolsMethods = {
      connectDevTools(): void {
        if (!enabled || connected) return;

        if (
          typeof window === 'undefined' ||
          !window.__REDUX_DEVTOOLS_EXTENSION__
        ) {
          if (logActions) {
            console.warn('[SignalTree] Redux DevTools extension not found');
          }
          return;
        }

        try {
          devTools = window.__REDUX_DEVTOOLS_EXTENSION__.connect({
            name: displayName,
          });

          devTools.init(tree());

          // Subscribe to time-travel actions from DevTools
          unsubscribe = devTools.subscribe((message) => {
            if (message.type === 'DISPATCH' && message.state) {
              try {
                const state = JSON.parse(message.state);
                tree(state);
              } catch (e) {
                console.error(
                  '[SignalTree] Failed to apply DevTools state:',
                  e
                );
              }
            }
          });

          connected = true;

          if (logActions) {
            console.log(`[SignalTree] Connected to DevTools: ${displayName}`);
          }
        } catch (e) {
          console.error('[SignalTree] Failed to connect to DevTools:', e);
        }
      },

      disconnectDevTools(): void {
        if (!connected || !devTools) return;

        try {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
          devTools.disconnect();
          devTools = null;
          connected = false;

          if (logActions) {
            console.log(
              `[SignalTree] Disconnected from DevTools: ${displayName}`
            );
          }
        } catch (e) {
          console.error('[SignalTree] Failed to disconnect from DevTools:', e);
        }
      },
    };

    // Override destroy to disconnect
    const originalDestroy = tree.destroy?.bind(tree);
    (tree as any).destroy = () => {
      methods.disconnectDevTools();
      if (originalDestroy) {
        originalDestroy();
      }
    };

    return Object.assign(tree, methods);
  };
}

export function enableDevTools(
  name?: string
): <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & DevToolsMethods {
  return withDevTools({ name });
}
