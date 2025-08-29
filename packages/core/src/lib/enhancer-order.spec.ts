import { signalTree } from './signal-tree';
import { createEnhancer } from './types';

describe('enhancer ordering and cycles', () => {
  it('orders enhancers by provides/requires', () => {
    const addA = createEnhancer({ name: 'a', provides: ['A'] }, (tree: any) => {
      tree.A = () => 'A';
      return tree;
    });

    const addB = createEnhancer(
      { name: 'b', requires: ['A'], provides: ['B'] },
      (tree: any) => {
        tree.B = () => 'B';
        return tree;
      }
    );

    const tree = signalTree({ count: 0 });

    const enhanced = tree.with(addB, addA) as any;

    expect(enhanced.A).toBeDefined();
    expect(enhanced.B).toBeDefined();
    expect(enhanced.A()).toBe('A');
    expect(enhanced.B()).toBe('B');
  });

  it('falls back to provided order on cycle detection', () => {
    const e1 = createEnhancer(
      { name: 'e1', requires: ['c'], provides: ['a'] },
      (t: any) => ({ ...t, a: 1 })
    );

    const e2 = createEnhancer(
      { name: 'e2', requires: ['a'], provides: ['b'] },
      (t: any) => ({ ...t, b: 2 })
    );

    const e3 = createEnhancer(
      { name: 'e3', requires: ['b'], provides: ['c'] },
      (t: any) => ({ ...t, c: 3 })
    );

    const tree = signalTree({ count: 0 });

    // This set has a cycle: e1 -> requires c which is provided by e3 -> requires b -> provided by e2 -> requires a -> provided by e1
    const enhanced = tree.with(e1, e2, e3) as any;

    // Fallback should still apply enhancers but in provided order
    expect((enhanced as any).a).toBeDefined();
    expect((enhanced as any).b).toBeDefined();
    expect((enhanced as any).c).toBeDefined();
  });
});
