/**
 * Commit consequence queue — the boundary between speculative authored state
 * and durable consequence.
 *
 * RELEASE-1.0.md: "Persistence is post-commit." A write made inside an explicit
 * transaction is SPECULATIVE until that transaction is confirmed; it may be
 * rolled back, and it may be one of several writes that only make sense
 * together. Sending it to durable storage as it happens breaks that in three
 * measured ways (see `markers/stored-commit-ordering.spec.ts`):
 *
 *   1. a pending, unconfirmed transaction is already durable;
 *   2. two keys written in one transaction leave a torn snapshot that was
 *      never a committed tree state;
 *   3. an aborted transaction persists the doomed value and then repairs it
 *      with a compensating write — so a crash between the two leaves storage
 *      holding state SignalTree itself rejected.
 *
 * The rule this module enforces is deliberately worded to survive every path,
 * not just the one named `confirm()`:
 *
 *   > Persistence observes committed physical truth, never speculative
 *   > authored state.
 *
 * A consequence registered here runs when its scope COMMITS and is dropped
 * when its scope is DISCARDED. Correctness comes from never having written,
 * not from compensating afterwards.
 *
 * Scoping is per transaction-owner token, not global: two trees each running a
 * transaction must not see or settle each other's consequences. The owner
 * token and transaction id both travel on `UpdateMetadata`, so a marker deep
 * in the tree can find its scope from the active write context alone.
 */

export type CommitConsequence = () => void;

export type CommitScopeOutcome = 'commit' | 'discard';

interface CommitScope {
  /** The tree this scope belongs to, for {@link hasOpenCommitScope}. */
  readonly tree: object | undefined;
  /**
   * Keyed so repeated writes to the SAME node in one transaction collapse to
   * the last one. That is what makes persistence see a single coherent state
   * per node instead of a replay of every intermediate value.
   */
  readonly consequences: Map<unknown, CommitConsequence>;
}

const scopesByOwner = new WeakMap<object, Map<number, CommitScope>>();
const openScopesByTree = new WeakMap<object, Set<number>>();
const settleListenersByTree = new WeakMap<object, Set<() => void>>();

function hasOpen(tree: object): boolean {
  const scopes = openScopesByTree.get(tree);
  return scopes !== undefined && scopes.size > 0;
}

/**
 * Open a deferral scope for one explicit transaction.
 *
 * Called when the transaction begins, BEFORE its callback runs, so writes
 * inside the callback find the scope already present.
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
  byId.set(transactionId, { tree, consequences: new Map() });

  if (tree) {
    let open = openScopesByTree.get(tree);
    if (!open) {
      open = new Set();
      openScopesByTree.set(tree, open);
    }
    open.add(transactionId);
  }
}

/**
 * Defer `fn` until the scope commits.
 *
 * Returns `false` when there is no open scope for this owner/transaction, in
 * which case the caller must perform its effect immediately — that is the
 * ordinary non-transactional write, which commits in its own stack and is
 * therefore already post-commit.
 */
export function deferCommitConsequence(
  owner: object,
  transactionId: number,
  key: unknown,
  fn: CommitConsequence
): boolean {
  const scope = scopesByOwner.get(owner)?.get(transactionId);
  if (!scope) return false;
  scope.consequences.set(key, fn);
  return true;
}

/**
 * Settle a scope: run its consequences on `'commit'`, drop them on
 * `'discard'`. Idempotent — a scope settled twice does nothing the second
 * time, so a `confirm()` after a `rollback()` cannot resurrect dropped writes.
 *
 * A throwing consequence must not stop the others, or one failing storage
 * backend would silently swallow every other key in the transaction. All
 * consequences are attempted; the first error is rethrown afterwards.
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

  const tree = scope.tree;
  if (tree) {
    const open = openScopesByTree.get(tree);
    open?.delete(transactionId);
    if (open && open.size === 0) openScopesByTree.delete(tree);
  }

  let firstError: unknown;
  let failed = false;
  const capture = (error: unknown): void => {
    if (!failed) {
      failed = true;
      firstError = error;
    }
  };

  if (outcome === 'commit') {
    for (const consequence of scope.consequences.values()) {
      try {
        consequence();
      } catch (error) {
        capture(error);
      }
    }
  }
  scope.consequences.clear();

  // Listeners fire for BOTH outcomes, once this tree has no scope left open. A
  // deferred whole-tree save must be released by a rollback too, or it waits
  // forever for a scope that will never commit.
  if (tree && !hasOpen(tree)) {
    const listeners = settleListenersByTree.get(tree);
    if (listeners) {
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          capture(error);
        }
      }
    }
  }

  if (failed) throw firstError;
}

/**
 * True while any explicit transaction on `tree` is still unsettled.
 *
 * Consumers that write on a timer rather than in the mutation's own stack —
 * `persistence()` autoSave — cannot read the write context, because by the
 * time their timer fires the transaction callback has long returned while the
 * transaction itself may still be pending. They ask this instead.
 */
export function hasOpenCommitScope(tree: object): boolean {
  return hasOpen(tree);
}

/**
 * Run `listener` once every open scope on `tree` has settled, whether by
 * commit or by discard.
 */
export function onCommitScopesSettled(
  tree: object,
  listener: () => void
): () => void {
  let listeners = settleListenersByTree.get(tree);
  if (!listeners) {
    listeners = new Set();
    settleListenersByTree.set(tree, listeners);
  }
  listeners.add(listener);
  return () => {
    settleListenersByTree.get(tree)?.delete(listener);
  };
}
