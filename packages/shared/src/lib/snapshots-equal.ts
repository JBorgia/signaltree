/**
 * Compares two values for deep equality using JSON serialization.
 * Note: This is a simple equality check suitable for plain data objects.
 * Does not handle functions, circular references, or special objects.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns True if the values are deeply equal
 *
 * @example
 * ```typescript
 * snapshotsEqual({ a: 1, b: 2 }, { a: 1, b: 2 }) // true
 * snapshotsEqual({ a: 1, b: 2 }, { a: 1, b: 3 }) // false
 * snapshotsEqual([1, 2, 3], [1, 2, 3]) // true
 * ```
 */
export function snapshotsEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
