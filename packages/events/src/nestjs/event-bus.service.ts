import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConnectionOptions, Queue, QueueEvents } from 'bullmq';

import { generateCorrelationId, generateEventId } from '../core/factory';
import { EventRegistry } from '../core/registry';
import { BaseEvent, DEFAULT_EVENT_VERSION, EventActor, EventMetadata, EventPriority, EventVersion } from '../core/types';
import { EventBusModuleConfig, QueueConfig } from './event-bus.module';
import { EVENT_BUS_CONFIG, EVENT_REGISTRY } from './tokens';

/**
 * EventBus Service - Publish events to BullMQ queues
 *
 * Provides:
 * - Event publishing with validation
 * - Priority-based routing
 * - Correlation ID propagation
 * - Metrics collection
 */
/**
 * Options for publishing an event
 */
export interface PublishOptions {
  /** Override event ID */
  id?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Causation ID (parent event) */
  causationId?: string;
  /** Delay before processing (ms) */
  delay?: number;
  /** Override priority */
  priority?: EventPriority;
  /** Specific queue to publish to */
  queue?: string;
  /** Job ID for deduplication */
  jobId?: string;
  /** Custom job options */
  jobOptions?: Record<string, unknown>;
}

/**
 * Result of publishing an event
 */
export interface PublishResult {
  /** Event ID */
  eventId: string;
  /** BullMQ Job ID */
  jobId: string;
  /** Queue the event was published to */
  queue: string;
  /** Correlation ID */
  correlationId: string;
}

/**
 * Options for creating an event via EventBusService.createEvent()
 */
export interface CreateEventServiceOptions {
  /** Override event ID */
  id?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Causation ID (parent event) */
  causationId?: string;
  /** Actor who triggered the event */
  actor?: EventActor;
  /** Additional metadata */
  metadata?: Partial<EventMetadata>;
  /** Event priority */
  priority?: EventPriority;
  /** Schema version override */
  version?: EventVersion;
  /** Aggregate info */
  aggregate?: { type: string; id: string };
  /** Timestamp override (for testing/replay) */
  timestamp?: string;
}

/**
 * Queue wrapper with BullMQ instances
 */
