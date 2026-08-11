import { vi } from 'vitest';

import { batching } from '../enhancers/batching/batching';
import { devTools } from '../enhancers/devtools/devtools';
import { timeTravel } from '../enhancers/time-travel/time-travel';
import { signalTree } from '../index';

/**
 * Enhancers that build a NEW tree object must carry the base tree's methods
 * across by property DESCRIPTOR, not `Object.assign`.
 *
 * `Object.assign` copies only ENUMERABLE own properties, and every tree method
 * — `updateAndReport`, `onPathChange`, `registerCleanup` — is
 * defined `enumerable: false`. They were silently dropped, so the builder
 * wrapping the enhanced tree found nothing to forward to and returned an empty
 * result. `updateAndReport({count:1})` on a `.with(timeTravel())` tree returned
 * `[]` and never wrote — a dropped write that looked exactly like "nothing
 * changed".
 *
 * This is data loss, it was silent, and it predates the release. These tests
 * fail against every version before the fix.
 */
const ENHANCERS: Array<[string, () => (t: never) => never]> = [
  ['timeTravel', () => timeTravel() as never],
  ['batching', () => batching() as never],
  ['devTools', () => devTools({ name: 'x' }) as never],
];

describe.each(ENHANCERS)('%s — writes survive the enhancer', (_name, make) => {
  it('updateAndReport writes AND reports', () => {
    const tree = signalTree({ count: 0, other: 'x' }).with(make() as never);

    const changed = (
      tree as unknown as { updateAndReport: (u: unknown) => string[] }
    ).updateAndReport({ count: 5 });

    expect(tree.$.count()).toBe(5);
    expect(changed).toEqual(['count']);
  });

  // `batchUpdate` and its builder forward were REMOVED in 14.1.0 — a duplicate of
  // the tree callable. The replacement is the callable itself, which the builder
  // already exposes, so this asserts the write path that survives.
  it('the tree callable writes through the builder (batchUpdate is gone)', () => {
    const tree = signalTree({ count: 0 }).with(make() as never);

    expect(
      (tree as unknown as { batchUpdate?: unknown }).batchUpdate
    ).toBeUndefined();

    (tree as unknown as (p: { count: number }) => void)({ count: 3 });
    expect(tree.$.count()).toBe(3);
  });

  it('destroy() still runs registered cleanups and flips destroyed()', () => {
    // The suite passed with `destroy`/`registerCleanup`/`destroyed` dropped from
    // the copy — and that is NOT harmless: with `destroy` missing the builder
    // falls to its else-branch and installs a NO-OP, so timeTravel history,
    // batching timers and persistence subscriptions all leak, silently.
    const tree = signalTree({ count: 0 }).with(make() as never);
    let ran = 0;
    (
      tree as unknown as { registerCleanup: (f: () => void) => void }
    ).registerCleanup(() => ran++);

    (tree as unknown as { destroy: () => void }).destroy();

    expect(ran).toBe(1);
    expect((tree as unknown as { destroyed: () => boolean }).destroyed()).toBe(
      true
    );
  });

  it('keeps $ identity, so leaf refs held across the enhancer still work', () => {
    const base = signalTree({ count: 0 });
    const baseLeaf = base.$.count;
    const tree = base.with(make() as never);

    expect((tree as unknown as { $: unknown }).$).toBe(base.$);
    expect((tree as unknown as { $: { count: unknown } }).$.count).toBe(
      baseLeaf
    );

    // A write through the PRE-enhancer leaf reference must be visible through
    // the enhanced tree.
    (baseLeaf as unknown as { set: (v: number) => void }).set(42);
    expect((tree as unknown as () => { count: number })().count).toBe(42);
  });

  it('bind() survives and still writes', () => {
    const tree = signalTree({ count: 0 }).with(make() as never);
    const bound = (
      tree as unknown as { bind: () => (v?: unknown) => unknown }
    ).bind();

    expect(typeof bound).toBe('function');
    (bound as (v: unknown) => void)({ count: 6 });
    expect(tree.$.count()).toBe(6);
  });

  it('the call form still writes', () => {
    const tree = signalTree({ count: 0 }).with(make() as never);
    (tree as unknown as (u: unknown) => void)({ count: 8 });
    expect(tree.$.count()).toBe(8);
  });
});

describe('stacked enhancers', () => {
  it('survive two layers', () => {
    const tree = signalTree({ count: 0 })
      .with(timeTravel() as never)
      .with(batching() as never);

    const changed = (
      tree as unknown as { updateAndReport: (u: unknown) => string[] }
    ).updateAndReport({ count: 4 });

    expect(tree.$.count()).toBe(4);
    expect(changed).toEqual(['count']);
  });
});

describe('a missing forward target is loud', () => {
  it('reports ST2017 rather than returning an empty result', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // An enhancer that drops the base tree's methods — exactly what
      // Object.assign did. The forwarder must not pretend nothing changed.
      const broken = (t: unknown) => {
        const fresh = function () {
          return undefined;
        } as unknown as Record<string, unknown>;
        fresh['$'] = (t as Record<string, unknown>)['$'];
        return fresh;
      };
      const tree = signalTree({ count: 0 }).with(broken as never);

      const changed = (
        tree as unknown as { updateAndReport: (u: unknown) => string[] }
      ).updateAndReport({ count: 1 });

      expect(changed).toEqual([]);
      expect(spy).toHaveBeenCalled();
      expect(String(spy.mock.calls[0]?.[0])).toContain('ST2017');
    } finally {
      spy.mockRestore();
    }
  });
});
