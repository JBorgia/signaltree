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
  // 'async' demo removed (replaced by middleware helpers)
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
  // Performance comparisons
  {
    path: 'benchmarks',
    loadComponent: () =>
      import(
        './pages/realistic-comparison/realistic-comparison.component'
      ).then((c) => c.RealisticComparisonComponent),
  },
  // Redirect old route to new one
  {
    path: 'realistic-comparison',
    redirectTo: 'benchmarks',
    pathMatch: 'full',
  },

  // Existing pages
  {
    path: 'extreme-depth',
    loadComponent: () =>
      import('./components/extreme-depth/extreme-depth.component').then(
        (c) => c.ExtremeDepthComponent
      ),
  },
  {
    path: 'benchmark-history',
    loadComponent: () =>
      import('./pages/benchmark-history/benchmark-history.component').then(
        (c) => c.BenchmarkHistoryComponent
      ),
  },

  // Redirect any unknown routes to home
  {
    path: '**',
    redirectTo: '',
  },
];
