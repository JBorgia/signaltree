import { describe, expect, it } from 'vitest';

import { deepEqual } from './deep-equal';

/**
 * `deepEqual` is the DEFAULT leaf comparator, so it runs on every leaf write.
 * Before the cycle guard it recursed forever on a cyclic value and threw
 * `RangeError: Maximum call stack size exceeded`.
 *
 * That was not theoretical. Plain objects become BRANCHES, so a cycle only
 * reaches the comparator inside a value that stays a LEAF — and an array is the
 * ordinary place a parent-pointing node list lives: a file tree, an org chart, a
 * comment thread, an AST. Replacing that leaf crashed the write.
 *
 * Found by reading `fast-equals`, which ships circular support as a SEPARATE
 * entry point — the API shape implied a failure class we had never tested for.
 *
 * The guard activates at a depth no legitimate state reaches (see
 * CYCLE_GUARD_DEPTH), so the flat path allocates nothing. These tests pin both
 * halves: cycles must not crash, and deep ACYCLIC structures past the threshold
 * must still compare correctly.
 */
describe('deepEqual: cyclic values do not crash', () => {
  const selfRef = (name: string) => {
    const a: Record<string, unknown> = { name };
    a['self'] = a;
    return a;
  };

  const parentChild = (name: string) => {
    const parent: Record<string, unknown> = { name };
    const child: Record<string, unknown> = { name: 'c', parent };
    parent['child'] = child;
    return parent;
  };

  /** The shape that actually crashed: a node list with back-references. */
  const nodeList = (rootName: string) => {
    const root: Record<string, unknown> = { name: rootName, children: [] };
    const kid: Record<string, unknown> = { name: 'kid', parent: root };
    (root['children'] as unknown[]).push(kid);
    return [root, kid];
  };

  it('self-reference: equal when equal, unequal when not', () => {
    expect(deepEqual(selfRef('x'), selfRef('x'))).toBe(true);
    expect(deepEqual(selfRef('x'), selfRef('y'))).toBe(false);
  });

  it('parent<->child cycle: equal when equal, unequal when not', () => {
    expect(deepEqual(parentChild('p'), parentChild('p'))).toBe(true);
    expect(deepEqual(parentChild('p'), parentChild('q'))).toBe(false);
  });

  it('an ARRAY LEAF of parent-pointing nodes — the shape that crashed', () => {
    expect(deepEqual(nodeList('root'), nodeList('root'))).toBe(true);
    expect(deepEqual(nodeList('root'), nodeList('other'))).toBe(false);
  });

  it('a cycle nested inside an otherwise flat object', () => {
    const mk = () => {
      const c: Record<string, unknown> = {};
      c['me'] = c;
      return { a: 1, b: { c } };
    };
    expect(deepEqual(mk(), mk())).toBe(true);
  });

  it('a Map value participating in a cycle', () => {
    const mk = () => {
      const m = new Map<string, unknown>();
      const o = { m };
      m.set('k', o);
      return m;
    };
    expect(deepEqual(mk(), mk())).toBe(true);
  });
});

describe('deepEqual: the guard does not break non-cyclic sharing', () => {
  it('a diamond — one object reachable twice — is not treated as a cycle', () => {
    const diamond = () => {
      const shared = { v: 1 };
      return { a: shared, b: shared };
    };
    const notDiamond = () => ({ a: { v: 1 }, b: { v: 2 } });

    expect(deepEqual(diamond(), diamond())).toBe(true);
    expect(deepEqual(diamond(), notDiamond())).toBe(false);
  });

  it('deep ACYCLIC nesting past the guard threshold still compares correctly', () => {
    // 200 levels is well past CYCLE_GUARD_DEPTH, so the WeakMap is live here —
    // and must not make two genuinely different structures compare equal.
    const chain = (leaf: number) => {
      let o: Record<string, unknown> = { leaf };
      for (let i = 0; i < 200; i++) o = { child: o };
      return o;
    };
    expect(deepEqual(chain(1), chain(1))).toBe(true);
    expect(deepEqual(chain(1), chain(2))).toBe(false);
  });
});

/**
 * A FALSE EQUAL is the dangerous direction for a signal comparator: a genuine
 * change reported as no-change means the write is dropped and nothing notifies.
 *
 * `Object.keys` yields own enumerable keys, but the old code asked `key in objB`,
 * which is true for INHERITED ones — so two objects with different own-key sets
 * compared equal whenever a prototype covered the difference, and the extra key
 * on the right-hand side was never examined at all.
 *
 * Found by reading fast-deep-equal, which uses `hasOwnProperty` for this reason.
 */
