import { afterEach, describe, expect, it, vi } from 'vitest';
import { signalTree, serialization, persistence } from '../../index';

const trees: Array<{ destroy(): void }> = [];
function ownedTree<T extends Record<string, unknown>>(initial: T) {
  const tree = signalTree(initial);
  trees.push(tree);
  return tree;
}

const marker = '__st_security_probe__';
const payload = (path: string, targetPath = 'safe') => ({
  data: { value: 9, safe: { ok: true }, slot: null },
  metadata: {
    version: '2.0.0',
    timestamp: 0,
    circularRefs: [{ path, targetPath }],
  },
});

afterEach(() => {
  for (const tree of trees.splice(0)) tree.destroy();
  Reflect.deleteProperty(Object.prototype, marker);
  Reflect.deleteProperty(Array.prototype, marker);
  vi.restoreAllMocks();
});

describe('sequential circular-reference preflight', () => {
  for (const initialB of [null, { x: 2 }]) {
    for (const entry of ['deserialize', 'restore', 'load'] as const) {
      it(`${entry} resolves later targets through earlier assignments (${JSON.stringify(
        initialB
      )})`, async () => {
        const input = {
          data: { a: { x: 1 }, b: initialB, c: null },
          metadata: {
            version: '2.0.0',
            timestamp: 0,
            circularRefs: [
              { path: 'b', targetPath: 'a' },
              { path: 'c', targetPath: 'b' },
            ],
          },
        };
        const tree = ownedTree({ a: { x: 0 }, b: { x: 0 }, c: { x: 0 } }).with(
          persistence({
            key: 'sequence',
            autoLoad: false,
            autoSave: false,
            storage: {
              getItem: () => JSON.stringify(input),
              setItem: () => undefined,
              removeItem: () => undefined,
            },
          })
        );
        if (entry === 'load') await tree.load();
        else if (entry === 'restore') tree.restore(input);
        else tree.deserialize(JSON.stringify(input));
        expect(tree.$.b.x()).toBe(1);
        expect(tree.$.c.x()).toBe(1);
        if (entry === 'restore') {
          expect(input.data.b).toBe(input.data.a);
          expect(input.data.c).toBe(input.data.a);
        }
      });
    }
  }

  it('resolves later destination parents through earlier aliases', () => {
    const input = {
      data: { a: { slot: null }, b: null, safe: { ok: true } },
      metadata: {
        version: '2.0.0',
        timestamp: 0,
        circularRefs: [
          { path: 'b', targetPath: 'a' },
          { path: 'b.slot', targetPath: 'safe' },
        ],
      },
    };
    ownedTree({ value: 1 }).with(serialization()).restore(input);
    expect(input.data.b).toBe(input.data.a);
    expect(input.data.a.slot).toBe(input.data.safe);
  });

  it('keeps detached destinations and reads the most recent assignment', () => {
    const original = { slot: null };
    const replacement = { slot: null };
    const input = {
      data: { a: original, b: replacement, safe: { ok: true }, c: null },
      metadata: {
        version: '2.0.0',
        timestamp: 0,
        circularRefs: [
          { path: 'a.slot', targetPath: 'safe' },
          { path: 'a', targetPath: 'b' },
          { path: 'a.slot', targetPath: 'safe' },
          { path: 'c', targetPath: 'a.slot' },
        ],
      },
    };
    ownedTree({ value: 1 }).with(serialization()).restore(input);
    expect(original.slot).toBe(input.data.safe);
    expect(replacement.slot).toBe(input.data.safe);
    expect(input.data.a).toBe(replacement);
    expect(input.data.c).toBe(input.data.safe);
  });

  for (const invalidPath of ['b.missing', 'b.__proto__.x', 'rows.length']) {
    it(`does not commit earlier aliases when later validation fails at ${invalidPath}`, () => {
      const input = {
        data: { a: { slot: null }, b: null, safe: { ok: true }, rows: [] },
        metadata: {
          version: '2.0.0',
          timestamp: 0,
          circularRefs: [
            { path: 'b', targetPath: 'a' },
            { path: 'b.slot', targetPath: 'safe' },
            { path: invalidPath, targetPath: 'safe' },
          ],
        },
      };
      const tree = ownedTree({ value: 1 }).with(serialization());
      expect(() => tree.restore(input)).toThrow(
        'Invalid circular reference metadata'
      );
      expect(input.data.b).toBeNull();
      expect(input.data.a.slot).toBeNull();
      expect(input.data.rows).toEqual([]);
      expect(tree.$.value()).toBe(1);
    });
  }

  it('rejects object assignment to array length before any snapshot mutation', () => {
    const input = {
      data: { slot: null, safe: { ok: true }, rows: [] },
      metadata: {
        version: '2.0.0',
        timestamp: 0,
        circularRefs: [
          { path: 'slot', targetPath: 'safe' },
          { path: 'rows.length', targetPath: 'safe' },
        ],
      },
    };
    const tree = ownedTree({ value: 1 }).with(serialization());
    expect(() => tree.restore(input)).toThrow(
      'Invalid circular reference metadata'
    );
    expect(input.data.slot).toBeNull();
    expect(tree.$.value()).toBe(1);
  });
});

