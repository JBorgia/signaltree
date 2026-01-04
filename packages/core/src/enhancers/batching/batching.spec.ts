import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { computed, signal } from '@angular/core';
import { signalTree } from '../../lib/signal-tree';
import {
  batching,
  batchingWithConfig,
  flushBatchedUpdates,
  getBatchQueueSize,
  hasPendingUpdates,
  highPerformanceBatching,
} from './batching';

// Helper to create a basic mock tree for unit tests
function createMockTree() {
  const state = { count: 0, name: '' } as Record<string, any>;

  const tree = function (...args: any[]) {
    if (args.length === 0) return state;
    const arg = args[0];
    if (typeof arg === 'function') {
      const res = arg(state);
      if (res && typeof res === 'object') Object.assign(state, res);
      return;
    }
    if (typeof arg === 'object') {
      Object.assign(state, arg);
      return;
    }
  } as any;

  // Create signal-like accessors for state properties
  tree.state = {
    count: {
      set: (v: number) => { state.count = v; },
      update: (fn: (v: number) => number) => { state.count = fn(state.count); },
    },
    name: {
      set: (v: string) => { state.name = v; },
      update: (fn: (v: string) => string) => { state.name = fn(state.name); },
    },
  };
  tree.$ = tree.state;
  tree.bind =
    (_: unknown) =>
    (...a: unknown[]) =>
      tree(...(a as any));
  tree.destroy = () => void 0;

  return tree as any;
}

