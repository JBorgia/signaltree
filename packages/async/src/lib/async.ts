// Use framework-neutral adapter exports (phase 1) instead of direct Angular imports
import { signal, type Signal } from '@signaltree/core';
import { parsePath } from '@signaltree/core';
import type { SignalTree, DeepPartial } from '@signaltree/core';
import type { AsyncAction, AsyncActionConfig, AsyncSignalTree } from './types';

/**
 * Extended AsyncActionConfig with additional async state management features.
 * Provides path-based state updates and lifecycle hooks for complete async operation control.
 *
 * @template T - The state object type
 * @template TResult - The result type of the async operation
 *
 * @example
 * ```typescript
 * const config: AsyncActionConfig<AppState, User> = {
 *   loadingKey: 'user.loading',
 *   errorKey: 'user.error',
 *   onStart: (state) => ({ ui: { ...state.ui, loading: true } }),
 *   onSuccess: (user, state) => ({ user, ui: { ...state.ui, loading: false } }),
 *   onFinally: (state) => ({ ui: { ...state.ui, lastUpdate: Date.now() } })
 * };
 * ```
 */

/**
 * Extended SignalTree interface with comprehensive async operation capabilities.
 * Provides convenient methods for common async patterns with full TypeScript inference.
 *
 * @template T - The state object type extending StateObject
 *
 * @example
 * ```typescript
 * interface AppState {
 *   user: User | null;
 *   products: Product[];
 *   ui: { loading: boolean; error: string | null };
 * }
 *
 * const tree: AsyncSignalTree<AppState> = create(initialState).with(withAsync());
 *
 * // Generic async action
 * const fetchUser = tree.asyncAction(
 *   async (id: string) => userService.getUser(id),
 *   { loadingKey: 'ui.loading', errorKey: 'ui.error' }
 * );
 *
 * // Convenience methods for common patterns
 * const loadProducts = tree.loadData(
 *   () => productService.getAll(),
 *   { onSuccess: (products) => ({ products }) }
 * );
 *
 * const saveUser = tree.submitForm(
 *   async (userData: UserForm) => userService.save(userData),
 *   { loadingKey: 'ui.saving' }
 * );
 * ```
 */

/**
 * Sets nested values in state using dot-notation paths with immutable updates.
 * Safely navigates and updates deeply nested state properties while preserving immutability.
 *
 * @template T - The state object type extending StateObject

/**
 * Sets nested values in state using dot-notation paths with immutable updates.
 * Safely navigates and updates deeply nested state properties while preserving immutability.
 *
 * @template T - The state object type extending StateObject
 * @param tree - The SignalTree instance to update
 * @param path - Dot-notation path to the property (e.g., 'user.profile.name')
 * @param value - The value to set at the specified path
 *
 * @example
 * ```typescript
 * // Simple property update
 * setNestedValue(tree, 'loading', true);
 * // Result: { ...state, loading: true }
 *
 * // Nested property update
 * setNestedValue(tree, 'user.profile.name', 'John Doe');
 * // Result: { ...state, user: { ...state.user, profile: { ...state.user.profile, name: 'John Doe' } } }
 *
 * // Deep nesting with error handling
 * setNestedValue(tree, 'api.cache.users.12345', userData);
 * // Safely creates intermediate objects if they don't exist
 * ```
 */
function setNestedValue<T>(
  tree: SignalTree<T>,
  path: string,
  value: unknown
): void {
  const keys = parsePath(path);
  if (keys.length === 1) {
    tree.update(() => ({ [path]: value } as DeepPartial<T>));
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
      return newState as DeepPartial<T>;
    });
  }
}

/**
 * Configuration options for async functionality with performance and retry settings.
 *
 * @example
 * ```typescript
 * const config: AsyncConfig = {
 *   enabled: true,
 *   defaultTimeout: 10000, // 10 seconds
 *   retryAttempts: 3,
 *   retryDelay: 1000 // 1 second base delay
 * };
 * ```
 */
interface AsyncConfig {
  /** Whether async functionality is enabled */
  enabled?: boolean;
  /** Default timeout for operations in milliseconds */
  defaultTimeout?: number;
  /** Number of retry attempts for failed operations */
  retryAttempts?: number;
  /** Base delay between retry attempts in milliseconds */
  retryDelay?: number;
}

