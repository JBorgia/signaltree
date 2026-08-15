import {
  linkedSignal,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';

type ScalarSnapshot = Record<string, unknown>;

type AtomicLeaf<TSnapshot extends ScalarSnapshot, TKey extends keyof TSnapshot> =
  WritableSignal<TSnapshot[TKey]>;

const LEAF_PATH = new WeakMap<WritableSignal<unknown>, readonly PropertyKey[]>();

export class StaleAtomicScalarFrameError extends Error {
  constructor() {
    super('AtomicScalarFrame base revision is stale.');
    this.name = 'StaleAtomicScalarFrameError';
  }
}

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
  revision(): number;
  writable<TKey extends keyof TSnapshot>(
    key: TKey
  ): AtomicLeaf<TSnapshot, TKey>;
  writablePath<TValue>(path: readonly PropertyKey[]): WritableSignal<TValue>;
  beginFrame(): AtomicScalarFrame<TSnapshot>;
}

type SnapshotPublisher<TSnapshot extends ScalarSnapshot> = {
  set(nextSnapshot: TSnapshot): void;
};

function isObjectRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === 'object';
}

function readPathValue(snapshot: unknown, path: readonly PropertyKey[]): unknown {
  let current = snapshot;
  for (const segment of path) {
    if (!isObjectRecord(current)) {
      throw new Error(`AtomicScalarStore path ${path.join('.')} is not addressable.`);
    }
    current = current[segment];
  }
  return current;
}

function patchPathValue(
  current: unknown,
  path: readonly PropertyKey[],
  value: unknown
): unknown {
  if (path.length === 0) {
    return Object.is(current, value) ? current : value;
  }

  if (!isObjectRecord(current)) {
    throw new Error(`AtomicScalarStore path ${path.join('.')} is not writable.`);
  }

  const [segment, ...rest] = path;
  const nextChild = patchPathValue(current[segment], rest, value);

  if (Object.is(nextChild, current[segment])) {
    return current;
  }

  return {
    ...current,
    [segment]: nextChild,
  };
}

function pathKey(path: readonly PropertyKey[]): string {
  return path.map(String).join('\u001f');
}

function resolveLeafPath(leaf: WritableSignal<unknown>): readonly PropertyKey[] {
  const path = LEAF_PATH.get(leaf);
  if (!path) {
    throw new Error('AtomicScalarFrame received a leaf from a different store.');
  }

  return path;
}

function createWritableLeaf<TSnapshot extends ScalarSnapshot, TValue>(
  path: readonly PropertyKey[],
  committedSnapshot: Signal<TSnapshot>,
  publishSnapshot: (nextSnapshot: TSnapshot) => void
): WritableSignal<TValue> {
  const leaf = linkedSignal(() => readPathValue(committedSnapshot(), path)) as WritableSignal<unknown>;
  LEAF_PATH.set(leaf, [...path]);

  leaf.set = (value: TValue) => {
    publishSnapshot(patchPathValue(committedSnapshot(), path, value) as TSnapshot);
  };

  leaf.update = (updater: (value: TValue) => TValue) => {
    const currentSnapshot = committedSnapshot();
    const nextValue = updater(readPathValue(currentSnapshot, path) as TValue);
    publishSnapshot(patchPathValue(currentSnapshot, path, nextValue) as TSnapshot);
  };

  return leaf as WritableSignal<TValue>;
}

class AtomicScalarFrameImpl<TSnapshot extends ScalarSnapshot>
  implements AtomicScalarFrame<TSnapshot>
{
  private stagedSnapshot: TSnapshot;
  private closed = false;

  constructor(
    private readonly baseSnapshot: TSnapshot,
    private readonly baseRevision: number,
    private readonly getCommittedRevision: () => number,
    private readonly commitSnapshot: SnapshotPublisher<TSnapshot>
  ) {
    this.stagedSnapshot = { ...baseSnapshot };
  }

  set<TKey extends keyof TSnapshot>(
    leaf: AtomicLeaf<TSnapshot, TKey>,
    value: TSnapshot[TKey]
  ): void {
    this.assertOpen();
    const path = resolveLeafPath(leaf as WritableSignal<unknown>);
    this.stagedSnapshot = patchPathValue(this.stagedSnapshot, path, value) as TSnapshot;
  }

  update<TKey extends keyof TSnapshot>(
    leaf: AtomicLeaf<TSnapshot, TKey>,
    updater: (value: TSnapshot[TKey]) => TSnapshot[TKey]
  ): void {
    this.assertOpen();
    const path = resolveLeafPath(leaf as WritableSignal<unknown>);
    const nextValue = updater(readPathValue(this.stagedSnapshot, path) as TSnapshot[TKey]);
    this.stagedSnapshot = patchPathValue(this.stagedSnapshot, path, nextValue) as TSnapshot;
  }

  discard(): void {
    this.assertOpen();
    this.closed = true;
    this.stagedSnapshot = this.baseSnapshot;
  }

  commit(): void {
    this.assertOpen();
    this.closed = true;

    if (this.getCommittedRevision() !== this.baseRevision) {
      throw new StaleAtomicScalarFrameError();
    }

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
  let revision = 0;

  const leaves = new Map<string, WritableSignal<unknown>>();

  const publishSnapshot = (nextSnapshot: TSnapshot): void => {
    if (Object.is(committedSnapshot(), nextSnapshot)) {
      return;
    }

    publishCount++;
    revision++;
    committedSnapshot.set(nextSnapshot);
  };

  return {
    snapshot: committedSnapshot.asReadonly(),
    publicationCount(): number {
      return publishCount;
    },
    revision(): number {
      return revision;
    },
    writable<TKey extends keyof TSnapshot>(key: TKey): AtomicLeaf<TSnapshot, TKey> {
      const keyPath = [key] as const;
      const existing = leaves.get(pathKey(keyPath));
      if (existing) {
        return existing as AtomicLeaf<TSnapshot, TKey>;
      }

      const leaf = createWritableLeaf<TSnapshot, TSnapshot[TKey]>(
        keyPath,
        committedSnapshot.asReadonly(),
        publishSnapshot
      );

      leaves.set(pathKey(keyPath), leaf as WritableSignal<unknown>);
      return leaf as AtomicLeaf<TSnapshot, TKey>;
    },
    writablePath<TValue>(path: readonly PropertyKey[]): WritableSignal<TValue> {
      const existing = leaves.get(pathKey(path));
      if (existing) {
        return existing as WritableSignal<TValue>;
      }

      const leaf = createWritableLeaf<TSnapshot, TValue>(
        path,
        committedSnapshot.asReadonly(),
        publishSnapshot
      );
      leaves.set(pathKey(path), leaf as WritableSignal<unknown>);
      return leaf;
    },
    beginFrame(): AtomicScalarFrame<TSnapshot> {
      return new AtomicScalarFrameImpl(
        committedSnapshot(),
        revision,
        () => revision,
        { set: publishSnapshot }
      );
    },
  };
}
