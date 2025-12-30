import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { devTools, signalTree } from '@signaltree/core';

interface DevtoolsState {
  counter: number;
  user: {
    name: string;
    email: string;
    preferences: {
      notifications: boolean;
    };
  };
  todos: Array<{ id: number; text: string; completed: boolean }>;
}

interface StateSnapshot {
  state: DevtoolsState;
  timestamp: number;
}

interface ActionRecord {
  name: string;
  timestamp: number;
  duration: number;
  action: () => void;
}

@Component({
  selector: 'app-devtools-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './devtools-demo.component.html',
  styleUrls: ['./devtools-demo.component.scss'],
})
export class DevtoolsDemoComponent {
  newTodoText = '';
  lastAction = 'Initial state';

  // Snapshot & History features
  snapshots: StateSnapshot[] = [];
  actionHistory: ActionRecord[] = [];
  replaying = false;

  public store = signalTree<DevtoolsState>({
    counter: 0,
    user: {
      name: 'John Doe',
      email: 'john@example.com',
      preferences: {
        notifications: true,
      },
    },
    todos: [],
  }).with(
    devTools({
      treeName: 'DevTools Demo',
      enableLogging: true,
      enableBrowserDevTools: true,
    })
  );

  // Computed properties
  counter = this.store.$.counter;
  user = this.store.$.user;
  todos = this.store.$.todos;

  // Counter actions
  increment() {
    this.store.$.counter.update((c) => c + 1);
    this.lastAction = 'Increment counter';
  }

  decrement() {
    this.store.$.counter.update((c) => c - 1);
    this.lastAction = 'Decrement counter';
  }

  reset() {
    this.store.$.counter.set(0);
    this.lastAction = 'Reset counter';
  }

  // User actions
  updateUserName(event: Event) {
    const target = event.target as HTMLInputElement;
    this.store.$.user.name.set(target.value);
    this.lastAction = 'Update user name';
  }

  updateUserEmail(event: Event) {
    const target = event.target as HTMLInputElement;
    this.store.$.user.email.set(target.value);
    this.lastAction = 'Update user email';
  }

  toggleNotifications() {
    this.store.$.user.preferences.notifications.update((n) => !n);
    this.lastAction = 'Toggle notifications';
  }

  // Todo actions
  addTodo() {
    if (this.newTodoText.trim()) {
      const newTodo = {
        id: Date.now(),
        text: this.newTodoText.trim(),
        completed: false,
      };
      this.store.$.todos.update((todos) => [...todos, newTodo]);
      this.newTodoText = '';
      this.lastAction = 'Add todo';
    }
  }

  addMultipleTodos() {
    const todoTexts = [
      'Review pull requests',
      'Update documentation',
      'Fix performance issues',
      'Write unit tests',
      'Deploy to staging',
    ];

    const newTodos = todoTexts.map((text, index) => ({
      id: Date.now() + index,
      text,
      completed: false,
    }));

    this.store.$.todos.update((todos) => [...todos, ...newTodos]);
    this.lastAction = 'Add multiple todos';
  }

  toggleTodo(id: number) {
    this.store.$.todos.update((todos) =>
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
    this.lastAction = 'Toggle todo';
  }

  removeTodo(id: number) {
    this.store.$.todos.update((todos) =>
      todos.filter((todo) => todo.id !== id)
    );
    this.lastAction = 'Remove todo';
  }

  // DevTools methods
  getMetrics() {
    return {
      updates: 0,
      computations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageUpdateTime: 0,
    };
  }

  logState() {
    this.lastAction = 'Log state to console';
  }

  triggerSnapshot() {
    // Export current debug session as a snapshot
    const devTools = (this.store as unknown as Record<string, unknown>)[
      '__devTools'
    ];
    (
      devTools as { exportDebugSession?: () => unknown }
    )?.exportDebugSession?.();
    this.lastAction = 'Take state snapshot';
  }

  resetMetrics() {
    // Reset metrics by reconnecting devtools
    const devTools = (this.store as unknown as Record<string, unknown>)[
      '__devTools'
    ];
    (
      devTools as { connectDevTools?: (name: string) => void }
    )?.connectDevTools?.('DevToolsDemo');
    this.lastAction = 'Reset performance metrics';
  }

  getStateSize(): number {
    const state = this.store();
    return Object.keys(state).length;
  }

  getDeepestPath(): string {
    return 'user.preferences.notifications';
  }

  formatUserState(): string {
    return JSON.stringify(
      {
        counter: this.counter(),
        user: this.store.$.user(),
      },
      null,
      2
    );
  }

  // Snapshot & Restore methods
  takeSnapshot() {
    const currentState = JSON.parse(JSON.stringify(this.store()));
    this.snapshots.push({
      state: currentState,
      timestamp: Date.now(),
    });
    this.lastAction = `Snapshot taken (#${this.snapshots.length})`;
  }

  restoreSnapshot(index: number) {
    const snapshot = this.snapshots[index];
    if (snapshot) {
      // Restore the entire state
      this.store.$.counter.set(snapshot.state.counter);
      this.store.$.user.name.set(snapshot.state.user.name);
      this.store.$.user.email.set(snapshot.state.user.email);
      this.store.$.user.preferences.notifications.set(
        snapshot.state.user.preferences.notifications
      );
      this.store.$.todos.set(snapshot.state.todos);
      this.lastAction = `Restored snapshot #${index + 1}`;
    }
  }

  deleteSnapshot(index: number) {
    this.snapshots.splice(index, 1);
    this.lastAction = `Deleted snapshot #${index + 1}`;
  }

  // Action History & Replay methods
  private recordAction(name: string, action: () => void, duration = 0) {
    this.actionHistory.push({
      name,
      timestamp: Date.now(),
      duration,
      action,
    });
  }

  async replayActions() {
    if (this.actionHistory.length === 0 || this.replaying) return;

    this.replaying = true;
    this.lastAction = 'Replaying all actions...';

    for (let i = 0; i < this.actionHistory.length; i++) {
      const action = this.actionHistory[i];
      action.action();
      await new Promise((resolve) => setTimeout(resolve, 300)); // Delay between actions
    }

    this.replaying = false;
    this.lastAction = 'Replay completed';
  }

  replaySingleAction(index: number) {
    const action = this.actionHistory[index];
    if (action) {
      action.action();
      this.lastAction = `Replayed: ${action.name}`;
    }
  }

  clearHistory() {
    this.actionHistory = [];
    this.lastAction = 'Action history cleared';
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }
}
