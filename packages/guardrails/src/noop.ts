/**
 * Production no-op module
 * This module exports empty implementations to ensure zero production cost
 */

import type { SignalTree } from '@signaltree/core';

import type { GuardrailsConfig, GuardrailRule } from './lib/types';

const noopRule = (name: string): GuardrailRule => ({
  name,
  description: 'No-op guardrail',
  test: () => true,
  message: '',
  severity: 'info',
});

export function withGuardrails<T extends Record<string, unknown>>(
  config?: GuardrailsConfig
): (tree: SignalTree<T>) => SignalTree<T> {
  return (tree) => {
    if (config) {
      // Production build ignores guardrail configuration
    }
    return tree;
  };
}

export const rules = {
  noDeepNesting: () => noopRule('noop'),
  noFunctionsInState: () => noopRule('noop'),
  noCacheInPersistence: () => noopRule('noop'),
  maxPayloadSize: () => noopRule('noop'),
  noSensitiveData: () => noopRule('noop'),
};

export type * from './lib/types';
