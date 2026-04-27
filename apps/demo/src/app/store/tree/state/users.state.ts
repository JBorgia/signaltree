import { entityMap } from '@signaltree/core';

import { Nullable, User } from '../../types';
import { loadingSlice } from './shared.state';

/**
 * Initial state for the `users` domain.
 *
 * - `entities` uses SignalTree's entityMap marker for O(1) CRUD.
 * - `selectedId` holds the currently selected user (resolved in tier 1).
 * - `loading` follows the shared loadingSlice convention.
 */
export function usersState() {
  return {
    entities: entityMap<User, number>({ selectId: (u) => u.id }),
    selectedId: null as Nullable<number>,
    loading: loadingSlice(),
  };
}
