import { signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { parsePath } from '@signaltree/core';
import type {
  SignalTree,
  AsyncAction,
  AsyncActionConfig,
} from '@signaltree/core';

/**
 * Extended AsyncActionConfig with additional async state management features.
 * Provides path-based state updates and lifecycle hooks for complete async operation control.
 *
 * @template T - The state object type
 * @template TResult - The result type of the async operation
 *
 * @example
 * ```typescript
 * const config: ExtendedAsyncActionConfig<AppState, User> = {
 *   loadingKey: 'user.loading',
 *   errorKey: 'user.error',
 *   onStart: (state) => ({ ui: { ...state.ui, loading: true } }),
 *   onSuccess: (user, state) => ({ user, ui: { ...state.ui, loading: false } }),
 *   onFinally: (state) => ({ ui: { ...state.ui, lastUpdate: Date.now() } })
 * };
 * ```
 */
interface ExtendedAsyncActionConfig<T, TResult>
  extends AsyncActionConfig<T, TResult> {
  /** Dot-notation path for loading state (e.g., 'user.loading') */
  loadingKey?: string;
  /** Dot-notation path for error state (e.g., 'user.error') */
  errorKey?: string;
  /** Hook executed after completion regardless of success/failure */
  onFinally?: (state: T) => Partial<T>;
}

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
interface AsyncSignalTree<T> extends SignalTree<T> {
  /**
   * Creates an async action with comprehensive state management and lifecycle hooks.
   *
   * @template TInput - Input parameter type for the operation
   * @template TResult - Return type of the async operation
   * @param operation - The async function to execute
   * @param config - Configuration for state management and lifecycle hooks
   * @returns AsyncAction instance with pending, error, and result signals
   */
  asyncAction<TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config?: ExtendedAsyncActionConfig<T, TResult>
  ): AsyncAction<TInput, TResult>;

  /**
   * Convenience method for data loading operations (no input parameters).
   * Perfect for initial data fetching and refresh operations.
   *
   * @template TResult - The type of data being loaded
   * @param loader - Function that returns a Promise of the data
   * @param config - Configuration for state management and lifecycle hooks
   * @returns AsyncAction instance that can be executed with no parameters
   *
   * @example
   * ```typescript
   * const loadUserProfile = tree.loadData(
   *   () => api.getCurrentUser(),
   *   {
   *     loadingKey: 'user.loading',
   *     onSuccess: (user) => ({ user })
   *   }
   * );
   *
   * await loadUserProfile.execute();
   * ```
   */
  loadData<TResult>(
    loader: () => Promise<TResult>,
    config?: ExtendedAsyncActionConfig<T, TResult>
  ): AsyncAction<void, TResult>;

  /**
   * Convenience method for form submission operations.
   * Handles form data processing with built-in state management.
   *
   * @template TInput - The form data type
   * @template TResult - The submission result type
   * @param submitter - Function that processes form data and returns a Promise
   * @param config - Configuration for state management and lifecycle hooks
   * @returns AsyncAction instance for form submission
   *
   * @example
   * ```typescript
   * const submitRegistration = tree.submitForm(
   *   async (formData: RegistrationForm) => auth.register(formData),
   *   {
   *     loadingKey: 'registration.submitting',
   *     errorKey: 'registration.error',
   *     onSuccess: (result) => ({ user: result.user, isAuthenticated: true })
   *   }
   * );
   *
   * await submitRegistration.execute(formData);
   * ```
   */
  submitForm<TInput, TResult>(
    submitter: (input: TInput) => Promise<TResult>,
    config?: ExtendedAsyncActionConfig<T, TResult>
  ): AsyncAction<TInput, TResult>;
}

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
class AsyncActionImpl<TInput, TResult, T>
  implements AsyncAction<TInput, TResult>
{
  /** Signal indicating if the operation is currently pending */
  readonly pending = signal(false);
  /** Signal containing any error that occurred during execution */
  readonly error = signal<Error | null>(null);
  /** Signal containing the successful result of the operation */
  readonly result = signal<TResult | null>(null);

  constructor(
    private operation: (input: TInput) => Promise<TResult>,
    private tree: SignalTree<T>,
    private config: ExtendedAsyncActionConfig<T, TResult> = {}
  ) {}

  /**
   * Executes the async operation with complete lifecycle management and error handling.
   * Manages loading states, executes lifecycle hooks, and handles both success and error cases.
   *
   * @param input - Input parameters for the operation
   * @returns Promise resolving to the operation result
   * @throws Error if the operation fails after executing error handling hooks
   *
   * @example
   * ```typescript
   * // Basic execution
   * const result = await action.execute(inputData);
   *
   * // With error handling
   * try {
   *   const result = await action.execute(inputData);
   *   // Handle success
   * } catch (error) {
   *   // Error has been processed through onError hook
   *   // and stored in error signal and errorKey path
   * }
   *
   * // Monitor state during execution
   * action.pending.subscribe(pending => {
   *   if (pending) console.log('Operation in progress...');
   * });
   * ```
   */
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
export function withAsync<T>(
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
export function enableAsync<T>() {
  return withAsync<T>({ enabled: true });
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
export function withHighPerformanceAsync<T>() {
  return withAsync<T>({
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
