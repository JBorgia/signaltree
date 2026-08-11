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
  return equalsInner(a, b, 0, undefined);
}

/**
 * Depth at which cycle tracking switches on.
 *
 * A cycle is INFINITELY deep, so it always trips this; legitimate state does
 * not. SignalTree advertises arbitrary nesting and its own extreme-depth
 * fixtures run 15-20 levels, so 64 is comfortably above anything real while
 * being nothing against a ~10,000-frame stack limit. Below it, cycle handling
 * costs one integer compare per recursion and allocates nothing.
 */
const CYCLE_GUARD_DEPTH = 64;

/**
 * @internal The walker. `seen` is created LAZILY — see CYCLE_GUARD_DEPTH.
 *
 * Before this existed, `deepEqual` recursed forever on a cyclic value and threw
 * `RangeError: Maximum call stack size exceeded`. Not theoretical: an array leaf
 * is the ordinary place a parent-pointing node list lives (file tree, org chart,
 * comment thread, AST), and replacing that leaf crashed the write. Plain objects
 * become BRANCHES so they never reach here, which is why this survived — the
 * crash needs the cycle inside a value that stays a LEAF.
 */
function equalsInner(
  a: unknown,
  b: unknown,
  depth: number,
  seen: WeakMap<object, unknown> | undefined
): boolean {
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

  // CYCLE GUARD. Both sides are objects from here down, so this is the point
  // where unbounded recursion becomes possible.
  //
  // Keyed on `a`, holding the `b` it was paired with. Seeing the SAME pair again
  // means we are inside a cycle and have already committed to comparing them, so
  // returning true is the co-inductive answer (and the one lodash and
  // fast-equals give). A DIFFERENT `b` for the same `a` is a diamond, not a
  // cycle — we overwrite and keep walking, which stays correct.
  // Deliberately NOT hoisted into locals. Two extra locals in this function
  // measured ~11% on the array path — V8's inlining is sensitive to its size,
  // and this runs on every leaf write. The rare branch pays for itself instead:
  // below the threshold this is one integer compare and nothing else.
  if (depth >= CYCLE_GUARD_DEPTH) {
    seen ??= new WeakMap<object, unknown>();
    if (seen.get(a as object) === b) return true;
    seen.set(a as object, b);
  }

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    // A plain loop with an INLINE reference check, not `a.every(...)`.
    //
    // `every` costs a callback dispatch per element, and recursing costs a
    // frame per element — both paid BEFORE the `a === b` on line 17 can
    // short-circuit. So the overwhelmingly common case, an array copied with
    // one element changed, paid full price for the 49,999 elements that did
    // not move. Checking `x === y` here skips both.
    //
    // MEASURED, verdicts identical on every probe case:
    //     n=100     one change     538ns -> 159ns
    //     n=1,000   one change     3.7us -> 0.9us
    //     n=50,000  one change     159us -> 37.9us
    // The all-elements-differ case is ~3% slower (one extra compare per
    // element before recursing); it is the rare case and the trade is heavily
    // positive. `every` vs `some` measured identical — the cost was never the
    // choice of combinator, it was the callback.
    const bArr = b as unknown as unknown[];
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = bArr[i];
      if (x === y) continue;
      if (!equalsInner(x, y, depth + 1, seen)) return false;
    }
    return true;
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
      if (!b.has(key) || !equalsInner(value, b.get(key), depth + 1, seen))
        return false;
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

  // Error and the primitive wrappers are checked ADDITIVELY: their intrinsic
  // identity must match, and then execution FALLS THROUGH to the own-enumerable
  // key comparison at the bottom. Returning here instead was a regression that
  // shipped and was caught by audit — `class ApiError extends Error { status }`
  // is the ordinary shape of an HTTP error, and a leaf holding
  // `ApiError('Request failed', 404)` set to the same message with status 500
  // compared EQUAL, so the write was dropped, `updateAndReport` returned [], and
  // the UI kept showing the old error. Fixing "errors always compare equal" must
  // not create "errors with differing state compare equal".
  if (a instanceof Error && b instanceof Error) {
    // `name`/`message` are OWN but NON-enumerable, so the key comparison alone
    // saw nothing and reported EVERY pair of Errors as equal.
    if (a.name !== b.name || a.message !== b.message) return false;
  } else if (
    (a instanceof Number && b instanceof Number) ||
    (a instanceof String && b instanceof String) ||
    (a instanceof Boolean && b instanceof Boolean)
  ) {
    // Same shape: no own enumerable keys, so `new Number(1)` and
    // `new Number(2)` compared equal.
    const va = (a as unknown as { valueOf(): unknown }).valueOf();
    const vb = (b as unknown as { valueOf(): unknown }).valueOf();
    if (!(va === vb || (va !== va && vb !== vb))) return false;
  }

  // KNOWN LIMITATION, pre-existing and deliberately not changed here: the Date
  // branch above returns early, so a `class Stamped extends Date { note }` with
  // the same time but a different `note` compares equal. Making Date additive
  // too would add an `Object.keys()` pair to every Date comparison — the most
  // common built-in on the hot path — to serve a shape that is vanishingly rare,
  // where error subclasses carrying a status code are not. Revisit with a
  // measurement if a Date subclass with state ever shows up.

  // A built-in on ONE side only — `new Date(0)` vs `{}`, a Map vs a plain
  // object, a typed array vs `{}`. None has own enumerable keys, so the key
  // comparison below would find "no differences" and call them EQUAL, silently
  // swallowing a malformed payload AND honestly reporting it as no change.
  //
  // One property read, not two `getPrototypeOf` calls plus two
  // `Object.prototype.toString` calls. `.constructor` is an ordinary inherited
  // read that V8 inline-caches; `getPrototypeOf` is a runtime call it does not.
  // MEASURED over 1,000-row entity arrays, min of four alternating rounds:
  // 168.5us -> 140.0us, 17% off the object path, 14.4ns per object node. A
  // variant comparing the two prototypes to each other instead of to
  // `Object.prototype` measured 1% SLOWER, which is what identifies the cost as
  // the runtime calls rather than the shape of the comparison.
  //
  // The `try` costs nothing measurable (140.0us with, 139.7us without — V8 does
  // not penalise a non-throwing try) and it buys a real guarantee: a Proxy with
  // a throwing `get` trap cannot escape through the comparator. This is a
  // signal's `equal`, so a throw here does not fail a comparison, it fails the
  // WRITE. The gate this replaced could itself throw, on a Proxy trapping
  // `getPrototypeOf` — so throw surface goes DOWN, not up.
  //
  // This is stricter than the gate it replaces, in four cases, all of which
  // flip from "equal" to "not equal":
  //
  //     class instance vs plain object, same fields   was true, now false
  //     Object.create(null) vs {}, same keys          was true, now false
  //     cross-realm {} vs local {}                    was true, now false
  //     Object.create(Date.prototype) vs {}           was true, now false
  //
  // Every one of those moves in the SAFE direction. For a signal's `equal`,
  // "wrongly unequal" costs a redundant notification; "wrongly equal" DROPS THE
  // WRITE and nothing downstream ever learns the state changed. This comparator
  // has already shipped two false-equal defects (Errors, and inherited keys via
  // `in`) and zero false-unequal ones, which is the asymmetry the gate is
  // chosen against. The last case is a strict correctness improvement: a
  // prototype-forged Date has no [[DateValue]], so `toString` reported it as a
  // plain object and it compared equal to `{}`.
  try {
    if (
      (a as { constructor?: unknown }).constructor !==
      (b as { constructor?: unknown }).constructor
    ) {
      return false;
    }
  } catch {
    return false;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;

  // `hasOwnProperty`, NOT `key in objB`. This was a correctness bug, not a
  // micro-optimisation.
  //
  // `Object.keys` yields OWN enumerable keys, but `in` is true for INHERITED
  // ones — so two objects with DIFFERENT own-key sets compared EQUAL whenever
  // the difference was covered by a prototype:
  //
  //     a = { shared: 1, own: 2 }                       // own: shared, own
  //     b = Object.create({ shared: 1 })                // shared is INHERITED
  //     b.own = 2; b.extra = 3;                         // own: own, extra
  //     deepEqual(a, b)  ->  true      // WRONG: b.extra was never examined
  //
  // The key COUNTS match, every key of `a` is `in` `b`, and nothing ever looks
  // at `b`'s own keys — so `extra` is invisible. That is a FALSE EQUAL, which
  // is the dangerous direction: the comparator is a signal's `equal`, so a
  // genuine change reported as no-change means the write is DROPPED and nothing
  // notifies. Found by reading fast-deep-equal, which uses `hasOwnProperty` for
  // exactly this reason.
  //
  // `hasOwnProperty` is also the faster of the two — `in` walks the prototype
  // chain on every key.
  const hasOwn = Object.prototype.hasOwnProperty;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!hasOwn.call(objB, key)) return false;
    const x = objA[key];
    const y = objB[key];
    if (x === y) continue;
    if (!equalsInner(x, y, depth + 1, seen)) return false;
  }
  return true;
}

// Backwards compatible alias expected by existing imports.
// `equal` was an alias for `deepEqual` and was REMOVED in 14.1.1. One
// operation, one name — and `equal` is the OPTION key everywhere else in the
// library (`linked({ equal })`, `compared(value, equal)`, `entityMap({ equal })`),
// where it means "your comparator", not "deep equality". One word cannot mean
// both. Import `deepEqual`.
