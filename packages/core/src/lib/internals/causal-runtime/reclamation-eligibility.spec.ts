import { describe, expect, it } from 'vitest';

import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { assessReclamationEligibility } from './reclamation-eligibility';
import { TurnStore } from './turn-store';

const P_DRIVER_KEY = 3 as PositionId;
const P_DRIVER_NAME = 4 as PositionId;
const SUBJECT_DRIVER = 'driver-1';

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

    expect(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      })
    ).toEqual({
      eligible: false,
      blockers: [
        {
          kind: 'confirmed-restore-path',
          turnId: 1,
          state: 'confirmed-applied',
          structural: 'remove',
        },
      ],
    });
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

    expect(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      })
    ).toEqual({
      eligible: false,
      blockers: [
        {
          kind: 'confirmed-restore-path',
          turnId: 1,
          state: 'confirmed-redoable',
          structural: 'add',
        },
      ],
    });
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

    expect(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      })
    ).toEqual({
      eligible: true,
      blockers: [],
    });
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

    expect(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      })
    ).toEqual({
      eligible: true,
      blockers: [],
    });
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

    expect(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      })
    ).toEqual({
      eligible: false,
      blockers: [
        {
          kind: 'pending-reference',
          turnId: 2,
          state: 'pending',
          structural: undefined,
        },
      ],
    });
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

    expect(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      })
    ).toEqual({
      eligible: false,
      blockers: [
        {
          kind: 'pending-reference',
          turnId: 2,
          state: 'pending',
          structural: 'rekey',
        },
      ],
    });
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

    expect(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      })
    ).toEqual({
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
    });
  });

  it('marks a tombstoned subject eligible once retained restore paths and pending references are gone', () => {
    let appliedHistory: AppliedHistory | undefined;
    const store = new TurnStore({
      capacity: 1,
      retainEvictedConfirmedTurn: (turn) => {
        appliedHistory?.forgetRetainedTurn(turn.id);
      },
    });
    appliedHistory = new AppliedHistory(store);

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

    expect(
      assessReclamationEligibility({
        subjectId: SUBJECT_DRIVER,
        store,
        appliedHistory,
      })
    ).toEqual({
      eligible: true,
      blockers: [],
    });
  });
});
