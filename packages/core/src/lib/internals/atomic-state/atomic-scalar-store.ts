import {
  linkedSignal,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';

type ScalarSnapshot = Record<string, unknown>;

type AtomicLeaf<TSnapshot extends ScalarSnapshot, TKey extends keyof TSnapshot> =
  WritableSignal<TSnapshot[TKey]>;

const LEAF_KEY = new WeakMap<WritableSignal<unknown>, PropertyKey>();

export interface AtomicScalarFrame<TSnapshot extends ScalarSnapshot> {
  set<TKey extends keyof TSnapshot>(
    leaf: AtomicLeaf<TSnapshot, TKey>,
    value: TSnapshot[TKey]
  ): void;
  update<TKey extends keyof TSnapshot>(
    leaf: AtomicLeaf<TSnapshot, TKey>,
    updater: (value: TSnapshot[TKey]) => TSnapshot[TKey]
  ): void;
  discard(): void;
  commit(): void;
}

export interface AtomicScalarStore<TSnapshot extends ScalarSnapshot> {
  readonly snapshot: Signal<TSnapshot>;
  publicationCount(): number;
  writable<TKey extends keyof TSnapshot>(
    key: TKey
  ): AtomicLeaf<TSnapshot, TKey>;
  beginFrame(): AtomicScalarFrame<TSnapshot>;
}

type SnapshotPublisher<TSnapshot extends ScalarSnapshot> = {
  set(nextSnapshot: TSnapshot): void;
};

function patchSnapshotValue<
  TSnapshot extends ScalarSnapshot,
  TKey extends keyof TSnapshot,
>(
  current: TSnapshot,
  key: TKey,
  value: TSnapshot[TKey]
): TSnapshot {
  if (Object.is(current[key], value)) {
    return current;
  }

  return {
    ...current,
    [key]: value,
  };
}

function resolveLeafKey<TSnapshot extends ScalarSnapshot, TKey extends keyof TSnapshot>(
  leaf: AtomicLeaf<TSnapshot, TKey>
): TKey {
  const key = LEAF_KEY.get(leaf as WritableSignal<unknown>);
  if (key === undefined) {
    throw new Error('AtomicScalarFrame received a leaf from a different store.');
  }

  return key as TKey;
}

function createWritableLeaf<
  TSnapshot extends ScalarSnapshot,
  TKey extends keyof TSnapshot,
>(
  key: TKey,
  committedSnapshot: Signal<TSnapshot>,
  publishSnapshot: (nextSnapshot: TSnapshot) => void
): AtomicLeaf<TSnapshot, TKey> {
  const leaf = linkedSignal(() => committedSnapshot()[key]);
  LEAF_KEY.set(leaf as WritableSignal<unknown>, key);

  leaf.set = (value: TSnapshot[TKey]) => {
    publishSnapshot(patchSnapshotValue(committedSnapshot(), key, value));
  };

  leaf.update = (updater: (value: TSnapshot[TKey]) => TSnapshot[TKey]) => {
    const currentSnapshot = committedSnapshot();
    const nextValue = updater(currentSnapshot[key]);
    publishSnapshot(patchSnapshotValue(currentSnapshot, key, nextValue));
  };

  return leaf as AtomicLeaf<TSnapshot, TKey>;
}

class AtomicScalarFrameImpl<TSnapshot extends ScalarSnapshot>
  implements AtomicScalarFrame<TSnapshot>
{
  private stagedSnapshot: TSnapshot;
  private closed = false;

  constructor(
    private readonly baseSnapshot: TSnapshot,
    private readonly commitSnapshot: SnapshotPublisher<TSnapshot>
  ) {
    this.stagedSnapshot = { ...baseSnapshot };
  }

  set<TKey extends keyof TSnapshot>(
    leaf: AtomicLeaf<TSnapshot, TKey>,
    value: TSnapshot[TKey]
  ): void {
    this.assertOpen();
    const key = resolveLeafKey(leaf);
    this.stagedSnapshot = patchSnapshotValue(this.stagedSnapshot, key, value);
  }

  update<TKey extends keyof TSnapshot>(
    leaf: AtomicLeaf<TSnapshot, TKey>,
    updater: (value: TSnapshot[TKey]) => TSnapshot[TKey]
  ): void {
    this.assertOpen();
    const key = resolveLeafKey(leaf);
    const nextValue = updater(this.stagedSnapshot[key]);
    this.stagedSnapshot = patchSnapshotValue(this.stagedSnapshot, key, nextValue);
  }

  discard(): void {
    this.assertOpen();
    this.closed = true;
    this.stagedSnapshot = this.baseSnapshot;
  }

  commit(): void {
    this.assertOpen();
    this.closed = true;

    if (this.stagedSnapshot !== this.baseSnapshot) {
      this.commitSnapshot.set(this.stagedSnapshot);
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('AtomicScalarFrame is already closed.');
    }
  }
}

export function createAtomicScalarStore<TSnapshot extends ScalarSnapshot>(
  initialSnapshot: TSnapshot
): AtomicScalarStore<TSnapshot> {
  const committedSnapshot = signal(initialSnapshot);
  let publishCount = 0;

  const leaves = new Map<keyof TSnapshot, WritableSignal<unknown>>();

  const publishSnapshot = (nextSnapshot: TSnapshot): void => {
    if (Object.is(committedSnapshot(), nextSnapshot)) {
      return;
    }

    publishCount++;
    committedSnapshot.set(nextSnapshot);
  };

  return {
    snapshot: committedSnapshot.asReadonly(),
    publicationCount(): number {
      return publishCount;
    },
    writable<TKey extends keyof TSnapshot>(key: TKey): AtomicLeaf<TSnapshot, TKey> {
      const existing = leaves.get(key);
      if (existing) {
        return existing as AtomicLeaf<TSnapshot, TKey>;
      }

      const leaf = createWritableLeaf(key, committedSnapshot.asReadonly(), publishSnapshot);

      leaves.set(key, leaf as WritableSignal<unknown>);
      return leaf;
    },
    beginFrame(): AtomicScalarFrame<TSnapshot> {
      return new AtomicScalarFrameImpl(committedSnapshot(), { set: publishSnapshot });
    },
  };
}
