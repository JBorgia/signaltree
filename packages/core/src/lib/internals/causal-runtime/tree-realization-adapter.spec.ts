import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { entityMap } from '../../markers/entity-map';
import { stored } from '../../markers/stored';
import { getPathNotifier, resetPathNotifier } from '../../path-notifier';
import { signalTree } from '../../signal-tree';
import type { ISignalTree, UpdateMetadata } from '../../types';
import { timeTravel } from '../../../enhancers/time-travel/time-travel';
import { transactions } from '../../../enhancers/transactions/transactions';
import { getOwnedPositionIds } from '../owned-mutation';
import { getTreeScalarSlotRuntime } from '../tree-scalar-slot-runtime';

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
        });
        rememberTreeRealizationDescriptor({
          descriptors,
          path: 'users.u1.name',
          ownerPath: 'users.u1',
          positionIds: [scalarOwner],
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

    tree.$.users.removeOne('u1');
    getPathNotifier().flushSync();

    const adapter = createTreeRealizationAdapter({
      tree: tree as ISignalTree<object>,
      descriptors: new Map(),
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
      descriptors: new Map(),
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
