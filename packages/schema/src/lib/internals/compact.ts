import type { Registry } from './state';
import { removeBoundPath, removePendingPath } from './state';
import { readTreeAtPath } from './matcher';

/**
 * Manual GC for the registry. Walks every currently-bound leaf path and
 * evicts entries whose path no longer resolves in the tree (path-existence
 * probe).
 *
 * Evicted entries have their `PathState` torn down (final null/false set
 * before removal so any subscriber gets a clean snapshot) and their per-path
 * memoized signals dropped.
 *
 * Also decrements the invalid-count if the evicted path was carrying an error.
 *
 * @internal
 */
export function compact(registry: Registry, treeRoot: unknown): void {
  const toEvict: string[] = [];

  for (const path of registry.boundPathsSet) {
    if (!pathExists(treeRoot, path)) {
      toEvict.push(path);
    }
  }

  for (const path of toEvict) {
    evictPath(registry, path);
  }
}

/**
 * Probe whether a dotted path resolves structurally in the tree.
 *
 * IMPORTANT: this is a **structural** check (does the key exist in the parent
 * NodeAccessor's own properties?), NOT a value check. A signal that currently
 * holds `null` or `undefined` is still structurally present and should NOT be
 * evicted — SignalTree's mental model treats null-holding signals as "transient
 * absence," not "removed." Only `delete` on the parent NodeAccessor's property
 * (or a fresh tree shape that omits the key) represents real removal.
 *
 * The previous implementation unwrapped each hop via the signal's `()` getter,
 * which incorrectly conflated "key currently null" with "key removed." This
 * version walks parent object/function structure only — no value reads.
 *
 * @internal
 */
function pathExists(treeRoot: unknown, path: string): boolean {
  if (path === '') return treeRoot !== undefined && treeRoot !== null;

  const segs = path.split('.');
  let cur: unknown = treeRoot;
  for (const seg of segs) {
    // Structural-only check: the parent must be an object/function with `seg`
    // as an own enumerable property. We do NOT call signals here — a signal
    // holding null/undefined would otherwise falsely indicate "key removed."
    if (cur === null || cur === undefined) return false;
    if (typeof cur !== 'object' && typeof cur !== 'function') return false;
    if (!(seg in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return true;
}

function evictPath(registry: Registry, path: string): void {
  const state = registry.pathStates.get(path);
  if (state) {
    // Final clean snapshot for any consumer holding the cached computed.
    if (state.lastSettledError !== null) {
      registry.invalidCount.update((c) => c - 1);
    }
    state.errorSignal.set(null);
    state.pendingSignal.set(false);
  }

  registry.pathStates.delete(path);
  registry.errorsAtCache.delete(path);
  registry.isValidAtCache.delete(path);
  registry.isPendingAtCache.delete(path);
  registry.leafOwner.delete(path);
  removeBoundPath(registry, path);
  removePendingPath(registry, path);
}

/**
 * Read a value out of `treeRoot` by path. Re-exported here for callers that
 * need the same unwrap semantics compact uses.
 *
 * @internal
 */
export { readTreeAtPath };
