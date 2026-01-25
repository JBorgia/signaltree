import { ZodIssue, ZodTypeAny } from 'zod';

import { BaseEvent, EventPriority } from './types';

/**
 * Event Registry - Central catalog of all registered event types
 *
 * Provides:
 * - Type-safe event registration
 * - Schema lookup by event type
 * - Validation helpers
 * - Event catalog for documentation
 */

/**
 * Configuration for a registered event
 */
export interface RegisteredEvent<T extends ZodTypeAny = ZodTypeAny> {
  /** Event type string */
  type: string;
  /** Zod schema for validation */
  schema: T;
  /** Default priority for this event type */
  priority: EventPriority;
  /** Human-readable description */
  description?: string;
  /** Event category for grouping */
  category?: string;
  /** Whether this event is deprecated */
  deprecated?: boolean;
  /** Deprecation message if deprecated */
  deprecationMessage?: string;
}

/**
 * Event registry configuration
 */
export interface EventRegistryConfig {
  /** Strict mode - throw on unknown events */
  strict?: boolean;
  /** Log warnings for deprecated events */
  warnOnDeprecated?: boolean;
}

/**
 * Event catalog entry for documentation
 */
export interface EventCatalogEntry {
  type: string;
  category?: string;
  priority: EventPriority;
  description?: string;
  deprecated: boolean;
}

/**
 * Full event catalog
 */
export type EventCatalog = EventCatalogEntry[];

/**
 * Event Registry class - manages all registered event types
 *
 * @example
 * ```typescript
 * const registry = createEventRegistry();
 *
 * // Register events
 * registry.register({
 *   type: 'TradeProposalCreated',
 *   schema: TradeProposalCreatedSchema,
 *   priority: 'high',
 *   description: 'Emitted when a user proposes a trade',
 *   category: 'trade',
 * });
 *
 * // Validate events
 * const validated = registry.validate(rawEvent);
 *
 * // Get schema for event type
 * const schema = registry.getSchema('TradeProposalCreated');
 * ```
 */
export class EventRegistry {
  private readonly events = new Map<string, RegisteredEvent>();
  private readonly config: Required<EventRegistryConfig>;

  constructor(config: EventRegistryConfig = {}) {
    this.config = {
      strict: config.strict ?? false,
      warnOnDeprecated: config.warnOnDeprecated ?? true,
    };
  }

  /**
   * Register an event type with its schema
   */
  register<T extends ZodTypeAny>(event: RegisteredEvent<T>): this {
    if (this.events.has(event.type)) {
      throw new Error(`Event type '${event.type}' is already registered`);
    }
    this.events.set(event.type, event);
    return this;
  }

  /**
   * Register multiple events at once
   */
  registerMany(events: RegisteredEvent[]): this {
    for (const event of events) {
      this.register(event);
    }
    return this;
  }

  /**
   * Get schema for an event type
   */
  getSchema(type: string): ZodTypeAny | undefined {
    return this.events.get(type)?.schema;
  }

  /**
   * Get registered event info
   */
  getEvent(type: string): RegisteredEvent | undefined {
    return this.events.get(type);
  }

  /**
   * Check if event type is registered
   */
  has(type: string): boolean {
    return this.events.has(type);
  }

  /**
   * Get default priority for event type
   */
  getPriority(type: string): EventPriority {
    return this.events.get(type)?.priority ?? 'normal';
  }

  /**
   * Validate an event against its registered schema
   *
   * @throws Error if event type is unknown (in strict mode) or validation fails
   */
  validate<T extends BaseEvent = BaseEvent>(event: unknown): T {
    if (typeof event !== 'object' || event === null) {
      throw new Error('Event must be an object');
    }

    const eventObj = event as Record<string, unknown>;
    const type = eventObj['type'] as string;

    if (!type) {
      throw new Error('Event must have a type field');
    }

    const registered = this.events.get(type);

    if (!registered) {
      if (this.config.strict) {
        throw new Error(`Unknown event type: ${type}`);
      }
      // In non-strict mode, return as-is (no validation)
      return event as T;
    }

    // Warn about deprecated events
    if (registered.deprecated && this.config.warnOnDeprecated) {
      console.warn(
        `[EventRegistry] Event '${type}' is deprecated. ${
          registered.deprecationMessage ?? ''
        }`
      );
    }

    const result = registered.schema.safeParse(event);

    if (!result.success) {
      const errors = result.error.issues.map(
        (i: ZodIssue) => `${i.path.join('.')}: ${i.message}`
      );
      throw new Error(
        `Event validation failed for '${type}': ${errors.join(', ')}`
      );
    }

    return result.data as T;
  }

  /**
   * Check if event is valid without throwing
   */
  isValid(event: unknown): boolean {
    try {
      this.validate(event);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all registered event types
   */
  getAllTypes(): string[] {
    return Array.from(this.events.keys());
  }

  /**
   * Get all registered events
   */
  getAll(): RegisteredEvent[] {
    return Array.from(this.events.values());
  }

  /**
   * Get events by category
   */
  getByCategory(category: string): RegisteredEvent[] {
    return this.getAll().filter((e) => e.category === category);
  }

  /**
   * Get event catalog for documentation
   */
  getCatalog(): EventCatalog {
    return this.getAll().map((e) => ({
      type: e.type,
      category: e.category,
      priority: e.priority,
      description: e.description,
      deprecated: e.deprecated ?? false,
    }));
  }

  /**
   * Export registry as JSON schema (for external tools)
   */
  toJSONSchema(): Record<string, unknown> {
    const schemas: Record<string, unknown> = {};

    for (const [type, event] of this.events) {
      // Note: This is a simplified JSON schema export
      // For full compatibility, use zod-to-json-schema package
      schemas[type] = {
        type: 'object',
        description: event.description,
        deprecated: event.deprecated,
        priority: event.priority,
        category: event.category,
      };
    }

    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Event Registry',
      definitions: schemas,
    };
  }
}

/**
 * Create a new event registry
 */
export function createEventRegistry(
  config?: EventRegistryConfig
): EventRegistry {
  return new EventRegistry(config);
}

/**
 * Get schema for an event type from a registry
 */
export function getEventSchema(
  registry: EventRegistry,
  type: string
): ZodTypeAny | undefined {
  return registry.getSchema(type);
}

/**
 * Get all registered event types from a registry
 */
export function getAllEventTypes(registry: EventRegistry): string[] {
  return registry.getAllTypes();
}
