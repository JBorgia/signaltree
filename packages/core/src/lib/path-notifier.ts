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
 * Used internally by SignalTree for entity hooks and enhancers
 *
 * @internal
 */
export class PathNotifier {
  // Map of pattern -> Set of handlers
  private subscribers = new Map<string, Set<PathNotifierHandler>>();

  // Map of pattern -> Set of interceptors
  private interceptors = new Map<string, Set<PathNotifierInterceptor>>();

  /**
   * Subscribe to mutations matching a path pattern
   * Returns unsubscribe function
   */
  subscribe(pattern: string, handler: PathNotifierHandler): () => void {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }
    const handlers = this.subscribers.get(pattern)!;
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
    const interceptors = this.interceptors.get(pattern)!;
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
   */
  notify(
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
 * Lazy initialization ensures zero overhead if entities/enhancers aren't used
 *
 * @internal
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
  globalPathNotifier = null;
}
