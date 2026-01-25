import { ClassificationResult, ErrorClassification, RetryConfig } from '../core/error-classification';
import { IdempotencyCheckResult, IdempotencyStore, ProcessedEventRecord } from '../core/idempotency';
import { BaseEvent } from '../core/types';
import { MockEventBus } from './mock-event-bus';

/**
 * Test Helpers - Utility functions for testing
 *
 * Provides:
 * - Event waiting utilities
 * - Mock implementations
 * - Test fixtures
 */
/**
 * Wait for an event to be published
 *
 * @example
 * ```typescript
 * const eventPromise = waitForEvent(eventBus, 'TradeCreated');
 * await performAction();
 * const event = await eventPromise;
 * expect(event.data.tradeId).toBe('123');
 * ```
 */
export function waitForEvent<T extends BaseEvent>(
  eventBus: MockEventBus,
  eventType: T['type'],
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          `Timeout waiting for event "${eventType}" after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

    const unsubscribe = eventBus.subscribe<T>(eventType, (event) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(event);
    });
  });
}

/**
 * Wait for multiple events to be published
 *
 * @example
 * ```typescript
 * const eventsPromise = waitForEvents(eventBus, ['TradeCreated', 'NotificationSent']);
 * await performAction();
 * const events = await eventsPromise;
 * ```
 */
export function waitForEvents(
  eventBus: MockEventBus,
  eventTypes: string[],
  timeoutMs = 5000
): Promise<BaseEvent[]> {
  return new Promise((resolve, reject) => {
    const remaining = new Set(eventTypes);
    const collected: BaseEvent[] = [];
    const unsubscribes: Array<() => void> = [];

    const timeout = setTimeout(() => {
      unsubscribes.forEach((unsub) => unsub());
      reject(
        new Error(
          `Timeout waiting for events: [${Array.from(remaining).join(
            ', '
          )}] after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

    const checkComplete = () => {
      if (remaining.size === 0) {
        clearTimeout(timeout);
        unsubscribes.forEach((unsub) => unsub());
        resolve(collected);
      }
    };

    for (const eventType of eventTypes) {
      const unsub = eventBus.subscribe(eventType, (event) => {
        if (remaining.has(eventType)) {
          remaining.delete(eventType);
          collected.push(event);
          checkComplete();
        }
      });
      unsubscribes.push(unsub);
    }
  });
}

/**
 * Collect events during an action
 *
 * @example
 * ```typescript
 * const events = await collectEvents(eventBus, async () => {
 *   await createTrade();
 *   await acceptTrade();
 * });
 * expect(events).toHaveLength(2);
 * ```
 */
export async function collectEvents(
  eventBus: MockEventBus,
  action: () => Promise<void>,
  eventTypes?: string[]
): Promise<BaseEvent[]> {
  const events: BaseEvent[] = [];

  const unsubscribe = eventBus.subscribeAll((event) => {
    if (!eventTypes || eventTypes.includes(event.type)) {
      events.push(event);
    }
  });

  try {
    await action();
    // Give async handlers time to complete
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    unsubscribe();
  }

  return events;
}

/**
 * Create a mock idempotency store
 *
 * @example
 * ```typescript
 * const store = mockIdempotencyStore({
 *   duplicateIds: ['event-1', 'event-2'],
 * });
 *
 * const result = await store.check({ id: 'event-1' }, 'consumer');
 * expect(result.isDuplicate).toBe(true);
 * ```
 */
export function mockIdempotencyStore(options?: {
  duplicateIds?: string[];
  shouldAcquireLock?: boolean;
  processedRecords?: Map<string, ProcessedEventRecord>;
}): IdempotencyStore {
  const duplicateIds = new Set(options?.duplicateIds ?? []);
  const processedRecords =
    options?.processedRecords ?? new Map<string, ProcessedEventRecord>();
  const processingLocks = new Map<string, boolean>();

  return {
    async check(
      event: BaseEvent,
      consumer: string,
      checkOptions?: { acquireLock?: boolean; lockTtlMs?: number }
    ): Promise<IdempotencyCheckResult> {
      const key = `${consumer}:${event.id}`;

      if (duplicateIds.has(event.id) || processedRecords.has(key)) {
        const record = processedRecords.get(key);
        return {
          isDuplicate: true,
          processedAt: record?.completedAt ?? record?.startedAt,
          result: record?.result,
        };
      }

      const shouldAcquire =
        options?.shouldAcquireLock ?? checkOptions?.acquireLock ?? true;

      if (shouldAcquire) {
        processingLocks.set(key, true);
      }

      return {
        isDuplicate: false,
        lockAcquired: shouldAcquire,
      };
    },

    async markProcessing(event: BaseEvent, consumer: string): Promise<boolean> {
      const key = `${consumer}:${event.id}`;
      if (processingLocks.has(key)) {
        return false;
      }
      processingLocks.set(key, true);
      return true;
    },

    async markCompleted(
      event: BaseEvent,
      consumer: string,
      result?: unknown
    ): Promise<void> {
      const key = `${consumer}:${event.id}`;
      processedRecords.set(key, {
        eventId: event.id,
        eventType: event.type,
        startedAt: new Date(),
        completedAt: new Date(),
        status: 'completed',
        result,
        consumer,
        attempts: 1,
      });
      processingLocks.delete(key);
    },

    async markFailed(
      event: BaseEvent,
      consumer: string,
      error: unknown
    ): Promise<void> {
      const key = `${consumer}:${event.id}`;
      processedRecords.set(key, {
        eventId: event.id,
        eventType: event.type,
        startedAt: new Date(),
        completedAt: new Date(),
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        consumer,
        attempts: 1,
      });
      processingLocks.delete(key);
    },

    async releaseLock(event: BaseEvent, consumer: string): Promise<void> {
      const key = `${consumer}:${event.id}`;
      processingLocks.delete(key);
    },

    async getRecord(
      eventId: string,
      consumer: string
    ): Promise<ProcessedEventRecord | null> {
      return processedRecords.get(`${consumer}:${eventId}`) ?? null;
    },
  };
}

/**
 * Create a mock error classifier
 *
 * @example
 * ```typescript
 * const classifier = mockErrorClassifier({
 *   defaultClassification: 'transient',
 *   customClassifications: {
 *     'ValidationError': 'permanent',
 *     'NetworkError': 'transient',
 *   },
 * });
 * ```
 */
export function mockErrorClassifier(options?: {
  defaultClassification?: ErrorClassification;
  customClassifications?: Record<string, ErrorClassification>;
  retryConfig?: Partial<RetryConfig>;
}): {
  classify: (error: unknown) => ClassificationResult;
  isRetryable: (error: unknown) => boolean;
} {
  const defaultClassification = options?.defaultClassification ?? 'unknown';
  const customClassifications = options?.customClassifications ?? {};

  const defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitter: 0.1,
    ...options?.retryConfig,
  };

  return {
    classify(error: unknown): ClassificationResult {
      const errorName =
        error instanceof Error ? error.constructor.name : 'Error';
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check custom classifications
      const customClass =
        customClassifications[errorName] ?? customClassifications[errorMessage];
      const classification = customClass ?? defaultClassification;

      return {
        classification,
        retryConfig: defaultRetryConfig,
        sendToDlq:
          classification === 'permanent' || classification === 'poison',
        reason: `Mock classification: ${classification}`,
      };
    },

    isRetryable(error: unknown): boolean {
      const result = this.classify(error);
      return (
        result.classification === 'transient' ||
        result.classification === 'unknown'
      );
    },
  };
}

/**
 * Create a test delay helper
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise for testing async flows
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Flush pending promises (useful for testing)
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
