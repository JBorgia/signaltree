import { ChangeType, DiffEngine } from './diff-engine';

describe('DiffEngine', () => {
  let engine: DiffEngine;

  beforeEach(() => {
    engine = new DiffEngine();
  });

  describe('primitive values', () => {
    it('should detect primitive changes', () => {
      const current = { value: 42 };
      const updates = { value: 43 };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0]).toEqual({
        type: ChangeType.UPDATE,
        path: ['value'],
        value: 43,
        oldValue: 42,
      });
    });

    it('should detect no changes when values are equal', () => {
      const current = { value: 42 };
      const updates = { value: 42 };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(false);
      expect(diff.changes).toHaveLength(0);
    });

    it('should detect additions', () => {
      const current = {};
      const updates = { newField: 'hello' };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes[0].type).toBe(ChangeType.ADD);
      expect(diff.changes[0].value).toBe('hello');
    });

    it('should detect null values correctly', () => {
      const current = { value: null };
      const updates = { value: 'not null' };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes[0].oldValue).toBeNull();
      expect(diff.changes[0].value).toBe('not null');
    });
  });

  describe('nested objects', () => {
    it('should detect deep changes', () => {
      const current = {
        user: {
          profile: {
            name: 'Alice',
            age: 30,
          },
        },
      };

      const updates = {
        user: {
          profile: {
            name: 'Alice',
            age: 31, // Changed
          },
        },
      };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0]).toEqual({
        type: ChangeType.UPDATE,
        path: ['user', 'profile', 'age'],
        value: 31,
        oldValue: 30,
      });
    });

    it('should detect multiple changes', () => {
      const current = {
        name: 'Alice',
        age: 30,
        city: 'NYC',
      };

      const updates = {
        name: 'Alice',
        age: 31, // Changed
        city: 'SF', // Changed
      };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes).toHaveLength(2);

      const paths = diff.changes.map((c) => c.path.join('.'));
      expect(paths).toContain('age');
      expect(paths).toContain('city');
    });

    it('should handle partial updates', () => {
      const current = {
        user: {
          name: 'Alice',
          age: 30,
          email: 'alice@example.com',
        },
      };

      const updates = {
        user: {
          age: 31, // Only updating age
        },
      };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].path).toEqual(['user', 'age']);
    });
  });

  describe('arrays', () => {
    it('should detect array element changes (ordered)', () => {
      const current = { items: [1, 2, 3] };
      const updates = { items: [1, 4, 3] }; // Changed index 1

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0]).toEqual({
        type: ChangeType.UPDATE,
        path: ['items', 1],
        value: 4,
        oldValue: 2,
      });
    });

    it('should detect array additions', () => {
      const current = { items: [1, 2] };
      const updates = { items: [1, 2, 3] }; // Added element

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      const addition = diff.changes.find((c) => c.type === ChangeType.ADD);
      expect(addition).toBeDefined();
      expect(addition?.path).toEqual(['items', 2]);
      expect(addition?.value).toBe(3);
    });

    it('should handle empty arrays', () => {
      const current = { items: [] };
      const updates = { items: [1] };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes[0].type).toBe(ChangeType.ADD);
    });

    it('should handle nested arrays', () => {
      const current = {
        matrix: [
          [1, 2],
          [3, 4],
        ],
      };

      const updates = {
        matrix: [
          [1, 2],
          [3, 5], // Changed [1][1]
        ],
      };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes[0].path).toEqual(['matrix', 1, 1]);
      expect(diff.changes[0].value).toBe(5);
    });
  });

  describe('type changes', () => {
    it('should detect object to primitive as update', () => {
      const current = { value: { nested: 'object' } };
      const updates = { value: 'string' }; // Type changed

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      // Nested object to primitive is UPDATE, not REPLACE
      expect(diff.changes[0].type).toBe(ChangeType.UPDATE);
      expect(diff.changes[0].path).toEqual(['value']);
    });

    it('should replace object with array', () => {
      const current = { data: { a: 1 } };
      const updates = { data: [1, 2, 3] };

      const diff = engine.diff(current, updates);

      expect(diff.changes[0].type).toBe(ChangeType.REPLACE);
    });

    it('should replace array with object', () => {
      const current = { data: [1, 2, 3] };
      const updates = { data: { a: 1 } };

      const diff = engine.diff(current, updates);

      expect(diff.changes[0].type).toBe(ChangeType.REPLACE);
    });
  });

  describe('options', () => {
    it('should respect maxDepth option', () => {
      const current = {
        level1: {
          level2: {
            level3: {
              level4: {
                deep: 'value',
              },
            },
          },
        },
      };

      const updates = {
        level1: {
          level2: {
            level3: {
              level4: {
                deep: 'changed',
              },
            },
          },
        },
      };

      const diff = engine.diff(current, updates, { maxDepth: 2 });

      // Should stop at depth 2, so level3+ changes won't be detected
      expect(diff.changes).toHaveLength(0);
    });

    it('should detect deletions when enabled', () => {
      const current = { a: 1, b: 2, c: 3 };
      const updates = { a: 1, b: 2 }; // 'c' deleted

      const diff = engine.diff(current, updates, { detectDeletions: true });

      const deletion = diff.changes.find((c) => c.type === ChangeType.DELETE);
      expect(deletion).toBeDefined();
      expect(deletion?.path).toEqual(['c']);
      expect(deletion?.oldValue).toBe(3);
    });

    it('should not detect deletions by default', () => {
      const current = { a: 1, b: 2 };
      const updates = { a: 1 }; // 'b' deleted

      const diff = engine.diff(current, updates);

      const deletion = diff.changes.find((c) => c.type === ChangeType.DELETE);
      expect(deletion).toBeUndefined();
    });

    it('should use custom equality function', () => {
      const current = { value: '42' };
      const updates = { value: 42 }; // Different type, same value

      // Default behavior - detects change
      const diff1 = engine.diff(current, updates);
      expect(diff1.hasChanges).toBe(true);

      // Custom equality - coerce types
      const diff2 = engine.diff(current, updates, {
        equalityFn: (a, b) => String(a) === String(b),
      });
      expect(diff2.hasChanges).toBe(false);
    });

    it('should handle ignoreArrayOrder option', () => {
      const current = { items: [1, 2, 3] };
      const updates = { items: [3, 2, 1] }; // Same values, different order

      // With ignoreArrayOrder, should detect no changes
      const diff = engine.diff(current, updates, { ignoreArrayOrder: true });

      expect(diff.hasChanges).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle circular references', () => {
      interface Circular {
        a: number;
        self?: Circular;
      }
      const circular: Circular = { a: 1 };
      circular.self = circular;

      const updates = { a: 2, self: circular };

      // Should not throw or hang
      expect(() => {
        engine.diff(circular, updates);
      }).not.toThrow();
    });

    it('should handle undefined values', () => {
      const current = { value: undefined };
      const updates = { value: 'defined' };

      const diff = engine.diff(current, updates);

      expect(diff.hasChanges).toBe(true);
      expect(diff.changes[0].oldValue).toBeUndefined();
    });
  });

  describe('performance', () => {
    it('should handle large objects efficiently', () => {
      const current = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: i,
        })),
      };

      const updates = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          value: i === 500 ? 999 : i, // Only change one item
        })),
      };

      const start = performance.now();
      const diff = engine.diff(current, updates);
      const duration = performance.now() - start;

      // Should detect only the one change
      expect(diff.changes).toHaveLength(1);
      expect(diff.changes[0].path).toEqual(['items', 500, 'value']);

      // Should be reasonably fast
      expect(duration).toBeLessThan(100); // < 100ms for 1000 items
    });

    it('should handle deep nesting efficiently', () => {
      interface DeepNested {
        value?: number;
        nested?: DeepNested;
      }
      let current: DeepNested = { value: 0 };
      let updates: DeepNested = { value: 0 };

      // Create 50 levels deep
      for (let i = 0; i < 50; i++) {
        current = { nested: current };
        updates = { nested: updates };
      }

      // Change the deepest value
      let deepUpdates = updates;
      for (let i = 0; i < 50; i++) {
        if (i === 49 && deepUpdates.nested) {
          deepUpdates.nested.value = 1;
        } else if (deepUpdates.nested) {
          deepUpdates = deepUpdates.nested;
        }
      }

      const start = performance.now();
      const diff = engine.diff(current, updates);
      const duration = performance.now() - start;

      expect(diff.hasChanges).toBe(true);
      expect(duration).toBeLessThan(50); // < 50ms for 50 levels
    });
  });
});
