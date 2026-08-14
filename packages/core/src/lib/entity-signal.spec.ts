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
  __listSubjectReclamationCandidates?: () => readonly number[];
  __inspectSubjectResources?: (subjectId: number) => unknown;
  __snapshotStorageProjectionForTesting?: () => ReadonlyMap<
    number,
    { id: number; name: string; active: boolean }
  >;
  __rebuildActiveProjectionFromOwnersForTesting?: () => ReadonlyMap<
    number,
    { id: number; name: string; active: boolean }
  >;
  __clearStorageProjectionForTesting?: () => void;
  __rebuildStorageProjectionForTesting?: () => void;
  __planSubjectReclamation?: (
    subjectId: number,
    options: { causallyEligible: boolean }
  ) => unknown;
  __prepareSubjectReclamation?: (
    subjectId: number,
    options: { causallyEligible: boolean }
  ) => unknown;
  __applyPreparedSubjectReclamation?: (prepared: unknown) => void;
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
      subjectRevision: 0,
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
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([]);

    api.removeOne(1);

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      subjectRevision: 1,
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
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([subjectId]);

    api.addOne({ id: 1, name: 'Bob', active: false });
    const foreignSubjectId = api.byIdOrFail(1).name.__subjectIds?.[0];
    expect(foreignSubjectId).not.toBe(subjectId);

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      subjectRevision: 1,
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
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([subjectId]);
    expect(internal.__inspectSubjectResources?.(foreignSubjectId as number)).toEqual({
      subjectId: foreignSubjectId,
      state: 'active',
      subjectRevision: 0,
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
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([subjectId]);

    api.removeOne(1);
    internal.__restoreOne?.(1, { id: 1, name: 'Alice', active: true }, subjectId);

    const restored = api.byIdOrFail(1);
    expect(restored).toBe(heldRow);
    expect(restored.name).toBe(heldField);
    expect(restored.name.__subjectIds?.[0]).toBe(subjectId);
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      subjectRevision: 2,
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
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([foreignSubjectId as number]);
  });

  it('discovers only tombstoned subjects that still retain value backing', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    api.addOne({ id: 2, name: 'Bob', active: false });

    const heldOne = api.byIdOrFail(1).name;
    const heldTwo = api.byIdOrFail(2).name;
    const subjectOne = heldOne.__subjectIds?.[0];
    const subjectTwo = heldTwo.__subjectIds?.[0];
    if (subjectOne === undefined || subjectTwo === undefined) {
      throw new Error('Expected subject metadata for held fields');
    }

    api.removeOne(1);
    api.removeOne(2);
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([
      subjectOne,
      subjectTwo,
    ]);

    internal.__retireSubjectRetainedValueBackingForTesting?.(subjectOne);

    expect(internal.__inspectSubjectResources?.(subjectOne)).toEqual({
      subjectId: subjectOne,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldOne.__positionIds,
      retainedValueBacking: undefined,
    });
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([subjectTwo]);

    internal.__restoreOne?.(1, { id: 1, name: 'Alice', active: true }, subjectOne);
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([subjectTwo]);
  });

  it('retires retained value backing only when the subject is tombstoned and causally eligible', () => {
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
        >,
        { causallyEligible: true }
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

    expect(
      internal.__planSubjectReclamation?.(subjectId, {
        causallyEligible: false,
      })
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

    expect(
      internal.__planSubjectReclamation?.(subjectId, {
        causallyEligible: true,
      })
    ).toEqual({
      subjectId,
      eligible: true,
      retire: ['retained-value-backing'],
      retain: [
        'subject-lifetime-record',
        'subject-activation-channel',
        'row-facade',
        'field-facades',
        'ownership-metadata',
      ],
      unresolved: [],
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
      subjectRevision: 1,
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

  it('applies a prepared reclamation plan only while the tombstoned subject revision still matches', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldRow = api.byIdOrFail(1);
    const heldName = heldRow.name;
    const subjectId = heldName.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    let nameRuns = 0;
    const observedName = computed(() => {
      nameRuns++;
      return heldName() ?? 'absent';
    });

    expect(observedName()).toBe('Alice');
    api.removeOne(1);
    expect(observedName()).toBe('absent');

    const prepared = internal.__prepareSubjectReclamation?.(subjectId, {
      causallyEligible: true,
    });
    expect(prepared).toEqual({
      subjectId,
      expectedLifetime: 'tombstoned',
      expectedSubjectRevision: 1,
      retire: ['retained-value-backing'],
      retain: [
        'subject-lifetime-record',
        'subject-activation-channel',
        'row-facade',
        'field-facades',
        'ownership-metadata',
      ],
    });

    internal.__applyPreparedSubjectReclamation?.(prepared);

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      subjectRevision: 2,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldName.__positionIds,
      retainedValueBacking: undefined,
    });
    expect(observedName()).toBe('absent');
    expect(nameRuns).toBe(2);

    api.addOne({ id: 1, name: 'Bob', active: false });
    expect(observedName()).toBe('absent');
    expect(api.byIdOrFail(1).name()).toBe('Bob');
    api.removeOne(1);
    expect(() =>
      internal.__restoreOne?.(1, { id: 1, name: 'Alice', active: true }, subjectId)
    ).toThrow('retired backing');
  });

  it('refuses a stale prepared reclamation plan after restoration without mutating the active subject', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const subjectId = api.byIdOrFail(1).name.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    api.removeOne(1);
    const prepared = internal.__prepareSubjectReclamation?.(subjectId, {
      causallyEligible: true,
    });

    internal.__restoreOne?.(1, { id: 1, name: 'Alice', active: true }, subjectId);

    expect(() => internal.__applyPreparedSubjectReclamation?.(prepared)).toThrow(
      'stale'
    );
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      subjectRevision: 2,
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: api.byIdOrFail(1).name.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(api.byIdOrFail(1).name()).toBe('Alice');
  });

  it('tracks physical structural lifecycle across rekey, tombstone, foreign reuse, restore, and retained-backing retirement', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const originalRow = api.byIdOrFail(1);
    const originalField = originalRow.name;
    const originalSubjectId = originalField.__subjectIds?.[0];
    if (originalSubjectId === undefined) {
      throw new Error('Expected subject metadata for original field');
    }

    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'active',
      subjectRevision: 0,
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.changeId(1, 2);

    expect(api.byId(1)).toBeUndefined();
    expect(api.byIdOrFail(2)).toBe(originalRow);
    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'active',
      subjectRevision: 1,
      activeKey: 2,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.updateOne(2, { active: false });

    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'active',
      subjectRevision: 1,
      activeKey: 2,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.removeOne(2);

    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'tombstoned',
      subjectRevision: 2,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([
      originalSubjectId,
    ]);

    api.addOne({ id: 2, name: 'Bob', active: true });
    const foreignSubjectId = api.byIdOrFail(2).name.__subjectIds?.[0];
    if (foreignSubjectId === undefined) {
      throw new Error('Expected subject metadata for foreign field');
    }
    expect(foreignSubjectId).not.toBe(originalSubjectId);

    expect(internal.__inspectSubjectResources?.(foreignSubjectId)).toEqual({
      subjectId: foreignSubjectId,
      state: 'active',
      subjectRevision: 0,
      activeKey: 2,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.removeOne(2);

    expect(internal.__inspectSubjectResources?.(foreignSubjectId)).toEqual({
      subjectId: foreignSubjectId,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    internal.__restoreOne?.(2, { id: 1, name: 'Alice', active: true }, originalSubjectId);

    expect(api.byIdOrFail(2)).toBe(originalRow);
    expect(api.byIdOrFail(2).name).toBe(originalField);
    expect(api.byIdOrFail(2).name()).toBe('Alice');
    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'active',
      subjectRevision: 3,
      activeKey: 2,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.removeOne(2);

    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'tombstoned',
      subjectRevision: 4,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    const prepared = internal.__prepareSubjectReclamation?.(originalSubjectId, {
      causallyEligible: true,
    });
    internal.__applyPreparedSubjectReclamation?.(prepared);

    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'tombstoned',
      subjectRevision: 5,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: undefined,
    });
  });

  it('rekeys structural addressing without changing subject-backed value ownership', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldRow = api.byIdOrFail(1);
    const heldField = heldRow.name;
    const subjectId = heldField.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      subjectRevision: 0,
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.changeId(1, 2);

    expect(api.byId(1)).toBeUndefined();
    const rekeyedRow = api.byIdOrFail(2);
    expect(rekeyedRow).toBe(heldRow);
    expect(rekeyedRow.name).toBe(heldField);
    expect(rekeyedRow.name.__subjectIds?.[0]).toBe(subjectId);
    expect(rekeyedRow.name()).toBe('Alice');
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      subjectRevision: 1,
      activeKey: 2,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
  });

  it('removes structural reachability without changing subject-backed value ownership', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldRow = api.byIdOrFail(1);
    const heldField = heldRow.name;
    const subjectId = heldField.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    api.removeOne(1);

    expect(api.byId(1)).toBeUndefined();
    expect(heldRow()).toBeUndefined();
    expect(heldField()).toBeUndefined();
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([subjectId]);
  });

  it('restores structural reachability without reading replacement-key history', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const originalRow = api.byIdOrFail(1);
    const originalField = originalRow.name;
    const originalSubjectId = originalField.__subjectIds?.[0];
    if (originalSubjectId === undefined) {
      throw new Error('Expected subject metadata for original field');
    }

    api.removeOne(1);

    api.addOne({ id: 1, name: 'Bob', active: false });
    const foreignSubjectId = api.byIdOrFail(1).name.__subjectIds?.[0];
    if (foreignSubjectId === undefined) {
      throw new Error('Expected subject metadata for foreign field');
    }

    api.removeOne(1);
    internal.__restoreOne?.(
      1,
      { id: 1, name: 'Alice', active: true },
      originalSubjectId
    );

    const restoredRow = api.byIdOrFail(1);
    expect(restoredRow).toBe(originalRow);
    expect(restoredRow.name).toBe(originalField);
    expect(restoredRow.name()).toBe('Alice');
    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'active',
      subjectRevision: 2,
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__inspectSubjectResources?.(foreignSubjectId)).toEqual({
      subjectId: foreignSubjectId,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([foreignSubjectId]);

    api.addOne({ id: 2, name: 'Cara', active: true });
    expect(api.byIdOrFail(2).name.__subjectIds?.[0]).toBe(foreignSubjectId + 1);
  });

  it('replaces subject-owned value without changing structural identity or facades', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addMany([
      { id: 1, name: 'Jon', active: true },
      { id: 2, name: 'Other', active: false },
      { id: 3, name: 'Third', active: true },
    ]);

    const heldRow = api.byIdOrFail(2);
    const heldField = heldRow.name;
    const subjectId = heldField.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    expect(api.ids()).toEqual([1, 2, 3]);
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      subjectRevision: 0,
      activeKey: 2,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.replaceOne(2, { id: 2, name: 'Jonathan', active: true });

    const replacedRow = api.byIdOrFail(2);
    expect(api.ids()).toEqual([1, 2, 3]);
    expect(replacedRow).toBe(heldRow);
    expect(replacedRow.name).toBe(heldField);
    expect(replacedRow.name()).toBe('Jonathan');
    expect(replacedRow.active()).toBe(true);
    expect(replacedRow.name.__subjectIds?.[0]).toBe(subjectId);
    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      subjectRevision: 0,
      activeKey: 2,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([]);
  });

  it('reconstructs the materialized projection exactly from structural and value ownership', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    api.addOne({ id: 2, name: 'Bob', active: false });
    api.addOne({ id: 3, name: 'Cara', active: true });

    const subjectOne = api.byIdOrFail(1).name.__subjectIds?.[0];
    const subjectThree = api.byIdOrFail(3).name.__subjectIds?.[0];
    if (subjectOne === undefined || subjectThree === undefined) {
      throw new Error('Expected subject metadata for held fields');
    }

    api.updateOne(1, { name: 'Alicia' });
    api.changeId(2, 4);
    api.removeOne(3);
    internal.__restoreOne?.(5, { id: 5, name: 'Cara', active: true }, subjectThree);
    api.removeOne(1);
    api.addOne({ id: 1, name: 'Delta', active: false });

    const replacementSubject = api.byIdOrFail(1).name.__subjectIds?.[0];
    if (replacementSubject === undefined) {
      throw new Error('Expected subject metadata for replacement field');
    }

    expect(replacementSubject).not.toBe(subjectOne);

    const expectedEntries = [
      [4, { id: 2, name: 'Bob', active: false }],
      [5, { id: 5, name: 'Cara', active: true }],
      [1, { id: 1, name: 'Delta', active: false }],
    ] as const;

    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual(expectedEntries);
    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual(expectedEntries);
    expect(Array.from(api.asMap().entries())).toEqual(expectedEntries);
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([subjectOne]);

    internal.__clearStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual(expectedEntries);

    internal.__rebuildStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual(expectedEntries);
    expect(Array.from(api.asMap().entries())).toEqual(expectedEntries);
  });

  it('adds one fresh subject-owned value before projection and can rebuild storage afterward', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });

    const subjectId = api.byIdOrFail(1).name.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for added field');
    }

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      subjectRevision: 0,
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: api.byIdOrFail(1).name.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([[1, { id: 1, name: 'Alice', active: true }]]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual([[1, { id: 1, name: 'Alice', active: true }]]);

    internal.__clearStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual([[1, { id: 1, name: 'Alice', active: true }]]);

    internal.__rebuildStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([[1, { id: 1, name: 'Alice', active: true }]]);
    expect(Array.from(api.asMap().entries())).toEqual([
      [1, { id: 1, name: 'Alice', active: true }],
    ]);
  });

  it('keeps retained backing on subject identity rather than key reuse', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const originalRow = api.byIdOrFail(1);
    const originalField = originalRow.name;
    const originalSubjectId = originalField.__subjectIds?.[0];
    if (originalSubjectId === undefined) {
      throw new Error('Expected subject metadata for original field');
    }

    api.removeOne(1);

    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.addOne({ id: 1, name: 'Bob', active: false });
    const foreignRow = api.byIdOrFail(1);
    const foreignSubjectId = foreignRow.name.__subjectIds?.[0];
    if (foreignSubjectId === undefined) {
      throw new Error('Expected subject metadata for foreign field');
    }

    expect(foreignSubjectId).not.toBe(originalSubjectId);
    expect(foreignRow.name()).toBe('Bob');
    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__inspectSubjectResources?.(foreignSubjectId)).toEqual({
      subjectId: foreignSubjectId,
      state: 'active',
      subjectRevision: 0,
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.removeOne(1);
    internal.__restoreOne?.(1, { id: 1, name: 'Alice', active: true }, originalSubjectId);

    const restoredRow = api.byIdOrFail(1);
    expect(restoredRow).toBe(originalRow);
    expect(restoredRow.name).toBe(originalField);
    expect(restoredRow.name()).toBe('Alice');
    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'active',
      subjectRevision: 2,
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    api.removeOne(1);
    const prepared = internal.__prepareSubjectReclamation?.(originalSubjectId, {
      causallyEligible: true,
    });
    internal.__applyPreparedSubjectReclamation?.(prepared);

    expect(internal.__inspectSubjectResources?.(originalSubjectId)).toEqual({
      subjectId: originalSubjectId,
      state: 'tombstoned',
      subjectRevision: 4,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: originalField.__positionIds,
      retainedValueBacking: undefined,
    });
    expect(() =>
      internal.__restoreOne?.(1, { id: 1, name: 'Alice', active: true }, originalSubjectId)
    ).toThrow('retired backing');
  });

  it('allocates a fresh subject lifetime when adding at a retired subject key', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const heldRow = api.byIdOrFail(1);
    const heldField = heldRow.name;
    const retiredSubjectId = heldField.__subjectIds?.[0];
    if (retiredSubjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    api.removeOne(1);
    internal.__retireSubjectRetainedValueBackingForTesting?.(retiredSubjectId);

    api.addOne({ id: 1, name: 'Bob', active: false });
    const freshSubjectId = api.byIdOrFail(1).name.__subjectIds?.[0];

    expect(freshSubjectId).not.toBe(retiredSubjectId);
    expect(heldRow()).toBeUndefined();
    expect(heldField()).toBeUndefined();
    expect(internal.__inspectSubjectResources?.(retiredSubjectId)).toEqual({
      subjectId: retiredSubjectId,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: false,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldField.__positionIds,
      retainedValueBacking: undefined,
    });
    expect(internal.__inspectSubjectResources?.(freshSubjectId as number)).toEqual({
      subjectId: freshSubjectId,
      state: 'active',
      subjectRevision: 0,
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
  });

  it('refuses malformed prepared reclamation for an active subject before mutation', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    const subjectId = api.byIdOrFail(1).name.__subjectIds?.[0];
    if (subjectId === undefined) {
      throw new Error('Expected subject metadata for held field');
    }

    expect(() =>
      internal.__applyPreparedSubjectReclamation?.({
        subjectId,
        expectedLifetime: 'tombstoned',
        expectedSubjectRevision: 0,
        retire: ['retained-value-backing'],
        retain: [
          'subject-lifetime-record',
          'subject-activation-channel',
          'row-facade',
          'field-facades',
          'ownership-metadata',
        ],
      })
    ).toThrow('active lifetime state');

    expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
      subjectId,
      state: 'active',
      subjectRevision: 0,
      activeKey: 1,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: api.byIdOrFail(1).name.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
  });

  it('setAll preserves active survivors while historical key reuse allocates fresh identity', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'Alice', active: true });
    api.addOne({ id: 2, name: 'Bob', active: false });

    const heldRowA = api.byIdOrFail(1);
    const heldRowB = api.byIdOrFail(2);
    const heldFieldA = heldRowA.name;
    const heldFieldB = heldRowB.name;
    const subjectA = heldFieldA.__subjectIds?.[0];
    const subjectB = heldFieldB.__subjectIds?.[0];
    if (subjectA === undefined || subjectB === undefined) {
      throw new Error('Expected subject metadata for held fields');
    }

    api.removeOne(1);

    api.setAll([
      { id: 2, name: 'Bobby', active: true },
      { id: 1, name: 'Alicia', active: false },
      { id: 3, name: 'Cara', active: true },
    ]);

    const activeTwo = api.byIdOrFail(2);
    const activeOne = api.byIdOrFail(1);
    const activeThree = api.byIdOrFail(3);
    const subjectOneAfter = activeOne.name.__subjectIds?.[0];
    const subjectTwoAfter = activeTwo.name.__subjectIds?.[0];
    const subjectThreeAfter = activeThree.name.__subjectIds?.[0];

    expect(activeTwo).toBe(heldRowB);
    expect(activeTwo.name).toBe(heldFieldB);
    expect(subjectTwoAfter).toBe(subjectB);
    expect(activeTwo.name()).toBe('Bobby');

    expect(subjectOneAfter).not.toBe(subjectA);
    expect(activeOne).not.toBe(heldRowA);
    expect(activeOne.name).not.toBe(heldFieldA);
    expect(heldRowA()).toBeUndefined();
    expect(heldFieldA()).toBeUndefined();

    expect(subjectThreeAfter).not.toBe(subjectA);
    expect(subjectThreeAfter).not.toBe(subjectB);

    expect(internal.__inspectSubjectResources?.(subjectA)).toEqual({
      subjectId: subjectA,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldFieldA.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
  });

  it('setAll commits one heterogeneous final graph and rebuilds projection from owners', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addOne({ id: 1, name: 'A1', active: true });
    api.addOne({ id: 2, name: 'B1', active: false });
    api.addOne({ id: 3, name: 'C1', active: true });
    api.addOne({ id: 5, name: 'E1', active: false });
    api.addOne({ id: 4, name: 'D-old', active: true });
    const historicalDRow = api.byIdOrFail(4);
    const historicalDField = historicalDRow.name;
    const historicalDSubject = historicalDField.__subjectIds?.[0];
    if (historicalDSubject === undefined) {
      throw new Error('Expected subject metadata for historical D');
    }
    api.removeOne(4);

    const heldFieldA = api.byIdOrFail(1).name;
    const heldFieldB = api.byIdOrFail(2).name;
    const heldFieldC = api.byIdOrFail(3).name;
    const heldFieldE = api.byIdOrFail(5).name;
    const subjectA = heldFieldA.__subjectIds?.[0];
    const subjectB = heldFieldB.__subjectIds?.[0];
    const subjectC = heldFieldC.__subjectIds?.[0];
    const subjectE = heldFieldE.__subjectIds?.[0];
    if (
      subjectA === undefined ||
      subjectB === undefined ||
      subjectC === undefined ||
      subjectE === undefined
    ) {
      throw new Error('Expected subject metadata for active rows');
    }

    api.setAll([
      { id: 3, name: 'C2', active: false },
      { id: 4, name: 'Dnew', active: true },
      { id: 1, name: 'A2', active: false },
      { id: 6, name: 'F1', active: true },
    ]);

    const subjectDAfter = api.byIdOrFail(4).name.__subjectIds?.[0];
    const subjectFAfter = api.byIdOrFail(6).name.__subjectIds?.[0];
    if (subjectDAfter === undefined || subjectFAfter === undefined) {
      throw new Error('Expected subject metadata for fresh setAll arrivals');
    }

    expect(api.ids()).toEqual([3, 4, 1, 6]);
    expect(api.byIdOrFail(3).name.__subjectIds?.[0]).toBe(subjectC);
    expect(api.byIdOrFail(1).name.__subjectIds?.[0]).toBe(subjectA);
    expect(subjectDAfter).not.toBe(historicalDSubject);
    expect(subjectFAfter).toBe(subjectDAfter + 1);
    expect(api.byIdOrFail(3).name()).toBe('C2');
    expect(api.byIdOrFail(4).name()).toBe('Dnew');
    expect(api.byIdOrFail(1).name()).toBe('A2');
    expect(api.byIdOrFail(6).name()).toBe('F1');
    expect(api.byId(2)).toBeUndefined();
    expect(api.byId(5)).toBeUndefined();

    expect(internal.__inspectSubjectResources?.(subjectB)).toEqual({
      subjectId: subjectB,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldFieldB.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__inspectSubjectResources?.(subjectE)).toEqual({
      subjectId: subjectE,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldFieldE.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__inspectSubjectResources?.(historicalDSubject)).toEqual({
      subjectId: historicalDSubject,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: historicalDField.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });

    const expectedEntries = [
      [3, { id: 3, name: 'C2', active: false }],
      [4, { id: 4, name: 'Dnew', active: true }],
      [1, { id: 1, name: 'A2', active: false }],
      [6, { id: 6, name: 'F1', active: true }],
    ] as const;

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual(expectedEntries);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual(expectedEntries);

    internal.__clearStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual(expectedEntries);

    internal.__rebuildStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual(expectedEntries);
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

  it('interceptor-blocked addOne leaves both authoritative stores and projection unchanged', () => {
    const api = createEntitySignal<Item, number>(
      { selectId: (item) => item.id },
      pathNotifier,
      'items'
    );
    const internal = api as typeof api & {
      __snapshotStorageProjectionForTesting?: () => ReadonlyMap<number, Item>;
      __rebuildActiveProjectionFromOwnersForTesting?: () => ReadonlyMap<number, Item>;
    };

    api.intercept({
      onAdd: (entity, ctx) => {
        if (entity.id === 1) {
          ctx.block('blocked add');
        }
      },
    });

    expect(() => api.addOne({ id: 1, name: 'blocked' })).toThrow('blocked add');
    expect(api.count()).toBe(0);
    expect(api.byId(1)).toBeUndefined();
    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual([]);

    api.addOne({ id: 2, name: 'after block' });
    expect(api.byIdOrFail(2).name.__subjectIds?.[0]).toBe(1);
  });

  it('occupied addOne refusal leaves the subject namespace unchanged', () => {
    const notify = vi.fn();
    const api = createEntitySignal<Item, number>(
      { selectId: (item) => item.id },
      { notify } as any,
      'items'
    );

    api.addOne({ id: 1, name: 'A' });
    const notifyCountBefore = notify.mock.calls.length;

    expect(() => api.addOne({ id: 1, name: 'duplicate' })).toThrow('already exists');

    expect(api.count()).toBe(1);
    expect(api.byIdOrFail(1).name()).toBe('A');
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);

    api.addOne({ id: 2, name: 'B' });
    expect(api.byIdOrFail(2).name.__subjectIds?.[0]).toBe(2);
  });

  it('strict (default) throws on duplicate', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'A' });
    expect(() => api.addMany([{ id: 1, name: 'B' }, { id: 2, name: 'C' }])).toThrow('already exists');
  });

  it('strict late occupied addMany refusal leaves free keys absent and the allocator unchanged', () => {
    const notify = vi.fn();
    const api = createEntitySignal<Item, number>(
      { selectId: (item) => item.id },
      { notify } as any,
      'items'
    );

    api.addOne({ id: 3, name: 'occupied' });
    const notifyCountBefore = notify.mock.calls.length;

    expect(() =>
      api.addMany([
        { id: 1, name: 'free A' },
        { id: 2, name: 'free B' },
        { id: 3, name: 'duplicate C' },
      ])
    ).toThrow('already exists');

    expect(api.count()).toBe(1);
    expect(api.byId(1)).toBeUndefined();
    expect(api.byId(2)).toBeUndefined();
    expect(api.byIdOrFail(3).name()).toBe('occupied');
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);

    api.addOne({ id: 4, name: 'after refusal' });
    expect(api.byIdOrFail(4).name.__subjectIds?.[0]).toBe(2);
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

  it('does not partially allocate or publish when a later addMany interceptor blocks', () => {
    const api = makeApi();
    const internal = api as typeof api & {
      __snapshotStorageProjectionForTesting?: () => ReadonlyMap<number, Item>;
      __rebuildActiveProjectionFromOwnersForTesting?: () => ReadonlyMap<number, Item>;
    };
    api.intercept({
      onAdd: (entity, ctx) => {
        if (entity.name === 'blocked') {
          ctx.block('blocked by test');
        }
      },
    });

    expect(() =>
      api.addMany([
        { id: 1, name: 'first' },
        { id: 2, name: 'blocked' },
      ])
    ).toThrow('blocked by test');

    expect(api.count()).toBe(0);
    expect(api.byId(1)).toBeUndefined();
    expect(api.byId(2)).toBeUndefined();
    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual([]);

    api.addOne({ id: 3, name: 'after failure' });
    expect(api.byIdOrFail(3).name.__subjectIds?.[0]).toBe(1);
  });

  it('commits fresh addMany subjects in authored order and rebuilds projection from owners', () => {
    const api = makeApi();
    const internal = api as typeof api & {
      __snapshotStorageProjectionForTesting?: () => ReadonlyMap<number, Item>;
      __rebuildActiveProjectionFromOwnersForTesting?: () => ReadonlyMap<number, Item>;
      __clearStorageProjectionForTesting?: () => void;
      __rebuildStorageProjectionForTesting?: () => void;
    };

    const ids = api.addMany([
      { id: 3, name: 'C' },
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]);

    expect(ids).toEqual([3, 1, 2]);
    expect(api.ids()).toEqual([3, 1, 2]);
    expect(api.byIdOrFail(3).name.__subjectIds?.[0]).toBe(1);
    expect(api.byIdOrFail(1).name.__subjectIds?.[0]).toBe(2);
    expect(api.byIdOrFail(2).name.__subjectIds?.[0]).toBe(3);

    const expectedEntries = [
      [3, { id: 3, name: 'C' }],
      [1, { id: 1, name: 'A' }],
      [2, { id: 2, name: 'B' }],
    ] as const;

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual(expectedEntries);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual(expectedEntries);

    internal.__clearStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual(expectedEntries);

    internal.__rebuildStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual(expectedEntries);
    expect(Array.from(api.asMap().entries())).toEqual(expectedEntries);
  });

  it('does not partially add when upsertMany later fails in the update phase', () => {
    const api = makeApi();
    const internal = api as typeof api & {
      __snapshotStorageProjectionForTesting?: () => ReadonlyMap<number, Item>;
      __rebuildActiveProjectionFromOwnersForTesting?: () => ReadonlyMap<number, Item>;
    };
    api.addOne({ id: 1, name: 'original' });
    api.addOne({ id: 2, name: 'second' });
    api.intercept({
      onUpdate: (id, _changes, ctx) => {
        if (id === 2) {
          ctx.block('blocked update');
        }
      },
    });

    expect(() =>
      api.upsertMany([
        { id: 1, name: 'updated original' },
        { id: 3, name: 'new add one' },
        { id: 4, name: 'new add two' },
        { id: 2, name: 'new add' },
        { id: 2, name: 'blocked update' },
      ])
    ).toThrow('blocked update');

    expect(api.count()).toBe(2);
    expect(api.byIdOrFail(1).name()).toBe('original');
    expect(api.byIdOrFail(2).name()).toBe('second');
    expect(api.byId(3)).toBeUndefined();
    expect(api.byId(4)).toBeUndefined();
    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([
      [1, { id: 1, name: 'original' }],
      [2, { id: 2, name: 'second' }],
    ]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual([
      [1, { id: 1, name: 'original' }],
      [2, { id: 2, name: 'second' }],
    ]);

    api.addOne({ id: 5, name: 'after failure' });
    expect(api.byIdOrFail(5).name.__subjectIds?.[0]).toBe(3);
  });

  it('upsertMany commits mixed existing and fresh subjects while preserving fresh allocation order', () => {
    const api = makeApi();
    const internal = api as typeof api & {
      __snapshotStorageProjectionForTesting?: () => ReadonlyMap<number, Item>;
      __rebuildActiveProjectionFromOwnersForTesting?: () => ReadonlyMap<number, Item>;
      __clearStorageProjectionForTesting?: () => void;
      __rebuildStorageProjectionForTesting?: () => void;
    };

    api.addOne({ id: 1, name: 'A' });
    api.addOne({ id: 2, name: 'B' });
    const ids = api.upsertMany([
      { id: 3, name: 'C' },
      { id: 1, name: 'A updated' },
      { id: 4, name: 'D' },
      { id: 2, name: 'B updated' },
    ]);

    expect(ids).toEqual([3, 4, 1, 2]);
    expect(api.ids()).toEqual([1, 2, 3, 4]);
    expect(api.byIdOrFail(1).name()).toBe('A updated');
    expect(api.byIdOrFail(2).name()).toBe('B updated');
    expect(api.byIdOrFail(3).name()).toBe('C');
    expect(api.byIdOrFail(4).name()).toBe('D');
    expect(api.byIdOrFail(1).name.__subjectIds?.[0]).toBe(1);
    expect(api.byIdOrFail(2).name.__subjectIds?.[0]).toBe(2);
    expect(api.byIdOrFail(3).name.__subjectIds?.[0]).toBe(3);
    expect(api.byIdOrFail(4).name.__subjectIds?.[0]).toBe(4);

    const expectedEntries = [
      [1, { id: 1, name: 'A updated' }],
      [2, { id: 2, name: 'B updated' }],
      [3, { id: 3, name: 'C' }],
      [4, { id: 4, name: 'D' }],
    ] as const;

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual(expectedEntries);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual(expectedEntries);

    internal.__clearStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual(expectedEntries);

    internal.__rebuildStorageProjectionForTesting?.();

    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual(expectedEntries);
  });

  it('removeMany tombstones the whole prepared subject batch while retaining backing and held facades', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addMany([
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
      { id: 3, name: 'Cara', active: true },
      { id: 4, name: 'Dora', active: false },
    ]);

    const heldRowTwo = api.byIdOrFail(2);
    const heldFieldTwo = heldRowTwo.name;
    const heldRowFour = api.byIdOrFail(4);
    const heldFieldFour = heldRowFour.name;
    const subjectTwo = heldFieldTwo.__subjectIds?.[0];
    const subjectFour = heldFieldFour.__subjectIds?.[0];
    if (subjectTwo === undefined || subjectFour === undefined) {
      throw new Error('Expected subject metadata for held fields');
    }

    api.removeMany([2, 4]);

    expect(api.ids()).toEqual([1, 3]);
    expect(api.byId(2)).toBeUndefined();
    expect(api.byId(4)).toBeUndefined();
    expect(heldRowTwo()).toBeUndefined();
    expect(heldFieldTwo()).toBeUndefined();
    expect(heldRowFour()).toBeUndefined();
    expect(heldFieldFour()).toBeUndefined();
    expect(internal.__inspectSubjectResources?.(subjectTwo)).toEqual({
      subjectId: subjectTwo,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldFieldTwo.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__inspectSubjectResources?.(subjectFour)).toEqual({
      subjectId: subjectFour,
      state: 'tombstoned',
      subjectRevision: 1,
      activeKey: undefined,
      retainedSubjectState: true,
      entitySignal: true,
      activationToken: true,
      nodeFacadeMaterialized: true,
      fieldFacadesMaterialized: ['active', 'id', 'name'],
      positionIds: heldFieldFour.__positionIds,
      retainedValueBacking: {
        kind: 'retained-entity-signal',
      },
    });
    expect(internal.__listSubjectReclamationCandidates?.()).toEqual([
      subjectTwo,
      subjectFour,
    ]);
    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([
      [1, { id: 1, name: 'Alice', active: true }],
      [3, { id: 3, name: 'Cara', active: true }],
    ]);
  });

  it('clear empties active projection without deleting retained subject lifetimes or values', () => {
    const api = makeApi();
    const internal = api as typeof api & SubjectInventoryApi;

    api.addMany([
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
      { id: 3, name: 'Cara', active: true },
    ]);

    const heldRows = [api.byIdOrFail(1), api.byIdOrFail(2), api.byIdOrFail(3)];
    const heldFields = heldRows.map((row) => row.name);
    const subjectIds = heldFields.map((field) => field.__subjectIds?.[0]);
    if (subjectIds.some((subjectId) => subjectId === undefined)) {
      throw new Error('Expected subject metadata for held fields');
    }

    api.clear();

    expect(api.empty()).toBe(true);
    expect(api.ids()).toEqual([]);
    expect(api.count()).toBe(0);
    expect(api.byId(1)).toBeUndefined();
    expect(api.byId(2)).toBeUndefined();
    expect(api.byId(3)).toBeUndefined();
    expect(heldRows.map((row) => row())).toEqual([undefined, undefined, undefined]);
    expect(heldFields.map((field) => field())).toEqual([
      undefined,
      undefined,
      undefined,
    ]);

    for (let i = 0; i < subjectIds.length; i++) {
      const subjectId = subjectIds[i] as number;
      expect(internal.__inspectSubjectResources?.(subjectId)).toEqual({
        subjectId,
        state: 'tombstoned',
        subjectRevision: 1,
        activeKey: undefined,
        retainedSubjectState: true,
        entitySignal: false,
        activationToken: true,
        nodeFacadeMaterialized: true,
        fieldFacadesMaterialized: ['active', 'id', 'name'],
        positionIds: heldFields[i].__positionIds,
        retainedValueBacking: {
          kind: 'retained-entity-signal',
        },
      });
    }

    expect(internal.__listSubjectReclamationCandidates?.()).toEqual(
      subjectIds as number[]
    );
    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual([]);
  });

  it('does not partially remove, update, or allocate when a later setAll arrival blocks', () => {
    const notify = vi.fn();
    const api = createEntitySignal<Item, number>(
      { selectId: (item) => item.id },
      { notify } as any,
      'items'
    );
    const internal = api as typeof api & {
      __snapshotStorageProjectionForTesting?: () => ReadonlyMap<number, Item>;
      __rebuildActiveProjectionFromOwnersForTesting?: () => ReadonlyMap<number, Item>;
    };

    api.addOne({ id: 1, name: 'Alice' });
    api.addOne({ id: 2, name: 'Bob' });
    const subjectOne = api.byIdOrFail(1).name.__subjectIds?.[0];
    const subjectTwo = api.byIdOrFail(2).name.__subjectIds?.[0];
    const notifyCountBefore = notify.mock.calls.length;

    api.intercept({
      onAdd: (entity, ctx) => {
        if (entity.name === 'blocked') {
          ctx.block('blocked by test');
        }
      },
    });

    expect(() =>
      api.setAll([
        { id: 2, name: 'Bobby' },
        { id: 3, name: 'blocked' },
      ])
    ).toThrow('blocked by test');

    expect(api.count()).toBe(2);
    expect(api.ids()).toEqual([1, 2]);
    expect(api.byIdOrFail(1).name()).toBe('Alice');
    expect(api.byIdOrFail(2).name()).toBe('Bob');
    expect(api.byIdOrFail(1).name.__subjectIds?.[0]).toBe(subjectOne);
    expect(api.byIdOrFail(2).name.__subjectIds?.[0]).toBe(subjectTwo);
    expect(api.byId(3)).toBeUndefined();
    expect(
      Array.from(internal.__snapshotStorageProjectionForTesting?.().entries() ?? [])
    ).toEqual([
      [1, { id: 1, name: 'Alice' }],
      [2, { id: 2, name: 'Bob' }],
    ]);
    expect(
      Array.from(
        internal.__rebuildActiveProjectionFromOwnersForTesting?.().entries() ?? []
      )
    ).toEqual([
      [1, { id: 1, name: 'Alice' }],
      [2, { id: 2, name: 'Bob' }],
    ]);
    expect(notify.mock.calls).toHaveLength(notifyCountBefore);

    api.addOne({ id: 4, name: 'after failure' });
    expect(api.byIdOrFail(4).name.__subjectIds?.[0]).toBe(3);
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

    expect(calls).toHaveLength(14);
    expect(calls.every((call) => call.ownerPath === 'rows')).toBe(true);
    expect(calls.every((call) => call.positionIds?.[0] === ownerPositionIds[0])).toBe(true);

    const firstAddSubjects = calls.slice(0, 2).map((call) => call.subjectId);
    const updateManySubjects = calls.slice(2, 4).map((call) => call.subjectId);
    const removeManySubjects = calls.slice(4, 6).map((call) => call.subjectId);
    const secondAddSubjects = calls.slice(6, 8).map((call) => call.subjectId);
    const setAllRemovedSubjects = calls.slice(8, 10).map((call) => call.subjectId);
    const setAllAddedSubjects = calls.slice(10, 12).map((call) => call.subjectId);
    const upsertSubjects = calls.slice(12, 14).map((call) => call.subjectId);

    expect(new Set(firstAddSubjects).size).toBe(2);
    expect(updateManySubjects).toEqual(firstAddSubjects);
    expect(removeManySubjects).toEqual(firstAddSubjects);
    expect(secondAddSubjects).not.toEqual(firstAddSubjects);
    expect(setAllRemovedSubjects).toEqual(secondAddSubjects);
    expect(new Set(setAllAddedSubjects).size).toBe(2);
    expect(setAllAddedSubjects).not.toEqual(secondAddSubjects);
    expect(upsertSubjects[1]).toBe(setAllAddedSubjects[0]);
    expect(upsertSubjects[0]).not.toBe(setAllAddedSubjects[0]);
    expect(upsertSubjects[0]).not.toBe(setAllAddedSubjects[1]);
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

  it('authors setAll as a structural diff over active subjects', () => {
    const { seenA, seenB } = observeStructuralMutation((api, resetSeen) => {
      api.addOne({ id: 1, name: 'historical' });
      api.addOne({ id: 2, name: 'survivor' });
      api.addOne({ id: 4, name: 'removed by setAll' });
      api.removeOne(1);
      resetSeen();
      api.setAll([
        { id: 2, name: 'survivor updated' },
        { id: 1, name: 'fresh reuse' },
        { id: 3, name: 'fresh arrival' },
      ]);
    });

    expect(seenA).toHaveLength(4);
    expect(seenB).toHaveLength(4);

    const removeEvent = seenA.find((event) => event.path === 'rows.4');
    const survivorEvent = seenA.find((event) => event.path === 'rows.2');
    const reusedKeyEvent = seenA.find((event) => event.path === 'rows.1');
    const freshArrivalEvent = seenA.find((event) => event.path === 'rows.3');

    expect(removeEvent).toMatchObject({
      historyEffect: {
        kind: 'remove',
        key: 4,
        subject: removeEvent?.subjectIds?.[0],
        subjectPositions: removeEvent?.positionIds,
      },
    });
    expect(survivorEvent?.historyEffect).toBeUndefined();
    expect(reusedKeyEvent).toMatchObject({
      historyEffect: {
        kind: 'add',
        key: 1,
        subject: reusedKeyEvent?.subjectIds?.[0],
        subjectPositions: reusedKeyEvent?.positionIds,
      },
    });
    expect(freshArrivalEvent).toMatchObject({
      historyEffect: {
        kind: 'add',
        key: 3,
        subject: freshArrivalEvent?.subjectIds?.[0],
        subjectPositions: freshArrivalEvent?.positionIds,
      },
    });

    expect(removeEvent?.historyEffect).toBe(
      seenB.find((event) => event.path === 'rows.4')?.historyEffect
    );
    expect(reusedKeyEvent?.historyEffect).toBe(
      seenB.find((event) => event.path === 'rows.1')?.historyEffect
    );
    expect(freshArrivalEvent?.historyEffect).toBe(
      seenB.find((event) => event.path === 'rows.3')?.historyEffect
    );
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
