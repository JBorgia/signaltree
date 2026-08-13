import type { PositionId, ReversalEffect } from './causal-types';
import { AppliedHistory } from './applied-history';
import { redoConfirmedAt } from './confirmed-redo';
import { createPositionRegistry, type PositionRegistry } from '../position-registry';
import { createRealizationContextSource } from './realization-context';
import { TurnStore } from './turn-store';

const P_ROOT = 1 as PositionId;
const P_PROFILE = 2 as PositionId;
const P_FIRST_NAME = 3 as PositionId;
const P_LAST_NAME = 4 as PositionId;
const P_SETTINGS = 5 as PositionId;
const P_THEME = 6 as PositionId;

describe('redoConfirmedAt', () => {
  it('leaves all state untouched when redo assessment refuses', () => {
    const { store, appliedHistory, topology } = createConfirmedRedoContext();

    store.admitConfirmed({
      id: 1,
      effects: [
        { owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' },
        { owner: P_THEME, before: 'light', after: 'dark' },
      ],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(1)).toEqual({ ok: true });

    const storeBefore = store.inspect();
    const appliedBefore = appliedHistory.inspect();
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_FIRST_NAME, 'Ada'],
        [P_THEME, 'light'],
      ]),
      store,
      appliedHistory,
    });

    expect(
      redoConfirmedAt({
        authority: P_PROFILE,
        store,
        appliedHistory,
        topology,
        port: { applyAtomically },
        realizationContext,
      })
    ).toEqual({ ok: false, refusal: { kind: 'outside-boundary' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('leaves all state untouched when applied-history reapply preparation refuses after assessment and planning', () => {
    const { store, appliedHistory, topology } = createConfirmedRedoContext();

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
    });
    const storeBefore = store.inspect();
    const appliedBefore = appliedHistory.inspect();
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'Ada']]),
      store,
      appliedHistory,
    });
    const refusingAppliedHistory = {
      getAppliedTurnIds: () => appliedHistory.getAppliedTurnIds(),
      getRedoTurnIds: () => [1],
      prepareReapplyConfirmedTurn: () => ({
        ok: false as const,
        reason: 'not-redoable-next' as const,
      }),
      commitPreparedReapply: vi.fn(),
    };

    expect(
      redoConfirmedAt(
        {
          authority: P_ROOT,
          store,
          appliedHistory: refusingAppliedHistory,
          topology,
          port: { applyAtomically },
          realizationContext,
        },
        {
          assessConfirmedRedo: () => ({ ok: true, turnId: 1 }),
          planConfirmedReapply: () => ({
            ok: true,
            plan: {
              turnId: 1,
              effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
            },
          }),
          applyReversalPlan: vi.fn(),
        }
      )
    ).toEqual({ ok: false, refusal: { kind: 'frontier-blocked' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('propagates physical application failure without changing canonical or applied state', () => {
    const { store, appliedHistory, topology } = createConfirmedRedoContext();

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(1)).toEqual({ ok: true });

    const storeBefore = store.inspect();
    const appliedBefore = appliedHistory.inspect();
    const failure = new Error('atomic silent application failed');
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'Ada']]),
      store,
      appliedHistory,
    });

    expect(() =>
      redoConfirmedAt({
        authority: P_ROOT,
        store,
        appliedHistory,
        topology,
        realizationContext,
        port: {
          applyAtomically: () => {
            throw failure;
          },
        },
      })
    ).toThrow(failure);

    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('moves a whole confirmed turn from redoable back to applied after successful atomic reapplication, without changing canonical history', () => {
    const { store, appliedHistory, topology } = createConfirmedRedoContext();

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
    });
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_THEME, before: 'light', after: 'dark' }],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });
    expect(appliedHistory.admitConfirmed(2)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(1)).toEqual({ ok: true });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_FIRST_NAME, 'Ada'],
        [P_THEME, 'light'],
      ]),
      store,
      appliedHistory,
    });

    expect(
      redoConfirmedAt({
        authority: P_ROOT,
        store,
        appliedHistory,
        topology,
        port: { applyAtomically },
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: 1 });

    expect(store.inspect()).toEqual({
      turnIds: [1, 2],
      positionIndex: {
        [P_FIRST_NAME]: [1],
        [P_THEME]: [2],
      },
      frontiers: {
        [P_FIRST_NAME]: 1,
        [P_THEME]: 2,
      },
    });
    expect(appliedHistory.inspect()).toEqual({
      appliedTurnIds: [1, 2],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: 1,
        [P_THEME]: 2,
      },
    });
    expect(applyAtomically).toHaveBeenCalledTimes(1);
    expect(applyAtomically).toHaveBeenCalledWith([
      { owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' },
    ]);
  });
});

function createConfirmedRedoContext(): {
  store: TurnStore;
  appliedHistory: AppliedHistory;
  topology: PositionRegistry;
} {
  const topology = createPositionRegistry();

  const root = topology.allocate();
  const profile = topology.allocate(root);
  const firstName = topology.allocate(profile);
  const lastName = topology.allocate(profile);

  expect(root).toBe(P_ROOT);
  expect(profile).toBe(P_PROFILE);
  expect(firstName).toBe(P_FIRST_NAME);
  expect(lastName).toBe(P_LAST_NAME);

  const settings = topology.allocate(root);
  const theme = topology.allocate(settings);

  expect(settings).toBe(P_SETTINGS);
  expect(theme).toBe(P_THEME);

  const store = new TurnStore();
  const appliedHistory = new AppliedHistory(store);

  return { store, appliedHistory, topology };
}
