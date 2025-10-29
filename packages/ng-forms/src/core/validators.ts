/**
 * @fileoverview Tree-shakeable validator functions for form fields
 *
 * These validators are exported as individual functions to enable
 * tree-shaking. Only the validators you actually use will be included
 * in your bundle.
 */

import type { FieldValidator } from './ng-forms';

/**
 * Creates a required field validator
 *
 * @param message - Custom error message (default: "Required")
 * @returns Validator function that returns error message if value is falsy
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   validators: {
 *     name: required(),
 *     email: required('Email is required')
 *   }
 * });
 * ```
 */
export function required(message = 'Required'): FieldValidator {
  return (value: unknown) => (!value ? message : null);
}

/**
 * Creates an email format validator
 *
 * @param message - Custom error message (default: "Invalid email")
 * @returns Validator function that checks for @ symbol
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   validators: {
 *     email: email('Please enter a valid email address')
 *   }
 * });
 * ```
 */
export function email(message = 'Invalid email'): FieldValidator {
  return (value: unknown) => {
    const strValue = value as string;
    return strValue && !strValue.includes('@') ? message : null;
  };
}

/**
 * Creates a minimum length validator for strings
 *
 * @param min - Minimum required length
 * @param message - Optional custom error message
 * @returns Validator function that checks string length
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   validators: {
 *     password: minLength(8),
 *     description: minLength(10, 'Description must be at least 10 characters')
 *   }
 * });
 * ```
 */
export function minLength(min: number, message?: string): FieldValidator {
  return (value: unknown) => {
    const strValue = value as string;
    const errorMsg = message ?? `Min ${min} characters`;
    return strValue && strValue.length < min ? errorMsg : null;
  };
}

/**
 * Creates a maximum length validator for strings
 *
 * @param max - Maximum allowed length
 * @param message - Optional custom error message
 * @returns Validator function that checks string length
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   validators: {
 *     username: maxLength(20),
 *     bio: maxLength(500, 'Bio must be under 500 characters')
 *   }
 * });
 * ```
 */
export function maxLength(max: number, message?: string): FieldValidator {
  return (value: unknown) => {
    const strValue = value as string;
    const errorMsg = message ?? `Max ${max} characters`;
    return strValue && strValue.length > max ? errorMsg : null;
  };
}

/**
 * Creates a regex pattern validator
 *
 * @param regex - Regular expression to test against
 * @param message - Custom error message (default: "Invalid format")
 * @returns Validator function that tests value against regex
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   validators: {
 *     phone: pattern(/^\d{3}-\d{3}-\d{4}$/, 'Phone must be in format: 123-456-7890'),
 *     zipCode: pattern(/^\d{5}$/, 'Zip code must be 5 digits')
 *   }
 * });
 * ```
 */
export function pattern(
  regex: RegExp,
  message = 'Invalid format'
): FieldValidator {
  return (value: unknown) => {
    const strValue = value as string;
    return strValue && !regex.test(strValue) ? message : null;
  };
}

/**
 * Creates a minimum value validator for numbers
 *
 * @param min - Minimum allowed value
 * @param message - Optional custom error message
 * @returns Validator function that checks numeric minimum
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   validators: {
 *     age: min(18, 'Must be at least 18 years old'),
 *     quantity: min(1)
 *   }
 * });
 * ```
 */
export function min(min: number, message?: string): FieldValidator {
  return (value: unknown) => {
    const numValue = value as number;
    const errorMsg = message ?? `Must be at least ${min}`;
    return numValue < min ? errorMsg : null;
  };
}

/**
 * Creates a maximum value validator for numbers
 *
 * @param max - Maximum allowed value
 * @param message - Optional custom error message
 * @returns Validator function that checks numeric maximum
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   validators: {
 *     age: max(120, 'Must be under 120 years old'),
 *     quantity: max(100)
 *   }
 * });
 * ```
 */
export function max(max: number, message?: string): FieldValidator {
  return (value: unknown) => {
    const numValue = value as number;
    const errorMsg = message ?? `Must be at most ${max}`;
    return numValue > max ? errorMsg : null;
  };
}

/**
 * Combines multiple validators into a single validator function
 *
 * @param validators - Array of validator functions to combine
 * @returns Combined validator that returns the first error encountered
 *
 * @example
 * ```typescript
 * createFormTree(data, {
 *   validators: {
 *     email: compose([
 *       required('Email is required'),
 *       email('Invalid email format'),
 *       pattern(/@company\.com$/, 'Must be a company email')
 *     ])
 *   }
 * });
 * ```
 */
export function compose(validators: FieldValidator[]): FieldValidator {
  return (value: unknown) => {
    for (const validator of validators) {
      const error = validator(value);
      if (error) {
        return error;
      }
    }
    return null;
  };
}
