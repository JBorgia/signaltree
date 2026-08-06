import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { form } from './markers/form';
import { LoadingState, status } from './markers/status';
import { signalTree } from './signal-tree';
import { applyState } from './utils';

/**
 * A marker must survive a snapshot round-trip with its STATE intact.
 *
 * ⚠️ THE OBVIOUS FORMULATION OF THIS TEST IS VACUOUS.
 *
 *     t2(t1()); expect(t2()).toEqual(t1());
 *
 * That passes trivially when BOTH sides drop the same thing — which is exactly
 * the bug it would be written to catch. Measured against the pre-fix code, a
 * tree holding a `form()` gave `t1() === t2() === {"n":1}` while the live
 * values were `{a:42}` and `{a:1}`: green test, lost data. It would have been
 * green through the entire period `form()` was missing from every snapshot.
 *
 * So every test here compares LIVE NODE READS after the round-trip, never
 * snapshot against snapshot, and each one first asserts that the mutation it
 * makes actually took — otherwise a marker that silently ignores writes would
 * also pass.
 */
describe('markers round-trip through snapshot → hydrate', () => {
  it('form: values and touched survive; submitting does not', () => {
    const src = signalTree({
      f: form({ initial: { name: '', email: '' } }),
    });
    src.$.f.set({ name: 'Ada', email: 'a@b.c' });
    src.$.f.touch('name');

    // The mutation took — without this, a no-op write would pass everything.
    expect(src.$.f().name).toBe('Ada');
    expect(src.$.f.touched().name).toBe(true);

    const fresh = signalTree({ f: form({ initial: { name: '', email: '' } }) });
    applyState(fresh.$, src());

    expect(fresh.$.f()).toEqual({ name: 'Ada', email: 'a@b.c' });
    expect(fresh.$.f.touched().name).toBe(true);
    // In-flight state must never be resurrected: nothing is submitting.
    expect(fresh.$.f.submitting()).toBe(false);
  });

  it('form: survives at depth, where every walker used to drop it', () => {
    const src = signalTree({ grp: { g: form({ initial: { b: 0 } }) }, n: 1 });
    src.$.grp.g.set({ b: 99 });
    expect(src.$.grp.g().b).toBe(99);

    const fresh = signalTree({ grp: { g: form({ initial: { b: 0 } }) }, n: 1 });
    applyState(fresh.$, src());

    expect(fresh.$.grp.g()).toEqual({ b: 99 });
  });

  it('entityMap: entities survive', () => {
    const src = signalTree({ rows: entityMap<{ id: number }, number>() });
    src.$.rows.setAll([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(src.$.rows.count()).toBe(3);

    const fresh = signalTree({ rows: entityMap<{ id: number }, number>() });
    applyState(fresh.$, src());

    expect(fresh.$.rows.count()).toBe(3);
    expect(fresh.$.rows.byId(2)?.()).toEqual({ id: 2 });
  });

  it('status: Loaded survives — dropping it would refetch data we hold', () => {
    const src = signalTree({ j: status() });
    src.$.j.setLoaded();
    expect(src.$.j.loaded()).toBe(true);

    const fresh = signalTree({ j: status() });
    applyState(fresh.$, src());

    expect(fresh.$.j.state()).toBe(LoadingState.Loaded);
    expect(fresh.$.j.loaded()).toBe(true);
  });

  it('status: Error survives, so a retry guard can report the last failure', () => {
    const src = signalTree({ j: status<string>() });
    src.$.j.setError('timeout');
    expect(src.$.j.hasError()).toBe(true);

    const fresh = signalTree({ j: status<string>() });
    applyState(fresh.$, src());

    expect(fresh.$.j.state()).toBe(LoadingState.Error);
    expect(fresh.$.j.error()).toBe('timeout');
    expect(fresh.$.j.idle()).toBe(true); // errored is retryable
  });

  it('a whole tree of mixed markers round-trips at once', () => {
    const mk = () =>
      signalTree({
        f: form({ initial: { name: '' } }),
        grp: { g: form({ initial: { b: 0 } }) },
        j: status(),
        rows: entityMap<{ id: number }, number>(),
        n: 0,
      });

    const src = mk();
    src.$.f.set({ name: 'Ada' });
    src.$.grp.g.set({ b: 99 });
    src.$.j.setLoaded();
    src.$.rows.setAll([{ id: 1 }, { id: 2 }]);
    src.$.n.set(7);

    const fresh = mk();
    applyState(fresh.$, src());

    expect(fresh.$.f()).toEqual({ name: 'Ada' });
    expect(fresh.$.grp.g()).toEqual({ b: 99 });
    expect(fresh.$.j.state()).toBe(LoadingState.Loaded);
    expect(fresh.$.rows.count()).toBe(2);
    expect(fresh.$.n()).toBe(7);
  });

  it('snapshots carry state only — no derived views, no methods', () => {
    const tree = signalTree({
      j: status(),
      rows: entityMap<{ id: number }, number>(),
      f: form({ initial: { a: 1 } }),
    });
    tree.$.rows.setAll([{ id: 1 }]);
    const snap = tree() as Record<string, Record<string, unknown>>;

    expect(Object.keys(snap['j']).sort()).toEqual(['error', 'state']);
    expect(Object.keys(snap['rows'])).toEqual(['all']);
    expect(Object.keys(snap['f']).sort()).toEqual(['touched', 'values']);
  });

  it('the vacuous formulation would pass — proving why this suite reads live', () => {
    // Documented, not aspirational: snapshot-vs-snapshot equality holds even
    // when a marker's data is dropped on BOTH sides, which is why none of the
    // tests above use it.
    const mk = () => signalTree({ f: form({ initial: { a: 1 } }), n: 1 });
    const t1 = mk();
    t1.$.f.set({ a: 42 });
    const t2 = mk();
    applyState(t2.$, t1());

    // Both the vacuous check AND the real one pass now. Before the fix the
    // vacuous one passed while the real one failed.
    expect(JSON.stringify(t2())).toBe(JSON.stringify(t1())); // vacuous
    expect(t2.$.f()).toEqual(t1.$.f()); // real
  });
});
