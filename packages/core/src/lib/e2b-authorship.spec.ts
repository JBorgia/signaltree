import { describe, expect, it } from 'vitest';

import { signalTree } from '../index';

/**
 * E2-B — FALSIFYING E2's OWN NULL. Two independent holes.
 *
 * `e2-precision-null.spec.ts` claimed "write-set precision is snapshot-derivable"
 * on the strength of P1. Its `undoTurn` decides ownership like this:
 *
 *     if (get(current, p) === get(turn.after, p)) revert(p)
 *
 * i.e. it infers *"this turn still owns the position"* from **value equality**.
 * That implication is false, and it is the exact distinction the causal
 * architecture exists to preserve:
 *
 *     value equality  =/=  causal authorship
 *
 * HOLE 1 (ABA): later work can return a position to the same value the reverted
 * turn wrote, without the reverted turn being the author of it.
 *
 * HOLE 2 (nested clobber): the P3 "rollback rewrites history" repair spreads a
 * `patch()` over the retained root, so a nested path replaces its whole parent
 * branch and siblings disappear. The scalar P3 never exercised it.
 *
 * Both are reproduced below against the SAME algorithm, unchanged.
 */

type Root = Record<string, unknown>;

function writeSet(before: unknown, after: unknown, prefix = ''): string[] {
  if (before === after) return [];
  const bothObjects =
    before !== null &&
    after !== null &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after);
  if (!bothObjects) return [prefix];
  const keys = new Set([
    ...Object.keys(before as Root),
    ...Object.keys(after as Root),
  ]);
  const out: string[] = [];
  for (const k of keys) {
    out.push(
      ...writeSet(
        (before as Root)[k],
        (after as Root)[k],
        prefix ? `${prefix}.${k}` : k
      )
    );
  }
  return out;
}

const get = (root: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc as Root)?.[k], root);

const patch = (path: string, value: unknown): Root =>
  path.split('.').reduceRight<unknown>((acc, k) => ({ [k]: acc }), value) as Root;

interface Turn {
  id: string;
  before: Root;
  after: Root;
}

/** UNCHANGED from e2-precision-null.spec.ts — this is the thing under test. */
function undoTurn(turn: Turn, current: Root): Root[] {
  const patches: Root[] = [];
  for (const p of writeSet(turn.before, turn.after)) {
    if (get(current, p) === get(turn.after, p)) {
      patches.push(patch(p, get(turn.before, p)));
    }
  }
  return patches;
}

// ============================================================================
// HOLE 1 — ABA. Value equality authorises a reversal it has no right to.
// ============================================================================
describe('E2-B / ABA — value equality is not causal ownership', () => {
  it('THE FALSIFIER — later work returns the value to T1.after, and undo T1 destroys it', () => {
    const tree = signalTree({ x: 'A' });

    const before = tree() as Root;
    tree.$.x.set('B'); // T1 authors B
    const T1: Turn = { id: 'T1', before, after: tree() as Root };

    // Later surviving work. It moves the position away and then back.
    tree.$.x.set('C');
    tree.$.x.set('B'); // <- authored by LATER work, not by T1

    expect(tree.$.x()).toBe('B');

    const patches = undoTurn(T1, tree() as Root);

    // The rule sees current 'B' === T1.after 'B' and concludes T1 still owns the
    // position. It does not. T1's contribution was overwritten by 'C'.
    expect(patches).toHaveLength(1);
    for (const p of patches) tree(p as never);

    // WRONG — surviving later truth has been destroyed.
    expect(tree.$.x()).toBe('A');
  });

  it('THE CORRECT ANSWER, for comparison: T1 lost the position at B -> C', () => {
    // Under write-set precision honestly applied, T1's contribution was
    // superseded the moment later work wrote 'C'. Whether the value later
    // returned to 'B' is irrelevant — authorship did not return with it. So
    // undoing T1 should be a NO-OP and 'x' should remain 'B'.
    //
    // The snapshot null cannot reach this conclusion, because the information it
    // needs — WHO wrote the current value — is not in the values.
    const tree = signalTree({ x: 'A' });
    tree.$.x.set('B');
    tree.$.x.set('C');
    tree.$.x.set('B');
    expect(tree.$.x()).toBe('B'); // the state undo T1 must leave alone
  });
});

// ============================================================================
// HOLE 2 — the P3 repair clobbers siblings on a nested path.
// ============================================================================
describe('E2-B / nested clobber — the "~10 lines" repair loses siblings', () => {
  it('rolling back a turn on `profile.name` DESTROYS `profile.age` in the baseline', () => {
    const tree = signalTree({ profile: { name: 'n1', age: 30 } });
    const history: Turn[] = [];

    let before = tree() as Root;
    tree.$.profile.name.set('n2'); // T1, speculative
    history.push({ id: 'T1', before, after: tree() as Root });

    before = tree() as Root;
    tree.$.profile.name.set('n3'); // T2, confirmed
    history.push({ id: 'T2', before, after: tree() as Root });

    // The P3 repair, VERBATIM: spread `patch()` over the retained root.
    const rollback = (turnId: string): void => {
      const idx = history.findIndex((t) => t.id === turnId);
      const dead = history[idx];
      for (const p of writeSet(dead.before, dead.after)) {
        for (let j = idx + 1; j < history.length; j++) {
          if (get(history[j].before, p) === get(dead.after, p)) {
            history[j] = {
              ...history[j],
              before: { ...history[j].before, ...patch(p, get(dead.before, p)) },
            };
          }
        }
      }
      history.splice(idx, 1);
    };

    rollback('T1');

    const t2 = history[0];
    // `patch('profile.name', 'n1')` is `{ profile: { name: 'n1' } }`, and the
    // root spread replaces the WHOLE `profile` branch. `age` is gone.
    expect(get(t2.before, 'profile.name')).toBe('n1');
    expect(get(t2.before, 'profile.age')).toBeUndefined();

    // So the corrected baseline is now structurally wrong, and undoing T2
    // against it would write a profile with no age.
    expect(Object.keys(get(t2.before, 'profile') as Root)).toEqual(['name']);

    // The scalar P3 could not surface this, which is why "~10 lines solve it"
    // was a PROOF SKETCH and not an equivalence implementation.
  });
});
