import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TimeTravelDemoComponent } from './time-travel-demo.component';

describe('TimeTravelDemoComponent', () => {
  let component: TimeTravelDemoComponent;
  let fixture: ComponentFixture<TimeTravelDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimeTravelDemoComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(TimeTravelDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display initial state', () => {
    expect(component.counter()).toBe(0);
    expect(component.todos()).toEqual([]);
    expect(component.message()).toBe('');
  });

  it('should increment and decrement counter', () => {
    component.increment();
    expect(component.counter()).toBe(1);

    component.increment();
    expect(component.counter()).toBe(2);

    component.decrement();
    expect(component.counter()).toBe(1);
  });

  it('should add todos', () => {
    component.newTodoText = 'Test todo';
    component.addTodo();

    expect(component.todos().length).toBe(1);
    expect(component.todos()[0].text).toBe('Test todo');
    expect(component.todos()[0].completed).toBe(false);
    expect(component.newTodoText).toBe('');
  });

  it('should toggle todo completion', () => {
    component.newTodoText = 'Test todo';
    component.addTodo();
    const todoId = component.todos()[0].id;

    component.toggleTodo(todoId);
    expect(component.todos()[0].completed).toBe(true);

    component.toggleTodo(todoId);
    expect(component.todos()[0].completed).toBe(false);
  });

  it('should support time travel undo/redo', () => {
    // Initial state
    expect(component.counter()).toBe(0);
    expect(component.canUndo()).toBe(false);
    expect(component.canRedo()).toBe(false);

    // Make changes
    component.increment();
    component.increment();
    expect(component.counter()).toBe(2);
    expect(component.canUndo()).toBe(true);

    // Undo changes
    component.undo();
    expect(component.counter()).toBe(1);
    expect(component.canRedo()).toBe(true);

    component.undo();
    expect(component.counter()).toBe(0);

    // Redo changes
    component.redo();
    expect(component.counter()).toBe(1);

    component.redo();
    expect(component.counter()).toBe(2);
  });

  it('should track history', () => {
    const initialHistoryLength = component.getHistory().length;

    component.increment();
    component.increment();

    expect(component.getHistory().length).toBeGreaterThan(initialHistoryLength);
    expect(component.getCurrentIndex()).toBeGreaterThan(0);
  });

  it('should jump to specific history point', () => {
    component.increment();
    component.increment();
    component.increment();
    expect(component.counter()).toBe(3);

    const targetIndex = 1; // Should be after first increment
    component.jumpTo(targetIndex);
    expect(component.getCurrentIndex()).toBe(targetIndex);
  });

  it('should reset history', () => {
    component.increment();
    component.increment();

    expect(component.canUndo()).toBe(true);
    expect(component.getHistory().length).toBeGreaterThan(1);

    component.resetHistory();
    expect(component.canUndo()).toBe(false);
    expect(component.getHistory().length).toBe(1);
  });

  it('should handle complex state changes with time travel', () => {
    // Make multiple different changes
    component.increment();
    component.newTodoText = 'First todo';
    component.addTodo();
    component.increment();

    expect(component.counter()).toBe(2);
    expect(component.todos().length).toBe(1);

    // Undo everything
    while (component.canUndo()) {
      component.undo();
    }

    expect(component.counter()).toBe(0);
    expect(component.todos().length).toBe(0);

    // Redo everything
    while (component.canRedo()) {
      component.redo();
    }

    expect(component.counter()).toBe(2);
    expect(component.todos().length).toBe(1);
  });
});
