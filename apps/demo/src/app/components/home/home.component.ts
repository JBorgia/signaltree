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
      title: '🏪 Basic Tree',
      description:
        'Simple hierarchical signal tree with reactive state management',
      route: '/basic-tree',
      category: 'Core',
    },
    {
      title: '⚡ Performance',
      description: 'Batched updates, memoization, and performance optimization',
      route: '/performance',
      category: 'Performance',
      methods: ['batch', 'computed', 'optimize', 'clearCache', 'getMetrics'],
    },
    {
      title: '🔌 Middleware',
      description:
        'Intercept and extend tree operations with custom middleware',
      route: '/middleware',
      category: 'Middleware',
      methods: ['use', 'removePlugin'],
    },
    {
      title: '📦 Entity Management',
      description:
        'CRUD operations and entity helpers for managing collections',
      route: '/entity',
      category: 'Entity',
      methods: [
        'entities',
        'add',
        'update',
        'remove',
        'upsert',
        'findById',
        'findBy',
      ],
    },
    {
      title: '🌐 Async Operations',
      description:
        'Handle async operations with loading states and error management',
      route: '/async',
      category: 'Async',
      methods: ['asyncAction'],
    },
    {
      title: '⏰ Time Travel',
      description: 'Undo/redo functionality with state history tracking',
      route: '/time-travel',
      category: 'Time Travel',
      methods: ['undo', 'redo', 'getHistory', 'resetHistory'],
    },
    {
      title: '📝 Form Integration',
      description: 'Two-way binding and form validation with signals',
      route: '/forms',
      category: 'Forms',
    },
    {
      title: '🧪 Testing Utilities',
      description: 'Specialized testing helpers and utilities',
      route: '/testing',
      category: 'Testing',
    },
    {
      title: '🔥 Extreme Depth Testing',
      description:
        'Push recursive typing to 15+ levels with perfect type inference',
      route: '/extreme-depth',
      category: 'Advanced',
      highlight: true,
    },
  ];

  coreFeatures = [
    {
      name: 'Hierarchical State',
      description:
        'Organize state in nested structures with automatic signal creation',
    },
    {
      name: 'Type Safety',
      description:
        'Full TypeScript support with inferred types and autocomplete',
    },
    {
      name: 'Reactive Updates',
      description: 'Built on Angular signals for automatic change detection',
    },
    {
      name: 'Developer Tools',
      description: 'Redux DevTools integration for debugging and inspection',
    },
    {
      name: 'Extreme Depth',
      description:
        'Unlimited nesting depth with perfect type inference at 15+ levels',
      highlight: true,
    },
  ];

  getFeaturesByCategory(category: string) {
    return this.features.filter((f) => f.category === category);
  }

  quickStartCode = `import { signalTree } from '@signaltree/signaltree';

// Create a signal tree
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
});

// Access signals directly through state or $ (shorthand)
console.log(userTree.state.user.name()); // 'John Doe'
console.log(userTree.$.settings.theme()); // 'dark'

// Update individual values
userTree.state.user.name.set('Jane Doe');
userTree.$.settings.theme.set('light');

// Update entire tree
userTree.update(current => ({
  ...current,
  user: { ...current.user, age: 31 }
}));

// Get unwrapped values
const userData = userTree.unwrap();`;

  extremeDepthCode = `import { signalTree } from '@signaltree/signaltree';

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
