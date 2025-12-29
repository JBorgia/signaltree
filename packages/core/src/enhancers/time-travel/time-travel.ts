/**
 * v6 Time Travel Enhancer
 *
 * Contract: (config?) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & TimeTravelMethods
 *
 * Provides undo/redo functionality with state history management.
 */

import type {
  SignalTreeBase,
  TimeTravelMethods,
  TimeTravelConfig,
} from '../../lib/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Entry in the time travel history
 */
export interface TimeTravelEntry<T> {
  state: T;
  timestamp: number;
  action: string;
  payload?: unknown;
}

// ============================================================================
// Utility Functions
// ============================================================================

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;

  try {
    if (typeof structuredClone !== 'undefined') {
      return structuredClone(value);
    }
  } catch {
    // Fall through
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }

    return true;
  }

  return false;
}

// ============================================================================
// Time Travel Manager
// ============================================================================

class TimeTravelManager<S> {
  private history: TimeTravelEntry<S>[] = [];
  private currentIndex = -1;
  private readonly maxHistorySize: number;
  private readonly includePayload: boolean;
  private readonly actionNames: Record<string, string>;

  constructor(
    private readonly tree: SignalTreeBase<S>,
    config: TimeTravelConfig,
    private readonly restoreState: (state: S) => void
  ) {
    this.maxHistorySize = config.maxHistorySize ?? 50;
    this.includePayload = config.includePayload ?? true;
    this.actionNames = {
      update: 'UPDATE',
      set: 'SET',
      init: 'INIT',
      reset: 'RESET',
      ...config.actionNames,
    };

    // Add initial state
    this.addEntry('init', this.snapshot());
  }

  private snapshot(): S {
    return deepClone(this.tree() as S);
  }

  addEntry(action: string, state: S, payload?: unknown): void {
    // Truncate forward history
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const entry: TimeTravelEntry<S> = {
      state: deepClone(state),
      timestamp: Date.now(),
      action: this.actionNames[action] ?? action,
    };

    if (this.includePayload && payload !== undefined) {
      entry.payload = payload;
    }

    this.history.push(entry);
    this.currentIndex = this.history.length - 1;

    // Enforce max size
    while (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }
  }

  recordCurrentState(action = 'update', payload?: unknown): void {
    const currentState = this.snapshot();
    const lastEntry = this.history[this.currentIndex];

    if (!lastEntry || !deepEqual(lastEntry.state, currentState)) {
      this.addEntry(action, currentState, payload);
    }
  }

  undo(): boolean {
    if (!this.canUndo()) return false;

    this.currentIndex--;
    const entry = this.history[this.currentIndex];
    this.restoreState(deepClone(entry.state));
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;

    this.currentIndex++;
    const entry = this.history[this.currentIndex];
    this.restoreState(deepClone(entry.state));
    return true;
  }

  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  getHistory(): TimeTravelEntry<S>[] {
    return this.history.map((entry) => ({
      ...entry,
      state: deepClone(entry.state),
    }));
  }

  resetHistory(): void {
    const currentState = this.snapshot();
    this.history = [];
    this.currentIndex = -1;
    this.addEntry('reset', currentState);
  }

  jumpTo(index: number): boolean {
    if (index < 0 || index >= this.history.length) return false;

    this.currentIndex = index;
    const entry = this.history[index];
    this.restoreState(deepClone(entry.state));
    return true;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }
}

// ============================================================================
// Main Enhancer Implementation
// ============================================================================

/**
 * Enhances a SignalTree with time travel capabilities.
 *
 * @param config - Time travel configuration
 * @returns Polymorphic enhancer function
 *
 * @example
 * ```typescript
 * const tree = signalTree({ count: 0, name: '' })
 *   .with(withTimeTravel({ maxHistorySize: 100 }));
 *
 * // Make changes
 * tree.$.count.set(1);
 * tree.$.name.set('test');
 *
 * // Undo/redo
 * tree.undo();
 * tree.redo();
 *
 * // Jump to specific point
 * tree.jumpTo(0);
 *
 * // View history
 * const history = tree.getHistory();
 * ```
 */
