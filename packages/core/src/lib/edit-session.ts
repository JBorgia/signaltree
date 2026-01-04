export type UndoRedoHistory<T> = {
  past: T[];
  present: T;
  future: T[];
};

import { signal, WritableSignal } from '@angular/core';

import { deepEqual } from './utils';

export interface EditSession<T> {
  readonly original: WritableSignal<T>;
  readonly modified: WritableSignal<T>;
  readonly canUndo: () => boolean;
  readonly canRedo: () => boolean;
  readonly isDirty: () => boolean;

  setOriginal(value: T): void;
  applyChanges(valueOrUpdater: T | ((current: T) => T)): void;
  undo(): void;
  redo(): void;
  reset(): void;
  getHistory(): UndoRedoHistory<T>;
}

function clone<T>(value: T): T {
  try {
    // Use structuredClone when available for deep copy
    // @ts-ignore - global may provide structuredClone
    return (globalThis as any).structuredClone
      ? (globalThis as any).structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

export function createEditSession<T>(initial: T): EditSession<T> {
  const original = signal(clone(initial));
  const present = signal(clone(initial));

  // Internal history stacks are ordinary arrays; expose counts via signals
  const pastCount = signal(0);
  const futureCount = signal(0);

  let past: T[] = [];
  let future: T[] = [];

  function updateCounts() {
    pastCount.set(past.length);
    futureCount.set(future.length);
  }

  const canUndo = () => pastCount() > 0;
  const canRedo = () => futureCount() > 0;
  const isDirty = () => !deepEqual(original(), present());

  function setOriginal(value: T) {
    const v = clone(value);
    original.set(v);
    present.set(clone(v));
    past = [];
    future = [];
    updateCounts();
  }

  function applyChanges(valueOrUpdater: T | ((current: T) => T)) {
    const current = present();
    const next =
      typeof valueOrUpdater === 'function'
        ? (valueOrUpdater as (c: T) => T)(clone(current))
        : (valueOrUpdater as T);

    // No-op if equal
    if (deepEqual(current, next)) return;

    past.push(clone(current));
    present.set(clone(next));
    future = [];
    updateCounts();
  }

  function undo() {
    if (past.length === 0) return;
    const prev = past.pop() as T;
    future.push(clone(present()));
    present.set(clone(prev));
    updateCounts();
  }

  function redo() {
    if (future.length === 0) return;
    const next = future.pop() as T;
    past.push(clone(present()));
    present.set(clone(next));
    updateCounts();
  }

  function reset() {
    present.set(clone(original()));
    past = [];
    future = [];
    updateCounts();
  }

  function getHistory(): UndoRedoHistory<T> {
    return {
      past: past.map((p) => clone(p)),
      present: clone(present()),
      future: future.map((f) => clone(f)),
    };
  }

  return {
    original,
    modified: present,
    canUndo,
    canRedo,
    isDirty,
    setOriginal,
    applyChanges,
    undo,
    redo,
    reset,
    getHistory,
  };
}

export default createEditSession;
