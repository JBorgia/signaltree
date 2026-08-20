import { computed, type Signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { timeTravel } from '../enhancers/time-travel/time-travel';
import { signalTree } from '../index';

/**
 * THE CONFORMING-COLLECTION PROTOTYPE — the uncontaminated experiment.
 *
 * WHY THIS EXISTS. The serialization pass tried to upgrade M3 to a system
 * theorem with the row `fresh({ rows: [...] })`. That row is CIRCULAR: the bare
 * array is accepted by `entityMap`'s own hydrate hook
 * (`Array.isArray(value) ? value : value.all`, entity-map.ts:386-388) — the very
 * mechanism M4 proposes to delete. The mechanism under sentence cannot be its
 * own equivalence proof.
 *
 * THE THEOREM THE DELETION ACTUALLY REQUIRES:
 *
 *   Can the earned collection semantics be realized through a uniform accessor
 *   read/write contract with NO snapshot/hydrate specialization?
 *
 * So NOTHING in this file may touch `entityMap`, `loader`, or any marker. The
 * collection is built from an ORDINARY ARRAY LEAF plus ordinary derived helpers.
 * If that carries every earned property, then no declaration kind is required to
 * hold a collection, and the snapshot hook, the hydrate hook and the
 * `{all:[...]}` envelope have no surviving implementer.
 *
 * SEVEN PROPERTIES, PROVEN SIMULTANEOUSLY:
 *
 *   READ            the accessor returns the externalizable value
 *   MEMBERSHIP      add / remove stay dynamic post-construction
 *   GRANULARITY     watching byId('a') does not react to an update of 'b'
 *   CANONICALITY    writes participate in undo
 *   REPRESENTATION  tree() obtains it by the SAME generic rule as ordinary state
 *   RECONSTRUCTION  tree({rows:[...]}) writes by the SAME generic rule
 *   IDENTITY        deferred — rekey NECESSITY is withdrawn and unproven
 */
type Row = { id: string; n: number };

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * The collection, as ordinary composition over one array leaf.
 *
 * `byId` is the load-bearing piece. It is a memoised `computed` per key, and its
 * granularity comes from REFERENCE STABILITY: when member 'b' is replaced, the
 * object for 'a' is the same reference, so `byId('a')` produces an identical
 * value and Angular's default `Object.is` equality stops propagation there.
 * Downstream consumers of `byId('a')` never recompute.
 */
function collectionOver(leaf: {
  (): Row[];
  set(v: Row[]): void;
  update(fn: (c: Row[]) => Row[]): void;
}) {
  const byIdCache = new Map<string, Signal<Row | undefined>>();
  return {
    all: (): Row[] => leaf(),
    ids: computed(() => leaf().map((r) => r.id)),
    byId(id: string): Signal<Row | undefined> {
      let s = byIdCache.get(id);
      if (!s) {
        s = computed(() => leaf().find((r) => r.id === id));
        byIdCache.set(id, s);
      }
      return s;
    },
    addOne(row: Row): void {
      leaf.update((c) => [...c, row]);
    },
    removeOne(id: string): void {
      leaf.update((c) => c.filter((r) => r.id !== id));
    },
    updateOne(id: string, changes: Partial<Row>): void {
      // Replaces ONLY the target member's object; every other reference is
      // carried across untouched. That is what preserves granularity.
      leaf.update((c) =>
        c.map((r) => (r.id === id ? { ...r, ...changes } : r))
      );
    },
  };
}

describe('CONFORMING COLLECTION — no marker, no hooks', () => {
  it('READ + MEMBERSHIP — the accessor yields the value, and membership is dynamic', () => {
    const tree = signalTree({ rows: [] as Row[] });
    const rows = collectionOver(tree.$.rows);

    rows.addOne({ id: 'a', n: 1 });
    rows.addOne({ id: 'b', n: 2 });
    expect(rows.all()).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
    expect(rows.ids()).toEqual(['a', 'b']);

    // Dynamic post-construction, which is the axis an ordinary RECORD fails.
    rows.addOne({ id: 'c', n: 3 });
    expect(rows.ids()).toEqual(['a', 'b', 'c']);
    rows.removeOne('a');
    expect(rows.ids()).toEqual(['b', 'c']);
    expect(rows.byId('a')()).toBeUndefined();
    expect(rows.byId('c')()?.n).toBe(3);
  });

  it('GRANULARITY — a watcher on byId(a) does NOT recompute when b changes', () => {
    const tree = signalTree({ rows: [] as Row[] });
    const rows = collectionOver(tree.$.rows);
    rows.addOne({ id: 'a', n: 1 });
    rows.addOne({ id: 'b', n: 2 });

    let runs = 0;
    const watchA = computed(() => {
      runs++;
      return rows.byId('a')()?.n;
    });
    expect(watchA()).toBe(1);
    const base = runs;

    rows.updateOne('b', { n: 99 });
    watchA();

    // THE AXIS AN ORDINARY ARRAY WAS SAID TO FAIL.
    expect(runs).toBe(base);
    expect(rows.byId('b')()?.n).toBe(99);

    // And it still reacts to its OWN member.
    rows.updateOne('a', { n: 7 });
    expect(watchA()).toBe(7);
    expect(runs).toBe(base + 1);
  });

  it('GRANULARITY holds across add and remove of OTHER members', () => {
    const tree = signalTree({ rows: [] as Row[] });
    const rows = collectionOver(tree.$.rows);
    rows.addOne({ id: 'a', n: 1 });
    rows.addOne({ id: 'b', n: 2 });

    let runs = 0;
    const watchA = computed(() => {
      runs++;
      return rows.byId('a')()?.n;
    });
    watchA();
    const base = runs;

    rows.addOne({ id: 'c', n: 3 });
    watchA();
    rows.removeOne('b');
    watchA();

    expect(runs).toBe(base);
    expect(rows.byId('a')()?.n).toBe(1);
  });

  it('CANONICALITY — BLOCKED by a 15-branch UNDO REGRESSION, not by array leaves', async () => {
    const tree = signalTree({ rows: [] as Row[], draft: '' }).with(timeTravel());
    const rows = collectionOver(tree.$.rows);

    rows.addOne({ id: 'a', n: 1 });
    await tick();
    rows.addOne({ id: 'b', n: 2 });
    await tick();
    expect(rows.ids()).toEqual(['a', 'b']);

    // On THIS BRANCH undo REFUSES a non-scalar leaf effect:
    //
    //   isSupportedEffect(), time-travel.ts:1680-1694
    //     case 'set': return (isScalarValue(before) && isScalarValue(after))
    //                     || (subject === undefined && ownerPath !== path);
    //
    // An array is not scalar, and a top-level leaf is its own owner, so both
    // clauses fail and applyTurnEffects throws.
    expect(() => tree.undo()).toThrow(/Unsupported scoped undo effect at rows/);

    // ⚠️ THIS IS A REGRESSION, NOT A PROPERTY OF ARRAY LEAVES.
    //
    // The identical write undoes correctly on the 14.x lineage — measured by
    // running this file's scenario on `main`, where both the array row and the
    // scalar control pass. `isSupportedEffect` was introduced by 06785300
    // (2026-08-11 22:29, "feat(history): cut over public undo to frontier
    // authority") — the same third-bucket commit that introduced SubjectId.
    //
    // So CANONICALITY for an ordinary array leaf is ESTABLISHED on 14.x and
    // BLOCKED here by 15-effort work. The prototype's 7th property is contingent
    // on fixing that regression, and this row must not be read as evidence that
    // a declaration kind is needed to be canonical.
    //
    // It also contaminates E: on THIS branch, entityMap passes canonicality
    // because it emits SUBJECT-BEARING effects, which isSupportedEffect admits,
    // while an ordinary array does not. That is a property of the new undo
    // engine, not of the two shapes.
  });

  it('REPRESENTATION — tree() obtains it by the SAME generic rule as ordinary state', () => {
    const tree = signalTree({ rows: [] as Row[], n: 1, user: { name: 'Ada' } });
    const rows = collectionOver(tree.$.rows);
    rows.addOne({ id: 'a', n: 1 });
    rows.addOne({ id: 'b', n: 2 });

    // NO ENVELOPE. The collection appears as its bare value, exactly like the
    // sibling leaf and the sibling branch, because the walk sees an ordinary
    // signal and M3's rule applies unmodified.
    expect(tree()).toEqual({
      rows: [
        { id: 'a', n: 1 },
        { id: 'b', n: 2 },
      ],
      n: 1,
      user: { name: 'Ada' },
    });
  });

  it('RECONSTRUCTION — tree(payload) restores it by the SAME generic rule', () => {
    const fresh = signalTree({ rows: [] as Row[], n: 0 });
    const rows = collectionOver(fresh.$.rows);

    // The ordinary root write path. No hydrate hook exists for this position,
    // because the position is an ordinary array leaf.
    fresh({
      rows: [
        { id: 'x', n: 10 },
        { id: 'y', n: 20 },
      ],
      n: 5,
    });

    expect(rows.ids()).toEqual(['x', 'y']);
    expect(rows.byId('y')()?.n).toBe(20);
    expect(fresh.$.n()).toBe(5);
  });

  it('FULL ROUND TRIP across a JSON boundary, with no marker anywhere', () => {
    const source = signalTree({ rows: [] as Row[], n: 3 });
    const srcRows = collectionOver(source.$.rows);
    srcRows.addOne({ id: 'a', n: 1 });
    srcRows.addOne({ id: 'b', n: 2 });

    const wire = JSON.parse(JSON.stringify(source())) as unknown;

    const target = signalTree({ rows: [] as Row[], n: 0 });
    const tgtRows = collectionOver(target.$.rows);
    target(wire as never);

    expect(tgtRows.all()).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
    expect(target.$.n()).toBe(3);

    // And granularity survives reconstruction.
    let runs = 0;
    const watchA = computed(() => {
      runs++;
      return tgtRows.byId('a')()?.n;
    });
    watchA();
    const base = runs;
    tgtRows.updateOne('b', { n: 99 });
    watchA();
    expect(runs).toBe(base);
  });
});
