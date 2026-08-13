import type { NodeAccessor, TreeNode } from '../../types';

import {
  createIndexedSlotTokenStore,
  type IndexedSlotTokenFrame,
  StaleSlotTokenFrameError,
  type SlotTokenLeaf,
} from './indexed-slot-token-store';

export { StaleSlotTokenFrameError };
export type { SlotTokenLeaf };

export interface SlotTokenFrame {
  set<T>(leaf: SlotTokenLeaf<T>, value: T): void;
  update<T>(leaf: SlotTokenLeaf<T>, updater: (value: T) => T): void;
  discard(): void;
  commit(): void;
}

type ScalarTreeState = Record<string, unknown>;
type IndexedShape = number | { readonly [key: string]: IndexedShape };

export interface SlotTokenTreePrototype<T extends ScalarTreeState> {
  readonly tree: NodeAccessor<T> & { readonly $: TreeNode<T> };
  beginFrame(): SlotTokenFrame;
  revision(): number;
  publicationCount(): number;
  slotCount(): number;
}

const LEAF_SLOTS = new WeakMap<object, number>();

class SlotTokenFrameImpl implements SlotTokenFrame {
  constructor(private readonly frame: IndexedSlotTokenFrame) {}

  set<T>(leaf: SlotTokenLeaf<T>, value: T): void {
    this.frame.set(resolveLeafSlot(leaf), value);
  }

  update<T>(leaf: SlotTokenLeaf<T>, updater: (value: T) => T): void {
    this.frame.update(resolveLeafSlot(leaf), updater);
  }

  discard(): void {
    this.frame.discard();
  }

  commit(): void {
    this.frame.commit();
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveLeafSlot<T>(leaf: SlotTokenLeaf<T>): number {
  const slotIndex = LEAF_SLOTS.get(leaf as object);
  if (slotIndex === undefined) {
    throw new Error('SlotTokenFrame received a leaf from a different tree.');
  }
  return slotIndex;
}

function buildIndexedShape(value: unknown, initialValues: unknown[]): IndexedShape {
  if (!isPlainObject(value)) {
    const slotIndex = initialValues.length;
    initialValues.push(value);
    return slotIndex;
  }

  const branch: Record<string, IndexedShape> = {};
  for (const [key, child] of Object.entries(value)) {
    branch[key] = buildIndexedShape(child, initialValues);
  }
  return branch;
}

function materializeIndexedShape<T>(
  indexedShape: IndexedShape,
  readSlot: (slotIndex: number) => unknown
): T {
  if (typeof indexedShape === 'number') {
    return readSlot(indexedShape) as T;
  }

  const branch: Record<string, unknown> = {};
  for (const [key, childShape] of Object.entries(indexedShape)) {
    branch[key] = materializeIndexedShape(childShape, readSlot);
  }
  return branch as T;
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

function stageIndexedShape(
  frame: IndexedSlotTokenFrame,
  indexedShape: IndexedShape,
  nextValue: unknown
): void {
  if (typeof indexedShape === 'number') {
    frame.set(indexedShape, nextValue);
    return;
  }

  if (!isPlainObject(nextValue)) {
    throw new Error('SlotTokenTreePrototype branch writes require object values.');
  }

  for (const [key, childShape] of Object.entries(indexedShape)) {
    stageIndexedShape(frame, childShape, nextValue[key]);
  }
}

function createBranchAccessor<TBranch extends ScalarTreeState>(
  indexedShape: IndexedShape,
  readSnapshot: <TValue>(shape: IndexedShape) => TValue,
  writeBranch: (indexedShape: IndexedShape, nextValue: unknown) => void,
  leafFactory: <TValue>(slotIndex: number) => SlotTokenLeaf<TValue>
): NodeAccessor<TBranch> & TreeNode<TBranch> {
  const accessor = {
    node(arg?: unknown): TBranch | void {
      const current = readSnapshot<TBranch>(indexedShape);

      if (arguments.length === 0) {
        return current;
      }

      if (typeof arg === 'function') {
        const updater = arg as (value: TBranch) => TBranch;
        const next = updater(current);
        if (isPlainObject(next)) {
          writeBranch(indexedShape, deepMerge(current, next));
        }
        return;
      }

      if (isPlainObject(arg)) {
        writeBranch(indexedShape, deepMerge(current, arg as Partial<TBranch>));
      }
    },
  }.node as NodeAccessor<TBranch> & TreeNode<TBranch>;

  if (typeof indexedShape !== 'number') {
    for (const [key, childShape] of Object.entries(indexedShape)) {
      Object.defineProperty(accessor, key, {
        value:
          typeof childShape === 'number'
            ? leafFactory(childShape)
            : createBranchAccessor(
                childShape,
                readSnapshot,
                writeBranch,
                leafFactory
              ),
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
  }

  return accessor;
}

export function createSlotTokenTreePrototype<T extends ScalarTreeState>(
  initialState: T
): SlotTokenTreePrototype<T> {
  const initialValues: unknown[] = [];
  const indexedShape = buildIndexedShape(initialState, initialValues);
  const store = createIndexedSlotTokenStore(initialValues);

  const readSnapshot = <TValue>(shape: IndexedShape): TValue =>
    materializeIndexedShape<TValue>(shape, (slotIndex) => store.read(slotIndex));

  const writeBranch = (shape: IndexedShape, nextValue: unknown): void => {
    const frame = store.beginFrame();
    stageIndexedShape(frame, shape, nextValue);
    frame.commit();
  };

  const leafFactory = <TValue>(slotIndex: number): SlotTokenLeaf<TValue> => {
    const leaf = store.leaf<TValue>(slotIndex);
    LEAF_SLOTS.set(leaf as object, slotIndex);
    return leaf;
  };

  const root = createBranchAccessor<T>(
    indexedShape,
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
    beginFrame(): SlotTokenFrame {
      return new SlotTokenFrameImpl(store.beginFrame());
    },
    revision(): number {
      return store.revision();
    },
    publicationCount(): number {
      return store.publicationCount();
    },
    slotCount(): number {
      return store.slotCount();
    },
  };
}
