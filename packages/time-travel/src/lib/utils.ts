/**
 * Lightweight utility functions for time-travel package
 * Replaces lodash dependencies to reduce bundle size
 */

/** Prefer structuredClone when available; fall back to JSON clone (fast, simple). */
export function deepClone<T>(obj: T): T {
  try {
    if (typeof structuredClone === 'function') return structuredClone(obj);
  } catch {
    // ignore and fall through
  }
  // JSON clone fallback (drops functions/undefined/symbols)
  return JSON.parse(JSON.stringify(obj)) as T;
}

/** Fast equality: JSON stringify fallback for plain data; strict equal shortcut. */
export function deepEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  try {
    // If both are serializable, compare their JSON quickly
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // Non-serializable; conservative false to ensure history records when unsure
    return false;
  }
}
