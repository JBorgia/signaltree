import { copyTreeProperties } from '../utils/copy-tree-properties';
import { visitTree } from '../../lib/internals/visit-tree';

import type {
  ISignalTree,
  BatchingConfig,
  BatchingMethods,
  EnhancerMeta,
} from '../../lib/types';
import { ENHANCER_META } from '../../lib/types';

declare const ngDevMode: boolean | undefined;

/**
 * Batching enhancer for SignalTree.
 *
 * KEY PRINCIPLE: Signal writes are ALWAYS synchronous.
 * Batching only affects change detection notification timing.
 *
 * This aligns with Angular's signal contract:
 * - signal.set(x) updates the value immediately
 * - signal() always returns the current value
 * - Effects/CD run on microtask
 *
 * @example
 * ```typescript
 * const tree = signalTree({ count: 0 }).with(batching());
 *
 * tree.$.count.set(5);
 * console.log(tree.$.count()); // 5 - immediate!
 *
 * tree.batch(() => {
 *   tree.$.a.set(1);
 *   tree.$.b.set(2);
 *   // Values update immediately, CD notification batched
 * });
 * ```
 */
export function batching(
  config: BatchingConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & BatchingMethods<T> {
  const enabled = config.enabled ?? true;
  const notificationDelayMs = config.notificationDelayMs ?? 0;

  const enhancerFn = <T>(tree: ISignalTree<T>): ISignalTree<T> & BatchingMethods<T> => {
    // ========================================
    // DISABLED PATH - passthrough
    // ========================================
    if (!enabled) {
      const passthrough: BatchingMethods<T> = {
        batch: (fn) => fn(),
        coalesce: (fn) => fn(),
        hasPendingNotifications: () => false,
        flushNotifications: () => {
          /* empty */
        },
      };

      const enhanced = tree as ISignalTree<T> & BatchingMethods<T>;
      Object.assign(enhanced, passthrough);

      // Backwards compat: batchUpdate delegates to immediate execution
      (enhanced as any).batchUpdate = (updater: (current: T) => Partial<T>) => {
        if (typeof (tree as any).batchUpdate === 'function') {
          (tree as any).batchUpdate(updater);
        } else {
          updater(tree());
        }
      };

      return enhanced;
    }

    // ========================================
    // NOTIFICATION BATCHING STATE
    // ========================================
    let notificationPending = false;
    let notificationTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let inBatch = false;
    let inCoalesce = false;

    // For coalesce: track pending writes by path
    const coalescedUpdates = new Map<string, () => void>();

    /**
     * Schedule CD notification on microtask or after delay.
     */
    const scheduleNotification = (): void => {
      if (notificationPending) return;
      notificationPending = true;

      if (notificationDelayMs > 0) {
        notificationTimeoutId = setTimeout(
          flushNotificationsInternal,
          notificationDelayMs
        );
      } else {
        queueMicrotask(flushNotificationsInternal);
      }
    };

    /**
     * Internal flush implementation
     */
    const flushNotificationsInternal = (): void => {
      if (!notificationPending) return;

      notificationPending = false;
      if (notificationTimeoutId !== undefined) {
        clearTimeout(notificationTimeoutId);
        notificationTimeoutId = undefined;
      }

      // Trigger Angular change detection if available
      // In Angular 17+, signals automatically notify
      // This is a hook for custom CD strategies
      if ((tree as any).__notifyChangeDetection) {
        (tree as any).__notifyChangeDetection();
      }
    };

    /**
     * Execute coalesced updates.
     */
    const flushCoalescedUpdates = (): void => {
      const updates = Array.from(coalescedUpdates.values());
      coalescedUpdates.clear();

      // Execute all coalesced updates
      updates.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error('[SignalTree] Error in coalesced update:', e);
        }
      });
    };

    // ========================================
    // WRAP SIGNAL SETTERS TO TRACK NOTIFICATIONS
    // ========================================

    /**
     * Recursively wrap signal setters to schedule notifications.
     * Signal values still update immediately (synchronous).
     *
     * Traversal is the shared `visitTree` skeleton; this visitor supplies only
     * the leaf action (wrap `.set`/`.update` for batch/coalesce scheduling) and
     * always recurses. `skipKey` reproduces the former hand-rolled key filter:
     * skipping `set`/`update`/`_`-prefixed keys keeps `visitTree` from *reading*
     * `.update` on an entityMap proxy, which would trip the proxy's get-trap and
     * fire a spurious `[ST2002]` warning. The `.set` read and the `'update' in
     * node` has-trap guard below match the previous behavior exactly.
     */
    const wrapSignalSetters = (rootNode: any): void => {
      visitTree(
        rootNode,
        (node: any, path) => {
          // If this node has a set method, wrap it.
          if (typeof node.set === 'function' && !node.__batchingWrapped) {
            const originalSet = node.set.bind(node);

            node.set = (value: any) => {
              if (inCoalesce) {
                coalescedUpdates.set(path, () => originalSet(value));
              } else {
                originalSet(value); // synchronous
              }
              if (!inBatch) {
                scheduleNotification();
              }
            };

            node.__batchingWrapped = true;
          }

          // `'update' in node` FIRST: a bare `node.update` read on an entityMap
          // proxy hits its get-trap and fires a spurious [ST2002] warning; the
          // `in` check goes through the has-trap (no warning).
          if (
            'update' in node &&
            typeof node.update === 'function' &&
            !node.__batchingUpdateWrapped
          ) {
            const originalUpdate = node.update.bind(node);

            node.update = (updater: any) => {
              if (inCoalesce) {
                coalescedUpdates.set(`${path}:update:${Date.now()}`, () =>
                  originalUpdate(updater)
                );
              } else {
                originalUpdate(updater);
              }
              if (!inBatch) {
                scheduleNotification();
              }
            };

            node.__batchingUpdateWrapped = true;
          }

          return true; // always recurse (a wrapped node still has children)
        },
        {
          skipKey: (key) =>
            key.startsWith('_') || key === 'set' || key === 'update',
        }
      );
    };

    // Wrap the tree's $ proxy
    if (tree.$) {
      wrapSignalSetters(tree.$);
    }

    // ========================================
    // BATCHING METHODS
    // ========================================

    const batchingMethods: BatchingMethods<T> = {
      /**
       * batch() - Group CD notifications
       * Signal values update immediately inside the callback.
       */
      batch(fn: () => void): void {
        const wasBatching = inBatch;
        inBatch = true;

        try {
          fn();
        } finally {
          inBatch = wasBatching;

          // Schedule notification after outermost batch completes
          if (!inBatch) {
            scheduleNotification();
          }
        }
      },

      /**
       * coalesce() - Deduplicate same-path updates
       * Only the final value for each path is written.
       */
      coalesce(fn: () => void): void {
        const wasCoalescing = inCoalesce;
        const wasBatching = inBatch;
        inCoalesce = true;
        inBatch = true; // Also batch during coalesce

        try {
          fn();
        } finally {
          inCoalesce = wasCoalescing;
          inBatch = wasBatching;

          // Execute coalesced updates
          if (!wasCoalescing) {
            flushCoalescedUpdates();
          }

          // Schedule notification
          if (!inBatch) {
            scheduleNotification();
          }
        }
      },

      hasPendingNotifications(): boolean {
        return notificationPending;
      },

      flushNotifications(): void {
        flushNotificationsInternal();
      },
    };

    // ========================================
    // CREATE ENHANCED TREE
    // ========================================

    const originalTreeCall = tree.bind(tree);

    // Create enhanced tree function that handles direct calls
    const enhancedTree = function (
      this: ISignalTree<T>,
      ...args: unknown[]
    ): T | void {
      if (args.length === 0) {
        return originalTreeCall();
      } else {
        // Direct tree updates - execute immediately
        if (args.length === 1) {
          const arg = args[0];
          if (typeof arg === 'function') {
            originalTreeCall(arg as (current: T) => T);
          } else {
            originalTreeCall(arg as T);
          }
        }
        // Schedule notification after update
        if (!inBatch) {
          scheduleNotification();
        }
      }
    } as unknown as ISignalTree<T>;

    // Copy prototype chain
    Object.setPrototypeOf(enhancedTree, Object.getPrototypeOf(tree));

    // Copy enumerable properties
    Object.assign(enhancedTree, tree);

    // Copy non-enumerable properties
    try {
      copyTreeProperties(tree as object, enhancedTree as object);
    } catch {
      /* best-effort */
    }

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

    // Define $ property
    if ('$' in tree) {
      Object.defineProperty(enhancedTree, '$', {
        value: tree.$,
        enumerable: false,
        configurable: true,
      });
    }

    // Add batching methods
    Object.assign(enhancedTree, batchingMethods);

    // Backwards compat: batchUpdate method
    (enhancedTree as any).batchUpdate = (
      updater: (current: T) => Partial<T>
    ) => {
      (enhancedTree as any).batch(() => {
        const current = originalTreeCall();
        const updates = updater(current);

        Object.entries(updates).forEach(([key, value]) => {
          const property = ((enhancedTree as ISignalTree<T>).$ as any)[key];
          if (property && typeof property.set === 'function') {
            property.set(value);
          } else if (typeof property === 'function') {
            property(value);
          }
        });
      });
    };

    // Register cleanup for tree destruction
    if (typeof tree.registerCleanup === 'function') {
      tree.registerCleanup(() => {
        if (notificationTimeoutId !== undefined) {
          clearTimeout(notificationTimeoutId);
          notificationTimeoutId = undefined;
        }
        coalescedUpdates.clear();
      });
    }

    return enhancedTree as unknown as ISignalTree<T> & BatchingMethods<T>;
  };

  const meta: EnhancerMeta = { name: 'batching', provides: ['batching'] };
  (enhancerFn as unknown as { metadata: EnhancerMeta }).metadata = meta;
  (enhancerFn as unknown as Record<symbol, EnhancerMeta>)[ENHANCER_META] = meta;
  return enhancerFn;
}

/**
 * High performance batching preset.
 * Uses microtask-based notifications for minimal latency.
 */
export function highPerformanceBatching(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & BatchingMethods<T> {
  return batching({
    enabled: true,
    notificationDelayMs: 0,
  });
}

// ========================================
// DEPRECATED EXPORTS (for backwards compat)
// ========================================

/** @deprecated Use batching() instead */
export function batchingWithConfig(
  config: BatchingConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & BatchingMethods<T> {
  return batching(config);
}

// v12: removed the deprecated legacy batching surface — `flushBatchedUpdates()`
// (use `tree.flushNotifications()`), `hasPendingUpdates()` (use
// `tree.hasPendingNotifications()`), `getBatchQueueSize()` (obsolete — signal
// writes are synchronous), and the `withBatching` alias (use `batching()`).
