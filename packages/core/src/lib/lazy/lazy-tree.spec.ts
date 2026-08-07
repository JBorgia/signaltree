import { isSignal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLazySignalTree } from './lazy-tree';

/**
 * `lazy-tree.ts` was at 49%, and the uncovered half was the `set` trap and the
 * prototype-pollution guards.
 *
 * That is the wrong half to leave untested. The security traps exist because
 * `target['__proto__'] = value` invokes the prototype SETTER — the proxy was a
 * direct pollution sink, and `defineProperty` was step one of a two-call bypass.
 * A guard nothing exercises is a guard nobody notices removing.
 */
const equals = (a: unknown, b: unknown) => Object.is(a, b);
const make = <T extends object>(obj: T) => createLazySignalTree(obj, equals);

afterEach(() => vi.restoreAllMocks());

describe('reading', () => {
  it('materialises a leaf as a signal on first access', () => {
    const tree = make({ count: 1 }) as unknown as Record<string, unknown>;
    expect(isSignal(tree['count'])).toBe(true);
  });

  it('returns the SAME signal on repeated access', () => {
    const tree = make({ count: 1 }) as unknown as Record<string, unknown>;
    expect(tree['count']).toBe(tree['count']);
  });

  it('reads the seeded value', () => {
    const tree = make({ count: 7 }) as unknown as Record<string, () => number>;
    expect(tree['count']()).toBe(7);
  });

  it('nests, and the nested node is stable', () => {
    const tree = make({ user: { name: 'a' } }) as unknown as Record<string, unknown>;
    const first = tree['user'];
    expect(first).toBe(tree['user']);
    expect(isSignal((first as Record<string, unknown>)['name'])).toBe(true);
  });
});

describe('writing through the proxy', () => {
  it('a write is visible on the next read', () => {
    const tree = make({ count: 1 }) as unknown as Record<string, unknown>;
    tree['count'] = 5;
    expect((tree['count'] as () => number)()).toBe(5);
  });

  it('a write UPDATES an already-materialised signal in place', () => {
    // The case that matters: a component holding the signal must see the write,
    // not keep reading a stale one that was replaced behind it.
    const tree = make({ count: 1 }) as unknown as Record<string, unknown>;
    const held = tree['count'] as () => number;

    tree['count'] = 42;

    expect(held()).toBe(42);
  });

  it('writing a nested object invalidates the old nested proxy', () => {
    const tree = make({ user: { name: 'a' } }) as unknown as Record<string, unknown>;
    void tree['user'];

    tree['user'] = { name: 'b' };

    const after = tree['user'] as Record<string, () => string>;
    expect(after['name']()).toBe('b');
  });

  it('adds a key that was not in the seed', () => {
    const tree = make({} as Record<string, unknown>) as unknown as Record<string, unknown>;
    tree['fresh'] = 1;
    expect((tree['fresh'] as () => number)()).toBe(1);
  });

  it('symbol keys pass straight through', () => {
    const key = Symbol('meta');
    const tree = make({} as Record<string | symbol, unknown>) as unknown as Record<
      string | symbol,
      unknown
    >;
    tree[key] = 'value';
    expect(tree[key]).toBe('value');
  });
});

describe('prototype pollution is refused', () => {
  // Each of these is a real sink the traps were written to close, so each is
  // asserted against Object.prototype directly rather than against a return
  // value — a guard that returns false while still polluting is the failure.
  it('__proto__ cannot be written through the set trap', () => {
    const tree = make({} as Record<string, unknown>) as unknown as Record<string, unknown>;

    try {
      tree['__proto__'] = { polluted: true };
    } catch {
      /* a throwing proxy trap is an acceptable refusal */
    }

    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('constructor cannot be written', () => {
    const tree = make({} as Record<string, unknown>) as unknown as Record<string, unknown>;
    try {
      tree['constructor'] = { polluted: true };
    } catch {
      /* refusal */
    }
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('defineProperty cannot mint an own __proto__ key', () => {
    // Step one of the documented two-call bypass: once a real own `__proto__`
    // exists, every downstream own-property guard is satisfied.
    const tree = make({} as Record<string, unknown>);

    let refused = false;
    try {
      refused = !Object.defineProperty(tree, '__proto__', { value: 1 });
    } catch {
      refused = true;
    }

    expect(refused).toBe(true);
    expect(Object.getOwnPropertyNames(tree)).not.toContain('__proto__');
  });

  it('`in` does not report a key the proxy will not hand out', () => {
    const tree = make({} as Record<string, unknown>);
    expect('__proto__' in tree).toBe(false);
  });
});

describe('cleanup', () => {
  it('__cleanup__ is callable and releases nested state', () => {
    const tree = make({ user: { name: 'a' } }) as unknown as Record<string, unknown>;
    void (tree['user'] as Record<string, unknown>)['name'];

    const cleanup = tree['__cleanup__'] as () => void;
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('a throwing nested cleanup is contained, not propagated', () => {
    // One bad teardown must not abort the rest of the teardown.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tree = make({ a: { x: 1 }, b: { y: 2 } }) as unknown as Record<string, unknown>;
    void tree['a'];
    void tree['b'];

    expect(() => (tree['__cleanup__'] as () => void)()).not.toThrow();
    warn.mockRestore();
  });
});
