import { getPositionRegistry } from './position-registry';
import { getActiveWriteContext } from '../write-context';

/**
 * Commit-scope authority — the single place that decides whether a durable
 * consequence may run.
 *
 *   Commit-scope authority
 *          │
 *          ├── stored()
 *          ├── persistence()
 *          └── future durable consequences
 *
 * THE RULE:
 *
 *   > Durable storage never gets ahead of the tree's settled commit state.
 *
 *   no open commit scope on this tree   → durable consequences may run
 *   one or more open commit scopes      → durable consequences wait
 *   scopes settle                       → persist current surviving truth
 *
 * WHY THIS EXISTS RATHER THAN A CHECK AT EACH CALL SITE. Six defects on this
 * boundary shared one cause: there were two answers to "may I persist this?".
 * `stored()` inspected the ambient writer/transaction context; `persistence()`
 * inspected open scopes on the tree. The call-stack answer cannot distinguish
 *
 *     no transaction on the stack
 *   + this tree still has an unsettled transaction
 *
 * from an ordinary committed write — and the realization/compensation path
 * produces exactly that state, which is how a rollback came to write another
 * pending transaction's speculative value straight to storage.
 *
 * `outside a transaction callback` is NOT the same as `this tree has no
 * speculative state`. The old implementation conflated them. Callers no longer
 * get to decide: they describe the consequence, and this module decides when it
 * runs.
 *
 * The gate is TREE-LOCAL, so a transaction open on tree B never delays tree A.
 */

export type CommitConsequence = () => void;

export type CommitScopeOutcome = 'commit' | 'discard';

interface CommitScope {
  /** Canonical tree identity — see {@link resolveScopeKey}. */
  readonly key: object | undefined;
  /**
   * Keyed so repeated consequences for the SAME node collapse to the last one.
   * That is what makes persistence see a single coherent state per node
   * instead of a replay of every intermediate.
   */
  readonly consequences: Map<unknown, CommitConsequence>;
}

const scopesByOwner = new WeakMap<object, Map<number, CommitScope>>();
const openScopesByKey = new WeakMap<object, Set<number>>();
const settleListenersByKey = new WeakMap<object, Set<() => void>>();
/** Consequences with no owning scope, waiting for their tree to settle. */
const heldByKey = new WeakMap<object, Map<unknown, CommitConsequence>>();

/**
 * Resolve the ONE identity that answers "which tree is this?".
 *
 * Everything keys on the tree's position registry, which every real tree has
 * and which a marker deep inside the tree already holds. A caller may pass the
 * tree, its `$` node, or the registry itself and land on the same key. Objects
 * with no registry (unit-level scopes) key on themselves.
 */
function resolveScopeKey(node: unknown): object | undefined {
  if (node === undefined || node === null) return undefined;
  const candidate = node as { $?: object };
  const registry =
    getPositionRegistry(candidate.$ ?? node) ?? getPositionRegistry(node);
  return (registry as object | undefined) ?? (node as object);
}

function hasOpen(key: object): boolean {
  const scopes = openScopesByKey.get(key);
  return scopes !== undefined && scopes.size > 0;
}

/**
 * Open a deferral scope for one explicit transaction, BEFORE its callback runs
 * so writes inside it find the scope already present.
 */
export function openCommitScope(
  owner: object,
  transactionId: number,
  tree?: object
): void {
  let byId = scopesByOwner.get(owner);
  if (!byId) {
    byId = new Map();
    scopesByOwner.set(owner, byId);
  }
  const key = resolveScopeKey(tree);
  byId.set(transactionId, { key, consequences: new Map() });

  if (key) {
    let open = openScopesByKey.get(key);
    if (!open) {
      open = new Set();
      openScopesByKey.set(key, open);
    }
    open.add(transactionId);
  }
}

/**
 * Prove that `claimant` belongs to the tree that owns this scope.
 *
 * The write context is ambient: any code running inside a transaction callback
 * sees that transaction's owner and id, including a write to a completely
 * different tree. Presence of a transaction is not evidence that the write is
 * speculative under it, so ownership must be positively established.
 */
function scopeOwns(scope: CommitScope, claimant: unknown): boolean {
  // No identity on the scope: nothing to contradict (unit-level scopes).
  if (!scope.key) return true;
  if (claimant === undefined) return false;
  return resolveScopeKey(claimant) === scope.key;
}

/**
 * Queue `fn` in a specific transaction's scope. Returns `false` when there is
 * no such open scope, or when the scope cannot be shown to own `claimant`.
 *
 * Prefer {@link scheduleDurableConsequence}: this is the low-level half and
 * knows nothing about the tree-level hold.
 */
