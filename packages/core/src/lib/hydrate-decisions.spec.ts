import { afterEach, describe, expect, it, vi } from 'vitest';

import { asyncSource } from './markers/async-source';
import { entityMap } from './types';
import {
  hydrateMarkerNode,
  onHydrateDecision,
  type HydrateDecisionEvent,
} from './internals/materialize-markers';
import { loader } from './markers/loader';
import { signalTree } from './signal-tree';
import { status } from './markers/status';

/**
 * §5.5 — `hydrate` now makes real decisions, so it has to be possible to SEE
 * them.
 *
 * Two are silent by nature and neither existed before 14.0.0:
 *
 *   - a loader-backed marker DECLINES a `rehydrate` payload, because its own
 *     loader is the authority on that data;
 *   - `status()` NORMALISES `LOADING` to `NotLoaded`, because no request
 *     survives a process boundary.
 *
 * Both are correct, which is exactly why they must not be warnings. Warning on
 * correct behaviour trains people to ignore the channel — and an ignored
 * channel is how the four bugs behind this release stayed invisible for so
 * long. This is an observation seam, the same shape as `getPathNotifier`.
 *
 * Worth stating why this shipped WITH the rule rather than after it: every
 * other silence 14.0.0 fixed was inherited. The loader-declines rule is silence
 * this release INTRODUCES. Shipping a brand-new silent decision inside the
 * release whose thesis is "make the silence loud" is the one internal
 * inconsistency a careful reader would find.
 */
const settle = () => new Promise((r) => setTimeout(r, 40));

const collect = () => {
  const events: HydrateDecisionEvent[] = [];
  const off = onHydrateDecision((e) => events.push(e));
  return { events, off };
};

afterEach(() => vi.restoreAllMocks());

describe('a declined rehydrate is observable', () => {
  it('a loader-backed entityMap reports why it refused', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({
      r: entityMap<{ id: number }, number>({
        selectId: (x) => x.id,
        load: loader(async () => [{ id: 9 }]),
      }),
    });
    void tree.$.r;
    await settle();

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.r, { all: [{ id: 1 }, { id: 2 }] }, 'rehydrate');
    off();

    expect(events).toHaveLength(1);
    expect(events[0].marker).toBe('entityMap');
    expect(events[0].decision).toBe('declined');
    expect(events[0].mode).toBe('rehydrate');
    // `reason` is stable and machine-readable — this is what a production
    // listener sees.
    expect(events[0].reason).toBe('loader-owns-source');
    // `detail` is dev-only prose, and it has to point at the FIX rather than
    // merely restate the fact.
    expect(events[0].detail).toContain('hydrateThenRevalidate');
    // And the data really was left alone.
    expect(tree.$.r.count()).toBe(1);
  });

  it('asyncSource reports why it refused', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({ s: asyncSource({ load: async () => 'SOURCE' }) });
    void tree.$.s;
    await settle();

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.s, { value: 'PAYLOAD' }, 'rehydrate');
    off();

    expect(events).toHaveLength(1);
    expect(events[0].marker).toBe('asyncSource');
    expect(events[0].decision).toBe('declined');
    expect(events[0].reason).toBe('loader-owns-source');
    expect(tree.$.s()).toBe('SOURCE');
  });
});

describe('a normalised rehydrate is observable', () => {
  it('status reports the LOADING → NotLoaded adjustment', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({ j: status() });

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.j, { state: 'LOADING', error: null }, 'rehydrate');
    off();

    expect(events).toHaveLength(1);
    expect(events[0].marker).toBe('status');
    expect(events[0].decision).toBe('normalised');
    expect(events[0].reason).toBe('no-request-survives-boundary');
    expect(events[0].detail).toContain('process boundary');
  });
});

describe('what is NOT reported — silence has to stay meaningful', () => {
  it('an accepted payload reports nothing', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({ r: entityMap<{ id: number }, number>() });

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.r, { all: [{ id: 1 }] }, 'rehydrate');
    off();

    expect(events).toEqual([]);
    expect(tree.$.r.count()).toBe(1);
  });

  it('a RESTORE is not a decline — undo is not competing with a loader', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({
      r: entityMap<{ id: number }, number>({
        selectId: (x) => x.id,
        load: loader(async () => [{ id: 9 }]),
      }),
    });
    void tree.$.r;
    await settle();

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.r, { all: [{ id: 1 }, { id: 2 }] }, 'restore');
    off();

    expect(events).toEqual([]);
    expect(tree.$.r.count()).toBe(2);
  });

  it('status keeps LOADING on restore, and says nothing', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({ j: status() });

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.j, { state: 'LOADING', error: null }, 'restore');
    off();

    expect(events).toEqual([]);
    expect(tree.$.j.loading()).toBe(true);
  });
});

