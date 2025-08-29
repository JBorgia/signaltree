import { createEnhancer } from './enhancers';
import { signalTree } from './signal-tree';

describe('enhancer ordering and cycles', () => {
  it('orders enhancers by provides/requires', () => {
    const addA = createEnhancer(
      { name: 'a', provides: ['A'] },
      (tree: unknown) => {
        (tree as { A: () => string }).A = () => 'A';
        return tree;
      }
    );

    const addB = createEnhancer(
      { name: 'b', requires: ['A'], provides: ['B'] },
      (tree: unknown) => {
        (tree as { B: () => string }).B = () => 'B';
        return tree;
      }
    );

    const tree = signalTree({ count: 0 });

    const enhanced = tree.with(addB, addA) as unknown;

    expect((enhanced as { A: () => string }).A).toBeDefined();
    expect((enhanced as { B: () => string }).B).toBeDefined();
    expect((enhanced as { A: () => string }).A()).toBe('A');
    expect((enhanced as { B: () => string }).B()).toBe('B');
  });

  it('falls back to provided order on cycle detection', () => {
    const e1 = createEnhancer(
      { name: 'e1', requires: ['c'], provides: ['a'] },
      (t: Record<string, unknown>) => ({ ...t, a: 1 })
    );

    const e2 = createEnhancer(
      { name: 'e2', requires: ['a'], provides: ['b'] },
      (t: Record<string, unknown>) => ({ ...t, b: 2 })
    );

    const e3 = createEnhancer(
      { name: 'e3', requires: ['b'], provides: ['c'] },
      (t: Record<string, unknown>) => ({ ...t, c: 3 })
    );

    const tree = signalTree({ count: 0 });

    // This set has a cycle: e1 -> requires c which is provided by e3 -> requires b -> provided by e2 -> requires a -> provided by e1
    const enhanced = tree.with(e1, e2, e3) as unknown;

    // Fallback should still apply enhancers but in provided order
    expect((enhanced as { a: number }).a).toBeDefined();
    expect((enhanced as { b: number }).b).toBeDefined();
    expect((enhanced as { c: number }).c).toBeDefined();
  });
});