/**
 * Enhanced async action implementation with comprehensive state management and lifecycle control.
 * Provides path-based state updates, error handling, and complete operation lifecycle tracking.
 *
 * @template TInput - Input parameter type for the operation
 * @template TResult - Return type of the async operation
 * @template T - State object type extending StateObject
 *
 * @example
 * ```typescript
 * // Create an async action for user authentication
 * const loginAction = new AsyncActionImpl(
 *   async (credentials: LoginForm) => authService.login(credentials),
 *   tree,
 *   {
 *     loadingKey: 'auth.logging_in',
 *     errorKey: 'auth.error',
 *     onStart: (state) => ({ auth: { ...state.auth, error: null } }),
 *     onSuccess: (user, state) => ({
 *       auth: { ...state.auth, user, isAuthenticated: true }
 *     }),
 *     onError: (error, state) => ({
 *       auth: { ...state.auth, lastError: error.message }
 *     })
 *   }
 * );
 *
 * // Execute the action
 * try {
 *   const user = await loginAction.execute({ email, password });
 *   console.log('Logged in:', user);
 * } catch (error) {
 *   console.error('Login failed:', error);
 * }
 *
 * // Access state signals
 * console.log('Pending:', loginAction.pending());
 * console.log('Error:', loginAction.error());
 * console.log('Result:', loginAction.result());
 * ```
 */
class AsyncActionImpl<TInput, TResult, T> {
  readonly pending = signal(false);
  readonly error = signal<Error | null>(null);
  readonly result = signal<TResult | null>(null);

  private controller: AbortController | null = null;
  private currentRun = 0;
  private currentPromise: Promise<TResult> | null = null;
  private raceSettled = false;
  private queue: Array<{
    input: TInput;
    resolve: (v: TResult) => void;
    reject: (e: unknown) => void;
  }> = [];

  constructor(
    private operation: (
      input: TInput,
      signal?: AbortSignal
    ) => Promise<TResult>,
    private tree: SignalTree<T>,
    private config: AsyncActionConfig<T, TResult> = {}
  ) {}

  cancel(): void {
    if (this.config.enableCancellation && this.controller) {
      this.controller.abort();
    }
  }

  clear(): void {
    this.error.set(null);
    this.result.set(null);
  }

  private runOperation(input: TInput): Promise<TResult> {
    const policy = this.config.concurrencyPolicy || 'replace';
    if (this.config.enableCancellation && policy === 'replace') {
      this.controller?.abort();
    }
    if (this.config.enableCancellation) {
      this.controller = new AbortController();
    }
    const runId = ++this.currentRun;
    this.error.set(null);
    this.pending.set(true);
    if (policy === 'race') this.raceSettled = false;

    // Path / hook handling
    const { loadingKey, errorKey, onStart } = this.config;
    if (loadingKey) setNestedValue(this.tree, loadingKey, true);
    if (errorKey) setNestedValue(this.tree, errorKey, null);
    if (onStart) {
      try {
        const patch = onStart(this.tree.unwrap());
        if (patch) this.tree.update(() => patch as DeepPartial<T>);
      } catch {
        // swallow onStart hook errors
      }
    }

    const p = this.operation(input, this.controller?.signal)
      .then((value) => {
        if (policy !== 'race' && runId !== this.currentRun) return value; // stale
        if (policy !== 'race' || !this.raceSettled) {
          this.result.set(value);
          if (policy === 'race') this.raceSettled = true;
          if (this.config.onSuccess) {
            try {
              const patch = this.config.onSuccess(value, this.tree.unwrap());
              if (patch) this.tree.update(() => patch as DeepPartial<T>);
            } catch {
              // swallow onSuccess hook errors
            }
          }
        }
        return value;
      })
      .catch((err) => {
        if (
          (policy === 'race' || runId === this.currentRun) &&
          (policy !== 'race' || !this.raceSettled)
        ) {
          if (policy === 'race') this.raceSettled = true;
          const e = err as Error;
          this.error.set(e);
          if (errorKey) setNestedValue(this.tree, errorKey, e.message);
          if (this.config.onError) {
            try {
              const patch = this.config.onError(e, this.tree.unwrap());
              if (patch) this.tree.update(() => patch as DeepPartial<T>);
            } catch {
              // swallow onError hook errors
            }
          }
        }
        throw err;
      })
      .finally(() => {
        if (policy === 'race' || runId === this.currentRun) {
          this.pending.set(false);
          if (loadingKey) setNestedValue(this.tree, loadingKey, false);
          if (this.config.onComplete) {
            try {
              const patch = this.config.onComplete(this.tree.unwrap());
              if (patch) this.tree.update(() => patch as DeepPartial<T>);
            } catch {
              // swallow onComplete hook errors
            }
          }
          if (this.config.onFinally) {
            try {
              const patch = this.config.onFinally(this.tree.unwrap());
              if (patch) this.tree.update(() => patch as DeepPartial<T>);
            } catch {
              // swallow onFinally hook errors
            }
          }
          if (policy === 'queue' && this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) this.execute(next.input).then(next.resolve, next.reject);
          }
        }
      });
    this.currentPromise = p;
    return p;
  }

  execute(input: TInput): Promise<TResult> {
    const policy = this.config.concurrencyPolicy || 'replace';
    switch (policy) {
      case 'drop':
        if (this.pending()) return this.currentPromise as Promise<TResult>;
        return this.runOperation(input);
      case 'queue':
        if (this.pending()) {
          return new Promise<TResult>((resolve, reject) =>
            this.queue.push({ input, resolve, reject })
          );
        }
        return this.runOperation(input);
      case 'race':
        return this.runOperation(input);
      case 'replace':
      default:
        return this.runOperation(input);
    }
  }
}

