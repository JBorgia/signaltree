import { describe, expect, it } from 'vitest';

import { timeTravel } from '../enhancers/time-travel/time-travel';
import { signalTree } from '../index';

/**
 * E2-C — THE REAL CAUSAL PATH. Characterization first.
 *
 * E2's model asserted that after `T1 pending A->B`, `T2 confirmed B->C`, and
 * `rollback T1`, confirmed undo must land on `A` because `B` was contributed by
 * a turn that no longer survives.
 *
 * **That contract is NOT FROZEN anywhere in this repository.** It was a proposed
 * semantic, and building a null to it repeated the very failure the audit keeps
 * catching: a null built to an assumed contract. So these rows RECORD what the
 * real system does. They are characterization, not endorsement.
 *
 * PUBLIC SURFACE, measured: the `transactions()` enhancer publishes only
 * `transaction()`. `getConfirmedTurnCount` / `getPendingTurnIds` and friends live
 * on the INTERNAL runtime, not the public tree. `timeTravel()` publishes
 * `transaction()` on its own, so grouping is reachable without `transactions()`.
 */

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

type TT<S> = {
  $: S;
  transaction(fn: () => void): { confirm(): void; rollback(): void };
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  getHistory(): unknown[];
};

type Scalar = { x: { (): string; set(v: string): void } };
type Nested = {
  profile: {
    (): { name: string; age: number };
    name: { (): string; set(v: string): void };
    age: { (): number; set(v: number): void };
  };
};

// ============================================================================
// E2-C1 — the frozen P3 scenario, through the real path
// ============================================================================
describe('E2-C1 — real P3', () => {
  it('a PENDING write is visible in canonical truth but adds NO history entry', async () => {
    const tree = signalTree({ x: 'A' }).with(timeTravel()) as unknown as TT<Scalar>;
    const base = tree.getHistory().length;

    tree.transaction(() => tree.$.x.set('B'));
    await tick();

    expect(tree.$.x()).toBe('B'); // optimistic: visible immediately
    expect(tree.getHistory().length).toBe(base); // but NOT historied
  });

  it('CONFIRMATION historicises; ROLLBACK of a superseded pending turn changes neither truth nor history', async () => {
    const tree = signalTree({ x: 'A' }).with(timeTravel()) as unknown as TT<Scalar>;

    const t1 = tree.transaction(() => tree.$.x.set('B')); // pending
    await tick();
    const histAfterT1 = tree.getHistory().length;

    const t2 = tree.transaction(() => tree.$.x.set('C'));
    await tick();
    expect(tree.getHistory().length).toBe(histAfterT1); // still not historied
    t2.confirm();
    await tick();
    const histAfterConfirm = tree.getHistory().length;
    expect(histAfterConfirm).toBe(histAfterT1 + 1);

    t1.rollback();
    await tick();

    expect(tree.$.x()).toBe('C'); // truth untouched — T2 owns the position
    expect(tree.getHistory().length).toBe(histAfterConfirm); // history NOT rewritten
  });

  it('RECORDED: confirmed undo lands on B, not A — and redo returns to C', async () => {
    const tree = signalTree({ x: 'A' }).with(timeTravel()) as unknown as TT<Scalar>;

    const t1 = tree.transaction(() => tree.$.x.set('B'));
    await tick();
    const t2 = tree.transaction(() => tree.$.x.set('C'));
    await tick();
    t2.confirm();
    await tick();
    t1.rollback();
    await tick();

    tree.undo();
    await tick();

    // The real kernel reverses T2 to its RECORDED baseline. That baseline is 'B',
    // which the rolled-back T1 contributed.
    expect(tree.$.x()).toBe('B');

    tree.redo();
    await tick();
    expect(tree.$.x()).toBe('C');

    // ⚠️ THE E2-DECISIVE OBSERVATION.
    //
    // This is EXACTLY what E2's "naive" snapshot null produced, and what E2
    // labelled WRONG. The effect-log representation and the snapshot-derived
    // representation are INDISTINGUISHABLE here. No causal decision about T1's
    // death is consumed by confirmed reversal: history is not rewritten, and the
    // recorded baseline is reversed as-is.
    //
    // Whether 'B' is correct is a CONTRACT question that nothing in this
    // repository answers. What is measured is that the effect log earns no
    // observable advantage on this scenario.
  });
});

// ============================================================================
// E2-C2 — nested path, sibling preservation
// ============================================================================
describe('E2-C2 — nested path', () => {
  it('undo preserves the untouched sibling', async () => {
    const tree = signalTree({
      profile: { name: 'A', age: 30 },
    }).with(timeTravel()) as unknown as TT<Nested>;

    const t1 = tree.transaction(() => tree.$.profile.name.set('B'));
    await tick();
    const t2 = tree.transaction(() => tree.$.profile.name.set('C'));
    await tick();
    t2.confirm();
    await tick();
    t1.rollback();
    await tick();

    tree.undo();
    await tick();

    // Same baseline behaviour as the scalar case...
    expect(tree.$.profile.name()).toBe('B');
    // ...and critically, the untouched sibling SURVIVES. The real path does not
    // clobber `age`, which is the bug E2-B found in the model's own repair.
    expect(tree.$.profile.age()).toBe(30);
  });
});

// ============================================================================
// E2-C3 — ABA against the real kernel. The row that decides E2.
// ============================================================================
describe('E2-C3 — real ABA authorship', () => {
  it('RECORDED: the real kernel does NOT distinguish authorship of an identical value', async () => {
    const tree = signalTree({ x: 'A' }).with(timeTravel()) as unknown as TT<Scalar>;

    const t1 = tree.transaction(() => tree.$.x.set('B'));
    t1.confirm(); // CONFIRMED — this is the entry undo targets
    await tick();
    const hist = tree.getHistory().length;

    // Later work outside confirmed history, produced by the real mechanism: a
    // PENDING turn is visible in truth and adds no history entry (E2-C1 row 1).
    const later = tree.transaction(() => {
      tree.$.x.set('C');
      tree.$.x.set('B'); // value returns to T1's, authored by THIS turn
    });
    await tick();
    expect(tree.$.x()).toBe('B');
    expect(tree.getHistory().length).toBe(hist); // still not historied

    tree.undo();
    await tick();

    // The pending turn's surviving contribution is DESTROYED — the same outcome
    // as E2-B's ABA falsifier against the snapshot null.
    expect(tree.$.x()).toBe('A');
    expect(typeof later.confirm).toBe('function'); // the pending turn still exists

    // ⚠️ So the effect log does NOT carry authorship into confirmed reversal.
    // The information E2-B showed snapshots lack is not being used by the real
    // system either. Whether landing on 'A' here is a DEFECT is a separate
    // question this row deliberately does not answer — it records the behaviour.
  });
});
