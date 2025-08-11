import { signal, Signal } from '@angular/core';
import {
  SignalTree,
  AsyncAction,
  AsyncActionConfig,
  StateObject,
} from '@signaltree/core';

/**
 * Extended AsyncActionConfig with additional monolith features
 */
interface ExtendedAsyncActionConfig<T, TResult>
  extends AsyncActionConfig<T, TResult> {
  loadingKey?: string;
  errorKey?: string;
  onFinally?: (state: T) => Partial<T>;
}

/**
 * Extended SignalTree interface with async capabilities
 */
interface AsyncSignalTree<T extends StateObject> extends SignalTree<T> {
  asyncAction<TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config?: ExtendedAsyncActionConfig<T, TResult>
  ): AsyncAction<TInput, TResult>;

  // Convenience methods for common async patterns
  loadData<TResult>(
    loader: () => Promise<TResult>,
    config?: ExtendedAsyncActionConfig<T, TResult>
  ): AsyncAction<void, TResult>;

  submitForm<TInput, TResult>(
    submitter: (input: TInput) => Promise<TResult>,
    config?: ExtendedAsyncActionConfig<T, TResult>
  ): AsyncAction<TInput, TResult>;
}

/**
 * Helper function to parse dot-notation paths
 */
function parsePath(path: string): string[] {
  return path.split('.');
}

/**
 * Helper function to set nested values in state
 */
function setNestedValue<T extends StateObject>(
  tree: SignalTree<T>,
  path: string,
  value: unknown
): void {
  const keys = parsePath(path);
  if (keys.length === 1) {
    tree.update(() => ({ [path]: value } as Partial<T>));
  } else {
    tree.update((state) => {
      const newState = { ...state } as Record<string, unknown>;
      let current = newState;
      for (let i = 0; i < keys.length - 1; i++) {
        if (
          current[keys[i]] &&
          typeof current[keys[i]] === 'object' &&
          !Array.isArray(current[keys[i]])
        ) {
          current[keys[i]] = {
            ...(current[keys[i]] as Record<string, unknown>),
          };
          current = current[keys[i]] as Record<string, unknown>;
        }
      }
      current[keys[keys.length - 1]] = value;
      return newState as Partial<T>;
    });
  }
}

/**
 * Async configuration options
 */
