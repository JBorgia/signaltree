import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import {
  SIGNALTREE_CORE_VERSION,
  SIGNALTREE_ENTERPRISE_VERSION,
  SIGNALTREE_VERSION_SUMMARY,
} from '../../version';

export interface DemoExample {
  id: string;
  title: string;
  description: string;
  route: string;
  category: 'getting-started' | 'benchmarks' | 'performance' | 'features';
}

export interface ExternalLink {
  label: string;
  url: string;
  icon: string;
  title: string;
}

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss'],
})
export class NavigationComponent {
  readonly coreVersion: string;
  readonly enterpriseVersion: string;
  readonly versionSummary: string;
  readonly buildDate: string;

  constructor() {
    // Values injected via generated version.ts (tools/generate-version-env.cjs)
    this.coreVersion = SIGNALTREE_CORE_VERSION;
    this.enterpriseVersion = SIGNALTREE_ENTERPRISE_VERSION;
    this.versionSummary = SIGNALTREE_VERSION_SUMMARY;
    this.buildDate = new Date().toISOString().slice(0, 10);
  }
  examples: DemoExample[] = [
    // Getting Started
    {
      id: 'docs',
      title: '📚 Documentation',
      description: 'Package documentation and READMEs',
      route: '/docs',
      category: 'getting-started',
    },
    {
      id: 'fundamentals',
      title: 'Fundamentals',
      description:
        'Interactive examples demonstrating core SignalTree concepts with filtering',
      route: '/examples/fundamentals',
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
    {
      id: 'architecture',
      title: 'Architecture Overview',
      description: 'Consolidated architecture and tree-shaking benefits',
      route: '/architecture',
      category: 'features',
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
      id: 'ng-forms',
      title: 'Forms Integration',
      description: 'Angular forms bridge with persistence and validation',
      route: '/ng-forms',
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
    {
      id: 'enterprise-enhancer',
      title: 'Enterprise Enhancer',
      description: 'Audit, time-travel and enterprise presets',
      route: '/enterprise-enhancer',
      category: 'features',
    },
  ];

  categories: DemoExample['category'][] = [
    'getting-started',
    'benchmarks',
    'performance',
    'features',
  ];

  externalLinks: ExternalLink[] = [
    {
      label: 'GitHub',
      url: 'https://github.com/JBorgia/signaltree',
      icon: '🔗',
      title: 'View source code on GitHub',
    },
    {
      label: 'npm',
      url: 'https://www.npmjs.com/org/signaltree',
      icon: '📦',
      title: 'View packages on npm',
    },
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
