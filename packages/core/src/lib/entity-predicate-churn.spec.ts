import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';

/**
 * ST2026 — the inline-predicate trap.
 *
 * `where`/`find` memoise per predicate IDENTITY, so the natural template form
 *
 *     @for (row of tree.$.rows.where(r => !r.done)(); track row.id) { … }
 *
 * allocates a new arrow every change-detection cycle, misses the cache every
 * time, and re-filters the collection. Measured over 1,000 entities: 0.27 ms
 * hoisted against 20.54 ms inline — 75x.
 *
 * It needed a diagnostic precisely because nothing visibly breaks. The cache is
 * a `WeakMap`, so it is not a leak — 50,000 inline calls retain ~0 MB after
 * forced GC. The app is simply slow forever, with no symptom to chase.
 *
 * The risk in a heuristic like this is false positives, so the tests that matter
 * are the ones proving it stays quiet: a hoisted predicate, a small number of
 * distinct predicates, and different predicates that merely look similar.
 */
const mk = (n = 5) => {
  const tree = signalTree({
    rows: entityMap<{ id: number; v: number }, number>({
      selectId: (r) => r.id,
    }),
  });
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ id: i, v: i });
  tree.$.rows.setAll(rows);
  return tree;
};

const spyWarn = () =>
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
afterEach(() => vi.restoreAllMocks());

describe('it warns on churn', () => {
  it('fires once the same inline source has been seen enough times', () => {
    const warn = spyWarn();
    const tree = mk();

    for (let i = 0; i < 30; i++) void tree.$.rows.where((r) => r.v > 1);

    const text = warn.mock.calls.flat().join(' ');
    expect(text).toContain('ST2026');
    expect(text).toContain('where()');
  });

  it('warns only ONCE per predicate source, not on every call', () => {
    const warn = spyWarn();
    const tree = mk();

    for (let i = 0; i < 60; i++) void tree.$.rows.where((r) => r.v > 1);

    const hits = warn.mock.calls.filter((c) => String(c[0]).includes('ST2026'));
    expect(hits).toHaveLength(1);
  });

  it('covers find() as well as where()', () => {
    const warn = spyWarn();
    const tree = mk();

    for (let i = 0; i < 30; i++) void tree.$.rows.find((r) => r.v > 1);

    expect(warn.mock.calls.flat().join(' ')).toContain('find()');
  });
});

describe('it stays QUIET when it should — the false-positive tests', () => {
  it('a hoisted predicate never warns, however many times it is used', () => {
    const warn = spyWarn();
    const tree = mk();
    const notDone = (r: { v: number }) => r.v > 1;

    for (let i = 0; i < 500; i++) void tree.$.rows.where(notDone);

    expect(warn).not.toHaveBeenCalled();
  });

  it('a handful of distinct inline predicates does not warn', () => {
    // Below the threshold: building a few one-off predicates during setup is
    // normal and is not the per-frame churn this is looking for.
    const warn = spyWarn();
    const tree = mk();

    for (let i = 0; i < 5; i++) void tree.$.rows.where((r) => r.v > 1);

    expect(warn).not.toHaveBeenCalled();
  });

  it('genuinely DIFFERENT predicates do not accumulate against each other', () => {
    // Counted per SOURCE, so twenty different predicates are twenty sources of
    // one, not one source of twenty.
    const warn = spyWarn();
    const tree = mk();

    for (let i = 0; i < 20; i++) {
      const threshold = i;
      void tree.$.rows.where(
        new Function('r', `return r.v > ${threshold}`) as (r: {
          v: number;
        }) => boolean
      );
    }

    expect(warn).not.toHaveBeenCalled();
  });

  it('two collections keep separate counts', () => {
    const warn = spyWarn();
    const tree = signalTree({
      a: entityMap<{ id: number; v: number }, number>({
        selectId: (r) => r.id,
      }),
      b: entityMap<{ id: number; v: number }, number>({
        selectId: (r) => r.id,
      }),
    });
    tree.$.a.setAll([{ id: 1, v: 1 }]);
    tree.$.b.setAll([{ id: 1, v: 1 }]);

    for (let i = 0; i < 8; i++) void tree.$.a.where((r) => r.v > 1);
    for (let i = 0; i < 8; i++) void tree.$.b.where((r) => r.v > 1);

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('the behaviour it is warning about is still CORRECT', () => {
  it('an inline predicate returns the right answer, warning or not', () => {
    spyWarn();
    const tree = mk();

    for (let i = 0; i < 30; i++) {
      const result = tree.$.rows.where((r) => r.v > 2)();
      expect(result.map((r) => r.id)).toEqual([3, 4]);
    }
  });

  it('a hoisted predicate stays reactive', () => {
    const tree = mk();
    const big = (r: { v: number }) => r.v > 2;
    const result = tree.$.rows.where(big);
    expect(result()).toHaveLength(2);

    tree.$.rows.addOne({ id: 99, v: 99 });

    expect(result()).toHaveLength(3);
  });
});

/**
 * The case counting alone gets wrong.
 *
 * `v => v.value > threshold`, rebuilt whenever `threshold` changes, has
 * byte-identical source and a new identity every time — indistinguishable from
 * the trap by count. The first version of ST2026 warned after 12 of them
 * however long they took, so any long session accused this shape, and the
 * advice it gave ("hoist it") was wrong for it: the closure really does differ.
 *
 * Rate separates them. Change detection makes tens of identities a second;
 * a user changing a filter makes one per interaction.
 */
describe('ST2026: rate, not raw count', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let now = 0;
  const msg = () => warn.mock.calls.map((c) => String(c[0])).join('\n');

  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  function collection() {
    const tree = signalTree({
      rows: entityMap<Row, number>({ selectId: (r) => r.id }),
    });
    tree.$.rows.setAll([{ id: 1, value: 5 }]);
    return tree;
  }

  it('a predicate rebuilt slowly NEVER warns, however long the session runs', () => {
    const tree = collection();
    // 500 rebuilds, one every 5 seconds — over 40 minutes of real use. The
    // count-based version warned at the 12th, roughly one minute in.
    for (let threshold = 0; threshold < 500; threshold++) {
      now += 5000;
      tree.$.rows.where((r: Row) => r.value > threshold)();
    }
    expect(msg()).not.toContain('ST2026');
  });

  it('the same total count at frame rate DOES warn', () => {
    const tree = collection();
    // 20 identities at 16ms apart — one animation frame each.
    for (let i = 0; i < 20; i++) {
      now += 16;
      tree.$.rows.where((r: Row) => r.value > i)();
    }
    expect(msg()).toContain('ST2026');
    expect(msg()).toContain('/second');
  });

  it('a burst that stops does not accuse the next slow rebuild', () => {
    const tree = collection();
    // A few fast calls — startup, say — then normal use. The window resets.
    for (let i = 0; i < 5; i++) {
      now += 16;
      tree.$.rows.where((r: Row) => r.value > i)();
    }
    for (let i = 0; i < 30; i++) {
      now += 5000;
      tree.$.rows.where((r: Row) => r.value > i)();
    }
    expect(msg()).not.toContain('ST2026');
  });
});
