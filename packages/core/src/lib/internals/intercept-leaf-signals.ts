import type { UpdateMetadata } from '../types';
import { getActiveWriteContext } from '../write-context';

import { visitTree } from './visit-tree';

/**
 * Recursively walk a NodeAccessor tree and wrap every plain writable leaf
 * signal's `.set()` / `.update()` so callers can observe direct leaf writes.
 *
 * Background: SignalTree's recursive update pipeline writes to leaf signals
 * directly without invoking PathNotifier. Entity collections notify through
 * their own internals, but a direct call like `tree.$.user.profile.name.set(x)`
 * never produces a PathNotifier event by itself. Enhancers that need to
 * observe every mutation (DevTools, time-travel, etc.) must intercept those
 * leaf writes themselves — this helper centralizes that traversal.
 *
 * The `onWrite` callback receives an optional `meta: UpdateMetadata` captured
 * synchronously from the active `withWriteContext` frame (if any). Existing
 * 3-arg callbacks `(path, next, prev) => void` continue to work since `meta`
 * is the trailing optional parameter.
 *
 * Skips:
 *   - Entity-collection signals (have `add`/`remove` and already notify).
 *   - Built-ins (Date, Map, Set) and arrays — they aren't NodeAccessors.
 *   - Already-visited nodes (cycle protection via WeakSet).
 *
 * The returned cleanup function restores all wrapped signals to their
 * original methods.
 *
 * @public — Enhancer-author API. Used by `@signaltree/core`'s built-in
 *   devtools / time-travel enhancers and by external enhancers like
 *   `@signaltree/schema`. Application code should not use this directly.
 */
export function interceptLeafSignals(
  root: unknown,
  onWrite: (
    path: string,
    next: unknown,
    prev: unknown,
    meta?: UpdateMetadata
  ) => void,
  options: { maxDepth?: number } = {}
): () => void {
  const restorers: Array<() => void> = [];
  const maxDepth = options.maxDepth ?? 32;

  // Traversal is the shared `visitTree` skeleton; this visitor supplies only
  // the leaf action (wrap `.set`/`.update` to observe writes) and the recurse
  // decision. Behavior preserved vs the former hand-rolled walk: wrap plain
  // writable leaves only, skip entity collections (they notify themselves),
  // don't descend into built-ins/arrays, and never wrap the root node itself.
  try {
    visitTree(
      root,
      (node, path) => {
        // The root is always a branch here (tree.$); never treat it as a leaf.
        if (path === '') return true;

        const isWritableSignal =
          typeof node === 'function' &&
          'set' in node &&
          'update' in node &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (node as any).set === 'function' &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (node as any).update === 'function';

        if (isWritableSignal) {
          const isEntityCollection = 'add' in node || 'remove' in node;
          if (isEntityCollection) return false; // collection notifies itself

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const original = node as any;
          const originalSet = original.set.bind(original);
          const originalUpdate = original.update.bind(original);

          restorers.push(() => {
            original.set = originalSet;
            original.update = originalUpdate;
          });

          original.set = (value: unknown) => {
            const prev = original();
            originalSet(value);
            const next = original();
            if (next !== prev)
              onWrite(path, next, prev, getActiveWriteContext());
          };

          original.update = (updater: (v: unknown) => unknown) => {
            const prev = original();
            originalUpdate(updater);
            const next = original();
            if (next !== prev)
              onWrite(path, next, prev, getActiveWriteContext());
          };
          return false; // leaf — don't recurse into it
        }

        // Built-ins/arrays are stored as single signals, not nested trees.
        if (
          typeof node === 'object' &&
          (Array.isArray(node) ||
            node instanceof Date ||
            node instanceof Map ||
            node instanceof Set)
        ) {
          return false;
        }

        return true; // branch accessor / plain nested object — recurse
      },
      { maxDepth }
    );
  } catch {
    // Ignore traversal errors; partial interception is still useful.
  }

  return () => {
    for (const restore of restorers) {
      try {
        restore();
      } catch {
        // ignore
      }
    }
    restorers.length = 0;
  };
}
