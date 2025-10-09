import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

import { generateTodos, Todo } from '../../shared/models';

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
  templateUrl: './middleware-demo.component.html',
  styleUrls: ['./middleware-demo.component.scss'],
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

  getActiveMiddlewareCount(): number {
    let count = 0;
    if (this.enableLogging) count++;
    if (this.enableValidation) count++;
    if (this.enablePersistence) count++;
    if (this.enableUndo) count++;
    return count;
  }
}
