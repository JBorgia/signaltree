import { signalTree } from '../signal-tree';
import { entityMap } from '../markers/entity-map';
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
  // WITHDRAWN WITH STATUS-DEL — "status() nested under a parent". The subject is
  // registered-marker realization under nesting, UNPROVEN. The entityMap(),
  // stored() and three-levels-deep cases keep independent specimens.

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

  // STATUS-DEL: the status specimen was trimmed; entityMap keeps the
  // deep-nesting property with an independent marker.
  it('markers nested THREE levels deep', () => {
    const tree = signalTree({
      a: { b: { c: { users: entityMap<User>() } } },
    });
    void tree.$;
    const json = JSON.stringify(tree());
    expect(json).not.toContain('initialState');
    expect(json).not.toContain('__isEntityMap');
    expect(typeof tree.$.a.b.c.users.addOne).toBe('function');
  });

  // WITHDRAWN WITH STATUS-DEL — "the accessor and its backing store agree after
  // materialization". `status()` was the only specimen and the subject is
  // generic marker materialization, UNPROVEN.

  it('the internal store back-reference never reaches a snapshot', () => {
    const tree = signalTree({ outer: { n: 1 } });
    void tree.$;
    expect(JSON.stringify(tree())).toBe('{"outer":{"n":1}}');
    expect(Object.keys(tree.$.outer)).toEqual(['n']);
  });
});
