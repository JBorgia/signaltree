import { computed } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    clearStoragePrefix,
    createStorageKeys,
    createStoredSignal,
    isStoredMarker,
    stored,
    STORED_MARKER,
} from '../markers/stored';
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
    it('should update signal and save to storage with version metadata', async () => {
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
      // New versioned format: { __v: 1, data: "dark" }
      const parsedStored = JSON.parse(mockStorage.getItem('theme')!);
      expect(parsedStored.__v).toBe(1);
      expect(parsedStored.data).toBe('dark');
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
      // Versioned format
      const parsedStored = JSON.parse(mockStorage.getItem('config')!);
      expect(parsedStored.__v).toBe(1);
      expect(parsedStored.data).toEqual({ theme: 'dark', fontSize: 18 });
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
      // Versioned format
      const parsedStored = JSON.parse(mockStorage.getItem('count')!);
      expect(parsedStored.__v).toBe(1);
      expect(parsedStored.data).toBe(2);
    });
  });

  describe('clear method', () => {
    it('should reset to default and remove from storage', () => {
      // Use versioned format
      mockStorage.setItem('theme', JSON.stringify({ __v: 1, data: 'dark' }));

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

      // External change to storage (versioned format)
      mockStorage.setItem('theme', JSON.stringify({ __v: 1, data: 'dark' }));

      sig.reload();

      expect(sig()).toBe('dark');
    });

    it('should reset to default if storage is cleared', () => {
      // Use versioned format
      mockStorage.setItem('theme', JSON.stringify({ __v: 1, data: 'dark' }));

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
      // Custom serialization that wraps the versioned format
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'date',
        defaultValue: new Date('2024-01-01'),
        options: {
          storage: mockStorage,
          // These custom serializers now operate on VersionedStorageData<Date>
          serialize: (d: unknown) => {
            const versioned = d as { __v: number; data: Date };
            return JSON.stringify({
              __v: versioned.__v,
              data: versioned.data.toISOString(),
            });
          },
          deserialize: (s: string) => {
            const parsed = JSON.parse(s);
            if (parsed.__v !== undefined) {
              return { __v: parsed.__v, data: new Date(parsed.data) };
            }
            return new Date(parsed);
          },
          debounceMs: 0,
        },
      });

      const newDate = new Date('2025-06-15');
      sig.set(newDate);

      // Wait for queueMicrotask to flush
      await new Promise((r) => queueMicrotask(r));
      const parsedStored = JSON.parse(mockStorage.getItem('date')!);
      expect(parsedStored.__v).toBe(1);
      expect(parsedStored.data).toBe('2025-06-15T00:00:00.000Z');

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
      // Versioned format
      const storedVal = JSON.parse(mockStorage.getItem('tree-theme')!);
      expect(storedVal.__v).toBe(1);
      expect(storedVal.data).toBe('dark');
    });

    it('should load existing values', () => {
      // Versioned format
      mockStorage.setItem(
        'tree-theme',
        JSON.stringify({ __v: 1, data: 'dark' })
      );

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
      // Versioned format
      const themeStored = JSON.parse(mockStorage.getItem('settings.theme')!);
      const fontStored = JSON.parse(mockStorage.getItem('settings.fontSize')!);
      expect(themeStored.__v).toBe(1);
      expect(themeStored.data).toBe('dark');
      expect(fontStored.__v).toBe(1);
      expect(fontStored.data).toBe(18);
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
      // Versioned format
      const storedVal = JSON.parse(mockStorage.getItem('selected.userId')!);
      expect(storedVal.__v).toBe(1);
      expect(storedVal.data).toBe(1);

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

      // Now storage should have the final value (versioned format)
      const parsedStored = JSON.parse(mockStorage.getItem('debounced')!);
      expect(parsedStored.__v).toBe(1);
      expect(parsedStored.data).toBe(3);

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
      // Versioned format
      const parsedStored = JSON.parse(mockStorage.getItem('coalesced')!);
      expect(parsedStored.__v).toBe(1);
      expect(parsedStored.data).toBe(10);

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

      // Versioned format
      const parsedStored = JSON.parse(mockStorage.getItem('immediate')!);
      expect(parsedStored.__v).toBe(1);
      expect(parsedStored.data).toBe('updated');
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
      // Versioned format
      const parsedStored = JSON.parse(mockStorage.getItem('custom-debounce')!);
      expect(parsedStored.__v).toBe(1);
      expect(parsedStored.data).toBe(42);

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

// =============================================================================
// NEW: Versioning and Migration Tests
// =============================================================================

describe('stored() versioning and migrations', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  describe('versioned storage format', () => {
    it('should store data with version metadata', async () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'versioned-test',
        defaultValue: { name: 'test' },
        options: { storage: mockStorage, debounceMs: 0, version: 2 },
      });

      sig.set({ name: 'updated' });
      await new Promise((r) => queueMicrotask(r));

      const parsedStored = JSON.parse(mockStorage.getItem('versioned-test')!);
      expect(parsedStored.__v).toBe(2);
      expect(parsedStored.data).toEqual({ name: 'updated' });
    });

    it('should default to version 1', async () => {
      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'no-version',
        defaultValue: 'test',
        options: { storage: mockStorage, debounceMs: 0 },
      });

      sig.set('value');
      await new Promise((r) => queueMicrotask(r));

      const parsedStored = JSON.parse(mockStorage.getItem('no-version')!);
      expect(parsedStored.__v).toBe(1);
      expect(parsedStored.data).toBe('value');
    });
  });

  describe('loading versioned data', () => {
    it('should load current version data correctly', () => {
      mockStorage.setItem(
        'versioned-load',
        JSON.stringify({ __v: 2, data: { theme: 'dark' } })
      );

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'versioned-load',
        defaultValue: { theme: 'light' },
        options: { storage: mockStorage, version: 2 },
      });

      expect(sig()).toEqual({ theme: 'dark' });
    });

    it('should treat non-versioned (legacy) data as version 0', () => {
      // Old format (no __v wrapper) - treated as version 0
      mockStorage.setItem('legacy-data', JSON.stringify('old-value'));

      const migrateFn = vi.fn((oldData: unknown, oldVersion: number) => {
        // Legacy data is treated as version 0
        expect(oldVersion).toBe(0);
        return `migrated-${oldData}`;
      });

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'legacy-data',
        defaultValue: 'default',
        options: {
          storage: mockStorage,
          version: 2,
          migrate: migrateFn,
        },
      });

      expect(migrateFn).toHaveBeenCalledWith('old-value', 0);
      expect(sig()).toBe('migrated-old-value');
    });
  });

  describe('migration execution', () => {
    it('should call migrate when version differs', () => {
      interface SettingsV1 {
        theme: string;
      }
      interface SettingsV2 {
        theme: string;
        fontSize: number;
      }

      mockStorage.setItem(
        'settings',
        JSON.stringify({ __v: 1, data: { theme: 'dark' } })
      );

      const migrateFn = vi.fn(
        (oldData: SettingsV1, oldVersion: number): SettingsV2 => {
          if (oldVersion === 1) {
            return { ...oldData, fontSize: 14 };
          }
          return oldData as unknown as SettingsV2;
        }
      );

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'settings',
        defaultValue: { theme: 'light', fontSize: 12 } as SettingsV2,
        options: {
          storage: mockStorage,
          version: 2,
          migrate: migrateFn,
        },
      });

      expect(migrateFn).toHaveBeenCalledWith({ theme: 'dark' }, 1);
      expect(sig()).toEqual({ theme: 'dark', fontSize: 14 });
    });

    it('should not call migrate when version matches', () => {
      mockStorage.setItem(
        'current-version',
        JSON.stringify({ __v: 3, data: { value: 'stored' } })
      );

      const migrateFn = vi.fn();

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'current-version',
        defaultValue: { value: 'default' },
        options: {
          storage: mockStorage,
          version: 3,
          migrate: migrateFn,
        },
      });

      expect(migrateFn).not.toHaveBeenCalled();
      expect(sig()).toEqual({ value: 'stored' });
    });

    it('should handle multi-version migrations', () => {
      interface V1 {
        name: string;
      }
      interface V2 {
        name: string;
        email: string;
      }
      interface V3 {
        name: string;
        email: string;
        verified: boolean;
      }

      mockStorage.setItem(
        'user-profile',
        JSON.stringify({ __v: 1, data: { name: 'Alice' } })
      );

      const migrateFn = vi.fn((oldData: unknown, oldVersion: number): V3 => {
        let data = oldData as V1 | V2 | V3;

        // V1 -> V2
        if (oldVersion < 2) {
          data = { ...(data as V1), email: '' };
        }
        // V2 -> V3
        if (oldVersion < 3) {
          data = { ...(data as V2), verified: false };
        }

        return data as V3;
      });

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'user-profile',
        defaultValue: { name: '', email: '', verified: false } as V3,
        options: {
          storage: mockStorage,
          version: 3,
          migrate: migrateFn,
        },
      });

      expect(sig()).toEqual({ name: 'Alice', email: '', verified: false });
    });

    it('should handle migration errors gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* noop */ });

      mockStorage.setItem(
        'bad-migrate',
        JSON.stringify({ __v: 1, data: { broken: true } })
      );

      const migrateFn = vi.fn(() => {
        throw new Error('Migration failed!');
      });

      const sig = createStoredSignal({
        [STORED_MARKER]: true,
        key: 'bad-migrate',
        defaultValue: { good: true },
        options: {
          storage: mockStorage,
          version: 2,
          migrate: migrateFn,
        },
      });

      // Falls back to default on migration error
      expect(sig()).toEqual({ good: true });

      warnSpy.mockRestore();
    });

    it('should clear storage on migration failure when configured', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* noop */ });

      mockStorage.setItem(
        'clear-on-fail',
        JSON.stringify({ __v: 1, data: 'corrupt' })
      );

      const migrateFn = vi.fn(() => {
        throw new Error('Migration failed!');
      });

      createStoredSignal({
        [STORED_MARKER]: true,
        key: 'clear-on-fail',
        defaultValue: 'fresh',
        options: {
          storage: mockStorage,
          version: 2,
          migrate: migrateFn,
          clearOnMigrationFailure: true,
        },
      });

      // Storage should be cleared
      expect(mockStorage.getItem('clear-on-fail')).toBe(null);

      warnSpy.mockRestore();
    });
  });

  describe('integration with signalTree', () => {
    it('should work with versioned markers in tree', async () => {
      interface SettingsV1 {
        theme: string;
      }
      interface SettingsV2 {
        theme: string;
        fontSize: number;
      }

      // Simulate v1 data
      mockStorage.setItem(
        'tree-settings',
        JSON.stringify({ __v: 1, data: { theme: 'dark' } })
      );

      const tree = signalTree({
        settings: stored(
          'tree-settings',
          { theme: 'light', fontSize: 14 } as SettingsV2,
          {
            storage: mockStorage,
            debounceMs: 0,
            version: 2,
            migrate: (old: SettingsV1, v: number) => {
              if (v === 1) {
                return { ...old, fontSize: 16 };
              }
              return old as unknown as SettingsV2;
            },
          }
        ),
      });

      // Should migrate v1 -> v2
      expect(tree.$.settings()).toEqual({ theme: 'dark', fontSize: 16 });

      // New writes should use v2 format
      tree.$.settings.set({ theme: 'light', fontSize: 18 });
      await new Promise((r) => queueMicrotask(r));

      const parsedStored = JSON.parse(mockStorage.getItem('tree-settings')!);
      expect(parsedStored.__v).toBe(2);
      expect(parsedStored.data).toEqual({ theme: 'light', fontSize: 18 });
    });
  });
});

