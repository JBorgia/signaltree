import { computed } from '@angular/core';
import { signalTree } from './signal-tree';
import { stored } from './markers/stored';

describe('F4: tree() must not lock out .derived()', () => {
  it('allows .derived() after a read through tree()', () => {
    const tree = signalTree({ n: 1 });
    expect((tree() as { n: number }).n).toBe(1);

    const extended = tree.derived(($) => ({ dbl: computed(() => $.n() * 2) }));
    expect(extended.$.dbl()).toBe(2);
  });

  it('allows .derived() after a write through tree()', () => {
    const tree = signalTree({ n: 1 });
    (tree as unknown as (v: object) => void)({ n: 5 });

    const extended = tree.derived(($) => ({ dbl: computed(() => $.n() * 2) }));
    expect(extended.$.dbl()).toBe(10);
  });

  it('still materializes markers when read via tree() first', () => {
    const m = new Map<string, string>();
    const st: Storage = {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => m.set(k, v),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
      get length() {
        return m.size;
      },
      key: (i) => Array.from(m.keys())[i] ?? null,
    };
    const tree = signalTree({ theme: stored('f4', 'light', { storage: st }) });
    expect((tree() as { theme: string }).theme).toBe('light');
    expect(JSON.stringify(tree())).not.toContain('defaultValue');
  });
});
