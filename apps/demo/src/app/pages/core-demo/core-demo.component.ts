import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signaltree/core';

import { generateTodos, Todo } from '../../shared/models';

type FilterType = 'all' | 'active' | 'completed';

interface CoreState {
  todos: Todo[];
  filter: FilterType;
}

@Component({
  selector: 'app-core-demo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './core-demo.component.html',
  styleUrls: ['./core-demo.component.scss'],
})
export class CoreDemoComponent {
  newTodoTitle = '';

  private tree = signalTree<CoreState>({
    todos: generateTodos(5),
    filter: 'all',
  });

  // State signals
  todos = this.tree.state.todos;
  filter = this.tree.state.filter;

  // Computed signals
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

  activeTodos = computed(() => this.todos().filter((t) => !t.completed));
  completedTodos = computed(() => this.todos().filter((t) => t.completed));

  activeCount = computed(() => this.activeTodos().length);
  completedCount = computed(() => this.completedTodos().length);
  totalCount = computed(() => this.todos().length);

  hasAnyTodos = computed(() => this.totalCount() > 0);
  hasCompletedTodos = computed(() => this.completedCount() > 0);
  allCompleted = computed(
    () => this.hasAnyTodos() && this.activeCount() === 0
  );

  // Actions
  addTodo() {
    const title = this.newTodoTitle.trim();
    if (!title) return;

    const newTodo: Todo = {
      id: Date.now(),
      title,
      completed: false,
      createdAt: new Date(),
    };

    this.tree.state.todos.set([...this.todos(), newTodo]);
    this.newTodoTitle = '';
  }

  toggleTodo(id: number) {
    this.tree.state.todos.set(
      this.todos().map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  }

  deleteTodo(id: number) {
    this.tree.state.todos.set(this.todos().filter((t) => t.id !== id));
  }

  editTodo(id: number, newTitle: string) {
    const title = newTitle.trim();
    if (!title) {
      this.deleteTodo(id);
      return;
    }

    this.tree.state.todos.set(
      this.todos().map((todo) => (todo.id === id ? { ...todo, title } : todo))
    );
  }

  toggleAll() {
    const allCompleted = this.allCompleted();
    this.tree.state.todos.set(
      this.todos().map((todo) => ({ ...todo, completed: !allCompleted }))
    );
  }

  clearCompleted() {
    this.tree.state.todos.set(this.activeTodos());
  }

  addRandomTodos() {
    const newTodos = generateTodos(5);
    this.tree.state.todos.set([...this.todos(), ...newTodos]);
  }

  clearAll() {
    this.tree.state.todos.set([]);
  }

  setFilter(filter: FilterType) {
    this.tree.state.filter.set(filter);
  }

  // Tracking
  trackByTodoId(_index: number, todo: Todo): number {
    return todo.id;
  }
}
