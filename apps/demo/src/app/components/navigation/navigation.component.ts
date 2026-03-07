import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
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
  queryParams?: Record<string, string>;
  category:
    | 'learn'
    | 'packages'
    | 'examples'
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
  readonly mobileMenuOpen = signal(false);

  constructor() {
    this.coreVersion = SIGNALTREE_CORE_VERSION;
    this.enterpriseVersion = SIGNALTREE_ENTERPRISE_VERSION;
    this.versionSummary = SIGNALTREE_VERSION_SUMMARY;
  }

  examples: DemoExample[] = [
    {
      id: 'docs',
      title: 'Documentation',
      description: 'Browse package docs and READMEs',
      route: '/docs',
      category: 'learn',
    },
    {
      id: 'fundamentals',
      title: 'Fundamentals',
      description: 'Interactive core examples and mental model',
      route: '/examples/fundamentals',
      category: 'learn',
    },
    {
      id: 'recommended-architecture',
      title: 'Recommended Architecture',
      description: 'One runtime tree, typed slices, root-level enhancers',
      route: '/examples/fundamentals/recommended-architecture',
      category: 'learn',
    },
    {
      id: 'migration-recipe',
      title: 'Migration Recipe',
      description: 'Practical path from more ceremonial state patterns',
      route: '/examples/fundamentals/migration-recipe',
      category: 'learn',
    },
    {
      id: 'core-package',
      title: 'Core Package',
      description: 'Start with the main SignalTree package',
      route: '/docs',
      queryParams: { package: 'core' },
      category: 'packages',
    },
    {
      id: 'events',
      title: 'Events',
      description: 'Event helpers and related docs/demo entry points',
      route: '/docs',
      queryParams: { package: 'events' },
      category: 'packages',
    },
    {
      id: 'realtime',
      title: 'Realtime',
      description: 'Live synchronization patterns for entity maps',
      route: '/docs',
      queryParams: { package: 'realtime' },
      category: 'packages',
    },
    {
      id: 'ng-forms',
      title: 'Angular Forms',
      description: 'Forms integration with validation and persistence',
      route: '/docs',
      queryParams: { package: 'ng-forms' },
      category: 'packages',
    },
    {
      id: 'callable-syntax',
      title: 'Callable Syntax',
      description: 'Optional DX layer for callable node syntax',
      route: '/docs',
      queryParams: { package: 'callable-syntax' },
      category: 'packages',
    },
    {
      id: 'form-marker',
      title: 'Form Marker',
      description: 'Tree-integrated form state modeling',
      route: '/form-marker',
      category: 'examples',
    },
    {
      id: 'batching',
      title: 'Batching',
      description: 'Batch multiple updates without losing clarity',
      route: '/batching',
      category: 'examples',
    },
    {
      id: 'entities',
      title: 'Entities',
      description: 'CRUD ergonomics for collection-heavy state',
      route: '/entities',
      category: 'examples',
    },
    {
      id: 'memoization',
      title: 'Memoization',
      description: 'Cache expensive computations',
      route: '/memoization',
      category: 'examples',
    },
    {
      id: 'persistence',
      title: 'Persistence',
      description: 'Persist state deliberately to local storage',
      route: '/persistence',
      category: 'examples',
    },
    {
      id: 'serialization',
      title: 'Serialization',
      description: 'Export/import state with explicit serialization',
      route: '/serialization',
      category: 'examples',
    },
    {
      id: 'time-travel',
      title: 'Time Travel',
      description: 'Undo/redo and state history',
      route: '/time-travel',
      category: 'examples',
    },
    {
      id: 'devtools',
      title: 'DevTools',
      description: 'Redux DevTools integration',
      route: '/devtools',
      category: 'examples',
    },
    {
      id: 'custom-extensions',
      title: 'Custom Extensions',
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
      id: 'markers',
      title: 'Markers',
      description: 'Understand the marker model and built-in primitives',
      route: '/markers',
      category: 'advanced',
    },
    {
      id: 'guardrails',
      title: 'Guardrails',
      description: 'Development guardrails and monitoring surface',
      route: '/guardrails',
      category: 'advanced',
    },
    {
      id: 'undo-redo',
      title: 'Undo / Redo',
      description: 'Focused history workflow demo',
      route: '/undo-redo',
      category: 'advanced',
    },
    {
      id: 'bundle-visualizer',
      title: 'Bundle Visualizer',
      description: 'Inspect output shape and tree-shaking-oriented packaging',
      route: '/bundle-visualizer',
      category: 'advanced',
    },
    {
      id: 'enterprise-enhancer',
      title: 'Enterprise Enhancer',
      description: 'Audit, diagnostics, and enterprise-oriented capabilities',
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
    {
      id: 'benchmarks',
      title: 'Library Comparison',
      description: 'Compare SignalTree with other Angular state approaches',
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
    'learn',
    'packages',
    'examples',
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

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((isOpen) => !isOpen);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  getCategoryLabel(category: DemoExample['category']): string {
    const labels: Record<DemoExample['category'], string> = {
      learn: '🚀 Learn',
      packages: '📦 Reference',
      examples: '🧪 Examples',
      advanced: '🔧 Advanced',
      benchmarks: '📊 Benchmarks',
    };
    return labels[category];
  }
}
