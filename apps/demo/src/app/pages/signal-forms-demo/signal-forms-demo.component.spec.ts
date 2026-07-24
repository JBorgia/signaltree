import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { MinValidationError } from '@angular/forms/signals';

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

    // signalForm (marker shape): empty required form → both APIs agree it's invalid
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

  it('nativeErrors: true bridge emits branded Angular validation errors', () => {
    const fixture = TestBed.createComponent(SignalFormsDemoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    // initial: age 10 < min 18 → invalid, and the error is the BRANDED class,
    // not a plain { kind, message } object.
    expect(component.nativeAccount().valid()).toBe(false);
    const err = component.nativeAgeError();
    expect(err).toBeInstanceOf(MinValidationError);
    expect(component.isNativeMinError()).toBe(true);
    expect(component.nativeMinValue()).toBe(18);
    expect(err?.kind).toBe('min');

    // Fix the value → valid, no error.
    component.nativeTree.$.account.patch({ age: 21 });
    expect(component.nativeAccount().valid()).toBe(true);
    expect(component.nativeAgeError()).toBeUndefined();
  });
});
