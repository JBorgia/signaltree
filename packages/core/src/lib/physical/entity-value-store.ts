export class EntityValueStore<
  E extends Record<string, unknown>,
  K extends string | number = string,
> {
  private readonly retainedEntities = new Map<number, E>();

  constructor(
    private readonly subjectIdForKey: (key: K) => number | undefined
  ) {}

  backingForSubject(subjectId: number): E | undefined {
    return this.retainedEntities.get(subjectId);
  }

  backingForKey(key: K): E | undefined {
    const subjectId = this.subjectIdForKey(key);
    return subjectId === undefined ? undefined : this.backingForSubject(subjectId);
  }

  retainSubjectValue(subjectId: number, entity: E): void {
    this.retainedEntities.set(subjectId, entity);
  }

  retainValueForKey(key: K, entity: E): number {
    const subjectId = this.subjectIdForKey(key);
    if (subjectId === undefined) {
      throw new Error(`Entity with id ${String(key)} has no subject id`);
    }
    this.retainSubjectValue(subjectId, entity);
    return subjectId;
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
