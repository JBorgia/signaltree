import { firstValueFrom, isObservable } from 'rxjs';

/**
 * @fileoverview Tree-shakeable async validator functions for form fields
 */

import type { FormTreeAsyncValidatorFn } from './ng-forms';

/**
 * Creates an async uniqueness validator
 *
 * @param checkFn - Async function that returns true if value already exists
 * @param message - Custom error message (default: "Already exists")
 * @returns Async validator function
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   asyncValidators: {
 *     email: unique(
 *       async (email) => {
 *         const response = await fetch(`/api/check-email?email=${email}`);
 *         const { exists } = await response.json();
 *         return exists;
 *       },
 *       'This email is already registered'
 *     )
 *   }
 * });
 * ```
 */
export function unique(
  checkFn: (value: unknown) => Promise<boolean>,
  message = 'Already exists'
): FormTreeAsyncValidatorFn<unknown> {
  return async (value: unknown) => {
    if (!value) return null;
    const exists = await checkFn(value);
    return exists ? message : null;
  };
}

/**
 * Creates a debounced async validator
 *
 * @param validator - The async validator to debounce
 * @param delayMs - Delay in milliseconds before running validation
 * @returns Debounced async validator
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   asyncValidators: {
 *     username: debounce(
 *       unique(checkUsername, 'Username taken'),
 *       500 // Wait 500ms after user stops typing
 *     )
 *   }
 * });
 * ```
 */
export function debounce(
  validator: FormTreeAsyncValidatorFn<unknown>,
  delayMs: number
): FormTreeAsyncValidatorFn<unknown> {
  let timeoutId: ReturnType<typeof setTimeout>;

  return async (value: unknown) => {
    return new Promise((resolve) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        const maybeAsync = validator(value);
        const result = isObservable(maybeAsync)
          ? await firstValueFrom(maybeAsync)
          : await maybeAsync;
        resolve(result);
      }, delayMs);
    });
  };
}
