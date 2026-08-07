import { deepEqual } from './deep-equal';

/**
 * Property-based tests for deepEqual — the equality primitive the entire
 * reactivity model rests on (signal `equal`, the ref-skip short-circuit in
 * recursiveUpdate, time-travel dedup, the reactivity contract). The original
 * benchmark no-op bug lived in this short-circuit, so we fuzz its invariants
 * with a seeded PRNG (deterministic → reproducible on failure, no extra dep).
 */

// Deterministic PRNG (mulberry32) so any failure is reproducible from the seed.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const randInt = (rng: Rng, n: number) => Math.floor(rng() * n);

// Generate a random JSON-ish value exercising every deepEqual branch.
function gen(rng: Rng, depth: number): unknown {
  const leaf = () =>
    pick(rng, [
      0,
      1,
      -1,
      42,
      rng(),
      'a',
      'b',
      '',
      true,
      false,
      null,
      undefined,
      new Date(Math.floor(rng() * 1e12)),
      /abc/gi,
      new Date(0),
    ]);
  if (depth <= 0) return leaf();
  const kind = randInt(rng, 7);
  switch (kind) {
    case 0:
    case 1:
      return leaf();
    case 2: {
      const len = randInt(rng, 4);
      return Array.from({ length: len }, () => gen(rng, depth - 1));
    }
    case 3: {
      const o: Record<string, unknown> = {};
      const n = randInt(rng, 4);
      for (let i = 0; i < n; i++) o[`k${i}`] = gen(rng, depth - 1);
      return o;
    }
    case 4: {
      const m = new Map<string, unknown>();
      const n = randInt(rng, 3);
      for (let i = 0; i < n; i++) m.set(`k${i}`, gen(rng, depth - 1));
      return m;
    }
    case 5: {
      const s = new Set<unknown>();
      const n = randInt(rng, 3);
      for (let i = 0; i < n; i++) s.add(pick(rng, [0, 1, 'x', 'y', true]));
      return s;
    }
    default:
      return leaf();
  }
}

// Structural deep clone preserving the types deepEqual distinguishes.
function clone<T>(v: T): T {
  if (v == null || typeof v !== 'object') return v;
  if (v instanceof Date) return new Date(v.getTime()) as unknown as T;
  if (v instanceof RegExp) return new RegExp(v.source, v.flags) as unknown as T;
  if (v instanceof Map)
    return new Map([...v].map(([k, val]) => [k, clone(val)])) as unknown as T;
  if (v instanceof Set)
    return new Set([...v].map((x) => clone(x))) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => clone(x)) as unknown as T;
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>))
    o[k] = clone((v as Record<string, unknown>)[k]);
  return o as T;
}

const RUNS = 500;

describe('deepEqual — property based (seeded)', () => {
  it('reflexive: deepEqual(x, x) is always true (ref short-circuit)', () => {
    const rng = mulberry32(0xc0ffee);
    for (let i = 0; i < RUNS; i++) {
      const x = gen(rng, 4);
      expect(deepEqual(x, x)).toBe(true);
    }
  });

  it('structural: a deep clone is always deepEqual to the original', () => {
    const rng = mulberry32(0x1234);
    for (let i = 0; i < RUNS; i++) {
      const x = gen(rng, 4);
      expect(deepEqual(x, clone(x))).toBe(true);
    }
  });

  it('symmetric: deepEqual(a, b) === deepEqual(b, a)', () => {
    const rng = mulberry32(0xabcd);
    for (let i = 0; i < RUNS; i++) {
      const a = gen(rng, 3);
      // Sometimes compare against a clone (equal), sometimes a fresh value.
      const b = rng() < 0.5 ? clone(a) : gen(rng, 3);
      expect(deepEqual(a, b)).toBe(deepEqual(b, a));
    }
  });

  it('sensitive: changing one primitive leaf breaks equality', () => {
    const rng = mulberry32(0x55aa);
    let checked = 0;
    for (let i = 0; i < RUNS && checked < 200; i++) {
      const obj: Record<string, unknown> = {};
      const n = 1 + randInt(rng, 3);
      for (let k = 0; k < n; k++) obj[`k${k}`] = randInt(rng, 100);
      const mutated = clone(obj);
      const key = `k${randInt(rng, n)}`;
      mutated[key] = (mutated[key] as number) + 1; // distinct value
      expect(deepEqual(obj, mutated)).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('type-distinct: same-shape values of different container types are unequal', () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2 } as unknown as number[])).toBe(
      false
    );
    expect(deepEqual(new Map([['a', 1]]), { a: 1 } as unknown)).toBe(false);
    expect(deepEqual(new Set([1, 2]), [1, 2] as unknown)).toBe(false);
    expect(deepEqual(new Date(0), 0 as unknown as Date)).toBe(false);
    expect(deepEqual(/a/g, /a/i)).toBe(false); // flags differ
    expect(deepEqual(null, undefined)).toBe(false);
  });
});

