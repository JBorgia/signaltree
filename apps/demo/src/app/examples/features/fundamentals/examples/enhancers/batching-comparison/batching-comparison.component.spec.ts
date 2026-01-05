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
    expect(fixture.nativeElement.querySelector('h2').textContent).toContain(
      'Batching Comparison'
    );
    expect(fixture.nativeElement.querySelector('button').textContent).toContain(
      'Run Comparison'
    );
  });
});
