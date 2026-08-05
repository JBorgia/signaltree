import { signalTree } from '../signal-tree';
import { entityMap } from '../markers/entity-map';
import { status } from '../markers/status';
import { stored } from '../markers/stored';

interface User {
  id: number;
  name: string;
}

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

/**
 * RC-2 was generic: materializeMarkers wrote only to the accessor while its
 * call path closed over the original store, so EVERY marker nested under a
 * parent leaked its raw marker into tree(). Only stored() got noticed because
 * its marker carries a Storage handle.
 */
describe('W4: no marker leaks its raw form from a nested position', () => {
  it('status() nested under a parent', () => {
    const tree = signalTree({ outer: { load: status(), n: 1 } });
    void tree.$;
    const json = JSON.stringify(tree());
    expect(json).not.toContain('initialState');
    expect(typeof tree.$.outer.load.setLoading).toBe('function');
  });

  it('entityMap() nested under a parent', () => {
    const tree = signalTree({ outer: { users: entityMap<User>(), n: 1 } });
    void tree.$;
    const json = JSON.stringify(tree());
    expect(json).not.toContain('__isEntityMap');
    expect(typeof tree.$.outer.users.addOne).toBe('function');
  });

  it('stored() nested under a parent', () => {
    const tree = signalTree({
      outer: { theme: stored('w4-theme', 'light', { storage: mockStorage() }) },
    });
    void tree.$;
    expect(JSON.stringify(tree())).not.toContain('defaultValue');
  });

  it('markers nested THREE levels deep', () => {
    const tree = signalTree({
      a: { b: { c: { load: status(), users: entityMap<User>() } } },
    });
    void tree.$;
    const json = JSON.stringify(tree());
    expect(json).not.toContain('initialState');
    expect(json).not.toContain('__isEntityMap');
    expect(typeof tree.$.a.b.c.load.setLoaded).toBe('function');
  });

  it('the accessor and its backing store agree after materialization', () => {
    const tree = signalTree({ outer: { load: status() } });
    void tree.$;
    // Reading through the accessor's call path (which uses the closed-over
    // store) must see the materialized marker, not the raw one.
    const viaCall = (tree.$.outer as unknown as () => unknown)();
    expect(JSON.stringify(viaCall)).not.toContain('initialState');
  });

  it('the internal store back-reference never reaches a snapshot', () => {
    const tree = signalTree({ outer: { n: 1 } });
    void tree.$;
    expect(JSON.stringify(tree())).toBe('{"outer":{"n":1}}');
    expect(Object.keys(tree.$.outer)).toEqual(['n']);
  });
});
