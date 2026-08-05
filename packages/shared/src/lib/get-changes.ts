/**
 * Computes the changes between two objects by comparing their properties.
 * Only includes properties that have different values.
 *
 * @param oldState - The previous state
 * @param newState - The new state
 * @returns A partial object containing only the changed properties
 *
 * @example
 * ```typescript
 * const old = { a: 1, b: 2, c: 3 };
 * const new = { a: 1, b: 5, c: 3 };
 * getChanges(old, new) // { b: 5 }
 * ```
 */
export function getChanges<T>(oldState: T, newState: T): Partial<T> {
  const changes: Record<string, unknown> = {};

  // `for...in` walks the PROTOTYPE CHAIN, and both states may come from
  // untrusted input. Own-properties only — otherwise inherited keys are
  // reported as "changes" that were never in either object.
  //
  // The `__proto__` skip is the accumulator shape: `changes['__proto__'] = v`
  // sets the RESULT object's prototype to attacker-supplied data, so the
  // function returned an object with an attacker-chosen prototype while
  // `Object.keys()` on it read empty — invisible to every caller that inspects
  // it. `constructor`/`prototype` are deliberately NOT blocked; they cannot
  // reach the chain through a plain assignment and blocking them would drop
  // real changes.
  for (const key in newState) {
    if (!Object.prototype.hasOwnProperty.call(newState, key)) continue;
    if (key === '__proto__') continue;
    if (oldState[key] !== newState[key]) {
      changes[key] = newState[key];
    }
  }

  return changes as Partial<T>;
}
