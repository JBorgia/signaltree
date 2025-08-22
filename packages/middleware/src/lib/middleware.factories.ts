import type { Middleware } from '@signaltree/core';

/**
 * Factory implementations for middleware. Kept in a separate file so the
 * primary package entry stays tiny; consumers should import these from
 * '@signaltree/middleware/factories' when needed.
 */
export function createLoggingMiddleware<T>(treeName: string): Middleware<T> {
  let impl: Middleware<T> | null = null;
  return {
    id: 'logging',
    before: (action, payload, state) => {
      if (!impl) {
        // Defer heavy impl to a separate module
        import('./middleware.impl')
          .then((m) => {
            impl = m.createLoggingMiddlewareImpl(treeName) as Middleware<T>;
          })
          .catch(() => {
            impl = null;
          });
      }
      if (impl && impl.before) return impl.before(action, payload, state);
      if (typeof console !== 'undefined') {
        console.log(`🏪 ${treeName}: ${action}`, payload);
      }
      return true;
    },
    after: (action, payload, state, newState) => {
      if (impl && impl.after)
        return impl.after(action, payload, state, newState);
      if (typeof console !== 'undefined') {
        console.log('New state:', newState);
      }
    },
  };
}

export function createPerformanceMiddleware<T>(): Middleware<T> {
  let impl: Middleware<T> | null = null;
  return {
    id: 'performance',
    before: (action, payload, state) => {
      if (!impl) {
        import('./middleware.impl')
          .then((m) => {
            impl = m.createPerformanceMiddlewareImpl();
          })
          .catch(() => (impl = null));
      }
      if (impl && impl.before) return impl.before(action, payload, state);
      if (typeof console !== 'undefined')
        console.time(`Tree update: ${action}`);
      return true;
    },
    after: (action, payload, state, newState) => {
      if (impl && impl.after)
        return impl.after(action, payload, state, newState);
      if (typeof console !== 'undefined')
        console.timeEnd(`Tree update: ${action}`);
    },
  };
}

export function createValidationMiddleware<T>(
  validator: (state: T) => string | null
): Middleware<T> {
  return {
    id: 'validation',
    after: (action, payload, state, newState) => {
      const error = validator(newState);
      if (error) {
        console.error(`Validation failed after ${action}:`, error);
      }
    },
  };
}

export function createPersistenceMiddleware<T>(config: {
  key: string;
  storage?: Storage;
  debounceMs?: number;
  actions?: string[];
}): Middleware<T> {
  let impl: Middleware<T> | null = null;
  let initializing = false;

  const ensureImpl = () => {
    if (impl || initializing) return;
    initializing = true;
    import('./middleware.impl')
      .then((m) => {
        impl = m.createPersistenceMiddlewareImpl(config) as Middleware<T>;
      })
      .catch(() => {
        impl = null;
      })
      .finally(() => {
        initializing = false;
      });
  };

  return {
    id: 'persistence',
    after: (action, payload, state, newState) => {
      if (config.actions && !config.actions.includes(action)) return;
      ensureImpl();
      if (impl && impl.after)
        return impl.after(action, payload, state, newState);
      try {
        const s =
          typeof localStorage !== 'undefined' ? localStorage : config.storage;
        if (s) s.setItem(config.key, JSON.stringify(newState));
      } catch (err) {
        if (typeof console !== 'undefined')
          console.error('Failed to save state (fallback):', err);
      }
    },
  };
}

export const loggingMiddleware = createLoggingMiddleware;
export const performanceMiddleware = createPerformanceMiddleware;
export const validationMiddleware = createValidationMiddleware;
export const persistenceMiddleware = createPersistenceMiddleware;
