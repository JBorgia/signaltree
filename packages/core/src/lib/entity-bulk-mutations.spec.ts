import { describe, expect, it, vi } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';

/**
 * The bulk mutation surface and the tap/intercept hooks.
 *
 * `entity-signal.ts` sat at 56.6% statement coverage — the lowest of the
 * load-bearing files, against 88.8% for `signal-tree.ts` and 96% for
 * `entity-map.ts` — and the uncovered region was almost exactly this: every
 * `*Many` method, the predicate variants, and both hook registries. They are
 * ordinary CRUD, which is precisely why nobody wrote tests for them, and they
 * are also where the per-entity signal bookkeeping is easiest to get subtly
 * wrong.
 *
 * The bookkeeping is the point of most of these assertions: after any bulk
 * mutation a HELD node must still resolve, and rows that were not part of the
 * mutation must not have been touched.
 */
type Row = { id: number; name: string; done: boolean };

const rows = (): Row[] => [
  { id: 1, name: 'a', done: false },
  { id: 2, name: 'b', done: true },
  { id: 3, name: 'c', done: false },
];

const mk = (data: Row[] = rows()) => {
  const tree = signalTree({
    r: entityMap<Row, number>({ selectId: (x) => x.id }),
  });
  tree.$.r.setAll(data);
  return tree;
};
const ids = (t: ReturnType<typeof mk>) => t.$.r.ids().join(',');

describe('addMany', () => {
  it('adds all of them, in order', () => {
    const t = mk();
    t.$.r.addMany([
      { id: 4, name: 'd', done: false },
      { id: 5, name: 'e', done: false },
    ]);
    expect(ids(t)).toBe('1,2,3,4,5');
    expect(t.$.r.count()).toBe(5);
  });

  it('returns the ids it assigned', () => {
    const t = mk();
    const assigned = t.$.r.addMany([{ id: 4, name: 'd', done: false }]);
    expect(assigned).toEqual([4]);
  });

  it('adding an empty array is a no-op', () => {
    const t = mk();
    expect(t.$.r.addMany([])).toEqual([]);
    expect(t.$.r.count()).toBe(3);
  });

  it('a duplicate id throws in the default strict mode', () => {
    const t = mk();
    expect(() => t.$.r.addMany([{ id: 2, name: 'dup', done: false }])).toThrow();
  });

  it('leaves existing rows untouched — a held node survives', () => {
    const t = mk();
    const held = t.$.r.byId(2);
    t.$.r.addMany([{ id: 9, name: 'i', done: false }]);
    expect(held?.().name).toBe('b');
    expect(t.$.r.byId(2)).toBe(held);
  });
});

describe('updateMany / updateWhere', () => {
  it('updateMany applies the same change to each id', () => {
    const t = mk();
    t.$.r.updateMany([1, 3], { done: true });
    expect(t.$.r.byId(1)?.().done).toBe(true);
    expect(t.$.r.byId(3)?.().done).toBe(true);
  });

  it('updateMany leaves other rows alone', () => {
    const t = mk();
    t.$.r.updateMany([1], { name: 'zz' });
    expect(t.$.r.byId(2)?.().name).toBe('b');
  });

  it('updateMany with an empty id list is a no-op', () => {
    const t = mk();
    t.$.r.updateMany([], { done: true });
    expect(t.$.r.all().filter((x) => x.done)).toHaveLength(1);
  });

  it('updateWhere applies to matches and returns the count', () => {
    const t = mk();
    const n = t.$.r.updateWhere((x) => !x.done, { name: 'touched' });
    expect(n).toBe(2);
    expect(t.$.r.byId(1)?.().name).toBe('touched');
    expect(t.$.r.byId(3)?.().name).toBe('touched');
    expect(t.$.r.byId(2)?.().name).toBe('b');
  });

  it('updateWhere matching nothing returns 0 and changes nothing', () => {
    const t = mk();
    expect(t.$.r.updateWhere(() => false, { name: 'x' })).toBe(0);
    expect(t.$.r.all().map((x) => x.name)).toEqual(['a', 'b', 'c']);
  });

  it('a held node sees an updateMany that includes it', () => {
    const t = mk();
    const held = t.$.r.byId(1);
    t.$.r.updateMany([1], { name: 'updated' });
    expect(held?.().name).toBe('updated');
  });
});

