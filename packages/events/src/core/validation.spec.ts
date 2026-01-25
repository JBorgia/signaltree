import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
    BaseEventSchema,
    createEventSchema,
    EventActorSchema,
    EventMetadataSchema,
    EventValidationError,
    EventVersionSchema,
    isValidEvent,
    parseEvent,
    validateBaseEvent,
    validateEvent,
} from './validation';

describe('Event Validation', () => {
  describe('EventActorSchema', () => {
    it('should validate a valid actor', () => {
      const actor = { id: 'user-1', type: 'user' as const, name: 'Test User' };
      const result = EventActorSchema.safeParse(actor);
      expect(result.success).toBe(true);
    });

    it('should reject actor without id', () => {
      const actor = { type: 'user' };
      const result = EventActorSchema.safeParse(actor);
      expect(result.success).toBe(false);
    });

    it('should reject actor with invalid type', () => {
      const actor = { id: 'user-1', type: 'invalid' };
      const result = EventActorSchema.safeParse(actor);
      expect(result.success).toBe(false);
    });

    it('should accept all valid actor types', () => {
      const types = ['user', 'system', 'admin', 'webhook'] as const;
      types.forEach((type) => {
        const result = EventActorSchema.safeParse({ id: 'test', type });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('EventVersionSchema', () => {
    it('should validate a valid version', () => {
      const version = { major: 1, minor: 0 };
      const result = EventVersionSchema.safeParse(version);
      expect(result.success).toBe(true);
    });

    it('should reject major version less than 1', () => {
      const version = { major: 0, minor: 0 };
      const result = EventVersionSchema.safeParse(version);
      expect(result.success).toBe(false);
    });

    it('should reject negative minor version', () => {
      const version = { major: 1, minor: -1 };
      const result = EventVersionSchema.safeParse(version);
      expect(result.success).toBe(false);
    });
  });

  describe('EventMetadataSchema', () => {
    it('should validate valid metadata', () => {
      const metadata = { source: 'test-service', environment: 'test' };
      const result = EventMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });

    it('should allow additional properties', () => {
      const metadata = {
        source: 'test-service',
        environment: 'test',
        customField: 'custom-value',
      };
      const result = EventMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customField).toBe('custom-value');
      }
    });

    it('should reject empty source', () => {
      const metadata = { source: '', environment: 'test' };
      const result = EventMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(false);
    });
  });

  describe('BaseEventSchema', () => {
    const validBaseEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'TestEvent',
      version: { major: 1, minor: 0 },
      timestamp: '2024-01-01T00:00:00.000Z',
      correlationId: '550e8400-e29b-41d4-a716-446655440001',
      actor: { id: 'user-1', type: 'user' as const },
      metadata: { source: 'test', environment: 'test' },
    };

    it('should validate a complete base event', () => {
      const result = BaseEventSchema.safeParse(validBaseEvent);
      expect(result.success).toBe(true);
    });

    it('should reject event with invalid UUID id', () => {
      const event = { ...validBaseEvent, id: 'not-a-uuid' };
      const result = BaseEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should reject event without type', () => {
      const { type: _, ...eventWithoutType } = validBaseEvent;
      const result = BaseEventSchema.safeParse(eventWithoutType);
      expect(result.success).toBe(false);
    });

    it('should accept optional causationId', () => {
      const event = {
        ...validBaseEvent,
        causationId: '550e8400-e29b-41d4-a716-446655440002',
      };
      const result = BaseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should accept valid priority values', () => {
      const priorities = ['critical', 'high', 'normal', 'low', 'bulk'] as const;
      priorities.forEach((priority) => {
        const event = { ...validBaseEvent, priority };
        const result = BaseEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('createEventSchema', () => {
    const TestEventSchema = createEventSchema('TestEvent', {
      userId: z.string().uuid(),
      action: z.string().min(1),
      count: z.number().int().positive(),
    });

    const validEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'TestEvent',
      version: { major: 1, minor: 0 },
      timestamp: '2024-01-01T00:00:00.000Z',
      correlationId: '550e8400-e29b-41d4-a716-446655440001',
      actor: { id: 'user-1', type: 'user' as const },
      metadata: { source: 'test', environment: 'test' },
      data: {
        userId: '550e8400-e29b-41d4-a716-446655440003',
        action: 'test-action',
        count: 5,
      },
    };

    it('should validate a valid typed event', () => {
      const result = TestEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should enforce type literal', () => {
      const event = { ...validEvent, type: 'WrongType' };
      const result = TestEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should validate data schema', () => {
      const event = {
        ...validEvent,
        data: { ...validEvent.data, count: -1 },
      };
      const result = TestEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should reject missing data fields', () => {
      const event = {
        ...validEvent,
        data: { userId: validEvent.data.userId },
      };
      const result = TestEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('isValidEvent', () => {
    const schema = createEventSchema('ValidatedEvent', {
      message: z.string(),
    });

    const validEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'ValidatedEvent',
      version: { major: 1, minor: 0 },
      timestamp: '2024-01-01T00:00:00.000Z',
      correlationId: '550e8400-e29b-41d4-a716-446655440001',
      actor: { id: 'user-1', type: 'user' as const },
      metadata: { source: 'test', environment: 'test' },
      data: { message: 'Hello' },
    };

    it('should return true for valid event', () => {
      expect(isValidEvent(schema, validEvent)).toBe(true);
    });

    it('should return false for invalid event', () => {
      const invalidEvent = { ...validEvent, type: 'WrongType' };
      expect(isValidEvent(schema, invalidEvent)).toBe(false);
    });
  });

  describe('validateEvent', () => {
    const schema = createEventSchema('ValidatedEvent', {
      message: z.string(),
    });

    const validEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'ValidatedEvent',
      version: { major: 1, minor: 0 },
      timestamp: '2024-01-01T00:00:00.000Z',
      correlationId: '550e8400-e29b-41d4-a716-446655440001',
      actor: { id: 'user-1', type: 'user' as const },
      metadata: { source: 'test', environment: 'test' },
      data: { message: 'Hello' },
    };

    it('should return validated data for valid event', () => {
      const result = validateEvent(schema, validEvent);
      expect(result.data.message).toBe('Hello');
    });

    it('should throw EventValidationError for invalid event', () => {
      const invalidEvent = { ...validEvent, type: 'WrongType' };
      expect(() => validateEvent(schema, invalidEvent)).toThrow(
        EventValidationError
      );
    });
  });

  describe('parseEvent', () => {
    const schema = createEventSchema('ParsedEvent', {
      value: z.number(),
    });

    const validEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'ParsedEvent',
      version: { major: 1, minor: 0 },
      timestamp: '2024-01-01T00:00:00.000Z',
      correlationId: '550e8400-e29b-41d4-a716-446655440001',
      actor: { id: 'user-1', type: 'user' as const },
      metadata: { source: 'test', environment: 'test' },
      data: { value: 42 },
    };

    it('should return success for valid event', () => {
      const result = parseEvent(schema, validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data.value).toBe(42);
      }
    });

    it('should return error for invalid event', () => {
      const invalidEvent = { ...validEvent, data: { value: 'not-a-number' } };
      const result = parseEvent(schema, invalidEvent);
      expect(result.success).toBe(false);
    });
  });

  describe('validateBaseEvent', () => {
    const validBaseEvent = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'AnyEvent',
      version: { major: 1, minor: 0 },
      timestamp: '2024-01-01T00:00:00.000Z',
      correlationId: '550e8400-e29b-41d4-a716-446655440001',
      actor: { id: 'user-1', type: 'user' as const },
      metadata: { source: 'test', environment: 'test' },
      data: { anything: 'goes' },
    };

    it('should return validated event for valid input', () => {
      const result = validateBaseEvent(validBaseEvent);
      expect(result.id).toBe(validBaseEvent.id);
      expect(result.type).toBe(validBaseEvent.type);
    });

    it('should accept any data shape', () => {
      const events = [
        { ...validBaseEvent, data: { foo: 'bar' } },
        { ...validBaseEvent, data: { nested: { deep: true } } },
        { ...validBaseEvent, data: [] },
        { ...validBaseEvent, data: 'string' },
        { ...validBaseEvent, data: 123 },
      ];

      events.forEach((event) => {
        expect(() => validateBaseEvent(event)).not.toThrow();
      });
    });

    it('should throw EventValidationError for invalid base structure', () => {
      const invalidEvent = { ...validBaseEvent, id: 'not-a-uuid' };
      expect(() => validateBaseEvent(invalidEvent)).toThrow(
        EventValidationError
      );
    });

    it('should include error details in EventValidationError', () => {
      const invalidEvent = { ...validBaseEvent, id: 'not-a-uuid' };
      try {
        validateBaseEvent(invalidEvent);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventValidationError);
        const validationError = error as EventValidationError;
        expect(validationError.zodError).toBeDefined();
        expect(validationError.event).toBe(invalidEvent);
      }
    });
  });

  describe('EventValidationError', () => {
    it('should preserve ZodError and event', () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['data', 'field'],
          message: 'Expected string, received number',
        },
      ]);
      const event = { type: 'test' };

      const error = new EventValidationError(
        'Validation failed',
        zodError,
        event
      );

      expect(error.message).toBe('Validation failed');
      expect(error.zodError).toBe(zodError);
      expect(error.event).toBe(event);
      expect(error.name).toBe('EventValidationError');
    });
  });
});
