import { signalTree } from './signal-tree';

describe('deep partial merge semantics', () => {
  it('replaces arrays and built-ins, merges objects sparsely, and preserves unspecified siblings', () => {
    const initialDate = new Date(0);
    const tree = signalTree(
      {
        list: [1, 2, 3],
        meta: { date: initialDate, nested: { value: 1, untouched: 5 } },
      },
      { debugMode: true }
    );

    tree.update(() => ({
      list: [1, 2, 3, 4], // expect replacement
      meta: { date: new Date(1000) }, // sparse: nested.value preserved
    }));

    const unwrapped = tree.unwrap();
    expect(unwrapped.list).toEqual([1, 2, 3, 4]);
    expect(unwrapped.meta.date.getTime()).toBe(1000);
    expect(unwrapped.meta.nested.value).toBe(1); // preserved
    expect(unwrapped.meta.nested.untouched).toBe(5); // preserved
  });
});
