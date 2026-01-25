import { BaseEvent } from '../core/types';
import { PublishedEvent } from './mock-event-bus';

/**
 * Test Assertions - Assertion helpers for event testing
 *
 * Provides:
 * - Fluent assertion API
 * - Event structure validation
 * - Sequence assertions
 */
/**
 * Assertion result
 */
export interface AssertionResult {
  passed: boolean;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

/**
 * Event assertions class
 */
export class EventAssertions {
  private publishedEvents: PublishedEvent[];

  constructor(events: PublishedEvent[]) {
    this.publishedEvents = events;
  }

  /**
   * Assert that an event was published
   */
  toHavePublished(eventType: string): AssertionResult {
    const found = this.publishedEvents.some((p) => p.event.type === eventType);
    return {
      passed: found,
      message: found
        ? `Event "${eventType}" was published`
        : `Expected event "${eventType}" to be published, but it was not`,
      expected: eventType,
      actual: this.publishedEvents.map((p) => p.event.type),
    };
  }

  /**
   * Assert that an event was NOT published
   */
  toNotHavePublished(eventType: string): AssertionResult {
    const found = this.publishedEvents.some((p) => p.event.type === eventType);
    return {
      passed: !found,
      message: !found
        ? `Event "${eventType}" was not published`
        : `Expected event "${eventType}" to NOT be published, but it was`,
      expected: `NOT ${eventType}`,
      actual: this.publishedEvents.map((p) => p.event.type),
    };
  }

  /**
   * Assert the number of published events
   */
  toHavePublishedCount(count: number, eventType?: string): AssertionResult {
    const events = eventType
      ? this.publishedEvents.filter((p) => p.event.type === eventType)
      : this.publishedEvents;

    const actual = events.length;
    const passed = actual === count;

    return {
      passed,
      message: passed
        ? `Published ${count} events${
            eventType ? ` of type "${eventType}"` : ''
          }`
        : `Expected ${count} events${
            eventType ? ` of type "${eventType}"` : ''
          }, got ${actual}`,
      expected: count,
      actual,
    };
  }

  /**
   * Assert event was published with specific data
   */
  toHavePublishedWith<T extends BaseEvent>(
    eventType: T['type'],
    predicate: (event: T) => boolean
  ): AssertionResult {
    const matching = this.publishedEvents.find(
      (p) => p.event.type === eventType && predicate(p.event as T)
    );

    return {
      passed: !!matching,
      message: matching
        ? `Found event "${eventType}" matching predicate`
        : `Expected to find event "${eventType}" matching predicate`,
      expected: eventType,
      actual: matching?.event,
    };
  }

  /**
   * Assert events were published in order
   */
  toHavePublishedInOrder(eventTypes: string[]): AssertionResult {
    const publishedTypes = this.publishedEvents.map((p) => p.event.type);
    let typeIndex = 0;

    for (const publishedType of publishedTypes) {
      if (publishedType === eventTypes[typeIndex]) {
        typeIndex++;
        if (typeIndex === eventTypes.length) break;
      }
    }

    const passed = typeIndex === eventTypes.length;

    return {
      passed,
      message: passed
        ? `Events published in expected order`
        : `Expected events in order: [${eventTypes.join(
            ', '
          )}], got: [${publishedTypes.join(', ')}]`,
      expected: eventTypes,
      actual: publishedTypes,
    };
  }

