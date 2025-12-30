import { snapshotState } from '../../lib/utils';
import { deepClone, deepEqual } from './utils';

import type { TreeNode } from '../../lib/utils';
import type {
  SignalTreeBase,
  TimeTravelMethods,
  TimeTravelConfig,
  TimeTravelEntry,
} from '../../lib/types';

// Re-export for convenience (do not redefine locally)
export type { TimeTravelConfig, TimeTravelEntry };

// (TimeTravelConfig is imported from canonical types)

/**
 * Internal time travel state management
 */
class TimeTravelManager<T> {
  private history: TimeTravelEntry<T>[] = [];
  private currentIndex = -1;
  private maxHistorySize: number;
  private includePayload: boolean;
  private actionNames: Record<string, string>;

  constructor(
    private tree: SignalTreeBase<T>,
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
    this.addEntry('INIT', this.tree());
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
    // Ensure we store a plain, fully-unwrapped snapshot (no signal references)
    // by unwrapping the internal state node and then making a structured
    // clone to remove any residual accessors/functions.
    const plain = snapshotState(this.tree.state as unknown as TreeNode<T>);
    const cloned =
      typeof structuredClone !== 'undefined'
        ? structuredClone(plain)
        : JSON.parse(JSON.stringify(plain));
    const entry: TimeTravelEntry<T> = {
      // Store cloned plain snapshot
      state: cloned as T,
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
    const currentState = this.tree();
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
      this.tree(state);
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
export function withTimeTravel(
  config: TimeTravelConfig = {}
): <Tree extends SignalTreeBase<any>>(tree: Tree) => Tree & TimeTravelMethods {
  const { enabled = true } = config;
  return <Tree extends SignalTreeBase<any>>(
    tree: Tree
  ): Tree & TimeTravelMethods => {
    type S = Tree extends SignalTreeBase<infer U> ? U : unknown;
    // Disabled (noop) path
    if (!enabled) {
      const noopMethods: TimeTravelMethods = {
        undo(): void {
          /* disabled */
        },
        redo(): void {
          /* disabled */
        },
        canUndo(): boolean {
          return false;
        },
        canRedo(): boolean {
          return false;
        },
        getHistory(): unknown[] {
          return [];
        },
        resetHistory(): void {
          /* disabled */
        },
        jumpTo(_index: number): void {
          void _index; /* disabled */
        },
        getCurrentIndex(): number {
          return -1;
        },
      };

      return Object.assign(tree, noopMethods) as Tree & TimeTravelMethods;
    }
    // Store the original callable tree function
    const originalTreeCall = (tree as any).bind(tree);

    // Flag to prevent time travel during restoration
    let isRestoring = false;

    // Create time travel manager with restoration function
    const timeTravelManager = new TimeTravelManager(
      tree,
      config,
      (state: S) => {
        isRestoring = true;
        try {
          originalTreeCall(state);
        } finally {
          isRestoring = false;
        }
      }
    );

    // Create enhanced tree function that includes time travel tracking
    const enhancedTree = function (
      this: SignalTreeBase<S>,
      ...args: unknown[]
    ) {
      if (args.length === 0) {
        return originalTreeCall();
      } else {
        if (isRestoring) {
          if (args.length === 1) {
            const arg = args[0];
            if (typeof arg === 'function') {
              return originalTreeCall(arg as (current: S) => S);
            } else {
              return originalTreeCall(arg as S);
            }
          }
          return;
        }

        const beforeState = originalTreeCall();

        let result: void;
        if (args.length === 1) {
          const arg = args[0];
          if (typeof arg === 'function') {
            result = originalTreeCall(arg as (current: S) => S);
          } else {
            result = originalTreeCall(arg as S);
          }
        }

        const afterState = originalTreeCall();

        if (!deepEqual(beforeState, afterState)) {
          timeTravelManager.addEntry('update', afterState);
        }

        return result;
      }
    } as unknown as SignalTreeBase<S>;

    Object.setPrototypeOf(enhancedTree, Object.getPrototypeOf(tree));
    Object.assign(enhancedTree, tree);

    if ('state' in tree) {
      Object.defineProperty(enhancedTree, 'state', {
        value: tree.state,
        enumerable: false,
        configurable: true,
      });
    }

    if ('$' in tree) {
      Object.defineProperty(enhancedTree, '$', {
        value: (tree as any).$,
        enumerable: false,
        configurable: true,
      });
    }

    (enhancedTree as any)['undo'] = () => {
      timeTravelManager.undo();
    };
    (enhancedTree as any)['redo'] = () => {
      timeTravelManager.redo();
    };
    (enhancedTree as any)['getHistory'] = () => timeTravelManager.getHistory();
    (enhancedTree as any)['resetHistory'] = () => {
      timeTravelManager.resetHistory();
    };

    (enhancedTree as any)['jumpTo'] = (index: number) => {
      timeTravelManager.jumpTo(index);
    };
    (enhancedTree as any)['canUndo'] = () => timeTravelManager.canUndo();
    (enhancedTree as any)['canRedo'] = () => timeTravelManager.canRedo();
    (enhancedTree as any)['getCurrentIndex'] = () =>
      timeTravelManager.getCurrentIndex();

    return enhancedTree as unknown as Tree & TimeTravelMethods;
  };
}

/**
 * Convenience function to enable basic time travel
 */
export function enableTimeTravel(): <Tree extends SignalTreeBase<any>>(
  tree: Tree
) => Tree & TimeTravelMethods {
  return withTimeTravel({ enabled: true });
}

/**
 * Time travel with custom history size (v6 pattern)
 */
export function withTimeTravelHistory(
  maxHistorySize: number
): <Tree extends SignalTreeBase<any>>(tree: Tree) => Tree & TimeTravelMethods {
  return withTimeTravel({ maxHistorySize });
}
