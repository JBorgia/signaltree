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
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss'],
})
export class NavigationComponent {
  examples: DemoExample[] = [
    // Basic Examples
    {
      id: 'basic-tree',
      title: 'Basic Tree',
      description: 'Simple signal tree creation and updates',
      route: '/basic-tree',
      category: 'basic',
    },
    {
      id: 'nested-tree',
      title: 'Nested Tree',
      description: 'Hierarchical tree structures',
      route: '/nested-tree',
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
      id: 'version-comparison',
      title: 'Version Comparison',
      description: 'Compare basic vs optimized SignalTree versions',
      route: '/version-comparison',
      category: 'performance',
    },
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
      description: 'Complex operations across multiple trees',
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
      entities: 'Entity Tree',
      forms: 'Form Tree',
      advanced: 'Advanced',
    };
    return labels[category];
  }
}
