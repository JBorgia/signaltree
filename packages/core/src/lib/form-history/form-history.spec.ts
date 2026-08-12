import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import { timeTravel } from '../../enhancers/time-travel/time-travel';
import { form } from '../markers/form';
import { entityMap } from '../types';
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

const flush = () => Promise.resolve().then(() => Promise.resolve());

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

  it('uses the same form-facing undo/redo api under timeTravel for form-only history', async () => {
    const tree = signalTree({
      profile: form<Profile>({
        initial: { name: '', password: '' },
        history: history<Profile>(),
      }),
    }).with(timeTravel());
    const p = tree.$.profile;

    p.patch({ name: 'Ada' });
    await flush();
    p.patch({ name: 'Grace' });
    await flush();

    p.history?.undo();
    expect(p().name).toBe('Ada');

    p.history?.redo();
    expect(p().name).toBe('Grace');
  });

  it('routes form.undo() through shared scoped causality instead of private chronology', async () => {
    const tree = signalTree({
      profile: form<{ name: string }>({
        initial: { name: '' },
        history: history<{ name: string }>(),
      }),
      theme: 'light',
    }).with(timeTravel());
    const p = tree.$.profile;

    p.$.name.set('Ada');
    await flush();
    tree.$.theme.set('dark');
    await flush();
    p.$.name.set('Grace');
    await flush();

    p.history?.undo();

    expect(p().name).toBe('Ada');
    expect(tree.$.theme()).toBe('dark');
  });

  it('routes form.undo() through shared turns without splitting a mixed turn', async () => {
    const tree = signalTree({
      profile: form<{ name: string }>({
        initial: { name: '' },
        history: history<{ name: string }>(),
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
      theme: 'light',
    }).with(timeTravel());
    const p = tree.$.profile;

    tree.$.orders.addOne({ id: 7, status: 'new' });
    await flush();

    p.$.name.set('Jon');
    tree.$.orders.byIdOrFail(7).status.set('queued');
    await flush();
    tree.$.theme.set('dark');
    await flush();

    p.history?.undo();

    expect(p().name).toBe('');
    expect(tree.$.orders.byIdOrFail(7).status()).toBe('new');
    expect(tree.$.theme()).toBe('dark');
  });

  it('derives form canUndo/canRedo from shared scoped history, even when another api path moves the turn frontier', async () => {
    const tree = signalTree({
      profile: form<{ name: string }>({
        initial: { name: '' },
        history: history<{ name: string }>(),
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const p = tree.$.profile;

    tree.$.orders.addOne({ id: 7, status: 'new' });
    await flush();

    p.$.name.set('Jon');
    tree.$.orders.byIdOrFail(7).status.set('queued');
    await flush();

    expect(p.history?.canUndo()).toBe(true);
    expect(p.history?.canRedo()).toBe(false);

    tree.undo();

    expect(p().name).toBe('');
    expect(tree.$.orders.byIdOrFail(7).status()).toBe('new');
    expect(p.history?.canUndo()).toBe(false);
    expect(p.history?.canRedo()).toBe(true);
  });

  it('reconstructs form values and existing touched state from shared causality after an unrelated turn intervenes', async () => {
    const tree = signalTree({
      profile: form<{ name: string; email: string }>({
        initial: { name: '', email: '' },
        history: history<{ name: string; email: string }>(),
      }),
      orders: entityMap<{ id: number; status: string }, number>({
        selectId: (row) => row.id,
      }),
    }).with(timeTravel());
    const p = tree.$.profile;

    p.patch({ name: 'Ada' });
    p.touch('name');
    await flush();

    tree.$.orders.addOne({ id: 7, status: 'new' });
    await flush();

    p.patch({ name: 'Grace' });
    await flush();

    p.history?.undo();

    expect(p()).toEqual({ name: 'Ada', email: '' });
    expect(p.touched()).toEqual({ name: true, email: false });
    expect(tree.$.orders.byIdOrFail(7).status()).toBe('new');
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