export function withTimeTravel(
  config: TimeTravelConfig = {}
): <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & TimeTravelMethods {
  const { enabled = true } = config;

  return <S>(
    tree: SignalTreeBase<S>
  ): SignalTreeBase<S> & TimeTravelMethods => {
    // Disabled path
    if (!enabled) {
      const noopMethods: TimeTravelMethods = {
        undo(): void { return; },
        redo(): void { return; },
        canUndo(): boolean {
          return false;
        },
        canRedo(): boolean {
          return false;
        },
        getHistory(): unknown[] {
          return [];
        },
        resetHistory(): void { return; },
        jumpTo(): void { return; },
        getCurrentIndex(): number {
          return -1;
        },
      };
      return Object.assign(tree, noopMethods);
    }

    // Flag to prevent recording during restoration
    let isRestoring = false;

    // Restore function
    const restoreState = (state: S): void => {
      isRestoring = true;
      try {
        const treeState = tree.state as Record<string, unknown>;
        const newState = state as Record<string, unknown>;

        for (const key of Object.keys(newState)) {
          const node = treeState[key];
          if (node && typeof node === 'function') {
            (node as (v: unknown) => void)(newState[key]);
          } else if (node && typeof node === 'object' && 'set' in node) {
            (node as { set: (v: unknown) => void }).set(newState[key]);
          }
        }
      } finally {
        isRestoring = false;
      }
    };

    // Create manager
    const manager = new TimeTravelManager(tree, config, restoreState);

    // Track last known state for change detection
    let lastKnownState = deepClone(tree() as S);

    const checkAndRecordChanges = (): void => {
      if (isRestoring) return;

      const currentState = tree() as S;
      if (!deepEqual(lastKnownState, currentState)) {
        manager.recordCurrentState('update');
        lastKnownState = deepClone(currentState);
      }
    };

    const methods: TimeTravelMethods = {
      undo(): void {
        checkAndRecordChanges();
        manager.undo();
        lastKnownState = deepClone(tree() as S);
      },

      redo(): void {
        manager.redo();
        lastKnownState = deepClone(tree() as S);
      },

      canUndo(): boolean {
        checkAndRecordChanges();
        return manager.canUndo();
      },

      canRedo(): boolean {
        return manager.canRedo();
      },

      getHistory(): unknown[] {
        checkAndRecordChanges();
        return manager.getHistory();
      },

      resetHistory(): void {
        manager.resetHistory();
        lastKnownState = deepClone(tree() as S);
      },

      jumpTo(index: number): void {
        checkAndRecordChanges();
        manager.jumpTo(index);
        lastKnownState = deepClone(tree() as S);
      },

      getCurrentIndex(): number {
        return manager.getCurrentIndex();
      },
    };

    return Object.assign(tree, methods);
  };
}

// ============================================================================
// Convenience Helpers
// ============================================================================

/**
 * Enable time travel with default settings
 */
export function enableTimeTravel(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & TimeTravelMethods {
  return withTimeTravel({ enabled: true });
}

/**
 * Time travel with custom history size
 */
export function withTimeTravelHistory(
  maxHistorySize: number
): <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & TimeTravelMethods {
  return withTimeTravel({ maxHistorySize });
}

/**
 * Lightweight time travel with smaller history
 */
export function withLightweightTimeTravel(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & TimeTravelMethods {
  return withTimeTravel({
    maxHistorySize: 20,
    includePayload: false,
  });
}

/**
 * Full-featured time travel for debugging
 */
export function withDebugTimeTravel(): <S>(
  tree: SignalTreeBase<S>
) => SignalTreeBase<S> & TimeTravelMethods {
  return withTimeTravel({
    maxHistorySize: 200,
    includePayload: true,
  });
}
