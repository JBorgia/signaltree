// This file exists to type-check enhancer chaining inference via tsc
import { signalTree } from './signal-tree';
import { createEnhancer } from './types';

// Runtime smoke test to ensure enhancers apply and add expected properties
describe('enhancer types runtime smoke', () => {
  it('applies enhancers and results have A and B', () => {
    const addA = createEnhancer({ name: 'a', provides: ['A'] }, (t: any) => ({
      ...t,
      A: () => 'A',
    }));

    const addB = createEnhancer(
      { name: 'b', requires: ['A'], provides: ['B'] },
      (t: any) => ({ ...t, B: () => 'B' })
    );

    const tree = signalTree({ count: 0 });
    const enhanced = tree.with(addA, addB) as any;

    expect(enhanced.A).toBeDefined();
    expect(enhanced.B).toBeDefined();
    expect(enhanced.A()).toBe('A');
    expect(enhanced.B()).toBe('B');
  });
});
