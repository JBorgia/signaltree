import { timeTravel } from '../enhancers/time-travel/time-travel';
import { transactions } from '../enhancers/transactions/transactions';
import {
  getOwnedOwnerPath,
  getOwnedPositionIds,
  getOwnedSubjectIds,
  hasIntrinsicMutationEmitter,
} from './internals/owned-mutation';
import { entityMap } from './markers/entity-map';
import { LoadingState, status } from './markers/status';
import { stored } from './markers/stored';
import { plannedSignalTree } from './signal-tree';

import type { EnhancerMeta, ISignalTree } from './types';

import { ENHANCER_META } from './types';

const PLANNED_TREE_BUILD_SYMBOL = Symbol.for('SignalTree:PlannedBuild');

const capabilityEnhancer = (
  name: string,
  capabilities: Array<
    'mutation-capture' | 'position-topology' | 'causal-runtime' | 'temporal-snapshots'
  > = ['causal-runtime']
) => {
  const enhancer = <T extends object>(tree: ISignalTree<T>) => tree;
  const meta: EnhancerMeta = {
    name,
    capabilities,
  };
  (enhancer as unknown as { metadata: EnhancerMeta }).metadata = meta;
  (enhancer as unknown as Record<symbol, EnhancerMeta>)[ENHANCER_META] = meta;
  return enhancer;
};

const expectRollbackError = (
  action: () => void,
  details: { kind: string; pendingEffect: { kind: string }; conflictingEffect: { kind: string } }
) => {
  try {
    action();
    throw new Error('Expected rollback to throw');
  } catch (error) {
    expect(error).toMatchObject({
      code: 'SIGNALTREE_ROLLBACK_FAILED',
      cause: details,
    });
  }
};

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

type EntityCollectionMeta = {
  __positionIds?: number[];
  __subjectIds?: number[];
};

type EntityFieldMeta<T> = {
  (): T;
  __positionIds?: number[];
  __ownerPath?: string;
  __subjectIds?: number[];
};

type PendingTurnEffect = {
  kind: 'set' | 'add' | 'remove' | 'rekey';
  ownerPath: string;
  path: string;
  position: number;
  subject?: number;
  before?: unknown;
  after?: unknown;
  beforeKey?: string | number;
  afterKey?: string | number;
};

type PendingTurnRecord = {
  id: number;
  __ownerPaths?: string[];
  __subjectIds?: number[];
  __positionIds?: number[];
  __effects?: PendingTurnEffect[];
};

type TransactionRuntimeView = {
  getConfirmedTurnCount(): number;
  getPendingTurnCount(): number;
};

type TimeTravelRuntimeView = {
  resetHistory(): void;
  getHistory(): unknown[];
  getTurns(): PendingTurnRecord[];
  getTurnStatus(id: number | undefined): string | undefined;
  containsPosition(authorityPositionId: number, participantPositionId: number): boolean;
};

