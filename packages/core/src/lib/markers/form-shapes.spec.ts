import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import { history } from '../form-history/form-history';
import { form } from './form';

/**
 * Control-SHAPE coverage for the `form()` marker: primitives, nested objects
 * (deep path-aware accessors — regression guard for the v13.0.1 fix where
 * `form.$.a.b` read the root path), arrays (leaf semantics), array-of-objects,
 * and record/map fields — including dirty/history interaction and composition
 * at a branch node. See also signalForm/createFormTree shape specs in ng-forms.
 */

describe('form() marker — control shapes', () => {
  describe('nested objects (deep path-aware accessors)', () => {
    interface Nested extends Record<string, unknown> {
      profile: { name: string; address: { city: string; zip: string } };
    }
    const make = () =>
      signalTree({
        f: form<Nested>({
          initial: {
            profile: {
              name: '',
              address: { city: 'NYC', zip: '10001' },
            },
          },
        }),
      }).$.f;

    it('reads a deep field through the nested path', () => {
      const f = make();
      const city = (
        f.$.profile as unknown as { address: { city: () => string } }
      ).address.city;
      expect(city()).toBe('NYC');
    });

    it('writes a deep field without corrupting shape', () => {
      const f = make();
      (
        f.$.profile as unknown as {
          address: { city: { set: (v: string) => void } };
        }
      ).address.city.set('LA');
      expect(f().profile.address.city).toBe('LA');
      expect(f().profile.address.zip).toBe('10001'); // sibling preserved
      expect(f().profile.name).toBe(''); // parent sibling preserved
      // no stray root-level keys
      expect((f() as Record<string, unknown>)['city']).toBeUndefined();
    });

    it('branch accessor returns the whole nested object', () => {
      const f = make();
      const addr = (
        f.$.profile as unknown as { address: () => Nested['profile']['address'] }
      ).address();
      expect(addr).toEqual({ city: 'NYC', zip: '10001' });
    });

    it('nested change marks the form dirty', () => {
      const f = make();
      expect(f.dirty()).toBe(false);
      (
        f.$.profile as unknown as {
          address: { city: { set: (v: string) => void } };
        }
      ).address.city.set('LA');
      expect(f.dirty()).toBe(true);
    });
  });

  describe('array fields (leaf semantics)', () => {
    interface WithArrays extends Record<string, unknown> {
      tags: string[];
      items: { id: number; label: string }[];
    }
    const make = () =>
      signalTree({
        f: form<WithArrays>({
          initial: { tags: ['a'], items: [{ id: 1, label: 'one' }] },
        }),
      }).$.f;

    it('set replaces the whole primitive array', () => {
      const f = make();
      (f.$.tags as unknown as { set: (v: string[]) => void }).set(['a', 'b', 'c']);
      expect(f().tags).toEqual(['a', 'b', 'c']);
    });

    it('update transforms the array', () => {
      const f = make();
      (
        f.$.tags as unknown as { update: (fn: (c: string[]) => string[]) => void }
      ).update((t) => [...t, 'z']);
      expect(f().tags).toEqual(['a', 'z']);
    });

    it('array of objects set replaces the collection', () => {
      const f = make();
      (
        f.$.items as unknown as {
          set: (v: WithArrays['items']) => void;
        }
      ).set([
        { id: 1, label: 'one' },
        { id: 2, label: 'two' },
      ]);
      expect(f().items).toHaveLength(2);
      expect(f().items[1]).toEqual({ id: 2, label: 'two' });
    });

    it('array change marks dirty', () => {
      const f = make();
      (f.$.tags as unknown as { set: (v: string[]) => void }).set(['x']);
      expect(f.dirty()).toBe(true);
    });
  });

  describe('record / map fields (dynamic string keys)', () => {
    interface WithMap extends Record<string, unknown> {
      meta: Record<string, string>;
    }
    const make = () =>
      signalTree({
        f: form<WithMap>({ initial: { meta: { k1: 'v1' } } }),
      }).$.f;

    it('reads the map through the branch accessor', () => {
      const f = make();
      expect(f().meta).toEqual({ k1: 'v1' });
    });

    it('set replaces the whole map (supported pattern for dynamic keys)', () => {
      const f = make();
      (
        f.$.meta as unknown as { set: (v: Record<string, string>) => void }
      ).set({ k1: 'v1', k2: 'v2', k3: 'v3' });
      expect(f().meta).toEqual({ k1: 'v1', k2: 'v2', k3: 'v3' });
    });

    it('patch merges new keys into the map value', () => {
      const f = make();
      f.patch({ meta: { k1: 'v1', k2: 'v2' } });
      expect(f().meta).toEqual({ k1: 'v1', k2: 'v2' });
    });
  });

  describe('history() across shapes', () => {
    interface Doc extends Record<string, unknown> {
      title: string;
      tags: string[];
      author: { name: string };
    }
    const make = () =>
      signalTree({
        f: form<Doc>({
          initial: { title: '', tags: [], author: { name: '' } },
          history: history<Doc>({ capacity: 20 }),
        }),
      }).$.f;

    it('records + undoes an array change', () => {
      const f = make();
      (f.$.tags as unknown as { set: (v: string[]) => void }).set(['x', 'y']);
      expect(f().tags).toEqual(['x', 'y']);
      f.history?.undo();
      expect(f().tags).toEqual([]);
      f.history?.redo();
      expect(f().tags).toEqual(['x', 'y']);
    });

    it('records + undoes a deep nested change', () => {
      const f = make();
      (
        f.$.author as unknown as { name: { set: (v: string) => void } }
      ).name.set('Ada');
      expect(f().author.name).toBe('Ada');
      f.history?.undo();
      expect(f().author.name).toBe('');
    });
  });

  describe('composition — form() at a branch alongside siblings', () => {
    it('a form marker composes under a nested branch node', () => {
      const tree = signalTree({
        section: {
          count: 0,
          editor: form<{ body: string }>({ initial: { body: '' } }),
        },
      });
      tree.$.section.count.set(3);
      tree.$.section.editor.patch({ body: 'hello' });
      expect(tree.$.section.count()).toBe(3);
      expect(tree.$.section.editor().body).toBe('hello');
    });
  });
});
