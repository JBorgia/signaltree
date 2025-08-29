import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { Todo, generateTodos } from '../../shared/models';

interface CoreState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  newTodoTitle: string;
}

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
  private store = signalTree<CoreState>({
    todos: [],
    filter: 'all',
    newTodoTitle: '',
  });

  // State signals
  todos = this.store.$.todos;
  filter = this.store.$.filter;
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
  activeTodos = computed(() => this.todos().filter((t) => !t.completed));
  completedTodos = computed(() => this.todos().filter((t) => t.completed));
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

    const newTodo: Todo = {
      id: Date.now(),
      title: this.newTodoTitle.trim(),
      completed: false,
      createdAt: new Date(),
    };

    this.store.$.todos.update((todos) => [...todos, newTodo]);
    this.newTodoTitle = '';
    this.trackOperation('Add Todo');
  }

  toggleTodo(id: number) {
    this.store.$.todos.update((todos) =>
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
    this.trackOperation('Toggle Todo');
  }

  removeTodo(id: number) {
    this.store.$.todos.update((todos) =>
      todos.filter((todo) => todo.id !== id)
    );
    this.trackOperation('Remove Todo');
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    this.store.$.filter.set(filter);
    this.trackOperation('Set Filter');
  }

  clearCompleted() {
    this.store.$.todos.update((todos) =>
      todos.filter((todo) => !todo.completed)
    );
    this.trackOperation('Clear Completed');
  }

  loadSampleData() {
    const sampleTodos = generateTodos(10);
    this.store.$.todos.set(sampleTodos);
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
