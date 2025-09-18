import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import {
  createDevTree,
  createPresetConfig,
  getAvailablePresets,
  TreePreset,
} from '@signaltree/presets';

import { SignalTreeBenchmarkService } from '../realistic-comparison/benchmark-orchestrator/services/signaltree-benchmark.service';

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
  template: `
    <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 class="text-2xl sm:text-3xl font-bold mb-6">
        SignalTree Presets Demo
      </h1>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <!-- Preset Selection -->
        <div class="lg:col-span-1">
          <div class="bg-white rounded-lg shadow p-4 sm:p-6 mb-6">
            <h2 class="text-lg sm:text-xl font-semibold mb-4">Select Preset</h2>

            <div class="space-y-3">
              @for (preset of availablePresets; track preset) {
              <button
                (click)="switchPreset(preset)"
                [class]="
                  'w-full p-3 text-left rounded-lg border transition-colors ' +
                  (currentPreset() === preset
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300')
                "
              >
                <div class="font-medium capitalize">{{ preset }}</div>
                <div class="text-sm text-gray-500 mt-1">
                  {{ getPresetDescription(preset) }}
                </div>
              </button>
              }
            </div>
          </div>

          <!-- Preset Configuration -->
          <div class="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 class="text-lg font-semibold mb-4">Current Configuration</h3>

            <div class="space-y-2">
              @for (config of currentConfigDisplay(); track config.key) {
              <div class="flex justify-between items-center py-1">
                <span class="text-sm text-gray-600">{{ config.label }}</span>
                <span
                  [class]="
                    'text-sm font-medium ' +
                    (config.value ? 'text-green-600' : 'text-gray-400')
                  "
                >
                  {{ config.value ? 'Enabled' : 'Disabled' }}
                </span>
              </div>
              }
            </div>

            <!-- Dev Tree Special Section -->
            @if (showDevTreeExample()) {
            <div class="mt-4 p-3 bg-blue-50 rounded-lg">
              <h4 class="font-medium text-blue-800 mb-2">
                Development Enhancers
              </h4>
              <div class="text-sm text-blue-700">
                Using
                <code class="bg-blue-100 px-1 rounded">createDevTree()</code>
                automatically includes devtools, time-travel, and async
                enhancers when available.
              </div>
            </div>
            }
          </div>
        </div>

        <!-- Interactive Demo -->
        <div class="lg:col-span-2">
          <div class="bg-white rounded-lg shadow p-4 sm:p-6">
            <h2 class="text-lg sm:text-xl font-semibold mb-4">
              Interactive Demo - {{ currentPreset() | titlecase }} Preset
            </h2>

            <!-- User Profile Section -->
            <div class="mb-6">
              <h3 class="font-medium mb-3">User Profile</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    for="user-name"
                    class="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Name
                  </label>
                  <input
                    id="user-name"
                    type="text"
                    [value]="tree.state.user.name()"
                    (input)="updateUserName($event)"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label
                    for="user-email"
                    class="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="user-email"
                    type="email"
                    [value]="tree.state.user.email()"
                    (input)="updateUserEmail($event)"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div class="mt-4 flex items-center space-x-4">
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    [checked]="tree.state.user.preferences.notifications()"
                    (change)="toggleNotifications()"
                    class="mr-2"
                  />
                  <span class="text-sm">Enable Notifications</span>
                </label>
                <label class="flex items-center">
                  <input
                    type="radio"
                    [checked]="tree.state.user.preferences.theme() === 'light'"
                    (change)="setTheme('light')"
                    name="theme"
                    class="mr-1"
                  />
                  <span class="text-sm mr-4">Light</span>
                  <input
                    type="radio"
                    [checked]="tree.state.user.preferences.theme() === 'dark'"
                    (change)="setTheme('dark')"
                    name="theme"
                    class="mr-1"
                  />
                  <span class="text-sm">Dark</span>
                </label>
              </div>
            </div>

            <!-- Todo Section -->
            <div class="mb-6">
              <h3 class="font-medium mb-3">Todos</h3>
              <div class="flex gap-2 mb-3">
                <input
                  type="text"
                  [(ngModel)]="newTodoTitle"
                  placeholder="Add a new todo..."
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  (keyup.enter)="addTodo()"
                />
                <select
                  [(ngModel)]="newTodoPriority"
                  class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <button
                  (click)="addTodo()"
                  class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  Add
                </button>
              </div>

              <div class="space-y-2 max-h-48 overflow-y-auto">
                @for (todo of tree.state.todos(); track todo.id) {
                <div
                  class="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div class="flex items-center flex-1">
                    <input
                      type="checkbox"
                      [checked]="todo.completed"
                      (change)="toggleTodo(todo.id)"
                      class="mr-3"
                    />
                    <span
                      [class]="
                        'flex-1 ' +
                        (todo.completed ? 'line-through text-gray-500' : '')
                      "
                    >
                      {{ todo.title }}
                    </span>
                    <span
                      [class]="
                        'px-2 py-1 text-xs rounded ' +
                        (todo.priority === 'high'
                          ? 'bg-red-100 text-red-700'
                          : todo.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700')
                      "
                    >
                      {{ todo.priority }}
                    </span>
                  </div>
                  <button
                    (click)="removeTodo(todo.id)"
                    class="ml-2 text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
                }
              </div>
            </div>

            <!-- UI State -->
            <div>
              <h3 class="font-medium mb-3">UI State</h3>
              <div class="flex items-center space-x-4">
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    [checked]="tree.state.ui.loading()"
                    (change)="toggleLoading()"
                    class="mr-2"
                  />
                  <span class="text-sm">Loading State</span>
                </label>
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    [checked]="tree.state.ui.sidebarOpen()"
                    (change)="toggleSidebar()"
                    class="mr-2"
                  />
                  <span class="text-sm">Sidebar Open</span>
                </label>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="mt-6 flex flex-wrap gap-2">
              <button
                (click)="performBulkUpdates()"
                class="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                Bulk Updates Test
              </button>
              <button
                (click)="resetToDefaults()"
                class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                Reset to Defaults
              </button>
              @if (currentPreset() === 'development' || currentPreset() ===
              'basic') {
              <button
                (click)="demonstratePresetFeatures()"
                class="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                Demo {{ currentPreset() | titlecase }} Features
              </button>
              }
            </div>
          </div>

          <!-- SignalTree Showcase (All Features) -->
          <div class="bg-white rounded-lg shadow p-4 sm:p-6 mt-6">
            <h3 class="text-lg font-semibold mb-4">SignalTree Showcase</h3>
            <div class="text-sm text-gray-600 mb-3">
              Run a SignalTree-only combined features workload (memoization,
              batching, serialization + async/history/middleware simulation).
              This is a SignalTree-only showcase and is not comparable across
              other libraries.
            </div>
            <div class="flex items-center gap-3">
              <button
                (click)="runAllFeaturesShowcase()"
                class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                Run Showcase
              </button>
              <div class="text-sm text-gray-700">
                <span *ngIf="showcasePending">Running...</span>
                <span *ngIf="showcaseResult !== null">
                  Completed: {{ showcaseResult }} ms
                </span>
              </div>
            </div>
          </div>

          <!-- Performance Metrics -->
          <div class="bg-white rounded-lg shadow p-4 sm:p-6 mt-6">
            <h3 class="text-lg font-semibold mb-4">Performance Metrics</h3>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="bg-blue-50 p-3 rounded-lg">
                <div class="text-sm text-blue-600 font-medium">
                  Update Count
                </div>
                <div class="text-xl font-bold text-blue-800">
                  {{ updateCount() }}
                </div>
              </div>
              <div class="bg-green-50 p-3 rounded-lg">
                <div class="text-sm text-green-600 font-medium">Preset</div>
                <div class="text-xl font-bold text-green-800 capitalize">
                  {{ currentPreset() }}
                </div>
              </div>
              <div class="bg-purple-50 p-3 rounded-lg">
                <div class="text-sm text-purple-600 font-medium">Features</div>
                <div class="text-xl font-bold text-purple-800">
                  {{ activeFeatureCount() }}
                </div>
              </div>
            </div>

            <div class="mt-4 p-3 bg-gray-50 rounded-lg">
              <div class="text-sm text-gray-600 mb-2">
                <strong>Note:</strong> Different presets optimize for different
                scenarios:
              </div>
              <ul class="text-sm text-gray-600 space-y-1">
                <li>
                  • <strong>Basic:</strong> Minimal overhead, direct signal
                  access
                </li>
                <li>
                  • <strong>Performance:</strong> Batching + memoization for
                  high-frequency updates
                </li>
                <li>
                  • <strong>Development:</strong> Full debugging features
                  (time-travel, devtools)
                </li>
                <li>
                  • <strong>Production:</strong> Optimized performance without
                  debug overhead
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .transition-colors {
        transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out,
          border-color 0.15s ease-in-out;
      }
    `,
  ],
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
