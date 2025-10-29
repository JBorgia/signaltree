/**
 * Memory Manager for SignalTree
 * Provides automatic cleanup and memory leak prevention for lazy-loaded signal trees
 * @packageDocumentation
 */

import type { WritableSignal } from '@angular/core';

/**
 * Memory statistics for monitoring
 */
export interface MemoryStats {
  /** Total number of signals currently cached */
  cachedSignals: number;

  /** Number of signals cleaned up by FinalizationRegistry */
  cleanedUpSignals: number;

  /** Peak number of cached signals */
  peakCachedSignals: number;

  /** Number of manual dispose calls */
  manualDisposes: number;

  /** Estimated memory usage in bytes (approximate) */
  estimatedMemoryBytes: number;
}

/**
 * Configuration for MemoryManager
 */
export interface MemoryManagerConfig {
  /**
   * Enable automatic cleanup via FinalizationRegistry
   * @default true
   */
  enableAutoCleanup?: boolean;

  /**
   * Enable debug logging for memory operations
   * @default false
   */
  debugMode?: boolean;

  /**
   * Callback when signals are cleaned up
   */
  onCleanup?: (path: string, stats: MemoryStats) => void;
}

/**
 * Signal cache entry with WeakRef
 */
interface CacheEntry {
  /** WeakRef to the signal */
  ref: WeakRef<WritableSignal<unknown>>;

  /** Path to the signal for debugging */
  path: string;

  /** Timestamp when cached */
  cachedAt: number;
}

/**
 * SignalMemoryManager
 *
 * Manages memory for lazy-loaded signal trees using WeakRef and FinalizationRegistry.
 * Provides automatic cleanup when signals are no longer referenced, preventing memory leaks.
 *
 * Features:
 * - WeakRef caches allow garbage collection when signals are unused
 * - FinalizationRegistry automatically cleans up after GC
 * - Stats API for memory profiling and monitoring
 * - Manual dispose() for explicit cleanup
 *
 * @example
 * ```ts
 * const manager = new SignalMemoryManager({
 *   enableAutoCleanup: true,
 *   onCleanup: (path, stats) => {
 *     console.log(`Cleaned up signal at ${path}`, stats);
 *   }
 * });
 *
 * // Cache a signal
 * manager.cacheSignal('user.name', nameSignal);
 *
 * // Get cached signal (returns undefined if GC'd)
 * const signal = manager.getSignal('user.name');
 *
 * // Get memory stats
 * const stats = manager.getStats();
 * console.log(`Memory: ${stats.estimatedMemoryBytes} bytes`);
 *
 * // Dispose all cached signals
 * manager.dispose();
 * ```
 */
export class SignalMemoryManager {
  private cache = new Map<string, CacheEntry>();
  private registry: FinalizationRegistry<string> | null = null;
  private config: Required<MemoryManagerConfig>;

  // Statistics
  private stats = {
    cleanedUpSignals: 0,
    peakCachedSignals: 0,
    manualDisposes: 0,
  };

  constructor(config: MemoryManagerConfig = {}) {
    this.config = {
      enableAutoCleanup: config.enableAutoCleanup ?? true,
      debugMode: config.debugMode ?? false,
      onCleanup:
        config.onCleanup ??
        (() => {
          // Default no-op
        }),
    };

    // Set up FinalizationRegistry for automatic cleanup
    if (
      this.config.enableAutoCleanup &&
      typeof FinalizationRegistry !== 'undefined'
    ) {
      this.registry = new FinalizationRegistry((path: string) => {
        this.handleCleanup(path);
      });
    }

    if (this.config.debugMode) {
      console.log('[SignalMemoryManager] Initialized', {
        autoCleanup: this.config.enableAutoCleanup,
        hasRegistry: !!this.registry,
      });
    }
  }

  /**
   * Cache a signal with WeakRef for automatic garbage collection
   *
   * @param path - Dot-notation path to the signal
   * @param signal - The signal to cache
   */
  cacheSignal<T>(path: string, signal: WritableSignal<T>): void {
    // Create WeakRef to allow GC
    const ref = new WeakRef(signal) as WeakRef<WritableSignal<unknown>>;

    // Store in cache
    const entry: CacheEntry = {
      ref,
      path,
      cachedAt: Date.now(),
    };

    this.cache.set(path, entry);

    // Register for automatic cleanup
    if (this.registry) {
      this.registry.register(signal as WritableSignal<unknown>, path, signal);
    }

    // Update peak stats
    const currentSize = this.cache.size;
    if (currentSize > this.stats.peakCachedSignals) {
      this.stats.peakCachedSignals = currentSize;
    }

    if (this.config.debugMode) {
      console.log(`[SignalMemoryManager] Cached signal: ${path}`, {
        cacheSize: currentSize,
        peak: this.stats.peakCachedSignals,
      });
    }
  }

