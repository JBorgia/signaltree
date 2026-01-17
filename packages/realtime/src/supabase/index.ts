/**
 * Supabase Real-time integration for SignalTree.
 *
 * @example
 * ```typescript
 * import { signalTree, entityMap } from '@signaltree/core';
 * import { supabaseRealtime } from '@signaltree/realtime/supabase';
 * import { createClient } from '@supabase/supabase-js';
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 *
 * interface Listing {
 *   id: number;
 *   title: string;
 *   price: number;
 *   status: 'active' | 'sold' | 'draft';
 * }
 *
 * const tree = signalTree({
 *   listings: entityMap<Listing, number>(),
 *   activeListings: entityMap<Listing, number>()
 * })
 * .with(supabaseRealtime(supabase, {
 *   listings: {
 *     table: 'listings',
 *     event: '*'
 *   },
 *   activeListings: {
 *     table: 'listings',
 *     event: '*',
 *     filter: 'status=eq.active'
 *   }
 * }));
 *
 * // Access connection state
 * console.log(tree.realtime.connection.isConnected());
 *
 * // Manually reconnect if needed
 * tree.realtime.reconnect();
 * ```
 *
 * @packageDocumentation
 */

export { supabaseRealtime, createSupabaseAdapter } from './supabase-realtime';
export type {
  SupabaseRealtimeConfig,
  SupabaseSubscriptionConfig,
} from './supabase-realtime';
