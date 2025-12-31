import { describe, expect, it } from 'vitest';

import {
  batching,
  flushBatchedUpdates,
  getBatchQueueSize,
  hasPendingUpdates,
} from './batching';

function createFakeTree(initial: any) {
  let state = initial;
  const tree: any = function (arg?: any) {
    if (arguments.length === 0) return state;
    if (typeof arg === 'function') state = arg(state);
    else state = arg;
  };

  // Minimal node accessor shape used by batching.batchUpdate
  tree.state = {
    count: {
      set: (v: any) => {
        state.count = v;
      },
    },
  };

  return tree as unknown as () => any;
}

describe('batching behavior', () => {
  it('queues updates and flush applies them', () => {
    const tree = createFakeTree({ count: 0 });
    const enhanced = batching()(tree as any) as any;

    expect(hasPendingUpdates()).toBe(false);

    // Schedule an update via the enhanced setter (should be batched)
    enhanced({ count: 1 });

    expect(getBatchQueueSize()).toBeGreaterThanOrEqual(1);

    // Force flush and verify state applied
    flushBatchedUpdates();

    expect(enhanced().count).toBe(1);
  });
});
