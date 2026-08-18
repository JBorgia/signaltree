import { describe, expect, it } from 'vitest';

import { entityMap } from './types';
import { form } from './markers/form';
import { LoadingState, status } from './markers/status';
import { signalTree } from './signal-tree';
import { timeTravel } from '../enhancers/time-travel/time-travel';

/**
 * Undo/redo — the production half of time travel.
 *
 * This is deliberately separate from devtools forensic replay. Undo/redo needs
 * the state a USER edited: form values, collection entries, plain leaves. It
 * does not need loader metadata, in-flight status, or an exact reconstruction
 * of what the app was doing — nobody presses Ctrl+Z to un-fetch a request.
 *
 * Every decision still open in the snapshot/rehydration design turned out to be
 * devtools-only (see docs/architecture/undo-redo-vs-devtools.md), which is why
 * this can ship while those stay open.
 *
 * Two defects made this not work, and both were invisible rather than loud:
 *
 *  1. RESTORE dropped markers. `recursiveUpdate` had no idea how to write a
 *     marker node, so undo moved the scalars and left the collection alone —
 *     landing the user in a state that never existed and reporting success.
 *     Measured before the fix: n=3 rows=3 → undo → n=2 rows=3.
 *
 *  2. CAPTURE missed form writes entirely. `interceptLeafSignals` requires both
 *     `set` and `update`; a form node has `set` and `patch`, so it was never
 *     wrapped and never marked the tree dirty. Three writes produced two
 *     history entries. Undo cannot restore what was never recorded.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('undo/redo restores what the user edited', () => {
  it('undoes a collection edit, not just the scalars beside it', async () => {
    const tree = signalTree({
      n: 0,
      rows: entityMap<{ id: number }, number>(),
    }).with(timeTravel());

    for (let i = 1; i <= 3; i++) {
      tree.$.n.set(i);
      tree.$.rows.addOne({ id: i });
      await flush();
    }
    expect(tree.$.n()).toBe(3);
    expect(tree.$.rows.count()).toBe(3);

    tree.undo();

    // The collection must move WITH the scalar. Leaving it behind puts the user
    // in a state the app was never in.
    expect(tree.$.n()).toBe(2);
    expect(tree.$.rows.count()).toBe(2);
  });

  it('undoing a removed entity restores it at its original position', async () => {
    const tree = signalTree({
      rows: entityMap<{ id: string }, string>(),
    }).with(timeTravel());

    tree.$.rows.setAll([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    await flush();

    tree.$.rows.removeOne('b');
    await flush();

    expect(tree.$.rows.all().map((row) => row.id)).toEqual(['a', 'c']);

    tree.undo();

    expect(tree.$.rows.all().map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('redoes what it undid', async () => {
    const tree = signalTree({ rows: entityMap<{ id: number }, number>() }).with(
      timeTravel()
    );
    tree.$.rows.setAll([{ id: 1 }]);
    await flush();
    tree.$.rows.addOne({ id: 2 });
    await flush();
    expect(tree.$.rows.count()).toBe(2);

    tree.undo();
    expect(tree.$.rows.count()).toBe(1);
    tree.redo();
    expect(tree.$.rows.count()).toBe(2);
  });
});

describe('tree(partial) writes markers — the same path undo uses', () => {
  it('restores a collection', () => {
    const src = signalTree({ rows: entityMap<{ id: number }, number>() });
    src.$.rows.setAll([{ id: 1 }, { id: 2 }]);

    const fresh = signalTree({ rows: entityMap<{ id: number }, number>() });
    fresh(src());

    expect(fresh.$.rows.count()).toBe(2);
  });
});

describe('undo/redo deliberately does NOT restore in-flight state', () => {

  it('an in-process undo keeps LOADING — the request may still be running', async () => {
    // This is the one place `restore` and `rehydrate` genuinely differ. Undo is
    // in-process: a fetch started before the undo is still going, so reporting
    // NotLoaded would be the lie. Cross-process rehydrate normalises it instead.
    const tree = signalTree({ j: status(), n: 0 }).with(timeTravel());
    tree.$.j.setLoading();
    tree.$.n.set(1);
    await flush();
    tree.$.n.set(2);
    await flush();

    tree.undo();
    expect(tree.$.j.state()).toBe(LoadingState.Loading);
  });

  it('undoes direct status source-signal writes as one owned turn', async () => {
    const tree = signalTree({ j: status() }).with(timeTravel());

    tree.$.j.state.set(LoadingState.Error);
    tree.$.j.error.set(new Error('boom'));
    await flush();

    expect(tree.$.j.state()).toBe(LoadingState.Error);
    expect(tree.$.j.error()?.message).toBe('boom');

    tree.undo();

    expect(tree.$.j.state()).toBe(LoadingState.NotLoaded);
    expect(tree.$.j.error()).toBe(null);
  });
});
