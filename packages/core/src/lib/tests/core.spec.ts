/**
 * Core SignalTree functionality tests
 * Tests basic tree creation, state management, and core operations
 */
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { signalTree } from '../signal-tree';

describe('SignalTree Core', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('Tree Creation', () => {
    it('should create a basic signal tree', () => {
      const tree = signalTree({ count: 0, user: { name: 'John' } });

      expect(tree).toBeDefined();
      expect(tree.state).toBeDefined();
      expect(tree.$).toBeDefined();
      expect(tree.state).toBe(tree.$);
    });

    it('should handle null and undefined gracefully', () => {
      expect(() => signalTree(null as unknown as object)).toThrow();
      expect(() => signalTree(undefined as unknown as object)).toThrow();
    });

    it('should create tree from arrays', () => {
      const arrayTree = signalTree([1, 2, 3]);
      // The current unwrap implementation returns an object with numeric keys for arrays
      expect(arrayTree.unwrap()).toEqual({ 0: 1, 1: 2, 2: 3 });
      expect(arrayTree.state[0]()).toBe(1);
      expect(arrayTree.state[1]()).toBe(2);
      expect(arrayTree.state[2]()).toBe(3);
    });
  });

  describe('State Access', () => {
    it('should unwrap the current state', () => {
      const initialState = { count: 0, user: { name: 'John' } };
      const tree = signalTree(initialState);

      const unwrapped = tree.unwrap();
      expect(unwrapped).toEqual(initialState);
    });

    it('should provide access to individual signals', () => {
      const tree = signalTree({ count: 0, user: { name: 'John' } });

      expect(tree.state.count()).toBe(0);
      expect(tree.state.user.name()).toBe('John');
    });

    it('should handle deep nested access', () => {
      const tree = signalTree({
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      });

      expect(tree.state.level1.level2.level3.value()).toBe('deep');
    });
  });

  describe('State Updates', () => {
    it('should update state using update method', () => {
      const tree = signalTree({ count: 0, user: { name: 'John' } });

      tree.update((state) => ({ count: state.count + 1 }));

      const unwrapped = tree.unwrap();
      expect(unwrapped.count).toBe(1);
      expect(unwrapped.user.name).toBe('John');
    });

    it('should update individual signals', () => {
      const tree = signalTree({ count: 0, user: { name: 'John' } });

      tree.state.count.set(5);
      tree.state.user.name.set('Jane');

      expect(tree.state.count()).toBe(5);
      expect(tree.state.user.name()).toBe('Jane');
    });

    it('should handle nested object updates', () => {
      const tree = signalTree({ user: { name: 'John', age: 30 } });

      tree.state.user.update((user) => ({ ...user, age: 31 }));

      expect(tree.state.user.name()).toBe('John');
      expect(tree.state.user.age()).toBe(31);
    });

    it('should handle array updates', () => {
      const tree = signalTree({ items: [1, 2, 3] });

      tree.state.items.update((items) => [...items, 4]);

      expect(tree.state.items()).toEqual([1, 2, 3, 4]);
    });
  });

  describe('Signal Reactivity', () => {
    it('should maintain reactivity after updates', () => {
      const tree = signalTree({ count: 0 });

      let callCount = 0;
      const derived = signal(() => {
        callCount++;
        return tree.state.count() * 2;
      });

      expect(derived()).toBe(0);
      expect(callCount).toBe(1);

      tree.state.count.set(5);
      expect(derived()).toBe(10);
      expect(callCount).toBe(2);
    });

    it('should handle multiple signal dependencies', () => {
      const tree = signalTree({ a: 1, b: 2 });

      const sum = signal(() => tree.state.a() + tree.state.b());

      expect(sum()).toBe(3);

      tree.state.a.set(5);
      expect(sum()).toBe(7);

      tree.state.b.set(10);
      expect(sum()).toBe(15);
    });
  });
});
