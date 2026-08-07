import { describe, expect, it } from 'vitest';

import { deepEqual } from './deep-equal';

/**
 * The array and object branches were converted from `.every(callback)` to a
 * plain loop with an inline `x === y` short-circuit — 3.4-4.2x on the
 * something-changed path, which is the common one for a write.
 *
 * That is a pure performance change and MUST NOT alter a single verdict, so
 * this pins it against a reference implementation of the ORIGINAL shape rather
 * than against hand-written expectations. Hand-written cases only test what the
 * author thought of; a differential test over generated values tests what they
 * did not.
 */
function reference(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  const typeA = typeof a;
  if (typeA !== typeof b) return false;
  if (typeA !== 'object') return a !== a && b !== b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== (b as unknown[]).length) return false;
    // the ORIGINAL: callback per element, no inline reference check
    return a.every((item, i) => reference(item, (b as unknown[])[i]));
  }
  if (Array.isArray(b)) return false;
  if (a instanceof Date && b instanceof Date) {
    const ta = a.getTime();
    const tb = b.getTime();
    return ta === tb || (ta !== ta && tb !== tb);
  }
  if (a instanceof RegExp && b instanceof RegExp)
    return a.source === b.source && a.flags === b.flags;
  if (
    a instanceof Map ||
    b instanceof Map ||
    a instanceof Set ||
    b instanceof Set
  )
    return deepEqual(a, b); // out of scope for the two converted branches
  if (
    (Object.getPrototypeOf(a) !== Object.prototype ||
      Object.getPrototypeOf(b) !== Object.prototype) &&
    Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)
  )
    return false;
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  // the ORIGINAL: callback per key
  return keysA.every((k) => k in objB && reference(objA[k], objB[k]));
}

/** Deterministic PRNG so a failure is reproducible from the seed alone. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
}

function gen(r: () => number, depth = 0): unknown {
  const pick = r();
  if (depth > 3 || pick < 0.3) {
    const prim = r();
    if (prim < 0.15) return null;
    if (prim < 0.25) return undefined;
    if (prim < 0.35) return NaN;
    if (prim < 0.5) return Math.floor(r() * 4);
    if (prim < 0.65) return ['a', 'b', 'c'][Math.floor(r() * 3)];
    if (prim < 0.75) return r() < 0.5;
    if (prim < 0.85) return new Date(Math.floor(r() * 3) * 1000);
    return 0;
  }
  if (pick < 0.65) {
    const n = Math.floor(r() * 5);
    return Array.from({ length: n }, () => gen(r, depth + 1));
  }
  const o: Record<string, unknown> = {};
  const n = Math.floor(r() * 4);
  for (let i = 0; i < n; i++) o['k' + Math.floor(r() * 5)] = gen(r, depth + 1);
  return o;
}

describe('deepEqual: loop conversion changes no verdict', () => {
  it('agrees with the pre-conversion implementation over 20,000 generated pairs', () => {
    const r = rng(20260807);
    const mismatches: Array<{ a: unknown; b: unknown }> = [];
    for (let i = 0; i < 20_000; i++) {
      const a = gen(r);
      // Half the time compare against a STRUCTURALLY SHARED variant, which is
      // the shape the inline reference check actually targets.
      const b = r() < 0.5 ? gen(r) : structuredCloneish(a);
      if (deepEqual(a, b) !== reference(a, b)) mismatches.push({ a, b });
    }
    expect(mismatches).toEqual([]);
  });

  it('agrees on the shared-reference shapes the optimisation targets', () => {
    const row = (i: number) => ({ id: i, v: i });
    const base = Array.from({ length: 200 }, (_, i) => row(i));

    const cases: Array<[unknown, unknown]> = [
      [base, base],
      [base, base.slice()],
      [base, base.map((o) => ({ ...o }))],
      [base, [...base.slice(0, 199), { id: 199, v: -1 }]],
      [base, base.slice(0, 199)],
      [[NaN], [NaN]],
      [[undefined], [undefined]],
      [[undefined], []],
      [{ a: undefined }, {}],
      [{ a: undefined }, { a: undefined }],
      [[[1, [2, [3]]]], [[1, [2, [3]]]]],
      [{ x: { y: { z: [1, 2] } } }, { x: { y: { z: [1, 2] } } }],
    ];
    for (const [a, b] of cases) {
      expect({ case: a, got: deepEqual(a, b) }).toEqual({
        case: a,
        got: reference(a, b),
      });
    }
  });
});

/** Structural copy that preserves NaN/undefined, unlike structuredClone here. */
function structuredCloneish(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(structuredCloneish);
  if (v instanceof Date) return new Date(v.getTime());
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>))
      o[k] = structuredCloneish((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}