describe('reserved-name compatibility disposition', () => {
  // Deliberate security restriction: own reserved names are rejected too,
  // including circular metadata emitted by the existing serializer for Maps.
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    for (const side of ['destination', 'target']) {
      it(`rejects an own ${key} ${side} without changing the snapshot`, () => {
        const data = JSON.parse(`{"${key}":{},"safe":{},"slot":null}`);
        const input = {
          data,
          metadata: {
            version: '2.0.0',
            timestamp: 0,
            circularRefs: [
              {
                path: side === 'destination' ? key : 'slot',
                targetPath: side === 'target' ? key : 'safe',
              },
            ],
          },
        };
        const before = JSON.stringify(input);
        expect(() =>
          ownedTree({ value: 1 }).with(serialization()).restore(input)
        ).toThrow('Invalid circular reference metadata');
        expect(JSON.stringify(input)).toBe(before);
      });
    }
  }
});

describe('own data properties only', () => {
  for (const location of [
    'reference',
    'path',
    'targetPath',
    'destination',
    'target',
  ] as const) {
    it(`rejects an accessor at ${location} without invoking it or changing input`, () => {
      const input = payload('slot');
      const access = vi.fn(() =>
        location === 'reference' ? { path: 'slot', targetPath: 'safe' } : 'safe'
      );
      const ref = { path: 'slot', targetPath: 'safe' };
      input.metadata.circularRefs.push(ref);
      if (location === 'reference')
        Object.defineProperty(input.metadata.circularRefs, '1', {
          get: access,
        });
      else if (location === 'path' || location === 'targetPath')
        Object.defineProperty(ref, location, { get: access });
      else
        Object.defineProperty(
          input.data,
          location === 'destination' ? 'slot' : 'safe',
          { get: access }
        );
      const tree = ownedTree({ value: 1 }).with(serialization());
      expect(() => tree.restore(input)).toThrow(
        'Invalid circular reference metadata'
      );
      expect(access).not.toHaveBeenCalled();
      if (location !== 'destination') expect(input.data.slot).toBeNull();
      expect(tree.$.value()).toBe(1);
    });
  }

  it('rejects sparse reference lists before committing valid earlier entries', () => {
    const input = payload('slot');
    input.metadata.circularRefs.length = 2;
    expect(() =>
      ownedTree({ value: 1 }).with(serialization()).restore(input)
    ).toThrow('Invalid circular reference metadata');
    expect(input.data.slot).toBeNull();
  });

  it('rejects non-writable own destinations before committing valid earlier entries', () => {
    const input = payload('slot');
    Object.defineProperty(input.data.safe, 'ok', {
      value: false,
      writable: false,
    });
    input.metadata.circularRefs.push({ path: 'safe.ok', targetPath: 'safe' });
    expect(() =>
      ownedTree({ value: 1 }).with(serialization()).restore(input)
    ).toThrow('Invalid circular reference metadata');
    expect(input.data.slot).toBeNull();
    expect(input.data.safe.ok).toBe(false);
  });
});

