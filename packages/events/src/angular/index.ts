/**
 * @signaltree/events/angular
 *
 * Angular integration for real-time event synchronization.
 * Provides WebSocket service base for SignalTree integration.
 */

// WebSocket Service
export { WebSocketService } from './websocket.service';
export type {
  WebSocketConfig,
  ConnectionState,
  WebSocketMessage,
} from './websocket.service';

// Optimistic Updates
export { OptimisticUpdateManager } from './optimistic-updates';
export type { OptimisticUpdate, UpdateResult } from './optimistic-updates';

// Event Handlers
export { createEventHandler, createTypedHandler } from './handlers';
export type { EventHandler, TypedEventHandler } from './handlers';
