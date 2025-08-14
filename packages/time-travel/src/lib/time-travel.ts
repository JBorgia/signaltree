import { type SignalTree } from '@signaltree/core';
import { deepEqual, deepClone } from './utils';

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
    this.includePayload = config.includePayload ?? true;
    this.actionNames = {
      update: 'UPDATE',
      set: 'SET',
      batch: 'BATCH',
      ...config.actionNames,
    };

    // Add initial state to history
    this.addEntry('INIT', this.tree.unwrap());
  }

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
      state: deepClone(state),
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
      state: deepClone(entry.state),
    }));
  }

  resetHistory(): void {
    const currentState = this.tree.unwrap();
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
      this.tree.update(() => state);
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
    // Store original update method
    const originalUpdate = tree.update.bind(tree);

    // Flag to prevent time travel during restoration
    let isRestoring = false;

    // Create time travel manager with restoration function
    const timeTravelManager = new TimeTravelManager(
      tree,
      config,
      (state: T) => {
        isRestoring = true;
        try {
          originalUpdate(() => state);
        } finally {
          isRestoring = false;
        }
      }
    );

    // Add middleware to track state changes
    tree.update = (updater: (current: T) => Partial<T>) => {
      if (isRestoring) {
        // During restoration, just call original update
        return originalUpdate(updater);
      }

      const beforeState = tree.unwrap();
      originalUpdate(updater);
      const afterState = tree.unwrap();

      // Only add to history if state actually changed
      const statesEqual = deepEqual(beforeState, afterState);

      if (!statesEqual) {
        timeTravelManager.addEntry('update', afterState);
      }
    };

    return {
      ...tree,
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
