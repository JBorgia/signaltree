import { TestBed } from '@angular/core/testing';

import { CoreDemoComponent } from '../pages/core-demo/core-demo.component';

describe('Core Demo Component', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoreDemoComponent],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(CoreDemoComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should demonstrate basic SignalTree functionality', () => {
    const fixture = TestBed.createComponent(CoreDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Test that the component has the expected methods
    expect(typeof component.addTodo).toBe('function');
    expect(typeof component.toggleTodo).toBe('function');
    expect(typeof component.deleteTodo).toBe('function');
    expect(typeof component.setFilter).toBe('function');

    // Test adding a todo
    const initialCount = component.filteredTodos().length;
    component.newTodoTitle = 'Test Todo';
    component.addTodo();

    expect(component.filteredTodos().length).toBe(initialCount + 1);
    expect(
      component.filteredTodos().some((todo) => todo.title === 'Test Todo')
    ).toBeTruthy();
  });

  it('should show reactive computed properties working', () => {
    const fixture = TestBed.createComponent(CoreDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Initial state
    const initialActive = component.activeTodos();
    const initialCompleted = component.completedTodos();

    // Add a todo
    component.newTodoTitle = 'Reactive Test';
    component.addTodo();

    // Should have one more active todo
    expect(component.activeTodos()).toBe(initialActive + 1);
    expect(component.completedTodos()).toBe(initialCompleted);

    // Toggle the todo
    const newTodo = component
      .filteredTodos()
      .find((t) => t.title === 'Reactive Test');
    if (newTodo) {
      component.toggleTodo(newTodo.id);

      // Should now have one more completed todo and one less active
      expect(component.activeTodos()).toBe(initialActive);
      expect(component.completedTodos()).toBe(initialCompleted + 1);
    }
  });

  it('should demonstrate filter functionality', () => {
    const fixture = TestBed.createComponent(CoreDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Add a couple of todos
    component.newTodoTitle = 'Active Todo';
    component.addTodo();
    fixture.detectChanges();

    component.newTodoTitle = 'Completed Todo';
    component.addTodo();
    fixture.detectChanges();

    // Toggle one to completed
    const todoToComplete = component
      .filteredTodos()
      .find((t) => t.title === 'Completed Todo');
    if (todoToComplete) {
      component.toggleTodo(todoToComplete.id);
      fixture.detectChanges();
    }

    // Test different filters
    component.setFilter('all');
    fixture.detectChanges();
    const allCount = component.filteredTodos().length;

    component.setFilter('active');
    fixture.detectChanges();
    const activeCount = component.filteredTodos().length;

    component.setFilter('completed');
    fixture.detectChanges();
    const completedCount = component.filteredTodos().length;

    expect(allCount).toBe(activeCount + completedCount);
    expect(activeCount).toBeGreaterThan(0);
    expect(completedCount).toBeGreaterThan(0);
  });
});
