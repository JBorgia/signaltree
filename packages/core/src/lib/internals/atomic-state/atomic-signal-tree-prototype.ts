import type { WritableSignal } from '@angular/core';

import type { NodeAccessor, TreeNode } from '../../types';

import {
  createAtomicScalarStore,
  type AtomicScalarFrame,
} from './atomic-scalar-store';

type AtomicTreeState = Record<string, unknown>;
type AtomicPath = readonly string[];

export type AtomicSignalTreePrototype<T extends AtomicTreeState> = {
  tree: NodeAccessor<T> & { readonly $: TreeNode<T> };
  beginFrame(): AtomicScalarFrame<T>;
  revision(): number;
  publicationCount(): number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readPath(snapshot: unknown, path: AtomicPath): unknown {
  let current = snapshot;
  for (const segment of path) {
    if (!isPlainObject(current)) {
      throw new Error(
        `AtomicSignalTreePrototype path ${path.map(String).join('.')} is not addressable.`
      );
    }
    current = current[segment];
  }
  return current;
}

function deepMerge<T>(current: T, patch: Partial<T>): T {
  if (!isPlainObject(current) || !isPlainObject(patch)) {
    return patch as T;
  }

  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const existing = (current as Record<string, unknown>)[key];
    merged[key] = isPlainObject(existing) && isPlainObject(value)
      ? deepMerge(existing, value)
      : value;
  }
  return merged as T;
}

function createBranchAccessor<TBranch extends AtomicTreeState>(
  shape: TBranch,
  path: AtomicPath,
  readSnapshot: () => unknown,
  writeBranch: (path: AtomicPath, nextValue: unknown) => void,
  leafFactory: <TValue>(path: AtomicPath) => WritableSignal<TValue>
): NodeAccessor<TBranch> & TreeNode<TBranch> {
  const branchLeaf = leafFactory<TBranch>(path);

  const accessor = {
    node(arg?: unknown): TBranch | void {
      const current = readPath(readSnapshot(), path) as TBranch;

      if (arguments.length === 0) {
        return current;
      }

      if (typeof arg === 'function') {
        const updater = arg as (value: TBranch) => TBranch;
        const next = updater(current);
        if (isPlainObject(next)) {
          writeBranch(path, deepMerge(current, next));
        }
        return;
      }

      if (isPlainObject(arg)) {
        writeBranch(path, deepMerge(current, arg as Partial<TBranch>));
      }
    },
  }.node as NodeAccessor<TBranch> & TreeNode<TBranch>;

  for (const [key, value] of Object.entries(shape)) {
    const childPath = [...path, key] as const;
    Object.defineProperty(accessor, key, {
      value: isPlainObject(value)
        ? createBranchAccessor(
            value,
            childPath,
            readSnapshot,
            writeBranch,
            leafFactory
          )
        : leafFactory(childPath),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }

  Object.defineProperty(accessor, 'asReadonly', {
    value: branchLeaf.asReadonly.bind(branchLeaf),
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return accessor;
}

export function createAtomicSignalTreePrototype<T extends AtomicTreeState>(
  initialState: T
): AtomicSignalTreePrototype<T> {
  const store = createAtomicScalarStore(initialState);
  const readSnapshot = (): T => store.snapshot();
  const writeBranch = (path: AtomicPath, nextValue: unknown): void => {
    store.writablePath<unknown>(path).set(nextValue);
  };
  const leafFactory = <TValue>(path: AtomicPath): WritableSignal<TValue> =>
    store.writablePath<TValue>(path);

  const root = createBranchAccessor(
    initialState,
    [],
    readSnapshot,
    writeBranch,
    leafFactory
  ) as NodeAccessor<T> & { readonly $: TreeNode<T> };

  Object.defineProperty(root, '$', {
    value: root,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return {
    tree: root,
    beginFrame(): AtomicScalarFrame<T> {
      return store.beginFrame();
    },
    revision(): number {
      return store.revision();
    },
    publicationCount(): number {
      return store.publicationCount();
    },
  };
}
