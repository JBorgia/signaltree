import { BaseEvent } from '../core/types';

/**
 * Event Handlers - Utilities for handling events in Angular
 *
 * Provides:
 * - Type-safe event handlers
 * - Handler composition
 * - Store integration helpers
 */
/**
 * Event handler function type
 */
export type EventHandler<T extends BaseEvent = BaseEvent> = (
  event: T
) => void | Promise<void>;

/**
 * Typed event handler with metadata
 */
export interface TypedEventHandler<T extends BaseEvent = BaseEvent> {
  /** Event type this handler processes */
  eventType: T['type'];
  /** Handler function */
  handle: EventHandler<T>;
  /** Optional priority (lower = higher priority) */
  priority?: number;
}

/**
 * Create a simple event handler
 *
 * @example
 * ```typescript
 * const handler = createEventHandler<TradeProposalCreated>(event => {
 *   store.$.trades.entities.upsertOne(event.data);
 * });
 * ```
 */
export function createEventHandler<T extends BaseEvent>(
  handler: EventHandler<T>
): EventHandler<T> {
  return handler;
}

/**
 * Create a typed event handler with metadata
 *
 * @example
 * ```typescript
 * const handler = createTypedHandler('TradeProposalCreated', {
 *   handle: (event) => {
 *     store.$.trades.entities.upsertOne(event.data);
 *   },
 *   priority: 1,
 * });
 * ```
 */
export function createTypedHandler<T extends BaseEvent>(
  eventType: T['type'],
  options: {
    handle: EventHandler<T>;
    priority?: number;
  }
): TypedEventHandler<T> {
  return {
    eventType,
    handle: options.handle,
    priority: options.priority ?? 10,
  };
}

/**
 * Create a handler registry for managing multiple handlers
 *
 * @example
 * ```typescript
 * const registry = createHandlerRegistry();
 *
 * registry.register('TradeProposalCreated', (event) => {
 *   store.$.trades.entities.upsertOne(event.data);
 * });
 *
 * registry.register('TradeAccepted', (event) => {
 *   store.$.trades.entities.update(event.data.tradeId, { status: 'accepted' });
 * });
 *
 * // In WebSocket service
 * protected onEventReceived(event: BaseEvent): void {
 *   registry.dispatch(event);
 * }
 * ```
 */
export function createHandlerRegistry(): {
  register: <T extends BaseEvent>(
    eventType: T['type'],
    handler: EventHandler<T>
  ) => void;
  unregister: (eventType: string, handler?: EventHandler) => void;
  dispatch: (event: BaseEvent) => Promise<void>;
  getHandlers: (eventType: string) => EventHandler[];
  clear: () => void;
} {
  const handlers = new Map<string, EventHandler[]>();

  return {
    register<T extends BaseEvent>(
      eventType: T['type'],
      handler: EventHandler<T>
    ): void {
      const existing = handlers.get(eventType) ?? [];
      handlers.set(eventType, [...existing, handler as EventHandler]);
    },

    unregister(eventType: string, handler?: EventHandler): void {
      if (!handler) {
        handlers.delete(eventType);
        return;
      }

      const existing = handlers.get(eventType);
      if (existing) {
        handlers.set(
          eventType,
          existing.filter((h) => h !== handler)
        );
      }
    },

    async dispatch(event: BaseEvent): Promise<void> {
      const eventHandlers = handlers.get(event.type) ?? [];

      for (const handler of eventHandlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error(`Error in handler for ${event.type}:`, error);
        }
      }
    },

    getHandlers(eventType: string): EventHandler[] {
      return handlers.get(eventType) ?? [];
    },

    clear(): void {
      handlers.clear();
    },
  };
}

/**
 * Compose multiple handlers into one
 *
 * @example
 * ```typescript
 * const composedHandler = composeHandlers(
 *   logHandler,
 *   metricsHandler,
 *   storeHandler,
 * );
 * ```
 */
export function composeHandlers<T extends BaseEvent>(
  ...handlers: EventHandler<T>[]
): EventHandler<T> {
  return async (event: T) => {
    for (const handler of handlers) {
      await handler(event);
    }
  };
}

/**
 * Create a conditional handler that only runs if predicate is true
 *
 * @example
 * ```typescript
 * const handler = conditionalHandler(
 *   (event) => event.data.status === 'pending',
 *   (event) => processPendingTrade(event),
 * );
 * ```
 */
export function conditionalHandler<T extends BaseEvent>(
  predicate: (event: T) => boolean,
  handler: EventHandler<T>
): EventHandler<T> {
  return async (event: T) => {
    if (predicate(event)) {
      await handler(event);
    }
  };
}

/**
 * Create a handler that debounces rapid events
 *
 * @example
 * ```typescript
 * const handler = debouncedHandler(
 *   (event) => updateUI(event),
 *   100, // 100ms debounce
 * );
 * ```
 */
export function debouncedHandler<T extends BaseEvent>(
  handler: EventHandler<T>,
  delayMs: number
): EventHandler<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pendingEvent: T | null = null;

  return (event: T) => {
    pendingEvent = event;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      if (pendingEvent) {
        handler(pendingEvent);
        pendingEvent = null;
      }
      timeout = null;
    }, delayMs);
  };
}

/**
 * Create a handler that batches events and processes them together
 *
 * @example
 * ```typescript
 * const handler = batchedHandler(
 *   (events) => {
 *     store.$.trades.entities.upsertMany(events.map(e => e.data));
 *   },
 *   50, // Process batch every 50ms
 *   100, // Or when batch reaches 100 events
 * );
 * ```
 */
export function batchedHandler<T extends BaseEvent>(
  handler: (events: T[]) => void | Promise<void>,
  flushIntervalMs: number,
  maxBatchSize = 100
): EventHandler<T> {
  let batch: T[] = [];
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (batch.length === 0) return;

    const toProcess = batch;
    batch = [];

    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    await handler(toProcess);
  };

  return async (event: T) => {
    batch.push(event);

    if (batch.length >= maxBatchSize) {
      await flush();
    } else if (!timeout) {
      timeout = setTimeout(flush, flushIntervalMs);
    }
  };
}
