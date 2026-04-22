import { computed } from '@angular/core';
import { derivedFrom } from '@signaltree/core';

import type { AppTreeBase } from '../app-tree';

const derived = derivedFrom<AppTreeBase>();

/**
 * Derived Tier 1 — Entity Resolution.
 *
 * Resolves `*Id` references against entity collections so consumers can read
 * the full entity object as a single computed signal instead of doing a manual
 * lookup in every template / component.
 *
 * Dependencies: base state only.
 */
export const tier1Derived = derived(($) => ({
  users: {
    /** Currently selected user resolved from id. */
    selected: computed(() => {
      const id = $.users.selectedId();
      return id != null ? ($.users.entities.byId(id)?.() ?? null) : null;
    }),
  },

  posts: {
    /** Currently selected post resolved from id. */
    selected: computed(() => {
      const id = $.posts.selectedId();
      return id != null ? ($.posts.entities.byId(id)?.() ?? null) : null;
    }),
  },
}));
