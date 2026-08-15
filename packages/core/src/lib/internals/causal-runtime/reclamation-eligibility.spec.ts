import { describe, expect, it } from 'vitest';

import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import {
  assessReclamationEligibility,
  type ReclamationEligibility,
  type ReclamationEligibilityBlocker,
} from './reclamation-eligibility';
import { TurnStore } from './turn-store';

const P_DRIVER_KEY = 3 as PositionId;
const P_DRIVER_NAME = 4 as PositionId;
const SUBJECT_DRIVER = 'driver-1';

function compareBlockers(
  left: ReclamationEligibilityBlocker,
  right: ReclamationEligibilityBlocker
): number {
  const leftKey = `${left.kind}:${left.turnId}`;
  const rightKey = `${right.kind}:${right.turnId}`;
  return leftKey.localeCompare(rightKey);
}

function expectEligibility(
  actual: ReclamationEligibility,
  expected: {
    readonly eligible: boolean;
    readonly blockers: readonly ReclamationEligibilityBlocker[];
  }
): void {
  expect(actual.eligible).toBe(expected.eligible);
  expect([...actual.blockers].sort(compareBlockers)).toEqual(
    [...expected.blockers].sort(compareBlockers)
  );
}

describe('reclamation eligibility', () => {
  it('blocks reclamation while retained confirmed history can still restore a tombstoned subject', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const turn = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'u1',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(turn.id)).toEqual({ ok: true });

    expectEligibility(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      }),
      {
      eligible: false,
      blockers: [
        {
          kind: 'confirmed-restore-path',
          turnId: 1,
          state: 'confirmed-applied',
          structural: 'remove',
        },
      ],
      }
    );
  });

  it('blocks reclamation while redoable confirmed history can still re-add a tombstoned subject', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const turn = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: undefined,
          after: 'u1',
          subjectId: SUBJECT_DRIVER,
          structural: 'add',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(turn.id)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(turn.id)).toEqual({ ok: true });

    expectEligibility(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      }),
      {
      eligible: false,
      blockers: [
        {
          kind: 'confirmed-restore-path',
          turnId: 1,
          state: 'confirmed-redoable',
          structural: 'add',
        },
      ],
      }
    );
  });

  it('does not let confirmed rekey history alone block reclamation', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const turn = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'u1',
          after: 'u2',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(turn.id)).toEqual({ ok: true });

    expectEligibility(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      }),
      {
      eligible: true,
      blockers: [],
      }
    );
  });

  it('does not let confirmed scalar history alone block reclamation', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const turn = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(turn.id)).toEqual({ ok: true });

    expectEligibility(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      }),
      {
      eligible: true,
      blockers: [],
      }
    );
  });

  it('blocks reclamation while pending speculative state still references the subject', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    store.admitPending({
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

    expectEligibility(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      }),
      {
      eligible: false,
      blockers: [
        {
          kind: 'pending-reference',
          turnId: 2,
          state: 'pending',
          structural: undefined,
        },
      ],
      }
    );
  });

  it('blocks reclamation while pending rekey still references the subject', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    store.admitPending({
      id: 2,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'u1',
          after: 'u2',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
    });

    expectEligibility(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      }),
      {
      eligible: false,
      blockers: [
        {
          kind: 'pending-reference',
          turnId: 2,
          state: 'pending',
          structural: 'rekey',
        },
      ],
      }
    );
  });

  it('reports both confirmed restore and pending settlement blockers when both are present', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);

    const removeTurn = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'u1',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(removeTurn.id)).toEqual({ ok: true });

    store.admitPending({
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

    expectEligibility(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      }),
      {
      eligible: false,
      blockers: [
        {
          kind: 'pending-reference',
          turnId: 2,
          state: 'pending',
          structural: undefined,
        },
        {
          kind: 'confirmed-restore-path',
          turnId: 1,
          state: 'confirmed-applied',
          structural: 'remove',
        },
      ],
      }
    );
  });

  it('marks a tombstoned subject eligible once retained restore paths and pending references are gone', () => {
    const appliedHistoryRef: { current?: AppliedHistory } = {};
    const store = new TurnStore({
      capacity: 1,
      retainEvictedConfirmedTurn: (turn) => {
        appliedHistoryRef.current?.forgetRetainedTurn(turn.id);
      },
    });
    const appliedHistory = new AppliedHistory(store);
    appliedHistoryRef.current = appliedHistory;

    const removed = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'u1',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
        },
      ],
    });
    expect(appliedHistory.admitConfirmed(removed.id)).toEqual({ ok: true });

    const unrelated = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_DRIVER_NAME, before: 'A', after: 'B' }],
    });
    expect(appliedHistory.admitConfirmed(unrelated.id)).toEqual({ ok: true });

    expectEligibility(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      }),
      {
      eligible: true,
      blockers: [],
      }
    );
  });
});
