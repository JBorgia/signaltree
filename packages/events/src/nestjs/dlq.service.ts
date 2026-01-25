import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { ErrorClassification } from '../core/error-classification';
import { BaseEvent } from '../core/types';
import { EventBusModuleConfig } from './event-bus.module';
import { EVENT_BUS_CONFIG } from './tokens';

/**
 * DLQ Service - Dead Letter Queue management
 *
 * Provides:
 * - Send failed events to DLQ
 * - Query and inspect DLQ entries
 * - Replay events from DLQ
 * - Purge old entries
 */
/**
 * Entry in the Dead Letter Queue
 */
export interface DlqEntry<TEvent extends BaseEvent = BaseEvent> {
  /** The failed event */
  event: TEvent;
  /** Error information */
  error: {
    message: string;
    stack?: string;
    classification: ErrorClassification;
    reason: string;
  };
  /** Subscriber that failed */
  subscriber: string;
  /** Number of attempts before giving up */
  attempts: number;
  /** When the event was sent to DLQ */
  failedAt: string;
  /** Original queue the event was in */
  originalQueue?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Options for querying DLQ
 */
export interface DlqQueryOptions {
  /** Filter by event type */
  eventType?: string;
  /** Filter by subscriber */
  subscriber?: string;
  /** Filter by error classification */
  classification?: ErrorClassification;
  /** Filter by date range */
  from?: Date;
  to?: Date;
  /** Pagination */
  start?: number;
  end?: number;
}

/**
 * DLQ statistics
 */
export interface DlqStats {
  total: number;
  byEventType: Record<string, number>;
  bySubscriber: Record<string, number>;
  byClassification: Record<ErrorClassification, number>;
  oldestEntry?: Date;
  newestEntry?: Date;
}

@Injectable()
export class DlqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DlqService.name);
  private queue?: Queue;
  private queueName: string;

  constructor(
    @Inject(EVENT_BUS_CONFIG) private readonly config: EventBusModuleConfig
  ) {
    this.queueName = config.dlqQueueName ?? 'dead-letter';
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.enableDlq) {
      this.logger.log('DLQ is disabled');
      return;
    }

    this.queue = new Queue(this.queueName, {
      connection: {
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
      },
      defaultJobOptions: {
        removeOnComplete: false, // Keep for inspection
        removeOnFail: false,
        attempts: 1, // No retries in DLQ
      },
    });

    this.logger.log(`DLQ "${this.queueName}" initialized`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
    }
  }

  /**
   * Send an event to the DLQ
   */
  async send(entry: DlqEntry): Promise<string> {
    if (!this.queue) {
      throw new Error('DLQ is not initialized');
    }

    const job = await this.queue.add(`dlq:${entry.event.type}`, entry, {
      jobId: `dlq:${entry.event.id}:${entry.subscriber}`,
    });

    this.logger.debug(`Event ${entry.event.id} sent to DLQ (job: ${job.id})`);
    return job.id ?? `dlq:${entry.event.id}:${entry.subscriber}`;
  }

  /**
   * Get entries from DLQ
   */
  async getEntries(options: DlqQueryOptions = {}): Promise<DlqEntry[]> {
    if (!this.queue) {
      return [];
    }

    const start = options.start ?? 0;
    const end = options.end ?? 100;

    const jobs = await this.queue.getJobs(
      ['waiting', 'active', 'delayed', 'failed'],
      start,
      end
    );

    let entries = jobs.map((job) => job.data as DlqEntry);

    // Apply filters
    if (options.eventType) {
      entries = entries.filter((e) => e.event.type === options.eventType);
    }
    if (options.subscriber) {
      entries = entries.filter((e) => e.subscriber === options.subscriber);
    }
    if (options.classification) {
      entries = entries.filter(
        (e) => e.error.classification === options.classification
      );
    }
    if (options.from) {
      const fromDate = options.from;
      entries = entries.filter((e) => new Date(e.failedAt) >= fromDate);
    }
    if (options.to) {
      const toDate = options.to;
      entries = entries.filter((e) => new Date(e.failedAt) <= toDate);
    }

    return entries;
  }

  /**
   * Get a specific entry by event ID
   */
  async getEntry(
    eventId: string,
    subscriber?: string
  ): Promise<DlqEntry | null> {
    if (!this.queue) {
      return null;
    }

    // Try with subscriber suffix first
    if (subscriber) {
      const job = await this.queue.getJob(`dlq:${eventId}:${subscriber}`);
      if (job) {
        return job.data as DlqEntry;
      }
    }

    // Search through jobs
    const jobs = await this.queue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
    ]);
    const job = jobs.find((j) => (j.data as DlqEntry).event.id === eventId);

    return job ? (job.data as DlqEntry) : null;
  }

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<DlqStats> {
    const entries = await this.getEntries({ start: 0, end: 10000 });

    const stats: DlqStats = {
      total: entries.length,
      byEventType: {},
      bySubscriber: {},
      byClassification: {
        transient: 0,
        permanent: 0,
        poison: 0,
        unknown: 0,
      },
    };

    for (const entry of entries) {
      // By event type
      stats.byEventType[entry.event.type] =
        (stats.byEventType[entry.event.type] ?? 0) + 1;

      // By subscriber
      stats.bySubscriber[entry.subscriber] =
        (stats.bySubscriber[entry.subscriber] ?? 0) + 1;

      // By classification
      stats.byClassification[entry.error.classification]++;

      // Date tracking
      const failedDate = new Date(entry.failedAt);
      if (!stats.oldestEntry || failedDate < stats.oldestEntry) {
        stats.oldestEntry = failedDate;
      }
      if (!stats.newestEntry || failedDate > stats.newestEntry) {
        stats.newestEntry = failedDate;
      }
    }

    return stats;
  }

  /**
   * Replay an event from DLQ
   *
   * This removes the event from DLQ and republishes to original queue
   */
  async replay(
    eventId: string,
    subscriber: string,
    targetQueue: string
  ): Promise<boolean> {
    if (!this.queue) {
      throw new Error('DLQ is not initialized');
    }

    const jobId = `dlq:${eventId}:${subscriber}`;
    const job = await this.queue.getJob(jobId);

    if (!job) {
      this.logger.warn(`DLQ entry not found: ${jobId}`);
      return false;
    }

    const entry = job.data as DlqEntry;

    // Get target queue
    const targetQueueInstance = new Queue(targetQueue, {
      connection: {
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
      },
    });

    try {
      // Republish to original queue
      await targetQueueInstance.add(entry.event.type, entry.event, {
        jobId: `replay:${entry.event.id}`,
      });

      // Remove from DLQ
      await job.remove();

      this.logger.log(`Replayed event ${eventId} to queue ${targetQueue}`);
      return true;
    } finally {
      await targetQueueInstance.close();
    }
  }

  /**
   * Replay all events matching criteria
   */
  async replayBatch(
    options: DlqQueryOptions & { targetQueue: string }
  ): Promise<{ replayed: number; failed: number }> {
    const entries = await this.getEntries(options);
    let replayed = 0;
    let failed = 0;

    for (const entry of entries) {
      try {
        const success = await this.replay(
          entry.event.id,
          entry.subscriber,
          options.targetQueue
        );
        if (success) replayed++;
        else failed++;
      } catch {
        failed++;
      }
    }

    return { replayed, failed };
  }

  /**
   * Remove an entry from DLQ
   */
  async remove(eventId: string, subscriber: string): Promise<boolean> {
    if (!this.queue) {
      return false;
    }

    const job = await this.queue.getJob(`dlq:${eventId}:${subscriber}`);
    if (job) {
      await job.remove();
      return true;
    }

    return false;
  }

  /**
   * Purge old entries from DLQ
   */
  async purge(olderThan: Date): Promise<number> {
    const entries = await this.getEntries({
      to: olderThan,
      start: 0,
      end: 10000,
    });
    let purged = 0;

    for (const entry of entries) {
      const removed = await this.remove(entry.event.id, entry.subscriber);
      if (removed) purged++;
    }

    this.logger.log(
      `Purged ${purged} entries from DLQ older than ${olderThan.toISOString()}`
    );
    return purged;
  }

  /**
   * Clear all entries from DLQ
   */
  async clear(): Promise<number> {
    if (!this.queue) {
      return 0;
    }

    const count = await this.queue.getJobCounts();
    const total = count.waiting + count.active + count.delayed + count.failed;

    await this.queue.obliterate({ force: true });

    this.logger.warn(`Cleared all ${total} entries from DLQ`);
    return total;
  }
}
