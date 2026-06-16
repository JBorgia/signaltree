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
