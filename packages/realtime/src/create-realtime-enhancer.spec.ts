import { entityMap, signalTree } from '@signaltree/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRealtimeEnhancer, RealtimeAdapter } from './create-realtime-enhancer';
import { CleanupFn, ConnectionStatus, RealtimeEvent, RealtimeSubscription } from './types';

interface TestEntity {
  id: number;
  name: string;
  status: string;
}

/**
 * Creates a tree with markers materialized before applying the enhancer.
 * This is necessary because the realtime enhancer's connect() runs in a microtask
 * and receives the inner tree directly without lazy finalization.
 */
function createTreeWithMaterializedMarkers<T extends object>(initialState: T) {
  const tree = signalTree(initialState);
  // Access $ to trigger marker materialization via lazy finalize()
  void tree.$;
  return tree;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEnhancer = (tree: any) => any;

/**
 * Creates a mock adapter for testing.
 */
function createMockAdapter(
  options: {
    connectDelay?: number;
    shouldFailConnect?: boolean;
    initialConnected?: boolean;
  } = {}
): RealtimeAdapter & {
  triggerConnectionChange: (connected: boolean, error?: Error) => void;
  triggerEvent: <T>(table: string, event: RealtimeEvent<T>) => void;
  callbacks: Map<string, ((event: RealtimeEvent<unknown>) => void)[]>;
  connectionCallback: ((connected: boolean, error?: Error) => void) | null;
} {
  const callbacks = new Map<
    string,
    ((event: RealtimeEvent<unknown>) => void)[]
  >();
  let connectionCallback: ((connected: boolean, error?: Error) => void) | null =
    null;
  let connected = options.initialConnected ?? false;

  const adapter = {
    callbacks,
    connectionCallback: null as
      | ((connected: boolean, error?: Error) => void)
      | null,

    async connect() {
      if (options.connectDelay) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.connectDelay)
        );
      }
      if (options.shouldFailConnect) {
        throw new Error('Connection failed');
      }
      connected = true;
      connectionCallback?.(true);
    },

    disconnect() {
      connected = false;
      connectionCallback?.(false);
    },

    subscribe<T>(
      config: RealtimeSubscription<T>,
      callback: (event: RealtimeEvent<T>) => void
    ): CleanupFn {
      const key = config.table;
      if (!callbacks.has(key)) {
        callbacks.set(key, []);
      }
      callbacks
        .get(key)!
        .push(callback as (event: RealtimeEvent<unknown>) => void);

      return () => {
        const cbs = callbacks.get(key);
        if (cbs) {
          const index = cbs.indexOf(
            callback as (event: RealtimeEvent<unknown>) => void
          );
          if (index > -1) {
            cbs.splice(index, 1);
          }
        }
      };
    },

    isConnected() {
      return connected;
    },

    onConnectionChange(
      callback: (connected: boolean, error?: Error) => void
    ): CleanupFn {
      connectionCallback = callback;
      adapter.connectionCallback = callback;
      return () => {
        connectionCallback = null;
        adapter.connectionCallback = null;
      };
    },

    // Test helpers
    triggerConnectionChange(conn: boolean, error?: Error) {
      connected = conn;
      connectionCallback?.(conn, error);
    },

    triggerEvent<T>(table: string, event: RealtimeEvent<T>) {
      const cbs = callbacks.get(table);
      if (cbs) {
        for (const cb of cbs) {
          cb(event as RealtimeEvent<unknown>);
        }
      }
    },
  };

  return adapter;
}

