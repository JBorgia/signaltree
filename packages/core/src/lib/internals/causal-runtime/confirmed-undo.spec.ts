import type { PositionId, ReversalEffect } from './causal-types';
import { AppliedHistory } from './applied-history';
import { undoConfirmedAt } from './confirmed-undo';
import { createPositionRegistry, type PositionRegistry } from '../position-registry';
import { createRealizationContextSource } from './realization-context';
import { TurnStore } from './turn-store';

const P_ROOT = 1 as PositionId;
const P_PROFILE = 2 as PositionId;
const P_FIRST_NAME = 3 as PositionId;
const P_LAST_NAME = 4 as PositionId;
const P_SETTINGS = 5 as PositionId;
const P_THEME = 6 as PositionId;

describe('undoConfirmedAt', () => {
  it('leaves all state untouched when authority assessment refuses', () => {
    const { store, appliedHistory, topology } = createConfirmedUndoContext();

    store.admitConfirmed({
      id: 1,
      effects: [
        { owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' },
        { owner: P_LAST_NAME, before: 'Lovelace', after: 'Hopper' },
      ],
    });
    store.admitConfirmed({
      id: 2,
      effects: [
        { owner: P_FIRST_NAME, before: 'Grace', after: 'Joan' },
        { owner: P_THEME, before: 'light', after: 'dark' },
      ],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });
    expect(appliedHistory.admitConfirmed(2)).toEqual({ ok: true });

    const storeBefore = store.inspect();
    const appliedBefore = appliedHistory.inspect();
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_FIRST_NAME, 'Ada'],
        [P_LAST_NAME, 'Lovelace'],
        [P_THEME, 'light'],
      ]),
      store,
      appliedHistory,
    });

    expect(
      undoConfirmedAt({
        authority: P_PROFILE,
        store,
        appliedHistory,
        topology,
        port: { applyAtomically },
        realizationContext,
      })
    ).toEqual({ ok: false, refusal: { kind: 'frontier-blocked' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('leaves all state untouched when applied-history preparation refuses after assessment and planning', () => {
    const { store, appliedHistory, topology } = createConfirmedUndoContext();

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });

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
      getFrontier: (positionId: PositionId) => appliedHistory.getFrontier(positionId),
      prepareUnapplyConfirmedTurn: () => ({
        ok: false as const,
        reason: 'not-applied-frontier' as const,
      }),
      commitPreparedUnapply: vi.fn(),
    };

    expect(
      undoConfirmedAt(
        {
          authority: P_ROOT,
          store,
          appliedHistory: refusingAppliedHistory,
          topology,
          port: { applyAtomically },
          realizationContext,
        },
        {
          assessConfirmedUndo: () => ({ ok: true, turnId: 1 }),
          planConfirmedReversal: () => ({
            ok: true,
            plan: {
              turnId: 1,
              effects: [{ owner: P_FIRST_NAME, before: 'Grace', after: 'Ada' }],
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
    const { store, appliedHistory, topology } = createConfirmedUndoContext();

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });

    const storeBefore = store.inspect();
    const appliedBefore = appliedHistory.inspect();
    const failure = new Error('atomic silent application failed');
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'Ada']]),
      store,
      appliedHistory,
    });

    expect(() =>
      undoConfirmedAt({
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

  it('moves a whole confirmed turn from applied to redoable after successful atomic reversal, without changing canonical history', () => {
    const { store, appliedHistory, topology } = createConfirmedUndoContext();

    store.admitConfirmed({
      id: 1,
      effects: [
        { owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' },
        { owner: P_LAST_NAME, before: 'Lovelace', after: 'Hopper' },
      ],
    });
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'Grace', after: 'Joan' }],
    });
    expect(appliedHistory.admitConfirmed(1)).toEqual({ ok: true });
    expect(appliedHistory.admitConfirmed(2)).toEqual({ ok: true });

    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_FIRST_NAME, 'Ada'],
        [P_LAST_NAME, 'Lovelace'],
      ]),
      store,
      appliedHistory,
    });

    expect(
      undoConfirmedAt({
        authority: P_ROOT,
        store,
        appliedHistory,
        topology,
        port: { applyAtomically },
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: 2 });

    expect(store.inspect()).toEqual({
      turnIds: [1, 2],
      positionIndex: {
        [P_FIRST_NAME]: [1, 2],
        [P_LAST_NAME]: [1],
      },
      frontiers: {
        [P_FIRST_NAME]: 2,
        [P_LAST_NAME]: 1,
      },
    });
    expect(appliedHistory.inspect()).toEqual({
      appliedTurnIds: [1],
      redoTurnIds: [2],
      frontiers: {
        [P_FIRST_NAME]: 1,
        [P_LAST_NAME]: 1,
      },
    });
    expect(applyAtomically).toHaveBeenCalledTimes(1);
    expect(applyAtomically).toHaveBeenCalledWith([
      { owner: P_FIRST_NAME, before: 'Joan', after: 'Grace' },
    ]);
  });
});

function createConfirmedUndoContext(): {
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
