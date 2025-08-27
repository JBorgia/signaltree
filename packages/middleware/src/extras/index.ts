import type { Middleware } from '@signaltree/core';

export function createLoggingMiddleware<T>(treeName: string): Middleware<T> {
  return {
    id: 'logging',
    before: (action, payload, state) => {
      console.group(`\ud83c\udfea ${treeName}: ${action}`);
      console.log('Previous state:', state);
      console.log(
        'Payload:',
        typeof payload === 'function' ? 'Function' : payload
      );
      return true;
    },
    after: (_action, _payload, _state, newState) => {
      console.log('New state:', newState);
      console.groupEnd();
    },
  };
}

export function createPerformanceMiddleware<T>(): Middleware<T> {
  return {
    id: 'performance',
    before: (action) => {
      console.time(`Tree update: ${action}`);
      return true;
    },
    after: (action) => {
      console.timeEnd(`Tree update: ${action}`);
    },
  };
}

export function createValidationMiddleware<T>(
  validator: (state: T) => string | null
): Middleware<T> {
  return {
    id: 'validation',
    after: (action, _payload, _state, newState) => {
      const error = validator(newState);
      if (error) console.error(`Validation failed after ${action}:`, error);
    },
  };
}

export function createPersistenceMiddleware<T>(config: {
  key: string;
  storage?: Storage;
  debounceMs?: number;
  actions?: string[];
}): Middleware<T> {
  const {
    key,
    storage = localStorage,
    debounceMs = 1000,
    actions = ['UPDATE', 'BATCH_UPDATE'],
  } = config;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const debouncedSave = (state: T) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      try {
        storage.setItem(key, JSON.stringify(state));
        console.log(`\ud83d\udcbe State auto-saved to ${key}`);
      } catch (error) {
        console.error('Failed to save state:', error);
      }
    }, debounceMs);
  };
  return {
    id: 'persistence',
    after: (action, _payload, _state, newState) => {
      if (actions.includes(action)) debouncedSave(newState);
    },
  };
}
