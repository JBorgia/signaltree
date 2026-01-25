import { BaseEvent } from './types';

/**
 * Idempotency Store - Prevent duplicate event processing
 *
 * Provides:
 * - Idempotency key checking
 * - In-memory implementation (for testing/development)
 * - Redis implementation (production)
 * - Distributed lock support
 */

/**
 * Result of checking idempotency
 */
export interface IdempotencyCheckResult {
  /** Whether this event has already been processed */
  isDuplicate: boolean;
  /** If duplicate, when was it originally processed */
  processedAt?: Date;
  /** If duplicate, what was the result */
  result?: unknown;
  /** Lock acquired for processing */
  lockAcquired?: boolean;
}

/**
 * Record of a processed event
 */
export interface ProcessedEventRecord {
  /** Event ID */
  eventId: string;
  /** Event type */
  eventType: string;
  /** When processing started */
  startedAt: Date;
  /** When processing completed */
  completedAt?: Date;
  /** Processing result (success/failure) */
  status: 'processing' | 'completed' | 'failed';
  /** Result data (for idempotent responses) */
  result?: unknown;
  /** Error if failed */
  error?: string;
  /** Consumer/subscriber that processed the event */
  consumer: string;
  /** Number of processing attempts */
  attempts: number;
}

/**
 * Idempotency store interface
 *
 * Implementations must be atomic and handle concurrent access
 */
export interface IdempotencyStore {
  /**
   * Check if event has been processed and optionally acquire a processing lock
   *
   * @param event - Event to check
   * @param consumer - Consumer/subscriber identifier
   * @param options - Check options
   * @returns Check result with duplicate status and optional lock
   */
  check(
    event: BaseEvent,
    consumer: string,
    options?: IdempotencyCheckOptions
  ): Promise<IdempotencyCheckResult>;

  /**
   * Mark event as being processed (acquire lock)
   *
   * @param event - Event being processed
   * @param consumer - Consumer/subscriber identifier
   * @param ttlMs - Lock TTL in milliseconds
   */
  markProcessing(
    event: BaseEvent,
    consumer: string,
    ttlMs?: number
  ): Promise<boolean>;

  /**
   * Mark event as successfully processed
   *
   * @param event - Processed event
   * @param consumer - Consumer/subscriber identifier
   * @param result - Optional result data for idempotent responses
   * @param ttlMs - How long to keep the record
   */
  markCompleted(
    event: BaseEvent,
    consumer: string,
    result?: unknown,
    ttlMs?: number
  ): Promise<void>;

  /**
   * Mark event as failed
   *
   * @param event - Failed event
   * @param consumer - Consumer/subscriber identifier
   * @param error - Error information
   */
  markFailed(event: BaseEvent, consumer: string, error: unknown): Promise<void>;

  /**
   * Release processing lock without marking completed
   * (Used when you want to allow retry)
   *
   * @param event - Event to release
   * @param consumer - Consumer/subscriber identifier
   */
  releaseLock(event: BaseEvent, consumer: string): Promise<void>;

  /**
   * Get processing record for an event
   */
  getRecord(
    eventId: string,
    consumer: string
  ): Promise<ProcessedEventRecord | null>;

  /**
   * Clean up expired records (for stores that don't auto-expire)
   */
  cleanup?(): Promise<number>;
}

/**
 * Options for idempotency check
 */
export interface IdempotencyCheckOptions {
  /** Acquire a processing lock if not duplicate */
  acquireLock?: boolean;
  /** Lock TTL in milliseconds (default: 30000) */
  lockTtlMs?: number;
}

/**
 * Configuration for in-memory idempotency store
 */
export interface InMemoryIdempotencyStoreConfig {
  /** Default TTL for records in milliseconds (default: 24 hours) */
  defaultTtlMs?: number;
  /** Default lock TTL in milliseconds (default: 30 seconds) */
  defaultLockTtlMs?: number;
  /** Maximum number of records to keep (LRU eviction) */
  maxRecords?: number;
  /** Cleanup interval in milliseconds (default: 60 seconds) */
  cleanupIntervalMs?: number;
}

