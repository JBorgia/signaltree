import { describe, expect, it, vi } from 'vitest';

import {
  EntityMutationFrame,
  type PreparedFreshSubject,
} from './entity-mutation-frame';
import { EntityValueStore } from './entity-value-store';
import { MaterializedEntityProjection } from './materialized-entity-projection';
import { StructuralStore } from './structural-store';

type Item = {
  id: number;
  name: string;
};

function createFrameHarness() {
  const valueStore = new EntityValueStore<Item>();
  const projection = new MaterializedEntityProjection<number, Item>();
  const structuralStore = new StructuralStore<number>();
  const frame = new EntityMutationFrame(valueStore, projection, structuralStore);

  return {
    valueStore,
    projection,
    structuralStore,
    frame,
  };
}

describe('EntityMutationFrame', () => {
  it('commits prepared fresh subjects without allocating ids during commit', () => {
    const { frame, structuralStore, valueStore } = createFrameHarness();
    const plannedSubjectId = structuralStore.planFreshSubjectIds(1)[0];
    const freshSubject: PreparedFreshSubject<number, Item> = {
      kind: 'create-fresh-subject',
      key: 1,
      subjectId: plannedSubjectId,
      nextValue: { id: 1, name: 'Alice' },
    };

    frame.stageFreshSubject(freshSubject);

    const allocateSpy = vi
      .spyOn(structuralStore, 'allocateFreshSubjectId')
      .mockImplementation(() => {
        throw new Error('commit must not allocate fresh subject ids');
      });

    const result = frame.commit();

    expect(result.allocatedSubjectIds).toEqual([plannedSubjectId]);
    expect(result.projectionAppends).toEqual([
      { key: 1, nextValue: { id: 1, name: 'Alice' } },
    ]);
    expect(structuralStore.subjectIdForKey(1)).toBe(plannedSubjectId);
    expect(valueStore.backingForSubject(plannedSubjectId)).toEqual({
      id: 1,
      name: 'Alice',
    });

    allocateSpy.mockRestore();
  });

  it('leaves projection untouched until explicit projection runs', () => {
    const { frame, structuralStore, valueStore, projection } = createFrameHarness();

    structuralStore.createSubject(1, 1);
    valueStore.retainSubjectValue(1, { id: 1, name: 'Alice' });
    projection.replaceEntry(1, { id: 1, name: 'Alice' });

    frame.stageValueReplacement({
      kind: 'replace-value',
      key: 1,
      subjectId: 1,
      nextValue: { id: 1, name: 'Bob' },
    });

    const result = frame.commit();

    expect(valueStore.backingForSubject(1)).toEqual({ id: 1, name: 'Bob' });
    expect(projection.get(1)).toEqual({ id: 1, name: 'Alice' });

    frame.project(result);

    expect(projection.get(1)).toEqual({ id: 1, name: 'Bob' });
  });

  it('projects fresh add incrementally in authoritative append order', () => {
    const { frame, structuralStore, valueStore, projection } = createFrameHarness();

    structuralStore.createSubject(1, 1);
    structuralStore.createSubject(2, 2);
    valueStore.retainSubjectValue(1, { id: 1, name: 'Alice' });
    valueStore.retainSubjectValue(2, { id: 2, name: 'Bob' });
    projection.replaceEntry(1, { id: 1, name: 'Alice' });
    projection.replaceEntry(2, { id: 2, name: 'Bob' });

    frame.stageFreshSubject({
      kind: 'create-fresh-subject',
      key: 3,
      subjectId: 3,
      nextValue: { id: 3, name: 'Cara' },
    });

    const rebuildSpy = vi.spyOn(projection, 'rebuild');
    const result = frame.commit();

    expect(() => frame.project(result)).not.toThrow();
    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(Array.from(projection.entries())).toEqual([
      [1, { id: 1, name: 'Alice' }],
      [2, { id: 2, name: 'Bob' }],
      [3, { id: 3, name: 'Cara' }],
    ]);

    const rebuiltProjection = new MaterializedEntityProjection<number, Item>();
    rebuiltProjection.rebuild(structuralStore, valueStore);
    expect(Array.from(projection.entries())).toEqual(
      Array.from(rebuiltProjection.entries())
    );

    rebuildSpy.mockRestore();
  });

  it('projects rekey incrementally while preserving authoritative order', () => {
    const { frame, structuralStore, valueStore, projection } = createFrameHarness();

    structuralStore.createSubject(1, 1);
    structuralStore.createSubject(2, 2);
    structuralStore.createSubject(3, 3);
    valueStore.retainSubjectValue(1, { id: 1, name: 'Alice' });
    valueStore.retainSubjectValue(2, { id: 2, name: 'Bob' });
    valueStore.retainSubjectValue(3, { id: 3, name: 'Cara' });
    projection.replaceEntry(1, { id: 1, name: 'Alice' });
    projection.replaceEntry(2, { id: 2, name: 'Bob' });
    projection.replaceEntry(3, { id: 3, name: 'Cara' });
    const originalProjectedValue = projection.get(2);

    frame.stageKeyTransfer({
      kind: 'transfer-key',
      subjectId: 2,
      fromKey: 2,
      toKey: 4,
    });

    const rebuildSpy = vi.spyOn(projection, 'rebuild');
    const result = frame.commit();

    expect(() => frame.project(result)).not.toThrow();
    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(projection.get(2)).toBeUndefined();
    expect(projection.get(4)).toBe(originalProjectedValue);
    expect(Array.from(projection.entries())).toEqual([
      [1, { id: 1, name: 'Alice' }],
      [4, { id: 2, name: 'Bob' }],
      [3, { id: 3, name: 'Cara' }],
    ]);

    const rebuiltProjection = new MaterializedEntityProjection<number, Item>();
    rebuiltProjection.rebuild(structuralStore, valueStore);
    expect(Array.from(projection.entries())).toEqual(
      Array.from(rebuiltProjection.entries())
    );

    rebuildSpy.mockRestore();
  });

  it('projects remove incrementally and remains equivalent to authoritative rebuild', () => {
    const { frame, structuralStore, valueStore, projection } = createFrameHarness();

    structuralStore.createSubject(1, 1);
    structuralStore.createSubject(2, 2);
    valueStore.retainSubjectValue(1, { id: 1, name: 'Alice' });
    valueStore.retainSubjectValue(2, { id: 2, name: 'Bob' });
    projection.replaceEntry(1, { id: 1, name: 'Alice' });
    projection.replaceEntry(2, { id: 2, name: 'Bob' });

    frame.stageSubjectTombstone({
      kind: 'tombstone-subject',
      subjectId: 1,
      key: 1,
      restoreAllowed: true,
    });

    const rebuildSpy = vi.spyOn(projection, 'rebuild');
    const result = frame.commit();

    expect(() => frame.project(result)).not.toThrow();
    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(projection.get(1)).toBeUndefined();
    expect(projection.get(2)).toEqual({ id: 2, name: 'Bob' });

    const rebuiltProjection = new MaterializedEntityProjection<number, Item>();
    rebuiltProjection.rebuild(structuralStore, valueStore);
    expect(Array.from(projection.entries())).toEqual(
      Array.from(rebuiltProjection.entries())
    );

    rebuildSpy.mockRestore();
  });

  it('projects restore incrementally and remains equivalent to authoritative rebuild', () => {
    const { frame, structuralStore, valueStore, projection } = createFrameHarness();

    structuralStore.createSubject(1, 1);
    structuralStore.createSubject(2, 2);
    structuralStore.createSubject(3, 3);
    valueStore.retainSubjectValue(1, { id: 1, name: 'Alice' });
    valueStore.retainSubjectValue(2, { id: 2, name: 'Bob' });
    valueStore.retainSubjectValue(3, { id: 3, name: 'Cara' });
    projection.replaceEntry(1, { id: 1, name: 'Alice' });
    projection.replaceEntry(2, { id: 2, name: 'Bob' });
    projection.replaceEntry(3, { id: 3, name: 'Cara' });

    structuralStore.tombstoneSubject(2, 2, true);
    projection.removeEntry(2);

    frame.stageSubjectRestore({
      kind: 'restore-subject',
      key: 2,
      subjectId: 2,
      restoreAllowed: true,
      beforeSubject: 1,
      afterSubject: 3,
      realizedValue: { id: 2, name: 'Bob' },
    });

    const rebuildSpy = vi.spyOn(projection, 'rebuild');
    const result = frame.commit();

    expect(() => frame.project(result)).not.toThrow();
    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(Array.from(projection.entries())).toEqual([
      [1, { id: 1, name: 'Alice' }],
      [2, { id: 2, name: 'Bob' }],
      [3, { id: 3, name: 'Cara' }],
    ]);

    const rebuiltProjection = new MaterializedEntityProjection<number, Item>();
    rebuiltProjection.rebuild(structuralStore, valueStore);
    expect(Array.from(projection.entries())).toEqual(
      Array.from(rebuiltProjection.entries())
    );

    rebuildSpy.mockRestore();
  });

  it('keeps earlier frame work side-effect free when later restore preparation fails', () => {
    const { frame, structuralStore, valueStore, projection } = createFrameHarness();

    structuralStore.createSubject(1, 1);
    structuralStore.createSubject(2, 2);
    structuralStore.createSubject(3, 3);
    valueStore.retainSubjectValue(1, { id: 1, name: 'Alice' });
    valueStore.retainSubjectValue(2, { id: 2, name: 'Bob' });
    valueStore.retainSubjectValue(3, { id: 3, name: 'Cara' });
    projection.replaceEntry(1, { id: 1, name: 'Alice' });
    projection.replaceEntry(2, { id: 2, name: 'Bob' });
    projection.replaceEntry(3, { id: 3, name: 'Cara' });

    structuralStore.tombstoneSubject(2, 2, true);
    projection.removeEntry(2);

    frame.stageFreshSubject({
      kind: 'create-fresh-subject',
      key: 4,
      subjectId: 4,
      nextValue: { id: 4, name: 'Delta' },
    });
    frame.stageSubjectRestore({
      kind: 'restore-subject',
      key: 2,
      subjectId: 2,
      restoreAllowed: true,
      beforeSubject: 1,
      afterSubject: 3,
      realizedValue: { id: 2, name: 'Bob' },
    });

    const resolvePlacementSpy = vi
      .spyOn(structuralStore, 'resolveSubjectRestorePlacement')
      .mockImplementation(() => {
        throw new Error('restore planning failed');
      });

    expect(() => frame.commit()).toThrow('restore planning failed');
    expect(structuralStore.subjectIdForKey(4)).toBeUndefined();
    expect(structuralStore.stateForSubject(4)).toBeUndefined();
    expect(structuralStore.activeKeysSnapshot()).toEqual([1, 3]);
    expect(structuralStore.stateForSubject(2)).toEqual({
      active: false,
      restoreAllowed: true,
    });
    expect(valueStore.backingForSubject(4)).toBeUndefined();
    expect(Array.from(projection.entries())).toEqual([
      [1, { id: 1, name: 'Alice' }],
      [3, { id: 3, name: 'Cara' }],
    ]);

    resolvePlacementSpy.mockRestore();
  });

  it('projects fresh key reuse from committed subject truth without reviving tombstoned state', () => {
    const { frame, structuralStore, valueStore, projection } = createFrameHarness();

    structuralStore.createSubject(42, 1);
    valueStore.retainSubjectValue(42, { id: 1, name: 'Alice' });
    projection.replaceEntry(1, { id: 1, name: 'Alice' });
    structuralStore.tombstoneSubject(42, 1, true);
    projection.removeEntry(1);

    frame.stageFreshSubject({
      kind: 'create-fresh-subject',
      key: 1,
      subjectId: 100,
      nextValue: { id: 1, name: 'Delta' },
    });

    const rebuildSpy = vi.spyOn(projection, 'rebuild');
    const result = frame.commit();

    expect(() => frame.project(result)).not.toThrow();
    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(structuralStore.subjectIdForKey(1)).toBe(100);
    expect(structuralStore.stateForSubject(42)).toEqual({
      active: false,
      restoreAllowed: true,
    });
    expect(structuralStore.stateForSubject(100)).toEqual({
      active: true,
      key: 1,
      restoreAllowed: true,
    });
    expect(projection.get(1)).toEqual({ id: 1, name: 'Delta' });
    expect(valueStore.backingForSubject(42)).toEqual({ id: 1, name: 'Alice' });
    expect(valueStore.backingForSubject(100)).toEqual({ id: 1, name: 'Delta' });

    const rebuiltProjection = new MaterializedEntityProjection<number, Item>();
    rebuiltProjection.rebuild(structuralStore, valueStore);
    expect(Array.from(projection.entries())).toEqual(
      Array.from(rebuiltProjection.entries())
    );

    rebuildSpy.mockRestore();
  });

  it('projects fresh add followed by rekey in the same frame as the final committed address', () => {
    const { frame, structuralStore, valueStore, projection } = createFrameHarness();

    frame.stageFreshSubject({
      kind: 'create-fresh-subject',
      key: 1,
      subjectId: 1,
      nextValue: { id: 1, name: 'Alice' },
    });
    frame.stageKeyTransfer({
      kind: 'transfer-key',
      subjectId: 1,
      fromKey: 1,
      toKey: 2,
    });

    const result = frame.commit();

    expect(structuralStore.subjectIdForKey(1)).toBeUndefined();
    expect(structuralStore.subjectIdForKey(2)).toBe(1);
    expect(() => frame.project(result)).not.toThrow();
    expect(projection.get(1)).toBeUndefined();
    expect(projection.get(2)).toEqual({ id: 1, name: 'Alice' });

    const rebuiltProjection = new MaterializedEntityProjection<number, Item>();
    rebuiltProjection.rebuild(structuralStore, valueStore);
    expect(Array.from(projection.entries())).toEqual(
      Array.from(rebuiltProjection.entries())
    );
  });

  it('documents only a catastrophic injected projection failure boundary after authoritative commit', () => {
    const { frame, structuralStore, valueStore, projection } = createFrameHarness();

    structuralStore.createSubject(1, 1);
    valueStore.retainSubjectValue(1, { id: 1, name: 'Alice' });
    projection.replaceEntry(1, { id: 1, name: 'Alice' });

    frame.stageKeyTransfer({
      kind: 'transfer-key',
      subjectId: 1,
      fromKey: 1,
      toKey: 2,
    });

    const rekeySpy = vi.spyOn(projection, 'rekeyEntry').mockImplementation(() => {
      throw new Error('projection exploded');
    });

    const result = frame.commit();

    expect(structuralStore.subjectIdForKey(1)).toBeUndefined();
    expect(structuralStore.subjectIdForKey(2)).toBe(1);
    expect(projection.get(1)).toEqual({ id: 1, name: 'Alice' });
    expect(() => frame.project(result)).toThrow('projection exploded');

    rekeySpy.mockRestore();
  });
});
