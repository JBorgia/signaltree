import { createPositionRegistry } from '../position-registry';

import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { assessConfirmedUndo } from './authority-assessment';
import { TurnStore } from './turn-store';

const buildTopology = () => {
  const topology = createPositionRegistry();

  const root = topology.allocate();
  const profile = topology.allocate(root);
  const firstName = topology.allocate(profile);
  const lastName = topology.allocate(profile);
  const enabled = topology.allocate(profile);
  const local = topology.allocate(profile);
  const settings = topology.allocate(root);
  const theme = topology.allocate(settings);

  return {
    topology,
    positions: {
      root,
      profile,
      firstName,
      lastName,
      enabled,
      local,
      settings,
      theme,
    },
  } satisfies {
    topology: ReturnType<typeof createPositionRegistry>;
    positions: Record<string, PositionId>;
  };
};

describe('assessConfirmedUndo', () => {
  it('refuses profile authority when a later mixed-boundary turn blocks the contained turn frontier', () => {
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
          owner: positions.lastName,
          before: 'Lovelace',
          after: 'Hopper',
        },
      ],
    });
    const t2 = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: positions.firstName,
          before: 'Grace',
          after: 'Katherine',
        },
        {
          owner: positions.theme,
          before: 'light',
          after: 'dark',
        },
      ],
    });
    appliedHistory.admitConfirmed(t1.id);
    appliedHistory.admitConfirmed(t2.id);

    expect(
      assessConfirmedUndo({
        authority: positions.profile,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: false,
      refusal: { kind: 'frontier-blocked' },
    });
  });

  it('selects the latest mixed-family turn for root authority when all participants are contained', () => {
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
          owner: positions.lastName,
          before: 'Lovelace',
          after: 'Hopper',
        },
      ],
    });
    const t2 = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: positions.firstName,
          before: 'Grace',
          after: 'Katherine',
        },
        {
          owner: positions.theme,
          before: 'light',
          after: 'dark',
        },
      ],
    });
    appliedHistory.admitConfirmed(t1.id);
    appliedHistory.admitConfirmed(t2.id);

    expect(
      assessConfirmedUndo({
        authority: positions.root,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: true,
      turnId: 2,
    });
  });

  it('treats nested authorities as eligible for a single-position confirmed turn', () => {
    const { topology, positions } = buildTopology();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const t3 = store.admitConfirmed({
      id: 3,
      effects: [
        {
          owner: positions.lastName,
          before: 'Lovelace',
          after: 'Hopper',
        },
      ],
    });
    appliedHistory.admitConfirmed(t3.id);

    expect(
      assessConfirmedUndo({
        authority: positions.lastName,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: true,
      turnId: 3,
    });
    expect(
      assessConfirmedUndo({
        authority: positions.profile,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: true,
      turnId: 3,
    });
    expect(
      assessConfirmedUndo({
        authority: positions.root,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: true,
      turnId: 3,
    });
  });

  it('refuses a cross-boundary turn when no fully contained candidate exists', () => {
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

    expect(
      assessConfirmedUndo({
        authority: positions.profile,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: false,
      refusal: { kind: 'outside-boundary' },
    });
  });

  it('selects an earlier disjoint applied turn when a later unrelated turn remains applied', () => {
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
      assessConfirmedUndo({
        authority: positions.firstName,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: false,
      refusal: { kind: 'outside-boundary' },
    });

    expect(
      assessConfirmedUndo({
        authority: positions.theme,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: true,
      turnId: 2,
    });
  });

  it('does not let structural coverage expand undo authority beyond actual participants', () => {
    const { topology, positions } = buildTopology();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const turn = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: positions.lastName,
          before: 'Alice',
          after: 'Alicia',
          subjectId: 'profile-1',
        },
        {
          owner: positions.firstName,
          before: 'A',
          after: undefined,
          subjectId: 'profile-1',
          structural: 'remove',
          subjectPositions: [
            positions.firstName,
            positions.lastName,
            positions.enabled,
            positions.local,
          ],
        },
      ],
    });
    appliedHistory.admitConfirmed(turn.id);

    expect(
      assessConfirmedUndo({
        authority: positions.enabled,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: false,
      refusal: { kind: 'outside-boundary' },
    });

    expect(
      assessConfirmedUndo({
        authority: positions.profile,
        store,
        appliedHistory,
        topology,
      })
    ).toEqual({
      ok: true,
      turnId: 1,
    });
  });
});
