import { inject, Injectable, InjectionToken, Provider } from '@angular/core';

import { AppTree, createAppTree } from './app-tree';

/**
 * Injection token for the singleton application tree.
 *
 * Components and ops services should inject `APP_TREE` (not the holder service)
 * so they receive the typed `AppTree` directly.
 */
export const APP_TREE = new InjectionToken<AppTree>('DemoAppTree');

/**
 * Holds the single tree instance for the lifetime of the application.
 * Constructed once via the `APP_TREE` provider factory below.
 */
@Injectable({ providedIn: 'root' })
export class AppTreeService {
  readonly tree: AppTree = createAppTree();
}

/**
 * Provider for the application tree.
 *
 * @example
 * ```ts
 * // app.config.ts
 * providers: [
 *   ...provideAppTree(),
 * ];
 * ```
 */
export function provideAppTree(): Provider[] {
  return [
    {
      provide: APP_TREE,
      useFactory: () => inject(AppTreeService).tree,
    },
  ];
}
