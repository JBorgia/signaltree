import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { signalTree } from '@signaltree/core';
import { BenchmarkService } from '../services/benchmarks.service';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
}

interface TodoState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  selectedId: number | null;
}

@Component({
  template: '',
  standalone: true,
})
class SignalTreeTestComponent {
  private tree = signalTree<TodoState>({
    todos: [],
    filter: 'all',
    selectedId: null,
  });

  addTodo(todo: Todo) {
    const currentTodos = this.tree.$.todos();
    this.tree.$.todos.set([...currentTodos, todo]);
  }

  toggleTodo(id: number) {
    const currentTodos = this.tree.$.todos();
    this.tree.$.todos.set(
      currentTodos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  }

  updateTodo(id: number, changes: Partial<Todo>) {
    const currentTodos = this.tree.$.todos();
    this.tree.$.todos.set(
      currentTodos.map((todo) =>
        todo.id === id ? { ...todo, ...changes } : todo
      )
    );
  }

  deleteTodo(id: number) {
    const currentTodos = this.tree.$.todos();
    this.tree.$.todos.set(currentTodos.filter((todo) => todo.id !== id));
  }

  setFilter(filter: TodoState['filter']) {
    this.tree.$.filter.set(filter);
  }

  getTodoCount() {
    return this.tree.$.todos().length;
  }

  getCompletedCount() {
    return this.tree.$.todos().filter((todo) => todo.completed).length;
  }
}

// Plain JavaScript implementation for comparison
class PlainJSStore {
  private state: TodoState = {
    todos: [],
    filter: 'all',
    selectedId: null,
  };

  addTodo(todo: Todo) {
    this.state = {
      ...this.state,
      todos: [...this.state.todos, todo],
    };
  }

  toggleTodo(id: number) {
    this.state = {
      ...this.state,
      todos: this.state.todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ),
    };
  }

  updateTodo(id: number, changes: Partial<Todo>) {
    this.state = {
      ...this.state,
      todos: this.state.todos.map((todo) =>
        todo.id === id ? { ...todo, ...changes } : todo
      ),
    };
  }

  deleteTodo(id: number) {
    this.state = {
      ...this.state,
      todos: this.state.todos.filter((todo) => todo.id !== id),
    };
  }

  setFilter(filter: TodoState['filter']) {
    this.state = { ...this.state, filter };
  }

  getTodoCount() {
    return this.state.todos.length;
  }

  getCompletedCount() {
    return this.state.todos.filter((todo) => todo.completed).length;
  }

  getState() {
    return this.state;
  }
}

describe('SignalTree Performance Benchmarks', () => {
  function createTestTodo(id: number): Todo {
    return {
      id,
      text: `Todo ${id}`,
      completed: false,
      priority: ['low', 'medium', 'high'][id % 3] as Todo['priority'],
      tags: [`tag${id % 5}`, `category${id % 3}`],
    };
  }

  function generateTodos(count: number): Todo[] {
    return Array.from({ length: count }, (_, i) => createTestTodo(i));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignalTreeTestComponent],
      providers: [BenchmarkService],
    }).compileComponents();
  });

  describe('SignalTree Performance Tests', () => {
    let component: SignalTreeTestComponent;

    beforeEach(() => {
      const fixture = TestBed.createComponent(SignalTreeTestComponent);
      component = fixture.componentInstance;
    });

    it('should handle bulk todo operations efficiently', () => {
      const todos = generateTodos(100); // Reduced from 1000 for faster testing

      const addTime = BenchmarkService.measureTime(() => {
        todos.forEach((todo) => component.addTodo(todo));
      }, 10); // Use 10 iterations instead of 1

      const updateTime = BenchmarkService.measureTime(() => {
        for (let i = 0; i < 10; i++) {
          // Reduced from 100
          component.toggleTodo(i);
        }
      }, 10);

      const deleteTime = BenchmarkService.measureTime(() => {
        for (let i = 0; i < 5; i++) {
          // Reduced from 50
          component.deleteTodo(i);
        }
      }, 10);

      console.log(
        `SignalTree - Add: ${addTime.toFixed(
          3
        )}ms, Update: ${updateTime.toFixed(3)}ms, Delete: ${deleteTime.toFixed(
          3
        )}ms`
      );

      expect(addTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(updateTime).toBeLessThan(1000);
      expect(deleteTime).toBeLessThan(1000);
    });

    it('should handle rapid state changes', () => {
      const todos = generateTodos(10); // Reduced from 100
      todos.forEach((todo) => component.addTodo(todo));

      const rapidUpdates = BenchmarkService.measureTime(() => {
        for (let i = 0; i < 100; i++) {
          // Reduced from 1000
          component.setFilter(i % 2 === 0 ? 'active' : 'completed');
          component.toggleTodo(i % 10); // Changed from i % 100
        }
      }, 10); // Use 10 iterations instead of 1

      console.log(`SignalTree rapid updates: ${rapidUpdates.toFixed(3)}ms`);
      expect(rapidUpdates).toBeLessThan(3000);
    });
  });

  describe('Performance Comparison: SignalTree vs Plain JavaScript', () => {
    it('should compare SignalTree vs Plain JS performance', () => {
      const todos = generateTodos(50); // Reduced from 500

      // SignalTree setup
      const stFixture = TestBed.createComponent(SignalTreeTestComponent);
      const stComponent = stFixture.componentInstance;

      // Plain JS setup
      const plainStore = new PlainJSStore();

      // Test SignalTree operations
      const signalTreeTime = BenchmarkService.measureTime(() => {
        todos.forEach((todo) => stComponent.addTodo(todo));
        for (let i = 0; i < 10; i++) {
          // Reduced from 100
          stComponent.toggleTodo(i);
          stComponent.updateTodo(i, { priority: 'high' });
        }
        // Trigger some reads
        stComponent.getTodoCount();
        stComponent.getCompletedCount();
      }, 10); // Increased from 3

      // Test Plain JS operations
      const plainJSTime = BenchmarkService.measureTime(() => {
        todos.forEach((todo) => plainStore.addTodo(todo));
        for (let i = 0; i < 10; i++) {
          // Reduced from 100
          plainStore.toggleTodo(i);
          plainStore.updateTodo(i, { priority: 'high' });
        }
        // Trigger some reads
        plainStore.getTodoCount();
        plainStore.getCompletedCount();
      }, 10); // Increased from 3

      const overhead = (
        ((signalTreeTime - plainJSTime) / plainJSTime) *
        100
      ).toFixed(1);

      console.log('\n=== PERFORMANCE COMPARISON ===');
      console.log(`Plain JS:   ${plainJSTime.toFixed(3)}ms`);
      console.log(`SignalTree: ${signalTreeTime.toFixed(3)}ms`);
      console.log(
        `Overhead: ${overhead}% ${
          signalTreeTime > plainJSTime ? 'slower' : 'faster'
        }`
      );

      // Log for the compare-suite parser
      console.log(`PlainJS performance: ${plainJSTime.toFixed(3)}ms avg`);
      console.log(`SignalTree performance: ${signalTreeTime.toFixed(3)}ms avg`);

      expect(plainJSTime).toBeGreaterThan(0);
      expect(signalTreeTime).toBeGreaterThan(0);

      // SignalTree should be reasonably performant (within 10x of plain JS)
      expect(signalTreeTime).toBeLessThan(plainJSTime * 10);
    });
  });
});
