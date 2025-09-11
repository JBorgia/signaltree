import { signal } from '@angular/core';

import { signalTree } from './signal-tree';
import { unwrap } from './utils';

describe('Utils', () => {
  describe('unwrap function', () => {
    it('should unwrap individual signals', () => {
      const stringSignal = signal('hello');
      const numberSignal = signal(42);
      const booleanSignal = signal(true);
      const objectSignal = signal({ key: 'value' });
      const arraySignal = signal([1, 2, 3]);

      expect(unwrap(stringSignal)).toBe('hello');
      expect(unwrap(numberSignal)).toBe(42);
      expect(unwrap(booleanSignal)).toBe(true);
      expect(unwrap(objectSignal)).toEqual({ key: 'value' });
      expect(unwrap(arraySignal)).toEqual([1, 2, 3]);
    });

    it('should unwrap nested signal objects', () => {
      const tree = signalTree({
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark', notifications: true },
        array: [1, 2, 3],
      });

      // Test unwrapping nested objects
      const userUnwrapped = unwrap(tree.state.user);
      expect(userUnwrapped).toEqual({ name: 'John', age: 30 });

      const settingsUnwrapped = unwrap(tree.state.settings);
      expect(settingsUnwrapped).toEqual({ theme: 'dark', notifications: true });

      const arrayUnwrapped = unwrap(tree.state.array);
      expect(arrayUnwrapped).toEqual([1, 2, 3]);
    });

    it('should unwrap the entire signal tree', () => {
      const tree = signalTree({
        simple: 'string',
        number: 42,
        nested: {
          deep: {
            value: 'nested string',
            array: [1, 2, 3],
          },
        },
        array: ['a', 'b', 'c'],
      });

      const fullUnwrap = unwrap(tree.state);
      expect(fullUnwrap).toEqual({
        simple: 'string',
        number: 42,
        nested: {
          deep: {
            value: 'nested string',
            array: [1, 2, 3],
          },
        },
        array: ['a', 'b', 'c'],
      });
    });

    it('should handle deeply nested structures', () => {
      const tree = signalTree({
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep value',
                array: [1, 2, 3],
              },
            },
          },
        },
      });

      const unwrapped = unwrap(tree.state.level1.level2.level3);
      expect(unwrapped).toEqual({
        level4: {
          value: 'deep value',
          array: [1, 2, 3],
        },
      });
    });

    it('should remove set/update methods from unwrapped objects', () => {
      const tree = signalTree({
        user: { name: 'John', age: 30 },
        nested: {
          settings: { theme: 'dark', lang: 'en' },
        },
      });

      const userUnwrapped = unwrap<{ name: string; age: number }>(
        tree.state.user
      );
      const nestedUnwrapped = unwrap<{ settings: { theme: string } }>(
        tree.state.nested
      );
      const fullUnwrapped = unwrap<{
        user: { name: string; age: number };
        nested: { settings: { theme: string } };
      }>(tree.state);

      // Check that set/update methods are not present
      expect('set' in userUnwrapped).toBe(false);
      expect('update' in userUnwrapped).toBe(false);
      expect('set' in nestedUnwrapped).toBe(false);
      expect('update' in nestedUnwrapped).toBe(false);
      expect('set' in fullUnwrapped).toBe(false);
      expect('update' in fullUnwrapped).toBe(false);

      // But data properties should be present
      expect(userUnwrapped.name).toBe('John');
      expect(userUnwrapped.age).toBe(30);
      expect(nestedUnwrapped.settings.theme).toBe('dark');
    });

    it('should handle primitive values correctly', () => {
      expect(unwrap('string')).toBe('string');
      expect(unwrap(42)).toBe(42);
      expect(unwrap(true)).toBe(true);
      expect(unwrap(null)).toBe(null);
      expect(unwrap(undefined)).toBe(undefined);
      expect(unwrap([1, 2, 3])).toEqual([1, 2, 3]);
      expect(unwrap({ key: 'value' })).toEqual({ key: 'value' });
    });

    it('should handle edge cases with undefined and null', () => {
      const tree = signalTree({
        optional: undefined as string | undefined,
        nullable: null as string | null,
        nested: {
          optional: undefined as number | undefined,
          nullable: null as boolean | null,
        },
      });

      const unwrapped = unwrap(tree.state);
      expect(unwrapped.optional).toBe(undefined);
      expect(unwrapped.nullable).toBe(null);
      expect(unwrapped.nested.optional).toBe(undefined);
      expect(unwrapped.nested.nullable).toBe(null);
    });

    it('should handle arrays of objects', () => {
      const tree = signalTree({
        users: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
        ],
        matrix: [
          [1, 2],
          [3, 4],
        ],
      });

      const unwrapped = unwrap(tree.state);
      expect(unwrapped.users).toEqual([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ]);
      expect(unwrapped.matrix).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('should handle special object types', () => {
      const tree = signalTree({
        date: new Date('2024-01-01'),
        regex: /test/g,
        map: new Map([['key', 'value']]),
        setObject: new Set(['item1', 'item2']),
        uint8Array: new Uint8Array([1, 2, 3]),
      });

      const unwrapped = unwrap(tree.state);
      expect(unwrapped.date).toEqual(new Date('2024-01-01'));
      expect(unwrapped.regex).toEqual(/test/g);
      expect(unwrapped.map).toEqual(new Map([['key', 'value']]));
      expect(unwrapped.setObject).toEqual(new Set(['item1', 'item2']));
      expect(unwrapped.uint8Array).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should preserve function properties while filtering signal methods', () => {
      const tree = signalTree({
        data: {
          normalFunction: () => 'test',
          value: 42,
        },
      });

      const unwrapped = unwrap(tree.state.data);

      // Normal function should be preserved
      expect(typeof unwrapped.normalFunction).toBe('function');
      // Do not invoke here; unwrap returns plain values and callable typing may conflict at compile-time in tests
      expect(unwrapped.normalFunction).toBeDefined();

      // Data should be preserved
      expect(unwrapped.value).toBe(42);

      // But set/update methods should be filtered out
      expect('set' in unwrapped).toBe(false);
      expect('update' in unwrapped).toBe(false);
    });

    it('should handle symbol properties', () => {
      const testSymbol = Symbol('test');
      const tree = signalTree({
        [testSymbol]: 'symbol value',
        normal: 'normal value',
      });

      const unwrapped = unwrap(tree.state);
      expect(unwrapped[testSymbol]).toBe('symbol value');
      expect(unwrapped.normal).toBe('normal value');
    });

    it('should work with existing signals in the tree', () => {
      const existingSignal = signal('existing');
      const tree = signalTree({
        normal: 'normal value',
        existing: existingSignal,
        nested: {
          alsoExisting: signal({ deep: 'object' }),
        },
      });

      const unwrapped = unwrap(tree.state);
      expect(unwrapped.normal).toBe('normal value');
      expect(unwrapped.existing).toBe('existing');
      expect(unwrapped.nested.alsoExisting).toEqual({ deep: 'object' });
    });
  });
});
