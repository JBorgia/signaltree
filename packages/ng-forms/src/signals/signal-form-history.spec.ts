import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, history, signalTree } from '@signaltree/core';

import { signalForm } from './signal-form';

interface Profile extends Record<string, unknown> {
  name: string;
  email: string;
}

/**
 * Integration proof for the central claim of the history()-in-core move:
 * undo/redo attached to the form() marker drives a bound signalForm()
 * FieldTree from ONE engine — including edits made THROUGH the FieldTree
 * (which write the shared model signal directly, bypassing the marker's
 * set/patch). See marker-bridge.ts's observing effect.
 */
describe('signalForm + history() integration', () => {
  function create() {
    const tree = signalTree({
      profile: form<Profile>({
        initial: { name: '', email: '' },
        history: history<Profile>({ capacity: 20 }),
      }),
    });
    const injector = TestBed.inject(Injector);
    const fieldTree = signalForm(tree.$.profile, { injector });
    return { tree, fieldTree, profile: tree.$.profile };
  }

  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('undo of a marker-API edit reverts the bound FieldTree', async () => {
    const { fieldTree, profile } = create();
    await stable();

    profile.patch({ name: 'Alice' });
    await stable();
    expect(fieldTree.name().value()).toBe('Alice');

    profile.history?.undo();
    await stable();
    expect(fieldTree.name().value()).toBe('');
    expect(profile().name).toBe('');
  });

  it('records edits made THROUGH the FieldTree, and undoes them', async () => {
    const { fieldTree, profile } = create();
    await stable();

    // Write via the Angular Signal Forms field — bypasses marker set/patch.
    fieldTree.name().value.set('Bob');
    await stable();
    expect(profile().name).toBe('Bob');
    expect(profile.history?.canUndo()).toBe(true);

    profile.history?.undo();
    await stable();
    expect(profile().name).toBe('');
    expect(fieldTree.name().value()).toBe('');
  });

  it('redo re-applies after an undo across the bridge', async () => {
    const { fieldTree, profile } = create();
    await stable();

    fieldTree.name().value.set('Carol');
    await stable();
    profile.history?.undo();
    await stable();
    expect(fieldTree.name().value()).toBe('');

    profile.history?.redo();
    await stable();
    expect(fieldTree.name().value()).toBe('Carol');
    expect(profile().name).toBe('Carol');
  });
});
