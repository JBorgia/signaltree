import { describe, expect, it, vi } from 'vitest';

import { BaseEvent } from '../core/types';
import { batchedHandler } from './handlers';
import { entityEventHandler, EntityEventMapping } from './entity-events';

interface Item extends Record<string, unknown> {
  id: string;
  name?: string;
  qty?: number;
  archived?: boolean;
}

interface ItemEvent extends BaseEvent<string, unknown> {
  data: {
    id: string;
    item?: Partial<Item>;
    changes?: Partial<Item>;
  };
}

function makeEvent(
  type: string,
  data: ItemEvent['data']
): ItemEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    type,
    version: { major: 1, minor: 0 },
    timestamp: new Date().toISOString(),
    correlationId: 'corr-1',
    actor: { id: 'system', type: 'system' },
    metadata: { source: 'test', environment: 'test' },
    data,
  };
}

/**
 * A minimal, spyable stand-in for a `@signaltree/core` `EntitySignal<Item>`.
 * Backed by a real Map so `.map()` reflects live state, satisfying the
 * structural surface entityEventHandler needs (upsertMany/updateMany/
 * removeMany + a callable `.map()`).
 */
function createFakeEntities() {
  const store = new Map<string, Item>();

  const upsertMany = vi.fn((entities: Item[]) => {
    const ids: string[] = [];
    for (const entity of entities) {
      const existing = store.get(entity.id);
      store.set(entity.id, existing ? { ...existing, ...entity } : entity);
      ids.push(entity.id);
    }
    return ids;
  });

  const updateMany = vi.fn((ids: string[], changes: Partial<Item>) => {
    for (const id of ids) {
      const existing = store.get(id);
      if (!existing) {
        throw new Error(`Entity with id ${id} not found`);
      }
      store.set(id, { ...existing, ...changes });
    }
  });

  const removeMany = vi.fn((ids: string[]) => {
    for (const id of ids) {
      if (!store.has(id)) {
        throw new Error(`Entity with id ${id} not found`);
      }
      store.delete(id);
    }
  });

  const map = () => store;

  return {
    store,
    upsertMany,
    updateMany,
    removeMany,
    map,
  } as unknown as {
    store: Map<string, Item>;
    upsertMany: typeof upsertMany;
    updateMany: typeof updateMany;
    removeMany: typeof removeMany;
    map: () => ReadonlyMap<string, Item>;
  };
}

const mapping: EntityEventMapping<Item, string, ItemEvent> = {
  match: (e) => {
    if (e.type === 'ItemCreated') return 'upsert';
    if (e.type === 'ItemChanged') return 'update';
    if (e.type === 'ItemDeleted') return 'remove';
    return null;
  },
  upsert: (e) => e.data.item as Item | undefined,
  update: (e) =>
    e.data.changes ? { id: e.data.id, changes: e.data.changes } : undefined,
  remove: (e) => e.data.id,
};

