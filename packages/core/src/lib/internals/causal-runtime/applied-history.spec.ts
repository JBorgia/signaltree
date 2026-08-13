import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { TurnStore } from './turn-store';

const P_FIRST_NAME = 3 as PositionId;
const P_LAST_NAME = 4 as PositionId;
const P_THEME = 6 as PositionId;
const P_NOTIFICATIONS = 9 as PositionId;

describe('AppliedHistory', () => {
  it('distinguishes canonical confirmed history from current applied history after undo bookkeeping', () => {
    const store = new TurnStore();
    const history = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [
        { owner: P_FIRST_NAME, before: 'A', after: 'B' },
        { owner: P_LAST_NAME, before: 'L', after: 'H' },
      ],
    });
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });
    store.admitConfirmed({
      id: 3,
      effects: [{ owner: P_FIRST_NAME, before: 'C', after: 'D' }],
    });

    expect(history.admitConfirmed(1)).toEqual({ ok: true });
    expect(history.admitConfirmed(2)).toEqual({ ok: true });
    expect(history.admitConfirmed(3)).toEqual({ ok: true });
    expect(history.moveConfirmedTurnToRedo(3)).toEqual({ ok: true });

    expect(store.getTurns().map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(history.inspect()).toEqual({
      appliedTurnIds: [1, 2],
      redoTurnIds: [3],
      frontiers: {
        [P_FIRST_NAME]: 2,
        [P_LAST_NAME]: 1,
      },
    });
    expect(history.getFrontier(P_FIRST_NAME)).toBe(2);
    expect(history.getFrontier(P_LAST_NAME)).toBe(1);
  });

  it('clears whole-turn redo state when a new confirmed turn is admitted after undo bookkeeping', () => {
    const store = new TurnStore();
    const history = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_THEME, before: 'light', after: 'dark' }],
    });
    store.admitConfirmed({
      id: 3,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });

    history.admitConfirmed(1);
    history.admitConfirmed(2);
    history.admitConfirmed(3);
    history.moveConfirmedTurnToRedo(3);

    store.admitConfirmed({
      id: 4,
      effects: [{ owner: P_FIRST_NAME, before: 'C', after: 'E' }],
    });

    expect(history.admitConfirmed(4)).toEqual({ ok: true });
    expect(store.getTurns().map(({ id }) => id)).toEqual([1, 2, 3, 4]);
    expect(history.inspect()).toEqual({
      appliedTurnIds: [1, 2, 4],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: 4,
        [P_THEME]: 2,
      },
    });
  });

  it('refuses removing a confirmed turn that is not the applied frontier for its participant', () => {
    const store = new TurnStore();
    const history = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });

    history.admitConfirmed(1);
    history.admitConfirmed(2);

    const before = history.inspect();

    expect(history.moveConfirmedTurnToRedo(1)).toEqual({
      ok: false,
      reason: 'not-applied-frontier',
    });
    expect(history.inspect()).toEqual(before);
  });

  it('allows a disjoint earlier turn to move to redo while an unrelated later turn stays applied', () => {
    const store = new TurnStore();
    const history = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_THEME, before: 'light', after: 'dark' }],
    });

    expect(history.admitConfirmed(1)).toEqual({ ok: true });
    expect(history.admitConfirmed(2)).toEqual({ ok: true });
    expect(history.moveConfirmedTurnToRedo(1)).toEqual({ ok: true });

    expect(store.getTurns().map(({ id }) => id)).toEqual([1, 2]);
    expect(history.inspect()).toEqual({
      appliedTurnIds: [2],
      redoTurnIds: [1],
      frontiers: {
        [P_THEME]: 2,
      },
    });
    expect(history.getFrontier(P_FIRST_NAME)).toBeUndefined();
    expect(history.getFrontier(P_THEME)).toBe(2);
  });

  it('keeps a disjoint redoable turn when a new confirmed turn lands on an unrelated position', () => {
    const store = new TurnStore();
    const history = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_THEME, before: 'light', after: 'dark' }],
    });

    expect(history.admitConfirmed(1)).toEqual({ ok: true });
    expect(history.admitConfirmed(2)).toEqual({ ok: true });
    expect(history.moveConfirmedTurnToRedo(1)).toEqual({ ok: true });

    store.admitConfirmed({
      id: 3,
      effects: [{ owner: P_NOTIFICATIONS, before: false, after: true }],
    });

    expect(history.admitConfirmed(3)).toEqual({ ok: true });
    expect(history.inspect()).toEqual({
      appliedTurnIds: [2, 3],
      redoTurnIds: [1],
      frontiers: {
        [P_THEME]: 2,
        [P_NOTIFICATIONS]: 3,
      },
    });
  });

  it('invalidates an unapplied overlapping turn atomically when a participant takes a new branch', () => {
    const store = new TurnStore();
    const history = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [
        { owner: P_FIRST_NAME, before: 'A', after: 'B' },
        { owner: P_THEME, before: 'light', after: 'dark' },
      ],
    });

    expect(history.admitConfirmed(1)).toEqual({ ok: true });
    expect(history.moveConfirmedTurnToRedo(1)).toEqual({ ok: true });

    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });

    expect(history.admitConfirmed(2)).toEqual({ ok: true });
    expect(history.inspect()).toEqual({
      appliedTurnIds: [2],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: 2,
      },
    });
  });

  it('reapplies a disjoint earlier turn at canonical position instead of appending it after later applied work', () => {
    const store = new TurnStore();
    const history = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_THEME, before: 'light', after: 'dark' }],
    });

    expect(history.admitConfirmed(1)).toEqual({ ok: true });
    expect(history.admitConfirmed(2)).toEqual({ ok: true });
    expect(history.moveConfirmedTurnToRedo(1)).toEqual({ ok: true });
    expect(history.moveRedoTurnToApplied(1)).toEqual({ ok: true });

    expect(history.inspect()).toEqual({
      appliedTurnIds: [1, 2],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: 1,
        [P_THEME]: 2,
      },
    });
  });

  it('enforces same-position prefix progression for redo and allows the later turn only after the predecessor is reapplied', () => {
    const store = new TurnStore();
    const history = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_FIRST_NAME, before: 'B', after: 'C' }],
    });

    expect(history.admitConfirmed(1)).toEqual({ ok: true });
    expect(history.admitConfirmed(2)).toEqual({ ok: true });
    expect(history.moveConfirmedTurnToRedo(2)).toEqual({ ok: true });
    expect(history.moveConfirmedTurnToRedo(1)).toEqual({ ok: true });

    const beforeBlockedPrepare = history.inspect();

    expect(history.prepareReapplyConfirmedTurn(2)).toEqual({
      ok: false,
      reason: 'not-redoable-next',
    });
    expect(history.inspect()).toEqual(beforeBlockedPrepare);

    expect(history.moveRedoTurnToApplied(1)).toEqual({ ok: true });
    expect(history.prepareReapplyConfirmedTurn(2)).toEqual({
      ok: true,
      transition: { turnId: 2 },
    });
    expect(history.moveRedoTurnToApplied(2)).toEqual({ ok: true });

    expect(history.inspect()).toEqual({
      appliedTurnIds: [1, 2],
      redoTurnIds: [],
      frontiers: {
        [P_FIRST_NAME]: 2,
      },
    });
  });

  it('refuses cross-position reapply atomically when one participant is not ready for that confirmed prefix', () => {
    const store = new TurnStore();
    const history = new AppliedHistory(store);

    store.admitConfirmed({
      id: 1,
      effects: [{ owner: P_FIRST_NAME, before: 'A', after: 'B' }],
    });
    store.admitConfirmed({
      id: 2,
      effects: [
        { owner: P_FIRST_NAME, before: 'B', after: 'C' },
        { owner: P_THEME, before: 'light', after: 'dark' },
      ],
    });

    expect(history.admitConfirmed(1)).toEqual({ ok: true });
    expect(history.admitConfirmed(2)).toEqual({ ok: true });
    expect(history.moveConfirmedTurnToRedo(2)).toEqual({ ok: true });
    expect(history.moveConfirmedTurnToRedo(1)).toEqual({ ok: true });

    const before = history.inspect();

    expect(history.prepareReapplyConfirmedTurn(2)).toEqual({
      ok: false,
      reason: 'not-redoable-next',
    });
    expect(history.inspect()).toEqual(before);
  });
});
