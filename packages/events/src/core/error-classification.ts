/**
 * Error Classification - Determine retry behavior for errors
 *
 * Provides:
 * - Retryable vs non-retryable error classification
 * - Error categories (transient, permanent, poison)
 * - Retry configuration per error type
 * - Custom error classifiers
 */

/**
 * Error classification result
 */
export type ErrorClassification =
  | 'transient' // Retry with backoff (network, timeouts, rate limits)
  | 'permanent' // Don't retry (validation, auth, business logic)
  | 'poison' // Send to DLQ immediately (deserialization, schema)
  | 'unknown'; // Use default retry policy

/**
 * Retry configuration for classified errors
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Jitter factor (0-1) to prevent thundering herd */
  jitter: number;
}

/**
 * Error classification result with retry config
 */
export interface ClassificationResult {
  classification: ErrorClassification;
  retryConfig?: RetryConfig;
  sendToDlq: boolean;
  reason: string;
}

/**
 * Default retry configurations by classification
 */
export const DEFAULT_RETRY_CONFIGS: Record<ErrorClassification, RetryConfig> = {
  transient: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitter: 0.1,
  },
  permanent: {
    maxAttempts: 0,
    initialDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitter: 0,
  },
  poison: {
    maxAttempts: 0,
    initialDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitter: 0,
  },
  unknown: {
    maxAttempts: 3,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitter: 0.2,
  },
};

/**
 * Known transient error patterns
 */
const TRANSIENT_ERROR_PATTERNS = [
  // Network errors
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENETUNREACH/i,
  /EHOSTUNREACH/i,
  /ENOTFOUND/i,
  /socket hang up/i,
  /network error/i,
  /connection.*timeout/i,
  /request.*timeout/i,

  // Database transient
  /deadlock/i,
  /lock wait timeout/i,
  /too many connections/i,
  /connection pool exhausted/i,
  /temporarily unavailable/i,

  // HTTP transient
  /502 bad gateway/i,
  /503 service unavailable/i,
  /504 gateway timeout/i,
  /429 too many requests/i,

  // Redis/Queue transient
  /BUSY/i,
  /LOADING/i,
  /CLUSTERDOWN/i,
  /READONLY/i,

  // Generic transient
  /temporary failure/i,
  /try again/i,
  /retry/i,
  /throttl/i,
  /rate limit/i,
  /circuit breaker/i,
];

/**
 * Known permanent error patterns
 */
const PERMANENT_ERROR_PATTERNS = [
  // Auth errors
  /unauthorized/i,
  /forbidden/i,
  /access denied/i,
  /permission denied/i,
  /invalid token/i,
  /token expired/i,

  // Business logic
  /not found/i,
  /already exists/i,
  /duplicate/i,
  /conflict/i,
  /invalid state/i,
  /precondition failed/i,

  // HTTP permanent
  /400 bad request/i,
  /401 unauthorized/i,
  /403 forbidden/i,
  /404 not found/i,
  /409 conflict/i,
  /422 unprocessable/i,
];

/**
 * Known poison error patterns (send to DLQ immediately)
 */
const POISON_ERROR_PATTERNS = [
  // Schema/Serialization
  /invalid json/i,
  /json parse error/i,
  /unexpected token/i,
  /schema validation/i,
  /invalid event schema/i,
  /deserialization/i,
  /malformed/i,

  // Data corruption
  /data corruption/i,
  /checksum mismatch/i,
  /integrity error/i,
];

/**
 * Error codes that indicate transient failures
 */
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'EAI_AGAIN',
]);

/**
 * HTTP status codes that indicate transient failures
 */
const TRANSIENT_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * HTTP status codes that indicate permanent failures
 */
const PERMANENT_HTTP_STATUS = new Set([400, 401, 403, 404, 405, 409, 410, 422]);

/**
 * Custom error classifier function
 */
export type ErrorClassifier = (error: unknown) => ErrorClassification | null;

/**
 * Error classifier configuration
 */
export interface ErrorClassifierConfig {
  /** Custom classifiers (checked first) */
  customClassifiers?: ErrorClassifier[];
  /** Override default retry configs */
  retryConfigs?: Partial<Record<ErrorClassification, Partial<RetryConfig>>>;
  /** Default classification for unknown errors */
  defaultClassification?: ErrorClassification;
}

/**
 * Create an error classifier
 *
 * @example
 * ```typescript
 * const classifier = createErrorClassifier({
 *   customClassifiers: [
 *     (error) => {
 *       if (error instanceof MyCustomTransientError) return 'transient';
 *       return null; // Let default classification handle it
 *     }
 *   ],
 *   retryConfigs: {
 *     transient: { maxAttempts: 10 }, // Override max attempts
 *   },
 * });
 *
 * const result = classifier.classify(error);
 * if (result.sendToDlq) {
 *   await dlqService.send(event, error, result.reason);
 * }
 * ```
 */
