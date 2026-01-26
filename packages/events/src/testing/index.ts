/**
 * @signaltree/events/testing
 *
 * Testing utilities for event-driven applications.
 * Provides mocks, factories, and helpers for unit testing.
 */

// Mock Event Bus
export { MockEventBus, createMockEventBus } from './mock-event-bus';
export type { MockEventBusOptions, PublishedEvent, MockCreateEventOptions } from './mock-event-bus';

// Event Factories
export { createTestEvent, createTestEventFactory } from './factories';
export type { TestEventFactory, TestEventOptions } from './factories';

// Assertions
export { EventAssertions, createEventAssertions } from './assertions';
export type { AssertionResult } from './assertions';

// Helpers
export {
  waitForEvent,
  waitForEvents,
  collectEvents,
  mockIdempotencyStore,
  mockErrorClassifier,
} from './helpers';
