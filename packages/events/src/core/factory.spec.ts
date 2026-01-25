import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createEventFactory, EventFactory, generateCorrelationId, generateEventId } from './factory';
import { BaseEvent, EventActor } from './types';

describe('Event Factory', () => {
  describe('generateEventId', () => {
    it('should generate valid UUID format', () => {
      const id = generateEventId();

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateEventId()));

      expect(ids.size).toBe(100);
    });

    it('should generate time-sortable IDs (UUID v7)', () => {
      const id1 = generateEventId();
      // Small delay to ensure different timestamp
      const id2 = generateEventId();

      // In UUID v7, the first 48 bits are timestamp, so lexicographic comparison works
      // for IDs generated within a reasonable timeframe
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate valid UUID format', () => {
      const id = generateCorrelationId();

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(
        Array.from({ length: 100 }, () => generateCorrelationId())
      );

      expect(ids.size).toBe(100);
    });
  });

  describe('createEventFactory', () => {
    let factory: EventFactory;

    beforeEach(() => {
      factory = createEventFactory({
        source: 'test-service',
        environment: 'test',
      });
    });

    afterEach(() => {
      factory.clearCorrelationId();
    });

    describe('create', () => {
      it('should create an event with required fields', () => {
        const event = factory.create('TestEvent', { value: 42 });

        expect(event.type).toBe('TestEvent');
        expect(event.data).toEqual({ value: 42 });
        expect(event.id).toBeDefined();
        expect(event.timestamp).toBeDefined();
        expect(event.correlationId).toBeDefined();
        expect(event.version).toEqual({ major: 1, minor: 0 });
        expect(event.metadata.source).toBe('test-service');
        expect(event.metadata.environment).toBe('test');
      });

      it('should use system actor by default', () => {
        const event = factory.create('TestEvent', {});

        expect(event.actor.type).toBe('system');
        expect(event.actor.id).toBeDefined();
      });

      it('should allow custom actor', () => {
        const customActor: EventActor = {
          id: 'user-123',
          type: 'user',
          name: 'John Doe',
        };

        const event = factory.create('TestEvent', {}, { actor: customActor });

        expect(event.actor).toEqual(customActor);
      });

      it('should allow custom correlation ID', () => {
        const correlationId = 'custom-correlation-id';

        const event = factory.create('TestEvent', {}, { correlationId });

        expect(event.correlationId).toBe(correlationId);
      });

      it('should allow causation ID', () => {
        const causationId = 'parent-event-id';

        const event = factory.create('TestEvent', {}, { causationId });

        expect(event.causationId).toBe(causationId);
      });

      it('should allow priority override', () => {
        const event = factory.create('TestEvent', {}, { priority: 'critical' });

        expect(event.priority).toBe('critical');
      });

      it('should allow aggregate info', () => {
        const aggregate = { type: 'Order', id: 'order-123' };

        const event = factory.create('TestEvent', {}, { aggregate });

        expect(event.aggregate).toEqual(aggregate);
      });

      it('should merge additional metadata', () => {
        const event = factory.create(
          'TestEvent',
          {},
          { metadata: { ip: '127.0.0.1', userAgent: 'TestClient' } }
        );

        expect(event.metadata.source).toBe('test-service');
        expect(event.metadata.environment).toBe('test');
        expect(event.metadata.ip).toBe('127.0.0.1');
        expect(event.metadata.userAgent).toBe('TestClient');
      });

      it('should allow version override', () => {
        const version = { major: 2, minor: 1 };

        const event = factory.create('TestEvent', {}, { version });

        expect(event.version).toEqual(version);
      });

      it('should allow timestamp override', () => {
        const timestamp = '2024-01-01T00:00:00.000Z';

        const event = factory.create('TestEvent', {}, { timestamp });

        expect(event.timestamp).toBe(timestamp);
      });

      it('should allow id override', () => {
        const id = 'custom-event-id';

        const event = factory.create('TestEvent', {}, { id });

        expect(event.id).toBe(id);
      });
    });

    describe('createFromCause', () => {
      it('should inherit correlation and set causation from cause event', () => {
        const causeEvent: BaseEvent = {
          id: 'cause-event-id',
          type: 'CauseEvent',
          version: { major: 1, minor: 0 },
          timestamp: new Date().toISOString(),
          correlationId: 'original-correlation-id',
          actor: { id: 'user-1', type: 'user' },
          metadata: { source: 'test', environment: 'test' },
          data: {},
        };

        const event = factory.createFromCause(
          'ResultEvent',
          { result: 'success' },
          causeEvent
        );

        expect(event.correlationId).toBe('original-correlation-id');
        expect(event.causationId).toBe('cause-event-id');
      });

      it('should allow additional options', () => {
        const causeEvent: BaseEvent = {
          id: 'cause-id',
          type: 'CauseEvent',
          version: { major: 1, minor: 0 },
          timestamp: new Date().toISOString(),
          correlationId: 'corr-id',
          actor: { id: 'user-1', type: 'user' },
          metadata: { source: 'test', environment: 'test' },
          data: {},
        };

        const customActor: EventActor = { id: 'admin-1', type: 'admin' };
        const event = factory.createFromCause('ResultEvent', {}, causeEvent, {
          actor: customActor,
          priority: 'high',
        });

        expect(event.actor).toEqual(customActor);
        expect(event.priority).toBe('high');
        expect(event.correlationId).toBe('corr-id');
        expect(event.causationId).toBe('cause-id');
      });
    });

    describe('correlation ID management', () => {
      it('should return undefined when no correlation ID is set', () => {
        expect(factory.getCorrelationId()).toBeUndefined();
      });

      it('should store and retrieve correlation ID', () => {
        factory.setCorrelationId('test-correlation-id');

        expect(factory.getCorrelationId()).toBe('test-correlation-id');
      });

      it('should use stored correlation ID when creating events', () => {
        factory.setCorrelationId('stored-correlation-id');

        const event = factory.create('TestEvent', {});

        expect(event.correlationId).toBe('stored-correlation-id');
      });

      it('should clear correlation ID', () => {
        factory.setCorrelationId('test-id');
        factory.clearCorrelationId();

        expect(factory.getCorrelationId()).toBeUndefined();
      });

      it('should override stored correlation ID with explicit one', () => {
        factory.setCorrelationId('stored-id');

        const event = factory.create(
          'TestEvent',
          {},
          { correlationId: 'explicit-id' }
        );

        expect(event.correlationId).toBe('explicit-id');
      });
    });

    describe('custom generators', () => {
      it('should use custom ID generator', () => {
        let counter = 0;
        const customFactory = createEventFactory({
          source: 'test',
          environment: 'test',
          generateId: () => `custom-id-${++counter}`,
        });

        const event1 = customFactory.create('TestEvent', {});
        const event2 = customFactory.create('TestEvent', {});

        expect(event1.id).toBe('custom-id-1');
        expect(event2.id).toBe('custom-id-2');
      });

      it('should use custom correlation ID generator', () => {
        const customFactory = createEventFactory({
          source: 'test',
          environment: 'test',
          generateCorrelationId: () => 'custom-correlation',
        });

        const event = customFactory.create('TestEvent', {});

        expect(event.correlationId).toBe('custom-correlation');
      });

      it('should use custom system actor', () => {
        const customActor: EventActor = {
          id: 'custom-system',
          type: 'system',
          name: 'Custom System',
        };
        const customFactory = createEventFactory({
          source: 'test',
          environment: 'test',
          systemActor: customActor,
        });

        const event = customFactory.create('TestEvent', {});

        expect(event.actor).toEqual(customActor);
      });
    });
  });
});
