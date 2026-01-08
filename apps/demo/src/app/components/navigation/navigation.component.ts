import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SIGNALTREE_CORE_VERSION, SIGNALTREE_ENTERPRISE_VERSION, SIGNALTREE_VERSION_SUMMARY } from '../../version';

export interface DemoExample {
  id: string;
  title: string;
  description: string;
  route: string;
  category:
    | 'getting-started'
    | 'core-features'
    | 'enhancers'
    | 'advanced'
    | 'benchmarks';
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
    // Getting Started - Learn the basics
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
        'Interactive examples demonstrating core SignalTree concepts',
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
    {
      id: 'architecture',
      title: 'Architecture Overview',
      description: 'Consolidated architecture and tree-shaking benefits',
      route: '/architecture',
      category: 'getting-started',
    },

    // Core Features - Built-in capabilities
    {
      id: 'entities',
      title: 'Entity Management',
      description: 'CRUD operations for entity collections',
      route: '/entities',
      category: 'core-features',
    },
    {
      id: 'ng-forms',
      title: 'Forms Integration',
      description: 'Angular forms bridge with persistence and validation',
      route: '/ng-forms',
      category: 'core-features',
    },
    {
      id: 'persistence',
      title: 'Persistence',
      description: 'Auto-save state to localStorage',
      route: '/persistence',
      category: 'core-features',
    },
    {
      id: 'serialization',
      title: 'Serialization',
      description: 'JSON export/import with type preservation',
      route: '/serialization',
      category: 'core-features',
    },

    // Enhancers - Extend your tree
    {
      id: 'batching',
      title: 'Batching',
      description: 'Batch multiple updates for optimal performance',
      route: '/batching',
      category: 'enhancers',
    },
    {
      id: 'memoization',
      title: 'Memoization',
      description: 'Cache expensive computations',
      route: '/memoization',
      category: 'enhancers',
    },
    {
      id: 'time-travel',
      title: 'Time Travel',
      description: 'Undo/redo and state history',
      route: '/time-travel',
      category: 'enhancers',
    },
    {
      id: 'devtools',
      title: 'DevTools',
      description: 'Redux DevTools integration',
      route: '/devtools',
      category: 'enhancers',
    },

    // Advanced - Enterprise & Configuration
    {
      id: 'custom-extensions',
      title: 'Custom Markers & Enhancers',
      description: 'Create your own markers and enhancers',
      route: '/custom-extensions',
      category: 'advanced',
    },
    {
      id: 'presets',
      title: 'Presets',
      description: 'Pre-configured patterns for common use cases',
      route: '/presets',
      category: 'advanced',
    },
    {
      id: 'enterprise-enhancer',
      title: 'Enterprise Enhancer',
      description: 'Audit, time-travel and enterprise presets',
      route: '/enterprise-enhancer',
      category: 'advanced',
    },
    {
      id: 'extreme-depth',
      title: 'Extreme Depth',
      description: 'Test recursive typing at 15+ levels',
      route: '/extreme-depth',
      category: 'advanced',
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
  ];

  categories: DemoExample['category'][] = [
    'getting-started',
    'core-features',
    'enhancers',
    'advanced',
    'benchmarks',
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
      'core-features': '📦 Core Features',
      enhancers: '⚡ Enhancers',
      advanced: '🔧 Advanced',
      benchmarks: '📊 Benchmarks',
    };
    return labels[category];
  }
}
