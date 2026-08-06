import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { form } from './markers';
import { signalTree } from './signal-tree';
import { unwrap } from './utils';

/**
 * ONE BUILDER.
 *
 * A tree node is reachable two ways — as the accessor (`tree.$.a`) and as the
 * raw store the accessor wraps — and `memoKey()` collapses both onto a single
 * memo cell. For a while there were also two BUILDERS behind that one cell:
 * `unwrap()` walked the store, `buildFromAccessor()` walked the accessor, and
 * whichever entry point read a node first decided its snapshot permanently.
 *
 * They had already drifted. Only the accessor builder carried ST2008; only the
 * store builder copied symbol keys. So the diagnostic for silently-dropped
 * markers fired or not depending on read order, and the two builders could
 * disagree on what a snapshot contained.
 *
 * These tests pin the properties that made collapsing them to the STORE
 * direction the correct merge, rather than harmonising the two.
 */
describe('one builder: snapshots do not depend on how a node is reached', () => {
  let err: ReturnType<typeof vi.spyOn>;

  const countST2008 = () =>
    err.mock.calls.filter((c) => String(c[0]).includes('ST2008')).length;

  beforeEach(() => {
    err = vi.spyOn(console, 'error').mockImplementation(() => {
      /* silence */
    });
  });
  afterEach(() => err.mockRestore());

  const treeWithNestedForm = () =>
    signalTree({ grp: { g: form({ initial: { b: 2 } }), n: 1 } });

  it('ST2008 fires the same whether the store or the accessor is read first', () => {
    // The regression test for the shared memo cell. Before the merge this was
    // 0 in one order and 1 in the other — same tree, same reads.
    const storeFirst = treeWithNestedForm();
    void storeFirst();
    const afterStoreFirst = countST2008();

    err.mockClear();

    const accessorFirst = treeWithNestedForm();
    void unwrap((accessorFirst.$ as unknown as { grp: unknown }).grp);
    const afterAccessorFirst = countST2008();

    expect(afterStoreFirst).toBeGreaterThan(0);
    expect(afterAccessorFirst).toBe(afterStoreFirst);
  });

  it('produces the same snapshot whichever entry point populates the memo', () => {
    const a = treeWithNestedForm();
    const viaStore = JSON.stringify(a().grp);
    const viaAccessorSecond = JSON.stringify(
      unwrap((a.$ as unknown as { grp: unknown }).grp)
    );

    const b = treeWithNestedForm();
    const viaAccessor = JSON.stringify(
      unwrap((b.$ as unknown as { grp: unknown }).grp)
    );
    const viaStoreSecond = JSON.stringify(b().grp);

    expect(viaStore).toBe(viaAccessor);
    expect(viaAccessorSecond).toBe(viaStoreSecond);
    expect(viaStore).toBe(viaStoreSecond);
  });

  it('reports a marker that is an unbranded callable, at any depth [ST2008]', () => {
    // `form()` materialises to a callable carrying neither Angular's SIGNAL
    // brand nor SignalTree:NodeAccessor, so every walker skips its VALUE. That
    // is still true — this pins that it is no longer SILENT.
    signalTree({
      top: form({ initial: { a: 1 } }),
      grp: { nested: form({ initial: { b: 2 } }) },
    })();

    const msg = err.mock.calls.map((c) => String(c[0])).join('\n');
    expect(msg).toContain('ST2008');
    expect(msg).toContain('top');
    expect(msg).toContain('nested');
  });
});

describe('one builder: the properties that made "build from the store" correct', () => {
  it('never copies a SignalTree brand into a snapshot', () => {
    // An accessor owns `SignalTree:NodeAccessor` and `SignalTree:NodeStore`,
    // and the latter's VALUE IS THE BACKING STORE — copying it would drag a
    // full walk of the store into the payload under a symbol key.
    //
    // Descriptors are no defence: Object.getOwnPropertySymbols returns
    // non-enumerable symbols too, so `enumerable: false` on a brand does
    // nothing. Stores carry no own symbols, which is why the store direction is
    // safe by construction.
    const tree = signalTree({ grp: { n: 1 }, leaf: 2 });

    const symbolsIn = (o: unknown): string[] => {
      if (!o || typeof o !== 'object') return [];
      return Object.getOwnPropertySymbols(o)
        .map(String)
        .concat(
          ...Object.values(o as Record<string, unknown>).map((v) =>
            symbolsIn(v)
          )
        );
    };

    expect(symbolsIn(tree())).toEqual([]);
    expect(
      symbolsIn(unwrap((tree.$ as unknown as { grp: unknown }).grp))
    ).toEqual([]);
  });

  it('round-trips state stored under length, name and prototype', () => {
    // The accessor builder needed a by-value skip for these because an accessor
    // IS a function and owns them as intrinsics. A store is a plain object and
    // never does, so dropping that skip is safe — but only if these still come
    // back, and a name-based skip once deleted real state here.
    const tree = signalTree({
      cfg: { length: 3, name: 'x', prototype: 'p' },
      n: 1,
    });

    expect(tree()).toEqual({
      cfg: { length: 3, name: 'x', prototype: 'p' },
      n: 1,
    });
    expect(unwrap((tree.$ as unknown as { cfg: unknown }).cfg)).toEqual({
      length: 3,
      name: 'x',
      prototype: 'p',
    });
  });

  it('keeps structural sharing: an unchanged subtree is reference-identical', () => {
    // This is the deterministic form of the 13.5.0 perf win. The store builder
    // takes a child's materialisation BY REFERENCE (`value()`); the accessor
    // builder re-copied it through `unwrap()`, which is what destroyed sharing.
    // If this ever goes red, a one-leaf write has started costing O(state)
    // again — and that is visible here long before it shows up in a benchmark.
    const rows: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 20; i++) rows['r' + i] = { a: i, b: i };
    const tree = signalTree(rows);

    const before = tree() as Record<string, unknown>;
    (tree.$ as unknown as Record<string, { a: { set(v: number): void } }>)[
      'r0'
    ].a.set(999);
    const after = tree() as Record<string, unknown>;

    expect(after).not.toBe(before); // the root rebuilt
    expect(after['r0']).not.toBe(before['r0']); // the touched subtree rebuilt
    for (let i = 1; i < 20; i++) {
      expect(after['r' + i]).toBe(before['r' + i]); // everything else shared
    }
  });
});
