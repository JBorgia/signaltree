import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from './signal-tree';
import { entityMap } from './types';

/**
 * DERIVATION E — the TWO ROWS LEGACY CONTRIBUTES.
 *
 * The zero-state derived the minimum as add/remove, address-by-key, enumerate.
 * Opening the incumbent last surfaced two functions the minimum did NOT derive:
 *
 *   ORDERING          `prependOne` / `prependMany` imply the collection HAS an
 *                     order. The zero-state assigned ordering to derived
 *                     sorting, which cannot express an order that is DATA
 *                     rather than a function of content.
 *
 *   REKEY IDENTITY    `changeId` — a member's key changes while the member
 *                     stays the same member.
 *
 * These are what "legacy gets the last look" is FOR. Each is tested against its
 * own null, not assumed.
 */
type Row = { id: string; n: number };

// ============================================================================
// E-ORD — is intrinsic ordering a function the COLLECTION must own?
// ============================================================================
describe('E-ORD — ordering', () => {
  it('MEASURE — the collection has an intrinsic order, and prepend addresses it', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addMany([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
    tree.$.rows.prependOne({ id: 'z', n: 0 });

    expect(tree.$.rows.ids()).toEqual(['z', 'a', 'b']);
    expect(tree.$.rows.all().map((r) => r.id)).toEqual(['z', 'a', 'b']);
  });

  it('NULL — an ordinary array position holds the order, byId holds the members', () => {
    // The order is DATA (drag-to-reorder, server relevance). It is not derivable
    // from member content, so derived sorting cannot express it. But the null
    // does NOT need the collection to own it: an ordinary canonical array of
    // keys is dynamic-membership-capable, and granular member observation still
    // comes from `byId`.
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      order: [] as string[],
    });
    tree.$.rows.addMany([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
    tree.$.order.set(['a', 'b']);

    // prepend, expressed in the null
    tree.$.rows.addOne({ id: 'z', n: 0 });
    tree.$.order.update((o) => ['z', ...o]);

    const ordered = computed(() =>
      tree.$.order().map((id) => tree.$.rows.byId(id)?.()).filter(Boolean)
    );
    expect(ordered().map((r) => r?.id)).toEqual(['z', 'a', 'b']);

    // AND the null does something the intrinsic order cannot: reorder WITHOUT
    // touching membership, as one canonical write.
    tree.$.order.set(['b', 'z', 'a']);
    expect(ordered().map((r) => r?.id)).toEqual(['b', 'z', 'a']);
  });

  it('FALSIFIER — can the INTRINSIC order be rearranged without churning membership?', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addMany([{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'c', n: 3 }]);
    expect(tree.$.rows.ids()).toEqual(['a', 'b', 'c']);

    // There is no `move`, no `reorder`, no `sort`. The only way to reach a new
    // order through the intrinsic one is to destroy and rebuild membership.
    // NOTE: an unanchored /move|.../ here matched `removeOne` — "remove"
    // contains "mov". Methodology Rule 2, committed inside a falsifier. Names
    // are matched exactly.
    const surface = new Set(Object.keys(tree.$.rows));
    const reorderers = ['move', 'moveOne', 'reorder', 'sort', 'swap', 'insertAt']
      .filter((name) => surface.has(name));
    expect(reorderers).toEqual([]);

    tree.$.rows.setAll([{ id: 'b', n: 2 }, { id: 'a', n: 1 }, { id: 'c', n: 3 }]);
    expect(tree.$.rows.ids()).toEqual(['b', 'a', 'c']);
  });
});

