/**
 * Authoritative child index for a tree node — `Map<stateKey, child>`.
 *
 * SPIKE (indexed-node-store).
 *
 * A node's children exist twice, on purpose:
 *
 * - as its own enumerable PROPERTIES, which is what makes `tree.$.user.name()`
 *   work and what `TreeNode<T>` types. Keys there are written by a DEVELOPER.
 * - in this Map, which is what LIBRARY code resolves through. Keys there come
 *   from OUTSIDE — a server payload, `JSON.parse`, localStorage, a devtools
 *   message.
 *
 * That distinction is the whole design. A `Map` has no prototype chain to walk
 * off and no `__proto__` accessor to invoke, so resolving an untrusted key
 * through it is pollution-immune BY CONSTRUCTION rather than by a guard someone
 * has to remember to write. Of six blocklist deployments traced in the spike,
 * four needed a second advisory; lodash is on its fifth CVE across eight years.
 * A structure with no sink cannot be forgotten.
 *
 * It also dissolves the reason this bug class kept escaping review: provenance
 * stops being depth-dependent. An external key is never DEREFERENCED at any
 * depth, only looked up, so it no longer matters that a walker is "trusted at
 * depth 0 and untrusted once it recurses into a leaf's value".
 *
 * @internal
 */
export const NODE_CHILDREN_SYMBOL = Symbol.for('SignalTree:NodeChildren');

/** @internal A node's child index, if it has one. */
export function getChildren(node: unknown): Map<string, unknown> | undefined {
  if (node == null) return undefined;
  return (node as Record<symbol, unknown>)[NODE_CHILDREN_SYMBOL] as
    | Map<string, unknown>
    | undefined;
}

/** @internal Attach a fresh child index to a node. Non-enumerable: it must never reach a snapshot, a walker or JSON. */
export function attachChildren(
  node: object,
  children: Map<string, unknown> = new Map()
): Map<string, unknown> {
  Object.defineProperty(node, NODE_CHILDREN_SYMBOL, {
    value: children,
    enumerable: false,
    writable: false,
    configurable: true,
  });
  return children;
}

/**
 * THE resolution primitive for a key that came from outside the library.
 * Library code must never write `node[externalKey]`.
 *
 * Returns `undefined` for any key the tree does not declare — which is already
 * the tree's semantics (a write outside the initial shape is discarded,
 * [ST2010]), so closing the class costs no behaviour change.
 *
 * @internal
 */
export function resolveChild(node: unknown, key: string): unknown {
  const children = getChildren(node);
  if (children !== undefined) return children.get(key);
  // No index (a leaf's raw value, or a foreign object). Own-property read —
  // never a bare `node[key]`, which is the sink itself.
  if (node == null) return undefined;
  const kind = typeof node;
  if (kind !== 'object' && kind !== 'function') return undefined;
  return Object.prototype.hasOwnProperty.call(node, key)
    ? (node as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Record or replace a child in the index.
 *
 * Must be called by anything that changes a node's SHAPE after construction —
 * marker materialization and `.derived()` both do — or the index silently
 * drifts from the properties and writes start disappearing.
 *
 * @internal
 */
export function setChild(node: unknown, key: string, value: unknown): void {
  getChildren(node)?.set(key, value);
}
