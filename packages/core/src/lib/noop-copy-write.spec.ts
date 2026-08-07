import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signalTree } from './signal-tree';

/**
 * ST2027 — a write that changed nothing, and not the reference kind.
 *
 * ST2003 catches `set(theSameReference)`. This is its expensive twin: a NEW
 * object that deep-equals what is already there, which is the ordinary shape of
 * a re-fetched payload. `deepEqual` cannot short-circuit on it, so it walks the
 * whole structure to conclude nothing changed — ~2.8ms on a 50k array, to do
 * nothing — and then nothing notifies.
 *
 * The reason it earns a code: it is invisible by construction. No error, no
 * notification, no state change; the only symptom is that the app is slow. It
 * corrupted this repo's own benchmarks TWICE before anyone noticed, which is
 * the strongest available evidence that it is not spottable unaided.
 */
describe('ST2027 — a deep-equal copy write is reported', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  const messages = () => warn.mock.calls.map((c) => String(c[0]));
  const fired = () => messages().filter((m) => m.includes('ST2027')).length;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });
  afterEach(() => warn.mockRestore());

  const bigArray = () =>
    Array.from({ length: 50 }, (_, i) => ({ id: i, value: i }));

  it('fires when a large value is re-set as a deep-equal copy', () => {
    const tree = signalTree({ rows: bigArray() });
    void tree.$;
    warn.mockClear();

    // A different array, structurally identical — the re-fetch shape.
    tree.$.rows.set(bigArray());

    expect(fired()).toBe(1);
    expect(messages().join('\n')).toContain('changed NOTHING');
  });

  it('does NOT fire when the write actually changes something', () => {
    const tree = signalTree({ rows: bigArray() });
    void tree.$;
    warn.mockClear();

    const changed = bigArray();
    changed[10] = { id: 10, value: -1 };
    tree.$.rows.set(changed);

    expect(fired()).toBe(0);
  });

  it('does NOT fire for the reference case — ST2027 is for COPIES', () => {
    const tree = signalTree({ refCase: bigArray() });
    void tree.$;
    warn.mockClear();

    tree.$.refCase.set(tree.$.refCase());

    // The `a !== b` guard keeps ST2027 out of the reference case.
    expect(fired()).toBe(0);
  });

  it('KNOWN GAP: a direct .set() of the same reference reports nothing', () => {
    // ST2003 covers the reference case, but it lives in `recursiveUpdate` and a
    // direct `tree.$.x.set(v)` never goes there — it writes to the Angular
    // signal directly. So the reference no-op is diagnosed for merge writes and
    // silent for direct ones. ST2027 does not have this gap because it hooks
    // the comparator, which every write funnels through. Pinned so the
    // asymmetry is a known state rather than a surprise.
    const tree = signalTree({ gapCase: bigArray() });
    void tree.$;
    warn.mockClear();

    tree.$.gapCase.set(tree.$.gapCase());
    expect(messages().join('\n')).not.toContain('ST2003');

    // The same no-op through a MERGE write is reported.
    warn.mockClear();
    const current = tree.$.gapCase();
    (tree as unknown as (v: object) => void)({ gapCase: current });
    expect(messages().join('\n')).toContain('ST2003');
  });

  it('does NOT fire for a small value — the walk costs nothing there', () => {
    const tree = signalTree({
      cfg: { a: 1, b: 2, c: 3 } as Record<string, number>,
    });
    void tree.$;
    warn.mockClear();

    (tree as unknown as (v: object) => void)({ cfg: { a: 1, b: 2, c: 3 } });

    expect(fired()).toBe(0);
  });

  it('deduplicates per path, so a loop cannot flood the console', () => {
    // A distinct path: the dedupe Set is module-global by design (a warning
    // that repeats every frame is worse than one that repeats never), so a
    // test reusing `rows` would be silenced by the first test in this file.
    const tree = signalTree({ dedupeCase: bigArray() });
    void tree.$;
    warn.mockClear();

    for (let i = 0; i < 5; i++) tree.$.dedupeCase.set(bigArray());

    expect(fired()).toBe(1);
  });
});