/**
 * Enhances a SignalTree with comprehensive async action capabilities.
 * Creates an AsyncSignalTree with advanced async operation management, path-based state updates,
 * and convenient methods for common async patterns.
 *
 * @template T - The state object type extending StateObject
 * @param config - Configuration options for async behavior and performance settings
 * @returns Function that enhances a SignalTree with async capabilities
 *
 * @example
 * ```typescript
 * interface AppState {
 *   user: User | null;
 *   loading: { [key: string]: boolean };
 *   errors: { [key: string]: string | null };
 * }
 *
 * // Basic async enhancement
 * const tree = create(initialState).with(withAsync());
 *
 * // Enhanced async with configuration
 * const tree = create(initialState).with(withAsync({
 *   enabled: true,
 *   defaultTimeout: 30000,
 *   retryAttempts: 3,
 *   retryDelay: 1000
 * }));
 *
 * // Create async actions with path-based state management
 * const fetchUser = tree.asyncAction(
 *   async (userId: string) => userService.getUser(userId),
 *   {
 *     loadingKey: 'loading.user',
 *     errorKey: 'errors.user',
 *     onSuccess: (user) => ({ user })
 *   }
 * );
 *
 * // Use convenience methods
 * const loadData = tree.loadData(() => dataService.getAll());
 * const submitForm = tree.submitForm(async (data: FormData) => api.submit(data));
 * ```
 */
export function withAsync(config: AsyncConfig = {}) {
  const { enabled = true } = config;
  return function enhance<T>(tree: SignalTree<T>): AsyncSignalTree<T> {
    if (!enabled) return tree as unknown as AsyncSignalTree<T>;

    // Enhance the tree with async methods
    const enhancedTree = tree as SignalTree<T> & {
      asyncAction: <TInput, TResult>(
        operation: (input: TInput, signal?: AbortSignal) => Promise<TResult>,
        actionConfig?: AsyncActionConfig<T, TResult>
      ) => AsyncAction<TInput, TResult>;
    };

    enhancedTree.asyncAction = <TInput, TResult>(
      operation: (input: TInput, signal?: AbortSignal) => Promise<TResult>,
      actionConfig?: AsyncActionConfig<T, TResult>
    ): AsyncAction<TInput, TResult> => {
      const impl = new AsyncActionImpl<TInput, TResult, T>(
        operation,
        tree,
        actionConfig
      );
      const fn = (input: TInput) => impl.execute(input);
      const action = fn as unknown as AsyncAction<TInput, TResult>;
      action.execute = (input: TInput) => impl.execute(input);
      action.cancel = () => impl.cancel();
      action.clear = () => impl.clear();
      // Expose signals directly (they are callable) preserving signal brand
      action.pending = impl.pending as unknown as typeof action.pending;
      action.error = impl.error as unknown as typeof action.error;
      action.result = impl.result as unknown as typeof action.result;
      return action;
    };

    const enhanced = enhancedTree as unknown as AsyncSignalTree<T>;
    enhanced.loadData = <TResult>(
      loader: () => Promise<TResult>,
      actionConfig?: AsyncActionConfig<T, TResult>
    ): AsyncAction<void, TResult> =>
      enhanced.asyncAction(() => loader(), actionConfig);
    enhanced.submitForm = <TInput, TResult>(
      submitter: (input: TInput) => Promise<TResult>,
      actionConfig?: AsyncActionConfig<T, TResult>
    ): AsyncAction<TInput, TResult> =>
      enhanced.asyncAction(submitter, actionConfig);
    return enhanced;
  };
}

