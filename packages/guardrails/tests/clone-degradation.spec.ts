import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { guardrails } from '../src/lib/guardrails';

import type { ISignalTree } from '@signaltree/core';
import type { GuardrailsAPI } from '../src/lib/types';

/**
 * ST2030 — what happens when guardrails cannot snapshot state.
 *
 * `structuredClone` THROWS on a function or class instance, so one such field
 * anywhere in state degrades the whole snapshot. What guardrails does next used
 * to be a JSON round-trip, and that is worse than not cloning: JSON turns a
 * `Date` into a string and a `Set` into `{}`, so `previousState` can never
 * `deepEqual` the live state again and every poll reports a change — forever,
 * out of nothing.
 *
 * A diagnostic that fabricates the problem it exists to find is the one failure
 * mode it cannot have. These tests pin that it does not.
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
 * A tree whose `()` returns an IMMUTABLE, structurally shared snapshot — the
 * contract real `signalTree` provides, and the reason a retained reference is a
 * valid "before" even with no clone.
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

describe('ST2030 — state that cannot be cloned', () => {
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

  it('reports the degrade once, not once per poll', async () => {
    // A callback in state is the ordinary way this happens.
    const enhanced = attach({
      when: new Date(0),
      onDone: () => undefined,
      count: 0,
    });

    await poll(4);

    const st2030 = warn.mock.calls.filter((c) => String(c[0]).includes('ST2030'));
    expect(st2030.length).toBe(1);
    expect(String(st2030[0][0])).toContain('MUTATED IN PLACE');

    enhanced.destroy();
  });

  it('does NOT invent a change on every poll when state holds a Date', async () => {
    // The regression this replaces. A JSON-cloned `previousState` has
    // `when` as a STRING, which never deep-equals the live `Date`, so each
    // poll saw a change and logged a hot path for a tree nobody touched.
    const enhanced = attach({
      when: new Date(0),
      onDone: () => undefined,
      count: 0,
    });

    await poll(5);

    const api = enhanced.__guardrails;
    expect(api).toBeDefined();
    const report = api?.getReport();
    expect(report?.stats.updateCount ?? 0).toBe(0);
    expect(report?.stats.hotPathCount ?? 0).toBe(0);

    enhanced.destroy();
  });

  it('still detects a REAL change after the degrade', async () => {
    // Degrading must cost only in-place-mutation detection, not detection.
    const enhanced = attach({
      when: new Date(0),
      onDone: () => undefined,
      count: 0,
    });

    await poll(2);
    enhanced({ count: 1 });
    await poll(2);

    const report = enhanced.__guardrails?.getReport();
    expect(report?.stats.updateCount ?? 0).toBeGreaterThan(0);

    enhanced.destroy();
  });

  it('cloneable state is unaffected and stays quiet', async () => {
    const enhanced = attach({ when: new Date(0), count: 0 });

    await poll(4);

    expect(
      warn.mock.calls.filter((c) => String(c[0]).includes('ST2030')).length
    ).toBe(0);
    expect(enhanced.__guardrails?.getReport().stats.updateCount ?? 0).toBe(0);

    enhanced.destroy();
  });
});
