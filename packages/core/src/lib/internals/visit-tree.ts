import { isTraversableNode } from '../utils';

/**
 * Canonical Family-A tree walk — the traversal skeleton that every hand-rolled
 * NodeAccessor-tree visitor in this codebase used to re-implement: the
 * {@link isTraversableNode} guard, safe `Object.keys` iteration, per-child safe
 * read, WeakSet cycle protection, a depth cap, dotted-path building, and the
 * recursion driver. Callers supply only the per-node action + the recurse
 * decision; the mechanics live here once.
 *
 * `visit(node, path, key, parent)` is called for each traversable node,
 * pre-order, starting with `root` itself (`path === ''`, `key === null`).
 * Return `false` to STOP descending into that node's children; return anything
 * else (`undefined`/`true`) to recurse. Because `isTraversableNode` is
 * deliberately broad (it accepts any object OR function, including arrays and
 * built-ins — a materialized tree stores those behind signals, so they don't
 * normally appear as raw children), a caller that must not descend into a
 * particular shape returns `false` for it explicitly.
 *
 * Not exported from the public barrel — this is an internal building block for
 * core's own walkers and the enhancer authoring surface.
 *
 * @internal
 */
export interface VisitTreeOptions {
  /** Max recursion depth (default 32). Guards runaway / cyclic structures. */
  maxDepth?: number;
  /**
   * Skip a child key BEFORE its value is read. Use to avoid touching known
   * non-tree members — e.g. the batching walker skips `set`/`update`/`_`-keys
   * so it never triggers the entityMap proxy's get-trap (`[ST2002]`) by reading
   * `.update`. Returning true means "don't read, don't recurse into this key".
   */
  skipKey?: (key: string) => boolean;
}

export type TreeVisitor = (
  node: unknown,
  path: string,
  key: string | null,
  parent: unknown
) => boolean | void;

export function visitTree(
  root: unknown,
  visit: TreeVisitor,
  options: VisitTreeOptions = {}
): void {
  const maxDepth = options.maxDepth ?? 32;
  const skipKey = options.skipKey;
  const seen = new WeakSet<object>();

  const walk = (
    node: unknown,
    path: string,
    key: string | null,
    parent: unknown,
    depth: number
  ): void => {
    if (depth > maxDepth) return;
    if (!isTraversableNode(node)) return;
    if (seen.has(node)) return;
    seen.add(node);

    // Per-node action + recurse decision.
    if (visit(node, path, key, parent) === false) return;

    let keys: string[];
    try {
      keys = Object.keys(node);
    } catch {
      return;
    }
    for (const k of keys) {
      if (skipKey && skipKey(k)) continue;
      let child: unknown;
      try {
        child = (node as Record<string, unknown>)[k];
      } catch {
        continue;
      }
      if (!isTraversableNode(child)) continue;
      walk(child, path ? `${path}.${k}` : k, k, node, depth + 1);
    }
  };

  walk(root, '', null, null, 0);
}
