import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { asyncSource } from './markers/async-source';
import { hydrateMarkerNode } from './internals/materialize-markers';
import { loader } from './markers/loader';
import { LoadingState, status } from './markers/status';
import { signalTree } from './signal-tree';

/**
 * On `rehydrate`, a marker that OWNS A SOURCE declines; one that does not,
 * accepts. `restore` always writes.
 *
 * This started as an open design question — "payload or source wins on
 * rehydrate?" — with ten options and a config knob at the end of most of them.
 * Two findings collapsed it:
 *
 *  1. The behaviour was already INCONSISTENT and nobody had noticed.
 *     `asyncSource` declined while `entityMap` + loader accepted, for the
 *     identical situation, written hours apart.
 *  2. The knob already exists. `loader({ persist: { hydrateThenRevalidate } })`
 *     seeds rows from its own store, marks them stale and revalidates in the
 *     background — per-scope keys, touch-ordered GC and all. That IS
 *     offline-first rehydration, shipped and documented.
 *
 * So tree-level rehydration writing a loader-backed collection is not a second
 * opinion, it is a CLOBBER: measured, a collection seeded by its loader and
 * then hydrated from a tree snapshot still held the tree's rows after
 * revalidation. The mechanism that knows least about freshness was simply last.
 */
const settle = () => new Promise((r) => setTimeout(r, 40));

describe('rehydrate: source-owning markers decline', () => {
  it('a loader-backed entityMap keeps its own data', async () => {
    const tree = signalTree({
      r: entityMap<{ id: number }, number>({
        selectId: (x) => x.id,
        load: loader(async () => [{ id: 9 }]),
      }),
    });
    void tree.$.r;
    await settle();
    expect(tree.$.r.count()).toBe(1);

    hydrateMarkerNode(
      tree.$.r,
      { all: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      'rehydrate'
    );

    // The loader owns this collection's persistence. Tree-level rehydration
    // must not overwrite it — `hydrateThenRevalidate` is where that policy
    // lives, per instance, and it already handles offline-first.
    expect(tree.$.r.count()).toBe(1);
  });

  it('asyncSource keeps the value its loader produced', async () => {
    const tree = signalTree({ s: asyncSource({ load: async () => 'SOURCE' }) });
    void tree.$.s;
    await settle();

    hydrateMarkerNode(tree.$.s, { value: 'PAYLOAD' }, 'rehydrate');
    expect(tree.$.s()).toBe('SOURCE');
  });
});

describe('rehydrate: markers with no source accept the payload', () => {
  it('a bare entityMap restores', () => {
    const tree = signalTree({ r: entityMap<{ id: number }, number>() });
    hydrateMarkerNode(tree.$.r, { all: [{ id: 1 }, { id: 2 }] }, 'rehydrate');
    expect(tree.$.r.count()).toBe(2);
  });

  it('a manually-driven status restores LOADED', () => {
    const tree = signalTree({ j: status() });
    hydrateMarkerNode(tree.$.j, { state: 'LOADED', error: null }, 'rehydrate');
    expect(tree.$.j.state()).toBe(LoadingState.Loaded);
  });
});

describe('restore always writes — undo is not competing with a loader', () => {
  it('a loader-backed entityMap accepts an undo', async () => {
    const tree = signalTree({
      r: entityMap<{ id: number }, number>({
        selectId: (x) => x.id,
        load: loader(async () => [{ id: 9 }]),
      }),
    });
    void tree.$.r;
    await settle();

    hydrateMarkerNode(
      tree.$.r,
      { all: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      'restore'
    );
    expect(tree.$.r.count()).toBe(3);
  });

  it('asyncSource accepts an undo', async () => {
    const tree = signalTree({ s: asyncSource({ load: async () => 'SOURCE' }) });
    void tree.$.s;
    await settle();

    hydrateMarkerNode(tree.$.s, { value: 'UNDONE' }, 'restore');
    expect(tree.$.s()).toBe('UNDONE');
  });
});
