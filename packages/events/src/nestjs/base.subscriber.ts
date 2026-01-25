import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConnectionOptions, Job, Worker } from 'bullmq';

import { ClassificationResult } from '../core/error-classification';
import { IdempotencyCheckResult, IdempotencyStore } from '../core/idempotency';
import { BaseEvent, EventPriority } from '../core/types';
import { DlqService } from './dlq.service';
import { EventBusModuleConfig } from './event-bus.module';
import { ERROR_CLASSIFIER, EVENT_BUS_CONFIG, IDEMPOTENCY_STORE } from './tokens';

/**
 * Base Subscriber - Abstract class for event subscribers
 *
 * Provides:
 * - Automatic idempotency checking
 * - Retry with exponential backoff
 * - Error classification and DLQ routing
 * - Metrics collection
 * - Graceful shutdown
 */
/**
 * Subscriber configuration
 */
export interface SubscriberConfig {
  /** Unique subscriber name */
  name: string;
  /** Event types to subscribe to */
  eventTypes: string[];
  /** Queue to process from (or use priority to auto-select) */
  queue?: string;
  /** Priority level (used to select queue if queue not specified) */
  priority?: EventPriority;
  /** Number of concurrent jobs to process */
  concurrency?: number;
  /** Lock duration in ms (how long a job is locked while processing) */
  lockDuration?: number;
  /** Stalled check interval in ms */
  stalledInterval?: number;
  /** Enable idempotency checking (default: true) */
  idempotency?: boolean;
  /** Skip DLQ for this subscriber */
  skipDlq?: boolean;
}

/**
 * Result of processing an event
 */
export interface ProcessingResult {
  /** Whether processing succeeded */
  success: boolean;
  /** Optional result data (stored for idempotent responses) */
  result?: unknown;
  /** Error if failed */
  error?: Error;
  /** Whether to skip DLQ (useful for expected failures) */
  skipDlq?: boolean;
  /** Custom retry delay override */
  retryDelay?: number;
}

/**
 * Subscriber metrics
 */
export interface SubscriberMetrics {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  dlqSent: number;
  duplicatesSkipped: number;
  avgProcessingTimeMs: number;
  lastProcessedAt?: Date;
}

