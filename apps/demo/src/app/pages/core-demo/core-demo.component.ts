import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

import { PerformanceMonitorService } from '../../services/performance-monitor.service';
import { generateTodos, Todo } from '../../shared/models';

interface CoreState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  newTodoTitle: string;
}

/**
 * CoreDemoComponent - Demonstrates SignalTree with Callable Syntax
 *
 * 🚀 CALLABLE SYNTAX LIVE DEMO WITH TYPE SAFETY:
 * This component uses the @signaltree/callable-syntax with full TypeScript support!
 *
 * ✅ NO @ts-nocheck needed - TypeScript understands the callable patterns
 * ✅ Full type safety with NotFn<T> helper preventing function conflicts
 * ✅ Seamless DX - write clean syntax, get transformed output
 *
 * 🎯 What you're seeing:
 * - tree.$.prop('value') - Direct value setting (clean & type-safe)
 * - tree.$.prop(fn) - Function updates (clean & type-safe)
 * - Full IntelliSense support with proper error checking
 *
 * 🔧 Transform Examples (build-time magic):

import { PerformanceMonitorService } from '../../services/performance-monitor.service';
import { generateTodos, Todo } from '../../shared/models';

interface CoreState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  newTodoTitle: string;
}

/**
 * CoreDemoComponent - Demonstrates SignalTree with Callable Syntax
 *
 * 🚀 CALLABLE SYNTAX LIVE DEMO:
 * This component uses the actual @signaltree/callable-syntax in a real component.
 *
 * ⚠️  @ts-nocheck is required because this shows pre-transform callable syntax.
 *
 * 🎯 What you're seeing:
 * - tree.$.prop('value') - Direct value setting (transforms to .set())
 * - tree.$.prop(fn) - Function updates (transforms to .update())
 * - TypeScript errors are EXPECTED and INTENTIONAL
 * - Build-time transform would convert these to working .set()/.update() calls
 *
 * � Transform Examples:
 * - this.store.state.todos(sampleTodos)           → this.store.state.todos.set(sampleTodos)
 * - this.store.state.filter(filter)               → this.store.state.filter.set(filter)
 * - this.store.state.todos(todos => [...todos])   → this.store.state.todos.update(todos => [...todos])
 */
