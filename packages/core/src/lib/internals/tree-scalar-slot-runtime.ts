import type { PositionId } from '../types';
import type { PhysicalCommitClock } from './physical-commit-clock';

import {
  PRODUCTION_SUBSTRATE_STATS_ENABLED,
  recordProductionSubstrateStat,
} from './production-substrate-stats';

type SlotIndex = number;
type SlotEqualityFn = (current: unknown, next: unknown) => boolean;

export interface ScalarSlotCommitResult {
  readonly revision: number;
  readonly changedSlots: readonly SlotIndex[];
}

export type SingleSlotCommitResult =
  | {
      readonly revision: number;
      readonly changed: false;
    }
  | {
      readonly revision: number;
      readonly changed: true;
      readonly slot: SlotIndex;
    };

export interface ScalarSlotMutationFrame {
  set(slotIndex: SlotIndex, value: unknown): void;
  update(slotIndex: SlotIndex, updater: (value: unknown) => unknown): void;
  discard(): void;
  commit(options?: { advanceRevision?: boolean }): ScalarSlotCommitResult;
}

export interface TreeScalarSlotRuntime {
  createSlot<T>(
    initialValue: T,
    equal: (current: T, next: T) => boolean,
    positionId?: PositionId
  ): SlotIndex;
  readSlot<T>(slotIndex: SlotIndex): T;
  commitSlot<T>(slotIndex: SlotIndex, value: T): SingleSlotCommitResult;
  updateSlot<T>(
    slotIndex: SlotIndex,
    updater: (value: T) => T
  ): SingleSlotCommitResult;
  beginFrame(): ScalarSlotMutationFrame;
  resolveScalarSlot(positionId: PositionId): SlotIndex | undefined;
  revision(): number;
  slotCount(): number;
}

class ScalarSlotMutationFrameImpl implements ScalarSlotMutationFrame {
  private readonly staged = new Map<SlotIndex, unknown>();
  private closed = false;

  constructor(
    private readonly baseRevision: number,
    private readonly getCommittedRevision: () => number,
    private readonly readValue: (slotIndex: SlotIndex) => unknown,
    private readonly commitValues: (
      staged: ReadonlyMap<SlotIndex, unknown>,
      options?: { advanceRevision?: boolean }
    ) => ScalarSlotCommitResult,
    private readonly assertSlotIndex: (slotIndex: SlotIndex) => void
  ) {}

  set(slotIndex: SlotIndex, value: unknown): void {
    this.assertOpen();
    this.assertSlotIndex(slotIndex);
    this.staged.set(slotIndex, value);
  }

  update(slotIndex: SlotIndex, updater: (value: unknown) => unknown): void {
    this.assertOpen();
    this.assertSlotIndex(slotIndex);
    const current = this.staged.has(slotIndex)
      ? this.staged.get(slotIndex)
      : this.readValue(slotIndex);
    this.staged.set(slotIndex, updater(current));
  }

  discard(): void {
    this.assertOpen();
    this.closed = true;
    this.staged.clear();
  }

  commit(options?: { advanceRevision?: boolean }): ScalarSlotCommitResult {
    this.assertOpen();
    this.closed = true;

    if (this.getCommittedRevision() !== this.baseRevision) {
      throw new Error('ScalarSlotMutationFrame base revision is stale.');
    }

    if (this.staged.size > 0) {
      return this.commitValues(this.staged, options);
    }

    return {
      revision: this.getCommittedRevision(),
      changedSlots: [],
    };
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('ScalarSlotMutationFrame is already closed.');
    }
  }
}

