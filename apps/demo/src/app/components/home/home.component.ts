import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent {
  features = [
    {
      title: '🏪 Core Features',
      description: 'JSON branches, reactive leaves — explore the fundamentals',
      route: '/examples/fundamentals',
      category: 'Core',
    },
    {
      title: '⚡ Performance',
      description: 'Batched updates, memoization, and performance optimization',
      route: '/benchmarks',
      category: 'Performance',
      methods: ['batch', 'computed', 'optimize', 'clearCache', 'getMetrics'],
    },
    {
      title: '📦 Entity Management',
      description:
        'CRUD operations and entity helpers for managing collections',
      route: '/entities',
      category: 'Entity',
      methods: [
        'entityMap',
        'addOne',
        'updateOne',
        'removeOne',
        'upsertOne',
        'byId',
        'where',
      ],
    },
    {
      title: '🌐 Async Pipelines',
      description: 'Handle async operations using enhancers and entity hooks',
      route: '/time-travel',
      category: 'Async',
      methods: ['effect', 'intercept', 'tap'],
    },
    {
      title: '🔄 Batching Demo',
      description: 'Batched updates and operation processing',
      route: '/batching',
      category: 'Performance',
      methods: ['batch', 'process'],
    },
    {
      title: '🧪 Memoization',
      description:
        'Intelligent caching and performance optimization for expensive computations',
      route: '/memoization',
      category: 'Performance',
      methods: ['memoize', 'clearCache', 'getCacheStats'],
    },
    {
      title: '📝 Log Filtering',
      description:
        'Real-world example: Filter thousands of log entities with memoization',
      route: '/log-filtering',
      category: 'Performance',
      methods: ['memoize', 'entityMap', 'filter'],
    },
    {
      title: '📊 Benchmark History',
      description:
        'View historical benchmark results comparing SignalTree and competitors',
      route: '/realistic-benchmark-history',
      category: 'Performance',
    },
    {
      title: '🔥 Extreme Depth Testing',
      description:
        'Push recursive typing to 15+ levels with perfect type inference',
      route: '/extreme-depth',
      category: 'Advanced',
      highlight: true,
      cta: 'Experience Extreme Depth →',
    },
    {
      title: '🚀 Enterprise Optimizer',
      description:
        'Enable diff-based updates, path indexes, and live update metrics',
      route: '/enterprise-enhancer',
      category: 'Advanced',
      cta: 'Explore Enterprise Enhancer →',
    },
    {
      title: '🏛 Architecture Overview',
      description:
        'Explore memory management, security guardrails, and shared utilities',
      route: '/architecture',
      category: 'Advanced',
      cta: 'View Architecture Overview →',
    },
    {
      title: '📚 Docs & Guides',
      description:
        'Read package guides, migration notes, and API documentation in-app',
      route: '/docs',
      category: 'Advanced',
      cta: 'Read Documentation →',
    },
    // V7 Feature Demos
    {
      title: '🏗️ Form Marker',
      description:
        'Tree-integrated forms with validation, wizard navigation, and persistence',
      route: '/form-marker',
      category: 'V7 Features',
      highlight: true,
      cta: 'Try Form Marker →',
    },
    {
      title: '💾 Stored Versioning',
      description:
        'Version your localStorage data with automatic schema migrations',
      route: '/stored-versioning',
      category: 'V7 Features',
      cta: 'Try Versioning →',
    },
    {
      title: '🔴 Realtime Sync',
      description:
        'Live data synchronization with entityMaps via adapters (Supabase, etc.)',
      route: '/realtime',
      category: 'V7 Features',
      highlight: true,
      cta: 'Try Realtime →',
    },
    {
      title: '📝 Forms Integration',
      description:
        'Seamless Angular Forms integration with reactive validation',
      route: '/ng-forms',
      category: 'Forms',
    },
    {
      title: '🛠️ DevTools',
      description:
        'Redux DevTools integration for powerful debugging and state inspection',
      route: '/devtools',
      category: 'Testing',
    },
    {
      title: '📞 Callable Syntax',
      description:
        'Optional enhanced developer experience with callable node syntax',
      route: '/callable-syntax',
      category: 'Advanced',
      cta: 'Try Callable Syntax →',
    },
    {
      title: '⏰ Time Travel Debugging',
      description:
        'Navigate state history with undo/redo controls and timeline insights',
      route: '/time-travel',
      category: 'Time Travel',
      methods: ['timeTravel', 'undo', 'redo', 'jumpTo'],
    },
  ];

  coreFeatures = [
    {
      name: 'Reactive JSON',
      description:
        'State looks like JSON. Access feels obvious. Reactivity stays invisible.',
      highlight: true,
    },
    {
      name: 'Dot-Notation Access',
      description:
        'tree.$.user.profile.name() — fully type-safe, IDE-discoverable',
    },
    {
      name: 'Deep Type Inference',
      description:
        'Perfect TypeScript types at 15+ nesting levels, no degradation to any',
    },
    {
      name: 'Invisible Reactivity',
      description:
        'Think in data paths, not subscriptions. Built on Angular signals.',
    },
    {
      name: 'Lazy by Design',
      description:
        'Signals created only where accessed. 0.036ms at 15+ levels.',
      highlight: true,
    },
    {
      name: 'Developer Tools',
      description: 'Redux DevTools integration for debugging and inspection',
    },
  ];

  getFeaturesByCategory(category: string) {
    return this.features.filter((f) => f.category === category);
  }

  quickStartCode = `# Install the core package (all enhancers included)
npm install @signaltree/core

# Optional add-on packages
npm install @signaltree/ng-forms        # Angular forms integration
npm install @signaltree/enterprise      # Enterprise-scale optimizations
npm install @signaltree/callable-syntax # Optional DX enhancement

# All enhancers (batching, memoization, entities, devtools,
# time-travel, serialization, presets) are built into @signaltree/core

// Basic Usage
import {
  signalTree,
  batching,
  memoization,
  entities,
  devTools,
  timeTravel
} from '@signaltree/core';

// Create a signal tree with enhancers
const userTree = signalTree({
  user: {
    name: 'John Doe',
    age: 30,
    email: 'john@example.com'
  },
  settings: {
    theme: 'dark',
    notifications: true
  }
})
  .with(batching())
  .with(memoization())
  
  .with(devTools())
  .with(timeTravel())
  .with(presets());

// Access signals directly through state or $ (shorthand)
console.log(userTree.state.user.name()); // 'John Doe'
console.log(userTree.$.settings.theme()); // 'dark'

// Update individual values
userTree.state.user.name.set('Jane Doe');
userTree.$.settings.theme.set('light');

// Update entire tree
userTree((current) => ({
  ...current,
  user: { ...current.user, age: 31 }
}));

// Get unwrapped values
const userData = userTree();`;

  extremeDepthCode = `import { signalTree } from '@signaltree/core';

// 15+ Level Deep Enterprise Structure with Perfect Type Inference
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

// Perfect type inference at 15+ levels - no 'any' types!
const status = extremeDepth.$.enterprise.divisions.technology
  .departments.engineering.teams.frontend.projects.signaltree
  .releases.v1.features.recursiveTyping.validation.tests
  .extreme.status(); // TypeScript knows this is a string signal

// Update at extreme depth with full type safety
extremeDepth.$.enterprise.divisions.technology.departments
  .engineering.teams.frontend.projects.signaltree.releases.v1
  .features.recursiveTyping.validation.tests.extreme.depth.set(20);`;
}
