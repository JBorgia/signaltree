import { signalTree } from '../index';

describe('thesis: Map resolution closes the class with no name check', () => {
  const scrub = () => {
    for (const k of ['zzP', 'isAdmin'])
      delete (Object.prototype as unknown as Record<string, unknown>)[k];
  };
  beforeEach(scrub);
  afterEach(scrub);

  it('recursiveUpdate has NO blocklist, yet payload __proto__ resolves to nothing', () => {
    const tree = signalTree({ a: 1, b: { c: 2 } });

    // These would each have needed a separate guard under the old model.
    tree(JSON.parse('{"__proto__":{"zzP":1}}'));
    tree(JSON.parse('{"b":{"__proto__":{"zzP":1}}}'));
    tree(JSON.parse('{"constructor":{"prototype":{"zzP":1}}}'));
    tree(JSON.parse('{"__proto__":0}'));
    tree(JSON.parse('{"__proto__":{"isAdmin":true}}'));

    expect(({} as Record<string, unknown>)['zzP']).toBeUndefined();
    expect(({} as Record<string, unknown>)['isAdmin']).toBeUndefined();
    expect(tree()).toEqual({ a: 1, b: { c: 2 } });
  });

  it('the mint-then-walk bypass has nothing to mint into', () => {
    const tree = signalTree({ a: 1 });
    // Even if an own __proto__ is forced onto the node, resolution goes through
    // the Map, which never gained the key.
    Object.defineProperty(tree.$, '__proto__', {
      value: { zzP: 'x' },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    tree(JSON.parse('{"__proto__":{"zzP":"pwned"}}'));

    expect(({} as Record<string, unknown>)['zzP']).toBeUndefined();
  });

  it('legitimate state named constructor/prototype still round-trips', () => {
    const state = { constructor: 'ctor', prototype: 'proto', ok: 1 };
    const tree = signalTree({ ...state });

    tree({ constructor: 'changed' });

    expect(tree()).toEqual({ ...state, constructor: 'changed' });
  });
});

describe('form() persist hydration — untrusted localStorage', () => {
  const scrub = () => {
    delete (Object.prototype as unknown as Record<string, unknown>)['zzForm'];
  };
  beforeEach(scrub);
  afterEach(scrub);

  it('does not carry an own __proto__ out of stored form values', async () => {
    const { form } = await import('./markers/form');
    const store: Record<string, string> = {
      f: '{"__proto__":{"zzForm":"pwned"},"name":"Ada"}',
    };
    const fakeStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
    } as unknown as Storage;

    const tree = signalTree({
      f: form<{ name: string }>({
        initial: { name: '' },
        persist: 'f',
        storage: fakeStorage,
      } as never),
    });
    const values = (tree.$.f as unknown as () => Record<string, unknown>)();

    // Spread does not invoke the setter, but it DOES copy an own __proto__
    // through — which then satisfies every downstream hasOwnProperty guard.
    expect(Object.prototype.hasOwnProperty.call(values, '__proto__')).toBe(false);
    expect(({} as Record<string, unknown>)['zzForm']).toBeUndefined();
    expect(values['name']).toBe('Ada'); // legitimate stored value survives
  });
});
