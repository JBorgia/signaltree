import { computed, isSignal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { createEntitySignal, planEntitySubjectReclamation } from './entity-signal';
import { PathNotifier } from './path-notifier';

// Minimal PathNotifier stub
const pathNotifier = {
  notify: () => {
    /* empty */
  },
} as any;

type SubjectInventoryApi = {
  __inspectSubjectResources?: (subjectId: number) => unknown;
  __planSubjectReclamation?: (subjectId: number) => unknown;
  __retireSubjectRetainedValueBackingForTesting?: (subjectId: number) => void;
  __restoreOne?: (
    key: number,
    entity: { id: number; name: string; active: boolean },
    subjectId: number,
    beforeSubject?: number,
    afterSubject?: number
  ) => void;
};

describe('EntityNode field writes (Option B+ computed-based shim)', () => {
  type User = { id: number; name: string; active: boolean };

  function makeApi() {
    return createEntitySignal<User, number>(
      { selectId: (u) => u.id },
      pathNotifier,
      'users'
    );
  }

  it('field property is an Angular signal (isSignal returns true)', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1);
    expect(node).toBeDefined();
    expect(isSignal(node!.name)).toBe(true);
  });

  it('field property reads current value reactively', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    expect(api.byId(1)!.name()).toBe('Alice');
  });

  it('.set() updates a field and is reflected in reactive queries', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    api.byId(1)!.name.set('Bob');
    expect(api.byId(1)!.name()).toBe('Bob');
    expect(api.all()[0].name).toBe('Bob');
  });

  it('.update() applies an updater function to a field', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'alice', active: true });
    api.byId(1)!.name.update((n) => n!.toUpperCase());
    expect(api.byId(1)!.name()).toBe('ALICE');
  });

  it('.asReadonly() returns the underlying computed signal', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const ro = api.byId(1)!.name.asReadonly();
    expect(isSignal(ro)).toBe(true);
    expect(ro()).toBe('Alice');
  });

  it('interceptors still fire on field .set()', () => {
    const api = makeApi();
    const intercepted: string[] = [];
    api.intercept({
      onUpdate: (id, changes) => {
        intercepted.push(String(id));
      },
    });
    api.addOne({ id: 1, name: 'Alice', active: true });
    api.byId(1)!.name.set('Bob');
    expect(intercepted).toContain('1');
  });

  it('entity-level callable getter returns current entity reactively', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1)!;
    expect(node()).toEqual({ id: 1, name: 'Alice', active: true });
  });

  it('entity-level callable setter replaces entity via updateOne', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1)!;
    (node as unknown as (v: User) => void)({ id: 1, name: 'Bob', active: false });
    expect(api.byId(1)!.name()).toBe('Bob');
    expect(api.byId(1)!.active()).toBe(false);
  });

  it('entity-level callable updater applies function to current entity', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'alice', active: false });
    const node = api.byId(1)!;
    (node as unknown as (fn: (u: User) => User) => void)(
      (u) => ({ ...u, name: u.name.toUpperCase(), active: true })
    );
    expect(api.byId(1)!.name()).toBe('ALICE');
    expect(api.byId(1)!.active()).toBe(true);
  });

  it('field .set() throws on stale node (entity removed)', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1)!;
    api.removeOne(1);
    expect(() => node.name.set('Bob')).toThrow('not found');
  });

  it('entity-level callable write throws on stale node (entity removed)', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1)!;
    api.removeOne(1);
    expect(() =>
      (node as unknown as (v: User) => void)({ id: 1, name: 'Bob', active: false })
    ).toThrow('not found');
  });
});

