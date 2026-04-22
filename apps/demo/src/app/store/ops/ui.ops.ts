import { inject, Injectable } from '@angular/core';

import { APP_TREE } from '../tree';

/**
 * UI domain operations.
 *
 * Pure-sync mutations for cross-cutting UI flags. Kept as an ops service so
 * components stay consistent — every write goes through `store.ops.*`.
 */
@Injectable({ providedIn: 'root' })
export class UiOps {
  private readonly _$ = inject(APP_TREE).$;

  toggleTheme(): void {
    this._$.ui.theme.update((t) => (t === 'light' ? 'dark' : 'light'));
  }

  toggleSidebar(): void {
    this._$.ui.sidebarOpen.update((open) => !open);
  }
}
