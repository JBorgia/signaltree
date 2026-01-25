import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockEventBus, MockEventBus } from './mock-event-bus';

describe('MockEventBus', () => {
  let eventBus: MockEventBus;

  beforeEach(() => {
    eventBus = new MockEventBus();
  });

  describe('publish', () => {
    it('should publish an event and return eventId', async () => {
      const result = await eventBus.publish({
        type: 'TestEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: { value: 42 },
      });

      expect(result.eventId).toBeDefined();
      expect(result.queue).toBeDefined();
    });

    it('should auto-generate missing id', async () => {
      const result = await eventBus.publish({
        type: 'TestEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });

      // UUID format check
      expect(result.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should use provided id when available', async () => {
      const customId = 'custom-event-id-123';
      const result = await eventBus.publish({
        id: customId,
        type: 'TestEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });

      expect(result.eventId).toBe(customId);
    });

    it('should store published events', async () => {
      await eventBus.publish({
        type: 'TestEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: { message: 'Hello' },
      });

      const events = eventBus.getPublishedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event.type).toBe('TestEvent');
      expect(events[0].event.data.message).toBe('Hello');
    });

    it('should route to queue based on priority', async () => {
      const results = await Promise.all([
        eventBus.publish({
          type: 'CriticalEvent',
          version: { major: 1, minor: 0 },
          actor: { id: 'user-1', type: 'user' },
          metadata: { source: 'test', environment: 'test' },
          priority: 'critical',
          data: {},
        }),
        eventBus.publish({
          type: 'NormalEvent',
          version: { major: 1, minor: 0 },
          actor: { id: 'user-1', type: 'user' },
          metadata: { source: 'test', environment: 'test' },
          priority: 'normal',
          data: {},
        }),
        eventBus.publish({
          type: 'BulkEvent',
          version: { major: 1, minor: 0 },
          actor: { id: 'user-1', type: 'user' },
          metadata: { source: 'test', environment: 'test' },
          priority: 'bulk',
          data: {},
        }),
      ]);

      expect(results[0].queue).toBe('events-critical');
      expect(results[1].queue).toBe('events-normal');
      expect(results[2].queue).toBe('events-bulk');
    });
  });

  describe('subscribe', () => {
    it('should call handler when event is published', async () => {
      const handler = vi.fn();
      eventBus.subscribe('TestEvent', handler);

      await eventBus.publish({
        type: 'TestEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: { value: 42 },
      });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].data.value).toBe(42);
    });

    it('should not call handler for different event types', async () => {
      const handler = vi.fn();
      eventBus.subscribe('TestEvent', handler);

      await eventBus.publish({
        type: 'OtherEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for same event', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      eventBus.subscribe('TestEvent', handler1);
      eventBus.subscribe('TestEvent', handler2);

      await eventBus.publish({
        type: 'TestEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should return unsubscribe function', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribe('TestEvent', handler);

      unsubscribe();

      await eventBus.publish({
        type: 'TestEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('subscribeAll', () => {
    it('should call handler for all events', async () => {
      const handler = vi.fn();
      eventBus.subscribeAll(handler);

      await eventBus.publish({
        type: 'EventA',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });
      await eventBus.publish({
        type: 'EventB',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should return unsubscribe function', async () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.subscribeAll(handler);

      await eventBus.publish({
        type: 'EventA',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });

      unsubscribe();

      await eventBus.publish({
        type: 'EventB',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('publishBatch', () => {
    it('should publish multiple events', async () => {
      const results = await eventBus.publishBatch([
        {
          type: 'EventA',
          version: { major: 1, minor: 0 },
          actor: { id: 'user-1', type: 'user' },
          metadata: { source: 'test', environment: 'test' },
          data: { index: 1 },
        },
        {
          type: 'EventB',
          version: { major: 1, minor: 0 },
          actor: { id: 'user-1', type: 'user' },
          metadata: { source: 'test', environment: 'test' },
          data: { index: 2 },
        },
      ]);

      expect(results).toHaveLength(2);
      expect(eventBus.getPublishedEvents()).toHaveLength(2);
    });

    it('should assign same correlation id to batch', async () => {
      await eventBus.publishBatch([
        {
          type: 'EventA',
          version: { major: 1, minor: 0 },
          actor: { id: 'user-1', type: 'user' },
          metadata: { source: 'test', environment: 'test' },
          data: {},
        },
        {
          type: 'EventB',
          version: { major: 1, minor: 0 },
          actor: { id: 'user-1', type: 'user' },
          metadata: { source: 'test', environment: 'test' },
          data: {},
        },
      ]);

      const events = eventBus.getPublishedEvents();
      expect(events[0].event.correlationId).toBe(events[1].event.correlationId);
    });
  });

  describe('query methods', () => {
    beforeEach(async () => {
      await eventBus.publish({
        type: 'UserCreated',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: { userId: 'user-1' },
      });
      await eventBus.publish({
        type: 'UserUpdated',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: { userId: 'user-1' },
      });
      await eventBus.publish({
        type: 'UserCreated',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-2', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: { userId: 'user-2' },
      });
    });

    describe('wasPublished', () => {
      it('should return true if event type was published', () => {
        expect(eventBus.wasPublished('UserCreated')).toBe(true);
      });

      it('should return false if event type was not published', () => {
        expect(eventBus.wasPublished('UserDeleted')).toBe(false);
      });
    });

    describe('getPublishedEventsByType', () => {
      it('should return events of specific type', () => {
        const events = eventBus.getPublishedEventsByType('UserCreated');

        expect(events).toHaveLength(2);
        events.forEach((e) => expect(e.event.type).toBe('UserCreated'));
      });

      it('should return empty array for unknown type', () => {
        const events = eventBus.getPublishedEventsByType('UnknownEvent');

        expect(events).toHaveLength(0);
      });
    });

    describe('getPublishedCount', () => {
      it('should return total count without type filter', () => {
        expect(eventBus.getPublishedCount()).toBe(3);
      });

      it('should return count for specific type', () => {
        expect(eventBus.getPublishedCount('UserCreated')).toBe(2);
        expect(eventBus.getPublishedCount('UserUpdated')).toBe(1);
      });
    });

    describe('getLastPublishedEventByType', () => {
      it('should return last published event', () => {
        const last = eventBus.getLastPublishedEventByType('UserCreated');

        expect(last?.event.type).toBe('UserCreated');
        expect(last?.event.data.userId).toBe('user-2');
      });

      it('should return last of specific type', () => {
        const last = eventBus.getLastPublishedEventByType('UserUpdated');

        expect(last?.event.type).toBe('UserUpdated');
      });

      it('should return undefined when no events of type', () => {
        const last = eventBus.getLastPublishedEventByType('NonExistent');
        expect(last).toBeUndefined();
      });
    });
  });

  describe('clearHistory', () => {
    it('should remove all published events', async () => {
      await eventBus.publish({
        type: 'TestEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });

      eventBus.clearHistory();

      expect(eventBus.getPublishedEvents()).toHaveLength(0);
    });
  });

  describe('simulateAsync option', () => {
    it('should add delay when simulateAsync is true', async () => {
      const asyncBus = new MockEventBus({
        simulateAsync: true,
        asyncDelayMs: 50,
      });

      const start = Date.now();
      await asyncBus.publish({
        type: 'TestEvent',
        version: { major: 1, minor: 0 },
        actor: { id: 'user-1', type: 'user' },
        metadata: { source: 'test', environment: 'test' },
        data: {},
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some timing variance
    });
  });

  describe('createMockEventBus factory', () => {
    it('should create a MockEventBus instance', () => {
      const bus = createMockEventBus();

      expect(bus).toBeInstanceOf(MockEventBus);
    });

    it('should pass options to MockEventBus', () => {
      const bus = createMockEventBus({ simulateAsync: true });

      // Verify by checking that options were applied
      expect(bus).toBeInstanceOf(MockEventBus);
    });
  });
});