  /**
   * Assert event has valid structure
   */
  toBeValidEvent<T extends BaseEvent>(event: T): AssertionResult {
    const issues: string[] = [];

    if (!event.id) issues.push('Missing id');
    if (!event.type) issues.push('Missing type');
    if (!event.timestamp) issues.push('Missing timestamp');
    if (!event.correlationId) issues.push('Missing correlationId');
    if (!event.version) issues.push('Missing version');
    if (!event.actor) issues.push('Missing actor');
    if (!event.metadata) issues.push('Missing metadata');

    if (event.actor) {
      if (!event.actor.id) issues.push('Missing actor.id');
      if (!event.actor.type) issues.push('Missing actor.type');
    }

    if (event.metadata) {
      if (!event.metadata.source) issues.push('Missing metadata.source');
    }

    const passed = issues.length === 0;

    return {
      passed,
      message: passed
        ? 'Event has valid structure'
        : `Event has invalid structure: ${issues.join(', ')}`,
      expected: 'Valid event structure',
      actual: issues,
    };
  }

  /**
   * Assert all events have same correlation ID
   */
  toHaveSameCorrelationId(): AssertionResult {
    if (this.publishedEvents.length === 0) {
      return {
        passed: true,
        message: 'No events to check',
      };
    }

    const correlationId = this.publishedEvents[0].event.correlationId;
    const allMatch = this.publishedEvents.every(
      (p) => p.event.correlationId === correlationId
    );

    return {
      passed: allMatch,
      message: allMatch
        ? `All events have correlation ID: ${correlationId}`
        : 'Events have different correlation IDs',
      expected: correlationId,
      actual: this.publishedEvents.map((p) => p.event.correlationId),
    };
  }

  /**
   * Assert event was published to specific queue
   */
  toHavePublishedToQueue(eventType: string, queue: string): AssertionResult {
    const matching = this.publishedEvents.find(
      (p) => p.event.type === eventType && p.queue === queue
    );

    return {
      passed: !!matching,
      message: matching
        ? `Event "${eventType}" was published to queue "${queue}"`
        : `Expected event "${eventType}" to be published to queue "${queue}"`,
      expected: { eventType, queue },
      actual: this.publishedEvents
        .filter((p) => p.event.type === eventType)
        .map((p) => ({ type: p.event.type, queue: p.queue })),
    };
  }

  /**
   * Get all assertions as an array
   */
  getAllResults(): AssertionResult[] {
    return [];
  }
}

/**
 * Create event assertions helper
 *
 * @example
 * ```typescript
 * const eventBus = createMockEventBus();
 * // ... publish events ...
 *
 * const assertions = createEventAssertions(eventBus.getPublishedEvents());
 *
 * expect(assertions.toHavePublished('TradeCreated').passed).toBe(true);
 * expect(assertions.toHavePublishedCount(3).passed).toBe(true);
 * expect(assertions.toHavePublishedInOrder(['TradeCreated', 'TradeAccepted']).passed).toBe(true);
 * ```
 */
export function createEventAssertions(
  events: PublishedEvent[]
): EventAssertions {
  return new EventAssertions(events);
}

/**
 * Jest/Vitest custom matcher helpers
 *
 * @example
 * ```typescript
 * // In your test setup
 * expect.extend({
 *   toHavePublishedEvent(received: MockEventBus, eventType: string) {
 *     const assertions = createEventAssertions(received.getPublishedEvents());
 *     const result = assertions.toHavePublished(eventType);
 *     return {
 *       pass: result.passed,
 *       message: () => result.message,
 *     };
 *   },
 * });
 *
 * // In your test
 * expect(eventBus).toHavePublishedEvent('TradeCreated');
 * ```
 */
export const jestMatchers = {
  toHavePublishedEvent(
    received: { getPublishedEvents: () => PublishedEvent[] },
    eventType: string
  ) {
    const assertions = createEventAssertions(received.getPublishedEvents());
    const result = assertions.toHavePublished(eventType);
    return {
      pass: result.passed,
      message: () => result.message,
    };
  },

  toHavePublishedEventCount(
    received: { getPublishedEvents: () => PublishedEvent[] },
    count: number,
    eventType?: string
  ) {
    const assertions = createEventAssertions(received.getPublishedEvents());
    const result = assertions.toHavePublishedCount(count, eventType);
    return {
      pass: result.passed,
      message: () => result.message,
    };
  },
};
