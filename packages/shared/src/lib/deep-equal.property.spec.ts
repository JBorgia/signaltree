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
    expect(deepEqual([1, 2], { 0: 1, 1: 2 } as unknown as number[])).toBe(false);
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

describe('untrusted-key ingress in shared helpers (13.5.0 spike)', () => {
  const scrub = () => {
    for (const k of ['zzP', 'evil'])
      delete (Object.prototype as unknown as Record<string, unknown>)[k];
  };
  beforeEach(scrub);
  afterEach(scrub);

  it('mergeDeep does not let a payload set the target prototype', async () => {
    const { mergeDeep } = await import('./merge-deep');
    const target: Record<string, unknown> = { a: 1 };

    // Live path: localStorage -> JSON.parse -> ng-forms hydrateInitialValues.
    mergeDeep(target, JSON.parse('{"__proto__":{"zzP":"pwned"},"a":2}'));

    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    expect((target as Record<string, unknown>)['zzP']).toBeUndefined();
    expect(({} as Record<string, unknown>)['zzP']).toBeUndefined();
    expect(target['a']).toBe(2); // the legitimate key still merges
  });

  it('getChanges does not return an object with an attacker prototype', async () => {
    const { getChanges } = await import('./get-changes');

    const changes = getChanges(
      JSON.parse('{"a":1}'),
      JSON.parse('{"a":2,"__proto__":{"evil":1}}')
    ) as Record<string, unknown>;

    // Previously: prototype replaced while Object.keys(changes) read empty —
    // invisible to every caller that inspects the result.
    expect(Object.getPrototypeOf(changes)).toBe(Object.prototype);
    expect(changes['evil']).toBeUndefined();
    expect(changes['a']).toBe(2);
  });

  it('getChanges ignores inherited keys', async () => {
    const { getChanges } = await import('./get-changes');
    const proto = { inherited: 'x' };
    const next = Object.create(proto);
    next.own = 1;

    expect(Object.keys(getChanges({} as never, next))).toEqual(['own']);
  });
});
