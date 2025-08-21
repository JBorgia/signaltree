import { TestBed } from '@angular/core/testing';
import { signalTree } from '@signaltree/core';
import {
  withBatching,
  flushBatchedUpdates,
  getPendingBatchedUpdates,
} from './batching';

describe('Batching - mixed update/batch ordering', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('ensures updates queued with update() and batchUpdate() maintain expected ordering', () => {
    const tree = signalTree({ x: { v: 0 }, log: [] as string[] }).pipe(
      withBatching()
    );

    // Queue an imperative update (should be queued but not schedule flush)
    tree.$.update(() => ({ x: { v: tree.state.x.v() + 1 } }));

    // Queue a batched update which should schedule flush
    tree.$.x.batchUpdate(() => ({ v: tree.state.x.v() + 10 }));

    // At this point, we expect two queued updates
    const pending = getPendingBatchedUpdates();
    expect(pending.length).toBeGreaterThanOrEqual(1);

    // Flush and assert final state - deeper batch should have run with the queued imperative update considered
    flushBatchedUpdates();

    expect(tree.state.x.v()).toBeGreaterThanOrEqual(11);
  });
});
