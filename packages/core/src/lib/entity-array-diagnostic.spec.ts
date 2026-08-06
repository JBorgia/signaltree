import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { compared } from './markers/compared';
import { signalTree } from './signal-tree';

/**
 * ST2018 — steer collections to entityMap.
 *
 * The measured stake: 1000 updates to a 50k collection cost 1.63ms via
 * entityMap and 49.80ms as a plain array leaf, which is parity with the
 * immutable store SignalTree otherwise beats 28x. The warning has to be
 * conservative — a false positive on every small array trains people to ignore
 * it — so most of this suite is about staying quiet.
 */
describe('ST2018 — entity array stored as a plain leaf', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const entities = (n: number, idKey = 'id') =>
    Array.from({ length: n }, (_, i) => ({ [idKey]: i, value: i * 2 }));

  const messages = () => warn.mock.calls.map((c) => String(c[0]));
  const fired = () => messages().some((m) => m.includes('ST2018'));

  it('warns only ONCE per key+identity, however many trees are built', () => {
    // A tree is commonly constructed per component instance; 500 rows must not
    // print 500 identical warnings.
    for (let i = 0; i < 50; i++) signalTree({ dedupeRows: entities(100) });
    expect(messages().filter((m) => m.includes('ST2018'))).toHaveLength(1);
  });

  it('warns for a large array of objects with a stable id', () => {
    signalTree({ rows: entities(100) });
    expect(fired()).toBe(true);
    const msg = messages().find((m) => m.includes('ST2018')) as string;
    expect(msg).toContain('entityMap');
    expect(msg).toContain('rows');
    expect(msg).toContain('100');
  });

  it.each(['_id', 'uuid', 'key'])('recognises "%s" as an identity', (k) => {
    signalTree({ rows: entities(100, k) });
    expect(fired()).toBe(true);
    expect(messages().find((m) => m.includes('ST2018'))).toContain(k);
  });

  it('stays quiet below the length threshold', () => {
    signalTree({ rows: entities(31) });
    expect(fired()).toBe(false);
  });

  it('stays quiet for arrays of primitives', () => {
    signalTree({ nums: Array.from({ length: 500 }, (_, i) => i) });
    signalTree({ strs: Array.from({ length: 500 }, (_, i) => `s${i}`) });
    expect(fired()).toBe(false);
  });

  it('stays quiet when objects carry no identity key', () => {
    signalTree({
      points: Array.from({ length: 500 }, (_, i) => ({ x: i, y: i })),
    });
    expect(fired()).toBe(false);
  });

  it('stays quiet when ids are not unique — not a stable identity', () => {
    signalTree({
      rows: Array.from({ length: 500 }, () => ({ id: 1, value: 0 })),
    });
    expect(fired()).toBe(false);
  });

  it('stays quiet when the id is an object rather than a primitive', () => {
    signalTree({
      rows: Array.from({ length: 500 }, (_, i) => ({ id: { n: i } })),
    });
    expect(fired()).toBe(false);
  });

  it('stays quiet for nested arrays', () => {
    signalTree({ grid: Array.from({ length: 500 }, (_, i) => [i, i]) });
    expect(fired()).toBe(false);
  });

  it('stays quiet for an array of nulls', () => {
    signalTree({ rows: Array.from({ length: 500 }, () => null) });
    expect(fired()).toBe(false);
  });

  it('can be silenced by taking explicit control with compared()', () => {
    signalTree({
      rows: compared(entities(500), (a, b) => a.length === b.length),
    });
    expect(fired()).toBe(false);
  });

  it('does not fire for entityMap itself', async () => {
    const { entityMap } = await import('./types');
    const tree = signalTree({
      rows: entityMap<{ id: number; value: number }, number>({
        selectId: (e) => e.id,
      }),
    });
    tree.$.rows.setAll(entities(500) as { id: number; value: number }[]);
    expect(fired()).toBe(false);
  });

  it('scans a bounded sample, so a huge array costs the same as a small one', () => {
    // Distinct key: the ST2018 dedupe set is module-level and persists across
    // tests, so reusing "rows" here would silently assert nothing.
    const huge = entities(200_000);
    const t0 = performance.now();
    signalTree({ hugeRows: huge });
    const elapsed = performance.now() - t0;
    expect(fired()).toBe(true);
    // Bounded sample: this must not be a 200k-element walk.
    expect(elapsed).toBeLessThan(150);
  });
});
