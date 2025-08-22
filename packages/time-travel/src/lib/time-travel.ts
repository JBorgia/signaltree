import type { SignalTree, DeepSignalify } from '@signaltree/core';
// Defer importing heavy utilities until needed so common paths don't include
// deepClone/deepEqual in production bundles unless time-travel payloads are used.
// We prefer native structuredClone when available. As a conservative,
// synchronous fallback we use JSON-based cloning for typical plain-data
// state objects. This avoids pulling the full deepClone implementation into
// the common bundle while keeping behavior predictable.
const hasStructuredClone =
  typeof (globalThis as unknown as { structuredClone?: unknown })
    .structuredClone === 'function';

function jsonClone<T>(v: T): T {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

/**
 * Entry in the time travel history
 */
export interface TimeTravelEntry<T> {
  state: T;
  timestamp: number;
  action: string;
  payload?: unknown;
}

/**
 * Time travel interface for state history management
 */
export interface TimeTravelInterface<T> {
  /**
   * Navigate backward in history by one step
   */
  undo(): boolean;

  /**
   * Navigate forward in history by one step
   */
  redo(): boolean;

  /**
   * Get the complete history of state changes
   */
  getHistory(): TimeTravelEntry<T>[];

  /**
   * Reset the history, keeping only the current state
   */
  resetHistory(): void;

  /**
   * Jump to a specific point in history by index
   */
  jumpTo(index: number): boolean;

  /**
   * Get current position in history
   */
  getCurrentIndex(): number;

  /**
   * Check if undo is possible
   */
  canUndo(): boolean;

  /**
   * Check if redo is possible
   */
  canRedo(): boolean;
}

/**
 * Configuration options for time travel
 */
export interface TimeTravelConfig {
  /**
   * Maximum number of history entries to keep
   * @default 50
   */
  maxHistorySize?: number;

  /**
   * Whether to include payload information in history entries
   * @default true
   */
  includePayload?: boolean;

  /**
   * Custom action names for different operations
   */
  actionNames?: {
    update?: string;
    set?: string;
    batch?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Internal time travel state management
 */
class TimeTravelManager<T> implements TimeTravelInterface<T> {
  private history: TimeTravelEntry<T>[] = [];
  private currentIndex = -1;
  private maxHistorySize: number;
  private includePayload: boolean;
  private actionNames: Record<string, string>;

  constructor(
    private tree: SignalTree<T>,
    private config: TimeTravelConfig = {},
    private restoreStateFn?: (state: T) => void
  ) {
    this.maxHistorySize = config.maxHistorySize ?? 50;
    // Default to not including payload to keep history entries smaller by default
    this.includePayload = config.includePayload ?? false;
    this.actionNames = {
      update: 'UPDATE',
      set: 'SET',
      batch: 'BATCH',
      ...config.actionNames,
    };

    // Add initial state to history
    this.addEntry('INIT', this.tree.$());
  }

  // (equality helper intentionally defined at module scope below)
  /**
   * Add a new entry to the history
   */
  addEntry(action: string, state: T, payload?: unknown): void {
    // If we're not at the end of history, remove everything after current position
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Create new entry
    const entry: TimeTravelEntry<T> = {
      state: hasStructuredClone
        ? ((
            globalThis as unknown as {
              structuredClone: (x: unknown) => unknown;
            }
          ).structuredClone(state) as T)
        : jsonClone(state),
      timestamp: Date.now(),
      action: this.actionNames[action] || action,
      ...(this.includePayload && payload !== undefined && { payload }),
    };

    this.history.push(entry);
    this.currentIndex = this.history.length - 1;

    // Enforce max history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }
  }

  undo(): boolean {
    if (!this.canUndo()) {
      return false;
    }

    this.currentIndex--;
    const entry = this.history[this.currentIndex];
    this.restoreState(entry.state);
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) {
      return false;
    }

    this.currentIndex++;
    const entry = this.history[this.currentIndex];
    this.restoreState(entry.state);
    return true;
  }

  getHistory(): TimeTravelEntry<T>[] {
    return this.history.map((entry) => ({
      ...entry,
      state: hasStructuredClone
        ? ((
            globalThis as unknown as {
              structuredClone: (x: unknown) => unknown;
            }
          ).structuredClone(entry.state) as T)
        : jsonClone(entry.state),
    }));
  }

  resetHistory(): void {
    const currentState = this.tree.$();
    this.history = [];
    this.currentIndex = -1;
    this.addEntry('RESET', currentState);
  }

  jumpTo(index: number): boolean {
    if (index < 0 || index >= this.history.length) {
      return false;
    }

    this.currentIndex = index;
    const entry = this.history[index];
    this.restoreState(entry.state);
    return true;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Restore state without triggering time travel middleware
   */
  private restoreState(state: T): void {
    if (this.restoreStateFn) {
      this.restoreStateFn(state);
    } else {
      // Fallback if no restoration function provided
      this.tree.$.update(() => state);
    }
  }
}

/**
 * Enhances a SignalTree with comprehensive time travel capabilities.
 *
 * Adds undo/redo functionality, state history management, and snapshot features.
 * Automatically tracks state changes and provides methods to navigate through
 * the application's state history with configurable limits and optimizations.
 *
 * @template T - The state object type
 * @param config - Configuration options for time travel behavior
 * @returns Function that enhances a SignalTree with time travel capabilities
 *
 * @example
 * ```typescript
 * // Basic time travel enhancement
 * const store = signalTree({ count: 0, text: '' }).with(withTimeTravel());
 *
 * // Make some changes
 * store.count.set(1);
 * store.text.set('hello');
 * store.count.set(2);
 *
 * // Access time travel interface
 * const timeTravel = store.__timeTravel;
 *
 * // Navigate history
 * console.log(timeTravel.canUndo()); // true
 * timeTravel.undo(); // count: 1, text: 'hello'
 * timeTravel.undo(); // count: 1, text: ''
 * timeTravel.undo(); // count: 0, text: ''
 *
 * timeTravel.redo(); // count: 1, text: ''
 * console.log(timeTravel.canRedo()); // true
 * ```
 *
 * @example
 * ```typescript
 * // Advanced configuration
 * const store = signalTree({
 *   document: { title: '', content: '' },
 *   settings: { theme: 'light' }
 * }).with(withTimeTravel({
 *   maxHistorySize: 50,        // Limit memory usage
 *   includePayload: true,      // Store action metadata
 *   actionNames: {             // Custom action names
 *     'update_title': 'Update Document Title',
 *     'change_theme': 'Change Theme'
 *   }
 * }));
 *
 * // Named actions with metadata
 * store.update(() => ({ document: { title: 'New Title' } }), 'update_title');
 *
 * // View detailed history
 * const history = store.__timeTravel.getHistory();
 * console.log(history[0].action); // 'Update Document Title'
 * console.log(history[0].timestamp); // Date when change occurred
 * ```
 */
export function withTimeTravel<T>(
  config: TimeTravelConfig = {}
): (
  tree: SignalTree<T>
) => SignalTree<T> & { __timeTravel: TimeTravelInterface<T> } {
  return (tree: SignalTree<T>) => {
    // Flag to prevent time travel during restoration
    let isRestoring = false;

    // Create time travel manager with restoration function
    const timeTravelManager = new TimeTravelManager(
      tree,
      config,
      (state: T) => {
        isRestoring = true;
        try {
          (tree.$ as unknown as { set: (value: T) => void }).set(state);
        } finally {
          isRestoring = false;
        }
      }
    );

    // Create intercepted proxy that wraps update and set methods
    function createInterceptedProxy(originalTree: SignalTree<T>) {
      return new Proxy(originalTree, {
        get(target, prop) {
          const value = (target as Record<string | symbol, unknown>)[prop];
          if (prop === '$') {
            const originalCallable = value as (...args: unknown[]) => unknown;
            return new Proxy(originalCallable, {
              get(callableTarget, callableProp) {
                const callableValue = (
                  callableTarget as unknown as Record<string | symbol, unknown>
                )[callableProp];

                if (
                  callableProp === 'update' &&
                  typeof callableValue === 'function'
                ) {
                  return (updater: (current: T) => Partial<T>) => {
                    if (isRestoring) {
                      // During restoration, just call original update
                      return (
                        callableValue as (...args: unknown[]) => unknown
                      ).call(callableTarget, updater);
                    }

                    const beforeState = target.$();
                    const result = (
                      callableValue as (...args: unknown[]) => unknown
                    ).call(callableTarget, updater);
                    const afterState = target.$();

                    // Only add to history if state actually changed. Prefer a
                    // deep equality util when available; otherwise fall back to
                    // the conservative synchronous fastEqual.
                    const statesEqual = fastEqual(beforeState, afterState);

                    if (!statesEqual) {
                      timeTravelManager.addEntry('update', afterState);
                    }

                    return result;
                  };
                }

                if (
                  callableProp === 'set' &&
                  typeof callableValue === 'function'
                ) {
                  return (newState: Partial<T>) => {
                    if (isRestoring) {
                      // During restoration, just call original set
                      return (
                        callableValue as (...args: unknown[]) => unknown
                      ).call(callableTarget, newState);
                    }

                    const beforeState = target.$();
                    const result = (
                      callableValue as (...args: unknown[]) => unknown
                    ).call(callableTarget, newState);
                    const afterState = target.$();

                    // Only add to history if state actually changed. Use the
                    // fallback equality check to keep behavior synchronous.
                    const statesEqual = fastEqual(beforeState, afterState);

                    if (!statesEqual) {
                      timeTravelManager.addEntry('set', afterState);
                    }

                    return result;
                  };
                }

                return callableValue;
              },
              apply(callableTarget, thisArg, args) {
                // Use the original callable via closure to ensure we invoke the
                // actual underlying function (and not the proxy wrapper).
                // Reflect.apply is safer and avoids relying on `.apply` existing
                // on the passed-in target (which may be a proxy object).
                return Reflect.apply(
                  originalCallable as unknown as (
                    ...args: unknown[]
                  ) => unknown,
                  thisArg,
                  args as unknown[]
                );
              },
            });
          }
          return value;
        },
      });
    }

    const enhancedTree = createInterceptedProxy(tree);

    // Best-effort: expose time-travel helpers on the callable proxy (`tree.$`)
    try {
      const callable = (enhancedTree as SignalTree<T>)
        .$ as unknown as DeepSignalify<T>;

      // These properties are defined on DeepSignalify in core types so dot-assignment
      // is type-safe and avoids index-signature workarounds.
      callable.undo = () => timeTravelManager.undo();
      callable.redo = () => timeTravelManager.redo();
      callable.getHistory = () => timeTravelManager.getHistory();
      callable.resetHistory = () => timeTravelManager.resetHistory();
      callable.jumpTo = (index: number) => timeTravelManager.jumpTo(index);
      callable.getCurrentIndex = () => timeTravelManager.getCurrentIndex();
      callable.canUndo = () => timeTravelManager.canUndo();
      callable.canRedo = () => timeTravelManager.canRedo();
    } catch {
      // best-effort only; don't break if proxy is sealed
    }

    return {
      ...enhancedTree,
      __timeTravel: timeTravelManager,
    } as SignalTree<T> & { __timeTravel: TimeTravelInterface<T> };
  };
}

/**
 * Convenience function to enable basic time travel
 */
export function enableTimeTravel<T>(
  maxHistorySize?: number
): (
  tree: SignalTree<T>
) => SignalTree<T> & { __timeTravel: TimeTravelInterface<T> } {
  return withTimeTravel({ maxHistorySize });
}

/**
 * Get time travel interface from an enhanced tree
 */
export function getTimeTravel<T>(
  tree: SignalTree<T> & { __timeTravel?: TimeTravelInterface<T> }
): TimeTravelInterface<T> | undefined {
  return tree.__timeTravel;
}

// Module-level fast equality fallback used to avoid importing heavy deepEqual
// utilities on the common path. This is intentionally conservative and
// synchronous.
function fastEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
