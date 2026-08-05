/**
 * THE resolution primitive for a key that came from outside the library.
 *
 * Library code must never write `node[externalKey]`. Every payload key — from a
 * server response, `JSON.parse`, `localStorage`, SSR transfer state or a
 * devtools message — goes through here.
 *
 * ## Why an own-property check is the whole mechanism
 *
 * `node['__proto__']` returns `Object.prototype`. That single fact is the
 * entire bug class (CWE-915): a walker dereferences a payload key, lands on the
 * prototype, and then reads or writes through it. `hasOwnProperty` refuses to
 * leave the object, so the walker can never get there.
 *
 * It needs no name blocklist, and deliberately has none. `constructor` and
 * `prototype` are dangerous only as a fall-through to the chain, which own-ness
 * already stops — and blocking them by name silently DELETED legitimate state
 * under those keys when a previous revision tried it. A key the tree does not
 * declare resolves to `undefined` and falls into the existing "not in the
 * initial shape" discard ([ST2010]), so closing the class costs no behaviour
 * change at all.
 *
 * ## The one invariant this depends on, and how it is held
 *
 * An own-property check is sufficient **provided nothing ever mints an own
 * `__proto__` on a node**. If something did, own-ness would be satisfied
 * forever after and the guard would be inert — that is precisely the two-call
 * bypass an audit used to defeat an earlier fix in `@signaltree/enterprise`,
 * where a `defineProperty` write created the key that unlocked the check.
 *
 * That invariant is mechanised rather than trusted:
 *
 * - `createSignalStore` refuses `__proto__` as a state key, so the one place a
 *   payload key can create a property on a node cannot create THAT one.
 * - the `no-mint-proto` lint rule (see `eslint.config.mjs`) flags any
 *   `Object.defineProperty` or computed assignment on a tree node whose key is
 *   not a literal or a known symbol, so a new minting site cannot be added
 *   quietly.
 *
 * ## Why not a Map index
 *
 * A `Map<key, child>` per node was built and benchmarked. It needs no invariant
 * at all — there is no key to mint into — but it is a permanent per-node object:
 * measured at **+12.1% on subtree reads, +8.3% on nested writes and +310 B per
 * node, forever**, against roughly zero for this. Both close every known attack
 * and both pass the same 69 pollution tests. The Map's only advantage is
 * removing the invariant above, and the invariant is cheap to mechanise.
 *
 * @internal
 */
export function resolveChild(node: unknown, key: string): unknown {
  if (node == null) return undefined;
  const kind = typeof node;
  // Nodes are callable (accessors are functions) and stores are plain objects,
  // so both shapes must be accepted; anything else has no children to resolve.
  if (kind !== 'object' && kind !== 'function') return undefined;
  return Object.prototype.hasOwnProperty.call(node, key)
    ? (node as Record<string, unknown>)[key]
    : undefined;
}
