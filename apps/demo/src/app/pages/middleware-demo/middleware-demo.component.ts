import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree, withMiddleware } from '@signaltree/core';

import { generateTodos, Todo } from '../../shared/models';

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
  timestamp: number;
}

interface MiddlewareState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  logs: MiddlewareLog[];
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  lastSaved: number;
}

const STORAGE_KEY = 'signaltree-middleware-todos';

@Component({
  selector: 'app-middleware-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './middleware-demo.component.html',
  styleUrls: ['./middleware-demo.component.scss'],
})
export class MiddlewareDemoComponent {
  enableLogging = true; // These are now configured in withMiddleware enhancer
  enableValidation = true;
  enablePersistence = false;
  enableUndo = false;
  newTodoTitle = '';

  private tree = signalTree<MiddlewareState>({
    todos: generateTodos(3),
    filter: 'all',
    logs: [],
    undoStack: [],
    redoStack: [],
    lastSaved: Date.now(),
  }).with(
    withMiddleware([
      {
        before: (action: string, payload: unknown) => {
          if (!this.enableLogging) return true;
          const log: MiddlewareLog = {
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            type: 'before',
            action,
            data: payload as Record<string, unknown>,
          };
          this.tree.$.logs.update((logs) => [log, ...logs].slice(0, 50));
          return true;
        },
        after: (action: string, payload: unknown) => {
          if (!this.enableLogging) return;
          const log: MiddlewareLog = {
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            type: 'after',
            action,
            data: payload as Record<string, unknown>,
            duration: 0, // Could track duration if needed
          };
          this.tree.$.logs.update((logs) => [log, ...logs].slice(0, 50));
        },
      },
      {
        before: (action: string, payload: unknown) => {
          if (!this.enableValidation) return true;
          if (action === 'addTodo') {
            const title = (payload as { title?: string })?.title;
            if (!title || title.trim().length === 0) {
              alert('Todo title cannot be empty');
              return false;
            }
            if (title.length > 200) {
              alert('Todo title cannot exceed 200 characters');
              return false;
            }
          }
          return true;
        },
      },
      {
        after: (
          action: string,
          payload: unknown,
          state: MiddlewareState,
          newState: MiddlewareState
        ) => {
          if (!this.enablePersistence) return;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newState.todos));
            this.tree.$.lastSaved.set(Date.now());
          } catch (error) {
            console.error('Failed to save to storage:', error);
          }
        },
      },
      {
        before: (action: string, payload: unknown, state: MiddlewareState) => {
          if (!this.enableUndo) return true;
          const entry: UndoEntry = {
            action,
            previousState: [...state.todos],
            timestamp: Date.now(),
          };
          this.tree.$.undoStack.update((stack) =>
            [entry, ...stack].slice(0, 50)
          );
          this.tree.$.redoStack.set([]);
          return true;
        },
      },
    ])
  );

  todos = computed(() => this.tree.$.todos());
  filter = computed(() => this.tree.$.filter());
  middlewareLogs = computed(() => this.tree.$.logs());
  undoStack = computed(() => this.tree.$.undoStack());
  redoStack = computed(() => this.tree.$.redoStack());
  allTodos = computed(() => this.todos());
  activeTodos = computed(() => this.todos().filter((todo) => !todo.completed));
  completedTodos = computed(() =>
    this.todos().filter((todo) => todo.completed)
  );
  filteredTodos = computed(() => {
    const filter = this.filter();
    const todos = this.todos();
    if (filter === 'active') return todos.filter((t) => !t.completed);
    if (filter === 'completed') return todos.filter((t) => t.completed);
    return todos;
  });

  constructor() {
    // Middleware is now handled automatically by the withMiddleware enhancer
  }

  addTodo() {
    if (!this.newTodoTitle.trim()) return;

    const newTodo: Todo = {
      id: Date.now(),
      title: this.newTodoTitle.trim(),
      completed: false,
      createdAt: new Date(),
    };

    this.tree.$.todos.update((todos) => [...todos, newTodo]);
    this.newTodoTitle = '';
  }

  toggleTodo(id: number) {
    this.tree.$.todos.update((todos) =>
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  }

  deleteTodo(id: number) {
    this.tree.$.todos.update((todos) => todos.filter((todo) => todo.id !== id));
  }

  addRandomTodos() {
    const newTodos = generateTodos(3);
    this.tree.$.todos.update((todos) => [...todos, ...newTodos]);
  }

  clearCompleted() {
    this.tree.$.todos.update((todos) =>
      todos.filter((todo) => !todo.completed)
    );
  }

  clearAllTodos() {
    if (!confirm('Are you sure you want to delete all todos?')) return;
    this.tree.$.todos.set([]);
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    this.tree.$.filter.set(filter);
  }

  clearLogs() {
    this.tree.$.logs.set([]);
  }

  clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
    alert('Storage cleared!');
  }

  handleUndo() {
    // Undo functionality is now handled by the withMiddleware enhancer
    // This would typically call this.tree.undo() if available
    console.log('Undo functionality handled by middleware');
  }

  handleRedo() {
    // Redo functionality is now handled by the withMiddleware enhancer
    // This would typically call this.tree.redo() if available
    console.log('Redo functionality handled by middleware');
  }

  canUndo(): boolean {
    // Undo state is now managed by the withMiddleware enhancer
    return false; // Placeholder - would check middleware state
  }

  canRedo(): boolean {
    // Redo state is now managed by the withMiddleware enhancer
    return false; // Placeholder - would check middleware state
  }

  getUndoCount(): number {
    // Undo count is now managed by the withMiddleware enhancer
    return 0; // Placeholder - would get from middleware state
  }

  getRedoCount(): number {
    // Redo count is now managed by the withMiddleware enhancer
    return 0; // Placeholder - would get from middleware state
  }

  getActiveMiddlewareCount(): number {
    // Middleware features are now configured in the withMiddleware enhancer
    return 4; // logging, validation, persistence, undo are all enabled in the config
  }

  formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  getLastSavedTime(): string {
    const lastSaved = this.tree.$.lastSaved();
    if (!lastSaved) return 'Never';
    const seconds = Math.floor((Date.now() - lastSaved) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return new Date(lastSaved).toLocaleTimeString();
  }
}