interface QueueInstance {
  config: QueueConfig;
  queue: Queue;
  events?: QueueEvents;
}

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventBusService.name);
  private queues = new Map<string, QueueInstance>();
  private priorityToQueue = new Map<string, string>();
  private connection: ConnectionOptions;
  private isReady = false;

  constructor(
    @Inject(EVENT_BUS_CONFIG) private readonly config: EventBusModuleConfig,
    @Inject(EVENT_REGISTRY) private readonly registry: EventRegistry
  ) {
    this.connection = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      maxRetriesPerRequest: config.redis.maxRetriesPerRequest ?? 3,
    };
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing EventBus queues...');

    // Create queues
    for (const queueConfig of this.config.queues ?? []) {
      const queue = new Queue(queueConfig.name, {
        connection: this.connection,
        defaultJobOptions: {
          removeOnComplete: 1000, // Keep last 1000 completed jobs
          removeOnFail: 5000, // Keep last 5000 failed jobs
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      });

      // Map priorities to this queue
      for (const priority of queueConfig.priorities) {
        this.priorityToQueue.set(priority, queueConfig.name);
      }

      const instance: QueueInstance = {
        config: queueConfig,
        queue,
      };

      // Optionally create queue events listener for monitoring
      if (this.config.enableMetrics) {
        instance.events = new QueueEvents(queueConfig.name, {
          connection: this.connection,
        });

        this.setupQueueEventListeners(instance);
      }

      this.queues.set(queueConfig.name, instance);
      this.logger.log(
        `Queue "${
          queueConfig.name
        }" initialized for priorities: ${queueConfig.priorities.join(', ')}`
      );
    }

    this.isReady = true;
    this.logger.log(`EventBus ready with ${this.queues.size} queues`);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down EventBus...');

    const closePromises: Promise<void>[] = [];

    for (const [name, instance] of this.queues) {
      this.logger.debug(`Closing queue "${name}"...`);
      closePromises.push(instance.queue.close());
      if (instance.events) {
        closePromises.push(instance.events.close());
      }
    }

    await Promise.all(closePromises);
    this.queues.clear();
    this.isReady = false;
    this.logger.log('EventBus shutdown complete');
  }

  /**
   * Publish an event
   *
   * @example
   * ```typescript
   * await eventBus.publish({
   *   type: 'TradeProposalCreated',
   *   data: {
   *     tradeId: '123',
   *     initiatorId: 'user-1',
   *     recipientId: 'user-2',
   *   },
   * });
   * ```
   */
  async publish<T extends BaseEvent>(
    event: Omit<T, 'id' | 'timestamp'> & Partial<Pick<T, 'id' | 'timestamp'>>,
    options: PublishOptions = {}
  ): Promise<PublishResult> {
    if (!this.isReady) {
      throw new Error('EventBus is not ready. Wait for module initialization.');
    }

    // Build complete event
    const eventId = options.id ?? event.id ?? generateEventId();
    const correlationId =
      options.correlationId ?? event.correlationId ?? generateCorrelationId();
    const timestamp = event.timestamp ?? new Date().toISOString();

    const fullEvent: BaseEvent = {
      ...event,
      id: eventId,
      correlationId,
      causationId: options.causationId ?? event.causationId,
      timestamp,
      priority: options.priority ?? event.priority ?? 'normal',
    } as BaseEvent;

    // Validate event against registry
    const validated = this.registry.validate(fullEvent);

    // Determine queue based on priority
    const priority = validated.priority ?? 'normal';
    const queueName = options.queue ?? this.getQueueForPriority(priority);
    const instance = this.queues.get(queueName);

    if (!instance) {
      throw new Error(
        `Queue "${queueName}" not found. Available: ${Array.from(
          this.queues.keys()
        ).join(', ')}`
      );
    }

    // Publish to BullMQ
    const jobId = options.jobId ?? eventId;
    const job = await instance.queue.add(
      validated.type, // Job name = event type
      validated,
      {
        jobId,
        delay: options.delay,
        priority: this.getPriorityNumber(priority),
        ...options.jobOptions,
      }
    );

    this.logger.debug(
      `Published event ${validated.type}:${eventId} to queue ${queueName} (job: ${job.id})`
    );

    return {
      eventId,
      jobId: job.id ?? eventId,
      queue: queueName,
      correlationId,
    };
  }

  /**
   * Create an event with defaults from module configuration
   *
   * This is a convenience method that auto-fills id, timestamp, version,
   * correlationId, and metadata.source from the module config.
   *
   * @example
   * ```typescript
   * // Instead of constructing the full event manually:
   * const event = this.eventBus.createEvent('TradeProposalCreated', {
   *   tradeId: '123',
   *   initiatorId: 'user-1',
   *   recipientId: 'user-2',
   * }, {
   *   actor: { id: userId, type: 'user' },
   *   priority: 'high',
   * });
   *
   * await this.eventBus.publish(event);
   * ```
   */
  createEvent<TType extends string, TData>(
    type: TType,
    data: TData,
    options: CreateEventServiceOptions = {}
  ): BaseEvent<TType, TData> {
    const id = options.id ?? generateEventId();
    const correlationId = options.correlationId ?? generateCorrelationId();
    const timestamp = options.timestamp ?? new Date().toISOString();

    const actor: EventActor = options.actor ?? {
      id: 'system',
      type: 'system',
    };

    const metadata: EventMetadata = {
      source: this.config.source ?? 'signaltree',
      environment: this.config.environment ?? process.env['NODE_ENV'] ?? 'development',
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
   * Convenience method to create and publish an event in one call
   *
   * Combines createEvent() and publish() for the common case.
   *
   * @example
   * ```typescript
   * await this.eventBus.publishEvent('TradeProposalCreated', {
   *   tradeId: '123',
   *   initiatorId: 'user-1',
   * }, {
   *   actor: { id: userId, type: 'user' },
   *   priority: 'high',
   * });
   * ```
   */
  async publishEvent<TType extends string, TData>(
    type: TType,
    data: TData,
    options: CreateEventServiceOptions & Pick<PublishOptions, 'delay' | 'queue' | 'jobId' | 'jobOptions'> = {}
  ): Promise<PublishResult> {
    const event = this.createEvent(type, data, options);
    return this.publish(event, {
      delay: options.delay,
      queue: options.queue,
      jobId: options.jobId,
      jobOptions: options.jobOptions,
      priority: options.priority,
    });
  }

  /**
   * Publish multiple events in a batch
   */
  async publishBatch<T extends BaseEvent>(
    events: Array<
      Omit<T, 'id' | 'timestamp'> & Partial<Pick<T, 'id' | 'timestamp'>>
    >,
    options: Omit<PublishOptions, 'id' | 'jobId'> = {}
  ): Promise<PublishResult[]> {
    // Use same correlation ID for all events in batch
    const correlationId = options.correlationId ?? generateCorrelationId();

    const results = await Promise.all(
      events.map((event, index) =>
        this.publish(event, {
          ...options,
          correlationId,
          causationId: index > 0 ? events[index - 1].id : options.causationId,
        })
      )
    );

    return results;
  }

  /**
   * Get queue for a given priority
   */
  getQueueForPriority(priority: EventPriority): string {
    const queueName = this.priorityToQueue.get(priority);
    if (!queueName) {
      // Fall back to normal queue
      return this.priorityToQueue.get('normal') ?? 'events-normal';
    }
    return queueName;
  }

  /**
   * Get queue stats
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const instance = this.queues.get(queueName);
    if (!instance) {
      throw new Error(`Queue "${queueName}" not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      instance.queue.getWaitingCount(),
      instance.queue.getActiveCount(),
      instance.queue.getCompletedCount(),
      instance.queue.getFailedCount(),
      instance.queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Get all queue names
   */
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get underlying BullMQ queue for advanced operations
   */
  getQueue(name: string): Queue | undefined {
    return this.queues.get(name)?.queue;
  }

  /**
   * Check if service is ready
   */
  isServiceReady(): boolean {
    return this.isReady;
  }

  /**
   * Convert priority string to number for BullMQ (lower = higher priority)
   */
  private getPriorityNumber(priority: EventPriority): number {
    switch (priority) {
      case 'critical':
        return 1;
      case 'high':
        return 2;
      case 'normal':
        return 3;
      case 'low':
        return 4;
      case 'bulk':
        return 5;
      default:
        return 3;
    }
  }

  /**
   * Setup event listeners for monitoring
   */
  private setupQueueEventListeners(instance: QueueInstance): void {
    if (!instance.events) return;

    instance.events.on('completed', ({ jobId }) => {
      this.logger.debug(
        `Job ${jobId} completed in queue ${instance.config.name}`
      );
    });

    instance.events.on('failed', ({ jobId, failedReason }) => {
      this.logger.warn(
        `Job ${jobId} failed in queue ${instance.config.name}: ${failedReason}`
      );
    });

    instance.events.on('stalled', ({ jobId }) => {
      this.logger.warn(`Job ${jobId} stalled in queue ${instance.config.name}`);
    });
  }
}