describe('deepEqual — SameValueZero for NaN (13.5.0)', () => {
  // These assert the FUNCTION directly. An earlier attempt tested the symptom
  // through a tree, and both the reported-paths version and the effect-count
  // version passed against unfixed code — the Object.is readback in
  // recursiveUpdate masks the primitive case, and a worktree check was
  // contaminated by a symlinked node_modules resolving shared back to source.
  // A pure-function assertion cannot be masked by either.
  it('treats NaN as equal to NaN', () => {
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
  });

  it('treats two Invalid Dates as equal', () => {
    // `new Date(blankField).getTime()` is NaN, so `===` called them different
    // and a leaf holding one re-notified every dependent on every rewrite.
    expect(deepEqual(new Date(Number.NaN), new Date(Number.NaN))).toBe(true);
    expect(deepEqual(new Date('nonsense'), new Date('nonsense'))).toBe(true);
  });

  it('still separates a valid Date from an Invalid one, and unequal dates', () => {
    expect(deepEqual(new Date(0), new Date(Number.NaN))).toBe(false);
    expect(deepEqual(new Date(Number.NaN), new Date(0))).toBe(false);
    expect(deepEqual(new Date(0), new Date(5))).toBe(false);
    expect(deepEqual(new Date(5), new Date(5))).toBe(true);
  });

  it('propagates NaN equality through containers', () => {
    expect(deepEqual([Number.NaN], [Number.NaN])).toBe(true);
    expect(deepEqual({ a: Number.NaN }, { a: Number.NaN })).toBe(true);
    expect(
      deepEqual({ d: new Date(Number.NaN) }, { d: new Date(Number.NaN) })
    ).toBe(true);
  });

  it('does not make unrelated primitives equal', () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(Number.NaN, 1)).toBe(false);
    expect(deepEqual(1, Number.NaN)).toBe(false);
    expect(deepEqual(0, -0)).toBe(true); // SameValueZero, as before
  });
});

