export * from './core/ng-forms';
export * from './history';
export * from './enhancer';

import { debounce, unique } from './core/async-validators';
import {
  compose,
  email,
  max,
  maxLength,
  min,
  minLength,
  pattern,
  required,
} from './core/validators';

/**
 * Namespaced form validators — the recommended import surface.
 *
 * The bare per-function exports below are deprecated: generic names like
 * `required`, `min`, `pattern` collide with app-local symbols and with
 * `@signaltree/core`'s `validators.*` vocabulary. Import the namespace
 * instead:
 *
 * ```typescript
 * import { ngFormValidators as v } from '@signaltree/ng-forms';
 *
 * createFormTree(data, {
 *   validators: {
 *     email: v.compose([v.required(), v.email()]),
 *     age: v.min(18),
 *   },
 * });
 * ```
 */
export const ngFormValidators = {
  required,
  email,
  minLength,
  maxLength,
  pattern,
  min,
  max,
  compose,
  unique,
  debounce,
} as const;

/** @deprecated Use `ngFormValidators.required` — bare export removed next major. */
export { required } from './core/validators';
/** @deprecated Use `ngFormValidators.email` — bare export removed next major. */
export { email } from './core/validators';
/** @deprecated Use `ngFormValidators.minLength` — bare export removed next major. */
export { minLength } from './core/validators';
/** @deprecated Use `ngFormValidators.maxLength` — bare export removed next major. */
export { maxLength } from './core/validators';
/** @deprecated Use `ngFormValidators.pattern` — bare export removed next major. */
export { pattern } from './core/validators';
/** @deprecated Use `ngFormValidators.min` — bare export removed next major. */
export { min } from './core/validators';
/** @deprecated Use `ngFormValidators.max` — bare export removed next major. */
export { max } from './core/validators';
/** @deprecated Use `ngFormValidators.compose` — bare export removed next major. */
export { compose } from './core/validators';
/** @deprecated Use `ngFormValidators.unique` — bare export removed next major. */
export { unique } from './core/async-validators';
/** @deprecated Use `ngFormValidators.debounce` — bare export removed next major. */
export { debounce } from './core/async-validators';
