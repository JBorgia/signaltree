import { createEnhancer } from './enhancers';
import { signalTree } from './signal-tree';

// This file exists to type-check enhancer chaining inference via tsc
// Runtime smoke test to ensure enhancers apply and add expected properties
describe('enhancer types runtime smoke', () => {
  it('applies enhancers and results have A and B', () => {
    const addA = createEnhancer(
      { name: 'a', provides: ['A'] },
      (t: Record<string, unknown>) => ({
        ...t,
        A: () => 'A',
      })
    );

    const addB = createEnhancer(
      { name: 'b', requires: ['A'], provides: ['B'] },
      (t: Record<string, unknown>) => ({ ...t, B: () => 'B' })
    );

    const tree = signalTree({ count: 0 });
    const enhanced = tree.with(addA, addB) as unknown;

    expect((enhanced as { A: () => string }).A).toBeDefined();
    expect((enhanced as { B: () => string }).B).toBeDefined();
    expect((enhanced as { A: () => string }).A()).toBe('A');
    expect((enhanced as { B: () => string }).B()).toBe('B');
  });
});
