import { type StateObject, type SignalTree } from '@signaltree/core';
import { isEqual, cloneDeep } from 'lodash';

/**
 * Entry in the time travel history
 */
export interface TimeTravelEntry<T extends StateObject = StateObject> {
  state: T;
  timestamp: number;
  action: string;
  payload?: unknown;
}

/**
 * Time travel interface for state history management
 */
export interface TimeTravelInterface<T extends StateObject = StateObject> {
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
class TimeTravelManager<T extends StateObject>
  implements TimeTravelInterface<T>
{
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
      state: cloneDeep(state),
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
      state: cloneDeep(entry.state),
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
 * Wraps a SignalTree to add time travel capabilities/**
 * Tree enhancer that adds time travel capabilities to a SignalTree
 */
export function withTimeTravel<T extends StateObject>(
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
      const statesEqual = isEqual(beforeState, afterState);

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
export function enableTimeTravel<T extends StateObject>(
  maxHistorySize?: number
): (
  tree: SignalTree<T>
) => SignalTree<T> & { __timeTravel: TimeTravelInterface<T> } {
  return withTimeTravel({ maxHistorySize });
}

/**
 * Get time travel interface from an enhanced tree
 */
export function getTimeTravel<T extends StateObject>(
  tree: SignalTree<T> & { __timeTravel?: TimeTravelInterface<T> }
): TimeTravelInterface<T> | undefined {
  return tree.__timeTravel;
}
