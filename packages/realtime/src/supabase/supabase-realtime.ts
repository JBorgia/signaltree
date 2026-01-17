import { createRealtimeEnhancer, RealtimeAdapter } from '../create-realtime-enhancer';
import {
    CleanupFn,
    RealtimeEnhancerOptions,
    RealtimeEnhancerResult,
    RealtimeEvent,
    RealtimeEventType,
    RealtimeSubscription,
} from '../types';

import type {
  SupabaseClient,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import type { ISignalTree } from '@signaltree/core';

/**
 * Supabase-specific subscription configuration.
 */
export interface SupabaseSubscriptionConfig<T = unknown>
  extends RealtimeSubscription<T> {
  /** PostgreSQL schema (default: 'public') */
  schema?: string;
}

/**
 * Configuration for Supabase realtime subscriptions.
 */
export type SupabaseRealtimeConfig<TState> = {
  [K in keyof TState]?: SupabaseSubscriptionConfig;
};

/**
 * Converts Supabase event type to our normalized type.
 */
function normalizeEventType(type: string): RealtimeEventType {
  switch (type.toUpperCase()) {
    case 'INSERT':
      return 'INSERT';
    case 'UPDATE':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return '*';
  }
}

/**
 * Creates a Supabase realtime adapter.
 *
 * @param client - Supabase client instance
 * @returns RealtimeAdapter for use with createRealtimeEnhancer
 */
export function createSupabaseAdapter(client: SupabaseClient): RealtimeAdapter {
  let mainChannel: RealtimeChannel | null = null;
  const channels = new Map<string, RealtimeChannel>();
  let connectionCallback: ((connected: boolean, error?: Error) => void) | null =
    null;

  return {
    async connect() {
      // Create a presence channel to track connection state
      mainChannel = client.channel('signaltree-presence');

      mainChannel
        .on('presence', { event: 'sync' }, () => {
          connectionCallback?.(true);
        })
        .subscribe((status: string, err?: Error) => {
          if (status === 'SUBSCRIBED') {
            connectionCallback?.(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            connectionCallback?.(
              false,
              err ?? new Error(`Channel error: ${status}`)
            );
          } else if (status === 'CLOSED') {
            connectionCallback?.(false);
          }
        });
    },

    disconnect() {
      // Unsubscribe from all channels
      for (const channel of channels.values()) {
        client.removeChannel(channel);
      }
      channels.clear();

      if (mainChannel) {
        client.removeChannel(mainChannel);
        mainChannel = null;
      }
    },

    subscribe<T>(
      config: RealtimeSubscription<T>,
      callback: (event: RealtimeEvent<T>) => void
    ): CleanupFn {
      const { table, event, filter, schema = 'public' } = config;

      // Build channel name (unique per subscription)
      const channelName = `signaltree:${schema}:${table}:${filter ?? 'all'}`;

      // Check if we already have this channel
      let channel = channels.get(channelName);
      if (!channel) {
        channel = client.channel(channelName);
        channels.set(channelName, channel);
      }

      // Build the filter config
      const filterConfig: {
        event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
        schema: string;
        table: string;
        filter?: string;
      } = {
        event: event as 'INSERT' | 'UPDATE' | 'DELETE' | '*',
        schema,
        table,
      };

      if (filter) {
        filterConfig.filter = filter;
      }

      // Subscribe to postgres changes
      // Use type assertion to work around strict Supabase generic constraints
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (channel as any).on(
        'postgres_changes',
        filterConfig,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const realtimeEvent: RealtimeEvent<T> = {
            eventType: normalizeEventType(payload.eventType),
            new: payload.new as T | undefined,
            old: payload.old as Partial<T> | undefined,
            table: payload.table,
            schema: payload.schema,
            timestamp: new Date(),
          };

          callback(realtimeEvent);
        }
      );

      // Subscribe to the channel if not already subscribed
      if (channel.state !== 'joined' && channel.state !== 'joining') {
        channel.subscribe();
      }

      // Return cleanup function
      return () => {
        // Note: Supabase doesn't support removing individual listeners,
        // so we just remove the entire channel
        const ch = channels.get(channelName);
        if (ch) {
          client.removeChannel(ch);
          channels.delete(channelName);
        }
      };
    },

    isConnected() {
      return mainChannel?.state === 'joined';
    },

    onConnectionChange(
      callback: (connected: boolean, error?: Error) => void
    ): CleanupFn {
      connectionCallback = callback;
      return () => {
        connectionCallback = null;
      };
    },
  };
}

/**
 * Creates a Supabase realtime enhancer for SignalTree.
 *
 * This enhancer automatically syncs entityMaps in your tree with
 * Supabase Realtime PostgreSQL changes.
 *
 * @param client - Supabase client instance
 * @param config - Configuration mapping tree paths to table subscriptions
 * @param options - Enhancer options (reconnection, logging, etc.)
 * @returns A tree enhancer
 *
 * @example
 * ```typescript
 * import { signalTree, entityMap } from '@signaltree/core';
 * import { supabaseRealtime } from '@signaltree/realtime/supabase';
 * import { createClient } from '@supabase/supabase-js';
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 *
 * // Define your database types
 * interface Listing {
 *   id: number;
 *   title: string;
 *   price: number;
 *   created_at: string;
 * }
 *
 * // Create tree with realtime sync
 * const tree = signalTree({
 *   listings: entityMap<Listing, number>()
 * })
 * .with(supabaseRealtime(supabase, {
 *   listings: {
 *     table: 'listings',
 *     event: '*',  // INSERT, UPDATE, DELETE
 *     // Optional: filter to only active listings
 *     // filter: 'status=eq.active'
 *   }
 * }));
 *
 * // The tree now has realtime property for connection control
 * effect(() => {
 *   if (tree.realtime.connection.isConnected()) {
 *     console.log('Connected to Supabase Realtime!');
 *   }
 * });
 *
 * // EntityMap automatically updates when database changes
 * // No manual refresh needed!
 * ```
 *
 * @example
 * ```typescript
 * // With snake_case to camelCase transformation
 * const tree = signalTree({
 *   listings: entityMap<Listing, number>()
 * })
 * .with(supabaseRealtime(supabase, {
 *   listings: {
 *     table: 'listings',
 *     event: '*',
 *     transform: (row: any) => ({
 *       id: row.id,
 *       title: row.title,
 *       createdAt: new Date(row.created_at),
 *       updatedAt: new Date(row.updated_at)
 *     })
 *   }
 * }));
 * ```
 *
 * @example
 * ```typescript
 * // Multiple tables with different filters
 * const tree = signalTree({
 *   myListings: entityMap<Listing, number>(),
 *   allListings: entityMap<Listing, number>(),
 *   messages: entityMap<Message, string>()
 * })
 * .with(supabaseRealtime(supabase, {
 *   myListings: {
 *     table: 'listings',
 *     event: '*',
 *     filter: `user_id=eq.${currentUserId}`
 *   },
 *   allListings: {
 *     table: 'listings',
 *     event: '*',
 *     filter: 'status=eq.active'
 *   },
 *   messages: {
 *     table: 'messages',
 *     event: 'INSERT',  // Only new messages
 *     filter: `chat_room_id=eq.${roomId}`
 *   }
 * }));
 * ```
 */
export function supabaseRealtime<TConfig extends object>(
  client: SupabaseClient,
  config: SupabaseRealtimeConfig<TConfig>,
  options: RealtimeEnhancerOptions = {}
): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & { realtime: RealtimeEnhancerResult } {
  const adapter = createSupabaseAdapter(client);
  return createRealtimeEnhancer(adapter, config, options);
}
