import { signal } from '@angular/core';

import type { ISignalTree } from './types';

/**
 * Create an async operation that updates the tree via its batchUpdate method
 * and sets simple name-scoped keys for pending/result/error.
 */
export function createAsyncOperation<T, TResult>(
  name: string,
  operation: () => Promise<TResult>
) {
  return async (tree: ISignalTree<T>) => {
    // Trigger batch update marking pending
    if (typeof (tree as any)['batchUpdate'] === 'function') {
      // batchUpdate expects a Partial<T>. We don't know T here, so create
      // a minimal partial using unknown and cast to Partial<T> at the last step.
      const pendingPatch = {
        [`${name}_PENDING`]: true,
      } as unknown as Partial<T>;
      (tree as any)['batchUpdate'](() => pendingPatch);
    } else if ('$' in tree) {
      // Best-effort fallback: set via $ alias if available
      try {
        (
          (
            tree as unknown as {
              ['$']: Record<string, { set?: (v: unknown) => void }>;
            }
          )['$'] as Record<string, { set?: (v: unknown) => void }>
        )[`${name}_PENDING`]?.set?.(true);
      } catch (e) {
        void e;
      }
    }

    try {
      const result = await operation();

      if (typeof (tree as any)['batchUpdate'] === 'function') {
        const resultPatch = {
          [`${name}_RESULT`]: result,
          [`${name}_PENDING`]: false,
        } as unknown as Partial<T>;
        (tree as any)['batchUpdate'](() => resultPatch);
      } else if ('$' in tree) {
        try {
          (
            (
              tree as unknown as {
                ['$']: Record<string, { set?: (v: unknown) => void }>;
              }
            )['$'] as Record<string, { set?: (v: unknown) => void }>
          )[`${name}_RESULT`]?.set?.(result);
          (
            (
              tree as unknown as {
                ['$']: Record<string, { set?: (v: unknown) => void }>;
              }
            )['$'] as Record<string, { set?: (v: unknown) => void }>
          )[`${name}_PENDING`]?.set?.(false);
        } catch (e) {
          void e;
        }
      }

      return result;
    } catch (error) {
      if (typeof (tree as any)['batchUpdate'] === 'function') {
        const errorPatch = {
          [`${name}_ERROR`]: error,
          [`${name}_PENDING`]: false,
        } as unknown as Partial<T>;
        (tree as any)['batchUpdate'](() => errorPatch);
      } else if ('$' in tree) {
        try {
          (
            tree as unknown as {
              ['$']: Record<string, { set?: (v: unknown) => void }>;
            }
          )['$'][`${name}_ERROR`]?.set?.(error);
          (
            tree as unknown as {
              ['$']: Record<string, { set?: (v: unknown) => void }>;
            }
          )['$'][`${name}_PENDING`]?.set?.(false);
        } catch (e) {
          void e;
        }
      }
      throw error;
    }
  };
}

/**
 * Standalone status tracking for async operations using Angular signals.
 */
export function trackAsync<T>(operation: () => Promise<T>) {
  const pending = signal(false);
  const error = signal<Error | null>(null);
  const result = signal<T | null>(null);

  return {
    pending: pending.asReadonly(),
    error: error.asReadonly(),
    result: result.asReadonly(),
    execute: async () => {
      pending.set(true);
      error.set(null);
      try {
        const res = await operation();
        result.set(res as T);
        return res;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        error.set(err);
        throw err;
      } finally {
        pending.set(false);
      }
    },
  };
}
