import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home/home.component').then((c) => c.HomeComponent),
  },

  // Core SignalTree modules
  {
    path: 'core',
    loadComponent: () =>
      import('./pages/core-demo/core-demo.component').then(
        (c) => c.CoreDemoComponent
      ),
  },
  {
    path: 'callable-syntax',
    loadComponent: () =>
      import(
        './pages/callable-syntax-demo/callable-syntax-demo.component'
      ).then((c) => c.CallableSyntaxDemoComponent),
  },
  {
    path: 'async',
    loadComponent: () =>
      import('./pages/async-demo/async-demo.component').then(
        (c) => c.AsyncDemoComponent
      ),
  },
  {
    path: 'batching',
    loadComponent: () =>
      import('./pages/batching-demo/batching-demo.component').then(
        (c) => c.BatchingDemoComponent
      ),
  },
  {
    path: 'entities',
    loadComponent: () =>
      import('./pages/entities-demo/entities-demo.component').then(
        (c) => c.EntitiesDemoComponent
      ),
  },
  {
    path: 'memoization',
    loadComponent: () =>
      import('./pages/memoization-demo/memoization-demo.component').then(
        (c) => c.MemoizationDemoComponent
      ),
  },
  {
    path: 'middleware',
    loadComponent: () =>
      import('./pages/middleware-demo/middleware-demo.component').then(
        (c) => c.MiddlewareDemoComponent
      ),
  },
  // {
  //   path: 'ng-forms',
  //   loadComponent: () =>
  //     import('./pages/ng-forms-demo/ng-forms-demo.component').then(
  //       (c) => c.NgFormsDemoComponent
  //     ),
  // },
  {
    path: 'presets',
    loadComponent: () =>
      import('./pages/presets-demo/presets-demo.component').then(
        (c) => c.PresetsDemoComponent
      ),
  },
  {
    path: 'time-travel',
    loadComponent: () =>
      import('./pages/time-travel-demo/time-travel-demo.component').then(
        (c) => c.TimeTravelDemoComponent
      ),
  },
  {
    path: 'devtools',
    loadComponent: () =>
      import('./pages/devtools-demo/devtools-demo.component').then(
        (c) => c.DevtoolsDemoComponent
      ),
  },
  // {
  //   path: 'serialization',
  //   loadComponent: () =>
  //     import('./pages/serialization-demo/serialization-demo.component').then(
  //       (c) => c.SerializationDemoComponent
  //     ),
  // },

  // Performance comparisons
  {
    path: 'performance-dashboard',
    loadComponent: () =>
      import(
        './components/performance-dashboard/performance-dashboard.component'
      ).then((c) => c.PerformanceDashboardComponent),
  },
  {
    path: 'realistic-comparison',
    loadComponent: () =>
      import(
        './pages/realistic-comparison/realistic-comparison.component'
      ).then((c) => c.RealisticComparisonComponent),
  },

  // Existing pages
  {
    path: 'extreme-depth',
    loadComponent: () =>
      import('./components/extreme-depth/extreme-depth.component').then(
        (c) => c.ExtremeDepthComponent
      ),
  },

  // Redirect any unknown routes to home
  {
    path: '**',
    redirectTo: '',
  },
];
