import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { form, signalTree } from '@signaltree/core';

import { formBridge } from './form-bridge';

describe('formBridge enhancer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
    });
  });

  describe('basic functionality', () => {
    it('should detect form() markers in the tree', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '', email: '' },
        }),
      }).with(formBridge());

      expect(tree.formBridge.size).toBe(1);
      expect(tree.formBridge.has('profile')).toBe(true);
    });

    it('should create FormGroup for each form() marker', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '', email: '' },
        }),
      }).with(formBridge());

      const bridge = tree.getAngularForm('profile');
      expect(bridge).toBeTruthy();
      expect(bridge?.formGroup).toBeInstanceOf(FormGroup);
    });

    it('should sync initial values to FormGroup', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: 'John', email: 'john@test.com' },
        }),
      }).with(formBridge());

      const bridge = tree.getAngularForm('profile');
      expect(bridge?.formGroup.value).toEqual({
        name: 'John',
        email: 'john@test.com',
      });
    });

    it('should return null for non-existent form paths', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '' },
        }),
      }).with(formBridge());

      expect(tree.getAngularForm('nonexistent')).toBeNull();
    });
  });

  describe('bidirectional sync', () => {
    it('should sync FormGroup changes to form signals', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '', email: '' },
        }),
      }).with(formBridge());

      const bridge = tree.getAngularForm('profile');
      bridge?.formGroup.patchValue({ name: 'Jane' });

      // The form signal should be updated
      expect(tree.$.profile()).toEqual({ name: 'Jane', email: '' });
    });

    it('should provide formControl accessor', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '', email: '' },
        }),
      }).with(formBridge());

      const bridge = tree.getAngularForm('profile');
      const nameControl = bridge?.formControl('name');

      expect(nameControl).toBeTruthy();
      nameControl?.setValue('Test');
      expect(tree.$.profile.$.name()).toBe('Test');
    });
  });

  describe('nested forms', () => {
    it('should detect multiple form() markers', () => {
      const tree = signalTree({
        checkout: {
          shipping: form({
            initial: { address: '', city: '' },
          }),
          payment: form({
            initial: { card: '', cvv: '' },
          }),
        },
      }).with(formBridge());

      expect(tree.formBridge.size).toBe(2);
      expect(tree.formBridge.has('checkout.shipping')).toBe(true);
      expect(tree.formBridge.has('checkout.payment')).toBe(true);
    });

    it('should create separate FormGroups for each form', () => {
      const tree = signalTree({
        checkout: {
          shipping: form({
            initial: { address: '123 Main St' },
          }),
          payment: form({
            initial: { card: '4111' },
          }),
        },
      }).with(formBridge());

      const shippingBridge = tree.getAngularForm('checkout.shipping');
      const paymentBridge = tree.getAngularForm('checkout.payment');

      expect(shippingBridge?.formGroup.value).toEqual({
        address: '123 Main St',
      });
      expect(paymentBridge?.formGroup.value).toEqual({ card: '4111' });
    });
  });

  describe('conditionals', () => {
    it('should disable fields based on conditionals', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '', bio: '', showBio: false },
        }),
      }).with(
        formBridge({
          conditionals: [
            {
              when: (values: any) => values.showBio,
              fields: ['name'], // Disable name when showBio is false
            },
          ],
        })
      );

      const bridge = tree.getAngularForm('profile');
      const nameControl = bridge?.formControl('name');

      // Initially showBio is false, so name should be disabled
      // (The conditional says enable when showBio is true)
      expect(nameControl?.disabled).toBe(true);
    });

    it('should enable fields when condition becomes true', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '', showBio: false },
        }),
      }).with(
        formBridge({
          conditionals: [
            {
              when: (values: any) => values.showBio,
              fields: ['name'],
            },
          ],
        })
      );

      const bridge = tree.getAngularForm('profile');

      // Set showBio to true via FormGroup
      bridge?.formGroup.patchValue({ showBio: true });

      const nameControl = bridge?.formControl('name');
      expect(nameControl?.disabled).toBe(false);
    });
  });

  describe('validation signals', () => {
    it('should provide angularErrors signal', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '' },
        }),
      }).with(formBridge());

      const bridge = tree.getAngularForm('profile');
      expect(bridge?.angularErrors).toBeTruthy();
      expect(typeof bridge?.angularErrors).toBe('function'); // It's a signal
    });

    it('should provide asyncPending signal', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '' },
        }),
      }).with(formBridge());

      const bridge = tree.getAngularForm('profile');
      expect(bridge?.asyncPending).toBeTruthy();
      expect(bridge?.asyncPending()).toBe(false);
    });
  });

  describe('form() marker still works without enhancer', () => {
    it('should work as standalone form without Angular bridge', async () => {
      // This tests that form() is self-sufficient
      const tree = signalTree({
        profile: form({
          initial: { name: '', email: '' },
          validators: {
            email: (v) => (String(v).includes('@') ? null : 'Invalid email'),
          },
        }),
      });
      // Note: NOT calling .with(formBridge())

      // form() features should work
      tree.$.profile.$.name.set('John');
      expect(tree.$.profile.$.name()).toBe('John');

      tree.$.profile.$.email.set('invalid');
      await tree.$.profile.validate();
      expect(tree.$.profile.valid()).toBe(false);

      tree.$.profile.$.email.set('john@test.com');
      await tree.$.profile.validate();
      expect(tree.$.profile.valid()).toBe(true);
    });
  });

  describe('attached properties on FormSignal', () => {
    it('should attach formGroup directly to form signal', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '' },
        }),
      }).with(formBridge());

      // The enhancer attaches formGroup directly to the form signal for convenience
      // This is a runtime-attached property, so we need to cast for type checking
      const profileForm = tree.$.profile as typeof tree.$.profile & {
        formGroup: FormGroup;
      };
      expect(profileForm.formGroup).toBeInstanceOf(FormGroup);
    });
  });

  describe('marker validators on the FormGroup', () => {
    it('should mirror form() marker validators onto Angular controls', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: '', email: '' },
          validators: {
            name: (v: unknown) => (v ? null : 'Name required'),
            email: (v: unknown) =>
              String(v).includes('@') ? null : 'Invalid email',
          },
        }),
      }).with(formBridge());

      const bridge = tree.getAngularForm('profile');
      const formGroup = bridge?.formGroup as FormGroup;

      // Empty form: marker validators fail on the controls too
      expect(formGroup.valid).toBe(false);
      expect(formGroup.get('name')?.errors).toEqual({
        signalTree: 'Name required',
      });

      formGroup.patchValue({ name: 'Jane', email: 'jane@test.com' });
      expect(formGroup.valid).toBe(true);

      // formGroup.valid agrees with formSignal.valid()
      expect(tree.$.profile.valid()).toBe(true);

      formGroup.patchValue({ email: 'nope' });
      expect(formGroup.get('email')?.errors).toEqual({
        signalTree: 'Invalid email',
      });
      expect(tree.$.profile.valid()).toBe(false);
    });
  });

  describe('reactive FormSignal -> FormGroup sync', () => {
    it('should propagate signal-side writes to the FormGroup when an injector is available', async () => {
      const tree = TestBed.runInInjectionContext(() =>
        signalTree({
          profile: form({
            initial: { name: '', email: '' },
          }),
        }).with(formBridge())
      );

      const bridge = tree.getAngularForm('profile');

      tree.$.profile.patch({ name: 'From signal' });
      // Effects flush asynchronously
      await TestBed.inject(ApplicationRef).whenStable();

      expect(bridge?.formGroup.get('name')?.value).toBe('From signal');
    });

    it('should still do an initial sync without an injector', () => {
      const tree = signalTree({
        profile: form({
          initial: { name: 'Initial', email: '' },
        }),
      }).with(formBridge());

      const bridge = tree.getAngularForm('profile');
      expect(bridge?.formGroup.get('name')?.value).toBe('Initial');
    });
  });
});
