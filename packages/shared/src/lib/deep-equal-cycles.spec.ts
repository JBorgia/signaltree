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
