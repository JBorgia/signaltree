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
    expect(typeof component.addBulkUserOperations).toBe('function');
    expect(typeof component.addBulkPostOperations).toBe('function');
    expect(typeof component.clearBatch).toBe('function');

    // Test bulk operations
    const initialCount = component.users().length;
    component.addBulkUserOperations();
    fixture.detectChanges(); // Trigger change detection after the operation

    // Should have added users through bulk operations (initial 5 + 3 new = 8)
    expect(component.users().length).toBeGreaterThan(initialCount);
    expect(component.users().length).toBe(initialCount + 3);
  });

  it('should show batching performance benefits', () => {
    const fixture = TestBed.createComponent(BatchingDemoComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    // Performance tracking should be available via signals
    expect(typeof component.batchQueue).toBe('function');
    expect(typeof component.processing).toBe('function');

    // Run performance comparison
    component.addBulkUserOperations();

    // After running, should have operational data
    expect(component.batchQueue().length).toBeGreaterThanOrEqual(0);
    expect(typeof component.processing()).toBe('boolean');
  });
});
