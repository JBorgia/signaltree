export { 
  createLoggingMiddleware,
  createPerformanceMiddleware,
  createValidationMiddleware,
  createPersistenceMiddleware,
  loggingMiddleware,
  performanceMiddleware,
  persistenceMiddleware,
  validationMiddleware,
} from './lib/middleware';

/**
 * Note: These factories are intentionally exported from a secondary
 * entrypoint to keep the primary `@signaltree/middleware` bundle small.
 * Consumers who need these may import from `@signaltree/middleware/factories`.
 */
