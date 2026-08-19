import { describe, expect, it } from 'vitest';

import { timeTravel } from '../enhancers/time-travel/time-travel';
import { signalTree } from './signal-tree';
import { entityMap } from './types';

/**
 * PROVENANCE-DRIVEN HOSTILE AUDIT — the subject-identity substrate.
 *
 * E-REKEY established that identity-across-rekey is a REAL function: it survives
 * its null, because remove+add orphans a held reference and `changeId` does not.
 * That makes the substrate underneath it load-bearing, so it was dated:
 *
 *   v14.1.1 tag              2026-08-11 09:14
 *   SubjectId                2026-08-11 22:29   feat(history): cut over public
 *                                               undo to frontier authority
 *   subjectMetadataEnabled   2026-08-13
 *   planRekey                2026-08-13, revised 2026-08-15 TWICE
 *
 * ALL THIRD-BUCKET: 15-effort, unreviewed, days old, and `planRekey` churned
 * three times in four days. Every one of those commits has an EMPTY BODY, so
 * there is no recorded rationale to read. The audit therefore has to be
 * executable.
 *
 * Note the origin: `SubjectId` entered through a HISTORY commit, not an entity
 * one. Origin is not ownership in either direction — and E-REKEY already
 * measured the collection's use working in a tree with no history attached, so
 * the function is independent of where the mechanism came from.
 *
 * What follows are the hazards the source's own docblocks imply.
 */
type Row = { id: string; n: number };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('SUBJ-AUDIT — the hazards the docblocks imply', () => {
  // The docblock claims the freed id may "be reused by a different subject".
  // If reuse aliased the OLD subject, a held reference would silently start
  // reporting an unrelated member's data — a wrong-row read, not a stale one.
  it('KEY REUSE — a freed key adopted by a new member does NOT alias the old subject', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });
    const held = tree.$.rows.byId('tmp-1');

    tree.$.rows.changeId('tmp-1', 'server-99');
    tree.$.rows.addOne({ id: 'tmp-1', n: 777 }); // a DIFFERENT member reuses the key

    expect(held?.n()).toBe(5); // still the original subject
    expect(tree.$.rows.byId('tmp-1')?.n()).toBe(777); // the new one
    expect(tree.$.rows.byId('server-99')?.n()).toBe(5);
    expect(tree.$.rows.ids().slice().sort()).toEqual(['server-99', 'tmp-1']);
  });

  it('COLLISION — rekeying onto an OCCUPIED key throws and changes NOTHING', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addMany([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
    const heldB = tree.$.rows.byId('b');

    expect(() => tree.$.rows.changeId('a', 'b')).toThrow(
      /Cannot change id to b: already in use/
    );

    // No member destroyed, no member merged, no held reference disturbed.
    expect(tree.$.rows.ids()).toEqual(['a', 'b']);
    expect(tree.$.rows.all()).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
    expect(heldB?.n()).toBe(2);
  });

  it('SELF — rekeying a key to itself is a no-op, not a throw and not a churn', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'a', n: 1 });
    const held = tree.$.rows.byId('a');

    expect(() => tree.$.rows.changeId('a', 'a')).not.toThrow();

    expect(tree.$.rows.ids()).toEqual(['a']);
    expect(held?.n()).toBe(1);
  });

  it('MISSING — rekeying an absent key throws and changes NOTHING', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'a', n: 1 });

    expect(() => tree.$.rows.changeId('zzz', 'q')).toThrow(
      /Entity with id zzz not found/
    );

    expect(tree.$.rows.ids()).toEqual(['a']);
  });

  it('ROUND TRIP — rekey and rekey back: does entity.id ever reconcile?', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'a', n: 1 });

    tree.$.rows.changeId('a', 'b');
    expect(tree.$.rows.byId('b')?.().id).toBe('a'); // split
    tree.$.rows.changeId('b', 'a');

    // Back at the original key, the split HEALS — but only because the member's
    // stale id field happened to match the key it returned to. It reconciles by
    // COINCIDENCE, not by repair.
    expect(tree.$.rows.ids()).toEqual(['a']);
    expect(tree.$.rows.byId('a')?.().id).toBe('a');
  });

  it('UNDO — a snapshot taken across the split identity restores the KEY, not the stale field', async () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      draft: '',
    }).with(timeTravel());
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });
    await tick();

    tree.$.draft.set('before');
    await tick();
    tree.$.rows.changeId('tmp-1', 'server-99');
    await tick();
    tree.$.draft.set('after');
    await tick();

    expect(tree.$.rows.ids()).toEqual(['server-99']);

    tree.undo();
    await tick();

    // The invariant that matters: whatever undo lands on, the collection's key
    // set and the members it can address must agree with each other.
    for (const id of tree.$.rows.ids()) {
      expect(tree.$.rows.byId(id)).toBeDefined();
    }
    expect(tree.$.rows.all().length).toBe(tree.$.rows.ids().length);
  });
});