@Component({
  selector: 'app-core-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">SignalTree Core Demo</h1>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Todo App -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Todo Application</h2>

          <!-- Add new todo -->
          <div class="mb-4">
            <div class="flex gap-2">
              <input
                type="text"
                [(ngModel)]="newTodoTitle"
                (keyup.enter)="addTodo()"
                placeholder="Add a new todo..."
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                (click)="addTodo()"
                [disabled]="!newTodoTitle.trim()"
                class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>

          <!-- Filters -->
          <div class="mb-4">
            <div class="flex gap-2">
              <button
                *ngFor="let f of filters"
                (click)="setFilter(f)"
                [class]="getFilterClass(f)"
              >
                {{ f | titlecase }} ({{ getFilterCount(f) }})
              </button>
            </div>
          </div>

          <!-- Todo list -->
          <div class="space-y-2">
            <div
              *ngFor="let todo of filteredTodos(); trackBy: trackTodo"
              class="flex items-center gap-3 p-3 bg-gray-50 rounded-md"
            >
              <input
                type="checkbox"
                [checked]="todo.completed"
                (change)="toggleTodo(todo.id)"
                class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span
                [class]="
                  todo.completed
                    ? 'line-through text-gray-500'
                    : 'text-gray-900'
                "
                class="flex-1"
              >
                {{ todo.title }}
              </span>
              <button
                (click)="removeTodo(todo.id)"
                class="text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </div>

            <div
              *ngIf="filteredTodos().length === 0"
              class="text-center text-gray-500 py-8"
            >
              No todos found
            </div>
          </div>

          <!-- Actions -->
          <div class="mt-4 flex gap-2">
            <button
              (click)="loadSampleData()"
              class="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
            >
              Load Sample Data
            </button>
            <button
              (click)="clearCompleted()"
              [disabled]="completedCount() === 0"
              class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear Completed
            </button>
          </div>
        </div>

        <!-- State Inspector -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">State Inspector</h2>

          <div class="space-y-4">
            <div>
              <h3 class="font-medium text-gray-700 mb-2">Computed Values</h3>
              <div class="bg-gray-50 p-3 rounded">
                <div class="text-sm space-y-1">
                  <div><strong>Total Todos:</strong> {{ todos().length }}</div>
                  <div><strong>Active:</strong> {{ activeCount() }}</div>
                  <div><strong>Completed:</strong> {{ completedCount() }}</div>
                  <div><strong>Current Filter:</strong> {{ filter() }}</div>
                  <div>
                    <strong>Filtered Count:</strong>
                    {{ filteredTodos().length }}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 class="font-medium text-gray-700 mb-2">Raw State</h3>
              <pre
                class="bg-gray-50 p-3 rounded text-sm overflow-auto max-h-64"
                >{{ stateJson() }}</pre
              >
            </div>

            <div>
              <h3 class="font-medium text-gray-700 mb-2">Performance</h3>
              <div class="bg-gray-50 p-3 rounded">
                <div class="text-sm space-y-1">
                  <div>
                    <strong>Last Operation:</strong> {{ lastOperation }}
                  </div>
                  <div>
                    <strong>Operation Count:</strong> {{ operationCount }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Features Explanation -->
      <div class="mt-8 bg-blue-50 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Core Features Demonstrated</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 class="font-medium text-blue-800 mb-2">Signal-based State</h3>
            <p class="text-sm text-blue-700">
              All state is managed through Angular signals, providing
              fine-grained reactivity and automatic change detection.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-blue-800 mb-2">Computed Properties</h3>
            <p class="text-sm text-blue-700">
              Derived state is automatically computed and cached, only updating
              when dependencies change.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-blue-800 mb-2">Immutable Updates</h3>
            <p class="text-sm text-blue-700">
              State updates maintain immutability while providing a clean,
              intuitive API.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-blue-800 mb-2">Type Safety</h3>
            <p class="text-sm text-blue-700">
              Full TypeScript support with type inference and compile-time
              checks.
            </p>
          </div>
        </div>
      </div>

      <!-- Callable Syntax Demo -->
      <div class="mt-8 bg-yellow-50 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4 text-yellow-800">
          🔥 Live Callable Syntax Demo (Pre-Transform)
        </h2>
        <div class="space-y-4">
          <div class="bg-yellow-100 p-4 rounded-lg">
            <h3 class="font-semibold text-yellow-800 mb-2">
              Real Component Using Callable Syntax - RAW VERSION
            </h3>
            <p class="text-sm text-yellow-700 mb-3">
              This component uses the actual callable syntax patterns.
              <strong>TypeScript errors are expected</strong> - they prove the
              transformation is needed and working correctly.
            </p>
            <div class="bg-white p-3 rounded border-l-4 border-yellow-500">
              <h4 class="font-medium text-yellow-800 mb-2">
                Live Callable Syntax Examples:
              </h4>
              <div class="text-sm font-mono text-gray-700 space-y-1">
                <div>
                  <span class="text-blue-600">✅ Value setting:</span>
                  this.store.state.todos(sampleTodos)
                </div>
                <div>
                  <span class="text-blue-600">✅ Function updates:</span>
                  this.store.state.todos(todos => [...todos])
                </div>
                <div>
                  <span class="text-blue-600">✅ Filter setting:</span>
                  this.store.state.filter('active')
                </div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 class="font-medium text-yellow-800 mb-2">
                ⚠️ Expected Errors
              </h4>
              <p class="text-sm text-yellow-700">
                TypeScript shows "Expected 0 arguments, but got 1" - this proves
                the transformation is necessary.
              </p>
            </div>
            <div>
              <h4 class="font-medium text-yellow-800 mb-2">
                🔧 Build Transform
              </h4>
              <p class="text-sm text-yellow-700">
                Build-time transformer converts these to .set()/.update() calls
                automatically.
              </p>
            </div>
            <div>
              <h4 class="font-medium text-yellow-800 mb-2">🎯 End Result</h4>
              <p class="text-sm text-yellow-700">
                Clean, callable syntax with zero runtime overhead and full type
                safety after transformation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .filter-btn-active {
        @apply bg-blue-500 text-white;
      }
      .filter-btn-inactive {
        @apply bg-gray-200 text-gray-700 hover:bg-gray-300;
      }
    `,
  ],
})
export class CoreDemoComponent {
  private performanceMonitor = inject(PerformanceMonitorService);

  private store = signalTree<CoreState>({
    todos: [],
    filter: 'all',
    newTodoTitle: '',
  });

  // State signals
  todos = this.store.state.todos;
  filter = this.store.state.filter;
  newTodoTitle = '';

  // Computed values
  activeCount = computed(() => this.todos().filter((t) => !t.completed).length);
  completedCount = computed(
    () => this.todos().filter((t) => t.completed).length
  );

  filteredTodos = computed(() => {
    const todos = this.todos();
    const filter = this.filter();

    switch (filter) {
      case 'active':
        return todos.filter((t) => !t.completed);
      case 'completed':
        return todos.filter((t) => t.completed);
      default:
        return todos;
    }
  });

  stateJson = computed(() =>
    JSON.stringify(
      {
        todos: this.todos().length + ' items',
        filter: this.filter(),
        counts: {
          total: this.todos().length,
          active: this.activeCount(),
          completed: this.completedCount(),
        },
      },
      null,
      2
    )
  );

  // Aliases for tests
  activeTodos = computed(() => this.todos().filter((t) => !t.completed).length);
  completedTodos = computed(
    () => this.todos().filter((t) => t.completed).length
  );
  deleteTodo = (id: number) => this.removeTodo(id);

  // UI helpers
  filters: Array<'all' | 'active' | 'completed'> = [
    'all',
    'active',
    'completed',
  ];
  lastOperation = 'None';
  operationCount = 0;

  private trackOperation(operation: string) {
    this.lastOperation = operation;
    this.operationCount++;
  }

  addTodo() {
    if (!this.newTodoTitle.trim()) return;

    const startTime = performance.now();
    const newTodo: Todo = {
      id: Date.now(),
      title: this.newTodoTitle.trim(),
      completed: false,
      createdAt: new Date(),
    };

    // 🔥 CALLABLE SYNTAX: Function argument transforms to .update()
    this.store.state.todos((todos) => [...todos, newTodo]);
    this.newTodoTitle = '';
    this.trackOperation('Add Todo');

    // Record performance
    this.performanceMonitor.recordSignalTreeOperation(
      'addTodo',
      performance.now() - startTime,
      { todoCount: this.todos().length }
    );
  }

  toggleTodo(id: number) {
    // 🔥 CALLABLE SYNTAX: Function argument transforms to .update()
    this.store.state.todos((todos) =>
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
    this.trackOperation('Toggle Todo');
  }

  removeTodo(id: number) {
    // 🔥 CALLABLE SYNTAX: Function argument transforms to .update()
    this.store.state.todos((todos) => todos.filter((todo) => todo.id !== id));
    this.trackOperation('Remove Todo');
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    // 🔥 CALLABLE SYNTAX: Value argument transforms to .set()
    this.store.state.filter(filter);
    this.trackOperation('Set Filter');
  }

  clearCompleted() {
    // 🔥 CALLABLE SYNTAX: Function argument transforms to .update()
    this.store.state.todos((todos) => todos.filter((todo) => !todo.completed));
    this.trackOperation('Clear Completed');
  }

  loadSampleData() {
    const sampleTodos = generateTodos(10);
    // 🔥 CALLABLE SYNTAX: Value argument transforms to .set()
    this.store.state.todos(sampleTodos);
    this.trackOperation('Load Sample Data');
  }

  getFilterClass(filter: string): string {
    const base = 'px-3 py-1 rounded text-sm transition-colors';
    const active = this.filter() === filter;
    return `${base} ${active ? 'filter-btn-active' : 'filter-btn-inactive'}`;
  }

  getFilterCount(filter: 'all' | 'active' | 'completed'): number {
    switch (filter) {
      case 'all':
        return this.todos().length;
      case 'active':
        return this.activeCount();
      case 'completed':
        return this.completedCount();
    }
  }

  trackTodo(index: number, todo: Todo): number {
    return todo.id;
  }
}