describe('existing circular codec boundary', () => {
  for (const kind of ['object', 'array'] as const) {
    it(`restores recursive ${kind} data through every public entry`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const data = { value: 9, rows: [null] };
      const path = 'rows[0]';
      const targetPath = kind === 'object' ? '' : 'rows';
      const input = {
        data,
        metadata: {
          version: '2.0.0',
          timestamp: 0,
          circularRefs: [{ path, targetPath }],
        },
      };
      const json = JSON.stringify(input);
      const tree = ownedTree({ value: 1, rows: [] as unknown[] }).with(
        persistence({
          key: 'cycle',
          autoLoad: false,
          autoSave: false,
          storage: {
            getItem: () => json,
            setItem: () => undefined,
            removeItem: () => undefined,
          },
        })
      );
      const check = () => {
        expect(tree.$.value()).toBe(9);
        const rows = tree.$.rows();
        if (kind === 'array') expect(rows[0]).toBe(rows);
        else expect((rows[0] as { rows: unknown[] }).rows).toBe(rows);
      };
      tree.restore(input);
      check();
      tree.deserialize(json);
      check();
      await tree.load();
      check();
    });
  }

  it('restores cycles passed directly to fromJSON', () => {
    const rows: unknown[] = [];
    rows.push(rows);
    const tree = ownedTree({ rows: [] as unknown[] }).with(serialization());
    tree.fromJSON({ rows });
    expect(tree.$.rows()[0]).toBe(tree.$.rows());
    expect(tree.$.rows()).not.toBe(rows);
  });

  for (const kind of ['map', 'set'] as const) {
    it(`preserves existing ${kind} member cycles`, () => {
      const member: { self?: unknown } = {};
      member.self = member;
      const value =
        kind === 'map' ? new Map([['x', member]]) : new Set([member]);
      const source = ownedTree({ value }).with(serialization());
      const target = ownedTree({
        value: kind === 'map' ? new Map() : new Set(),
      }).with(serialization());
      target.deserialize(source.serialize());
      const restored = target.$.value().values().next().value;
      expect(restored).toBeDefined();
      expect(restored?.self).toBe(restored);
    });
  }
});

