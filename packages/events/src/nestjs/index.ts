/**
 * @signaltree/events/nestjs
 *
 * NestJS integration for event-driven architecture.
 * Provides EventBusModule, BaseSubscriber, and DLQ handling.
 */

// Module
export { EventBusModule, QUEUE_PRESETS } from './event-bus.module';
export type {
  EventBusModuleConfig,
  EventBusModuleAsyncConfig,
  QueueConfig,
  QueuePreset,
  RedisConfig,
} from './event-bus.module';

// Services
export { EventBusService } from './event-bus.service';
export type { PublishOptions, PublishResult, CreateEventServiceOptions } from './event-bus.service';

// Subscribers
export { BaseSubscriber } from './base.subscriber';
export type {
  SubscriberConfig,
  ProcessingResult,
  SubscriberMetrics,
} from './base.subscriber';

// DLQ
export { DlqService } from './dlq.service';
export type { DlqEntry, DlqQueryOptions, DlqStats } from './dlq.service';

// Decorators
export { OnEvent, EVENT_HANDLER_METADATA } from './decorators';

// Tokens
export {
  EVENT_BUS_CONFIG,
  EVENT_REGISTRY,
  IDEMPOTENCY_STORE,
  ERROR_CLASSIFIER,
} from './tokens';
