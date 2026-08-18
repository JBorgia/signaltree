import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { MarkerZooComponent } from './marker-zoo.component';

describe('MarkerZooComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarkerZooComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders every marker without mid-render signal writes', () => {
    const fixture = TestBed.createComponent(MarkerZooComponent);
    fixture.detectChanges();

    // The form marker section was removed in 15.0 (FORM-DEL); the
    // remaining markers must still render in a single pass.
    expect(fixture.nativeElement.textContent).toContain('depth');
  });
});
