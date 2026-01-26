/**
 * @signaltree/events
 *
 * Event-driven architecture infrastructure for SignalTree applications.
 * Provides a complete event bus system with validation, subscribers, and real-time sync.
 *
 * ## Subpaths
 *
 * - `@signaltree/events` - Core types, schemas, validation (framework-agnostic)
 * - `@signaltree/events/nestjs` - NestJS integration (EventBusModule, BaseSubscriber)
 * - `@signaltree/events/angular` - Angular integration (WebSocketService)
 * - `@signaltree/events/testing` - Test utilities (MockEventBus, event factories)
 *
 * @example
 * ```typescript
 * // Define your app events
 * import { BaseEvent, createEventSchema, EventPriority } from '@signaltree/events';
 * import { z } from 'zod';
 *
 * // Define event schema with Zod for runtime validation
 * export const TradeProposalCreatedSchema = createEventSchema('TradeProposalCreated', {
 *   tradeId: z.string().uuid(),
 *   initiatorId: z.string().uuid(),
 *   recipientId: z.string().uuid(),
 *   vehicleOfferedId: z.string().uuid(),
 * });
 *
 * export type TradeProposalCreated = z.infer<typeof TradeProposalCreatedSchema>;
 * ```
 *
 * @example
 * ```typescript
 * // NestJS: Set up event bus
 * import { EventBusModule } from '@signaltree/events/nestjs';
 *
 * @Module({
 *   imports: [
 *     EventBusModule.forRoot({
 *       redis: { host: 'localhost', port: 6379 },
 *       queues: ['critical', 'high', 'normal', 'low', 'bulk'],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Types & Interfaces
// ============================================================================

export type {
  BaseEvent,
  EventMetadata,
  EventActor,
  EventPriority,
  EventVersion,
} from './core/types';

export { EVENT_PRIORITIES, DEFAULT_EVENT_VERSION } from './core/types';

// ============================================================================
// Schema & Validation
// ============================================================================

export {
  // Schema creation
  createEventSchema,
  createEventSchemaFromZod,
  BaseEventSchema,
  EventMetadataSchema,
  EventActorSchema,
  EventVersionSchema,
  // Validation
  validateEvent,
  isValidEvent,
  parseEvent,
  EventValidationError,
} from './core/validation';

// ============================================================================
// Event Registry
// ============================================================================

export {
  EventRegistry,
  createEventRegistry,
  type RegisteredEvent,
  type EventRegistryConfig,
  type EventCatalog,
  type EventCatalogEntry,
} from './core/registry';

// ============================================================================
// Event Factory
// ============================================================================

export {
  createEvent,
  createEventFactory,
  generateEventId,
  generateCorrelationId,
  type EventFactory,
  type EventFactoryConfig,
  type CreateEventOptions,
} from './core/factory';

// ============================================================================
// Error Classification (for retry logic)
// ============================================================================

export {
  classifyError,
  isRetryableError,
  createErrorClassifier,
  defaultErrorClassifier,
  DEFAULT_RETRY_CONFIGS,
  type ErrorClassification,
  type RetryConfig,
  type ClassificationResult,
  type ErrorClassifier,
  type ErrorClassifierConfig,
} from './core/error-classification';

// ============================================================================
// Idempotency
// ============================================================================

export {
  InMemoryIdempotencyStore,
  createInMemoryIdempotencyStore,
  generateIdempotencyKey,
  generateCorrelationKey,
  type IdempotencyStore,
  type IdempotencyCheckResult,
  type IdempotencyCheckOptions,
  type ProcessedEventRecord,
  type InMemoryIdempotencyStoreConfig,
} from './core/idempotency';

// ============================================================================
// Re-export Zod for convenience
// ============================================================================

export { z } from 'zod';
