import { computed } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { createEntitySignal } from '../../entity-signal';
import type { PositionId } from '../../types';
import { AppliedHistory } from './applied-history';
import { TurnStore } from './turn-store';
import {
  reclaimAvailableSubjects,
  reclaimSubject,
  runPhysicalMaintenance,
  type SubjectReclamationPhysicalOwner,
} from './subject-reclamation-coordinator';

type User = { id: number; name: string; active: boolean };

type SubjectReclamationApi = ReturnType<typeof createEntitySignal<User, number>> & {
  __listSubjectReclamationCandidates?: () => readonly number[];
  __inspectSubjectResources?: (subjectId: number) => unknown;
  __prepareSubjectReclamation?: (
    subjectId: number,
    options: { causallyEligible: boolean }
  ) => unknown;
  __applyPreparedSubjectReclamation?: (prepared: unknown) => void;
  __restoreOne?: (
    key: number,
    entity: User,
    subjectId: number,
    beforeSubject?: number,
    afterSubject?: number
  ) => void;
};

function makeOwner() {
  const notify = vi.fn();
  const api = createEntitySignal<User, number>(
    { selectId: (user) => user.id },
    { notify } as any,
    'users'
  ) as SubjectReclamationApi;

  return {
    api,
    notify,
  };
}

