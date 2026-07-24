import { FormArray, FormControl, FormGroup } from '@angular/forms';

import { createFormTree } from './ng-forms';

/**
 * Shape coverage for `createFormTree`'s untested FormArray/nested-object
 * paths: `createAbstractControl` (FormArray for arrays, nested FormGroup for
 * objects), `enhanceArray` (push/removeAt/setAt/insertAt/move/clear on array
 * signals), and `syncFormArrayFromValue` (array-of-objects structural sync).
 *
 * `ng-forms.spec.ts` covers the flat-field case; this file covers nested
 * object, primitive array, array-of-objects, and static-key record shapes —
 * exercising both directions (signal → FormGroup/FormArray, and
 * FormGroup/FormArray → signal).
 */
describe('createFormTree shapes', () => {
  describe('nested object (user.profile.name)', () => {
    interface Data extends Record<string, unknown> {
      user: {
        profile: {
          name: string;
        };
      };
    }

    function build() {
      return createFormTree<Data>({ user: { profile: { name: '' } } });
    }

    it('builds a nested FormGroup structure', () => {
      const form = build();

      expect(form.form.get('user')).toBeInstanceOf(FormGroup);
      expect(form.form.get('user.profile')).toBeInstanceOf(FormGroup);
      expect(form.form.get('user.profile.name')).not.toBeNull();
    });

    it('signal → control: setting the deep field via the signal side updates the control', () => {
      const form = build();

      form.$.user.profile.name.set('Ada');

      expect(form.form.get('user.profile.name')?.value).toBe('Ada');
    });

    it('control → signal: setting the deep field via the FormGroup updates the signal', () => {
      const form = build();

      form.form.get('user.profile.name')?.setValue('Grace');

      expect(form.$.user.profile.name()).toBe('Grace');
    });

    it('stays in sync across repeated round-trips from both sides', () => {
      const form = build();

      form.$.user.profile.name.set('one');
      expect(form.form.get('user.profile.name')?.value).toBe('one');

      form.form.get('user.profile.name')?.setValue('two');
      expect(form.$.user.profile.name()).toBe('two');

      form.$.user.profile.name.set('three');
      expect(form.form.get('user.profile.name')?.value).toBe('three');
    });
  });

  describe('primitive array (tags: string[])', () => {
    interface Data extends Record<string, unknown> {
      tags: string[];
    }

    function build() {
      return createFormTree<Data>({ tags: ['a'] });
    }

    it('builds a FormArray of FormControls', () => {
      const form = build();

      const control = form.form.get('tags');
      expect(control).toBeInstanceOf(FormArray);
      expect((control as FormArray).length).toBe(1);
      expect((control as FormArray).at(0).value).toBe('a');
    });

    it('push on the array signal reflects into the FormArray', () => {
      const form = build();

      (form.$.tags as any).push('b');

      const control = form.form.get('tags') as FormArray;
      expect(control.length).toBe(2);
      expect(control.at(1).value).toBe('b');
    });

    it('setAt on the array signal reflects into the FormArray', () => {
      const form = build();

      (form.$.tags as any).push('b');
      (form.$.tags as any).setAt(0, 'A');

      const control = form.form.get('tags') as FormArray;
      expect(control.at(0).value).toBe('A');
      expect(control.at(1).value).toBe('b');
    });

    it('removeAt on the array signal reflects into the FormArray', () => {
      const form = build();

      (form.$.tags as any).push('b');
      (form.$.tags as any).push('c');
      (form.$.tags as any).removeAt(1);

      const control = form.form.get('tags') as FormArray;
      expect(control.length).toBe(2);
      expect(control.value).toEqual(['a', 'c']);
      expect(form.$.tags()).toEqual(['a', 'c']);
    });

    it('changing the FormArray directly reflects into the array signal', () => {
      const form = build();
      const control = form.form.get('tags') as FormArray;

      control.push(new FormControl('b'));
      expect(form.$.tags()).toEqual(['a', 'b']);

      control.setValue(['x', 'y']);
      expect(form.$.tags()).toEqual(['x', 'y']);
    });
  });

  describe('array of objects (items: [{ id, label }])', () => {
    interface Item extends Record<string, unknown> {
      id: number;
      label: string;
    }
    interface Data extends Record<string, unknown> {
      items: Item[];
    }

    function build() {
      return createFormTree<Data>({ items: [{ id: 1, label: 'a' }] });
    }

    it('builds a FormArray of FormGroups', () => {
      const form = build();

      const control = form.form.get('items');
      expect(control).toBeInstanceOf(FormArray);
      expect((control as FormArray).at(0)).toBeInstanceOf(FormGroup);
      expect(form.form.get('items.0.label')?.value).toBe('a');
    });

    it('push adds a new FormGroup at the new index', () => {
      const form = build();

      (form.$.items as any).push({ id: 2, label: 'b' });

      const control = form.form.get('items') as FormArray;
      expect(control.length).toBe(2);
      expect(control.at(1)).toBeInstanceOf(FormGroup);
      expect(form.form.get('items.1.label')?.value).toBe('b');
    });

    it('setAt (updating an item field via the signal) reflects into the item FormGroup', () => {
      const form = build();

      const current = form.$.items();
      (form.$.items as any).setAt(0, { ...current[0], label: 'updated' });

      expect(form.form.get('items.0.label')?.value).toBe('updated');
      expect(form.form.get('items.0.id')?.value).toBe(1);
    });

    it('removeAt shrinks the FormArray and re-indexes remaining groups', () => {
      const form = build();
      (form.$.items as any).push({ id: 2, label: 'b' });

      (form.$.items as any).removeAt(0);

      const control = form.form.get('items') as FormArray;
      expect(control.length).toBe(1);
      expect(form.form.get('items.0.label')?.value).toBe('b');
      expect(form.$.items()).toEqual([{ id: 2, label: 'b' }]);
    });

    it('editing an item field via the FormGroup control reflects back into the array signal', () => {
      const form = build();

      form.form.get('items.0.label')?.setValue('viaControl');

      expect(form.$.items()).toEqual([{ id: 1, label: 'viaControl' }]);
    });
  });

  describe('record/map with static keys (meta: { k1: string })', () => {
    interface Data extends Record<string, unknown> {
      meta: {
        k1: string;
      };
    }

    function build() {
      return createFormTree<Data>({ meta: { k1: '' } });
    }

    it('builds a nested FormGroup for the record', () => {
      const form = build();

      expect(form.form.get('meta')).toBeInstanceOf(FormGroup);
      expect(form.form.get('meta.k1')).not.toBeNull();
    });

    it('signal → control: setting a key via the signal side updates the control', () => {
      const form = build();

      form.$.meta.k1.set('v1');

      expect(form.form.get('meta.k1')?.value).toBe('v1');
    });

    it('control → signal: setting a key via the FormGroup updates the signal', () => {
      const form = build();

      form.form.get('meta.k1')?.setValue('v2');

      expect(form.$.meta.k1()).toBe('v2');
    });
  });
});
