import type { UpdateMetadata } from '../types';
import { isTraversableNode } from '../utils';
import { getActiveWriteContext } from '../write-context';

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
  const seen = new WeakSet<object>();
  const maxDepth = options.maxDepth ?? 32;

  const walk = (node: unknown, pathPrefix: string, depth: number): void => {
    if (depth > maxDepth) return;
    if (!isTraversableNode(node)) return;
    if (seen.has(node)) return;
    seen.add(node);

    let keys: string[];
    try {
      keys = Object.keys(node);
    } catch {
      return;
    }

    for (const key of keys) {
      let child: unknown;
      try {
        child = (node as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (!isTraversableNode(child)) continue;

      const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      const isWritableSignal =
        typeof child === 'function' &&
        'set' in child &&
        'update' in child &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (child as any).set === 'function' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (child as any).update === 'function';

      const isEntityCollection =
        isWritableSignal && ('add' in child || 'remove' in child);

      if (isWritableSignal && !isEntityCollection) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const original = child as any;
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
          if (next !== prev) onWrite(childPath, next, prev, getActiveWriteContext());
        };

        original.update = (updater: (v: unknown) => unknown) => {
          const prev = original();
          originalUpdate(updater);
          const next = original();
          if (next !== prev) onWrite(childPath, next, prev, getActiveWriteContext());
        };
        continue;
      }

      // Recurse into NodeAccessors / nested plain objects. Skip built-ins
      // and arrays — they're stored as single signals, not nested trees.
      if (typeof child === 'function' && !isWritableSignal) {
        walk(child, childPath, depth + 1);
      } else if (
        typeof child === 'object' &&
        !Array.isArray(child) &&
        !(child instanceof Date) &&
        !(child instanceof Map) &&
        !(child instanceof Set)
      ) {
        walk(child, childPath, depth + 1);
      }
    }
  };

  try {
    walk(root, '', 0);
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