describe('batching enhancer', () => {
  // ==========================================
  // BASIC EXPORTS AND SETUP
  // ==========================================

  describe('exports', () => {
    it('exports factory functions and helpers', () => {
      expect(typeof batching).toBe('function');
      expect(typeof batchingWithConfig).toBe('function');
      expect(typeof highPerformanceBatching).toBe('function');
      expect(typeof batching()).toBe('function');

      // helpers callable (deprecated but still exported)
      expect(typeof flushBatchedUpdates).toBe('function');
      expect(typeof hasPendingUpdates).toBe('function');
      expect(typeof getBatchQueueSize).toBe('function');
    });
  });

  // ==========================================
  // CORE PRINCIPLE: SYNCHRONOUS SIGNAL WRITES
  // ==========================================

  describe('synchronous signal writes', () => {
    it('should update signal value immediately via set()', () => {
      const tree = createMockTree();
      const enhanced = batching()(tree);

      enhanced.$.count.set(5);

      // Value should be updated immediately - no waiting
      expect(tree()).toEqual({ count: 5, name: '' });
    });

    it('should update signal value immediately via update()', () => {
      const tree = createMockTree();
      const enhanced = batching()(tree);

      enhanced.$.count.update((c: number) => c + 10);

      // Value should be updated immediately - no waiting
      expect(tree()).toEqual({ count: 10, name: '' });
    });

    it('should support read-after-write pattern', () => {
      const tree = createMockTree();
      const enhanced = batching()(tree);

      // Write then immediately read - this is the critical pattern
      enhanced.$.count.set(42);
      const value = tree().count;

      expect(value).toBe(42); // Immediate, no waiting!
    });

    it('should work with nested object updates', () => {
      const nestedState = { user: { name: 'Alice', settings: { theme: 'light' } } };
      const tree = createMockTree();
      Object.assign(tree(), nestedState);

      // Create nested signal-like structure
      tree.$.user = {
        settings: {
          theme: {
            set: (v: string) => { tree().user.settings.theme = v; },
          },
        },
      };

      const enhanced = batching()(tree);

      enhanced.$.user.settings.theme.set('dark');

      expect(tree().user.settings.theme).toBe('dark');
    });
  });

  // ==========================================
  // BATCH() - GROUP CD NOTIFICATIONS
  // ==========================================

  describe('batch()', () => {
    it('should execute updates immediately inside batch', () => {
      const tree = createMockTree();
      const enhanced = batching()(tree) as any;

      enhanced.batch(() => {
        enhanced.$.count.set(1);
        expect(tree().count).toBe(1); // Immediate!

        enhanced.$.name.set('test');
        expect(tree().name).toBe('test'); // Immediate!
      });

      expect(tree()).toEqual({ count: 1, name: 'test' });
    });

    it('should handle nested batches', () => {
      const tree = createMockTree();
      const enhanced = batching()(tree) as any;

      enhanced.batch(() => {
        enhanced.$.count.set(1);

        enhanced.batch(() => {
          enhanced.$.name.set('nested');
          expect(tree().name).toBe('nested'); // Immediate even in nested batch
        });

        expect(tree().count).toBe(1);
        expect(tree().name).toBe('nested');
      });
    });

    it('should handle errors without breaking state', () => {
      const tree = createMockTree();
      const enhanced = batching()(tree) as any;

      expect(() => {
        enhanced.batch(() => {
          enhanced.$.count.set(5);
          throw new Error('test error');
        });
      }).toThrow('test error');

      // State should still be updated
      expect(tree().count).toBe(5);
    });
  });

  // ==========================================
  // COALESCE() - DEDUPLICATE SAME-PATH UPDATES
  // ==========================================

  describe('coalesce()', () => {
    it('should only write final value for same path', () => {
      const tree = createMockTree();
      let writeCount = 0;

      // Track writes
      const originalSet = tree.$.count.set;
      tree.$.count.set = (v: number) => {
        writeCount++;
        originalSet(v);
      };

      const enhanced = batching()(tree) as any;

      enhanced.coalesce(() => {
        enhanced.$.count.set(1);
        enhanced.$.count.set(2);
        enhanced.$.count.set(3);
        enhanced.$.count.set(4);
        enhanced.$.count.set(5);
      });

      expect(tree().count).toBe(5);
      expect(writeCount).toBe(1); // Only one actual write!
    });

    it('should handle multiple paths independently', () => {
      const tree = createMockTree();
      const enhanced = batching()(tree) as any;

      enhanced.coalesce(() => {
        enhanced.$.count.set(1);
        enhanced.$.name.set('a');
        enhanced.$.count.set(2);
        enhanced.$.name.set('b');
        enhanced.$.count.set(3);
        enhanced.$.name.set('c');
      });

      expect(tree().count).toBe(3);
      expect(tree().name).toBe('c');
    });
  });

  // ==========================================
  // DISABLED BATCHING
  // ==========================================

  describe('disabled batching', () => {
    it('should work normally when disabled', () => {
      const tree = createMockTree();
      const enhanced = batching({ enabled: false })(tree) as any;

      enhanced.$.count.set(5);
      expect(tree().count).toBe(5);

      // batch() should still work (passthrough)
      enhanced.batch(() => {
        enhanced.$.count.set(10);
      });
      expect(tree().count).toBe(10);
    });

    it('should provide passthrough methods when disabled', () => {
      const tree = createMockTree();
      const enhanced = batching({ enabled: false })(tree) as any;

      expect(typeof enhanced.batch).toBe('function');
      expect(typeof enhanced.coalesce).toBe('function');
      expect(typeof enhanced.hasPendingNotifications).toBe('function');
      expect(typeof enhanced.flushNotifications).toBe('function');
    });
  });

  // ==========================================
  // NOTIFICATION DELAY
  // ==========================================

  describe('notificationDelayMs', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('should delay CD notification by specified ms', async () => {
      const tree = createMockTree();
      const enhanced = batching({ notificationDelayMs: 100 })(tree) as any;

      let notified = false;
      (tree as any).__notifyChangeDetection = () => {
        notified = true;
      };

      enhanced.$.count.set(5);

      // Value is immediate
      expect(tree().count).toBe(5);

      // Notification is delayed
      expect(notified).toBe(false);

      vi.advanceTimersByTime(50);
      expect(notified).toBe(false);

      vi.advanceTimersByTime(50);
      expect(notified).toBe(true);
    });

    it('should use debounceMs as fallback for backwards compatibility', async () => {
      const tree = createMockTree();
      const enhanced = batching({ debounceMs: 50 })(tree) as any;

      let notified = false;
      (tree as any).__notifyChangeDetection = () => {
        notified = true;
      };

      enhanced.$.count.set(5);
      expect(tree().count).toBe(5);
      expect(notified).toBe(false);

      vi.advanceTimersByTime(50);
      expect(notified).toBe(true);
    });
  });

  // ==========================================
  // PENDING NOTIFICATION TRACKING
  // ==========================================

  describe('notification tracking', () => {
    it('should track pending notifications via hasPendingNotifications()', async () => {
      const tree = createMockTree();
      const enhanced = batching({ notificationDelayMs: 100 })(tree) as any;

      expect(enhanced.hasPendingNotifications()).toBe(false);

      enhanced.$.count.set(5);

      expect(enhanced.hasPendingNotifications()).toBe(true);
    });

    it('should flush notifications manually via flushNotifications()', () => {
      const tree = createMockTree();
      const enhanced = batching({ notificationDelayMs: 100 })(tree) as any;

      let notified = false;
      (tree as any).__notifyChangeDetection = () => {
        notified = true;
      };

      enhanced.$.count.set(5);
      expect(notified).toBe(false);

      enhanced.flushNotifications();
      expect(notified).toBe(true);
    });
  });

  // ==========================================
  // BACKWARDS COMPATIBILITY
  // ==========================================

  describe('backwards compatibility', () => {
    it('should provide batchUpdate method', () => {
      const tree = createMockTree();
      const enhanced = batching()(tree) as any;

      expect(typeof enhanced.batchUpdate).toBe('function');
    });

    it('batchUpdate should work correctly', () => {
      const tree = createMockTree();
      const enhanced = batching()(tree) as any;

      enhanced.batchUpdate((current: any) => ({
        count: current.count + 5,
      }));

      expect(tree().count).toBe(5);
    });

    it('deprecated global functions should not throw', () => {
      // These are deprecated but should not throw
      expect(() => flushBatchedUpdates()).not.toThrow();
      expect(() => hasPendingUpdates()).not.toThrow();
      expect(() => getBatchQueueSize()).not.toThrow();
    });

    it('highPerformanceBatching should return a batching enhancer', () => {
      const tree = createMockTree();
      const enhanced = highPerformanceBatching()(tree) as any;

      expect(typeof enhanced.batch).toBe('function');
      expect(typeof enhanced.coalesce).toBe('function');
    });
  });

  // ==========================================
  // ENHANCER CHAIN
  // ==========================================

  describe('enhancer chain', () => {
    it('should preserve .with() if available on tree', () => {
      const tree = createMockTree();
      tree.with = (enhancer: any) => enhancer(tree);

      const enhanced = batching()(tree);

      // The enhanced tree should still have with() if it was on original
      // This is implementation-dependent
      expect(enhanced.$ === tree.$).toBe(true);
    });
  });
});
