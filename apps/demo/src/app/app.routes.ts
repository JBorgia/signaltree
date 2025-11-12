import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home/home.component').then((c) => c.HomeComponent),
  },

  // Examples section - new structure
  {
    path: 'examples',
    loadChildren: () =>
      import('./examples/examples.routes').then((r) => r.examplesRoutes),
  },

  // Redirect old core route to new examples
  {
    path: 'core',
    redirectTo: '/examples/fundamentals',
    pathMatch: 'full',
  },

  // Redirect old examples route to fundamentals
  {
    path: 'examples',
    redirectTo: '/examples/fundamentals',
    pathMatch: 'full',
  },

  // Core SignalTree modules - now under examples/features
  {
    path: 'callable-syntax',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/callable-syntax-demo/callable-syntax-demo.component'
      ).then((c) => c.CallableSyntaxDemoComponent),
  },
  {
    path: 'batching',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/batching-demo/batching-demo.component'
      ).then((c) => c.BatchingDemoComponent),
  },
  {
    path: 'entities',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/entities/entities-demo.component'
      ).then((c) => c.EntitiesDemoComponent),
  },
  {
    path: 'memoization',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/memoization/memoization-demo.component'
      ).then((c) => c.MemoizationDemoComponent),
  },
  {
    path: 'middleware',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/middleware-demo/middleware-demo.component'
      ).then((c) => c.MiddlewareDemoComponent),
  },
  {
    path: 'presets',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/presets-demo/presets-demo.component'
      ).then((c) => c.PresetsDemoComponent),
  },
  {
    path: 'time-travel',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/time-travel/time-travel-demo.component'
      ).then((c) => c.TimeTravelDemoComponent),
  },
  {
    path: 'devtools',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/devtools-demo/devtools-demo.component'
      ).then((c) => c.DevtoolsDemoComponent),
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
    path: 'realistic-benchmark-history',
    loadComponent: () =>
      import(
        './pages/realistic-benchmark-history/realistic-benchmark-history.component'
      ).then((c) => c.RealisticBenchmarkHistoryComponent),
  },

  {
    path: 'guardrails',
    loadComponent: () =>
      import(
        './pages/guardrails-monitoring/guardrails-monitoring.component'
      ).then((c) => c.GuardrailsMonitoringComponent),
  },

  // Architecture and bundle analysis pages
  {
    path: 'architecture',
    loadComponent: () =>
      import(
        './pages/architecture-overview/architecture-overview.component'
      ).then((c) => c.ArchitectureOverviewComponent),
  },
  {
    path: 'enterprise-enhancer',
    loadComponent: () =>
      import('./pages/enterprise-enhancer/enterprise-enhancer.component').then(
        (c) => c.EnterpriseEnhancerComponent
      ),
  },

  // Documentation
  {
    path: 'docs',
    loadComponent: () =>
      import('./pages/documentation/documentation.component').then(
        (c) => c.DocumentationComponent
      ),
  },

  // Redirect any unknown routes to home
  {
    path: '**',
    redirectTo: '',
  },
];
