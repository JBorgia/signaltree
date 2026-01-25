import { generateCorrelationId, generateEventId } from '../core/factory';
import { BaseEvent, DEFAULT_EVENT_VERSION, EventActor, EventMetadata, EventPriority, EventVersion } from '../core/types';

/**
 * Test Event Factories - Create events for testing
 *
 * Provides:
 * - Type-safe event creation
 * - Randomized data generation
 * - Override support
 */
/**
 * Options for creating test events
 */
export interface TestEventOptions {
  /** Override event ID */
  id?: string;
  /** Override correlation ID */
  correlationId?: string;
  /** Override causation ID */
  causationId?: string;
  /** Override timestamp */
  timestamp?: string;
  /** Override actor */
  actor?: Partial<EventActor>;
  /** Override metadata */
  metadata?: Partial<EventMetadata>;
  /** Override priority */
  priority?: EventPriority;
  /** Override version */
  version?: EventVersion;
  /** Override aggregate */
  aggregate?: { type: string; id: string };
}

/**
 * Test event factory interface
 */
export interface TestEventFactory<TEvents extends BaseEvent = BaseEvent> {
  /**
   * Create a test event
   */
  create<T extends TEvents>(
    type: T['type'],
    data: T['data'],
    options?: TestEventOptions
  ): T;

  /**
   * Create multiple test events
   */
  createMany<T extends TEvents>(
    type: T['type'],
    dataArray: T['data'][],
    options?: TestEventOptions
  ): T[];

  /**
   * Create a test event with random data
   * Override this in your app's test utilities
   */
  createRandom<T extends TEvents>(
    type: T['type'],
    overrides?: Partial<T['data']>,
    options?: TestEventOptions
  ): T;
}

/**
 * Default test actor
 */
const DEFAULT_TEST_ACTOR: EventActor = {
  id: 'test-user-1',
  type: 'user',
  name: 'Test User',
};

/**
 * Default test metadata
 */
const DEFAULT_TEST_METADATA: EventMetadata = {
  source: 'test',
  environment: 'test',
};

/**
 * Create a test event
 *
 * @example
 * ```typescript
 * const event = createTestEvent('TradeProposalCreated', {
 *   tradeId: '123',
 *   initiatorId: 'user-1',
 *   recipientId: 'user-2',
 * });
 * ```
 */
export function createTestEvent<TType extends string, TData>(
  type: TType,
  data: TData,
  options: TestEventOptions = {}
): BaseEvent<TType, TData> {
  return {
    id: options.id ?? generateEventId(),
    type,
    version: options.version ?? DEFAULT_EVENT_VERSION,
    timestamp: options.timestamp ?? new Date().toISOString(),
    correlationId: options.correlationId ?? generateCorrelationId(),
    causationId: options.causationId,
    actor: {
      ...DEFAULT_TEST_ACTOR,
      ...options.actor,
    },
    metadata: {
      ...DEFAULT_TEST_METADATA,
      ...options.metadata,
    },
    data,
    priority: options.priority,
    aggregate: options.aggregate,
  };
}

/**
 * Create a test event factory
 *
 * @example
 * ```typescript
 * const factory = createTestEventFactory({
 *   defaultActor: { id: 'test-user', type: 'user' },
 *   defaultMetadata: { source: 'test-service' },
 * });
 *
 * const event = factory.create('TradeProposalCreated', {
 *   tradeId: '123',
 * });
 * ```
 */
export function createTestEventFactory(config?: {
  defaultActor?: Partial<EventActor>;
  defaultMetadata?: Partial<EventMetadata>;
  randomGenerators?: Record<string, () => unknown>;
}): TestEventFactory {
  const defaultActor: EventActor = {
    ...DEFAULT_TEST_ACTOR,
    ...config?.defaultActor,
  };

  const defaultMetadata: EventMetadata = {
    ...DEFAULT_TEST_METADATA,
    ...config?.defaultMetadata,
  };

  return {
    create<T extends BaseEvent>(
      type: T['type'],
      data: T['data'],
      options: TestEventOptions = {}
    ): T {
      return {
        id: options.id ?? generateEventId(),
        type,
        version: options.version ?? DEFAULT_EVENT_VERSION,
        timestamp: options.timestamp ?? new Date().toISOString(),
        correlationId: options.correlationId ?? generateCorrelationId(),
        causationId: options.causationId,
        actor: {
          ...defaultActor,
          ...options.actor,
        },
        metadata: {
          ...defaultMetadata,
          ...options.metadata,
        },
        data,
        priority: options.priority,
        aggregate: options.aggregate,
      } as T;
    },

    createMany<T extends BaseEvent>(
      type: T['type'],
      dataArray: T['data'][],
      options: TestEventOptions = {}
    ): T[] {
      const correlationId = options.correlationId ?? generateCorrelationId();

      return dataArray.map((data, index) =>
        this.create<T>(type, data, {
          ...options,
          correlationId,
          causationId: index > 0 ? undefined : options.causationId,
        })
      );
    },

    createRandom<T extends BaseEvent>(
      type: T['type'],
      overrides: Partial<T['data']> = {},
      options: TestEventOptions = {}
    ): T {
      // Get random generator for this type if available
      const generator = config?.randomGenerators?.[type];
      const randomData: Record<string, unknown> = generator
        ? (generator() as Record<string, unknown>)
        : {};
      const overrideData: Record<string, unknown> = overrides
        ? (overrides as Record<string, unknown>)
        : {};

      return this.create<T>(
        type,
        { ...randomData, ...overrideData } as T['data'],
        options
      );
    },
  };
}

/**
 * Generate a random UUID for testing
 */
export function randomUuid(): string {
  return generateEventId();
}

/**
 * Generate a random string for testing
 */
export function randomString(length = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

/**
 * Generate a random number for testing
 */
export function randomNumber(min = 0, max = 1000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random date for testing
 */
export function randomDate(
  start: Date = new Date(2020, 0, 1),
  end: Date = new Date()
): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

/**
 * Generate a random element from array
 */
export function randomFrom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}
