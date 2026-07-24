import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import { entityMap } from './entity-map';
import { loader } from './loader';

// Isolated spec (own module registry → the one-time [ST2004] deprecation latch
// in entity-map.ts starts fresh here, so the "warns once" assertion is
// deterministic regardless of other spec files).

interface Plant {
  url: string;
  name: string;
}
const P1: Plant = { url: 'a', name: 'Aloe' };
const P2: Plant = { url: 'b', name: 'Basil' };
const selectId = (p: Plant) => p.url;

interface Cust {
  id: string;
  name: string;
}
const custId = (c: Cust) => c.id;
const ROWS: Record<string, Cust[]> = {
  west: [{ id: 'w1', name: 'West Co' }],
  east: [{ id: 'e1', name: 'East Co' }],
};

describe('loader() feature', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is a branded feature object, not a raw function', () => {
    const f = loader<Plant>(() => of([P1]));
    expect(typeof f).toBe('object');
    expect((f as { __signalTreeLoader?: unknown }).__signalTreeLoader).toBe(
      true
    );
    expect(typeof (f as { attach?: unknown }).attach).toBe('function');
  });

  it('attaches the loader surface and auto-loads (parity with raw form)', async () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        selectId,
        load: loader(() => {
          calls++;
          return of([P1, P2]);
        }),
      }),
    });
    // Loader surface exists…
    expect(typeof tree.$.plants.load).toBe('function');
    expect(tree.$.plants.loading()).toBe(false);
    // …and auto-load is deferred off the render pass, then populates.
    expect(tree.$.plants.all()).toEqual([]);
    expect(calls).toBe(0);
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(tree.$.plants.all()).toEqual([P1, P2]);
    expect(tree.$.plants.loaded()).toBe(true);
  });

  it('carries loader-family options (staleTime guards refetch)', async () => {
    let calls = 0;
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        selectId,
        load: loader(
          () => {
            calls++;
            return of([P1]);
          },
          { staleTime: '30m' }
        ),
      }),
    });
    await tree.$.plants.load();
    expect(calls).toBe(1);
    await tree.$.plants.load(); // fresh within staleTime → no-op
    expect(calls).toBe(1);
  });

  it('supports scoped (parameterized) loaders', async () => {
    const tree = signalTree({
      customers: entityMap<Cust, string, { region: string }>({
        selectId: custId,
        load: loader(({ region }: { region: string }) => of(ROWS[region])),
      }),
    });
    await tree.$.customers.load({ region: 'west' });
    expect(tree.$.customers.all()).toEqual(ROWS['west']);
    await tree.$.customers.load({ region: 'east' });
    expect(tree.$.customers.all()).toEqual(ROWS['east']);
  });

  it('does NOT emit any [ST2004] warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tree = signalTree({
      plants: entityMap<Plant, string>({
        selectId,
        load: loader(() => of([P1])),
      }),
    });
    await tree.$.plants.load();
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('[ST2004]'))
    ).toBe(false);
  });
});

describe('raw load: fn (removed in v12) fails closed', () => {
  it('throws [ST2004] rather than silently no-op when load is a raw function', () => {
    expect(() =>
      signalTree({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        plants: entityMap<Plant, string>({
          selectId,
          load: (() => of([P1])) as any,
        }),
      })
    ).toThrow(/\[ST2004\]/);
  });
});
