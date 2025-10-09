import { CommonModule } from '@angular/common';
import { Component, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

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
  enableLogging = true;
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
  });

  todos = computed(() => this.tree.state.todos());
  filter = computed(() => this.tree.state.filter());
  middlewareLogs = computed(() => this.tree.state.logs());
  undoStack = computed(() => this.tree.state.undoStack());
  redoStack = computed(() => this.tree.state.redoStack());
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
    this.loadFromStorage();
    effect(() => {
      if (this.enablePersistence) {
        const todos = this.todos();
        this.saveToStorage(todos);
      }
    });
  }

  private log(
    type: 'before' | 'after' | 'error',
    action: string,
    data?: Record<string, unknown>,
    error?: string,
    duration?: number
  ) {
    if (!this.enableLogging) return;
    const log: MiddlewareLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      action,
      data,
      error,
      duration,
    };
    this.tree.state.logs.set([log, ...this.tree.state.logs()].slice(0, 50));
  }

  private validate(action: string, data?: unknown): void {
    if (!this.enableValidation) return;
    if (action === 'addTodo') {
      const title = (data as { title: string })?.title;
      if (!title || title.trim().length === 0) {
        throw new Error('Todo title cannot be empty');
      }
      if (title.length > 200) {
        throw new Error('Todo title cannot exceed 200 characters');
      }
    }
  }

  private saveToStorage(todos: Todo[]) {
    if (!this.enablePersistence) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
      this.tree.state.lastSaved.set(Date.now());
    } catch (error) {
      console.error('Failed to save to storage:', error);
    }
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const todos = JSON.parse(stored) as Todo[];
        this.tree.state.todos.set(todos);
      }
    } catch (error) {
      console.error('Failed to load from storage:', error);
    }
  }

  private saveToUndoStack(action: string) {
    if (!this.enableUndo) return;
    const entry: UndoEntry = {
      action,
      previousState: [...this.tree.state.todos()],
      timestamp: Date.now(),
    };
    this.tree.state.undoStack.set(
      [entry, ...this.tree.state.undoStack()].slice(0, 50)
    );
    this.tree.state.redoStack.set([]);
  }

  private executeAction<T>(
    action: string,
    fn: () => T,
    data?: unknown
  ): T | undefined {
    const startTime = performance.now();
    try {
      this.log('before', action, { message: `Starting ${action}` });
      this.validate(action, data);
      this.saveToUndoStack(action);
      const result = fn();
      const duration = performance.now() - startTime;
      this.log(
        'after',
        action,
        { message: `Completed ${action}` },
        undefined,
        duration
      );
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.log('error', action, undefined, errorMessage);
      alert('Error: ' + errorMessage);
      return undefined;
    }
  }

  addTodo() {
    if (!this.newTodoTitle.trim()) return;
    this.executeAction(
      'addTodo',
      () => {
        const newTodo: Todo = {
          id: Date.now(),
          title: this.newTodoTitle.trim(),
          completed: false,
          createdAt: new Date(),
        };
        this.tree.state.todos.set([...this.tree.state.todos(), newTodo]);
        this.newTodoTitle = '';
      },
      { title: this.newTodoTitle }
    );
  }

  toggleTodo(id: number) {
    this.executeAction('toggleTodo', () => {
      const todos = this.tree.state.todos();
      const updated = todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      );
      this.tree.state.todos.set(updated);
    });
  }

  deleteTodo(id: number) {
    this.executeAction('deleteTodo', () => {
      const todos = this.tree.state.todos();
      this.tree.state.todos.set(todos.filter((todo) => todo.id !== id));
    });
  }

  addRandomTodos() {
    this.executeAction('addRandomTodos', () => {
      const newTodos = generateTodos(3);
      this.tree.state.todos.set([...this.tree.state.todos(), ...newTodos]);
    });
  }

  clearCompleted() {
    this.executeAction('clearCompleted', () => {
      const todos = this.tree.state.todos();
      this.tree.state.todos.set(todos.filter((todo) => !todo.completed));
    });
  }

  clearAllTodos() {
    if (!confirm('Are you sure you want to delete all todos?')) return;
    this.executeAction('clearAllTodos', () => {
      this.tree.state.todos.set([]);
    });
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    this.tree.state.filter.set(filter);
  }

  clearLogs() {
    this.tree.state.logs.set([]);
  }

  clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
    alert('Storage cleared!');
  }

  handleUndo() {
    if (!this.canUndo()) return;
    const undoStack = this.tree.state.undoStack();
    const entry = undoStack[0];
    if (entry) {
      const redoEntry: UndoEntry = {
        action: `redo_${entry.action}`,
        previousState: [...this.tree.state.todos()],
        timestamp: Date.now(),
      };
      this.tree.state.redoStack.set([
        redoEntry,
        ...this.tree.state.redoStack(),
      ]);
      this.tree.state.todos.set(entry.previousState);
      this.tree.state.undoStack.set(undoStack.slice(1));
      this.log('after', 'undo', { message: `Undid: ${entry.action}` });
    }
  }

  handleRedo() {
    if (!this.canRedo()) return;
    const redoStack = this.tree.state.redoStack();
    const entry = redoStack[0];
    if (entry) {
      const undoEntry: UndoEntry = {
        action: entry.action.replace('redo_', ''),
        previousState: [...this.tree.state.todos()],
        timestamp: Date.now(),
      };
      this.tree.state.undoStack.set([
        undoEntry,
        ...this.tree.state.undoStack(),
      ]);
      this.tree.state.todos.set(entry.previousState);
      this.tree.state.redoStack.set(redoStack.slice(1));
      this.log('after', 'redo', { message: `Redid: ${entry.action}` });
    }
  }

  canUndo(): boolean {
    return this.undoStack().length > 0;
  }

  canRedo(): boolean {
    return this.redoStack().length > 0;
  }

  getUndoCount(): number {
    return this.undoStack().length;
  }

  getRedoCount(): number {
    return this.redoStack().length;
  }

  getActiveMiddlewareCount(): number {
    return [
      this.enableLogging,
      this.enableValidation,
      this.enablePersistence,
      this.enableUndo,
    ].filter(Boolean).length;
  }

  formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  getLastSavedTime(): string {
    const lastSaved = this.tree.state.lastSaved();
    if (!lastSaved) return 'Never';
    const seconds = Math.floor((Date.now() - lastSaved) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return new Date(lastSaved).toLocaleTimeString();
  }
}
