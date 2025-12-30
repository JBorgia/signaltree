import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { signalTree } from '@signaltree/core';
import { enterprise, UpdateResult } from '@signaltree/enterprise';

import type { ISignalTree } from '@signaltree/core';
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
  imports: [CommonModule],
  templateUrl: './enterprise-enhancer.component.html',
  styleUrls: ['./enterprise-enhancer.component.scss'],
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
