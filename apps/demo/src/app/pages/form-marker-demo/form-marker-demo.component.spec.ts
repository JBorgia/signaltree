import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { FormMarkerDemoComponent } from './form-marker-demo.component';

describe('FormMarkerDemoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormMarkerDemoComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  // Regression: the 11.4.1 form() marker seeded validation with a signal
  // WRITE inside the marker factory; markers materialize lazily during
  // template rendering, so the first render threw NG0600 and every binding
  // after the throw stayed blank (empty Form State panel, empty submit
  // button). errors/valid are computed now — this spec renders the real
  // page and asserts the state panel bindings produce values.
  it('renders with live form state (no NG0600 from lazy materialization)', () => {
    const fixture = TestBed.createComponent(FormMarkerDemoComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    // Empty required fields → invalid, and the value must actually render
    expect(component.contactForm.valid()).toBe(false);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Valid:');
    expect(text).toContain('false');
    // Submit button label rendered (was blank when CD died mid-render)
    expect(text).toContain('Send');
  });

  it('validates live as values change', () => {
    const fixture = TestBed.createComponent(FormMarkerDemoComponent);
    fixture.detectChanges();
    const form = fixture.componentInstance.contactForm;

    form.patch({
      name: 'Ada',
      email: 'ada@analytical.engine',
      phone: '',
      message: 'A sufficiently long message.',
    });
    expect(form.valid()).toBe(true);

    form.patch({ email: 'nope' });
    expect(form.valid()).toBe(false);
    expect(form.errors()['email']).toBe('Please enter a valid email');
  });
});