describe('admitted cyclic leaf round trips', () => {
  const cyclicRows = () => {
    const rows: unknown[] = [];
    rows.push(rows);
    return rows;
  };
  for (const preserveTypes of [true, false]) {
    it(`round-trips a self-referencing array leaf (preserveTypes=${preserveTypes})`, () => {
      const rows = cyclicRows();
      const source = ownedTree({ rows }).with(serialization({ preserveTypes }));
      expect(source.$.rows()).toBe(rows);
      expect(source().rows).toBe(rows);
      const target = ownedTree({ rows: [] as unknown[] }).with(serialization());
      const json = source.serialize();
      target.deserialize(json);
      const restored = target.$.rows();
      expect(restored).not.toBe(rows);
      expect(restored[0]).toBe(restored);
      expect(rows[0]).toBe(rows);
    });

    it(`does not mistake repeated acyclic siblings for backreferences (preserveTypes=${preserveTypes})`, () => {
      const value = { n: 7 };
      const source = ownedTree({ rows: [value, value] }).with(
        serialization({ preserveTypes })
      );
      const target = ownedTree({ rows: [] as unknown[] }).with(serialization());
      target.deserialize(source.serialize());
      expect(target.$.rows()).toEqual([{ n: 7 }, { n: 7 }]);
    });

    it(`round-trips nested array cycles with metadata omitted (preserveTypes=${preserveTypes})`, () => {
      const source = ownedTree({ nested: { rows: cyclicRows() } }).with(
        serialization({ preserveTypes, includeMetadata: false })
      );
      const target = ownedTree({ nested: { rows: [] as unknown[] } }).with(
        serialization()
      );
      const json = source.serialize();
      expect(JSON.parse(json).metadata).toBeUndefined();
      target.deserialize(json);
      expect(target.$.nested.rows()[0]).toBe(target.$.nested.rows());
    });
  }

  for (const segment of ['__proto__', 'constructor', 'prototype']) {
    it(`rejects an inline ${segment} reference without metadata`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const tree = ownedTree({ value: 1 }).with(serialization());
      expect(() =>
        tree.deserialize(
          JSON.stringify({ data: { value: 9, slot: { '§c': segment } } })
        )
      ).toThrow('Invalid circular reference metadata');
      expect(tree.$.value()).toBe(1);
    });
    it(`rejects an inline reference destination containing ${segment}`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const data: unknown = JSON.parse(
        `{"value":9,"safe":{},"${segment}":{"§c":"safe"}}`
      );
      const tree = ownedTree({ value: 1 }).with(serialization());
      expect(() => tree.deserialize(JSON.stringify({ data }))).toThrow(
        'Invalid circular reference metadata'
      );
      expect(tree.$.value()).toBe(1);
      expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
    });
  }

  it('validates inline target types through the same resolver', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tree = ownedTree({ value: 1 }).with(serialization());
    expect(() =>
      tree.deserialize('{"data":{"value":9,"slot":{"§c":42}}}')
    ).toThrow('Invalid circular reference metadata');
    expect(tree.$.value()).toBe(1);
  });

  it('keeps handleCircular=false omission behavior without encoder recursion', () => {
    const source = ownedTree({ rows: cyclicRows() }).with(
      serialization({ handleCircular: false })
    );
    const target = ownedTree({ rows: [] as unknown[] }).with(serialization());
    target.deserialize(source.serialize());
    expect(target.$.rows()).toEqual([null]);
  });

  it('round-trips object cycles and special types inside an admitted array leaf', () => {
    const value: { self?: unknown; date: Date; big: bigint } = {
      date: new Date('2020-01-01T00:00:00Z'),
      big: 42n,
    };
    value.self = value;
    const source = ownedTree({ rows: [value] }).with(serialization());
    const target = ownedTree({ rows: [] as (typeof value)[] }).with(
      serialization()
    );
    target.deserialize(source.serialize());
    const restored = target.$.rows()[0];
    expect(restored.self).toBe(restored);
    expect(restored.date).toEqual(value.date);
    expect(restored.big).toBe(42n);
  });

  it('round-trips mutual array cycles', () => {
    const left: unknown[] = [];
    const right = [left];
    left.push(right);
    const source = ownedTree({ rows: left }).with(serialization());
    const target = ownedTree({ rows: [] as unknown[] }).with(serialization());
    target.deserialize(source.serialize());
    const rows = target.$.rows();
    expect((rows[0] as unknown[])[0]).toBe(rows);
  });

  for (const kind of ['map', 'set'] as const) {
    it(`round-trips an admitted self-referencing ${kind}`, () => {
      const map = new Map<string, unknown>();
      const set = new Set<unknown>();
      const value = kind === 'map' ? map : set;
      if (kind === 'map') map.set('self', map);
      else set.add(set);
      const source = ownedTree({ value }).with(serialization());
      const target = ownedTree({
        value: kind === 'map' ? new Map() : new Set(),
      }).with(serialization());
      target.deserialize(source.serialize());
      const restored = target.$.value();
      expect(restored.values().next().value).toBe(restored);
    });

    it(`round-trips a cycle from an array through a ${kind} back to the array`, () => {
      const rows: unknown[] = [];
      const value =
        kind === 'map' ? new Map([['rows', rows]]) : new Set([rows]);
      rows.push(value);
      const source = ownedTree({ rows }).with(serialization());
      const target = ownedTree({ rows: [] as unknown[] }).with(serialization());
      target.deserialize(source.serialize());
      const restored = target.$.rows();
      const collection = restored[0] as Map<string, unknown> | Set<unknown>;
      expect(collection.values().next().value).toBe(restored);
    });
  }

  it('round-trips a cyclic array through snapshot and restore', () => {
    const source = ownedTree({ rows: cyclicRows() }).with(serialization());
    const target = ownedTree({ rows: [] as unknown[] }).with(serialization());
    target.restore(source.snapshot());
    expect(target.$.rows()[0]).toBe(target.$.rows());
  });

  it('round-trips a cyclic array through persistence save and load', async () => {
    let saved = '';
    const config = {
      key: 'cyclic',
      autoLoad: false,
      autoSave: false,
      storage: {
        getItem: () => saved,
        setItem: (_key: string, value: string) => {
          saved = value;
        },
        removeItem: () => undefined,
      },
    };
    const source = ownedTree({ rows: cyclicRows() }).with(persistence(config));
    const target = ownedTree({ rows: [] as unknown[] }).with(
      persistence(config)
    );
    await source.save();
    await target.load();
    expect(target.$.rows()[0]).toBe(target.$.rows());
  });

  it('characterizes plain branch cycles failing in tree construction before serialization', () => {
    const branch: { self?: unknown } = {};
    branch.self = branch;
    expect(() => signalTree({ branch })).toThrow();
  });
});

