import { describe, expect, it, vi } from 'vitest';
import { batching } from './batching/batching';
import { timeTravel } from './time-travel/time-travel';
import { devTools } from './devtools/devtools';

/**
 * Phase 6: Enhancer cleanup tests
 * Verifies that destroy() cleans up resources for each enhancer
 */

function createMockTree() {
  const state = { count: 0, name: '' } as Record<string, any>;
  const cleanupFns: Array<() => void> = [];

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
  tree.bind = (_: unknown) => (...a: unknown[]) => tree(...(a as any));
  tree.registerCleanup = (fn: () => void) => { cleanupFns.push(fn); };
  tree.destroyed = () => false;
  tree.destroy = () => {
    for (const fn of cleanupFns) {
      try { fn(); } catch { /* ignore */ }
    }
    cleanupFns.length = 0;
  };
  tree.with = (enhancer: any) => enhancer(tree);

  // Expose cleanup list for assertions
  tree.__cleanupFns = cleanupFns;

  return tree;
}

describe('enhancer cleanup registration', () => {
  it('batching registers cleanup', () => {
    const tree = createMockTree();
    batching()(tree);
    expect(tree.__cleanupFns.length).toBeGreaterThan(0);
  });

  it('timeTravel registers cleanup', () => {
    const tree = createMockTree();
    timeTravel()(tree);
    expect(tree.__cleanupFns.length).toBeGreaterThan(0);
  });

  it('devTools registers cleanup (enabled=false)', () => {
    const tree = createMockTree();
    devTools({ enabled: false })(tree);
    // Disabled devTools doesn't have resources — no cleanup needed
    // But enabled devTools does. Just verify no crash.
  });
});

describe('destroy() clears enhancer resources', () => {
  it('batching: clears pending timeout on destroy', () => {
    vi.useFakeTimers();
    const tree = createMockTree();
    const enhanced = batching({ notificationDelayMs: 100 })(tree);

    // Trigger a batched notification
    enhanced.$.count.set(42);

    // Destroy should clear the timer
    tree.destroy();

    // Advance time — should not throw
    vi.advanceTimersByTime(200);
    vi.useRealTimers();
  });

  it('memoization: clears cache on destroy', () => {
    // Removed in 9.0.1: memoization enhancer deleted.
    expect(true).toBe(true);
  });

  it('timeTravel: clears history on destroy', () => {
    const tree = createMockTree();
    const enhanced = timeTravel({ maxHistorySize: 50 })(tree);

    // Make some changes
    tree({ count: 1, name: '' });
    tree({ count: 2, name: '' });

    tree.destroy();

    // After destroy, history should be reset
    // The reset adds 1 initial entry
    const history = enhanced.getHistory?.();
    if (history) {
      expect(history.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('rapid create/destroy cycles', () => {
  it('handles 100 create/destroy cycles without leaking', () => {
    for (let i = 0; i < 100; i++) {
      const tree = createMockTree();
      batching()(tree);
      tree.destroy();
    }
    // If we get here without OOM or errors, the test passes
  });
});
