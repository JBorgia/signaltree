import { linkedSignal, signal, type WritableSignal } from '@angular/core';

type StructuralKey = string | number;
type SubjectId = number;

type ScalarLeaf<T> = WritableSignal<T>;

type Entry<K extends StructuralKey> = {
  key: K;
  subjectId: SubjectId;
  name: string;
};

export interface HeterogeneousPhysicalFrame<K extends StructuralKey> {
  setName(subjectId: SubjectId, value: string): void;
  updateName(subjectId: SubjectId, updater: (value: string) => string): void;
  rekey(subjectId: SubjectId, fromKey: K, toKey: K): void;
  discard(): void;
  commit(): void;
}

export interface HeterogeneousPhysicalFramePrototype<K extends StructuralKey> {
  name(subjectId: SubjectId): ScalarLeaf<string>;
  slotIndexForSubject(subjectId: SubjectId): number | undefined;
  hasKey(key: K): boolean;
  subjectForKey(key: K): SubjectId | undefined;
  keyForSubject(subjectId: SubjectId): K | undefined;
  orderedKeys(): readonly K[];
  revision(): number;
  beginFrame(): HeterogeneousPhysicalFrame<K>;
  rekeyNow(subjectId: SubjectId, fromKey: K, toKey: K): void;
}

class HeterogeneousPhysicalFrameImpl<K extends StructuralKey>
  implements HeterogeneousPhysicalFrame<K>
{
  private closed = false;
  private readonly stagedScalar = new Map<number, string>();
  private readonly stagedRekeys = new Map<SubjectId, { fromKey: K; toKey: K }>();

  constructor(
    private readonly baseRevision: number,
    private readonly currentRevision: () => number,
    private readonly resolveSlotIndex: (subjectId: SubjectId) => number | undefined,
    private readonly readScalarValue: (slotIndex: number) => string,
    private readonly keyForSubject: (subjectId: SubjectId) => K | undefined,
    private readonly subjectForKey: (key: K) => SubjectId | undefined,
    private readonly hasSubject: (subjectId: SubjectId) => boolean,
    private readonly commitPrepared: (prepared: {
      readonly scalar: ReadonlyMap<number, string>;
      readonly rekeys: ReadonlyMap<SubjectId, { fromKey: K; toKey: K }>;
    }) => void
  ) {}

  setName(subjectId: SubjectId, value: string): void {
    this.assertOpen();
    const slotIndex = this.requireSlotIndex(subjectId);
    this.stagedScalar.set(slotIndex, value);
  }

  updateName(subjectId: SubjectId, updater: (value: string) => string): void {
    this.assertOpen();
    const slotIndex = this.requireSlotIndex(subjectId);
    const current = this.stagedScalar.has(slotIndex)
      ? this.stagedScalar.get(slotIndex)
      : this.readScalarValue(slotIndex);
    this.stagedScalar.set(slotIndex, updater(current ?? ''));
  }

  rekey(subjectId: SubjectId, fromKey: K, toKey: K): void {
    this.assertOpen();
    if (!this.hasSubject(subjectId)) {
      throw new Error(`Unknown subject ${String(subjectId)}.`);
    }

    const currentKey = this.stagedRekeys.get(subjectId)?.toKey ?? this.keyForSubject(subjectId);
    if (currentKey !== fromKey) {
      throw new Error(
        `Subject ${String(subjectId)} is not currently bound to key ${String(fromKey)}.`
      );
    }

    const occupyingSubject = this.subjectForKey(toKey);
    if (occupyingSubject !== undefined && occupyingSubject !== subjectId) {
      throw new Error(`Key ${String(toKey)} is already occupied by subject ${String(occupyingSubject)}.`);
    }

    for (const [candidateSubjectId, candidate] of this.stagedRekeys.entries()) {
      if (candidateSubjectId !== subjectId && candidate.toKey === toKey) {
        throw new Error(`Key ${String(toKey)} is already staged for another subject.`);
      }
    }

    const existing = this.stagedRekeys.get(subjectId);
    this.stagedRekeys.set(subjectId, {
      fromKey: existing?.fromKey ?? fromKey,
      toKey,
    });
  }

  discard(): void {
    this.assertOpen();
    this.closed = true;
    this.stagedScalar.clear();
    this.stagedRekeys.clear();
  }

  commit(): void {
    this.assertOpen();
    this.closed = true;

    if (this.currentRevision() !== this.baseRevision) {
      throw new Error('HeterogeneousPhysicalFrame base revision is stale.');
    }

    if (this.stagedScalar.size === 0 && this.stagedRekeys.size === 0) {
      return;
    }

    this.commitPrepared({
      scalar: this.stagedScalar,
      rekeys: this.stagedRekeys,
    });
  }

  private requireSlotIndex(subjectId: SubjectId): number {
    const slotIndex = this.resolveSlotIndex(subjectId);
    if (slotIndex === undefined) {
      throw new Error(`Missing scalar slot for subject ${String(subjectId)}.`);
    }
    return slotIndex;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('HeterogeneousPhysicalFrame is already closed.');
    }
  }
}

