/**
 * Core event types - framework-agnostic definitions
 */

/**
 * Event priority levels for queue routing and SLA management
 */
export type EventPriority = 'critical' | 'high' | 'normal' | 'low' | 'bulk';

/**
 * Priority configuration with SLA targets
 */
export const EVENT_PRIORITIES: Record<
  EventPriority,
  { sla: number; weight: number }
> = {
  critical: { sla: 100, weight: 10 }, // < 100ms
  high: { sla: 500, weight: 7 }, // < 500ms
  normal: { sla: 2000, weight: 5 }, // < 2s
  low: { sla: 30000, weight: 3 }, // < 30s
  bulk: { sla: 300000, weight: 1 }, // < 5min
};

/**
 * Event schema version for evolution tracking
 */
export interface EventVersion {
  major: number;
  minor: number;
}

export const DEFAULT_EVENT_VERSION: EventVersion = { major: 1, minor: 0 };

/**
 * Actor who triggered the event
 */
export interface EventActor {
  /** User, system, or admin ID */
  id: string;
  /** Type of actor */
  type: 'user' | 'system' | 'admin' | 'webhook';
  /** Optional display name for audit */
  name?: string;
}

/**
 * Event metadata for tracing, audit, and debugging
 */
export interface EventMetadata {
  /** Service/module that emitted the event */
  source: string;
  /** Environment (production, staging, development) */
  environment: string;
  /** Client IP address (for audit) */
  ip?: string;
  /** User agent string (for analytics) */
  userAgent?: string;
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Base event interface - all events must extend this
 *
 * @example
 * ```typescript
 * interface TradeProposalCreated extends BaseEvent {
 *   type: 'TradeProposalCreated';
 *   data: {
 *     tradeId: string;
 *     initiatorId: string;
 *     recipientId: string;
 *   };
 * }
 * ```
 */
export interface BaseEvent<TType extends string = string, TData = unknown> {
  /**
   * Unique event ID (UUID v7 recommended - time-sortable)
   */
  id: string;

  /**
   * Event type in PascalCase (e.g., 'TradeProposalCreated')
   * Must be past tense - events are facts that happened
   */
  type: TType;

  /**
   * Schema version for event evolution
   */
  version: EventVersion;

  /**
   * When the event occurred (ISO 8601)
   */
  timestamp: string;

  /**
   * Request/trace ID for distributed tracing
   * All events from the same user action share this ID
   */
  correlationId: string;

  /**
   * ID of the event that caused this event (for event chains)
   */
  causationId?: string;

  /**
   * Who/what triggered this event
   */
  actor: EventActor;

  /**
   * Event metadata for tracing and audit
   */
  metadata: EventMetadata;

  /**
   * Event-specific payload
   */
  data: TData;

  /**
   * Priority for queue routing
   * @default 'normal'
   */
  priority?: EventPriority;

  /**
   * Aggregate information for event sourcing
   */
  aggregate?: {
    type: string;
    id: string;
  };
}

/**
 * Type helper to extract event data type
 */
export type EventData<T extends BaseEvent> = T['data'];

/**
 * Type helper to extract event type string
 */
export type EventType<T extends BaseEvent> = T['type'];

/**
 * Union type of all registered events (to be extended by apps)
 */
export type AnyEvent = BaseEvent<string, unknown>;