// =============================================================================
// NEW: createStorageKeys and clearStoragePrefix Tests
// =============================================================================

describe('createStorageKeys()', () => {
  it('should create prefixed flat keys', () => {
    const keys = createStorageKeys('myApp', {
      theme: 'theme',
      language: 'lang',
    } as const);

    expect(keys.theme).toBe('myApp:theme');
    expect(keys.language).toBe('myApp:lang');
  });

  it('should create prefixed nested keys', () => {
    const keys = createStorageKeys('app', {
      auth: {
        token: 'token',
        refreshToken: 'refresh',
      },
      user: {
        settings: 'settings',
        preferences: 'prefs',
      },
    } as const);

    expect(keys.auth.token).toBe('app:auth:token');
    expect(keys.auth.refreshToken).toBe('app:auth:refresh');
    expect(keys.user.settings).toBe('app:user:settings');
    expect(keys.user.preferences).toBe('app:user:prefs');
  });

  it('should handle deeply nested structures', () => {
    const keys = createStorageKeys('deep', {
      level1: {
        level2: {
          level3: {
            value: 'val',
          },
        },
      },
    } as const);

    expect(keys.level1.level2.level3.value).toBe(
      'deep:level1:level2:level3:val'
    );
  });

  it('should work with stored() marker', async () => {
    const mockStorage = createMockStorage();

    const KEYS = createStorageKeys('test', {
      theme: 'theme',
      settings: {
        fontSize: 'font',
      },
    } as const);

    const tree = signalTree({
      theme: stored(KEYS.theme, 'light', {
        storage: mockStorage,
        debounceMs: 0,
      }),
      fontSize: stored(KEYS.settings.fontSize, 14, {
        storage: mockStorage,
        debounceMs: 0,
      }),
    });

    tree.$.theme.set('dark');
    tree.$.fontSize.set(18);

    await new Promise((r) => queueMicrotask(r));

    // Keys should be properly prefixed
    expect(mockStorage.getItem('test:theme')).toBeDefined();
    expect(mockStorage.getItem('test:settings:font')).toBeDefined();
  });
});

