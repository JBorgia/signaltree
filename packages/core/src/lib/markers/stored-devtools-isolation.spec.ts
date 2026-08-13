import { describe, expect, it } from 'vitest';

import { timeTravel } from '../../enhancers/time-travel/time-travel';
import { getPathNotifier, resetPathNotifier } from '../path-notifier';
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

const versioned = <T,>(value: T) => JSON.stringify({ __v: 1, data: value });

describe('stored() and replay side effects', () => {
  it('set() emits one canonical mutation and persists once with attribution', async () => {
    resetPathNotifier();
    let writes = 0;
    const { map, adapter } = fakeStorage();
    const trackedAdapter: Storage = {
      ...adapter,
      setItem: (k: string, v: string) => {
        writes++;
        adapter.setItem(k, v);
      },
    };
    const notifier = getPathNotifier();
    const seen: Array<{
      path: string;
      ownerPath?: string;
      meta?: Record<string, unknown>;
    }> = [];
    const unsubscribe = notifier.subscribe(
      'k',
      (_value, _prev, path, ownerPath, _source, _subjectIds, _positionIds, meta) => {
        seen.push({
          path,
          ownerPath,
          meta: meta as Record<string, unknown> | undefined,
        });
      }
    );
    const owner = {};
    const tree = signalTree({
      k: stored('sdi-set', 'light', { storage: trackedAdapter, debounceMs: 0 }),
    });

    withWriteContext(
      {
        intent: 'system',
        source: 'serialization',
        transactionId: 7,
        transactionOwner: owner,
      },
      () => {
        tree.$.k.set('dark');
      }
    );
    await Promise.resolve();
    unsubscribe();

    expect(tree.$.k()).toBe('dark');
    expect(persisted(map, 'sdi-set')).toBe('dark');
    expect(writes).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      path: 'k',
      ownerPath: 'k',
      meta: {
        intent: 'system',
        source: 'serialization',
        transactionId: 7,
        transactionOwner: owner,
        mutationIntent: 'replace',
      },
    });
  });

  it('update() emits one canonical mutation and persists once', async () => {
    resetPathNotifier();
    let writes = 0;
    const { map, adapter } = fakeStorage();
    const trackedAdapter: Storage = {
      ...adapter,
      setItem: (k: string, v: string) => {
        writes++;
        adapter.setItem(k, v);
      },
    };
    const notifier = getPathNotifier();
    const seen: string[] = [];
    const unsubscribe = notifier.subscribe('k', () => {
      seen.push('k');
    });
    const tree = signalTree({
      k: stored('sdi-update', 1, { storage: trackedAdapter, debounceMs: 0 }),
    });

    tree.$.k.update((value) => value + 1);
    await Promise.resolve();
    unsubscribe();

    expect(tree.$.k()).toBe(2);
    expect(persisted(map, 'sdi-update')).toBe(2);
    expect(writes).toBe(1);
    expect(seen).toEqual(['k']);
  });

  it('skips envelope allocation for stored writes when nobody is observing', () => {
    resetPathNotifier();
    const { map, adapter } = fakeStorage();
    const notifier = getPathNotifier();
    const tree = signalTree({
      k: stored('sdi-unobserved', 'light', { storage: adapter, debounceMs: 0 }),
    });

    tree.$.k.set('dark');

    expect(notifier.hasPending()).toBe(false);
    expect(persisted(map, 'sdi-unobserved')).toBe('dark');
  });

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

  it('initial storage load does not create an owned history turn', async () => {
    resetPathNotifier();
    const { map, adapter } = fakeStorage();
    map.set('sdi-init', versioned('dark'));
    const tree = signalTree({
      k: stored('sdi-init', 'light', { storage: adapter, debounceMs: 0 }),
    }).with(timeTravel());
    const t = (tree as any).__timeTravel;

    await Promise.resolve();
    await Promise.resolve();

    const indexedTurns = t
      .getTurns()
      .filter((turn: { __positionIds?: number[] }) => (turn.__positionIds?.length ?? 0) > 0);

    expect(tree.$.k()).toBe('dark');
    expect(indexedTurns).toHaveLength(0);
  });

  it('public undo writes through to storage without creating an extra turn', async () => {
    resetPathNotifier();
    const { map, adapter } = fakeStorage();
    const tree = signalTree({
      k: stored('sdi-public-undo', 'light', { storage: adapter, debounceMs: 0 }),
    }).with(timeTravel());
    const t = (tree as any).__timeTravel;

    tree.$.k.set('dark');
    await Promise.resolve();
    await Promise.resolve();
    const turnCountBeforeUndo = t.getTurns().length;

    tree.undo();

    expect(tree.$.k()).toBe('light');
    expect(persisted(map, 'sdi-public-undo')).toBe('light');
    expect(t.getTurns()).toHaveLength(turnCountBeforeUndo);
  });
});
