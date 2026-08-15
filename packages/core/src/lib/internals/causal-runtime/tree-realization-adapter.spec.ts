import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { entityMap } from '../../markers/entity-map';
import { form } from '../../markers/form';
import { stored } from '../../markers/stored';
import { getPathNotifier, resetPathNotifier } from '../../path-notifier';
import { signalTree } from '../../signal-tree';
import type { ISignalTree, UpdateMetadata } from '../../types';
import { timeTravel } from '../../../enhancers/time-travel/time-travel';
import { transactions } from '../../../enhancers/transactions/transactions';
import { getOwnedPositionIds, getOwnedSubjectIds, getOwnedOwnerPath } from '../owned-mutation';
import {
  clearProductionSubstrateStatsForTesting,
  installProductionSubstrateStatsForTesting,
  resetProductionSubstrateStatsForTesting,
} from '../production-substrate-stats';
import { getPhysicalCommitClock } from '../physical-commit-clock';
import { getTreeScalarSlotRuntime } from '../tree-scalar-slot-angular-runtime';

import { createTransactionCaptureBridge } from './transaction-capture-bridge';
import {
  createTreeRealizationAdapter,
  rememberTreeRealizationDescriptor,
  type TreeRealizationDescriptor,
} from './tree-realization-adapter';

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function createCaptureSpy() {
  const capture = vi.fn();
  const unsubscribe = getPathNotifier().subscribe(
    '**',
    createTransactionCaptureBridge({
      draft: {
        capture,
        seal: vi.fn(),
        confirm: vi.fn(),
        abort: vi.fn(),
        getLifecycle: vi.fn(() => 'open'),
      },
      turnId: 7,
      transactionOwner: {},
    })
  );

  return {
    capture,
    dispose() {
      unsubscribe();
    },
  };
}