describe('entityEventHandler', () => {
  it('coalesces a burst of upsert events into a single upsertMany call', () => {
    const entities = createFakeEntities();
    const flush = entityEventHandler(entities as never, mapping);

    flush([
      makeEvent('ItemCreated', { id: '1', item: { id: '1', name: 'a' } }),
      makeEvent('ItemCreated', { id: '2', item: { id: '2', name: 'b' } }),
      makeEvent('ItemCreated', { id: '3', item: { id: '3', name: 'c' } }),
    ]);

    expect(entities.upsertMany).toHaveBeenCalledTimes(1);
    expect(entities.updateMany).not.toHaveBeenCalled();
    expect(entities.removeMany).not.toHaveBeenCalled();
    expect(entities.store.size).toBe(3);
    expect(entities.store.get('2')).toEqual({ id: '2', name: 'b' });
  });

  it('folds multiple upserts to the same id in arrival order (later fields win)', () => {
    const entities = createFakeEntities();
    const flush = entityEventHandler(entities as never, mapping);

    flush([
      makeEvent('ItemCreated', {
        id: '1',
        item: { id: '1', name: 'first', qty: 1 },
      }),
      makeEvent('ItemCreated', { id: '1', item: { id: '1', qty: 2 } }),
    ]);

    expect(entities.upsertMany).toHaveBeenCalledTimes(1);
    expect(entities.upsertMany).toHaveBeenCalledWith(
      [{ id: '1', name: 'first', qty: 2 }],
      expect.anything()
    );
    expect(entities.store.get('1')).toEqual({
      id: '1',
      name: 'first',
      qty: 2,
    });
  });

  it('collapses update events sharing an identical delta into one updateMany call', () => {
    const entities = createFakeEntities();
    entities.store.set('1', { id: '1', name: 'a' });
    entities.store.set('2', { id: '2', name: 'b' });
    entities.store.set('3', { id: '3', name: 'c' });
    const flush = entityEventHandler(entities as never, mapping);

    flush([
      makeEvent('ItemChanged', { id: '1', changes: { archived: true } }),
      makeEvent('ItemChanged', { id: '2', changes: { archived: true } }),
      makeEvent('ItemChanged', { id: '3', changes: { archived: true } }),
    ]);

    expect(entities.updateMany).toHaveBeenCalledTimes(1);
    expect(entities.updateMany).toHaveBeenCalledWith(
      expect.arrayContaining(['1', '2', '3']),
      { archived: true }
    );
    expect(entities.store.get('1')?.archived).toBe(true);
    expect(entities.store.get('3')?.archived).toBe(true);
  });

  it('issues one updateMany call per distinct delta shape', () => {
    const entities = createFakeEntities();
    entities.store.set('1', { id: '1', name: 'a' });
    entities.store.set('2', { id: '2', name: 'b' });
    const flush = entityEventHandler(entities as never, mapping);

    flush([
      makeEvent('ItemChanged', { id: '1', changes: { qty: 5 } }),
      makeEvent('ItemChanged', { id: '2', changes: { qty: 9 } }),
    ]);

    expect(entities.updateMany).toHaveBeenCalledTimes(2);
    expect(entities.store.get('1')?.qty).toBe(5);
    expect(entities.store.get('2')?.qty).toBe(9);
  });

  it('lets removal win over create+update for the same id within one batch', () => {
    const entities = createFakeEntities();
    const flush = entityEventHandler(entities as never, mapping);

    flush([
      makeEvent('ItemCreated', { id: '1', item: { id: '1', name: 'a' } }),
      makeEvent('ItemChanged', { id: '1', changes: { qty: 1 } }),
      makeEvent('ItemDeleted', { id: '1' }),
      // An unrelated id in the same batch still upserts normally.
      makeEvent('ItemCreated', { id: '2', item: { id: '2', name: 'b' } }),
    ]);

    // id '1' was folded out of the upsert pass entirely (removal won), so
    // only id '2' reaches upsertMany.
    expect(entities.upsertMany).toHaveBeenCalledTimes(1);
    expect(entities.upsertMany).toHaveBeenCalledWith(
      [{ id: '2', name: 'b' }],
      expect.anything()
    );
    expect(entities.updateMany).not.toHaveBeenCalled();
    expect(entities.removeMany).not.toHaveBeenCalled(); // never existed -> dropped defensively
    expect(entities.store.has('1')).toBe(false);
    expect(entities.store.has('2')).toBe(true);
  });

  it('removes an id that existed before the batch when created-then-deleted nets to removed', () => {
    const entities = createFakeEntities();
    entities.store.set('1', { id: '1', name: 'pre-existing' });
    const flush = entityEventHandler(entities as never, mapping);

    flush([
      makeEvent('ItemChanged', { id: '1', changes: { qty: 1 } }),
      makeEvent('ItemDeleted', { id: '1' }),
    ]);

    expect(entities.updateMany).not.toHaveBeenCalled();
    expect(entities.removeMany).toHaveBeenCalledTimes(1);
    expect(entities.removeMany).toHaveBeenCalledWith(['1']);
    expect(entities.store.has('1')).toBe(false);
  });

  it('silently drops remove events for ids that no longer exist instead of throwing', () => {
    const entities = createFakeEntities();
    const flush = entityEventHandler(entities as never, mapping);

    expect(() =>
      flush([makeEvent('ItemDeleted', { id: 'never-existed' })])
    ).not.toThrow();

    expect(entities.removeMany).not.toHaveBeenCalled();
  });

  it('ignores events that match to no op', () => {
    const entities = createFakeEntities();
    const flush = entityEventHandler(entities as never, mapping);

    flush([makeEvent('SomeUnrelatedEvent', { id: '1' })]);

    expect(entities.upsertMany).not.toHaveBeenCalled();
    expect(entities.updateMany).not.toHaveBeenCalled();
    expect(entities.removeMany).not.toHaveBeenCalled();
  });

  it('is a no-op for an empty batch', () => {
    const entities = createFakeEntities();
    const flush = entityEventHandler(entities as never, mapping);

    flush([]);

    expect(entities.upsertMany).not.toHaveBeenCalled();
    expect(entities.updateMany).not.toHaveBeenCalled();
    expect(entities.removeMany).not.toHaveBeenCalled();
  });

  it('composes with batchedHandler so a debounced burst flushes exactly once', async () => {
    vi.useFakeTimers();
    try {
      const entities = createFakeEntities();
      const flush = entityEventHandler(entities as never, mapping);
      const onEvent = batchedHandler(flush, 50, 100);

      for (let i = 0; i < 10; i++) {
        onEvent(
          makeEvent('ItemCreated', {
            id: String(i),
            item: { id: String(i), name: `item-${i}` },
          })
        );
      }

      expect(entities.upsertMany).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60);

      expect(entities.upsertMany).toHaveBeenCalledTimes(1);
      expect(entities.store.size).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });
});
