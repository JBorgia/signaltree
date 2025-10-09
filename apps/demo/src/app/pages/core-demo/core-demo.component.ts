import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

import { PerformanceMonitorService } from '../../services/performance-monitor.service';
import { generateTodos, Todo } from '../../shared/models';

interface CoreState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  newTodoTitle: string;
}

/**
 * SignalTree Core Demo - Real Implementation Example
 *
 * This demonstrates how a real development team would use SignalTree:
 *
 * 1. Install: npm install @signaltree/core
 * 2. Optional: npm install -D @signaltree/callable-syntax (for enhanced DX)
 * 3. Configure transform in build pipeline (Vite/Webpack/Angular)
 * 4. Use callable syntax in development, transforms to .set/.update at build time
 *
 * Benefits:
 * - Zero runtime overhead (pure Angular signals)
 * - Enhanced developer experience with callable syntax
 * - Full TypeScript safety
 * - Transforms compile away completely
 *
 * This demo shows both patterns:
 * - Callable syntax (tree.$.prop('value')) - what developers write
 * - Direct syntax (tree.$.prop.set('value')) - what runs at runtime
 */
@Component({
  selector: 'app-core-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './core-demo.component.html',
  styleUrls: ['./core-demo.component.scss'],
})
export class CoreDemoComponent {
  private performanceMonitor = inject(PerformanceMonitorService);
  // Use a monotonic counter for IDs to avoid collisions in fast test runs
  private nextId = 1;

  private store = signalTree<CoreState>({
    todos: [],
    filter: 'all',
    newTodoTitle: '',
  });

  // State signals
  todos = this.store.state.todos;
  filter = this.store.state.filter;
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
        todos: this.todos(),
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
  activeTodos = computed(() => this.todos().filter((t) => !t.completed).length);
  completedTodos = computed(
    () => this.todos().filter((t) => t.completed).length
  );
  deleteTodo = (id: number) => this.removeTodo(id);

  // Performance tracking
  signalUpdateCount = 0;
  renderCount = 0;
  private operationTimes: number[] = [];
  private lastOperationTimestamp = Date.now();

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
    this.signalUpdateCount++;

    // Track operation timing
    const now = Date.now();
    const timeSinceLastOp = now - this.lastOperationTimestamp;
    this.operationTimes.push(timeSinceLastOp);

    // Keep only last 50 operations for averaging
    if (this.operationTimes.length > 50) {
      this.operationTimes.shift();
    }

    this.lastOperationTimestamp = now;
  }

  addTodo() {
    if (!this.newTodoTitle.trim()) return;

    const startTime = performance.now();
    const newTodo: Todo = {
      id: this.nextId++,
      title: this.newTodoTitle.trim(),
      completed: false,
      createdAt: new Date(),
    };

    // Real team usage with transform enabled:
    // this.store.state.todos(todos => [...todos, newTodo]);
    //
    // Transforms at build time to:
    this.store.state.todos.update((todos) => [...todos, newTodo]);

    this.newTodoTitle = '';
    this.trackOperation('Add Todo');

    // Record performance
    this.performanceMonitor.recordSignalTreeOperation(
      'addTodo',
      performance.now() - startTime,
      { todoCount: this.todos().length }
    );
  }

  toggleTodo(id: number) {
    // Real team usage with transform:
    // this.store.state.todos(todos => todos.map(todo =>
    //   todo.id === id ? { ...todo, completed: !todo.completed } : todo
    // ));
    //
    // Transforms to:
    this.store.state.todos.update((todos) =>
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
    this.trackOperation('Toggle Todo');
  }

  removeTodo(id: number) {
    // Real team usage:
    // this.store.state.todos(todos => todos.filter(todo => todo.id !== id));
    //
    // Transforms to:
    this.store.state.todos.update((todos) =>
      todos.filter((todo) => todo.id !== id)
    );
    this.trackOperation('Remove Todo');
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    // Real team usage:
    // this.store.state.filter(filter);
    //
    // Transforms to:
    this.store.state.filter.set(filter);
    this.trackOperation('Set Filter');
  }

  clearCompleted() {
    // Real team usage:
    // this.store.state.todos(todos => todos.filter(todo => !todo.completed));
    //
    // Transforms to:
    this.store.state.todos.update((todos) =>
      todos.filter((todo) => !todo.completed)
    );
    this.trackOperation('Clear Completed');
  }

  loadSampleData() {
    const currentMaxId = this.todos().reduce(
      (max, todo) => Math.max(max, todo.id),
      this.nextId - 1
    );
    const newSampleTodos = generateTodos(10).map((todo, index) => ({
      ...todo,
      id: currentMaxId + index + 1,
    }));

    // Real team usage:
    // this.store.state.todos(todos => [...todos, ...newSampleTodos]);
    //
    // Transforms to:
    this.store.state.todos.update((todos) => [...todos, ...newSampleTodos]);
    this.nextId = currentMaxId + newSampleTodos.length + 1;
    this.trackOperation('Load Sample Data');
  }

  getFilterClass(filter: string): string {
    const base = 'px-4 py-2 rounded-lg text-sm font-semibold transition-all';
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

  selectAll() {
    this.store.state.todos.update((todos) =>
      todos.map((todo) => ({ ...todo, completed: true }))
    );
    this.trackOperation('Select All');
  }

  selectNone() {
    this.store.state.todos.update((todos) =>
      todos.map((todo) => ({ ...todo, completed: false }))
    );
    this.trackOperation('Select None');
  }

  formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }

  getPriorityClass(priority?: 'low' | 'medium' | 'high'): string {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-300';
    }
  }

  // Performance metric getters
  getAverageOperationTime(): number {
    if (this.operationTimes.length === 0) return 0;
    const sum = this.operationTimes.reduce((acc, time) => acc + time, 0);
    return Math.round((sum / this.operationTimes.length) * 100) / 100;
  }

  getLastOperationTime(): string {
    if (this.operationTimes.length === 0) return 'N/A';
    const lastTime = this.operationTimes[this.operationTimes.length - 1];
    return `${lastTime.toFixed(2)}ms`;
  }

  getEfficiencyScore(): number {
    if (this.operationCount === 0 || this.renderCount === 0) return 100;
    // Calculate efficiency: fewer renders per operation = more efficient
    const renderRatio = this.renderCount / this.operationCount;
    // Ideal is close to 1:1, penalize higher ratios
    const score = Math.max(0, 100 - (renderRatio - 1) * 20);
    return Math.round(score);
  }

  getEfficiencyColor(): string {
    const score = this.getEfficiencyScore();
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  }

  constructor() {
    // Track renders using an effect that runs on every change detection
    effect(() => {
      // Access signals to trigger effect
      this.todos();
      this.filter();
      this.stateJson();
      // Increment render count
      this.renderCount++;
    });
  }
}
