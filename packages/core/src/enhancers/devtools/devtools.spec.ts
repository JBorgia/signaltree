import { describe, expect, it } from 'vitest';

import { devTools, enableDevTools, fullDevTools, productionDevTools } from './devtools';

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
});
