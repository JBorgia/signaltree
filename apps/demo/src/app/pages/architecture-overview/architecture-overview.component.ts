import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import { CodeTabsComponent } from '../../examples/shared/components/example-shell';
import type { CodeFile } from '../../examples/shared/components/example-shell';

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
  imports: [CommonModule, CodeTabsComponent],
  templateUrl: './architecture-overview.component.html',
  styleUrl: './architecture-overview.component.scss',
})
export class ArchitectureOverviewComponent {
  comparisons: ArchitectureComparison[] = [
    {
      aspect: 'Dependencies',
      separate: 'Multiple packages (@signaltree/core, @signaltree/entities, @signaltree/computed…)',
      consolidated: '@signaltree/core (includes all enhancers)',
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
      consolidated: 'Cross-package tree-shaking',
      benefit: 'Unused enhancers don\'t ship; you pay only for the imports you use',
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
      label: 'App Code Reduction',
      value: '76%',
      description: '11,735 → 2,825 lines of state code (one app snapshot — YMMV)',
    },
    {
      label: 'State Bundle Reduction',
      value: '~46%',
      description:
        'Downstream effect of writing less app code: ~50KB → ~27KB gzipped state bundle (one app snapshot — YMMV)',
    },
    {
      label: 'Dependency Count',
      value: '1 package',
      description: 'One versioned package for all enhancers',
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

  importSeparate: CodeFile[] = [
    {
      label: 'separate.ts',
      language: 'typescript',
      source: `// Legacy (pre-v4) approach required multiple installs and manual wiring
// e.g. separate batching/entities packages + core
// (deprecated in favor of single-package exports)`,
    },
  ];

  importConsolidated: CodeFile[] = [
    {
      label: 'consolidated.ts',
      language: 'typescript',
      source: `// Current approach - all enhancers in core
import {
  signalTree,
  batching,
  devTools,
  entityMap,
} from '@signaltree/core';`,
    },
  ];

  pillarReadCode: CodeFile[] = [
    {
      label: 'app.tree.ts',
      language: 'typescript',
      source: `// app.tree.ts
signalTree({ tickets: entityMap<Ticket>(), filter: '' })
  .derived($ => ({
    tickets: {
      visible: computed(() =>
        $.tickets.all().filter(t => t.title.includes($.filter()))
      )
    }
  }));

// component — one inject, all reads available
tree.$.tickets.visible()`,
    },
  ];

  pillarWriteCode: CodeFile[] = [
    {
      label: 'ticket.ops.ts',
      language: 'typescript',
      source: `@Injectable({ providedIn: 'root' })
export class TicketOps {
  private tree = inject(APP_TREE);
  private api  = inject(TicketApi);

  async load() {
    const data = await firstValueFrom(this.api.list());
    this.tree.$.tickets.setAll(data); // write only
  }
}`,
    },
  ];

  pillarReactCode: CodeFile[] = [
    {
      label: 'ticket.effect.ts',
      language: 'typescript',
      source: `// Registered once in a root service
tree.effect(state => {
  const filters = state.tickets.filters;
  // re-runs whenever filters change
  untracked(() => ticketOps.load(filters));
});`,
    },
  ];
}
