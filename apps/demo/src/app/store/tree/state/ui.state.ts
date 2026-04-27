/**
 * Initial state for the `ui` domain.
 *
 * Cross-cutting UI flags that aren't owned by any single feature live here.
 */
export function uiState() {
  return {
    theme: 'light' as 'light' | 'dark',
    sidebarOpen: false,
  };
}
