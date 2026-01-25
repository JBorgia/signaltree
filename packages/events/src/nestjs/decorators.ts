import 'reflect-metadata';

import { SetMetadata } from '@nestjs/common';

import { EventPriority } from '../core/types';

/**
 * Decorators for event handling
 */
/**
 * Metadata key for event handlers
 */
export const EVENT_HANDLER_METADATA = 'EVENT_HANDLER_METADATA';

/**
 * Event handler metadata
 */
export interface EventHandlerMetadata {
  /** Event type to handle */
  eventType: string;
  /** Queue to listen on (derived from priority if not specified) */
  queue?: string;
  /** Priority level */
  priority?: EventPriority;
  /** Consumer group name */
  consumerGroup?: string;
}

/**
 * Decorator to mark a method as an event handler
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class TradeSubscriber extends BaseSubscriber {
 *   @OnEvent('TradeProposalCreated', { priority: 'high' })
 *   async handleTradeCreated(event: TradeProposalCreated) {
 *     // Handle the event
 *   }
 * }
 * ```
 */
export function OnEvent(
  eventType: string,
  options?: Omit<EventHandlerMetadata, 'eventType'>
): MethodDecorator {
  return SetMetadata(EVENT_HANDLER_METADATA, {
    eventType,
    ...options,
  } as EventHandlerMetadata);
}
