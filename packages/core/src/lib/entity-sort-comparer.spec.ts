import { entityMap, signalTree } from '../index';

/**
 * #8 — sortComparer parity with @ngrx/entity. When provided, `all`/`ids`
 * expose a stable sorted order regardless of insertion order; `map` keeps
 * insertion order.
 */
interface User {
  id: number;
  name: string;
}

describe('entityMap sortComparer', () => {
  it('keeps all() sorted regardless of insertion order', () => {
    const tree = signalTree({
      users: entityMap<User, number>({
        sortComparer: (a, b) => a.name.localeCompare(b.name),
      }),
    });
    const users = tree.$.users as unknown as {
      addMany: (u: User[]) => void;
      addOne: (u: User) => void;
      all: () => User[];
      ids: () => number[];
    };

    users.addMany([
      { id: 1, name: 'Charlie' },
      { id: 2, name: 'Alice' },
    ]);
    users.addOne({ id: 3, name: 'Bob' });

    expect(users.all().map((u) => u.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    expect(users.ids()).toEqual([2, 3, 1]); // ids follow sorted order
  });

  it('preserves insertion order when no sortComparer is given', () => {
    const tree = signalTree({ users: entityMap<User, number>() });
    const users = tree.$.users as unknown as {
      addMany: (u: User[]) => void;
      all: () => User[];
    };
    users.addMany([
      { id: 1, name: 'Charlie' },
      { id: 2, name: 'Alice' },
    ]);
    expect(users.all().map((u) => u.name)).toEqual(['Charlie', 'Alice']);
  });

  /**
   * `where`/`find` bypass `all()` and scan `storage.values()` directly, which
   * is 3-4x faster and turns `find` from O(N) into O(position) — but ONLY
   * without a sortComparer, because both results are order-dependent.
   *
   * These pin the guarded branch. Before the fast path there was no coverage of
   * where/find under a sortComparer at all, so removing the guard would have
   * gone green while silently returning insertion order.
   */
  const sortedTree = () => {
    const tree = signalTree({
      users: entityMap<User, number>({
        sortComparer: (a, b) => a.name.localeCompare(b.name),
      }),
    });
    const users = tree.$.users as unknown as {
      addMany(e: User[]): void;
      where(p: (u: User) => boolean): () => User[];
      find(p: (u: User) => boolean): () => User | undefined;
    };
    // Insertion order is deliberately the REVERSE of sorted order, so a result
    // that accidentally uses insertion order cannot coincidentally pass.
    users.addMany([
      { id: 1, name: 'Delta' },
      { id: 2, name: 'Charlie' },
      { id: 3, name: 'Bravo' },
      { id: 4, name: 'Alpha' },
    ]);
    return users;
  };

  it('keeps where() in sorted order, not insertion order', () => {
    const users = sortedTree();
    const notDelta = (u: User) => u.name !== 'Delta';
    expect(
      users
        .where(notDelta)()
        .map((u) => u.name)
    ).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('find() returns the first match in SORTED order', () => {
    const users = sortedTree();
    // Every entity matches, so this returns whichever the scan reaches first.
    // Sorted => Alpha (id 4). Insertion order => Delta (id 1).
    const any = () => true;
    expect(users.find(any)()?.name).toBe('Alpha');
  });

  it('without a sortComparer, where/find use insertion order', () => {
    const tree = signalTree({ users: entityMap<User, number>() });
    const users = tree.$.users as unknown as {
      addMany(e: User[]): void;
      where(p: (u: User) => boolean): () => User[];
      find(p: (u: User) => boolean): () => User | undefined;
    };
    users.addMany([
      { id: 1, name: 'Delta' },
      { id: 2, name: 'Charlie' },
      { id: 3, name: 'Bravo' },
    ]);
    const any = () => true;
    expect(
      users
        .where(any)()
        .map((u) => u.name)
    ).toEqual(['Delta', 'Charlie', 'Bravo']);
    expect(users.find(any)()?.name).toBe('Delta');
  });

  it('where/find stay reactive to mutations on the fast path', () => {
    const tree = signalTree({ users: entityMap<User, number>() });
    const users = tree.$.users as unknown as {
      addOne(e: User): void;
      removeOne(id: number): void;
      where(p: (u: User) => boolean): () => User[];
      find(p: (u: User) => boolean): () => User | undefined;
    };
    const isB = (u: User) => u.name.startsWith('B');
    const w = users.where(isB);
    const f = users.find(isB);

    expect(w()).toEqual([]);
    expect(f()).toBeUndefined();

    users.addOne({ id: 1, name: 'Bravo' });
    expect(w().map((u) => u.name)).toEqual(['Bravo']);
    expect(f()?.name).toBe('Bravo');

    users.removeOne(1);
    expect(w()).toEqual([]);
    expect(f()).toBeUndefined();
  });
});
