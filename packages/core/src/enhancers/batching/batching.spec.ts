import { describe, expect, it } from 'vitest';

import {
  batching,
  batching,
  flushBatchedUpdates,
  getBatchQueueSize,
  hasPendingUpdates,
  highPerformanceBatching,
} from './batching';

function createMockTree() {
  const state = { count: 0 } as Record<string, any>;

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

  tree.state = state;
  tree.$ = state;
  tree.bind =
    (_: unknown) =>
    (...a: unknown[]) =>
      tree(...(a as any));
  tree.destroy = () => void 0;

  return tree as any;
}

describe('batching enhancer', () => {
  it('exports factory functions and helpers', () => {
    expect(typeof batching).toBe('function');
    expect(typeof batching).toBe('function');
    expect(typeof highPerformanceBatching).toBe('function');
    expect(typeof batching()).toBe('function');

    // helpers callable
    expect(typeof flushBatchedUpdates).toBe('function');
    expect(typeof hasPendingUpdates).toBe('function');
    expect(typeof getBatchQueueSize).toBe('function');

    // initial state
    expect(hasPendingUpdates()).toBe(false);
    expect(getBatchQueueSize()).toBe(0);
  });

  it('disabled enhancer exposes batch method and does not throw', () => {
    const tree = createMockTree();
    const enhanced = batching({ enabled: false })(tree as any) as any;

    expect(typeof enhanced.batch).toBe('function');

    // call batch and flush helpers should be safe
    enhanced.batch(() => enhanced({ count: 1 }));
    flushBatchedUpdates();
  });
});
// Moved from lib/batching.spec.ts
// ...existing batching.spec.ts content will be placed here...