describe('createRealtimeEnhancer()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enhancer creation', () => {
    it('should create an enhancer function', () => {
      const adapter = createMockAdapter();
      const enhancer = createRealtimeEnhancer(adapter, {});

      expect(typeof enhancer).toBe('function');
    });

    it('should add realtime property to tree', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(adapter, {}, { debug: false }) as AnyEnhancer
      );

      expect(tree.realtime).toBeDefined();
      expect(tree.realtime.connection).toBeDefined();
      expect(typeof tree.realtime.reconnect === 'function').toBe(true);
      expect(typeof tree.realtime.disconnect).toBe('function');
    });
  });

  describe('connection state', () => {
    it('should expose connection status signals', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(adapter, {}, { debug: false }) as AnyEnhancer
      );

      expect(tree.realtime.connection.status()).toBe(
        ConnectionStatus.Disconnected
      );
      expect(tree.realtime.connection.isConnected()).toBe(false);
      expect(tree.realtime.connection.error()).toBe(null);
      expect(tree.realtime.connection.reconnectAttempts()).toBe(0);
    });

    it('should update status when connected', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(adapter, {}, { debug: false }) as AnyEnhancer
      );

      // Initial state
      expect(tree.realtime.connection.status()).toBe(
        ConnectionStatus.Disconnected
      );

      // Let auto-connect happen
      await vi.runAllTimersAsync();

      expect(tree.realtime.connection.status()).toBe(
        ConnectionStatus.Connected
      );
      expect(tree.realtime.connection.isConnected()).toBe(true);
    });

    it('should track lastConnectedAt', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(adapter, {}, { debug: false }) as AnyEnhancer
      );

      expect(tree.realtime.connection.lastConnectedAt()).toBe(null);

      await vi.runAllTimersAsync();

      expect(tree.realtime.connection.lastConnectedAt()).not.toBe(null);
    });
  });

  describe('entity synchronization', () => {
    it('should handle INSERT events', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          { items: { table: 'test_items', event: '*' } },
          { debug: false }
        ) as AnyEnhancer
      );

      await vi.runAllTimersAsync();

      adapter.triggerEvent<TestEntity>('test_items', {
        eventType: 'INSERT',
        new: { id: 1, name: 'Item 1', status: 'active' },
        table: 'test_items',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.items.all().length).toBe(1);
      expect(tree.$.items.byId(1)?.()).toEqual({
        id: 1,
        name: 'Item 1',
        status: 'active',
      });
    });

    it('should handle UPDATE events', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          { items: { table: 'test_items', event: '*' } },
          { debug: false }
        ) as AnyEnhancer
      );

      await vi.runAllTimersAsync();

      // First insert
      adapter.triggerEvent<TestEntity>('test_items', {
        eventType: 'INSERT',
        new: { id: 1, name: 'Item 1', status: 'active' },
        table: 'test_items',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.items.byId(1)?.().name).toBe('Item 1');

      // Then update
      adapter.triggerEvent<TestEntity>('test_items', {
        eventType: 'UPDATE',
        new: { id: 1, name: 'Updated Item', status: 'active' },
        old: { id: 1 } as Partial<TestEntity>,
        table: 'test_items',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.items.byId(1)?.().name).toBe('Updated Item');
    });

    it('should handle DELETE events', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          { items: { table: 'test_items', event: '*' } },
          { debug: false }
        ) as AnyEnhancer
      );

      await vi.runAllTimersAsync();

      // First insert
      adapter.triggerEvent<TestEntity>('test_items', {
        eventType: 'INSERT',
        new: { id: 1, name: 'Item 1', status: 'active' },
        table: 'test_items',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.items.all().length).toBe(1);

      // Then delete
      adapter.triggerEvent<TestEntity>('test_items', {
        eventType: 'DELETE',
        old: { id: 1, name: 'Item 1', status: 'active' },
        table: 'test_items',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.items.all().length).toBe(0);
      expect(tree.$.items.byId(1)).toBeUndefined();
    });

    it('should support custom selectId', async () => {
      interface CustomEntity {
        entityId: string;
        value: number;
      }

      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        custom: entityMap<CustomEntity, string>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          {
            custom: {
              table: 'custom_items',
              event: '*',
              selectId: (e: CustomEntity) => e.entityId,
            },
          },
          { debug: false }
        ) as AnyEnhancer
      );

      await vi.runAllTimersAsync();

      adapter.triggerEvent<CustomEntity>('custom_items', {
        eventType: 'INSERT',
        new: { entityId: 'abc-123', value: 42 },
        table: 'custom_items',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.custom.byId('abc-123')?.()).toEqual({
        entityId: 'abc-123',
        value: 42,
      });
    });

    it('should support transform function', async () => {
      interface DbRow {
        id: number;
        full_name: string;
        is_active: boolean;
      }

      interface AppEntity {
        id: number;
        name: string;
        active: boolean;
      }

      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<AppEntity, number>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          {
            items: {
              table: 'items',
              event: '*',
              transform: (row: DbRow | undefined) =>
                row
                  ? {
                      id: row.id,
                      name: row.full_name,
                      active: row.is_active,
                    }
                  : undefined,
            },
          },
          { debug: false }
        )
      );

      await vi.runAllTimersAsync();

      adapter.triggerEvent<DbRow>('items', {
        eventType: 'INSERT',
        new: { id: 1, full_name: 'John Doe', is_active: true },
        table: 'items',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.items.byId(1)?.()).toEqual({
        id: 1,
        name: 'John Doe',
        active: true,
      });
    });
  });

  describe('disconnect and reconnect', () => {
    it('should disconnect when called', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(adapter, {}, { debug: false }) as AnyEnhancer
      );

      await vi.runAllTimersAsync();
      expect(tree.realtime.connection.isConnected()).toBe(true);

      tree.realtime.disconnect();
      expect(tree.realtime.connection.status()).toBe(
        ConnectionStatus.Disconnected
      );
      expect(tree.realtime.connection.isConnected()).toBe(false);
    });

    it('should reconnect when called', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(adapter, {}, { debug: false }) as AnyEnhancer
      );

      await vi.runAllTimersAsync();

      tree.realtime.disconnect();
      expect(tree.realtime.connection.isConnected()).toBe(false);

      await tree.realtime.reconnect();
      await vi.runAllTimersAsync();

      expect(tree.realtime.connection.isConnected()).toBe(true);
    });
  });

  describe('dynamic subscriptions', () => {
    it('should allow subscribing dynamically', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
        other: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          { items: { table: 'items', event: '*' } },
          { debug: false }
        ) as AnyEnhancer
      );

      await vi.runAllTimersAsync();

      // Dynamically subscribe to 'other'
      tree.realtime.subscribe('other', { table: 'other_items', event: '*' });

      adapter.triggerEvent<TestEntity>('other_items', {
        eventType: 'INSERT',
        new: { id: 1, name: 'Dynamic', status: 'active' },
        table: 'other_items',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.other.byId(1)?.()).toEqual({
        id: 1,
        name: 'Dynamic',
        status: 'active',
      });
    });

    it('should allow unsubscribing', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          { items: { table: 'items', event: '*' } },
          { debug: false }
        ) as AnyEnhancer
      );

      await vi.runAllTimersAsync();

      // Verify subscription works
      adapter.triggerEvent<TestEntity>('items', {
        eventType: 'INSERT',
        new: { id: 1, name: 'First', status: 'active' },
        table: 'items',
        schema: 'public',
        timestamp: new Date(),
      });
      expect(tree.$.items.all().length).toBe(1);

      // Unsubscribe
      tree.realtime.unsubscribe('items');

      // Clear existing items for test
      tree.$.items.removeOne(1);

      // This event should not be received (callback was removed)
      adapter.triggerEvent<TestEntity>('items', {
        eventType: 'INSERT',
        new: { id: 2, name: 'Second', status: 'active' },
        table: 'items',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.items.all().length).toBe(0);
    });
  });

  describe('auto-reconnect', () => {
    it('should auto-reconnect on connection loss when enabled', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          {},
          {
            autoReconnect: true,
            reconnectDelay: 100,
            debug: false,
          }
        )
      );

      await vi.runAllTimersAsync();
      expect(tree.realtime.connection.isConnected()).toBe(true);

      // Simulate connection error
      adapter.triggerConnectionChange(false, new Error('Connection lost'));
      // With autoReconnect, status will quickly transition from ERROR to RECONNECTING
      // so just check we're not connected anymore
      expect(tree.realtime.connection.isConnected()).toBe(false);

      // Wait for reconnect to be scheduled and executed
      await vi.advanceTimersByTimeAsync(200);
      await vi.runAllTimersAsync();

      expect(tree.realtime.connection.isConnected()).toBe(true);
    });

    it('should not auto-reconnect when disabled', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        items: entityMap<TestEntity, number>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          {},
          {
            autoReconnect: false,
            debug: false,
          }
        )
      );

      await vi.runAllTimersAsync();
      expect(tree.realtime.connection.isConnected()).toBe(true);

      // Simulate connection error
      adapter.triggerConnectionChange(false, new Error('Connection lost'));
      expect(tree.realtime.connection.status()).toBe(ConnectionStatus.Error);

      // Wait some time
      await vi.advanceTimersByTimeAsync(5000);

      // Should still be disconnected (no auto-reconnect)
      expect(tree.realtime.connection.isConnected()).toBe(false);
    });
  });

  describe('multiple subscriptions', () => {
    it('should handle multiple entity maps', async () => {
      const adapter = createMockAdapter();
      const tree = createTreeWithMaterializedMarkers({
        users: entityMap<{ id: number; name: string }, number>(),
        products: entityMap<{ id: number; title: string }, number>(),
      }).with(
        createRealtimeEnhancer(
          adapter,
          {
            users: { table: 'users', event: '*' },
            products: { table: 'products', event: '*' },
          },
          { debug: false }
        ) as AnyEnhancer
      );

      await vi.runAllTimersAsync();

      // Insert user
      adapter.triggerEvent('users', {
        eventType: 'INSERT',
        new: { id: 1, name: 'Alice' },
        table: 'users',
        schema: 'public',
        timestamp: new Date(),
      });

      // Insert product
      adapter.triggerEvent('products', {
        eventType: 'INSERT',
        new: { id: 100, title: 'Widget' },
        table: 'products',
        schema: 'public',
        timestamp: new Date(),
      });

      expect(tree.$.users.all().length).toBe(1);
      expect(tree.$.products.all().length).toBe(1);
      expect(tree.$.users.byId(1)?.().name).toBe('Alice');
      expect(tree.$.products.byId(100)?.().title).toBe('Widget');
    });
  });
});