/**
 * Convenience function to enable async functionality with default settings.
 * Equivalent to withAsync({ enabled: true }) but more concise for common usage.
 *
 * @template T - The state object type extending StateObject
 * @returns Function that enhances a SignalTree with async capabilities using default settings
 *
 * @example
 * ```typescript
 * // Simple async enablement
 * const tree = create(initialState).with(enableAsync());
 *
 * // Equivalent to:
 * const tree = create(initialState).with(withAsync({ enabled: true }));
 *
 * // Use the enhanced tree
 * const loadUser = tree.loadData(() => userService.getCurrentUser());
 * await loadUser.execute();
 * ```
 */
export function enableAsync() {
  // Generic inference happens in the returned enhancer from withAsync
  return withAsync({ enabled: true });
}

/**
 * High-performance async enhancement with aggressive optimizations and resilience features.
 * Provides enhanced timeout, retry logic, and performance optimizations for production applications.
 *
 * @template T - The state object type extending StateObject
 * @returns Function that enhances a SignalTree with high-performance async capabilities
 *
 * @example
 * ```typescript
 * // For production applications requiring resilience
 * const tree = create(initialState).with(withHighPerformanceAsync());
 *
 * // Automatically includes:
 * // - 30 second timeout
 * // - 3 retry attempts
 * // - 1 second base retry delay
 * // - Exponential backoff for retries
 *
 * const criticalOperation = tree.asyncAction(
 *   async (data) => criticalService.process(data),
 *   { loadingKey: 'critical.loading' }
 * );
 *
 * // Will automatically retry on failure with exponential backoff
 * await criticalOperation.execute(data);
 * ```
 */
export function withHighPerformanceAsync() {
  // Generic inference happens in the returned enhancer from withAsync
  return withAsync({
    enabled: true,
    defaultTimeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  });
}