describe('subject reclamation coordinator', () => {
  it('does not reach physical preparation when causal eligibility is blocked', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const prepare = vi.fn();
    const apply = vi.fn();

    store.admitPending({
      id: 1,
      effects: [
        {
          owner: 3 as PositionId,
          before: 'Alice',
          after: 'Alicia',
          subjectId: 7,
        },
      ],
    });

    expect(
      reclaimSubject({
        subjectId: 7,
        owner: {
          __prepareSubjectReclamation: prepare,
          __applyPreparedSubjectReclamation: apply,
        },
        store,
        appliedHistory,
      })
    ).toEqual({
      ok: false,
      kind: 'blocked',
      blockers: [
        {
          kind: 'pending-reference',
          turnId: 1,
          state: 'pending',
          structural: undefined,
        },
      ],
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('reclaims an eligible tombstoned subject without publication or reactive churn', () => {
    const { api, notify } = makeOwner();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldName = api.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    let runs = 0;
    const observedName = computed(() => {
      runs++;
      return heldName() ?? 'absent';
    });

    expect(observedName()).toBe('Alice');
    api.removeOne(1);
    expect(observedName()).toBe('absent');
    const notifyCountBefore = notify.mock.calls.length;

    expect(
      reclaimSubject({
        subjectId,
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      ok: true,
      kind: 'reclaimed',
      retired: ['retained-value-backing'],
    });

    expect(api.__inspectSubjectResources?.(subjectId)).toEqual({
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
    expect(observedName()).toBe('absent');
    expect(runs).toBe(2);
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);
  });

  it('refuses physical drift between prepare and apply', () => {
    const { api } = makeOwner();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldName = api.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }
    api.removeOne(1);

    const driftingOwner: SubjectReclamationPhysicalOwner = {
      __prepareSubjectReclamation: (candidate, options) => {
        const prepared = api.__prepareSubjectReclamation?.(candidate, options);
        api.__restoreOne?.(1, { id: 1, name: 'Alice', active: true }, candidate);
        return prepared as any;
      },
      __applyPreparedSubjectReclamation: (prepared) => {
        api.__applyPreparedSubjectReclamation?.(prepared);
      },
    };

    expect(
      reclaimSubject({
        subjectId,
        owner: driftingOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      ok: false,
      kind: 'physical-drift',
      message: 'Prepared reclamation for subject 1 is stale.',
    });
    expect(api.byIdOrFail(1).name()).toBe('Alice');
  });

  it('refuses causal drift when a new pending reference appears after assessment', () => {
    const { api } = makeOwner();
    const appliedHistory = {
      getAppliedTurnIds: () => [],
      getRedoTurnIds: () => [],
    };

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldName = api.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }
    api.removeOne(1);

    let pendingReads = 0;
    const store = {
      getTurns: () => [],
      getPendingTurns: () => {
        pendingReads++;
        return pendingReads === 1
          ? []
          : [
              {
                id: 9,
                effects: [
                  {
                    owner: 4 as PositionId,
                    before: 'Alice',
                    after: 'Alicia',
                    subjectId,
                  },
                ],
              },
            ];
      },
    };

    expect(
      reclaimSubject({
        subjectId,
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      ok: false,
      kind: 'causal-drift',
      blockers: [
        {
          kind: 'pending-reference',
          turnId: 9,
          state: 'pending',
          structural: undefined,
        },
      ],
    });
    expect(api.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldName.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
  });

  it('does not let unrelated causal activity invalidate reclamation for this subject', () => {
    const { api } = makeOwner();
    const appliedHistory = {
      getAppliedTurnIds: () => [],
      getRedoTurnIds: () => [],
    };

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldName = api.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }
    api.removeOne(1);

    let pendingReads = 0;
    const store = {
      getTurns: () => [],
      getPendingTurns: () => {
        pendingReads++;
        return pendingReads === 1
          ? []
          : [
              {
                id: 10,
                effects: [
                  {
                    owner: 4 as PositionId,
                    before: 'Bob',
                    after: 'Bobby',
                    subjectId: 999,
                  },
                ],
              },
            ];
      },
    };

    expect(
      reclaimSubject({
        subjectId,
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      ok: true,
      kind: 'reclaimed',
      retired: ['retained-value-backing'],
    });
    expect(heldName()).toBeUndefined();
  });

  it('treats repeated reclamation of the same retired subject as a silent no-op', () => {
    const { api, notify } = makeOwner();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldName = api.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    api.removeOne(1);
    const notifyCountBeforeFirst = notify.mock.calls.length;

    expect(
      reclaimSubject({
        subjectId,
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      ok: true,
      kind: 'reclaimed',
      retired: ['retained-value-backing'],
    });

    const notifyCountBeforeSecond = notify.mock.calls.length;
    expect(
      reclaimSubject({
        subjectId,
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      ok: false,
      kind: 'already-retired',
    });

    expect(api.__inspectSubjectResources?.(subjectId)).toEqual({
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
    expect(heldName()).toBeUndefined();
    expect(notify.mock.calls).toHaveLength(notifyCountBeforeSecond);
    expect(notifyCountBeforeSecond).toBe(notifyCountBeforeFirst);
  });

  it('reclaims an explicit best-effort subject sweep without cross-subject rollback', () => {
    const { api, notify } = makeOwner();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    api.addOne({ id: 1, name: 'Alice', active: true });
    api.addOne({ id: 2, name: 'Bob', active: true });
    api.addOne({ id: 3, name: 'Cara', active: true });

    const heldOne = api.byIdOrFail(1).name;
    const heldTwo = api.byIdOrFail(2).name;
    const subjectOne = heldOne.__subjectIds?.[0];
    const subjectTwo = heldTwo.__subjectIds?.[0];
    if (subjectOne === undefined || subjectTwo === undefined) {
      throw new Error('Expected subject metadata for held fields');
    }

    api.removeOne(1);
    api.removeOne(2);

    store.admitPending({
      id: 11,
      effects: [
        {
          owner: 4 as PositionId,
          before: 'Bob',
          after: 'Bobby',
          subjectId: subjectTwo,
        },
      ],
    });

    const notifyCountBefore = notify.mock.calls.length;
    const result = reclaimAvailableSubjects({
      subjectIds: [subjectOne, subjectTwo, subjectOne],
      owner: api as unknown as SubjectReclamationPhysicalOwner,
      store,
      appliedHistory,
    });

    expect(result).toEqual({
      reclaimed: [subjectOne],
      alreadyRetired: [subjectOne],
      blocked: [
        {
          subjectId: subjectTwo,
          blockers: [
            {
              kind: 'pending-reference',
              turnId: 11,
              state: 'pending',
              structural: undefined,
            },
          ],
        },
      ],
      causalDrift: [],
      physicalDrift: [],
      physicalPlanUnavailable: [],
    });

    expect(api.__inspectSubjectResources?.(subjectOne)).toEqual({
      subjectId: subjectOne,
      state: 'tombstoned',
      subjectRevision: 2,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldOne.__positionIds,
      retainedValueBacking: undefined,
    });
    expect(api.__inspectSubjectResources?.(subjectTwo)).toEqual({
      subjectId: subjectTwo,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldTwo.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);
  });

  it('runs physical maintenance as a synchronous no-op when no tombstoned candidates exist', () => {
    const { api, notify } = makeOwner();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    api.addOne({ id: 1, name: 'Alice', active: true });
    const notifyCountBefore = notify.mock.calls.length;

    expect(
      runPhysicalMaintenance({
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      candidateSubjectIds: [],
      reclaimed: [],
      alreadyRetired: [],
      blocked: [],
      causalDrift: [],
      physicalDrift: [],
      physicalPlanUnavailable: [],
    });
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);
  });

  it('runs physical maintenance with the same mixed outcomes as the explicit sweep', () => {
    const { api, notify } = makeOwner();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    api.addOne({ id: 1, name: 'Alice', active: true });
    api.addOne({ id: 2, name: 'Bob', active: true });
    api.addOne({ id: 3, name: 'Cara', active: true });

    const heldOne = api.byIdOrFail(1).name;
    const heldTwo = api.byIdOrFail(2).name;
    const subjectOne = heldOne.__subjectIds?.[0];
    const subjectTwo = heldTwo.__subjectIds?.[0];
    if (subjectOne === undefined || subjectTwo === undefined) {
      throw new Error('Expected subject metadata for held fields');
    }

    api.removeOne(1);
    api.removeOne(2);

    store.admitPending({
      id: 12,
      effects: [
        {
          owner: 4 as PositionId,
          before: 'Bob',
          after: 'Bobby',
          subjectId: subjectTwo,
        },
      ],
    });

    const turnsBefore = store.getTurns();
    const pendingBefore = store.getPendingTurns();
    const appliedBefore = appliedHistory.getAppliedTurnIds();
    const redoBefore = appliedHistory.getRedoTurnIds();
    const notifyCountBefore = notify.mock.calls.length;

    expect(
      runPhysicalMaintenance({
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      candidateSubjectIds: [subjectOne, subjectTwo],
      reclaimed: [subjectOne],
      alreadyRetired: [],
      blocked: [
        {
          subjectId: subjectTwo,
          blockers: [
            {
              kind: 'pending-reference',
              turnId: 12,
              state: 'pending',
              structural: undefined,
            },
          ],
        },
      ],
      causalDrift: [],
      physicalDrift: [],
      physicalPlanUnavailable: [],
    });

    expect(store.getTurns()).toEqual(turnsBefore);
    expect(store.getPendingTurns()).toEqual(pendingBefore);
    expect(appliedHistory.getAppliedTurnIds()).toEqual(appliedBefore);
    expect(appliedHistory.getRedoTurnIds()).toEqual(redoBefore);
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);
  });

  it('runs physical maintenance idempotently across repeated invocations without new state', () => {
    const { api, notify } = makeOwner();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldName = api.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    api.removeOne(1);

    expect(
      runPhysicalMaintenance({
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      candidateSubjectIds: [subjectId],
      reclaimed: [subjectId],
      alreadyRetired: [],
      blocked: [],
      causalDrift: [],
      physicalDrift: [],
      physicalPlanUnavailable: [],
    });

    const notifyCountBeforeSecond = notify.mock.calls.length;
    expect(
      runPhysicalMaintenance({
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      candidateSubjectIds: [subjectId],
      reclaimed: [],
      alreadyRetired: [subjectId],
      blocked: [],
      causalDrift: [],
      physicalDrift: [],
      physicalPlanUnavailable: [],
    });
    expect(heldName()).toBeUndefined();
    expect(notify.mock.calls).toHaveLength(notifyCountBeforeSecond);
  });

  it('reclaims a previously blocked tombstone on the next maintenance run after pending settlement', () => {
    const { api, notify } = makeOwner();
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldName = api.byIdOrFail(1).name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    api.removeOne(1);
    store.admitPending({
      id: 13,
      effects: [
        {
          owner: 4 as PositionId,
          before: 'Alice',
          after: 'Alicia',
          subjectId,
        },
      ],
    });

    expect(
      runPhysicalMaintenance({
        owner: api as unknown as SubjectReclamationPhysicalOwner,
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
              turnId: 13,
              state: 'pending',
              structural: undefined,
            },
          ],
        },
      ],
      causalDrift: [],
      physicalDrift: [],
      physicalPlanUnavailable: [],
    });

    const notifyCountBeforeSecond = notify.mock.calls.length;
    expect(store.confirmPending(13)?.state).toBe('confirmed');
    expect(appliedHistory.admitConfirmed(13)).toEqual({ ok: true });
    expect(appliedHistory.forgetRetainedTurn(13)).toEqual({
      wasApplied: true,
      wasRedoable: false,
    });

    expect(
      runPhysicalMaintenance({
        owner: api as unknown as SubjectReclamationPhysicalOwner,
        store,
        appliedHistory,
      })
    ).toEqual({
      candidateSubjectIds: [subjectId],
      reclaimed: [subjectId],
      alreadyRetired: [],
      blocked: [],
      causalDrift: [],
      physicalDrift: [],
      physicalPlanUnavailable: [],
    });
    expect(heldName()).toBeUndefined();
    expect(notify.mock.calls).toHaveLength(notifyCountBeforeSecond);
  });
});
