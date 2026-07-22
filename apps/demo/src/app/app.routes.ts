import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home/home.component').then((c) => c.HomeComponent),
  },

  // Opinionated 5-minute evaluation path
  {
    path: 'start',
    loadComponent: () =>
      import('./pages/start-here/start-here.component').then(
        (c) => c.StartHereComponent
      ),
    data: {
      title: 'Start here · 5-minute tour',
      description:
        'Evaluate SignalTree in five minutes: the mental model, a side-by-side comparison with NgRx, the recommended architecture, and where to go next.',
    },
  },

  // =========================================================================
  // V7 Feature Demos
  // =========================================================================
  {
    path: 'form-marker',
    loadComponent: () =>
      import('./pages/form-marker-demo/form-marker-demo.component').then(
        (c) => c.FormMarkerDemoComponent
      ),
  },
  {
    path: 'stored-versioning',
    loadComponent: () =>
      import(
        './pages/stored-versioning-demo/stored-versioning-demo.component'
      ).then((c) => c.StoredVersioningDemoComponent),
  },
  {
    path: 'realtime',
    loadComponent: () =>
      import('./pages/realtime-demo/realtime-demo.component').then(
        (c) => c.RealtimeDemoComponent
      ),
  },
  {
    path: 'events',
    loadComponent: () =>
      import('./pages/events-demo/events-demo.component').then(
        (c) => c.EventsDemoComponent
      ),
  },
  {
    path: 'async',
    loadComponent: () =>
      import('./pages/async-demo/async-demo.component').then(
        (c) => c.AsyncDemoComponent
      ),
    data: {
      title: 'Async markers — asyncSource & asyncQuery',
      description:
        'SignalTree-native async primitives. Path-attached markers for load-and-expose and input-driven debounced queries, with auto-cleanup.',
    },
  },
  {
    path: 'marker-zoo',
    loadComponent: () =>
      import('./pages/marker-zoo/marker-zoo.component').then(
        (c) => c.MarkerZooComponent
      ),
    data: {
      title: 'Marker zoo — all 6 markers at 4 different depths',
      description:
        'All SignalTree markers in one tree at depths 1-4 simultaneously: entityMap, status, stored, form, asyncSource, asyncQuery. Demonstrates path-attached composition.',
    },
  },
  {
    path: 'entity-collection',
    loadComponent: () =>
      import('./pages/entity-collection/entity-collection.component').then(
        (c) => c.EntityCollectionShowcaseComponent
      ),
    data: {
      title: 'entityMap — cache-aware loading, visualized',
      description:
        'Interactive showcase of entityMap cache-aware loading (v11.2): single-flight load coalescing, staleTime freshness, invalidateTag push-invalidation, stale-while-revalidate, and offline-first hydrate-then-revalidate.',
    },
  },
  {
    path: 'built-for-ai',
    loadComponent: () =>
      import('./pages/built-for-ai/built-for-ai.component').then(
        (c) => c.BuiltForAIComponent
      ),
    data: {
      title: 'Built for AI coding agents',
      description:
        'SignalTree treats AI agents as a first-class consumer of the API. llms.txt, agent skills in every tarball, drop-in .cursorrules / CLAUDE.md templates, and a reproducible codegen accuracy benchmark.',
    },
  },
  {
    path: 'benchmark',
    loadComponent: () =>
      import('./pages/benchmark/benchmark.component').then(
        (c) => c.BenchmarkComponent
      ),
    data: {
      title: 'AI-codegen accuracy benchmark — measured scorecard',
      description:
        'Reproducible 720-cell benchmark measuring how reliably each major AI agent generates correct SignalTree, NgRx, Akita, and Elf code. v10.2: SignalTree 49% cold → 91% primed with llms.txt (+42pp).',
    },
  },
  // /rxmethod redirected to /async — rxMethod was removed in 9.6.0 (was briefly
  // shipped in 9.5.x as a migration alias; the canonical answer is the async markers).
  {
    path: 'rxmethod',
    redirectTo: '/async',
    pathMatch: 'full',
  },

  // Fundamentals examples page (embedded demos on one page)
  {
    path: 'examples/fundamentals',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/pages/fundamentals-page/fundamentals-page.component'
      ).then((c) => c.FundamentalsPageComponent),
    data: {
      title: 'Fundamentals',
      description:
        'Working playground for the SignalTree core API: signalTree initialization, entityMap, status, stored, callable syntax, forms.',
    },
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
    path: 'entity-sort-comparer',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/entity-sort-comparer/entity-sort-comparer-demo.component'
      ).then((c) => c.EntitySortComparerDemoComponent),
  },
  {
    path: 'granular-reactivity',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/granular-reactivity/granular-reactivity-demo.component'
      ).then((c) => c.GranularReactivityDemoComponent),
  },
  {
    path: 'linked-derived',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/linked-derived/linked-derived-demo.component'
      ).then((c) => c.LinkedDerivedDemoComponent),
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
    path: 'markers',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/markers/markers-demo.component'
      ).then((c) => c.MarkersDemoComponent),
  },
  {
    path: 'devtools',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/devtools-demo/devtools-demo.component'
      ).then((c) => c.DevtoolsDemoComponent),
  },
  {
    path: 'custom-extensions',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/enhancers/custom-extensions-demo/custom-extensions-demo.component'
      ).then((c) => c.CustomExtensionsDemoComponent),
  },
  {
    path: 'examples/fundamentals/recommended-architecture',
    loadComponent: () =>
      import(
        './examples/features/fundamentals/examples/recommended-architecture/recommended-architecture.component'
      ).then((c) => c.RecommendedArchitectureComponent),
    data: {
      title: 'Recommended architecture',
      description:
        'The recommended SignalTree pattern: one runtime tree, typed feature slices, root-level enhancers (DevTools, time travel, persistence).',
    },
  },
  {
    // Canonical lives at /migrate (shorter, more discoverable).
    // Keep this path as a 301 redirect to avoid duplicate content / split SEO weight.
    path: 'examples/fundamentals/migration-recipe',
    redirectTo: '/migrate',
    pathMatch: 'full',
  },
  // Top-level alias for the multi-source migration guide
  {
    path: 'migrate',
    loadComponent: () =>
      import('./pages/migration-recipe/migration-recipe.component').then(
        (c) => c.MigrationRecipeComponent
      ),
    data: {
      title: 'Migrate from NgRx',
      description:
        'How to migrate an NgRx codebase to SignalTree: actions become setters, reducers become updates, selectors become computed signals.',
    },
  },
  // Performance comparisons
  {
    path: 'benchmarks',
    loadComponent: () =>
      import(
        './pages/realistic-comparison/realistic-comparison.component'
      ).then((c) => c.RealisticComparisonComponent),
    data: {
      title: 'Benchmarks',
      description:
        'Live cross-library benchmarks against @ngrx/signals, Akita, and Elf — runs in your browser with frequency-weighted realistic scenarios.',
    },
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
  {
    path: 'signal-forms',
    loadComponent: () =>
      import('./pages/signal-forms-demo/signal-forms-demo.component').then(
        (c) => c.SignalFormsDemoComponent
      ),
    data: {
      title: 'Signal Forms',
      description:
        "Angular 22 Signal Forms interop: a form() marker as a FieldTree (markerSignalForm) and @signaltree/schema registrations auto-applied to a FieldTree (signalFormBridge).",
    },
  },
  {
    path: 'schema',
    loadComponent: () =>
      import('./pages/schema-demo/schema-demo.component').then(
        (c) => c.SchemaDemoComponent
      ),
    data: {
      title: 'Schema validation',
      description:
        'StandardSchema-driven validation against tree leaf paths. Zod / Valibot / ArkType compatible. Async-first, observe-only.',
    },
  },

  // Architecture overview (renamed from /architecture for clarity vs. /examples/.../recommended-architecture)
  {
    path: 'architecture-overview',
    loadComponent: () =>
      import(
        './pages/architecture-overview/architecture-overview.component'
      ).then((c) => c.ArchitectureOverviewComponent),
    data: {
      title: 'Architecture overview',
      description:
        'Single-package SignalTree architecture and the measured savings from migrating an NgRx app: ~76% less state code, ~46% smaller state bundle.',
    },
  },
  // Backwards-compat redirect from the old path
  {
    path: 'architecture',
    redirectTo: 'architecture-overview',
    pathMatch: 'full',
  },
  // Bundle Visualizer removed — Architecture page covers bundle data
  // Undo/Redo removed — Time Travel demo covers this with richer UX
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
    data: {
      title: 'Documentation',
      description:
        'SignalTree package documentation: core API surface plus optional ng-forms, realtime, enterprise, and callable-syntax packages.',
    },
  },

  // Redirect any unknown routes to home
  {
    path: '**',
    redirectTo: '',
  },
];
// force rebuild
