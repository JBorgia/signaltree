import { describe, expect, it } from 'vitest';

import { signalTree } from '../../lib/signal-tree';
import { timeTravel } from './time-travel';

/**
 * A history entry IS the snapshot — no clone, no deep compare.
 *
 * Recording a write used to cost O(state) three times over: materialise the
 * whole tree, `structuredClone` it, and `deepEqual` it against the previous
 * entry. On top of that, every root write ran a full-state `deepEqual` just to
 * decide whether to record at all. 50 writes each changing ONE number cost
 * 340.60ms at 10k rows.
 *
 * Materialisation is now memoised and structurally shared, so an unchanged
 * subtree is the SAME object across snapshots. Holding the reference retains
 * only what changed, and every comparison collapses to `===`:
 *
 *   rows      before      after
 *      100    2.85ms      0.13ms
 *    1,000   29.51ms      0.08ms
 *   10,000  340.60ms      0.04ms     <- flat in state size
 *
 * These tests pin the behaviour that makes the shortcut legitimate. If any of
 * them fail, the reference identity that time travel now depends on is gone and
 * the `===` comparisons silently stop detecting changes.
 */
describe('time travel snapshot sharing', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  const withRows = (n: number) => ({
    counter: 0,
    rows: Array.from({ length: n }, (_, i) => ({ id: i, v: i })),
  });

  it('history entries share the untouched parts of state', async () => {
    const tree = signalTree({ a: { x: 1 }, b: { y: 2 } }).with(timeTravel());

    tree.$.a.x.set(10);
    await flush();
    tree.$.a.x.set(20);
    await flush();

    const history = tree.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);

    // `b` was never written, so every entry must hold the SAME object for it.
    const bs = history.map((e) => (e.state as { b: unknown }).b);
    for (const b of bs) expect(b).toBe(bs[0]);
  });

  it('does not record a write that changed nothing', async () => {
    const tree = signalTree({ n: 1 }).with(timeTravel());
    tree.$.n.set(2);
    await flush();
    const before = tree.getHistory().length;

    tree.$.n.set(2); // same value — no new object, so nothing to record
    await flush();

    expect(tree.getHistory().length).toBe(before);
  });

  it('undo still restores correctly with shared references', async () => {
    const tree = signalTree({ a: { x: 1 }, b: { y: 2 } }).with(timeTravel());

    tree.$.a.x.set(10);
    await flush();
    tree.$.b.y.set(20);
    await flush();
    expect(tree()).toMatchObject({ a: { x: 10 }, b: { y: 20 } });

    tree.undo();
    expect(tree()).toMatchObject({ a: { x: 10 }, b: { y: 2 } });
    tree.undo();
    expect(tree()).toMatchObject({ a: { x: 1 }, b: { y: 2 } });
  });

  it('an entry does not change when state moves on afterwards', async () => {
    // Without a clone, this is the property that matters: the recorded snapshot
    // must stay put. It does because a write builds NEW objects along the
    // changed path rather than mutating the old ones.
    const tree = signalTree({ n: 1 }).with(timeTravel());
    tree.$.n.set(2);
    await flush();

    const recorded = tree.getHistory().at(-1)?.state as { n: number };
    expect(recorded.n).toBe(2);

    tree.$.n.set(3);
    await flush();
    expect(recorded.n).toBe(2);
  });

  it('cost does not scale with untouched state', async () => {
    // Asserted as a RATIO between two collection sizes on this machine, not as
    // a wall-clock budget — the property is "flat in N", which is inherently a
    // comparison, and an absolute threshold would be flaky under CI load.
    const run = (rows: number) => {
      const tree = signalTree(withRows(rows)).with(timeTravel());
      tree();
      const t0 = performance.now();
      for (let i = 0; i < 50; i++) tree({ counter: i } as never);
      return performance.now() - t0;
    };

    run(100); // warm
    const small = run(100);
    const large = run(10000);

    // 100x the untouched state must not cost anywhere near 100x. Measured flat
    // (0.13ms vs 0.04ms); before this it was 2.85ms vs 340.60ms.
    expect(large).toBeLessThan(Math.max(small * 10, 20));
  });
});
