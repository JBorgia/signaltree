import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { rollbackPendingTurnAt } from './pending-rollback';
import { createPositionRegistry } from '../position-registry';
import { createRealizationContextSource } from './realization-context';
import { createGreenfieldTransactionDraft } from './greenfield-transactions';
import { undoConfirmedAt } from './confirmed-undo';
import { TurnStore } from './turn-store';

const P_ROOT = 1 as PositionId;
const P_PROFILE = 2 as PositionId;
const P_THEME = 3 as PositionId;
const P_FIRST_NAME = 4 as PositionId;
const P_LAST_NAME = 5 as PositionId;
const P_DRIVER_KEY = 3 as PositionId;
const P_DRIVER_NAME = 4 as PositionId;
const P_DRIVER_ENABLED = 5 as PositionId;
const SUBJECT_DRIVER = 'driver-1';

describe('greenfield transactions', () => {
  it('seals explicitly captured live effects into one pending turn, then confirms without additional physical writes', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const values = new Map<PositionId, unknown>([[P_THEME, 'light']]);
    let physicalWrites = 0;

    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
    });

    expect(draft.getLifecycle()).toBe('open');

    values.set(P_THEME, 'dark');
    physicalWrites += 1;

    draft.capture({
      owner: P_THEME,
      before: 'light',
      after: 'dark',
    });

    expect(values.get(P_THEME)).toBe('dark');
    expect(physicalWrites).toBe(1);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);

    const pendingTurn = draft.seal();

    expect(draft.getLifecycle()).toBe('sealed');

    expect(pendingTurn).toEqual({
      id: 1,
      effects: [{ owner: P_THEME, before: 'light', after: 'dark' }],
      participants: [P_THEME],
      state: 'pending',
    });
    expect(store.getPendingTurn(1)).toEqual(pendingTurn);
    expect(store.getTurns()).toEqual([]);

    expect(draft.confirm()).toEqual({ ok: true, turnId: 1 });
  expect(draft.getLifecycle()).toBe('confirmed');
    expect(physicalWrites).toBe(1);
    expect(values.get(P_THEME)).toBe('dark');
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([
      {
        id: 1,
        effects: [{ owner: P_THEME, before: 'light', after: 'dark' }],
        participants: [P_THEME],
        state: 'confirmed',
      },
    ]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([1]);
  });

  it('keeps explicit attribution local when two drafts interleave writes', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const values = new Map<PositionId, unknown>([
      [P_FIRST_NAME, 'Ada'],
      [P_LAST_NAME, 'Lovelace'],
    ]);

    const firstDraft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
    });
    const secondDraft = createGreenfieldTransactionDraft({
      turnId: 2,
      store,
      appliedHistory,
    });

    values.set(P_FIRST_NAME, 'Grace');
    firstDraft.capture({
      owner: P_FIRST_NAME,
      before: 'Ada',
      after: 'Grace',
    });
    values.set(P_LAST_NAME, 'Hopper');
    secondDraft.capture({
      owner: P_LAST_NAME,
      before: 'Lovelace',
      after: 'Hopper',
    });

    const firstPending = firstDraft.seal();
    const secondPending = secondDraft.seal();

    expect(firstPending.effects).toEqual([
      { owner: P_FIRST_NAME, before: 'Ada', after: 'Grace' },
    ]);
    expect(secondPending.effects).toEqual([
      { owner: P_LAST_NAME, before: 'Lovelace', after: 'Hopper' },
    ]);
    expect(store.getPendingTurnIds()).toEqual([1, 2]);
  });

  it('nets repeated scalar writes within one draft from the first before value to the final after value', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const values = new Map<PositionId, unknown>([[P_THEME, 'A']]);

    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
    });

    values.set(P_THEME, 'B');
    draft.capture({
      owner: P_THEME,
      before: 'A',
      after: 'B',
    });
    values.set(P_THEME, 'C');
    draft.capture({
      owner: P_THEME,
      before: 'B',
      after: 'C',
    });

    expect(draft.seal()).toEqual({
      id: 1,
      effects: [{ owner: P_THEME, before: 'A', after: 'C' }],
      participants: [P_THEME],
      state: 'pending',
    });
  });

  it('aborts a sealed transaction by delegating to pending rollback and marks the lifecycle aborted only on success', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const theme = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(theme).toBe(P_THEME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });
    const values = new Map<PositionId, unknown>([[P_THEME, 'B']]);
    const appliedEffects: Array<ReadonlyArray<{ owner: PositionId; before: unknown; after: unknown }>> = [];
    const port = {
      applyAtomically(effects: readonly { owner: PositionId; before: unknown; after: unknown }[]) {
        const staged = new Map(values);

        for (const effect of effects) {
          expect(staged.get(effect.owner)).toEqual(effect.before);
          staged.set(effect.owner, effect.after);
        }

        appliedEffects.push(effects.map((effect) => ({ ...effect })));
        values.clear();
        for (const [positionId, value] of staged) {
          values.set(positionId, value);
        }
      },
    };
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: (turnId) =>
        rollbackPendingTurnAt({
          authority: P_PROFILE,
          turnId,
          store,
          topology,
          port,
          realizationContext,
        }),
    });

    draft.capture({ owner: P_THEME, before: 'A', after: 'B' });
    draft.seal();

    expect(draft.abort()).toEqual({ ok: true, turnId: 1 });
    expect(draft.getLifecycle()).toBe('aborted');
    expect(appliedEffects).toEqual([[{ owner: P_THEME, before: 'B', after: 'A' }]]);
    expect(values.get(P_THEME)).toBe('A');
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);
  });

  it('preserves later confirmed work when aborting a sealed transaction, then later undo uses the surviving context', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const theme = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(theme).toBe(P_THEME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });
    const values = new Map<PositionId, unknown>([[P_THEME, 'C']]);
    const appliedEffects: Array<ReadonlyArray<{ owner: PositionId; before: unknown; after: unknown }>> = [];
    const port = {
      applyAtomically(effects: readonly { owner: PositionId; before: unknown; after: unknown }[]) {
        const staged = new Map(values);

        for (const effect of effects) {
          expect(staged.get(effect.owner)).toEqual(effect.before);
          staged.set(effect.owner, effect.after);
        }

        appliedEffects.push(effects.map((effect) => ({ ...effect })));
        values.clear();
        for (const [positionId, value] of staged) {
          values.set(positionId, value);
        }
      },
    };
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: (turnId) =>
        rollbackPendingTurnAt({
          authority: P_PROFILE,
          turnId,
          store,
          topology,
          port,
          realizationContext,
        }),
    });

    draft.capture({ owner: P_THEME, before: 'A', after: 'B' });
    draft.seal();
    store.admitConfirmed({
      id: 2,
      effects: [{ owner: P_THEME, before: 'B', after: 'C' }],
    });
    expect(appliedHistory.admitConfirmed(2)).toEqual({ ok: true });

    expect(draft.abort()).toEqual({ ok: true, turnId: 1 });
    expect(draft.getLifecycle()).toBe('aborted');
    expect(appliedEffects[0]).toEqual([]);
    expect(values.get(P_THEME)).toBe('C');
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns().map(({ id }) => id)).toEqual([2]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([2]);

    expect(
      undoConfirmedAt({
        authority: P_PROFILE,
        store,
        appliedHistory,
        topology,
        port,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: 2 });
    expect(appliedEffects[1]).toEqual([{ owner: P_THEME, before: 'C', after: 'A' }]);
    expect(values.get(P_THEME)).toBe('A');
  });

  it('keeps a sealed transaction sealed when abort delegation refuses', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: () => ({ ok: false, refusal: { kind: 'dependency-conflict' } }),
    });

    draft.capture({ owner: P_THEME, before: 'A', after: 'B' });
    draft.seal();

    expect(draft.abort()).toEqual({ ok: false, refusal: { kind: 'dependency-conflict' } });
    expect(draft.getLifecycle()).toBe('sealed');
    expect(store.getPendingTurnIds()).toEqual([1]);
  });

  it('keeps a sealed transaction sealed when abort application throws', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const theme = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(theme).toBe(P_THEME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: (turnId) =>
        rollbackPendingTurnAt({
          authority: P_PROFILE,
          turnId,
          store,
          topology,
          port: {
            applyAtomically() {
              throw new Error('apply failed');
            },
          },
          realizationContext,
        }),
    });

    draft.capture({ owner: P_THEME, before: 'A', after: 'B' });
    draft.seal();

    expect(() => draft.abort()).toThrow('apply failed');
    expect(draft.getLifecycle()).toBe('sealed');
    expect(store.getPendingTurnIds()).toEqual([1]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);
  });

  it('keeps transaction lifecycle confirmed after capacity-zero confirmation, and abort cannot reinterpret eviction as speculation', () => {
    let realizationContext:
      | ReturnType<typeof createRealizationContextSource>
      | undefined;
    const store = new TurnStore({
      capacity: 0,
      retainEvictedConfirmedTurn: (turn) => realizationContext?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: () => ({ ok: false, refusal: { kind: 'history-evicted' } }),
    });

    draft.capture({ owner: P_THEME, before: 'A', after: 'B' });
    draft.seal();

    expect(draft.confirm()).toEqual({ ok: true, turnId: 1 });
    expect(draft.getLifecycle()).toBe('confirmed');
    expect(store.getPendingTurn(1)).toBeUndefined();
    expect(store.getTurn(1)).toBeUndefined();
    expect(realizationContext.getCurrentValue(P_THEME)).toBe('B');
    expect(() => draft.abort()).toThrow(
      'Greenfield transaction draft must be sealed before this operation'
    );
    expect(draft.getLifecycle()).toBe('confirmed');
  });

  it('seals rekey plus same-subject scalar capture into one pending structural turn and abort removes both same-turn changes', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const driverKey = topology.allocate(profile);
    const driverName = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(driverKey).toBe(P_DRIVER_KEY);
    expect(driverName).toBe(P_DRIVER_NAME);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([
        [P_DRIVER_KEY, 'A'],
        [P_DRIVER_NAME, 'Alice'],
      ]),
      store,
      appliedHistory,
    });
    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'B'],
      [P_DRIVER_NAME, 'Alicia'],
    ]);
    const appliedEffects: Array<ReadonlyArray<{ owner: PositionId; before: unknown; after: unknown; subjectId?: unknown; structural?: 'add' | 'remove' | 'rekey' }>> = [];
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: (turnId) =>
        rollbackPendingTurnAt({
          authority: P_PROFILE,
          turnId,
          store,
          topology,
          port: {
            applyAtomically(effects) {
              const staged = new Map(values);

              for (const effect of effects) {
                expect(staged.get(effect.owner)).toEqual(effect.before);
                staged.set(effect.owner, effect.after);
              }

              appliedEffects.push(
                effects.map((effect) => ({
                  owner: effect.owner,
                  before: effect.before,
                  after: effect.after,
                  subjectId: effect.subjectId,
                  structural: effect.structural,
                }))
              );

              values.clear();
              for (const [positionId, value] of staged) {
                values.set(positionId, value);
              }
            },
          },
          realizationContext,
        }),
    });

    draft.capture({
      owner: P_DRIVER_KEY,
      before: 'A',
      after: 'B',
      subjectId: SUBJECT_DRIVER,
      structural: 'rekey',
    });
    draft.capture({
      owner: P_DRIVER_NAME,
      before: 'Alice',
      after: 'Alicia',
      subjectId: SUBJECT_DRIVER,
    });

    expect(draft.seal()).toEqual({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: 'B',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
      ],
      participants: [P_DRIVER_KEY, P_DRIVER_NAME],
      state: 'pending',
    });

    expect(draft.abort()).toEqual({ ok: true, turnId: 1 });
    expect(draft.getLifecycle()).toBe('aborted');
    expect(appliedEffects).toEqual([
      [
        {
          owner: P_DRIVER_KEY,
          before: 'B',
          after: 'A',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
        {
          owner: P_DRIVER_NAME,
          before: 'Alicia',
          after: 'Alice',
          subjectId: SUBJECT_DRIVER,
          structural: undefined,
        },
      ],
    ]);
    expect(values.get(P_DRIVER_KEY)).toBe('A');
    expect(values.get(P_DRIVER_NAME)).toBe('Alice');
    expect(store.getPendingTurnIds()).toEqual([]);
  });

  it('aborts add plus same-turn fields as one realized structural remove', () => {
    const topology = createPositionRegistry();
    const root = topology.allocate();
    const profile = topology.allocate(root);
    const driverKey = topology.allocate(profile);
    const driverName = topology.allocate(profile);
    const driverEnabled = topology.allocate(profile);

    expect(root).toBe(P_ROOT);
    expect(profile).toBe(P_PROFILE);
    expect(driverKey).toBe(P_DRIVER_KEY);
    expect(driverName).toBe(P_DRIVER_NAME);
    expect(driverEnabled).toBe(P_DRIVER_ENABLED);

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map(),
      store,
      appliedHistory,
    });
    const values = new Map<PositionId, unknown>([
      [P_DRIVER_KEY, 'A'],
      [P_DRIVER_NAME, 'Alice'],
      [P_DRIVER_ENABLED, true],
    ]);
    const appliedEffects: Array<ReadonlyArray<{ owner: PositionId; before: unknown; after: unknown; subjectId?: unknown; structural?: 'add' | 'remove' | 'rekey' }>> = [];
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: (turnId) =>
        rollbackPendingTurnAt({
          authority: P_PROFILE,
          turnId,
          store,
          topology,
          port: {
            applyAtomically(effects) {
              const staged = new Map(values);

              for (const effect of effects) {
                expect(staged.get(effect.owner)).toEqual(effect.before);
                staged.set(effect.owner, effect.after);
              }

              appliedEffects.push(
                effects.map((effect) => ({
                  owner: effect.owner,
                  before: effect.before,
                  after: effect.after,
                  subjectId: effect.subjectId,
                  structural: effect.structural,
                }))
              );

              values.clear();
              for (const [positionId, value] of staged) {
                values.set(positionId, value);
              }
            },
          },
          realizationContext,
        }),
    });

    draft.capture({
      owner: P_DRIVER_KEY,
      before: undefined,
      after: 'A',
      subjectId: SUBJECT_DRIVER,
      structural: 'add',
      subjectPositions: [P_DRIVER_KEY, P_DRIVER_NAME, P_DRIVER_ENABLED],
    });
    draft.capture({
      owner: P_DRIVER_NAME,
      before: undefined,
      after: 'Alice',
      subjectId: SUBJECT_DRIVER,
    });
    draft.capture({
      owner: P_DRIVER_ENABLED,
      before: undefined,
      after: true,
      subjectId: SUBJECT_DRIVER,
    });

    draft.seal();

    expect(draft.abort()).toEqual({ ok: true, turnId: 1 });
    expect(appliedEffects).toEqual([
      [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: undefined,
          subjectId: SUBJECT_DRIVER,
          structural: 'remove',
        },
      ],
    ]);
    expect(values.get(P_DRIVER_KEY)).toBeUndefined();
    expect(values.get(P_DRIVER_NAME)).toBe('Alice');
    expect(values.get(P_DRIVER_ENABLED)).toBe(true);
  });

  it('confirms a structural transaction with zero physical writes and preserves canonical metadata exactly', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    let physicalWrites = 0;
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
    });

    physicalWrites += 2;
    draft.capture({
      owner: P_DRIVER_KEY,
      before: 'A',
      after: 'B',
      subjectId: SUBJECT_DRIVER,
      structural: 'rekey',
    });
    draft.capture({
      owner: P_DRIVER_NAME,
      before: 'Alice',
      after: 'Alicia',
      subjectId: SUBJECT_DRIVER,
    });

    expect(draft.seal()).toEqual({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: 'B',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
        {
          owner: P_DRIVER_NAME,
          before: 'Alice',
          after: 'Alicia',
          subjectId: SUBJECT_DRIVER,
        },
      ],
      participants: [P_DRIVER_KEY, P_DRIVER_NAME],
      state: 'pending',
    });

    expect(draft.confirm()).toEqual({ ok: true, turnId: 1 });
    expect(draft.getLifecycle()).toBe('confirmed');
    expect(physicalWrites).toBe(2);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([
      {
        id: 1,
        effects: [
          {
            owner: P_DRIVER_KEY,
            before: 'A',
            after: 'B',
            subjectId: SUBJECT_DRIVER,
            structural: 'rekey',
          },
          {
            owner: P_DRIVER_NAME,
            before: 'Alice',
            after: 'Alicia',
            subjectId: SUBJECT_DRIVER,
          },
        ],
        participants: [P_DRIVER_KEY, P_DRIVER_NAME],
        state: 'confirmed',
      },
    ]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([1]);
  });

  it('preserves authored structural ordering instead of collapsing repeated rekeys', () => {
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
    });

    draft.capture({
      owner: P_DRIVER_KEY,
      before: 'A',
      after: 'B',
      subjectId: SUBJECT_DRIVER,
      structural: 'rekey',
    });
    draft.capture({
      owner: P_DRIVER_KEY,
      before: 'B',
      after: 'C',
      subjectId: SUBJECT_DRIVER,
      structural: 'rekey',
    });

    expect(draft.seal()).toEqual({
      id: 1,
      effects: [
        {
          owner: P_DRIVER_KEY,
          before: 'A',
          after: 'B',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
        {
          owner: P_DRIVER_KEY,
          before: 'B',
          after: 'C',
          subjectId: SUBJECT_DRIVER,
          structural: 'rekey',
        },
      ],
      participants: [P_DRIVER_KEY],
      state: 'pending',
    });
  });
});
