import { EntityValueStore } from './entity-value-store';
import { StructuralStore } from './structural-store';

export class MaterializedEntityProjection<
  K extends string | number,
  E extends Record<string, unknown>,
> {
  private readonly storage = new Map<K, E>();

  get(key: K): E | undefined {
    return this.storage.get(key);
  }

  entries(): IterableIterator<[K, E]> {
    return this.storage.entries();
  }

  replaceEntry(key: K, value: E): void {
    this.storage.set(key, value);
  }

  rebuild(
    structuralStore: StructuralStore<K>,
    valueStore: EntityValueStore<E>
  ): void {
    this.storage.clear();
    for (const key of structuralStore.activeKeysSnapshot()) {
      const subjectId = structuralStore.subjectIdForKey(key);
      const value =
        subjectId === undefined
          ? undefined
          : valueStore.backingForSubject(subjectId);
      if (value !== undefined) {
        this.storage.set(key, value);
      }
    }
  }

  snapshot(): ReadonlyMap<K, E> {
    return new Map(this.storage);
  }

  clearForTesting(): void {
    this.storage.clear();
  }
}
