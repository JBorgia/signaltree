import { linkedSignal, signal, type WritableSignal } from '@angular/core';

import type { PositionId } from '../types';
import { isTraversableNode } from '../utils';

import {
  createTreeScalarSlotRuntime as createTreeScalarSlotKernel,
  type ScalarSlotCommitResult,
  type SingleSlotCommitResult,
  type ScalarSlotMutationFrame as ScalarSlotKernelMutationFrame,
  type TreeScalarSlotRuntime as TreeScalarSlotKernel,
} from './tree-scalar-slot-runtime';

const TREE_SCALAR_SLOT_RUNTIME = Symbol.for('SignalTree:ScalarSlotRuntime');

type SlotIndex = number;

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

class AngularScalarSlotPublicationAdapter {
  private readonly tokens: WritableSignal<number>[] = [];

  observe(slotIndex: SlotIndex): void {
    this.getToken(slotIndex)();
  }

  publish(result: ScalarSlotCommitResult): void {
    for (const slotIndex of result.changedSlots) {
      this.getToken(slotIndex).update((value) => value + 1);
    }
  }

  publishSlot(result: SingleSlotCommitResult): void {
    if (!result.changed) {
      return;
    }

    this.getToken(result.slot).update((value) => value + 1);
  }

  private getToken(slotIndex: SlotIndex): WritableSignal<number> {
    const existing = this.tokens[slotIndex];
    if (existing) {
      return existing;
    }

    const token = signal(0);
    this.tokens[slotIndex] = token;
    return token;
  }
}

class AngularScalarSlotMutationFrame implements ScalarSlotMutationFrame {
  constructor(
    private readonly frame: ScalarSlotKernelMutationFrame,
    private readonly publication: AngularScalarSlotPublicationAdapter
  ) {}

  set(slotIndex: SlotIndex, value: unknown): void {
    this.frame.set(slotIndex, value);
  }

  update(slotIndex: SlotIndex, updater: (value: unknown) => unknown): void {
    this.frame.update(slotIndex, updater);
  }

  discard(): void {
    this.frame.discard();
  }

  commit(): void {
    const result = this.frame.commit();
    this.publication.publish(result);
  }
}

function createAngularLeaf<T>(
  kernel: TreeScalarSlotKernel,
  publication: AngularScalarSlotPublicationAdapter,
  slotIndex: SlotIndex
): WritableSignal<T> {
  const leaf = linkedSignal(() => {
    publication.observe(slotIndex);
    return kernel.readSlot<T>(slotIndex);
  }) as WritableSignal<T>;

  leaf.set = (value: T) => {
    publication.publishSlot(kernel.commitSlot(slotIndex, value));
  };

  leaf.update = (updater: (value: T) => T) => {
    publication.publishSlot(kernel.updateSlot(slotIndex, updater));
  };

  return leaf;
}

export function createTreeScalarSlotRuntime(): TreeScalarSlotRuntime {
  const kernel = createTreeScalarSlotKernel();
  const publication = new AngularScalarSlotPublicationAdapter();

  return {
    createLeaf<T>(
      initialValue: T,
      equal: (current: T, next: T) => boolean,
      positionId?: PositionId
    ): WritableSignal<T> {
      const slotIndex = kernel.createSlot(initialValue, equal, positionId);
      return createAngularLeaf(kernel, publication, slotIndex);
    },
    beginFrame(): ScalarSlotMutationFrame {
      return new AngularScalarSlotMutationFrame(kernel.beginFrame(), publication);
    },
    resolveScalarSlot(positionId: PositionId): SlotIndex | undefined {
      return kernel.resolveScalarSlot(positionId);
    },
    revision(): number {
      return kernel.revision();
    },
    slotCount(): number {
      return kernel.slotCount();
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
