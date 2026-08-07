import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { guardrails } from '../src/lib/guardrails';

import type { ISignalTree } from '@signaltree/core';
import type { GuardrailsAPI } from '../src/lib/types';

/**
 * Change detection: the reference oracle, and what it cannot see.
 *
 * `tree()` is a memoised, structurally shared snapshot — the identical object
 * when nothing changed, a new one when something did. So reference identity
 * answers "did anything change" exactly, in O(1), and guardrails no longer
 * clones state to find out.
 *
 * Two things that must stay true, and one that must stay false:
 *
 *  - an idle poll must do no work (it used to clone + deep-compare everything);
 *  - a real change must still be detected and reported;
 *  - an IN-PLACE container mutation must still be caught, because reference
 *    identity is blind to it by construction.
 *
 * ST2030 now reports only what it can actually mean: a single CONTAINER that
 * could not be copied, so its contents are unwatched. It used to mean the whole
 * state snapshot had degraded to a JSON round-trip — which turned a `Date` into
 * a string, so `previousState` could never deep-equal the live state again and
 * every poll reported a change, forever, out of nothing.
 */

const POLLING_INTERVAL_MS = 50;
const TEST_CONFIG_BASE = {
  changeDetection: { disablePathNotifier: true },
} as const;

type State = Record<string, unknown>;
type MockTree<T extends State> = {
  (): T;
  (value: Partial<T>): T;
  state: T;
  $: T;
  destroy: () => void;
};

/**
 * A tree honouring the contract real `signalTree` provides: `()` returns the
 * SAME object until something changes, and a new one when it does.
 */
function createMockTree<T extends State>(initial: T): MockTree<T> {
  let state: T = { ...initial };
  const tree = ((value?: Partial<T>) => {
    if (value === undefined) return state;
    state = { ...state, ...value };
    return state;
  }) as MockTree<T>;
  Object.defineProperties(tree, {
    state: { get: () => state, enumerable: false },
    $: { get: () => state, enumerable: false },
  });
  tree.destroy = () => undefined;
  return tree;
}

async function poll(times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    vi.advanceTimersByTime(POLLING_INTERVAL_MS);
    await Promise.resolve();
  }
}

