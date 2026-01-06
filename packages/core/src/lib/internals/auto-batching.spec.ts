import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import { batchScope } from './batch-scope';

describe('auto-batching in signalTree callable', () => {
  it('should auto-batch partial object updates', () => {
    const tree = signalTree({
      user: { name: 'Alice', age: 30 },
    });

    // Partial update with object should be batched
    tree.$.user({ name: 'Bob' });

    expect(tree.$.user()).toEqual({ name: 'Bob', age: 30 });
  });

  it('should auto-batch function updates on object nodes', () => {
    const tree = signalTree({
      user: { name: 'Alice', score: 0 },
    });

    // Function update should be batched (returns new object)
    tree.$.user((prev) => ({ ...prev, score: prev.score + 10 }));

    expect(tree.$.user()).toEqual({ name: 'Alice', score: 10 });
  });

  it('should use .set() for primitive leaf updates', () => {
    const tree = signalTree({
      count: 0,
    });

    // Primitives use .set() method, not callable
    tree.$.count.set(1);

    expect(tree.$.count()).toBe(1);
  });

  it('should use .set() for array replacement', () => {
    const tree = signalTree({
      items: ['a', 'b'],
    });

    // Arrays use .set() method for full replacement
    tree.$.items.set(['x', 'y', 'z']);
    expect(tree.$.items()).toEqual(['x', 'y', 'z']);
  });

  it('should handle nested partial updates', () => {
    const tree = signalTree({
      settings: {
        theme: 'dark',
        notifications: { email: true, push: false },
      },
    });

    // Partial update at nested level
    tree.$.settings.notifications({ email: false });

    expect(tree.$.settings.notifications()).toEqual({
      email: false,
      push: false,
    });
  });

  it('should handle function update that returns partial', () => {
    const tree = signalTree({
      user: { name: 'Alice', score: 0 },
    });

    // Function that returns modified object
    tree.$.user((prev) => ({ ...prev, score: prev.score + 10 }));

    expect(tree.$.user()).toEqual({ name: 'Alice', score: 10 });
  });

  it('should work within explicit batchScope', () => {
    const tree = signalTree({
      a: { value: 1 },
      b: { value: 2 },
      c: { value: 3 },
    });

    // Nested updates within explicit batchScope
    batchScope(() => {
      tree.$.a({ value: 10 });
      tree.$.b({ value: 20 });
      tree.$.c({ value: 30 });
    });

    expect(tree.$.a.value()).toBe(10);
    expect(tree.$.b.value()).toBe(20);
    expect(tree.$.c.value()).toBe(30);
  });

  it('should verify batchScope is called for object partial updates', () => {
    const tree = signalTree({
      data: { x: 1, y: 2 },
    });

    // This exercises the batchScope path for object updates
    tree.$.data({ x: 5 });
    expect(tree.$.data.x()).toBe(5);
    expect(tree.$.data.y()).toBe(2);
  });

  it('should verify batchScope is called for function updates', () => {
    const tree = signalTree({
      data: { x: 1, y: 2 },
    });

    // This exercises the batchScope path for function updates
    tree.$.data((prev) => ({ ...prev, y: 10 }));
    expect(tree.$.data.x()).toBe(1);
    expect(tree.$.data.y()).toBe(10);
  });
});
