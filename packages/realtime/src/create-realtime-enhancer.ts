import { createConnectionState, WritableConnectionState } from './connection-state';
import {
    CleanupFn,
    ConnectionStatus,
    RealtimeConfig,
    RealtimeEnhancerOptions,
    RealtimeEnhancerResult,
    RealtimeEvent,
    RealtimeSubscription,
} from './types';

import type { Enhancer, ISignalTree } from '@signaltree/core';

/**
 * Adapter interface for different real-time backends.
 *
 * Implement this interface to add support for new real-time providers
 * (Supabase, Firebase, custom WebSocket, etc.).
 */
export interface RealtimeAdapter {
  /** Connect to the real-time service */
  connect(): Promise<void>;
  /** Disconnect from the real-time service */
  disconnect(): void;
  /** Subscribe to a table/channel */
  subscribe<T>(
    config: RealtimeSubscription<T>,
    callback: (event: RealtimeEvent<T>) => void
  ): CleanupFn;
  /** Check if currently connected */
  isConnected(): boolean;
  /** Set a callback for connection state changes */
  onConnectionChange(
    callback: (connected: boolean, error?: Error) => void
  ): CleanupFn;
}

/**
 * Creates a generic real-time enhancer that works with any RealtimeAdapter.
 *
 * This is the base enhancer used by provider-specific enhancers like
 * `supabaseRealtime` and `firebaseRealtime`.
 *
 * @param adapter - The real-time adapter implementation
 * @param config - Configuration mapping tree paths to subscriptions
 * @param options - Enhancer options
 * @returns A tree enhancer that syncs entityMaps with real-time data
 *
 * @example
 * ```typescript
 * // Custom WebSocket adapter
 * const myAdapter: RealtimeAdapter = {
 *   connect: async () => { ... },
 *   disconnect: () => { ... },
 *   subscribe: (config, callback) => { ... },
 *   isConnected: () => { ... },
 *   onConnectionChange: (callback) => { ... }
 * };
 *
 * const tree = signalTree({ ... })
 *   .with(createRealtimeEnhancer(myAdapter, config));
 * ```
 */
