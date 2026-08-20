import { computed, type Signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { timeTravel } from '../enhancers/time-travel/time-travel';
import { entityMap, signalTree } from '../index';

/**
 * ⚠️ ARCHITECTURAL FALSIFIER STATUS: **WITHDRAWN**.
 *
 * Retained as IMPLEMENTATION CHARACTERIZATION / hypothetical model test only.
 *
 * WHY IT WAS WITHDRAWN. The E2-S2 key-reuse rows were treated as a falsifier for
 * confirmed reversal. They are not. Two independent premise reviewers established
 * that the collision case requires OUT-OF-ORDER or ARBITRARY restoration, which
 * the earned revert contract never granted — it grants only return to a
 * configuration previously held, i.e. strict reverse order. Under that order the
 * intervening add reverts first and no collision arises. Importing selective
 * revert and then attributing the outcome to the record is circular.
 *
 * Concretely, the row below labelled "the subject-free null" performs
 * `rows.set([...])` — an ARBITRARY WRITE, not a revert. So the contrast it draws
 * was never between two reversal mechanisms.
 *
 * WHAT THESE ROWS STILL SHOW
 *   the current implementation distinguishes two histories with identical
 *   key/value state, and a key-cached value-only model does not
 *
 * WHAT THEY DO NOT ESTABLISH
 *   any identity requirement for confirmed LIFO reversal
 *   that reference continuity is a kernel responsibility
 *   anything about SignalTree 15
 *
 * The live question moved to the four-part falsifier recorded in RFC 0016
 * (B8 + ownership). Nothing in this file satisfies it.
 */
type Row = { id: string; n: number };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** The subject-free null: an ordinary array leaf, byId as a memoised computed. */
function collectionOver(leaf: {
  (): Row[];
  set(v: Row[]): void;
  update(fn: (c: Row[]) => Row[]): void;
}) {
  const cache = new Map<string, Signal<Row | undefined>>();
  return {
    all: () => leaf(),
    ids: computed(() => leaf().map((r) => r.id)),
    byId(id: string): Signal<Row | undefined> {
      let s = cache.get(id);
      if (!s) {
        s = computed(() => leaf().find((r) => r.id === id));
        cache.set(id, s);
      }
      return s;
    },
  };
}

// ============================================================================
// E2-S1 — membership add / remove reversal. Both mechanisms manage it.
// ============================================================================
describe('E2-S1 — membership reversal', () => {
  it('the REAL system undoes and redoes an add', async () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    }).with(timeTravel());
    tree.$.rows.addMany([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
    await tick();

    tree.$.rows.addOne({ id: 'c', n: 3 });
    await tick();
    expect(tree.$.rows.ids()).toEqual(['a', 'b', 'c']);

    tree.undo();
    await tick();
    expect(tree.$.rows.ids()).toEqual(['a', 'b']);

    tree.redo();
    await tick();
    expect(tree.$.rows.ids()).toEqual(['a', 'b', 'c']);
  });

  it('UNDO of a remove REVIVES the original subject; an ordinary RE-ADD does not', async () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    }).with(timeTravel());
    tree.$.rows.addMany([{ id: 'a', n: 1 }]);
    await tick();

    const held = tree.$.rows.byId('a');
    expect(held?.n()).toBe(1);

    tree.$.rows.removeOne('a');
    await tick();
    expect(held?.n()).toBeUndefined();

    tree.undo();
    await tick();
    expect(held?.n()).toBe(1); // the ORIGINAL subject is reachable again
  });

  it('THE CONTRAST — remove + ordinary re-add at the same key leaves the held reference DEAD', () => {
    const plain = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    plain.$.rows.addOne({ id: 'a', n: 1 });
    const held = plain.$.rows.byId('a');
    expect(held?.n()).toBe(1);

    plain.$.rows.removeOne('a');
    expect(held?.n()).toBeUndefined();

    plain.$.rows.addOne({ id: 'a', n: 1 }); // SAME key, SAME value, NEW subject
    expect(held?.n()).toBeUndefined(); // still dead — correctly

    // A fresh lookup finds the new member.
    expect(plain.$.rows.byId('a')?.n()).toBe(1);

    // ⚠️ ATTRIBUTION CORRECTED. An earlier draft of this row claimed the undo
    // restoration above was merely "resolve-on-read" and would happen for an
    // ordinary re-add too. MEASURED: it does not. Same key, same value, and the
    // held reference lives after UNDO but stays dead after RE-ADD.
    //
    // So the system distinguishes "the original member came back" from "a new
    // member took the key" — and that distinction is INVISIBLE IN THE VALUES.
    // This is subject-lifetime identity, not read resolution.
  });
});

// ============================================================================
// E2-S2 — THE KEY-REUSE HAZARD. This is where the two mechanisms DIVERGE.
// ============================================================================
describe('E2-S2 — key reuse across undo', () => {
  it('THE REAL SYSTEM does not alias: the new subject stays dead after undo', async () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    }).with(timeTravel());
    tree.$.rows.addOne({ id: 'k', n: 111 });
    await tick();

    tree.$.rows.removeOne('k');
    await tick();
    tree.$.rows.addOne({ id: 'k', n: 999 }); // a DIFFERENT subject, same key
    await tick();

    const heldNew = tree.$.rows.byId('k');
    expect(heldNew?.n()).toBe(999);

    tree.undo(); // undo the reuse-add
    await tick();
    expect(tree.$.rows.ids()).toEqual([]);

    tree.undo(); // undo the original removal
    await tick();
    expect(tree.$.rows.all()).toEqual([{ id: 'k', n: 111 }]);

    // THE DECISIVE ASSERTION. The key 'k' is occupied again, by the ORIGINAL
    // subject. A reference held to the SECOND subject must NOT resolve to it.
    expect(heldNew?.n()).toBeUndefined();
  });

  it('THE SUBJECT-FREE NULL ALIASES — the held reference silently reads the wrong row', () => {
    const tree = signalTree({ rows: [] as Row[] });
    const rows = collectionOver(tree.$.rows);

    tree.$.rows.set([{ id: 'k', n: 111 }]);
    tree.$.rows.set([]); // remove
    tree.$.rows.set([{ id: 'k', n: 999 }]); // a different subject reuses the key

    const heldNew = rows.byId('k');
    expect(heldNew()?.n).toBe(999);

    // Restore the ORIGINAL value — the best a value-only representation can do.
    tree.$.rows.set([{ id: 'k', n: 111 }]);

    // ALIASED. The reference held to the second subject now reports the FIRST
    // subject's data, because a value-keyed lookup cannot tell them apart.
    expect(heldNew()?.n).toBe(111);

    // ⚠️ E2-S RESULT. This is the first measured capability that canonical
    // before/after truth CANNOT reproduce, and it is INDEPENDENT OF REKEY:
    // distinguishing "the key is occupied again" from "the same member is back"
    // requires identity that does not live in the values.
    //
    // It does NOT follow that the current effect log is the right carrier for
    // that identity, only that SOME identity beyond values is required. Nor does
    // it revive rekey, whose own necessity remains withdrawn.
  });
});
