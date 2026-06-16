import { entityMap } from '../index';
import { signalTree } from './signal-tree';

/**
 * #28 — entityMap computed slices are typed on `tree.$`. This spec is BOTH a
 * runtime and a COMPILE-TIME test: the explicit annotations below (`User[]`,
 * `number`) only type-check if TreeNode carries the slice types into
 * EntitySignalWithSlices. Before this, accessing `.active()` required
 * `(tree.$.users as any).active()`. No `as any` appears anywhere here.
 */
interface User {
  id: number;
  name: string;
  active: boolean;
}

describe('entityMap typed computed slices (#28)', () => {
  it('exposes computed slices as typed signals without a cast', () => {
    const tree = signalTree({
      users: entityMap<User, number>()
        .computed('active', (all) => all.filter((u) => u.active))
        .computed('total', (all) => all.length),
    });

    tree.$.users.addMany([
      { id: 1, name: 'A', active: true },
      { id: 2, name: 'B', active: false },
    ]);

    // No `as any`: these must be statically typed via EntitySignalWithSlices.
    const active: User[] = tree.$.users.active();
    const total: number = tree.$.users.total();

    expect(active.map((u) => u.id)).toEqual([1]);
    expect(total).toBe(2);
  });

  it('base entityMap (no slices) keeps its normal typed API', () => {
    const tree = signalTree({ users: entityMap<User, number>() });
    tree.$.users.addOne({ id: 1, name: 'A', active: true });
    // EntitySignal methods are still typed and present.
    const all: User[] = tree.$.users.all();
    const one: User | undefined = tree.$.users.byId(1)?.();
    expect(all.length).toBe(1);
    expect(one?.name).toBe('A');
  });
});
