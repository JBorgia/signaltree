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
      id: 'callable-syntax',
      title: 'Callable Syntax',
      description: 'Unified callable API: tree.$.user.name("value")',
      route: '/callable-syntax',
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
      id: 'performance-dashboard',
      title: 'Performance Dashboard',
      description: 'Live performance monitoring and metrics',
      route: '/performance-dashboard',
      category: 'performance',
    },
    // Removed outdated comparisons to native signals and mock libraries
    {
      id: 'realistic-comparison',
      title: 'Realistic Comparison',
      description: 'SignalTree vs NgRx Store and NgRx SignalStore',
      route: '/realistic-comparison',
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
      id: 'memoization',
      title: 'Memoization',
      description: 'Performance optimization with memoization',
      route: '/memoization',
      category: 'advanced',
    },
    {
      id: 'time-travel',
      title: 'Time Travel',
      description: 'State history and debugging',
      route: '/time-travel',
      category: 'advanced',
    },
    {
      id: 'devtools',
      title: 'DevTools',
      description: 'Developer tools and debugging',
      route: '/devtools',
      category: 'advanced',
    },
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
