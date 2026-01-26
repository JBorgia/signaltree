import { generateCorrelationId, generateEventId } from '../core/factory';
import { BaseEvent, DEFAULT_EVENT_VERSION, EventActor, EventMetadata, EventPriority, EventVersion } from '../core/types';

/**
 * Mock Event Bus - In-memory event bus for testing
 *
 * Provides:
 * - Synchronous publish/subscribe
 * - Event history tracking
 * - Assertions and expectations
 */
/**
 * Published event with metadata
 */
export interface PublishedEvent<T extends BaseEvent = BaseEvent> {
  event: T;
  queue: string;
  publishedAt: Date;
  delay?: number;
}

/**
 * Subscription handler
 */
type SubscriptionHandler<T extends BaseEvent = BaseEvent> = (
  event: T
) => void | Promise<void>;

/**
 * Mock EventBus options
 */
export interface MockEventBusOptions {
  /** Simulate async behavior with delays */
  simulateAsync?: boolean;
  /** Delay for simulated async (ms) */
  asyncDelayMs?: number;
  /** Auto-generate missing event IDs */
  autoGenerateIds?: boolean;
  /** Throw on publish errors */
  throwOnError?: boolean;
  /** Source for event metadata (used by createEvent) */
  source?: string;
  /** Environment for event metadata (used by createEvent) */
  environment?: string;
}

/**
 * Options for creating an event via MockEventBus.createEvent()
 */
export interface MockCreateEventOptions {
  /** Override event ID */
  id?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Causation ID (parent event) */
  causationId?: string;
  /** Actor who triggered the event */
  actor?: EventActor;
  /** Additional metadata */
  metadata?: Partial<EventMetadata>;
  /** Event priority */
  priority?: EventPriority;
  /** Schema version override */
  version?: EventVersion;
  /** Aggregate info */
  aggregate?: { type: string; id: string };
  /** Timestamp override (for testing/replay) */
  timestamp?: string;
}

/**
 * Mock Event Bus for testing
 *
 * @example
 * ```typescript
 * const eventBus = createMockEventBus();
 *
 * // Subscribe to events
 * eventBus.subscribe('TradeProposalCreated', (event) => {
 *   expect(event.data.tradeId).toBe('123');
 * });
 *
 * // Publish an event
 * await eventBus.publish({
 *   type: 'TradeProposalCreated',
 *   data: { tradeId: '123' },
 * });
 *
 * // Assert published events
 * expect(eventBus.getPublishedEvents()).toHaveLength(1);
 * expect(eventBus.wasPublished('TradeProposalCreated')).toBe(true);
 * ```
 */
export class MockEventBus {
  private publishedEvents: PublishedEvent[] = [];
  private subscriptions = new Map<string, Set<SubscriptionHandler>>();
  private allSubscriptions = new Set<SubscriptionHandler>();

  constructor(private readonly options: MockEventBusOptions = {}) {
    this.options = {
      simulateAsync: false,
      asyncDelayMs: 10,
      autoGenerateIds: true,
      throwOnError: false,
      source: 'mock-event-bus',
      environment: 'test',
      ...options,
    };
  }

  /**
   * Create an event with defaults (matches EventBusService.createEvent API)
   *
   * @example
   * ```typescript
   * const event = mockBus.createEvent('TradeAccepted', {
   *   tradeId: '123',
   *   acceptedById: 'user-1',
   * }, {
   *   actor: { id: 'user-1', type: 'user' },
   * });
   * ```
   */
  createEvent<TType extends string, TData>(
    type: TType,
    data: TData,
    options: MockCreateEventOptions = {}
  ): BaseEvent<TType, TData> {
    const id = options.id ?? (this.options.autoGenerateIds ? generateEventId() : 'test-event-id');
    const correlationId = options.correlationId ?? generateCorrelationId();
    const timestamp = options.timestamp ?? new Date().toISOString();

    const actor: EventActor = options.actor ?? {
      id: 'test-user',
      type: 'user',
    };

    const metadata: EventMetadata = {
      source: this.options.source ?? 'mock-event-bus',
      environment: this.options.environment ?? 'test',
      ...options.metadata,
    };

    return {
      id,
      type,
      version: options.version ?? DEFAULT_EVENT_VERSION,
      timestamp,
      correlationId,
      causationId: options.causationId,
      actor,
      metadata,
      data,
      priority: options.priority,
      aggregate: options.aggregate,
    };
  }

  /**
   * Convenience method to create and publish an event in one call
   * (matches EventBusService.publishEvent API)
   *
   * @example
   * ```typescript
   * await mockBus.publishEvent('TradeAccepted', {
   *   tradeId: '123',
   *   acceptedById: 'user-1',
   * }, {
   *   actor: { id: 'user-1', type: 'user' },
   * });
   * ```
   */
  async publishEvent<TType extends string, TData>(
    type: TType,
    data: TData,
    options: MockCreateEventOptions & { queue?: string; delay?: number } = {}
  ): Promise<{ eventId: string; queue: string }> {
    const event = this.createEvent(type, data, options);
    return this.publish(event as BaseEvent, { queue: options.queue, delay: options.delay });
  }