/**
 * In-memory idempotency store
 *
 * Best for:
 * - Development and testing
 * - Single-instance deployments
 * - Short-lived processes
 *
 * NOT recommended for:
 * - Production multi-instance deployments
 * - Long-running processes with many events
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private records = new Map<
    string,
    ProcessedEventRecord & { expiresAt: number }
  >();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  private readonly defaultTtlMs: number;
  private readonly defaultLockTtlMs: number;
  private readonly maxRecords: number;

  constructor(config: InMemoryIdempotencyStoreConfig = {}) {
    this.defaultTtlMs = config.defaultTtlMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.defaultLockTtlMs = config.defaultLockTtlMs ?? 30 * 1000; // 30 seconds
    this.maxRecords = config.maxRecords ?? 100000;

    if (config.cleanupIntervalMs !== 0) {
      const interval = config.cleanupIntervalMs ?? 60 * 1000;
      this.cleanupTimer = setInterval(() => this.cleanup(), interval);
    }
  }

  private makeKey(eventId: string, consumer: string): string {
    return `${consumer}:${eventId}`;
  }

  async check(
    event: BaseEvent,
    consumer: string,
    options: IdempotencyCheckOptions = {}
  ): Promise<IdempotencyCheckResult> {
    const key = this.makeKey(event.id, consumer);
    const record = this.records.get(key);
    const now = Date.now();

    // Check for existing record
    if (record && record.expiresAt > now) {
      // If processing and lock expired, treat as stale and allow reprocessing
      if (record.status === 'processing') {
        const lockExpired =
          record.startedAt.getTime() + this.defaultLockTtlMs < now;
        if (lockExpired) {
          // Lock expired, allow new processing attempt
          if (options.acquireLock) {
            const updated: ProcessedEventRecord & { expiresAt: number } = {
              ...record,
              startedAt: new Date(),
              attempts: record.attempts + 1,
            };
            this.records.set(key, updated);
            return { isDuplicate: false, lockAcquired: true };
          }
          return { isDuplicate: false };
        }
        // Still processing within lock period - treat as duplicate
        return {
          isDuplicate: true,
          processedAt: record.startedAt,
        };
      }

      // Completed or failed record exists
      return {
        isDuplicate: true,
        processedAt: record.completedAt ?? record.startedAt,
        result: record.result,
      };
    }

    // No existing record or expired
    if (options.acquireLock !== false) {
      const ttlMs = options.lockTtlMs ?? this.defaultTtlMs;
      const newRecord: ProcessedEventRecord & { expiresAt: number } = {
        eventId: event.id,
        eventType: event.type,
        startedAt: new Date(),
        status: 'processing',
        consumer,
        attempts: 1,
        expiresAt: now + ttlMs,
      };
      this.records.set(key, newRecord);
      this.enforceMaxRecords();
      return { isDuplicate: false, lockAcquired: true };
    }

    return { isDuplicate: false };
  }

  async markProcessing(
    event: BaseEvent,
    consumer: string,
    ttlMs?: number
  ): Promise<boolean> {
    const result = await this.check(event, consumer, {
      acquireLock: true,
      lockTtlMs: ttlMs ?? this.defaultLockTtlMs,
    });
    return result.lockAcquired ?? false;
  }

  async markCompleted(
    event: BaseEvent,
    consumer: string,
    result?: unknown,
    ttlMs?: number
  ): Promise<void> {
    const key = this.makeKey(event.id, consumer);
    const record = this.records.get(key);
    const now = Date.now();

    const updated: ProcessedEventRecord & { expiresAt: number } = {
      eventId: event.id,
      eventType: event.type,
      startedAt: record?.startedAt ?? new Date(),
      completedAt: new Date(),
      status: 'completed',
      result,
      consumer,
      attempts: record?.attempts ?? 1,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
    };

    this.records.set(key, updated);
  }

  async markFailed(
    event: BaseEvent,
    consumer: string,
    error: unknown
  ): Promise<void> {
    const key = this.makeKey(event.id, consumer);
    const record = this.records.get(key);
    const now = Date.now();

    const errorStr = error instanceof Error ? error.message : String(error);

    const updated: ProcessedEventRecord & { expiresAt: number } = {
      eventId: event.id,
      eventType: event.type,
      startedAt: record?.startedAt ?? new Date(),
      completedAt: new Date(),
      status: 'failed',
      error: errorStr,
      consumer,
      attempts: record?.attempts ?? 1,
      expiresAt: now + this.defaultTtlMs,
    };

    this.records.set(key, updated);
  }

  async releaseLock(event: BaseEvent, consumer: string): Promise<void> {
    const key = this.makeKey(event.id, consumer);
    this.records.delete(key);
  }

  async getRecord(
    eventId: string,
    consumer: string
  ): Promise<ProcessedEventRecord | null> {
    const key = this.makeKey(eventId, consumer);
    const record = this.records.get(key);

    if (!record || record.expiresAt < Date.now()) {
      return null;
    }

    // Return without internal expiresAt field
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { expiresAt: _, ...publicRecord } = record;
    return publicRecord;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of Array.from(this.records.entries())) {
      if (record.expiresAt < now) {
        this.records.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Enforce max records limit using LRU-like eviction
   */
  private enforceMaxRecords(): void {
    if (this.records.size <= this.maxRecords) return;

    // Sort by expires time (oldest first)
    const entries = Array.from(this.records.entries()).sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt
    );

    // Remove oldest 10%
    const toRemove = Math.ceil(this.maxRecords * 0.1);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.records.delete(entries[i][0]);
    }
  }

  /**
   * Stop cleanup timer (for graceful shutdown)
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clear all records (for testing)
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Get stats (for monitoring)
   */
  getStats(): { size: number; maxRecords: number } {
    return {
      size: this.records.size,
      maxRecords: this.maxRecords,
    };
  }
}

/**
 * Create an in-memory idempotency store
 *
 * @example
 * ```typescript
 * const store = createInMemoryIdempotencyStore({
 *   defaultTtlMs: 60 * 60 * 1000, // 1 hour
 *   maxRecords: 50000,
 * });
 *
 * // In your subscriber
 * const result = await store.check(event, 'my-subscriber');
 * if (result.isDuplicate) {
 *   return result.result; // Return cached result
 * }
 *
 * try {
 *   const processResult = await processEvent(event);
 *   await store.markCompleted(event, 'my-subscriber', processResult);
 *   return processResult;
 * } catch (error) {
 *   await store.markFailed(event, 'my-subscriber', error);
 *   throw error;
 * }
 * ```
 */
export function createInMemoryIdempotencyStore(
  config?: InMemoryIdempotencyStoreConfig
): InMemoryIdempotencyStore {
  return new InMemoryIdempotencyStore(config);
}

/**
 * Generate an idempotency key from event
 * Useful for custom implementations
 */
export function generateIdempotencyKey(
  event: BaseEvent,
  consumer: string
): string {
  return `idempotency:${consumer}:${event.id}`;
}

/**
 * Generate an idempotency key from correlation ID
 * Useful for request-level idempotency
 */
export function generateCorrelationKey(
  correlationId: string,
  operation: string
): string {
  return `idempotency:correlation:${operation}:${correlationId}`;
}
