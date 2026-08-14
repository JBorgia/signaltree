import { computed } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { createEntitySignal } from '../../entity-signal';
import type { PositionId } from '../../types';
import { AppliedHistory } from './applied-history';
import { TurnStore } from './turn-store';
import {
  reclaimAvailableSubjects,
  reclaimSubject,
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

  it('reclaims all tombstoned candidates through the same fresh coordinator flow', () => {
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
      owner: api as unknown as SubjectReclamationPhysicalOwner,
      store,
      appliedHistory,
    });

    expect(result.candidateSubjectIds).toEqual([subjectOne, subjectTwo]);
    expect(result.results.get(subjectOne)).toEqual({
      ok: true,
      kind: 'reclaimed',
      retired: ['retained-value-backing'],
    });
    expect(result.results.get(subjectTwo)).toEqual({
      ok: false,
      kind: 'blocked',
      blockers: [
        {
          kind: 'pending-reference',
          turnId: 11,
          state: 'pending',
          structural: undefined,
        },
      ],
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
});
