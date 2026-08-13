import { createPositionRegistry } from '../position-registry';

import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { assessConfirmedRedo } from './redo-assessment';
import { TurnStore } from './turn-store';

const buildTopology = () => {
  const topology = createPositionRegistry();

  const root = topology.allocate();
  const profile = topology.allocate(root);
  const firstName = topology.allocate(profile);
  const lastName = topology.allocate(profile);
  const settings = topology.allocate(root);
  const theme = topology.allocate(settings);

  return {
    topology,
    positions: {
      root,
      profile,
      firstName,
      lastName,
      settings,
      theme,
    },
  } satisfies {
    topology: ReturnType<typeof createPositionRegistry>;
    positions: Record<string, PositionId>;
  };
};

describe('assessConfirmedRedo', () => {
  it('allows disjoint redo even while unrelated later confirmed work remains applied', () => {
    const { topology, positions } = buildTopology();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const t1 = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: positions.firstName,
          before: 'Ada',
          after: 'Grace',
        },
      ],
    });
    const t2 = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: positions.theme,
          before: 'light',
          after: 'dark',
        },
      ],
    });
    appliedHistory.admitConfirmed(t1.id);
    appliedHistory.admitConfirmed(t2.id);
    appliedHistory.moveConfirmedTurnToRedo(t1.id);

    expect(
      assessConfirmedRedo({
        authority: positions.firstName,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: true,
      turnId: t1.id,
    });
  });

  it('refuses when the only contained redoable turn is not the first missing contribution for its position', () => {
    const { topology, positions } = buildTopology();
    const store = new TurnStore();

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: positions.firstName,
          before: 'Ada',
          after: 'Grace',
        },
      ],
    });
    store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: positions.firstName,
          before: 'Grace',
          after: 'Joan',
        },
      ],
    });

    const redoTurnIds = [2] as const;
    const appliedTurnIds: readonly number[] = [];
    const appliedHistory = {
      getAppliedTurnIds: () => appliedTurnIds,
      getRedoTurnIds: () => redoTurnIds,
    };
    const storeBefore = store.inspect();

    expect(
      assessConfirmedRedo({
        authority: positions.root,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: false,
      refusal: { kind: 'frontier-blocked' },
    });

    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);
    expect(appliedHistory.getRedoTurnIds()).toEqual([2]);
  });

  it('refuses a cross-position redo atomically when any participant is not ready for that confirmed prefix', () => {
    const { topology, positions } = buildTopology();
    const store = new TurnStore();

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: positions.firstName,
          before: 'Ada',
          after: 'Grace',
        },
      ],
    });
    store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: positions.firstName,
          before: 'Grace',
          after: 'Joan',
        },
        {
          owner: positions.theme,
          before: 'light',
          after: 'dark',
        },
      ],
    });

    const redoTurnIds = [2] as const;
    const appliedTurnIds: readonly number[] = [];
    const appliedHistory = {
      getAppliedTurnIds: () => appliedTurnIds,
      getRedoTurnIds: () => redoTurnIds,
    };
    const storeBefore = store.inspect();

    expect(
      assessConfirmedRedo({
        authority: positions.root,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: false,
      refusal: { kind: 'frontier-blocked' },
    });

    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);
    expect(appliedHistory.getRedoTurnIds()).toEqual([2]);
  });

  it('refuses a redoable cross-boundary turn for a narrower authority', () => {
    const { topology, positions } = buildTopology();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const t1 = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: positions.firstName,
          before: 'Ada',
          after: 'Grace',
        },
        {
          owner: positions.theme,
          before: 'light',
          after: 'dark',
        },
      ],
    });
    appliedHistory.admitConfirmed(t1.id);
    appliedHistory.moveConfirmedTurnToRedo(t1.id);

    const storeBefore = store.inspect();
    const appliedBefore = appliedHistory.inspect();

    expect(
      assessConfirmedRedo({
        authority: positions.profile,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: false,
      refusal: { kind: 'outside-boundary' },
    });

    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('skips an earlier cross-boundary redoable turn and selects a later contained independent turn', () => {
    const { topology, positions } = buildTopology();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const t1 = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: positions.firstName,
          before: 'Ada',
          after: 'Grace',
        },
        {
          owner: positions.theme,
          before: 'light',
          after: 'dark',
        },
      ],
    });
    const t2 = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: positions.lastName,
          before: 'Lovelace',
          after: 'Hopper',
        },
      ],
    });

    expect(appliedHistory.admitConfirmed(t1.id)).toEqual({ ok: true });
    expect(appliedHistory.admitConfirmed(t2.id)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(t2.id)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(t1.id)).toEqual({ ok: true });

    const storeBefore = store.inspect();
    const appliedBefore = appliedHistory.inspect();

    expect(
      assessConfirmedRedo({
        authority: positions.profile,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: true,
      turnId: t2.id,
    });

    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });
});
