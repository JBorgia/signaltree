import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home/home.component').then((c) => c.HomeComponent),
  },

  // Redirect any unknown routes to home
  {
    path: '**',
    redirectTo: '',
  },
];
