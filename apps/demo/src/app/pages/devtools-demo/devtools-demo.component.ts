import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';
import { withDevTools } from '@signaltree/devtools';

interface DevtoolsState {
  counter: number;
  user: {
    name: string;
    email: string;
    preferences: {
      theme: 'light' | 'dark';
      notifications: boolean;
    };
  };
  todos: Array<{ id: number; text: string; completed: boolean }>;
}

@Component({
  selector: 'app-devtools-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">SignalTree DevTools Demo</h1>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- State Controls -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">State Management</h2>

          <div class="space-y-6">
            <!-- Counter -->
            <div>
              <label class="block text-sm font-medium mb-2"
                >Counter: {{ counter() }}</label
              >
              <div class="flex gap-2">
                <button
                  (click)="increment()"
                  class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  +1
                </button>
                <button
                  (click)="decrement()"
                  class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  -1
                </button>
                <button
                  (click)="reset()"
                  class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                >
                  Reset
                </button>
              </div>
            </div>

            <!-- User Info -->
            <div class="space-y-3">
              <h3 class="font-medium">User Information</h3>
              <div>
                <label for="userName" class="block text-sm font-medium mb-1"
                  >Name:</label
                >
                <input
                  id="userName"
                  type="text"
                  [value]="user().name"
                  (input)="updateUserName($event)"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label for="userEmail" class="block text-sm font-medium mb-1"
                  >Email:</label
                >
                <input
                  id="userEmail"
                  type="email"
                  [value]="user().email"
                  (input)="updateUserEmail($event)"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label for="theme" class="block text-sm font-medium mb-1"
                  >Theme:</label
                >
                <select
                  id="theme"
                  [value]="user().preferences.theme"
                  (change)="updateTheme($event)"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div class="flex items-center">
                <input
                  id="notifications"
                  type="checkbox"
                  [checked]="user().preferences.notifications"
                  (change)="toggleNotifications()"
                  class="mr-2"
                />
                <label for="notifications" class="text-sm font-medium"
                  >Enable Notifications</label
                >
              </div>
            </div>

            <!-- Todo Management -->
            <div>
              <h3 class="font-medium mb-2">Todos</h3>
              <div class="flex gap-2 mb-3">
                <input
                  type="text"
                  [(ngModel)]="newTodoText"
                  placeholder="Enter todo..."
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                />
                <button
                  (click)="addTodo()"
                  [disabled]="!newTodoText.trim()"
                  class="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <button
                (click)="addMultipleTodos()"
                class="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600"
              >
                Add 5 Random Todos
              </button>
            </div>
          </div>
        </div>

        <!-- DevTools Info -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">DevTools Information</h2>

          <div class="space-y-4">
            <!-- Performance Metrics -->
            <div>
              <h3 class="font-medium mb-2">Performance Metrics</h3>
              <div class="text-sm space-y-1">
                <p>
                  <strong>Update Count:</strong> {{ getMetrics().updateCount }}
                </p>
                <p>
                  <strong>Average Update Time:</strong>
                  {{ getMetrics().averageUpdateTime }}ms
                </p>
                <p>
                  <strong>Last Update Time:</strong>
                  {{ getMetrics().lastUpdateTime }}ms
                </p>
                <p>
                  <strong>Total Execution Time:</strong>
                  {{ getMetrics().totalExecutionTime }}ms
                </p>
              </div>
            </div>

            <!-- State Info -->
            <div>
              <h3 class="font-medium mb-2">State Information</h3>
              <div class="text-sm space-y-1">
                <p>
                  <strong>State Size:</strong> {{ getStateSize() }} properties
                </p>
                <p><strong>Deep Update Path:</strong> {{ getDeepestPath() }}</p>
                <p><strong>Last Action:</strong> {{ lastAction }}</p>
              </div>
            </div>

            <!-- DevTools Actions -->
            <div>
              <h3 class="font-medium mb-2">DevTools Actions</h3>
              <div class="flex flex-col gap-2">
                <button
                  (click)="logState()"
                  class="px-4 py-2 bg-cyan-500 text-white rounded-md hover:bg-cyan-600"
                >
                  Log Current State
                </button>
                <button
                  (click)="triggerSnapshot()"
                  class="px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600"
                >
                  Take Snapshot
                </button>
                <button
                  (click)="resetMetrics()"
                  class="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600"
                >
                  Reset Metrics
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Current State Display -->
      <div class="mt-8 bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-4">Live State View</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 class="font-medium mb-2">User & Counter</h3>
            <div class="bg-gray-50 p-4 rounded">
              <pre class="text-sm">{{ formatUserState() }}</pre>
            </div>
          </div>
          <div>
            <h3 class="font-medium mb-2">Todos ({{ todos().length }})</h3>
            <div class="bg-gray-50 p-4 rounded max-h-48 overflow-y-auto">
              <ul class="space-y-1">
                <li
                  *ngFor="let todo of todos(); let i = index"
                  class="flex items-center justify-between text-sm"
                >
                  <span
                    [class]="todo.completed ? 'line-through text-gray-500' : ''"
                  >
                    {{ todo.text }}
                  </span>
                  <div class="flex gap-1">
                    <button
                      (click)="toggleTodo(todo.id)"
                      class="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 rounded"
                    >
                      {{ todo.completed ? 'Undo' : 'Done' }}
                    </button>
                    <button
                      (click)="removeTodo(todo.id)"
                      class="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 rounded"
                    >
                      ×
                    </button>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DevtoolsDemoComponent {
  newTodoText = '';
  lastAction = 'Initial state';

  private store = signalTree<DevtoolsState>({
    counter: 0,
    user: {
      name: 'John Doe',
      email: 'john@example.com',
      preferences: {
        theme: 'light',
        notifications: true,
      },
    },
    todos: [],
  }).pipe(withDevTools({ name: 'DevtoolsDemo' }));

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

  updateTheme(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.store.$.user.preferences.theme.set(target.value as 'light' | 'dark');
    this.lastAction = 'Update theme';
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
    return (
      this.store.getMetrics?.() || {
        updateCount: 0,
        averageUpdateTime: 0,
        lastUpdateTime: 0,
        totalExecutionTime: 0,
      }
    );
  }

  logState() {
    console.log('Current State:', this.store.state());
    this.lastAction = 'Log state to console';
  }

  triggerSnapshot() {
    this.store.takeSnapshot?.();
    this.lastAction = 'Take state snapshot';
  }

  resetMetrics() {
    this.store.resetMetrics?.();
    this.lastAction = 'Reset performance metrics';
  }

  getStateSize(): number {
    const state = this.store.state();
    return Object.keys(state).length;
  }

  getDeepestPath(): string {
    return 'user.preferences.notifications';
  }

  formatUserState(): string {
    return JSON.stringify(
      {
        counter: this.counter(),
        user: this.user(),
      },
      null,
      2
    );
  }
}
