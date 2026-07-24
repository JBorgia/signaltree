import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  form as ngForm,
  MinValidationError,
  NgValidationError,
  PatternValidationError,
  RequiredValidationError,
} from '@angular/forms/signals';
import { form, signalTree, validators } from '@signaltree/core';
import { schemas } from '@signaltree/schema';
import { z } from 'zod';

import { signalForm } from './signal-form';
import { __resetNativeErrorsAdvisoryForTests } from './marker-bridge';

interface Profile extends Record<string, unknown> {
  name: string;
  email: string;
}

function buildTree() {
  return signalTree({
    onboarding: {
      profile: form<Profile>({
        initial: { name: '', email: '' },
        validators: {
          name: validators.required('Name required'),
          email: [
            validators.required('Email required'),
            validators.email('Invalid email'),
          ],
        },
      }),
    },
  });
}

describe('signalForm (marker form)', () => {
  function create() {
    const tree = buildTree();
    const injector = TestBed.inject(Injector);
    const fieldTree = signalForm(tree.$.onboarding.profile, {
      injector,
    });
    return { tree, fieldTree };
  }

  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('shares the marker values as the FieldTree model (marker → field)', () => {
    const { tree, fieldTree } = create();

    tree.$.onboarding.profile.patch({ name: 'Alice' });
    expect(fieldTree.name().value()).toBe('Alice');
  });

  it('shares the marker values as the FieldTree model (field → marker)', () => {
    const { tree, fieldTree } = create();

    fieldTree.email().value.set('alice@acme.test');
    expect(tree.$.onboarding.profile().email).toBe('alice@acme.test');
  });

  it('runs marker validators as Signal Forms validators', () => {
    const { fieldTree } = create();

    // Empty required fields → invalid, tagged with the validator's own kind
    expect(fieldTree.name().valid()).toBe(false);
    const errors = fieldTree.name().errors();
    expect(errors.some((e) => e.kind === 'required')).toBe(true);
    expect(errors[0].message).toBe('Name required');

    // Email format rule
    fieldTree.email().value.set('mail.com');
    expect(fieldTree.email().valid()).toBe(false);
    expect(fieldTree.email().errors()[0].message).toBe('Invalid email');

    // Fix both → valid
    fieldTree.name().value.set('Alice');
    fieldTree.email().value.set('alice@acme.test');
    expect(fieldTree.name().valid()).toBe(true);
    expect(fieldTree.email().valid()).toBe(true);
  });

  describe('validator identity (kind)', () => {
    it('tags a built-in validator error with its validatorKind, not a generic kind', () => {
      const { fieldTree } = create();

      fieldTree.email().value.set('mail.com');
      const errors = fieldTree.email().errors();

      // validators.email() → kind 'email', not the old generic 'signalTree'
      expect(errors[0].kind).toBe('email');
      expect(errors[0].message).toBe('Invalid email');
    });

    it('falls back to the generic "signalTree" kind for a custom/anonymous validator', () => {
      interface Coupon extends Record<string, unknown> {
        code: string;
      }
      const tree = signalTree({
        checkout: form<Coupon>({
          initial: { code: '' },
          validators: {
            // Plain closure — no validatorKind of its own.
            code: (value: unknown) =>
              value === 'EXPIRED' ? 'Coupon expired' : null,
          },
        }),
      });
      const fieldTree = signalForm(tree.$.checkout, {
        injector: TestBed.inject(Injector),
      });

      fieldTree.code().value.set('EXPIRED');
      const errors = fieldTree.code().errors();

      expect(errors[0].kind).toBe('signalTree');
      expect(errors[0].message).toBe('Coupon expired');
    });

    it('forwards the inner validator kind through validators.when()', () => {
      interface ShipForm extends Record<string, unknown> {
        shipToOther: boolean;
        otherAddress: string;
      }
      const tree = signalTree({
        ship: form<ShipForm>({
          initial: { shipToOther: true, otherAddress: '' },
          validators: {
            otherAddress: validators.when<ShipForm>(
              (f) => f.shipToOther,
              validators.required('Address required')
            ),
          },
        }),
      });
      const fieldTree = signalForm(tree.$.ship, {
        injector: TestBed.inject(Injector),
      });

      // when() has no identity of its own — the wrapped validator's kind
      // ('required') is forwarded instead of the generic fallback.
      const errors = fieldTree.otherAddress().errors();
      expect(errors[0].kind).toBe('required');
      expect(errors[0].message).toBe('Address required');
    });
  });

  describe('nativeErrors: true (branded Angular errors)', () => {
    interface Signup extends Record<string, unknown> {
      username: string;
      age: number;
      slug: string;
    }
    const SLUG = /^[a-z-]+$/;

    function createSignup(nativeErrors: boolean) {
      const tree = signalTree({
        signup: form<Signup>({
          initial: { username: 'ok', age: 30, slug: 'fine' },
          validators: {
            username: validators.required('Name required'),
            age: validators.min(18, 'Too young'),
            slug: validators.pattern(SLUG, 'Lowercase only'),
          },
        }),
      });
      return signalForm(tree.$.signup, {
        injector: TestBed.inject(Injector),
        ...(nativeErrors ? { nativeErrors } : {}),
      });
    }

    it('emits Angular branded errors with typed constraint values', () => {
      const fieldTree = createSignup(true);

      fieldTree.age().value.set(12);
      const [ageError] = fieldTree.age().errors();
      expect(ageError instanceof NgValidationError).toBe(true);
      expect(ageError).toBeInstanceOf(MinValidationError);
      expect((ageError as MinValidationError).min).toBe(18);
      expect(ageError.kind).toBe('min');
      expect(ageError.message).toBe('Too young');

      fieldTree.username().value.set('');
      const [nameError] = fieldTree.username().errors();
      expect(nameError).toBeInstanceOf(RequiredValidationError);
      expect(nameError.message).toBe('Name required');

      fieldTree.slug().value.set('NOPE');
      const [slugError] = fieldTree.slug().errors();
      expect(slugError).toBeInstanceOf(PatternValidationError);
      expect((slugError as PatternValidationError).pattern).toBe(SLUG);
    });

    it('keeps { kind, message } for custom/untagged validators even with nativeErrors', () => {
      interface Coupon extends Record<string, unknown> {
        code: string;
      }
      const tree = signalTree({
        checkout: form<Coupon>({
          initial: { code: 'EXPIRED' },
          validators: {
            code: (value: unknown) =>
              value === 'EXPIRED' ? 'Coupon expired' : null,
          },
        }),
      });
      const fieldTree = signalForm(tree.$.checkout, {
        injector: TestBed.inject(Injector),
        nativeErrors: true,
      });

      const [error] = fieldTree.code().errors();
      expect(error.kind).toBe('signalTree');
      expect(error.message).toBe('Coupon expired');
      expect(error instanceof NgValidationError).toBe(false);
    });

    it('default mode is unchanged: plain objects, not branded instances', () => {
      const fieldTree = createSignup(false);

      fieldTree.age().value.set(12);
      const [ageError] = fieldTree.age().errors();
      expect(ageError.kind).toBe('min');
      expect(ageError.message).toBe('Too young');
      expect(ageError instanceof NgValidationError).toBe(false);
    });
  });

  describe('nativeErrors v13-flip advisory (dev-mode console.info)', () => {
    function bridge(opts: { nativeErrors?: boolean }) {
      const tree = signalTree({
        f: form<{ name: string }>({
          initial: { name: '' },
          validators: { name: validators.required('req') },
        }),
      });
      return signalForm(tree.$.f, {
        injector: TestBed.inject(Injector),
        ...opts,
      });
    }

    it('emits exactly one info notice when nativeErrors is unset (then never again)', () => {
      __resetNativeErrorsAdvisoryForTests();
      const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
      try {
        bridge({}); // unset — should emit
        bridge({}); // unset again — one-time flag suppresses
        const calls = info.mock.calls.filter((c) =>
          String(c[0]).includes('nativeErrors')
        );
        expect(calls.length).toBe(1);
        expect(String(calls[0][0])).toContain('v13');
      } finally {
        info.mockRestore();
      }
    });

    it('never emits when nativeErrors is set explicitly (either value)', () => {
      // Reset so the flag is fresh: if the explicit path did NOT suppress,
      // these calls would emit. Proves suppression is the explicit-set, not a
      // spent one-time flag.
      __resetNativeErrorsAdvisoryForTests();
      const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
      try {
        bridge({ nativeErrors: false });
        bridge({ nativeErrors: true });
        const calls = info.mock.calls.filter((c) =>
          String(c[0]).includes('nativeErrors')
        );
        expect(calls.length).toBe(0);
      } finally {
        info.mockRestore();
      }
    });
  });

  describe('single async authority (v12): fail closed', () => {
    it('does not throw for a marker without asyncValidators', () => {
      expect(() => create()).not.toThrow();
    });

    it('throws [ST2005] when the bridged marker has asyncValidators', () => {
      const makeTree = () =>
        signalTree({
          profile: form<Profile>({
            initial: { name: '', email: '' },
            validators: { name: validators.required('Name required') },
            asyncValidators: {
              email: async () => null,
            },
          }),
        });

      expect(() =>
        signalForm(makeTree().$.profile, {
          injector: TestBed.inject(Injector),
        })
      ).toThrow(/\[ST2005\]/);

      // And it names how to resolve (pick one authority).
      expect(() =>
        signalForm(makeTree().$.profile, {
          injector: TestBed.inject(Injector),
        })
      ).toThrow(/validateAsync/);
    });
  });

  it('keeps the marker errors()/valid() live for FieldTree-side writes', async () => {
    const { tree, fieldTree } = create();

    fieldTree.name().value.set('Alice');
    fieldTree.email().value.set('alice@acme.test');
    await stable();

    expect(tree.$.onboarding.profile.valid()).toBe(true);

    fieldTree.email().value.set('broken');
    await stable();

    expect(tree.$.onboarding.profile.valid()).toBe(false);
    expect(tree.$.onboarding.profile.errors()['email']).toBe('Invalid email');
  });

  it('re-runs cross-field validators when sibling fields change', () => {
    interface ShipForm extends Record<string, unknown> {
      shipToOther: boolean;
      otherAddress: string;
    }
    const tree = signalTree({
      ship: form<ShipForm>({
        initial: { shipToOther: false, otherAddress: '' },
        validators: {
          otherAddress: validators.when<ShipForm>(
            (f) => f.shipToOther,
            validators.required('Address required')
          ),
        },
      }),
    });
    const fieldTree = signalForm(tree.$.ship, {
      injector: TestBed.inject(Injector),
    });

    // Condition off — empty address is fine
    expect(fieldTree.otherAddress().valid()).toBe(true);

    // Toggling the SIBLING field re-runs the address validator
    fieldTree.shipToOther().value.set(true);
    expect(fieldTree.otherAddress().valid()).toBe(false);
    expect(fieldTree.otherAddress().errors()[0].message).toBe(
      'Address required'
    );
  });

  it('throws a helpful error for non-marker inputs', () => {
    expect(() =>
      signalForm({} as never, { injector: TestBed.inject(Injector) })
    ).toThrow(/form\(\) marker/);
  });

  it('interops with Angular form() ergonomics (model sharing sanity)', () => {
    // Sanity check that the same model powers a hand-rolled ngForm too —
    // guards against the marker model diverging from a plain WritableSignal.
    const tree = buildTree();
    const internals = tree.$.onboarding.profile as unknown as {
      __model: Parameters<typeof ngForm<Profile>>[0];
    };
    const injector = TestBed.inject(Injector);
    const plain = TestBed.runInInjectionContext(() =>
      ngForm<Profile>(internals.__model)
    );
    void injector;

    tree.$.onboarding.profile.patch({ name: 'Zed' });
    expect(plain.name().value()).toBe('Zed');
  });

  describe('overload resolution', () => {
    it('marker call shape — signalForm(marker, opts) — produces a working FieldTree', () => {
      const tree = buildTree();
      const fieldTree = signalForm(tree.$.onboarding.profile, {
        injector: TestBed.inject(Injector),
      });

      // Marker path taken: marker validators run as Signal Forms validators
      expect(fieldTree.name().valid()).toBe(false);
      expect(fieldTree.name().errors()[0].kind).toBe('required');

      // Shared model both directions
      fieldTree.name().value.set('Ada');
      expect(tree.$.onboarding.profile().name).toBe('Ada');
      tree.$.onboarding.profile.patch({ email: 'ada@acme.test' });
      expect(fieldTree.email().value()).toBe('ada@acme.test');
    });

    it('schema call shape — signalForm(tree, rootPath, subtree) — produces a working FieldTree', async () => {
      interface Account {
        username: string;
        age: number;
      }
      const tree = signalTree({
        account: { username: '', age: 0 } as Account,
      }).with(
        schemas({
          schemas: {
            'account.username': z.string().min(3, 'Too short'),
          },
        })
      );

      const fieldTree = TestBed.runInInjectionContext(() =>
        signalForm<Account>(tree, 'account', tree.$.account)
      );

      // Schema path taken: FieldTree is bound to the SignalTree subtree
      fieldTree.username().value.set('ada');
      expect(tree.$.account.username()).toBe('ada');
      tree.$.account.username.set('grace');
      await stable();
      expect(fieldTree.username().value()).toBe('grace');
    });
  });
});
