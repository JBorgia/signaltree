import { Middleware, SignalTree } from '@signaltree/core';

// Global middleware storage - using unknown for type safety
const middlewareMap = new WeakMap<object, unknown[]>();

/**
 * Sets up middleware for a SignalTree with an array of middleware functions.
 * Replaces any existing middleware configuration.
 *
 * @param tree - The SignalTree to enhance with middleware
 * @param middlewares - Array of middleware functions to apply
 * @returns The enhanced SignalTree
 */
export function withMiddleware<T>(
  middlewares: Middleware<T>[] = []
): (tree: SignalTree<T>) => SignalTree<T> {
  return (tree: SignalTree<T>) => {
    // Initialize middleware array for this tree
    middlewareMap.set(tree, [...middlewares]);

    // Store the original callable tree function
    const originalTreeCall = tree.bind(tree);

    // Create enhanced tree function that includes middleware execution
    const enhancedTree = function (
      this: SignalTree<T>,
      ...args: unknown[]
    ): T | void {
      if (args.length === 0) {
        // Get operation - call original directly (no middleware needed for reads)
        return originalTreeCall();
      } else {
        // Set or update operation - apply middleware
        const action = 'UPDATE';
        const currentState = originalTreeCall();
        const treeMiddlewares =
          (middlewareMap.get(tree) as Middleware<T>[]) || [];

        let updateResult: Partial<T>;
        if (args.length === 1) {
          const arg = args[0];
          if (typeof arg === 'function') {
            // Function updater
            updateResult = (arg as (current: T) => T)(
              currentState
            ) as Partial<T>;
          } else {
            // Direct value
            updateResult = arg as Partial<T>;
          }
        } else {
          return; // Invalid call
        }

        // Execute 'before' middleware hooks
        for (const middleware of treeMiddlewares) {
          if (
            middleware.before &&
            !middleware.before(action, updateResult, currentState)
          ) {
            // Middleware blocked the update
            return;
          }
        }

        // Capture state before update for 'after' hooks
        const previousState = currentState;

        // Execute the actual update using the original callable interface
        if (args.length === 1) {
          const arg = args[0];
          if (typeof arg === 'function') {
            originalTreeCall(arg as (current: T) => T);
          } else {
            originalTreeCall(arg as T);
          }
        }

        // Get new state after update
        const newState = originalTreeCall();

        // Execute 'after' middleware hooks
        for (const middleware of treeMiddlewares) {
          if (middleware.after) {
            middleware.after(action, updateResult, previousState, newState);
          }
        }
      }
    } as SignalTree<T>;

    // Copy all properties and methods from original tree
    Object.setPrototypeOf(enhancedTree, Object.getPrototypeOf(tree));
    Object.assign(enhancedTree, tree);

    // Ensure state property is preserved
    if ('state' in tree) {
      Object.defineProperty(enhancedTree, 'state', {
        value: tree.state,
        enumerable: false,
        configurable: true,
      });
    }

    // Override addTap to work with the middleware system
    enhancedTree.addTap = (middleware: Middleware<T>) => {
      const treeMiddlewares =
        (middlewareMap.get(tree) as Middleware<T>[]) || [];

      // Check if middleware with same ID already exists
      const existingIndex = treeMiddlewares.findIndex(
        (m) => m.id === middleware.id
      );
      if (existingIndex >= 0) {
        // Replace existing middleware
        treeMiddlewares[existingIndex] = middleware;
      } else {
        treeMiddlewares.push(middleware);
      }

      middlewareMap.set(tree, treeMiddlewares);
    };

    // Override removeTap method
    enhancedTree.removeTap = (id: string) => {
      const treeMiddlewares =
        (middlewareMap.get(tree) as Middleware<T>[]) || [];
      const filtered = treeMiddlewares.filter((m) => m.id !== id);
      middlewareMap.set(tree, filtered);
    };

    // Store original batchUpdate for enhancement
    const originalBatchUpdate = tree.batchUpdate;

    // Override batchUpdate to include middleware
    if (originalBatchUpdate) {
      enhancedTree.batchUpdate = (updater: (current: T) => Partial<T>) => {
        const action = 'BATCH_UPDATE';
        const currentState = originalTreeCall();
        const updateResult = updater(currentState);
        const treeMiddlewares =
          (middlewareMap.get(tree) as Middleware<T>[]) || [];

        // Execute 'before' middleware hooks
        for (const middleware of treeMiddlewares) {
          if (
            middleware.before &&
            !middleware.before(action, updateResult, currentState)
          ) {
            // Middleware blocked the update
            return;
          }
        }

        // Capture state before update for 'after' hooks
        const previousState = currentState;

        // Execute the actual batch update
        originalBatchUpdate.call(tree, updater);

        // Get new state after update
        const newState = originalTreeCall();

        // Execute 'after' middleware hooks
        for (const middleware of treeMiddlewares) {
          if (middleware.after) {
            middleware.after(action, updateResult, previousState, newState);
          }
        }
      };
    }

    // Override destroy to cleanup middleware
    const originalDestroy = tree.destroy;
    enhancedTree.destroy = () => {
      middlewareMap.delete(tree);
      if (originalDestroy) {
        originalDestroy.call(tree);
      }
    };

    return enhancedTree;
  };
}

/**
 * Creates a logging middleware that tracks all state changes.
 *
 * @param treeName - Name to display in console logs
 * @returns Configured logging middleware
 */
export function createLoggingMiddleware<T>(treeName: string): Middleware<T> {
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

/**
 * Creates a performance monitoring middleware.
 *
 * @returns Configured performance middleware
 */
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

/**
 * Creates a validation middleware that validates state after updates.
 *
 * @param validator - Function that validates state and returns error message or null
 * @returns Configured validation middleware
 */
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

/**
 * Creates a persistence middleware that auto-saves state changes.
 *
 * @param config - Configuration for persistence behavior
 * @returns Configured persistence middleware
 */
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
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      try {
        storage.setItem(key, JSON.stringify(state));
        console.log(`💾 State auto-saved to ${key}`);
      } catch (error) {
        console.error('Failed to save state:', error);
      }
    }, debounceMs);
  };

  return {
    id: 'persistence',
    after: (action, payload, state, newState) => {
      if (actions.includes(action)) {
        debouncedSave(newState);
      }
    },
  };
}

// Re-export the built-in middleware creators with simpler names
export const loggingMiddleware = createLoggingMiddleware;
export const performanceMiddleware = createPerformanceMiddleware;
export const validationMiddleware = createValidationMiddleware;
export const persistenceMiddleware = createPersistenceMiddleware;
