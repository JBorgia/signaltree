import { computed } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoredSignal, isStoredMarker, stored, STORED_MARKER } from '../markers/stored';
import { signalTree } from '../signal-tree';

// Mock localStorage for testing
function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),

    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
}

describe('stored() marker', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  describe('marker creation', () => {
    it('should create a stored marker', () => {
      const marker = stored('test-key', 'default');
      expect(marker[STORED_MARKER]).toBe(true);
      expect(marker.key).toBe('test-key');
      expect(marker.defaultValue).toBe('default');
    });

    it('should store options', () => {
      const serialize = (v: string) => v;
      const deserialize = (s: string) => s;
      const marker = stored('key', 'value', {
        serialize,
        deserialize,
        storage: mockStorage,
      });

      expect(marker.options.serialize).toBe(serialize);
      expect(marker.options.deserialize).toBe(deserialize);
      expect(marker.options.storage).toBe(mockStorage);
    });

    it('should be identifiable by type guard', () => {
      const marker = stored('key', 'value');
      expect(isStoredMarker(marker)).toBe(true);
      expect(isStoredMarker({})).toBe(false);
      expect(isStoredMarker(null)).toBe(false);
      expect(isStoredMarker('stored')).toBe(false);
    });
  });

  describe('signal creation', () => {
    it('should create a StoredSignal with default value', () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'theme',
        defaultValue: 'light',
        options: { storage: mockStorage },
      });

      expect(sig()).toBe('light');
    });

    it('should load from storage on init', () => {
      mockStorage.setItem('theme', '"dark"');

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'theme',
        defaultValue: 'light',
        options: { storage: mockStorage },
      });

      expect(sig()).toBe('dark');
    });

    it('should use default if storage is empty', () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'theme',
        defaultValue: 'light',
        options: { storage: mockStorage },
      });

      expect(sig()).toBe('light');
      expect(mockStorage.getItem('theme')).toBe(null);
    });
  });

  describe('set method', () => {
    it('should update signal and save to storage', async () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'theme',
        defaultValue: 'light',
        options: { storage: mockStorage, debounceMs: 0 },
      });

      sig.set('dark');

      expect(sig()).toBe('dark');
      // Wait for queueMicrotask to flush
      await new Promise((r) => queueMicrotask(r));
      expect(mockStorage.getItem('theme')).toBe('"dark"');
    });

    it('should handle complex objects', async () => {
      interface Config {
        theme: string;
        fontSize: number;
      }

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'config',
        defaultValue: { theme: 'light', fontSize: 14 } as Config,
        options: { storage: mockStorage, debounceMs: 0 },
      });

      sig.set({ theme: 'dark', fontSize: 18 });

      expect(sig()).toEqual({ theme: 'dark', fontSize: 18 });
      // Wait for queueMicrotask to flush
      await new Promise((r) => queueMicrotask(r));
      expect(JSON.parse(mockStorage.getItem('config')!)).toEqual({
        theme: 'dark',
        fontSize: 18,
      });
    });
  });

  describe('update method', () => {
    it('should update and save', async () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'count',
        defaultValue: 0,
        options: { storage: mockStorage, debounceMs: 0 },
      });

      sig.update((n) => n + 1);
      sig.update((n) => n + 1);

      expect(sig()).toBe(2);
      // Wait for queueMicrotask to flush
      await new Promise((r) => queueMicrotask(r));
      expect(mockStorage.getItem('count')).toBe('2');
    });
  });

  describe('clear method', () => {
    it('should reset to default and remove from storage', () => {
      mockStorage.setItem('theme', '"dark"');

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'theme',
        defaultValue: 'light',
        options: { storage: mockStorage },
      });

      expect(sig()).toBe('dark');

      sig.clear();

      expect(sig()).toBe('light');
      expect(mockStorage.getItem('theme')).toBe(null);
    });
  });

  describe('reload method', () => {
    it('should reload from storage', () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'theme',
        defaultValue: 'light',
        options: { storage: mockStorage },
      });

      expect(sig()).toBe('light');

      // External change to storage
      mockStorage.setItem('theme', '"dark"');

      sig.reload();

      expect(sig()).toBe('dark');
    });

    it('should reset to default if storage is cleared', () => {
      mockStorage.setItem('theme', '"dark"');

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'theme',
        defaultValue: 'light',
        options: { storage: mockStorage },
      });

      expect(sig()).toBe('dark');

      mockStorage.removeItem('theme');
      sig.reload();

      expect(sig()).toBe('light');
    });
  });

  describe('custom serialization', () => {
    it('should use custom serialize/deserialize', async () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'date',
        defaultValue: new Date('2024-01-01'),
        options: {
          storage: mockStorage,
          serialize: (d: Date) => d.toISOString(),
          deserialize: (s: string) => new Date(s),
          debounceMs: 0,
        },
      });

      const newDate = new Date('2025-06-15');
      sig.set(newDate);

      // Wait for queueMicrotask to flush
      await new Promise((r) => queueMicrotask(r));
      expect(mockStorage.getItem('date')).toBe('2025-06-15T00:00:00.000Z');

      // Reload and verify
      sig.reload();
      expect(sig().toISOString()).toBe('2025-06-15T00:00:00.000Z');
    });
  });

  describe('SSR safety (no localStorage)', () => {
    it('should work without storage', () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'theme',
        defaultValue: 'light',
        options: { storage: null },
      });

      expect(sig()).toBe('light');

      // Should not throw
      sig.set('dark');
      expect(sig()).toBe('dark');

      sig.clear();
      expect(sig()).toBe('light');

      // reload is no-op
      sig.reload();
      expect(sig()).toBe('light');
    });
  });

  describe('integration with signalTree', () => {
    it('should auto-materialize stored markers', async () => {
      const tree = signalTree({
        theme: stored('tree-theme', 'light', {
          storage: mockStorage,
          debounceMs: 0,
        }),
      });

      expect(tree.$.theme()).toBe('light');

      tree.$.theme.set('dark');
      expect(tree.$.theme()).toBe('dark');
      // Wait for queueMicrotask to flush
      await new Promise((r) => queueMicrotask(r));
      expect(mockStorage.getItem('tree-theme')).toBe('"dark"');
    });

    it('should load existing values', () => {
      mockStorage.setItem('tree-theme', '"dark"');

      const tree = signalTree({
        theme: stored('tree-theme', 'light', { storage: mockStorage }),
      });

      expect(tree.$.theme()).toBe('dark');
    });

    it('should work with nested structures', async () => {
      const tree = signalTree({
        settings: {
          theme: stored('settings.theme', 'light', {
            storage: mockStorage,
            debounceMs: 0,
          }),
          fontSize: stored('settings.fontSize', 14, {
            storage: mockStorage,
            debounceMs: 0,
          }),
        },
      });

      tree.$.settings.theme.set('dark');
      tree.$.settings.fontSize.set(18);

      expect(tree.$.settings.theme()).toBe('dark');
      expect(tree.$.settings.fontSize()).toBe(18);
      // Wait for queueMicrotask to flush
      await new Promise((r) => queueMicrotask(r));
      expect(mockStorage.getItem('settings.theme')).toBe('"dark"');
      expect(mockStorage.getItem('settings.fontSize')).toBe('18');
    });

    it('should work with derived state', () => {
      const tree = signalTree({
        theme: stored('theme', 'light' as 'light' | 'dark', {
          storage: mockStorage,
        }),
        fontSize: stored('fontSize', 14, { storage: mockStorage }),
      }).derived(($) => ({
        isDarkMode: computed(() => $.theme() === 'dark'),
        style: computed(() => ({
          theme: $.theme(),
          fontSize: $.fontSize(),
        })),
      }));

      expect(tree.$.isDarkMode()).toBe(false);
      expect(tree.$.style()).toEqual({ theme: 'light', fontSize: 14 });

      tree.$.theme.set('dark');
      expect(tree.$.isDarkMode()).toBe(true);
    });

    it('should persist selections', async () => {
      interface User {
        id: number;
        name: string;
      }

      const tree = signalTree({
        selectedUserId: stored('selected.userId', null as number | null, {
          storage: mockStorage,
          debounceMs: 0,
        }),
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ] as User[],
      }).derived(($) => ({
        selectedUser: computed(() => {
          const id = $.selectedUserId();
          return id != null ? $.users().find((u) => u.id === id) ?? null : null;
        }),
      }));

      expect(tree.$.selectedUser()).toBe(null);

      tree.$.selectedUserId.set(1);
      expect(tree.$.selectedUser()?.name).toBe('Alice');
      // Wait for queueMicrotask to flush
      await new Promise((r) => queueMicrotask(r));
      expect(mockStorage.getItem('selected.userId')).toBe('1');

      // Simulate page reload - create new tree
      const tree2 = signalTree({
        selectedUserId: stored('selected.userId', null as number | null, {
          storage: mockStorage,
          debounceMs: 0,
        }),
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ] as User[],
      }).derived(($) => ({
        selectedUser: computed(() => {
          const id = $.selectedUserId();
          return id != null ? $.users().find((u) => u.id === id) ?? null : null;
        }),
      }));

      // Selection persisted
      expect(tree2.$.selectedUserId()).toBe(1);
      expect(tree2.$.selectedUser()?.name).toBe('Alice');
    });
  });

  describe('error handling', () => {
    it('should handle storage read errors gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* empty */
      });

      const errorStorage: Storage = {
        ...createMockStorage(),
        getItem: () => {
          throw new Error('Storage error');
        },
      };

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'test',
        defaultValue: 'default',
        options: { storage: errorStorage },
      });

      expect(sig()).toBe('default');

      warnSpy.mockRestore();
    });

    it('should handle storage write errors gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* empty */
      });

      const errorStorage: Storage = {
        ...createMockStorage(),
        setItem: () => {
          throw new Error('Storage full');
        },
      };

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'test',
        defaultValue: 'default',
        options: { storage: errorStorage },
      });

      // Should not throw
      sig.set('new value');
      expect(sig()).toBe('new value');

      warnSpy.mockRestore();
    });

    it('should handle deserialization errors', () => {
      mockStorage.setItem('test', 'invalid json{');

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'test',
        defaultValue: 'default',
        options: { storage: mockStorage },
      });

      // Falls back to default on parse error
      expect(sig()).toBe('default');
    });
  });

  describe('debounce behavior', () => {
    it('should debounce writes by default (100ms)', async () => {
      vi.useFakeTimers();

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'debounced',
        defaultValue: 0,
        options: { storage: mockStorage },
      });

      // Rapid updates
      sig.set(1);
      sig.set(2);
      sig.set(3);

      // Signal updates immediately
      expect(sig()).toBe(3);

      // But storage should not be updated yet
      expect(mockStorage.getItem('debounced')).toBe(null);

      // Advance timers past debounce
      vi.advanceTimersByTime(100);
      // Flush microtask queue
      await Promise.resolve();

      // Now storage should have the final value
      expect(mockStorage.getItem('debounced')).toBe('3');

      vi.useRealTimers();
    });

    it('should coalesce rapid updates', async () => {
      vi.useFakeTimers();

      let writeCount = 0;
      const trackingStorage: Storage = {
        ...mockStorage,
        setItem: (key: string, value: string) => {
          writeCount++;
          mockStorage.setItem(key, value);
        },
      };

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'coalesced',
        defaultValue: 0,
        options: { storage: trackingStorage },
      });

      // 10 rapid updates
      for (let i = 1; i <= 10; i++) {
        sig.set(i);
      }

      // Advance past debounce
      vi.advanceTimersByTime(100);
      await Promise.resolve();

      // Only one write should have occurred
      expect(writeCount).toBe(1);
      expect(mockStorage.getItem('coalesced')).toBe('10');

      vi.useRealTimers();
    });

    it('should write immediately when debounceMs is 0', async () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'immediate',
        defaultValue: 'initial',
        options: { storage: mockStorage, debounceMs: 0 },
      });

      sig.set('updated');

      // Wait for queueMicrotask
      await new Promise((r) => queueMicrotask(r));

      expect(mockStorage.getItem('immediate')).toBe('"updated"');
    });

    it('should use custom debounce time', async () => {
      vi.useFakeTimers();

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'custom-debounce',
        defaultValue: 0,
        options: { storage: mockStorage, debounceMs: 500 },
      });

      sig.set(42);

      // Not written after 100ms
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      expect(mockStorage.getItem('custom-debounce')).toBe(null);

      // Written after 500ms total
      vi.advanceTimersByTime(400);
      await Promise.resolve();
      expect(mockStorage.getItem('custom-debounce')).toBe('42');

      vi.useRealTimers();
    });
  });

  describe('performance', () => {
    it('should initialize 100 markers in under 50ms', async () => {
      const start = performance.now();

      // Create 100 individual trees with stored markers
      const trees = [];
      for (let i = 0; i < 100; i++) {
        trees.push(
          signalTree({
            value: stored(`perf-test-${i}`, 'default', {
              storage: mockStorage,
              debounceMs: 100, // Use default debounce
            }),
          })
        );
      }

      // Access $ to trigger finalization on all
      for (const tree of trees) {
        tree.$.value();
      }

      const elapsed = performance.now() - start;

      // Performance budget: 100 markers should initialize in < 50ms
      expect(elapsed).toBeLessThan(50);

      // Verify markers are working
      expect(trees[0].$.value()).toBe('default');
      expect(trees[99].$.value()).toBe('default');
    });

    it('should handle rapid updates without blocking', async () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'rapid',
        defaultValue: 0,
        options: { storage: mockStorage, debounceMs: 0 },
      });

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        sig.set(i);
      }

      const elapsed = performance.now() - start;

      // Signal updates should be fast even with storage writes queued
      // Writes are non-blocking via queueMicrotask
      expect(elapsed).toBeLessThan(50);
      expect(sig()).toBe(iterations - 1);
    });
  });
});
