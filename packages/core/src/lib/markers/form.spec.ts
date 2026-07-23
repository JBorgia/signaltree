import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signalTree } from '../signal-tree';
import { createFormSignal, form, FORM_MARKER, isFormMarker, validators, withKind } from './form';

// Mock localStorage for testing
function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
}

interface TestFormData {
  name: string;
  email: string;
  age: number;
  acceptTerms: boolean;
}

const defaultFormData: TestFormData = {
  name: '',
  email: '',
  age: 0,
  acceptTerms: false,
};

describe('form() marker', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  describe('marker creation', () => {
    it('should create a form marker', () => {
      const marker = form<TestFormData>({ initial: defaultFormData });
      expect(marker[FORM_MARKER]).toBe(true);
      expect(marker.config.initial).toEqual(defaultFormData);
    });

    it('should be identifiable by type guard', () => {
      const marker = form<TestFormData>({ initial: defaultFormData });
      expect(isFormMarker(marker)).toBe(true);
      expect(isFormMarker({})).toBe(false);
      expect(isFormMarker(null)).toBe(false);
      expect(isFormMarker('form')).toBe(false);
    });

    it('should store validators in config', () => {
      const marker = form<TestFormData>({
        initial: defaultFormData,
        validators: {
          name: validators.required(),
          email: validators.email(),
        },
      });
      expect(marker.config.validators?.name).toBeDefined();
      expect(marker.config.validators?.email).toBeDefined();
    });
  });

  describe('FormSignal creation', () => {
    it('should create a callable FormSignal', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      expect(typeof formSignal).toBe('function');
      expect(formSignal()).toEqual(defaultFormData);
    });

    it('should provide field accessors via $', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      expect(formSignal.$.name()).toBe('');
      expect(formSignal.$.email()).toBe('');
      expect(formSignal.$.age()).toBe(0);
      expect(formSignal.$.acceptTerms()).toBe(false);
    });

    it('should update individual fields', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      formSignal.$.name.set('John');
      formSignal.$.email.set('john@example.com');

      expect(formSignal.$.name()).toBe('John');
      expect(formSignal.$.email()).toBe('john@example.com');
      expect(formSignal()).toEqual({
        ...defaultFormData,
        name: 'John',
        email: 'john@example.com',
      });
    });

    describe('v10.4 .data() alias', () => {
      it('should return the same values as calling the marker itself', () => {
        const formSignal = createFormSignal(
          form<TestFormData>({ initial: defaultFormData })
        );
        expect(formSignal.data()).toEqual(formSignal());
        expect(formSignal.data()).toEqual(defaultFormData);
      });

      it('should reflect updates through .data()', () => {
        const formSignal = createFormSignal(
          form<TestFormData>({ initial: defaultFormData })
        );
        formSignal.$.name.set('Alice');
        formSignal.$.email.set('alice@example.com');
        expect(formSignal.data()).toEqual({
          ...defaultFormData,
          name: 'Alice',
          email: 'alice@example.com',
        });
        // Both forms stay in sync
        expect(formSignal.data()).toEqual(formSignal());
      });
    });
  });

  describe('set and patch methods', () => {
    it('should set all values at once', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      formSignal.set({
        name: 'Jane',
        email: 'jane@example.com',
        age: 25,
        acceptTerms: true,
      });

      expect(formSignal()).toEqual({
        name: 'Jane',
        email: 'jane@example.com',
        age: 25,
        acceptTerms: true,
      });
    });

    it('should patch partial values', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      formSignal.patch({ name: 'Bob' });
      expect(formSignal.$.name()).toBe('Bob');
      expect(formSignal.$.email()).toBe(''); // unchanged
    });
  });

  describe('reset and clear methods', () => {
    it('should reset to initial values', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      formSignal.set({
        name: 'Jane',
        email: 'jane@example.com',
        age: 25,
        acceptTerms: true,
      });

      formSignal.reset();

      expect(formSignal()).toEqual(defaultFormData);
    });

    it('should clear to empty/default type values', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: {
            name: 'Initial',
            email: 'initial@example.com',
            age: 30,
            acceptTerms: true,
          },
        })
      );

      formSignal.clear();

      expect(formSignal.$.name()).toBe('');
      expect(formSignal.$.email()).toBe('');
      expect(formSignal.$.age()).toBe(0);
      // Boolean clears to the initial value
    });
  });

  describe('validation', () => {
    it('should validate required fields', async () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            name: validators.required('Name is required'),
          },
        })
      );

      const isValid = await formSignal.validate();
      expect(isValid).toBe(false);
      expect(formSignal.valid()).toBe(false);
      expect(formSignal.errors()?.name).toBe('Name is required');
    });

    it('should pass validation when fields are valid', async () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            name: validators.required(),
          },
        })
      );

      formSignal.$.name.set('John');
      const isValid = await formSignal.validate();

      expect(isValid).toBe(true);
      expect(formSignal.valid()).toBe(true);
      expect(formSignal.errors()?.name).toBeNull();
    });

    it('should validate email format', async () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            email: validators.email('Invalid email'),
          },
        })
      );

      formSignal.$.email.set('not-an-email');
      await formSignal.validate();

      expect(formSignal.errors()?.email).toBe('Invalid email');

      formSignal.$.email.set('valid@email.com');
      await formSignal.validate();

      expect(formSignal.errors()?.email).toBeNull();
    });

    it('should validate min/max length', async () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            name: [
              validators.minLength(2, 'Too short'),
              validators.maxLength(50, 'Too long'),
            ],
          },
        })
      );

      formSignal.$.name.set('A');
      await formSignal.validate();
      expect(formSignal.errors()?.name).toBe('Too short');

      formSignal.$.name.set('John');
      await formSignal.validate();
      expect(formSignal.errors()?.name).toBeNull();
    });

    it('should validate min/max numbers', async () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            age: [
              validators.min(18, 'Must be 18+'),
              validators.max(120, 'Invalid age'),
            ],
          },
        })
      );

      formSignal.$.age.set(10);
      await formSignal.validate();
      expect(formSignal.errors()?.age).toBe('Must be 18+');

      formSignal.$.age.set(25);
      await formSignal.validate();
      expect(formSignal.errors()?.age).toBeNull();
    });

    it('should validate with pattern', async () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            name: validators.pattern(/^[A-Z]/, 'Must start with uppercase'),
          },
        })
      );

      formSignal.$.name.set('john');
      await formSignal.validate();
      expect(formSignal.errors()?.name).toBe('Must start with uppercase');

      formSignal.$.name.set('John');
      await formSignal.validate();
      expect(formSignal.errors()?.name).toBeNull();
    });

    it('should validate single field', async () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            name: validators.required(),
            email: validators.email(),
          },
        })
      );

      const nameValid = await formSignal.validateField('name');
      expect(nameValid).toBe(false);

      formSignal.$.name.set('John');
      const nameValid2 = await formSignal.validateField('name');
      expect(nameValid2).toBe(true);
    });
  });

  describe('dirty tracking', () => {
    it('should track dirty state', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      expect(formSignal.dirty()).toBe(false);

      formSignal.$.name.set('John');
      expect(formSignal.dirty()).toBe(true);

      formSignal.reset();
      expect(formSignal.dirty()).toBe(false);
    });
  });

  describe('touched tracking', () => {
    it('should track touched fields', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      expect(formSignal.touched().name).toBe(false);

      formSignal.touch('name');
      expect(formSignal.touched().name).toBe(true);
      expect(formSignal.touched().email).toBe(false);
    });

    it('should touch all fields', () => {
      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      formSignal.touchAll();

      expect(formSignal.touched().name).toBe(true);
      expect(formSignal.touched().email).toBe(true);
      expect(formSignal.touched().age).toBe(true);
      expect(formSignal.touched().acceptTerms).toBe(true);
    });
  });

  describe('submit', () => {
    it('should call handler on valid form', async () => {
      const handler = vi.fn().mockResolvedValue('success');
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            name: validators.required(),
          },
        })
      );

      formSignal.$.name.set('John');

      const result = await formSignal.submit(handler);

      expect(handler).toHaveBeenCalledWith({
        ...defaultFormData,
        name: 'John',
      });
      expect(result).toBe('success');
    });

    it('should not call handler on invalid form', async () => {
      const handler = vi.fn().mockResolvedValue('success');
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            name: validators.required(),
          },
        })
      );

      const result = await formSignal.submit(handler);

      expect(handler).not.toHaveBeenCalled();
      expect(result).toBe(null);
    });

    it('should track submitting state', async () => {
      let resolveHandler: () => void;
      const handler = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveHandler = resolve;
          })
      );

      const formSignal = createFormSignal(
        form<TestFormData>({ initial: defaultFormData })
      );

      expect(formSignal.submitting()).toBe(false);

      const submitPromise = formSignal.submit(handler);

      // Wait for validation to complete and handler to be called
      await new Promise((r) => setTimeout(r, 10));
      expect(formSignal.submitting()).toBe(true);

      resolveHandler!();
      await submitPromise;

      expect(formSignal.submitting()).toBe(false);
    });
  });

  describe('errorList signal', () => {
    it('should provide list of all errors', async () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          validators: {
            name: validators.required('Name required'),
            email: validators.email('Invalid email'),
          },
        })
      );

      formSignal.$.email.set('bad');
      await formSignal.validate();

      const errors = formSignal.errorList();
      // errorList returns string[] (just the messages)
      expect(errors).toContain('Name required');
      expect(errors).toContain('Invalid email');
    });
  });

  describe('persistence', () => {
    it('should persist form data to storage', async () => {
      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          persist: 'test-form',
          storage: mockStorage,
          persistDebounceMs: 0,
        })
      );

      formSignal.$.name.set('Persisted');

      // Wait for persist
      await new Promise((r) => setTimeout(r, 50));

      const stored = mockStorage.getItem('test-form');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toMatchObject({ name: 'Persisted' });
    });

    it('should load persisted data on init', () => {
      mockStorage.setItem(
        'test-form',
        JSON.stringify({
          name: 'Loaded',
          email: 'loaded@test.com',
          age: 99,
          acceptTerms: true,
        })
      );

      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          persist: 'test-form',
          storage: mockStorage,
        })
      );

      expect(formSignal.$.name()).toBe('Loaded');
      expect(formSignal.$.email()).toBe('loaded@test.com');
    });

    it('should clear storage', () => {
      mockStorage.setItem('test-form', JSON.stringify({ name: 'Data' }));

      const formSignal = createFormSignal(
        form<TestFormData>({
          initial: defaultFormData,
          persist: 'test-form',
          storage: mockStorage,
        })
      );

      formSignal.clearStorage();
      expect(mockStorage.getItem('test-form')).toBeNull();
    });
  });

  describe('wizard support', () => {
    interface WizardFormData {
      step1Field: string;
      step2Field: string;
      step3Field: string;
    }

    it('should create wizard with steps', () => {
      const formSignal = createFormSignal(
        form<WizardFormData>({
          initial: { step1Field: '', step2Field: '', step3Field: '' },
          wizard: {
            steps: ['Step 1', 'Step 2', 'Step 3'],
            stepFields: {
              'Step 1': ['step1Field'],
              'Step 2': ['step2Field'],
              'Step 3': ['step3Field'],
            },
          },
        })
      );

      expect(formSignal.wizard).toBeDefined();
      expect(formSignal.wizard?.currentStep()).toBe(0);
      expect(formSignal.wizard?.stepName()).toBe('Step 1');
      expect(formSignal.wizard?.steps()).toEqual([
        'Step 1',
        'Step 2',
        'Step 3',
      ]);
    });

    it('should navigate between steps', async () => {
      const formSignal = createFormSignal(
        form<WizardFormData>({
          initial: { step1Field: '', step2Field: '', step3Field: '' },
          wizard: {
            steps: ['Step 1', 'Step 2', 'Step 3'],
            stepFields: {
              'Step 1': ['step1Field'],
              'Step 2': ['step2Field'],
              'Step 3': ['step3Field'],
            },
          },
        })
      );

      expect(formSignal.wizard?.isFirstStep()).toBe(true);
      expect(formSignal.wizard?.canPrev()).toBe(false);
      expect(formSignal.wizard?.canNext()).toBe(true);

      await formSignal.wizard?.next();
      expect(formSignal.wizard?.currentStep()).toBe(1);
      expect(formSignal.wizard?.stepName()).toBe('Step 2');

      formSignal.wizard?.prev();
      expect(formSignal.wizard?.currentStep()).toBe(0);
    });

    it('should validate step before advancing', async () => {
      const formSignal = createFormSignal(
        form<WizardFormData>({
          initial: { step1Field: '', step2Field: '', step3Field: '' },
          validators: {
            step1Field: validators.required('Required'),
          },
          wizard: {
            steps: ['Step 1', 'Step 2'],
            stepFields: {
              'Step 1': ['step1Field'],
              'Step 2': ['step2Field'],
            },
          },
        })
      );

      const advanced = await formSignal.wizard?.next();
      expect(advanced).toBe(false);
      expect(formSignal.wizard?.currentStep()).toBe(0);

      formSignal.$.step1Field.set('filled');
      const advanced2 = await formSignal.wizard?.next();
      expect(advanced2).toBe(true);
      expect(formSignal.wizard?.currentStep()).toBe(1);
    });

    it('should jump to step by index or name', async () => {
      const formSignal = createFormSignal(
        form<WizardFormData>({
          initial: { step1Field: '', step2Field: '', step3Field: '' },
          wizard: {
            steps: ['Step 1', 'Step 2', 'Step 3'],
            stepFields: {
              'Step 1': ['step1Field'],
              'Step 2': ['step2Field'],
              'Step 3': ['step3Field'],
            },
          },
        })
      );

      await formSignal.wizard?.goTo(2);
      expect(formSignal.wizard?.currentStep()).toBe(2);

      await formSignal.wizard?.goTo('Step 1');
      expect(formSignal.wizard?.currentStep()).toBe(0);
    });

    it('should reset wizard to first step', async () => {
      const formSignal = createFormSignal(
        form<WizardFormData>({
          initial: { step1Field: '', step2Field: '', step3Field: '' },
          wizard: {
            steps: ['Step 1', 'Step 2', 'Step 3'],
            stepFields: {
              'Step 1': ['step1Field'],
              'Step 2': ['step2Field'],
              'Step 3': ['step3Field'],
            },
          },
        })
      );

      await formSignal.wizard?.next();
      expect(formSignal.wizard?.currentStep()).toBe(1);

      formSignal.wizard?.reset();
      expect(formSignal.wizard?.currentStep()).toBe(0);
    });
  });

  describe('integration with signalTree', () => {
    it('should work within a signal tree', async () => {
      const tree = signalTree({
        loginForm: form<{ username: string; password: string }>({
          initial: { username: '', password: '' },
          validators: {
            username: validators.required(),
            password: validators.minLength(8),
          },
        }),
      });

      // Access form through tree
      expect(tree.$.loginForm()).toEqual({ username: '', password: '' });

      // Update via field accessor
      tree.$.loginForm.$.username.set('john');
      expect(tree.$.loginForm.$.username()).toBe('john');

      // Validate
      const isValid = await tree.$.loginForm.validate();
      expect(isValid).toBe(false); // password too short

      tree.$.loginForm.$.password.set('verysecure');
      const isValid2 = await tree.$.loginForm.validate();
      expect(isValid2).toBe(true);
    });
  });
});