describe('guardrails change detection', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    process.env['NODE_ENV'] = 'development';
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
  });

  function attach<T extends State>(initial: T) {
    const tree = createMockTree(initial);
    const enhanced = guardrails(TEST_CONFIG_BASE)(
      tree as unknown as ISignalTree<T>
    ) as unknown as MockTree<T> & { __guardrails?: GuardrailsAPI };
    return enhanced;
  }

  describe('the reference oracle', () => {
    it('an idle poll reports nothing, however long it idles', async () => {
      const enhanced = attach({ when: new Date(0), count: 0, rows: [1, 2, 3] });

      await poll(20);

      const stats = enhanced.__guardrails?.getReport().stats;
      expect(stats?.updateCount ?? 0).toBe(0);
      expect(stats?.hotPathCount ?? 0).toBe(0);
      enhanced.destroy();
    });

    it('a Date in state does not fabricate a change on every poll', async () => {
      // The regression this design replaces. A JSON-cloned `previousState` had
      // `when` as a STRING, which never deep-equals the live `Date`, so every
      // poll logged a change and a hot path for a tree nobody touched.
      const enhanced = attach({
        when: new Date(0),
        onDone: () => undefined,
        count: 0,
      });

      await poll(10);

      expect(enhanced.__guardrails?.getReport().stats.updateCount ?? 0).toBe(0);
      enhanced.destroy();
    });

    it('a real change is still detected', async () => {
      const enhanced = attach({ when: new Date(0), count: 0 });

      await poll(2);
      enhanced({ count: 1 });
      await poll(2);

      expect(
        enhanced.__guardrails?.getReport().stats.updateCount ?? 0
      ).toBeGreaterThan(0);
      enhanced.destroy();
    });
  });

  describe('in-place mutation — the blind spot, covered', () => {
    it('catches a push into an array leaf, which notifies nothing', async () => {
      const rows: number[] = [1, 2, 3];
      const enhanced = attach({ rows, count: 0 });

      await poll(2);
      rows.push(4); // no signal fires; the snapshot is the SAME object
      await poll(2);

      const report = enhanced.__guardrails?.getReport();
      expect(report?.stats.updateCount ?? 0).toBeGreaterThan(0);
      enhanced.destroy();
    });

    it('catches an in-place edit that leaves the length alone', async () => {
      const rows = [{ id: 1, name: 'a' }];
      const enhanced = attach({ rows, count: 0 });

      await poll(2);
      rows[0].name = 'b'; // same length — only a contents copy can see this
      await poll(2);

      expect(
        enhanced.__guardrails?.getReport().stats.updateCount ?? 0
      ).toBeGreaterThan(0);
      enhanced.destroy();
    });

    it('catches an add to a Set leaf', async () => {
      const tags = new Set(['a']);
      const enhanced = attach({ tags, count: 0 });

      await poll(2);
      tags.add('b');
      await poll(2);

      expect(
        enhanced.__guardrails?.getReport().stats.updateCount ?? 0
      ).toBeGreaterThan(0);
      enhanced.destroy();
    });
  });

  describe('ST2030 — a container that cannot be copied', () => {
    it('reports once, and only for the container that failed', async () => {
      // A function INSIDE the array. The array's shape stays watched; only its
      // contents go unwatched. Nothing else in state is affected — which is the
      // difference from the whole-snapshot degrade this replaces.
      const enhanced = attach({
        handlers: [() => undefined],
        count: 0,
      });

      await poll(4);

      const hits = warn.mock.calls.filter((c) =>
        String(c[0]).includes('ST2030')
      );
      expect(hits.length).toBe(1);
      expect(String(hits[0][0])).toContain('SHAPE is still watched');
      enhanced.destroy();
    });

    it('still catches a shape change in the container it could not copy', async () => {
      const handlers: Array<() => void> = [() => undefined];
      const enhanced = attach({ handlers, count: 0 });

      await poll(2);
      handlers.push(() => undefined); // length changed — an O(1) check
      await poll(2);

      expect(
        enhanced.__guardrails?.getReport().stats.updateCount ?? 0
      ).toBeGreaterThan(0);
      enhanced.destroy();
    });

    it('cloneable state stays quiet', async () => {
      const enhanced = attach({ when: new Date(0), rows: [1, 2], count: 0 });

      await poll(4);

      expect(
        warn.mock.calls.filter((c) => String(c[0]).includes('ST2030')).length
      ).toBe(0);
      enhanced.destroy();
    });
  });
});

/**
 * The contents budget is an aggregate, not a per-container cap.
 *
 * A per-container cap was the first version and it counts the wrong noun: many
 * mid-sized containers each pass it, and the poll cost is their SUM. What is
 * bounded is total elements deep-compared per poll.
 */
