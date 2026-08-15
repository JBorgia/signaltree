import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { createRealizationContextSource } from './realization-context';
import { TurnStore } from './turn-store';

const P_FIRST_NAME = 3 as PositionId;

describe('realization context source', () => {
  it('projects current value and projected value without a confirmed turn across pending causal disposition', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const source = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'A']]),
      store,
      appliedHistory,
    });

    store.admitPending({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    expect(source.getCurrentValue(P_FIRST_NAME)).toBe('C');
    expect(source.getValueWithoutConfirmedTurn(confirmed.id, P_FIRST_NAME)).toBe('B');
    expect(source.getValueWithoutPendingTurn(1, P_FIRST_NAME)).toBe('C');

    expect(store.discardPending(1)?.id).toBe(1);

    expect(source.getCurrentValue(P_FIRST_NAME)).toBe('C');
    expect(source.getValueWithoutConfirmedTurn(confirmed.id, P_FIRST_NAME)).toBe('A');
  });

  it('projects only the external predecessor for repeated same-owner effects', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const source = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'A']]),
      store,
      appliedHistory,
    });

    store.admitPending({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    const confirmed = store.admitConfirmed({
      id: 2,
      effects: [
        { owner: P_FIRST_NAME, before: 'B', after: 'C' },
        { owner: P_FIRST_NAME, before: 'C', after: 'D' },
      ],
    });
    expect(appliedHistory.admitConfirmed(confirmed.id)).toEqual({ ok: true });

    expect(store.discardPending(1)?.id).toBe(1);

    expect(source.getCurrentValue(P_FIRST_NAME)).toBe('D');
    expect(source.getValueWithoutConfirmedTurn(confirmed.id, P_FIRST_NAME)).toBe('A');
    expect(source.getValueWithoutPendingTurn(1, P_FIRST_NAME)).toBe('D');
  });

  it('folds an evicted confirmed contribution into retained baseline only when it is still applied', () => {
    const sourceRef: {
      current?: ReturnType<typeof createRealizationContextSource>;
    } = {};
    const store = new TurnStore({
      capacity: 1,
      retainEvictedConfirmedTurn: (turn) => sourceRef.current?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    const source = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'A']]),
      store,
      appliedHistory,
    });
    sourceRef.current = source;

    const t1 = store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    expect(appliedHistory.admitConfirmed(t1.id)).toEqual({ ok: true });

    const t2 = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });
    expect(appliedHistory.admitConfirmed(t2.id)).toEqual({ ok: true });

    expect(store.getTurn(t1.id)).toBeUndefined();
    expect(appliedHistory.getAppliedTurnIds()).toEqual([2]);
    expect(appliedHistory.getRedoTurnIds()).toEqual([]);
    expect(source.getCurrentValue(P_FIRST_NAME)).toBe('C');
    expect(source.getValueWithoutConfirmedTurn(t2.id, P_FIRST_NAME)).toBe('B');
  });

  it('does not fold an evicted confirmed contribution into retained baseline after it has been unapplied', () => {
    const sourceRef: {
      current?: ReturnType<typeof createRealizationContextSource>;
    } = {};
    const store = new TurnStore({
      capacity: 1,
      retainEvictedConfirmedTurn: (turn) => sourceRef.current?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    const source = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'A']]),
      store,
      appliedHistory,
    });
    sourceRef.current = source;

    const t1 = store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    expect(appliedHistory.admitConfirmed(t1.id)).toEqual({ ok: true });
    expect(appliedHistory.moveConfirmedTurnToRedo(t1.id)).toEqual({ ok: true });

    const t2 = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'C' }],
    });
    expect(appliedHistory.admitConfirmed(t2.id)).toEqual({ ok: true });

    expect(store.getTurn(t1.id)).toBeUndefined();
    expect(appliedHistory.getAppliedTurnIds()).toEqual([2]);
    expect(appliedHistory.getRedoTurnIds()).toEqual([]);
    expect(source.getCurrentValue(P_FIRST_NAME)).toBe('C');
    expect(source.getValueWithoutConfirmedTurn(t2.id, P_FIRST_NAME)).toBe('A');
  });

  it('captures forgotten confirmed turns as a consumable quiescent snapshot', () => {
    const sourceRef: {
      current?: ReturnType<typeof createRealizationContextSource>;
    } = {};
    const store = new TurnStore({
      capacity: 1,
      retainEvictedConfirmedTurn: (turn) => sourceRef.current?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    const source = createRealizationContextSource({
      baselineValues: new Map([[P_FIRST_NAME, 'A']]),
      store,
      appliedHistory,
    });
    sourceRef.current = source;

    const first = store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    expect(appliedHistory.admitConfirmed(first.id)).toEqual({ ok: true });

    const second = store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });
    expect(appliedHistory.admitConfirmed(second.id)).toEqual({ ok: true });

    expect(source.consumeForgottenConfirmedTurns()).toEqual([
      {
        id: 1,
        effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
        participants: [P_FIRST_NAME],
        state: 'confirmed',
      },
    ]);
    expect(source.consumeForgottenConfirmedTurns()).toEqual([]);
  });
});
