import { recordProductionSubstrateStat } from '../internals/production-substrate-stats';

export class EntityValueStore<E extends Record<string, unknown>> {
  private readonly retainedEntities = new Map<number, E>();

  backingForSubject(subjectId: number): E | undefined {
    return this.retainedEntities.get(subjectId);
  }

  retainSubjectValue(subjectId: number, entity: E): void {
    recordProductionSubstrateStat('valueStoreWrites');
    this.retainedEntities.set(subjectId, entity);
  }

  hasRetainedValueBacking(subjectId: number): boolean {
    return this.retainedEntities.has(subjectId);
  }

  retireSubjectValue(subjectId: number): boolean {
    return this.retainedEntities.delete(subjectId);
  }

  clear(): void {
    this.retainedEntities.clear();
  }
}
