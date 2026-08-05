import { signalTree } from '@signaltree/core';
import { describe, expect, it } from 'vitest';

import { enterprise } from './enterprise-enhancer';

/**
 * `updateOptimized()` and array leaves.
 *
 * An array in a SignalTree is a SINGLE leaf — one `WritableSignal<T[]>`, never
 * per-index signals — while `DiffEngine` is a general-purpose differ that emits
 * element-level paths (`users.1`). The apply step therefore cannot resolve
 * those paths, and used to drop the write while reporting `changed: true`.
 *
 * Every test below corresponds to a defect that was observed for real:
 * the original drop, plus the four ways the first fix attempt (rebuilding the
 * array from element patches) made things worse. They exist so a future
 * "optimisation" cannot quietly reintroduce any of them.
 */
describe('updateOptimized() — array leaves', () => {
  const make = <T extends object>(state: T) =>
    signalTree(state).with(enterprise()) as unknown as {
      $: Record<string, ReturnType<typeof signalTree>>;
      updateOptimized: (
        u: unknown,
        o?: Record<string, unknown>
      ) => { changed: boolean; changedPaths: string[] };
    };

  it('writes a top-level array (the original defect: reported success, wrote nothing)', () => {
    const t = make({ users: [{ id: 1, active: true }] });
    const r = t.updateOptimized({
      users: [
        { id: 1, active: false },
        { id: 2, active: true },
      ],
    });

    expect(r.changed).toBe(true);
    expect(t.$['users']()).toEqual([
      { id: 1, active: false },
      { id: 2, active: true },
    ]);
  });

  it('writes an array nested under an object namespace', () => {
    const t = make({ nested: { rows: [{ v: 1 }] } });
    t.updateOptimized({ nested: { rows: [{ v: 42 }] } });
    expect(
      (t.$['nested'] as unknown as { rows: () => unknown })['rows']()
    ).toEqual([{ v: 42 }]);
  });

  it('TRUNCATES correctly — a shorter array must not keep its stale tail', () => {
    // The reverted fix produced [9,2,3] here: the diff only names indices
    // present in the update, so rebuilding element-wise left index 2 behind.
    // Silent corruption is worse than the silent no-op it replaced.
    const t = make({ n: [1, 2, 3] });
    t.updateOptimized({ n: [9, 2] });
    expect(t.$['n']()).toEqual([9, 2]);
  });

  it('truncates to a single element', () => {
    const t = make({ n: [1, 2, 3] });
    t.updateOptimized({ n: [7] });
    expect(t.$['n']()).toEqual([7]);
  });

  it('removing a key from an element does not leave it behind', () => {
    const t = make({ rows: [{ id: 2, stale: 'x' }] });
    t.updateOptimized({ rows: [{ id: 2 }] });
    expect(t.$['rows']()).toEqual([{ id: 2 }]);
  });

  it('preserves class identity of elements', () => {
    // The reverted fix spread each level with `{ ...child }`, downgrading class
    // instances to object literals and losing methods, getters and instanceof.
    class Point {
      constructor(public x = 0, public y = 0) {}
      scaled() {
        return this.x * 2;
      }
    }
    const t = make({ ps: [new Point(1, 2)] });
    t.updateOptimized({ ps: [new Point(9, 2)] });

    const [p] = t.$['ps']() as Point[];
    expect(p).toBeInstanceOf(Point);
    expect(p.scaled()).toBe(18);
  });

  it('does not let a __proto__ segment reach the prototype chain', () => {
    // `cursor[seg] = clone` with seg === '__proto__' is a [[Prototype]]
    // assignment, and JSON.parse creates an own '__proto__' key, so this was
    // reachable from any JSON-sourced payload.
    const t = make({ users: [{ id: 1 }] });
    t.updateOptimized(JSON.parse('{"users":[{"__proto__":{"isAdmin":true}}]}'));

    const [el] = t.$['users']() as Array<Record<string, unknown>>;
    expect((el as { isAdmin?: unknown }).isAdmin).toBeUndefined();
    expect(({} as { isAdmin?: unknown }).isAdmin).toBeUndefined();
    expect(Object.getPrototypeOf(el)).toBe(Object.prototype);
  });

  it('writes the array signal ONCE, not once per changed element', () => {
    // The reverted fix set the signal per element patch, publishing torn
    // intermediate states and copying the whole array each time (measured 652x
    // slower than a plain .set() on a large array).
    const t = make({ nums: [1, 2, 3] });
    const seen: number[][] = [];
    // Reading through the leaf's own subscription surface keeps this
    // independent of Angular's effect scheduling.
    const leaf = t.$['nums'] as unknown as {
      (): number[];
      set: (v: number[]) => void;
    };
    const originalSet = leaf.set.bind(leaf);
    leaf.set = (v: number[]) => {
      seen.push(v);
      originalSet(v);
    };

    t.updateOptimized({ nums: [10, 20, 30] });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([10, 20, 30]);
  });

  it('does not mutate the array the signal already holds', () => {
    const t = make({ nums: [1, 2, 3] });
    const before = t.$['nums']() as number[];
    t.updateOptimized({ nums: [9, 2, 3] });
    expect(before).toEqual([1, 2, 3]); // untouched
    expect(t.$['nums']()).toEqual([9, 2, 3]);
  });

  it('reports changed:false when nothing was actually applied', () => {
    // `changed` used to be hardcoded true whenever the diff was non-empty,
    // which is how a dropped patch masqueraded as a successful write.
    const t = make({ meta: new Map([['a', 1]]) });
    const r = t.updateOptimized({ meta: { a: 2 } });
    expect(r.changed).toBe(r.changedPaths.length > 0);
  });

  it('leaves object-only updates on their existing granular path', () => {
    const t = make({ metrics: { cpu: 1, mem: 2 } });
    const r = t.updateOptimized({ metrics: { cpu: 99 } });
    expect(
      (t.$['metrics'] as unknown as { cpu: () => number })['cpu']()
    ).toBe(99);
    expect((t.$['metrics'] as unknown as { mem: () => number })['mem']()).toBe(
      2
    );
    expect(r.changed).toBe(true);
  });

  it('handles empty arrays and growth', () => {
    const t = make({ a: [] as number[], b: [1, 2] });
    t.updateOptimized({ a: [1, 2], b: [1, 2, 3, 4] });
    expect(t.$['a']()).toEqual([1, 2]);
    expect(t.$['b']()).toEqual([1, 2, 3, 4]);
  });

  it('works with ignoreArrayOrder: true', () => {
    const t = make({ n: [1, 2, 3] });
    t.updateOptimized({ n: [9] }, { ignoreArrayOrder: true });
    expect(t.$['n']()).toEqual([9]);
  });
});
