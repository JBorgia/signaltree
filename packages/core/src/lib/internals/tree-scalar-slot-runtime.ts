import { linkedSignal, signal, type WritableSignal } from '@angular/core';

import type { PositionId } from '../types';
import { isTraversableNode } from '../utils';

const TREE_SCALAR_SLOT_RUNTIME = Symbol.for('SignalTree:ScalarSlotRuntime');

type SlotIndex = number;
type SlotEqualityFn = (current: unknown, next: unknown) => boolean;

export interface ScalarSlotMutationFrame {
  set(slotIndex: SlotIndex, value: unknown): void;
  update(slotIndex: SlotIndex, updater: (value: unknown) => unknown): void;
  discard(): void;
  commit(): void;
}

export interface TreeScalarSlotRuntime {
  createLeaf<T>(
    initialValue: T,
    equal: (current: T, next: T) => boolean,
    positionId?: PositionId
  ): WritableSignal<T>;
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
    private readonly commitValues: (staged: ReadonlyMap<SlotIndex, unknown>) => void,
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

  commit(): void {
    this.assertOpen();
    this.closed = true;

    if (this.getCommittedRevision() !== this.baseRevision) {
      throw new Error('ScalarSlotMutationFrame base revision is stale.');
    }

    if (this.staged.size > 0) {
      this.commitValues(this.staged);
    }
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
  const tokens: WritableSignal<number>[] = [];
  const slotByPositionId = new Map<PositionId, SlotIndex>();
  let revision = 0;

  const assertSlotIndex = (slotIndex: SlotIndex): void => {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= values.length) {
      throw new Error(`Scalar slot index ${slotIndex} is out of bounds.`);
    }
  };

  const commitSlots = (staged: ReadonlyMap<SlotIndex, unknown>): void => {
    const changed: SlotIndex[] = [];

    for (const [slotIndex, nextValue] of staged) {
      assertSlotIndex(slotIndex);
      if (equalities[slotIndex](values[slotIndex], nextValue)) {
        continue;
      }

      values[slotIndex] = nextValue;
      changed.push(slotIndex);
    }

    if (changed.length === 0) {
      return;
    }

    revision += 1;

    for (const slotIndex of changed) {
      tokens[slotIndex].update((value) => value + 1);
    }
  };

  return {
    createLeaf<T>(
      initialValue: T,
      equal: (current: T, next: T) => boolean,
      positionId?: PositionId
    ): WritableSignal<T> {
      const slotIndex = values.length;
      values.push(initialValue);
      equalities.push(equal as SlotEqualityFn);
      const token = signal(0);
      tokens.push(token);

      if (positionId !== undefined) {
        slotByPositionId.set(positionId, slotIndex);
      }

      const leaf = linkedSignal(() => {
        token();
        return values[slotIndex] as T;
      }) as WritableSignal<T>;

      leaf.set = (value: T) => {
        commitSlots(new Map([[slotIndex, value]]));
      };

      leaf.update = (updater: (value: T) => T) => {
        commitSlots(new Map([[slotIndex, updater(values[slotIndex] as T)]]));
      };

      return leaf;
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

export function defineTreeScalarSlotRuntime(
  node: object,
  runtime: TreeScalarSlotRuntime
): void {
  Object.defineProperty(node, TREE_SCALAR_SLOT_RUNTIME, {
    value: runtime,
    enumerable: false,
    configurable: true,
  });
}

export function getTreeScalarSlotRuntime(
  node: unknown
): TreeScalarSlotRuntime | undefined {
  if (!isTraversableNode(node)) {
    return undefined;
  }

  return (node as Record<symbol, TreeScalarSlotRuntime | undefined>)[
    TREE_SCALAR_SLOT_RUNTIME
  ];
}