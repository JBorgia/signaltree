import { EntityValueStore } from './entity-value-store';
import { MaterializedEntityProjection } from './materialized-entity-projection';
import {
  type ResolvedSubjectRestorePlacement,
  StructuralStore,
} from './structural-store';

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

export type ProjectionAppend<
  K extends string | number,
  E extends Record<string, unknown>,
> = {
  key: K;
  nextValue: E;
};

export type ProjectionRekey<K extends string | number> = {
  fromKey: K;
  toKey: K;
};

export type ProjectionRestore<
  K extends string | number,
  E extends Record<string, unknown>,
> = {
  key: K;
  nextValue: E;
  beforeKey?: K;
  afterKey?: K;
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
  projectionAppends: readonly ProjectionAppend<K, E>[];
  projectionRekeys: readonly ProjectionRekey<K>[];
  projectionRestores: readonly ProjectionRestore<K, E>[];
};

type PreparedRestoreCommitInstruction<
  K extends string | number,
  E extends Record<string, unknown>,
> = PreparedSubjectRestore<K, E> & {
  resolvedValue?: E;
  resolvedPlacement: ResolvedSubjectRestorePlacement<K>;
};

type PreparedCommitInstruction<
  K extends string | number,
  E extends Record<string, unknown>,
> =
  | Exclude<PreparedEntityPhysicalMutation<K, E>, PreparedSubjectRestore<K, E>>
  | PreparedRestoreCommitInstruction<K, E>;

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
    const preparedMutations = this.prepareCommitInstructions();
    const physicallyChangedSubjectIds = new Set<number>();
    const allocatedSubjectIds: number[] = [];
    const projectionReplacements: ProjectionReplacement<K, E>[] = [];
    const projectionRemovals: ProjectionRemoval<K>[] = [];
    const projectionAppends: ProjectionAppend<K, E>[] = [];
    const projectionRekeys: ProjectionRekey<K>[] = [];
    const projectionRestores: ProjectionRestore<K, E>[] = [];
    let projectionRebuildRequired = false;

    for (const mutation of preparedMutations) {
      if (mutation.kind === 'create-fresh-subject') {
        this.structuralStore.createSubject(mutation.subjectId, mutation.key);
        this.valueStore.retainSubjectValue(
          mutation.subjectId,
          mutation.nextValue
        );
        allocatedSubjectIds.push(mutation.subjectId);
        projectionAppends.push({
          key: mutation.key,
          nextValue: mutation.nextValue,
        });
        continue;
      }

      if (mutation.kind === 'restore-subject') {
        this.structuralStore.restoreSubjectAtResolvedPlacement(
          mutation.subjectId,
          mutation.key,
          mutation.resolvedPlacement,
          mutation.restoreAllowed
        );
        if (mutation.resolvedValue !== undefined) {
          this.valueStore.retainSubjectValue(
            mutation.subjectId,
            mutation.resolvedValue
          );
        }

        if (mutation.resolvedValue !== undefined) {
          projectionRestores.push({
            key: mutation.key,
            nextValue: mutation.resolvedValue,
            beforeKey: mutation.resolvedPlacement.beforeKey,
            afterKey: mutation.resolvedPlacement.afterKey,
          });
        } else {
          projectionRebuildRequired = true;
        }

        physicallyChangedSubjectIds.add(mutation.subjectId);
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
        const appendedEntry = projectionAppends.find(
          (append) => append.key === mutation.fromKey
        );
        if (appendedEntry !== undefined) {
          appendedEntry.key = mutation.toKey;
          continue;
        }

        projectionRekeys.push({
          fromKey: mutation.fromKey,
          toKey: mutation.toKey,
        });
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
      projectionAppends,
      projectionRekeys,
      projectionRestores,
    };
  }

  private prepareCommitInstructions(): PreparedCommitInstruction<K, E>[] {
    return this.mutations.map((mutation) => {
      if (mutation.kind !== 'restore-subject') {
        return mutation;
      }

      return {
        ...mutation,
        resolvedValue:
          mutation.realizedValue ??
          this.valueStore.backingForSubject(mutation.subjectId),
        resolvedPlacement: this.structuralStore.resolveSubjectRestorePlacement(
          mutation.beforeSubject,
          mutation.afterSubject
        ),
      };
    });
  }

  project(commitResult: EntityMutationCommitResult<K, E>): void {
    if (commitResult.projectionRebuildRequired) {
      this.materializedProjection.rebuild(this.structuralStore, this.valueStore);
      return;
    }

    for (const removal of commitResult.projectionRemovals) {
      this.materializedProjection.removeEntry(removal.key);
    }

    for (const rekey of commitResult.projectionRekeys) {
      this.materializedProjection.rekeyEntry(rekey.fromKey, rekey.toKey);
    }

    for (const restore of commitResult.projectionRestores) {
      this.materializedProjection.restoreEntry(restore.key, restore.nextValue, {
        beforeKey: restore.beforeKey,
        afterKey: restore.afterKey,
      });
    }

    for (const append of commitResult.projectionAppends) {
      this.materializedProjection.appendEntry(append.key, append.nextValue);
    }

    for (const replacement of commitResult.projectionReplacements) {
      this.materializedProjection.replaceEntry(
        replacement.key,
        replacement.nextValue
      );
    }
  }
}
