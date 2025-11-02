import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

interface ArchitectureComparison {
  aspect: string;
  separate: string;
  consolidated: string;
  benefit: string;
}

interface SavingsMetric {
  label: string;
  value: string;
  description: string;
}

@Component({
  selector: 'app-architecture-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './architecture-overview.component.html',
  styleUrls: ['./architecture-overview.component.scss'],
})
export class ArchitectureOverviewComponent {
  comparisons: ArchitectureComparison[] = [
    {
      aspect: 'Bundle Size',
      separate: 'Multiple packages (core, computed, entities, etc.)',
      consolidated: 'Single optimized package',
      benefit: 'Reduced bundle size through better tree-shaking',
    },
    {
      aspect: 'Dependencies',
      separate: '@signaltree/core + @signaltree/computed + @signaltree/entities',
      consolidated: '@signaltree/core (includes all features)',
      benefit: 'Simplified dependency management',
    },
    {
      aspect: 'Type Safety',
      separate: 'Separate type definitions per package',
      consolidated: 'Unified type system across all features',
      benefit: 'Better TypeScript integration and fewer type conflicts',
    },
    {
      aspect: 'Tree Shaking',
      separate: 'Limited optimization between packages',
      consolidated: 'Advanced tree-shaking across entire library',
      benefit: 'Smaller production bundles',
    },
    {
      aspect: 'API Consistency',
      separate: 'Different APIs per feature package',
      consolidated: 'Unified API for all features',
      benefit: 'Easier learning curve and consistent usage patterns',
    },
  ];

  savingsMetrics: SavingsMetric[] = [
    {
      label: 'Bundle Size Reduction',
      value: '~15-25%',
      description: 'Average bundle size savings compared to separate packages',
    },
    {
      label: 'Dependency Count',
      value: '1 package',
      description: 'Instead of 4-6 separate packages',
    },
    {
      label: 'Type Conflicts',
      value: '0',
      description: 'Unified type system eliminates conflicts',
    },
    {
      label: 'API Surface',
      value: 'Consistent',
      description: 'Single API instead of multiple package APIs',
    },
  ];

  importExamples = {
    separate: `import { createSignalTree } from '@signaltree/core';
import { computed } from '@signaltree/computed';
import { entities } from '@signaltree/entities';
import { middleware } from '@signaltree/middleware';`,
    consolidated: `import { createSignalTree, computed, entities, middleware } from '@signaltree/core';`,
  };
}
