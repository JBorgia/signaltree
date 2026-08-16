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

  it('preserves authoritative order when rekeying through projection rebuild', () => {
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

    frame.stageKeyTransfer({
      kind: 'transfer-key',
      subjectId: 2,
      fromKey: 2,
      toKey: 4,
    });

    const result = frame.commit();

    expect(() => frame.project(result)).not.toThrow();
    expect(Array.from(projection.entries())).toEqual([
      [1, { id: 1, name: 'Alice' }],
      [4, { id: 2, name: 'Bob' }],
      [3, { id: 3, name: 'Cara' }],
    ]);
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

    const rebuildSpy = vi.spyOn(projection, 'rebuild').mockImplementation(() => {
      throw new Error('projection exploded');
    });

    const result = frame.commit();

    expect(structuralStore.subjectIdForKey(1)).toBeUndefined();
    expect(structuralStore.subjectIdForKey(2)).toBe(1);
    expect(projection.get(1)).toEqual({ id: 1, name: 'Alice' });
    expect(() => frame.project(result)).toThrow('projection exploded');

    rebuildSpy.mockRestore();
  });
});
