import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { status, LoadingState } from './markers/status';
import { signalTree } from './signal-tree';
import { applyState } from './utils';

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

  it('status emits state and error, not the six predicates', () => {
    const tree = signalTree({ job: status() });
    tree.$.job.setLoaded();
    expect(Object.keys((tree() as { job: object }).job).sort()).toEqual([
      'error',
      'state',
    ]);
  });

  it('recomputes status predicates after rehydrate', () => {
    const source = signalTree({ job: status<Error>() });
    source.$.job.setError(new Error('boom'));

    const fresh = signalTree({ job: status<Error>() });
    applyState(fresh.$, source());

    expect(fresh.$.job.state()).toBe(LoadingState.Error);
    expect(fresh.$.job.hasError()).toBe(true);
    expect(fresh.$.job.settled()).toBe(true);
    expect(fresh.$.job.loading()).toBe(false);
  });
});

describe('a rehydrated tree has no request in flight', () => {
  it('does NOT restore a LOADING status — that would deadlock the node', () => {
    // Persisted mid-flight; the page closed. Restoring `LOADING` verbatim makes
    // loading() true (so a "don't fetch while loading" guard blocks forever),
    // idle() false (so an idle-gated fetch never fires) and settled() false —
    // with nothing running to ever change any of them.
    const source = signalTree({ job: status() });
    source.$.job.setLoading();
    const snapshot = source();
    expect((snapshot as { job: { state: string } }).job.state).toBe('LOADING');

    const fresh = signalTree({ job: status() });
    applyState(fresh.$, snapshot);

    expect(fresh.$.job.state()).toBe(LoadingState.NotLoaded);
    expect(fresh.$.job.loading()).toBe(false);
    expect(fresh.$.job.idle()).toBe(true); // a retry can actually fire
  });

  it('keeps Loaded — a finished operation survives serialisation', () => {
    const source = signalTree({ job: status() });
    source.$.job.setLoaded();

    const fresh = signalTree({ job: status() });
    applyState(fresh.$, source());

    expect(fresh.$.job.state()).toBe(LoadingState.Loaded);
    expect(fresh.$.job.loaded()).toBe(true);
  });

  it('keeps Error — a retry guard needs to know the last attempt failed', () => {
    const source = signalTree({ job: status<string>() });
    source.$.job.setError('timeout');

    const fresh = signalTree({ job: status<string>() });
    applyState(fresh.$, source());

    expect(fresh.$.job.state()).toBe(LoadingState.Error);
    expect(fresh.$.job.error()).toBe('timeout');
    expect(fresh.$.job.idle()).toBe(true); // errored is retryable
  });

  it('the snapshot itself stays faithful — normalisation is on APPLY', () => {
    // devtools should still be able to show that the node WAS loading; it is
    // restore that has to land somewhere a tree can operate from.
    const source = signalTree({ job: status() });
    source.$.job.setLoading();
    expect((source() as { job: { state: string } }).job.state).toBe('LOADING');
  });
});
