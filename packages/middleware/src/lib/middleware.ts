import { SignalTree, Middleware, DeepSignalify } from '@signaltree/core';

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

    // Lightweight root-level wrapper: only intercept update/batchUpdate/set on
    // the root callable signal and state object. Avoid deep recursion and
    // avoid creating many proxies for nested nodes which increase bundle size.
    type CallableRoot = {
      update: (updater: (current: T) => Partial<T>) => void;
      batchUpdate: (updater: (current: T) => Partial<T>) => void;
      set: (partial: Partial<T>) => void;
      // allow any other properties to be accessed readonly
      [k: string]: unknown;
    };

    const createRootWrapper = (originalProxy: unknown) => {
      // originalProxy is the callable DeepSignalify<T> from core; cast to
      // a narrow CallableRoot for runtime access and to satisfy lint rules.
      const host = originalProxy as unknown as CallableRoot;
      const wrapper: Partial<CallableRoot> = { ...host };

      wrapper.update = (updater: (current: T) => Partial<T>) => {
        const action = 'UPDATE';
        const currentState = tree.$();
        const updateResult = updater(currentState);
        const treeMiddlewares =
          (middlewareMap.get(tree) as Middleware<T>[]) || [];

        for (const middleware of treeMiddlewares) {
          if (
            middleware.before &&
            !middleware.before(action, updateResult, currentState)
          ) {
            return;
          }
        }

        const previousState = currentState;
        host.update.call(host, updater);
        const newState = tree.$();

        for (const middleware of treeMiddlewares) {
          if (middleware.after)
            middleware.after(action, updateResult, previousState, newState);
        }
      };

      wrapper.batchUpdate = (updater: (current: T) => Partial<T>) => {
        const action = 'BATCH_UPDATE';
        const currentState = tree.$();
        const updateResult = updater(currentState);
        const treeMiddlewares =
          (middlewareMap.get(tree) as Middleware<T>[]) || [];

        for (const middleware of treeMiddlewares) {
          if (
            middleware.before &&
            !middleware.before(action, updateResult, currentState)
          ) {
            return;
          }
        }

        const previousState = currentState;
        host.batchUpdate.call(host, updater);
        const newState = tree.$();

        for (const middleware of treeMiddlewares) {
          if (middleware.after)
            middleware.after(action, updateResult, previousState, newState);
        }
      };

      wrapper.set = (partial: Partial<T>) => {
        const action = 'SET';
        const currentState = tree.$();
        const treeMiddlewares =
          (middlewareMap.get(tree) as Middleware<T>[]) || [];

        for (const middleware of treeMiddlewares) {
          if (
            middleware.before &&
            !middleware.before(action, partial, currentState)
          ) {
            return;
          }
        }

        const previousState = currentState;
        host.set.call(host, partial);
        const newState = tree.$();

        for (const middleware of treeMiddlewares) {
          if (middleware.after)
            middleware.after(action, partial, previousState, newState);
        }
      };

      return wrapper as unknown as DeepSignalify<T>;
    };

    // Create the enhanced tree with root-level intercepted proxies
    const enhancedTree = {
      ...tree,
      $: createRootWrapper(tree.$),
      state: createRootWrapper(tree.state),
    } as unknown as SignalTree<T>;

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
export function createLoggingMiddleware<T>(treeName: string): Middleware<T> {
  // Lightweight wrapper - delegate to the factories implementation via dynamic import
  let real: Middleware<T> | null = null;
  const ensure = () => {
    if (real) return;
    import('./middleware.factories')
      .then((m) => {
        real = (
          m.createLoggingMiddleware as unknown as (
            name: string
          ) => Middleware<T>
        )(treeName);
      })
      .catch(() => {
        real = null;
      });
  };
  ensure();

  return {
    id: 'logging',
    before: (action: string, payload: unknown, state: T) => {
      if (real && real.before) return real.before(action, payload, state);
      if (typeof console !== 'undefined') console.debug(treeName, action);
      return true;
    },
    after: (action: string, payload: unknown, state: T, newState: T) => {
      if (real && real.after)
        return real.after(action, payload, state, newState);
      if (typeof console !== 'undefined') console.debug(newState);
    },
  } as Middleware<T>;
}

/**
 * Creates a performance monitoring middleware.
 *
 * @returns Configured performance middleware
 */
export function createPerformanceMiddleware<T>(): Middleware<T> {
  // Lightweight wrapper delegating to factories via dynamic import
  let real: Middleware<T> | null = null;
  const ensure = () => {
    if (real) return;
    import('./middleware.factories')
      .then((m) => {
        real = (
          m.createPerformanceMiddleware as unknown as () => Middleware<T>
        )();
      })
      .catch(() => (real = null));
  };
  ensure();

  return {
    id: 'performance',
    before: (action: string, payload: unknown, state: T) => {
      if (real && real.before) return real.before(action, payload, state);
      if (typeof console !== 'undefined') console.time(action);
      return true;
    },
    after: (action: string, payload: unknown, state: T, newState: T) => {
      if (real && real.after)
        return real.after(action, payload, state, newState);
      if (typeof console !== 'undefined') console.timeEnd(action);
    },
  } as Middleware<T>;
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
  // Validation is small; keep inline to avoid extra dynamic import
  return {
    id: 'validation',
    after: (action, payload, state, newState) => {
      const error = validator(newState);
      if (error) console.error(error);
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
  // Lightweight wrapper that defers heavy persistence logic to factories
  let real: Middleware<T> | null = null;
  let initializing = false;
  const ensure = () => {
    if (real || initializing) return;
    initializing = true;
    import('./middleware.factories')
      .then((m) => {
        real = (
          m.createPersistenceMiddleware as unknown as (
            c: typeof config
          ) => Middleware<T>
        )(config);
      })
      .catch(() => {
        real = null;
      })
      .finally(() => {
        initializing = false;
      });
  };

  return {
    id: 'persistence',
    after: (action, payload, state, newState) => {
      if (config.actions && !config.actions.includes(action)) return;
      ensure();
      if (real && real.after)
        return real.after(action, payload, state, newState);
      try {
        const s =
          typeof localStorage !== 'undefined' ? localStorage : config.storage;
        if (s) s.setItem(config.key, JSON.stringify(newState));
      } catch (err) {
        if (typeof console !== 'undefined') console.error(err);
      }
    },
  };
}

// Re-export the built-in middleware creators with simpler names
// Aliases removed to avoid duplicating small symbols in the primary bundle.
