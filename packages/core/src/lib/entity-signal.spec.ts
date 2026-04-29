import { isSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { createEntitySignal } from './entity-signal';

// Minimal PathNotifier stub
const pathNotifier = {
  notify: () => {
    /* empty */
  },
} as any;

describe('EntityNode field writes (Option B+ computed-based shim)', () => {
  type User = { id: number; name: string; active: boolean };

  function makeApi() {
    return createEntitySignal<User, number>(
      { selectId: (u) => u.id },
      pathNotifier,
      'users'
    );
  }

  it('field property is an Angular signal (isSignal returns true)', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1);
    expect(node).toBeDefined();
    expect(isSignal(node!.name)).toBe(true);
  });

  it('field property reads current value reactively', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    expect(api.byId(1)!.name()).toBe('Alice');
  });

  it('.set() updates a field and is reflected in reactive queries', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    api.byId(1)!.name.set('Bob');
    expect(api.byId(1)!.name()).toBe('Bob');
    expect(api.all()[0].name).toBe('Bob');
  });

  it('.update() applies an updater function to a field', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'alice', active: true });
    api.byId(1)!.name.update((n) => n!.toUpperCase());
    expect(api.byId(1)!.name()).toBe('ALICE');
  });

  it('.asReadonly() returns the underlying computed signal', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const ro = api.byId(1)!.name.asReadonly();
    expect(isSignal(ro)).toBe(true);
    expect(ro()).toBe('Alice');
  });

  it('interceptors still fire on field .set()', () => {
    const api = makeApi();
    const intercepted: string[] = [];
    api.intercept({
      onUpdate: (id, changes) => {
        intercepted.push(String(id));
      },
    });
    api.addOne({ id: 1, name: 'Alice', active: true });
    api.byId(1)!.name.set('Bob');
    expect(intercepted).toContain('1');
  });

  it('entity-level callable getter returns current entity reactively', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1)!;
    expect(node()).toEqual({ id: 1, name: 'Alice', active: true });
  });

  it('entity-level callable setter replaces entity via updateOne', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1)!;
    (node as unknown as (v: User) => void)({ id: 1, name: 'Bob', active: false });
    expect(api.byId(1)!.name()).toBe('Bob');
    expect(api.byId(1)!.active()).toBe(false);
  });

  it('entity-level callable updater applies function to current entity', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'alice', active: false });
    const node = api.byId(1)!;
    (node as unknown as (fn: (u: User) => User) => void)(
      (u) => ({ ...u, name: u.name.toUpperCase(), active: true })
    );
    expect(api.byId(1)!.name()).toBe('ALICE');
    expect(api.byId(1)!.active()).toBe(true);
  });

  it('field .set() throws on stale node (entity removed)', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1)!;
    api.removeOne(1);
    expect(() => node.name.set('Bob')).toThrow('not found');
  });

  it('entity-level callable write throws on stale node (entity removed)', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'Alice', active: true });
    const node = api.byId(1)!;
    api.removeOne(1);
    expect(() =>
      (node as unknown as (v: User) => void)({ id: 1, name: 'Bob', active: false })
    ).toThrow('not found');
  });
});

describe('addMany() mode option (F-011)', () => {
  type Item = { id: number; name: string };

  function makeApi() {
    return createEntitySignal<Item, number>(
      { selectId: (i) => i.id },
      pathNotifier,
      'items'
    );
  }

  it('strict (default) throws on duplicate', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'A' });
    expect(() => api.addMany([{ id: 1, name: 'B' }, { id: 2, name: 'C' }])).toThrow('already exists');
  });

  it('skip silently omits duplicates and returns only newly added ids', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'original' });
    const ids = api.addMany([{ id: 1, name: 'ignored' }, { id: 2, name: 'new' }], { mode: 'skip' });
    expect(ids).toEqual([2]);
    expect(api.byId(1)!.name()).toBe('original');
    expect(api.count()).toBe(2);
  });

  it('overwrite replaces existing entities', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'old' });
    const ids = api.addMany([{ id: 1, name: 'replaced' }, { id: 2, name: 'new' }], { mode: 'overwrite' });
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(api.byId(1)!.name()).toBe('replaced');
    expect(api.count()).toBe(2);
  });

  it('skip with all duplicates returns empty array', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'A' });
    const ids = api.addMany([{ id: 1, name: 'B' }], { mode: 'skip' });
    expect(ids).toEqual([]);
    expect(api.count()).toBe(1);
  });
});

describe('EntitySignal predicate caching', () => {
  it('returns the same signal for identical predicate references', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );

    const isActive = (u: any) => u.active === true;

    const s1 = api.where(isActive);
    const s2 = api.where(isActive);

    expect(s1).toBe(s2);
  });

  it('does not conflate distinct predicate references', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );

    const s1 = api.where((u: any) => u.active === true);
    const s2 = api.where((u: any) => u.active === true);

    expect(s1).not.toBe(s2);
  });

  it('cached computed reflects mutations', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );

    const isActive = (u: any) => u.active === true;
    const s = api.where(isActive);

    expect(s()).toEqual([]);

    api.addOne({ id: 1, active: false } as any);
    expect(s()).toEqual([]);

    api.updateOne(1 as any, { active: true } as any);
    expect(s()).toEqual([{ id: 1, active: true }]);
  });
});
