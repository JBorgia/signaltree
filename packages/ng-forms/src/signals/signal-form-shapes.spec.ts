import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, signalTree } from '@signaltree/core';

import { signalForm } from './signal-form';

/**
 * Shape coverage for `signalForm()` + the `form()` marker: nested-object and
 * array field shapes bound through Angular Signal Forms' `FieldTree`.
 *
 * `marker-bridge.spec.ts` covers flat fields and validator/error-shape
 * behavior; this file covers:
 *  - nested object fields, both directions (FieldTree ↔ marker deep
 *    accessor `tree.$.f.$.profile.name`, path-aware since the marker's
 *    deep-accessor fix).
 *  - array fields, both directions (FieldTree's whole-array `.value` vs the
 *    marker leaf accessor for the array field).
 */
describe('signalForm shapes', () => {
  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  describe('nested object field (profile.name)', () => {
    interface Data extends Record<string, unknown> {
      profile: {
        name: string;
      };
    }

    function create() {
      const tree = signalTree({
        f: form<Data>({ initial: { profile: { name: '' } } }),
      });
      const injector = TestBed.inject(Injector);
      const fieldTree = signalForm(tree.$.f, { injector });
      return { tree, fieldTree, marker: tree.$.f };
    }

    it('FieldTree exposes a nested sub-field for profile.name', () => {
      const { fieldTree } = create();

      expect(fieldTree.profile.name().value()).toBe('');
    });

    it('FieldTree → marker: editing through the FieldTree updates the marker deep accessor and values', async () => {
      const { fieldTree, marker } = create();

      fieldTree.profile.name().value.set('Alice');
      await stable();

      expect(marker().profile.name).toBe('Alice');
      expect(marker.$.profile.name()).toBe('Alice');
    });

    it('marker → FieldTree: writing through the marker deep accessor updates the FieldTree', async () => {
      const { fieldTree, marker } = create();

      marker.$.profile.name.set('Bob');
      await stable();

      expect(fieldTree.profile.name().value()).toBe('Bob');
      expect(marker().profile.name).toBe('Bob');
    });

    it('marker → FieldTree: patch() at the root also updates the FieldTree', async () => {
      const { fieldTree, marker } = create();

      marker.patch({ profile: { name: 'Carol' } });
      await stable();

      expect(fieldTree.profile.name().value()).toBe('Carol');
    });
  });

  describe('array field (tags: string[])', () => {
    interface Data extends Record<string, unknown> {
      tags: string[];
    }

    function create() {
      const tree = signalTree({
        f: form<Data>({ initial: { tags: ['a'] } }),
      });
      const injector = TestBed.inject(Injector);
      const fieldTree = signalForm(tree.$.f, { injector });
      return { tree, fieldTree, marker: tree.$.f };
    }

    it('FieldTree exposes the array field with its current value', () => {
      const { fieldTree } = create();

      expect(fieldTree.tags().value()).toEqual(['a']);
      expect(fieldTree.tags.length).toBe(1);
    });

    it('FieldTree per-item access reflects individual elements', () => {
      const { fieldTree } = create();

      expect(fieldTree.tags[0]().value()).toBe('a');
    });

    it('FieldTree → marker: setting the whole array through the FieldTree updates the marker leaf accessor', async () => {
      const { fieldTree, marker } = create();

      fieldTree.tags().value.set(['a', 'b']);
      await stable();

      expect(marker.$.tags()).toEqual(['a', 'b']);
      expect(marker().tags).toEqual(['a', 'b']);
    });

    it('marker → FieldTree: setting the array through the marker leaf accessor updates the FieldTree', async () => {
      const { fieldTree, marker } = create();

      marker.$.tags.set(['x', 'y', 'z']);
      await stable();

      expect(fieldTree.tags().value()).toEqual(['x', 'y', 'z']);
      expect(fieldTree.tags.length).toBe(3);
      expect(fieldTree.tags[2]().value()).toBe('z');
    });

    it('marker → FieldTree: patch() at the root also updates the array field', async () => {
      const { fieldTree, marker } = create();

      marker.patch({ tags: ['only'] });
      await stable();

      expect(fieldTree.tags().value()).toEqual(['only']);
    });
  });
});
