/**
 * PathNotifier - Simple internal notification system for all mutations
 *
 * Enables:
 * - Entity hooks (tap, intercept) to work without global state
 * - Enhancers (Persistence, TimeTravel, DevTools) to catch all mutations
 * - Clean path-based subscription pattern
 *
 * @internal
 */

export type PathNotifierHandler = (
  value: unknown,
  prev: unknown,
  path: string
) => void | Promise<void>;

export type PathNotifierInterceptor = (
  value: unknown,
  prev: unknown,
  path: string
) => { block?: boolean; transform?: unknown };

/**
 * Simple path-based notification system
 * Used internally by SignalTree for entity hooks and enhancers.
 * Access via getPathNotifier().
 */
export class PathNotifier {
  // Map of pattern -> Set of handlers
  private subscribers = new Map<string, Set<PathNotifierHandler>>();

  // Map of pattern -> Set of interceptors
  private interceptors = new Map<string, Set<PathNotifierInterceptor>>();

  // Batching state
  private batchingEnabled = true;
  private pendingFlush = false;
  private pending = new Map<string, { newValue: unknown; oldValue: unknown }>();
  private firstValues = new Map<string, unknown>();
  private flushCallbacks = new Set<() => void>();

  constructor(options?: { batching?: boolean }) {
    if (options && options.batching === false) this.batchingEnabled = false;
  }

  /**
   * Enable or disable batching at runtime (global opt-out)
   */
  setBatchingEnabled(enabled: boolean): void {
    this.batchingEnabled = enabled;
  }

  isBatchingEnabled(): boolean {
    return this.batchingEnabled;
  }