describe('tree realization adapter', () => {
  beforeEach(() => {
    resetPathNotifier();
  });

  afterEach(() => {
    clearProductionSubstrateStatsForTesting();
  });

  it('applies scalar leaf effects without transaction recapture', () => {
    const tree = signalTree({ profile: { name: 'Alice' } }) as ISignalTree<{
      profile: {
        name: {
          (): string;
          set(value: string): void;
        };
      };
    }>;
    const owner = getOwnedPositionIds(tree.$.profile.name)?.[0];
    if (owner === undefined) {
      throw new Error('Expected owned position for profile.name');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'profile.name',
      positionIds: [owner],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const captureSpy = createCaptureSpy();

    expect(
      adapter.validateEffects([
        { owner, before: 'Alice', after: 'Alicia' },
      ])
    ).toBeUndefined();

    adapter.applyAtomically([{ owner, before: 'Alice', after: 'Alicia' }]);
    getPathNotifier().flushSync();

    expect(tree.$.profile.name()).toBe('Alicia');
    expect(captureSpy.capture).not.toHaveBeenCalled();

    captureSpy.dispose();
  });

  it('applies form-scoped leaf effects through ownerPath-relative resolution', () => {
    const tree = signalTree({
      profile: form({ initial: { name: '', address: { city: '', state: '' } } }),
    }) as ISignalTree<{
      profile: {
        (): { name: string; address: { city: string; state: string } };
        $: {
          name: {
            (): string;
            set(value: string): void;
          };
          address: {
            city: {
              (): string;
              set(value: string): void;
            };
          };
        };
        __positionIds?: number[];
      };
    }>;
    const owner = tree.$.profile.__positionIds?.[0];
    if (owner === undefined) {
      throw new Error('Expected owned position for profile form scope');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'profile.address.city',
      ownerPath: 'profile',
      positionIds: [owner],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    expect(
      adapter.validateEffects([
        {
          owner,
          before: 'Boston',
          after: '',
          path: 'profile.address.city',
          ownerPath: 'profile',
        },
      ])
    ).toBeUndefined();

    tree.$.profile.$.address.city.set('Boston');

    adapter.applyAtomically([
      {
        owner,
        before: 'Boston',
        after: '',
        path: 'profile.address.city',
        ownerPath: 'profile',
      },
    ]);

    expect(tree.$.profile().address.city).toBe('');
    expect(tree.$.profile().address.state).toBe('');
  });

  it('applies stored effects, persists restored state, and avoids transaction recapture', async () => {
    const storage = createMockStorage();
    const tree = signalTree({
      preference: stored('realization-preference', 'compact', {
        storage,
        debounceMs: 0,
      }),
    }) as ISignalTree<{
      preference: {
        (): string;
        set(value: string): void;
      };
    }>;
    const owner = getOwnedPositionIds(tree.$.preference)?.[0];
    if (owner === undefined) {
      throw new Error('Expected owned position for preference');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'preference',
      positionIds: [owner],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const captureSpy = createCaptureSpy();

    adapter.applyAtomically([{ owner, before: 'compact', after: 'spacious' }]);
    getPathNotifier().flushSync();
    await new Promise((resolve) => queueMicrotask(resolve));

    expect(tree.$.preference()).toBe('spacious');
    expect(JSON.parse(storage.getItem('realization-preference') ?? 'null')).toEqual({
      __v: 1,
      data: 'spacious',
    });
    expect(captureSpy.capture).not.toHaveBeenCalled();

    captureSpy.dispose();
  });

  it('preserves subject identity and owned positions across structural rekey', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string; enabled: boolean }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string; enabled: boolean }): void;
        changeId(from: string, to: string): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
        };
        ids(): string[];
      };
    }>;

    tree.$.users.addOne({ id: 'u2', name: 'Alice', enabled: true });
    getPathNotifier().flushSync();

    const owner = getOwnedPositionIds(tree.$.users)?.[0];
    const beforeNameLeaf = tree.$.users.byIdOrFail('u2').name;
    const beforeSubjectId = beforeNameLeaf.__subjectIds?.[0];
    const beforePositions = getOwnedPositionIds(beforeNameLeaf);
    if (owner === undefined || beforeSubjectId === undefined || !beforePositions) {
      throw new Error('Expected entity ownership metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u2',
      ownerPath: 'users',
      positionIds: [owner],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    expect(
      adapter.validateEffects([
        {
          owner,
          before: 'u2',
          after: 'u1',
          subjectId: beforeSubjectId,
          structural: 'rekey',
        },
      ])
    ).toBeUndefined();

    adapter.applyAtomically([
      {
        owner,
        before: 'u2',
        after: 'u1',
        subjectId: beforeSubjectId,
        structural: 'rekey',
      },
    ]);
    getPathNotifier().flushSync();

    const afterNameLeaf = tree.$.users.byIdOrFail('u1').name;
    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(afterNameLeaf.__subjectIds?.[0]).toBe(beforeSubjectId);
    expect(getOwnedPositionIds(afterNameLeaf)).toEqual(beforePositions);
  });

  it('characterizes entity field PositionIds as shared collection coverage, not exact field identity', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string; enabled: boolean }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string; enabled: boolean }): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
          enabled: (() => boolean) & { __subjectIds?: number[] };
        };
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice', enabled: true });
    getPathNotifier().flushSync();

    const collectionOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const row = tree.$.users.byIdOrFail('u1');
    const namePositions = getOwnedPositionIds(row.name);
    const enabledPositions = getOwnedPositionIds(row.enabled);
    const nameSubjectId = getOwnedSubjectIds(row.name)?.[0];
    const enabledSubjectId = getOwnedSubjectIds(row.enabled)?.[0];

    expect(collectionOwner).toBeDefined();
    expect(getOwnedPositionIds(row)).toBeUndefined();
    expect(namePositions).toEqual([collectionOwner]);
    expect(enabledPositions).toEqual([collectionOwner]);
    expect(nameSubjectId).toBe(enabledSubjectId);
  });

  it('validates a subject descriptor added after adapter creation with zero tree visits', () => {
    const stats = installProductionSubstrateStatsForTesting();
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
        };
      };
    }>;

    try {
      const descriptors = new Map<number, TreeRealizationDescriptor>();
      const adapter = createTreeRealizationAdapter({
        tree: tree as ISignalTree<object>,
        descriptors,
      });

      tree.$.users.addOne({ id: 'u1', name: 'Alice' });
      getPathNotifier().flushSync();

      const nameLeaf = tree.$.users.byIdOrFail('u1').name;
      const positionId = getOwnedPositionIds(nameLeaf)?.[0];
      const subjectId = nameLeaf.__subjectIds?.[0];
      if (positionId === undefined || subjectId === undefined) {
        throw new Error('Expected subject-aware descriptor metadata');
      }

      rememberTreeRealizationDescriptor({
        descriptors,
        path: 'users.u1.name',
        ownerPath: 'users.u1',
        positionIds: [positionId],
        subjectIds: [subjectId],
      });

      resetProductionSubstrateStatsForTesting(stats);
      expect(
        adapter.validateEffects([
          { owner: positionId, before: 'Alice', after: 'Alicia', subjectId },
        ])
      ).toBeUndefined();
      expect(stats.treeVisits).toBe(0);
    } finally {
      tree.destroy();
    }
  });

  it('resolves the same semantic subject target after a rekey performed after adapter creation with zero tree visits', () => {
    const stats = installProductionSubstrateStatsForTesting();
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        changeId(from: string, to: string): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
        };
      };
    }>;

    try {
      tree.$.users.addOne({ id: 'u1', name: 'Alice' });
      getPathNotifier().flushSync();

      const nameLeaf = tree.$.users.byIdOrFail('u1').name;
      const positionId = getOwnedPositionIds(nameLeaf)?.[0];
      const subjectId = nameLeaf.__subjectIds?.[0];
      if (positionId === undefined || subjectId === undefined) {
        throw new Error('Expected stable semantic target metadata');
      }

      const descriptors = new Map<number, TreeRealizationDescriptor>();
      rememberTreeRealizationDescriptor({
        descriptors,
        path: 'users.u1.name',
        ownerPath: 'users.u1',
        positionIds: [positionId],
        subjectIds: [subjectId],
      });

      const adapter = createTreeRealizationAdapter({
        tree: tree as ISignalTree<object>,
        descriptors,
      });

      tree.$.users.changeId('u1', 'u2');
      getPathNotifier().flushSync();

      resetProductionSubstrateStatsForTesting(stats);
      expect(
        adapter.validateEffects([
          { owner: positionId, before: 'Alice', after: 'Alicia', subjectId },
        ])
      ).toBeUndefined();
      expect(stats.treeVisits).toBe(0);
    } finally {
      tree.destroy();
    }
  });

  it('resolves a restored semantic subject target after adapter creation with zero tree visits', () => {
    const stats = installProductionSubstrateStatsForTesting();
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
        };
        ids(): string[];
      };
    }>;

    try {
      tree.$.users.addOne({ id: 'u1', name: 'Alice' });
      getPathNotifier().flushSync();

      const collectionOwner = getOwnedPositionIds(tree.$.users)?.[0];
      const nameLeaf = tree.$.users.byIdOrFail('u1').name;
      const positionId = getOwnedPositionIds(nameLeaf)?.[0];
      const subjectId = nameLeaf.__subjectIds?.[0];
      if (
        collectionOwner === undefined ||
        positionId === undefined ||
        subjectId === undefined
      ) {
        throw new Error('Expected restore descriptor metadata');
      }

      const descriptors = new Map<number, TreeRealizationDescriptor>();
      rememberTreeRealizationDescriptor({
        descriptors,
        path: 'users.u1',
        ownerPath: 'users',
        positionIds: [collectionOwner],
        subjectIds: [subjectId],
        meta: {
          historyEffect: {
            kind: 'remove',
            subject: subjectId,
            key: 'u1',
            value: { id: 'u1', name: 'Alicia' },
            subjectPositions: [collectionOwner, positionId],
          },
        },
      });
      rememberTreeRealizationDescriptor({
        descriptors,
        path: 'users.u1.name',
        ownerPath: 'users.u1',
        positionIds: [positionId],
        subjectIds: [subjectId],
      });

      const adapter = createTreeRealizationAdapter({
        tree: tree as ISignalTree<object>,
        descriptors,
      });

      tree.$.users.removeOne('u1');
      getPathNotifier().flushSync();

      resetProductionSubstrateStatsForTesting(stats);
      expect(
        adapter.validateEffects([
          {
            owner: collectionOwner,
            before: undefined,
            after: 'u2',
            subjectId,
            structural: 'add',
          },
        ])
      ).toBeUndefined();
      expect(stats.treeVisits).toBe(0);

      adapter.applyAtomically([
        {
          owner: collectionOwner,
          before: undefined,
          after: 'u2',
          subjectId,
          structural: 'add',
        },
      ]);
      getPathNotifier().flushSync();

      resetProductionSubstrateStatsForTesting(stats);
      expect(
        adapter.validateEffects([
          { owner: positionId, before: 'Alicia', after: 'Ally', subjectId },
        ])
      ).toBeUndefined();
      expect(stats.treeVisits).toBe(0);
      expect(tree.$.users.byIdOrFail('u2').name()).toBe('Alicia');
    } finally {
      tree.destroy();
    }
  });

  it('refuses same-key structural work when that key is now occupied by a different subject', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
        };
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice' });
    getPathNotifier().flushSync();

    const owner = getOwnedPositionIds(tree.$.users)?.[0];
    const subjectId = tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0];
    if (owner === undefined || subjectId === undefined) {
      throw new Error('Expected entity structural metadata');
    }

    tree.$.users.removeOne('u1');
    tree.$.users.addOne({ id: 'u1', name: 'Bob' });
    getPathNotifier().flushSync();

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [owner],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    expect(
      adapter.validateEffects([
        {
          owner,
          before: 'u1',
          after: undefined,
          subjectId,
          structural: 'remove',
        },
      ])
    ).toEqual({ kind: 'structural-drift' });
  });

  it('resolves scalar realization by stable PositionId after a physical rekey', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        changeId(from: string, to: string): void;
        byIdOrFail(id: string): {
          name: {
            (): string;
            set(value: string): void;
          };
        };
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice' });
    getPathNotifier().flushSync();

    const nameOwner = getOwnedPositionIds(tree.$.users.byIdOrFail('u1').name)?.[0];
    const subjectId = tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0];
    if (nameOwner === undefined || subjectId === undefined) {
      throw new Error('Expected stable leaf owner');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
      positionIds: [nameOwner],
      subjectIds: [subjectId],
    });

    tree.$.users.changeId('u1', 'u2');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    expect(
      adapter.validateEffects([
        { owner: nameOwner, before: 'Alice', after: 'Alicia', subjectId },
      ])
    ).toBeUndefined();

    adapter.applyAtomically([
      { owner: nameOwner, before: 'Alice', after: 'Alicia', subjectId },
    ]);
    getPathNotifier().flushSync();

    expect(tree.$.users.byIdOrFail('u2').name()).toBe('Alicia');
  });

  it('commits mixed realization rekey and scalar publication coherently without relying on notifier batching', () => {
    const notifier = getPathNotifier();
    const previousBatching = notifier.isBatchingEnabled();
    notifier.setBatchingEnabled(false);

    try {
      TestBed.runInInjectionContext(() => {
        const tree = signalTree({
          users: entityMap<{ id: string; name: string }, string>({
            selectId: (user) => user.id,
          }),
        }) as ISignalTree<{
          users: {
            addOne(user: { id: string; name: string }): void;
            changeId(from: string, to: string): void;
            ids(): string[];
            byIdOrFail(id: string): {
              name: {
                (): string;
                set(value: string): void;
                __subjectIds?: number[];
              };
            };
          };
        }>;

        tree.$.users.addOne({ id: 'u1', name: 'Alice' });

        const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
        const nameLeaf = tree.$.users.byIdOrFail('u1').name;
        const scalarOwner = getOwnedPositionIds(nameLeaf)?.[0];
        const subjectId = nameLeaf.__subjectIds?.[0];
        if (
          structuralOwner === undefined ||
          scalarOwner === undefined ||
          subjectId === undefined
        ) {
          throw new Error('Expected structural and scalar ownership metadata');
        }

        const descriptors = new Map<number, TreeRealizationDescriptor>();
        rememberTreeRealizationDescriptor({
          descriptors,
          path: 'users.u1',
          ownerPath: 'users',
          positionIds: [structuralOwner],
          subjectIds: [subjectId],
        });
        rememberTreeRealizationDescriptor({
          descriptors,
          path: 'users.u1.name',
          ownerPath: 'users.u1',
          positionIds: [scalarOwner],
          subjectIds: [subjectId],
        });

        const adapter = createTreeRealizationAdapter({
          tree: tree as ISignalTree<object>,
          descriptors,
        });
        const seen: string[] = [];
        effect(() => {
          seen.push(`${tree.$.users.ids()[0]}|${nameLeaf()}`);
        });
        TestBed.flushEffects();

        adapter.applyAtomically([
          {
            owner: structuralOwner,
            before: 'u1',
            after: 'u2',
            subjectId,
            structural: 'rekey',
          },
          {
            owner: scalarOwner,
            before: 'Alice',
            after: 'Alicia',
            subjectId,
          },
        ]);
        TestBed.flushEffects();

        expect(tree.$.users.byIdOrFail('u2').name()).toBe('Alicia');
        expect(seen).toEqual(['u1|Alice', 'u2|Alicia']);
      });
    } finally {
      notifier.setBatchingEnabled(previousBatching);
    }
  });

  it('realizes structural remove and add from owner-level producer metadata', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string; enabled: boolean }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string; enabled: boolean }): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
          enabled(): boolean;
        };
        ids(): string[];
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice', enabled: true });
    getPathNotifier().flushSync();

    const owner = getOwnedPositionIds(tree.$.users)?.[0];
    const beforeNameLeaf = tree.$.users.byIdOrFail('u1').name;
    const beforeSubjectId = beforeNameLeaf.__subjectIds?.[0];
    const beforePositions = getOwnedPositionIds(beforeNameLeaf);
    if (owner === undefined || beforeSubjectId === undefined || !beforePositions) {
      throw new Error('Expected structural ownership metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [owner],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: beforeSubjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Alice', enabled: true },
          subjectPositions: [owner],
        },
      },
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    adapter.applyAtomically([
      {
        owner,
        before: 'u1',
        after: undefined,
        subjectId: beforeSubjectId,
        structural: 'remove',
      },
    ]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual([]);

    expect(
      adapter.validateEffects([
        {
          owner,
          before: undefined,
          after: 'u1',
          subjectId: beforeSubjectId,
          structural: 'add',
        },
      ])
    ).toBeUndefined();

    adapter.applyAtomically([
      {
        owner,
        before: undefined,
        after: 'u1',
        subjectId: beforeSubjectId,
        structural: 'add',
      },
    ]);
    getPathNotifier().flushSync();

    const restored = tree.$.users.byIdOrFail('u1');
    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(restored.name()).toBe('Alice');
    expect(restored.enabled()).toBe(true);
    expect(restored.name.__subjectIds?.[0]).toBe(beforeSubjectId);
    expect(getOwnedPositionIds(restored.name)).toEqual(beforePositions);
  });

  it('prepares and realizes a retained-subject structural restore from removal metadata alone', () => {
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
          name: (() => string) & { __subjectIds?: number[] };
        };
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const nameLeaf = tree.$.users.byIdOrFail('u1').name;
    const nameOwner = getOwnedPositionIds(nameLeaf)?.[0];
    const subjectId = nameLeaf.__subjectIds?.[0];
    if (
      structuralOwner === undefined ||
      nameOwner === undefined ||
      subjectId === undefined
    ) {
      throw new Error('Expected retained subject structural metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subjectId],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner],
        },
      },
    });

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    const addEffect = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId,
      structural: 'add' as const,
    };

    expect(adapter.validateEffects([addEffect])).toBeUndefined();

    adapter.applyAtomically([addEffect]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Ada');
    expect(tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0]).toBe(subjectId);
  });

  it('realizes a same-turn restore plus separate subject scalar under one shared physical revision', () => {
    const notifier = getPathNotifier();
    const previousBatching = notifier.isBatchingEnabled();
    notifier.setBatchingEnabled(false);

    try {
      TestBed.runInInjectionContext(() => {
        const tree = signalTree({
          users: entityMap<{ id: string; name: string }, string>({
            selectId: (user) => user.id,
          }),
        }).with(timeTravel()) as ISignalTree<{
          users: {
            addOne(user: { id: string; name: string }): void;
            removeOne(id: string): void;
            ids(): string[];
            byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
              name: ((() => string | undefined) & { __subjectIds?: number[] });
            });
          };
        }>;

        tree.$.users.addOne({ id: 'u1', name: 'Ada' });
        getPathNotifier().flushSync();

        const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
        const heldRow = tree.$.users.byIdOrFail('u1');
        const heldName = heldRow.name;
        heldRow();
        heldName();
        const nameOwner = getOwnedPositionIds(heldName)?.[0];
        const subjectId = heldName.__subjectIds?.[0];
        if (
          structuralOwner === undefined ||
          nameOwner === undefined ||
          subjectId === undefined
        ) {
          throw new Error('Expected retained subject structural + scalar metadata');
        }

        const descriptors = new Map<number, TreeRealizationDescriptor>();
        rememberTreeRealizationDescriptor({
          descriptors,
          path: 'users.u1',
          ownerPath: 'users',
          positionIds: [structuralOwner],
          subjectIds: [subjectId],
          meta: {
            historyEffect: {
              kind: 'remove',
              subject: subjectId,
              key: 'u1',
              value: { id: 'u1', name: 'Ada' },
              subjectPositions: [structuralOwner, nameOwner],
            },
          },
        });
        rememberTreeRealizationDescriptor({
          descriptors,
          path: 'users.u1.name',
          ownerPath: 'users.u1',
          positionIds: [nameOwner],
          subjectIds: [subjectId],
        });

        tree.$.users.removeOne('u1');
        getPathNotifier().flushSync();

        expect(tree.$.users.ids()).toEqual([]);
        expect(heldRow()).toBeUndefined();
        expect(heldName()).toBeUndefined();

        const adapter = createTreeRealizationAdapter({
          tree: tree as ISignalTree<object>,
          descriptors,
        });
        const physicalCommitClock =
          getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
        const beforeRevision = physicalCommitClock?.revision();

        const addEffect = {
          owner: structuralOwner,
          before: undefined,
          after: 'u1',
          subjectId,
          structural: 'add' as const,
        };
        const scalarEffect = {
          owner: nameOwner,
          before: 'Ada',
          after: 'Alicia',
          subjectId,
        };

        expect(adapter.validateEffects([addEffect, scalarEffect])).toBeUndefined();

        const seen: string[] = [];
        effect(() => {
          seen.push(`${tree.$.users.ids()[0] ?? '<none>'}|${heldName() ?? '<none>'}`);
        });
        TestBed.flushEffects();

        adapter.applyAtomically([addEffect, scalarEffect]);
        TestBed.flushEffects();
        getPathNotifier().flushSync();

        expect(tree.$.users.ids()).toEqual(['u1']);
        expect(heldRow()?.id).toBe('u1');
        expect(heldName()).toBe('Alicia');
        expect(heldName.__subjectIds?.[0]).toBe(subjectId);
        expect(physicalCommitClock?.revision()).toBe(
          beforeRevision === undefined ? undefined : beforeRevision + 1
        );
        expect(seen).toEqual(['<none>|<none>', 'u1|Alicia']);
      });
    } finally {
      notifier.setBatchingEnabled(previousBatching);
    }
  });

  it('keeps restore planning side-effect free when later scalar frame preparation fails', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldRow = tree.$.users.byIdOrFail('u1');
    const heldName = heldRow.name;
    heldRow();
    heldName();
    const nameOwner = getOwnedPositionIds(heldName)?.[0];
    const subjectId = heldName.__subjectIds?.[0];
    if (
      structuralOwner === undefined ||
      nameOwner === undefined ||
      subjectId === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subjectId],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
      positionIds: [nameOwner],
      subjectIds: [subjectId],
    });

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();
    const notifications: string[] = [];
    const unsubscribe = getPathNotifier().subscribe('**', (_value, _prev, path) => {
      notifications.push(path);
    });

    const addEffect = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId,
      structural: 'add' as const,
    };
    const scalarEffect = {
      owner: nameOwner,
      before: 'Ada',
      after: 'Alicia',
      subjectId,
    };

    expect(adapter.validateEffects([addEffect, scalarEffect])).toBeUndefined();

    const collectionInternal = tree.$.users as typeof tree.$.users & {
      __planRestore?: (
        key: string,
        entity: { id: string; name: string },
        subjectId: number,
        beforeSubject?: number,
        afterSubject?: number
      ) => {
        commit(options?: { advancePhysicalRevision?: boolean }): void;
        publish(metaOverride?: UpdateMetadata): void;
      };
    };
    if (!collectionInternal.__planRestore) {
      throw new Error('Expected deferred restore planner for restore planning test');
    }

    const originalPlanRestore = collectionInternal.__planRestore.bind(collectionInternal);
    const planRestoreSpy = vi
      .spyOn(collectionInternal, '__planRestore')
      .mockImplementation(() => {
        const plan = originalPlanRestore(
          'u1',
          { id: 'u1', name: 'Alicia' },
          subjectId
        );
        return {
          commit: (_options) => {
            throw new Error('Prepared scalar frame failure');
          },
          publish: plan.publish.bind(plan),
        };
      });

    expect(() => adapter.applyAtomically([addEffect, scalarEffect])).toThrow(
      'Prepared scalar frame failure'
    );
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual([]);
    expect(heldRow()).toBeUndefined();
    expect(heldName()).toBeUndefined();
    expect(physicalCommitClock?.revision()).toBe(beforeRevision);
    expect(notifications).toEqual([]);

    planRestoreSpy.mockRestore();
    unsubscribe();
  });

  it('realizes same-turn restore then rekey against prepared subject state', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldRow = tree.$.users.byIdOrFail('u1');
    const heldName = heldRow.name;
    heldRow();
    heldName();
    const nameOwner = getOwnedPositionIds(heldName)?.[0];
    const subjectId = heldName.__subjectIds?.[0];
    if (
      structuralOwner === undefined ||
      nameOwner === undefined ||
      subjectId === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subjectId],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
      positionIds: [nameOwner],
      subjectIds: [subjectId],
    });

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();

    const restoreEffect = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId,
      structural: 'add' as const,
    };
    const rekeyEffect = {
      owner: structuralOwner,
      before: 'u1',
      after: 'u2',
      subjectId,
      structural: 'rekey' as const,
    };
    const scalarEffect = {
      owner: nameOwner,
      before: 'Ada',
      after: 'Alicia',
      subjectId,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
    };

    expect(adapter.validateEffects([restoreEffect, rekeyEffect])).toBeUndefined();
    expect(
      adapter.validateEffects([restoreEffect, rekeyEffect, scalarEffect])
    ).toBeUndefined();

    adapter.applyAtomically([restoreEffect, rekeyEffect, scalarEffect]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u2']);
    expect(tree.$.users.byIdOrFail('u2').name()).toBe('Alicia');
    expect(heldRow()).toBeDefined();
    expect(heldName()).toBe('Alicia');
    expect(heldName.__subjectIds?.[0]).toBe(subjectId);
    expect(physicalCommitClock?.revision()).toBe(
      beforeRevision === undefined ? undefined : beforeRevision + 1
    );
  });

  it('keeps restore-rekey planning side-effect free when a later stale subject scalar fails', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldRow = tree.$.users.byIdOrFail('u1');
    const heldName = heldRow.name;
    heldRow();
    heldName();
    const nameOwner = getOwnedPositionIds(heldName)?.[0];
    const subjectId = heldName.__subjectIds?.[0];
    if (
      structuralOwner === undefined ||
      nameOwner === undefined ||
      subjectId === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subjectId],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.missing',
      ownerPath: 'users.u1',
      positionIds: [nameOwner],
      subjectIds: [subjectId],
    });

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();
    const notifications: string[] = [];
    const unsubscribe = getPathNotifier().subscribe('**', (_value, _prev, path) => {
      notifications.push(path);
    });

    const restoreEffect = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId,
      structural: 'add' as const,
    };
    const rekeyEffect = {
      owner: structuralOwner,
      before: 'u1',
      after: 'u2',
      subjectId,
      structural: 'rekey' as const,
    };
    const invalidScalarEffect = {
      owner: nameOwner,
      before: undefined,
      after: 'Alicia',
      subjectId,
      path: 'users.u1.missing',
      ownerPath: 'users.u1',
    };

    expect(adapter.validateEffects([restoreEffect, rekeyEffect])).toBeUndefined();
    expect(
      adapter.validateEffects([restoreEffect, rekeyEffect, invalidScalarEffect])
    ).toEqual({ kind: 'structural-drift' });

    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual([]);
    expect(heldRow()).toBeUndefined();
    expect(heldName()).toBeUndefined();
    expect(physicalCommitClock?.revision()).toBe(beforeRevision);
    expect(notifications).toEqual([]);

    unsubscribe();
  });

  it('refuses prepared restore-rekey when the destination key remains occupied', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    tree.$.users.addOne({ id: 'u2', name: 'Bea' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldRow = tree.$.users.byIdOrFail('u1');
    const heldName = heldRow.name;
    heldRow();
    heldName();
    const nameOwner = getOwnedPositionIds(heldName)?.[0];
    const subjectId = heldName.__subjectIds?.[0];
    if (
      structuralOwner === undefined ||
      nameOwner === undefined ||
      subjectId === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subjectId],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner],
        },
      },
    });

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    expect(
      adapter.validateEffects([
        {
          owner: structuralOwner,
          before: undefined,
          after: 'u1',
          subjectId,
          structural: 'add' as const,
        },
        {
          owner: structuralOwner,
          before: 'u1',
          after: 'u2',
          subjectId,
          structural: 'rekey' as const,
        },
      ])
    ).toEqual({ kind: 'structural-drift' });
  });

  it('realizes remove-restore-rekey when prepared vacancy overrides live occupancy', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    tree.$.users.addOne({ id: 'u2', name: 'Bea' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldRow42 = tree.$.users.byIdOrFail('u1');
    const heldName42 = heldRow42.name;
    heldRow42();
    heldName42();
    const nameOwner42 = getOwnedPositionIds(heldName42)?.[0];
    const subject42 = heldName42.__subjectIds?.[0];

    const heldRow99 = tree.$.users.byIdOrFail('u2');
    const heldName99 = heldRow99.name;
    heldRow99();
    heldName99();
    const subject99 = heldName99.__subjectIds?.[0];

    if (
      structuralOwner === undefined ||
      nameOwner42 === undefined ||
      subject42 === undefined ||
      subject99 === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subject42],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subject42,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner42],
        },
      },
    });

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();

    const remove99 = {
      owner: structuralOwner,
      before: 'u2',
      after: undefined,
      subjectId: subject99,
      structural: 'remove' as const,
    };
    const restore42 = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId: subject42,
      structural: 'add' as const,
    };
    const rekey42ToB = {
      owner: structuralOwner,
      before: 'u1',
      after: 'u2',
      subjectId: subject42,
      structural: 'rekey' as const,
    };

    expect(adapter.validateEffects([remove99, restore42])).toBeUndefined();
    expect(adapter.validateEffects([restore42, rekey42ToB])).toEqual({
      kind: 'structural-drift',
    });
    expect(adapter.validateEffects([remove99, restore42, rekey42ToB])).toBeUndefined();

    adapter.applyAtomically([remove99, restore42, rekey42ToB]);

    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u2']);
    expect(tree.$.users.byIdOrFail('u2').name()).toBe('Ada');
    expect(heldRow99()).toBeUndefined();
    expect(heldName99()).toBeUndefined();
    expect(heldRow42()).toBeDefined();
    expect(heldName42()).toBe('Ada');
    expect(heldName42.__subjectIds?.[0]).toBe(subject42);
    expect(physicalCommitClock?.revision()).toBe(
      beforeRevision === undefined ? undefined : beforeRevision + 1
    );
  });

  it('keeps prepared vacancy side-effect free when a later scalar effect refuses', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    tree.$.users.addOne({ id: 'u2', name: 'Bea' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldRow42 = tree.$.users.byIdOrFail('u1');
    const heldName42 = heldRow42.name;
    heldRow42();
    heldName42();
    const nameOwner42 = getOwnedPositionIds(heldName42)?.[0];
    const subject42 = heldName42.__subjectIds?.[0];

    const heldRow99 = tree.$.users.byIdOrFail('u2');
    const heldName99 = heldRow99.name;
    heldRow99();
    heldName99();
    const subject99 = heldName99.__subjectIds?.[0];

    if (
      structuralOwner === undefined ||
      nameOwner42 === undefined ||
      subject42 === undefined ||
      subject99 === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subject42],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subject42,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner42],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.missing',
      ownerPath: 'users.u1',
      positionIds: [nameOwner42],
      subjectIds: [subject42],
    });

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();
    const notifications: string[] = [];
    const unsubscribe = getPathNotifier().subscribe('**', (_value, _prev, path) => {
      notifications.push(path);
    });

    const remove99 = {
      owner: structuralOwner,
      before: 'u2',
      after: undefined,
      subjectId: subject99,
      structural: 'remove' as const,
    };
    const restore42 = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId: subject42,
      structural: 'add' as const,
    };
    const rekey42ToB = {
      owner: structuralOwner,
      before: 'u1',
      after: 'u2',
      subjectId: subject42,
      structural: 'rekey' as const,
    };
    const invalidScalarEffect = {
      owner: nameOwner42,
      before: undefined,
      after: 'Alicia',
      subjectId: subject42,
      path: 'users.u1.missing',
      ownerPath: 'users.u1',
    };

    expect(
      adapter.validateEffects([remove99, restore42, rekey42ToB, invalidScalarEffect])
    ).toEqual({ kind: 'structural-drift' });

    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u2']);
    expect(heldRow99()?.id).toBe('u2');
    expect(heldName99()).toBe('Bea');
    expect(heldRow42()).toBeUndefined();
    expect(heldName42()).toBeUndefined();
    expect(physicalCommitClock?.revision()).toBe(beforeRevision);
    expect(notifications).toEqual([]);

    unsubscribe();
  });

  it('keeps competing prepared restores side-effect free when earlier prepared occupancy blocks a later rekey', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    tree.$.users.addOne({ id: 'u2', name: 'Bea' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];

    const heldRow42 = tree.$.users.byIdOrFail('u1');
    const heldName42 = heldRow42.name;
    heldRow42();
    heldName42();
    const nameOwner42 = getOwnedPositionIds(heldName42)?.[0];
    const subject42 = heldName42.__subjectIds?.[0];

    const heldRow99 = tree.$.users.byIdOrFail('u2');
    const heldName99 = heldRow99.name;
    heldRow99();
    heldName99();
    const nameOwner99 = getOwnedPositionIds(heldName99)?.[0];
    const subject99 = heldName99.__subjectIds?.[0];

    if (
      structuralOwner === undefined ||
      nameOwner42 === undefined ||
      subject42 === undefined ||
      nameOwner99 === undefined ||
      subject99 === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subject42],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subject42,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner42],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u2',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subject99],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subject99,
          key: 'u2',
          value: { id: 'u2', name: 'Bea' },
          subjectPositions: [structuralOwner, nameOwner99],
        },
      },
    });

    tree.$.users.removeOne('u1');
    tree.$.users.removeOne('u2');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();
    const notifications: string[] = [];
    const unsubscribe = getPathNotifier().subscribe('**', (_value, _prev, path) => {
      notifications.push(path);
    });

    const restore99AtB = {
      owner: structuralOwner,
      before: undefined,
      after: 'u2',
      subjectId: subject99,
      structural: 'add' as const,
    };
    const restore42AtA = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId: subject42,
      structural: 'add' as const,
    };
    const rekey42ToB = {
      owner: structuralOwner,
      before: 'u1',
      after: 'u2',
      subjectId: subject42,
      structural: 'rekey' as const,
    };

    expect(adapter.validateEffects([restore42AtA, rekey42ToB])).toBeUndefined();
    expect(adapter.validateEffects([restore99AtB, restore42AtA])).toBeUndefined();
    expect(
      adapter.validateEffects([restore99AtB, restore42AtA, rekey42ToB])
    ).toEqual({ kind: 'structural-drift' });

    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual([]);
    expect(heldRow99()).toBeUndefined();
    expect(heldName99()).toBeUndefined();
    expect(heldRow42()).toBeUndefined();
    expect(heldName42()).toBeUndefined();
    expect(physicalCommitClock?.revision()).toBe(beforeRevision);
    expect(notifications).toEqual([]);

    unsubscribe();
  });

  it('realizes remove-restore-rekey-scalar as one coherent prepared topology turn', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    tree.$.users.addOne({ id: 'u2', name: 'Bea' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldRow42 = tree.$.users.byIdOrFail('u1');
    const heldName42 = heldRow42.name;
    heldRow42();
    heldName42();
    const nameOwner42 = getOwnedPositionIds(heldName42)?.[0];
    const subject42 = heldName42.__subjectIds?.[0];

    const heldRow99 = tree.$.users.byIdOrFail('u2');
    const heldName99 = heldRow99.name;
    heldRow99();
    heldName99();
    const subject99 = heldName99.__subjectIds?.[0];

    if (
      structuralOwner === undefined ||
      nameOwner42 === undefined ||
      subject42 === undefined ||
      subject99 === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subject42],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subject42,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner42],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
      positionIds: [nameOwner42],
      subjectIds: [subject42],
    });

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();

    const remove99 = {
      owner: structuralOwner,
      before: 'u2',
      after: undefined,
      subjectId: subject99,
      structural: 'remove' as const,
    };
    const restore42 = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId: subject42,
      structural: 'add' as const,
    };
    const rekey42ToB = {
      owner: structuralOwner,
      before: 'u1',
      after: 'u2',
      subjectId: subject42,
      structural: 'rekey' as const,
    };
    const rename42 = {
      owner: nameOwner42,
      before: 'Ada',
      after: 'Alicia',
      subjectId: subject42,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
    };

    expect(
      adapter.validateEffects([remove99, restore42, rekey42ToB, rename42])
    ).toBeUndefined();

    adapter.applyAtomically([remove99, restore42, rekey42ToB, rename42]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u2']);
    expect(tree.$.users.byIdOrFail('u2').name()).toBe('Alicia');
    expect(heldRow99()).toBeUndefined();
    expect(heldName99()).toBeUndefined();
    expect(heldRow42()).toBeDefined();
    expect(heldName42()).toBe('Alicia');
    expect(heldName42.__subjectIds?.[0]).toBe(subject42);
    expect(physicalCommitClock?.revision()).toBe(
      beforeRevision === undefined ? undefined : beforeRevision + 1
    );
  });

  it('refuses rekey when a later prepared restore re-occupies the vacated destination', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    tree.$.users.addOne({ id: 'u2', name: 'Bea' });
    tree.$.users.addOne({ id: 'u3', name: 'Cy' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];

    const heldRow42 = tree.$.users.byIdOrFail('u1');
    const heldName42 = heldRow42.name;
    heldRow42();
    heldName42();
    const nameOwner42 = getOwnedPositionIds(heldName42)?.[0];
    const subject42 = heldName42.__subjectIds?.[0];

    const heldRow99 = tree.$.users.byIdOrFail('u2');
    const heldName99 = heldRow99.name;
    heldRow99();
    heldName99();
    const nameOwner99 = getOwnedPositionIds(heldName99)?.[0];
    const subject99 = heldName99.__subjectIds?.[0];

    const heldRow77 = tree.$.users.byIdOrFail('u3');
    const heldName77 = heldRow77.name;
    heldRow77();
    heldName77();
    const nameOwner77 = getOwnedPositionIds(heldName77)?.[0];
    const subject77 = heldName77.__subjectIds?.[0];

    if (
      structuralOwner === undefined ||
      nameOwner42 === undefined ||
      subject42 === undefined ||
      nameOwner99 === undefined ||
      subject99 === undefined ||
      nameOwner77 === undefined ||
      subject77 === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subject42],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subject42,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner42],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u2',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subject99],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subject99,
          key: 'u2',
          value: { id: 'u2', name: 'Bea' },
          subjectPositions: [structuralOwner, nameOwner99],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u3',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subject77],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subject77,
          key: 'u3',
          value: { id: 'u3', name: 'Cy' },
          subjectPositions: [structuralOwner, nameOwner77],
        },
      },
    });

    tree.$.users.removeOne('u1');
    tree.$.users.removeOne('u3');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();
    const notifications: string[] = [];
    const unsubscribe = getPathNotifier().subscribe('**', (_value, _prev, path) => {
      notifications.push(path);
    });

    const remove99 = {
      owner: structuralOwner,
      before: 'u2',
      after: undefined,
      subjectId: subject99,
      structural: 'remove' as const,
    };
    const restore42 = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId: subject42,
      structural: 'add' as const,
    };
    const restore77AtB = {
      owner: structuralOwner,
      before: undefined,
      after: 'u2',
      subjectId: subject77,
      structural: 'add' as const,
    };
    const rekey42ToB = {
      owner: structuralOwner,
      before: 'u1',
      after: 'u2',
      subjectId: subject42,
      structural: 'rekey' as const,
    };

    expect(
      adapter.validateEffects([remove99, restore42, restore77AtB, rekey42ToB])
    ).toEqual({ kind: 'structural-drift' });

    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u2']);
    expect(heldRow99()?.id).toBe('u2');
    expect(heldName99()).toBe('Bea');
    expect(heldRow42()).toBeUndefined();
    expect(heldName42()).toBeUndefined();
    expect(heldRow77()).toBeUndefined();
    expect(heldName77()).toBeUndefined();
    expect(physicalCommitClock?.revision()).toBe(beforeRevision);
    expect(notifications).toEqual([]);

    unsubscribe();
  });

  it('realizes same-subject remove then restore at a new key', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Ada' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldRow42 = tree.$.users.byIdOrFail('u1');
    const heldName42 = heldRow42.name;
    heldRow42();
    heldName42();
    const nameOwner42 = getOwnedPositionIds(heldName42)?.[0];
    const subject42 = heldName42.__subjectIds?.[0];

    if (
      structuralOwner === undefined ||
      nameOwner42 === undefined ||
      subject42 === undefined
    ) {
      throw new Error('Expected retained subject structural + scalar metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subject42],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subject42,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, nameOwner42],
        },
      },
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();

    const remove42 = {
      owner: structuralOwner,
      before: 'u1',
      after: undefined,
      subjectId: subject42,
      structural: 'remove' as const,
    };
    const restore42AtB = {
      owner: structuralOwner,
      before: undefined,
      after: 'u2',
      subjectId: subject42,
      structural: 'add' as const,
    };

    expect(adapter.validateEffects([remove42, restore42AtB])).toBeUndefined();

    adapter.applyAtomically([remove42, restore42AtB]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u2']);
    expect(tree.$.users.byIdOrFail('u2').name()).toBe('Ada');
    expect(heldRow42()).toBeDefined();
    expect(heldName42()).toBe('Ada');
    expect(heldName42.__subjectIds?.[0]).toBe(subject42);
    expect(physicalCommitClock?.revision()).toBe(
      beforeRevision === undefined ? undefined : beforeRevision + 1
    );
  });

  it('realizes fresh add plus later scalar without physically creating the subject during preparation', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    if (structuralOwner === undefined) {
      throw new Error('Expected collection structural owner');
    }

    const freshSubjectId = 10_001;
    const freshNameOwner = 10_002;
    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [freshSubjectId],
      meta: {
        historyEffect: {
          kind: 'add',
          subject: freshSubjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, freshNameOwner],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
      positionIds: [freshNameOwner],
      subjectIds: [freshSubjectId],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();
    const collectionInternal = tree.$.users as typeof tree.$.users & {
      __inspectSubjectResources?: (subjectId: number) => {
        state: 'active' | 'tombstoned';
        activeKey: string | undefined;
      } | undefined;
      __findKeyBySubjectId?: (subjectId: number) => string | number | undefined;
    };
    if (!collectionInternal.__inspectSubjectResources || !collectionInternal.__findKeyBySubjectId) {
      throw new Error('Expected subject inventory hooks for fresh add characterization');
    }

    const freshAdd = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId: freshSubjectId,
      structural: 'add' as const,
      structuralContext: {
        kind: 'add' as const,
        subject: freshSubjectId,
        key: 'u1',
        value: { id: 'u1', name: 'Ada' },
        subjectPositions: [structuralOwner, freshNameOwner],
      },
      subjectPositions: [structuralOwner, freshNameOwner],
    };
    const renameFresh = {
      owner: freshNameOwner,
      before: 'Ada',
      after: 'Alicia',
      subjectId: freshSubjectId,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
    };

    expect(collectionInternal.__inspectSubjectResources(freshSubjectId)).toBeUndefined();
    expect(adapter.validateEffects([freshAdd, renameFresh])).toBeUndefined();
    expect(collectionInternal.__inspectSubjectResources(freshSubjectId)).toBeUndefined();
    expect(collectionInternal.__findKeyBySubjectId(freshSubjectId)).toBeUndefined();
    expect(physicalCommitClock?.revision()).toBe(beforeRevision);

    adapter.applyAtomically([freshAdd, renameFresh]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Alicia');
    expect(tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0]).toBe(freshSubjectId);
    expect(collectionInternal.__findKeyBySubjectId(freshSubjectId)).toBe('u1');
    expect(collectionInternal.__inspectSubjectResources(freshSubjectId)).toMatchObject({
      state: 'active',
      activeKey: 'u1',
    });
    expect(physicalCommitClock?.revision()).toBe(
      beforeRevision === undefined ? undefined : beforeRevision + 1
    );
  });

  it('treats fresh add at a historical key as a new subject lifetime', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        removeOne(id: string): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Legacy' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const oldName = tree.$.users.byIdOrFail('u1').name;
    oldName();
    const oldSubjectId = oldName.__subjectIds?.[0];
    if (structuralOwner === undefined || oldSubjectId === undefined) {
      throw new Error('Expected existing subject metadata');
    }

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const freshSubjectId = oldSubjectId + 10_000;
    const freshNameOwner = freshSubjectId + 1;
    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [freshSubjectId],
      meta: {
        historyEffect: {
          kind: 'add',
          subject: freshSubjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, freshNameOwner],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
      positionIds: [freshNameOwner],
      subjectIds: [freshSubjectId],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const collectionInternal = tree.$.users as typeof tree.$.users & {
      __inspectSubjectResources?: (subjectId: number) => {
        state: 'active' | 'tombstoned';
        activeKey: string | undefined;
      } | undefined;
      __findKeyBySubjectId?: (subjectId: number) => string | number | undefined;
    };
    if (!collectionInternal.__inspectSubjectResources || !collectionInternal.__findKeyBySubjectId) {
      throw new Error('Expected subject inventory hooks for historical key characterization');
    }

    const freshAdd = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId: freshSubjectId,
      structural: 'add' as const,
      structuralContext: {
        kind: 'add' as const,
        subject: freshSubjectId,
        key: 'u1',
        value: { id: 'u1', name: 'Ada' },
        subjectPositions: [structuralOwner, freshNameOwner],
      },
      subjectPositions: [structuralOwner, freshNameOwner],
    };
    const renameFresh = {
      owner: freshNameOwner,
      before: 'Ada',
      after: 'Alicia',
      subjectId: freshSubjectId,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
    };

    expect(adapter.validateEffects([freshAdd, renameFresh])).toBeUndefined();
    expect(collectionInternal.__inspectSubjectResources(freshSubjectId)).toBeUndefined();

    adapter.applyAtomically([freshAdd, renameFresh]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Alicia');
    expect(tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0]).toBe(freshSubjectId);
    expect(collectionInternal.__findKeyBySubjectId(freshSubjectId)).toBe('u1');
    expect(collectionInternal.__inspectSubjectResources(freshSubjectId)).toMatchObject({
      state: 'active',
      activeKey: 'u1',
    });
    expect(collectionInternal.__inspectSubjectResources(oldSubjectId)).toMatchObject({
      state: 'tombstoned',
      activeKey: undefined,
    });
  });

  it('realizes fresh add followed by rekey and scalar against prepared future topology', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    if (structuralOwner === undefined) {
      throw new Error('Expected collection structural owner');
    }

    const freshSubjectId = 10_101;
    const freshNameOwner = 10_102;
    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [freshSubjectId],
      meta: {
        historyEffect: {
          kind: 'add',
          subject: freshSubjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, freshNameOwner],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
      positionIds: [freshNameOwner],
      subjectIds: [freshSubjectId],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const collectionInternal = tree.$.users as typeof tree.$.users & {
      __findKeyBySubjectId?: (subjectId: number) => string | number | undefined;
    };
    if (!collectionInternal.__findKeyBySubjectId) {
      throw new Error('Expected subject lookup hook for fresh rekey characterization');
    }

    const freshAdd = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId: freshSubjectId,
      structural: 'add' as const,
      structuralContext: {
        kind: 'add' as const,
        subject: freshSubjectId,
        key: 'u1',
        value: { id: 'u1', name: 'Ada' },
        subjectPositions: [structuralOwner, freshNameOwner],
      },
      subjectPositions: [structuralOwner, freshNameOwner],
    };
    const rekeyFresh = {
      owner: structuralOwner,
      before: 'u1',
      after: 'u2',
      subjectId: freshSubjectId,
      structural: 'rekey' as const,
    };
    const renameFresh = {
      owner: freshNameOwner,
      before: 'Ada',
      after: 'Alicia',
      subjectId: freshSubjectId,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
    };

    expect(adapter.validateEffects([freshAdd, rekeyFresh, renameFresh])).toBeUndefined();

    adapter.applyAtomically([freshAdd, rekeyFresh, renameFresh]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u2']);
    expect(tree.$.users.byIdOrFail('u2').name()).toBe('Alicia');
    expect(tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0]).toBe(freshSubjectId);
    expect(collectionInternal.__findKeyBySubjectId(freshSubjectId)).toBe('u2');
  });

  it('keeps same-key replacement side-effect free when fresh add falls through restore planning', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        ids(): string[];
        byIdOrFail(id: string): ((() => { id: string; name: string } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
        });
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Legacy' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldOldRow = tree.$.users.byIdOrFail('u1');
    const heldOldName = heldOldRow.name;
    heldOldRow();
    heldOldName();
    const oldSubjectId = heldOldName.__subjectIds?.[0];
    if (structuralOwner === undefined || oldSubjectId === undefined) {
      throw new Error('Expected existing subject metadata');
    }

    const freshSubjectId = oldSubjectId + 20_000;
    const freshNameOwner = freshSubjectId + 1;
    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [freshSubjectId],
      meta: {
        historyEffect: {
          kind: 'add',
          subject: freshSubjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Ada' },
          subjectPositions: [structuralOwner, freshNameOwner],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
      positionIds: [freshNameOwner],
      subjectIds: [freshSubjectId],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const physicalCommitClock =
      getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
    const beforeRevision = physicalCommitClock?.revision();
    const notifications: string[] = [];
    const unsubscribe = getPathNotifier().subscribe('**', (_value, _prev, path) => {
      notifications.push(path);
    });

    const removeOld = {
      owner: structuralOwner,
      before: 'u1',
      after: undefined,
      subjectId: oldSubjectId,
      structural: 'remove' as const,
    };
    const freshAdd = {
      owner: structuralOwner,
      before: undefined,
      after: 'u1',
      subjectId: freshSubjectId,
      structural: 'add' as const,
      structuralContext: {
        kind: 'add' as const,
        subject: freshSubjectId,
        key: 'u1',
        value: { id: 'u1', name: 'Ada' },
        subjectPositions: [structuralOwner, freshNameOwner],
      },
      subjectPositions: [structuralOwner, freshNameOwner],
    };
    const renameFresh = {
      owner: freshNameOwner,
      before: 'Ada',
      after: 'Alicia',
      subjectId: freshSubjectId,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
    };

    expect(adapter.validateEffects([removeOld, freshAdd, renameFresh])).toBeUndefined();

    expect(() => adapter.applyAtomically([removeOld, freshAdd, renameFresh])).toThrow(
      'Entity with id u1 already exists'
    );
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Legacy');
    expect(heldOldRow()?.id).toBe('u1');
    expect(heldOldName()).toBe('Legacy');
    expect(heldOldName.__subjectIds?.[0]).toBe(oldSubjectId);
    expect(physicalCommitClock?.revision()).toBe(beforeRevision);
    expect(notifications).toEqual([]);

    unsubscribe();
  });

  it('validates known scalar positions with zero tree visits across 10 to 100k positions', () => {
    const stats = installProductionSubstrateStatsForTesting();

    for (const size of [10, 100, 1_000, 10_000, 100_000] as const) {
      const state: Record<string, number> = {};
      for (let index = 0; index < size; index++) {
        state[`leaf_${index}`] = index;
      }

      const tree = signalTree(state) as ISignalTree<Record<string, {
        (): number;
        set(value: number): void;
      }>>;

      try {
        const effectCount = Math.min(50, size);
        const step = Math.max(1, Math.floor(size / effectCount));
        const effects = [] as Array<{
          owner: number;
          before: number;
          after: number;
        }>;
        const descriptors = new Map<number, TreeRealizationDescriptor>();

        for (let index = 0; index < effectCount; index++) {
          const leafIndex = Math.min(size - 1, index * step);
          const key = `leaf_${leafIndex}` as keyof typeof tree.$;
          const owner = getOwnedPositionIds(tree.$[key])?.[0];
          if (owner === undefined) {
            throw new Error(`Expected owned position for ${String(key)}`);
          }

          descriptors.set(owner, { path: String(key), ownerPath: String(key) });
          effects.push({ owner, before: leafIndex, after: leafIndex + 1 });
        }

        const adapter = createTreeRealizationAdapter({
          tree: tree as ISignalTree<object>,
          descriptors,
        });

        resetProductionSubstrateStatsForTesting(stats);
        expect(adapter.validateEffects(effects)).toBeUndefined();
        expect(stats.treeVisits).toBe(0);
        expect(stats.positionResolutions).toBe(effectCount);
      } finally {
        tree.destroy();
      }
    }
  }, 120_000);

  it('refuses unknown positions without a traversal fallback', () => {
    const tree = signalTree({ profile: { name: 'Alice' } }) as ISignalTree<object>;
    const stats = installProductionSubstrateStatsForTesting();
    const adapter = createTreeRealizationAdapter({
      tree,
      descriptors: new Map(),
    });

    resetProductionSubstrateStatsForTesting(stats);

    expect(
      adapter.validateEffects([
        { owner: 999_999, before: 'Alice', after: 'Alicia' },
      ])
    ).toEqual({ kind: 'structural-drift' });
    expect(stats.treeVisits).toBe(0);
    expect(stats.positionResolutions).toBe(1);

    tree.destroy();
  });

  it('restores each removed subject from its own structural payload on one collection owner', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
        };
        ids(): string[];
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice' });
    tree.$.users.addOne({ id: 'u2', name: 'Bob' });
    getPathNotifier().flushSync();

    const owner = getOwnedPositionIds(tree.$.users)?.[0];
    const subjectOne = tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0];
    const subjectTwo = tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0];
    if (owner === undefined || subjectOne === undefined || subjectTwo === undefined) {
      throw new Error('Expected multi-subject structural metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [owner],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subjectOne,
          key: 'u1',
          value: { id: 'u1', name: 'Alice' },
          subjectPositions: [owner],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u2',
      ownerPath: 'users',
      positionIds: [owner],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subjectTwo,
          key: 'u2',
          value: { id: 'u2', name: 'Bob' },
          subjectPositions: [owner],
        },
      },
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    adapter.applyAtomically([
      {
        owner,
        before: 'u1',
        after: undefined,
        subjectId: subjectOne,
        structural: 'remove',
      },
      {
        owner,
        before: 'u2',
        after: undefined,
        subjectId: subjectTwo,
        structural: 'remove',
      },
    ]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual([]);

    expect(
      adapter.validateEffects([
        {
          owner,
          before: undefined,
          after: 'u1',
          subjectId: subjectOne,
          structural: 'add',
        },
        {
          owner,
          before: undefined,
          after: 'u2',
          subjectId: subjectTwo,
          structural: 'add',
        },
      ])
    ).toBeUndefined();

    adapter.applyAtomically([
      {
        owner,
        before: undefined,
        after: 'u1',
        subjectId: subjectOne,
        structural: 'add',
      },
      {
        owner,
        before: undefined,
        after: 'u2',
        subjectId: subjectTwo,
        structural: 'add',
      },
    ]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u1', 'u2']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Alice');
    expect(tree.$.users.byIdOrFail('u2').name()).toBe('Bob');
    expect(tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0]).toBe(subjectOne);
    expect(tree.$.users.byIdOrFail('u2').name.__subjectIds?.[0]).toBe(subjectTwo);
  });

  it('overlays restored structural payload with contextual subjectState', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string; enabled: boolean }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string; enabled: boolean }): void;
        removeOne(id: string): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
          enabled(): boolean;
        };
        ids(): string[];
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alicia', enabled: true });
    getPathNotifier().flushSync();

    const owner = getOwnedPositionIds(tree.$.users)?.[0];
    const beforeName = tree.$.users.byIdOrFail('u1').name;
    const subjectId = beforeName.__subjectIds?.[0];
    const enabledOwner = getOwnedPositionIds(tree.$.users.byIdOrFail('u1').enabled)?.[0];
    if (owner === undefined || subjectId === undefined || enabledOwner === undefined) {
      throw new Error('Expected structural ownership metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.enabled',
      ownerPath: 'users.u1',
      positionIds: [enabledOwner],
      subjectIds: [subjectId],
    });

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    expect(
      adapter.validateEffects([
        {
          owner,
          before: undefined,
          after: 'u1',
          subjectId,
          structural: 'add',
          structuralContext: {
            kind: 'remove',
            subject: subjectId,
            key: 'u1',
            value: { id: 'u1', name: 'Alicia', enabled: true },
            subjectPositions: [owner, enabledOwner],
          },
          subjectState: {
            [enabledOwner]: false,
          },
        },
      ])
    ).toBeUndefined();

    adapter.applyAtomically([
      {
        owner,
        before: undefined,
        after: 'u1',
        subjectId,
        structural: 'add',
        structuralContext: {
          kind: 'remove',
          subject: subjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Alicia', enabled: true },
          subjectPositions: [owner, enabledOwner],
        },
        subjectState: {
          [enabledOwner]: false,
        },
      },
    ]);
    getPathNotifier().flushSync();

    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Alicia');
    expect(tree.$.users.byIdOrFail('u1').enabled()).toBe(false);
  });

  it('reactivates the exact held row and field when restoring the same tombstoned subject', () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string; enabled: boolean }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string; enabled: boolean }): void;
        removeOne(id: string): void;
        byIdOrFail(id: string): ((() => { id: string; name: string; enabled: boolean } | undefined) & {
          name: ((() => string | undefined) & { __subjectIds?: number[] });
          enabled: (() => boolean | undefined);
        });
        ids(): string[];
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice', enabled: true });
    getPathNotifier().flushSync();

    const owner = getOwnedPositionIds(tree.$.users)?.[0];
    const heldRow = tree.$.users.byIdOrFail('u1');
    const heldName = heldRow.name;
    heldRow();
    heldName();
    const subjectId = getOwnedSubjectIds(heldName)?.[0];
    const positionId = getOwnedPositionIds(heldName)?.[0];
    const ownerPath = getOwnedOwnerPath(heldName);
    if (owner === undefined || subjectId === undefined || positionId === undefined) {
      throw new Error('Expected subject and position metadata');
    }

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    expect(heldRow()).toBeUndefined();
    expect(heldName()).toBeUndefined();
    expect(tree.$.users.ids()).toEqual([]);

    tree.$.users.addOne({ id: 'u1', name: 'Bob', enabled: false });
    getPathNotifier().flushSync();

    expect(heldRow()).toBeUndefined();
    expect(heldName()).toBeUndefined();
    expect(tree.$.users.byIdOrFail('u1')).not.toBe(heldRow);
    expect(tree.$.users.byIdOrFail('u1').name).not.toBe(heldName);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Bob');

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [owner],
      subjectIds: [subjectId],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: subjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Alicia', enabled: true },
          subjectPositions: [owner, positionId],
        },
      },
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1.name',
      ownerPath: 'users.u1',
      positionIds: [positionId],
      subjectIds: [subjectId],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    expect(
      adapter.validateEffects([
        {
          owner,
          before: undefined,
          after: 'u2',
          subjectId,
          structural: 'add',
          structuralContext: {
            kind: 'remove',
            subject: subjectId,
            key: 'u1',
            value: { id: 'u1', name: 'Alicia', enabled: true },
            subjectPositions: [owner, positionId],
          },
        },
      ])
    ).toBeUndefined();

    adapter.applyAtomically([
      {
        owner,
        before: undefined,
        after: 'u2',
        subjectId,
        structural: 'add',
        structuralContext: {
          kind: 'remove',
          subject: subjectId,
          key: 'u1',
          value: { id: 'u1', name: 'Alicia', enabled: true },
          subjectPositions: [owner, positionId],
        },
      },
    ]);
    getPathNotifier().flushSync();

    const restoredRow = tree.$.users.byIdOrFail('u2');
    const restoredName = restoredRow.name;

    expect(tree.$.users.ids()).toEqual(['u1', 'u2']);
    expect(restoredRow).toBe(heldRow);
    expect(restoredName).toBe(heldName);
    expect(restoredName()).toBe('Alicia');
    expect(restoredName.__subjectIds?.[0]).toBe(subjectId);
    expect(getOwnedPositionIds(restoredName)?.[0]).toBe(positionId);
    expect(getOwnedOwnerPath(restoredName)).toBe('users.u2');
    expect(ownerPath).toBe('users.u1');
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Bob');
    expect(tree.$.users.byIdOrFail('u1').name).not.toBe(restoredName);
  });

  it('still emits canonical notifier traffic during realization, proving non-authoring is a broader seam than the adapter', () => {
    const tree = signalTree({ profile: { name: 'Alice' } }) as ISignalTree<{
      profile: {
        name: {
          (): string;
          set(value: string): void;
        };
      };
    }>;
    const owner = getOwnedPositionIds(tree.$.profile.name)?.[0];
    if (owner === undefined) {
      throw new Error('Expected owned position for profile.name');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'profile.name',
      positionIds: [owner],
    });
    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });
    const notifications: Array<{ path: string; meta?: UpdateMetadata }> = [];
    const unsubscribe = getPathNotifier().subscribe(
      '**',
      (_next, _prev, path, _ownerPath, _source, _subjectIds, _positionIds, meta) => {
        notifications.push({ path, meta });
      }
    );

    adapter.applyAtomically([{ owner, before: 'Alice', after: 'Alicia' }]);
    getPathNotifier().flushSync();

    expect(notifications).not.toHaveLength(0);
    unsubscribe();
  });

  it('keeps scalar realization causally silent between authored writes', async () => {
    const tree = signalTree({ left: '', middle: '', right: '' }).with(
      timeTravel()
    ) as ISignalTree<{
      left: { (): string; set(value: string): void };
      middle: { (): string; set(value: string): void };
      right: { (): string; set(value: string): void };
    }> & {
      getHistory(): unknown[];
    };
    const owner = getOwnedPositionIds(tree.$.middle)?.[0];
    if (owner === undefined) {
      throw new Error('Expected owned position for middle');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'middle',
      positionIds: [owner],
    });
    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    const baselineHistory = tree.getHistory().length;

    tree.$.left.set('A');
    getPathNotifier().flushSync();
    await Promise.resolve();
    const afterAuthoredLeft = tree.getHistory().length;

    adapter.applyAtomically([{ owner, before: '', after: 'B' }]);
    getPathNotifier().flushSync();
    await Promise.resolve();

    tree.$.right.set('C');
    getPathNotifier().flushSync();
    await Promise.resolve();

    expect(tree.$.left()).toBe('A');
    expect(tree.$.middle()).toBe('B');
    expect(tree.$.right()).toBe('C');
    expect(afterAuthoredLeft).toBe(baselineHistory + 1);
    expect(tree.getHistory().length).toBe(baselineHistory + 2);
  });

  it('keeps stored realization causally silent while preserving persistence consequences', async () => {
    const storage = createMockStorage();
    const tree = signalTree({
      preference: stored('realization-non-authoring-preference', 'compact', {
        storage,
        debounceMs: 0,
      }),
    }).with(timeTravel()) as ISignalTree<{
      preference: { (): string; set(value: string): void };
    }> & {
      getHistory(): unknown[];
    };
    const owner = getOwnedPositionIds(tree.$.preference)?.[0];
    if (owner === undefined) {
      throw new Error('Expected owned position for preference');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'preference',
      positionIds: [owner],
    });
    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    const baselineHistory = tree.getHistory().length;
    adapter.applyAtomically([{ owner, before: 'compact', after: 'spacious' }]);
    getPathNotifier().flushSync();
    await new Promise((resolve) => queueMicrotask(resolve));

    expect(tree.$.preference()).toBe('spacious');
    expect(JSON.parse(storage.getItem('realization-non-authoring-preference') ?? 'null')).toEqual({
      __v: 1,
      data: 'spacious',
    });
    expect(tree.getHistory().length).toBe(baselineHistory);
  });

  it('keeps structural realization causally silent while preserving subject identity', async () => {
    const tree = signalTree({
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      users: {
        addOne(user: { id: string; name: string }): void;
        changeId(from: string, to: string): void;
        byIdOrFail(id: string): {
          name: (() => string) & { __subjectIds?: number[] };
        };
        ids(): string[];
      };
    }> & {
      getHistory(): unknown[];
    };

    tree.$.users.addOne({ id: 'u2', name: 'Alice' });
    getPathNotifier().flushSync();
    await Promise.resolve();

    const owner = getOwnedPositionIds(tree.$.users)?.[0];
    const beforeNameLeaf = tree.$.users.byIdOrFail('u2').name;
    const beforeSubjectId = beforeNameLeaf.__subjectIds?.[0];
    const beforePositions = getOwnedPositionIds(beforeNameLeaf);
    if (owner === undefined || beforeSubjectId === undefined || !beforePositions) {
      throw new Error('Expected entity ownership metadata');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u2',
      ownerPath: 'users',
      positionIds: [owner],
    });
    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    const baselineHistory = tree.getHistory().length;
    adapter.applyAtomically([
      {
        owner,
        before: 'u2',
        after: 'u1',
        subjectId: beforeSubjectId,
        structural: 'rekey',
      },
    ]);
    getPathNotifier().flushSync();
    await Promise.resolve();

    const afterNameLeaf = tree.$.users.byIdOrFail('u1').name;
    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(afterNameLeaf.__subjectIds?.[0]).toBe(beforeSubjectId);
    expect(getOwnedPositionIds(afterNameLeaf)).toEqual(beforePositions);
    expect(tree.getHistory().length).toBe(baselineHistory);
  });

  it('restores authored capture after a realization write throws', async () => {
    const tree = signalTree({
      before: '',
      after: '',
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      before: { (): string; set(value: string): void };
      after: { (): string; set(value: string): void };
      users: {
        ids(): string[];
      };
    }> & {
      getHistory(): unknown[];
    };

    tree.$.before.set('A');
    getPathNotifier().flushSync();
    await Promise.resolve();
    const baselineHistory = tree.getHistory().length;

    const owner = getOwnedPositionIds((tree.$ as Record<string, unknown>).users)?.[0];
    if (owner === undefined) {
      throw new Error('Expected structural owner');
    }

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors: new Map([[owner, { path: 'users', ownerPath: 'users', collectionPath: 'users' }]]),
    });

    expect(() =>
      adapter.applyAtomically([
        {
          owner,
          before: undefined,
          after: 'u1',
          subjectId: 1,
          structural: 'add',
        },
      ])
    ).toThrow('Missing structural restore metadata');

    tree.$.after.set('B');
    getPathNotifier().flushSync();
    await Promise.resolve();

    expect(tree.$.before()).toBe('A');
    expect(tree.$.after()).toBe('B');
    expect(tree.getHistory().length).toBe(baselineHistory + 1);
  });

  it('keeps outer transaction authorship active across an inner realization write', () => {
    const tree = signalTree({ left: '', middle: '', right: '' }).with(
      transactions()
    ) as ISignalTree<{
      left: { (): string; set(value: string): void };
      middle: { (): string; set(value: string): void };
      right: { (): string; set(value: string): void };
    }> & {
      transaction(fn: () => void): { confirm(): void; rollback(): void };
      __transactions: {
        getPendingTurnCount(): number;
        getConfirmedTurnCount(): number;
      };
    };
    const owner = getOwnedPositionIds(tree.$.middle)?.[0];
    if (owner === undefined) {
      throw new Error('Expected owned position for middle');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'middle',
      positionIds: [owner],
    });
    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    const pending = tree.transaction(() => {
      tree.$.left.set('A');
      adapter.applyAtomically([{ owner, before: '', after: 'B' }]);
      tree.$.right.set('C');
    });

    expect(tree.$.left()).toBe('A');
    expect(tree.$.middle()).toBe('B');
    expect(tree.$.right()).toBe('C');
    expect(tree.__transactions.getPendingTurnCount()).toBe(1);

    pending.rollback();

    expect(tree.$.left()).toBe('');
    expect(tree.$.middle()).toBe('B');
    expect(tree.$.right()).toBe('');
    expect(tree.__transactions.getPendingTurnCount()).toBe(0);
    expect(tree.__transactions.getConfirmedTurnCount()).toBe(0);
  });

  it('atomicity spike: pre-commit scalar staging failure leaves state and notifications unchanged', () => {
      const tree = signalTree({ a: 'A', b: 'B' }).with(timeTravel()) as ISignalTree<{
        a: { (): string; set(value: string): void };
        b: { (): string; set(value: string): void };
      }> & {
        getHistory(): unknown[];
      };

      const aOwner = getOwnedPositionIds(tree.$.a)?.[0];
      const bOwner = getOwnedPositionIds(tree.$.b)?.[0];
      if (aOwner === undefined || bOwner === undefined) {
        throw new Error('Expected owned positions for scalar atomicity test');
      }

      const descriptors = new Map<number, TreeRealizationDescriptor>();
      rememberTreeRealizationDescriptor({
        descriptors,
        path: 'a',
        positionIds: [aOwner],
      });
      rememberTreeRealizationDescriptor({
        descriptors,
        path: 'b',
        positionIds: [bOwner],
      });

      const adapter = createTreeRealizationAdapter({
        tree: tree as ISignalTree<object>,
        descriptors,
      });
      const scalarSlotRuntime =
        getTreeScalarSlotRuntime(tree) ?? getTreeScalarSlotRuntime(tree.$);
      if (!scalarSlotRuntime) {
        throw new Error('Expected scalar slot runtime for atomicity test');
      }
      const observedNotifications: Array<{ path: string; value: unknown; prev: unknown }> = [];
      const unsubscribe = getPathNotifier().subscribe(
        '**',
        (value, prev, path) => {
          if (path === 'a' || path === 'b') {
            observedNotifications.push({ path, value, prev });
          }
        }
      );

      const baselineHistory = tree.getHistory().length;
      const injectedFailure = new Error('Injected scalar staging failure');
      const originalResolve = scalarSlotRuntime.resolveScalarSlot.bind(scalarSlotRuntime);
      const resolveSpy = vi
        .spyOn(scalarSlotRuntime, 'resolveScalarSlot')
        .mockImplementation((positionId) => {
          if (positionId === bOwner) {
            throw injectedFailure;
          }

          return originalResolve(positionId);
        });

      expect(
        adapter.validateEffects([
          { owner: aOwner, before: 'A', after: 'A2' },
          { owner: bOwner, before: 'B', after: 'B2' },
        ])
      ).toBeUndefined();

      expect(() =>
        adapter.applyAtomically([
          { owner: aOwner, before: 'A', after: 'A2' },
          { owner: bOwner, before: 'B', after: 'B2' },
        ])
      ).toThrow(injectedFailure);

      getPathNotifier().flushSync();

      expect(tree.$.a()).toBe('A');
      expect(tree.$.b()).toBe('B');
      expect(tree.getHistory().length).toBe(baselineHistory);
      expect(observedNotifications).toEqual([]);

      unsubscribe();
        resolveSpy.mockRestore();
  });

  it('stales an open scalar frame after a structural rekey before commit', () => {
    const tree = signalTree({
      status: 'pending',
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      status: {
        (): string;
        set(value: string): void;
      };
      users: {
        addOne(user: { id: string; name: string }): void;
        changeId(from: string, to: string): void;
        byIdOrFail(id: string): {
          name: {
            (): string;
            set(value: string): void;
          };
        };
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice' });
    getPathNotifier().flushSync();

    const owner = getOwnedPositionIds(tree.$.status)?.[0];
    const scalarSlotRuntime =
      getTreeScalarSlotRuntime(tree) ?? getTreeScalarSlotRuntime(tree.$);
    if (owner === undefined || !scalarSlotRuntime) {
      throw new Error('Expected scalar slot runtime and owner metadata');
    }

    const slotIndex = scalarSlotRuntime.resolveScalarSlot(owner);
    if (slotIndex === undefined) {
      throw new Error('Expected scalar slot for entity field owner');
    }

    const frame = scalarSlotRuntime.beginFrame();
    frame.set(slotIndex, 'Alicia');

    tree.$.users.changeId('u1', 'u2');
    getPathNotifier().flushSync();

    expect(() => frame.commit()).toThrow(
      'ScalarSlotMutationFrame base revision is stale.'
    );
    expect(tree.$.status()).toBe('pending');
    expect(tree.$.users.byIdOrFail('u2').name()).toBe('Alice');
  });

  it('refuses a stale heterogeneous realization before any prepared structural mutation applies', () => {
    const tree = signalTree({
      other: 'unchanged',
      status: 'pending',
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }).with(timeTravel()) as ISignalTree<{
      other: { (): string; set(value: string): void };
      status: { (): string; set(value: string): void };
      users: {
        addOne(user: { id: string; name: string }): void;
        changeId(from: string, to: string): void;
        ids(): string[];
        byIdOrFail(id: string): {
          name: {
            (): string;
            set(value: string): void;
            __subjectIds?: number[];
          };
        };
        __planRekey?: (
          from: string,
          to: string
        ) => {
          commit(): void;
          publish(metaOverride?: UpdateMetadata): void;
        };
      };
    }> & {
      getHistory(): unknown[];
    };

    tree.$.users.addOne({ id: 'u1', name: 'Alice' });
    getPathNotifier().flushSync();

    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    const statusOwner = getOwnedPositionIds(tree.$.status)?.[0];
    const nameLeaf = tree.$.users.byIdOrFail('u1').name;
    const subjectId = nameLeaf.__subjectIds?.[0];
    if (
      structuralOwner === undefined ||
      statusOwner === undefined ||
      subjectId === undefined ||
      !tree.$.users.__planRekey
    ) {
      throw new Error('Expected structural and scalar metadata for mixed stale test');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      subjectIds: [subjectId],
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'status',
      positionIds: [statusOwner],
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    const observedNotifications: Array<{ path: string; value: unknown; prev: unknown }> = [];
    const unsubscribe = getPathNotifier().subscribe('**', (value, prev, path) => {
      if (path === 'status' || path === 'users') {
        observedNotifications.push({ path, value, prev });
      }
    });

    const baselineHistory = tree.getHistory().length;
    const scalarSlotRuntime =
      getTreeScalarSlotRuntime(tree) ?? getTreeScalarSlotRuntime(tree.$);
    if (!scalarSlotRuntime) {
      throw new Error('Expected scalar slot runtime for mixed stale test');
    }

    const originalBeginFrame = scalarSlotRuntime.beginFrame.bind(scalarSlotRuntime);
    const beginFrameSpy = vi
      .spyOn(scalarSlotRuntime, 'beginFrame')
      .mockImplementation(() => {
        const frame = originalBeginFrame();
        return {
          set: frame.set.bind(frame),
          update: frame.update.bind(frame),
          discard: frame.discard.bind(frame),
          commit: (options) => {
            tree.$.other.set('updated elsewhere');
            return frame.commit(options);
          },
        };
      });

    expect(
      adapter.validateEffects([
        {
          owner: structuralOwner,
          before: 'u1',
          after: 'u2',
          subjectId,
          structural: 'rekey',
        },
        { owner: statusOwner, before: 'pending', after: 'shipped' },
      ])
    ).toBeUndefined();

    expect(() =>
      adapter.applyAtomically([
        {
          owner: structuralOwner,
          before: 'u1',
          after: 'u2',
          subjectId,
          structural: 'rekey',
        },
        { owner: statusOwner, before: 'pending', after: 'shipped' },
      ])
    ).toThrow('ScalarSlotMutationFrame base revision is stale.');

    getPathNotifier().flushSync();

    expect(tree.$.other()).toBe('updated elsewhere');
    expect(tree.$.status()).toBe('pending');
    expect(tree.$.users.ids()).toEqual(['u1']);
    expect(tree.$.users.byIdOrFail('u1').name()).toBe('Alice');
    expect(tree.getHistory().length).toBe(baselineHistory + 1);
    expect(observedNotifications).toEqual([]);

    unsubscribe();
    beginFrameSpy.mockRestore();
  });

  it('commits a root-scalar and structural realization under one shared physical revision', () => {
    const notifier = getPathNotifier();
    const previousBatching = notifier.isBatchingEnabled();
    notifier.setBatchingEnabled(false);

    try {
      TestBed.runInInjectionContext(() => {
        const tree = signalTree({
          status: 'pending',
          users: entityMap<{ id: string; name: string }, string>({
            selectId: (user) => user.id,
          }),
        }) as ISignalTree<{
          status: {
            (): string;
            set(value: string): void;
          };
          users: {
            addOne(user: { id: string; name: string }): void;
            ids(): string[];
            byIdOrFail(id: string): {
              name: {
                (): string;
                __subjectIds?: number[];
              };
            };
          };
        }>;

        tree.$.users.addOne({ id: 'u1', name: 'Alice' });

        const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
        const statusOwner = getOwnedPositionIds(tree.$.status)?.[0];
        const subjectId = tree.$.users.byIdOrFail('u1').name.__subjectIds?.[0];
        if (
          structuralOwner === undefined ||
          statusOwner === undefined ||
          subjectId === undefined
        ) {
          throw new Error('Expected structural and scalar ownership metadata');
        }

        const descriptors = new Map<number, TreeRealizationDescriptor>();
        rememberTreeRealizationDescriptor({
          descriptors,
          path: 'users.u1',
          ownerPath: 'users',
          positionIds: [structuralOwner],
          subjectIds: [subjectId],
        });
        rememberTreeRealizationDescriptor({
          descriptors,
          path: 'status',
          positionIds: [statusOwner],
        });

        const adapter = createTreeRealizationAdapter({
          tree: tree as ISignalTree<object>,
          descriptors,
        });
        const physicalCommitClock =
          getPhysicalCommitClock(tree) ?? getPhysicalCommitClock(tree.$);
        const beforeRevision = physicalCommitClock?.revision();

        const seen: string[] = [];
        effect(() => {
          seen.push(`${tree.$.users.ids()[0]}|${tree.$.status()}`);
        });
        TestBed.flushEffects();

        adapter.applyAtomically([
          {
            owner: structuralOwner,
            before: 'u1',
            after: 'u2',
            subjectId,
            structural: 'rekey',
          },
          { owner: statusOwner, before: 'pending', after: 'shipped' },
        ]);
        TestBed.flushEffects();

        expect(tree.$.users.ids()).toEqual(['u2']);
        expect(tree.$.status()).toBe('shipped');
        expect(seen).toEqual(['u1|pending', 'u2|shipped']);
        expect(physicalCommitClock?.revision()).toBe(
          beforeRevision === undefined ? undefined : beforeRevision + 1
        );
      });
    } finally {
      notifier.setBatchingEnabled(previousBatching);
    }
  });

  it('validates the full effect set before any mutation and refuses structural drift without partial application', () => {
    const tree = signalTree({
      profile: { name: 'Alice' },
      users: entityMap<{ id: string; name: string }, string>({
        selectId: (user) => user.id,
      }),
    }) as ISignalTree<{
      profile: {
        name: {
          (): string;
          set(value: string): void;
        };
      };
      users: {
        addOne(user: { id: string; name: string }): void;
      };
    }>;

    tree.$.users.addOne({ id: 'u1', name: 'Alice' });
    getPathNotifier().flushSync();

    const scalarOwner = getOwnedPositionIds(tree.$.profile.name)?.[0];
    const structuralOwner = getOwnedPositionIds(tree.$.users)?.[0];
    if (scalarOwner === undefined || structuralOwner === undefined) {
      throw new Error('Expected owned positions for validation test');
    }

    const descriptors = new Map<number, TreeRealizationDescriptor>();
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'profile.name',
      positionIds: [scalarOwner],
    });
    rememberTreeRealizationDescriptor({
      descriptors,
      path: 'users.u1',
      ownerPath: 'users',
      positionIds: [structuralOwner],
      meta: {
        historyEffect: {
          kind: 'remove',
          subject: 1,
          key: 'u1',
          value: { id: 'u1', name: 'Alice' },
          subjectPositions: [structuralOwner],
        },
      } satisfies UpdateMetadata,
    });

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors,
    });

    expect(
      adapter.validateEffects([
        { owner: scalarOwner, before: 'Alice', after: 'Alicia' },
        {
          owner: structuralOwner,
          before: 'missing',
          after: 'u2',
          subjectId: 1,
          structural: 'rekey',
        },
      ])
    ).toEqual({ kind: 'structural-drift' });

    expect(tree.$.profile.name()).toBe('Alice');
  });
});
