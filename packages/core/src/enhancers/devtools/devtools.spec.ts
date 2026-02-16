import { describe, expect, it, vi } from 'vitest';

import { devTools, enableDevTools, fullDevTools, productionDevTools } from './devtools';
import { getPathNotifier, resetPathNotifier } from '../../lib/path-notifier';

function createMockTree() {
  const state = { count: 0 } as Record<string, any>;

  const tree = function (...args: any[]) {
    if (args.length === 0) return state;
    const arg = args[0];
    if (typeof arg === 'function') {
      const res = arg(state);
      if (res && typeof res === 'object') Object.assign(state, res);
      return;
    }
    if (typeof arg === 'object') {
      Object.assign(state, arg);
      return;
    }
  } as any;

  tree.state = state;
  tree.$ = state;
  tree.bind =
    (_: unknown) =>
    (...a: unknown[]) =>
      tree(...(a as any));
  tree.destroy = () => void 0;

  return tree as any;
}

describe('devTools enhancer (v6 API)', () => {
  it('no-op when disabled and does not attach __devTools', () => {
    const tree = createMockTree();
    const enhanced = devTools({ enabled: false })(tree);

    expect(typeof enhanced.connectDevTools).toBe('function');
    expect(typeof enhanced.disconnectDevTools).toBe('function');
    expect((enhanced as any).__devTools).toBeUndefined();

    // methods are callable and should not throw
    enhanced.connectDevTools();
    enhanced.disconnectDevTools();
  });

  it('attaches __devTools and collects metrics when enabled', () => {
    const tree = createMockTree();
    const enhanced = devTools({ enabled: true })(tree);

    expect(typeof enhanced.connectDevTools).toBe('function');
    expect(typeof enhanced.disconnectDevTools).toBe('function');

    const dev = (enhanced as any).__devTools;
    expect(dev).toBeDefined();
    expect(typeof dev.exportDebugSession).toBe('function');

    // perform an update via the enhanced tree and verify metrics changed
    enhanced({ count: 1 });

    const snapshot = dev.exportDebugSession();
    expect(snapshot.metrics).toBeDefined();
    expect(typeof snapshot.metrics.totalUpdates).toBe('number');
  });

  it('alias `devTools` behaves like `devTools` and presets are available', () => {
    const treeA = createMockTree();
    const a = devTools({})(treeA);
    expect((a as any).__devTools).toBeDefined();

    const treeB = createMockTree();
    const b = enableDevTools()(treeB);
    expect((b as any).__devTools).toBeDefined();

    // presets
    const treeC = createMockTree();
    const c = fullDevTools('T')(treeC);
    expect((c as any).__devTools).toBeDefined();

    const treeD = createMockTree();
    const d = productionDevTools()(treeD);
    expect((d as any).__devTools).toBeDefined();
  });

  it('auto-connects to Redux DevTools when extension is present', async () => {
    resetPathNotifier();

    const originalWindow = (globalThis as any).window;
    const send = vi.fn();
    const connect = vi.fn(() => ({ send }));

    (globalThis as any).window = {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect,
      },
    };

    try {
      const tree = createMockTree();
      devTools({ enabled: true, enableBrowserDevTools: true })(tree);

      expect(connect).toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith('@@INIT', tree());

      // Let any scheduled sends flush (should be none on first run)
      await Promise.resolve();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('sends updates to Redux DevTools on PathNotifier flushes (beyond @@INIT)', async () => {
    resetPathNotifier();

    const originalWindow = (globalThis as any).window;
    const send = vi.fn();
    const connect = vi.fn(() => ({ send }));

    (globalThis as any).window = {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect,
      },
    };

    try {
      const tree = createMockTree();
      devTools({ enabled: true, enableBrowserDevTools: true })(tree);

      // Ignore init call
      send.mockClear();

      const notifier = getPathNotifier();
      notifier.notify('products.1', { id: 1 }, undefined);
      notifier.flushSync();

      // Debounced send happens in a microtask
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toMatchObject({
        type: 'SignalTree/products[1]',
        payload: 'products[1]',
        meta: {
          source: 'path-notifier',
          paths: ['products[1]'],
          timestamp: expect.any(Number),
        },
      });
      expect(send.mock.calls[0][1]).toEqual(tree());
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('filters updates using include/exclude path patterns', async () => {
    resetPathNotifier();

    const originalWindow = (globalThis as any).window;
    const send = vi.fn();
    const connect = vi.fn(() => ({ send }));

    (globalThis as any).window = {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect,
      },
    };

    try {
      const tree = createMockTree();
      devTools({
        enabled: true,
        enableBrowserDevTools: true,
        includePaths: ['products.*'],
        excludePaths: ['products.1'],
      })(tree);

      send.mockClear();

      const notifier = getPathNotifier();
      notifier.notify('products.1', { id: 1 }, undefined);
      notifier.flushSync();

      await Promise.resolve();

      expect(send).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('applies DevTools time-travel dispatches', async () => {
    resetPathNotifier();

    const originalWindow = (globalThis as any).window;
    const send = vi.fn();
    let subscriber: ((message: unknown) => void) | null = null;
    const connect = vi.fn(() => ({
      send,
      subscribe: (listener: (message: unknown) => void) => {
        subscriber = listener;
      },
    }));

    (globalThis as any).window = {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect,
      },
    };

    try {
      const tree = createMockTree();
      devTools({ enabled: true, enableBrowserDevTools: true })(tree);

      const nextState = { count: 42 };
      subscriber?.({
        type: 'DISPATCH',
        payload: { type: 'JUMP_TO_STATE' },
        state: JSON.stringify(nextState),
      });

      expect(tree()).toEqual(nextState);

      // Allow any scheduled sends to complete
      await Promise.resolve();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
