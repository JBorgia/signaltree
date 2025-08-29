import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

interface TimeTravelState {
  counter: number;
  todos: Array<{ id: number; text: string; completed: boolean }>;
  message: string;
}

@Component({
  selector: 'app-time-travel-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">SignalTree Time Travel Demo</h1>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Controls -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">State Controls</h2>

          <div class="space-y-4">
            <!-- Counter -->
            <div>
              <label for="counter" class="block text-sm font-medium mb-2"
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
              </div>
            </div>

            <!-- Message -->
            <div>
              <label for="message" class="block text-sm font-medium mb-2"
                >Message:</label
              >
              <input
                id="message"
                type="text"
                [(ngModel)]="message"
                class="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <!-- Todo -->
            <div>
              <label for="newTodo" class="block text-sm font-medium mb-2"
                >Add Todo:</label
              >
              <div class="flex gap-2">
                <input
                  id="newTodo"
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
            </div>
          </div>
        </div>

        <!-- Time Travel Controls -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Time Travel</h2>

          <div class="space-y-4">
            <!-- Navigation -->
            <div class="flex gap-2">
              <button
                (click)="undo()"
                [disabled]="!canUndo()"
                class="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:opacity-50"
              >
                ↶ Undo
              </button>
              <button
                (click)="redo()"
                [disabled]="!canRedo()"
                class="flex-1 px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
              >
                ↷ Redo
              </button>
            </div>

            <button
              (click)="resetHistory()"
              class="w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Reset History
            </button>

            <!-- History Info -->
            <div class="text-sm">
              <p><strong>Current Index:</strong> {{ getCurrentIndex() }}</p>
              <p><strong>History Length:</strong> {{ getHistory().length }}</p>
            </div>

            <!-- History List -->
            <div class="max-h-48 overflow-y-auto">
              <h3 class="font-medium mb-2">History:</h3>
              <div class="space-y-1">
                <button
                  *ngFor="let entry of getHistory(); let i = index"
                  (click)="jumpTo(i)"
                  (keydown.enter)="jumpTo(i)"
                  (keydown.space)="jumpTo(i)"
                  [class]="getHistoryItemClass(i)"
                  class="w-full text-left px-2 py-1 text-xs rounded"
                  type="button"
                >
                  {{ i }}: {{ entry.action || 'Initial' }} ({{
                    entry.timestamp | date : 'medium'
                  }})
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Current State Display -->
      <div class="mt-8 bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-4">Current State</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h3 class="font-medium mb-2">Counter:</h3>
            <p class="text-2xl font-bold text-blue-600">{{ counter() }}</p>
          </div>
          <div>
            <h3 class="font-medium mb-2">Message:</h3>
            <p class="text-lg">{{ message() || '(empty)' }}</p>
          </div>
          <div>
            <h3 class="font-medium mb-2">Todos ({{ todos().length }}):</h3>
            <ul class="space-y-1">
              <li
                *ngFor="let todo of todos()"
                [class]="todo.completed ? 'line-through text-gray-500' : ''"
                class="text-sm"
              >
                <button
                  (click)="toggleTodo(todo.id)"
                  (keydown.enter)="toggleTodo(todo.id)"
                  (keydown.space)="toggleTodo(todo.id)"
                  class="cursor-pointer text-left w-full bg-transparent border-0 p-0"
                  type="button"
                >
                  {{ todo.completed ? '✓' : '○' }} {{ todo.text }}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TimeTravelDemoComponent {
  newTodoText = '';

  private store = signalTree<TimeTravelState>(
    {
      counter: 0,
      todos: [],
      message: '',
    },
    {
      enableTimeTravel: true,
      treeName: 'TimeTravelDemo',
    }
  );

  // Computed properties
  counter = this.store.$.counter;
  todos = this.store.$.todos;
  message = this.store.$.message;

  // State actions
  increment() {
    this.store.$.counter.update((c) => c + 1);
  }

  decrement() {
    this.store.$.counter.update((c) => c - 1);
  }

  addTodo() {
    if (this.newTodoText.trim()) {
      const newTodo = {
        id: Date.now(),
        text: this.newTodoText.trim(),
        completed: false,
      };
      this.store.$.todos.update((todos) => [...todos, newTodo]);
      this.newTodoText = '';
    }
  }

  toggleTodo(id: number) {
    this.store.$.todos.update((todos) =>
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  }

  // Time travel methods
  undo() {
    return this.store._timeTravel?.undo() || false;
  }

  redo() {
    return this.store._timeTravel?.redo() || false;
  }

  canUndo() {
    return this.store._timeTravel?.canUndo() || false;
  }

  canRedo() {
    return this.store._timeTravel?.canRedo() || false;
  }

  resetHistory() {
    this.store._timeTravel?.resetHistory();
  }

  getCurrentIndex() {
    return this.store._timeTravel?.getCurrentIndex() || 0;
  }

  getHistory() {
    return this.store._timeTravel?.getHistory() || [];
  }

  jumpTo(index: number) {
    this.store._timeTravel?.jumpTo(index);
  }

  getHistoryItemClass(index: number): string {
    const current = this.getCurrentIndex();
    if (index === current) {
      return 'bg-blue-100 border border-blue-300';
    }
    return 'bg-gray-100 hover:bg-gray-200';
  }
}
