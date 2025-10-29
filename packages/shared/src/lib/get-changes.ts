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

  for (const key in newState) {
    if (oldState[key] !== newState[key]) {
      changes[key] = newState[key];
    }
  }

  return changes as Partial<T>;
}
