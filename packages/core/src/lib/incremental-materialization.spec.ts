import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { visitTree } from './internals/visit-tree';
import { getPositionRegistry } from './internals/position-registry';
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
    // Asserted as a RATIO against this machine's own full-rebuild cost, not as
    // a wall-clock budget. An absolute threshold here made the suite flaky:
    // it passed alone and failed when all 11 projects ran in parallel, which
    // is a property of the CI box rather than of the code.
    const tree = signalTree(grid(60, 60));
    tree();

    const dirtyAll = () => {
      for (let r = 0; r < 60; r++) tree.$['r' + r]['c0'].set(Math.random());
    };

    dirtyAll();
    const r0 = performance.now();
    tree();
    const oneRebuild = performance.now() - r0;

    const c0 = performance.now();
    for (let i = 0; i < 2000; i++) tree();
    const memoised = performance.now() - c0;

    // 2,000 memoised reads must cost less than 5 full rebuilds. Measured ratio
    // is ~0.04us vs ~1,800us, so this has four orders of magnitude of headroom
    // and only fails if memoisation stops working entirely.
    expect(memoised).toBeLessThan(oneRebuild * 5);
  });

  it('never memoises a non-reactive object — it would be stale forever', async () => {
    // `snapshotState()` is public and takes anything. Memoising a plain object
    // would wrap it in a computed with NO dependencies, so it could never
    // invalidate: the first read would be returned for the life of the process.
    // Caught by devtools' mock-tree tests, which hand it a plain object and
    // mutate it in place — but it would have hit real callers just as hard.
    const { snapshotState } = await import('./utils');
    const plain = { a: 1 } as Record<string, unknown>;

    expect(snapshotState(plain as never)).toEqual({ a: 1 });
    plain['a'] = 2;
    expect(snapshotState(plain as never)).toEqual({ a: 2 });
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

  it('preserves descendant PositionIds across branch replacement and callable subtree writes', () => {
    const tree = signalTree({
      profile: { firstName: 'John', lastName: 'Smith' },
      settings: { theme: 'light' },
    });

    const collect = () => ({
      profile: (tree.$.profile as unknown as { __positionIds?: number[] }).__positionIds?.[0],
      firstName: (
        tree.$.profile.firstName as unknown as { __positionIds?: number[] }
      ).__positionIds?.[0],
      lastName: (
        tree.$.profile.lastName as unknown as { __positionIds?: number[] }
      ).__positionIds?.[0],
      settings: (tree.$.settings as unknown as { __positionIds?: number[] }).__positionIds?.[0],
      theme: (
        tree.$.settings.theme as unknown as { __positionIds?: number[] }
      ).__positionIds?.[0],
    });

    const before = collect();

    tree.$.profile({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(collect()).toEqual(before);

    tree.$.profile((current) => ({ ...current, firstName: 'Grace' }));
    expect(collect()).toEqual(before);

    tree({ profile: { firstName: 'Katherine', lastName: 'Johnson' } });
    expect(collect()).toEqual(before);
  });

  it('records structural parentage in the tree-owned PositionRegistry', () => {
    const tree = signalTree({
      profile: { firstName: 'John', lastName: 'Smith' },
      settings: { theme: 'light' },
    });
    const registry = getPositionRegistry(tree.$);

    expect(registry).toBeDefined();

    const rootPositionId = (
      tree.$ as unknown as { __positionIds?: number[] }
    ).__positionIds?.[0] as number;
    const profilePositionId = (
      tree.$.profile as unknown as { __positionIds?: number[] }
    ).__positionIds?.[0] as number;
    const firstNamePositionId = (
      tree.$.profile.firstName as unknown as { __positionIds?: number[] }
    ).__positionIds?.[0] as number;
    const themePositionId = (
      tree.$.settings.theme as unknown as { __positionIds?: number[] }
    ).__positionIds?.[0] as number;

    expect(registry?.parentOf(profilePositionId)).toBe(rootPositionId);
    expect(registry?.parentOf(firstNamePositionId)).toBe(profilePositionId);
    expect(registry?.contains(profilePositionId, firstNamePositionId)).toBe(true);
    expect(registry?.contains(profilePositionId, themePositionId)).toBe(false);
  });

  it('stamps one PositionId per materialized descendant', () => {
    const tree = signalTree({
      profile: { firstName: 'John', lastName: 'Smith' },
      settings: { theme: 'light' },
    });
    const positionIds = new Set<number>();

    visitTree(tree.$, (node) => {
      const positionId = (node as { __positionIds?: number[] }).__positionIds?.[0];
      if (typeof positionId === 'number') {
        positionIds.add(positionId);
      }
    });

    expect(positionIds.size).toBe(6);
  });
});
