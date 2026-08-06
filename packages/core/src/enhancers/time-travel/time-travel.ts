import { snapshotState } from '../../lib/utils';
import { copyTreeProperties } from '../utils/copy-tree-properties';
import { interceptLeafSignals } from '../../lib/internals/intercept-leaf-signals';
import { getPathNotifier } from '../../lib/path-notifier';
import { withWriteContext } from '../../lib/write-context';

import type {
  ISignalTree,
  TimeTravelMethods,
  TimeTravelConfig,
  TimeTravelEntry,
  TreeNode,
  EnhancerMeta,
} from '../../lib/types';

import { ENHANCER_META } from '../../lib/types';

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
    private tree: ISignalTree<T>,
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
   * If `provisional` is true, mark the entry so it can be finalized
   * later (coalesced / updated) rather than creating multiple history
   * entries for rapid updates.
   */
  addEntry(
    action: string,
    state: T,
    payload?: unknown,
    provisional = false
  ): void {
    // If we're not at the end of history, remove everything after current position
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // A history entry IS the snapshot — no clone.
    //
    // This used to `structuredClone` the whole tree per entry, which made every
    // recorded write O(state) and retained a full copy of the state per entry:
    // 50 root writes each changing ONE number cost 0.03ms without time travel
    // and 340.60ms with it, at 10k rows.
    //
    // Materialisation is now memoised and structurally shared, so an unchanged
    // subtree is the SAME object across snapshots, and needs no copy to stay
    // correct because the library never mutates a materialised node: a write
    // builds new objects along the changed path and leaves the rest alone.
    //
    // ⚠️ WHAT THAT COSTS PER ENTRY, precisely — an earlier version of this
    // comment claimed "O(depth) per entry" flatly, and that is only true of
    // plain nested state. Measured on a 500-row collection, changing ONE entity:
    //
    //     unrelated branch shared : true      <- O(depth) holds here
    //     rows node shared        : false
    //     all ARRAY shared        : false
    //     entity objects shared   : 499 / 500
    //
    // So a collection costs O(collection-length IN POINTERS) per entry — the
    // `all` array is rebuilt — while the entity objects themselves are shared.
    // Far cheaper than the structuredClone it replaced, and far from free: 50
    // entries over 10k rows is ~500k pointer copies.
    //
    // This is why undo/redo over a large collection is NOT a strength — measured
    // at ~150x slower than elf's state-history for that shape. See
    // docs/compare/real-implementations.md.
    //
    // This is what makes the snapshot read-only contract load-bearing rather
    // than advisory (nodes are frozen in dev). A caller that mutates a snapshot
    // now corrupts history as well as the cache.
    const plain = snapshotState(this.tree.$ as unknown as TreeNode<T>);

    const entry: TimeTravelEntry<T> & { __provisional?: boolean } = {
      state: plain as T,
      timestamp: Date.now(),
      action: this.actionNames[action] || action,
      ...(this.includePayload && payload !== undefined && { payload }),
    };

    if (provisional) (entry as any).__provisional = true;

    // Dedupe by REFERENCE. `tree()` returns the identical object when nothing
    // changed, so this is exact for the case that matters and O(1) — the
    // deepEqual it replaces was a second full-state walk on every recorded
    // write, on top of the clone.
    //
    // Behaviour change worth knowing: two snapshots that are structurally equal
    // but referentially distinct are no longer collapsed. That needs a write
    // that changed something and a later write that changed it back, in
    // separate flushes — which is arguably two user actions and two entries.
    const last = this.history[this.history.length - 1];
    if (last && last.state === entry.state) {
      if ((last as any).__provisional) delete (last as any).__provisional;
      return; // skip duplicate
    }

    this.history.push(entry as TimeTravelEntry<T>);
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

  /**
   * Finalize a previously provisional entry (coalesced updates)
   */
  finalizeProvisional(state: T): void {
    const last = this.history[this.history.length - 1] as
      | (TimeTravelEntry<T> & { __provisional?: boolean })
      | undefined;
    if (last && (last as any).__provisional) {
      // If identical, just clear provisional marker. Reference compare for the
      // same reason as addEntry: snapshots are memoised and immutable.
      if (last.state === state) {
        delete (last as any).__provisional;
        return;
      }
      // Replace state and clear provisional flag. No clone — the snapshot is
      // already an immutable, structurally-shared value.
      last.state = state;
      last.timestamp = Date.now();
      delete (last as any).__provisional;
      return;
    }

    // No provisional entry to finalize - fall back to adding a new entry
    this.addEntry('update', state);
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
    // The entry OBJECTS are copied so a caller cannot rewrite history metadata,
    // but the STATE is handed over by reference.
    //
    // This used to `deepClone` every entry's state on every call — O(state x
    // entries) each time you asked, which is brutal for a devtools panel that
    // reads history on a timer, and it discarded the structural sharing between
    // entries at the API boundary: two entries differing in one leaf came back
    // as two full, unrelated copies.
    //
    // Snapshots are immutable by contract and frozen in dev, so the copy bought
    // nothing that the contract does not already give.
    return this.history.map((entry) => ({ ...entry }));
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
    // Tag every leaf write performed during this undo/redo/jump with
    // `source: 'time-travel'`. Enhancers (validation, guardrails) read this
    // via `getActiveWriteContext()` and can suppress side effects for replays.
    withWriteContext({ intent: 'system', source: 'time-travel' }, () => {
      if (this.restoreStateFn) {
        this.restoreStateFn(state);
      } else {
        // Fallback if no restoration function provided
        this.tree(state);
      }
    });
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
 * const store = signalTree({ count: 0, text: '' }).with(timeTravel());
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
 * }).with(timeTravel({
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

export function timeTravel(
  config: TimeTravelConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T> {
  const { enabled = true } = config;
  const enhancerFn = <T>(tree: ISignalTree<T>): ISignalTree<T> & TimeTravelMethods<T> => {
    // Disabled (noop) path
    if (!enabled) {
      const noopMethods: TimeTravelMethods<T> = {
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
        getHistory(): TimeTravelEntry<T>[] {
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

      return Object.assign(tree, noopMethods) as unknown as ISignalTree<T> &
        TimeTravelMethods<T>;
    }
    // Store the original callable tree function
    const originalTreeCall = (
      tree as unknown as {
        bind: (t: unknown) => (...args: unknown[]) => T;
      }
    ).bind(tree);

    // Flag to prevent time travel during restoration
    let isRestoring = false;

    // Create time travel manager with restoration function
    const timeTravelManager = new TimeTravelManager(
      tree,
      config,
      (state: T) => {
        isRestoring = true;
        try {
          originalTreeCall(state);
        } finally {
          isRestoring = false;
        }
      }
    );

    // If PathNotifier batching is enabled, use flush events to record
    // a single snapshot per flush; otherwise, keep the existing immediate
    // update-based history entry.
    //
    // IMPORTANT: signalTree's recursive update pipeline writes to leaf
    // signals directly without calling PathNotifier.notify(); only entity
    // collections notify by themselves. To make direct leaf writes such as
    // `tree.$.user.profile.name.set('x')` observable here we recursively
    // intercept every plain writable signal and route their writes through
    // the global notifier. Without this interception, time-travel would
    // silently miss every leaf .set()/.update() in the tree.
    /** Set by this tree's own leaf interceptors; read by the global flush hook. */
    let selfDirty = false;
    let unsubscribeFlush: (() => void) | null = null;
    let restoreLeafInterceptors: (() => void) | null = null;
    try {
      const notifier = getPathNotifier();
      if (notifier) {
        if ('$' in tree) {
          restoreLeafInterceptors = interceptLeafSignals(
            (tree as ISignalTree<T>).$ as Record<string, unknown>,
            (path, next, prev) => {
              if (isRestoring) return;
              // Mark THIS tree dirty. The flush hook below is global, so
              // without this flag every time-travelled tree snapshotted itself
              // whenever ANY tree in the process flushed.
              selfDirty = true;
              notifier.notify(path, next, prev);
            }
          );
        }
        if (typeof notifier.onFlush === 'function') {
          unsubscribeFlush = notifier.onFlush(() => {
            // Avoid recording history while restoring
            if (isRestoring) return;
            // `onFlush` is on the GLOBAL PathNotifier, so this fires for writes
            // to trees that have nothing to do with this one. Recording
            // unconditionally meant a full materialise + structuredClone of
            // THIS tree on every unrelated flush, then throwing it away:
            // measured 0.008ms -> 3.7 -> 7.2 -> 9.7ms as 1/2/3 unrelated
            // 10k-leaf trees were kept alive. Cost that scales with OTHER
            // people's trees is the worst kind.
            if (!selfDirty) return;
            selfDirty = false;
            const afterState = originalTreeCall();
            timeTravelManager.addEntry('batch', afterState);
          });
        }
      }
    } catch {
      // Ignore - fall back to default behavior
    }

    // Create enhanced tree function that includes time travel tracking
    const enhancedTree = function (this: ISignalTree<T>, ...args: unknown[]) {
      if (args.length === 0) {
        return originalTreeCall();
      } else {
        if (isRestoring) {
          if (args.length === 1) {
            const arg = args[0];
            if (typeof arg === 'function') {
              return originalTreeCall(arg as (current: T) => T);
            } else {
              return originalTreeCall(arg as T);
            }
          }
          return;
        }

        const beforeState = originalTreeCall();

        let result: unknown;
        if (args.length === 1) {
          const arg = args[0];
          if (typeof arg === 'function') {
            result = originalTreeCall(arg as (current: T) => T);
          } else {
            result = originalTreeCall(arg as T);
          }
        }

        const afterState = originalTreeCall();

        // Reference compare, not deepEqual. Both sides come from the memoised
        // root materialisation, which returns the IDENTICAL object when nothing
        // changed — so this is exact, and O(1) instead of a full-state walk on
        // every single root write. That walk was the dominant remaining cost:
        // 50 writes changing ONE number cost 57.49ms at 10k rows with it and
        // 0.44ms without.
        if (beforeState !== afterState) {
          // Immediate entry on explicit tree updates (preserve historical behavior)
          timeTravelManager.addEntry('update', afterState);
        }

        return result;
      }
    } as unknown as ISignalTree<T>;

    Object.setPrototypeOf(enhancedTree, Object.getPrototypeOf(tree));
    // copyTreeProperties, NOT Object.assign: `Object.assign` copies only
    // ENUMERABLE own properties, and every tree method (`updateAndReport`,
    // `batchUpdate`, `onPathChange`, `registerCleanup`, …) is defined
    // `enumerable: false`. They were silently dropped, so the builder that
    // wraps this enhanced tree found no method to forward to and returned an
    // empty result — `updateAndReport({count:1})` returned [] and never wrote.
    copyTreeProperties(tree as unknown as object, enhancedTree as unknown as object);

    // Define new .with() method that passes enhancedTree (not the original tree)
    // to subsequent enhancers. This is critical for preserving the enhancer chain.
    Object.defineProperty(enhancedTree, 'with', {
      value: function <R>(enhancer: (tree: ISignalTree<T>) => R): R {
        if (typeof enhancer !== 'function') {
          throw new Error('Enhancer must be a function');
        }
        return enhancer(enhancedTree as ISignalTree<T>) as R;
      },
      writable: false,
      enumerable: false,
      configurable: true,
    });

    if ('$' in tree) {
      Object.defineProperty(enhancedTree, '$', {
        value: (tree as ISignalTree<T>).$,
        enumerable: false,
        configurable: true,
      });
    }

    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['undo'] = () => {
      timeTravelManager.undo();
    };
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['redo'] = () => {
      timeTravelManager.redo();
    };
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['getHistory'] =
      () => timeTravelManager.getHistory();
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['resetHistory'] =
      () => {
        timeTravelManager.resetHistory();
      };

    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['jumpTo'] = (
      index: number
    ) => {
      timeTravelManager.jumpTo(index);
    };
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['canUndo'] = () =>
      timeTravelManager.canUndo();
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['canRedo'] = () =>
      timeTravelManager.canRedo();
    (enhancedTree as ISignalTree<T> & TimeTravelMethods<T>)['getCurrentIndex'] =
      () => timeTravelManager.getCurrentIndex();

    // Expose internal manager for advanced tooling / demo usage
    (enhancedTree as unknown as Record<string, unknown>)['__timeTravel'] =
      timeTravelManager;

    // Register cleanup to free history snapshots on destroy and to tear down
    // PathNotifier subscriptions / leaf-signal interceptors.
    if (typeof tree.registerCleanup === 'function') {
      tree.registerCleanup(() => {
        try {
          unsubscribeFlush?.();
        } catch {
          /* ignore */
        }
        try {
          restoreLeafInterceptors?.();
        } catch {
          /* ignore */
        }
        unsubscribeFlush = null;
        restoreLeafInterceptors = null;
        timeTravelManager.resetHistory();
      });
    }

    return enhancedTree as unknown as ISignalTree<T> & TimeTravelMethods<T>;
  };

  const meta: EnhancerMeta = { name: 'timeTravel', provides: ['timeTravel'] };
  (enhancerFn as unknown as { metadata: EnhancerMeta }).metadata = meta;
  (enhancerFn as unknown as Record<symbol, EnhancerMeta>)[ENHANCER_META] = meta;
  return enhancerFn;
}

/**
 * Convenience function to enable basic time travel
 */
export function enableTimeTravel(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & TimeTravelMethods<T> {
  return timeTravel({ enabled: true });
}

/**
 * Time travel with custom history size (v6 pattern).
 *
 * Not exported: reachable only as `withTimeTravel.history`, which is the
 * documented surface. Nothing imports the bare name.
 */
function timeTravelHistory(
  maxHistorySize: number
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T> {
  return timeTravel({ maxHistorySize });
}

// New v6-friendly export: `timeTravel` with named presets.
export const withTimeTravel = Object.assign(
  (config: TimeTravelConfig = {}) => timeTravel(config),
  {
    minimal: () => timeTravel({ maxHistorySize: 20, includePayload: false }),
    debug: () => timeTravel({ maxHistorySize: 200, includePayload: true }),
    history: timeTravelHistory,
  }
);
