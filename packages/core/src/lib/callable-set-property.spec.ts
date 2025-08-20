import { signalTree } from './signal-tree';

describe('callable proxy with user-defined set property', () => {
  it('preserves access to user state property named "set" without shadowing', () => {
    const tree = signalTree({ set: 5, other: 1 }, { debugMode: true });
    // Root method tree.set should be a function
    expect(typeof (tree as unknown as { set: unknown }).set).toBe('function');
    // Property access through callable proxy should yield value for the state key 'set'
    const value = (tree.$ as any).set();
    expect(value).toBe(5);
    // Update via tree.update deep patch
    tree.update(() => ({ set: 10 }));
    expect((tree.$ as any).set()).toBe(10);
    // Ensure root set() method still works to apply deep partial
    tree.set({ other: 2 });
    expect(tree.unwrap().other).toBe(2);
    // Original property still intact
    expect((tree.$ as any).set()).toBe(10);
  });
});