  /**
   * Get a cached signal
   * Returns undefined if the signal has been garbage collected
   *
   * @param path - Dot-notation path to the signal
   * @returns The signal or undefined if GC'd
   */
  getSignal(path: string): WritableSignal<unknown> | undefined {
    const entry = this.cache.get(path);

    if (!entry) {
      return undefined;
    }

    // Try to dereference the WeakRef
    const signal = entry.ref.deref();

    if (!signal) {
      // Signal was garbage collected, remove from cache
      this.cache.delete(path);

      if (this.config.debugMode) {
        console.log(`[SignalMemoryManager] Signal GC'd: ${path}`);
      }

      return undefined;
    }

    return signal;
  }

  /**
   * Check if a signal is cached (even if potentially GC'd)
   *
   * @param path - Dot-notation path to the signal
   * @returns true if the path exists in cache
   */
  hasSignal(path: string): boolean {
    return this.cache.has(path);
  }

  /**
   * Remove a signal from the cache
   *
   * @param path - Dot-notation path to the signal
   * @returns true if the signal was removed
   */
  removeSignal(path: string): boolean {
    const entry = this.cache.get(path);

    if (!entry) {
      return false;
    }

    // Unregister from FinalizationRegistry
    const signal = entry.ref.deref();
    if (signal && this.registry) {
      this.registry.unregister(signal);
    }

    this.cache.delete(path);

    if (this.config.debugMode) {
      console.log(`[SignalMemoryManager] Removed signal: ${path}`);
    }

    return true;
  }

  /**
   * Handle automatic cleanup from FinalizationRegistry
   * @private
   */
  private handleCleanup(path: string): void {
    this.cache.delete(path);
    this.stats.cleanedUpSignals++;

    const currentStats = this.getStats();

    if (this.config.debugMode) {
      console.log(`[SignalMemoryManager] Auto cleanup: ${path}`, currentStats);
    }

    this.config.onCleanup(path, currentStats);
  }

  /**
   * Get current memory statistics
   *
   * @returns Current memory stats
   */
  getStats(): MemoryStats {
    // Clean up stale entries (where WeakRef.deref() returns undefined)
    let validSignals = 0;

    for (const [path, entry] of this.cache.entries()) {
      if (entry.ref.deref()) {
        validSignals++;
      } else {
        // Remove stale entry
        this.cache.delete(path);
      }
    }

    // Rough estimate: each signal ~100 bytes (very approximate)
    const estimatedMemoryBytes = validSignals * 100;

    return {
      cachedSignals: validSignals,
      cleanedUpSignals: this.stats.cleanedUpSignals,
      peakCachedSignals: this.stats.peakCachedSignals,
      manualDisposes: this.stats.manualDisposes,
      estimatedMemoryBytes,
    };
  }

  /**
   * Dispose all cached signals and clean up resources
   * Call this when destroying a SignalTree to prevent memory leaks
   */
  dispose(): void {
    if (this.config.debugMode) {
      console.log('[SignalMemoryManager] Disposing', {
        cachedSignals: this.cache.size,
      });
    }

    // Unregister all signals from FinalizationRegistry
    if (this.registry) {
      for (const entry of this.cache.values()) {
        const signal = entry.ref.deref();
        if (signal) {
          this.registry.unregister(signal);
        }
      }
    }

    // Clear cache
    this.cache.clear();
    this.stats.manualDisposes++;

    if (this.config.debugMode) {
      console.log('[SignalMemoryManager] Disposed', this.getStats());
    }
  }

  /**
   * Get all cached signal paths (for debugging)
   *
   * @returns Array of cached signal paths
   */
  getCachedPaths(): string[] {
    const paths: string[] = [];

    for (const [path, entry] of this.cache.entries()) {
      // Only include if signal is still alive
      if (entry.ref.deref()) {
        paths.push(path);
      }
    }

    return paths;
  }

  /**
   * Clear all stale entries (where signals have been GC'd)
   * Useful for freeing up cache Map memory
   *
   * @returns Number of stale entries removed
   */
  clearStale(): number {
    let removed = 0;

    for (const [path, entry] of this.cache.entries()) {
      if (!entry.ref.deref()) {
        this.cache.delete(path);
        removed++;
      }
    }

    if (this.config.debugMode && removed > 0) {
      console.log(`[SignalMemoryManager] Cleared ${removed} stale entries`);
    }

    return removed;
  }

  /**
   * Reset all statistics
   */
  resetStats(): void {
    this.stats = {
      cleanedUpSignals: 0,
      peakCachedSignals: 0,
      manualDisposes: 0,
    };

    if (this.config.debugMode) {
      console.log('[SignalMemoryManager] Stats reset');
    }
  }
}
