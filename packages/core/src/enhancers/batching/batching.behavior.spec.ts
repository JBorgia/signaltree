import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

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

  tree.bind = () => tree;

  // Minimal node accessor shape used by batching.batchUpdate
  tree.state = {
    count: {
      set: (v: any) => {
        state.count = v;
      },
    },
  };
  tree.$ = tree.state;

  return tree as unknown as () => any;
}

describe('batching behavior', () => {
  /**
   * IMPORTANT: This test documents the NEW synchronous batching behavior.
   *
   * In v6.1.0+, signal writes are SYNCHRONOUS:
   * - Values update immediately when .set() is called
   * - Only CD notifications are batched
   * - The deprecated getBatchQueueSize() always returns 0
   *
   * The old test expected getBatchQueueSize() >= 1 after an update,
   * but now updates are applied immediately.
   */
  it('applies updates synchronously (v6.1.0+ behavior)', () => {
    const tree = createFakeTree({ count: 0 });
    const enhanced = batching()(tree as any) as any;

    // Deprecated function warns and returns false
    expect(hasPendingUpdates()).toBe(false);

    // Update is applied immediately (synchronous!)
    enhanced({ count: 1 });

    // Value is already updated - no queue
    expect(enhanced().count).toBe(1);

    // Deprecated function warns and returns 0
    expect(getBatchQueueSize()).toBe(0);

    // flushBatchedUpdates is deprecated but should not throw
    expect(() => flushBatchedUpdates()).not.toThrow();
  });

  it('tracks pending CD notifications via tree methods', () => {
    const tree = createFakeTree({ count: 0 });
    const enhanced = batching({ notificationDelayMs: 100 })(tree as any) as any;

    expect(enhanced.hasPendingNotifications()).toBe(false);

    // Update via $.count.set() which wraps the setter
    enhanced.$.count.set(5);

    // Value is updated immediately
    expect(enhanced().count).toBe(5);

    // But CD notification is pending
    expect(enhanced.hasPendingNotifications()).toBe(true);

    // Flush notifications
    enhanced.flushNotifications();
    expect(enhanced.hasPendingNotifications()).toBe(false);
  });

  describe('batch() groups CD notifications', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('batches multiple updates into single CD notification', () => {
      const tree = createFakeTree({ count: 0 });
      let notificationCount = 0;

      (tree as any).__notifyChangeDetection = () => {
        notificationCount++;
      };

      const enhanced = batching({ notificationDelayMs: 100 })(tree as any) as any;

      enhanced.batch(() => {
        enhanced.$.count.set(1);
        enhanced.$.count.set(2);
        enhanced.$.count.set(3);
      });

      // Values update immediately inside batch
      expect(enhanced().count).toBe(3);

      // But only one notification scheduled
      vi.advanceTimersByTime(100);
      expect(notificationCount).toBe(1);
    });
  });
});
