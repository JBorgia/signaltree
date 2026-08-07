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
export {
  OptimisticUpdateManager,
  createOptimisticUpdateManager,
  applyOptimisticEntityChange,
} from './optimistic-updates';
export type {
  OptimisticUpdate,
  UpdateResult,
  EntitySnapshotAccessor,
  EntityOptimisticPatch,
} from './optimistic-updates';

// Event Handlers
export {
  createEventHandler,
  createTypedHandler,
  batchedHandler,
  // Siblings of the three above, in the same module, unexported by oversight.
  composeHandlers,
  conditionalHandler,
  createHandlerRegistry,
  debouncedHandler,
} from './handlers';
export type { EventHandler, TypedEventHandler } from './handlers';

// Entity Events (entityMap batch-op bridge)
export { entityEventHandler } from './entity-events';
export type { EntityEventOp, EntityEventMapping } from './entity-events';
