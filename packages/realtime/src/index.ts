/**
 * @signaltree/realtime
 *
 * Real-time data synchronization enhancers for SignalTree.
 * Provides seamless integration with Supabase, Firebase, and generic WebSocket.
 *
 * @example
 * ```typescript
 * import { signalTree } from '@signaltree/core';
 * import { supabaseRealtime } from '@signaltree/realtime/supabase';
 * import { createClient } from '@supabase/supabase-js';
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
 *
 * const tree = signalTree({
 *   listings: entityMap<Listing, number>(),
 *   messages: entityMap<Message, string>()
 * })
 * .with(supabaseRealtime(supabase, {
 *   listings: {
 *     table: 'listings',
 *     event: '*',
 *     filter: 'status=eq.active'
 *   },
 *   messages: {
 *     table: 'messages',
 *     event: 'INSERT'
 *   }
 * }));
 *
 * // EntityMaps automatically sync with database!
 * // INSERT -> upsertOne
 * // UPDATE -> upsertOne
 * // DELETE -> removeOne
 * ```
 *
 * @packageDocumentation
 */

// Core types and interfaces
export {
  type RealtimeConfig,
  type RealtimeSubscription,
  type RealtimeEvent,
  type RealtimeEnhancerOptions,
  type ConnectionState,
} from './types';

// Connection state utilities
export { createConnectionState, ConnectionStatus } from './connection-state';

// Generic realtime enhancer (for custom WebSocket implementations)
export { createRealtimeEnhancer } from './create-realtime-enhancer';
