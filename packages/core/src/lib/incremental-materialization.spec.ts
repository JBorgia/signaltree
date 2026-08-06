import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from './signal-tree';

/**
 * Incremental materialisation.
 *
 * `tree()` has to build a plain object out of a graph of signals — O(state).
 * Doing that on every read, when a write touched ONE leaf, is the
 * full-state-work-per-change anti-pattern the library exists to avoid.
 *
 * Each node memoises its materialisation in a `computed`, so a node rebuilds
 * only when a signal beneath it actually changed and clean subtrees come back
 * BY REFERENCE. Measured (read the whole state, by how much changed):
 *
 *   grid 100x100 (10k leaves)   all 1807.8us | 1 leaf 149.2us | none 0.044us
 *   grid 20x1000 (20k leaves)   all 5066.4us | 1 leaf 311.6us | none 0.045us
 *
 * These tests pin the two properties that make that safe: reference sharing is
 * real, and it never lets a snapshot go stale or alias live state.
 */
describe('incremental materialisation', () => {
  const grid = (rows: number, cols: number) => {
    const o: Record<string, Record<string, number>> = {};
    for (let r = 0; r < rows; r++) {
      const g: Record<string, number> = {};
      for (let c = 0; c < cols; c++) g['c' + c] = c;
      o['r' + r] = g;
    }
    return o;
  };

  it('returns the identical object when nothing changed', () => {
    const tree = signalTree({ a: { x: 1 }, b: { y: 2 } });
    expect(tree()).toBe(tree());
  });

  it('shares untouched subtrees and replaces touched ones', () => {
    const tree = signalTree(grid(3, 3));
    const before = tree();
    tree.$.r1.c1.set(42);
    const after = tree();

    expect(after).not.toBe(before);
    expect(after.r1).not.toBe(before.r1);
    expect(after.r0).toBe(before.r0);
    expect(after.r2).toBe(before.r2);
  });

  it('still observes every write', () => {
    const tree = signalTree(grid(3, 3));
    tree();
    tree.$.r1.c1.set(42);
    expect(tree().r1.c1).toBe(42);
    tree.$.r0.c0.set(7);
    expect(tree().r0.c0).toBe(7);
    expect(tree().r1.c1).toBe(42);
  });

  it('does not rebuild when a write is a no-op', () => {
    const tree = signalTree({ a: { x: 1 } });
    const before = tree();
    tree.$.a.x.set(1); // same value — equality short-circuits
    expect(tree()).toBe(before);
  });

  it('keeps an old snapshot isolated from later writes', () => {
    const tree = signalTree({ cfg: { list: [1, 2, 3] } });
    const snapshot = tree();
    tree.$.cfg.list.set([9]);

    expect(snapshot.cfg.list).toEqual([1, 2, 3]);
    expect(tree().cfg.list).toEqual([9]);
  });

  it('does not alias a leaf object value into the snapshot', () => {
    // The defensive copy in unwrap's isSignal branch is load-bearing: without
    // it a snapshot would hand out a reference to live state.
    const value = { nested: { n: 1 } };
    const tree = signalTree({ obj: { held: value } });
    const snapshot = tree() as { obj: { held: typeof value } };
    expect(snapshot.obj.held).not.toBe(value);
    expect(snapshot.obj.held).toEqual(value);
  });

  it('propagates through deep nesting', () => {
    const tree = signalTree({ a: { b: { c: { d: { e: 1 } } } } });
    const before = tree();
    tree.$.a.b.c.d.e.set(2);
    const after = tree();

    expect(after.a.b.c.d.e).toBe(2);
    expect(after.a).not.toBe(before.a);
    expect(before.a.b.c.d.e).toBe(1);
  });

  it('stays reactive when read inside a computed', () => {
    const tree = signalTree({ a: { x: 1 }, b: { y: 10 } });
    let runs = 0;
    const total = computed(() => {
      runs++;
      const s = tree();
      return s.a.x + s.b.y;
    });

    expect(total()).toBe(11);
    expect(runs).toBe(1);

    tree.$.a.x.set(5);
    expect(total()).toBe(15);
    expect(runs).toBe(2);
  });

  it('freezes snapshots in dev so mutation cannot corrupt the cache', () => {
    const tree = signalTree({ a: { x: 1 } });
    const snapshot = tree();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.a)).toBe(true);
    expect(() => {
      (snapshot as unknown as Record<string, unknown>)['a'] = 'nope';
    }).toThrow(TypeError);
    // The cache is intact.
    expect(tree().a.x).toBe(1);
  });

  it('reads the whole state in constant time while nothing changes', () => {
    const tree = signalTree(grid(60, 60));
    tree();
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) tree();
    const elapsed = performance.now() - t0;
    // A full rebuild of 3,600 leaves is milliseconds; 2,000 of them would be
    // seconds. Memoised reads are ~0.04us each.
    expect(elapsed).toBeLessThan(100);
  });

  it('rebuilds only the touched row of a wide grid', () => {
    const tree = signalTree(grid(50, 50));
    const before = tree();
    tree.$.r25.c25.set(999);
    const after = tree();

    const shared = Object.keys(after).filter(
      (k) =>
        (after as Record<string, unknown>)[k] ===
        (before as Record<string, unknown>)[k]
    );
    expect(shared).toHaveLength(49);
    expect(after.r25.c25).toBe(999);
  });
});
