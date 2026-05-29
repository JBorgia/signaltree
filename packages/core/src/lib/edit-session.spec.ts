import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import {
  createEditSession,
  createTreeEditSession,
  type TreeEditSource,
} from './edit-session';

describe('createEditSession (value-level, unchanged from pre-v10.1)', () => {
  it('exposes original/modified signals and tracks dirty state', () => {
    const session = createEditSession({ name: 'Alice', age: 30 });
    expect(session.original().name).toBe('Alice');
    expect(session.modified().name).toBe('Alice');
    expect(session.isDirty()).toBe(false);

    session.applyChanges((s) => ({ ...s, name: 'Bob' }));
    expect(session.modified().name).toBe('Bob');
    expect(session.original().name).toBe('Alice');
    expect(session.isDirty()).toBe(true);
  });

  it('undo/redo navigate history', () => {
    const session = createEditSession(0);
    session.applyChanges(1);
    session.applyChanges(2);
    session.applyChanges(3);
    expect(session.modified()).toBe(3);
    expect(session.canUndo()).toBe(true);
    session.undo();
    expect(session.modified()).toBe(2);
    session.undo();
    expect(session.modified()).toBe(1);
    expect(session.canRedo()).toBe(true);
    session.redo();
    expect(session.modified()).toBe(2);
  });
});

describe('createTreeEditSession (v10.1 — tree-bound)', () => {
  /** Build a minimal mock that matches the TreeEditSource shape. */
  function makeMockSource<T>(initial: T): TreeEditSource<T> & {
    last(): T;
  } {
    const backing = signal(initial);
    const accessor = (() => backing()) as TreeEditSource<T> & { last(): T };
    accessor.set = (v: T) => backing.set(v);
    accessor.update = (fn: (v: T) => T) => backing.update(fn);
    accessor.last = () => backing();
    return accessor;
  }

  it('throws TypeError when source has no .set()', () => {
    const bad: unknown = (() => 1);
    expect(() => createTreeEditSession(bad as TreeEditSource<number>)).toThrow(
      /must be a callable accessor with a \.set\(\) method/
    );
  });

  it('initializes draft from source and starts not-dirty', () => {
    const source = makeMockSource({ count: 0 });
    const session = createTreeEditSession(source);
    expect(session.modified().count).toBe(0);
    expect(session.isDirty()).toBe(false);
  });

  it('applyChanges edits draft WITHOUT touching the source', () => {
    const source = makeMockSource({ count: 0 });
    const session = createTreeEditSession(source);
    session.applyChanges({ count: 5 });
    expect(session.modified().count).toBe(5);
    expect(session.isDirty()).toBe(true);
    // Source is untouched.
    expect(source.last().count).toBe(0);
  });

  it('commit() writes draft back to the source', () => {
    const source = makeMockSource({ count: 0 });
    const session = createTreeEditSession(source);
    session.applyChanges({ count: 7 });
    session.commit();
    expect(source.last().count).toBe(7);
  });

  it('cancel() discards draft, re-syncs original from source, clears history', () => {
    const source = makeMockSource({ count: 0 });
    const session = createTreeEditSession(source);
    session.applyChanges({ count: 1 });
    session.applyChanges({ count: 2 });
    session.applyChanges({ count: 3 });
    expect(session.canUndo()).toBe(true);

    session.cancel();
    // Source is unchanged.
    expect(source.last().count).toBe(0);
    // Draft snaps back to source.
    expect(session.modified().count).toBe(0);
    expect(session.isDirty()).toBe(false);
    // History cleared.
    expect(session.canUndo()).toBe(false);
    expect(session.canRedo()).toBe(false);
  });

  it('pullFromSource() updates original baseline without touching draft', () => {
    const source = makeMockSource({ count: 0 });
    const session = createTreeEditSession(source);

    // Edit the draft.
    session.applyChanges({ count: 10 });
    expect(session.isDirty()).toBe(true);

    // External update bumps the source. The session's draft is unchanged
    // but its "is-dirty" comparison is now stale.
    source.set({ count: 5 });
    session.pullFromSource();

    // Draft is still the user's edit.
    expect(session.modified().count).toBe(10);
    // Original now reflects the new source baseline.
    expect(session.original().count).toBe(5);
    // Still dirty (10 !== 5).
    expect(session.isDirty()).toBe(true);
  });

  it('undo/redo navigate draft history independently of the source', () => {
    const source = makeMockSource({ count: 0 });
    const session = createTreeEditSession(source);
    session.applyChanges({ count: 1 });
    session.applyChanges({ count: 2 });
    session.applyChanges({ count: 3 });

    session.undo();
    expect(session.modified().count).toBe(2);
    // Source still untouched.
    expect(source.last().count).toBe(0);

    session.redo();
    expect(session.modified().count).toBe(3);

    session.commit();
    expect(source.last().count).toBe(3);
  });

  it('works with a primitive (leaf-signal) source', () => {
    const source = makeMockSource(0);
    const session = createTreeEditSession(source);
    session.applyChanges(42);
    expect(session.modified()).toBe(42);
    expect(source.last()).toBe(0);
    session.commit();
    expect(source.last()).toBe(42);
  });
});
