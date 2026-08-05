import { isSignal } from '@angular/core';

import { signalTree } from '../signal-tree';
import { applyState, unwrap } from '../utils';
import { stored, STORED_MARKER, createStoredSignal } from './stored';

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
}

describe('W3: stored() conforms to the signal protocol', () => {
  let mockStorage: Storage;
  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  it('is a real Angular signal', () => {
    const sig = createStoredSignal<string>({
      [STORED_MARKER]: true,
      key: 'k',
      defaultValue: 'light',
      options: { storage: mockStorage },
    });
    expect(isSignal(sig)).toBe(true);
    expect(typeof sig.set).toBe('function');
    expect(typeof sig.flush).toBe('function');
    expect(sig()).toBe('light');
  });

  it('P1a: a top-level stored leaf appears in tree()', () => {
    const tree = signalTree({
      theme: stored('p1a', 'light', { storage: mockStorage }),
      other: 1,
    });
    void tree.$;
    const snap = tree() as Record<string, unknown>;
    expect(snap['theme']).toBe('light');
    expect(snap['other']).toBe(1);
  });

  it('P1b: a NESTED stored leaf emits its value, not the raw marker', () => {
    const tree = signalTree({
      settings: { theme: stored('p1b', 'light', { storage: mockStorage }) },
    });
    void tree.$;
    const json = JSON.stringify(tree());
    expect(json).not.toContain('defaultValue');
    expect(json).not.toContain('storage');
    expect((tree() as { settings: { theme: string } }).settings.theme).toBe(
      'light'
    );
  });

  it('SECURITY: an explicit storage option never reaches the snapshot', () => {
    const leaky = createMockStorage();
    (leaky as unknown as Record<string, string>)['auth-token'] = 'SECRET-JWT';
    const tree = signalTree({
      settings: { theme: stored('sec', 'light', { storage: leaky }) },
    });
    void tree.$;
    expect(JSON.stringify(tree())).not.toContain('SECRET-JWT');
  });

  it('P1c: a merge write through the parent reaches the stored leaf', async () => {
    const tree = signalTree({
      settings: { theme: stored('p1c', 'light', { storage: mockStorage, debounceMs: 0 }) },
    });
    void tree.$;

    (tree.$.settings as unknown as (v: object) => void)({ theme: 'dark' });

    expect(tree.$.settings.theme()).toBe('dark');
    expect(JSON.parse(mockStorage.getItem('p1c') as string).data).toBe('dark');
  });

  it('applyState no longer destroys the signal', () => {
    const tree = signalTree({
      settings: { theme: stored('apply', 'light', { storage: mockStorage }) },
    });
    void tree.$;

    applyState(tree.$ as never, { settings: { theme: 'dark' } } as never);

    expect(typeof tree.$.settings.theme).toBe('function');
    expect(() => tree.$.settings.theme()).not.toThrow();
    expect(tree.$.settings.theme()).toBe('dark');
  });

  it('unwrap() sees the value', () => {
    const tree = signalTree({
      settings: { theme: stored('unwrapped', 'light', { storage: mockStorage }) },
    });
    void tree.$;
    const out = unwrap(tree.$) as { settings: { theme: string } };
    expect(out.settings.theme).toBe('light');
  });

  it('persistence still works through the signal path', async () => {
    const sig = createStoredSignal<number>({
      [STORED_MARKER]: true,
      key: 'persist',
      defaultValue: 0,
      options: { storage: mockStorage, debounceMs: 0 },
    });
    sig.set(5);
    expect(JSON.parse(mockStorage.getItem('persist') as string).data).toBe(5);
    sig.update((n) => n + 1);
    expect(sig()).toBe(6);
    expect(JSON.parse(mockStorage.getItem('persist') as string).data).toBe(6);
  });
});
