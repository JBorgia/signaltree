import { createPositionRegistry } from '../position-registry';

import type { PositionId } from './causal-types';
import { assessConfirmedRedo } from './redo-assessment';
import { planConfirmedReapply } from './reapply-planner';
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

describe('planConfirmedReapply', () => {
  it('produces a pure forward application plan in original effect order', () => {
    const { positions } = buildTopology();
    const store = new TurnStore();

    store.admitConfirmed({
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

    const before = store.inspect();
    const result = planConfirmedReapply({ turnId: 1, store });

    expect(result).toEqual({
      ok: true,
      plan: {
        turnId: 1,
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
      },
    });
    expect(store.inspect()).toEqual(before);
  });

  it('refuses planning for an evicted or missing confirmed turn without mutating store state', () => {
    const store = new TurnStore({ capacity: 1 });

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: 1 as PositionId,
          before: 'A',
          after: 'B',
        },
      ],
    });
    store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: 1 as PositionId,
          before: 'B',
          after: 'C',
        },
      ],
    });

    const before = store.inspect();

    expect(planConfirmedReapply({ turnId: 1, store })).toEqual({
      ok: false,
      refusal: { kind: 'history-evicted' },
    });
    expect(store.inspect()).toEqual(before);
  });

  it('is not invoked when redo assessment already refuses', () => {
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

    const planner = vi.fn(planConfirmedReapply);
    const before = store.inspect();
    const assessment = assessConfirmedRedo({
      authority: positions.root,
      store,
      appliedHistory: {
        getAppliedTurnIds: () => [],
        getRedoTurnIds: () => [2],
      },
      topology,
    });

    expect(assessment).toEqual({
      ok: false,
      refusal: { kind: 'frontier-blocked' },
    });

    if (assessment.ok) {
      planner({ turnId: assessment.turnId, store });
    }

    expect(planner).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(before);
  });
});
