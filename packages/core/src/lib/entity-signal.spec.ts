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

describe('.empty (canonical bare-name predicate)', () => {
  it('exposes .empty as the canonical bare-name predicate', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );
    expect(api.empty()).toBe(true);
    api.addOne({ id: 1 } as any);
    expect(api.empty()).toBe(false);
    api.clear();
    expect(api.empty()).toBe(true);
  });

  it('caches .empty — repeated access returns the same Signal instance', () => {
    const api = createEntitySignal(
      { selectId: (e: any) => e.id },
      pathNotifier,
      'test'
    );
    expect(api.empty).toBe(api.empty);
    expect(isSignal(api.empty)).toBe(true);
  });
});

describe('replaceOne / node-callable REPLACE semantics (14.1.1)', () => {
  type Row = { id: number; name: string; note?: string };

  function makeApi() {
    return createEntitySignal<Row, number>(
      { selectId: (r) => r.id },
      pathNotifier,
      'rows'
    );
  }

  // The whole reason replace exists: `updateOne` spreads, so it CANNOT remove a
  // key. Assert the observable state, not that a method was reachable.
  it('replaceOne REMOVES a key that updateOne cannot', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'a', note: 'keep me' });

    api.updateOne(1, { name: 'b' } as Partial<Row>);
    expect(api.byId(1)()).toEqual({ id: 1, name: 'b', note: 'keep me' });

    api.replaceOne(1, { id: 1, name: 'c' });
    expect(api.byId(1)()).toEqual({ id: 1, name: 'c' });
    expect('note' in (api.byId(1)() as Row)).toBe(false);
  });

  it('replaceOne preserves list position', () => {
    const api = makeApi();
    api.addMany([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' },
    ]);
    api.replaceOne(2, { id: 2, name: 'REPLACED' });
    expect(api.all().map((r) => r.id)).toEqual([1, 2, 3]);
    expect(api.all().map((r) => r.name)).toEqual(['a', 'REPLACED', 'c']);
  });

  it('replaceOne throws on a missing id rather than inserting', () => {
    const api = makeApi();
    expect(() => api.replaceOne(99, { id: 99, name: 'x' })).toThrow(
      /not found/
    );
    expect(api.count()).toBe(0);
  });

  // The updater form is the argument for replace: it returns a full `E`, so under
  // merge semantics removing a key was silently impossible.
  it('node(updater) REPLACES, so an updater that drops a key drops it', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'a', note: 'gone after this' });
    const node = api.byId(1);

    node((current) => ({ id: current.id, name: current.name.toUpperCase() }));

    expect(api.byId(1)()).toEqual({ id: 1, name: 'A' });
    expect('note' in (api.byId(1)() as Row)).toBe(false);
  });

  it('node(value) REPLACES rather than merging', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'a', note: 'x' });
    api.byId(1)({ id: 1, name: 'z' } as Row);
    expect(api.byId(1)()).toEqual({ id: 1, name: 'z' });
  });

  // `setOne(entity)` was rejected because it would derive the key from the entity.
  // This is the drift it would have written into: after changeId the entity's own
  // id field and the storage key disagree.
  it('changeId can leave entity.id disagreeing with the storage key', () => {
    const api = makeApi();
    api.addOne({ id: 1, name: 'temp' });
    api.changeId(1, 42);

    expect(api.ids()).toEqual([42]);
    // The stored entity still reports its OLD id — this is the drift a
    // `setOne(entity)` would have keyed off.
    expect(api.byId(42)()?.id).toBe(1);
  });
});
