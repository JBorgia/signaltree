import { TestBed } from '@angular/core/testing';

import { BatchingComparisonComponent } from './batching-comparison.component';

describe('BatchingComparisonComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BatchingComparisonComponent],
    }).compileComponents();
  });

  it('should create and render', () => {
    const fixture = TestBed.createComponent(BatchingComparisonComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
      'Batching Comparison'
    );
    expect(fixture.nativeElement.querySelector('button').textContent).toContain(
      'Run Comparison'
    );
  });

  it('should run the comparison from a click handler without NG0203', async () => {
    const fixture = TestBed.createComponent(BatchingComparisonComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.ops.set(100);

    await component.runComparison();

    // Unbatched applies every write; coalesce applies only the final one
    expect(component.unbatchedWrites()).toBe(100);
    expect(component.batchedWrites()).toBe(1);
    expect(component.unbatchedTime()).not.toBeNull();
    expect(component.batchedTime()).not.toBeNull();
  });
});
