import { SignalTree, Middleware } from '@signaltree/core';

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

    // Create a wrapper for the $ callable proxy that intercepts update calls
    // Root-only interception: do not recursively wrap nested callable proxies.
    const createInterceptedProxy = (
      originalProxy: Record<string | symbol, unknown>
    ) => {
      return new Proxy(originalProxy, {
        get(target, prop) {
          const value = (target as Record<string | symbol, unknown>)[prop];

          if (prop === 'update') {
            // Intercept update method
            return (updater: (current: T) => Partial<T>) => {
              const action = 'UPDATE';
              const currentState = tree.$();
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

              // Execute the actual update using the original method
              (value as (updater: (current: T) => Partial<T>) => void).call(
                target,
                updater
              );

              // Get new state after update
              const newState = tree.$();

              // Execute 'after' middleware hooks
              for (const middleware of treeMiddlewares) {
                if (middleware.after) {
                  middleware.after(
                    action,
                    updateResult,
                    previousState,
                    newState
                  );
                }
              }
            };
          }

          if (prop === 'batchUpdate') {
            return (updater: (current: T) => Partial<T>) => {
              const action = 'BATCH_UPDATE';
              const currentState = tree.$();
              const updateResult = updater(currentState);
              const treeMiddlewares =
                (middlewareMap.get(tree) as Middleware<T>[]) || [];

              // Execute 'before' middleware hooks
              for (const middleware of treeMiddlewares) {
                if (
                  middleware.before &&
                  !middleware.before(action, updateResult, currentState)
                ) {
                  // Middleware blocked the batch update
                  return;
                }
              }

              const previousState = currentState;

              // Call the original batchUpdate if available; otherwise fall back to update
              const originalFn = (
                typeof value === 'function'
                  ? value
                  : (target as Record<string | symbol, unknown>)['update']
              ) as ((updater: (current: T) => Partial<T>) => void) | undefined;

              if (originalFn) {
                originalFn.call(target, updater);
              } else {
                // No-op if neither function is available
                return;
              }

              const newState = tree.$();

              // Execute 'after' middleware hooks
              for (const middleware of treeMiddlewares) {
                if (middleware.after) {
                  middleware.after(
                    action,
                    updateResult,
                    previousState,
                    newState
                  );
                }
              }
            };
          }

          if (prop === 'set') {
            // Intercept set method too
            return (partial: Partial<T>) => {
              const action = 'SET';
              const currentState = tree.$();
              const treeMiddlewares =
                (middlewareMap.get(tree) as Middleware<T>[]) || [];

              // Execute 'before' middleware hooks
              for (const middleware of treeMiddlewares) {
                if (
                  middleware.before &&
                  !middleware.before(action, partial, currentState)
                ) {
                  // Middleware blocked the set
                  return;
                }
              }

              // Capture state before update for 'after' hooks
              const previousState = currentState;

              // Execute the actual set using the original method
              (value as (partial: Partial<T>) => void).call(target, partial);

              // Get new state after update
              const newState = tree.$();

              // Execute 'after' middleware hooks
              for (const middleware of treeMiddlewares) {
                if (middleware.after) {
                  middleware.after(action, partial, previousState, newState);
                }
              }
            };
          }

          // For other properties, return as-is to keep interception shallow.
          return value;
        },
      });
    };

    // Create the enhanced tree with intercepted $ proxy
    const enhancedTree = {
      ...tree,
      $: createInterceptedProxy(
        tree.$ as unknown as Record<string | symbol, unknown>
      ),
      state: createInterceptedProxy(
        tree.state as unknown as Record<string | symbol, unknown>
      ),
    } as SignalTree<T>;

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

    // batchUpdate is intercepted on the callable proxy (`tree.$`) so no
    // explicit assignment on the tree object is necessary here.

    // Override destroy to cleanup middleware
    const originalDestroy = tree.destroy;
    enhancedTree.destroy = () => {
      middlewareMap.delete(tree);
      originalDestroy.call(tree);
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
export function createLoggingMiddleware<T>(treeName = 'SignalTree') {
  return {
    id: 'logging',
    before: (action: string, payload: unknown, prev: T) => {
      console.group(`🏪 ${treeName}: ${action}`);
      console.log('Previous state:', prev as unknown as object);
      console.log('Payload:', payload as unknown as object);
      return true;
    },
    after: (action: string, _payload: unknown, _prev: T, next: T) => {
      console.log('Next state:', next as unknown as object);
      console.groupEnd();
    },
  } as Middleware<T>;
}

/** Performance measurement middleware */
export function createPerformanceMiddleware<T>() {
  return {
    id: 'performance',
    before: (action: string) => {
      console.time(`Tree update: ${action}`);
      return true;
    },
    after: (action: string) => {
      console.timeEnd(`Tree update: ${action}`);
    },
  } as Middleware<T>;
}

/** Post-update validation middleware */
export function createValidationMiddleware<T>(
  validator: (state: T) => string | null
) {
  return {
    id: 'validation',
    after: (action: string, _payload: unknown, _prev: T, next: T) => {
      const err = validator(next);
      if (err) {
        console.error(`Validation failed after ${action}:`, err);
      }
    },
  } as Middleware<T>;
}
