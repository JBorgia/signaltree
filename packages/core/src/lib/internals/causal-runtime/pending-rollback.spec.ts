import type { PositionId, ReversalEffect } from './causal-types';
import { AppliedHistory } from './applied-history';
import { rollbackPendingTurnAt } from './pending-rollback';
import { createPositionRegistry, type PositionRegistry } from '../position-registry';
import { createRealizationContextSource } from './realization-context';
import { TurnStore } from './turn-store';

const P_ROOT = 1 as PositionId;
const P_PROFILE = 2 as PositionId;
const P_FIRST_NAME = 3 as PositionId;
const P_SETTINGS = 4 as PositionId;
const P_THEME = 5 as PositionId;
const P_DRIVER_KEY = 6 as PositionId;
const P_DRIVER_NAME = 7 as PositionId;
const SUBJECT_DRIVER = 'driver-1';
const SUBJECT_DRIVER_TWO = 'driver-2';

describe('rollbackPendingTurnAt', () => {
  it('leaves all state untouched when the pending turn is missing', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const storeBefore = store.inspect();
    const pendingBefore = store.getPendingTurnIds();
    const appliedBefore = appliedHistory.inspect();
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: 1,
        store,
        topology,
        port: { applyAtomically },
        realizationContext: createRealizationContextSource({
          baselineValues: new Map([[P_FIRST_NAME, 'Ada']]),
          store,
          appliedHistory,
        }),
      })
    ).toEqual({ ok: false, refusal: { kind: 'history-evicted' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(store.getPendingTurnIds()).toEqual(pendingBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('leaves all state untouched when authority assessment refuses', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const pending = store.admitPending({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
    });

    const storeBefore = store.inspect();
    const pendingBefore = store.getPendingTurnIds();
    const appliedBefore = appliedHistory.inspect();
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expect(
      rollbackPendingTurnAt({
        authority: P_SETTINGS,
        turnId: pending.id,
        store,
        topology,
        port: { applyAtomically },
        realizationContext: createRealizationContextSource({
          baselineValues: new Map([[P_FIRST_NAME, 'Ada']]),
          store,
          appliedHistory,
        }),
      })
    ).toEqual({ ok: false, refusal: { kind: 'outside-boundary' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(store.getPendingTurnIds()).toEqual(pendingBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('leaves all state untouched when a later structural dependency blocks rollback', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const pending = store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'driver-1',
          after: 'driver-2',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'driver-2',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const storeBefore = store.inspect();
    const pendingBefore = store.getPendingTurnIds();
    const appliedBefore = appliedHistory.inspect();
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pending.id,
        store,
        topology,
        port: { applyAtomically },
        realizationContext: createRealizationContextSource({
          baselineValues: new Map([[P_DRIVER_KEY, 'driver-1']]),
          store,
          appliedHistory,
        }),
      })
    ).toEqual({ ok: false, refusal: { kind: 'dependency-conflict' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(store.getPendingTurnIds()).toEqual(pendingBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('refuses rollback of a pending remove when a later captured add by a different subject occupies the released location', () => {
    const pendingRemove = {
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove' as const,
          subjectPositions: [P_DRIVER_KEY],
        },
      ],
      participants: [P_DRIVER_KEY],
      state: 'pending' as const,
    };
    const laterCapturedAdd = {
      id: 2,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'A',
          subjectId: 'driver-2',
          structural: 'add' as const,
        },
      ],
      participants: [P_DRIVER_KEY],
      state: 'confirmed' as const,
    };
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const validateEffects = vi.fn();
    const store = {
      getPendingTurn: () => pendingRemove,
      getPendingTurns: () => [pendingRemove],
      getTurns: () => [laterCapturedAdd],
      prepareDiscardPendingTurn: vi.fn(() => ({
        ok: true as const,
        transition: { turnId: pendingRemove.id },
      })),
      commitPreparedDiscardPending: vi.fn(),
    };

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pendingRemove.id,
        store,
        topology: {
          contains: () => true,
        },
        port: {
          validateEffects,
          applyAtomically,
        },
        realizationContext: {
          getCurrentValue: () => undefined,
          getValueWithoutConfirmedTurn: () => 'A',
          getValueWithoutPendingTurn: () => 'A',
        },
      })
    ).toEqual({ ok: false, refusal: { kind: 'dependency-conflict' } });

    expect(validateEffects).not.toHaveBeenCalled();
    expect(store.prepareDiscardPendingTurn).not.toHaveBeenCalled();
    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.commitPreparedDiscardPending).not.toHaveBeenCalled();
  });

  it('refuses rollback of a pending rekey when a later captured add by a different subject occupies the released location', () => {
    const pendingRekey = {
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: 'B',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey' as const,
        },
      ],
      participants: [P_DRIVER_KEY],
      state: 'pending' as const,
    };
    const laterCapturedAdd = {
      id: 2,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'A',
          subjectId: 'driver-2',
          structural: 'add' as const,
        },
      ],
      participants: [P_DRIVER_KEY],
      state: 'pending' as const,
    };
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const validateEffects = vi.fn();
    const store = {
      getPendingTurn: () => pendingRekey,
      getPendingTurns: () => [pendingRekey, laterCapturedAdd],
      getTurns: () => [],
      prepareDiscardPendingTurn: vi.fn(() => ({
        ok: true as const,
        transition: { turnId: pendingRekey.id },
      })),
      commitPreparedDiscardPending: vi.fn(),
    };

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pendingRekey.id,
        store,
        topology: {
          contains: () => true,
        },
        port: {
          validateEffects,
          applyAtomically,
        },
        realizationContext: {
          getCurrentValue: () => 'B',
          getValueWithoutConfirmedTurn: () => 'A',
          getValueWithoutPendingTurn: () => 'A',
        },
      })
    ).toEqual({ ok: false, refusal: { kind: 'dependency-conflict' } });

    expect(validateEffects).not.toHaveBeenCalled();
    expect(store.prepareDiscardPendingTurn).not.toHaveBeenCalled();
    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.commitPreparedDiscardPending).not.toHaveBeenCalled();
  });

  it('leaves all state untouched when prepared discard refuses after planning', () => {
    const turn = {
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
      participants: [P_FIRST_NAME],
      state: 'pending' as const,
    };
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const store = {
      getPendingTurn: () => turn,
      getPendingTurns: () => [turn],
      getTurns: () => [],
      prepareDiscardPendingTurn: () => ({
        ok: false as const,
        reason: 'history-evicted' as const,
      }),
      commitPreparedDiscardPending: vi.fn(),
    };

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: turn.id,
        store,
        topology: {
          contains: () => true,
        },
        port: { applyAtomically },
        realizationContext: {
          getCurrentValue: () => 'Grace',
          getValueWithoutConfirmedTurn: () => 'Ada',
          getValueWithoutPendingTurn: () => 'Ada',
        },
      })
    ).toEqual({ ok: false, refusal: { kind: 'history-evicted' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.commitPreparedDiscardPending).not.toHaveBeenCalled();
  });

  it('leaves all state untouched when structural validation refuses after planning and before pending-discard preparation', () => {
    const turn = {
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'driver-1',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove' as const,
          subjectPositions: [P_DRIVER_KEY],
        },
      ],
      participants: [P_DRIVER_KEY],
      state: 'pending' as const,
    };
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();
    const store = {
      getPendingTurn: () => turn,
      getPendingTurns: () => [turn],
      getTurns: () => [],
      prepareDiscardPendingTurn: vi.fn(() => ({
        ok: true as const,
        transition: { turnId: turn.id },
      })),
      commitPreparedDiscardPending: vi.fn(),
    };

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: turn.id,
        store,
        topology: {
          contains: () => true,
        },
        port: {
          validateEffects: () => ({ kind: 'structural-drift' }),
          applyAtomically,
        },
        realizationContext: {
          getCurrentValue: () => undefined,
          getValueWithoutConfirmedTurn: () => 'driver-1',
          getValueWithoutPendingTurn: () => 'driver-1',
        },
      })
    ).toEqual({ ok: false, refusal: { kind: 'structural-drift' } });

    expect(store.prepareDiscardPendingTurn).not.toHaveBeenCalled();
    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.commitPreparedDiscardPending).not.toHaveBeenCalled();
  });

  it('propagates atomic application failure without discarding the pending turn or mutating confirmed state', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const pending = store.admitPending({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' }],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_THEME, before: 'light', after: 'dark' }],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const storeBefore = store.inspect();
    const pendingBefore = store.getPendingTurnIds();
    const appliedBefore = appliedHistory.inspect();
    const failure = new Error('atomic silent application failed');

    expect(() =>
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pending.id,
        store,
        topology,
        port: {
          applyAtomically: () => {
            throw failure;
          },
        },
        realizationContext: createRealizationContextSource({
          baselineValues: new Map([
            [P_FIRST_NAME, 'Ada'],
            [P_THEME, 'light'],
          ]),
          store,
          appliedHistory,
        }),
      })
    ).toThrow(failure);

    expect(store.inspect()).toEqual(storeBefore);
    expect(store.getPendingTurnIds()).toEqual(pendingBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('allows scalar follow-up after a pending rekey while refusing no structural dependency', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const pending = store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'driver-1',
          after: 'driver-2',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_DRIVER_KEY, 'driver-1'],
        [P_DRIVER_NAME, 'Alice'],
      ]),
      store,
      appliedHistory,
    });
    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'driver-2'],
      [P_DRIVER_NAME, 'Alicia'],
    ]);
    const applyAtomically = vi.fn((effects: readonly ReversalEffect[]) => {
      for (const effect of effects) {
        expect(values.get(effect.owner)).toEqual(effect.before);
        values.set(effect.owner, effect.after);
      }
    });

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pending.id,
        store,
        topology,
        port: { applyAtomically },
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: pending.id });

    expect(applyAtomically).toHaveBeenCalledWith([
      {
        owner: P_DRIVER_KEY,
        before: 'driver-2',
        after: 'driver-1',
        subjectId: SUBJECT_DRIVER,
        structural: 'rekey',
      },
    ]);
    expect(store.hasPendingTurn(pending.id)).toBe(false);
    expect(values.get(P_DRIVER_KEY)).toBe('driver-1');
    expect(values.get(P_DRIVER_NAME)).toBe('Alicia');
    expect(appliedHistory.inspect()).toEqual({
      appliedTurnIds: [2],
      redoTurnIds: [],
      frontiers: {
        [P_DRIVER_NAME]: 2,
      },
    });
  });

  it('allows later pending scalar follow-up after a pending rekey', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const pendingRekey = store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'driver-1',
          after: 'driver-2',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
    });
    const pendingNameUpdate = store.admitPending({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });

    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_DRIVER_KEY, 'driver-1'],
        [P_DRIVER_NAME, 'Alice'],
      ]),
      store,
      appliedHistory,
    });
    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'driver-2'],
      [P_DRIVER_NAME, 'Alicia'],
    ]);
    const applyAtomically = vi.fn((effects: readonly ReversalEffect[]) => {
      for (const effect of effects) {
        expect(values.get(effect.owner)).toEqual(effect.before);
        values.set(effect.owner, effect.after);
      }
    });

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pendingRekey.id,
        store,
        topology,
        port: { applyAtomically },
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: pendingRekey.id });

    expect(applyAtomically).toHaveBeenCalledWith([
      {
        owner: P_DRIVER_KEY,
        before: 'driver-2',
        after: 'driver-1',
        subjectId: SUBJECT_DRIVER,
        structural: 'rekey',
      },
    ]);
    expect(store.hasPendingTurn(pendingRekey.id)).toBe(false);
    expect(store.hasPendingTurn(pendingNameUpdate.id)).toBe(true);
    expect(values.get(P_DRIVER_KEY)).toBe('driver-1');
    expect(values.get(P_DRIVER_NAME)).toBe('Alicia');
  });

  it('rolls back sibling pending removes as two independent structural restorations even when they share one owner position', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const pending = store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'driver-1',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
          subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME],
        },
        {
          owner: P_DRIVER_KEY,
          before: 'driver-2',
          after: undefined,
          subjectId: SUBJECT_DRIVER_TWO,
          structural: 'remove',
          subjectPositions: [P_DRIVER_KEY],
        },
      ],
    });

    const applyAtomically = vi.fn((effects: readonly ReversalEffect[]) => {
      expect(effects).toEqual([
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'driver-1',
          subjectId: SUBJECT_DRIVER,
          structural: 'add',
          subjectState: {
            [P_DRIVER_NAME]: 'Alice',
          },
        },
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'driver-2',
          subjectId: SUBJECT_DRIVER_TWO,
          structural: 'add',
          subjectState: undefined,
        },
      ]);
    });

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pending.id,
        store,
        topology,
        port: { applyAtomically },
        realizationContext: {
          getCurrentValue: () => undefined,
          getValueWithoutConfirmedTurn: (_turnId, positionId) =>
            positionId === P_DRIVER_NAME ? 'Alice' : undefined,
          getValueWithoutPendingTurn: (_turnId, positionId) =>
            positionId === P_DRIVER_NAME ? 'Alice' : undefined,
        },
      })
    ).toEqual({ ok: true, turnId: pending.id });

    expect(store.hasPendingTurn(pending.id)).toBe(false);
    expect(applyAtomically).toHaveBeenCalledTimes(1);
    expect(appliedHistory.inspect()).toEqual({
      appliedTurnIds: [],
      redoTurnIds: [],
      frontiers: {},
    });
  });

  it('refuses later pending structural dependency after a pending rekey without changing state', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const pendingRekey = store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'driver-1',
          after: 'driver-2',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
    });
    store.admitPending({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'driver-2',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
        },
      ],
    });

    const storeBefore = store.inspect();
    const pendingBefore = store.getPendingTurnIds();
    const appliedBefore = appliedHistory.inspect();
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pendingRekey.id,
        store,
        topology,
        port: { applyAtomically },
        realizationContext: createRealizationContextSource({
          baselineValues: new Map([[P_DRIVER_KEY, 'driver-1']]),
          store,
          appliedHistory,
        }),
      })
    ).toEqual({ ok: false, refusal: { kind: 'dependency-conflict' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(store.getPendingTurnIds()).toEqual(pendingBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('refuses rollback of a pending add when later confirmed same-subject scalar work depends on its existence', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const pendingAdd = store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'driver-1',
          subjectId: SUBJECT_DRIVER,
          structural: 'add',
        },
      ],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_NAME,
          before: undefined,
          after: 'Alice',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    const storeBefore = store.inspect();
    const pendingBefore = store.getPendingTurnIds();
    const appliedBefore = appliedHistory.inspect();
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pendingAdd.id,
        store,
        topology,
        port: { applyAtomically },
        realizationContext: createRealizationContextSource({
          baselineValues: new Map(),
          store,
          appliedHistory,
        }),
      })
    ).toEqual({ ok: false, refusal: { kind: 'dependency-conflict' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(store.getPendingTurnIds()).toEqual(pendingBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });

  it('refuses rollback of a pending add when later pending same-subject scalar work depends on its existence', () => {
    const { store, appliedHistory, topology } = createPendingRollbackContext();

    const pendingAdd = store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'driver-1',
          subjectId: SUBJECT_DRIVER,
          structural: 'add',
        },
      ],
    });
    store.admitPending({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_NAME,
          before: undefined,
          after: 'Alice',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });

    const storeBefore = store.inspect();
    const pendingBefore = store.getPendingTurnIds();
    const appliedBefore = appliedHistory.inspect();
    const applyAtomically = vi.fn<void, [readonly ReversalEffect[]]>();

    expect(
      rollbackPendingTurnAt({
        authority: P_ROOT,
        turnId: pendingAdd.id,
        store,
        topology,
        port: { applyAtomically },
        realizationContext: createRealizationContextSource({
          baselineValues: new Map(),
          store,
          appliedHistory,
        }),
      })
    ).toEqual({ ok: false, refusal: { kind: 'dependency-conflict' } });

    expect(applyAtomically).not.toHaveBeenCalled();
    expect(store.inspect()).toEqual(storeBefore);
    expect(store.getPendingTurnIds()).toEqual(pendingBefore);
    expect(appliedHistory.inspect()).toEqual(appliedBefore);
  });
});

function createPendingRollbackContext(): {
  store: TurnStore;
  appliedHistory: AppliedHistory;
  topology: PositionRegistry;
} {
  const topology = createPositionRegistry();

  const root = topology.allocate();
  const profile = topology.allocate(root);
  const firstName = topology.allocate(profile);
  const settings = topology.allocate(root);
  const theme = topology.allocate(settings);
  const driverKey = topology.allocate(profile);
  const driverName = topology.allocate(profile);

  expect(root).toBe(P_ROOT);
  expect(profile).toBe(P_PROFILE);
  expect(firstName).toBe(P_FIRST_NAME);
  expect(settings).toBe(P_SETTINGS);
  expect(theme).toBe(P_THEME);
  expect(driverKey).toBe(P_DRIVER_KEY);
  expect(driverName).toBe(P_DRIVER_NAME);

  const store = new TurnStore();
  const appliedHistory = new AppliedHistory(store);

  return { store, appliedHistory, topology };
}
