declare const ngDevMode: boolean | undefined;

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

/** @internal Dev dedupe for ST2028 — one report per session, not per clone. */
let warnedSharedByReference = false;

/**
 * @internal Structural clone for the undo/redo stacks, for values
 * `structuredClone` rejects.
 *
 * This used to be `JSON.parse(JSON.stringify(v))`, and that was silent
 * corruption of an undo stack. `structuredClone` THROWS on a function, so ONE
 * callback anywhere in the edited value dropped the WHOLE object onto the JSON
 * path. MEASURED, the same value with one function field added, after
 * `applyChanges` then `undo`:
 *
 *     Date        -> string          Set -> {}        Map -> {}
 *     `undefined` key -> DROPPED     the function itself -> DROPPED
 *
 * The user hits undo and gets back a value whose dates are strings and whose
 * callback is gone. JSON was never the only option: everything above survives a
 * walk that knows about the types.
 *
 * Functions are shared BY REFERENCE, which is not a compromise — it is the
 * right answer. A function has no state to restore, and its identity is usually
 * what callers compare on. Class instances are copied prototype-and-all, so an
 * `ApiError` comes back an `ApiError`, not a plain object.
 *
 * Cycles are tracked, because an edited value is user-shaped and a
 * parent-pointing node is ordinary domain data.
 */
function structuralClone<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null || typeof value !== 'object') {
    // Functions land here and pass through by reference. Deliberate.
    return value;
  }

  const hit = seen.get(value as object);
  if (hit !== undefined) return hit as T;

  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    seen.set(value, out);
    for (let i = 0; i < value.length; i++) {
      out[i] = structuralClone(value[i], seen);
    }
    return out as T;
  }

  if (value instanceof Map) {
    const out = new Map();
    seen.set(value, out);
    for (const [k, v] of value) {
      out.set(structuralClone(k, seen), structuralClone(v, seen));
    }
    return out as T;
  }

  if (value instanceof Set) {
    const out = new Set();
    seen.set(value, out);
    for (const v of value) out.add(structuralClone(v, seen));
    return out as T;
  }

  // Plain objects AND class instances. `Object.create` keeps the prototype, so
  // methods and `instanceof` survive a round trip through the undo stack.
  const out = Object.create(
    Object.getPrototypeOf(value) as object | null
  ) as Record<string, unknown>;
  seen.set(value, out);

  // Own property DESCRIPTORS, not `Object.keys`, and this is not thoroughness
  // for its own sake: `Error`'s `name` and `message` are own but NON-enumerable,
  // so a `Object.keys` walk restored `new ApiError('nope', 404)` with an EMPTY
  // message. `deepEqual` documents the identical trap one file over. Symbol
  // keys come along for the same reason — a marker or a branded field is not
  // less real for being a symbol.
  for (const key of Reflect.ownKeys(value as object)) {
    const desc = Object.getOwnPropertyDescriptor(value as object, key);
    if (!desc) continue;
    // An accessor is read ONCE and stored as data. Copying the getter itself
    // would make the history entry re-read live state on every access, which is
    // the opposite of a snapshot.
    const raw = 'value' in desc ? desc.value : desc.get?.call(value);
    Object.defineProperty(out, key, {
      value: structuralClone(raw, seen),
      writable: desc.writable ?? true,
      enumerable: desc.enumerable,
      configurable: desc.configurable,
    });
  }
  return out as T;
}

/**
 * @internal Deep copy for the undo/redo stacks.
 *
 * `structuredClone` first — it is native and fast, and preserves `Date`, `Map`,
 * `Set`, `RegExp` and `undefined` values. It THROWS on a function or a class
 * instance with unclonable internals, and that is where {@link structuralClone}
 * takes over. [ST2028]
 */
function clone<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: (v: unknown) => unknown })
    .structuredClone;
  if (sc) {
    try {
      return sc(value) as T;
    } catch {
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        if (!warnedSharedByReference) {
          warnedSharedByReference = true;
          console.warn(
            `SignalTree: this edit session holds a value structuredClone ` +
              `cannot copy — normally a function. Dates, Maps, Sets, RegExps ` +
              `and undefined values are all still preserved across undo/redo, ` +
              `but any FUNCTION is shared by reference between history ` +
              `entries rather than copied, and a class instance's private ` +
              `(#) fields are not carried across. If the value has state you ` +
              `need restored, keep it out of the edited object. [ST2028]`
          );
        }
      }
      return structuralClone(value, new WeakMap());
    }
  }
  return structuralClone(value, new WeakMap());
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
