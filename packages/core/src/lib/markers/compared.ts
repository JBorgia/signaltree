/**
 * Per-leaf equality: `compared()`
 *
 * Every leaf in a tree shares one equality function, chosen once for the whole
 * tree (`deepEqual`, or `Object.is` under `useShallowComparison`). That is the
 * right default and the wrong answer for a handful of positions, because the
 * default cannot know what makes YOUR value equal — which fields matter, which
 * are incidental, or that a `version` field already answers the question.
 *
 * `compared()` attaches a comparator to one position.
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   // A version field answers "did this change?" in O(1), whatever the size.
 *   user: compared(initialUser, byKeys<User>('id', 'version')),
 *
 *   // Or spell out exactly what counts.
 *   filters: compared(initialFilters, (a, b) =>
 *     a.query === b.query && a.page === b.page),
 * });
 *
 * // The tree type is unchanged — `compared()` returns T, not a wrapper.
 * tree.$.user().name;
 * ```
 *
 * ## When this is worth reaching for
 *
 * Measured, 2M writes to one leaf (Node 24.3):
 *
 * | leaf                            | `deepEqual` | comparator |         |
 * | ------------------------------- | ----------- | ---------- | ------- |
 * | object `{id,name,email,version}` | 53.8 ns     | 8.9 ns     | 6.0x    |
 * | same, re-fetched (equivalent)   | 110.3 ns    | 9.0 ns     | 12.2x   |
 * | nested, 3 levels / 6 fields     | 60.5 ns     | 9.5 ns     | 6.4x    |
 *
 * A comparator reaches the reference-equality floor (`Object.is` measures
 * 8.6 ns) WITHOUT giving up correctness on a re-fetch — an HTTP response that
 * rebuilds an equivalent object still compares equal, where `Object.is` would
 * report a spurious change and notify every dependent.
 *
 * ## When it is NOT worth reaching for
 *
 * **Primitives.** `deepEqual`'s first line is `if (a === b) return true`, which
 * is already the whole fast path. On a changing number it measures 6.5 ns
 * against `Object.is`'s 8.1 ns — the general function is *faster*. There is
 * nothing to specialise.
 *
 * **Large collections.** A comparator over a 50,000-element array is still
 * O(N), and it does nothing about the `slice()` that produced the new array —
 * measured, that copy alone is ~41 ms of a ~49 ms workload, and no equality
 * function can touch it. Use {@link entityMap} instead: on the same task it
 * measures 1.63 ms against 49.80 ms for an array leaf, which is a different
 * data model, not a faster comparison. SignalTree warns about this (ST2018).
 *
 * ## It makes the position a LEAF
 *
 * `compared({ a: 1, b: 2 }, eq)` stores one signal holding `{a, b}` — there is
 * no `tree.$.x.a`. That is the point (the object is compared as a unit), but it
 * is a real difference from a bare `{ a: 1, b: 2 }`, which becomes a branch with
 * two independently-writable leaves.
 */

// =============================================================================
// INTERNAL SYMBOLS
// =============================================================================

const COMPARED_MARKER = Symbol.for('signaltree:compared');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Internal shape produced by {@link compared}. Never surfaces in a tree type —
 * `compared()` is declared as returning `T` so the state literal keeps the
 * shape the developer wrote.
 */
export interface ComparedMarker<T> {
  readonly [COMPARED_MARKER]: true;
  readonly value: T;
  readonly equal: (a: T, b: T) => boolean;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/** Type guard used by `createSignalStore` to intercept the marker. */
export function isComparedMarker(
  value: unknown
): value is ComparedMarker<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    COMPARED_MARKER in value &&
    (value as Record<symbol, unknown>)[COMPARED_MARKER] === true
  );
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Give one leaf its own equality function.
 *
 * Returns `T` rather than a wrapper type, so the tree's shape and every path
 * type stay exactly as written.
 *
 * @param value Initial value for the leaf.
 * @param equal Comparator. Must be reflexive, symmetric and transitive —
 *   SignalTree calls it to decide whether to notify dependents, so an
 *   inconsistent comparator produces missed or spurious updates.
 */
export function compared<T>(value: T, equal: (a: T, b: T) => boolean): T {
  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    if (typeof equal !== 'function') {
      throw new Error(
        `SignalTree: compared() requires a comparator function, received ` +
          `${equal === null ? 'null' : typeof equal}. [ST2019]`
      );
    }
  }
  return {
    [COMPARED_MARKER]: true,
    value,
    equal,
  } as ComparedMarker<T> as unknown as T;
}

/**
 * Build a comparator that considers two values equal when the listed keys
 * match. The identity/version pattern:
 *
 * ```typescript
 * user: compared(initialUser, byKeys<User>('id', 'version'))
 * ```
 *
 * This is O(keys), not O(value) — a `version` counter makes equality
 * constant-time no matter how large the object grows, provided every write path
 * bumps it. It measured 8.0 ns against `deepEqual`'s 110.3 ns on a re-fetched
 * object.
 *
 * The trade is real and it is yours to make: if a field outside `keys` changes
 * while the listed keys stay put, the write is treated as a no-op and
 * dependents are NOT notified. That is exactly the desired behaviour for a
 * server-assigned `version`, and a bug if the keys do not actually determine
 * the value.
 */
export function byKeys<T extends object>(
  ...keys: ReadonlyArray<keyof T>
): (a: T, b: T) => boolean {
  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    if (keys.length === 0) {
      throw new Error(
        `SignalTree: byKeys() requires at least one key — with none, every ` +
          `value compares equal and no write would ever notify. [ST2019]`
      );
    }
  }
  return (a: T, b: T): boolean => {
    if (a === b) return true;
    if (a == null || b == null) return false;
    for (let i = 0; i < keys.length; i++) {
      if (!Object.is(a[keys[i]], b[keys[i]])) return false;
    }
    return true;
  };
}