describe('entity subject physical inventory', () => {
  type User = { id: number; name: string; active: boolean };

  function makeApi() {
    return createEntitySignal<User, number>(
      { selectId: (u) => u.id },
      pathNotifier,
      'users'
    );
  }

  it('describes a tombstoned subject shell separately from active key reuse and same-subject restore', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldRow = api.byIdOrFail(1);
    const heldField = heldRow.name;
    const subjectId = heldField.__subjectIds?.[0];
    const positionIds = heldField.__positionIds;
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.removeOne(1);

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.addOne({ id: 1, name: 'Bob', active: false });
    const foreignSubjectId = api.byIdOrFail(1).name.__subjectIds?.[0];
    expect(foreignSubjectId).not.toBe(subjectId);

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__inspectSubjectResources?.(foreignSubjectId as number)).toEqual({
      subjectId: foreignSubjectId,
      state: 'active',
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.removeOne(1);
    internal.__restoreOne?.(1, { id: 1, name: 'Alice', active: true }, subjectId);

    const restored = api.byIdOrFail(1);
    expect(restored).toBe(heldRow);
    expect(restored.name).toBe(heldField);
    expect(restored.name.__subjectIds?.[0]).toBe(subjectId);
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
  });

  it('plans conservatively for a tombstoned subject until retained value backing dependency is resolved', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const subjectId = api.byIdOrFail(1).name.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    expect(
      planEntitySubjectReclamation(
        internal.__inspectSubjectResources?.(subjectId) as ReturnType<
          typeof internal.__inspectSubjectResources
        >
      )
    ).toEqual({
      subjectId,
      eligible: false,
      retire: [],
      retain: [
        'subject-lifetime-record',
        'retained-value-backing',
        'subject-activation-channel',
        'row-facade',
        'field-facades',
        'ownership-metadata',
      ],
      unresolved: [],
    });

    api.removeOne(1);

    expect(internal.__planSubjectReclamation?.(subjectId)).toEqual({
      subjectId,
      eligible: true,
      retire: [],
      retain: [
        'subject-lifetime-record',
        'retained-value-backing',
        'subject-activation-channel',
        'row-facade',
        'field-facades',
        'ownership-metadata',
      ],
      unresolved: [
        {
          resource: 'retained-value-backing',
          reason: 'terminal-facade-dependency-unknown',
        },
      ],
    });
  });

  it('proves terminal held facades do not depend on retained value backing once the subject is tombstoned', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldRow = api.byIdOrFail(1);
    const heldName = heldRow.name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    let rowRuns = 0;
    let nameRuns = 0;
    const observedRow = computed(() => {
      rowRuns++;
      return heldRow()?.name ?? 'absent';
    });
    const observedName = computed(() => {
      nameRuns++;
      return heldName() ?? 'absent';
    });

    expect(observedRow()).toBe('Alice');
    expect(observedName()).toBe('Alice');
    expect(rowRuns).toBe(1);
    expect(nameRuns).toBe(1);

    api.removeOne(1);

    expect(observedRow()).toBe('absent');
    expect(observedName()).toBe('absent');
    expect(rowRuns).toBe(2);
    expect(nameRuns).toBe(2);

    api.addOne({ id: 1, name: 'Bob', active: false });

    expect(observedRow()).toBe('absent');
    expect(observedName()).toBe('absent');
    expect(rowRuns).toBe(2);
    expect(nameRuns).toBe(2);

    internal.__retireSubjectRetainedValueBackingForTesting?.(subjectId);

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldName.__positionIds,
      retainedValueBacking: undefined,
    });
    expect(observedRow()).toBe('absent');
    expect(observedName()).toBe('absent');
    expect(rowRuns).toBe(2);
    expect(nameRuns).toBe(2);

    api.removeOne(1);
    internal.__restoreOne?.(1, { id: 1, name: 'Alice', active: true }, subjectId);

    expect(observedRow()).toBe('Alice');
    expect(observedName()).toBe('Alice');
    expect(rowRuns).toBe(3);
    expect(nameRuns).toBe(3);
  });
});

describe('addMany() mode option (F-011)', () => {
  type Item = { id: number; name: string };

  function makeApi() {
    return createEntitySignal<Item, number>(
      { selectId: (i) => i.id },
      pathNotifier,
      'items'
    );
  }

  it('strict (default) throws on duplicate', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'A' });
    expect(() => api.addMany([{ id: 1, name: 'B' }, { id: 2, name: 'C' }])).toThrow('already exists');
  });

  it('skip silently omits duplicates and returns only newly added ids', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'original' });
    const ids = api.addMany([{ id: 1, name: 'ignored' }, { id: 2, name: 'new' }], { mode: 'skip' });
    expect(ids).toEqual([2]);
    expect(api.byId(1)!.name()).toBe('original');
    expect(api.count()).toBe(2);
  });

  it('overwrite replaces existing entities', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'old' });
    const ids = api.addMany([{ id: 1, name: 'replaced' }, { id: 2, name: 'new' }], { mode: 'overwrite' });
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(api.byId(1)!.name()).toBe('replaced');
    expect(api.count()).toBe(2);
  });

  it('skip with all duplicates returns empty array', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'A' });
    const ids = api.addMany([{ id: 1, name: 'B' }], { mode: 'skip' });
    expect(ids).toEqual([]);
    expect(api.count()).toBe(1);
  });
});

