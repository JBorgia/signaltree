/**
 * Shared constants for benchmark fairness and consistency
 * These ensure all benchmark services use identical parameters
 */

export const BENCHMARK_CONSTANTS = {
  // Iteration limits for different benchmark types
  ITERATIONS: {
    DEEP_NESTED: 1000,
    ARRAY_UPDATES: 1000,
    COMPUTED: 500,
    BATCH_UPDATES: 100,
    BATCH_SIZE: 1000,
    SELECTOR: 1000,
    MEMORY_EFFICIENCY: 1000,
    REAL_TIME_UPDATES: 500,
    DATA_FETCHING: 1000,
    ASYNC_WORKFLOW: 50, // Scale with dataSize but cap at 50
    STATE_SIZE_SCALING: 200, // Scale as dataSize / 5
    SUBSCRIBER_SCALING: 1000, // Subscriber scaling benchmark iterations
  },

  // Yielding frequencies (bitwise patterns for consistent timing)
  YIELD_FREQUENCY: {
    // High frequency benchmarks (less yielding)
    DEEP_NESTED: 1023, // (i & 1023) === 0 -> every 1024 iterations
    COMPUTED: 1023, // (i & 1023) === 0 -> every 1024 iterations

    // Medium frequency benchmarks
    ARRAY_UPDATES: 255, // (i & 255) === 0 -> every 256 iterations
    SELECTOR: 63, // (i & 63) === 0 -> every 64 iterations
    MEMORY_EFFICIENCY: 63, // (i & 63) === 0 -> every 64 iterations

    // High frequency benchmarks (more yielding)
    BATCH_UPDATES: 7, // (b & 7) === 0 -> every 8 batches
    REAL_TIME_UPDATES: 31, // (i & 31) === 0 -> every 32 iterations
    STATE_SIZE_SCALING: 31, // (i & 31) === 0 -> every 32 iterations
    DATA_FETCHING: 15, // (i & 15) === 0 -> every 16 iterations

    // Very high frequency (small operations)
    ASYNC_WORKFLOW: 7, // (i & 7) === 0 -> every 8 iterations
    SUBSCRIBER_SCALING: 31, // (i & 31) === 0 -> every 32 iterations
  },

  // Data size limits for consistency
  DATA_SIZE_LIMITS: {
    LARGE_DATASET: {
      MULTIPLIER: 10,
      MAX: 10000,
    },
    MEMORY_TEST: {
      MULTIPLIER: 10,
      MAX: 2000,
    },
    USER_SIMULATION: {
      MAX: 1000,
      MIN: 100,
    },
    ENTITY_COUNT: {
      MIN: 1000,
      MAX: 50000,
    },
  },

  // Common data generation parameters
  DATA_GENERATION: {
    FACTOR_COUNT: 50, // For computed benchmarks
    NESTED_DEPTH: 15, // For deep nested benchmarks
    CATEGORY_COUNT: 10, // For categorization tests
    TAG_COUNT: 5, // For tagging systems
    NOTIFICATION_LIMIT: 10, // Keep last N notifications
    ARRAY_SIZE_100: 100, // Standard array size for memory tests
  },

  // Timeout and delay settings
  TIMING: {
    YIELD_DELAY_MS: 0, // setTimeout delay for yieldToUI
    ASYNC_DELAY_MS: 10, // Simulated async operation delay
    RANDOM_DELAY_MAX_MS: 20, // Max random delay for async tests
    TIMEOUT_DELAY_MS: 5, // Standard timeout delay
  },
} as const;

/**
 * Type-safe access to benchmark constants
 */
export type BenchmarkConstants = typeof BENCHMARK_CONSTANTS;