  /**
   * Publish an event
   */
  async publish<T extends BaseEvent>(
    event: Omit<T, 'id' | 'timestamp'> & Partial<Pick<T, 'id' | 'timestamp'>>,
    options?: { queue?: string; delay?: number }
  ): Promise<{ eventId: string; queue: string }> {
    // Complete the event
    const fullEvent: T = {
      ...event,
      id:
        event.id ??
        (this.options.autoGenerateIds ? generateEventId() : 'test-event-id'),
      timestamp: event.timestamp ?? new Date().toISOString(),
      correlationId: event.correlationId ?? generateCorrelationId(),
    } as T;

    const queue =
      options?.queue ?? this.getQueueForPriority(fullEvent.priority);

    // Record the published event
    this.publishedEvents.push({
      event: fullEvent,
      queue,
      publishedAt: new Date(),
      delay: options?.delay,
    });

    // Simulate async if configured
    if (this.options.simulateAsync) {
      await this.delay(this.options.asyncDelayMs ?? 10);
    }

    // Notify subscribers
    await this.notifySubscribers(fullEvent);

    return { eventId: fullEvent.id, queue };
  }

  /**
   * Publish multiple events
   */
  async publishBatch<T extends BaseEvent>(
    events: Array<
      Omit<T, 'id' | 'timestamp'> & Partial<Pick<T, 'id' | 'timestamp'>>
    >,
    options?: { queue?: string }
  ): Promise<Array<{ eventId: string; queue: string }>> {
    const correlationId = generateCorrelationId();

    return Promise.all(
      events.map((event) =>
        this.publish({ ...event, correlationId } as T, { ...options })
      )
    );
  }

  /**
   * Subscribe to a specific event type
   */
  subscribe<T extends BaseEvent>(
    eventType: T['type'],
    handler: SubscriptionHandler<T>
  ): () => void {
    let handlers = this.subscriptions.get(eventType);
    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(eventType, handlers);
    }

    handlers.add(handler as SubscriptionHandler);

    // Return unsubscribe function
    // handlers is guaranteed to exist at this point since we just set it above
    return () => {
      const h = this.subscriptions.get(eventType);
      if (h) {
        h.delete(handler as SubscriptionHandler);
      }
    };
  }

  /**
   * Subscribe to all events
   */
  subscribeAll(handler: SubscriptionHandler): () => void {
    this.allSubscriptions.add(handler);

    return () => {
      this.allSubscriptions.delete(handler);
    };
  }

  /**
   * Get all published events
   */
  getPublishedEvents(): PublishedEvent[] {
    return [...this.publishedEvents];
  }

  /**
   * Get published events by type
   */
  getPublishedEventsByType<T extends BaseEvent>(
    type: T['type']
  ): PublishedEvent<T>[] {
    return this.publishedEvents.filter(
      (p) => p.event.type === type
    ) as PublishedEvent<T>[];
  }

  /**
   * Get the last published event
   */
  getLastPublishedEvent(): PublishedEvent | undefined {
    return this.publishedEvents[this.publishedEvents.length - 1];
  }

  /**
   * Get the last published event of a specific type
   */
  getLastPublishedEventByType<T extends BaseEvent>(
    type: T['type']
  ): PublishedEvent<T> | undefined {
    const events = this.getPublishedEventsByType<T>(type);
    return events[events.length - 1];
  }

  /**
   * Check if an event type was published
   */
  wasPublished(eventType: string): boolean {
    return this.publishedEvents.some((p) => p.event.type === eventType);
  }

  /**
   * Check if an event with specific data was published
   */
  wasPublishedWith<T extends BaseEvent>(
    eventType: T['type'],
    predicate: (event: T) => boolean
  ): boolean {
    return this.publishedEvents.some(
      (p) => p.event.type === eventType && predicate(p.event as T)
    );
  }

  /**
   * Get count of published events
   */
  getPublishedCount(eventType?: string): number {
    if (eventType) {
      return this.publishedEvents.filter((p) => p.event.type === eventType)
        .length;
    }
    return this.publishedEvents.length;
  }

  /**
   * Clear all published events (for test cleanup)
   */
  clearHistory(): void {
    this.publishedEvents = [];
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
    this.allSubscriptions.clear();
  }

  /**
   * Reset the mock (clear history and subscriptions)
   */
  reset(): void {
    this.clearHistory();
    this.clearSubscriptions();
  }

  /**
   * Simulate an incoming event (as if received from server)
   */
  async simulateIncomingEvent<T extends BaseEvent>(event: T): Promise<void> {
    await this.notifySubscribers(event);
  }

  // Private methods

  private async notifySubscribers(event: BaseEvent): Promise<void> {
    const errors: Error[] = [];

    // Notify type-specific subscribers
    const handlers = this.subscriptions.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    }

    // Notify all-event subscribers
    for (const handler of this.allSubscriptions) {
      try {
        await handler(event);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0 && this.options.throwOnError) {
      throw new AggregateError(errors, 'Subscriber errors');
    }
  }

  private getQueueForPriority(priority?: EventPriority): string {
    switch (priority) {
      case 'critical':
        return 'events-critical';
      case 'high':
        return 'events-high';
      case 'low':
        return 'events-low';
      case 'bulk':
        return 'events-bulk';
      default:
        return 'events-normal';
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a mock event bus for testing
 */
export function createMockEventBus(
  options?: MockEventBusOptions
): MockEventBus {
  return new MockEventBus(options);
}