describe('EntitySignal predicate caching', () => {
  it('returns the same signal for identical predicate references', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );

    const isActive = (u: any) => u.active === true;

    const s1 = api.where(isActive);
    const s2 = api.where(isActive);

    expect(s1).toBe(s2);
  });

  it('does not conflate distinct predicate references', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );

    const s1 = api.where((u: any) => u.active === true);
    const s2 = api.where((u: any) => u.active === true);

    expect(s1).not.toBe(s2);
  });

  it('cached computed reflects mutations', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );

    const isActive = (u: any) => u.active === true;
    const s = api.where(isActive);

    expect(s()).toEqual([]);

    api.addOne({ id: 1, active: false } as any);
    expect(s()).toEqual([]);

    api.updateOne(1 as any, { active: true } as any);
    expect(s()).toEqual([{ id: 1, active: true }]);
  });
});

describe('.empty (canonical bare-name predicate)', () => {
  it('exposes .empty as the canonical bare-name predicate', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );
    expect(api.empty()).toBe(true);
    api.addOne({ id: 1 } as any);
    expect(api.empty()).toBe(false);
    api.clear();
    expect(api.empty()).toBe(true);
  });

  it('caches .empty — repeated access returns the same Signal instance', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );
    expect(api.empty).toBe(api.empty);
    expect(isSignal(api.empty)).toBe(true);
  });
});

describe('owner PositionId allocation', () => {
  it('allocates a new owner position when the same path materializes twice', () => {
    type Row = { id: number; name: string };
    const notify = vi.fn(() => ({ blocked: false, value: undefined }));
    const notifier = { notify } as any;

    const first = createEntitySignal<Row, number>(
      { selectId: (row) => row.id },
      notifier,
      'rows'
    );
    first.addOne({ id: 1, name: 'first' });
    const firstPositionIds = (first as any).__positionIds as number[];

    const second = createEntitySignal<Row, number>(
      { selectId: (row) => row.id },
      notifier,
      'rows'
    );
    second.addOne({ id: 2, name: 'second' });
    const secondPositionIds = (second as any).__positionIds as number[];

    expect(firstPositionIds).toHaveLength(1);
    expect(secondPositionIds).toHaveLength(1);
    expect(secondPositionIds).not.toEqual(firstPositionIds);
    expect(notify).toHaveBeenNthCalledWith(
      1,
      'rows.1',
      { id: 1, name: 'first' },
      undefined,
      'rows',
      [1],
      firstPositionIds,
      expect.objectContaining({
        historyEffect: expect.objectContaining({
          kind: 'add',
          key: 1,
          subject: 1,
        }),
      })
    );
    expect(notify).toHaveBeenNthCalledWith(
      2,
      'rows.2',
      { id: 2, name: 'second' },
      undefined,
      'rows',
      [1],
      secondPositionIds,
      expect.objectContaining({
        historyEffect: expect.objectContaining({
          kind: 'add',
          key: 2,
          subject: 1,
        }),
      })
    );
  });

  it('keeps one owner position across entityMap bulk write paths', () => {
    type Row = { id: number; name: string };
    const notify = vi.fn(() => ({ blocked: false, value: undefined }));
    const notifier = { notify } as any;
    const api = createEntitySignal<Row, number>(
      { selectId: (row) => row.id },
      notifier,
      'rows'
    );
    const ownerPositionIds = (api as any).__positionIds as number[];

    api.addMany([
      { id: 1, name: 'first' },
      { id: 2, name: 'second' },
    ]);
    api.updateMany([1, 2], { name: 'updated' });
    api.removeMany([1, 2]);
    api.addMany([
      { id: 1, name: 'reused first' },
      { id: 2, name: 'reused second' },
    ]);
    api.setAll([
      { id: 3, name: 'third' },
      { id: 4, name: 'fourth' },
    ]);
    api.upsertMany([
      { id: 3, name: 'third updated' },
      { id: 5, name: 'fifth' },
    ]);

    const calls = notify.mock.calls.map((call) => ({
      path: call[0] as string,
      ownerPath: call[3] as string | undefined,
      subjectId: (call[4] as number[] | undefined)?.[0],
      positionIds: call[5] as number[] | undefined,
    }));

    expect(calls).toHaveLength(12);
    expect(calls.every((call) => call.ownerPath === 'rows')).toBe(true);
    expect(calls.every((call) => call.positionIds?.[0] === ownerPositionIds[0])).toBe(true);

    const firstAddSubjects = calls.slice(0, 2).map((call) => call.subjectId);
    const updateManySubjects = calls.slice(2, 4).map((call) => call.subjectId);
    const removeManySubjects = calls.slice(4, 6).map((call) => call.subjectId);
    const secondAddSubjects = calls.slice(6, 8).map((call) => call.subjectId);
    const setAllSubjects = calls.slice(8, 10).map((call) => call.subjectId);
    const upsertSubjects = calls.slice(10, 12).map((call) => call.subjectId);
    const subjectByPath = new Map(calls.map((call) => [call.path, call.subjectId]));

    expect(new Set(firstAddSubjects).size).toBe(2);
    expect(updateManySubjects).toEqual(firstAddSubjects);
    expect(removeManySubjects).toEqual(firstAddSubjects);
    expect(secondAddSubjects).not.toEqual(firstAddSubjects);
    expect(new Set(setAllSubjects).size).toBe(2);
    expect(subjectByPath.get('rows.3')).toBe(setAllSubjects[0]);
    expect(setAllSubjects).not.toContain(subjectByPath.get('rows.5'));
    expect(new Set(upsertSubjects).size).toBe(2);
    expect(calls.map((call) => call.path)).toEqual([
      'rows.1',
      'rows.2',
      'rows.1',
      'rows.2',
      'rows.1',
      'rows.2',
      'rows.1',
      'rows.2',
      'rows.3',
      'rows.4',
      'rows.5',
      'rows.3',
    ]);
  });
});