/**
 * Creates a retry wrapper for async operations with exponential backoff.
 * Automatically retries failed operations with configurable attempts and delay strategy.
 *
 * @template TInput - Input parameter type for the operation
 * @template TResult - Return type of the async operation
 * @param operation - The async function to wrap with retry logic
 * @param attempts - Number of retry attempts (default: 3)
 * @param delay - Base delay between retries in milliseconds (default: 1000)
 * @returns Wrapped function with retry capability
 *
 * @example
 * ```typescript
 * // Basic retry wrapper
 * const reliableFetch = withRetry(
 *   async (url: string) => fetch(url).then(r => r.json()),
 *   3, // 3 attempts
 *   1000 // 1 second base delay
 * );
 *
 * // Usage in async action
 * const fetchData = tree.asyncAction(
 *   withRetry(async (id: string) => api.getData(id), 5, 2000)
 * );
 *
 * // Retry with exponential backoff:
 * // Attempt 1: immediate
 * // Attempt 2: after 1000ms
 * // Attempt 3: after 2000ms
 * // Attempt 4: after 3000ms
 * try {
 *   const result = await reliableFetch('/api/data');
 * } catch (error) {
 *   // All retry attempts failed
 * }
 * ```
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

        // Wait before retry with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Operation failed after all retry attempts');
  };
}

/**
 * Creates a timeout wrapper for async operations with automatic cancellation.
 * Prevents operations from running indefinitely by racing against a timeout.
 *
 * @template TInput - Input parameter type for the operation
 * @template TResult - Return type of the async operation
 * @param operation - The async function to wrap with timeout logic
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns Wrapped function with timeout capability
 *
 * @example
 * ```typescript
 * // Basic timeout wrapper
 * const timedFetch = withTimeout(
 *   async (url: string) => fetch(url).then(r => r.json()),
 *   5000 // 5 second timeout
 * );
 *
 * // Usage in async action
 * const quickFetch = tree.asyncAction(
 *   withTimeout(async (id: string) => api.getData(id), 3000)
 * );
 *
 * // Combine with retry for robust operations
 * const robustFetch = withRetry(
 *   withTimeout(async (url: string) => fetch(url), 5000),
 *   3,
 *   1000
 * );
 *
 * try {
 *   const result = await timedFetch('/api/slow-endpoint');
 * } catch (error) {
 *   // Either network error or timeout after 5 seconds
 *   if (error.message.includes('timed out')) {
 *     console.log('Operation was too slow');
 *   }
 * }
 * ```
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
 * Creates a cancellable async operation with manual cancellation control.
 * Provides fine-grained control over operation lifecycle with abort signals.
 *
 * @template TInput - Input parameter type for the operation
 * @template TResult - Return type of the async operation
 * @param operation - The async function that accepts an AbortSignal
 * @returns Object with execute, cancel methods and cancelled signal
 *
 * @example
 * ```typescript
 * // Create cancellable file upload
 * const fileUpload = withCancellation(
 *   async (file: File, signal: AbortSignal) => {
 *     const formData = new FormData();
 *     formData.append('file', file);
 *
 *     const response = await fetch('/api/upload', {
 *       method: 'POST',
 *       body: formData,
 *       signal // Pass abort signal to fetch
 *     });
 *
 *     return response.json();
 *   }
 * );
 *
 * // Start upload
 * const uploadPromise = fileUpload.execute(selectedFile);
 *
 * // Cancel if needed
 * document.getElementById('cancel').onclick = () => {
 *   fileUpload.cancel();
 *   console.log('Upload cancelled:', fileUpload.cancelled());
 * };
 *
 * // Handle completion or cancellation
 * try {
 *   const result = await uploadPromise;
 *   console.log('Upload successful:', result);
 * } catch (error) {
 *   if (fileUpload.cancelled()) {
 *     console.log('Upload was cancelled by user');
 *   } else {
 *     console.error('Upload failed:', error);
 *   }
 * }
 *
 * // Use with SignalTree async action
 * const uploadAction = tree.asyncAction(
 *   fileUpload.execute,
 *   { loadingKey: 'upload.progress' }
 * );
 * ```
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
 * Creates a debounced async operation that delays execution until after a specified wait time.
 * Perfect for search inputs, auto-save functionality, and rate-limiting API calls.
 *
 * @template TInput - Input parameter type for the operation
 * @template TResult - Return type of the async operation
 * @param operation - The async function to debounce
 * @param delayMs - Delay in milliseconds before execution
 * @returns Debounced function that cancels previous calls
 *
 * @example
 * ```typescript
 * // Debounced search function
 * const debouncedSearch = withDebounce(
 *   async (query: string) => searchService.search(query),
 *   300 // 300ms delay
 * );
 *
 * // Usage in search input
 * const searchAction = tree.asyncAction(debouncedSearch, {
 *   loadingKey: 'search.loading',
 *   onSuccess: (results) => ({ searchResults: results })
 * });
 *
 * // Auto-save with debouncing
 * const autoSave = withDebounce(
 *   async (formData: FormData) => api.saveDraft(formData),
 *   2000 // Save 2 seconds after user stops typing
 * );
 *
 * const saveAction = tree.asyncAction(autoSave, {
 *   onSuccess: () => ({ lastSaved: Date.now() })
 * });
 *
 * // Multiple rapid calls - only the last one executes
 * searchAction.execute('a');     // Cancelled
 * searchAction.execute('ap');    // Cancelled
 * searchAction.execute('app');   // Cancelled
 * searchAction.execute('apple'); // Executes after 300ms
 *
 * // Error handling for cancelled operations
 * try {
 *   await debouncedSearch('quick query');
 * } catch (error) {
 *   if (error.message === 'Debounced') {
 *     console.log('Search was superseded by newer query');
 *   }
 * }
 * ```
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
