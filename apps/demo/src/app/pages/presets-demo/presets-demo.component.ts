import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { createDevTree, createPresetConfig, getAvailablePresets, TreePreset } from '@signaltree/presets';

import {
  SignalTreeBenchmarkService,
} from '../realistic-comparison/benchmark-orchestrator/services/signaltree-benchmark.service';

interface AppState extends Record<string, unknown> {
  user: {
    name: string;
    email: string;
    preferences: {
      theme: 'light' | 'dark';
      notifications: boolean;
    };
  };
  todos: Array<{
    id: number;
    title: string;
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
  }>;
  ui: {
    loading: boolean;
    activeTab: string;
    sidebarOpen: boolean;
  };
}

/**
 * SignalTree Presets Demo
 *
 * Demonstrates how to use pre-configured SignalTree setups for common use cases:
 * - Basic: Minimal configuration with no advanced features
 * - Performance: Optimized for speed with batching and memoization
 * - Development: Full debugging features including time-travel and devtools
 * - Production: Optimized for production with performance features only
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
@Component({
  selector: 'app-presets-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './presets-demo.component.html',
  styleUrls: ['./presets-demo.component.scss'],
})
export class PresetsDemoComponent {
  // Available presets from the presets package
  availablePresets = getAvailablePresets();

  // Current preset selection
  currentPreset = signal<TreePreset>('basic');

  // Form state for new todos
  newTodoTitle = '';
  newTodoPriority: 'low' | 'medium' | 'high' = 'medium';

  // Performance tracking
  updateCount = signal(0);

  // SignalTree showcase state
  showcasePending = false;
  showcaseResult: number | null = null;

  private readonly signalTreeBench = inject(SignalTreeBenchmarkService);

  async runAllFeaturesShowcase() {
    try {
      this.showcasePending = true;
      this.showcaseResult = null;
      // Use a modest data size to keep demo runs quick
      const ms = await this.signalTreeBench.runAllFeaturesEnabledBenchmark(
        1000
      );
      this.showcaseResult = Math.round(ms);
    } finally {
      this.showcasePending = false;
    }
  }

  // Current tree instance (will be recreated when preset changes)
  tree = this.createTreeWithPreset('basic') as any;

  // Computed properties
  currentConfigDisplay = computed(() => {
    const config = createPresetConfig(this.currentPreset());
    return [
      {
        key: 'batchUpdates',
        label: 'Batch Updates',
        value: config.batchUpdates ?? false,
      },
      {
        key: 'useMemoization',
        label: 'Memoization',
        value: config.useMemoization ?? false,
      },
      {
        key: 'trackPerformance',
        label: 'Performance Tracking',
        value: config.trackPerformance ?? false,
      },
      {
        key: 'enableTimeTravel',
        label: 'Time Travel',
        value: config.enableTimeTravel ?? false,
      },
      {
        key: 'enableDevTools',
        label: 'DevTools',
        value: config.enableDevTools ?? false,
      },
      {
        key: 'debugMode',
        label: 'Debug Mode',
        value: config.debugMode ?? false,
      },
    ];
  });

  showDevTreeExample = computed(() => this.currentPreset() === 'development');

  activeFeatureCount = computed(
    () => this.currentConfigDisplay().filter((config) => config.value).length
  );

  private createTreeWithPreset(preset: TreePreset): any {
    const initialState: AppState = {
      user: {
        name: 'John Doe',
        email: 'john@example.com',
        preferences: {
          theme: 'light',
          notifications: true,
        },
      },
      todos: [
        {
          id: 1,
          title: 'Learn SignalTree presets',
          completed: false,
          priority: 'high',
        },
        {
          id: 2,
          title: 'Build awesome app',
          completed: false,
          priority: 'medium',
        },
      ],
      ui: {
        loading: false,
        activeTab: 'todos',
        sidebarOpen: false,
      },
    };

    if (preset === 'development') {
      // Use the special development tree creator that includes enhancers
      const { enhancer } = createDevTree();
      return signalTree(initialState).with(enhancer as any);
    } else {
      // For other presets, we just create a basic tree
      // (In a real app, you'd compose enhancers based on the preset config)
      return signalTree(initialState);
    }
  }

  switchPreset(preset: TreePreset) {
    this.currentPreset.set(preset);
    // Recreate tree with new preset
    const currentState = this.tree.state;
    this.tree = this.createTreeWithPreset(preset);

    // Copy over the current state
    (this.tree.state as any).user.name.set((currentState as any).user.name());
    (this.tree.state as any).user.email.set((currentState as any).user.email());
    (this.tree.state as any).user.preferences.theme.set(
      (currentState as any).user.preferences.theme()
    );
    (this.tree.state as any).user.preferences.notifications.set(
      (currentState as any).user.preferences.notifications()
    );
    (this.tree.state as any).todos.set((currentState as any).todos());
    (this.tree.state as any).ui.loading.set((currentState as any).ui.loading());
    (this.tree.state as any).ui.sidebarOpen.set(
      (currentState as any).ui.sidebarOpen()
    );

    this.incrementUpdateCount();
  }

  getPresetDescription(preset: TreePreset): string {
    const descriptions: Record<TreePreset, string> = {
      basic: 'Minimal configuration, no advanced features',
      performance: 'Optimized with batching and memoization',
      development: 'Full debugging with time-travel and devtools',
      production: 'Production-optimized performance features',
    };
    return descriptions[preset];
  }

  // Event handlers
  updateUserName(event: Event) {
    const target = event.target as HTMLInputElement;
    (this.tree.state as any).user.name.set(target.value);
    this.incrementUpdateCount();
  }

  updateUserEmail(event: Event) {
    const target = event.target as HTMLInputElement;
    (this.tree.state as any).user.email.set(target.value);
    this.incrementUpdateCount();
  }

  toggleNotifications() {
    (this.tree.state as any).user.preferences.notifications.update(
      (current: boolean) => !current
    );
    this.incrementUpdateCount();
  }

  setTheme(theme: 'light' | 'dark') {
    (this.tree.state as any).user.preferences.theme.set(theme);
    this.incrementUpdateCount();
  }

  addTodo() {
    if (!this.newTodoTitle.trim()) return;

    const newTodo = {
      id: Date.now(),
      title: this.newTodoTitle.trim(),
      completed: false,
      priority: this.newTodoPriority,
    };

    (this.tree.state as any).todos.update((todos: any[]) => [
      ...todos,
      newTodo,
    ]);
    this.newTodoTitle = '';
    this.incrementUpdateCount();
  }

  toggleTodo(id: number) {
    (this.tree.state as any).todos.update((todos: any[]) =>
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
    this.incrementUpdateCount();
  }

  removeTodo(id: number) {
    (this.tree.state as any).todos.update((todos: any[]) =>
      todos.filter((todo) => todo.id !== id)
    );
    this.incrementUpdateCount();
  }

  toggleLoading() {
    (this.tree.state as any).ui.loading.update((current: boolean) => !current);
    this.incrementUpdateCount();
  }

  toggleSidebar() {
    (this.tree.state as any).ui.sidebarOpen.update(
      (current: boolean) => !current
    );
    this.incrementUpdateCount();
  }

  performBulkUpdates() {
    // Demonstrate bulk updates - great for testing batching presets
    for (let i = 0; i < 5; i++) {
      (this.tree.state as any).todos.update((todos: any[]) => [
        ...todos,
        {
          id: Date.now() + i,
          title: `Bulk todo ${i + 1}`,
          completed: false,
          priority: i % 2 === 0 ? 'low' : ('high' as 'low' | 'high'),
        },
      ]);
    }

    // Update UI state multiple times
    (this.tree.state as any).ui.loading.set(true);
    setTimeout(() => (this.tree.state as any).ui.loading.set(false), 500);

    this.incrementUpdateCount(5);
  }

  resetToDefaults() {
    (this.tree.state as any).user.name.set('John Doe');
    (this.tree.state as any).user.email.set('john@example.com');
    (this.tree.state as any).user.preferences.theme.set('light');
    (this.tree.state as any).user.preferences.notifications.set(true);
    (this.tree.state as any).todos.set([
      {
        id: 1,
        title: 'Learn SignalTree presets',
        completed: false,
        priority: 'high',
      },
      {
        id: 2,
        title: 'Build awesome app',
        completed: false,
        priority: 'medium',
      },
    ]);
    (this.tree.state as any).ui.loading.set(false);
    (this.tree.state as any).ui.sidebarOpen.set(false);
    this.incrementUpdateCount();
  }

  demonstratePresetFeatures() {
    if (this.currentPreset() === 'development') {
      // Show development-specific features
      alert(
        'Development preset includes:\n• DevTools integration\n• Time travel debugging\n• Async state management\n• Performance tracking'
      );
    } else if (this.currentPreset() === 'basic') {
      // Show basic features
      alert(
        'Basic preset provides:\n• Direct signal access\n• Minimal overhead\n• Simple state updates\n• No advanced features'
      );
    }
  }

  private incrementUpdateCount(count = 1) {
    this.updateCount.update((current) => current + count);
  }
}