describe('plannedSignalTree prototype', () => {
  it('builds a no-capability tree with native leaves', () => {
    const tree = plannedSignalTree({ count: 0 }).build();
    const leaf = tree.$.count as typeof tree.$.count & {
      __positionIds?: number[];
      __ownerPath?: string;
      __emitsMutations?: boolean;
    };

    expect(leaf.__positionIds).toBeUndefined();
    expect(leaf.__ownerPath).toBeUndefined();
    expect(leaf.__emitsMutations).toBeUndefined();
    expect(getOwnedPositionIds(leaf)).toBeUndefined();
    expect(getOwnedOwnerPath(leaf)).toBeUndefined();
    expect(hasIntrinsicMutationEmitter(leaf)).toBe(false);
  });

  it('keeps status marker source leaves non-authoring without mutation-capture', () => {
    const tree = plannedSignalTree({ load: status() }).build();

    expect(getOwnedPositionIds(tree.$.load.state)).toBeUndefined();
    expect(getOwnedOwnerPath(tree.$.load.state)).toBeUndefined();
    expect(hasIntrinsicMutationEmitter(tree.$.load.state)).toBe(false);
    expect(getOwnedPositionIds(tree.$.load.error)).toBeUndefined();
    expect(getOwnedOwnerPath(tree.$.load.error)).toBeUndefined();
    expect(hasIntrinsicMutationEmitter(tree.$.load.error)).toBe(false);
    expect(getOwnedPositionIds(tree.$.load)).toBeUndefined();
    expect(getOwnedOwnerPath(tree.$.load)).toBeUndefined();
    expect(hasIntrinsicMutationEmitter(tree.$.load)).toBe(false);
    expect(tree.$.load.state()).toBe(LoadingState.NotLoaded);
  });

  it('specializes status marker source leaves through the shared causal substrate', () => {
    const tree = plannedSignalTree({ load: status() })
      .with(transactions())
      .build();

    expect(getOwnedPositionIds(tree.$.load.state)?.length).toBe(1);
    expect(getOwnedOwnerPath(tree.$.load.state)).toBe('load');
    expect(hasIntrinsicMutationEmitter(tree.$.load.state)).toBe(true);
    expect(getOwnedPositionIds(tree.$.load.error)?.length).toBe(1);
    expect(getOwnedOwnerPath(tree.$.load.error)).toBe('load');
    expect(hasIntrinsicMutationEmitter(tree.$.load.error)).toBe(true);
    expect(getOwnedPositionIds(tree.$.load)?.length).toBe(1);
    expect(getOwnedOwnerPath(tree.$.load)).toBe('load');
    expect(hasIntrinsicMutationEmitter(tree.$.load)).toBe(true);
    expect(getOwnedSubjectIds(tree.$.load.state)).toBeUndefined();
  });

  it('keeps stored() persistent without mutation-capture', () => {
    const storage = createMockStorage();
    const tree = plannedSignalTree({
      theme: stored('planned-stored-no-capability', 'light', {
        storage,
        debounceMs: 0,
      }),
    }).build();

    tree.$.theme.set('dark');

    expect(tree.$.theme()).toBe('dark');
    expect(JSON.parse(storage.getItem('planned-stored-no-capability') as string).data).toBe('dark');
    expect(getOwnedPositionIds(tree.$.theme)).toBeUndefined();
    expect(getOwnedOwnerPath(tree.$.theme)).toBeUndefined();
    expect(hasIntrinsicMutationEmitter(tree.$.theme)).toBe(false);

    storage.setItem(
      'planned-stored-no-capability',
      JSON.stringify({ __v: 1, data: 'blue' })
    );
    expect(tree.$.theme.reload()).toBe('ok');
    expect(tree.$.theme()).toBe('blue');

    tree.$.theme.clear();
    expect(tree.$.theme()).toBe('light');
    expect(storage.getItem('planned-stored-no-capability')).toBe(null);
  });

  it('keeps entityMap ordinary without planned capabilities', () => {
    const tree = plannedSignalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).build();

    tree.$.users.addOne({ id: 'jon', name: 'Jon' });
    tree.$.users.changeId('jon', 'jonathan');
    tree.$.users.byIdOrFail('jonathan').name.set('Jonathan');

    const users = tree.$.users as typeof tree.$.users & EntityCollectionMeta;
    const name = tree.$.users.byIdOrFail('jonathan')
      .name as unknown as EntityFieldMeta<string | undefined>;

    expect(tree.$.users.ids()).toEqual(['jonathan']);
    expect(name()).toBe('Jonathan');
    expect(users.__positionIds).toBeUndefined();
    expect(users.__subjectIds).toBeUndefined();
    expect(name.__positionIds).toBeUndefined();
    expect(name.__ownerPath).toBeUndefined();
    expect(name.__subjectIds).toBeUndefined();
  });

  it('gives entityMap tree-owned topology without planned mutation capture', () => {
    const tree = plannedSignalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    })
      .with(capabilityEnhancer('topology-only', ['position-topology']))
      .build();

    tree.$.users.addOne({ id: 'jon', name: 'Jon' });
    const before = tree.$.users.byIdOrFail('jon')
      .name as unknown as EntityFieldMeta<string | undefined>;
    const collection = tree.$.users as typeof tree.$.users & EntityCollectionMeta;

    const beforePositionId = before.__positionIds?.[0];
    const collectionPositionId = collection.__positionIds?.[0];

    tree.$.users.changeId('jon', 'jonathan');

    const after = tree.$.users.byIdOrFail('jonathan')
      .name as unknown as EntityFieldMeta<string | undefined>;

    expect(beforePositionId).toBeTypeOf('number');
    expect(after.__positionIds?.[0]).toBe(beforePositionId);
    expect(collectionPositionId).toBeTypeOf('number');
    expect(collection.__positionIds?.[0]).toBe(collectionPositionId);
    expect(after.__ownerPath).toBeUndefined();
    expect(after.__subjectIds).toBeUndefined();
    expect(collection.__subjectIds).toBeUndefined();
  });

  it('makes persisted state follow planned transactional rollback', () => {
    const storage = createMockStorage();
    storage.setItem(
      'planned-stored-transaction',
      JSON.stringify({ __v: 1, data: 'light' })
    );
    const tree = plannedSignalTree({
      theme: stored('planned-stored-transaction', 'light', {
        storage,
        debounceMs: 0,
      }),
    })
      .with(transactions())
      .build();

    const pending = tree.transaction(() => {
      tree.$.theme.set('dark');
    });

    // Persistence is post-commit: the live tree shows the speculative value,
    // but nothing durable has moved while the transaction is unconfirmed.
    expect(tree.$.theme()).toBe('dark');
    expect(JSON.parse(storage.getItem('planned-stored-transaction') as string).data).toBe('light');

    pending.rollback();

    // Storage never held 'dark', so the rollback has nothing to repair.
    expect(tree.$.theme()).toBe('light');
    expect(JSON.parse(storage.getItem('planned-stored-transaction') as string).data).toBe('light');
  });

  it('makes persisted state follow planned undo without creating a second author', async () => {
    const storage = createMockStorage();
    storage.setItem(
      'planned-stored-time-travel',
      JSON.stringify({ __v: 1, data: 'light' })
    );
    const tree = plannedSignalTree({
      theme: stored('planned-stored-time-travel', 'light', {
        storage,
        debounceMs: 0,
      }),
    })
      .with(timeTravel())
      .build();

    tree.$.theme.set('dark');
    await Promise.resolve();

    expect(tree.$.theme()).toBe('dark');
    expect(JSON.parse(storage.getItem('planned-stored-time-travel') as string).data).toBe('dark');

    tree.undo();

    expect(tree.$.theme()).toBe('light');
    expect(JSON.parse(storage.getItem('planned-stored-time-travel') as string).data).toBe('light');
  });

  it('preserves a later same-subject field write when rolling back a planned pending rekey', async () => {
    const tree = plannedSignalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    })
      .with(transactions())
      .build();

    tree.$.users.addOne({ id: 'jon', name: 'Jon' });
    await Promise.resolve();
    await Promise.resolve();

    const before = tree.$.users.byIdOrFail('jon')
      .name as unknown as EntityFieldMeta<string | undefined>;

    const pending = tree.transaction(() => {
      tree.$.users.changeId('jon', 'jonathan');
    });

    tree.$.users.byIdOrFail('jonathan').name.set('Jonathan');
    await Promise.resolve();
    await Promise.resolve();

    pending.rollback();

    const after = tree.$.users.byIdOrFail('jon')
      .name as unknown as EntityFieldMeta<string | undefined>;

    expect(tree.$.users.ids()).toEqual(['jon']);
    expect(after()).toBe('Jonathan');
    expect(after.__subjectIds?.[0]).toBe(before.__subjectIds?.[0]);
    expect(after.__positionIds?.[0]).toBe(before.__positionIds?.[0]);
    expect(after.__ownerPath).toBe('users.jon');
  });

  it('rejects rollback of a planned pending add when later confirmed work depends on that entity', async () => {
    const tree = plannedSignalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    })
      .with(transactions())
      .build();

    const pending = tree.transaction(() => {
      tree.$.users.addOne({ id: 'jon', name: 'Jon' });
    });

    tree.$.users.byIdOrFail('jon').name.set('Jonathan');
    await Promise.resolve();
    await Promise.resolve();

    expectRollbackError(() => pending.rollback(), {
      kind: 'later-confirmed-dependency',
      pendingEffect: { kind: 'add' },
      conflictingEffect: { kind: 'set' },
    });
    expect(tree.$.users.ids()).toEqual(['jon']);
    expect(tree.$.users.byIdOrFail('jon').name()).toBe('Jonathan');
  });

  it('records planned entityMap structural effects on the same causal turn', async () => {
    const tree = plannedSignalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    })
      .with(timeTravel())
      .build() as ISignalTree<{ users: unknown }> & {
      __timeTravel: {
        resetHistory(): void;
        getTurns(): Array<{ __effects?: Array<{ kind: string }> }>;
      };
    };
    const t = tree.__timeTravel;

    tree.$.users.addOne({ id: 'jon', name: 'Jon' });
    await Promise.resolve();
    await Promise.resolve();
    t.resetHistory();

    tree.transaction(() => {
      tree.$.users.changeId('jon', 'jonathan');
      tree.$.users.byIdOrFail('jonathan').name.set('Jonathan');
    });

    expect(t.getTurns().at(-1)?.__effects?.map((effect) => effect.kind)).toEqual([
      'rekey',
      'set',
    ]);
  });

  it('represents one planned mixed-family pending transaction as four semantic effects on one canonical turn', async () => {
    const storage = createMockStorage();
    storage.setItem('planned-mixed-preference', JSON.stringify({ __v: 1, data: 'compact' }));

    const tree = plannedSignalTree({
      profile: {
        firstName: 'John',
      },
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
      request: status(),
      preference: stored('planned-mixed-preference', 'compact', {
        storage,
        debounceMs: 0,
      }),
    })
      .with(transactions())
      .with(timeTravel())
      .build() as ISignalTree<{
      profile: { firstName: string };
      users: unknown;
      request: unknown;
      preference: string;
    }> & {
      transaction(fn: () => void): { confirm(): void; rollback(): void };
      __transactions: TransactionRuntimeView;
      __timeTravel: TimeTravelRuntimeView;
    };

    tree.$.users.addOne({ id: 'u1', name: 'Jonathan' });
    await Promise.resolve();
    await Promise.resolve();

    const t = tree.__timeTravel;
    t.resetHistory();
    const baselineHistory = t.getHistory().length;
    const baselineTurns = t.getTurns().length;
    const baselineConfirmed = tree.__transactions.getConfirmedTurnCount();
    const baselinePending = tree.__transactions.getPendingTurnCount();
    const originalSubject = (tree.$.users.byIdOrFail('u1').name as EntityFieldMeta<string | undefined>).__subjectIds?.[0];

    tree.transaction(() => {
      tree.$.profile.firstName.set('Jane');
      tree.$.users.changeId('u1', 'u2');
      tree.$.request.setLoading();
      tree.$.preference.set('spacious');
    });

    expect(tree.$.profile.firstName()).toBe('Jane');
    expect(tree.$.users.ids()).toEqual(['u2']);
    expect(tree.$.request.state()).toBe(LoadingState.Loading);
    expect(tree.$.preference()).toBe('spacious');
    expect(JSON.parse(storage.getItem('planned-mixed-preference') as string).data).toBe('spacious');
    expect(tree.__transactions.getConfirmedTurnCount()).toBe(baselineConfirmed);
    expect(tree.__transactions.getPendingTurnCount()).toBe(baselinePending);
    expect(t.getHistory()).toHaveLength(baselineHistory);
    expect(t.getTurns()).toHaveLength(baselineTurns + 1);

    const pendingTurn = t.getTurns().at(-1) as PendingTurnRecord;
    const pendingEffects = pendingTurn.__effects ?? [];
    const pendingPositions = pendingTurn.__positionIds ?? [];
    const pendingKinds = pendingEffects.map((effect) => effect.kind).sort();
    const rekeyEffect = pendingEffects.find(
      (effect): effect is PendingTurnEffect & { kind: 'rekey'; subject: number; beforeKey: string | number; afterKey: string | number } =>
        effect.kind === 'rekey'
    );
    const plainEffect = pendingEffects.find(
      (effect) => effect.kind === 'set' && effect.path === 'profile.firstName'
    );
    const statusEffect = pendingEffects.find(
      (effect) => effect.kind === 'set' && effect.ownerPath === 'request'
    );
    const storedEffect = pendingEffects.find(
      (effect) => effect.kind === 'set' && effect.path === 'preference'
    );

    expect(t.getTurnStatus(pendingTurn.id)).toBe('pending');
    expect([...(pendingTurn.__ownerPaths ?? [])].sort()).toEqual([
      'preference',
      'profile.firstName',
      'request',
      'users',
    ]);
    expect(pendingEffects).toHaveLength(4);
    expect(pendingKinds).toEqual(['rekey', 'set', 'set', 'set']);
    expect(new Set(pendingPositions).size).toBe(4);
    expect(plainEffect).toMatchObject({
      ownerPath: 'profile.firstName',
      path: 'profile.firstName',
      before: 'John',
      after: 'Jane',
    });
    expect(statusEffect).toMatchObject({
      ownerPath: 'request',
      path: 'request.state',
      before: LoadingState.NotLoaded,
      after: LoadingState.Loading,
    });
    expect(storedEffect).toMatchObject({
      ownerPath: 'preference',
      path: 'preference',
      before: 'compact',
      after: 'spacious',
    });
    expect(rekeyEffect).toMatchObject({
      ownerPath: 'users',
      path: 'users.u2',
      beforeKey: 'u1',
      afterKey: 'u2',
    });
    expect(rekeyEffect?.subject).toBe(originalSubject);
    expect(pendingTurn.__subjectIds).toEqual([originalSubject]);

    for (const authorityPositionId of pendingPositions) {
      expect(
        pendingPositions.every((participantPositionId) =>
          t.containsPosition(authorityPositionId, participantPositionId)
        )
      ).toBe(false);
    }
  });

  it('rolls back a planned mixed-family pending transaction surgically when later work has no structural dependency', async () => {
    const storage = createMockStorage();
    storage.setItem('planned-mixed-success-preference', JSON.stringify({ __v: 1, data: 'compact' }));

    const tree = plannedSignalTree({
      profile: {
        firstName: 'John',
      },
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
      request: status(),
      preference: stored('planned-mixed-success-preference', 'compact', {
        storage,
        debounceMs: 0,
      }),
    })
      .with(transactions())
      .with(timeTravel())
      .build() as ISignalTree<{
      profile: { firstName: string };
      users: unknown;
      request: unknown;
      preference: string;
    }> & {
      transaction(fn: () => void): { confirm(): void; rollback(): void };
      __timeTravel: TimeTravelRuntimeView;
    };

    tree.$.users.addOne({ id: 'u1', name: 'Jonathan' });
    await Promise.resolve();
    await Promise.resolve();

    const beforeUser = tree.$.users.byIdOrFail('u1')
      .name as unknown as EntityFieldMeta<string | undefined>;
    const baselineSubject = beforeUser.__subjectIds?.[0];

    const pending = tree.transaction(() => {
      tree.$.profile.firstName.set('Jane');
      tree.$.users.changeId('u1', 'u2');
      tree.$.request.setLoading();
      tree.$.preference.set('spacious');
    });

    tree.$.profile.firstName.set('Janet');
    tree.$.users.byIdOrFail('u2').name.set('Jon');
    tree.$.request.setLoaded();
    tree.$.preference.set('dense');
    await Promise.resolve();
    await Promise.resolve();

    pending.rollback();

    const survivingUser = tree.$.users.byIdOrFail('u1')
      .name as unknown as EntityFieldMeta<string | undefined>;

    expect(tree.$.profile.firstName()).toBe('Janet');
    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(survivingUser()).toBe('Jon');
    expect(survivingUser.__subjectIds?.[0]).toBe(baselineSubject);
    expect(tree.$.request.state()).toBe(LoadingState.Loaded);
    expect(tree.$.preference()).toBe('dense');
    expect(JSON.parse(storage.getItem('planned-mixed-success-preference') as string).data).toBe('dense');
    expect([...(tree.__timeTravel.getTurns().at(-1)?.__ownerPaths ?? [])].sort()).toEqual([
      'preference',
      'profile.firstName',
      'request',
      'users',
    ]);
  });

  it('rejects a planned mixed-family pending transaction while preserving later legitimate work and persistence', async () => {
    const storage = createMockStorage();
    storage.setItem('planned-mixed-reject-preference', JSON.stringify({ __v: 1, data: 'compact' }));

    const tree = plannedSignalTree({
      profile: {
        firstName: 'John',
      },
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
      request: status(),
      preference: stored('planned-mixed-reject-preference', 'compact', {
        storage,
        debounceMs: 0,
      }),
    })
      .with(transactions())
      .with(timeTravel())
      .build() as ISignalTree<{
      profile: { firstName: string };
      users: unknown;
      request: unknown;
      preference: string;
    }> & {
      transaction(fn: () => void): { confirm(): void; rollback(): void };
      __timeTravel: TimeTravelRuntimeView;
    };

    tree.$.users.addOne({ id: 'u1', name: 'Jonathan' });
    await Promise.resolve();
    await Promise.resolve();

    const beforeUser = tree.$.users.byIdOrFail('u1')
      .name as unknown as EntityFieldMeta<string | undefined>;
    const baselineSubject = beforeUser.__subjectIds?.[0];

    const pending = tree.transaction(() => {
      tree.$.profile.firstName.set('Jane');
      tree.$.users.changeId('u1', 'u2');
      tree.$.request.setLoading();
      tree.$.preference.set('spacious');
    });

    tree.$.profile.firstName.set('Janet');
    tree.$.users.byIdOrFail('u2').name.set('Jon');
    tree.$.users.changeId('u2', 'u3');
    tree.$.request.setLoaded();
    tree.$.preference.set('dense');
    await Promise.resolve();
    await Promise.resolve();

    expectRollbackError(() => pending.rollback(), {
      kind: 'later-confirmed-dependency',
      pendingEffect: { kind: 'rekey', ownerPath: 'users' },
      conflictingEffect: { kind: 'rekey', ownerPath: 'users' },
    });

    const survivingUser = tree.$.users.byIdOrFail('u3')
      .name as unknown as EntityFieldMeta<string | undefined>;

    expect(tree.$.profile.firstName()).toBe('Janet');
    expect(tree.$.users.ids()).toEqual(['u3']);
    expect(survivingUser()).toBe('Jon');
    expect(survivingUser.__subjectIds?.[0]).toBe(baselineSubject);
    expect(tree.$.request.state()).toBe(LoadingState.Loaded);
    expect(tree.$.preference()).toBe('dense');
    expect(JSON.parse(storage.getItem('planned-mixed-reject-preference') as string).data).toBe('dense');
    expect([...(tree.__timeTravel.getTurns().at(-1)?.__ownerPaths ?? [])].sort()).toEqual([
      'preference',
      'profile.firstName',
      'request',
      'users',
    ]);
  });

  it('installs causal capability before exposure so retained set refs stay correct', async () => {
    const tree = plannedSignalTree({ count: 0 }).with(timeTravel()).build();
    const setCount = tree.$.count.set.bind(tree.$.count);

    setCount(1);
    await Promise.resolve();

    expect(tree.canUndo()).toBe(true);
    tree.undo();
    expect(tree.$.count()).toBe(0);
  });

  it('activates mutation capture during planned transactions so retained set refs rollback correctly', () => {
    const tree = plannedSignalTree({ count: 0 }).with(transactions()).build();
    const setCount = tree.$.count.set.bind(tree.$.count);

    const pending = tree.transaction(() => {
      setCount(1);
    });

    expect(tree.$.count()).toBe(1);

    pending.rollback();

    expect(tree.$.count()).toBe(0);
  });

  it('unions and deduplicates capability requirements before build', () => {
    const tree = plannedSignalTree({ count: 0 })
      .with(capabilityEnhancer('cap-a'))
      .with(capabilityEnhancer('cap-b'))
      .build() as ISignalTree<{ count: number }> & {
      [PLANNED_TREE_BUILD_SYMBOL]?: {
        requestedCapabilities: string[];
        capabilities: string[];
        has(capability: string): boolean;
        leafMetadataStorage: string;
      };
    };

    expect(tree[PLANNED_TREE_BUILD_SYMBOL]?.requestedCapabilities).toEqual([
      'causal-runtime',
    ]);
    expect(tree[PLANNED_TREE_BUILD_SYMBOL]?.capabilities).toEqual([
      'mutation-capture',
      'position-topology',
      'causal-runtime',
    ]);
    expect(tree[PLANNED_TREE_BUILD_SYMBOL]?.has('mutation-capture')).toBe(true);
    expect(tree[PLANNED_TREE_BUILD_SYMBOL]?.has('position-topology')).toBe(true);
    expect(tree[PLANNED_TREE_BUILD_SYMBOL]?.has('temporal-snapshots')).toBe(
      false
    );
    expect(tree[PLANNED_TREE_BUILD_SYMBOL]?.leafMetadataStorage).toBe('sidecar');
    expect(tree.$.count.__positionIds).toBeUndefined();
    expect(getOwnedPositionIds(tree.$.count)?.length).toBe(1);
  });

  it('keeps temporal snapshots independent from causal-runtime in the build plan', () => {
    const tree = plannedSignalTree({ count: 0 }).with(timeTravel()).build() as
      ISignalTree<{ count: number }> & {
        [PLANNED_TREE_BUILD_SYMBOL]?: {
          requestedCapabilities: string[];
          capabilities: string[];
          has(capability: string): boolean;
        };
      };

    expect(tree[PLANNED_TREE_BUILD_SYMBOL]?.requestedCapabilities).toEqual([
      'causal-runtime',
      'temporal-snapshots',
    ]);
    expect(tree[PLANNED_TREE_BUILD_SYMBOL]?.capabilities).toEqual([
        'mutation-capture',
        'position-topology',
        'causal-runtime',
      'temporal-snapshots',
    ]);
  });

  it('does not let enhancer order change planned causal leaf construction', () => {
    const left = plannedSignalTree({ count: 0 })
      .with(transactions())
      .with(timeTravel())
      .build() as typeof plannedSignalTree extends never
      ? never
      : ISignalTree<{ count: number }> & {
          [PLANNED_TREE_BUILD_SYMBOL]?: {
            requestedCapabilities: string[];
            capabilities: string[];
          };
        };
    const right = plannedSignalTree({ count: 0 })
      .with(timeTravel())
      .with(transactions())
      .build() as ISignalTree<{ count: number }> & {
      [PLANNED_TREE_BUILD_SYMBOL]?: {
        requestedCapabilities: string[];
        capabilities: string[];
      };
    };

    expect(left[PLANNED_TREE_BUILD_SYMBOL]?.requestedCapabilities).toEqual([
      'causal-runtime',
      'temporal-snapshots',
    ]);
    expect(right[PLANNED_TREE_BUILD_SYMBOL]?.requestedCapabilities).toEqual([
      'causal-runtime',
      'temporal-snapshots',
    ]);
    expect(left[PLANNED_TREE_BUILD_SYMBOL]?.capabilities).toEqual([
      'mutation-capture',
      'position-topology',
      'causal-runtime',
      'temporal-snapshots',
    ]);
    expect(right[PLANNED_TREE_BUILD_SYMBOL]?.capabilities).toEqual([
      'mutation-capture',
      'position-topology',
      'causal-runtime',
      'temporal-snapshots',
    ]);

    expect(left[PLANNED_TREE_BUILD_SYMBOL]?.leafMetadataStorage).toBe(
      right[PLANNED_TREE_BUILD_SYMBOL]?.leafMetadataStorage
    );
    expect(left[PLANNED_TREE_BUILD_SYMBOL]?.has('mutation-capture')).toBe(true);
    expect(right[PLANNED_TREE_BUILD_SYMBOL]?.has('mutation-capture')).toBe(true);
    expect(left[PLANNED_TREE_BUILD_SYMBOL]?.has('temporal-snapshots')).toBe(
      true
    );
    expect(right[PLANNED_TREE_BUILD_SYMBOL]?.has('temporal-snapshots')).toBe(
      true
    );
    expect(left.$.count.__positionIds).toBeUndefined();
    expect(right.$.count.__positionIds).toBeUndefined();
    expect(getOwnedPositionIds(left.$.count)?.length).toBe(1);
    expect(getOwnedPositionIds(right.$.count)?.length).toBe(1);
  });

  it('rejects adding capabilities after build', () => {
    const tree = plannedSignalTree({ count: 0 }).build();

    expect(() => tree.with(timeTravel())).toThrow(
      'SignalTree: Capabilities are fixed at build() time for plannedSignalTree().'
    );
  });
});