describe('clearStoragePrefix()', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  it('should clear all keys with matching prefix', () => {
    mockStorage.setItem('myApp:theme', '"dark"');
    mockStorage.setItem('myApp:lang', '"en"');
    mockStorage.setItem('myApp:user:name', '"Alice"');
    mockStorage.setItem('otherApp:data', '"keep"');

    clearStoragePrefix('myApp', mockStorage);

    expect(mockStorage.getItem('myApp:theme')).toBe(null);
    expect(mockStorage.getItem('myApp:lang')).toBe(null);
    expect(mockStorage.getItem('myApp:user:name')).toBe(null);
    expect(mockStorage.getItem('otherApp:data')).toBe('"keep"');
  });

  it('should not clear partial prefix matches', () => {
    mockStorage.setItem('myApp:data', '"clear"');
    mockStorage.setItem('myAppExtended:data', '"keep"');

    clearStoragePrefix('myApp', mockStorage);

    expect(mockStorage.getItem('myApp:data')).toBe(null);
    expect(mockStorage.getItem('myAppExtended:data')).toBe('"keep"');
  });

  it('should handle empty storage gracefully', () => {
    expect(() => clearStoragePrefix('anything', mockStorage)).not.toThrow();
  });

  it('should handle null storage (SSR)', () => {
    expect(() =>
      clearStoragePrefix('test', null as unknown as Storage)
    ).not.toThrow();
  });

  it('should be useful for logout scenarios', async () => {
    const KEYS = createStorageKeys('app', {
      auth: {
        token: 'token',
        user: 'user',
      },
      settings: {
        theme: 'theme',
      },
    } as const);

    // Simulate logged-in state
    mockStorage.setItem('app:auth:token', '"abc123"');
    mockStorage.setItem('app:auth:user', '{"id":1}');
    mockStorage.setItem('app:settings:theme', '"dark"');

    // Logout - clear only auth data
    clearStoragePrefix('app:auth', mockStorage);

    expect(mockStorage.getItem('app:auth:token')).toBe(null);
    expect(mockStorage.getItem('app:auth:user')).toBe(null);
    expect(mockStorage.getItem('app:settings:theme')).toBe('"dark"'); // Preserved
  });
});