describe('the seam itself', () => {
  it('unsubscribes', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({ s: asyncSource({ load: async () => 'S' }) });
    void tree.$.s;
    await settle();

    const { events, off } = collect();
    off();
    hydrateMarkerNode(tree.$.s, { value: 'P' }, 'rehydrate');

    expect(events).toEqual([]);
  });

  it('reports to the dev console when nobody is listening', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({ j: status() });

    hydrateMarkerNode(tree.$.j, { state: 'LOADING', error: null }, 'rehydrate');

    // A developer with no devtools panel still has to be able to see it.
    expect(
      info.mock.calls.filter((c) => String(c[0]).includes('normalised'))
    ).toHaveLength(1);
  });
});

describe('reason ships, detail folds', () => {
  it('a listener receives a stable machine-readable reason', () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({ j: status() });

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.j, { state: 'LOADING', error: null }, 'rehydrate');
    off();

    // The union is the contract a production listener codes against — the
    // prose is not, and must never be parsed.
    const reason: 'loader-owns-source' | 'no-request-survives-boundary' =
      events[0].reason;
    expect(reason).toBe('no-request-survives-boundary');
  });

  it('LISTENERS ARE NOT DEV-ONLY — a public API that no-ops in prod is the bug we just deleted', () => {
    // The reports are guarded such that `detail` folds under
    // `ngDevMode: false`, but the notification itself must not. An earlier
    // revision guarded the whole call site to save 0.19KB, which turned
    // `onHydrateDecision` into an API that silently did nothing in production —
    // exactly what `tree.$.count(5)` was removed for. This test is the guard
    // against re-making that trade.
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({ j: status() });

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.j, { state: 'LOADING', error: null }, 'rehydrate');
    off();

    expect(events).toHaveLength(1);
    expect(events[0].reason).toBeDefined();
  });
});

/**
 * RFC 0014 — the same two markers under `transfer`.
 *
 * `rehydrate` and `transfer` both cross a process boundary. They differ in
 * whether the payload is OLDER or NEWER than whatever this process can produce,
 * and a marker that owns a live source has to answer them differently. These
 * are the accept-side counterparts of the declines above.
 */
describe('RFC 0014 — `transfer` accepts what `rehydrate` declines', () => {
  it('a loader-backed entityMap ACCEPTS a server payload', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({
      r: entityMap<{ id: number }, number>({
        selectId: (x) => x.id,
        load: loader(async () => [{ id: 9 }]),
      }),
    });
    void tree.$.r;
    await settle();
    expect(tree.$.r.count()).toBe(1); // the local loader ran

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.r, { all: [{ id: 1 }, { id: 2 }] }, 'transfer');
    off();

    // Accepted: no decline reported, and the rows actually landed.
    expect(events.filter((e) => e.decision === 'declined')).toHaveLength(0);
    expect(tree.$.r.count()).toBe(2);
  });

  it('asyncSource ACCEPTS a server payload', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({ s: asyncSource({ load: async () => 'SOURCE' }) });
    void tree.$.s;
    await settle();

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.s, { value: 'FROM SERVER' }, 'transfer');
    off();

    expect(events.filter((e) => e.decision === 'declined')).toHaveLength(0);
    expect((tree.$.s as unknown as () => unknown)()).toBe('FROM SERVER');
  });

  it('...and `rehydrate` still declines both — the contrast is the point', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const tree = signalTree({
      r: entityMap<{ id: number }, number>({
        selectId: (x) => x.id,
        load: loader(async () => [{ id: 9 }]),
      }),
      s: asyncSource({ load: async () => 'SOURCE' }),
    });
    void tree.$.r;
    void tree.$.s;
    await settle();

    const { events, off } = collect();
    hydrateMarkerNode(tree.$.r, { all: [{ id: 1 }, { id: 2 }] }, 'rehydrate');
    hydrateMarkerNode(tree.$.s, { value: 'FROM STORAGE' }, 'rehydrate');
    off();

    expect(events.filter((e) => e.decision === 'declined')).toHaveLength(2);
    expect(tree.$.r.count()).toBe(1);
    expect((tree.$.s as unknown as () => unknown)()).toBe('SOURCE');
  });
});
