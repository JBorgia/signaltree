import { BaseEvent, DEFAULT_EVENT_VERSION, EventActor, EventMetadata, EventPriority, EventVersion } from './types';

/**
 * Event Factory - Create events with proper structure
 *
 * Provides:
 * - UUID v7 generation (time-sortable)
 * - Correlation ID management
 * - Event creation with defaults
 * - Type-safe event factories
 */

/**
 * Configuration for event factory
 */
export interface EventFactoryConfig {
  /** Default source for events */
  source: string;
  /** Environment (production, staging, development) */
  environment: string;
  /** Default actor for system events */
  systemActor?: EventActor;
  /** Custom ID generator */
  generateId?: () => string;
  /** Custom correlation ID generator */
  generateCorrelationId?: () => string;
}

/**
 * Event factory for creating typed events
 */
export interface EventFactory<TEvents extends BaseEvent = BaseEvent> {
  /**
   * Create an event with full control
   */
  create<T extends TEvents>(
    type: T['type'],
    data: T['data'],
    options?: CreateEventOptions
  ): T;

  /**
   * Create event with correlation from existing event
   */
  createFromCause<T extends TEvents>(
    type: T['type'],
    data: T['data'],
    cause: BaseEvent,
    options?: Omit<CreateEventOptions, 'correlationId' | 'causationId'>
  ): T;

  /**
   * Get current correlation ID (for request context)
   */
  getCorrelationId(): string | undefined;

  /**
   * Set correlation ID for current context
   */
  setCorrelationId(id: string): void;

  /**
   * Clear correlation ID
   */
  clearCorrelationId(): void;
}

/**
 * Options for creating an event
 */
export interface CreateEventOptions {
  /** Override event ID */
  id?: string;
  /** Correlation ID (request trace) */
  correlationId?: string;
  /** Causation ID (parent event) */
  causationId?: string;
  /** Event actor */
  actor?: EventActor;
  /** Additional metadata */
  metadata?: Partial<EventMetadata>;
  /** Event priority */
  priority?: EventPriority;
  /** Aggregate info */
  aggregate?: { type: string; id: string };
  /** Schema version override */
  version?: EventVersion;
  /** Timestamp override (for testing/replay) */
  timestamp?: string;
}

/**
 * Generate a UUID v7 (time-sortable)
 *
 * UUID v7 format: timestamp (48 bits) + version (4 bits) + random (12 bits) + variant (2 bits) + random (62 bits)
 */
export function generateEventId(): string {
  // Get timestamp in milliseconds
  const timestamp = Date.now();

  // Convert to hex (12 characters for 48 bits)
  const timestampHex = timestamp.toString(16).padStart(12, '0');

  // Generate random bytes
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);

  // Convert to hex
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Construct UUID v7
  // Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
  // Where x is timestamp/random and 7 is version, y is variant (8, 9, a, or b)
  const uuid = [
    timestampHex.slice(0, 8), // time_low
    timestampHex.slice(8, 12), // time_mid
    '7' + randomHex.slice(0, 3), // version (7) + random
    ((parseInt(randomHex.slice(3, 5), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, '0') + randomHex.slice(5, 7), // variant + random
    randomHex.slice(7, 19), // random
  ].join('-');

  return uuid;
}

/**
 * Generate a correlation ID (also UUID v7 for traceability)
 */
export function generateCorrelationId(): string {
  return generateEventId();
}

/**
 * Create a single event
 */
export function createEvent<TType extends string, TData>(
  type: TType,
  data: TData,
  options: CreateEventOptions & {
    source: string;
    environment: string;
  }
): BaseEvent<TType, TData> {
  const id = options.id ?? generateEventId();
  const correlationId = options.correlationId ?? generateCorrelationId();
  const timestamp = options.timestamp ?? new Date().toISOString();

  const actor: EventActor = options.actor ?? {
    id: 'system',
    type: 'system',
  };

  const metadata: EventMetadata = {
    source: options.source,
    environment: options.environment,
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
 * Create an event factory with default configuration
 *
 * @example
 * ```typescript
 * const factory = createEventFactory({
 *   source: 'trade-service',
 *   environment: process.env.NODE_ENV || 'development',
 * });
 *
 * const event = factory.create('TradeProposalCreated', {
 *   tradeId: '123',
 *   initiatorId: 'user-1',
 *   recipientId: 'user-2',
 * }, {
 *   actor: { id: 'user-1', type: 'user' },
 *   priority: 'high',
 * });
 * ```
 */
export function createEventFactory<TEvents extends BaseEvent = BaseEvent>(
  config: EventFactoryConfig
): EventFactory<TEvents> {
  // Thread-local-like storage for correlation ID
  let currentCorrelationId: string | undefined;

  const systemActor: EventActor = config.systemActor ?? {
    id: 'system',
    type: 'system',
    name: config.source,
  };

  const generateId = config.generateId ?? generateEventId;
  const generateCorrelation =
    config.generateCorrelationId ?? generateCorrelationId;

  return {
    create<T extends TEvents>(
      type: T['type'],
      data: T['data'],
      options: CreateEventOptions = {}
    ): T {
      const id = options.id ?? generateId();
      const correlationId =
        options.correlationId ?? currentCorrelationId ?? generateCorrelation();
      const timestamp = options.timestamp ?? new Date().toISOString();

      const actor: EventActor = options.actor ?? systemActor;

      const metadata: EventMetadata = {
        source: config.source,
        environment: config.environment,
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
      } as T;
    },

    createFromCause<T extends TEvents>(
      type: T['type'],
      data: T['data'],
      cause: BaseEvent,
      options: Omit<CreateEventOptions, 'correlationId' | 'causationId'> = {}
    ): T {
      return this.create(type, data, {
        ...options,
        correlationId: cause.correlationId,
        causationId: cause.id,
      });
    },

    getCorrelationId(): string | undefined {
      return currentCorrelationId;
    },

    setCorrelationId(id: string): void {
      currentCorrelationId = id;
    },

    clearCorrelationId(): void {
      currentCorrelationId = undefined;
    },
  };
}
