import type { Middleware } from '@signaltree/core';

export function createLoggingMiddlewareImpl<T>(
  treeName: string
): Middleware<T> {
  return {
    id: 'logging',
    before: (action, payload, state) => {
      console.group(`🏪 ${treeName}: ${action}`);
      console.log('Previous state:', state);
      console.log(
        'Payload:',
        typeof payload === 'function' ? 'Function' : payload
      );
      return true;
    },
    after: (action, payload, state, newState) => {
      console.log('New state:', newState);
      console.groupEnd();
    },
  };
}

export function createPerformanceMiddlewareImpl<T>(): Middleware<T> {
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

export function createPersistenceMiddlewareImpl<T>(config: {
  key: string;
  storage?: Storage;
  debounceMs?: number;
  actions?: string[];
}): Middleware<T> {
  const {
    key,
    storage,
    debounceMs = 1000,
    actions = ['UPDATE', 'BATCH_UPDATE'],
  } = config;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let activeStorage: Storage | undefined = storage;

  const debouncedSave = (state: T) => {
    if (!activeStorage) return;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      try {
        activeStorage?.setItem(key, JSON.stringify(state));
        if (typeof console !== 'undefined')
          console.log(`\ud83d\udcbe State auto-saved to ${key}`);
      } catch (err) {
        if (typeof console !== 'undefined')
          console.error('Failed to save state:', err);
      }
    }, debounceMs) as unknown as ReturnType<typeof setTimeout>;
  };

  return {
    id: 'persistence',
    after: (action, payload, state, newState) => {
      if (!actions.includes(action)) return;
      // Re-evaluate storage lazily in case environment changed
      activeStorage =
        typeof localStorage !== 'undefined' ? localStorage : storage;
      debouncedSave(newState);
    },
  };
}
