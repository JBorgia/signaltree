import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { asReadonly } from './readonly';
import { signalTree } from './signal-tree';
import { entityMap } from './markers/entity-map';

interface User {
  id: number;
  name: string;
}

describe('asReadonly()', () => {
  it('is a type-only narrowing — returns the exact same runtime object', () => {
    const tree = signalTree({ count: 0 });
    const reader = asReadonly(tree);

    // Identity, not a wrapper/proxy: WeakSet/WeakMap consumers and enhancer
    // bookkeeping keyed on the tree keep working, and there is zero overhead
    // on the read path (the refuted dev-mode Proxy would have broken both).
    expect(reader).toBe(tree as unknown);
  });

  it('reads work through the readonly view — leaves, branches, snapshot', () => {
    const tree = signalTree({ count: 1, branch: { leaf: 'x' } });
    const reader = asReadonly(tree);

    expect(reader.$.count()).toBe(1);
    expect(reader.$.branch.leaf()).toBe('x');
    expect(reader.$.branch()).toEqual({ leaf: 'x' });
    expect(reader()).toEqual({ count: 1, branch: { leaf: 'x' } });

    // Reads are live: a write through the underlying tree is visible.
    tree.$.count.set(2);
    expect(reader.$.count()).toBe(2);
  });

  it('derived computeds and marker readers remain readable', () => {
    const tree = signalTree({
      count: 2,
      users: entityMap<User, number>(),
    }).derived(($) => ({
      doubled: computed(() => $.count() * 2),
    }));
    const reader = asReadonly(tree);

    expect(reader.$.doubled()).toBe(4);

    tree.$.users.addOne({ id: 1, name: 'Alice' });
    expect(reader.$.users.count()).toBe(1);
    expect(reader.$.users.all()).toEqual([{ id: 1, name: 'Alice' }]);
    expect(reader.$.users.byId(1)?.name()).toBe('Alice');
    expect(reader.$.users.byId(999)).toBeUndefined();
  });

  it('keeps the lifecycle surface — destroyed reflects destroy()', () => {
    const tree = signalTree({ n: 1 });
    const reader = asReadonly(tree);

    expect(reader.destroyed()).toBe(false);
    reader.destroy();
    expect(reader.destroyed()).toBe(true);
  });
});
