import { describe, expect, it } from 'vitest';

import { signalTree } from '../signal-tree';
import { stored } from './stored';
import { withWriteContext } from '../write-context';

/**
 * Undoing writes through to storage. Scrubbing a devtools timeline does not.
 *
 * `stored()` persists on every write, so rewinding one rewrites the user's
 * localStorage. That is CORRECT for an undo — the user is undoing the persisted
 * change too — and wrong for a devtools scrub, where they are inspecting
 * history and would be astonished to find their settings rewritten by dragging
 * a slider.
 *
 * The two were indistinguishable because devtools tagged its replays
 * `source: 'time-travel'`, exactly as undo does. It now sends `'devtools'` — a
 * value that was already in the `UpdateMetadata['source']` union and simply
 * unused — so this needed no new mode, no new option, and no new vocabulary.
 */
const fakeStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    adapter: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => map.set(k, v),
      removeItem: (k: string) => map.delete(k),
      key: () => null,
      length: 0,
    } as unknown as Storage,
  };
};

const persisted = (map: Map<string, string>, key: string) =>
  JSON.parse(map.get(key) as string).data;

describe('stored() and replay side effects', () => {
  it('an UNDO writes through — the user is undoing the persisted change', () => {
    const { map, adapter } = fakeStorage();
    const tree = signalTree({
      k: stored('sdi-undo', 'light', { storage: adapter, debounceMs: 0 }),
    });

    tree.$.k.set('dark');
    tree.$.k.flush?.();
    expect(persisted(map, 'sdi-undo')).toBe('dark');

    withWriteContext({ intent: 'system', source: 'time-travel' }, () => {
      tree.$.k.set('light');
    });
    tree.$.k.flush?.();

    expect(persisted(map, 'sdi-undo')).toBe('light');
  });

  it('a DEVTOOLS scrub leaves storage alone', () => {
    const { map, adapter } = fakeStorage();
    const tree = signalTree({
      k: stored('sdi-scrub', 'light', { storage: adapter, debounceMs: 0 }),
    });

    tree.$.k.set('dark');
    tree.$.k.flush?.();

    withWriteContext({ intent: 'system', source: 'devtools' }, () => {
      tree.$.k.set('light');
    });
    tree.$.k.flush?.();

    // Storage untouched...
    expect(persisted(map, 'sdi-scrub')).toBe('dark');
    // ...but the live signal still shows the scrubbed-to state, so devtools
    // displays the right history without side effects.
    expect(tree.$.k()).toBe('light');
  });

  it('an ordinary write persists as usual', () => {
    const { map, adapter } = fakeStorage();
    const tree = signalTree({
      k: stored('sdi-plain', 'light', { storage: adapter, debounceMs: 0 }),
    });

    tree.$.k.set('dark');
    tree.$.k.flush?.();

    expect(persisted(map, 'sdi-plain')).toBe('dark');
  });
});