describe('structural history effect delivery', () => {
  type Row = { id: number; name: string };
  type StructuralEvent = {
    path: string;
    ownerPath?: string;
    subjectIds?: number[];
    positionIds?: number[];
    historyEffect?: unknown;
  };

  const observeStructuralMutation = (
    exercise: (
      api: ReturnType<typeof createEntitySignal<Row, number>>,
      resetSeen: () => void
    ) => void
  ): { seenA: StructuralEvent[]; seenB: StructuralEvent[] } => {
    const notifier = new PathNotifier({ batching: false });
    const api = createEntitySignal<Row, number>(
      { selectId: (row) => row.id },
      notifier,
      'rows'
    );
    const seenA: StructuralEvent[] = [];
    const seenB: StructuralEvent[] = [];

    const subscribe = (bucket: StructuralEvent[]): (() => void) =>
      notifier.subscribe(
        'rows.*',
        (_next, _prev, path, ownerPath, _source, subjectIds, positionIds, meta) => {
          if (meta?.historyEffect) {
            expect(Object.isFrozen(meta.historyEffect)).toBe(true);
          }
          bucket.push({
            path,
            ownerPath,
            subjectIds,
            positionIds,
            historyEffect: meta?.historyEffect,
          });
        }
      );

    const unsubscribeA = subscribe(seenA);
    const unsubscribeB = subscribe(seenB);

    exercise(api, () => {
      seenA.length = 0;
      seenB.length = 0;
    });

    unsubscribeA();
    unsubscribeB();

    return { seenA, seenB };
  };

  it('delivers the same canonical add effect to two observers', () => {
    const { seenA, seenB } = observeStructuralMutation((api) => {
      api.addOne({ id: 17, name: 'pending' });
    });

    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);
    expect(seenA[0]?.historyEffect).toBe(seenB[0]?.historyEffect);
    expect(seenA[0]).toMatchObject({
      path: 'rows.17',
      ownerPath: 'rows',
      historyEffect: {
        kind: 'add',
        key: 17,
        subject: seenA[0]?.subjectIds?.[0],
        subjectPositions: seenA[0]?.positionIds,
      },
      positionIds: seenB[0]?.positionIds,
    });
  });

  it('delivers the same canonical remove effect to two observers', () => {
    const { seenA, seenB } = observeStructuralMutation((api, resetSeen) => {
      api.addOne({ id: 16, name: 'before' });
      api.addOne({ id: 17, name: 'target' });
      api.addOne({ id: 18, name: 'after' });
      resetSeen();
      api.removeOne(17);
    });

    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);
    expect(seenA[0]?.historyEffect).toBe(seenB[0]?.historyEffect);
    expect(seenA[0]).toMatchObject({
      path: 'rows.17',
      ownerPath: 'rows',
      historyEffect: {
        kind: 'remove',
        key: 17,
        subject: seenA[0]?.subjectIds?.[0],
        subjectPositions: seenA[0]?.positionIds,
      },
      positionIds: seenB[0]?.positionIds,
    });
  });

  it('delivers the same canonical rekey effect to two observers', () => {
    const { seenA, seenB } = observeStructuralMutation((api, resetSeen) => {
      api.addOne({ id: 17, name: 'target' });
      resetSeen();
      api.changeId(17, 27);
    });

    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);
    expect(seenA[0]?.historyEffect).toBe(seenB[0]?.historyEffect);
    expect(seenA[0]).toMatchObject({
      path: 'rows.27',
      ownerPath: 'rows',
      historyEffect: {
        kind: 'rekey',
        beforeKey: 17,
        afterKey: 27,
        subject: seenA[0]?.subjectIds?.[0],
        subjectPositions: seenA[0]?.positionIds,
      },
      positionIds: seenB[0]?.positionIds,
    });
  });

  it('authors complete canonical structural coverage on add, remove, and rekey envelopes', () => {
    const { seenA } = observeStructuralMutation((api, resetSeen) => {
      api.addOne({ id: 17, name: 'target' });
      api.changeId(17, 27);
      api.removeOne(27);
      resetSeen();
      api.addOne({ id: 33, name: 'added' });
      api.changeId(33, 44);
      api.removeOne(44);
    });

    expect(seenA).toHaveLength(3);
    for (const event of seenA) {
      expect(event.historyEffect).toMatchObject({
        subjectPositions: event.positionIds,
      });
    }
  });
});