interface AsyncConfig {
  enabled?: boolean;
  defaultTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Enhanced async action implementation with path-based state management
 */
class AsyncActionImpl<TInput, TResult, T extends StateObject = StateObject>
  implements AsyncAction<TInput, TResult>
{
  readonly pending = signal(false);
  readonly error = signal<Error | null>(null);
  readonly result = signal<TResult | null>(null);

  constructor(
    private operation: (input: TInput) => Promise<TResult>,
    private tree: SignalTree<T>,
    private config: ExtendedAsyncActionConfig<T, TResult> = {}
  ) {}

  async execute(input: TInput): Promise<TResult> {
    const {
      loadingKey,
      errorKey,
      onStart,
      onSuccess,
      onError,
      onComplete,
      onFinally,
    } = this.config;

    try {
      // Set loading state
      this.pending.set(true);
      this.error.set(null);

      if (loadingKey) {
        setNestedValue(this.tree, loadingKey, true);
      }

      if (errorKey) {
        setNestedValue(this.tree, errorKey, null);
      }

      // Execute onStart hook
      if (onStart) {
        const startUpdate = onStart(this.tree.unwrap());
        this.tree.update(() => startUpdate);
      }

      // Execute the operation
      const result = await this.operation(input);

      // Store successful result
      this.result.set(result);

      // Execute onSuccess hook
      if (onSuccess) {
        const successUpdate = onSuccess(result, this.tree.unwrap());
        this.tree.update(() => successUpdate);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.error.set(err);

      // Set error in path-based location
      if (errorKey) {
        setNestedValue(this.tree, errorKey, err.message);
      }

      // Execute onError hook
      if (onError) {
        const errorUpdate = onError(err, this.tree.unwrap());
        this.tree.update(() => errorUpdate);
      }

      throw err;
    } finally {
      this.pending.set(false);

      // Clear loading state
      if (loadingKey) {
        setNestedValue(this.tree, loadingKey, false);
      }

      // Execute onComplete hook
      if (onComplete) {
        const completeUpdate = onComplete(this.tree.unwrap());
        this.tree.update(() => completeUpdate);
      }

      // Execute onFinally hook
      if (onFinally) {
        const finallyUpdate = onFinally(this.tree.unwrap());
        this.tree.update(() => finallyUpdate);
      }
    }
  }
}

/**
 * Enhances a SignalTree with async action capabilities
 */
export function withAsync<T extends StateObject>(
  config: AsyncConfig = {}
): (tree: SignalTree<T>) => AsyncSignalTree<T> {
  const { enabled = true } = config;

  return (tree: SignalTree<T>): AsyncSignalTree<T> => {
    if (!enabled) {
      return tree as AsyncSignalTree<T>;
    }

    // Override the asyncAction stub with real implementation
    tree.asyncAction = <TInput, TResult>(
      operation: (input: TInput) => Promise<TResult>,
      actionConfig?: ExtendedAsyncActionConfig<T, TResult>
    ): AsyncAction<TInput, TResult> => {
      return new AsyncActionImpl<TInput, TResult, T>(
        operation,
        tree,
        actionConfig
      );
    };

    // Add convenience methods
    const enhancedTree = tree as AsyncSignalTree<T>;

    enhancedTree.loadData = <TResult>(
      loader: () => Promise<TResult>,
      actionConfig?: ExtendedAsyncActionConfig<T, TResult>
    ): AsyncAction<void, TResult> => {
      return enhancedTree.asyncAction(() => loader(), actionConfig);
    };

    enhancedTree.submitForm = <TInput, TResult>(
      submitter: (input: TInput) => Promise<TResult>,
      actionConfig?: ExtendedAsyncActionConfig<T, TResult>
    ): AsyncAction<TInput, TResult> => {
      return enhancedTree.asyncAction(submitter, actionConfig);
    };

    return enhancedTree;
  };
}

/**
 * Convenience function to enable async with default settings
 */
export function enableAsync<T extends StateObject>() {
  return withAsync<T>({ enabled: true });
}

/**
 * High-performance async with aggressive optimizations
 */
export function withHighPerformanceAsync<T extends StateObject>() {
  return withAsync<T>({
    enabled: true,
    defaultTimeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  });
}

/**
 * Creates a retry wrapper for async operations
 */
export function withRetry<TInput, TResult>(
  operation: (input: TInput) => Promise<TResult>,
  attempts = 3,
  delay = 1000
): (input: TInput) => Promise<TResult> {
  return async (input: TInput): Promise<TResult> => {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await operation(input);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === attempts) {
          throw lastError;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Operation failed after all retry attempts');
  };
}

/**
 * Creates a timeout wrapper for async operations
 */
export function withTimeout<TInput, TResult>(
  operation: (input: TInput) => Promise<TResult>,
  timeoutMs: number
): (input: TInput) => Promise<TResult> {
  return async (input: TInput): Promise<TResult> => {
    return Promise.race([
      operation(input),
      new Promise<TResult>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  };
}

/**
 * Creates a cancellable async operation
 */
export function withCancellation<TInput, TResult>(
  operation: (input: TInput, signal: AbortSignal) => Promise<TResult>
): {
  execute: (input: TInput) => Promise<TResult>;
  cancel: () => void;
  cancelled: Signal<boolean>;
} {
  let controller: AbortController | null = null;
  const cancelled = signal(false);

  return {
    cancelled,
    execute: async (input: TInput): Promise<TResult> => {
      // Cancel any existing operation
      if (controller) {
        controller.abort();
      }

      controller = new AbortController();
      cancelled.set(false);

      try {
        if (!controller) {
          throw new Error('Controller initialization failed');
        }
        const result = await operation(input, controller.signal);
        return result;
      } catch (error) {
        if (controller && controller.signal.aborted) {
          cancelled.set(true);
          throw new Error('Operation was cancelled');
        }
        throw error;
      }
    },
    cancel: () => {
      if (controller) {
        controller.abort();
        cancelled.set(true);
      }
    },
  };
}

/**
 * Creates a debounced async operation
 */
export function withDebounce<TInput, TResult>(
  operation: (input: TInput) => Promise<TResult>,
  delayMs: number
): (input: TInput) => Promise<TResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let currentResolve: ((value: TResult) => void) | null = null;
  let currentReject: ((error: Error) => void) | null = null;

  return (input: TInput): Promise<TResult> => {
    return new Promise<TResult>((resolve, reject) => {
      // Clear previous timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Reject previous promise if it exists
      if (currentReject) {
        currentReject(new Error('Debounced'));
      }

      currentResolve = resolve;
      currentReject = reject;

      timeoutId = setTimeout(async () => {
        try {
          const result = await operation(input);
          if (currentResolve === resolve) {
            resolve(result);
          }
        } catch (error) {
          if (currentReject === reject) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        } finally {
          // Clear references after operation completes
          if (currentResolve === resolve) {
            currentResolve = null;
          }
          if (currentReject === reject) {
            currentReject = null;
          }
          timeoutId = null;
        }
      }, delayMs);
    });
  };
}
