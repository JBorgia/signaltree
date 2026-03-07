import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

interface HomeLinkCard {
  title: string;
  description: string;
  route: string;
  cta: string;
  queryParams?: Record<string, string>;
}

interface HomeCta {
  label: string;
  route: string;
  variant: 'primary' | 'secondary' | 'ghost';
}

interface FitItem {
  title: string;
  items: string[];
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent {
  readonly primaryCtas: HomeCta[] = [
    {
      label: 'Start with fundamentals',
      route: '/examples/fundamentals',
      variant: 'primary',
    },
    {
      label: 'Read the docs',
      route: '/docs',
      variant: 'secondary',
    },
    {
      label: 'See benchmarks',
      route: '/benchmarks',
      variant: 'ghost',
    },
  ];

  readonly evaluationCards: HomeLinkCard[] = [
    {
      title: 'Learn the model',
      description:
        'Start with the fundamentals page to see how SignalTree models nested state as data, not reducers and selectors.',
      route: '/examples/fundamentals',
      cta: 'Open fundamentals →',
    },
    {
      title: 'Check the architecture',
      description:
        'See the recommended “one runtime tree, typed slices, root-level enhancers” architecture in context.',
      route: '/examples/fundamentals/recommended-architecture',
      cta: 'View recommended architecture →',
    },
    {
      title: 'Read package docs',
      description:
        'Browse the core package first, then optional packages like realtime, events, forms, and enterprise features.',
      route: '/docs',
      cta: 'Browse documentation →',
    },
    {
      title: 'Inspect proof points',
      description:
        'Use benchmarks, DevTools, and bundle visualisation as proof—not as the first thing you have to believe.',
      route: '/benchmarks',
      cta: 'Review benchmarks →',
    },
  ];

  readonly packageCards: HomeLinkCard[] = [
    {
      title: '@signaltree/core',
      description:
        'The main package: state tree, entities, batching, memoization, DevTools, time travel, persistence, and serialization.',
      route: '/docs',
      cta: 'Read core docs →',
      queryParams: { package: 'core' },
    },
    {
      title: '@signaltree/events',
      description:
        'Event-oriented helpers for reacting to state changes without abandoning the data-first tree model.',
      route: '/docs',
      queryParams: { package: 'events' },
      cta: 'Read events docs →',
    },
    {
      title: '@signaltree/realtime',
      description:
        'Keep entity maps in sync with live data sources while preserving SignalTree’s path-based ergonomics.',
      route: '/docs',
      queryParams: { package: 'realtime' },
      cta: 'Read realtime docs →',
    },
    {
      title: '@signaltree/ng-forms',
      description:
        'Angular forms integration for reactive form state, validation, and persistence patterns.',
      route: '/docs',
      queryParams: { package: 'ng-forms' },
      cta: 'Read forms docs →',
    },
    {
      title: '@signaltree/enterprise',
      description:
        'Advanced diagnostics and scaling-oriented tooling for larger teams and heavier state graphs.',
      route: '/docs',
      queryParams: { package: 'enterprise' },
      cta: 'Read enterprise docs →',
    },
  ];

  readonly proofCards: HomeLinkCard[] = [
    {
      title: 'DevTools',
      description:
        'Inspect state changes, path-based actions, and time-travel support through the Redux DevTools integration.',
      route: '/devtools',
      cta: 'Open DevTools demo →',
    },
    {
      title: 'Benchmarks',
      description:
        'Compare SignalTree against other Angular state approaches, with current version metadata shown in the UI and methodology visible in the app.',
      route: '/benchmarks',
      cta: 'Review benchmarks →',
    },
    {
      title: 'Bundle Visualizer',
      description:
        'Inspect package shape and learn how the build pipeline preserves module structure for tree shaking.',
      route: '/bundle-visualizer',
      cta: 'View bundle visualizer →',
    },
    {
      title: 'Extreme Depth',
      description:
        'Stress-test deep typing and path access to see where SignalTree’s model remains readable and precise.',
      route: '/extreme-depth',
      cta: 'See deep typing demo →',
    },
  ];

  readonly advancedRoutes: HomeLinkCard[] = [
    {
      title: 'Persistence & Serialization',
      description:
        'Store and restore state deliberately with local persistence and import/export support.',
      route: '/persistence',
      cta: 'Explore persistence →',
    },
    {
      title: 'Presets & Custom Extensions',
      description:
        'Learn the extension story without leaving the path-first, data-first model.',
      route: '/presets',
      cta: 'Explore presets →',
    },
    {
      title: 'Guardrails & Undo/Redo',
      description:
        'Explore development guardrails, history workflows, and related advanced examples.',
      route: '/guardrails',
      cta: 'Explore guardrails →',
    },
  ];

  readonly coreFeatures = [
    {
      name: 'State stays data-shaped',
      description:
        'Model nested state as plain data, then let SignalTree layer reactivity on top.',
      highlight: true,
    },
    {
      name: 'Dot-notation access',
      description:
        '`tree.$.user.profile.name()` stays direct, type-safe, and IDE-discoverable.',
    },
    {
      name: 'One runtime tree',
      description:
        'The recommended architecture is one runtime tree with typed slices and root-level enhancers.',
    },
    {
      name: 'Invisible reactivity',
      description:
        'Think in data paths instead of subscriptions and state-management ceremony.',
    },
    {
      name: 'Optional power, not required ceremony',
      description:
        'Add entities, DevTools, time travel, persistence, forms, or realtime only when you need them.',
      highlight: true,
    },
    {
      name: 'Proof you can inspect',
      description: 'Benchmarks, DevTools, and bundle tooling support evaluation instead of replacing it.',
    },
  ];

  readonly fitGuidance: FitItem[] = [
    {
      title: 'Great fit for',
      items: [
        'Angular apps with deep or evolving nested state',
        'Teams that want state to look like data, not framework ceremony',
        'Apps that benefit from root-level DevTools, time travel, persistence, and entities',
      ],
    },
    {
      title: 'Probably not the point',
      items: [
        'Very small apps with shallow local state only',
        'Teams that explicitly want action/reducer workflows as the primary abstraction',
        'Use cases where the benchmark story matters more than the day-to-day modeling ergonomics',
      ],
    },
  ];

  readonly quickStartCode = `# Install the core package
npm install @signaltree/core

# Optional packages
npm install @signaltree/ng-forms
npm install @signaltree/realtime
npm install @signaltree/events

// Create one root tree for app state
import {
  signalTree,
  batching,
  devTools,
  timeTravel
} from '@signaltree/core';

const appTree = signalTree({
  user: {
    profile: {
      name: 'Ada Lovelace',
      email: 'ada@example.com'
    }
  },
  settings: {
    theme: 'dark' as 'dark' | 'light',
    notifications: true
  },
  cart: {
    items: [] as Array<{ id: string; quantity: number }>
  }
})
  .with(batching())
  .with(devTools({ treeName: 'App State' }))
  .with(timeTravel());

// Read nested values directly
console.log(appTree.$.user.profile.name());
console.log(appTree.$.settings.theme());

// Write individual leaves
appTree.$.user.profile.name.set('Grace Hopper');
appTree.$.settings.theme.set('light');

// Update with one root-level operation when needed
appTree((current) => ({
  ...current,
  cart: {
    ...current.cart,
    items: [...current.cart.items, { id: 'book-1', quantity: 1 }]
  }
}));

// Read the full unwrapped snapshot
const snapshot = appTree();`;

  readonly beforeCode = `// Typical nested-state ceremony
const displayName = selectUserDisplayName(state);

dispatch(updateUserProfile({
  id: userId,
  changes: { name: 'Grace Hopper' }
}));`;

  readonly afterCode = `// SignalTree
const displayName = appTree.$.user.profile.name();

appTree.$.user.profile.name.set('Grace Hopper');`;

  readonly extremeDepthCode = `import { signalTree } from '@signaltree/core';

// Deep nested state with strong type inference
const extremeDepth = signalTree({
  enterprise: {
    divisions: {
      technology: {
        departments: {
          engineering: {
            teams: {
              frontend: {
                projects: {
                  signaltree: {
                    releases: {
                      v1: {
                        features: {
                          recursiveTyping: {
                            validation: {
                              tests: {
                                extreme: {
                                  status: 'passing',
                                  depth: 15,
                                  performance: 'sub-millisecond'
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
});

// Type inference still holds at this depth
const status = extremeDepth.$.enterprise.divisions.technology
  .departments.engineering.teams.frontend.projects.signaltree
  .releases.v1.features.recursiveTyping.validation.tests
  .extreme.status(); // TypeScript knows this is a string signal

// Update at extreme depth with full type safety
extremeDepth.$.enterprise.divisions.technology.departments
  .engineering.teams.frontend.projects.signaltree.releases.v1
  .features.recursiveTyping.validation.tests.extreme.depth.set(20);`;
}
