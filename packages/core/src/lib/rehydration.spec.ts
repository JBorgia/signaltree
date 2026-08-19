import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';
import { applyState, unwrap } from './utils';

/**
 * A snapshot exists to REHYDRATE a tree, not to reconstruct one.
 *
 * By the time a snapshot is applied, `signalTree(initialState)` has already
 * built the shape, the markers and every signal. The snapshot only has to carry
 * the values that go into the leaves — anything the live node can recompute is
 * structure, and structure in a value payload is at best waste and at worst a
 * lie.
 *
 * The library already followed this for `.derived()`. Markers did not, and each
 * violation caused a distinct bug: `entityMap` shipped a `map` that serialised
 * as `{}` while holding 10,000 entities, and `status()` shipped six predicates
 * that are pure functions of two fields.
 *
 * These tests pin the rule in both directions: derived views must NOT be in the
 * snapshot, and they must be correct again after rehydrate.
 */
describe('snapshots carry state, not derived views', () => {
  it('omits derived computeds — the rule markers now follow too', () => {
    const tree = signalTree({ a: 2, b: 3 }).derived(($) => ({
      sum: computed(() => $.a() + $.b()),
    }));
    expect(tree()).toEqual({ a: 2, b: 3 });
  });

  it('recomputes a derived value after rehydrate', () => {
    const source = signalTree({ a: 2, b: 3 }).derived(($) => ({
      sum: computed(() => $.a() + $.b()),
    }));
    const snapshot = source();

    const fresh = signalTree({ a: 0, b: 0 }).derived(($) => ({
      sum: computed(() => $.a() + $.b()),
    }));
    fresh(snapshot);

    expect(fresh.$.a()).toBe(2);
    expect(fresh.$.sum()).toBe(5);
  });

  it('entityMap emits entities only', () => {
    const tree = signalTree({ rows: entityMap<{ id: number }, number>() });
    tree.$.rows.setAll([{ id: 1 }, { id: 2 }]);
    expect(Object.keys(tree().rows)).toEqual(['all']);
  });

  it('entityMap round-trips through applyState', () => {
    const source = signalTree({ rows: entityMap<{ id: number }, number>() });
    source.$.rows.setAll([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const fresh = signalTree({ rows: entityMap<{ id: number }, number>() });
    applyState(fresh.$, source());

    expect(fresh.$.rows.count()).toBe(3);
    expect(fresh.$.rows.byId(2)?.()).toEqual({ id: 2 });
  });


});


/**
 * `isStatusNode` is a three-clause duck-type: `setLoading` + `state` + `error`.
 * All three are load-bearing, and the third is the one that looks redundant and
 * is not.
 *
 * It has already been weakened once. The original third clause probed `.settled`
 * — a LAZY GETTER, so using it as a type test allocated a `computed` on every
 * node materialisation: asking the question had a side effect. Removing it fixed
 * the side effect and quietly created a worse problem, because both call sites
 * immediately deref `s.error()`. Two clauses classify any `{setLoading, state}`
 * object as a status node, and building its snapshot then dies with
 * "s.error is not a function".
 *
 * `.error` is the correct third clause precisely because it is not decoration:
 * it is a plain property (`error: errorSignal`), so reading it allocates
 * nothing, AND it guards the exact deref that a false positive would fail on.
 * The type test now checks for what the builder is about to use.
 *
 * These tests exist so the next person to look at a three-clause duck-type and
 * think "surely two is enough" gets a red suite instead of a production
 * TypeError.
 */
