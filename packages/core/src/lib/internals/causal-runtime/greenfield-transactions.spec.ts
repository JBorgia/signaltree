import type { PositionId } from './causal-types';
import { AppliedHistory } from './applied-history';
import { rollbackPendingTurnAt } from './pending-rollback';
import { getPathNotifier, resetPathNotifier } from '../../path-notifier';
import { signalTree } from '../../signal-tree';
import type { ISignalTree, StructuralHistoryEffect, UpdateMetadata } from '../../types';
import { withWriteContext } from '../../write-context';
import { entityMap } from '../../markers/entity-map';
import { LoadingState, status } from '../../markers/status';
import { stored } from '../../markers/stored';
import { getOwnedPositionIds } from '../owned-mutation';
import { createPositionRegistry } from '../position-registry';
import { getPositionRegistry } from '../position-registry';
import { createRealizationContextSource } from './realization-context';
import { createGreenfieldTransactionDraft } from './greenfield-transactions';
import { createTransactionCaptureBridge, toExplicitTransactionEffect } from './transaction-capture-bridge';
import {
  createTreeRealizationAdapter,
  rememberTreeRealizationDescriptor,
  type TreeRealizationDescriptor,
} from './tree-realization-adapter';
import { redoConfirmedAt } from './confirmed-redo';
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

const createMockStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
};

const createLiveDraftHarness = (
  draft: ReturnType<typeof createGreenfieldTransactionDraft>,
  turnId: number
) => {
  const notifier = getPathNotifier();
  const transactionOwner = {};
  const baselineValues = new Map<PositionId, unknown>();
  const descriptors = new Map<PositionId, TreeRealizationDescriptor>();
  const bridge = createTransactionCaptureBridge({
    draft,
    turnId,
    transactionOwner,
  });
  const unsubscribe = notifier.subscribe(
    '**',
    (next, prev, path, ownerPath, source, subjectIds, positionIds, meta) => {
      if (
        meta?.transactionId !== turnId ||
        meta.transactionOwner !== transactionOwner
      ) {
        return;
      }

      const captured = toExplicitTransactionEffect({
        next,
        prev,
        subjectIds,
        positionIds,
        meta,
      });
      if (captured && !baselineValues.has(captured.owner)) {
        baselineValues.set(captured.owner, captured.before);
      }
      if (captured) {
        rememberTreeRealizationDescriptor({
          descriptors,
          path,
          ownerPath,
          positionIds,
          subjectIds,
          meta,
        });
      }

      bridge(next, prev, path, ownerPath, source, subjectIds, positionIds, meta);
    }
  );

  return {
    baselineValues,
    descriptors,
    write<R>(fn: () => R): R {
      return withWriteContext(
        {
          intent: 'user',
          source: 'user',
          transactionId: turnId,
          transactionOwner,
        },
        fn
      );
    },
    flush(): void {
      notifier.flushSync();
    },
    dispose(): void {
      unsubscribe();
    },
  };
};

const createActualTreeAbort = (options: {
  tree: ISignalTree<object>;
  authority: PositionId;
  store: TurnStore;
  appliedHistory: AppliedHistory;
  baselineValues: ReadonlyMap<PositionId, unknown>;
  descriptors: ReadonlyMap<PositionId, TreeRealizationDescriptor>;
}) => {
  const topology = getPositionRegistry(options.tree.$);
  if (!topology) {
    throw new Error('Expected tree position registry');
  }

  const realizationContext = createRealizationContextSource({
    baselineValues: new Map(options.baselineValues),
    store: options.store,
    appliedHistory: options.appliedHistory,
  });

  return (turnId: number) =>
    rollbackPendingTurnAt({
      authority: options.authority,
      turnId,
      store: options.store,
      topology,
      port: createTreeRealizationAdapter({
        tree: options.tree,
        descriptors: options.descriptors,
      }),
      realizationContext,
    });
};

