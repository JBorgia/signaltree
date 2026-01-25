import { describe, expect, it } from 'vitest';

import { BaseEvent } from '../core/types';
import { createTestEvent, createTestEventFactory, randomUuid } from './factories';

describe('Test Event Factories', () => {
  describe('createTestEvent', () => {
    it('should create an event with required fields', () => {
      const event = createTestEvent('TestEvent', { value: 42 });

      expect(event.type).toBe('TestEvent');
      expect(event.data).toEqual({ value: 42 });
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.correlationId).toBeDefined();
      expect(event.actor).toBeDefined();
      expect(event.metadata).toBeDefined();
    });

    it('should use default actor when not specified', () => {
      const event = createTestEvent('TestEvent', {});

      expect(event.actor.id).toBe('test-user-1');
      expect(event.actor.type).toBe('user');
      expect(event.actor.name).toBe('Test User');
    });

    it('should use default metadata when not specified', () => {
      const event = createTestEvent('TestEvent', {});

      expect(event.metadata.source).toBe('test');
      expect(event.metadata.environment).toBe('test');
    });

    it('should allow overriding event id', () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const event = createTestEvent('TestEvent', {}, { id: customId });

      expect(event.id).toBe(customId);
    });

    it('should allow overriding correlation id', () => {
      const customCorrelationId = '550e8400-e29b-41d4-a716-446655440001';
      const event = createTestEvent(
        'TestEvent',
        {},
        { correlationId: customCorrelationId }
      );

      expect(event.correlationId).toBe(customCorrelationId);
    });

    it('should allow overriding timestamp', () => {
      const customTimestamp = '2024-06-15T10:30:00.000Z';
      const event = createTestEvent(
        'TestEvent',
        {},
        { timestamp: customTimestamp }
      );

      expect(event.timestamp).toBe(customTimestamp);
    });

    it('should allow partial actor override', () => {
      const event = createTestEvent(
        'TestEvent',
        {},
        { actor: { id: 'custom-user' } }
      );

      expect(event.actor.id).toBe('custom-user');
      expect(event.actor.type).toBe('user'); // default preserved
    });

    it('should allow partial metadata override', () => {
      const event = createTestEvent(
        'TestEvent',
        {},
        { metadata: { source: 'custom-source' } }
      );

      expect(event.metadata.source).toBe('custom-source');
      expect(event.metadata.environment).toBe('test'); // default preserved
    });

    it('should allow setting priority', () => {
      const event = createTestEvent('TestEvent', {}, { priority: 'high' });

      expect(event.priority).toBe('high');
    });

    it('should allow setting version', () => {
      const event = createTestEvent(
        'TestEvent',
        {},
        { version: { major: 2, minor: 1 } }
      );

      expect(event.version).toEqual({ major: 2, minor: 1 });
    });

    it('should allow setting aggregate', () => {
      const event = createTestEvent(
        'TestEvent',
        {},
        { aggregate: { type: 'Trade', id: 'trade-123' } }
      );

      expect(event.aggregate).toEqual({ type: 'Trade', id: 'trade-123' });
    });

    it('should allow setting causation id', () => {
      const causationId = '550e8400-e29b-41d4-a716-446655440002';
      const event = createTestEvent('TestEvent', {}, { causationId });

      expect(event.causationId).toBe(causationId);
    });
  });

  describe('createTestEventFactory', () => {
    it('should create a factory with default config', () => {
      const factory = createTestEventFactory();

      const event = factory.create('TestEvent', { value: 1 });

      expect(event.type).toBe('TestEvent');
      expect(event.data).toEqual({ value: 1 });
    });

    it('should respect custom default actor', () => {
      const factory = createTestEventFactory({
        defaultActor: { id: 'custom-default-user', type: 'admin' },
      });

      const event = factory.create('TestEvent', {});

      expect(event.actor.id).toBe('custom-default-user');
      expect(event.actor.type).toBe('admin');
    });

    it('should respect custom default metadata', () => {
      const factory = createTestEventFactory({
        defaultMetadata: { source: 'custom-service', environment: 'staging' },
      });

      const event = factory.create('TestEvent', {});

      expect(event.metadata.source).toBe('custom-service');
      expect(event.metadata.environment).toBe('staging');
    });

    describe('factory.create', () => {
      const factory = createTestEventFactory();

      it('should create typed events', () => {
        interface TestData {
          userId: string;
          amount: number;
        }
        type TestEvent = BaseEvent<'TestEvent', TestData>;

        const event = factory.create<TestEvent>('TestEvent', {
          userId: 'user-1',
          amount: 100,
        });

        expect(event.type).toBe('TestEvent');
        expect(event.data.userId).toBe('user-1');
        expect(event.data.amount).toBe(100);
      });
    });

    describe('factory.createMany', () => {
      const factory = createTestEventFactory();

      it('should create multiple events', () => {
        const events = factory.createMany('TestEvent', [
          { value: 1 },
          { value: 2 },
          { value: 3 },
        ]);

        expect(events).toHaveLength(3);
        expect(events[0].data.value).toBe(1);
        expect(events[1].data.value).toBe(2);
        expect(events[2].data.value).toBe(3);
      });

      it('should create events with unique ids', () => {
        const events = factory.createMany('TestEvent', [{}, {}]);

        expect(events[0].id).not.toBe(events[1].id);
      });

      it('should apply options to all events', () => {
        const events = factory.createMany('TestEvent', [{}, {}], {
          priority: 'critical',
        });

        expect(events[0].priority).toBe('critical');
        expect(events[1].priority).toBe('critical');
      });
    });

    describe('factory.createRandom', () => {
      it('should create random events with generators', () => {
        let counter = 0;
        const factory = createTestEventFactory({
          randomGenerators: {
            CounterEvent: () => ({ count: ++counter }),
          },
        });

        const event1 =
          factory.createRandom<BaseEvent<'CounterEvent', { count: number }>>(
            'CounterEvent'
          );
        const event2 =
          factory.createRandom<BaseEvent<'CounterEvent', { count: number }>>(
            'CounterEvent'
          );

        expect(event1.data.count).toBe(1);
        expect(event2.data.count).toBe(2);
      });

      it('should merge overrides with random data', () => {
        const factory = createTestEventFactory({
          randomGenerators: {
            UserEvent: () => ({ userId: 'random-user', score: 50 }),
          },
        });

        const event = factory.createRandom<
          BaseEvent<'UserEvent', { userId: string; score: number }>
        >('UserEvent', { score: 100 });

        expect(event.data.userId).toBe('random-user'); // from generator
        expect(event.data.score).toBe(100); // overridden
      });

      it('should work without random generators', () => {
        const factory = createTestEventFactory();

        const event = factory.createRandom('UnknownEvent', { value: 42 });

        expect(event.type).toBe('UnknownEvent');
        expect(event.data.value).toBe(42);
      });
    });
  });

  describe('randomUuid', () => {
    it('should generate valid UUID v7 format', () => {
      const uuid = randomUuid();

      // UUID v7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
      // version nibble is 7, variant nibble is 8-b
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set(Array.from({ length: 100 }, () => randomUuid()));

      expect(uuids.size).toBe(100);
    });
  });
});
