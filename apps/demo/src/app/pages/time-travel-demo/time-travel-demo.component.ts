import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { withTimeTravel } from '@signaltree/time-travel';

interface TimeTravelState {
  counter: number;
  todos: Array<{ id: number; text: string; completed: boolean }>;
  message: string;
}

@Component({
  selector: 'app-time-travel-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './time-travel-demo.component.html',
  styleUrls: ['./time-travel-demo.component.scss'],
})
export class TimeTravelDemoComponent {
  newTodoText = '';

  // Bookmarks and search
  bookmarks: Set<number> = new Set();
  searchTerm = '';
  bookmarkName = '';

  private store = signalTree<TimeTravelState>({
    counter: 0,
    todos: [],
    message: '',
  }).with(withTimeTravel({}));

  // Computed properties
  counter = this.store.state.counter;
  todos = this.store.state.todos;
  message = this.store.state.message;

  // Keyboard navigation
  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent) {
    // Ignore if typing in an input
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    // Ctrl+Z / Cmd+Z for Undo
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === 'z' &&
      !event.shiftKey
    ) {
      event.preventDefault();
      if (this.canUndo()) this.undo();
      return;
    }

    // Ctrl+Y / Cmd+Shift+Z for Redo
    if (
      ((event.ctrlKey || event.metaKey) && event.key === 'y') ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z')
    ) {
      event.preventDefault();
      if (this.canRedo()) this.redo();
      return;
    }

    // Arrow keys for navigation
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (this.canUndo()) this.undo();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (this.canRedo()) this.redo();
    }
  }

  // State actions
  increment() {
    this.store((current) => ({ ...current, counter: current.counter + 1 }));
  }

  decrement() {
    this.store((current) => ({ ...current, counter: current.counter - 1 }));
  }

  addTodo() {
    if (this.newTodoText.trim()) {
      const newTodo = {
        id: Date.now(),
        text: this.newTodoText.trim(),
        completed: false,
      };
      this.store((current) => ({
        ...current,
        todos: [...current.todos, newTodo],
      }));
      this.newTodoText = '';
    }
  }

  toggleTodo(id: number) {
    this.store((current) => ({
      ...current,
      todos: current.todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ),
    }));
  }

  // Time travel methods
  undo() {
    this.store.undo();
    return true;
  }

  redo() {
    this.store.redo();
    return true;
  }

  canUndo() {
    return this.store.canUndo?.() || false;
  }

  canRedo() {
    return this.store.canRedo?.() || false;
  }

  resetHistory() {
    this.store.resetHistory();
  }

  getCurrentIndex() {
    return this.store.getCurrentIndex?.() || 0;
  }

  getHistory() {
    return this.store.getHistory();
  }

  jumpTo(index: number) {
    this.store.jumpTo?.(index);
  }

  getHistoryItemClass(index: number): string {
    const current = this.getCurrentIndex();
    if (index === current) {
      return 'active';
    }
    return '';
  }

  getTimelineNodeClass(index: number): string {
    const current = this.getCurrentIndex();

    if (index === current) {
      return 'active';
    }
    if (index < current) {
      return 'past';
    }
    return 'future';
  }

  getStateDiff() {
    const history = this.getHistory();
    const currentIndex = this.getCurrentIndex();

    if (currentIndex === 0 || history.length < 2) {
      return { counter: null, message: null, todos: null };
    }

    const currentState = history[currentIndex].state as TimeTravelState;
    const previousState = history[currentIndex - 1].state as TimeTravelState;

    const diff: {
      counter?: { type: string; oldValue: number; newValue: number };
      message?: { type: string; oldValue: string; newValue: string };
      todos?: {
        type: string;
        description: string;
        oldCount: number;
        newCount: number;
      };
    } = {};

    // Counter diff
    if (currentState.counter !== previousState.counter) {
      diff.counter = {
        type: previousState.counter === 0 ? 'added' : 'modified',
        oldValue: previousState.counter,
        newValue: currentState.counter,
      };
    }

    // Message diff
    if (currentState.message !== previousState.message) {
      diff.message = {
        type: !previousState.message ? 'added' : 'modified',
        oldValue: previousState.message,
        newValue: currentState.message,
      };
    }

    // Todos diff
    if (currentState.todos.length !== previousState.todos.length) {
      const added = currentState.todos.length > previousState.todos.length;
      diff.todos = {
        type: added ? 'added' : 'modified',
        description: added ? 'Todo added' : 'Todo removed or modified',
        oldCount: previousState.todos.length,
        newCount: currentState.todos.length,
      };
    } else {
      // Check for completed status changes
      const changed = currentState.todos.some((todo, i) => {
        const prevTodo = previousState.todos[i];
        return prevTodo && todo.completed !== prevTodo.completed;
      });
      if (changed) {
        diff.todos = {
          type: 'modified',
          description: 'Todo status changed',
          oldCount: previousState.todos.length,
          newCount: currentState.todos.length,
        };
      }
    }

    return diff;
  }

  // Bookmark methods
  toggleBookmark(index: number) {
    if (this.bookmarks.has(index)) {
      this.bookmarks.delete(index);
    } else {
      this.bookmarks.add(index);
    }
  }

  isBookmarked(index: number): boolean {
    return this.bookmarks.has(index);
  }

  getBookmarkedEntries() {
    return this.getHistory().filter((_, i) => this.bookmarks.has(i));
  }

  clearAllBookmarks() {
    this.bookmarks.clear();
  }

  // Search/filter methods
  getFilteredHistory() {
    const history = this.getHistory();
    if (!this.searchTerm.trim()) return history;

    const term = this.searchTerm.toLowerCase();
    return history.filter(
      (entry, index) =>
        (entry.action && entry.action.toLowerCase().includes(term)) ||
        index.toString().includes(term)
    );
  }

  hasSearchResults(): boolean {
    return this.searchTerm.trim().length > 0;
  }

  clearSearch() {
    this.searchTerm = '';
  }
}
