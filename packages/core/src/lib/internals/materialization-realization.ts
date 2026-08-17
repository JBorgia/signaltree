/**
 * The two operations marker materialization needs from a reactive framework —
 * and deliberately nothing more.
 *
 * WHY THIS EXISTS. `materialize-markers.ts` owns framework-NEUTRAL concerns:
 * the processor registry, marker registration and its validation, the hydrate
 * and error contracts, and the tree walk. It reached into `@angular/core` for
 * exactly two things, which is what stopped it — and therefore the whole
 * extension SDK built on top of it — from living in a framework-neutral
 * package.
 *
 * WHAT THIS IS NOT. This is not a generic signals abstraction, and it must not
 * become one. There is no `signal()`, no `computed()`, no `effect()`. Imitating
 * a framework's reactive primitives inside the semantic layer would recreate
 * the coupling one level down while pretending to have removed it. These two
 * methods are named for the SEMANTIC question the materializer is asking, not
 * for the Angular call that currently answers it:
 *
 *   isReactiveNode   "has this node already been realized by the adapter?"
 *                    A structural predicate. The materializer uses it to avoid
 *                    walking into, or re-processing, a node the adapter owns.
 *                    It never creates anything.
 *
 *   memoizeSnapshot  "cache this marker's snapshot, and invalidate it when the
 *                    marker's own state changes."
 *                    Reference stability is the point: a snapshot recomputed on
 *                    every unrelated write churns the wrapper object and makes
 *                    an OnPush consumer bound to the whole marker re-render.
 *                    The adapter's dependency graph already knows exactly when
 *                    the marker is stale, so it — not this layer — owns the
 *                    invalidation. A caller that supplies no adapter still gets
 *                    correct values, just without the memo.
 *
 * INSTALLATION is once per process by whichever package supplies the reactive
 * runtime; `@signaltree/core` does it for Angular. That is a framework-adapter
 * registration, not per-tree attribution — the distinction that matters after
 * GATE A, where ambient state was the defect generator precisely because it was
 * used to answer per-mutation ownership questions. This answers none.
 */

export interface MaterializationRealization {
  /** True when the adapter has already realized this node as a reactive node. */
  isReactiveNode(node: unknown): boolean;
  /**
   * Return a stable accessor for `compute`, invalidated by the adapter when the
   * node's own reactive state changes. Keyed by `node`; calling twice for the
   * same node must return the same accessor.
   */
  memoizeSnapshot<T>(node: object, compute: () => T): () => T;
}

let installed: MaterializationRealization | undefined;

/**
 * Install the reactive adapter. Called once by the package that owns the
 * framework binding.
 */
export function installMaterializationRealization(
  realization: MaterializationRealization
): void {
  installed = realization;
}

/**
 * The installed adapter, or `undefined` when none is.
 *
 * Callers must degrade rather than throw: materialization stays correct without
 * an adapter, it merely loses reference stability and the "already realized"
 * shortcut. A neutral consumer with no framework installed is a supported
 * configuration, not an error.
 */
export function getMaterializationRealization():
  | MaterializationRealization
  | undefined {
  return installed;
}

/** Test seam. Never called by production code. */
export function resetMaterializationRealizationForTest(): void {
  installed = undefined;
}
