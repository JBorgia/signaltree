import { describe, expect, it } from 'vitest';

import { linked } from './linked';
import { signalTree } from './signal-tree';

interface Opt {
  id: number;
}

describe('linked()', () => {
  it('derives from source and is writable', () => {
    const tree = signalTree({ options: [{ id: 1 }, { id: 2 }] as Opt[] }).derived(
      ($) => ({
        selected: linked({
          source: () => $.options(),
          computation: (opts, prev): Opt =>
          opts.find((o) => o.id === prev?.value?.id) ?? opts[0],
        }),
      })
    );

    expect(tree.$.selected()).toEqual({ id: 1 }); // derived: first option
    tree.$.selected.set({ id: 2 }); // writable override
    expect(tree.$.selected()).toEqual({ id: 2 });
  });

  it('re-derives (sticky selection) when the source changes', () => {
    const tree = signalTree({
      options: [{ id: 1 }, { id: 2 }, { id: 3 }] as Opt[],
    }).derived(($) => ({
      selected: linked({
        source: () => $.options(),
        computation: (opts, prev): Opt =>
          opts.find((o) => o.id === prev?.value?.id) ?? opts[0],
      }),
    }));

    tree.$.selected.set({ id: 3 }); // user picks id 3
    expect(tree.$.selected()).toEqual({ id: 3 });

    // Refresh without id 3 → falls back to first
    tree.$.options.set([{ id: 1 }, { id: 2 }]);
    expect(tree.$.selected()).toEqual({ id: 1 });

    // Pick id 2, then refresh keeping id 2 → sticky
    tree.$.selected.set({ id: 2 });
    tree.$.options.set([{ id: 2 }, { id: 9 }]);
    expect(tree.$.selected()).toEqual({ id: 2 });
  });

  it('simple form: writable-derived without an explicit source', () => {
    const tree = signalTree({ count: 2 }).derived(($) => ({
      doubled: linked(() => $.count() * 2),
    }));

    expect(tree.$.doubled()).toBe(4); // derived
    tree.$.doubled.set(100); // override
    expect(tree.$.doubled()).toBe(100);

    tree.$.count.set(5); // source change re-derives, discarding the override
    expect(tree.$.doubled()).toBe(10);
  });

  it('also works as a self-contained signal in the state literal', () => {
    // No cross-path source needed → usable directly in the literal (createSignalStore
    // preserves existing signals). Cross-path sources require .derived() for `$`.
    const tree = signalTree({ n: linked(() => 7) });
    expect(tree.$.n()).toBe(7);
    tree.$.n.set(9);
    expect(tree.$.n()).toBe(9);
  });

  it('honors a custom equal — no override churn when value is structurally equal', () => {
    let computeCount = 0;
    const tree = signalTree({ q: 'a' }).derived(($) => ({
      box: linked<string, { v: string }>({
        source: () => $.q(),
        computation: (q) => {
          computeCount++;
          return { v: q };
        },
        equal: (a, b) => a.v === b.v,
      }),
    }));

    const first = tree.$.box();
    expect(first).toEqual({ v: 'a' });
    // Set a structurally-equal but new-reference object → equal() suppresses the change
    tree.$.box.set({ v: 'a' });
    expect(tree.$.box()).toBe(first); // same reference retained (equal short-circuit)
    expect(computeCount).toBeGreaterThanOrEqual(1);
  });

  it('round-trips through snapshot/restore as a plain writable signal', () => {
    const tree = signalTree({ count: 3 }).derived(($) => ({
      doubled: linked(() => $.count() * 2),
    }));

    expect(tree.$.doubled()).toBe(6);
    tree.$.doubled.set(50); // override
    const snap = tree(); // snapshot reads the linked value like any signal
    expect(snap).toEqual({ count: 3, doubled: 50 });

    // Writing the whole tree restores the override (linked is writable)
    tree({ count: 3, doubled: 99 } as typeof snap);
    expect(tree.$.doubled()).toBe(99);
  });
});