describe('untrusted circular-reference metadata', () => {
  for (const path of [
    `constructor.prototype.${marker}`,
    `__proto__.${marker}`,
    `safe.__proto__.${marker}`,
    `slot.__proto__`,
    `safe.prototype.${marker}`,
  ]) {
    it(`rejects dangerous destination ${path} without changing state or prototypes`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const tree = ownedTree({ value: 1 }).with(serialization());
      let error: unknown;
      try {
        tree.deserialize(JSON.stringify(payload(path)));
      } catch (e) {
        error = e;
      }
      expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
      expect(Object.hasOwn(Array.prototype, marker)).toBe(false);
      expect(tree.$.value()).toBe(1);
      expect(error).toBeInstanceOf(Error);
    });
  }
  for (const target of [
    'constructor.prototype',
    '__proto__',
    'toString',
    'safe.constructor',
  ]) {
    it(`rejects inherited or unsafe reference target ${target}`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const tree = ownedTree({ value: 1 }).with(serialization());
      expect(() =>
        tree.deserialize(JSON.stringify(payload('slot', target)))
      ).toThrow();
      expect(tree.$.value()).toBe(1);
    });
  }
  it('protects restore as well as deserialize', () => {
    const tree = ownedTree({ value: 1 }).with(serialization());
    const input = payload(`constructor.prototype.${marker}`);
    let error: unknown;
    try {
      tree.restore(input);
    } catch (e) {
      error = e;
    }
    expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
    expect(tree.$.value()).toBe(1);
    expect(error).toBeInstanceOf(Error);
  });
  it('protects persistence loading with default circular handling', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tree = ownedTree({ value: 1 }).with(
      persistence({
        key: 'test',
        autoLoad: false,
        autoSave: false,
        storage: {
          getItem: () =>
            JSON.stringify(payload(`constructor.prototype.${marker}`)),
          setItem: () => undefined,
          removeItem: () => undefined,
        },
      })
    );
    let error: unknown;
    try {
      await tree.load();
    } catch (e) {
      error = e;
    }
    expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
    expect(tree.$.value()).toBe(1);
    expect(error).toBeInstanceOf(Error);
  });
  it('continues to accept ordinary own-object references', () => {
    const tree = ownedTree({
      value: 1,
      safe: { ok: false },
      slot: { ok: false },
    }).with(serialization());
    tree.deserialize(JSON.stringify(payload('slot')));
    expect(tree.$.value()).toBe(9);
    expect(tree.$.slot.ok()).toBe(true);
  });
  it('validates the entire restore metadata before changing its input', () => {
    const tree = ownedTree({ value: 1 }).with(serialization());
    const input = payload('slot');
    input.metadata.circularRefs.push({
      path: `constructor.prototype.${marker}`,
      targetPath: 'safe',
    });
    expect(() => tree.restore(input)).toThrow();
    expect(input.data.slot).toBeNull();
    expect(tree.$.value()).toBe(1);
  });
  it('supports bracketed array references without traversing prototypes', () => {
    const tree = ownedTree({ rows: [{ ok: false }, { ok: false }] }).with(
      serialization()
    );
    tree.deserialize(
      JSON.stringify({
        data: { rows: [{ ok: true }, null] },
        metadata: {
          circularRefs: [{ path: 'rows[1]', targetPath: 'rows[0]' }],
        },
      })
    );
    expect(tree.$.rows()[1].ok).toBe(true);
  });
  for (const path of ['missing.slot', 'safe.missing', '']) {
    it(`rejects missing destination ${path}`, () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const tree = ownedTree({ value: 1 }).with(serialization());
      expect(() => tree.deserialize(JSON.stringify(payload(path)))).toThrow();
      expect(tree.$.value()).toBe(1);
    });
  }
});
