import { linkedSignal, signal, type WritableSignal } from '@angular/core';

type StructuralKey = string | number;
type SubjectId = number;

type ScalarLeaf<T> = WritableSignal<T>;

type SubjectState<K extends StructuralKey> = {
  active: boolean;
  key?: K;
};

type Entry<K extends StructuralKey> = {
  key: K;
  subjectId: SubjectId;
  name: string;
};

export interface HeterogeneousPhysicalFrame<K extends StructuralKey> {
  setName(subjectId: SubjectId, value: string): void;
  updateName(subjectId: SubjectId, updater: (value: string) => string): void;
  remove(subjectId: SubjectId, fromKey: K): void;
  rekey(subjectId: SubjectId, fromKey: K, toKey: K): void;
  restore(subjectId: SubjectId, toKey: K): void;
  discard(): void;
  commit(): void;
}

export interface HeterogeneousPhysicalFramePrototype<K extends StructuralKey> {
  name(subjectId: SubjectId): ScalarLeaf<string>;
  isActive(subjectId: SubjectId): boolean;
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
  private readonly stagedStructural = new Map<SubjectId, SubjectState<K>>();

  constructor(
    private readonly baseRevision: number,
    private readonly currentRevision: () => number,
    private readonly allSubjectIds: readonly SubjectId[],
    private readonly resolveSlotIndex: (subjectId: SubjectId) => number | undefined,
    private readonly readScalarValue: (slotIndex: number) => string,
    private readonly readSubjectState: (subjectId: SubjectId) => SubjectState<K> | undefined,
    private readonly hasSubject: (subjectId: SubjectId) => boolean,
    private readonly commitPrepared: (prepared: {
      readonly scalar: ReadonlyMap<number, string>;
      readonly structural: ReadonlyMap<SubjectId, SubjectState<K>>;
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

  remove(subjectId: SubjectId, fromKey: K): void {
    this.assertOpen();
    const current = this.requireActiveState(subjectId, fromKey);
    this.stagedStructural.set(subjectId, {
      ...current,
      active: false,
      key: undefined,
    });
  }

  rekey(subjectId: SubjectId, fromKey: K, toKey: K): void {
    this.assertOpen();
    if (!this.hasSubject(subjectId)) {
      throw new Error(`Unknown subject ${String(subjectId)}.`);
    }

    this.requireActiveState(subjectId, fromKey);

    const occupyingSubject = this.findEffectiveSubjectForKey(toKey);
    if (occupyingSubject !== undefined && occupyingSubject !== subjectId) {
      throw new Error(`Key ${String(toKey)} is already occupied by subject ${String(occupyingSubject)}.`);
    }

    this.stagedStructural.set(subjectId, {
      active: true,
      key: toKey,
    });
  }

  restore(subjectId: SubjectId, toKey: K): void {
    this.assertOpen();
    if (!this.hasSubject(subjectId)) {
      throw new Error(`Unknown subject ${String(subjectId)}.`);
    }

    const current = this.readEffectiveState(subjectId);
    if (!current || current.active) {
      throw new Error(
        `Subject ${String(subjectId)} is not currently tombstoned.`
      );
    }

    const occupyingSubject = this.findEffectiveSubjectForKey(toKey);
    if (occupyingSubject !== undefined && occupyingSubject !== subjectId) {
      throw new Error(`Key ${String(toKey)} is already occupied by subject ${String(occupyingSubject)}.`);
    }

    this.stagedStructural.set(subjectId, {
      active: true,
      key: toKey,
    });
  }

  discard(): void {
    this.assertOpen();
    this.closed = true;
    this.stagedScalar.clear();
    this.stagedStructural.clear();
  }

  commit(): void {
    this.assertOpen();
    this.closed = true;

    if (this.currentRevision() !== this.baseRevision) {
      throw new Error('HeterogeneousPhysicalFrame base revision is stale.');
    }

    if (this.stagedScalar.size === 0 && this.stagedStructural.size === 0) {
      return;
    }

    this.commitPrepared({
      scalar: this.stagedScalar,
      structural: this.stagedStructural,
    });
  }

  private readEffectiveState(subjectId: SubjectId): SubjectState<K> | undefined {
    return this.stagedStructural.get(subjectId) ?? this.readSubjectState(subjectId);
  }

  private findEffectiveSubjectForKey(key: K): SubjectId | undefined {
    for (const [subjectId, state] of this.stagedStructural.entries()) {
      if (state.active && state.key === key) {
        return subjectId;
      }
    }

    for (const [subjectId, state] of this.stagedStructural.entries()) {
      const committed = this.readSubjectState(subjectId);
      if (committed?.active && committed.key === key && !state.active) {
        return undefined;
      }
    }

    for (const subjectId of this.allSubjectIds) {
      const staged = this.stagedStructural.get(subjectId);
      if (staged !== undefined) {
        continue;
      }

      const committed = this.readSubjectState(subjectId);
      if (committed?.active && committed.key === key) {
        return subjectId;
      }
    }

    return undefined;
  }

  private requireActiveState(subjectId: SubjectId, expectedKey: K): SubjectState<K> {
    const current = this.readEffectiveState(subjectId);
    if (!current?.active || current.key !== expectedKey) {
      throw new Error(
        `Subject ${String(subjectId)} is not currently bound to key ${String(expectedKey)}.`
      );
    }
    return current;
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
  const subjectStates = new Map<SubjectId, SubjectState<K>>();
  const orderedSubjects: SubjectId[] = [];

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
    if (subjectStates.has(entry.subjectId)) {
      throw new Error(`Duplicate subject ${String(entry.subjectId)}.`);
    }

    const slotIndex = scalarValues.length;
    scalarValues.push(entry.name);
    scalarTokens.push(signal(0));
    slotIndexBySubject.set(entry.subjectId, slotIndex);

    subjectByKey.set(entry.key, entry.subjectId);
    subjectStates.set(entry.subjectId, { active: true, key: entry.key });
    orderedSubjects.push(entry.subjectId);
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
    return orderedSubjects
      .map((subjectId) => subjectStates.get(subjectId))
      .filter((state): state is SubjectState<K> & { key: K } => Boolean(state?.active && state.key !== undefined))
      .map((state) => state.key) as readonly K[];
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
    isActive(subjectId: SubjectId): boolean {
      structuralToken();
      return subjectStates.get(subjectId)?.active ?? false;
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
      return subjectStates.get(subjectId)?.key;
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
        orderedSubjects,
        (subjectId) => slotIndexBySubject.get(subjectId),
        (slotIndex) => scalarValues[slotIndex],
        (subjectId) => subjectStates.get(subjectId),
        (subjectId) => slotIndexBySubject.has(subjectId),
        ({ scalar, structural }) => {
          const changedScalarSlots: number[] = [];
          let structuralChanged = false;

          for (const [slotIndex, nextValue] of scalar.entries()) {
            if (scalarValues[slotIndex] === nextValue) {
              continue;
            }
            scalarValues[slotIndex] = nextValue;
            changedScalarSlots.push(slotIndex);
          }

          for (const [subjectId, nextState] of structural.entries()) {
            const currentState = subjectStates.get(subjectId);
            if (!currentState) {
              throw new Error(`Unknown subject ${String(subjectId)} at commit.`);
            }

            if (
              currentState.active === nextState.active &&
              currentState.key === nextState.key
            ) {
              continue;
            }

            if (currentState.active && currentState.key !== undefined) {
              const currentOwner = subjectByKey.get(currentState.key);
              if (currentOwner !== subjectId) {
                throw new Error(
                  `Subject ${String(subjectId)} drifted before commit: expected ${String(currentState.key)}, got ${String(currentOwner)}.`
                );
              }
            }

            if (nextState.active && nextState.key !== undefined) {
              const occupyingSubject = subjectByKey.get(nextState.key);
              if (occupyingSubject !== undefined && occupyingSubject !== subjectId) {
                throw new Error(
                  `Key ${String(nextState.key)} became occupied by subject ${String(occupyingSubject)} before commit.`
                );
              }
            }

            if (currentState.active && currentState.key !== undefined) {
              subjectByKey.delete(currentState.key);
            }

            subjectStates.set(subjectId, {
              active: nextState.active,
              key: nextState.key,
            });

            if (nextState.active && nextState.key !== undefined) {
              subjectByKey.set(nextState.key, subjectId);
            }

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
