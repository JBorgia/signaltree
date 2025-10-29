import { deepClone } from './deep-clone.js';
import { deepEqual, equal } from './deep-equal.js';
import { isBuiltInObject } from './is-built-in-object.js';
import { LRUCache } from './lru-cache.js';
import { clearParsePathCache, getParsePathCacheSize, parsePath, setParsePathCacheSize } from './parse-path.js';

describe('Shared utilities', () => {
  describe('deepClone', () => {
    it('deeply clones nested collections', () => {
      const original = {
        date: new Date('2023-08-01T00:00:00Z'),
        map: new Map([
          ['a', { count: 1 }],
          ['b', { count: 2 }],
        ]),
        set: new Set([1, 2, 3]),
        array: [{ foo: 'bar' }],
      };

      const cloned = deepClone(original);

      expect(cloned).not.toBe(original);
      expect(cloned.date).not.toBe(original.date);
      expect(cloned.map).not.toBe(original.map);
      expect(cloned.set).not.toBe(original.set);
      expect(cloned.array).not.toBe(original.array);

      expect(cloned.date?.getTime()).toBe(original.date?.getTime());
      expect(Array.from(cloned.map.entries())).toEqual(
        Array.from(original.map.entries())
      );
      expect(Array.from(cloned.set)).toEqual(Array.from(original.set));
      expect(cloned.array).toEqual(original.array);

      (cloned.array[0] as { foo: string }).foo = 'baz';
      expect(original.array[0].foo).toBe('bar');
    });

    it('handles circular references safely', () => {
      const original: { self?: unknown } = {};
      original.self = original;

      const cloned = deepClone(original) as { self?: unknown };

      expect(cloned).not.toBe(original);
      expect(cloned.self).toBe(cloned);
    });
  });

  describe('deepEqual / equal', () => {
    it('returns true for deeply equal structures', () => {
      const a = { foo: ['bar', { baz: 42 }], date: new Date('2020-01-01') };
      const b = { foo: ['bar', { baz: 42 }], date: new Date('2020-01-01') };

      expect(deepEqual(a, b)).toBe(true);
      expect(equal(a, b)).toBe(true);
    });

    it('returns false when nested values differ', () => {
      const a = { foo: ['bar', { baz: 42 }] };
      const b = { foo: ['bar', { baz: 43 }] };

      expect(deepEqual(a, b)).toBe(false);
    });
  });

  describe('isBuiltInObject', () => {
    it('detects known built-in instances', () => {
      expect(isBuiltInObject(new Date())).toBe(true);
      expect(isBuiltInObject(new Map())).toBe(true);
      expect(isBuiltInObject(new Set())).toBe(true);
    });

    it('ignores plain objects and primitives', () => {
      expect(isBuiltInObject({})).toBe(false);
      expect(isBuiltInObject(Object.create(null))).toBe(false);
      expect(isBuiltInObject(123)).toBe(false);
      expect(isBuiltInObject('test')).toBe(false);
    });
  });

  describe('parsePath cache', () => {
    afterEach(() => {
      clearParsePathCache();
      setParsePathCacheSize(10);
    });

    it('splits dot-delimited paths and caches results', () => {
      expect(parsePath('user.profile.name')).toEqual([
        'user',
        'profile',
        'name',
      ]);
      expect(getParsePathCacheSize()).toBe(1);

      expect(parsePath('user.profile.name')).toEqual([
        'user',
        'profile',
        'name',
      ]);
      expect(getParsePathCacheSize()).toBe(1);
    });

    it('respects cache size limits', () => {
      setParsePathCacheSize(2);

      parsePath('a');
      parsePath('b');
      parsePath('c');

      expect(getParsePathCacheSize()).toBe(2);
    });
  });

  describe('LRUCache', () => {
    it('evicts least-recently-used entries', () => {
      const cache = new LRUCache<string, number>(2);
      cache.set('a', 1);
      cache.set('b', 2);
      expect(cache.get('a')).toBe(1);
      cache.set('c', 3);

      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('a')).toBe(1);
      expect(cache.get('c')).toBe(3);
    });
  });
});
