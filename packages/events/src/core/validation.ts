import { z, ZodError, ZodIssue, ZodObject, ZodRawShape } from 'zod';

import { BaseEvent } from './types';

/**
 * Event validation using Zod schemas
 *
 * Provides:
 * - Base schemas for common event fields
 * - Factory function to create event schemas
 * - Runtime validation with detailed errors
 */

// ============================================================================
// Base Schemas
// ============================================================================

/**
 * Schema for event actor
 */
export const EventActorSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['user', 'system', 'admin', 'webhook']),
  name: z.string().optional(),
});

/**
 * Schema for event version
 */
export const EventVersionSchema = z.object({
  major: z.number().int().min(1),
  minor: z.number().int().min(0),
});

/**
 * Schema for event metadata
 */
export const EventMetadataSchema = z
  .object({
    source: z.string().min(1),
    environment: z.string().min(1),
    ip: z.string().optional(),
    userAgent: z.string().optional(),
  })
  .passthrough(); // Allow additional properties

/**
 * Schema for aggregate info
 */
export const AggregateSchema = z
  .object({
    type: z.string().min(1),
    id: z.string().min(1),
  })
  .optional();

/**
 * Base event schema without data field
 */
export const BaseEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  version: EventVersionSchema,
  timestamp: z.string().datetime(),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid().optional(),
  actor: EventActorSchema,
  metadata: EventMetadataSchema,
  priority: z.enum(['critical', 'high', 'normal', 'low', 'bulk']).optional(),
  aggregate: AggregateSchema,
});

// ============================================================================
// Schema Factory
// ============================================================================

/**
 * Create a typed event schema with Zod validation
 *
 * @param eventType - The event type string (e.g., 'TradeProposalCreated')
 * @param dataSchema - Zod schema for the event's data field
 * @returns Complete event schema
 *
 * @example
 * ```typescript
 * const TradeProposalCreatedSchema = createEventSchema('TradeProposalCreated', {
 *   tradeId: z.string().uuid(),
 *   initiatorId: z.string().uuid(),
 *   recipientId: z.string().uuid(),
 *   vehicleOfferedId: z.string().uuid(),
 *   terms: z.object({
 *     cashDifference: z.number().optional(),
 *   }),
 * });
 *
 * type TradeProposalCreated = z.infer<typeof TradeProposalCreatedSchema>;
 * ```
 */
export function createEventSchema<
  TType extends string,
  TDataShape extends ZodRawShape
>(eventType: TType, dataSchema: TDataShape) {
  return BaseEventSchema.extend({
    type: z.literal(eventType),
    data: z.object(dataSchema),
  });
}

/**
 * Create event schema from existing Zod object
 */
export function createEventSchemaFromZod<
  TType extends string,
  TData extends ZodObject<ZodRawShape>
>(eventType: TType, dataSchema: TData) {
  return BaseEventSchema.extend({
    type: z.literal(eventType),
    data: dataSchema,
  });
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Custom error class for event validation failures
 */
export class EventValidationError extends Error {
  constructor(
    message: string,
    public readonly zodError: ZodError,
    public readonly event: unknown
  ) {
    super(message);
    this.name = 'EventValidationError';
  }

  /**
   * Get formatted error messages
   */
  get issues(): string[] {
    return this.zodError.issues.map((issue: ZodIssue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
  }
}

/**
 * Validate an event against a schema, throwing on failure
 *
 * @param schema - Zod schema to validate against
 * @param event - Event to validate
 * @returns Validated and typed event
 * @throws EventValidationError if validation fails
 *
 * @example
 * ```typescript
 * try {
 *   const validEvent = validateEvent(TradeProposalCreatedSchema, rawEvent);
 *   // validEvent is typed as TradeProposalCreated
 * } catch (error) {
 *   if (error instanceof EventValidationError) {
 *     console.error('Validation failed:', error.issues);
 *   }
 * }
 * ```
 */
export function validateEvent<T extends z.ZodTypeAny>(
  schema: T,
  event: unknown
): z.infer<T> {
  const result = schema.safeParse(event);

  if (!result.success) {
    throw new EventValidationError(
      `Event validation failed: ${result.error.issues
        .map((i: ZodIssue) => i.message)
        .join(', ')}`,
      result.error,
      event
    );
  }

  return result.data;
}

/**
 * Check if an event is valid without throwing
 *
 * @param schema - Zod schema to validate against
 * @param event - Event to check
 * @returns true if valid, false otherwise
 */
export function isValidEvent<T extends z.ZodTypeAny>(
  schema: T,
  event: unknown
): event is z.infer<T> {
  return schema.safeParse(event).success;
}

/**
 * Parse an event, returning result with success/error
 *
 * @param schema - Zod schema to parse with
 * @param event - Event to parse
 * @returns SafeParseResult with data or error
 */
export function parseEvent<T extends z.ZodTypeAny>(
  schema: T,
  event: unknown
): z.SafeParseReturnType<unknown, z.infer<T>> {
  return schema.safeParse(event);
}

/**
 * Validate base event structure (without specific data validation)
 */
export function validateBaseEvent(event: unknown): BaseEvent {
  // Use z.unknown() to make data required but accept any value
  const schema = BaseEventSchema.extend({ data: z.unknown() });
  const result = schema.safeParse(event);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new EventValidationError(
      `Event validation failed: ${issues}`,
      result.error,
      event
    );
  }
  // Type assertion is safe because schema validation passed and data is required
  return result.data as BaseEvent<string, unknown>;
}

/**
 * Check if value looks like a base event (duck typing)
 */
export function isBaseEventLike(value: unknown): value is BaseEvent {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;
  return (
    typeof obj['id'] === 'string' &&
    typeof obj['type'] === 'string' &&
    typeof obj['timestamp'] === 'string' &&
    typeof obj['correlationId'] === 'string' &&
    typeof obj['actor'] === 'object' &&
    typeof obj['metadata'] === 'object' &&
    'data' in obj
  );
}
