import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';
import { timeTravel } from '../enhancers/time-travel/time-travel';
import { serialization } from '../enhancers/serialization/serialization';

/**
 * RFC 0012 — `entityMap({ history: false })`.
 *
 * `entityMap`'s snapshot is `{ all: node.all() }`, an N-pointer array rebuilt
 * whenever the collection changes. Time travel records on every self-dirty
 * flush, so attaching `timeTravel()` to a tree holding a large collection made
 * every collection-mutating write O(collection width), permanently. MEASURED at
 * 50k rows over 50 recorded writes: 24.73MB retained, against 5.61MB with the
 * flag on.
 *
 * Before this, `transient: true` was the only opt-out and it opted out of
 * EVERYTHING — the grid either paid that cost or did not persist at all.
 *
 * The flag is time-travel-scoped ONLY. Everything below the first describe
 * exists to pin that boundary, because a flag that quietly removed a collection
 * from `serialization()` too would be a data-loss bug wearing an optimisation's
 * clothes.
 */
type Row = { id: number; value: number };
const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, value: i }));

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('history: false — excluded from time travel', () => {
  it('keeps the collection out of recorded history entries', async () => {
    const tree = signalTree({
      rows: entityMap<Row, number>({ selectId: (r) => r.id, history: false }),
      n: 0,
    }).with(timeTravel());
    tree.$.rows.setAll(rows(5));
    await flush();

    (tree as unknown as (v: object) => void)({ n: 1 });
    await flush();

    const entry = (
      tree as unknown as {
        __timeTravel: { getHistory(): Array<{ state: Record<string, unknown> }> };
      }
    ).__timeTravel.getHistory().at(-1);

    expect(entry?.state).toBeDefined();
    expect('rows' in (entry?.state ?? {})).toBe(false);
    expect(entry?.state['n']).toBe(1);
  });

  it('an INCLUDED collection is still captured — the flag is opt-in', async () => {
    const tree = signalTree({
      rows: entityMap<Row, number>({ selectId: (r) => r.id }),
      n: 0,
    }).with(timeTravel());
    tree.$.rows.setAll(rows(5));
    await flush();

    (tree as unknown as (v: object) => void)({ n: 1 });
    await flush();

    const entry = (
      tree as unknown as {
        __timeTravel: { getHistory(): Array<{ state: Record<string, unknown> }> };
      }
    ).__timeTravel.getHistory().at(-1);

    expect('rows' in (entry?.state ?? {})).toBe(true);
  });
});

describe('history: false — present everywhere ELSE', () => {
  it('still appears in tree()', () => {
    const tree = signalTree({
      rows: entityMap<Row, number>({ selectId: (r) => r.id, history: false }),
    });
    tree.$.rows.setAll(rows(3));

    const snap = tree() as { rows: { all: Row[] } };
    expect(snap.rows.all).toHaveLength(3);
  });

  it('still round-trips through serialization()', () => {
    const mk = (history: boolean) => {
      const t = signalTree({
        rows: entityMap<Row, number>({ selectId: (r) => r.id, history }),
      }).with(serialization());
      t.$.rows.setAll(rows(10));
      return t;
    };

    const withFlag = mk(false).serialize();
    const withoutFlag = mk(true).serialize();
    const stripTimestamp = (s: string) =>
      s.replace(/"timestamp":\s*\d+/g, '"timestamp":0');

    // The flag must not reach serialize() at all — payloads identical.
    expect(stripTimestamp(withFlag)).toBe(stripTimestamp(withoutFlag));
    expect(withFlag).not.toContain('history');
  });
});

describe('history: false — undo is PARTIAL, by design', () => {
  it('undo reverts other state but NOT the excluded collection', async () => {
    // The documented trade, pinned so it can never become an accidental
    // regression: "a partial restore is worse than a failed one" is a lesson
    // this codebase already paid for, so the partiality must be deliberate,
    // opt-in, and tested.
    const tree = signalTree({
      rows: entityMap<Row, number>({ selectId: (r) => r.id, history: false }),
      n: 0,
    }).with(timeTravel());
    tree.$.rows.setAll(rows(3));
    await flush();

    (tree as unknown as (v: object) => void)({ n: 1 });
    await flush();
    tree.$.rows.addOne({ id: 99, value: 99 });
    (tree as unknown as (v: object) => void)({ n: 2 });
    await flush();

    expect(tree.$.n()).toBe(2);
    expect(tree.$.rows.all()).toHaveLength(4);

    (tree as unknown as { undo(): void }).undo();

    expect(tree.$.n()).toBe(1); // reverted
    expect(tree.$.rows.all()).toHaveLength(4); // NOT reverted — the point
  });
});

/**
 * ST2029 — history retention from included collections.
 *
 * Every test here uses REAL APP ORDER: build the tree, attach the enhancer,
 * THEN let the data arrive. The first version of this diagnostic checked once
 * at enhancer attach, and passed a suite that populated the collection before
 * attaching — an order chosen to suit the implementation. In app order it never
 * fired at all, because at attach the collection is always empty.
 */
describe('ST2029 — history retention', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  const msg = () => warn.mock.calls.map((c) => String(c[0])).join('\n');

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* silence */
    });
  });
  afterEach(() => warn.mockRestore());

  /** Build, attach, THEN load — the order every app uses. */
  async function appOrder(
    config: Parameters<typeof entityMap<Row, number>>[0],
    width: number,
    writes: number
  ) {
    const tree = signalTree({
      rows: entityMap<Row, number>(config),
      n: 0,
    }).with(timeTravel());
    warn.mockClear();

    tree.$.rows.setAll(rows(width));
    await flush();
    for (let i = 1; i <= writes; i++) {
      (tree as unknown as (v: object) => void)({ n: i });
      await flush();
    }
    return tree;
  }

  it('fires when the rows arrive AFTER the enhancer is attached', async () => {
    // 20,000 x ~35 entries = ~700k retained pointers, past the 500k budget.
    await appOrder({ selectId: (r) => r.id }, 20_000, 34);

    expect(msg()).toContain('ST2029');
    expect(msg()).toContain('rows');
  });

  it('does NOT fire once the collection opts out', async () => {
    await appOrder({ selectId: (r) => r.id, history: false }, 20_000, 34);

    expect(msg()).not.toContain('ST2029');
  });

  it('does NOT fire for a big collection with a SHORT history', async () => {
    // Retention is entries x width. A row-count threshold judges this wrong.
    await appOrder({ selectId: (r) => r.id }, 20_000, 2);

    expect(msg()).not.toContain('ST2029');
  });

  it('does NOT fire for a small collection with a LONG history', async () => {
    // The other half of the same point.
    await appOrder({ selectId: (r) => r.id }, 50, 34);

    expect(msg()).not.toContain('ST2029');
  });
});
