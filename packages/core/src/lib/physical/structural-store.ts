export type SubjectLifetimeRecord<K extends string | number> = {
  active: boolean;
  key?: K;
  restoreAllowed: boolean;
};

export class StructuralStore<K extends string | number> {
  private readonly subjectIds = new Map<K, number>();
  private readonly subjectStates = new Map<number, SubjectLifetimeRecord<K>>();
  private readonly subjectRevisions = new Map<number, number>();
  private nextSubjectId = 1;
  private activeKeys: K[] = [];

  allocateFreshSubjectId(): number {
    const subjectId = this.nextSubjectId;
    this.nextSubjectId += 1;
    return subjectId;
  }

  subjectIdForKey(key: K): number | undefined {
    return this.subjectIds.get(key);
  }

  stateForSubject(subjectId: number): SubjectLifetimeRecord<K> | undefined {
    return this.subjectStates.get(subjectId);
  }

  hasSubject(subjectId: number): boolean {
    return this.subjectStates.has(subjectId);
  }

  subjectRevision(subjectId: number): number {
    return this.subjectRevisions.get(subjectId) ?? 0;
  }

  bumpSubjectRevision(subjectId: number): void {
    this.subjectRevisions.set(subjectId, this.subjectRevision(subjectId) + 1);
  }

  activeKeyForSubject(subjectId: number): K | undefined {
    const state = this.stateForSubject(subjectId);
    return state?.active ? state.key : undefined;
  }

  hasActiveKey(key: K): boolean {
    return this.subjectIds.has(key);
  }

  activeKeyCount(): number {
    return this.activeKeys.length;
  }

  activeKeysSnapshot(): readonly K[] {
    return [...this.activeKeys];
  }

  firstActiveKey(): K | undefined {
    return this.activeKeys[0];
  }

  moveKeysToFront(keys: readonly K[]): void {
    const moving = new Set(keys);
    const rest = this.activeKeys.filter((key) => !moving.has(key));
    this.activeKeys = [...keys, ...rest];
  }

  reorderActiveKeys(keys: readonly K[]): void {
    this.activeKeys = [...keys];
  }

  restoreIndexForSubjects(
    beforeSubject?: number,
    afterSubject?: number
  ): number {
    const beforeIndex =
      beforeSubject === undefined
        ? -1
        : this.activeKeys.findIndex(
            (key) => this.subjectIdForKey(key) === beforeSubject
          );
    const afterIndex =
      afterSubject === undefined
        ? -1
        : this.activeKeys.findIndex(
            (key) => this.subjectIdForKey(key) === afterSubject
          );

    if (beforeIndex !== -1 && afterIndex !== -1 && beforeIndex < afterIndex) {
      return beforeIndex + 1;
    }
    if (afterIndex !== -1) {
      return afterIndex;
    }
    if (beforeIndex !== -1) {
      return beforeIndex + 1;
    }
    return this.activeKeys.length;
  }

  neighborSubjectsForKey(key: K): {
    beforeSubject?: number;
    afterSubject?: number;
  } {
    const index = this.activeIndexForKey(key);
    if (index === -1) {
      return {};
    }

    const beforeKey = index > 0 ? this.activeKeys[index - 1] : undefined;
    const afterKey =
      index < this.activeKeys.length - 1 ? this.activeKeys[index + 1] : undefined;

    return {
      beforeSubject:
        beforeKey === undefined ? undefined : this.subjectIdForKey(beforeKey),
      afterSubject:
        afterKey === undefined ? undefined : this.subjectIdForKey(afterKey),
    };
  }

  tombstonedSubjectsSnapshot(): readonly number[] {
    return [...this.subjectStates.entries()]
      .filter(([, subjectState]) => !subjectState.active)
      .map(([subjectId]) => subjectId)
      .sort((left, right) => left - right);
  }

  createSubject(subjectId: number, key: K): void {
    this.activateSubject(subjectId, key);
    this.subjectRevisions.set(subjectId, 0);
    this.appendActiveKey(key);
  }

  transferSubject(subjectId: number, from: K, to: K, restoreAllowed = true): void {
    const activeIndex = this.activeIndexForKey(from);
    this.subjectIds.delete(from);
    this.activateSubject(subjectId, to, restoreAllowed);
    if (activeIndex === -1) {
      this.appendActiveKey(to);
    } else {
      this.activeKeys.splice(activeIndex, 1, to);
    }
  }

  tombstoneSubject(subjectId: number, key: K, restoreAllowed: boolean): void {
    this.subjectIds.delete(key);
    this.removeActiveKey(key);
    this.subjectStates.set(subjectId, {
      active: false,
      restoreAllowed,
    });
  }

  restoreSubject(
    subjectId: number,
    key: K,
    beforeSubject?: number,
    afterSubject?: number,
    restoreAllowed = true
  ): void {
    const restoreIndex = this.restoreIndexForSubjects(beforeSubject, afterSubject);
    this.activateSubject(subjectId, key, restoreAllowed);
    this.insertActiveKeyAt(key, restoreIndex);
  }

  retireSubject(subjectId: number): void {
    this.subjectStates.set(subjectId, {
      active: false,
      restoreAllowed: false,
    });
  }

  clear(): void {
    this.subjectIds.clear();
    this.subjectStates.clear();
    this.subjectRevisions.clear();
    this.activeKeys = [];
    this.nextSubjectId = 1;
  }

  private activeIndexForKey(key: K): number {
    return this.activeKeys.indexOf(key);
  }

  private insertActiveKeyAt(key: K, index: number): void {
    const existingIndex = this.activeIndexForKey(key);
    if (existingIndex !== -1) {
      this.activeKeys.splice(existingIndex, 1);
    }

    const targetIndex = Math.max(0, Math.min(index, this.activeKeys.length));
    this.activeKeys.splice(targetIndex, 0, key);
  }

  private appendActiveKey(key: K): void {
    this.insertActiveKeyAt(key, this.activeKeys.length);
  }

  private removeActiveKey(key: K): void {
    const existingIndex = this.activeIndexForKey(key);
    if (existingIndex !== -1) {
      this.activeKeys.splice(existingIndex, 1);
    }
  }

  private activateSubject(subjectId: number, key: K, restoreAllowed = true): void {
    this.subjectIds.set(key, subjectId);
    this.subjectStates.set(subjectId, {
      active: true,
      key,
      restoreAllowed,
    });
  }
}
