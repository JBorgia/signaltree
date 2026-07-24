import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { disabled, validate } from '@angular/forms/signals';
import { form, history, signalTree } from '@signaltree/core';

import { signalForm } from './signal-form';

interface Profile extends Record<string, unknown> {
  name: string;
  email: string;
}

/**
 * The `schema` option lets a `form()` marker stay the MODEL (and history)
 * source of truth while a rich Angular Signal Forms schema — `disabled`,
 * `validate`, etc., the things a marker's `validators` config can't express —
 * carries the field RULES. This is the shape metadata-driven form builders
 * (which produce a Signal Forms `SchemaFn`, not marker validators) need.
 */
describe('signalForm (marker form) — schema option', () => {
  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  function create() {
    const tree = signalTree({
      // Marker carries ONLY the model + undo/redo — no validators.
      profile: form<Profile>({
        initial: { name: '', email: '' },
        history: history({ capacity: 10 }),
      }),
    });
    const injector = TestBed.inject(Injector);
    const fieldTree = signalForm(tree.$.profile, {
      injector,
      // Rich schema a form() marker cannot hold.
      schema: root => {
        disabled(root.email, () => true);
        validate(root.name, ctx =>
          ctx.value() ? undefined : { kind: 'required', message: 'Name required' },
        );
      },
    });
    return { tree, fieldTree };
  }

  it('applies a caller schema `disabled` rule to the marker-backed FieldTree', () => {
    const { fieldTree } = create();
    expect(fieldTree.email().disabled()).toBe(true);
  });

  it('applies a caller schema `validate` rule, tracking the shared model', async () => {
    const { tree, fieldTree } = create();
    await stable();
    // Empty name → schema validation fails.
    expect(fieldTree.name().valid()).toBe(false);
    tree.$.profile.patch({ name: 'Alice' });
    await stable();
    expect(fieldTree.name().valid()).toBe(true);
  });

  it('history() still drives the FieldTree when a schema is applied', async () => {
    const { tree, fieldTree } = create();
    tree.$.profile.patch({ name: 'Alice' });
    await stable();
    expect(fieldTree.name().value()).toBe('Alice');

    tree.$.profile.history?.undo();
    await stable();
    // Undo reverts the marker's values signal — which IS the FieldTree model.
    expect(fieldTree.name().value()).toBe('');
  });
});