export function createErrorClassifier(config: ErrorClassifierConfig = {}): {
  classify: (error: unknown) => ClassificationResult;
  isRetryable: (error: unknown) => boolean;
  calculateDelay: (attempt: number, config: RetryConfig) => number;
} {
  const customClassifiers = config.customClassifiers ?? [];
  const defaultClassification = config.defaultClassification ?? 'unknown';

  // Merge retry configs
  const retryConfigs: Record<ErrorClassification, RetryConfig> = {
    transient: {
      ...DEFAULT_RETRY_CONFIGS.transient,
      ...config.retryConfigs?.transient,
    },
    permanent: {
      ...DEFAULT_RETRY_CONFIGS.permanent,
      ...config.retryConfigs?.permanent,
    },
    poison: {
      ...DEFAULT_RETRY_CONFIGS.poison,
      ...config.retryConfigs?.poison,
    },
    unknown: {
      ...DEFAULT_RETRY_CONFIGS.unknown,
      ...config.retryConfigs?.unknown,
    },
  };

  function extractErrorInfo(error: unknown): {
    message: string;
    code?: string;
    status?: number;
    name?: string;
  } {
    if (error instanceof Error) {
      const errWithCode = error as Error & {
        code?: string;
        status?: number;
        statusCode?: number;
        response?: { status?: number };
      };
      return {
        message: error.message,
        name: error.name,
        code: errWithCode.code,
        status:
          errWithCode.status ??
          errWithCode.statusCode ??
          errWithCode.response?.status,
      };
    }

    if (typeof error === 'object' && error !== null) {
      const obj = error as Record<string, unknown>;
      return {
        message: String(obj.message ?? obj.error ?? ''),
        code: obj.code as string | undefined,
        status: (obj.status ?? obj.statusCode) as number | undefined,
      };
    }

    return { message: String(error) };
  }

  function classifyByPatterns(message: string): ErrorClassification | null {
    // Check poison patterns first (most specific)
    for (const pattern of POISON_ERROR_PATTERNS) {
      if (pattern.test(message)) {
        return 'poison';
      }
    }

    // Check permanent patterns
    for (const pattern of PERMANENT_ERROR_PATTERNS) {
      if (pattern.test(message)) {
        return 'permanent';
      }
    }

    // Check transient patterns
    for (const pattern of TRANSIENT_ERROR_PATTERNS) {
      if (pattern.test(message)) {
        return 'transient';
      }
    }

    return null;
  }

  function classify(error: unknown): ClassificationResult {
    // 1. Try custom classifiers first
    for (const classifier of customClassifiers) {
      const result = classifier(error);
      if (result !== null) {
        return {
          classification: result,
          retryConfig: retryConfigs[result],
          sendToDlq: result === 'poison' || result === 'permanent',
          reason: `Custom classifier: ${result}`,
        };
      }
    }

    const { message, code, status, name } = extractErrorInfo(error);

    // 2. Check error code
    if (code && TRANSIENT_ERROR_CODES.has(code)) {
      return {
        classification: 'transient',
        retryConfig: retryConfigs.transient,
        sendToDlq: false,
        reason: `Error code: ${code}`,
      };
    }

    // 3. Check HTTP status
    if (status !== undefined) {
      if (TRANSIENT_HTTP_STATUS.has(status)) {
        return {
          classification: 'transient',
          retryConfig: retryConfigs.transient,
          sendToDlq: false,
          reason: `HTTP status: ${status}`,
        };
      }
      if (PERMANENT_HTTP_STATUS.has(status)) {
        return {
          classification: 'permanent',
          retryConfig: retryConfigs.permanent,
          sendToDlq: true,
          reason: `HTTP status: ${status}`,
        };
      }
    }

    // 4. Check error patterns
    const patternResult =
      classifyByPatterns(message) ?? classifyByPatterns(name ?? '');
    if (patternResult) {
      return {
        classification: patternResult,
        retryConfig: retryConfigs[patternResult],
        sendToDlq: patternResult === 'poison' || patternResult === 'permanent',
        reason: `Pattern match: ${message.slice(0, 50)}`,
      };
    }

    // 5. Use default classification
    return {
      classification: defaultClassification,
      retryConfig: retryConfigs[defaultClassification],
      sendToDlq:
        defaultClassification === 'poison' ||
        defaultClassification === 'permanent',
      reason: 'No matching pattern, using default',
    };
  }

  function isRetryable(error: unknown): boolean {
    const result = classify(error);
    return (
      result.classification === 'transient' ||
      result.classification === 'unknown'
    );
  }

  function calculateDelay(attempt: number, retryConfig: RetryConfig): number {
    // Exponential backoff: initialDelay * multiplier^attempt
    const baseDelay =
      retryConfig.initialDelayMs *
      Math.pow(retryConfig.backoffMultiplier, attempt);

    // Cap at maxDelay
    const cappedDelay = Math.min(baseDelay, retryConfig.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * retryConfig.jitter * Math.random();

    return Math.round(cappedDelay + jitter);
  }

  return {
    classify,
    isRetryable,
    calculateDelay,
  };
}

/**
 * Pre-configured error classifier instance
 */
export const defaultErrorClassifier = createErrorClassifier();

/**
 * Quick helper to check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  return defaultErrorClassifier.isRetryable(error);
}

/**
 * Quick helper to classify error
 */
export function classifyError(error: unknown): ClassificationResult {
  return defaultErrorClassifier.classify(error);
}
