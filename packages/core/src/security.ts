/**
 * @signaltree/core/security
 *
 * Security utilities for preventing common vulnerabilities.
 * Import from '@signaltree/core/security' to reduce main bundle.
 */
import {
  SecurityValidator,
  type SecurityValidatorConfig,
} from './lib/security/security-validator';
import type { SecurityFeature } from './lib/types';
import { isBuiltInObject } from './lib/utils';

export {
  SecurityValidator,
  SecurityPresets,
  type SecurityEvent,
  type SecurityEventType,
  type SecurityValidatorConfig,
} from './lib/security/security-validator';
export type { SecurityFeature } from './lib/types';

/**
 * Create a construction-time security validator for `signalTree`.
 * Replaces passing a raw `SecurityValidatorConfig` directly (v11+): the raw
 * config kept `SecurityValidator` in every bundle; wrapping it here keeps it
 * tree-shakeable.
 */
export function security(config: SecurityValidatorConfig = {}): SecurityFeature {
  const validator = new SecurityValidator(config);

  function walk(value: unknown, path: string[]): void {
    if (value === null || value === undefined) return;

    if (typeof value !== 'object') {
      validator.validateValue(value);
      return;
    }

    if (isBuiltInObject(value)) return;

    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, [...path, String(i)]));
      return;
    }

    for (const key of Object.keys(value as Record<string, unknown>)) {
      try {
        validator.validateKey(key);
      } catch (error) {
        throw new Error(
          `${(error as Error).message}\nPath: ${[...path, key].join('.')}`
        );
      }

      const val = (value as Record<string, unknown>)[key];

      try {
        validator.validateValue(val);
      } catch (error) {
        throw new Error(
          `${(error as Error).message}\nPath: ${[...path, key].join('.')}`
        );
      }

      walk(val, [...path, key]);
    }
  }

  return {
    __signalTreeSecurity: true,
    validate: (state: unknown) => walk(state, []),
  };
}
