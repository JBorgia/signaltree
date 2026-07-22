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

  it('renders all six markers without mid-render signal writes', () => {
    const fixture = TestBed.createComponent(MarkerZooComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    // form marker: empty required fields → honest invalid badge
    expect(component.store.$.onboarding.profile.valid()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('✗ invalid');
  });

  it('form marker validates live through patch()', () => {
    const fixture = TestBed.createComponent(MarkerZooComponent);
    fixture.detectChanges();
    const profile = fixture.componentInstance.store.$.onboarding.profile;

    profile.patch({ name: '8888', email: 'mail.com' });
    // The original audit screenshot: this exact input showed "✓ valid"
    expect(profile.valid()).toBe(false);
    expect(profile.errors()['email']).toBe('Invalid email');

    profile.patch({ email: 'real@mail.com' });
    expect(profile.valid()).toBe(true);
  });
});