describe('deepEqual: own keys only, never inherited', () => {
  it('objects with DIFFERENT own-key sets are not equal', () => {
    const a = { shared: 1, own: 2 };
    const b: Record<string, unknown> = Object.create({ shared: 1 });
    b['own'] = 2;
    b['extra'] = 3;

    // The trap: key COUNTS match, and every key of `a` is `in` `b`.
    expect(Object.keys(a)).toHaveLength(Object.keys(b).length);
    expect('shared' in b).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(b, 'shared')).toBe(false);

    expect(deepEqual(a, b)).toBe(false);
  });

  it('an inherited property does not stand in for a missing own one', () => {
    const a = { p: 9 };
    const b = Object.create({ p: 9 }) as Record<string, unknown>;
    expect(deepEqual(a, b)).toBe(false); // b has NO own keys
  });

  it('matching own keys still compare equal regardless of prototype', () => {
    const a = Object.create({ ignored: 1 }) as Record<string, unknown>;
    const b = Object.create({ ignored: 2 }) as Record<string, unknown>;
    a['x'] = 1;
    b['x'] = 1;
    expect(deepEqual(a, b)).toBe(true);
  });
});

/**
 * The constructor gate (14.0.0).
 *
 * These four pairs used to compare EQUAL, and a signal's `equal` returning true
 * DROPS the write. The gate is chosen on that asymmetry: a wrongly-unequal
 * verdict costs one redundant notification, a wrongly-equal one loses state
 * silently. This suite exists so the stricter answers cannot regress back to
 * "convenient" without someone deleting a test that says why.
 */
describe('deepEqual: the constructor gate', () => {
  class Row {
    constructor(public id: number, public name: string) {}
  }

  it('a class instance never equals a plain object with the same fields', () => {
    expect(deepEqual(new Row(1, 'a'), { id: 1, name: 'a' } as never)).toBe(
      false
    );
  });

  it('but two instances of the SAME class still compare by value', () => {
    expect(deepEqual(new Row(1, 'a'), new Row(1, 'a'))).toBe(true);
    expect(deepEqual(new Row(1, 'a'), new Row(2, 'a'))).toBe(false);
  });

  it('a null-prototype object never equals a plain object', () => {
    const bare = Object.assign(Object.create(null), { id: 1 });
    expect(deepEqual(bare, { id: 1 })).toBe(false);
  });

  it('two null-prototype objects still compare by value', () => {
    const a = Object.assign(Object.create(null), { id: 1 });
    const b = Object.assign(Object.create(null), { id: 1 });
    const c = Object.assign(Object.create(null), { id: 2 });
    expect(deepEqual(a, b)).toBe(true);
    expect(deepEqual(a, c)).toBe(false);
  });

  it('a prototype-forged Date never equals a plain object', () => {
    // No [[DateValue]], so `Object.prototype.toString` reported this as
    // "[object Object]" and the old gate let it through to a key comparison
    // that found nothing to disagree about. A strict correctness fix.
    expect(deepEqual(Object.create(Date.prototype), {})).toBe(false);
  });

  it('still rejects a built-in on one side only', () => {
    // The job the gate this replaced existed to do. None of these has own
    // enumerable keys, so without a gate the key comparison calls them equal.
    expect(deepEqual(new Date(0) as never, {} as never)).toBe(false);
    expect(deepEqual(new Uint8Array(0) as never, {} as never)).toBe(false);
    expect(deepEqual(new Map() as never, {} as never)).toBe(false);
  });

  it('an object with its OWN `constructor` key is compared, not gated out', () => {
    expect(deepEqual({ constructor: 'x' }, { constructor: 'x' })).toBe(true);
    expect(deepEqual({ constructor: 'x' }, { constructor: 'y' })).toBe(false);
  });

  it('a Proxy that throws on `get` reports unequal instead of escaping', () => {
    // This is a signal's `equal`. A throw here does not fail a comparison, it
    // fails the WRITE — so the gate swallows and answers "changed", which is
    // the recoverable direction.
    const hostile = new Proxy(
      { id: 1 },
      {
        get() {
          throw new Error('no');
        },
      }
    );
    expect(() => deepEqual(hostile, { id: 1 })).not.toThrow();
    expect(deepEqual(hostile, { id: 1 })).toBe(false);
  });
});