export function createHeterogeneousPhysicalFramePrototype<K extends StructuralKey>(
  entries: ReadonlyArray<Entry<K>>
): HeterogeneousPhysicalFramePrototype<K> {
  const subjectByKey = new Map<K, SubjectId>();
  const keyBySubject = new Map<SubjectId, K>();
  const orderedKeys: K[] = [];

  const scalarValues: string[] = [];
  const scalarTokens: Array<WritableSignal<number>> = [];
  const scalarLeaves = new Map<SubjectId, ScalarLeaf<string>>();
  const slotIndexBySubject = new Map<SubjectId, number>();

  const structuralToken = signal(0);
  let revision = 0;

  for (const entry of entries) {
    if (subjectByKey.has(entry.key)) {
      throw new Error(`Duplicate key ${String(entry.key)}.`);
    }
    if (keyBySubject.has(entry.subjectId)) {
      throw new Error(`Duplicate subject ${String(entry.subjectId)}.`);
    }

    const slotIndex = scalarValues.length;
    scalarValues.push(entry.name);
    scalarTokens.push(signal(0));
    slotIndexBySubject.set(entry.subjectId, slotIndex);

    subjectByKey.set(entry.key, entry.subjectId);
    keyBySubject.set(entry.subjectId, entry.key);
    orderedKeys.push(entry.key);
  }

  const publishScalarSlot = (slotIndex: number): void => {
    scalarTokens[slotIndex].update((value) => value + 1);
  };

  const createLeaf = (subjectId: SubjectId, slotIndex: number): ScalarLeaf<string> => {
    const leaf = linkedSignal(() => {
      scalarTokens[slotIndex]();
      return scalarValues[slotIndex];
    }) as ScalarLeaf<string>;

    leaf.set = (value: string) => {
      const frame = api.beginFrame();
      frame.setName(subjectId, value);
      frame.commit();
    };

    leaf.update = (updater: (value: string) => string) => {
      const frame = api.beginFrame();
      frame.updateName(subjectId, updater);
      frame.commit();
    };

    return leaf;
  };

  const orderedKeysSignal = linkedSignal(() => {
    structuralToken();
    return [...orderedKeys] as readonly K[];
  });

  const api: HeterogeneousPhysicalFramePrototype<K> = {
    name(subjectId: SubjectId): ScalarLeaf<string> {
      const cached = scalarLeaves.get(subjectId);
      if (cached) {
        return cached;
      }

      const slotIndex = slotIndexBySubject.get(subjectId);
      if (slotIndex === undefined) {
        throw new Error(`Unknown subject ${String(subjectId)}.`);
      }

      const leaf = createLeaf(subjectId, slotIndex);
      scalarLeaves.set(subjectId, leaf);
      return leaf;
    },
    slotIndexForSubject(subjectId: SubjectId): number | undefined {
      return slotIndexBySubject.get(subjectId);
    },
    hasKey(key: K): boolean {
      structuralToken();
      return subjectByKey.has(key);
    },
    subjectForKey(key: K): SubjectId | undefined {
      structuralToken();
      return subjectByKey.get(key);
    },
    keyForSubject(subjectId: SubjectId): K | undefined {
      structuralToken();
      return keyBySubject.get(subjectId);
    },
    orderedKeys(): readonly K[] {
      return orderedKeysSignal();
    },
    revision(): number {
      return revision;
    },
    beginFrame(): HeterogeneousPhysicalFrame<K> {
      return new HeterogeneousPhysicalFrameImpl(
        revision,
        () => revision,
        (subjectId) => slotIndexBySubject.get(subjectId),
        (slotIndex) => scalarValues[slotIndex],
        (subjectId) => keyBySubject.get(subjectId),
        (key) => subjectByKey.get(key),
        (subjectId) => slotIndexBySubject.has(subjectId),
        ({ scalar, rekeys }) => {
          const changedScalarSlots: number[] = [];
          let structuralChanged = false;

          for (const [slotIndex, nextValue] of scalar.entries()) {
            if (scalarValues[slotIndex] === nextValue) {
              continue;
            }
            scalarValues[slotIndex] = nextValue;
            changedScalarSlots.push(slotIndex);
          }

          for (const [subjectId, { fromKey, toKey }] of rekeys.entries()) {
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
            structuralChanged = true;
          }

          if (changedScalarSlots.length === 0 && !structuralChanged) {
            return;
          }

          revision += 1;

          for (const slotIndex of changedScalarSlots) {
            publishScalarSlot(slotIndex);
          }

          if (structuralChanged) {
            structuralToken.update((value) => value + 1);
          }
        }
      );
    },
    rekeyNow(subjectId: SubjectId, fromKey: K, toKey: K): void {
      const frame = api.beginFrame();
      frame.rekey(subjectId, fromKey, toKey);
      frame.commit();
    },
  };

  return api;
}
