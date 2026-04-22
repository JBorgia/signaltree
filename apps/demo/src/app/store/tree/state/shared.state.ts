import { LoadingState, Nullable } from '../../types';

/**
 * Shared loading slice reused by every domain that performs async work.
 *
 * Pattern: each domain embeds `loading: loadingSlice()` so reactive code can
 * read `$.<domain>.loading.state()` consistently.
 */
export function loadingSlice() {
  return {
    state: LoadingState.NotLoaded as LoadingState,
    error: null as Nullable<string>,
  };
}
