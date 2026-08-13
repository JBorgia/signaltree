import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { confirmPendingTurnAt } from './pending-confirmation';
import { createRealizationContextSource } from './realization-context';
import { TurnStore } from './turn-store';

const P_THEME = 1 as PositionId;

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
});