describe('guardrails: the contents-watch budget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    process.env['NODE_ENV'] = 'development';
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
  });

  function attach<T extends State>(initial: T) {
    const tree = createMockTree(initial);
    return guardrails(TEST_CONFIG_BASE)(
      tree as unknown as ISignalTree<T>
    ) as unknown as MockTree<T> & { __guardrails?: GuardrailsAPI };
  }

  it('spends the budget across containers, not per container', async () => {
    // Twelve containers of 800 = 9,600 elements. A per-container cap of 1,000
    // would copy every one of them and deep-compare 9,600 elements per poll.
    const state: State = {};
    for (let c = 0; c < 12; c++) {
      state[`c${c}`] = Array.from({ length: 800 }, (_, i) => ({ i }));
    }
    const enhanced = attach(state);
    await poll(2);

    // The FIRST containers are within budget, so a contents edit there is seen.
    (state['c0'] as Array<{ i: number }>)[0].i = -1;
    await poll(2);
    expect(
      enhanced.__guardrails?.getReport().stats.updateCount ?? 0
    ).toBeGreaterThan(0);
    enhanced.destroy();
  });

  it('past the budget, CONTENTS go unwatched — the documented tradeoff', async () => {
    // The observable consequence of budgeting in aggregate. Under a
    // per-container cap of 1,000 every one of these would be copied and this
    // edit WOULD be seen — at the price of 9,600 element comparisons per poll.
    const state: State = {};
    for (let c = 0; c < 12; c++) {
      state[`c${c}`] = Array.from({ length: 800 }, (_, i) => ({ i }));
    }
    const enhanced = attach(state);
    await poll(2);

    (state['c11'] as Array<{ i: number }>)[0].i = -1; // contents, length same
    await poll(2);
    expect(enhanced.__guardrails?.getReport().stats.updateCount ?? 0).toBe(0);
    enhanced.destroy();
  });

  it('a container past the budget keeps its O(1) shape check', async () => {
    const state: State = {};
    for (let c = 0; c < 12; c++) {
      state[`c${c}`] = Array.from({ length: 800 }, (_, i) => ({ i }));
    }
    const enhanced = attach(state);
    await poll(2);

    // c11 is well past the 5,000-element budget, so its contents are unwatched
    // — but pushing to it changes its length, which is always checked.
    (state['c11'] as Array<{ i: number }>).push({ i: 999 });
    await poll(2);
    expect(
      enhanced.__guardrails?.getReport().stats.updateCount ?? 0
    ).toBeGreaterThan(0);
    enhanced.destroy();
  });
});

/**
 * `strictImmutability` — catch the mutation where it happens, not on a poll.
 *
 * Everything else in this file detects an in-place mutation up to one poll
 * interval later and infers its path by diffing. Freezing turns it into a
 * `TypeError` on the mutating line with a real stack. Opt-in, because it makes
 * dev behave differently from production — the same reason NgRx ships
 * `strictStateImmutability` opt-in.
 */
describe('guardrails: strictImmutability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    process.env['NODE_ENV'] = 'development';
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
  });

  function attachStrict<T extends State>(initial: T) {
    const tree = createMockTree(initial);
    return guardrails({
      changeDetection: { disablePathNotifier: true, strictImmutability: true },
    })(tree as unknown as ISignalTree<T>) as unknown as MockTree<T> & {
      __guardrails?: GuardrailsAPI;
    };
  }

  it('an in-place push THROWS at the mutating line', () => {
    const rows: number[] = [1, 2, 3];
    const enhanced = attachStrict({ rows, count: 0 });

    expect(() => rows.push(4)).toThrow(TypeError);
    enhanced.destroy();
  });

  it('an in-place field edit THROWS too — the case a shape check misses', () => {
    const rows = [{ id: 1, name: 'a' }];
    const enhanced = attachStrict({ rows, count: 0 });

    expect(() => {
      rows[0].name = 'b';
    }).toThrow(TypeError);
    enhanced.destroy();
  });

  it('ordinary writes through the tree still work', () => {
    // Freezing the SNAPSHOT must not freeze the tree. A write replaces values;
    // it does not mutate the frozen ones.
    const enhanced = attachStrict({ rows: [1, 2], count: 0 });

    expect(() => enhanced({ count: 1 })).not.toThrow();
    expect(enhanced().count).toBe(1);
    enhanced.destroy();
  });

  it('is OFF by default — no throw, detection by polling instead', async () => {
    const rows: number[] = [1, 2, 3];
    const tree = createMockTree({ rows, count: 0 });
    const enhanced = guardrails(TEST_CONFIG_BASE)(
      tree as unknown as ISignalTree<{ rows: number[]; count: number }>
    ) as unknown as MockTree<{ rows: number[]; count: number }> & {
      __guardrails?: GuardrailsAPI;
    };

    expect(() => rows.push(4)).not.toThrow();
    await poll(2);
    expect(
      enhanced.__guardrails?.getReport().stats.updateCount ?? 0
    ).toBeGreaterThan(0);
    enhanced.destroy();
  });
});
