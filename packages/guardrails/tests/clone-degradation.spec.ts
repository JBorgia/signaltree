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
