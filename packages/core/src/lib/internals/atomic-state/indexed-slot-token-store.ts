import { signal, type Signal, type WritableSignal } from '@angular/core';

export interface SlotTokenLeaf<T> {
  (): T;
  set(value: T): void;
  update(updater: (value: T) => T): void;
  asReadonly(): Signal<T>;
}

export class StaleSlotTokenFrameError extends Error {
  constructor() {
    super('SlotTokenFrame base revision is stale.');
    this.name = 'StaleSlotTokenFrameError';
  }
}

export interface IndexedSlotTokenFrame {
  set<T>(slotIndex: number, value: T): void;
  update<T>(slotIndex: number, updater: (value: T) => T): void;
  discard(): void;
  commit(): void;
}

export interface IndexedSlotTokenStore {
  leaf<T>(slotIndex: number): SlotTokenLeaf<T>;
  read<T>(slotIndex: number): T;
  write<T>(slotIndex: number, value: T): void;
  beginFrame(): IndexedSlotTokenFrame;
  revision(): number;
  slotRevision(slotIndex: number): number;
  publicationCount(): number;
  slotCount(): number;
}

class IndexedSlotTokenFrameImpl implements IndexedSlotTokenFrame {
  private readonly staged = new Map<number, unknown>();
  private closed = false;

  constructor(
    private readonly baseRevision: number,
    private readonly readCommittedRevision: () => number,
    private readonly readValue: (slotIndex: number) => unknown,
    private readonly commitValues: (staged: ReadonlyMap<number, unknown>) => void,
    private readonly assertSlotIndex: (slotIndex: number) => void
  ) {}

  set<T>(slotIndex: number, value: T): void {
    this.assertOpen();
    this.assertSlotIndex(slotIndex);
    this.staged.set(slotIndex, value);
  }

  update<T>(slotIndex: number, updater: (value: T) => T): void {
    this.assertOpen();
    this.assertSlotIndex(slotIndex);
    const current = this.staged.has(slotIndex)
      ? (this.staged.get(slotIndex) as T)
      : (this.readValue(slotIndex) as T);
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

    if (this.readCommittedRevision() !== this.baseRevision) {
      throw new StaleSlotTokenFrameError();
    }

    if (this.staged.size > 0) {
      this.commitValues(this.staged);
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('SlotTokenFrame is already closed.');
    }
  }
}

function createReadonlyLeaf<T>(
  slotIndex: number,
  tokens: readonly WritableSignal<number>[],
  values: readonly unknown[]
): Signal<T> {
  return (() => {
    tokens[slotIndex]();
    return values[slotIndex] as T;
  }) as Signal<T>;
}

export function createIndexedSlotTokenStore(
  initialValues: readonly unknown[]
): IndexedSlotTokenStore {
  const values = [...initialValues];
  const slotRevisions = initialValues.map(() => 0);
  const tokens = initialValues.map(() => signal(0));
  const leaves = new Array<SlotTokenLeaf<unknown> | undefined>(initialValues.length);
  let revision = 0;
  let publications = 0;

  const assertSlotIndex = (slotIndex: number): void => {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= values.length) {
      throw new Error(`Slot index ${slotIndex} is out of bounds.`);
    }
  };

  const commitSlots = (staged: ReadonlyMap<number, unknown>): void => {
    const changed: number[] = [];

    for (const [slotIndex, nextValue] of staged) {
      assertSlotIndex(slotIndex);
      if (Object.is(values[slotIndex], nextValue)) {
        continue;
      }
      values[slotIndex] = nextValue;
      slotRevisions[slotIndex] += 1;
      changed.push(slotIndex);
    }

    if (changed.length === 0) {
      return;
    }

    revision += 1;
    publications += 1;

    for (const slotIndex of changed) {
      tokens[slotIndex].update((value) => value + 1);
    }
  };

  const leaf = <T>(slotIndex: number): SlotTokenLeaf<T> => {
    assertSlotIndex(slotIndex);
    const cached = leaves[slotIndex];
    if (cached) {
      return cached as SlotTokenLeaf<T>;
    }

    const readonlyLeaf = createReadonlyLeaf<T>(slotIndex, tokens, values);
    const writable = (() => readonlyLeaf()) as SlotTokenLeaf<T>;
    writable.set = (value: T) => {
      commitSlots(new Map([[slotIndex, value]]));
    };
    writable.update = (updater: (value: T) => T) => {
      commitSlots(new Map([[slotIndex, updater(values[slotIndex] as T)]]));
    };
    writable.asReadonly = () => readonlyLeaf;
    leaves[slotIndex] = writable as SlotTokenLeaf<unknown>;
    return writable;
  };

  return {
    leaf,
    read<T>(slotIndex: number): T {
      assertSlotIndex(slotIndex);
      return values[slotIndex] as T;
    },
    write<T>(slotIndex: number, value: T): void {
      assertSlotIndex(slotIndex);
      commitSlots(new Map([[slotIndex, value]]));
    },
    beginFrame(): IndexedSlotTokenFrame {
      return new IndexedSlotTokenFrameImpl(
        revision,
        () => revision,
        (slotIndex) => values[slotIndex],
        commitSlots,
        assertSlotIndex
      );
    },
    revision(): number {
      return revision;
    },
    slotRevision(slotIndex: number): number {
      assertSlotIndex(slotIndex);
      return slotRevisions[slotIndex];
    },
    publicationCount(): number {
      return publications;
    },
    slotCount(): number {
      return values.length;
    },
  };
}
