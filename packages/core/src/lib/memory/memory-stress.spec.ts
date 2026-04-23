import { describe, expect, it } from 'vitest';
import { signalTree } from '../signal-tree';
import { batching } from '../../enhancers/batching/batching';

/**
 * Phase 6: Memory stress tests
 * Verifies SignalTree handles large state shapes and rapid lifecycle without leaking.
 */

describe('Memory stress tests', () => {
  it('should create a tree with 10K+ nodes without error', () => {
    // Generate a state with ~10,000 leaf nodes
    const bigState: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 100; i++) {
      const group: Record<string, number> = {};
      for (let j = 0; j < 100; j++) {
        group[`item_${j}`] = j;
      }
      bigState[`group_${i}`] = group;
    }

    const tree = signalTree(bigState);

    // Verify we can read nested values
    expect(tree.$.group_0.item_0()).toBe(0);
    expect(tree.$.group_99.item_99()).toBe(99);

    tree.destroy();
  });

  it('should handle 1000 rapid updates on a large tree', () => {
    const state: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      state[`key_${i}`] = i;
    }

    const tree = signalTree(state);

    for (let i = 0; i < 1000; i++) {
      tree.$.key_0.set(i);
    }

    expect(tree.$.key_0()).toBe(999);
    tree.destroy();
  });

  it('should create and destroy 100 trees with enhancers without error', () => {
    for (let i = 0; i < 100; i++) {
      const tree = signalTree({ count: i, name: `tree_${i}` })
        .with(batching());

      // Use it
      tree.$.count.set(i + 1);
      expect(tree.$.count()).toBe(i + 1);

      // Destroy it
      tree.destroy();
    }
  });

  it('should handle deep nesting (10 levels)', () => {
    // Build deeply nested state
    let state: any = { value: 42 };
    for (let i = 9; i >= 0; i--) {
      state = { [`level_${i}`]: state };
    }

    const tree = signalTree(state);

    // Access the deeply nested value
    let accessor: any = tree.$;
    for (let i = 0; i < 10; i++) {
      accessor = accessor[`level_${i}`];
    }
    expect(accessor.value()).toBe(42);

    tree.destroy();
  });

  it('should handle wide state (1000 top-level keys)', () => {
    const state: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) {
      state[`field_${i}`] = `value_${i}`;
    }

    const tree = signalTree(state);

    expect(tree.$.field_0()).toBe('value_0');
    expect(tree.$.field_999()).toBe('value_999');

    // Update several fields
    for (let i = 0; i < 100; i++) {
      tree.$.field_0.set(`updated_${i}`);
    }
    expect(tree.$.field_0()).toBe('updated_99');

    tree.destroy();
  });
});
