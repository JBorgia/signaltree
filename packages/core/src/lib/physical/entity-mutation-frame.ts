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
  nextValue: E;
};

export type PreparedEntityPhysicalMutation<
  K extends string | number,
  E extends Record<string, unknown>,
> =
  | PreparedValueReplacement<K, E>
  | PreparedRetainedValueRetirement
  | PreparedKeyTransfer<K>
  | PreparedSubjectTombstone<K>
  | PreparedFreshSubject<K, E>;

export type EntityMutationCommitResult = {
  physicallyChangedSubjectIds: readonly number[];
  allocatedSubjectIds: readonly number[];
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

  commit(): EntityMutationCommitResult {
    const physicallyChangedSubjectIds = new Set<number>();
    const allocatedSubjectIds: number[] = [];
    let requiresProjectionRebuild = false;

    for (const mutation of this.mutations) {
      if (mutation.kind === 'create-fresh-subject') {
        const subjectId = this.structuralStore.allocateFreshSubjectId();
        this.structuralStore.createSubject(subjectId, mutation.key);
        this.valueStore.retainSubjectValue(subjectId, mutation.nextValue);
        this.materializedProjection.replaceEntry(mutation.key, mutation.nextValue);
        allocatedSubjectIds.push(subjectId);
        continue;
      }

      if (mutation.kind === 'replace-value') {
        this.valueStore.retainSubjectValue(
          mutation.subjectId,
          mutation.nextValue
        );
        this.materializedProjection.replaceEntry(
          mutation.key,
          mutation.nextValue
        );
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
        requiresProjectionRebuild = true;
        continue;
      }

      this.structuralStore.tombstoneSubject(
        mutation.subjectId,
        mutation.key,
        mutation.restoreAllowed
      );
      physicallyChangedSubjectIds.add(mutation.subjectId);
      requiresProjectionRebuild = true;
    }

    if (requiresProjectionRebuild) {
      this.materializedProjection.rebuild(this.structuralStore, this.valueStore);
    }

    return {
      physicallyChangedSubjectIds: [...physicallyChangedSubjectIds],
      allocatedSubjectIds,
    };
  }
}
