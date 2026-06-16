import { computed } from '@angular/core';

import { entityMap } from '../index';
import { signalTree } from './signal-tree';

/**
 * SIGNALTREE REACTIVITY CONTRACT
 *
 * SignalTree's defensible claim over raw signals / SignalStore is *bounded
 * fan-out*: an update recomputes only the observers that actually depend on
 * what changed. This suite turns that claim into an enforced, regression-gated
 * invariant by measuring, for each reactive surface, how many observer bodies
 * re-run when one thing changes.
 *
 * Two contractual tiers:
 *   - BODY-GRANULAR: an UNRELATED update must NOT recompute the observer
 *     (fan-out 0 for the unrelated reader). This is the moat.
 *   - COLLECTION-LEVEL: a surface derived from a whole collection MUST
 *     recompute on any change to that collection (correct, not a leak) — we
 *     assert it so the boundary between the two tiers is explicit and locked.
 *
 * The counter lives inside the computed that establishes the dependency, so we
 * measure body recompute (wasted work), not the weaker downstream-propagation
 * isolation that computed-equality gives any signal for free.
 */
function track<T>(read: () => T) {
  let runs = 0;
  const c = computed(() => {
    runs++;
    return read();
  });
  return { runs: () => runs, read: () => c() };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRows = any;

describe('SignalTree reactivity contract', () => {
  describe('BODY-GRANULAR — an unrelated update must not recompute', () => {
    it('nested leaf: a sibling leaf update does not recompute the reader', () => {
      const tree = signalTree({ a: { v: 0 }, b: { v: 0 } });
      const t = track(() => tree.$.a.v());
      t.read();
      expect(t.runs()).toBe(1);
      tree.$.b.v.set(1); // unrelated sibling
      t.read();
      expect(t.runs()).toBe(1);
    });

    it('deep leaf: updating one deep path does not recompute a reader of another path', () => {
      const tree = signalTree({ x: { y: { z: 0 } }, p: { q: { r: 0 } } });
      const t = track(() => tree.$.x.y.z());
      t.read();
      tree.$.p.q.r.set(5); // unrelated deep path
      t.read();
      expect(t.runs()).toBe(1);
    });

    it('derived: recomputes only when its actual source changes', () => {
      const tree = signalTree({ a: 0, b: 0 }).derived(($) => ({
        da: computed(() => $.a() * 2),
      }));
      const t = track(() => (tree.$ as { da: () => number }).da());
      t.read();
      expect(t.runs()).toBe(1);
      tree.$.b.set(1); // not a source of `da`
      t.read();
      expect(t.runs()).toBe(1);
      tree.$.a.set(1); // actual source
      t.read();
      expect(t.runs()).toBe(2);
    });

    it('entityMap.byId: updating another entity does not recompute a per-entity reader', () => {
      const tree = signalTree({
        rows: entityMap<{ id: number; v: number }, number>(),
      });
      const rows = tree.$.rows as AnyRows;
      rows.addMany([
        { id: 1, v: 0 },
        { id: 2, v: 0 },
      ]);
      const t = track(() => rows.byId(1)?.v());
      t.read();
      expect(t.runs()).toBe(1);
      rows.updateOne(2, { v: 9 }); // different entity
      t.read();
      expect(t.runs()).toBe(1);
    });
  });

  describe('COLLECTION-LEVEL — must recompute on any collection change (correct)', () => {
    it('all() recomputes when any entity changes', () => {
      const tree = signalTree({
        rows: entityMap<{ id: number; v: number }, number>(),
      });
      const rows = tree.$.rows as AnyRows;
      rows.addMany([
        { id: 1, v: 0 },
        { id: 2, v: 0 },
      ]);
      const t = track(() => rows.all().length);
      t.read();
      rows.updateOne(2, { v: 9 });
      t.read();
      expect(t.runs()).toBe(2); // collection-derived
    });

    it('where() recomputes when any entity changes', () => {
      const tree = signalTree({
        rows: entityMap<{ id: number; active: boolean }, number>(),
      });
      const rows = tree.$.rows as AnyRows;
      rows.addMany([
        { id: 1, active: true },
        { id: 2, active: false },
      ]);
      const isActive = (r: { active: boolean }) => r.active;
      const t = track(() => rows.where(isActive)().length);
      t.read();
      rows.updateOne(2, { active: true });
      t.read();
      expect(t.runs()).toBe(2);
    });

    it('computed slice recomputes on any entity change', () => {
      const tree = signalTree({
        users: entityMap<{ id: number; active: boolean }, number>().computed(
          'active',
          (all) => all.filter((u) => u.active)
        ),
      });
      const users = tree.$.users as AnyRows;
      users.addMany([
        { id: 1, active: true },
        { id: 2, active: false },
      ]);
      const t = track(() => users.active().length);
      t.read();
      users.updateOne(2, { active: true });
      t.read();
      expect(t.runs()).toBe(2);
    });
  });
});
