import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form as ngForm } from '@angular/forms/signals';
import { form, signalTree, validators } from '@signaltree/core';

import { markerSignalForm } from './marker-bridge';

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

describe('markerSignalForm', () => {
  function create() {
    const tree = buildTree();
    const injector = TestBed.inject(Injector);
    const fieldTree = markerSignalForm(tree.$.onboarding.profile, {
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

    // Empty required fields → invalid with signalTree-kind errors
    expect(fieldTree.name().valid()).toBe(false);
    const errors = fieldTree.name().errors();
    expect(errors.some((e) => e.kind === 'signalTree')).toBe(true);
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
    const fieldTree = markerSignalForm(tree.$.ship, {
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
      markerSignalForm({} as never, { injector: TestBed.inject(Injector) })
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
});