// ============================================================================
// E-REKEY — WITHDRAWN CONCLUSION. These rows measure CURRENT BRANCH behaviour,
// which REVERSES a shipped, documented decision. They do not establish that
// identity-across-rekey is a required function.
//
// The original framing of this block was "the null fails, so the function is
// real". That was invalid twice over:
//
//   1. It proved `changeId` BEHAVES DIFFERENTLY from remove+add. It never showed
//      any workflow REQUIRES a held reference to survive a key change rather
//      than re-reading `byId(newId)`.
//
//   2. Worse, the behaviour it measured is 15-effort work that is NOT what
//      ships. Published 14.1.2 does the OPPOSITE, deliberately:
//
//        [ST2031] "reading a node held from byId(from) after changeId(from,to)
//        — it resolves undefined and always will. changeId drops the old
//        per-entity signal on purpose: aliasing it would share one signal with
//        a future addOne({ id: from }), which is a worse failure than this one."
//
//      Added 2026-08-10 by 80f41e94, whose message calls it "CORRECT BEHAVIOUR".
//      Removed 2026-08-13 by b47598a1 ("atomically realize entity rekeys with
//      scalar state") — EMPTY COMMIT BODY, no recorded rationale.
//
// So a derivation verdict was built on an unexplained reversal of a decision the
// repository had explicitly called correct. The provenance rule exists to catch
// exactly this; it was applied to the MACHINERY (SubjectId) and never to the
// BEHAVIOUR.
//
// OPEN, and now two separate questions:
//   Q1  Which behaviour is correct — drop-and-warn, or follow-the-subject?
//   Q2  Is identity-across-rekey REQUIRED at all? Unproven in either direction.
// ============================================================================
describe('E-REKEY — current-branch behaviour, conclusion WITHDRAWN', () => {
  it('MEASURED (this branch) — a held granular reference survives the rekey', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });

    const held = tree.$.rows.byId('tmp-1');
    expect(held?.n()).toBe(5);

    tree.$.rows.changeId('tmp-1', 'server-99');

    expect(tree.$.rows.byId('tmp-1')).toBeUndefined();
    expect(tree.$.rows.byId('server-99')?.n()).toBe(5);
    // On PUBLISHED 14.1.2 this is `undefined`, by design, with ST2031 warned.
    expect(held?.n()).toBe(5);
  });

  it('MEASURED — remove + add orphans the held reference (a DIFFERENCE, not a requirement)', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });
    const held = tree.$.rows.byId('tmp-1');
    expect(held?.n()).toBe(5);

    tree.$.rows.removeOne('tmp-1');
    tree.$.rows.addOne({ id: 'server-99', n: 5 });

    expect(tree.$.rows.byId('server-99')?.n()).toBe(5);
    expect(held?.n()).toBeUndefined();

    // What this shows: the two paths differ. What it does NOT show: that any
    // application needs the held reference to follow. Re-reading byId(newId) is
    // available and is what shipped 14.1.x REQUIRES.
  });

  it('THE REVERSED HAZARD — the old design\'s stated reason, measured against the new one', () => {
    // 80f41e94: "aliasing it would share one signal with a future addOne of the
    // retired id, a worse failure". That is the hazard the drop-and-warn design
    // existed to prevent. The new design appears to avoid it by SUBJECT identity
    // rather than key identity — measured here, because if it did NOT, the
    // reversal would be a straight regression.
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });
    const held = tree.$.rows.byId('tmp-1');

    tree.$.rows.changeId('tmp-1', 'server-99');
    tree.$.rows.addOne({ id: 'tmp-1', n: 777 }); // the retired id, reused

    expect(held?.n()).toBe(5); // NOT aliased to the new member
    expect(tree.$.rows.byId('tmp-1')?.n()).toBe(777);

    // So the reversal is not obviously wrong — it may have solved the hazard
    // that justified the old behaviour. That is a reason to DERIVE it properly,
    // not a reason to assume it.
  });

  it('COST — the split identity, which BOTH designs carry', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });

    tree.$.rows.changeId('tmp-1', 'server-99');

    const row = tree.$.rows.byId('server-99')?.();
    expect(tree.$.rows.ids()).toEqual(['server-99']);
    expect(row?.id).toBe('tmp-1');
    // 80f41e94 names this too, as the reason `setOne(entity)` cannot exist: it
    // would derive the key via selectId and write to the wrong slot.
  });
});
