import { computed } from '@angular/core';
import { derivedFrom } from '@signaltree/core';

import type { Post, User } from '../../types';
import type { AppTreeWithEntityResolution } from '../app-tree';

const derived = derivedFrom<AppTreeWithEntityResolution>();

/**
 * Derived Tier 2 — Filtering & Aggregates.
 *
 * Composes base state with tier-1 entity resolution to produce filtered and
 * aggregated views. Tier 2 may reference tier-1 computeds because the deep
 * merge in `.derived()` exposes them on `$`.
 */
export const tier2Derived = derived(($) => ({
  users: {
    /** Total user count. */
    count: computed(() => $.users.entities.all().length),
    /** Users grouped by role. */
    byRole: computed(() => {
      const groups: Record<User['role'], User[]> = {
        admin: [],
        user: [],
        moderator: [],
      };
      for (const u of $.users.entities.all()) {
        groups[u.role].push(u);
      }
      return groups;
    }),
  },

  posts: {
    /** Posts filtered by current search + published filter. */
    filtered: computed(() => {
      const all = $.posts.entities.all();
      const search = $.posts.filters.search().toLowerCase();
      const publishedFilter = $.posts.filters.published();

      return all.filter((p: Post) => {
        if (publishedFilter !== null && p.published !== publishedFilter) {
          return false;
        }
        if (search) {
          const inTitle = p.title.toLowerCase().includes(search);
          const inContent = p.content.toLowerCase().includes(search);
          if (!inTitle && !inContent) return false;
        }
        return true;
      });
    }),

    /** Posts authored by the currently selected user. */
    forSelectedUser: computed(() => {
      const user = $.users.selected();
      if (!user) return [];
      return $.posts.entities.all().filter((p: Post) => p.authorId === user.id);
    }),
  },
}));
