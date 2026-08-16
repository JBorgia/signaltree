import { describe, expect, it } from 'vitest';

import { StructuralStore } from './structural-store';

const seedStore = () => {
  const store = new StructuralStore<string>();
  store.createSubject(1, 'A');
  store.createSubject(2, 'B');
  store.createSubject(3, 'C');
  return store;
};

describe('StructuralStore', () => {
  it('tracks canonical active order across create, remove, rekey, and append', () => {
    const store = seedStore();

    expect(store.activeKeysSnapshot()).toEqual(['A', 'B', 'C']);

    store.tombstoneSubject(2, 'B', true);
    expect(store.activeKeysSnapshot()).toEqual(['A', 'C']);

    store.restoreSubject(2, 'B', 1, 3);
    expect(store.activeKeysSnapshot()).toEqual(['A', 'B', 'C']);

    store.transferSubject(2, 'B', 'X');
    expect(store.activeKeysSnapshot()).toEqual(['A', 'X', 'C']);

    store.createSubject(4, 'D');
    expect(store.activeKeysSnapshot()).toEqual(['A', 'X', 'C', 'D']);
  });

  it('rekeys structural address without changing subject identity or ordinal', () => {
    const store = seedStore();

    expect(store.activeKeysSnapshot()).toEqual(['A', 'B', 'C']);
    expect(store.neighborSubjectsForKey('B')).toEqual({
      beforeSubject: 1,
      afterSubject: 3,
    });

    store.transferSubject(2, 'B', 'X');

    expect(store.activeKeysSnapshot()).toEqual(['A', 'X', 'C']);
    expect(store.subjectIdForKey('B')).toBeUndefined();
    expect(store.subjectIdForKey('X')).toBe(2);
    expect(store.activeKeyForSubject(2)).toBe('X');
    expect(store.neighborSubjectsForKey('X')).toEqual({
      beforeSubject: 1,
      afterSubject: 3,
    });
  });

  it('restores a tombstoned subject between surviving neighbors', () => {
    const store = seedStore();

    store.tombstoneSubject(2, 'B', true);

    expect(store.activeKeysSnapshot()).toEqual(['A', 'C']);

    store.restoreSubject(2, 'B', 1, 3);

    expect(store.activeKeysSnapshot()).toEqual(['A', 'B', 'C']);
  });

  it('restores after the surviving before-neighbor when the after anchor is gone', () => {
    const store = seedStore();

    store.tombstoneSubject(2, 'B', true);
    store.tombstoneSubject(3, 'C', true);

    store.restoreSubject(2, 'B', 1, 3);

    expect(store.activeKeysSnapshot()).toEqual(['A', 'B']);
  });

  it('restores before the surviving after-neighbor when the before anchor is gone', () => {
    const store = seedStore();

    store.tombstoneSubject(1, 'A', true);
    store.tombstoneSubject(2, 'B', true);

    store.restoreSubject(2, 'B', 1, 3);

    expect(store.activeKeysSnapshot()).toEqual(['B', 'C']);
  });

  it('appends when neither historical neighbor survives', () => {
    const store = seedStore();
    store.createSubject(4, 'D');

    store.tombstoneSubject(2, 'B', true);
    store.tombstoneSubject(1, 'A', true);
    store.tombstoneSubject(3, 'C', true);

    store.restoreSubject(2, 'B', 1, 3);

    expect(store.activeKeysSnapshot()).toEqual(['D', 'B']);
  });

  it('prefers the surviving next-anchor when wholesale reorder reverses captured anchors', () => {
    const store = new StructuralStore<string>();
    store.createSubject(1, 'A');
    store.createSubject(2, 'B');
    store.createSubject(3, 'C');
    store.createSubject(4, 'D');

    store.tombstoneSubject(2, 'B', true);
    store.reorderActiveKeys(['D', 'C', 'A']);

    store.restoreSubject(2, 'B', 1, 3);

    expect(store.activeKeysSnapshot()).toEqual(['D', 'B', 'C', 'A']);
  });

  it('treats move-to-front as a wholesale reorder in the order provided', () => {
    const store = seedStore();

    store.moveKeysToFront(['C', 'A']);

    expect(store.activeKeysSnapshot()).toEqual(['C', 'A', 'B']);
    expect(store.firstActiveKey()).toBe('C');
  });

  it('maintains linked order integrity across mixed structural operations', () => {
    const store = seedStore();

    store.tombstoneSubject(2, 'B', true);
    store.transferSubject(3, 'C', 'X');
    store.restoreSubject(2, 'B', 1, 3);
    store.createSubject(4, 'D');

    expect(store.activeKeysSnapshot()).toEqual(['A', 'B', 'X', 'D']);
    expect(() => store.__assertActiveOrderIntegrityForTesting()).not.toThrow();
  });

  it('treats explicit reorder as wholesale canonical-order replacement', () => {
    const store = seedStore();

    store.reorderActiveKeys(['C', 'A', 'B']);

    expect(store.activeKeysSnapshot()).toEqual(['C', 'A', 'B']);
    expect(store.firstActiveKey()).toBe('C');
  });
});
