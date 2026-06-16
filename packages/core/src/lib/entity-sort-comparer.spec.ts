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
});
