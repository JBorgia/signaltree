import { Routes } from '@angular/router';

import { fundamentalsRoutes } from './features/fundamentals/fundamentals.routes';

/**
 * Main routing configuration for examples module.
 * Features are lazy-loaded for better performance.
 */
export const examplesRoutes: Routes = [
  {
    path: 'fundamentals',
    children: fundamentalsRoutes,
  },
  {
    path: '',
    redirectTo: 'fundamentals',
    pathMatch: 'full',
  },
];