describe('replaceOne / node-callable REPLACE semantics (14.1.1)', () => {
  type Row = { id: number; name: string; note?: string };

  function makeApi() {
    return createEntitySignal<Row, number>(
      { selectId: (r) => r.id },
      pathNotifier,
      'rows'
    );
  }

  // The whole reason replace exists: `updateOne` spreads, so it CANNOT remove a
  // key. Assert the observable state, not that a method was reachable.
  it('replaceOne REMOVES a key that updateOne cannot', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'a', note: 'keep me' });

    api.updateOne(1, { name: 'b' } as Partial<Row>);
    expect(api.byId(1)()).toEqual({ id: 1, name: 'b', note: 'keep me' });

    api.replaceOne(1, { id: 1, name: 'c' });
    expect(api.byId(1)()).toEqual({ id: 1, name: 'c' });
    expect('note' in (api.byId(1)() as Row)).toBe(false);
  });

  it('replaceOne preserves list position', () => {
    const api = makeApi();
    api.addMany([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ]);
    api.replaceOne(2, { id: 2, name: 'REPLACED' });
    expect(api.all().map((r) => r.id)).toEqual([1, 2, 3]);
    expect(api.all().map((r) => r.name)).toEqual(['a', 'REPLACED', 'c']);
  });

  it('replaceOne throws on a missing id rather than inserting', () => {
    const api = makeApi();
    expect(() => api.replaceOne(99, { id: 99, name: 'x' })).toThrow(
      /not found/
    );
    expect(api.count()).toBe(0);
  });

  // The updater form is the argument for replace: it returns a full `E`, so under
  // merge semantics removing a key was silently impossible.
  it('node(updater) REPLACES, so an updater that drops a key drops it', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'a', note: 'gone after this' });
    const node = api.byId(1);

    node((current) => ({ id: current.id, name: current.name.toUpperCase() }));

    expect(api.byId(1)()).toEqual({ id: 1, name: 'A' });
    expect('note' in (api.byId(1)() as Row)).toBe(false);
  });

  it('node(value) REPLACES rather than merging', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'a', note: 'x' });
    api.byId(1)({ id: 1, name: 'z' } as Row);
    expect(api.byId(1)()).toEqual({ id: 1, name: 'z' });
  });

  // `setOne(entity)` was rejected because it would derive the key from the entity.
  // This is the drift it would have written into: after changeId the entity's own
  // id field and the storage key disagree.
  it('changeId can leave entity.id disagreeing with the storage key', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'temp' });
    api.changeId(1, 42);

    expect(api.ids()).toEqual([42]);
    // The stored entity still reports its OLD id — this is the drift a
    // `setOne(entity)` would have keyed off.
    expect(api.byId(42)()?.id).toBe(1);
  });
});
