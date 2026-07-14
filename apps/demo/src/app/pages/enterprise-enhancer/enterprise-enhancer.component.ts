import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { signalTree } from '@signaltree/core';
import { enterprise, UpdateResult } from '@signaltree/enterprise';

import {
  type CodeFile,
  ExampleComponent,
} from '../../examples/shared/components/example-shell';

// ── Source shown in the st-example code panel ────────────────────────────────

const BASIC_SETUP_SOURCE = `import { signalTree } from '@signaltree/core';
import { enterprise } from '@signaltree/enterprise';

const tree = signalTree(largeState).with(enterprise());

// Optimized bulk update
const result = tree.updateOptimized(newData, {
  ignoreArrayOrder: true,
  maxDepth: 10
});

console.log(result.stats);
// { totalPaths: 45, optimizedPaths: 30, batchedUpdates: 5 }`;

const DASHBOARD_SOURCE = `const dashboard = signalTree(initialState).with(enterprise());

// High-frequency WebSocket updates
socket.on('metrics', (newMetrics) => {
  const result = dashboard.updateOptimized(
    { metrics: newMetrics },
    { ignoreArrayOrder: true }
  );

  console.log(\`Updated \${result.changedPaths.length} paths\`);
});`;

const CUSTOM_EQUALITY_SOURCE = `tree.updateOptimized(newState, {
  equalityFn: (a, b) => {
    // Custom deep equality for specific types
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    return a === b;
  }
});`;

interface DashboardState extends Record<string, unknown> {
  metrics: Record<string, number>;
  users: Array<{ id: number; name: string; active: boolean }>;
  config: {
    theme: string;
    language: string;
    notifications: boolean;
  };
}

@Component({
  selector: 'app-enterprise-enhancer',
  standalone: true,
  imports: [CommonModule, ExampleComponent],
  templateUrl: './enterprise-enhancer.component.html',
  styleUrl: './enterprise-enhancer.component.scss',
})
export class EnterpriseEnhancerComponent {
  // Demo state with large structure - explicitly type the enhanced tree
  private tree = signalTree<DashboardState>({
    metrics: {
      cpu: 45,
      memory: 62,
      disk: 78,
      network: 23,
    },
    users: [
      { id: 1, name: 'Alice Johnson', active: true },
      { id: 2, name: 'Bob Smith', active: false },
      { id: 3, name: 'Carol Williams', active: true },
    ],
    config: {
      theme: 'light',
      language: 'en',
      notifications: true,
    },
  }).with(enterprise());

  // Expose signals for template
  metrics = this.tree.$.metrics;
  users = this.tree.$.users;
  config = this.tree.$.config;

  // Track last update result
  lastUpdateResult = signal<UpdateResult | null>(null);
  updateCount = signal(0);

  // Computed statistics
  totalChanges = computed(
    () => this.lastUpdateResult()?.changedPaths?.length ?? 0
  );
  hasPathIndex = computed(() => this.tree.getPathIndex() !== null);
  lastDuration = computed(() => this.lastUpdateResult()?.duration ?? 0);
  totalPaths = computed(() => this.lastUpdateResult()?.stats?.totalPaths ?? 0);
  optimizedPaths = computed(
    () => this.lastUpdateResult()?.stats?.optimizedPaths ?? 0
  );
  batchedUpdates = computed(
    () => this.lastUpdateResult()?.stats?.batchedUpdates ?? 0
  );

  // Live snapshot for the st-example state inspector (replaces the hand-rolled
  // .state-display block).
  readonly stateSnapshot = computed(() => ({
    metrics: this.metrics(),
    users: this.users(),
    config: this.config(),
  }));

  // Source tabs for the st-example code viewer.
  readonly codeFiles: CodeFile[] = [
    { label: 'Basic Setup', language: 'typescript', source: BASIC_SETUP_SOURCE },
    {
      label: 'Real-Time Dashboard',
      language: 'typescript',
      source: DASHBOARD_SOURCE,
    },
    {
      label: 'Custom Equality',
      language: 'typescript',
      source: CUSTOM_EQUALITY_SOURCE,
    },
  ];

  // Demo actions
  updateMetrics() {
    const newMetrics = {
      cpu: Math.floor(Math.random() * 100),
      memory: Math.floor(Math.random() * 100),
      disk: Math.floor(Math.random() * 100),
      network: Math.floor(Math.random() * 100),
    };

    const result = this.tree.updateOptimized(
      { metrics: newMetrics },
      { ignoreArrayOrder: true }
    );

    this.lastUpdateResult.set(result);
    this.updateCount.update((n) => n + 1);
  }

  bulkUpdateUsers() {
    const newUsers = [
      { id: 1, name: 'Alice Johnson', active: !this.users()[0].active },
      { id: 2, name: 'Bob Smith', active: !this.users()[1].active },
      { id: 3, name: 'Carol Williams', active: !this.users()[2].active },
      { id: 4, name: 'David Brown', active: true },
    ];

    const result = this.tree.updateOptimized(
      { users: newUsers },
      { maxDepth: 3, ignoreArrayOrder: false }
    );

    this.lastUpdateResult.set(result);
    this.updateCount.update((n) => n + 1);
  }

  massUpdate() {
    const newState: Partial<DashboardState> = {
      metrics: {
        cpu: Math.floor(Math.random() * 100),
        memory: Math.floor(Math.random() * 100),
        disk: Math.floor(Math.random() * 100),
        network: Math.floor(Math.random() * 100),
      },
      users: this.users().map((u) => ({
        ...u,
        active: Math.random() > 0.5,
      })),
      config: {
        theme: this.config().theme === 'light' ? 'dark' : 'light',
        language: 'en',
        notifications: !this.config().notifications,
      },
    };

    const result = this.tree.updateOptimized(newState, {
      maxDepth: 5,
      ignoreArrayOrder: true,
    });

    this.lastUpdateResult.set(result);
    this.updateCount.update((n) => n + 1);
  }

  reset() {
    this.tree({
      metrics: {
        cpu: 45,
        memory: 62,
        disk: 78,
        network: 23,
      },
      users: [
        { id: 1, name: 'Alice Johnson', active: true },
        { id: 2, name: 'Bob Smith', active: false },
        { id: 3, name: 'Carol Williams', active: true },
      ],
      config: {
        theme: 'light',
        language: 'en',
        notifications: true,
      },
    });

    this.lastUpdateResult.set(null);
    this.updateCount.set(0);
  }
}
