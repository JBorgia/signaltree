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
// E-REKEY — is identity-across-rekey a real function, and what does it cost?
// ============================================================================
describe('E-REKEY — changeId', () => {
  it('MEASURE — a held granular reference SURVIVES the rekey', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });

    // A component holds the row's field signal — the capability the library
    // claims its competitors lack.
    const held = tree.$.rows.byId('tmp-1');
    expect(held?.n()).toBe(5);

    tree.$.rows.changeId('tmp-1', 'server-99');

    expect(tree.$.rows.byId('tmp-1')).toBeUndefined();
    expect(tree.$.rows.byId('server-99')?.n()).toBe(5);
    // THE FUNCTION: the held reference follows the subject, not the old key.
    expect(held?.n()).toBe(5);
  });

  it('NULL — remove + add BREAKS the held reference (so the function is real)', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });
    const held = tree.$.rows.byId('tmp-1');
    expect(held?.n()).toBe(5);

    tree.$.rows.removeOne('tmp-1');
    tree.$.rows.addOne({ id: 'server-99', n: 5 });

    expect(tree.$.rows.byId('server-99')?.n()).toBe(5);
    // The held reference is orphaned — this is what changeId exists to prevent.
    expect(held?.n()).toBeUndefined();
  });

  it('COST — the docblock hazard, measured: entity.id disagrees with the storage key', () => {
    const tree = signalTree({ rows: entityMap<Row, string>({ selectId: (r) => r.id }) });
    tree.$.rows.addOne({ id: 'tmp-1', n: 5 });

    tree.$.rows.changeId('tmp-1', 'server-99');

    const row = tree.$.rows.byId('server-99')?.();
    // SPLIT IDENTITY: the collection says 'server-99', the member says 'tmp-1'.
    // Two docblocks name this, and it is why `setOne(entity)` cannot exist —
    // deriving the key via selectId() would write to the WRONG SLOT.
    expect(tree.$.rows.ids()).toEqual(['server-99']);
    expect(row?.id).toBe('tmp-1');
    expect(row?.id).not.toBe('server-99');
  });
});
