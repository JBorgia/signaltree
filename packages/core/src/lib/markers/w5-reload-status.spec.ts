import { createStoredSignal, STORED_MARKER } from './stored';

function mockStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
    removeItem: (k: string) => m.delete(k),
    clear: () => m.clear(),
    get length() {
      return m.size;
    },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
  };
}

describe('W5: reload() reports what it found', () => {
  it("returns 'ok' when a stored value was read", () => {
    const storage = mockStorage();
    storage.setItem('r1', JSON.stringify({ __v: 1, data: 'stored' }));
    const sig = createStoredSignal<string>({
      [STORED_MARKER]: true,
      key: 'r1',
      defaultValue: 'default',
      options: { storage },
    });
    expect(sig.reload()).toBe('ok');
    expect(sig()).toBe('stored');
  });

  it("returns 'default' when the key is absent", () => {
    const sig = createStoredSignal<string>({
      [STORED_MARKER]: true,
      key: 'r2',
      defaultValue: 'default',
      options: { storage: mockStorage() },
    });
    expect(sig.reload()).toBe('default');
    expect(sig()).toBe('default');
  });

  it("returns 'error' on unreadable data and leaves storage intact", () => {
    const storage = mockStorage();
    const sig = createStoredSignal<string>({
      [STORED_MARKER]: true,
      key: 'r3',
      defaultValue: 'default',
      options: { storage, onError: () => undefined },
    });
    storage.setItem('r3', '{not json');

    expect(sig.reload()).toBe('error');
    expect(sig()).toBe('default');
    // Deliberate: unreadable data is left for a human to recover.
    expect(storage.getItem('r3')).toBe('{not json');
  });

  it("returns 'error' when a migration throws", () => {
    const storage = mockStorage();
    storage.setItem('r4', JSON.stringify({ __v: 1, data: 'old' }));
    const sig = createStoredSignal<string>({
      [STORED_MARKER]: true,
      key: 'r4',
      defaultValue: 'default',
      options: {
        storage,
        version: 2,
        migrate: () => {
          throw new Error('cannot migrate');
        },
        onError: () => undefined,
      },
    });
    expect(sig.reload()).toBe('error');
  });

  it("returns 'default' with no storage backend", () => {
    const sig = createStoredSignal<string>({
      [STORED_MARKER]: true,
      key: 'r5',
      defaultValue: 'default',
      options: { storage: null },
    });
    expect(sig.reload()).toBe('default');
  });
});
