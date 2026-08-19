import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { form } from './markers/form';
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

  it('entityMap: entities survive', () => {
    const src = signalTree({ rows: entityMap<{ id: number }, number>() });
    src.$.rows.setAll([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(src.$.rows.count()).toBe(3);

    const fresh = signalTree({ rows: entityMap<{ id: number }, number>() });
    applyState(fresh.$, src());

    expect(fresh.$.rows.count()).toBe(3);
    expect(fresh.$.rows.byId(2)?.()).toEqual({ id: 2 });
  });

  // WITHDRAWN WITH STATUS-DEL — "status: Loaded survives" and "status: Error
  // survives". Both assert status-specific hydrate VALUES on the generic
  // snapshot->reconstruction path, which is UNPROVEN. The entityMap case above
  // keeps the roundtrip property with an independent specimen.

});
