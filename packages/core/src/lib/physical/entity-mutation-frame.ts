import { EntityValueStore } from './entity-value-store';
import { MaterializedEntityProjection } from './materialized-entity-projection';
import { StructuralStore } from './structural-store';

export type PreparedValueReplacement<
  K extends string | number,
  E extends Record<string, unknown>,
> = {
  kind: 'replace-value';
  key: K;
  subjectId: number;
  nextValue: E;
};

export type PreparedRetainedValueRetirement = {
  kind: 'retire-retained-value';
  subjectId: number;
};

export type PreparedKeyTransfer<K extends string | number> = {
  kind: 'transfer-key';
  fromKey: K;
  toKey: K;
  subjectId: number;
};

export type PreparedSubjectTombstone<K extends string | number> = {
  kind: 'tombstone-subject';
  key: K;
  subjectId: number;
  restoreAllowed: boolean;
};

export type PreparedFreshSubject<
  K extends string | number,
  E extends Record<string, unknown>,
> = {
  kind: 'create-fresh-subject';
  key: K;
  subjectId: number;
  nextValue: E;
};

export type ProjectionReplacement<
  K extends string | number,
  E extends Record<string, unknown>,
> = {
  key: K;
  nextValue: E;
};

export type ProjectionRemoval<K extends string | number> = {
  key: K;
};

export type PreparedSubjectRestore<
  K extends string | number,
  E extends Record<string, unknown>,
> = {
  kind: 'restore-subject';
  key: K;
  subjectId: number;
  restoreAllowed: boolean;
  beforeSubject?: number;
  afterSubject?: number;
  realizedValue?: E;
};

export type PreparedEntityPhysicalMutation<
  K extends string | number,
  E extends Record<string, unknown>,
> =
  | PreparedValueReplacement<K, E>
  | PreparedRetainedValueRetirement
  | PreparedKeyTransfer<K>
  | PreparedSubjectTombstone<K>
  | PreparedFreshSubject<K, E>
  | PreparedSubjectRestore<K, E>;

export type EntityMutationCommitResult<
  K extends string | number,
  E extends Record<string, unknown>,
> = {
  physicallyChangedSubjectIds: readonly number[];
  allocatedSubjectIds: readonly number[];
  projectionRebuildRequired: boolean;
  projectionReplacements: readonly ProjectionReplacement<K, E>[];
  projectionRemovals: readonly ProjectionRemoval<K>[];
};

export class EntityMutationFrame<
  K extends string | number,
  E extends Record<string, unknown>,
> {
  private readonly mutations: PreparedEntityPhysicalMutation<K, E>[] = [];

  constructor(
    private readonly valueStore: EntityValueStore<E>,
    private readonly materializedProjection: MaterializedEntityProjection<K, E>,
    private readonly structuralStore: StructuralStore<K>
  ) {}

  stageValueReplacement(replacement: PreparedValueReplacement<K, E>): void {
    this.mutations.push(replacement);
  }

  stageRetainedValueRetirement(retirement: PreparedRetainedValueRetirement): void {
    this.mutations.push(retirement);
  }

  stageKeyTransfer(transfer: PreparedKeyTransfer<K>): void {
    this.mutations.push(transfer);
  }

  stageSubjectTombstone(tombstone: PreparedSubjectTombstone<K>): void {
    this.mutations.push(tombstone);
  }

  stageFreshSubject(freshSubject: PreparedFreshSubject<K, E>): void {
    this.mutations.push(freshSubject);
  }

  stageSubjectRestore(restoration: PreparedSubjectRestore<K, E>): void {
    this.mutations.push(restoration);
  }

  commit(): EntityMutationCommitResult<K, E> {
    const physicallyChangedSubjectIds = new Set<number>();
    const allocatedSubjectIds: number[] = [];
    const projectionReplacements: ProjectionReplacement<K, E>[] = [];
    const projectionRemovals: ProjectionRemoval<K>[] = [];
    let projectionRebuildRequired = false;

    for (const mutation of this.mutations) {
      if (mutation.kind === 'create-fresh-subject') {
        this.structuralStore.createSubject(mutation.subjectId, mutation.key);
        this.valueStore.retainSubjectValue(
          mutation.subjectId,
          mutation.nextValue
        );
        allocatedSubjectIds.push(mutation.subjectId);
        projectionRebuildRequired = true;
        continue;
      }

      if (mutation.kind === 'restore-subject') {
        this.structuralStore.restoreSubject(
          mutation.subjectId,
          mutation.key,
          mutation.beforeSubject,
          mutation.afterSubject,
          mutation.restoreAllowed
        );
        if (mutation.realizedValue !== undefined) {
          this.valueStore.retainSubjectValue(
            mutation.subjectId,
            mutation.realizedValue
          );
        }
        physicallyChangedSubjectIds.add(mutation.subjectId);
        projectionRebuildRequired = true;
        continue;
      }

      if (mutation.kind === 'replace-value') {
        this.valueStore.retainSubjectValue(
          mutation.subjectId,
          mutation.nextValue
        );
        projectionReplacements.push({
          key: mutation.key,
          nextValue: mutation.nextValue,
        });
        continue;
      }

      if (mutation.kind === 'retire-retained-value') {
        const hadBacking = this.valueStore.retireSubjectValue(
          mutation.subjectId
        );
        this.structuralStore.retireSubject(mutation.subjectId);
        if (hadBacking) {
          physicallyChangedSubjectIds.add(mutation.subjectId);
        }
        continue;
      }

      if (mutation.kind === 'transfer-key') {
        this.structuralStore.transferSubject(
          mutation.subjectId,
          mutation.fromKey,
          mutation.toKey
        );
        physicallyChangedSubjectIds.add(mutation.subjectId);
        projectionRebuildRequired = true;
        continue;
      }

      this.structuralStore.tombstoneSubject(
        mutation.subjectId,
        mutation.key,
        mutation.restoreAllowed
      );
      physicallyChangedSubjectIds.add(mutation.subjectId);
      projectionRemovals.push({ key: mutation.key });
    }

    return {
      physicallyChangedSubjectIds: [...physicallyChangedSubjectIds],
      allocatedSubjectIds,
      projectionRebuildRequired,
      projectionReplacements,
      projectionRemovals,
    };
  }

  project(commitResult: EntityMutationCommitResult<K, E>): void {
    if (commitResult.projectionRebuildRequired) {
      this.materializedProjection.rebuild(this.structuralStore, this.valueStore);
      return;
    }

    for (const replacement of commitResult.projectionReplacements) {
      this.materializedProjection.replaceEntry(
        replacement.key,
        replacement.nextValue
      );
    }

    for (const removal of commitResult.projectionRemovals) {
      this.materializedProjection.removeEntry(removal.key);
    }
  }
}
