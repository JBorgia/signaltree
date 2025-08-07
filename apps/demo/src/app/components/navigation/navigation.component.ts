import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

export interface DemoExample {
  id: string;
  title: string;
  description: string;
  route: string;
  category: 'basic' | 'performance' | 'entities' | 'forms' | 'advanced';
}

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="bg-blue-900 text-white p-4">
      <div class="container mx-auto">
        <h1 class="text-2xl font-bold mb-4">🚀 NGX Signal Store Demo</h1>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div *ngFor="let category of categories" class="space-y-2">
            <h3
              class="font-semibold text-blue-200 uppercase text-sm tracking-wide"
            >
              {{ getCategoryLabel(category) }}
            </h3>
            <ul class="space-y-1">
              <li *ngFor="let example of getExamplesByCategory(category)">
                <a
                  [routerLink]="example.route"
                  routerLinkActive="bg-blue-700"
                  class="block px-3 py-2 rounded text-sm hover:bg-blue-800 transition-colors"
                  [attr.title]="example.description"
                >
                  {{ example.title }}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </nav>
  `,
  styles: [
    `
      .container {
        max-width: 1200px;
      }
    `,
  ],
})
export class NavigationComponent {
  examples: DemoExample[] = [
    // Basic Examples
    {
      id: 'basic-store',
      title: 'Basic Store',
      description: 'Simple signal store creation and updates',
      route: '/basic-store',
      category: 'basic',
    },
    {
      id: 'nested-store',
      title: 'Nested Store',
      description: 'Hierarchical store structures',
      route: '/nested-store',
      category: 'basic',
    },
    {
      id: 'computed-signals',
      title: 'Computed Signals',
      description: 'Derived state with computed signals',
      route: '/computed-signals',
      category: 'basic',
    },

    // Performance Examples
    {
      id: 'batching-comparison',
      title: 'Batching Comparison',
      description: 'Compare batched vs unbatched updates',
      route: '/batching-comparison',
      category: 'performance',
    },
    {
      id: 'memoization-demo',
      title: 'Memoization Demo',
      description: 'Cache performance with computed values',
      route: '/memoization-demo',
      category: 'performance',
    },
    {
      id: 'large-dataset',
      title: 'Large Dataset',
      description: 'Performance with thousands of items',
      route: '/large-dataset',
      category: 'performance',
    },
    {
      id: 'middleware-demo',
      title: 'Middleware System',
      description: 'Logging, validation, and custom middleware',
      route: '/middleware-demo',
      category: 'performance',
    },

    // Entity Examples
    {
      id: 'entity-crud',
      title: 'Entity CRUD',
      description: 'Create, read, update, delete entities',
      route: '/entity-crud',
      category: 'entities',
    },
    {
      id: 'entity-selection',
      title: 'Entity Selection',
      description: 'Select and manage entity selections',
      route: '/entity-selection',
      category: 'entities',
    },
    {
      id: 'async-loading',
      title: 'Async Loading',
      description: 'Load entities asynchronously with loading states',
      route: '/async-loading',
      category: 'entities',
    },

    // Form Examples
    {
      id: 'form-validation',
      title: 'Form Validation',
      description: 'Synchronous and asynchronous validation',
      route: '/form-validation',
      category: 'forms',
    },
    {
      id: 'nested-forms',
      title: 'Nested Forms',
      description: 'Complex nested form structures',
      route: '/nested-forms',
      category: 'forms',
    },
    {
      id: 'form-submission',
      title: 'Form Submission',
      description: 'Handle form submission with loading states',
      route: '/form-submission',
      category: 'forms',
    },

    // Advanced Examples
    {
      id: 'time-travel',
      title: 'Time Travel',
      description: 'Undo/redo functionality',
      route: '/time-travel',
      category: 'advanced',
    },
    {
      id: 'cross-domain',
      title: 'Cross-Domain Operations',
      description: 'Complex operations across multiple stores',
      route: '/cross-domain',
      category: 'advanced',
    },
    {
      id: 'rxjs-integration',
      title: 'RxJS Integration',
      description: 'Bridge signals with RxJS observables',
      route: '/rxjs-integration',
      category: 'advanced',
    },
  ];

  categories: DemoExample['category'][] = [
    'basic',
    'performance',
    'entities',
    'forms',
    'advanced',
  ];

  getExamplesByCategory(category: DemoExample['category']): DemoExample[] {
    return this.examples.filter((example) => example.category === category);
  }

  getCategoryLabel(category: DemoExample['category']): string {
    const labels: Record<DemoExample['category'], string> = {
      basic: 'Basic Features',
      performance: 'Performance',
      entities: 'Entity Store',
      forms: 'Form Store',
      advanced: 'Advanced',
    };
    return labels[category];
  }
}
