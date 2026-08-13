import { linkedSignal, signal } from '@angular/core';

type StructuralKey = string | number;
type SubjectId = number;

export interface RekeyTableFrame<K extends StructuralKey> {
  rekey(subjectId: SubjectId, fromKey: K, toKey: K): void;
  discard(): void;
  commit(): void;
}

export interface RekeyTablePrototype<K extends StructuralKey> {
  hasKey(key: K): boolean;
  subjectForKey(key: K): SubjectId | undefined;
  keyForSubject(subjectId: SubjectId): K | undefined;
  orderedKeys(): readonly K[];
  revision(): number;
  publicationCount(): number;
  beginFrame(): RekeyTableFrame<K>;
}

class RekeyTableFrameImpl<K extends StructuralKey> implements RekeyTableFrame<K> {
  private closed = false;
  private readonly staged = new Map<SubjectId, { fromKey: K; toKey: K }>();

  constructor(
    private readonly baseRevision: number,
    private readonly currentRevision: () => number,
    private readonly hasSubject: (subjectId: SubjectId) => boolean,
    private readonly keyForSubject: (subjectId: SubjectId) => K | undefined,
    private readonly subjectForKey: (key: K) => SubjectId | undefined,
    private readonly apply: (
      staged: ReadonlyMap<SubjectId, { fromKey: K; toKey: K }>
    ) => void
  ) {}

  rekey(subjectId: SubjectId, fromKey: K, toKey: K): void {
    this.assertOpen();
    if (!this.hasSubject(subjectId)) {
      throw new Error(`Unknown subject ${String(subjectId)}.`);
    }

    const currentKey = this.staged.get(subjectId)?.toKey ?? this.keyForSubject(subjectId);
    if (currentKey !== fromKey) {
      throw new Error(
        `Subject ${String(subjectId)} is not currently bound to key ${String(fromKey)}.`
      );
    }

    const occupyingSubject = this.subjectForKey(toKey);
    if (occupyingSubject !== undefined && occupyingSubject !== subjectId) {
      throw new Error(`Key ${String(toKey)} is already occupied by subject ${String(occupyingSubject)}.`);
    }

    for (const [candidateSubjectId, candidate] of this.staged.entries()) {
      if (candidateSubjectId !== subjectId && candidate.toKey === toKey) {
        throw new Error(`Key ${String(toKey)} is already staged for another subject.`);
      }
    }

    this.staged.set(subjectId, { fromKey, toKey });
  }

  discard(): void {
    this.assertOpen();
    this.closed = true;
    this.staged.clear();
  }

  commit(): void {
    this.assertOpen();
    this.closed = true;

    if (this.currentRevision() !== this.baseRevision) {
      throw new Error('RekeyTableFrame base revision is stale.');
    }

    if (this.staged.size > 0) {
      this.apply(this.staged);
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('RekeyTableFrame is already closed.');
    }
  }
}

export function createRekeyTablePrototype<K extends StructuralKey>(
  entries: ReadonlyArray<readonly [K, SubjectId]>
): RekeyTablePrototype<K> {
  const subjectByKey = new Map<K, SubjectId>();
  const keyBySubject = new Map<SubjectId, K>();
  const orderedKeys: K[] = [];
  const publicationToken = signal(0);
  let revision = 0;
  let publications = 0;

  for (const [key, subjectId] of entries) {
    if (subjectByKey.has(key)) {
      throw new Error(`Duplicate key ${String(key)}.`);
    }
    if (keyBySubject.has(subjectId)) {
      throw new Error(`Duplicate subject ${String(subjectId)}.`);
    }

    subjectByKey.set(key, subjectId);
    keyBySubject.set(subjectId, key);
    orderedKeys.push(key);
  }

  const orderedKeysSignal = linkedSignal(() => {
    publicationToken();
    return [...orderedKeys] as readonly K[];
  });

  const commit = (staged: ReadonlyMap<SubjectId, { fromKey: K; toKey: K }>): void => {
    let changed = false;

    for (const [subjectId, { fromKey, toKey }] of staged) {
      const currentKey = keyBySubject.get(subjectId);
      if (currentKey !== fromKey) {
        throw new Error(
          `Subject ${String(subjectId)} drifted before commit: expected ${String(fromKey)}, got ${String(currentKey)}.`
        );
      }

      const occupyingSubject = subjectByKey.get(toKey);
      if (occupyingSubject !== undefined && occupyingSubject !== subjectId) {
        throw new Error(
          `Key ${String(toKey)} became occupied by subject ${String(occupyingSubject)} before commit.`
        );
      }

      if (fromKey === toKey) {
        continue;
      }

      subjectByKey.delete(fromKey);
      subjectByKey.set(toKey, subjectId);
      keyBySubject.set(subjectId, toKey);

      const orderIndex = orderedKeys.indexOf(fromKey);
      if (orderIndex === -1) {
        throw new Error(`Ordered key ${String(fromKey)} is missing.`);
      }

      orderedKeys[orderIndex] = toKey;
      changed = true;
    }

    if (!changed) {
      return;
    }

    revision += 1;
    publications += 1;
    publicationToken.update((value) => value + 1);
  };

  return {
    hasKey(key: K): boolean {
      publicationToken();
      return subjectByKey.has(key);
    },
    subjectForKey(key: K): SubjectId | undefined {
      publicationToken();
      return subjectByKey.get(key);
    },
    keyForSubject(subjectId: SubjectId): K | undefined {
      publicationToken();
      return keyBySubject.get(subjectId);
    },
    orderedKeys(): readonly K[] {
      return orderedKeysSignal();
    },
    revision(): number {
      return revision;
    },
    publicationCount(): number {
      return publications;
    },
    beginFrame(): RekeyTableFrame<K> {
      return new RekeyTableFrameImpl(
        revision,
        () => revision,
        (subjectId) => keyBySubject.has(subjectId),
        (subjectId) => keyBySubject.get(subjectId),
        (key) => subjectByKey.get(key),
        commit
      );
    },
  };
}
