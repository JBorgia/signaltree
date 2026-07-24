import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, signalTree, validators } from '@signaltree/core';

import { signalForm } from './signal-form';

interface Signup extends Record<string, unknown> {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * Proves the form() marker's built-in wizard is signalForm()-compatible — the
 * v13 replacement for the deprecated createWizardForm (RFC 0007). Wizard
 * navigation runs on the marker while a bound Angular Signal Forms FieldTree
 * shows the same values from one source of truth.
 */
describe('signalForm + marker wizard integration', () => {
  function create() {
    const tree = signalTree({
      signup: form<Signup>({
        initial: { email: '', password: '', firstName: '', lastName: '' },
        validators: {
          email: validators.required('Email required'),
        },
        wizard: {
          steps: ['account', 'profile'],
          stepFields: {
            account: ['email', 'password'],
            profile: ['firstName', 'lastName'],
          },
        },
      }),
    });
    const injector = TestBed.inject(Injector);
    const fieldTree = signalForm(tree.$.signup, { injector });
    return { signup: tree.$.signup, fieldTree };
  }

  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('exposes the wizard on the bridged marker', () => {
    const { signup } = create();
    expect(signup.wizard).toBeDefined();
    expect(signup.wizard?.currentStep()).toBe(0);
    expect(signup.wizard?.stepName()).toBe('account');
    expect(signup.wizard?.isFirstStep()).toBe(true);
  });

  it('navigates steps on the marker while the FieldTree stays bound', async () => {
    const { signup, fieldTree } = create();
    await stable();

    // Edit through the FieldTree; the marker sees it (shared model).
    fieldTree.email().value.set('ada@acme.test');
    await stable();
    expect(signup().email).toBe('ada@acme.test');

    // Advance the wizard via the marker; FieldTree values are unaffected.
    await signup.wizard?.next();
    await stable();
    expect(signup.wizard?.currentStep()).toBe(1);
    expect(signup.wizard?.stepName()).toBe('profile');
    expect(fieldTree.email().value()).toBe('ada@acme.test');

    signup.wizard?.prev();
    await stable();
    expect(signup.wizard?.currentStep()).toBe(0);
  });
});