describe('deepEqual — a built-in on one side only is never equal (13.5.0)', () => {
  // Every built-in branch requires BOTH sides to match, so a Date vs a keyless
  // object fell through to generic key comparison: neither has own enumerable
  // keys, so "no differing keys" was read as "equal". A malformed payload
  // sending {} for a date field was then silently swallowed AND honestly
  // reported as no change — correct reporting of a lost write.
  it('does not equate a Date with a keyless object', () => {
    expect(deepEqual(new Date(0), {} as never)).toBe(false);
    expect(deepEqual({} as never, new Date(0))).toBe(false);
  });

  it('does not equate other keyless built-ins across types', () => {
    expect(deepEqual(new Map() as never, {} as never)).toBe(false);
    expect(deepEqual(new Set() as never, {} as never)).toBe(false);
    expect(deepEqual(/a/ as never, {} as never)).toBe(false);
    expect(deepEqual(new Date(0) as never, new Map() as never)).toBe(false);
  });

  it('still equates matching plain objects', () => {
    expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(deepEqual({}, {})).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('deepEqual — built-in identity (13.5.0)', () => {
  it('distinguishes Errors by name and message', () => {
    // name/message are OWN but NON-enumerable, so key comparison saw nothing
    // and reported every pair of Errors as equal — a leaf holding an error
    // never reported a change, the opposite of what an error state is for.
    expect(deepEqual(new Error('a'), new Error('b'))).toBe(false);
    expect(deepEqual(new Error('a'), new Error('a'))).toBe(true);
    expect(deepEqual(new TypeError('a'), new Error('a'))).toBe(false);
    expect(deepEqual(new RangeError('x'), new RangeError('x'))).toBe(true);
  });

  it('distinguishes primitive wrapper objects by value', () => {
    expect(deepEqual(new Number(1) as never, new Number(2) as never)).toBe(
      false
    );
    expect(deepEqual(new Number(1) as never, new Number(1) as never)).toBe(
      true
    );
    expect(deepEqual(new String('a') as never, new String('b') as never)).toBe(
      false
    );
    expect(
      deepEqual(new Boolean(true) as never, new Boolean(false) as never)
    ).toBe(false);
    expect(deepEqual(new Number(NaN) as never, new Number(NaN) as never)).toBe(
      true
    );
  });

  it('does not throw on an object that merely inherits Date.prototype', () => {
    // `instanceof Date` is true but there is no [[DateValue]], so `.getTime()`
    // threw out of the equality function every leaf comparison runs through.
    const fake = Object.create(Date.prototype);
    expect(() => deepEqual(fake, new Date(0))).not.toThrow();
    expect(deepEqual(fake, new Date(0))).toBe(false);
    expect(() => deepEqual(new Date(0), fake)).not.toThrow();
  });

  it('still compares real built-ins correctly', () => {
    expect(deepEqual(new Date(5), new Date(5))).toBe(true);
    expect(deepEqual(new Date(5), new Date(6))).toBe(false);
    expect(deepEqual(/a/gi, /a/gi)).toBe(true);
    expect(deepEqual(/a/g, /a/i)).toBe(false);
    expect(deepEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true);
    expect(deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
    expect(deepEqual(new Set([1, 2]), new Set([1, 2]))).toBe(true);
    expect(deepEqual(new Set([1]), new Set([2]))).toBe(false);
  });

  it('still compares class instances structurally', () => {
    // Deliberately preserved: a matching tag falls through to key comparison,
    // which is the previous behaviour callers may rely on.
    class Pt {
      constructor(public x: number) {}
    }
    expect(deepEqual(new Pt(1), new Pt(1))).toBe(true);
    expect(deepEqual(new Pt(1), new Pt(2))).toBe(false);
  });

  it('rejects a built-in against a keyless plain object', () => {
    expect(deepEqual(new Date(0), {} as never)).toBe(false);
    expect(deepEqual(new Map() as never, {} as never)).toBe(false);
    expect(deepEqual(new Error('x') as never, {} as never)).toBe(false);
  });
});

describe('deepEqual — built-in SUBCLASSES carrying state (audit regression)', () => {
  class ApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
      this.name = 'ApiError';
    }
  }
  class Money extends Number {
    constructor(v: number, public currency: string) {
      super(v);
    }
  }

  it('an error subclass differing only in its own state is NOT equal', () => {
    // The ordinary shape of an HTTP error. A terminal `name`/`message` check
    // dropped the write: the leaf kept 404, updateAndReport returned [], and
    // nothing re-rendered.
    expect(
      deepEqual(
        new ApiError('Request failed', 404) as never,
        new ApiError('Request failed', 500) as never
      )
    ).toBe(false);
    expect(
      deepEqual(
        new ApiError('Request failed', 404) as never,
        new ApiError('Request failed', 404) as never
      )
    ).toBe(true);
  });

  it('a wrapper subclass differing only in its own state is NOT equal', () => {
    expect(
      deepEqual(new Money(5, 'USD') as never, new Money(5, 'EUR') as never)
    ).toBe(false);
    expect(
      deepEqual(new Money(5, 'USD') as never, new Money(5, 'USD') as never)
    ).toBe(true);
  });

  it('still separates plain errors, and value still gates the wrapper', () => {
    expect(deepEqual(new Error('a'), new Error('b'))).toBe(false);
    expect(
      deepEqual(new Money(5, 'USD') as never, new Money(6, 'USD') as never)
    ).toBe(false);
  });
});
