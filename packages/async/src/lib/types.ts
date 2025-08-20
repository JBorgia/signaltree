import type { SignalTree } from '@signaltree/core';
import type { DeepPartial } from '@signaltree/core';
import type { AsyncAction as CoreAsyncAction } from '@signaltree/core';
import type { AsyncActionConfig as CoreAsyncActionConfig } from '@signaltree/core';

/**
 * Concurrency policy for async actions
 */
export type ConcurrencyPolicy =
  | 'replace' // Cancel previous, start new
  | 'drop' // Ignore new if pending
  | 'queue' // Queue new after current
  | 'race'; // Run concurrently, first wins

/**
 * Configuration for async actions
 */
export interface AsyncActionConfig<T, TResult>
  extends CoreAsyncActionConfig<T, TResult> {
  concurrencyPolicy?: ConcurrencyPolicy;
  enableCancellation?: boolean;
  loadingKey?: string;
  errorKey?: string;
  onFinally?: (state: T) => DeepPartial<T>;
  label?: string;
  payload?: unknown;
}

export type AsyncAction<TInput, TResult> = CoreAsyncAction<TInput, TResult> &
  ((input: TInput) => Promise<TResult>) & {
    execute(input: TInput): Promise<TResult>;
    cancel(): void;
    clear(): void;
    pending: CoreAsyncAction<TInput, TResult>['pending'];
    error: CoreAsyncAction<TInput, TResult>['error'];
    result: CoreAsyncAction<TInput, TResult>['result'];
  };

/**
 * SignalTree with async capabilities
 */
export interface AsyncSignalTree<T> extends SignalTree<T> {
  /** Create an async action bound to this tree */
  asyncAction<TInput, TResult>(
    operation: (input: TInput, abortSignal?: AbortSignal) => Promise<TResult>,
    config?: AsyncActionConfig<T, TResult>
  ): AsyncAction<TInput, TResult>;

  /** Convenience method for loading data */
  loadData<TResult>(
    loader: () => Promise<TResult>,
    config?: AsyncActionConfig<T, TResult>
  ): AsyncAction<void, TResult>;

  /** Convenience method for form submission */
  submitForm<TInput, TResult>(
    submitter: (input: TInput) => Promise<TResult>,
    config?: AsyncActionConfig<T, TResult>
  ): AsyncAction<TInput, TResult>;
}
