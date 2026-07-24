import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import { form } from '../markers/form';
import { history } from './form-history';

interface Profile extends Record<string, unknown> {
  name: string;
  password: string;
}

function makeTree(opts?: { capacity?: number; exclude?: (keyof Profile)[] }) {
  return signalTree({
    profile: form<Profile>({
      initial: { name: '', password: '' },
      history: history<Profile>(opts),
    }),
  });
}

describe('form history()', () => {
  it('exposes an undo/redo api on the marker', () => {
    const tree = makeTree();
    const h = tree.$.profile.history;
    expect(h).toBeDefined();
    expect(h?.canUndo()).toBe(false);
    expect(h?.canRedo()).toBe(false);
  });

  it('undoes and redoes value changes', () => {
    const tree = makeTree();
    const p = tree.$.profile;
    p.patch({ name: 'Ada' });
    p.patch({ name: 'Grace' });
    expect(p().name).toBe('Grace');

    p.history?.undo();
    expect(p().name).toBe('Ada');
    p.history?.undo();
    expect(p().name).toBe('');

    p.history?.redo();
    expect(p().name).toBe('Ada');
    expect(p.history?.canRedo()).toBe(true);
  });

  it('collapses no-op writes (equal snapshots record nothing)', () => {
    const tree = makeTree();
    const p = tree.$.profile;
    p.patch({ name: 'Ada' });
    p.patch({ name: 'Ada' });
    expect(p.history?.history().past.length).toBe(1);
  });

  it('honors capacity by evicting the oldest entry', () => {
    const tree = makeTree({ capacity: 2 });
    const p = tree.$.profile;
    p.patch({ name: 'a' });
    p.patch({ name: 'b' });
    p.patch({ name: 'c' });
    // capacity 2 → at most 2 past entries retained
    expect(p.history?.history().past.length).toBe(2);
  });

  it('never buffers excluded fields, and keeps their live value on undo', () => {
    const tree = makeTree({ exclude: ['password'] });
    const p = tree.$.profile;
    p.patch({ name: 'Ada', password: 'secret1' });
    p.patch({ name: 'Grace', password: 'secret2' });

    // snapshots must not contain the excluded field
    const snap = p.history?.history();
    expect('password' in (snap?.present ?? {})).toBe(false);
    expect(snap?.past.every((s) => !('password' in s))).toBe(true);

    // undo reverts name but leaves the live password untouched
    p.history?.undo();
    expect(p().name).toBe('Ada');
    expect(p().password).toBe('secret2');
  });

  it('fails closed at the form() factory when history is not history() output', () => {
    expect(() =>
      form<Profile>({
        initial: { name: '', password: '' },
        // @ts-expect-error — raw object is not a HistoryFeature
        history: { capacity: 5 },
      })
    ).toThrow(/ST2006/);
  });
});
