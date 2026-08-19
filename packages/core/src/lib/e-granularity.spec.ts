import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from './signal-tree';
import { entityMap } from './types';

/**
 * DERIVATION E — the collection null.
 *
 * The zero-state left exactly two candidate surviving functions: GRANULAR WRITE
 * (E-e) and GRANULAR OBSERVATION (E-f). Everything else a collection asks for is
 * already answered by ordinary canonical state or by frozen architecture.
 *
 * So the null is: can those two be obtained WITHOUT a collection primitive?
 *
 * Three shapes, same question. Recomputation is counted by a `computed` that
 * reads exactly one entry; if it re-runs when a DIFFERENT entry changes,
 * observation is not granular.
 */
type Row = { id: string; n: number };

describe('E — is granular write/observation obtainable without a collection primitive?', () => {
  it('ARRAY in ordinary state: observation is NOT granular', () => {
    const tree = signalTree({ rows: [{ id: 'a', n: 1 }, { id: 'b', n: 1 }] as Row[] });

    let runs = 0;
    const watchA = computed(() => {
      runs++;
      return tree.$.rows().find((r) => r.id === 'a')?.n;
    });
    expect(watchA()).toBe(1);
    const afterFirst = runs;

    // Change the OTHER row. An array write replaces the whole reference.
    tree.$.rows.set([{ id: 'a', n: 1 }, { id: 'b', n: 99 }]);
    watchA();

    expect(runs).toBe(afterFirst + 1); // recomputed for an unrelated change
  });

  it('RECORD keyed by id in ordinary state: observation IS granular', () => {
    const tree = signalTree({
      rows: {
        a: { id: 'a', n: 1 },
        b: { id: 'b', n: 1 },
      },
    });

    let runs = 0;
    const watchA = computed(() => {
      runs++;
      return tree.$.rows.a.n();
    });
    expect(watchA()).toBe(1);
    const afterFirst = runs;

    // Write the OTHER entry. Each nested position is its own signal, so the
    // observer of `a` never sees it.
    tree.$.rows.b.n.set(99);
    watchA();

    expect(runs).toBe(afterFirst); // NOT recomputed — granular
    expect(tree.$.rows.b.n()).toBe(99);
  });

  it('RECORD: granular WRITE too — one entry changes without rewriting the rest', () => {
    const tree = signalTree({
      rows: { a: { id: 'a', n: 1 }, b: { id: 'b', n: 1 } },
    });
    const beforeA = tree.$.rows.a();

    tree.$.rows.b.n.set(42);

    // `a` is untouched, by identity — not merely by value.
    expect(tree.$.rows.a()).toBe(beforeA);
  });

  it('entityMap: observation IS granular (the baseline it is compared against)', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    tree.$.rows.addMany([{ id: 'a', n: 1 }, { id: 'b', n: 1 }]);

    let runs = 0;
    const watchA = computed(() => {
      runs++;
      return tree.$.rows.byId('a')?.()?.n;
    });
    expect(watchA()).toBe(1);
    const afterFirst = runs;

    tree.$.rows.updateOne('b', { n: 99 });
    watchA();

    expect(runs).toBe(afterFirst);
  });
});

/**
 * E-d IN ITS HARDEST FORM — identity across a KEY CHANGE.
 *
 * Granular write and observation fell to an ordinary record. What a record
 * cannot obviously express is "the key changed but it is the SAME subject",
 * which is where the frozen SubjectId concept lives.
 */
describe('E — the 2x2: membership vs granularity', () => {
  it('ARRAY: dynamic membership YES (add and remove both work)', () => {
    const tree = signalTree({ rows: [{ id: 'a', n: 1 }] as Row[] });

    tree.$.rows.set([...tree.$.rows(), { id: 'b', n: 2 }]);
    expect(tree.$.rows().map((r) => r.id)).toEqual(['a', 'b']);

    tree.$.rows.set(tree.$.rows().filter((r) => r.id !== 'a'));
    expect(tree.$.rows().map((r) => r.id)).toEqual(['b']);
  });
});

describe('E — identity across a key change', () => {
  it('RECORD: membership is FIXED AT CONSTRUCTION — no add, no remove', () => {
    const tree = signalTree({
      rows: { a: { id: 'a', n: 1 } } as Record<string, { id: string; n: number }>,
    });

    // A nested accessor is not a settable signal; it is a callable that merges.
    expect(
      (tree.$.rows as unknown as Record<string, unknown>)['set']
    ).toBeUndefined();

    (tree.$.rows as unknown as (v: object) => void)({ b: { id: 'b', n: 1 } });

    const now = tree.$.rows() as Record<string, unknown>;

    // MEASURED: `b` was NOT added. The tree materialised `rows` with the keys
    // present at construction, and a merge write reaches only those positions.
    expect(now['b']).toBeUndefined();
    expect(now['a']).toEqual({ id: 'a', n: 1 });

    // So E-c (membership) is not merely awkward for a record — it is
    // INEXPRESSIBLE. Granular write and observation came for free; adding or
    // removing a member did not.
  });

  it('entityMap: changeId preserves the row across the key change', () => {
    const tree = signalTree({
      rows: entityMap<{ id: string; n: number }, string>({
        selectId: (r) => r.id,
      }),
    });
    tree.$.rows.addOne({ id: 'a', n: 1 });

    tree.$.rows.changeId('a', 'b');

    expect(tree.$.rows.ids()).toEqual(['b']);
    expect(tree.$.rows.byIdOrFail('b').n()).toBe(1);
  });
});