/**
 * Base class for event subscribers
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class TradeSubscriber extends BaseSubscriber {
 *   protected readonly config: SubscriberConfig = {
 *     name: 'trade-subscriber',
 *     eventTypes: ['TradeProposalCreated', 'TradeAccepted'],
 *     priority: 'high',
 *     concurrency: 5,
 *   };
 *
 *   async handle(event: TradeProposalCreated | TradeAccepted): Promise<ProcessingResult> {
 *     switch (event.type) {
 *       case 'TradeProposalCreated':
 *         await this.handleTradeCreated(event);
 *         break;
 *       case 'TradeAccepted':
 *         await this.handleTradeAccepted(event);
 *         break;
 *     }
 *     return { success: true };
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class BaseSubscriber<TEvent extends BaseEvent = BaseEvent>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger: Logger;
  protected abstract readonly config: SubscriberConfig;

  private worker?: Worker;
  private connection: ConnectionOptions;
  private metrics: SubscriberMetrics = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    dlqSent: 0,
    duplicatesSkipped: 0,
    avgProcessingTimeMs: 0,
  };

  constructor(
    @Inject(EVENT_BUS_CONFIG)
    protected readonly busConfig: EventBusModuleConfig,
    @Inject(IDEMPOTENCY_STORE)
    protected readonly idempotencyStore: IdempotencyStore,
    @Inject(ERROR_CLASSIFIER)
    protected readonly errorClassifier: {
      classify: (e: unknown) => ClassificationResult;
    },
    protected readonly dlqService: DlqService
  ) {
    this.logger = new Logger(this.constructor.name);
    this.connection = {
      host: busConfig.redis.host,
      port: busConfig.redis.port,
      password: busConfig.redis.password,
      db: busConfig.redis.db,
    };
  }

  /**
   * Handle the event - implement in subclass
   */
  protected abstract handle(event: TEvent): Promise<ProcessingResult>;

  /**
   * Called before processing starts (for setup/validation)
   */
  protected async beforeProcess(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _event: TEvent
  ): Promise<void> {
    // Override in subclass if needed
  }

  /**
   * Called after processing completes (for cleanup)
   */
  protected async afterProcess(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _event: TEvent,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _result: ProcessingResult
  ): Promise<void> {
    // Override in subclass if needed
  }

  async onModuleInit(): Promise<void> {
    const queueName = this.getQueueName();
    this.logger.log(
      `Initializing subscriber "${this.config.name}" on queue "${queueName}" ` +
        `for events: ${this.config.eventTypes.join(', ')}`
    );

    this.worker = new Worker(
      queueName,
      async (job: Job<TEvent>) => this.processJob(job),
      {
        connection: this.connection,
        concurrency: this.config.concurrency ?? 5,
        lockDuration: this.config.lockDuration ?? 30000,
        stalledInterval: this.config.stalledInterval ?? 30000,
      }
    );

    this.setupWorkerListeners();
    this.logger.log(`Subscriber "${this.config.name}" started`);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log(`Shutting down subscriber "${this.config.name}"...`);

    if (this.worker) {
      await this.worker.close();
    }

    this.logger.log(`Subscriber "${this.config.name}" stopped`);
  }

  /**
   * Get queue name based on config
   */
  protected getQueueName(): string {
    if (this.config.queue) {
      return this.config.queue;
    }

    // Find queue for priority
    const priority = this.config.priority ?? 'normal';
    const queueConfig = this.busConfig.queues?.find((q) =>
      q.priorities.includes(priority)
    );

    return queueConfig?.name ?? `events-${priority}`;
  }

  /**
   * Process a job with idempotency and error handling
   */
  private async processJob(job: Job<TEvent>): Promise<unknown> {
    const event = job.data;
    const startTime = Date.now();

    // Filter by event type
    if (!this.config.eventTypes.includes(event.type)) {
      // Not our event type, skip silently
      return { skipped: true, reason: 'event_type_not_handled' };
    }

    this.logger.debug(
      `Processing event ${event.type}:${event.id} (attempt ${
        job.attemptsMade + 1
      })`
    );

    try {
      // Check idempotency
      if (this.config.idempotency !== false) {
        const idempotencyResult = await this.checkIdempotency(event);
        if (idempotencyResult.isDuplicate) {
          this.metrics.duplicatesSkipped++;
          this.logger.debug(`Skipping duplicate event ${event.id}`);
          return (
            idempotencyResult.result ?? { skipped: true, reason: 'duplicate' }
          );
        }
      }

      // Before hook
      await this.beforeProcess(event);

      // Process event
      const result = await this.handle(event);

      // After hook
      await this.afterProcess(event, result);

      // Update idempotency store
      if (this.config.idempotency !== false) {
        await this.idempotencyStore.markCompleted(
          event,
          this.config.name,
          result.result
        );
      }

      // Update metrics
      this.updateMetrics(startTime, true);

      return result.result;
    } catch (error) {
      return this.handleError(job, event, error, startTime);
    }
  }

  /**
   * Handle processing error
   */
  private async handleError(
    job: Job<TEvent>,
    event: TEvent,
    error: unknown,
    startTime: number
  ): Promise<unknown> {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const classification = this.errorClassifier.classify(error);

    this.logger.error(
      `Error processing event ${event.type}:${event.id}: ${errorObj.message}`,
      errorObj.stack
    );

    // Update idempotency store with failure
    if (this.config.idempotency !== false) {
      await this.idempotencyStore.markFailed(event, this.config.name, error);
    }

    // Check if we should retry
    const maxAttempts = classification.retryConfig?.maxAttempts ?? 5;
    const shouldRetry =
      job.attemptsMade < maxAttempts &&
      classification.classification !== 'poison';

    if (shouldRetry) {
      this.metrics.retried++;
      this.logger.debug(
        `Will retry event ${event.id}, attempt ${
          job.attemptsMade + 1
        }/${maxAttempts}`
      );
      throw errorObj; // BullMQ will retry
    }

    // Send to DLQ
    if (this.busConfig.enableDlq && !this.config.skipDlq) {
      await this.sendToDlq(
        event,
        errorObj,
        classification,
        job.attemptsMade + 1
      );
    }

    // Update metrics
    this.updateMetrics(startTime, false);

    // Don't throw - we've handled it by sending to DLQ
    return {
      failed: true,
      error: errorObj.message,
      sentToDlq: true,
    };
  }

  /**
   * Check idempotency
   */
  private async checkIdempotency(
    event: TEvent
  ): Promise<IdempotencyCheckResult> {
    return this.idempotencyStore.check(event, this.config.name, {
      acquireLock: true,
      lockTtlMs: this.config.lockDuration ?? 30000,
    });
  }

  /**
   * Send failed event to DLQ
   */
  private async sendToDlq(
    event: TEvent,
    error: Error,
    classification: ClassificationResult,
    attempts: number
  ): Promise<void> {
    await this.dlqService.send({
      event,
      error: {
        message: error.message,
        stack: error.stack,
        classification: classification.classification,
        reason: classification.reason,
      },
      subscriber: this.config.name,
      attempts,
      failedAt: new Date().toISOString(),
    });

    this.metrics.dlqSent++;
    this.logger.warn(
      `Event ${event.id} sent to DLQ after ${attempts} attempts. ` +
        `Classification: ${classification.classification}`
    );
  }

  /**
   * Update metrics
   */
  private updateMetrics(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;
    this.metrics.processed++;

    if (success) {
      this.metrics.succeeded++;
    } else {
      this.metrics.failed++;
    }

    // Rolling average
    this.metrics.avgProcessingTimeMs =
      (this.metrics.avgProcessingTimeMs * (this.metrics.processed - 1) +
        duration) /
      this.metrics.processed;

    this.metrics.lastProcessedAt = new Date();
  }

  /**
   * Setup worker event listeners
   */
  private setupWorkerListeners(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Job ${job.id} completed`);
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      this.logger.warn(`Job ${job?.id} failed: ${error.message}`);
    });

    this.worker.on('error', (error: Error) => {
      this.logger.error(`Worker error: ${error.message}`, error.stack);
    });

    this.worker.on('stalled', (jobId: string) => {
      this.logger.warn(`Job ${jobId} stalled`);
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): SubscriberMetrics {
    return { ...this.metrics };
  }

  /**
   * Pause processing
   */
  async pause(): Promise<void> {
    if (this.worker) {
      await this.worker.pause();
      this.logger.log(`Subscriber "${this.config.name}" paused`);
    }
  }

  /**
   * Resume processing
   */
  async resume(): Promise<void> {
    if (this.worker) {
      this.worker.resume();
      this.logger.log(`Subscriber "${this.config.name}" resumed`);
    }
  }

  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.worker?.isRunning() ?? false;
  }
}
