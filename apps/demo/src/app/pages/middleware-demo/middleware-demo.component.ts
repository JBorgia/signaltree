import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { Todo, generateTodos } from '../../shared/models';

interface MiddlewareState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  middlewareLogs: MiddlewareLog[];
  enableLogging: boolean;
  enableValidation: boolean;
  enablePersistence: boolean;
  enableUndo: boolean;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
}

interface MiddlewareLog {
  id: string;
  timestamp: number;
  type: 'before' | 'after' | 'error';
  action: string;
  data?: Record<string, unknown>;
  duration?: number;
  error?: string;
}

interface UndoEntry {
  action: string;
  previousState: Todo[];
  newState: Todo[];
  timestamp: number;
}

// Middleware functions
const loggingMiddleware = (logs: MiddlewareLog[]) => {
  return (action: string, next: () => unknown) => {
    const logId = `log_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const startTime = performance.now();

    logs.push({
      id: logId,
      timestamp: Date.now(),
      type: 'before',
      action,
      data: { message: `Starting ${action}` },
    });

    try {
      const result = next();
      const duration = performance.now() - startTime;

      logs.push({
        id: logId,
        timestamp: Date.now(),
        type: 'after',
        action,
        data: { message: `Completed ${action}` },
        duration,
      });

      return result;
    } catch (error) {
      logs.push({
        id: logId,
        timestamp: Date.now(),
        type: 'error',
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  };
};

const validationMiddleware = () => {
  return (action: string, next: () => unknown, ...args: unknown[]) => {
    // Validate todo operations
    const data = args[0] as Record<string, unknown> | undefined;
    if (action.includes('todo') && data) {
      if (
        action.includes('add') &&
        (!data['title'] || (data['title'] as string).trim().length === 0)
      ) {
        throw new Error('Todo title cannot be empty');
      }

      if (action.includes('add') && (data['title'] as string).length > 200) {
        throw new Error('Todo title cannot exceed 200 characters');
      }

      if (
        action.includes('update') &&
        data['id'] &&
        typeof data['id'] !== 'number'
      ) {
        throw new Error('Todo ID must be a number');
      }
    }

    return next();
  };
};

const persistenceMiddleware = () => {
  return (action: string, next: () => unknown, ...args: unknown[]) => {
    const result = next();

    // Simulate saving to localStorage
    if (action.includes('todo') && args[0]) {
      try {
        const state = args[0] as Record<string, unknown>;
        localStorage.setItem(
          'signaltree_demo_todos',
          JSON.stringify(state['todos'])
        );
      } catch (error) {
        console.warn('Failed to persist state:', error);
      }
    }

    return result;
  };
};

const undoMiddleware = (undoStack: UndoEntry[], redoStack: UndoEntry[]) => {
  return (action: string, next: () => unknown, ...args: unknown[]) => {
    if (action === 'undo' || action === 'redo') {
      return next(); // Don't track undo/redo actions
    }

    const result = next();

    const [previousState, newStateGetter] = args as [
      Todo[] | undefined,
      (() => Todo[]) | undefined
    ];

    if (previousState && newStateGetter) {
      const newState = newStateGetter();

      // Only add to undo stack if state actually changed and newState is valid
      if (
        newState &&
        JSON.stringify(previousState) !== JSON.stringify(newState)
      ) {
        undoStack.push({
          action,
          previousState: [...previousState],
          newState: [...newState],
          timestamp: Date.now(),
        });

        // Limit undo stack size
        if (undoStack.length > 20) {
          undoStack.shift();
        }

        // Clear redo stack when new action is performed
        redoStack.splice(0, redoStack.length);
      }
    }

    return result;
  };
};

@Component({
  selector: 'app-middleware-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">SignalTree Middleware Demo</h1>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Middleware Controls -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Middleware Controls</h2>

          <div class="space-y-4">
            <div class="border rounded-lg p-4">
              <h3 class="font-medium mb-3">Enable Middleware</h3>
              <div class="space-y-2">
                <label class="flex items-center">
                  <input
                    type="checkbox"
                    [(ngModel)]="enableLogging"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="ml-2 text-sm">🔍 Logging Middleware</span>
                </label>

                <label class="flex items-center">
                  <input
                    type="checkbox"
                    [(ngModel)]="enableValidation"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="ml-2 text-sm">✅ Validation Middleware</span>
                </label>

                <label class="flex items-center">
                  <input
                    type="checkbox"
                    [(ngModel)]="enablePersistence"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="ml-2 text-sm">💾 Persistence Middleware</span>
                </label>

                <label class="flex items-center">
                  <input
                    type="checkbox"
                    [(ngModel)]="enableUndo"
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="ml-2 text-sm">↶ Undo/Redo Middleware</span>
                </label>
              </div>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-medium mb-3">Quick Actions</h3>
              <div class="space-y-2">
                <button
                  (click)="addRandomTodo()"
                  class="w-full px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                >
                  + Add Random Todo
                </button>

                <button
                  (click)="addInvalidTodo()"
                  class="w-full px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  + Add Invalid Todo (Test Validation)
                </button>

                <button
                  (click)="toggleRandomTodo()"
                  [disabled]="todos().length === 0"
                  class="w-full px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ↻ Toggle Random Todo
                </button>

                <button
                  (click)="deleteRandomTodo()"
                  [disabled]="todos().length === 0"
                  class="w-full px-3 py-2 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  × Delete Random Todo
                </button>
              </div>
            </div>

            <div class="border rounded-lg p-4" *ngIf="enableUndo">
              <h3 class="font-medium mb-3">Undo/Redo</h3>
              <div class="flex gap-2">
                <button
                  (click)="undo()"
                  [disabled]="undoStack().length === 0"
                  class="flex-1 px-3 py-2 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ↶ Undo ({{ undoStack().length }})
                </button>

                <button
                  (click)="redo()"
                  [disabled]="redoStack().length === 0"
                  class="flex-1 px-3 py-2 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ↷ Redo ({{ redoStack().length }})
                </button>
              </div>
            </div>

            <div class="border rounded-lg p-4">
              <h3 class="font-medium mb-3">State Actions</h3>
              <div class="space-y-2">
                <button
                  (click)="clearAllTodos()"
                  [disabled]="todos().length === 0"
                  class="w-full px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear All Todos
                </button>

                <button
                  (click)="clearLogs()"
                  [disabled]="middlewareLogs().length === 0"
                  class="w-full px-3 py-2 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Logs
                </button>

                <button
                  (click)="loadFromStorage()"
                  class="w-full px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
                >
                  Load from Storage
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Todo List -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Todo List</h2>

          <!-- Filter Tabs -->
          <div class="flex border-b mb-4">
            <button
              *ngFor="let f of ['all', 'active', 'completed']"
              (click)="setFilterFromString(f)"
              [class]="
                filter() === f
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500'
              "
              class="px-4 py-2 border-b-2 text-sm font-medium hover:text-gray-700"
            >
              {{ f | titlecase }} ({{ getFilteredCount(f) }})
            </button>
          </div>

          <!-- Add Todo Form -->
          <div class="mb-4">
            <div class="flex gap-2">
              <input
                type="text"
                [(ngModel)]="newTodoText"
                (keyup.enter)="addTodo()"
                placeholder="Add a new todo..."
                class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                (click)="addTodo()"
                [disabled]="!newTodoText.trim()"
                class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>

          <!-- Todo Items -->
          <div class="space-y-2 max-h-64 overflow-y-auto">
            <div
              *ngFor="let todo of filteredTodos(); trackBy: trackTodo"
              class="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50"
            >
              <input
                type="checkbox"
                [checked]="todo.completed"
                (change)="toggleTodo(todo.id)"
                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />

              <span
                [class]="
                  todo.completed
                    ? 'line-through text-gray-500'
                    : 'text-gray-900'
                "
                class="flex-1 text-sm"
              >
                {{ todo.title }}
              </span>

              <button
                (click)="deleteTodo(todo.id)"
                class="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>

          <div
            *ngIf="filteredTodos().length === 0"
            class="text-center text-gray-500 py-8"
          >
            {{
              filter() === 'all'
                ? 'No todos yet.'
                : 'No ' + filter() + ' todos.'
            }}
          </div>

          <!-- Stats -->
          <div class="mt-4 pt-4 border-t">
            <div class="grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <div class="font-semibold text-blue-600">
                  {{ todos().length }}
                </div>
                <div class="text-gray-500">Total</div>
              </div>
              <div>
                <div class="font-semibold text-green-600">
                  {{ completedCount() }}
                </div>
                <div class="text-gray-500">Completed</div>
              </div>
              <div>
                <div class="font-semibold text-yellow-600">
                  {{ activeCount() }}
                </div>
                <div class="text-gray-500">Active</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Middleware Logs -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Middleware Logs</h2>

          <div class="space-y-2 max-h-80 overflow-y-auto">
            <div
              *ngFor="
                let log of middlewareLogs().slice().reverse();
                trackBy: trackLog
              "
              class="p-3 rounded-lg text-sm"
              [class]="getLogClass(log)"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="font-medium">{{ log.action }}</span>
                <span class="text-xs opacity-75">{{
                  formatTime(log.timestamp)
                }}</span>
              </div>

              <div class="text-xs opacity-90">
                {{ log.type | titlecase }}
                <span *ngIf="log.duration">
                  • {{ log.duration.toFixed(1) }}ms</span
                >
                <span *ngIf="log.error"> • {{ log.error }}</span>
              </div>

              <div
                *ngIf="log.data && log.data['message']"
                class="text-xs mt-1 opacity-75"
              >
                {{ log.data['message'] }}
              </div>
            </div>
          </div>

          <div
            *ngIf="middlewareLogs().length === 0"
            class="text-center text-gray-500 py-8"
          >
            No middleware logs yet. Enable logging and perform some actions.
          </div>
        </div>
      </div>

      <!-- Undo Stack Visualization -->
      <div
        class="mt-8 bg-white rounded-lg shadow p-6"
        *ngIf="enableUndo && undoStack().length > 0"
      >
        <h2 class="text-xl font-semibold mb-4">Undo Stack Visualization</h2>

        <div class="space-y-2">
          <div
            *ngFor="
              let entry of undoStack().slice().reverse();
              let i = index;
              trackBy: trackUndoEntry
            "
            class="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
          >
            <div
              class="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium"
            >
              {{ undoStack().length - i }}
            </div>

            <div class="flex-1">
              <div class="font-medium text-sm">{{ entry.action }}</div>
              <div class="text-xs text-gray-500">
                {{ formatTime(entry.timestamp) }} •
                {{ entry.previousState.length }} →
                {{ entry.newState.length }} todos
              </div>
            </div>

            <div class="text-xs text-gray-400">
              {{ getUndoChangeDescription(entry) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Features Explanation -->
      <div class="mt-8 bg-indigo-50 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">
          Middleware Features Demonstrated
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 class="font-medium text-indigo-800 mb-2">Logging Middleware</h3>
            <p class="text-sm text-indigo-700">
              Automatically logs all state changes with timing information and
              action details.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-indigo-800 mb-2">
              Validation Middleware
            </h3>
            <p class="text-sm text-indigo-700">
              Validates data before state changes, preventing invalid operations
              and maintaining data integrity.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-indigo-800 mb-2">
              Persistence Middleware
            </h3>
            <p class="text-sm text-indigo-700">
              Automatically saves state changes to local storage for data
              persistence across sessions.
            </p>
          </div>
          <div>
            <h3 class="font-medium text-indigo-800 mb-2">
              Undo/Redo Middleware
            </h3>
            <p class="text-sm text-indigo-700">
              Tracks state changes and provides undo/redo functionality with
              configurable history limits.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MiddlewareDemoComponent {
  private store = signalTree<MiddlewareState>({
    todos: generateTodos(5),
    filter: 'all',
    middlewareLogs: [],
    enableLogging: true,
    enableValidation: true,
    enablePersistence: false,
    enableUndo: true,
    undoStack: [],
    redoStack: [],
  });

  // State signals
  todos = this.store.$.todos;
  filter = this.store.$.filter;
  middlewareLogs = this.store.$.middlewareLogs;
  undoStack = this.store.$.undoStack;
  redoStack = this.store.$.redoStack;

  // Form fields
  newTodoText = '';
  enableLogging = this.store.$.enableLogging();
  enableValidation = this.store.$.enableValidation();
  enablePersistence = this.store.$.enablePersistence();
  enableUndo = this.store.$.enableUndo();

  // Computed values
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

  completedCount = computed(
    () => this.todos().filter((t) => t.completed).length
  );
  activeCount = computed(() => this.todos().filter((t) => !t.completed).length);

  private executeWithMiddleware(
    action: string,
    operation: () => void,
    data?: Record<string, unknown>
  ) {
    const logs = this.middlewareLogs();
    const previousTodos = [...this.todos()];

    // Build middleware chain
    const middlewares: Array<
      (action: string, next: () => unknown, ...args: unknown[]) => unknown
    > = [];

    if (this.enableLogging) {
      middlewares.push(loggingMiddleware(logs));
    }

    if (this.enableValidation) {
      middlewares.push(validationMiddleware());
    }

    if (this.enableUndo) {
      middlewares.push(undoMiddleware(this.undoStack(), this.redoStack()));
    }

    if (this.enablePersistence) {
      middlewares.push(persistenceMiddleware());
    }

    // Execute with middleware chain
    let next = operation;

    // Apply middleware in reverse order
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i];
      const currentNext = next;

      next = () =>
        middleware(action, currentNext, data, previousTodos, () =>
          this.todos()
        );
    }

    try {
      next();

      // Update logs in store if logging was enabled
      if (this.enableLogging) {
        this.store.$.middlewareLogs.set([...logs]);
      }
    } catch (error) {
      // Update logs even on error if logging was enabled
      if (this.enableLogging) {
        this.store.$.middlewareLogs.set([...logs]);
      }

      // Show error to user
      alert(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }

  addTodo() {
    if (!this.newTodoText.trim()) return;

    this.executeWithMiddleware(
      'add_todo',
      () => {
        const newTodo: Todo = {
          id: Math.max(...this.todos().map((t) => t.id), 0) + 1,
          title: this.newTodoText.trim(),
          completed: false,
          createdAt: new Date(),
          priority: 'medium',
        };

        this.store.$.todos.update((todos) => [...todos, newTodo]);
        this.newTodoText = '';
      },
      { title: this.newTodoText.trim() }
    );
  }

  addRandomTodo() {
    const randomTexts = [
      'Learn SignalTree middleware',
      'Build awesome Angular apps',
      'Write unit tests',
      'Review pull requests',
      'Plan next sprint',
      'Update documentation',
      'Refactor legacy code',
      'Implement new features',
    ];

    const randomText =
      randomTexts[Math.floor(Math.random() * randomTexts.length)];

    this.executeWithMiddleware(
      'add_random_todo',
      () => {
        const newTodo: Todo = {
          id: Math.max(...this.todos().map((t) => t.id), 0) + 1,
          title: randomText,
          completed: false,
          createdAt: new Date(),
          priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as
            | 'low'
            | 'medium'
            | 'high',
        };

        this.store.$.todos.update((todos) => [...todos, newTodo]);
      },
      { title: randomText }
    );
  }

  addInvalidTodo() {
    // This should trigger validation middleware
    this.executeWithMiddleware(
      'add_invalid_todo',
      () => {
        const newTodo: Todo = {
          id: Math.max(...this.todos().map((t) => t.id), 0) + 1,
          title: '', // Empty text should fail validation
          completed: false,
          createdAt: new Date(),
          priority: 'medium',
        };

        this.store.$.todos.update((todos) => [...todos, newTodo]);
      },
      { title: '' }
    );
  }

  toggleTodo(id: number) {
    this.executeWithMiddleware(
      'toggle_todo',
      () => {
        this.store.$.todos.update((todos) =>
          todos.map((t) =>
            t.id === id ? { ...t, completed: !t.completed } : t
          )
        );
      },
      { id }
    );
  }

  toggleRandomTodo() {
    const todos = this.todos();
    if (todos.length === 0) return;

    const randomTodo = todos[Math.floor(Math.random() * todos.length)];
    this.toggleTodo(randomTodo.id);
  }

  deleteTodo(id: number) {
    this.executeWithMiddleware(
      'delete_todo',
      () => {
        this.store.$.todos.update((todos) => todos.filter((t) => t.id !== id));
      },
      { id }
    );
  }

  deleteRandomTodo() {
    const todos = this.todos();
    if (todos.length === 0) return;

    const randomTodo = todos[Math.floor(Math.random() * todos.length)];
    this.deleteTodo(randomTodo.id);
  }

  clearAllTodos() {
    this.executeWithMiddleware('clear_all_todos', () => {
      this.store.$.todos.set([]);
    });
  }

  undo() {
    const undoStack = this.undoStack();
    const redoStack = this.redoStack();

    if (undoStack.length === 0) return;

    this.executeWithMiddleware('undo', () => {
      const lastEntry = undoStack[undoStack.length - 1];

      // Move to redo stack
      redoStack.push(lastEntry);
      this.store.$.redoStack.set([...redoStack]);

      // Remove from undo stack
      this.store.$.undoStack.set(undoStack.slice(0, -1));

      // Restore previous state
      this.store.$.todos.set([...lastEntry.previousState]);
    });
  }

  redo() {
    const redoStack = this.redoStack();
    const undoStack = this.undoStack();

    if (redoStack.length === 0) return;

    this.executeWithMiddleware('redo', () => {
      const lastEntry = redoStack[redoStack.length - 1];

      // Move to undo stack
      undoStack.push(lastEntry);
      this.store.$.undoStack.set([...undoStack]);

      // Remove from redo stack
      this.store.$.redoStack.set(redoStack.slice(0, -1));

      // Restore new state
      this.store.$.todos.set([...lastEntry.newState]);
    });
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    this.store.$.filter.set(filter);
  }

  setFilterFromString(filter: string) {
    if (filter === 'all' || filter === 'active' || filter === 'completed') {
      this.setFilter(filter);
    }
  }

  clearLogs() {
    this.store.$.middlewareLogs.set([]);
  }

  loadFromStorage() {
    this.executeWithMiddleware('load_from_storage', () => {
      try {
        const stored = localStorage.getItem('signaltree_demo_todos');
        if (stored) {
          const todos = JSON.parse(stored);
          this.store.$.todos.set(todos);
        }
      } catch (error) {
        console.warn('Failed to load from storage:', error);
      }
    });
  }

  getFilteredCount(filter: string): number {
    const todos = this.todos();
    switch (filter) {
      case 'active':
        return todos.filter((t) => !t.completed).length;
      case 'completed':
        return todos.filter((t) => t.completed).length;
      default:
        return todos.length;
    }
  }

  getLogClass(log: MiddlewareLog): string {
    switch (log.type) {
      case 'before':
        return 'bg-blue-50 border border-blue-200';
      case 'after':
        return 'bg-green-50 border border-green-200';
      case 'error':
        return 'bg-red-50 border border-red-200';
      default:
        return 'bg-gray-50 border border-gray-200';
    }
  }

  getUndoChangeDescription(entry: UndoEntry): string {
    if (entry.previousState.length !== entry.newState.length) {
      const change = Math.abs(
        entry.newState.length - entry.previousState.length
      );
      const sign =
        entry.newState.length > entry.previousState.length ? '+' : '-';
      return `${sign}${change}`;
    }
    return 'modified';
  }

  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  trackTodo(index: number, todo: Todo): number {
    return todo.id;
  }

  trackLog(index: number, log: MiddlewareLog): string {
    return log.id;
  }

  trackUndoEntry(index: number, entry: UndoEntry): number {
    return entry.timestamp;
  }
}
