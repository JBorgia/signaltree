import { entityMap } from '@signaltree/core';

import { Nullable, Post } from '../../types';
import { loadingSlice } from './shared.state';

/**
 * Initial state for the `posts` domain.
 *
 * Filters live alongside the entity collection so derived tier 2 can compose
 * `entities.all()` with `filters.*()` to produce `filteredPosts`.
 */
export function postsState() {
  return {
    entities: entityMap<Post, number>({ selectId: (p) => p.id }),
    selectedId: null as Nullable<number>,
    filters: {
      search: '',
      published: null as Nullable<boolean>,
    },
    loading: loadingSlice(),
  };
}
