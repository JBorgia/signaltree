import { describe, expect, it, vi } from 'vitest';

import { devTools, enableDevTools, fullDevTools, productionDevTools } from './devtools';
import { getPathNotifier, resetPathNotifier } from '../../lib/path-notifier';

function createMockTree(initialState: Record<string, any> = { count: 0 }) {
  const state = { ...initialState } as Record<string, any>;

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

  it('omits function-valued properties from DevTools state', async () => {
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
      (tree.state as any).fn = () => 123;
      (tree.$ as any).fn = (tree.state as any).fn;

      devTools({ enabled: true, enableBrowserDevTools: true })(tree);

      expect(send).toHaveBeenCalledTimes(1);
      const initState = send.mock.calls[0][1];
      expect(initState).toMatchObject({ count: 0 });
      expect((initState as any).fn).toBeUndefined();

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

  it('disconnectDevTools calls unsubscribe when DevTools subscribe returns it', () => {
    resetPathNotifier();

    const originalWindow = (globalThis as any).window;
    const send = vi.fn();
    const unsubscribe = vi.fn();
    const connect = vi.fn(() => ({
      send,
      subscribe: (_listener: (message: unknown) => void) => unsubscribe,
    }));

    (globalThis as any).window = {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect,
      },
    };

    try {
      const tree = createMockTree();
      const enhanced = devTools({ enabled: true, enableBrowserDevTools: true })(
        tree
      );

      enhanced.disconnectDevTools();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('time-travel restores EntitySignal-like nodes via setAll(all)', () => {
    resetPathNotifier();

    const originalWindow = (globalThis as any).window;
    const send = vi.fn();
    let subscriber: ((message: unknown) => void) | null = null;

    const setAll = vi.fn();
    const users = {
      setAll,
      // method placeholders that must NOT be overwritten by time travel
      addOne: vi.fn(),
      byId: vi.fn(),
    };

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
      (tree.state as any).users = users;
      (tree.$ as any).users = users;

      devTools({ enabled: true, enableBrowserDevTools: true })(tree);

      const nextUsers = [{ id: 1, name: 'Alice' }];
      const nextState = { count: 0, users: { all: nextUsers } };
      subscriber?.({
        type: 'DISPATCH',
        payload: { type: 'JUMP_TO_STATE' },
        state: JSON.stringify(nextState),
      });

      expect(setAll).toHaveBeenCalledTimes(1);
      expect(setAll).toHaveBeenCalledWith(nextUsers);

      // ensure we didn't overwrite methods
      expect((tree.$ as any).users.addOne).toBe(users.addOne);
      expect((tree.$ as any).users.byId).toBe(users.byId);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('aggregatedReduxInstance groups multiple trees under one DevTools instance', async () => {
    resetPathNotifier();

    const originalWindow = (globalThis as any).window;
    const send = vi.fn();
    const connect = vi.fn(() => ({
      send,
      subscribe: (_listener: (message: unknown) => void) => void 0,
    }));

    (globalThis as any).window = {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect,
      },
    };

    try {
      const treeA = createMockTree();
      const treeB = createMockTree();

      devTools({
        enabled: true,
        enableBrowserDevTools: true,
        treeName: 'A',
        aggregatedReduxInstance: { id: 'group-1', name: 'Group 1' },
      })(treeA);

      devTools({
        enabled: true,
        enableBrowserDevTools: true,
        treeName: 'B',
        aggregatedReduxInstance: { id: 'group-1', name: 'Group 1' },
      })(treeB);

      expect(connect).toHaveBeenCalledTimes(1);

      // There should be at least one send containing both A and B.
      const sentStates = send.mock.calls.map((c) => c[1]);
      expect(
        sentStates.some((s) => s && typeof s === 'object' && 'A' in s && 'B' in s)
      ).toBe(true);

      await Promise.resolve();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('aggregatedReduxInstance applies time-travel dispatches to all trees', async () => {
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
      const treeA = createMockTree();
      const treeB = createMockTree();

      devTools({
        enabled: true,
        enableBrowserDevTools: true,
        treeName: 'A',
        aggregatedReduxInstance: { id: 'group-2', name: 'Group 2' },
      })(treeA);

      devTools({
        enabled: true,
        enableBrowserDevTools: true,
        treeName: 'B',
        aggregatedReduxInstance: { id: 'group-2', name: 'Group 2' },
      })(treeB);

      subscriber?.({
        type: 'DISPATCH',
        payload: { type: 'JUMP_TO_STATE' },
        state: JSON.stringify({ A: { count: 10 }, B: { count: 20 } }),
      });

      expect((treeA() as any).count).toBe(10);
      expect((treeB() as any).count).toBe(20);

      await Promise.resolve();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('aggregatedReduxInstance does not bleed PathNotifier paths across trees', async () => {
    resetPathNotifier();

    const originalWindow = (globalThis as any).window;
    const send = vi.fn();
    const connect = vi.fn(() => ({
      send,
      subscribe: (_listener: (message: unknown) => void) => void 0,
    }));

    (globalThis as any).window = {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect,
      },
    };

    try {
      const treeA = createMockTree({ a: 0 });
      const treeB = createMockTree({ b: 0 });

      devTools({
        enabled: true,
        enableBrowserDevTools: true,
        treeName: 'A',
        aggregatedReduxInstance: { id: 'group-bleed', name: 'Group Bleed' },
      })(treeA);

      devTools({
        enabled: true,
        enableBrowserDevTools: true,
        treeName: 'B',
        aggregatedReduxInstance: { id: 'group-bleed', name: 'Group Bleed' },
      })(treeB);

      // Ignore any init/register events
      send.mockClear();

      const notifier = getPathNotifier();
      notifier.notify('a', 1, 0);
      notifier.flushSync();
      await Promise.resolve();

      expect(send).toHaveBeenCalledTimes(1);
      const [action] = send.mock.calls[0];

      expect(action).toMatchObject({
        type: 'SignalTree/A.a',
        payload: 'A.a',
        meta: {
          source: 'path-notifier',
          paths: ['A.a'],
          timestamp: expect.any(Number),
        },
      });
      expect((action as any).meta.paths.some((p: string) => p.startsWith('B.'))).toBe(
        false
      );
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('aggregatedReduxInstance tears down when last tree disconnects (allows reconnect)', () => {
    resetPathNotifier();

    const originalWindow = (globalThis as any).window;
    const send = vi.fn();
    const connect = vi.fn(() => ({
      send,
      subscribe: (_listener: (message: unknown) => void) => void 0,
      disconnect: vi.fn(),
      unsubscribe: vi.fn(),
    }));

    (globalThis as any).window = {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect,
      },
    };

    try {
      const treeA = createMockTree();
      const treeB = createMockTree();

      const enhancedA = devTools({
        enabled: true,
        enableBrowserDevTools: true,
        treeName: 'A',
        aggregatedReduxInstance: { id: 'group-3', name: 'Group 3' },
      })(treeA);

      const enhancedB = devTools({
        enabled: true,
        enableBrowserDevTools: true,
        treeName: 'B',
        aggregatedReduxInstance: { id: 'group-3', name: 'Group 3' },
      })(treeB);

      expect(connect).toHaveBeenCalledTimes(1);

      enhancedA.disconnectDevTools();
      enhancedB.disconnectDevTools();

      // New tree with same group id should reconnect (group was cleaned up)
      const treeC = createMockTree();
      devTools({
        enabled: true,
        enableBrowserDevTools: true,
        treeName: 'C',
        aggregatedReduxInstance: { id: 'group-3', name: 'Group 3' },
      })(treeC);

      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
