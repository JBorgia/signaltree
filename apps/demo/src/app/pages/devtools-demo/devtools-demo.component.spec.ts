import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { DevtoolsDemoComponent } from './devtools-demo.component';

describe('DevtoolsDemoComponent', () => {
  let component: DevtoolsDemoComponent;
  let fixture: ComponentFixture<DevtoolsDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevtoolsDemoComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(DevtoolsDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display initial state', () => {
    expect(component.counter()).toBe(0);
    expect(component.user().name).toBe('John Doe');
    expect(component.user().email).toBe('john@example.com');
    expect(component.user().preferences.theme).toBe('light');
    expect(component.user().preferences.notifications).toBe(true);
    expect(component.todos()).toEqual([]);
  });

  it('should increment and decrement counter', () => {
    component.increment();
    expect(component.counter()).toBe(1);
    expect(component.lastAction).toBe('Increment counter');

    component.increment();
    expect(component.counter()).toBe(2);

    component.decrement();
    expect(component.counter()).toBe(1);
    expect(component.lastAction).toBe('Decrement counter');

    component.reset();
    expect(component.counter()).toBe(0);
    expect(component.lastAction).toBe('Reset counter');
  });

  it('should update user information', () => {
    const nameEvent = { target: { value: 'Jane Smith' } } as any;
    component.updateUserName(nameEvent);
    expect(component.user().name).toBe('Jane Smith');
    expect(component.lastAction).toBe('Update user name');

    const emailEvent = { target: { value: 'jane@example.com' } } as any;
    component.updateUserEmail(emailEvent);
    expect(component.user().email).toBe('jane@example.com');
    expect(component.lastAction).toBe('Update user email');

    const themeEvent = { target: { value: 'dark' } } as any;
    component.updateTheme(themeEvent);
    expect(component.user().preferences.theme).toBe('dark');
    expect(component.lastAction).toBe('Update theme');

    component.toggleNotifications();
    expect(component.user().preferences.notifications).toBe(false);
    expect(component.lastAction).toBe('Toggle notifications');
  });

  it('should manage todos', () => {
    component.newTodoText = 'Test todo';
    component.addTodo();

    expect(component.todos().length).toBe(1);
    expect(component.todos()[0].text).toBe('Test todo');
    expect(component.todos()[0].completed).toBe(false);
    expect(component.newTodoText).toBe('');
    expect(component.lastAction).toBe('Add todo');
  });

  it('should add multiple todos', () => {
    component.addMultipleTodos();

    expect(component.todos().length).toBe(5);
    expect(component.todos()[0].text).toBe('Review pull requests');
    expect(component.todos()[4].text).toBe('Deploy to staging');
    expect(component.lastAction).toBe('Add multiple todos');
  });

  it('should toggle and remove todos', () => {
    component.newTodoText = 'Test todo';
    component.addTodo();
    const todoId = component.todos()[0].id;

    // Toggle completion
    component.toggleTodo(todoId);
    expect(component.todos()[0].completed).toBe(true);
    expect(component.lastAction).toBe('Toggle todo');

    component.toggleTodo(todoId);
    expect(component.todos()[0].completed).toBe(false);

    // Remove todo
    component.removeTodo(todoId);
    expect(component.todos().length).toBe(0);
    expect(component.lastAction).toBe('Remove todo');
  });

  it('should provide devtools functionality', () => {
    // Test metrics (basic structure)
    const metrics = component.getMetrics();
    expect(metrics).toHaveProperty('updateCount');
    expect(metrics).toHaveProperty('averageUpdateTime');
    expect(metrics).toHaveProperty('lastUpdateTime');
    expect(metrics).toHaveProperty('totalExecutionTime');

    // Test state information
    expect(component.getStateSize()).toBeGreaterThan(0);
    expect(component.getDeepestPath()).toBe('user.preferences.notifications');

    // Test console logging (spy on console.log)
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    component.logState();
    expect(consoleSpy).toHaveBeenCalled();
    expect(component.lastAction).toBe('Log state to console');
    consoleSpy.mockRestore();
  });

  it('should format user state correctly', () => {
    const formattedState = component.formatUserState();
    expect(formattedState).toContain('counter');
    expect(formattedState).toContain('user');
    expect(formattedState).toContain('John Doe');
    expect(formattedState).toContain('john@example.com');
  });

  it('should handle devtools actions', () => {
    // Test snapshot (should not throw)
    expect(() => component.triggerSnapshot()).not.toThrow();
    expect(component.lastAction).toBe('Take state snapshot');

    // Test reset metrics (should not throw)
    expect(() => component.resetMetrics()).not.toThrow();
    expect(component.lastAction).toBe('Reset performance metrics');
  });

  it('should track action history correctly', () => {
    expect(component.lastAction).toBe('Initial state');

    component.increment();
    expect(component.lastAction).toBe('Increment counter');

    component.updateUserName({ target: { value: 'Test' } } as any);
    expect(component.lastAction).toBe('Update user name');

    component.addMultipleTodos();
    expect(component.lastAction).toBe('Add multiple todos');
  });
});
