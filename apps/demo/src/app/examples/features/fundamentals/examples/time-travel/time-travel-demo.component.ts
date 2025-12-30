import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree, withTimeTravel } from '@signaltree/core';

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

interface AppState {
  counter: number;
  message: string;
  todos: Todo[];
}

interface TimeTravelEntry {
  action: string;
  timestamp: number;
  state: AppState;
  payload?: unknown;
}

interface TimeTravelInterface {
  undo(): boolean;
  redo(): boolean;
  getHistory(): TimeTravelEntry[];
  resetHistory(): void;
  jumpTo(index: number): boolean;
  getCurrentIndex(): number;
  canUndo(): boolean;
  canRedo(): boolean;
}

interface TimeTravelTree {
  state: {
    counter: { (): number; set(value: number): void };
    message: { (): string; set(value: string): void };
    todos: { (): Todo[]; set(value: Todo[]): void };
  };
  __timeTravel: TimeTravelInterface;
  undo(): void;
  redo(): void;
  jumpTo(index: number): void;
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

  private tree = signalTree<AppState>({
    counter: 0,
    message: 'Hello SignalTree!',
    todos: [
      { id: 1, title: 'Learn SignalTree', completed: true },
      { id: 2, title: 'Try Time Travel', completed: false },
      { id: 3, title: 'Build Something Amazing', completed: false },
    ],
  }).with(withTimeTravel({ maxHistorySize: 50 }));

  // Type-safe tree updater
  private updateTree = (updater: (state: AppState) => AppState) => {
    this.tree(updater);
  };

  // State signals
  counter = this.tree.state.counter;
  message = this.tree.state.message;
  todos = this.tree.state.todos;

  // Time travel interface (non-null asserted because we applied withTimeTravel)
  private timeTravel = this.tree.__timeTravel!;

  // Time travel signals - need to be writable to trigger updates
  history = signal(this.timeTravel.getHistory());
  currentIndex = signal(this.timeTravel.getCurrentIndex());
  canUndo = signal(this.timeTravel.canUndo());
  canRedo = signal(this.timeTravel.canRedo());

  // Helper to refresh time travel state
  private refreshTimeTravelState() {
    this.history.set(this.timeTravel.getHistory());
    this.canUndo.set(this.timeTravel.canUndo());
    this.canRedo.set(this.timeTravel.canRedo());
  }

  // Computed signals
  activeTodos = computed(() => this.todos().filter((t: Todo) => !t.completed));
  completedTodos = computed(() =>
    this.todos().filter((t: Todo) => t.completed)
  );

  historyLength = computed(() => this.history().length);
  currentState = computed(() => this.history()[this.currentIndex()]);

  // Counter actions
  increment() {
    this.updateTree((state: AppState) => ({
      ...state,
      counter: state.counter + 1,
    }));
    this.refreshTimeTravelState();
  }

  decrement() {
    this.updateTree((state: AppState) => ({
      ...state,
      counter: state.counter - 1,
    }));
    this.refreshTimeTravelState();
  }

  reset() {
    this.updateTree((state: AppState) => ({
      ...state,
      counter: 0,
    }));
    this.refreshTimeTravelState();
  }

  // Message actions
  updateMessage(value: string) {
    this.updateTree((state: AppState) => ({
      ...state,
      message: value,
    }));
    this.refreshTimeTravelState();
  }

  // Todo actions
  addTodo() {
    const text = this.newTodoText.trim();
    if (!text) return;

    const newTodo: Todo = {
      id: Date.now(),
      title: text,
      completed: false,
    };

    this.updateTree((state: AppState) => ({
      ...state,
      todos: [...state.todos, newTodo],
    }));
    this.newTodoText = '';
    this.refreshTimeTravelState();
  }

  toggleTodo(id: number) {
    this.updateTree((state: AppState) => ({
      ...state,
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ),
    }));
    this.refreshTimeTravelState();
  }

  deleteTodo(id: number) {
    this.updateTree((state: AppState) => ({
      ...state,
      todos: state.todos.filter((t) => t.id !== id),
    }));
    this.refreshTimeTravelState();
  }

  // Time travel actions
  undo() {
    this.timeTravel.undo();
    this.refreshTimeTravelState();
  }

  redo() {
    this.timeTravel.redo();
    this.refreshTimeTravelState();
  }

  goToState(index: number) {
    this.timeTravel.jumpTo(index);
    this.refreshTimeTravelState();
  }

  onHistoryItemKeyup(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.goToState(index);
    }
  }

  clearHistory() {
    this.timeTravel.resetHistory();
    this.refreshTimeTravelState();
  }

  // Generate sample actions for easy testing
  generateSampleActions() {
    // Reset history first
    this.timeTravel.resetHistory();

    // Create a sequence of actions with delays for better history visualization
    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        message: 'Starting demo...',
      }));
      this.refreshTimeTravelState();
    }, 100);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        counter: 1,
      }));
      this.refreshTimeTravelState();
    }, 200);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        todos: [{ id: Date.now(), title: 'First task', completed: false }],
      }));
      this.refreshTimeTravelState();
    }, 300);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        counter: 5,
      }));
      this.refreshTimeTravelState();
    }, 400);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        message: 'Making more changes...',
      }));
      this.refreshTimeTravelState();
    }, 500);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        todos: [
          ...state.todos,
          { id: Date.now() + 1, title: 'Second task', completed: false },
        ],
      }));
      this.refreshTimeTravelState();
    }, 600);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        counter: 10,
      }));
      this.refreshTimeTravelState();
    }, 700);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        todos: state.todos.map((todo, i) =>
          i === 0 ? { ...todo, completed: true } : todo
        ),
      }));
      this.refreshTimeTravelState();
    }, 800);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        message: 'Demo complete! Try undo/redo now.',
      }));
      this.refreshTimeTravelState();
    }, 900);

    setTimeout(() => {
      this.updateTree((state: AppState) => ({
        ...state,
        counter: 15,
      }));
      this.refreshTimeTravelState();
    }, 1000);
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  getStatePreview(state: AppState): string {
    return `Counter: ${state.counter}, Todos: ${
      state.todos.length
    }, Message: "${state.message.substring(0, 20)}..."`;
  }
}