export function createTreeScalarSlotRuntime(
  physicalCommitClock?: PhysicalCommitClock
): TreeScalarSlotRuntime {
  const values: unknown[] = [];
  const equalities: SlotEqualityFn[] = [];
  const slotByPositionId = new Map<PositionId, SlotIndex>();
  let revision = 0;

  const getCommittedRevision = (): number =>
    physicalCommitClock?.revision() ?? revision;

  const advanceRevision = (): number => {
    const nextRevision = physicalCommitClock?.advance();
    if (nextRevision !== undefined) {
      return nextRevision;
    }

    revision += 1;
    return revision;
  };

  const assertSlotIndex = (slotIndex: SlotIndex): void => {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= values.length) {
      throw new Error(`Scalar slot index ${slotIndex} is out of bounds.`);
    }
  };

  const commitSlots = (
    staged: ReadonlyMap<SlotIndex, unknown>,
    options?: { advanceRevision?: boolean }
  ): ScalarSlotCommitResult => {
    const changed: Array<{ slotIndex: SlotIndex; nextValue: unknown }> = [];

    for (const [slotIndex, nextValue] of staged) {
      assertSlotIndex(slotIndex);
      if (PRODUCTION_SUBSTRATE_STATS_ENABLED) {
        recordProductionSubstrateStat('equalityChecks');
      }
      if (equalities[slotIndex](values[slotIndex], nextValue)) {
        continue;
      }

      changed.push({ slotIndex, nextValue });
    }

    if (changed.length === 0) {
      return {
        revision: getCommittedRevision(),
        changedSlots: [],
      };
    }

    for (const { slotIndex, nextValue } of changed) {
      values[slotIndex] = nextValue;
    }
    if (PRODUCTION_SUBSTRATE_STATS_ENABLED) {
      recordProductionSubstrateStat('slotWrites', changed.length);
    }

    const nextRevision =
      options?.advanceRevision === false
        ? getCommittedRevision()
        : advanceRevision();
    if (
      options?.advanceRevision !== false &&
      PRODUCTION_SUBSTRATE_STATS_ENABLED
    ) {
      recordProductionSubstrateStat('revisionIncrements');
    }

    return {
      revision: nextRevision,
      changedSlots: changed.map(({ slotIndex }) => slotIndex),
    };
  };

  const commitSlot = <T>(
    slotIndex: SlotIndex,
    nextValue: T,
    options?: { advanceRevision?: boolean }
  ): SingleSlotCommitResult => {
    assertSlotIndex(slotIndex);
    if (PRODUCTION_SUBSTRATE_STATS_ENABLED) {
      recordProductionSubstrateStat('equalityChecks');
    }

    if (equalities[slotIndex](values[slotIndex], nextValue)) {
      return {
        revision: getCommittedRevision(),
        changed: false,
      };
    }

    values[slotIndex] = nextValue;
    if (PRODUCTION_SUBSTRATE_STATS_ENABLED) {
      recordProductionSubstrateStat('slotWrites');
    }
    const nextRevision =
      options?.advanceRevision === false
        ? getCommittedRevision()
        : advanceRevision();
    if (
      options?.advanceRevision !== false &&
      PRODUCTION_SUBSTRATE_STATS_ENABLED
    ) {
      recordProductionSubstrateStat('revisionIncrements');
    }

    return {
      revision: nextRevision,
      changed: true,
      slot: slotIndex,
    };
  };

  return {
    createSlot<T>(
      initialValue: T,
      equal: (current: T, next: T) => boolean,
      positionId?: PositionId
    ): SlotIndex {
      const slotIndex = values.length;
      values.push(initialValue);
      equalities.push(equal as SlotEqualityFn);

      if (positionId !== undefined) {
        slotByPositionId.set(positionId, slotIndex);
      }

      return slotIndex;
    },
    readSlot<T>(slotIndex: SlotIndex): T {
      assertSlotIndex(slotIndex);
      if (PRODUCTION_SUBSTRATE_STATS_ENABLED) {
        recordProductionSubstrateStat('slotReads');
      }
      return values[slotIndex] as T;
    },
    commitSlot<T>(slotIndex: SlotIndex, value: T): SingleSlotCommitResult {
      return commitSlot(slotIndex, value);
    },
    updateSlot<T>(
      slotIndex: SlotIndex,
      updater: (value: T) => T
    ): SingleSlotCommitResult {
      assertSlotIndex(slotIndex);
      return commitSlot(slotIndex, updater(values[slotIndex] as T));
    },
    beginFrame(): ScalarSlotMutationFrame {
      return new ScalarSlotMutationFrameImpl(
        getCommittedRevision(),
        getCommittedRevision,
        (slotIndex) => values[slotIndex],
        commitSlots,
        assertSlotIndex
      );
    },
    resolveScalarSlot(positionId: PositionId): SlotIndex | undefined {
      if (PRODUCTION_SUBSTRATE_STATS_ENABLED) {
        recordProductionSubstrateStat('positionResolutions');
      }
      return slotByPositionId.get(positionId);
    },
    revision(): number {
      return getCommittedRevision();
    },
    slotCount(): number {
      return values.length;
    },
  };
}