  /**
   * Subscribe to mutations matching a path pattern
   * Returns unsubscribe function
   */
  subscribe(pattern: string, handler: PathNotifierHandler): () => void {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }
    const handlers = this.subscribers.get(pattern);
    if (!handlers) {
      return () => {
        // No-op: pattern was not found
      };
    }
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscribers.delete(pattern);
      }
    };
  }

  /**
   * Add an interceptor for mutations matching a path pattern
   * Returns unsubscribe function
   */
  intercept(pattern: string, interceptor: PathNotifierInterceptor): () => void {
    if (!this.interceptors.has(pattern)) {
      this.interceptors.set(pattern, new Set());
    }
    const interceptors = this.interceptors.get(pattern);
    if (!interceptors) {
      return () => {
        // No-op: pattern was not found
      };
    }
    interceptors.add(interceptor);

    return () => {
      interceptors.delete(interceptor);
      if (interceptors.size === 0) {
        this.interceptors.delete(pattern);
      }
    };
  }

  /**
   * Notify all subscribers matching the path
   * Also runs interceptors and allows blocking/transforming
   * When batching is enabled, notifications are queued and flushed at
   * the end of the current microtask (via queueMicrotask).
   */
  notify(
    path: string,
    value: unknown,
    prev: unknown
  ): { blocked: boolean; value: unknown } {
    if (!this.batchingEnabled) {
      // Synchronous path: run interceptors and subscribers immediately
      return this._runNotify(path, value, prev);
    }

    // Batched path: record first oldValue for the path and latest newValue
    if (!this.pending.has(path)) {
      this.firstValues.set(path, prev);
    }
    this.pending.set(path, {
      newValue: value,
      oldValue: this.firstValues.get(path),
    });

    if (!this.pendingFlush) {
      this.pendingFlush = true;
      queueMicrotask(() => this.flush());
    }

    // Synchronous notify still returns not-blocked info (can't block during batching)
    return { blocked: false, value };
  }

  /**
   * Internal synchronous notification runner (interceptors + subscribers)
   */
  private _runNotify(
    path: string,
    value: unknown,
    prev: unknown
  ): { blocked: boolean; value: unknown } {
    let blocked = false;
    let transformed = value;

    // Run interceptors first (they can block or transform)
    for (const [pattern, interceptorSet] of this.interceptors) {
      if (this.matches(pattern, path)) {
        for (const interceptor of interceptorSet) {
          const result = interceptor(transformed, prev, path);
          if (result.block) {
            blocked = true;
          }
          if (result.transform !== undefined) {
            transformed = result.transform;
          }
        }
      }
    }

    // If blocked, return early
    if (blocked) {
      return { blocked: true, value: prev };
    }

    // Run subscribers (notification only, can't block/transform)
    for (const [pattern, handlers] of this.subscribers) {
      if (this.matches(pattern, path)) {
        for (const handler of handlers) {
          handler(transformed, prev, path);
        }
      }
    }

    return { blocked: false, value: transformed };
  }

  /**
   * Flush pending batched notifications immediately.
   * This is re-entrant safe and will process notifications queued during
   * subscriber callbacks in subsequent rounds.
   */
  private flush(): void {
    // Snapshot and clear before notifying to allow re-entrant behavior
    const toNotify = new Map(this.pending);
    this.pending.clear();
    this.firstValues.clear();
    this.pendingFlush = false;

    for (const [path, { newValue, oldValue }] of toNotify) {
      // If value didn't change compared to original oldValue, skip
      if (newValue === oldValue) continue;

      // Run interceptors + subscribers synchronously for each path
      const res = this._runNotify(path, newValue, oldValue);
      if (res.blocked) {
        // blocked by interceptor - nothing to do
      }
    }

    // Call flush listeners (e.g., timeTravel) once per flush
    for (const cb of Array.from(this.flushCallbacks)) {
      try {
        cb();
      } catch {
        // swallow callback errors to avoid breaking flush loop
      }
    }
  }

  /**
   * Force synchronous flush of pending notifications
   */
  flushSync(): void {
    // Process until no pending notifications exist
    while (this.pending.size > 0 || this.pendingFlush) {
      // If a pendingFlush was scheduled but not yet processed, clear flag and process
      if (this.pendingFlush && this.pending.size === 0) {
        // nothing queued - clear and continue
        this.pendingFlush = false;
        break;
      }
      this.flush();
    }
  }

  /**
   * Subscribe to flush events (called after a flush completes)
   */
  onFlush(callback: () => void): () => void {
    this.flushCallbacks.add(callback);
    return () => this.flushCallbacks.delete(callback);
  }

  /**
   * Check if there are pending notifications
   */
  hasPending(): boolean {
    return this.pending.size > 0;
  }

  /**
   * Simple pattern matching
   * - 'users' matches exactly 'users'
   * - 'users.*' matches 'users.u1', 'users.u2', etc.
   * - '**' matches everything
   */
  private matches(pattern: string, path: string): boolean {
    if (pattern === '**') return true;
    if (pattern === path) return true;

    // Handle wildcard patterns like 'users.*'
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return path.startsWith(prefix + '.');
    }

    return false;
  }

  /**
   * Clear all subscribers and interceptors
   */
  clear(): void {
    this.subscribers.clear();
    this.interceptors.clear();
    this.pending.clear();
    this.firstValues.clear();
    // Note: do NOT clear flush callbacks here. Enhancers may have
    // registered onFlush listeners that should survive a runtime reset
    // (e.g., resetPathNotifier) to avoid losing subscriptions silently.
    this.pendingFlush = false;
  }

  /**
   * Get count of active subscribers (for debugging)
   */
  getSubscriberCount(): number {
    let count = 0;
    for (const handlers of this.subscribers.values()) {
      count += handlers.size;
    }
    return count;
  }

  /**
   * Get count of active interceptors (for debugging)
   */
  getInterceptorCount(): number {
    let count = 0;
    for (const interceptors of this.interceptors.values()) {
      count += interceptors.size;
    }
    return count;
  }
}

/**
 * Lazy-initialized singleton PathNotifier
 * Created on first use, zero overhead if not used
 */
let globalPathNotifier: PathNotifier | null = null;

/**
 * Get or create the global PathNotifier
 * Lazy initialization ensures zero overhead if entities/enhancers aren't used.
 * Used by enhancers like guardrails for monitoring.
 */
export function getPathNotifier(): PathNotifier {
  if (!globalPathNotifier) {
    globalPathNotifier = new PathNotifier();
  }
  return globalPathNotifier;
}

/**
 * Reset the global PathNotifier (for testing)
 *
 * @internal
 */
export function resetPathNotifier(): void {
  // Preserve existing instance to keep subscribers registered (tests may call
  // reset after enhancers have subscribed). Instead of replacing the instance
  // we clear its internal state so listeners remain intact and later calls to
  // `getPathNotifier()` continue to return the same object.
  if (!globalPathNotifier) {
    globalPathNotifier = new PathNotifier();
    return;
  }

  globalPathNotifier.clear();
  globalPathNotifier.setBatchingEnabled(true);
}