export function deferCommitConsequence(
  owner: object,
  transactionId: number,
  key: unknown,
  fn: CommitConsequence,
  claimant?: unknown
): boolean {
  const scope = scopesByOwner.get(owner)?.get(transactionId);
  if (!scope) return false;
  if (!scopeOwns(scope, claimant)) return false;
  scope.consequences.set(key, fn);
  return true;
}

/**
 * THE primitive. Describe a durable consequence; the authority decides when it
 * runs. No caller determines commit-ness for itself.
 *
 *   attributable to an owning open scope  → queue in that scope
 *   this tree has any open scope          → hold until every scope settles
 *   otherwise                             → run NOW, in the caller's stack
 *
 * The third case is what keeps `stored({ debounceMs: 0 })` durable the moment
 * `set()` returns on a tree with nothing speculative in flight.
 */
export function scheduleDurableConsequence(request: {
  /** Per-tree identity of the node this consequence belongs to. */
  claimant: unknown;
  /** Collapse key — a later consequence for the same key replaces this one. */
  key: unknown;
  run: CommitConsequence;
}): void {
  const { claimant, key, run } = request;

  const meta = getActiveWriteContext();
  const owner = meta?.transactionOwner;
  const transactionId = meta?.transactionId;
  if (
    owner !== undefined &&
    typeof transactionId === 'number' &&
    deferCommitConsequence(owner, transactionId, key, run, claimant)
  ) {
    return;
  }

  // No owning scope on the stack. That is NOT proof the value is committed:
  // a rollback compensation runs with no transaction anywhere while the tree
  // still holds unsettled speculative state.
  const scopeKey = resolveScopeKey(claimant);
  if (scopeKey && hasOpen(scopeKey)) {
    let held = heldByKey.get(scopeKey);
    if (!held) {
      held = new Map();
      heldByKey.set(scopeKey, held);
    }
    held.set(key, run);
    return;
  }

  run();
}

/**
 * Drop a held consequence, for teardown. A tree destroyed with speculative
 * state in flight must not resurrect a write when something later settles.
 */
export function cancelDurableConsequence(claimant: unknown, key: unknown): void {
  const scopeKey = resolveScopeKey(claimant);
  if (!scopeKey) return;
  const held = heldByKey.get(scopeKey);
  if (!held) return;
  held.delete(key);
  if (held.size === 0) heldByKey.delete(scopeKey);
}

/**
 * Settle a scope: run its consequences on `'commit'`, drop them on
 * `'discard'`. Idempotent — settling twice does nothing the second time, so a
 * `confirm()` after a `rollback()` cannot resurrect dropped work.
 *
 * When this leaves the tree with no scope open, consequences HELD for that tree
 * run too: they were never speculative, only unprovable while the tree was.
 *
 * A throwing consequence must not stop the others, or one failing storage
 * backend would swallow the rest. All are attempted; the first error is
 * rethrown afterwards.
 */
export function settleCommitScope(
  owner: object,
  transactionId: number,
  outcome: CommitScopeOutcome
): void {
  const byId = scopesByOwner.get(owner);
  const scope = byId?.get(transactionId);
  if (!byId || !scope) return;

  byId.delete(transactionId);
  if (byId.size === 0) scopesByOwner.delete(owner);

  const key = scope.key;
  if (key) {
    const open = openScopesByKey.get(key);
    open?.delete(transactionId);
    if (open && open.size === 0) openScopesByKey.delete(key);
  }

  let firstError: unknown;
  let failed = false;
  const capture = (error: unknown): void => {
    if (!failed) {
      failed = true;
      firstError = error;
    }
  };
  const attempt = (fn: CommitConsequence): void => {
    try {
      fn();
    } catch (error) {
      capture(error);
    }
  };

  if (outcome === 'commit') {
    for (const consequence of scope.consequences.values()) attempt(consequence);
  }
  scope.consequences.clear();

  if (key && !hasOpen(key)) {
    // Release everything that was waiting on this tree, then notify.
    const held = heldByKey.get(key);
    if (held) {
      heldByKey.delete(key);
      for (const consequence of held.values()) attempt(consequence);
      held.clear();
    }

    const listeners = settleListenersByKey.get(key);
    if (listeners) {
      for (const listener of [...listeners]) attempt(listener);
    }
  }

  if (failed) throw firstError;
}

/** True while any explicit transaction on this node's tree is unsettled. */
export function hasOpenCommitScope(node: object): boolean {
  const key = resolveScopeKey(node);
  return key !== undefined && hasOpen(key);
}

/**
 * Run `listener` once every open scope on this node's tree has settled,
 * whether by commit or by discard.
 */
export function onCommitScopesSettled(
  node: object,
  listener: () => void
): () => void {
  const key = resolveScopeKey(node) ?? (node as object);
  let listeners = settleListenersByKey.get(key);
  if (!listeners) {
    listeners = new Set();
    settleListenersByKey.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    settleListenersByKey.get(key)?.delete(listener);
  };
}
