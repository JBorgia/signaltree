import { computed } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import { byKeys, compared } from './compared';

interface User {
  id: number;
  name: string;
  email: string;
  version: number;
}

const user = (over: Partial<User> = {}): User => ({
  id: 1,
  name: 'Ada',
  email: 'ada@example.com',
  version: 1,
  ...over,
});

describe('compared()', () => {
  it('uses the supplied comparator instead of the tree default', () => {
    const equal = vi.fn((a: User, b: User) => a.id === b.id);
    const tree = signalTree({ user: compared(user(), equal) });

    // Structurally different, but equal by the comparator's rules.
    tree.$.user.set(user({ name: 'Grace', version: 99 }));

    expect(equal).toHaveBeenCalled();
    expect(tree.$.user().name).toBe('Ada');
  });

  it('notifies when the comparator reports a difference', () => {
    const tree = signalTree({
      user: compared(user(), byKeys<User>('id', 'version')),
    });
    const seen: number[] = [];
    const versionOf = computed(() => tree.$.user().version);
    versionOf();

    tree.$.user.set(user({ version: 2 }));
    seen.push(versionOf());
    tree.$.user.set(user({ version: 3 }));
    seen.push(versionOf());

    expect(seen).toEqual([2, 3]);
  });

  it('leaves the tree type and value shape untouched', () => {
    const tree = signalTree({
      user: compared(user(), byKeys<User>('id')),
      count: 0,
    });
    // `compared()` returns T, so this is a plain User at runtime and in types.
    const u: User = tree.$.user();
    expect(u.email).toBe('ada@example.com');
    expect(tree.$.count()).toBe(0);
  });

  it('makes the position a LEAF, not a branch', () => {
    const tree = signalTree({ user: compared(user(), byKeys<User>('id')) });
    // A bare object would produce `tree.$.user.email`; a compared() one does
    // not. (`.name` is unusable for this check — the leaf IS a function, so
    // `.name` resolves to Function.prototype.name.)
    expect(
      (tree.$.user as unknown as Record<string, unknown>)['email']
    ).toBeUndefined();
    expect(tree.$.user().name).toBe('Ada');
  });

  it('survives materialisation through tree()', () => {
    const tree = signalTree({ user: compared(user(), byKeys<User>('id')) });
    expect(tree()).toEqual({ user: user() });
  });

  it('keeps re-fetch correctness that Object.is would lose', () => {
    // The case that rules out defaulting leaves to reference equality: an HTTP
    // response rebuilds an equivalent object with a new identity.
    const tree = signalTree({
      user: compared(user(), byKeys<User>('id', 'version')),
    });
    let recomputes = 0;
    const derived = computed(() => {
      recomputes++;
      return tree.$.user().name;
    });
    derived();
    expect(recomputes).toBe(1);

    for (let i = 0; i < 10; i++) tree.$.user.set(user()); // equivalent re-fetch
    derived();

    expect(recomputes).toBe(1);
  });

  it('rejects a non-function comparator', () => {
    expect(() =>
      compared(user(), undefined as unknown as (a: User, b: User) => boolean)
    ).toThrow(/ST2019/);
  });
});

describe('byKeys()', () => {
  it('compares only the listed keys', () => {
    const eq = byKeys<User>('id', 'version');
    expect(eq(user(), user({ name: 'other', email: 'x@y.z' }))).toBe(true);
    expect(eq(user(), user({ version: 2 }))).toBe(false);
    expect(eq(user(), user({ id: 2 }))).toBe(false);
  });

  it('short-circuits on reference identity', () => {
    const a = user();
    expect(byKeys<User>('id')(a, a)).toBe(true);
  });

  it('handles null and undefined without throwing', () => {
    const eq = byKeys<User>('id');
    expect(eq(null as unknown as User, user())).toBe(false);
    expect(eq(user(), undefined as unknown as User)).toBe(false);
    expect(eq(null as unknown as User, null as unknown as User)).toBe(true);
  });

  it('treats NaN as equal to itself, matching SameValueZero', () => {
    const eq = byKeys<{ n: number }>('n');
    expect(eq({ n: NaN }, { n: NaN })).toBe(true);
  });

  it('rejects an empty key list', () => {
    expect(() => byKeys<User>()).toThrow(/ST2019/);
  });
});