describe('removeMany / removeWhere / removeOne', () => {
  it('removeOne removes exactly one', () => {
    const t = mk();
    t.$.r.removeOne(2);
    expect(ids(t)).toBe('1,3');
  });

  it('removeMany removes all the listed ids', () => {
    const t = mk();
    t.$.r.removeMany([1, 3]);
    expect(ids(t)).toBe('2');
  });

  it('removeMany THROWS for an id that is not present', () => {
    // Documenting the real contract, which is strict rather than forgiving. I
    // assumed the opposite writing this test and the assertion caught it.
    const t = mk();
    expect(() => t.$.r.removeMany([1, 999])).toThrow(/not found/);
  });

  it('...and that failure is ATOMIC — nothing is removed', () => {
    // The more valuable half. Ids are collected and validated before anything
    // is deleted, so a bad id in the middle of a batch cannot leave the
    // collection half-mutated.
    const t = mk();
    expect(() => t.$.r.removeMany([1, 999])).toThrow();
    expect(ids(t)).toBe('1,2,3');
  });

  it('removeWhere removes matches and returns the count', () => {
    const t = mk();
    expect(t.$.r.removeWhere((x) => !x.done)).toBe(2);
    expect(ids(t)).toBe('2');
  });

  it('removeWhere matching nothing returns 0', () => {
    const t = mk();
    expect(t.$.r.removeWhere(() => false)).toBe(0);
    expect(t.$.r.count()).toBe(3);
  });

  it('a node held for a REMOVED row reads undefined, and the rest survive', () => {
    const t = mk();
    const gone = t.$.r.byId(1);
    const kept = t.$.r.byId(2);
    t.$.r.removeMany([1]);
    expect(gone?.()).toBeUndefined();
    expect(kept?.().name).toBe('b');
  });

  it('clear and removeAll both empty the collection', () => {
    const a = mk();
    a.$.r.clear();
    expect(a.$.r.count()).toBe(0);

    const b = mk();
    b.$.r.removeAll();
    expect(b.$.r.count()).toBe(0);
  });
});

describe('upsertOne / upsertMany', () => {
  it('upsertOne adds when absent', () => {
    const t = mk();
    t.$.r.upsertOne({ id: 9, name: 'i', done: false });
    expect(t.$.r.byId(9)?.().name).toBe('i');
    expect(t.$.r.count()).toBe(4);
  });

  it('upsertOne updates when present, without moving it', () => {
    const t = mk();
    t.$.r.upsertOne({ id: 2, name: 'B', done: true });
    expect(t.$.r.byId(2)?.().name).toBe('B');
    expect(ids(t)).toBe('1,2,3');
    expect(t.$.r.count()).toBe(3);
  });

  it('upsertMany handles a mix of new and existing in one call', () => {
    const t = mk();
    t.$.r.upsertMany([
      { id: 2, name: 'B', done: true },
      { id: 7, name: 'g', done: false },
    ]);
    expect(t.$.r.byId(2)?.().name).toBe('B');
    expect(t.$.r.byId(7)?.().name).toBe('g');
    expect(t.$.r.count()).toBe(4);
  });

  it('upsertMany with an empty array is a no-op', () => {
    const t = mk();
    expect(t.$.r.upsertMany([])).toEqual([]);
    expect(t.$.r.count()).toBe(3);
  });
});

describe('tap hooks observe without changing anything', () => {
  it('fires onAdd, onUpdate and onRemove', () => {
    const t = mk();
    const onAdd = vi.fn();
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    t.$.r.tap({ onAdd, onUpdate, onRemove });

    t.$.r.addOne({ id: 4, name: 'd', done: false });
    t.$.r.updateOne(4, { name: 'D' });
    t.$.r.removeOne(4);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('the returned function unsubscribes', () => {
    const t = mk();
    const onAdd = vi.fn();
    const off = t.$.r.tap({ onAdd });

    t.$.r.addOne({ id: 4, name: 'd', done: false });
    off();
    t.$.r.addOne({ id: 5, name: 'e', done: false });

    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe('intercept hooks can transform and block', () => {
  it('transform rewrites the entity being added', () => {
    const t = mk();
    t.$.r.intercept({
      onAdd: (entity, ctx) => ctx.transform({ ...entity, name: 'rewritten' }),
    });

    t.$.r.addOne({ id: 4, name: 'original', done: false });

    expect(t.$.r.byId(4)?.().name).toBe('rewritten');
  });

  it('block prevents the add, and the collection is unchanged', () => {
    const t = mk();
    t.$.r.intercept({ onAdd: (_e, ctx) => ctx.block('not allowed') });

    expect(() => t.$.r.addOne({ id: 4, name: 'd', done: false })).toThrow(
      /not allowed/
    );
    expect(t.$.r.count()).toBe(3);
  });

  it('the returned function unsubscribes', () => {
    const t = mk();
    const off = t.$.r.intercept({ onAdd: (_e, ctx) => ctx.block('no') });
    off();

    expect(() => t.$.r.addOne({ id: 4, name: 'd', done: false })).not.toThrow();
    expect(t.$.r.count()).toBe(4);
  });
});
