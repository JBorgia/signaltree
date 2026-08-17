import type { NodeAccessor } from '../types';

/**
 * The structural predicate every tree walk starts from — framework-neutral by
 * nature, and now by location.
 *
 * It lived in `utils.ts`, which is genuinely Angular-coupled at runtime
 * (`isSignal` x7, plus `signal` and `computed`). That co-location made a
 * three-line `typeof` check impossible to reach from a neutral module, which is
 * what kept `interceptLeafSignals` — and therefore part of the authoring SDK —
 * tied to a framework it never actually called.
 *
 * `utils.ts` re-exports it, so the public surface is unchanged.
 */

/**
 * Is this value something a tree walk can descend into?
 *
 * Objects AND functions both qualify: a SignalTree leaf is a callable, so a
 * bare `typeof value === 'object'` check silently skips every signal in the
 * tree. This is what the repo's own lint rule points contributors at instead of
 * hand-rolling the check and getting that wrong.
 */
export function isTraversableNode(value: unknown): value is object {
  return (
    value != null && (typeof value === 'object' || typeof value === 'function')
  );
}

/**
 * Brand for a SignalTree node accessor — a callable that also carries tree
 * identity. `Symbol.for` so the brand survives duplicate module instances.
 */
export const CALLABLE_SIGNAL_SYMBOL = Symbol.for('SignalTree:NodeAccessor');

/**
 * Is this a SignalTree node accessor?
 *
 * Structural, like {@link isTraversableNode}: a callable carrying the brand.
 * It asks nothing of a reactive framework — it moved here for the same reason,
 * so neutral modules can recognise a node without importing Angular.
 */
export function isNodeAccessor(
  value: unknown
): value is NodeAccessor<unknown> {
  return (
    typeof value === 'function' && !!value && CALLABLE_SIGNAL_SYMBOL in value
  );
}
