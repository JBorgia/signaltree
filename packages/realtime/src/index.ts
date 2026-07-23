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

// Generic realtime enhancer (for custom WebSocket implementations).
// `realtime()` is the canonical name (noun-form, like every other enhancer);
// `createRealtimeEnhancer` remains as a deprecated alias until the next major.
export {
  realtime,
  type RealtimeAdapter,
} from './create-realtime-enhancer';

import { realtime as realtimeImpl } from './create-realtime-enhancer';
import type { RealtimeAdapter as RTAdapter } from './create-realtime-enhancer';
import type {
  RealtimeConfig,
  RealtimeEnhancerOptions,
  RealtimeEnhancerResult,
} from './types';
import type { ISignalTree } from '@signaltree/core';

declare const ngDevMode: boolean | undefined;
let warnedCreateRealtimeEnhancer = false;

/**
 * @deprecated Renamed to {@link realtime} — every other SignalTree enhancer is
 * a plain noun (`persistence()`, `guardrails()`, …), and this was the one
 * `create*` outlier. Same signature, same behavior. Removal in the next major.
 * (Lives in the barrel, not the impl module: rollup's per-module tree-shaking
 * dropped the alias when it lived beside `realtime()`, breaking the built
 * barrel — caught by tools/verify-built-barrels.mjs.)
 */
export function createRealtimeEnhancer<TConfig extends object>(
  adapter: RTAdapter,
  config: RealtimeConfig<TConfig>,
  options: RealtimeEnhancerOptions = {}
): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & { realtime: RealtimeEnhancerResult } {
  if (
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    !warnedCreateRealtimeEnhancer
  ) {
    warnedCreateRealtimeEnhancer = true;
    console.warn(
      '[SignalTree] realtime: createRealtimeEnhancer is deprecated — use ' +
        'realtime(adapter, config, options) (same signature).'
    );
  }
  return realtimeImpl(adapter, config, options);
}
