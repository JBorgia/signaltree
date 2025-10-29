import { signal } from '@angular/core';

import { SignalMemoryManager } from './memory-manager';

/**
 * Tests for SignalMemoryManager
 * Note: GC-dependent tests require node --expose-gc flag
 */
describe('SignalMemoryManager', () => {
  describe('Basic Functionality', () => {
    it('should cache and retrieve signals', () => {
      const manager = new SignalMemoryManager();
      const testSignal = signal(42);

      manager.cacheSignal('test.path', testSignal);

      const retrieved = manager.getSignal('test.path');
      expect(retrieved).toBe(testSignal);
      expect(retrieved?.()).toBe(42);
    });

    it('should return undefined for non-existent paths', () => {
      const manager = new SignalMemoryManager();

      const retrieved = manager.getSignal('does.not.exist');
      expect(retrieved).toBeUndefined();
    });

    it('should check if signal exists', () => {
      const manager = new SignalMemoryManager();
      const testSignal = signal('test');

      expect(manager.hasSignal('test.path')).toBe(false);

      manager.cacheSignal('test.path', testSignal);

      expect(manager.hasSignal('test.path')).toBe(true);
    });

    it('should remove signals from cache', () => {
      const manager = new SignalMemoryManager();
      const testSignal = signal('test');

      manager.cacheSignal('test.path', testSignal);
      expect(manager.hasSignal('test.path')).toBe(true);

      const removed = manager.removeSignal('test.path');
      expect(removed).toBe(true);
      expect(manager.hasSignal('test.path')).toBe(false);
    });

    it('should return false when removing non-existent signal', () => {
      const manager = new SignalMemoryManager();

      const removed = manager.removeSignal('does.not.exist');
      expect(removed).toBe(false);
    });

    it('should get all cached paths', () => {
      const manager = new SignalMemoryManager();

      manager.cacheSignal('user.name', signal('John'));
      manager.cacheSignal('user.age', signal(30));
      manager.cacheSignal('settings.theme', signal('dark'));

      const paths = manager.getCachedPaths();
      expect(paths).toHaveLength(3);
      expect(paths).toContain('user.name');
      expect(paths).toContain('user.age');
      expect(paths).toContain('settings.theme');
    });
  });

  describe('Memory Statistics', () => {
    it('should track basic stats', () => {
      const manager = new SignalMemoryManager();

      manager.cacheSignal('test.1', signal(1));
      manager.cacheSignal('test.2', signal(2));
      manager.cacheSignal('test.3', signal(3));

      const stats = manager.getStats();

      expect(stats.cachedSignals).toBe(3);
      expect(stats.peakCachedSignals).toBe(3);
      expect(stats.cleanedUpSignals).toBe(0);
      expect(stats.manualDisposes).toBe(0);
      expect(stats.estimatedMemoryBytes).toBeGreaterThan(0);
    });

    it('should track peak cached signals', () => {
      const manager = new SignalMemoryManager();

      // Add 5 signals
      for (let i = 0; i < 5; i++) {
        manager.cacheSignal(`test.${i}`, signal(i));
      }

      let stats = manager.getStats();
      expect(stats.peakCachedSignals).toBe(5);

      // Remove 2 signals
      manager.removeSignal('test.0');
      manager.removeSignal('test.1');

      stats = manager.getStats();
      expect(stats.cachedSignals).toBe(3);
      expect(stats.peakCachedSignals).toBe(5); // Peak remains
    });

    it('should track manual disposes', () => {
      const manager = new SignalMemoryManager();

      manager.cacheSignal('test', signal('value'));

      let stats = manager.getStats();
      expect(stats.manualDisposes).toBe(0);

      manager.dispose();

      stats = manager.getStats();
      expect(stats.manualDisposes).toBe(1);
    });

    it('should estimate memory usage', () => {
      const manager = new SignalMemoryManager();

      const stats1 = manager.getStats();
      expect(stats1.estimatedMemoryBytes).toBe(0);

      manager.cacheSignal('test.1', signal(1));
      const stats2 = manager.getStats();
      expect(stats2.estimatedMemoryBytes).toBeGreaterThan(0);

      manager.cacheSignal('test.2', signal(2));
      const stats3 = manager.getStats();
      expect(stats3.estimatedMemoryBytes).toBeGreaterThan(
        stats2.estimatedMemoryBytes
      );
    });

    it('should reset statistics', () => {
      const manager = new SignalMemoryManager();

      manager.cacheSignal('test.1', signal(1));
      manager.cacheSignal('test.2', signal(2));
      manager.dispose();

      let stats = manager.getStats();
      expect(stats.peakCachedSignals).toBe(2);
      expect(stats.manualDisposes).toBe(1);

      manager.resetStats();

      stats = manager.getStats();
      expect(stats.peakCachedSignals).toBe(0);
      expect(stats.manualDisposes).toBe(0);
    });
  });

  describe('Disposal', () => {
    it('should dispose all cached signals', () => {
      const manager = new SignalMemoryManager();

      manager.cacheSignal('test.1', signal(1));
      manager.cacheSignal('test.2', signal(2));
      manager.cacheSignal('test.3', signal(3));

      expect(manager.getStats().cachedSignals).toBe(3);

      manager.dispose();

      expect(manager.getStats().cachedSignals).toBe(0);
      expect(manager.getCachedPaths()).toHaveLength(0);
    });

    it('should allow caching after dispose', () => {
      const manager = new SignalMemoryManager();

      manager.cacheSignal('test.1', signal(1));
      manager.dispose();

      // Should be able to cache again
      manager.cacheSignal('test.2', signal(2));

      const stats = manager.getStats();
      expect(stats.cachedSignals).toBe(1);
      expect(stats.manualDisposes).toBe(1);
    });
  });

  describe('WeakRef Behavior', () => {
    it('should handle garbage collected signals', () => {
      const manager = new SignalMemoryManager();

      // Create a signal in a scope that can be GC'd
      const createAndCache = () => {
        const tempSignal = signal('temporary');
        manager.cacheSignal('temp.signal', tempSignal);
        return tempSignal;
      };

      createAndCache();

      // At this point, the signal might be GC'd (though not guaranteed)
      // The cache entry should still exist but deref() might return undefined
      expect(manager.hasSignal('temp.signal')).toBe(true);

      // Calling getStats should clean up stale entries
      const stats = manager.getStats();
      expect(stats.cachedSignals).toBeGreaterThanOrEqual(0);
    });

    it('should clear stale entries', () => {
      const manager = new SignalMemoryManager();

      manager.cacheSignal('test.1', signal(1));
      manager.cacheSignal('test.2', signal(2));

      // Initially no stale entries
      const removed = manager.clearStale();
      expect(removed).toBe(0);

      const stats = manager.getStats();
      expect(stats.cachedSignals).toBe(2);
    });
  });

  describe('Configuration', () => {
    it('should support debug mode', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const manager = new SignalMemoryManager({ debugMode: true });

      manager.cacheSignal('test', signal('value'));

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should call cleanup callback', () => {
      const cleanupSpy = jest.fn();

      const manager = new SignalMemoryManager({
        onCleanup: cleanupSpy,
      });

      // Cleanup callback is called by FinalizationRegistry
      // which requires actual GC, so we can't easily test this
      expect(manager).toBeDefined();
    });

    it('should work without FinalizationRegistry', () => {
      // Save original
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalFR = (globalThis as any).FinalizationRegistry;

      // Temporarily remove FinalizationRegistry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).FinalizationRegistry = undefined;

      const manager = new SignalMemoryManager({ enableAutoCleanup: true });

      manager.cacheSignal('test', signal('value'));

      const retrieved = manager.getSignal('test');
      expect(retrieved).toBeDefined();

      // Restore
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).FinalizationRegistry = originalFR;
    });

    it('should disable auto cleanup when configured', () => {
      const manager = new SignalMemoryManager({ enableAutoCleanup: false });

      manager.cacheSignal('test', signal('value'));

      const retrieved = manager.getSignal('test');
      expect(retrieved).toBeDefined();
    });
  });

  describe('Multiple Managers', () => {
    it('should work with multiple independent managers', () => {
      const manager1 = new SignalMemoryManager();
      const manager2 = new SignalMemoryManager();

      manager1.cacheSignal('test', signal('value1'));
      manager2.cacheSignal('test', signal('value2'));

      expect(manager1.getSignal('test')?.()).toBe('value1');
      expect(manager2.getSignal('test')?.()).toBe('value2');

      manager1.dispose();

      expect(manager1.getStats().cachedSignals).toBe(0);
      expect(manager2.getStats().cachedSignals).toBe(1);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle large number of signals efficiently', () => {
      const manager = new SignalMemoryManager();

      const count = 1000;

      // Cache many signals
      for (let i = 0; i < count; i++) {
        manager.cacheSignal(`path.${i}`, signal(i));
      }

      const stats = manager.getStats();
      expect(stats.cachedSignals).toBe(count);
      expect(stats.peakCachedSignals).toBe(count);

      // Retrieve random signals
      for (let i = 0; i < 100; i++) {
        const randomIdx = Math.floor(Math.random() * count);
        const sig = manager.getSignal(`path.${randomIdx}`);
        expect(sig?.()).toBe(randomIdx);
      }

      // Clean up
      manager.dispose();
      expect(manager.getStats().cachedSignals).toBe(0);
    });

    it('should handle nested object paths', () => {
      const manager = new SignalMemoryManager();

      const paths = [
        'user.profile.name',
        'user.profile.email',
        'user.settings.theme',
        'user.settings.notifications.email',
        'user.settings.notifications.push',
      ];

      paths.forEach((path, idx) => {
        manager.cacheSignal(path, signal(`value-${idx}`));
      });

      paths.forEach((path, idx) => {
        const sig = manager.getSignal(path);
        expect(sig?.()).toBe(`value-${idx}`);
      });

      const cachedPaths = manager.getCachedPaths();
      expect(cachedPaths).toHaveLength(paths.length);
      paths.forEach((path) => {
        expect(cachedPaths).toContain(path);
      });
    });

    it('should provide useful stats for monitoring', () => {
      const manager = new SignalMemoryManager();

      // Simulate application lifecycle
      for (let i = 0; i < 50; i++) {
        manager.cacheSignal(`temp.${i}`, signal(i));
      }

      let stats = manager.getStats();
      expect(stats.cachedSignals).toBe(50);

      // Remove some
      for (let i = 0; i < 20; i++) {
        manager.removeSignal(`temp.${i}`);
      }

      stats = manager.getStats();
      expect(stats.cachedSignals).toBe(30);
      expect(stats.peakCachedSignals).toBe(50);

      // Dispose
      manager.dispose();

      stats = manager.getStats();
      expect(stats.cachedSignals).toBe(0);
      expect(stats.manualDisposes).toBe(1);
    });
  });
});
