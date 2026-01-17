import type { Signal } from '@angular/core';

/**
 * Connection status enum for real-time connections.
 */
export enum ConnectionStatus {
  /** Initial state, not yet connected */
  Disconnected = 'DISCONNECTED',
  /** Attempting to connect */
  Connecting = 'CONNECTING',
  /** Successfully connected */
  Connected = 'CONNECTED',
  /** Connection error occurred */
  Error = 'ERROR',
  /** Reconnecting after disconnect */
  Reconnecting = 'RECONNECTING',
}

/**
 * Connection state signal interface.
 */
export interface ConnectionState {
  /** Current connection status */
  status: Signal<ConnectionStatus>;
  /** Error message if status is ERROR */
  error: Signal<string | null>;
  /** Whether currently connected */
  isConnected: Signal<boolean>;
  /** Last successful connection time */
  lastConnectedAt: Signal<Date | null>;
  /** Number of reconnection attempts */
  reconnectAttempts: Signal<number>;
}

/**
 * Event types for real-time subscriptions.
 */
export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/**
 * A real-time event payload.
 */
export interface RealtimeEvent<T = unknown> {
  /** Event type */
  eventType: RealtimeEventType;
  /** The entity data (new for INSERT/UPDATE, old for DELETE) */
  new?: T;
  /** The old entity data (for UPDATE/DELETE) */
  old?: Partial<T>;
  /** Table/collection name */
  table: string;
  /** Schema (database-specific) */
  schema?: string;
  /** Timestamp of the event */
  timestamp?: Date;
}

/**
 * Configuration for a single entity subscription.
 */
export interface RealtimeSubscription<T = unknown> {
  /** Table/collection name to subscribe to */
  table: string;
  /** Event types to listen for */
  event: RealtimeEventType;
  /** Optional filter (e.g., 'status=eq.active' for Supabase) */
  filter?: string;
  /** Schema name (database-specific) */
  schema?: string;
  /** Custom ID selector for the entity */
  selectId?: (entity: T) => string | number;
  /**
   * Transform function to convert database row to entity.
   * Useful for snake_case to camelCase conversion.
   */
  transform?: (row: unknown) => T;
}

/**
 * Configuration for the realtime enhancer.
 * Keys are entity paths in the tree (e.g., 'listings', 'messages').
 */
export type RealtimeConfig<TState = unknown> = {
  [K in keyof TState]?: RealtimeSubscription;
};

/**
 * Options for the realtime enhancer.
 */
export interface RealtimeEnhancerOptions {
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Max reconnect attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Log events in dev mode (default: true) */
  debug?: boolean;
}

/**
 * Cleanup function returned by enhancer.
 */
export type CleanupFn = () => void;

/**
 * Result from the realtime enhancer for accessing connection state.
 */
export interface RealtimeEnhancerResult {
  /** Connection state signals */
  connection: ConnectionState;
  /** Manually reconnect */
  reconnect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Subscribe to a specific table dynamically */
  subscribe: <T>(path: string, config: RealtimeSubscription<T>) => CleanupFn;
  /** Unsubscribe from a specific table */
  unsubscribe: (path: string) => void;
}
