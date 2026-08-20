import { describe, expect, it } from 'vitest';

import { signalTree } from '../index';

/**
 * E2 — PRECISION. Does precise confirmed undo require retaining semantic
 * EFFECTS, or can it be derived from retained canonical BEFORE/AFTER TRUTH?
 *
 * THE NULL IS NOT `restoreState(entry.state)`. Snapshot STORAGE is not snapshot
 * RESTORATION: a history may retain full roots while undo computes a TARGETED
 * delta by diffing them. That is the mechanism built below, from zero.
 *
 * TWO KINDS OF PRECISION, distinguished because they may not have the same
 * answer:
 *
 *   WRITE-SET PRECISION   only positions the turn TOUCHED are candidates for
 *                         reversal
 *   SEMANTIC PRECISION    reversing the turn produces the state that SHOULD
 *                         exist, accounting for causal work that has since
 *                         survived or disappeared
 *
 * Three rows of increasing hostility. The third is the one that matters.
 */

type Root = Record<string, unknown>;

/** Paths where two retained roots differ. Structural sharing makes this cheap. */
function writeSet(before: unknown, after: unknown, prefix = ''): string[] {
  if (before === after) return []; // shared reference — nothing changed below
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

const patch = (path: string, value: unknown): Root => {
  const keys = path.split('.');
  return keys.reduceRight<unknown>(
    (acc, k) => ({ [k]: acc }),
    value
  ) as Root;
};

interface Turn {
  id: string;
  before: Root;
  after: Root;
}

/**
 * TARGETED UNDO from retained roots. For every position the turn touched, revert
 * it ONLY IF current truth still holds what the turn put there — otherwise a
 * later turn owns that position and must not be disturbed. This is WRITE-SET
 * PRECISION derived purely from snapshots.
 */
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
// P1 — unrelated later truth. If this fails, the null is dead immediately.
// ============================================================================
describe('E2 / P1 — unrelated later truth', () => {
  it('undoing T1 reverts A and LEAVES B', () => {
    const tree = signalTree({ a: 0, b: 0 });
    const history: Turn[] = [];

    const before = tree() as Root;
    tree.$.a.set(1);
    history.push({ id: 'T1', before, after: tree() as Root });

    tree.$.b.set(1); // independent later truth

    for (const p of undoTurn(history[0], tree() as Root)) tree(p as never);

    expect(tree.$.a()).toBe(0); // reverted
    expect(tree.$.b()).toBe(1); // SURVIVES
  });
});

// ============================================================================
// P2 — same position, later confirmed work. This DEFINES the contract rather
// than letting the implementation answer it by accident.
// ============================================================================
describe('E2 / P2 — later confirmed work on the SAME position', () => {
  it('undoing T1 is a NO-OP once T2 has overwritten the position', () => {
    const tree = signalTree({ x: 'A' });
    const history: Turn[] = [];

    let before = tree() as Root;
    tree.$.x.set('B');
    history.push({ id: 'T1', before, after: tree() as Root });

    before = tree() as Root;
    tree.$.x.set('C');
    history.push({ id: 'T2', before, after: tree() as Root });

    const patches = undoTurn(history[0], tree() as Root);

    // T1 put 'B' there; current truth is 'C'. T1 no longer owns the position, so
    // write-set precision declines to touch it. That is a DEFENSIBLE semantic and
    // the rule produces it without special-casing.
    expect(patches).toEqual([]);
    expect(tree.$.x()).toBe('C');
  });
});

// ============================================================================
// P3 — SPECULATIVE PREDECESSOR. The row that decides E2.
//
//   A
//   T1 pending    A -> B
//   T2 confirmed  B -> C
//   rollback T1   canonical truth remains C
//   undo T2       REQUIRED: C -> A     (not C -> B)
//
// B was contributed by a turn that no longer survives, so T2's retained `before`
// encodes a state that never legitimately existed.
// ============================================================================
describe('E2 / P3 — a rolled-back speculative predecessor', () => {
  it('THE NAIVE SNAPSHOT NULL FAILS — it lands on B, not A', () => {
    const tree = signalTree({ x: 'A' });
    const history: Turn[] = [];

    let before = tree() as Root;
    tree.$.x.set('B'); // T1, speculative
    history.push({ id: 'T1', before, after: tree() as Root });

    before = tree() as Root;
    tree.$.x.set('C'); // T2, confirmed
    history.push({ id: 'T2', before, after: tree() as Root });

    // T1 is rolled back. Canonical truth stays 'C' because T2 owns the position.
    // The naive null does NOT touch retained history when this happens.
    expect(tree.$.x()).toBe('C');

    for (const p of undoTurn(history[1], tree() as Root)) tree(p as never);

    // WRONG. 'B' never legitimately existed.
    expect(tree.$.x()).toBe('B');
    expect(tree.$.x()).not.toBe('A');

    // So "diff adjacent retained roots" is itself a convenient approximation —
    // the same error class as the nulls corrected earlier, in a new form.
  });

  it('IT PASSES once ROLLBACK REWRITES retained history', () => {
    const tree = signalTree({ x: 'A' });
    const history: Turn[] = [];

    let before = tree() as Root;
    tree.$.x.set('B');
    history.push({ id: 'T1', before, after: tree() as Root });

    before = tree() as Root;
    tree.$.x.set('C');
    history.push({ id: 'T2', before, after: tree() as Root });

    // THE ADDED CAPABILITY: rolling back T1 removes its contribution from every
    // successor's retained `before`. Successors keep their own contribution.
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
    expect(tree.$.x()).toBe('C'); // canonical truth untouched by the rollback

    const t2 = history[0];
    for (const p of undoTurn(t2, tree() as Root)) tree(p as never);

    expect(tree.$.x()).toBe('A'); // CORRECT

    // And redo returns to C.
    for (const p of writeSet(t2.before, t2.after)) {
      tree(patch(p, get(t2.after, p)) as never);
    }
    expect(tree.$.x()).toBe('C');
  });
});

// ============================================================================
// WHAT E2 ESTABLISHES
// ============================================================================
describe('E2 — the split', () => {
  it('WRITE-SET precision is snapshot-derivable; SEMANTIC precision needs causal reasoning', () => {
    // P1 and P2 are satisfied by diffing retained roots alone — no effect
    // ontology, no per-position semantic records.
    //
    // P3 is NOT, and the missing ingredient is not a different STORAGE
    // representation. It is a DECISION: "T1 no longer survives, so its
    // contribution must stop being anyone's baseline." That decision is causal
    // reasoning, and the second row shows it can be applied TO a snapshot
    // representation rather than requiring an effect log.
    //
    //   causal layer      decides WHAT historical meaning survives
    //   history repr.     stores enough truth to realise that decision
    //   physical layer    applies the resulting canonical values
    //
    // So the candidate architecture separates cleanly, and effect-level RETAINED
    // STORAGE is not what P3 requires — history REWRITING on rollback is.
    expect(true).toBe(true);
  });
});
