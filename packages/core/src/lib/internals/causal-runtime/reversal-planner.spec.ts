import { createPositionRegistry } from '../position-registry';

import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { createRealizationContextSource } from './realization-context';
import { assessConfirmedUndo } from './authority-assessment';
import { planConfirmedReversal } from './reversal-planner';
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

const buildStructuralTopology = () => {
  const topology = createPositionRegistry();

  const root = topology.allocate();
  const profile = topology.allocate(root);
  const key = topology.allocate(profile);
  const name = topology.allocate(profile);
  const enabled = topology.allocate(profile);

  return {
    topology,
    positions: {
      root,
      profile,
      key,
      name,
      enabled,
    },
  } satisfies {
    topology: ReturnType<typeof createPositionRegistry>;
    positions: Record<string, PositionId>;
  };
};

const SUBJECT_PROFILE = 'profile-1';

describe('planConfirmedReversal', () => {
  it('produces a pure scalar reversal plan in reverse effect order', () => {
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
    const result = planConfirmedReversal({ turnId: 1, store });

    expect(result).toEqual({
      ok: true,
      plan: {
        turnId: 1,
        effects: [
          {
            owner: positions.theme,
            before: 'dark',
            after: 'light',
          },
          {
            owner: positions.firstName,
            before: 'Grace',
            after: 'Ada',
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

    expect(planConfirmedReversal({ turnId: 1, store })).toEqual({
      ok: false,
      refusal: { kind: 'history-evicted' },
    });
    expect(store.inspect()).toEqual(before);
  });

  it('is not invoked when authority assessment already refuses', () => {
    const { topology, positions } = buildTopology();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    store.admitConfirmed({
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
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });
    store.admitConfirmed({
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
    expect(appliedHistory.admitConfirmed(2)).toEqual({ ok: true });

    const planner = vi.fn(planConfirmedReversal);
    const before = store.inspect();
    const assessment = assessConfirmedUndo({
      authority: positions.profile,
      store,
      appliedHistory,
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

  it('plans confirmed remove undo from the surviving external boundary across structural coverage', () => {
    const { positions } = buildStructuralTopology();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [positions.key, 'A'],
        [positions.name, 'Alice'],
        [positions.enabled, true],
      ]),
      store,
      appliedHistory,
    });

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: positions.key,
          before: 'A',
          after: undefined,
          subjectId: SUBJECT_PROFILE,
          structural: 'remove',
          subjectPositions: [positions.key, positions.name, positions.enabled],
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });

    expect(planConfirmedReversal({ turnId: 1, store, realizationContext })).toEqual({
      ok: true,
      plan: {
        turnId: 1,
        effects: [
          {
            owner: positions.key,
            before: undefined,
            after: 'A',
            subjectId: SUBJECT_PROFILE,
            structural: 'add',
            subjectPositions: [positions.key, positions.name, positions.enabled],
            subjectState: {
              [positions.name]: 'Alice',
              [positions.enabled]: true,
            },
          },
        ],
      },
    });
  });

  it('overlays same-turn prefix values onto the surviving external remove boundary', () => {
    const { positions } = buildStructuralTopology();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [positions.key, 'A'],
        [positions.name, 'Alice'],
        [positions.enabled, true],
      ]),
      store,
      appliedHistory,
    });

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: positions.name,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_PROFILE,
        },
        {
          owner: positions.key,
          before: 'A',
          after: undefined,
          subjectId: SUBJECT_PROFILE,
          structural: 'remove',
          subjectPositions: [positions.key, positions.name, positions.enabled],
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });

    expect(planConfirmedReversal({ turnId: 1, store, realizationContext })).toEqual({
      ok: true,
      plan: {
        turnId: 1,
        effects: [
          {
            owner: positions.key,
            before: undefined,
            after: 'A',
            subjectId: SUBJECT_PROFILE,
            structural: 'add',
            subjectPositions: [positions.key, positions.name, positions.enabled],
            subjectState: {
              [positions.name]: 'Alicia',
              [positions.enabled]: true,
            },
          },
          {
            owner: positions.name,
            before: 'Alicia',
            after: 'Alice',
            subjectId: SUBJECT_PROFILE,
            structural: undefined,
          },
        ],
      },
    });
  });

  it('uses the current surviving external boundary rather than stale canonical predecessor values', () => {
    const { positions } = buildStructuralTopology();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [positions.key, 'A'],
        [positions.name, 'Alice'],
        [positions.enabled, false],
      ]),
      store,
      appliedHistory,
    });

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: positions.enabled,
          before: false,
          after: true,
          subjectId: SUBJECT_PROFILE,
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });
    store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: positions.name,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_PROFILE,
        },
        {
          owner: positions.key,
          before: 'A',
          after: undefined,
          subjectId: SUBJECT_PROFILE,
          structural: 'remove',
          subjectPositions: [positions.key, positions.name, positions.enabled],
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(2)).toEqual({ ok: true });

    expect(planConfirmedReversal({ turnId: 2, store, realizationContext })).toEqual({
      ok: true,
      plan: {
        turnId: 2,
        effects: [
          {
            owner: positions.key,
            before: undefined,
            after: 'A',
            subjectId: SUBJECT_PROFILE,
            structural: 'add',
            subjectPositions: [positions.key, positions.name, positions.enabled],
            subjectState: {
              [positions.name]: 'Alicia',
              [positions.enabled]: true,
            },
          },
          {
            owner: positions.name,
            before: 'Alicia',
            after: 'Alice',
            subjectId: SUBJECT_PROFILE,
            structural: undefined,
          },
        ],
      },
    });
  });
});
