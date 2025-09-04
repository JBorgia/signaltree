import { createDevTree } from './presets';
import { signalTree } from '@signaltree/core';

describe('createDevTree preset', () => {
  it('returns config and enhancer and enhancer is callable', () => {
    const dev = createDevTree();
    expect(dev).toBeDefined();
    expect(typeof dev.enhancer).toBe('function');

    const tree = signalTree({ count: 0 });
    // Apply composed enhancer (no-op if packages not present)
    const enhancerFn = dev.enhancer as (t: unknown) => unknown;
    const enhanced = enhancerFn(tree);
    expect(enhanced).toBeDefined();
  });
});
