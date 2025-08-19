import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

export interface DemoExample {
  id: string;
  title: string;
  description: string;
  route: string;
  category: 'basic' | 'performance' | 'entities' | 'advanced';
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
      id: 'core',
      title: 'Core Features',
      description: 'Basic SignalTree functionality',
      route: '/core',
      category: 'basic',
    },
    {
      id: 'async',
      title: 'Async Operations',
      description: 'Async state management patterns',
      route: '/async',
      category: 'basic',
    },

    // Performance Examples
    {
      id: 'performance',
      title: 'Performance Comparison',
      description: 'Real-time benchmarks and performance analysis',
      route: '/performance',
      category: 'performance',
    },
    {
      id: 'batching',
      title: 'Batching Demo',
      description: 'Compare batched vs unbatched updates',
      route: '/batching',
      category: 'performance',
    },

    // Entity Examples
    {
      id: 'entities',
      title: 'Entity Management',
      description: 'Create, read, update, delete entities',
      route: '/entities',
      category: 'entities',
    },

    // Advanced Examples
    {
      id: 'middleware',
      title: 'Middleware',
      description: 'State management middleware patterns',
      route: '/middleware',
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
      advanced: 'Advanced',
    };
    return labels[category];
  }
}
