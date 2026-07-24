import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { batching } from './batching';
import { signalTree } from '../../lib/signal-tree';

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
   *
   * (v12 removed the legacy global getBatchQueueSize/hasPendingUpdates/
   * flushBatchedUpdates helpers — pending state is observed via the tree's
   * hasPendingNotifications()/flushNotifications() methods.)
   */
  it('applies updates synchronously (v6.1.0+ behavior)', () => {
    const tree = createFakeTree({ count: 0 });
    const enhanced = batching()(tree as any) as any;

    // Update is applied immediately (synchronous!)
    enhanced({ count: 1 });

    // Value is already updated - no queue
    expect(enhanced().count).toBe(1);
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

  describe('setter wrapping reaches callable accessors', () => {
    // Regression: NodeAccessors are typeof 'function', and wrapSignalSetters
    // used to skip non-objects entirely — so no leaf setter was ever wrapped
    // and coalesce() never deduped. Count actual writes by wrapping the raw
    // setter BEFORE the enhancer, then assert coalesce applies only the last.
    it('coalesce() dedupes same-path writes down to one applied write', () => {
      const base = signalTree({ counter: 0 });
      let applied = 0;
      const counter = base.$.counter as unknown as { set(v: number): void };
      const rawSet = counter.set.bind(counter);
      counter.set = (v: number) => {
        applied++;
        rawSet(v);
      };

      const tree = base.with(
        batching({ enabled: true, notificationDelayMs: 0 })
      );
      tree.coalesce(() => {
        for (let i = 0; i < 100; i++) tree.$.counter.set(i + 1);
      });

      expect(tree.$.counter()).toBe(100);
      expect(applied).toBe(1);
    });

    it('wraps nested leaf setters too', () => {
      const base = signalTree({ a: { b: { value: 0 } } });
      let applied = 0;
      const leaf = base.$.a.b.value as unknown as { set(v: number): void };
      const rawSet = leaf.set.bind(leaf);
      leaf.set = (v: number) => {
        applied++;
        rawSet(v);
      };

      const tree = base.with(
        batching({ enabled: true, notificationDelayMs: 0 })
      );
      tree.coalesce(() => {
        tree.$.a.b.value.set(1);
        tree.$.a.b.value.set(2);
        tree.$.a.b.value.set(3);
      });

      expect(tree.$.a.b.value()).toBe(3);
      expect(applied).toBe(1);
    });
  });
});
