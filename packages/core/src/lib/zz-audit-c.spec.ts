import { vi } from 'vitest';

import { signalTree } from '../index';
import { entityMap } from './markers/entity-map';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

function dump(label: string, value: unknown): never {
  throw new Error(
    `${label}: ` +
      JSON.stringify(
        value,
        (_k, v) => (typeof v === 'function' ? `[fn ${v.name}]` : v),
        1
      )
  );
}

describe('K: enhancer that returns a NEW tree object', () => {
  it('K1 onPathChange silently no-ops when the enhancer returns a wrapper', () => {
    const base = signalTree({ count: 0 });
    const enhanced = base.with((t) => {
      // A wrapper that delegates but is a different function object.
      const w = function (arg?: unknown) {
        return arguments.length === 0
          ? (t as unknown as () => unknown)()
          : (t as unknown as (a: unknown) => void)(arg);
      };
      Object.setPrototypeOf(w, t);
      return w as unknown as typeof t;
    });
    const seen: string[][] = [];
    const off = enhanced.onPathChange((p) => seen.push([...p]));
    enhanced({ count: 1 });
    expect({ seen, offIsFn: typeof off }).toEqual({
      seen: [['count']],
      offIsFn: 'function',
    });
  });
});

describe('L: state key containing a dot', () => {
  it('L1 path is ambiguous', () => {
    const tree = signalTree({ 'a.b': 1, a: { b: 2 } });
    dump('L1', {
      dotted: tree.updateAndReport({ 'a.b': 9 }),
      nested: tree.updateAndReport({ a: { b: 9 } }),
    });
  });
});

describe('M: state keys named set/update holding objects', () => {
  it('M1 nested object under a `set` key', () => {
    const tree = signalTree({
      perms: { set: { admin: true }, update: [1, 2] },
    });
    expect(structuredClone(tree())).toEqual({
      perms: { set: { admin: true }, update: [1, 2] },
    });
  });

  it('M2 top-level set/update keys', () => {
    const tree = signalTree({ set: 'a', update: 'b' });
    expect(structuredClone(tree())).toEqual({ set: 'a', update: 'b' });
  });
});

describe('N: entityMap under the root call form', () => {
  it('N1 writing through the root reports nothing and warns', () => {
    const tree = signalTree({
      users: entityMap<{ id: number; name: string }>([{ id: 1, name: 'Ada' }]),
      other: 1,
    });
    tree.$;
    const seen: string[][] = [];
    tree.onPathChange((p) => seen.push([...p]));
    const changed = tree.updateAndReport({
      users: { 1: { id: 1, name: 'X' } },
      other: 2,
    } as never);
    dump('N1', { changed, seen, after: tree() });
  });
});

describe('O: shallow-comparison config and reporting', () => {
  it('O1 useShallowComparison reports honestly', () => {
    const tree = signalTree(
      { o: { a: 1 }, n: Number.NaN },
      { useShallowComparison: true }
    );
    const sameRef = tree.$.o();
    dump('O1', {
      sameRefWrite: tree.updateAndReport({ o: sameRef }),
      newRefEqualWrite: tree.updateAndReport({ o: { a: 1 } }),
      nanWrite: tree.updateAndReport({ n: Number.NaN }),
    });
  });
});

describe('P: onPathChange listener count growth', () => {
  it('P1 destroy() leaves the listener set populated (observable via writes)', () => {
    const tree = signalTree({ count: 0 });
    let calls = 0;
    for (let i = 0; i < 100; i++) tree.onPathChange(() => calls++);
    tree.destroy();
    tree({ count: 1 });
    expect(calls).toBe(0);
  });
});