const createLiveUsersAbortHarness = () => {
  resetPathNotifier();
  const tree = signalTree({
    users: entityMap<{ id: string; name: string }, string>({
      selectId: (user) => user.id,
    }),
  }) as ISignalTree<{
    users: {
      addOne(user: { id: string; name: string }): void;
      removeOne(id: string): void;
      changeId(from: string, to: string): void;
      ids(): string[];
      byIdOrFail(id: string): {
        name: (() => string | undefined) & { __subjectIds?: number[] };
      };
    };
  }>;

  const store = new TurnStore();
  const appliedHistory = new AppliedHistory(store);
  const liveHarnessRef: {
    current?: ReturnType<typeof createLiveDraftHarness>;
  } = {};

  const abortWithPort = (
    turnId: number,
    port: Parameters<typeof rollbackPendingTurnAt>[0]['port']
  ) => {
    if (!liveHarnessRef.current) {
      throw new Error('Live draft harness was not initialized');
    }

    const topology = getPositionRegistry(tree.$);
    if (!topology) {
      throw new Error('Expected tree position registry');
    }

    const realizationContext = createRealizationContextSource({
      baselineValues: new Map(liveHarnessRef.current.baselineValues),
      store,
      appliedHistory,
    });

    return rollbackPendingTurnAt({
      authority: getOwnedPositionIds(tree)?.[0] as PositionId,
      turnId,
      store,
      topology,
      port,
      realizationContext,
    });
  };

  const liveDraft = createGreenfieldTransactionDraft({
    turnId: 1,
    store,
    appliedHistory,
    abortPendingTurn: (turnId) => {
      if (!liveHarnessRef.current) {
        throw new Error('Live draft harness was not initialized');
      }

      return createActualTreeAbort({
        tree: tree as ISignalTree<object>,
        authority: getOwnedPositionIds(tree)?.[0] as PositionId,
        store,
        appliedHistory,
        baselineValues: liveHarnessRef.current.baselineValues,
        descriptors: liveHarnessRef.current.descriptors,
      })(turnId);
    },
  });
  const liveHarness = createLiveDraftHarness(liveDraft, 1);
  liveHarnessRef.current = liveHarness;

  return {
    tree,
    store,
    appliedHistory,
    liveDraft,
    liveHarness,
    abortWithPort,
  };
};

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
    const realizationContextRef: {
      current?: ReturnType<typeof createRealizationContextSource>;
    } = {};
    const store = new TurnStore({
      capacity: 0,
      retainEvictedConfirmedTurn: (turn) =>
        realizationContextRef.current?.retainEvictedConfirmedTurn(turn),
    });
    const appliedHistory = new AppliedHistory(store);
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map([[P_THEME, 'A']]),
      store,
      appliedHistory,
    });
    realizationContextRef.current = realizationContext;
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

  it('captures a real SignalTree leaf write into an open draft, seals it as pending, then confirms without extra writes', () => {
    resetPathNotifier();
    const tree = signalTree({ theme: 'light' }) as ISignalTree<{ theme: string }>;
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
    });
    const harness = createLiveDraftHarness(draft, 1);
    const notifications: Array<{ path: string; meta?: UpdateMetadata }> = [];
    const unsubscribe = getPathNotifier().subscribe(
      '**',
      (_next, _prev, path, _ownerPath, _source, _subjectIds, _positionIds, meta) => {
        notifications.push({ path, meta });
      }
    );

    expect(draft.getLifecycle()).toBe('open');
    expect(store.getPendingTurnIds()).toEqual([]);

    harness.write(() => {
      tree.$.theme.set('dark');
    });
    harness.flush();

    expect(tree.$.theme()).toBe('dark');
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);
    expect(notifications).toHaveLength(1);

    const owner = getOwnedPositionIds(tree.$.theme)?.[0] as PositionId;
    expect(draft.seal()).toEqual({
      id: 1,
      effects: [{ owner, before: 'light', after: 'dark' }],
      participants: [owner],
      state: 'pending',
    });

    expect(draft.confirm()).toEqual({ ok: true, turnId: 1 });
    harness.flush();

    expect(draft.getLifecycle()).toBe('confirmed');
    expect(notifications).toHaveLength(1);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([
      {
        id: 1,
        effects: [{ owner, before: 'light', after: 'dark' }],
        participants: [owner],
        state: 'confirmed',
      },
    ]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([1]);

    unsubscribe();
    harness.dispose();
  });

  it('nets repeated real scalar writes inside one draft from the first before value to the final after value', () => {
    resetPathNotifier();
    const tree = signalTree({ theme: 'A' }) as ISignalTree<{ theme: string }>;
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const draft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
    });
    const harness = createLiveDraftHarness(draft, 1);

    harness.write(() => {
      tree.$.theme.set('B');
      tree.$.theme.set('C');
    });
    harness.flush();

    const owner = getOwnedPositionIds(tree.$.theme)?.[0] as PositionId;
    expect(draft.seal()).toEqual({
      id: 1,
      effects: [{ owner, before: 'A', after: 'C' }],
      participants: [owner],
      state: 'pending',
    });

    harness.dispose();
  });

  it('keeps explicit attribution local when two real drafts interleave writes', () => {
    resetPathNotifier();
    const tree = signalTree({ a: 'A', b: 'B', c: 'C' }) as ISignalTree<{
      a: string;
      b: string;
      c: string;
    }>;
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
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
    const firstHarness = createLiveDraftHarness(firstDraft, 1);
    const secondHarness = createLiveDraftHarness(secondDraft, 2);

    firstHarness.write(() => {
      tree.$.a.set('A1');
    });
    firstHarness.flush();

    secondHarness.write(() => {
      tree.$.b.set('B1');
    });
    secondHarness.flush();

    firstHarness.write(() => {
      tree.$.c.set('C1');
    });
    firstHarness.flush();

    const aOwner = getOwnedPositionIds(tree.$.a)?.[0] as PositionId;
    const bOwner = getOwnedPositionIds(tree.$.b)?.[0] as PositionId;
    const cOwner = getOwnedPositionIds(tree.$.c)?.[0] as PositionId;

    expect(firstDraft.seal()).toEqual({
      id: 1,
      effects: [
        { owner: aOwner, before: 'A', after: 'A1' },
        { owner: cOwner, before: 'C', after: 'C1' },
      ],
      participants: [aOwner, cOwner],
      state: 'pending',
    });
    expect(secondDraft.seal()).toEqual({
      id: 2,
      effects: [{ owner: bOwner, before: 'B', after: 'B1' }],
      participants: [bOwner],
      state: 'pending',
    });

    firstHarness.dispose();
    secondHarness.dispose();
  });

  it('captures heterogeneous real writes on one draft and aborts them through the frozen kernel', () => {
    resetPathNotifier();
    const storage = createMockStorage();
    storage.setItem(
      'greenfield-live-preference',
      JSON.stringify({ __v: 1, data: 'compact' })
    );

    const tree = signalTree({
      profile: { firstName: 'John' },
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
      request: status(),
      preference: stored('greenfield-live-preference', 'compact', {
        storage,
        debounceMs: 0,
      }),
    }) as ISignalTree<{
      profile: { firstName: string };
      users: {
        addOne(user: { id: string; name: string }): void;
        changeId(from: string, to: string): void;
        ids(): string[];
        byIdOrFail(id: string): {
          name: (() => string | undefined) & { __subjectIds?: number[] };
        };
      };
      request: {
        state(): LoadingState;
        setLoading(): void;
      };
      preference: {
        (): string;
        set(value: string): void;
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Jonathan' });
    getPathNotifier().flushSync();

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const liveHarnessRef: {
      current?: ReturnType<typeof createLiveDraftHarness>;
    } = {};
    const liveDraft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: (turnId) => {
        if (!liveHarnessRef.current) {
          throw new Error('Live draft harness was not initialized');
        }

        return createActualTreeAbort({
          tree: tree as ISignalTree<object>,
          authority: getOwnedPositionIds(tree)?.[0] as PositionId,
          store,
          appliedHistory,
          baselineValues: liveHarnessRef.current.baselineValues,
          descriptors: liveHarnessRef.current.descriptors,
        })(turnId);
      },
    });
    const liveHarness = createLiveDraftHarness(liveDraft, 1);
    liveHarnessRef.current = liveHarness;

    const originalSubject = tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0];

    liveHarness.write(() => {
      tree.$.profile.firstName.set('Jane');
      tree.$.users.changeId('u1', 'u2');
      tree.$.request.setLoading();
      tree.$.preference.set('spacious');
    });
    liveHarness.flush();

    expect(tree.$.profile.firstName()).toBe('Jane');
    expect(tree.$.users.ids()).toEqual(['u2']);
    expect(tree.$.request.state()).toBe(LoadingState.Loading);
    expect(tree.$.preference()).toBe('spacious');
    expect(
      JSON.parse(storage.getItem('greenfield-live-preference') as string).data
    ).toBe('spacious');
    expect(store.getPendingTurnIds()).toEqual([]);

    const profileOwner = getOwnedPositionIds(tree.$.profile.firstName)?.[0] as PositionId;
    const usersOwner = getOwnedPositionIds(tree.$.users)?.[0] as PositionId;
    const requestOwner = getOwnedPositionIds(tree.$.request)?.[0] as PositionId;
    const preferenceOwner = getOwnedPositionIds(tree.$.preference)?.[0] as PositionId;

    expect(liveDraft.seal()).toEqual({
      id: 1,
      effects: [
        { owner: profileOwner, before: 'John', after: 'Jane' },
        {
          owner: usersOwner,
          before: 'u1',
          after: 'u2',
          subjectId: originalSubject,
          structural: 'rekey',
          structuralContext: {
            kind: 'rekey',
            subject: originalSubject as number,
            beforeKey: 'u1',
            afterKey: 'u2',
            subjectPositions: [usersOwner],
          },
          subjectPositions: [usersOwner],
        },
        {
          owner: requestOwner,
          before: LoadingState.NotLoaded,
          after: LoadingState.Loading,
        },
        { owner: preferenceOwner, before: 'compact', after: 'spacious' },
      ],
      participants: [profileOwner, usersOwner, requestOwner, preferenceOwner],
      state: 'pending',
    });

    expect(liveDraft.abort()).toEqual({ ok: true, turnId: 1 });

    expect(tree.$.profile.firstName()).toBe('John');
    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.request.state()).toBe(LoadingState.NotLoaded);
    expect(tree.$.preference()).toBe('compact');
    expect(
      JSON.parse(storage.getItem('greenfield-live-preference') as string).data
    ).toBe('compact');
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);

    liveHarness.dispose();
  });

  it('captures a real entity add transaction with canonical structural coverage already authored', () => {
    resetPathNotifier();
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        byIdOrFail(id: string): { name: () => string | undefined };
      };
    }>;
    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const draft = createGreenfieldTransactionDraft({ turnId: 1, store, appliedHistory });
    const harness = createLiveDraftHarness(draft, 1);

    harness.write(() => {
      tree.$.users.addOne({ id: 'u1', name: 'Jonathan' });
    });
    harness.flush();

    const usersOwner = getOwnedPositionIds(tree.$.users)?.[0] as PositionId;
    expect(draft.seal()).toEqual({
      id: 1,
      effects: [
        {
          owner: usersOwner,
          before: undefined,
          after: 'u1',
          subjectId: 1,
          structural: 'add',
          structuralContext: {
            kind: 'add',
            subject: 1,
            key: 'u1',
            value: { id: 'u1', name: 'Jonathan' },
            beforeSubject: undefined,
            subjectPositions: [usersOwner],
          },
          subjectPositions: [usersOwner],
        },
      ],
      participants: [usersOwner],
      state: 'pending',
    });

    harness.dispose();
  });

  it('captures a real entity remove transaction with canonical structural coverage already authored', () => {
    resetPathNotifier();
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
      };
    }>;
    tree.$.users.addOne({ id: 'u1', name: 'Jonathan' });
    getPathNotifier().flushSync();

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const draft = createGreenfieldTransactionDraft({ turnId: 1, store, appliedHistory });
    const harness = createLiveDraftHarness(draft, 1);

    harness.write(() => {
      tree.$.users.removeOne('u1');
    });
    harness.flush();

    const usersOwner = getOwnedPositionIds(tree.$.users)?.[0] as PositionId;
    expect(draft.seal()).toEqual({
      id: 1,
      effects: [
        {
          owner: usersOwner,
          before: 'u1',
          after: undefined,
          subjectId: 1,
          structural: 'remove',
          structuralContext: {
            kind: 'remove',
            subject: 1,
            key: 'u1',
            value: { id: 'u1', name: 'Jonathan' },
            beforeSubject: undefined,
            afterSubject: undefined,
            subjectPositions: [usersOwner],
          },
          subjectPositions: [usersOwner],
        },
      ],
      participants: [usersOwner],
      state: 'pending',
    });

    harness.dispose();
  });

  it('proves collection-owner remove coverage is sufficient for real multi-field abort restoration', () => {
    resetPathNotifier();
    const tree = signalTree({
      users: entityMap<{ id: string; name: string; enabled: boolean }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string; enabled: boolean }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): {
          name: (() => string | undefined) & { __positionIds?: number[] };
          enabled: (() => boolean | undefined) & { __positionIds?: number[] };
        };
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice', enabled: true });
    getPathNotifier().flushSync();

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const liveHarnessRef: {
      current?: ReturnType<typeof createLiveDraftHarness>;
    } = {};
    const liveDraft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: (turnId) => {
        if (!liveHarnessRef.current) {
          throw new Error('Live draft harness was not initialized');
        }

        return createActualTreeAbort({
          tree: tree as ISignalTree<object>,
          authority: getOwnedPositionIds(tree)?.[0] as PositionId,
          store,
          appliedHistory,
          baselineValues: liveHarnessRef.current.baselineValues,
          descriptors: liveHarnessRef.current.descriptors,
        })(turnId);
      },
    });
    const liveHarness = createLiveDraftHarness(liveDraft, 1);
    liveHarnessRef.current = liveHarness;

    const usersOwner = getOwnedPositionIds(tree.$.users)?.[0] as PositionId;
    const nameOwner = tree.$.users.byIdOrFail('u1').name.__positionIds?.[0] as PositionId;
    const enabledOwner = tree.$.users.byIdOrFail('u1').enabled.__positionIds?.[0] as PositionId;

    liveHarness.write(() => {
      tree.$.users.removeOne('u1');
    });
    liveHarness.flush();

    expect(tree.$.users.ids()).toEqual([]);

    expect(liveDraft.seal()).toEqual({
      id: 1,
      effects: [
        {
          owner: usersOwner,
          before: 'u1',
          after: undefined,
          subjectId: 1,
          structural: 'remove',
          structuralContext: {
            kind: 'remove',
            subject: 1,
            key: 'u1',
            value: { id: 'u1', name: 'Alice', enabled: true },
            beforeSubject: undefined,
            afterSubject: undefined,
            subjectPositions: [usersOwner],
          },
          subjectPositions: [usersOwner],
        },
      ],
      participants: [usersOwner],
      state: 'pending',
    });

    expect(liveDraft.abort()).toEqual({ ok: true, turnId: 1 });
    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Alice');
    expect(tree.$.users.byIdOrFail('u1').enabled()).toBe(true);
    expect(tree.$.users.byIdOrFail('u1').name.__positionIds?.[0]).toBe(nameOwner);
    expect(tree.$.users.byIdOrFail('u1').enabled.__positionIds?.[0]).toBe(enabledOwner);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);

    liveHarness.dispose();
  });

  it('aborts a mixed live structural draft through the realization adapter by contextualizing the fresh subject removal', () => {
    resetPathNotifier();
    const tree = signalTree({
      count: 0,
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      count: { set(value: number): void; (): number };
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        changeId(from: string, to: string): void;
        ids(): string[];
        byIdOrFail(id: string): {
          name: (() => string | undefined) & { __subjectIds?: number[] };
        };
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice' });
    getPathNotifier().flushSync();

    const originalSubject = tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0] as
      | number
      | undefined;

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const liveHarnessRef: {
      current?: ReturnType<typeof createLiveDraftHarness>;
    } = {};
    const liveDraft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: (turnId) => {
        if (!liveHarnessRef.current) {
          throw new Error('Live draft harness was not initialized');
        }

        return createActualTreeAbort({
          tree: tree as ISignalTree<object>,
          authority: getOwnedPositionIds(tree)?.[0] as PositionId,
          store,
          appliedHistory,
          baselineValues: liveHarnessRef.current.baselineValues,
          descriptors: liveHarnessRef.current.descriptors,
        })(turnId);
      },
    });
    const liveHarness = createLiveDraftHarness(liveDraft, 1);
    liveHarnessRef.current = liveHarness;

    let freshSubject: number | undefined;
    liveHarness.write(() => {
      tree.$.count.set(1);
      tree.$.users.removeOne('u1');
      tree.$.users.addOne({ id: 'u2', name: 'Bran' });
      freshSubject = tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0];
      tree.$.users.changeId('u2', 'u3');
      tree.$.users.byIdOrFail('u3').name.set('Cora');
    });
    liveHarness.flush();

    expect(originalSubject).toBeTypeOf('number');
    expect(freshSubject).toBeTypeOf('number');

    const pendingTurn = liveDraft.seal();
    expect(pendingTurn.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ before: 0, after: 1, subjectId: undefined }),
        expect.objectContaining({ structural: 'remove', subjectId: originalSubject }),
        expect.objectContaining({ structural: 'add', subjectId: freshSubject }),
        expect.objectContaining({ structural: 'rekey', subjectId: freshSubject }),
        expect.objectContaining({
          before: { id: 'u2', name: 'Bran' },
          after: { id: 'u2', name: 'Cora' },
          subjectId: freshSubject,
        }),
      ])
    );

    expect(liveDraft.abort()).toEqual({ ok: true, turnId: 1 });
    expect(tree.$.count()).toBe(0);
    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Alice');
    expect(tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0]).toBe(
      originalSubject
    );
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);

    tree.$.users.addOne({ id: 'u9', name: 'Zed' });
    getPathNotifier().flushSync();
    expect(tree.$.users.byIdOrFail('u9').name.__subjectIds?.[0]).toBeGreaterThan(
      freshSubject as number
    );

    liveHarness.dispose();
  });

  it('aborts a live fresh add by realizing a structural remove without reusing the fresh subject lifetime', () => {
    const { tree, store, appliedHistory, liveDraft, liveHarness } =
      createLiveUsersAbortHarness();

    let freshSubject: number | undefined;
    liveHarness.write(() => {
      tree.$.users.addOne({ id: 'u2', name: 'Bran' });
      freshSubject = tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0];
    });
    liveHarness.flush();

    expect(freshSubject).toBeTypeOf('number');

    const pendingTurn = liveDraft.seal();
    expect(pendingTurn.effects).toEqual([
      expect.objectContaining({
        before: undefined,
        after: 'u2',
        subjectId: freshSubject,
        structural: 'add',
      }),
    ]);

    expect(liveDraft.abort()).toEqual({ ok: true, turnId: 1 });
    expect(tree.$.users.ids()).toEqual([]);

    tree.$.users.addOne({ id: 'u9', name: 'Zed' });
    getPathNotifier().flushSync();
    const nextFreshSubject = tree.$.users.byIdOrFail('u9').name.__subjectIds?.[0] as
      | number
      | undefined;
    expect(nextFreshSubject).toBeGreaterThan(freshSubject as number);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);

    liveHarness.dispose();
  });

  it('aborts a live fresh add plus same-subject scalar through the same structural remove frontier', () => {
    const { tree, store, appliedHistory, liveDraft, liveHarness } =
      createLiveUsersAbortHarness();

    let freshSubject: number | undefined;
    liveHarness.write(() => {
      tree.$.users.addOne({ id: 'u2', name: 'Bran' });
      freshSubject = tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0];
      tree.$.users.byIdOrFail('u2').name.set('Cora');
    });
    liveHarness.flush();

    expect(freshSubject).toBeTypeOf('number');

    const pendingTurn = liveDraft.seal();
    expect(pendingTurn.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          before: undefined,
          after: 'u2',
          subjectId: freshSubject,
          structural: 'add',
        }),
        expect.objectContaining({
          before: { id: 'u2', name: 'Bran' },
          after: { id: 'u2', name: 'Cora' },
          subjectId: freshSubject,
        }),
      ])
    );

    expect(liveDraft.abort()).toEqual({ ok: true, turnId: 1 });
    expect(tree.$.users.ids()).toEqual([]);

    tree.$.users.addOne({ id: 'u9', name: 'Zed' });
    getPathNotifier().flushSync();
    const nextFreshSubject = tree.$.users.byIdOrFail('u9').name.__subjectIds?.[0] as
      | number
      | undefined;
    expect(nextFreshSubject).toBeGreaterThan(freshSubject as number);
    expect(store.getPendingTurnIds()).toEqual([]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);

    liveHarness.dispose();
  });

  it('constructs fresh add plus rekey rollback as a stale pre-rekey remove and refuses it as structural drift', () => {
    const { tree, store, appliedHistory, liveDraft, liveHarness, abortWithPort } =
      createLiveUsersAbortHarness();

    let freshSubject: number | undefined;
    liveHarness.write(() => {
      tree.$.users.addOne({ id: 'u2', name: 'Bran' });
      freshSubject = tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0];
      tree.$.users.changeId('u2', 'u3');
    });
    liveHarness.flush();

    expect(tree.$.users.ids()).toEqual(['u3']);
    expect(freshSubject).toBeTypeOf('number');

    const pendingTurn = liveDraft.seal();
    expect(pendingTurn.effects).toEqual([
      expect.objectContaining({
        before: undefined,
        after: 'u2',
        subjectId: freshSubject,
        structural: 'add',
      }),
      expect.objectContaining({
        before: 'u2',
        after: 'u3',
        subjectId: freshSubject,
        structural: 'rekey',
      }),
    ]);

    let capturedEffects: ReadonlyArray<Record<string, unknown>> | undefined;
    const result = abortWithPort(1, {
      validateEffects(effects) {
        capturedEffects = effects.map((effect) => ({ ...effect }));
        return { kind: 'structural-drift' };
      },
      applyAtomically() {
        throw new Error('Expected validation refusal to stop rollback');
      },
    });

    expect(result).toEqual({ ok: false, refusal: { kind: 'structural-drift' } });
    expect(capturedEffects).toEqual([
      expect.objectContaining({
        before: 'u2',
        after: undefined,
        subjectId: freshSubject,
        structural: 'remove',
      }),
    ]);
    expect(tree.$.users.ids()).toEqual(['u3']);
    expect(tree.$.users.byIdOrFail('u3').name()).toBe('Bran');
    expect(tree.$.users.byIdOrFail('u3').name.__subjectIds?.[0]).toBe(
      freshSubject
    );
    expect(store.getPendingTurnIds()).toEqual([1]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);

    liveHarness.dispose();
  });

  it('proves the adapter can remove the fresh subject once the stale rollback remove is contextualized to the current key', () => {
    const { tree, store, appliedHistory, liveDraft, liveHarness, abortWithPort } =
      createLiveUsersAbortHarness();

    const collectionInternal = tree.$.users as typeof tree.$.users & {
      __findKeyBySubjectId?: (subjectId: number) => string | number | undefined;
      __inspectSubjectResources?: (
        subjectId: number
      ) => { state: 'active' | 'tombstoned' } | undefined;
    };
    if (!collectionInternal.__findKeyBySubjectId) {
      throw new Error('Expected subject lookup hook for rollback contextualization probe');
    }

    let freshSubject: number | undefined;
    liveHarness.write(() => {
      tree.$.users.addOne({ id: 'u2', name: 'Bran' });
      freshSubject = tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0];
      tree.$.users.changeId('u2', 'u3');
    });
    liveHarness.flush();

    expect(tree.$.users.ids()).toEqual(['u3']);
    expect(freshSubject).toBeTypeOf('number');

    liveDraft.seal();

    let staleRollbackEffect: Record<string, unknown> | undefined;
    expect(
      abortWithPort(1, {
        validateEffects(effects) {
          staleRollbackEffect = effects[0] ? { ...effects[0] } : undefined;
          return { kind: 'structural-drift' };
        },
        applyAtomically() {
          throw new Error('Expected validation refusal to stop stale rollback');
        },
      })
    ).toEqual({ ok: false, refusal: { kind: 'structural-drift' } });

    expect(staleRollbackEffect).toEqual(
      expect.objectContaining({
        before: 'u2',
        after: undefined,
        subjectId: freshSubject,
        structural: 'remove',
      })
    );

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors: liveHarness.descriptors,
    });
    const contextualizedRollbackEffect = {
      ...staleRollbackEffect,
      before: 'u3',
    };

    expect(adapter.validateEffects([contextualizedRollbackEffect])).toBeUndefined();
    adapter.applyAtomically([contextualizedRollbackEffect]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual([]);
    expect(collectionInternal.__findKeyBySubjectId(freshSubject as number)).toBeUndefined();
    expect(collectionInternal.__inspectSubjectResources?.(freshSubject as number)).toEqual(
      expect.objectContaining({ state: 'tombstoned' })
    );

    tree.$.users.addOne({ id: 'u9', name: 'Zed' });
    getPathNotifier().flushSync();
    expect(tree.$.users.ids()).toEqual(['u9']);
    expect(tree.$.users.byIdOrFail('u9').name.__subjectIds?.[0]).toBeGreaterThan(
      freshSubject as number
    );

    liveHarness.dispose();
  });

  it('constructs fresh add plus rekey plus scalar rollback as the same stale pre-rekey remove frontier', () => {
    const { tree, store, appliedHistory, liveDraft, liveHarness, abortWithPort } =
      createLiveUsersAbortHarness();

    let freshSubject: number | undefined;
    liveHarness.write(() => {
      tree.$.users.addOne({ id: 'u2', name: 'Bran' });
      freshSubject = tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0];
      tree.$.users.changeId('u2', 'u3');
      tree.$.users.byIdOrFail('u3').name.set('Cora');
    });
    liveHarness.flush();

    expect(tree.$.users.ids()).toEqual(['u3']);
    expect(tree.$.users.byIdOrFail('u3').name()).toBe('Cora');
    expect(freshSubject).toBeTypeOf('number');

    const pendingTurn = liveDraft.seal();
    expect(pendingTurn.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          before: undefined,
          after: 'u2',
          subjectId: freshSubject,
          structural: 'add',
        }),
        expect.objectContaining({
          before: 'u2',
          after: 'u3',
          subjectId: freshSubject,
          structural: 'rekey',
        }),
        expect.objectContaining({
          before: { id: 'u2', name: 'Bran' },
          after: { id: 'u2', name: 'Cora' },
          subjectId: freshSubject,
        }),
      ])
    );

    let capturedEffects: ReadonlyArray<Record<string, unknown>> | undefined;
    const result = abortWithPort(1, {
      validateEffects(effects) {
        capturedEffects = effects.map((effect) => ({ ...effect }));
        return { kind: 'structural-drift' };
      },
      applyAtomically() {
        throw new Error('Expected validation refusal to stop rollback');
      },
    });

    expect(result).toEqual({ ok: false, refusal: { kind: 'structural-drift' } });
    expect(capturedEffects).toEqual([
      expect.objectContaining({
        before: 'u2',
        after: undefined,
        subjectId: freshSubject,
        structural: 'remove',
      }),
    ]);
    expect(tree.$.users.ids()).toEqual(['u3']);
    expect(tree.$.users.byIdOrFail('u3').name()).toBe('Cora');
    expect(tree.$.users.byIdOrFail('u3').name.__subjectIds?.[0]).toBe(
      freshSubject
    );
    expect(store.getPendingTurnIds()).toEqual([1]);
    expect(store.getTurns()).toEqual([]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([]);

    liveHarness.dispose();
  });

  it('restores multiple removed subjects in one live transaction abort even when they share one collection owner', () => {
    resetPathNotifier();
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): {
          name: (() => string | undefined) & { __subjectIds?: number[] };
        };
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice' });
    tree.$.users.addOne({ id: 'u2', name: 'Bob' });
    getPathNotifier().flushSync();

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const liveHarnessRef: {
      current?: ReturnType<typeof createLiveDraftHarness>;
    } = {};
    const liveDraft = createGreenfieldTransactionDraft({
      turnId: 1,
      store,
      appliedHistory,
      abortPendingTurn: (turnId) => {
        if (!liveHarnessRef.current) {
          throw new Error('Live draft harness was not initialized');
        }

        return createActualTreeAbort({
          tree: tree as ISignalTree<object>,
          authority: getOwnedPositionIds(tree)?.[0] as PositionId,
          store,
          appliedHistory,
          baselineValues: liveHarnessRef.current.baselineValues,
          descriptors: liveHarnessRef.current.descriptors,
        })(turnId);
      },
    });
    const liveHarness = createLiveDraftHarness(liveDraft, 1);
    liveHarnessRef.current = liveHarness;

    const subjectOne = tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0];
    const subjectTwo = tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0];

    liveHarness.write(() => {
      tree.$.users.removeOne('u1');
      tree.$.users.removeOne('u2');
    });
    liveHarness.flush();

    expect(tree.$.users.ids()).toEqual([]);

    liveDraft.seal();
    expect(liveDraft.abort()).toEqual({ ok: true, turnId: 1 });
    expect(tree.$.users.ids()).toEqual(['u1', 'u2']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Alice');
    expect(tree.$.users.byIdOrFail('u2').name()).toBe('Bob');
    expect(tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0]).toBe(subjectOne);
    expect(tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0]).toBe(subjectTwo);

    liveHarness.dispose();
  });

  it('undoes a confirmed structural remove after the live transaction harness is disposed', () => {
    resetPathNotifier();
    const tree = signalTree({
      users: entityMap<{ id: string; name: string; enabled: boolean }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string; enabled: boolean }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): {
          name: (() => string | undefined) & { __subjectIds?: number[] };
          enabled(): boolean | undefined;
        };
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice', enabled: true });
    getPathNotifier().flushSync();

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const draft = createGreenfieldTransactionDraft({ turnId: 1, store, appliedHistory });
    const liveHarness = createLiveDraftHarness(draft, 1);

    liveHarness.write(() => {
      tree.$.users.removeOne('u1');
    });
    liveHarness.flush();

    expect(draft.seal()).toEqual({
      id: 1,
      effects: [
        {
          owner: getOwnedPositionIds(tree.$.users)?.[0] as PositionId,
          before: 'u1',
          after: undefined,
          subjectId: 1,
          structural: 'remove',
          structuralContext: {
            kind: 'remove',
            subject: 1,
            key: 'u1',
            value: { id: 'u1', name: 'Alice', enabled: true },
            beforeSubject: undefined,
            afterSubject: undefined,
            subjectPositions: [getOwnedPositionIds(tree.$.users)?.[0] as PositionId],
          },
          subjectPositions: [getOwnedPositionIds(tree.$.users)?.[0] as PositionId],
        },
      ],
      participants: [getOwnedPositionIds(tree.$.users)?.[0] as PositionId],
      state: 'pending',
    });
    expect(draft.confirm()).toEqual({ ok: true, turnId: 1 });
    liveHarness.dispose();

    expect(tree.$.users.ids()).toEqual([]);

    const topology = getPositionRegistry(tree.$);
    if (!topology) {
      throw new Error('Expected tree position registry');
    }

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors: new Map(),
    });
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map(),
      store,
      appliedHistory,
    });

    expect(
      undoConfirmedAt({
        authority: getOwnedPositionIds(tree)?.[0] as PositionId,
        store,
        appliedHistory,
        topology,
        port: adapter,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: 1 });

    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Alice');
    expect(tree.$.users.byIdOrFail('u1').enabled()).toBe(true);
  });

  it('authors setAll as one canonical remove-set-add turn and replays the same fresh subject on redo', () => {
    resetPathNotifier();
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        setAll(users: Array<{ id: string; name: string }>): void;
        ids(): string[];
        byIdOrFail(id: string): {
          (): { id: string; name: string } | undefined;
          name: (() => string | undefined) & { __subjectIds?: number[] };
        };
      };
    }>;

    tree.$.users.addOne({ id: 'c', name: 'Stale Carol' });
    getPathNotifier().flushSync();

    const historicalCNode = tree.$.users.byIdOrFail('c');
    const historicalCName = historicalCNode.name;
    const historicalCSubject = historicalCName.__subjectIds?.[0];
    if (historicalCSubject === undefined) {
      throw new Error('Expected historical subject metadata for key reuse proof');
    }

    tree.$.users.removeOne('c');
    getPathNotifier().flushSync();
    tree.$.users.addOne({ id: 'a', name: 'Alice' });
    tree.$.users.addOne({ id: 'b', name: 'Bob' });
    getPathNotifier().flushSync();

    const subjectA = tree.$.users.byIdOrFail('a').name.__subjectIds?.[0];
    const subjectB = tree.$.users.byIdOrFail('b').name.__subjectIds?.[0];
    if (subjectA === undefined || subjectB === undefined) {
      throw new Error('Expected active subject metadata before setAll');
    }

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const draft = createGreenfieldTransactionDraft({ turnId: 1, store, appliedHistory });
    const harness = createLiveDraftHarness(draft, 1);

    harness.write(() => {
      tree.$.users.setAll([
        { id: 'b', name: 'Bobby' },
        { id: 'c', name: 'Carol' },
      ]);
    });
    harness.flush();

    const usersOwner = getOwnedPositionIds(tree.$.users)?.[0] as PositionId;
    const freshCSubject = tree.$.users.byIdOrFail('c').name.__subjectIds?.[0];
    if (freshCSubject === undefined) {
      throw new Error('Expected fresh subject metadata for setAll arrival');
    }

    expect(freshCSubject).not.toBe(historicalCSubject);
    expect(freshCSubject).not.toBe(subjectA);
    expect(freshCSubject).not.toBe(subjectB);
    expect(historicalCNode()).toBeUndefined();
    expect(historicalCName()).toBeUndefined();

    expect(draft.seal()).toEqual({
      id: 1,
      effects: [
        {
          owner: usersOwner,
          before: 'a',
          after: undefined,
          subjectId: subjectA,
          structural: 'remove',
          structuralContext: {
            kind: 'remove',
            subject: subjectA,
            key: 'a',
            value: { id: 'a', name: 'Alice' },
            beforeSubject: undefined,
            afterSubject: subjectB,
            subjectPositions: [usersOwner],
          },
          subjectPositions: [usersOwner],
        },
        {
          owner: usersOwner,
          before: { id: 'b', name: 'Bob' },
          after: { id: 'b', name: 'Bobby' },
          subjectId: subjectB,
        },
        {
          owner: usersOwner,
          before: undefined,
          after: 'c',
          subjectId: freshCSubject,
          structural: 'add',
          structuralContext: {
            kind: 'add',
            subject: freshCSubject,
            key: 'c',
            value: { id: 'c', name: 'Carol' },
            beforeSubject: subjectB,
            afterSubject: undefined,
            subjectPositions: [usersOwner],
          },
          subjectPositions: [usersOwner],
        },
      ],
      participants: [usersOwner],
      state: 'pending',
    });

    expect(draft.confirm()).toEqual({ ok: true, turnId: 1 });
    expect(store.getTurns().map(({ id }) => id)).toEqual([1]);
    expect(appliedHistory.getAppliedTurnIds()).toEqual([1]);

    harness.dispose();

    const topology = getPositionRegistry(tree.$);
    if (!topology) {
      throw new Error('Expected tree position registry');
    }

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors: harness.descriptors,
    });
    const realizationContext = createRealizationContextSource({
      baselineValues: new Map(),
      store,
      appliedHistory,
    });

    expect(
      undoConfirmedAt({
        authority: getOwnedPositionIds(tree)?.[0] as PositionId,
        store,
        appliedHistory,
        topology,
        port: adapter,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: 1 });

    expect(tree.$.users.ids()).toEqual(['a', 'b']);
    expect(tree.$.users.byIdOrFail('a').name()).toBe('Alice');
    expect(tree.$.users.byIdOrFail('b').name()).toBe('Bob');
    expect(tree.$.users.byIdOrFail('a').name.__subjectIds?.[0]).toBe(subjectA);
    expect(tree.$.users.byIdOrFail('b').name.__subjectIds?.[0]).toBe(subjectB);
    expect(historicalCNode()).toBeUndefined();
    expect(historicalCName()).toBeUndefined();

    expect(
      redoConfirmedAt({
        authority: getOwnedPositionIds(tree)?.[0] as PositionId,
        store,
        appliedHistory,
        topology,
        port: adapter,
        realizationContext,
      })
    ).toEqual({ ok: true, turnId: 1 });

    expect(tree.$.users.ids()).toEqual(['b', 'c']);
    expect(tree.$.users.byIdOrFail('b').name()).toBe('Bobby');
    expect(tree.$.users.byIdOrFail('b').name.__subjectIds?.[0]).toBe(subjectB);
    expect(tree.$.users.byIdOrFail('c').name()).toBe('Carol');
    expect(tree.$.users.byIdOrFail('c').name.__subjectIds?.[0]).toBe(
      freshCSubject
    );
    expect(tree.$.users.byIdOrFail('c').name.__subjectIds?.[0]).not.toBe(
      historicalCSubject
    );
    expect(historicalCNode()).toBeUndefined();
    expect(historicalCName()).toBeUndefined();
  });

  it('restores the authored structural snapshot rather than a later-mutated detached entity alias', () => {
    resetPathNotifier();
    const original = {
      id: 'u1',
      name: 'Alice',
      settings: { enabled: true },
    };
    const tree = signalTree({
      users: entityMap<{
        id: string;
        name: string;
        settings: { enabled: boolean };
      }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: {
          id: string;
          name: string;
          settings: { enabled: boolean };
        }): void;
        removeOne(id: string): void;
        ids(): string[];
        all(): Array<{
          id: string;
          name: string;
          settings: { enabled: boolean };
        }>;
      };
    }>;

    tree.$.users.addOne(original);
    getPathNotifier().flushSync();

    const store = new TurnStore();
    const appliedHistory = new AppliedHistory(store);
    const draft = createGreenfieldTransactionDraft({ turnId: 1, store, appliedHistory });
    const liveHarness = createLiveDraftHarness(draft, 1);

    liveHarness.write(() => {
      tree.$.users.removeOne('u1');
    });
    liveHarness.flush();

    const sealed = draft.seal();
    expect(sealed.state).toBe('pending');
    expect(draft.confirm()).toEqual({ ok: true, turnId: 1 });

    original.name = 'Mallory';
    original.settings.enabled = false;
    liveHarness.dispose();

    const topology = getPositionRegistry(tree.$);
    if (!topology) {
      throw new Error('Expected tree position registry');
    }

    expect(tree.$.users.ids()).toEqual([]);

    expect(
      undoConfirmedAt({
        authority: getOwnedPositionIds(tree)?.[0] as PositionId,
        store,
        appliedHistory,
        topology,
        port: createTreeRealizationAdapter({
          tree: tree as ISignalTree<object>,
          descriptors: new Map(),
        }),
        realizationContext: createRealizationContextSource({
          baselineValues: new Map(),
          store,
          appliedHistory,
        }),
      })
    ).toEqual({ ok: true, turnId: 1 });

    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.all()).toEqual([
      {
        id: 'u1',
        name: 'Alice',
        settings: { enabled: true },
      },
    ]);
  });
});
