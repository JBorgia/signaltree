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
 * — `updateAndReport`, `batchUpdate`, `onPathChange`, `registerCleanup` — is
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
  ['devTools', () => devTools({ treeName: 'x' }) as never],
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

  it('batchUpdate writes', () => {
    const tree = signalTree({ count: 0 }).with(make() as never);

    (tree as unknown as { batchUpdate: (u: unknown) => void }).batchUpdate({
      count: 3,
    });

    expect(tree.$.count()).toBe(3);
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
