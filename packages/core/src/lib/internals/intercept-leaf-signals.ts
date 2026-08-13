import type { UpdateMetadata } from '../types';
import { isTraversableNode } from '../utils';
import { getNodeProcessor, snapshotMarkerNode } from './materialize-markers';
import {
  getOwnedOwnerPath,
  getOwnedPositionIds,
  getOwnedSubjectIds,
  hasIntrinsicMutationEmitter,
} from './owned-mutation';
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
 * 3-arg callbacks `(path, next, prev) => void` continue to work since the
 * trailing `meta` and `ownerPath` parameters are optional.
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
    meta?: UpdateMetadata,
    ownerPath?: string,
    subjectIds?: number[],
    positionIds?: number[]
  ) => void,
  options: { maxDepth?: number } = {}
): () => void {
  const restorers: Array<() => void> = [];
  const maxDepth = options.maxDepth ?? 32;

  const withMutationIntent = (
    meta: UpdateMetadata | undefined,
    mutationIntent: 'replace' | 'derive'
  ): UpdateMetadata => ({
    ...(meta ?? {}),
    mutationIntent,
  });

  const getOwnerPath = (node: unknown, path: string): string => {
    return getOwnedOwnerPath(node) ?? path;
  };

  const getSubjectIds = (node: unknown): number[] | undefined => {
    return getOwnedSubjectIds(node);
  };

  const getPositionIds = (node: unknown): number[] | undefined => {
    return getOwnedPositionIds(node);
  };

  const wrapWritableSignal = (
    node: unknown,
    path: string,
    ownerPathOverride?: string
  ): void => {
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
      const ownerPath = ownerPathOverride ?? getOwnerPath(node, path);
      const subjectIds = getSubjectIds(node);
      const positionIds = getPositionIds(node);
      if (next !== prev) {
        onWrite(
          path,
          next,
          prev,
          withMutationIntent(getActiveWriteContext(), 'replace'),
          ownerPath,
          subjectIds,
          positionIds
        );
      }
    };

    original.update = (updater: (v: unknown) => unknown) => {
      const prev = original();
      originalUpdate(updater);
      const next = original();
      const ownerPath = ownerPathOverride ?? getOwnerPath(node, path);
      const subjectIds = getSubjectIds(node);
      const positionIds = getPositionIds(node);
      if (next !== prev) {
        onWrite(
          path,
          next,
          prev,
          withMutationIntent(getActiveWriteContext(), 'derive'),
          ownerPath,
          subjectIds,
          positionIds
        );
      }
    };
  };

  const wrapOwnedFieldAccessors = (
    node: unknown,
    basePath: string,
    ownerPath: string,
    seen = new WeakSet<object>()
  ): void => {
    if (!isTraversableNode(node)) {
      return;
    }
    const ref = node as object;
    if (seen.has(ref)) return;
    seen.add(ref);

    const isWritableSignal =
      typeof node === 'function' &&
      'set' in node &&
      'update' in node &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (node as any).set === 'function' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (node as any).update === 'function';

    if (isWritableSignal) {
      wrapWritableSignal(node, basePath, ownerPath);
    }

    for (const key of Object.keys(node as Record<string, unknown>)) {
      const child = (node as Record<string, unknown>)[key];
      if (
        child !== null &&
        typeof child === 'object' &&
        !(Array.isArray(child) || child instanceof Date || child instanceof Map || child instanceof Set)
      ) {
        wrapOwnedFieldAccessors(child, `${basePath}.${key}`, ownerPath, seen);
      } else if (typeof child === 'function') {
        wrapOwnedFieldAccessors(child, `${basePath}.${key}`, ownerPath, seen);
      }
    }
  };

  const wrapMutator = (
    target: Record<string, unknown>,
    method: string,
    path: string
  ): void => {
    if (typeof target[method] !== 'function') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalMethod = (target as any)[method].bind(target);
    restorers.push(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (target as any)[method] = originalMethod;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (target as any)[method] = (...args: unknown[]) => {
      const canSnapshotMutatorState =
        typeof (target as { __findKeyBySubjectId?: unknown })
          .__findKeyBySubjectId !== 'function';
      const prevSnapshot = canSnapshotMutatorState
        ? snapshotMarkerNode(target)?.value
        : undefined;
      const result = originalMethod(...args);
      const nextSnapshot = canSnapshotMutatorState
        ? snapshotMarkerNode(target)?.value
        : undefined;
      onWrite(
        path,
        nextSnapshot,
        prevSnapshot,
        getActiveWriteContext(),
        path,
        getSubjectIds(target),
        getPositionIds(target)
      );
      return result;
    };
  };

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

          const hasOwnedMutationEmitter = hasIntrinsicMutationEmitter(node);
          if (hasOwnedMutationEmitter) {
            return false;
          }

          wrapWritableSignal(node, path);
          const proc = getNodeProcessor(node);
          if (proc && isTraversableNode(node)) {
            for (const method of ['clear', 'reload', 'reset', 'refresh']) {
              wrapMutator(node as Record<string, unknown>, method, path);
            }
          }
          return false; // leaf — don't recurse into it
        }

        // A MATERIALISED MARKER whose node is not a writable signal.
        //
        // `isWritableSignal` above requires BOTH `set` and `update`. A `form()`
        // node has `set` and `patch` — no `update` — so it failed that test and
        // was never wrapped, which meant its writes were invisible here. The
        // consequence was not subtle: `timeTravel` sets its self-dirty flag from
        // THIS callback, so a form edit never marked the tree dirty and was
        // never recorded. Measured: three writes (form, leaf, form) produced two
        // history entries, the last form edit simply absent — so undo could not
        // restore what was never captured.
        //
        // Collections are excluded on purpose above: `entityMap` notifies for
        // itself, which is exactly why its undo worked while the form's did not.
        const proc = getNodeProcessor(node);
        if (proc && hasIntrinsicMutationEmitter(node)) {
          return false;
        }
        // NOT `typeof node === 'function'`: markers materialise to different
        // shapes — `form` is a callable, `entityMap` and `status` are plain
        // objects — and requiring callability silently skipped the two that are
        // not. The registry stamp is the reliable test.
        if (proc && isTraversableNode(node)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const marker = node as any;
          // Every mutator a built-in marker exposes. A marker that notifies the
          // global PathNotifier itself is NOT enough: `timeTravel` sets its
          // self-dirty flag from THIS callback, and the notifier is global so a
          // notification carries no ownership. An entityMap-only edit was
          // therefore never recorded — verified, history stayed at ["INIT"].
          //
          // That defect hid behind a test that also wrote a scalar: the scalar
          // marked the tree dirty and the collection rode along in the
          // snapshot, so undo appeared to work. Collection-only edits did not.
          const MUTATORS = [
            'set',
            'patch',
            'setAll',
            'addOne',
            'addMany',
            'updateOne',
            'updateMany',
            'upsertOne',
            'upsertMany',
            'changeId',
            'removeOne',
            'removeMany',
            'clear',
            'setLoading',
            'setLoaded',
            'setError',
            'setNotLoaded',
            'start',
            'setSuccess',
            'succeed',
            'fail',
            'refresh',
            'rerun',
            'reset',
          ] as const;
          for (const method of MUTATORS) {
            wrapMutator(marker as Record<string, unknown>, method, path);
          }
          const fields = marker.$ as Record<string, unknown> | undefined;
          if (fields && isTraversableNode(fields)) {
            wrapOwnedFieldAccessors(fields, path, path);
          }
          return false; // leaf — do not recurse into a marker node
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
