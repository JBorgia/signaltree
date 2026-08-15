import type { PositionId } from '../types';

type SlotIndex = number;
type SlotEqualityFn = (current: unknown, next: unknown) => boolean;

export interface ScalarSlotCommitResult {
  readonly revision: number;
  readonly changedSlots: readonly SlotIndex[];
}

export interface ScalarSlotMutationFrame {
  set(slotIndex: SlotIndex, value: unknown): void;
  update(slotIndex: SlotIndex, updater: (value: unknown) => unknown): void;
  discard(): void;
  commit(): ScalarSlotCommitResult;
}

export interface TreeScalarSlotRuntime {
  createSlot<T>(
    initialValue: T,
    equal: (current: T, next: T) => boolean,
    positionId?: PositionId
  ): SlotIndex;
  readSlot<T>(slotIndex: SlotIndex): T;
  writeSlot<T>(slotIndex: SlotIndex, value: T): ScalarSlotCommitResult;
  updateSlot<T>(
    slotIndex: SlotIndex,
    updater: (value: T) => T
  ): ScalarSlotCommitResult;
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
      staged: ReadonlyMap<SlotIndex, unknown>
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

  commit(): ScalarSlotCommitResult {
    this.assertOpen();
    this.closed = true;

    if (this.getCommittedRevision() !== this.baseRevision) {
      throw new Error('ScalarSlotMutationFrame base revision is stale.');
    }

    if (this.staged.size > 0) {
      return this.commitValues(this.staged);
    }

    return {
      revision: this.baseRevision,
      changedSlots: [],
    };
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('ScalarSlotMutationFrame is already closed.');
    }
  }
}

export function createTreeScalarSlotRuntime(): TreeScalarSlotRuntime {
  const values: unknown[] = [];
  const equalities: SlotEqualityFn[] = [];
  const slotByPositionId = new Map<PositionId, SlotIndex>();
  let revision = 0;

  const assertSlotIndex = (slotIndex: SlotIndex): void => {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= values.length) {
      throw new Error(`Scalar slot index ${slotIndex} is out of bounds.`);
    }
  };

  const commitSlots = (
    staged: ReadonlyMap<SlotIndex, unknown>
  ): ScalarSlotCommitResult => {
    const changed: Array<{ slotIndex: SlotIndex; nextValue: unknown }> = [];

    for (const [slotIndex, nextValue] of staged) {
      assertSlotIndex(slotIndex);
      if (equalities[slotIndex](values[slotIndex], nextValue)) {
        continue;
      }

      changed.push({ slotIndex, nextValue });
    }

    if (changed.length === 0) {
      return {
        revision,
        changedSlots: [],
      };
    }

    for (const { slotIndex, nextValue } of changed) {
      values[slotIndex] = nextValue;
    }

    revision += 1;

    return {
      revision,
      changedSlots: changed.map(({ slotIndex }) => slotIndex),
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
      return values[slotIndex] as T;
    },
    writeSlot<T>(slotIndex: SlotIndex, value: T): ScalarSlotCommitResult {
      assertSlotIndex(slotIndex);
      return commitSlots(new Map([[slotIndex, value]]));
    },
    updateSlot<T>(
      slotIndex: SlotIndex,
      updater: (value: T) => T
    ): ScalarSlotCommitResult {
      assertSlotIndex(slotIndex);
      return commitSlots(
        new Map([[slotIndex, updater(values[slotIndex] as T)]])
      );
    },
    beginFrame(): ScalarSlotMutationFrame {
      return new ScalarSlotMutationFrameImpl(
        revision,
        () => revision,
        (slotIndex) => values[slotIndex],
        commitSlots,
        assertSlotIndex
      );
    },
    resolveScalarSlot(positionId: PositionId): SlotIndex | undefined {
      return slotByPositionId.get(positionId);
    },
    revision(): number {
      return revision;
    },
    slotCount(): number {
      return values.length;
    },
  };
}
