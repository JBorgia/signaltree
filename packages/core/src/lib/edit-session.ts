import { signal, WritableSignal } from '@angular/core';

import { deepEqual } from './utils';

export type UndoRedoHistory<T> = {
  past: T[];
  present: T;
  future: T[];
};

export interface EditSession<T> {
  readonly original: WritableSignal<T>;
  readonly modified: WritableSignal<T>;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly isDirty: () => boolean;

  setOriginal(value: T): void;
  applyChanges(valueOrUpdater: T | ((current: T) => T)): void;
  undo(): void;
  redo(): void;
  reset(): void;
  getHistory(): UndoRedoHistory<T>;
}

function clone<T>(value: T): T {
  try {
    // Use structuredClone when available for deep copy
    return (globalThis as any).structuredClone
      ? (globalThis as any).structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

export function createEditSession<T>(initial: T): EditSession<T> {
  const original = signal(clone(initial));
  const present = signal(clone(initial));

  // Internal history stacks are ordinary arrays; expose counts via signals
  const pastCount = signal(0);
  const futureCount = signal(0);

  let past: T[] = [];
  let future: T[] = [];

  function updateCounts() {
    pastCount.set(past.length);
    futureCount.set(future.length);
  }

  const canUndo = () => pastCount() > 0;
  const canRedo = () => futureCount() > 0;
  const isDirty = () => !deepEqual(original(), present());

  function setOriginal(value: T) {
    const v = clone(value);
    original.set(v);
    present.set(clone(v));
    past = [];
    future = [];
    updateCounts();
  }

  function applyChanges(valueOrUpdater: T | ((current: T) => T)) {
    const current = present();
    const next =
      typeof valueOrUpdater === 'function'
        ? (valueOrUpdater as (c: T) => T)(clone(current))
        : (valueOrUpdater as T);

    // No-op if equal
    if (deepEqual(current, next)) return;

    past.push(clone(current));
    present.set(clone(next));
    future = [];
    updateCounts();
  }

  function undo() {
    if (past.length === 0) return;
    const prev = past.pop() as T;
    future.push(clone(present()));
    present.set(clone(prev));
    updateCounts();
  }

  function redo() {
    if (future.length === 0) return;
    const next = future.pop() as T;
    past.push(clone(present()));
    present.set(clone(next));
    updateCounts();
  }

  function reset() {
    present.set(clone(original()));
    past = [];
    future = [];
    updateCounts();
  }

  function getHistory(): UndoRedoHistory<T> {
    return {
      past: past.map((p) => clone(p)),
      present: clone(present()),
      future: future.map((f) => clone(f)),
    };
  }

  return {
    original,
    modified: present,
    canUndo,
    canRedo,
    isDirty,
    setOriginal,
    applyChanges,
    undo,
    redo,
    reset,
    getHistory,
  };
}

export default createEditSession;

// =============================================================================
// v10.1 — Tree-bound edit session
// =============================================================================

/**
 * A read/write source — either an Angular `WritableSignal<T>` or a SignalTree
 * branch/leaf accessor. Anything with `() => T` (read) and `.set(v: T)` (write)
 * qualifies.
 */
export interface TreeEditSource<T> {
  (): T;
  set(value: T): void;
  update?(fn: (current: T) => T): void;
}

/**
 * A {@link createEditSession} bound to a tree path (or any writable source).
 *
 * Extends the base `EditSession` with `commit()` / `cancel()` semantics so
 * draft-and-cancel workflows can pipe through to the tree without manual
 * `effect()` plumbing.
 */
export interface TreeEditSession<T> extends EditSession<T> {
  /**
   * Write the current draft value back to the bound source (tree path / signal).
   * Equivalent to `source.set(session.modified())`. Does NOT clear history —
   * call `cancel()` or instantiate a new session if you want a fresh draft.
   */
  commit(): void;

  /**
   * Discard the draft and clear history. The next read of `modified()` reflects
   * the current source value (re-pulled at the moment of cancellation).
   */
  cancel(): void;

  /**
   * Re-sync the session's `original` to the current source value WITHOUT
   * touching the draft. Useful when external changes have updated the source
   * and you want the session's "is-dirty" comparison to use the new baseline.
   */
  pullFromSource(): void;
}

/**
 * Creates an edit session bound to a writable tree path or signal.
 *
 * The session holds an internal draft separate from the bound source. Use
 * `applyChanges()` to edit the draft, `undo()` / `redo()` to navigate history,
 * `commit()` to write the draft back to the source, and `cancel()` to discard.
 *
 * @example Form wizard with cancel
 * ```typescript
 * const tree = signalTree({
 *   user: { profile: { name: 'Alice', email: 'a@example.com' } },
 * });
 *
 * // Bind to the branch — `tree.$.user.profile` is a NodeAccessor that's
 * // both readable (call with no args) and writable (call with a value).
 * const session = createTreeEditSession(tree.$.user.profile);
 *
 * // User edits in a form wizard:
 * session.applyChanges((p) => ({ ...p, name: 'Alice V2' }));
 * session.applyChanges((p) => ({ ...p, email: 'alice.v2@example.com' }));
 *
 * // User clicks "Cancel" — discards.
 * session.cancel();
 * // tree.$.user.profile() === { name: 'Alice', email: 'a@example.com' }
 *
 * // OR user clicks "Save" — writes draft back.
 * session.commit();
 * // tree.$.user.profile() === { name: 'Alice V2', email: 'alice.v2@example.com' }
 * ```
 *
 * @example Leaf signal binding
 * ```typescript
 * const session = createTreeEditSession(tree.$.user.profile.name);
 * session.applyChanges('Bob');
 * session.commit(); // tree.$.user.profile.name() === 'Bob'
 * ```
 */
export function createTreeEditSession<T>(
  source: TreeEditSource<T>
): TreeEditSession<T> {
  if (typeof source !== 'function' || typeof source.set !== 'function') {
    throw new TypeError(
      'createTreeEditSession: source must be a callable accessor with a .set() method ' +
        '(e.g. tree.$.user.profile or a WritableSignal).'
    );
  }

  const initial = clone(source());
  const base = createEditSession<T>(initial);

  return {
    ...base,
    commit(): void {
      source.set(clone(base.modified()));
    },
    cancel(): void {
      const current = clone(source());
      base.setOriginal(current); // also clears history
    },
    pullFromSource(): void {
      const current = clone(source());
      base.original.set(current);
    },
  };
}
