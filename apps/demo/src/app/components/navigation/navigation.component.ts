import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

export interface DemoExample {
  id: string;
  title: string;
  description: string;
  route: string;
  category: 'getting-started' | 'benchmarks' | 'performance' | 'features';
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
    // Getting Started
    {
      id: 'core',
      title: 'Core Features',
      description: 'Basic SignalTree functionality and API',
      route: '/core',
      category: 'getting-started',
    },
    {
      id: 'callable-syntax',
      title: 'Callable Syntax',
      description: 'Unified callable API: tree.$.user.name("value")',
      route: '/callable-syntax',
      category: 'getting-started',
    },

    // Benchmarks
    {
      id: 'benchmarks',
      title: 'Library Comparison',
      description: 'Compare SignalTree vs NgRx, Akita, Elf, NgXs',
      route: '/benchmarks',
      category: 'benchmarks',
    },
    {
      id: 'benchmark-history',
      title: 'Benchmark History',
      description: 'View historical results across machines',
      route: '/realistic-benchmark-history',
      category: 'benchmarks',
    },

    // Performance
    {
      id: 'batching',
      title: 'Batching',
      description: 'Batch multiple updates for optimal performance',
      route: '/batching',
      category: 'performance',
    },
    {
      id: 'memoization',
      title: 'Memoization',
      description: 'Cache expensive computations',
      route: '/memoization',
      category: 'performance',
    },
    {
      id: 'extreme-depth',
      title: 'Extreme Depth',
      description: 'Test recursive typing at 15+ levels',
      route: '/extreme-depth',
      category: 'performance',
    },

    // Features
    {
      id: 'entities',
      title: 'Entity Management',
      description: 'CRUD operations for entity collections',
      route: '/entities',
      category: 'features',
    },
    {
      id: 'presets',
      title: 'Presets',
      description: 'Pre-configured patterns for common use cases',
      route: '/presets',
      category: 'features',
    },
    {
      id: 'middleware',
      title: 'Middleware',
      description: 'Extend functionality with middleware hooks',
      route: '/middleware',
      category: 'features',
    },
    {
      id: 'time-travel',
      title: 'Time Travel',
      description: 'Undo/redo and state history',
      route: '/time-travel',
      category: 'features',
    },
    {
      id: 'devtools',
      title: 'DevTools',
      description: 'Developer tools and debugging utilities',
      route: '/devtools',
      category: 'features',
    },
  ];

  categories: DemoExample['category'][] = [
    'getting-started',
    'benchmarks',
    'performance',
    'features',
  ];

  getExamplesByCategory(category: DemoExample['category']): DemoExample[] {
    return this.examples.filter((example) => example.category === category);
  }

  getCategoryLabel(category: DemoExample['category']): string {
    const labels: Record<DemoExample['category'], string> = {
      'getting-started': '🚀 Getting Started',
      benchmarks: '📊 Benchmarks',
      performance: '⚡ Performance',
      features: '✨ Features',
    };
    return labels[category];
  }
}
