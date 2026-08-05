/**
 * Recursively determine deep equality between two values.
 * Matches the runtime semantics required by SignalTree utilities.
 */
export function deepEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;

  const typeA = typeof a;
  const typeB = typeof b;
  if (typeA !== typeB) return false;
  // SameValueZero for primitives: NaN equals NaN. `a === b` above already
  // handled every other primitive pair, so reaching here with a non-object
  // means unequal UNLESS both are NaN. Without this a leaf holding NaN — a
  // failed parse, a 0/0, `Number(input)` on a blank field — was considered
  // changed by every re-write of the same NaN, notifying every dependent
  // computed and effect on a no-op. Matches lodash isEqual and Object.is.
  if (typeA !== 'object') return a !== a && b !== b;

  if (a instanceof Date && b instanceof Date) {
    // getTime() is NaN for an Invalid Date, so `===` reported two Invalid
    // Dates as different and a leaf holding one re-notified every dependent on
    // every rewrite — the same churn the primitive NaN case above fixes, and
    // the ordinary result of `new Date(userInput)` on a blank or malformed
    // field. lodash isEqual treats them as equal; so do we.
    const ta = a.getTime();
    const tb = b.getTime();
    return ta === tb || (ta !== ta && tb !== tb);
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !deepEqual(value, b.get(key))) return false;
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) =>
      deepEqual(item, (b as unknown as unknown[])[index])
    );
  }

  if (Array.isArray(b)) return false;

  // A built-in on ONE side only must be unequal. Every branch above requires
  // BOTH sides to match, so a Date vs a keyless object fell through to the
  // generic key comparison below and compared EQUAL — `deepEqual(new Date(0), {})`
  // was true, so a malformed payload sending `{}` for a date field was silently
  // swallowed AND honestly reported as no change. Same for Map/Set/RegExp/Error
  // and the primitive wrapper objects, which all have no own enumerable keys:
  // "no differing keys" is not the same as "equal".
  if (
    Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)
  ) {
    return false;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => key in objB && deepEqual(objA[key], objB[key]));
}

// Backwards compatible alias expected by existing imports.
export const equal = deepEqual;
