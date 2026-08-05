/**
 * Recursively determine deep equality between two values.
 * Matches the runtime semantics required by SignalTree utilities.
 *
 * This runs on EVERY leaf write (it is the signals' `equal`), so the ordering
 * below is deliberate and measured, not stylistic:
 *
 * - each built-in test is `a instanceof X && b instanceof X`, which
 *   SHORT-CIRCUITS after one check when `a` is not an X. An earlier revision
 *   used `||` to catch one-sided mismatches, and that forced BOTH checks on
 *   every miss — measured at +43% on arrays and +60% on Dates.
 * - arrays are tested first because they are the most common non-plain value.
 * - the one-sided mismatch case (`new Date(0)` vs `{}`) is handled once, at the
 *   end, behind a prototype gate, so ordinary objects never pay for it.
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

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) =>
      deepEqual(item, (b as unknown as unknown[])[index])
    );
  }
  if (Array.isArray(b)) return false;

  if (a instanceof Date && b instanceof Date) {
    try {
      // `Object.create(Date.prototype)` passes `instanceof` but has no
      // [[DateValue]], so this THREW out of the equality function that every
      // leaf comparison runs through. A non-throwing try costs nothing in V8.
      const ta = a.getTime();
      const tb = b.getTime();
      // getTime() is NaN for an Invalid Date — the ordinary result of
      // `new Date(blankField)` — so `===` alone called two of them different,
      // and a leaf holding one re-notified every dependent on every rewrite.
      return ta === tb || (ta !== ta && tb !== tb);
    } catch {
      return false;
    }
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

  if (a instanceof Error && b instanceof Error) {
    // `name` and `message` are OWN but NON-enumerable, so the key comparison at
    // the bottom saw nothing and reported EVERY pair of Errors as equal — a
    // leaf holding an error never reported a change, which is the opposite of
    // what an error state is for.
    return a.name === b.name && a.message === b.message;
  }

  if (
    (a instanceof Number && b instanceof Number) ||
    (a instanceof String && b instanceof String) ||
    (a instanceof Boolean && b instanceof Boolean)
  ) {
    // Primitive wrapper objects — same shape of bug, no own enumerable keys, so
    // `new Number(1)` and `new Number(2)` compared equal.
    const va = (a as unknown as { valueOf(): unknown }).valueOf();
    const vb = (b as unknown as { valueOf(): unknown }).valueOf();
    return va === vb || (va !== va && vb !== vb);
  }

  // A built-in on ONE side only — `new Date(0)` vs `{}`, a Map vs a plain
  // object, a typed array vs `{}`. None has own enumerable keys, so the key
  // comparison below would find "no differences" and call them EQUAL, silently
  // swallowing a malformed payload AND honestly reporting it as no change.
  //
  // Gated on "not two ordinary objects" so the common case — two plain objects
  // — never pays for the two `Object.prototype.toString` calls, which are the
  // expensive part.
  if (
    (Object.getPrototypeOf(a) !== Object.prototype ||
      Object.getPrototypeOf(b) !== Object.prototype) &&
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
