import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityMap } from './types';
import { signalTree } from './signal-tree';
import { timeTravel } from '../enhancers/time-travel/time-travel';
import { serialization } from '../enhancers/serialization/serialization';

/**
 * RFC 0012 — `entityMap({ recordHistory: false })`.
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

describe('recordHistory: false — excluded from time travel', () => {
  it('keeps the collection out of recorded history entries', async () => {
    const tree = signalTree({
      rows: entityMap<Row, number>({
        selectId: (r) => r.id,
        recordHistory: false,
      }),
      n: 0,
    }).with(timeTravel());
    tree.$.rows.setAll(rows(5));
    await flush();

    (tree as unknown as (v: object) => void)({ n: 1 });
    await flush();

    const entry = (
      tree as unknown as {
        __timeTravel: {
          getHistory(): Array<{ state: Record<string, unknown> }>;
        };
      }
    ).__timeTravel
      .getHistory()
      .at(-1);

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
        __timeTravel: {
          getHistory(): Array<{ state: Record<string, unknown> }>;
        };
      }
    ).__timeTravel
      .getHistory()
      .at(-1);

    expect('rows' in (entry?.state ?? {})).toBe(true);
  });
});

describe('recordHistory: false — present everywhere ELSE', () => {
  it('still appears in tree()', () => {
    const tree = signalTree({
      rows: entityMap<Row, number>({
        selectId: (r) => r.id,
        recordHistory: false,
      }),
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

describe('recordHistory: false — undo is PARTIAL, by design', () => {
  it('undo reverts other state but NOT the excluded collection', async () => {
    // The documented trade, pinned so it can never become an accidental
    // regression: "a partial restore is worse than a failed one" is a lesson
    // this codebase already paid for, so the partiality must be deliberate,
    // opt-in, and tested.
    const tree = signalTree({
      rows: entityMap<Row, number>({
        selectId: (r) => r.id,
        recordHistory: false,
      }),
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
    await appOrder({ selectId: (r) => r.id, recordHistory: false }, 20_000, 34);

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

describe('entityMap({ recordHistory: false }) — no PHANTOM undo steps (15.0.0)', () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // Before the fix: five excluded-only writes produced FIVE entries with
  // canUndo() true, and the undo changed nothing a user could see. A dead
  // Ctrl+Z is worse than no undo — it spends a step the user believes they had.
  //
  // Cause: structural sharing makes a new root per write, and pruning copies
  // every node on the path down to the excluded key, so two snapshots differing
  // only inside excluded state came back structurally identical but
  // referentially distinct. `last.state === entry.state` missed them.
  it('excluded-only writes create NO entries', async () => {
    const tree = signalTree({
      rows: entityMap<{ id: string; n: number }>({ recordHistory: false }),
      draft: '',
    }).with(timeTravel());
    tree.$.rows.addMany([{ id: 'a', n: 0 }]);
    await tick();

    const base = tree.getHistory().length;
    for (let i = 1; i <= 5; i++) {
      tree.$.rows.updateOne('a', { n: i });
      await tick();
    }

    expect(tree.getHistory().length - base).toBe(0);
    expect(tree.canUndo()).toBe(false);
  });

  it('an excluded write does not shift where undo lands', async () => {
    const tree = signalTree({
      rows: entityMap<{ id: string; n: number }>({ recordHistory: false }),
      draft: '',
    }).with(timeTravel());
    tree.$.rows.addMany([{ id: 'a', n: 0 }]);
    await tick();

    tree.$.draft.set('hello');
    await tick();
    tree.$.rows.updateOne('a', { n: 9 }); // excluded — must not become a step
    await tick();
    tree.$.draft.set('world');
    await tick();

    tree.undo();
    expect(tree.$.draft()).toBe('hello');
    // ...and undo must not roll the excluded collection back either.
    expect(tree.$.rows.all()[0].n).toBe(9);
  });

  // The case a SHALLOW reference compare would miss: pruning copies the
  // intermediate `box` node too, so the root's `box` reference differs even
  // though nothing observable changed.
  it('works when the excluded collection is NESTED', async () => {
    const tree = signalTree({
      box: {
        rows: entityMap<{ id: string; n: number }>({ recordHistory: false }),
        label: 'x',
      },
    }).with(timeTravel());
    tree.$.box.rows.addMany([{ id: 'a', n: 0 }]);
    await tick();

    const base = tree.getHistory().length;
    for (let i = 1; i <= 4; i++) {
      tree.$.box.rows.updateOne('a', { n: i });
      await tick();
    }
    expect(tree.getHistory().length - base).toBe(0);

    // A real sibling write still records.
    tree.$.box.label.set('y');
    await tick();
    expect(tree.getHistory().length - base).toBe(1);
  });

  it('does not suppress ordinary writes when nothing is excluded', async () => {
    const tree = signalTree({ n: 0 }).with(timeTravel());
    await tick();
    const base = tree.getHistory().length;
    tree.$.n.set(1);
    await tick();
    tree.$.n.set(2);
    await tick();

    expect(tree.getHistory().length - base).toBe(2);
    tree.undo();
    expect(tree.$.n()).toBe(1);
  });
});
