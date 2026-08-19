import { computed } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { signalTree } from './signal-tree';
import { entityMap } from './types';

/**
 * DERIVATION E — legacy's LAST LOOK, on the one group that is not obviously a
 * collection function.
 *
 * `activeId` / `activeEntity` / `setActiveId` / `clearActiveId` are 4 of the 31
 * public members. The source records why they exist:
 *
 *   "Added in 14.0.0 after a capability audit found elf and Akita both ship it
 *    and every team otherwise hand-rolls `activeId: null` plus a derived
 *    lookup. `activeEntity` resolves through `byId`, so it is O(1) and
 *    invalidates only when THAT row changes."
 *
 * Feature parity is not a derived function, and the docblock names its own
 * alternative in the same sentence. The only architectural claim is GRANULARITY.
 * This spec tests that claim.
 */
type Row = { id: string; n: number };

describe('E — is `activeEntity` granularity reachable by ordinary composition?', () => {
  it('the built-in activeEntity invalidates only when THAT row changes', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
    });
    tree.$.rows.addMany([{ id: 'a', n: 1 }, { id: 'b', n: 1 }]);
    tree.$.rows.setActiveId('a');

    let runs = 0;
    const watch = computed(() => {
      runs++;
      return tree.$.rows.activeEntity()?.n;
    });
    expect(watch()).toBe(1);
    const base = runs;

    tree.$.rows.updateOne('b', { n: 99 });
    watch();
    expect(runs).toBe(base); // granular
  });

  it('ORDINARY COMPOSITION matches it exactly — a store position plus byId', () => {
    const tree = signalTree({
      rows: entityMap<Row, string>({ selectId: (r) => r.id }),
      selectedId: 'a' as string | null,
    });
    tree.$.rows.addMany([{ id: 'a', n: 1 }, { id: 'b', n: 1 }]);

    // Exactly the composition the docblock says teams "hand-roll": an ordinary
    // canonical position holding the id, plus a derived lookup through the
    // PUBLIC `byId`, which is where the O(1) granularity actually comes from.
    const selected = computed(() => {
      const id = tree.$.selectedId();
      return id == null ? undefined : tree.$.rows.byId(id)?.();
    });

    let runs = 0;
    const watch = computed(() => {
      runs++;
      return selected()?.n;
    });
    expect(watch()).toBe(1);
    const base = runs;

    tree.$.rows.updateOne('b', { n: 99 });
    watch();
    expect(runs).toBe(base); // IDENTICAL granularity

    // And selection is ordinary canonical state, so it composes normally.
    tree.$.selectedId.set('b');
    expect(watch()).toBe(99);
  });
});
