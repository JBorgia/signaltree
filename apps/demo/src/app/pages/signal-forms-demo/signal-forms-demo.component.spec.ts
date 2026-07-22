import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { SignalFormsDemoComponent } from './signal-forms-demo.component';

describe('SignalFormsDemoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignalFormsDemoComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders both bridges with live validation', () => {
    const fixture = TestBed.createComponent(SignalFormsDemoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    // markerSignalForm: empty required form → both APIs agree it's invalid
    expect(component.profile().valid()).toBe(false);
    expect(component.tree.$.onboarding.profile.valid()).toBe(false);

    // Shared model: marker write is visible through the FieldTree
    component.fillFromMarker();
    expect(component.profile.name().value()).toBe('Ada Lovelace');
    expect(component.profile().valid()).toBe(true);

    // Page renders an h1 via the example shell
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
      'Signal Forms'
    );
  });
});