describe('validators', () => {
  describe('required', () => {
    it('should fail on empty string', () => {
      const validate = validators.required();
      expect(validate('')).toBeTruthy();
      expect(validate(null)).toBeTruthy();
      expect(validate(undefined)).toBeTruthy();
    });

    it('should pass on non-empty value', () => {
      const validate = validators.required();
      expect(validate('text')).toBeNull();
      expect(validate(0)).toBeNull();
      expect(validate(false)).toBeNull();
    });
  });

  describe('email', () => {
    it('should validate email format', () => {
      const validate = validators.email();
      expect(validate('invalid')).toBeTruthy();
      expect(validate('no-domain@')).toBeTruthy();
      expect(validate('valid@email.com')).toBeNull();
      expect(validate('user.name+tag@domain.co.uk')).toBeNull();
    });
  });

  describe('when (conditional)', () => {
    it('should only validate when condition is met', () => {
      interface Form {
        hasAddress: boolean;
        address: string;
      }
      const validate = validators.when<Form>(
        (form) => form.hasAddress,
        validators.required('Address required')
      );

      // Without form context, should skip
      expect(validate('')).toBeNull();

      // With form context where condition is false
      expect(validate('', { hasAddress: false, address: '' })).toBeNull();

      // With form context where condition is true
      expect(validate('', { hasAddress: true, address: '' })).toBe(
        'Address required'
      );
      expect(
        validate('123 Main St', { hasAddress: true, address: '123 Main St' })
      ).toBeNull();
    });
  });

  describe('validator identity (validatorKind / validatorParams)', () => {
    it('built-in factories tag kind, and constraint factories tag params', () => {
      expect(validators.required().validatorKind).toBe('required');
      expect(validators.email().validatorKind).toBe('email');

      const min = validators.min(18);
      expect(min.validatorKind).toBe('min');
      expect(min.validatorParams).toEqual({ min: 18 });

      const max = validators.max(99);
      expect(max.validatorKind).toBe('max');
      expect(max.validatorParams).toEqual({ max: 99 });

      const minLength = validators.minLength(3);
      expect(minLength.validatorKind).toBe('minLength');
      expect(minLength.validatorParams).toEqual({ minLength: 3 });

      const maxLength = validators.maxLength(10);
      expect(maxLength.validatorKind).toBe('maxLength');
      expect(maxLength.validatorParams).toEqual({ maxLength: 10 });

      const regex = /^\d+$/;
      const pattern = validators.pattern(regex);
      expect(pattern.validatorKind).toBe('pattern');
      expect(pattern.validatorParams).toEqual({ pattern: regex });
    });

    it('when() forwards the inner validator kind and params', () => {
      const wrapped = validators.when<{ on: boolean }>(
        (f) => f.on,
        validators.minLength(5)
      );
      expect(wrapped.validatorKind).toBe('minLength');
      expect(wrapped.validatorParams).toEqual({ minLength: 5 });
    });

    it('when() over an untagged custom validator stays untagged', () => {
      const wrapped = validators.when<{ on: boolean }>(
        (f) => f.on,
        (value: unknown) => (value === 'bad' ? 'Nope' : null)
      );
      expect(wrapped.validatorKind).toBeUndefined();
      expect(wrapped.validatorParams).toBeUndefined();
    });

    it('withKind() wraps — it never mutates the passed closure', () => {
      const shared = (value: unknown) =>
        value === 'bad' ? 'Nope' : null;

      const tagged = withKind(shared, 'custom');

      expect(tagged).not.toBe(shared);
      expect(tagged.validatorKind).toBe('custom');
      expect(
        (shared as { validatorKind?: string }).validatorKind
      ).toBeUndefined();

      // Delegation is intact (including the formValues pass-through)
      expect(tagged('bad')).toBe('Nope');
      expect(tagged('ok')).toBeNull();
      const spy = vi.fn().mockReturnValue(null);
      const taggedSpy = withKind(spy, 'k');
      taggedSpy('v', { sibling: 1 });
      expect(spy).toHaveBeenCalledWith('v', { sibling: 1 });
    });
  });

  describe('live validation (validate-on-write)', () => {
    const liveMarker = () =>
      form<TestFormData>({
        initial: defaultFormData,
        validators: {
          name: validators.required('Name required'),
          email: [
            validators.required('Email required'),
            validators.email('Invalid email'),
          ],
        },
      });

    it('should seed validation on init — empty required form is invalid', () => {
      const formSignal = createFormSignal(liveMarker());
      expect(formSignal.valid()).toBe(false);
      expect(formSignal.errors()['name']).toBe('Name required');
      expect(formSignal.errors()['email']).toBe('Email required');
    });

    it('should validate on patch()', () => {
      const formSignal = createFormSignal(liveMarker());
      formSignal.patch({ email: 'mail.com' });
      expect(formSignal.errors()['email']).toBe('Invalid email');
      expect(formSignal.valid()).toBe(false);

      formSignal.patch({ name: 'Alice', email: 'alice@acme.test' });
      expect(formSignal.errors()['email']).toBeNull();
      expect(formSignal.valid()).toBe(true);
    });

    it('should validate on set()', () => {
      const formSignal = createFormSignal(liveMarker());
      formSignal.set({ name: 'Bob', email: 'not-an-email' });
      expect(formSignal.errors()['name']).toBeNull();
      expect(formSignal.errors()['email']).toBe('Invalid email');
    });

    it('should validate on field accessor set/update', () => {
      const formSignal = createFormSignal(liveMarker());
      formSignal.$.email.set('bad');
      expect(formSignal.errors()['email']).toBe('Invalid email');

      formSignal.$.email.update(() => 'good@acme.test');
      expect(formSignal.errors()['email']).toBeNull();
    });

    it('should re-validate on reset() instead of clearing errors', () => {
      const formSignal = createFormSignal(liveMarker());
      formSignal.patch({ name: 'Alice', email: 'alice@acme.test' });
      expect(formSignal.valid()).toBe(true);

      formSignal.reset();
      // Back to empty initial values — required validators fail again
      expect(formSignal.valid()).toBe(false);
      expect(formSignal.errors()['name']).toBe('Name required');
    });

    it('should re-validate and reset touched on clear()', () => {
      const formSignal = createFormSignal(liveMarker());
      formSignal.patch({ name: 'Alice', email: 'alice@acme.test' });
      formSignal.touch('name');

      formSignal.clear();
      expect(formSignal.valid()).toBe(false);
      expect(formSignal.touched()['name']).toBe(false);
    });

    it('should pass form values to validators for cross-field validation', () => {
      interface ShipForm extends Record<string, unknown> {
        shipToOther: boolean;
        otherAddress: string;
      }
      const formSignal = createFormSignal(
        form<ShipForm>({
          initial: { shipToOther: false, otherAddress: '' },
          validators: {
            otherAddress: validators.when<ShipForm>(
              (f) => f.shipToOther,
              validators.required('Address required')
            ),
          },
        })
      );

      // Condition false — no error even though empty
      expect(formSignal.valid()).toBe(true);

      formSignal.patch({ shipToOther: true, otherAddress: '' });
      expect(formSignal.errors()['otherAddress']).toBe('Address required');

      formSignal.patch({ otherAddress: '123 Main St' });
      expect(formSignal.valid()).toBe(true);
    });
  });
});
