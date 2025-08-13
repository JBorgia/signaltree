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

    // Performance Examples
    {
      id: 'metrics',
      title: 'Performance Metrics',
      description: 'Real-time benchmarks and performance analysis',
      route: '/metrics',
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

    // Entity Examples
    {
      id: 'entity-crud',
      title: 'Entity CRUD',
      description: 'Create, read, update, delete entities',
      route: '/entity-crud',
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

    // Advanced Examples
    {
      id: 'time-travel',
      title: 'Time Travel',
      description: 'Undo/redo functionality',
      route: '/time-travel',
      category: 'advanced',
    },
    {
      id: 'extreme-depth',
      title: '🔥 Extreme Depth',
      description: 'Push recursive typing to 15+ levels',
      route: '/extreme-depth',
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
