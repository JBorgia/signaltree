import { computed } from '@angular/core';
import { derivedFrom } from '@signaltree/core';

import { LoadingState } from '../../types';
import type { AppTreeWithFilters } from '../app-tree';

const derived = derivedFrom<AppTreeWithFilters>();

/**
 * Derived Tier 3 — UI Aggregates.
 *
 * Cross-domain UI computeds that depend on multiple loading slices and
 * collection counts. These are typically the values bound directly into
 * top-level layout components (loading bars, error banners, badges).
 */
export const tier3Derived = derived(($) => ({
  ui: {
    /** True if any domain is currently loading. */
    isLoading: computed(
      () =>
        $.users.loading.state() === LoadingState.Loading ||
        $.posts.loading.state() === LoadingState.Loading
    ),

    /** First non-null error across domains (or null). */
    firstError: computed(
      () => $.users.loading.error() ?? $.posts.loading.error() ?? null
    ),

    /** Aggregate count for header badges. */
    totals: computed(() => ({
      users: $.users.entities.all().length,
      posts: $.posts.entities.all().length,
      filteredPosts: $.posts.filtered().length,
    })),
  },
}));
