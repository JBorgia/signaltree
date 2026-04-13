import { describe, expect, it } from 'vitest';
import { signalTree } from './signal-tree';
import { SIGNAL_TREE_CONSTANTS } from './constants';

/**
 * Phase 6: Lazy tree threshold behavior tests
 * Verifies that the lazy/eager signal creation switches at the LAZY_THRESHOLD.
 */

describe('Lazy tree threshold behavior', () => {
  it('should use eager signals for small state (below threshold)', () => {
    // LAZY_THRESHOLD is 50 estimated nodes
    const smallState: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      smallState[`key_${i}`] = i;
    }

    const tree = signalTree(smallState);

    // Should still work — eager mode
    expect(tree.$.key_0()).toBe(0);
    expect(tree.$.key_9()).toBe(9);

    tree.$.key_0.set(100);
    expect(tree.$.key_0()).toBe(100);

    tree.destroy();
  });

  it('should use lazy signals for large state (above threshold)', () => {
    // Create state well above LAZY_THRESHOLD (50)
    const largeState: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 20; i++) {
      const nested: Record<string, number> = {};
      for (let j = 0; j < 10; j++) {
        nested[`val_${j}`] = j;
      }
      largeState[`group_${i}`] = nested;
    }

    const tree = signalTree(largeState);

    // Should still work — lazy mode
    expect(tree.$.group_0.val_0()).toBe(0);
    expect(tree.$.group_19.val_9()).toBe(9);

    tree.$.group_0.val_0.set(999);
    expect(tree.$.group_0.val_0()).toBe(999);

    tree.destroy();
  });

  it('should respect explicit useLazySignals: true override', () => {
    const smallState = { a: 1, b: 2 };

    const tree = signalTree(smallState, { useLazySignals: true });

    expect(tree.$.a()).toBe(1);
    tree.$.a.set(10);
    expect(tree.$.a()).toBe(10);

    tree.destroy();
  });

  it('should respect explicit useLazySignals: false override', () => {
    // Large state but forced eager
    const largeState: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      largeState[`k_${i}`] = i;
    }

    const tree = signalTree(largeState, { useLazySignals: false });

    expect(tree.$.k_0()).toBe(0);
    tree.$.k_50.set(500);
    expect(tree.$.k_50()).toBe(500);

    tree.destroy();
  });

  it('should disable lazy mode when debugMode is true', () => {
    const largeState: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      largeState[`k_${i}`] = i;
    }

    // debugMode should force eager even for large state
    const tree = signalTree(largeState, { debugMode: true });

    expect(tree.$.k_0()).toBe(0);
    tree.$.k_99.set(999);
    expect(tree.$.k_99()).toBe(999);

    tree.destroy();
  });

  it('should confirm LAZY_THRESHOLD constant is 50', () => {
    expect(SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD).toBe(50);
  });
});
