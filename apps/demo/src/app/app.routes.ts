import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home/home.component').then((c) => c.HomeComponent),
  },

  // Fundamentals examples page (embedded demos on one page)
  {
    path: 'examples/fundamentals',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/pages/fundamentals-page/fundamentals-page.component'
      ).then((c) => c.FundamentalsPageComponent),
  },

  // Redirect old core route to new examples
  {
    path: 'core',
    redirectTo: '/examples/fundamentals',
    pathMatch: 'full',
  },

  // Redirect examples root to fundamentals
  { path: 'examples', redirectTo: '/examples/fundamentals', pathMatch: 'full' },

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
    path: 'batching/compare',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/batching-comparison/batching-comparison.component'
      ).then((c) => c.BatchingComparisonComponent),
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
    path: 'log-filtering',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/memoization/log-filtering-demo.component'
      ).then((c) => c.LogFilteringDemoComponent),
  },
  {
    path: 'presets',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/presets-demo/presets-demo.component'
      ).then((c) => c.PresetsDemoComponent),
  },
  {
    path: 'persistence',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/persistence-demo/persistence-demo.component'
      ).then((c) => c.PersistenceDemoComponent),
  },
  {
    path: 'serialization',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/serialization-demo/serialization-demo.component'
      ).then((c) => c.SerializationDemoComponent),
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
  {
    path: 'examples/fundamentals/recommended-architecture',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/recommended-architecture/recommended-architecture.component'
      ).then((c) => c.RecommendedArchitectureComponent),
  },
  {
    path: 'examples/fundamentals/migration-recipe',
    loadComponent: () =>
      import('./pages/migration-recipe/migration-recipe.component').then(
        (c) => c.MigrationRecipeComponent
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
  {
    path: 'ng-forms',
    loadComponent: () =>
      import('./pages/ng-forms-demo/ng-forms-demo.component').then(
        (c) => c.NgFormsDemoComponent
      ),
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
    path: 'bundle-visualizer',
    loadComponent: () =>
      import('./pages/bundle-visualizer/bundle-visualizer.component').then(
        (c) => c.BundleVisualizerComponent
      ),
  },
  {
    path: 'undo-redo',
    loadComponent: () =>
      import('./pages/undo-redo-demo/undo-redo-demo.component').then(
        (c) => c.UndoRedoDemoComponent
      ),
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