export function createRealtimeEnhancer<TState extends object>(
  adapter: RealtimeAdapter,
  config: RealtimeConfig<TState>,
  options: RealtimeEnhancerOptions = {}
): Enhancer<{ realtime: RealtimeEnhancerResult }> {
  const {
    autoReconnect = true,
    reconnectDelay = 1000,
    maxReconnectAttempts = 10,
    debug = typeof ngDevMode === 'undefined' || ngDevMode,
  } = options;

  return (tree: ISignalTree<TState>) => {
    const connection = createConnectionState() as WritableConnectionState;
    const subscriptions = new Map<string, CleanupFn>();
    let connectionCleanup: CleanupFn | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isManuallyDisconnected = false;

    const log = (message: string, ...args: unknown[]) => {
      if (debug) {
        console.log(`[SignalTree Realtime] ${message}`, ...args);
      }
    };

    // Handle connection state changes
    const handleConnectionChange = (connected: boolean, error?: Error) => {
      if (connected) {
        connection._setStatus(ConnectionStatus.Connected);
        log('Connected to real-time service');
      } else if (error) {
        connection._setError(error.message);
        log('Connection error:', error.message);

        if (autoReconnect && !isManuallyDisconnected) {
          scheduleReconnect();
        }
      } else {
        connection._setStatus(ConnectionStatus.Disconnected);
        log('Disconnected from real-time service');

        if (autoReconnect && !isManuallyDisconnected) {
          scheduleReconnect();
        }
      }
    };

    // Schedule a reconnection attempt
    const scheduleReconnect = () => {
      const attempts = connection.reconnectAttempts();
      if (attempts >= maxReconnectAttempts) {
        log(`Max reconnect attempts (${maxReconnectAttempts}) reached`);
        connection._setError('Max reconnect attempts reached');
        return;
      }

      const delay = reconnectDelay * Math.pow(2, Math.min(attempts, 5)); // Exponential backoff, capped
      connection._setStatus(ConnectionStatus.Reconnecting);
      connection._incrementReconnectAttempts();

      log(`Scheduling reconnect attempt ${attempts + 1} in ${delay}ms`);

      reconnectTimeout = setTimeout(async () => {
        try {
          await connect();
        } catch {
          // handleConnectionChange will schedule next attempt
        }
      }, delay);
    };

    // Connect to real-time service
    const connect = async () => {
      connection._setStatus(ConnectionStatus.Connecting);
      isManuallyDisconnected = false;

      try {
        // Set up connection state listener
        connectionCleanup = adapter.onConnectionChange(handleConnectionChange);

        await adapter.connect();

        // Subscribe to all configured paths
        for (const [path, subConfig] of Object.entries(config)) {
          if (subConfig) {
            subscribeToPath(path, subConfig as RealtimeSubscription);
          }
        }

        connection._setStatus(ConnectionStatus.Connected);
      } catch (error) {
        connection._setError((error as Error).message);
        throw error;
      }
    };

    // Subscribe to a specific path
    const subscribeToPath = <T>(
      path: string,
      subConfig: RealtimeSubscription<T>
    ): CleanupFn => {
      // Get the entity signal at this path
      const pathParts = path.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let entitySignal: any = tree.$;
      for (const part of pathParts) {
        entitySignal = entitySignal?.[part];
      }

      if (!entitySignal) {
        log(`Warning: No signal found at path "${path}"`);
        return () => {
          /* noop */
        };
      }

      // Check if it's an entityMap
      const hasUpsertOne = typeof entitySignal.upsertOne === 'function';
      const hasRemoveOne = typeof entitySignal.removeOne === 'function';

      if (!hasUpsertOne || !hasRemoveOne) {
        log(
          `Warning: Signal at "${path}" is not an entityMap. Realtime sync requires entityMap.`
        );
        return () => {
          /* noop */
        };
      }

      const selectId =
        subConfig.selectId ??
        ((entity: T) => (entity as { id: string | number }).id);

      const callback = (event: RealtimeEvent<T>) => {
        const entity = subConfig.transform
          ? subConfig.transform(event.new ?? event.old)
          : event.new ?? event.old;

        if (!entity) {
          log(`Warning: Received event without entity data`, event);
          return;
        }

        switch (event.eventType) {
          case 'INSERT':
          case 'UPDATE':
            if (event.new) {
              const transformed = subConfig.transform
                ? subConfig.transform(event.new)
                : event.new;
              entitySignal.upsertOne(transformed, { selectId });
              log(`${event.eventType} on ${path}:`, transformed);
            }
            break;

          case 'DELETE':
            if (event.old) {
              const id = selectId(event.old as T);
              entitySignal.removeOne(id);
              log(`DELETE on ${path}: id=${id}`);
            }
            break;

          default:
            log(`Unknown event type: ${event.eventType}`);
        }
      };

      const cleanup = adapter.subscribe(subConfig, callback);
      subscriptions.set(path, cleanup);

      log(`Subscribed to "${subConfig.table}" for path "${path}"`);

      return cleanup;
    };

    // Disconnect from real-time service
    const disconnect = () => {
      isManuallyDisconnected = true;

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      // Clean up all subscriptions
      for (const cleanup of subscriptions.values()) {
        cleanup();
      }
      subscriptions.clear();

      // Clean up connection listener
      if (connectionCleanup) {
        connectionCleanup();
        connectionCleanup = null;
      }

      adapter.disconnect();
      connection._setStatus(ConnectionStatus.Disconnected);
      log('Disconnected');
    };

    // Manual reconnect
    const reconnect = async () => {
      disconnect();
      connection._resetReconnectAttempts();
      await connect();
    };

    // Dynamic subscription
    const subscribe = <T>(
      path: string,
      subConfig: RealtimeSubscription<T>
    ): CleanupFn => {
      if (!adapter.isConnected()) {
        log(`Warning: Cannot subscribe while disconnected`);
        return () => {
          /* noop */
        };
      }
      return subscribeToPath(path, subConfig);
    };

    // Unsubscribe from a path
    const unsubscribe = (path: string) => {
      const cleanup = subscriptions.get(path);
      if (cleanup) {
        cleanup();
        subscriptions.delete(path);
        log(`Unsubscribed from "${path}"`);
      }
    };

    // Auto-connect on enhancer application
    queueMicrotask(() => {
      connect().catch((error) => {
        log('Initial connection failed:', error);
      });
    });

    // Return enhanced tree with realtime control
    return Object.assign(tree, {
      realtime: {
        connection: {
          status: connection.status,
          error: connection.error,
          isConnected: connection.isConnected,
          lastConnectedAt: connection.lastConnectedAt,
          reconnectAttempts: connection.reconnectAttempts,
        },
        reconnect,
        disconnect,
        subscribe,
        unsubscribe,
      },
    }) as ISignalTree<TState> & { realtime: RealtimeEnhancerResult };
  };
}
