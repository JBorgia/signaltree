import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SchemaDemoComponent } from './schema-demo.component';

describe('SchemaDemoComponent', () => {
  let component: SchemaDemoComponent;
  let fixture: ComponentFixture<SchemaDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchemaDemoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SchemaDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('validates the initial (empty) form as invalid on attach', () => {
    // schemas() runs an initial validation pass by default — no input needed.
    expect(component.isValid()).toBe(false);
    expect(component.nameError()).toBeTruthy();
    expect(component.emailError()).toBeTruthy();
    expect(component.ageError()).toBeTruthy();
  });

  it('clears sync errors as each field becomes valid', async () => {
    component.onNameInput('Jo');
    expect(component.nameError()).toBeNull();

    component.onEmailInput('jo@example.com');
    expect(component.emailError()).toBeNull();

    component.onAgeInput('25');
    expect(component.ageError()).toBeNull();

    // username is validated by an async refine — its error only lands once
    // the (simulated) round-trip resolves, even for the empty default.
    await new Promise((r) => setTimeout(r, 400));
    expect(component.usernameError()).toBeTruthy();
    expect(component.isValid()).toBe(false);
  });

  it('flags an async-validated username as taken after the simulated round-trip', async () => {
    component.onUsernameInput('admin');

    // The refine() is dispatched synchronously; pending() should flip
    // immediately, before the simulated 300ms network round-trip resolves.
    expect(component.pending()).toBe(true);
    expect(component.pendingPaths()).toContain('username');

    await new Promise((r) => setTimeout(r, 400));

    expect(component.pending()).toBe(false);
    expect(component.usernameError()).toBe('Username is already taken');
    expect(component.isValid()).toBe(false);
  });

  it('accepts an available username after the async check resolves', async () => {
    component.onUsernameInput('brand-new-user');
    await new Promise((r) => setTimeout(r, 400));

    expect(component.usernameError()).toBeNull();
  });

  it('submit() reports success once every field is valid', async () => {
    component.onNameInput('Ada Lovelace');
    component.onEmailInput('ada@example.com');
    component.onAgeInput('30');
    component.onUsernameInput('ada-lovelace');
    await new Promise((r) => setTimeout(r, 400));
    expect(component.isValid()).toBe(true);

    const submitPromise = component.submit();
    expect(component.submitting()).toBe(true);
    await submitPromise;

    expect(component.submitting()).toBe(false);
    expect(component.lastResult()).toBe('success');
  });

  it('submit() reports failure while the form is still invalid', async () => {
    // Fresh component: name/email/age/username are all still at their
    // invalid defaults.
    await component.submit();
    expect(component.lastResult()).toBe('failure');
  });

  it('reset() clears local mirrors, tree leaves, and the last submit result', async () => {
    component.onNameInput('Ada Lovelace');
    component.onEmailInput('ada@example.com');
    await component.submit();

    component.reset();

    expect(component.name()).toBe('');
    expect(component.email()).toBe('');
    expect(component.age()).toBe(0);
    expect(component.username()).toBe('');
    expect(component.store.$.name()).toBe('');
    expect(component.lastResult()).toBeNull();
  });
});
