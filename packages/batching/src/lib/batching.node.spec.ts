import { TestBed } from '@angular/core/testing';
import { signalTree } from '@signaltree/core';
import {
  withBatching,
  hasPendingUpdates,
  getBatchQueueSize,
  flushBatchedUpdates,
} from './batching';

describe('Batching - node-level path behavior', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('dedupes multiple batchUpdate calls to the same node path', async () => {
    const tree = signalTree({
      a: { b: { count: 0 } },
      events: [] as string[],
    }).pipe(withBatching());

    // Enqueue multiple batchUpdate calls on the same nested node path
    tree.$.a.b.batchUpdate((cur: any) => {
      // record side-effect to events so we can detect how many times it ran
      tree.state.events.set([...tree.state.events(), 'b']);
      return { count: cur.count + 1 };
    });

    tree.$.a.b.batchUpdate((cur: any) => {
      tree.state.events.set([...tree.state.events(), 'b']);
      return { count: cur.count + 1 };
    });

    tree.$.a.b.batchUpdate((cur: any) => {
      tree.state.events.set([...tree.state.events(), 'b']);
      return { count: cur.count + 1 };
    });

    // Since updates are deduped by path, queue size should be 1
    expect(hasPendingUpdates()).toBe(true);
    expect(getBatchQueueSize()).toBe(1);

    // Flush explicitly to make test deterministic in this environment
    flushBatchedUpdates();

    // Only the last enqueued update should have executed once
    expect(tree.state.events().length).toBe(1);
    expect(tree.state.a.b.count()).toBe(1);
    expect(hasPendingUpdates()).toBe(false);
  });

  it('executes deeper updates before parents (depth ordering)', async () => {
    const tree = signalTree({
      a: { b: { v: 0 }, v: 0 },
      events: [] as string[],
    }).pipe(withBatching());

    // Parent update depends on child's value; child increments itself.
    tree.$.a.batchUpdate(() => {
      // parent side-effect
      tree.state.events.set([...tree.state.events(), 'a']);
      // set parent.v based on child's value
      return { v: tree.state.a.b.v() + 100 };
    });

    tree.$.a.b.batchUpdate(() => {
      tree.state.events.set([...tree.state.events(), 'b']);
      return { v: tree.state.a.b.v() + 1 };
    });

    // both queued
    expect(hasPendingUpdates()).toBe(true);
    expect(getBatchQueueSize()).toBe(2);

    // Flush explicitly to make test deterministic in this environment
    flushBatchedUpdates();

    // Deeper node should have executed first, then parent should have seen updated child
    expect(tree.state.events()).toEqual(['b', 'a']);
    expect(tree.state.a.b.v()).toBe(1);
    expect(tree.state.a.v()).toBe(101);
  });
});
