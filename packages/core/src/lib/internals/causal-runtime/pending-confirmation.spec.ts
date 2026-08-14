import { createEntitySignal } from '../../entity-signal';
import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { confirmPendingTurnAt } from './pending-confirmation';
import { createRealizationContextSource } from './realization-context';
import { runPhysicalMaintenance } from './subject-reclamation-coordinator';
import { TurnStore } from './turn-store';

const P_THEME = 1 as PositionId;
const P_DRIVER_KEY = 3 as PositionId;

describe('pending confirmation', () => {
  it('survives immediate retention by folding the confirmed contribution into baseline instead of restoring pending state', () => {
    let source:
      | ReturnType<typeof createRealizationContextSource>
      | undefined;
    const store = new TurnStore({
      capacity: 0,
      retainEvictedConfirmedTurn: (turn) => source?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    source = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });

    store.admitPending({
      id: 1,
      effects: [{ owner: P_THEME, before: 'A', after: 'B' }],
    });

    expect(confirmPendingTurnAt({ turnId: 1, store, appliedHistory })).toEqual({
      ok: true,
      turnId: 1,
    });
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);
    expect(appliedHistory.getRedoTurnIds()).toEqual([]);
    expect(source.getCurrentValue(P_THEME)).toBe('B');
  });

  it('folds evicted applied history into baseline while the newly confirmed pending turn remains confirmed and applied', () => {
    let source:
      | ReturnType<typeof createRealizationContextSource>
      | undefined;
    const store = new TurnStore({
      capacity: 1,
      retainEvictedConfirmedTurn: (turn) => source?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    source = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });

    const earlier = store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_THEME, before: 'A', after: 'B' }],
    });
    expect(appliedHistory.admitConfirmed(earlier.id)).toEqual({ ok: true });
    store.admitPending({
      id: 2,
      effects: [{ owner: P_THEME, before: 'B', after: 'C' }],
    });

    expect(confirmPendingTurnAt({ turnId: 2, store, appliedHistory })).toEqual({
      ok: true,
      turnId: 2,
    });
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns().map(({ id }) => id)).toEqual([2]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([2]);
    expect(appliedHistory.getRedoTurnIds()).toEqual([]);
    expect(source.getCurrentValue(P_THEME)).toBe('C');
    expect(source.getValueWithoutConfirmedTurn(2, P_THEME)).toBe('B');
  });

  it('does not fold an evicted unapplied contribution into baseline during confirmation retention', () => {
    let source:
      | ReturnType<typeof createRealizationContextSource>
      | undefined;
    const store = new TurnStore({
      capacity: 1,
      retainEvictedConfirmedTurn: (turn) => source?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    source = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });

    const earlier = store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_THEME, before: 'A', after: 'B' }],
    });
    expect(appliedHistory.admitConfirmed(earlier.id)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(earlier.id)).toEqual({ ok: true });
    store.admitPending({
      id: 2,
      effects: [{ owner: P_THEME, before: 'A', after: 'C' }],
    });

    expect(confirmPendingTurnAt({ turnId: 2, store, appliedHistory })).toEqual({
      ok: true,
      turnId: 2,
    });
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns().map(({ id }) => id)).toEqual([2]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([2]);
    expect(appliedHistory.getRedoTurnIds()).toEqual([]);
    expect(source.getCurrentValue(P_THEME)).toBe('C');
    expect(source.getValueWithoutConfirmedTurn(2, P_THEME)).toBe('A');
  });

  it('invalidates overlapping redo during confirmation even when retention removes older reversible history', () => {
    let source:
      | ReturnType<typeof createRealizationContextSource>
      | undefined;
    const store = new TurnStore({
      capacity: 2,
      retainEvictedConfirmedTurn: (turn) => source?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    source = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });

    const first = store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_THEME, before: 'A', after: 'B' }],
    });
    const second = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_THEME, before: 'B', after: 'C' }],
    });
    expect(appliedHistory.admitConfirmed(first.id)).toEqual({ ok: true });
    expect(appliedHistory.admitConfirmed(second.id)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(second.id)).toEqual({ ok: true });

    store.admitPending({
      id: 3,
      effects: [{ owner: P_THEME, before: 'B', after: 'D' }],
    });

    expect(confirmPendingTurnAt({ turnId: 3, store, appliedHistory })).toEqual({
      ok: true,
      turnId: 3,
    });
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns().map(({ id }) => id)).toEqual([2, 3]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([3]);
    expect(appliedHistory.getRedoTurnIds()).toEqual([]);
    expect(source.getCurrentValue(P_THEME)).toBe('D');
    expect(source.getValueWithoutConfirmedTurn(3, P_THEME)).toBe('B');
  });

  it('reports observer failures without reopening semantic commit', () => {
    let source:
      | ReturnType<typeof createRealizationContextSource>
      | undefined;
    const observerErrors: unknown[] = [];
    const store = new TurnStore({
      capacity: 0,
      retainEvictedConfirmedTurn: (turn) => source?.retainEvictedConfirmedTurn(turn),
      onEvictConfirmedTurn: () => {
        throw new Error('observer failure');
      },
      reportEvictionObserverError: (error) => {
        observerErrors.push(error);
      },
    });
    const appliedHistory = new AppliedHistory(store);
    source = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });

    store.admitPending({
      id: 1,
      effects: [{ owner: P_THEME, before: 'A', after: 'B' }],
    });

    expect(confirmPendingTurnAt({ turnId: 1, store, appliedHistory })).toEqual({
      ok: true,
      turnId: 1,
    });
    expect(observerErrors).toHaveLength(1);
    expect(observerErrors[0]).toBeInstanceOf(Error);
    expect(source.getCurrentValue(P_THEME)).toBe('B');
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([]);
  });

  it('runs physical maintenance after confirmed history is forgotten at a quiescent confirmation boundary', () => {
    type User = { id: number; name: string; active: boolean };

    const notify = vi.fn();
    const owner = createEntitySignal<User, number>(
      { selectId: (user) => user.id },
      { notify } as any,
      'users'
    );
    const internal = owner as typeof owner & {
      __inspectSubjectResources?: (subjectId: number) => unknown;
    };

    owner.addOne({ id: 1, name: 'Alice', active: true });
    owner.addOne({ id: 2, name: 'Bob', active: false });
    const heldName = owner.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    owner.removeOne(1);
    const notifyCountBefore = notify.mock.calls.length;

    let source:
      | ReturnType<typeof createRealizationContextSource>
      | undefined;
    const store = new TurnStore({
      capacity: 0,
      retainEvictedConfirmedTurn: (turn) => source?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    source = createRealizationContextSource({
      store,
      appliedHistory,
    });

    store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 1,
          after: undefined,
          subjectId,
          structural: 'remove',
        },
      ],
    });

    expect(
      runPhysicalMaintenance({
        owner: owner as any,
        store,
        appliedHistory,
      })
    ).toEqual({
      candidateSubjectIds: [subjectId],
      reclaimed: [],
      alreadyRetired: [],
      blocked: [
        {
          subjectId,
          blockers: [
            {
              kind: 'pending-reference',
              turnId: 1,
              state: 'pending',
              structural: 'remove',
            },
          ],
        },
      ],
      causalDrift: [],
      physicalDrift: [],
      physicalPlanUnavailable: [],
    });

    const maintenanceResults: unknown[] = [];
    expect(
      confirmPendingTurnAt({
        turnId: 1,
        store,
        appliedHistory,
        retentionObserver: source,
        onMaintenanceMayBeUseful: () => {
          maintenanceResults.push(
            runPhysicalMaintenance({
              owner: owner as any,
              store,
              appliedHistory,
            })
          );
        },
      })
    ).toEqual({
      ok: true,
      turnId: 1,
    });

    expect(maintenanceResults).toEqual([
      {
        candidateSubjectIds: [subjectId],
        reclaimed: [subjectId],
        alreadyRetired: [],
        blocked: [],
        causalDrift: [],
        physicalDrift: [],
        physicalPlanUnavailable: [],
      },
    ]);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);
    expect(heldName()).toBeUndefined();
    expect(owner.byIdOrFail(2).name()).toBe('Bob');
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      subjectRevision: 2,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldName.__positionIds,
      retainedValueBacking: undefined,
    });
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);
  });

  it('runs physical maintenance when pending scalar subject reference settles into non-blocking confirmed history', () => {
    type User = { id: number; name: string; active: boolean };

    const notify = vi.fn();
    const owner = createEntitySignal<User, number>(
      { selectId: (user) => user.id },
      { notify } as any,
      'users'
    );
    const internal = owner as typeof owner & {
      __inspectSubjectResources?: (subjectId: number) => unknown;
    };

    owner.addOne({ id: 1, name: 'Alice', active: true });
    owner.addOne({ id: 2, name: 'Bob', active: false });
    const heldName = owner.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    owner.removeOne(1);
    const notifyCountBefore = notify.mock.calls.length;

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const source = createRealizationContextSource({
      store,
      appliedHistory,
    });

    store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'Alice',
          after: 'Alicia',
          subjectId,
        },
      ],
    });

    const maintenanceHints: unknown[] = [];
    const maintenanceResults: unknown[] = [];

    expect(
      confirmPendingTurnAt({
        turnId: 1,
        store,
        appliedHistory,
        retentionObserver: source,
        onMaintenanceMayBeUseful: (hint) => {
          maintenanceHints.push(hint);
          maintenanceResults.push(
            runPhysicalMaintenance({
              owner: owner as any,
              store,
              appliedHistory,
            })
          );
        },
      })
    ).toEqual({
      ok: true,
      turnId: 1,
    });

    expect(maintenanceHints).toEqual([
      {
        forgottenConfirmedTurnIds: [],
        invalidatedRedoTurnIds: [],
        settledPendingSubjectReference: true,
      },
    ]);
    expect(maintenanceResults).toEqual([
      {
        candidateSubjectIds: [subjectId],
        reclaimed: [subjectId],
        alreadyRetired: [],
        blocked: [],
        causalDrift: [],
        physicalDrift: [],
        physicalPlanUnavailable: [],
      },
    ]);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns().map(({ id }) => id)).toEqual([1]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([1]);
    expect(heldName()).toBeUndefined();
    expect(owner.byIdOrFail(2).name()).toBe('Bob');
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      subjectRevision: 2,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldName.__positionIds,
      retainedValueBacking: undefined,
    });
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);
  });

  it('permits a conservative maintenance hint when a settled subject reference remains blocked', () => {
    type User = { id: number; name: string; active: boolean };

    const notify = vi.fn();
    const owner = createEntitySignal<User, number>(
      { selectId: (user) => user.id },
      { notify } as any,
      'users'
    );

    owner.addOne({ id: 1, name: 'Alice', active: true });
    const heldName = owner.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    owner.removeOne(1);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const source = createRealizationContextSource({
      store,
      appliedHistory,
    });

    store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 1,
          after: undefined,
          subjectId,
          structural: 'remove',
        },
      ],
    });

    const maintenanceHints: unknown[] = [];
    const maintenanceResults: unknown[] = [];

    expect(
      confirmPendingTurnAt({
        turnId: 1,
        store,
        appliedHistory,
        retentionObserver: source,
        onMaintenanceMayBeUseful: (hint) => {
          maintenanceHints.push(hint);
          maintenanceResults.push(
            runPhysicalMaintenance({
              owner: owner as any,
              store,
              appliedHistory,
            })
          );
        },
      })
    ).toEqual({
      ok: true,
      turnId: 1,
    });

    expect(maintenanceHints).toEqual([
      {
        forgottenConfirmedTurnIds: [],
        invalidatedRedoTurnIds: [],
        settledPendingSubjectReference: true,
      },
    ]);
    expect(maintenanceResults).toEqual([
      {
        candidateSubjectIds: [subjectId],
        reclaimed: [],
        alreadyRetired: [],
        blocked: [
          {
            subjectId,
            blockers: [
              {
                kind: 'confirmed-restore-path',
                turnId: 1,
                state: 'confirmed-applied',
                structural: 'remove',
              },
            ],
          },
        ],
        causalDrift: [],
        physicalDrift: [],
        physicalPlanUnavailable: [],
      },
    ]);
    expect(heldName()).toBeUndefined();
  });

  it('runs physical maintenance when confirmation invalidates a redoable restore path without forgetting history', () => {
    type User = { id: number; name: string; active: boolean };

    const notify = vi.fn();
    const owner = createEntitySignal<User, number>(
      { selectId: (user) => user.id },
      { notify } as any,
      'users'
    );
    const internal = owner as typeof owner & {
      __inspectSubjectResources?: (subjectId: number) => unknown;
    };

    owner.addOne({ id: 1, name: 'Alice', active: true });
    owner.addOne({ id: 2, name: 'Bob', active: false });
    const heldName = owner.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    owner.removeOne(1);
    const notifyCountBefore = notify.mock.calls.length;

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const source = createRealizationContextSource({
      store,
      appliedHistory,
    });

    const redoableAdd = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 1,
          subjectId,
          structural: 'add',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(redoableAdd.id)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(redoableAdd.id)).toEqual({ ok: true });

    store.admitPending({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 1,
          after: 2,
        },
      ],
    });

    const maintenanceHints: unknown[] = [];
    const maintenanceResults: unknown[] = [];

    expect(
      confirmPendingTurnAt({
        turnId: 2,
        store,
        appliedHistory,
        retentionObserver: source,
        onMaintenanceMayBeUseful: (hint) => {
          maintenanceHints.push(hint);
          maintenanceResults.push(
            runPhysicalMaintenance({
              owner: owner as any,
              store,
              appliedHistory,
            })
          );
        },
      })
    ).toEqual({
      ok: true,
      turnId: 2,
    });

    expect(maintenanceHints).toEqual([
      {
        forgottenConfirmedTurnIds: [],
        invalidatedRedoTurnIds: [1],
        settledPendingSubjectReference: false,
      },
    ]);
    expect(maintenanceResults).toEqual([
      {
        candidateSubjectIds: [subjectId],
        reclaimed: [subjectId],
        alreadyRetired: [],
        blocked: [],
        causalDrift: [],
        physicalDrift: [],
        physicalPlanUnavailable: [],
      },
    ]);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns().map(({ id }) => id)).toEqual([1, 2]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([2]);
    expect(appliedHistory.getRedoTurnIds()).toEqual([]);
    expect(heldName()).toBeUndefined();
    expect(owner.byIdOrFail(2).name()).toBe('Bob');
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      subjectRevision: 2,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldName.__positionIds,
      retainedValueBacking: undefined,
    });
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);
  });
});
