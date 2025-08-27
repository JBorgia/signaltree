import { TestBed } from '@angular/core/testing';
import { BatchingDemoComponent } from '../pages/batching-demo/batching-demo.component';

describe('Batching Demo Component', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BatchingDemoComponent],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(BatchingDemoComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should demonstrate batching functionality', () => {
    const fixture = TestBed.createComponent(BatchingDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Test that batching methods exist
    expect(typeof component.addMultipleTodos).toBe('function');
    expect(typeof component.bulkUpdateTodos).toBe('function');
    expect(typeof component.performBatchOperations).toBe('function');

    // Test bulk operations
    const initialCount = component.todos().length;
    component.addMultipleTodos(5);

    // Should have added 5 todos
    expect(component.todos().length).toBe(initialCount + 5);
  });

  it('should show batching performance benefits', () => {
    const fixture = TestBed.createComponent(BatchingDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Performance tracking should be available
    expect(typeof component.batchedTime).toBe('function');
    expect(typeof component.unbatchedTime).toBe('function');

    // Run performance comparison
    component.performBatchOperations();

    // After running, should have timing data
    const batchedTime = component.batchedTime();
    const unbatchedTime = component.unbatchedTime();

    expect(typeof batchedTime).toBe('number');
    expect(typeof unbatchedTime).toBe('number');
    expect(batchedTime).toBeGreaterThan(0);
    expect(unbatchedTime).toBeGreaterThan(0);
  });
});
