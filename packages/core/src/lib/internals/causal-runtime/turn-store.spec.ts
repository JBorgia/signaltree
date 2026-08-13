import type { PositionId } from './causal-types';
import { TurnStore } from './turn-store';

const P_ROOT = 1 as PositionId;
const P_PROFILE = 2 as PositionId;
const P_FIRST_NAME = 3 as PositionId;
const P_LAST_NAME = 4 as PositionId;
const P_SETTINGS = 5 as PositionId;
const P_THEME = 6 as PositionId;
const P_ENABLED = 7 as PositionId;
const P_LOCAL = 8 as PositionId;

describe('TurnStore', () => {
  it('admits one confirmed turn canonically and indexes only participating owners', () => {
    const store = new TurnStore();

    const turn = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
        {
          owner: P_THEME,
          before: 'light',
          after: 'dark',
        },
      ],
    });

    expect(turn).toEqual({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
        {
          owner: P_THEME,
          before: 'light',
          after: 'dark',
        },
      ],
      participants: [P_FIRST_NAME, P_THEME],
      state: 'confirmed',
    });
    expect(store.getTurn(1)).toEqual(turn);
    expect(store.getTurns()).toEqual([turn]);
    expect(store.getTurnIdsForPosition(P_FIRST_NAME)).toEqual([1]);
    expect(store.getTurnIdsForPosition(P_THEME)).toEqual([1]);
    expect(store.getTurnsForPosition(P_FIRST_NAME)).toEqual([turn]);
    expect(store.getTurnsForPosition(P_THEME)).toEqual([turn]);
    expect(store.getFrontier(P_FIRST_NAME)).toBe(1);
    expect(store.getFrontier(P_THEME)).toBe(1);
    expect(store.getTurnIdsForPosition(P_ROOT)).toEqual([]);
    expect(store.getTurnIdsForPosition(P_PROFILE)).toEqual([]);
    expect(store.getTurnIdsForPosition(P_SETTINGS)).toEqual([]);
    expect(store.getFrontier(P_ROOT)).toBeUndefined();
    expect(store.getFrontier(P_PROFILE)).toBeUndefined();
    expect(store.getFrontier(P_SETTINGS)).toBeUndefined();
    expect(store.inspect()).toEqual({
      turnIds: [1],
      positionIndex: {
        [P_FIRST_NAME]: [1],
        [P_THEME]: [1],
      },
      frontiers: {
        [P_FIRST_NAME]: 1,
        [P_THEME]: 1,
      },
    });
  });

  it('tracks pending turns outside the confirmed indexes until they are confirmed', () => {
    const store = new TurnStore();

    const pending = store.admitPending({
      id: 2,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
    });

    expect(pending).toEqual({
      id: 2,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
      participants: [P_FIRST_NAME],
      state: 'pending',
    });
    expect(store.getTurn(2)).toBeUndefined();
    expect(store.getPendingTurn(2)).toEqual(pending);
    expect(store.getPendingTurns()).toEqual([pending]);
    expect(store.getPendingTurnIds()).toEqual([2]);
    expect(store.hasPendingTurn(2)).toBe(true);
    expect(store.getTurns()).toEqual([]);
    expect(store.getTurnIdsForPosition(P_FIRST_NAME)).toEqual([]);
    expect(store.getFrontier(P_FIRST_NAME)).toBeUndefined();
    expect(store.inspect()).toEqual({
      turnIds: [],
      positionIndex: {},
      frontiers: {},
    });
  });

  it('rejects duplicate live TurnIds across pending and confirmed lifecycle states', () => {
    const store = new TurnStore();

    store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
    });

    expect(() =>
      store.admitPending({
        id: 1,
        effects: [
          {
            owner: P_THEME,
            before: 'light',
            after: 'dark',
          },
        ],
      })
    ).toThrow('Turn 1 already exists');

    expect(() =>
      store.admitConfirmed({
        id: 1,
        effects: [
          {
            owner: P_THEME,
            before: 'light',
            after: 'dark',
          },
        ],
      })
    ).toThrow('Turn 1 already exists');

    expect(store.getPendingTurn(1)?.state).toBe('pending');
    expect(store.getTurns()).toEqual([]);
  });

  it('rejects duplicate confirmed admissions', () => {
    const store = new TurnStore();

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
    });

    expect(() =>
      store.admitConfirmed({
        id: 1,
        effects: [
          {
            owner: P_THEME,
            before: 'light',
            after: 'dark',
          },
        ],
      })
    ).toThrow('Turn 1 already exists');

    expect(store.getTurns().map(({ id }) => id)).toEqual([1]);
    expect(store.getTurnIdsForPosition(P_FIRST_NAME)).toEqual([1]);
    expect(store.getTurnIdsForPosition(P_THEME)).toEqual([]);
  });

  it('confirms a pending turn into canonical confirmed order and removes it from pending', () => {
    const store = new TurnStore();

    store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: P_THEME,
          before: 'light',
          after: 'dark',
        },
      ],
    });
    store.admitPending({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
    });

    const confirmed = store.confirmPending(1);

    expect(confirmed).toEqual({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
      participants: [P_FIRST_NAME],
      state: 'confirmed',
    });
    expect(store.hasPendingTurn(1)).toBe(false);
    expect(store.getPendingTurn(1)).toBeUndefined();
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns().map(({ id }) => id)).toEqual([1, 2]);
    expect(store.getTurnIdsForPosition(P_FIRST_NAME)).toEqual([1]);
    expect(store.getTurnIdsForPosition(P_THEME)).toEqual([2]);
    expect(store.getFrontier(P_FIRST_NAME)).toBe(1);
    expect(store.getFrontier(P_THEME)).toBe(2);
  });

  it('keeps pending state intact when promotion collides with an existing confirmed TurnId', () => {
    const store = new TurnStore();

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_THEME,
          before: 'light',
          after: 'dark',
        },
      ],
    });

    const pendingTurns = store as unknown as {
      pendingTurns: Map<number, unknown>;
    };
    pendingTurns.pendingTurns.set(1, {
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
      participants: [P_FIRST_NAME],
      state: 'pending',
    });

    expect(() => store.confirmPending(1)).toThrow('Turn 1 already exists');
    expect(store.getPendingTurn(1)).toEqual({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
      participants: [P_FIRST_NAME],
      state: 'pending',
    });
    expect(store.getTurns().map(({ id }) => id)).toEqual([1]);
  });

  it('discards a pending turn without changing confirmed history', () => {
    const store = new TurnStore();

    const confirmed = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 'Ada',
          after: 'Grace',
        },
      ],
    });
    const pending = store.admitPending({
      id: 2,
      effects: [
        {
          owner: P_THEME,
          before: 'light',
          after: 'dark',
        },
      ],
    });

    expect(store.discardPending(2)).toEqual(pending);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([confirmed]);
    expect(store.inspect()).toEqual({
      turnIds: [1],
      positionIndex: {
        [P_FIRST_NAME]: [1],
      },
      frontiers: {
        [P_FIRST_NAME]: 1,
      },
    });
  });

  it('evicts retained history by whole canonical turn and clears participant indexes atomically', () => {
    const store = new TurnStore({ capacity: 2 });

    store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 0,
          after: 1,
        },
        {
          owner: P_THEME,
          before: 0,
          after: 1,
        },
      ],
    });
    store.admitConfirmed({
      id: 2,
      effects: [
        {
          owner: P_THEME,
          before: 1,
          after: 2,
        },
      ],
    });
    store.admitConfirmed({
      id: 3,
      effects: [
        {
          owner: P_FIRST_NAME,
          before: 1,
          after: 3,
        },
      ],
    });

    expect(store.getTurn(1)).toBeUndefined();
    expect(store.getTurn(2)?.id).toBe(2);
    expect(store.getTurn(3)?.id).toBe(3);
    expect(store.getTurns().map(({ id }) => id)).toEqual([2, 3]);
    expect(store.getTurnIdsForPosition(P_FIRST_NAME)).toEqual([3]);
    expect(store.getTurnIdsForPosition(P_THEME)).toEqual([2]);
    expect(store.getFrontier(P_FIRST_NAME)).toBe(3);
    expect(store.getFrontier(P_THEME)).toBe(2);
    expect(store.inspect()).toEqual({
      turnIds: [2, 3],
      positionIndex: {
        [P_THEME]: [2],
        [P_FIRST_NAME]: [3],
      },
      frontiers: {
        [P_THEME]: 2,
        [P_FIRST_NAME]: 3,
      },
    });
  });

  it('does not derive participants, indexes, or frontiers from structural coverage alone', () => {
    const store = new TurnStore();

    const turn = store.admitConfirmed({
      id: 1,
      effects: [
        {
          owner: P_LAST_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: 'profile-1',
        },
        {
          owner: P_FIRST_NAME,
          before: 'A',
          after: undefined,
          subjectId: 'profile-1',
          structural: 'remove',
          subjectPositions: [P_FIRST_NAME, P_LAST_NAME, P_ENABLED, P_LOCAL],
        },
      ],
    });

    expect(turn.participants).toEqual([P_LAST_NAME, P_FIRST_NAME]);
    expect(store.getTurnIdsForPosition(P_FIRST_NAME)).toEqual([1]);
    expect(store.getTurnIdsForPosition(P_LAST_NAME)).toEqual([1]);
    expect(store.getTurnIdsForPosition(P_ENABLED)).toEqual([]);
    expect(store.getTurnIdsForPosition(P_LOCAL)).toEqual([]);
    expect(store.getFrontier(P_FIRST_NAME)).toBe(1);
    expect(store.getFrontier(P_LAST_NAME)).toBe(1);
    expect(store.getFrontier(P_ENABLED)).toBeUndefined();
    expect(store.getFrontier(P_LOCAL)).toBeUndefined();
    expect(store.inspect()).toEqual({
      turnIds: [1],
      positionIndex: {
        [P_LAST_NAME]: [1],
        [P_FIRST_NAME]: [1],
      },
      frontiers: {
        [P_LAST_NAME]: 1,
        [P_FIRST_NAME]: 1,
      },
    });
  });
});
