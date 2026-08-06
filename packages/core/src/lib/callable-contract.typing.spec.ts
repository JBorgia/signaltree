/**
 * TYPE-TEST — compile-time only. Checked by `tsc` (`npm run typecheck`),
 * EXCLUDED from vitest (the `*typing*.spec.ts` ignore).
 *
 * The runtime half lives in `callable-contract.spec.ts`. This is the half that
 * matters most, because the 13.x defect was precisely that the TYPE permitted a
 * call the runtime ignored.
 *
 * `@ts-expect-error` is the right tool here: if a leaf ever becomes callable-as-
 * setter again, these lines stop erroring and `tsc` fails on the unused
 * expectation. The assertion cannot silently stop testing anything.
 */
import { signalTree } from './signal-tree';

const tree = signalTree({
  count: 0,
  name: 'John',
  tags: ['a'] as string[],
  user: { name: 'John', age: 30 },
});

// --- LEAVES: calling with an argument must NOT compile ----------------------
// @ts-expect-error a leaf is an Angular signal; calling it is a read (14.0.0)
tree.$.count(5);
// @ts-expect-error updater form is gone with it
tree.$.count((c: number) => c + 1);
// @ts-expect-error string leaf
tree.$.name('Jane');
// @ts-expect-error an array is a leaf too
tree.$.tags(['b']);
// @ts-expect-error a leaf nested under a branch is still a leaf
tree.$.user.name('Bob');

// --- LEAVES: reads and the real writers still compile -----------------------
export const _leafReads: [number, string, string[]] = [
  tree.$.count(),
  tree.$.name(),
  tree.$.tags(),
];
tree.$.count.set(5);
tree.$.count.update((c) => c + 1);
tree.$.name.set('Jane');
tree.$.tags.update((c) => [...c, 'b']);

// --- BRANCHES: still callable both directions -------------------------------
export const _branchRead: { name: string; age: number } = tree.$.user();
tree.$.user({ name: 'Bob' });
tree.$.user((c) => ({ ...c, age: c.age + 1 }));

// --- ROOT: still callable ---------------------------------------------------
tree({ count: 1 });
