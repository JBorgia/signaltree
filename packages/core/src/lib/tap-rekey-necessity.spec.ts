import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { entityMap, signalTree } from '../index';

/**
 * TWO CORRECTED FALSIFIERS. Both earlier verdicts proved a DIFFERENCE and were
 * recorded as if they had proved a REQUIREMENT.
 *
 * E-TAP said: "the pull surface already delivers it, recovered by diff." But the
 * diff null observed EVERY intermediate state — it called the observer between
 * each mutation. Nothing guarantees that. The real question is whether mutation-
 * event identity is reducible to resulting state across histories with the SAME
 * final state.
 *
 * E-REKEY said: "the null fails, so the function is real." It showed remove+add
 * orphans a held reference while changeId does not. It never asked whether any
 * workflow REQUIRES the reference to follow rather than re-reading byId(newId) —
 * which is exactly what shipped 14.x tells callers to do (ST2031).
 */
type Row = { id: string; n: number };

// ============================================================================
// TAP — is mutation-event identity reducible to resulting state?
// ============================================================================
describe('TAP — histories with an IDENTICAL final state', () => {
  it('THE DECISIVE CASE — add then remove leaves NO net change', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });

    const events: string[] = [];
    tree.$.rows.tap({
      onAdd: (_e, id) => events.push(`add:${id}`),
      onRemove: (id) => events.push(`rem:${id}`),
    });

    // A state-diff observer that samples only at the END.
    const before = new Set(tree.$.rows.ids());

    tree.$.rows.addOne({ id: 'a', n: 1 });
    tree.$.rows.removeOne('a');

    const after = new Set(tree.$.rows.ids());

    // The diff sees NOTHING — the histories "did nothing" and "added then
    // removed 'a'" have the same final state.
    expect([...before]).toEqual([...after]);
    expect(after.size).toBe(0);

    // tap saw both events.
    expect(events).toEqual(['add:a', 'rem:a']);
  });

  it('AND a value that returns to its starting point', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    tree.$.rows.addOne({ id: 'a', n: 1 });

    const updates: string[] = [];
    tree.$.rows.tap({
      onUpdate: (id, changes) => updates.push(`${id}:${JSON.stringify(changes)}`),
    });

    const start = tree.$.rows.byId('a')?.n();
    tree.$.rows.updateOne('a', { n: 2 });
    tree.$.rows.updateOne('a', { n: 1 });
    const end = tree.$.rows.byId('a')?.n();

    expect(start).toBe(end); // indistinguishable by state
    expect(updates).toEqual(['a:{"n":2}', 'a:{"n":1}']); // two events observed
  });

  it('THE NULL ONLY WORKS IF IT SAMPLES BETWEEN EVERY MUTATION', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });

    let prev = new Set<string>();
    const diff = computed(() => {
      const next = new Set(tree.$.rows.ids());
      const added = [...next].filter((id) => !prev.has(id));
      const removed = [...prev].filter((id) => !next.has(id));
      prev = next;
      return { added, removed };
    });
    diff(); // prime

    // Sampled between: both events recovered.
    tree.$.rows.addOne({ id: 'a', n: 1 });
    expect(diff().added).toEqual(['a']);
    tree.$.rows.removeOne('a');
    expect(diff().removed).toEqual(['a']);

    // NOT sampled between: the pair is invisible.
    tree.$.rows.addOne({ id: 'b', n: 2 });
    tree.$.rows.removeOne('b');
    expect(diff()).toEqual({ added: [], removed: [] });

    // CORRECTED VERDICT: mutation-event identity is NOT reducible to resulting
    // state. E-TAP's null was only equivalent because it happened to observe
    // between every mutation, which no consumer can guarantee — and a `computed`
    // is pull-based, so it samples when READ, not when written.
    //
    // The remaining question is OWNERSHIP: is "observe every mutation event" a
    // COLLECTION function, or the transaction/history kernel's? Undo already
    // records per-turn effects, which is the same information at tree scope.
  });
});

// ============================================================================
// REKEY — is identity-across-rekey REQUIRED, or merely different?
// ============================================================================
describe('REKEY — necessity, not difference', () => {
  it('THE NULL shipped 14.x recommends: hold the ID, re-read at point of use', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      selectedId: 'tmp-1' as string,
    });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });

    // ST2031's own advice: "hold the id and call byId(id()) at the point of use
    // rather than holding the node across a rekey."
    const selected = computed(() => tree.$.rows.byId(tree.$.selectedId())?.());
    expect(selected()?.n).toBe(5);

    tree.$.rows.changeId('tmp-1', 'server-99');
    tree.$.selectedId.set('server-99');

    expect(selected()?.n).toBe(5);
    // The null WORKS, provided the holder knows the new key.
  });

  it('THE GAP — a holder with ONLY the node cannot recover the new key', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });

    // A component handed only the node — no id, no collection reference. This is
    // the ordinary Angular input shape.
    const node = tree.$.rows.byId('tmp-1');
    expect(node?.n()).toBe(5);

    tree.$.rows.changeId('tmp-1', 'server-99');

    // The node's OWN id field is STALE after a rekey (the split identity, which
    // both designs carry). So a node-only holder cannot even compute the key it
    // would need to re-read.
    expect(node?.().id).toBe('tmp-1');
    expect(tree.$.rows.byId('tmp-1')).toBeUndefined();

    // WHAT THIS ESTABLISHES: the re-read null requires the holder to learn the
    // new key from SOMEWHERE ELSE. The collection does not tell it, and the
    // member misreports itself.
    //
    // WHAT IT DOES NOT ESTABLISH: that following-the-subject is the answer. The
    // alternative repairs are (a) fix the split identity so the member reports
    // its real key, or (b) notify holders of the rekey. Both are cheaper than a
    // subject-identity substrate, and neither has been derived.
    //
    // So rekey NECESSITY remains UNPROVEN, and the gap is now stated precisely
    // rather than asserted.
  });
});
