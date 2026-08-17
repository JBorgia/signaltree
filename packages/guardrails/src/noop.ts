/**
 * Production no-op module
 * This module exports empty implementations to ensure zero production cost
 */

import type { Enhancer } from '@signaltree/core';

import type { GuardrailsAPI, GuardrailsConfig, GuardrailRule } from './lib/types';

const noopRule = (name: string): GuardrailRule => ({
  name,
  description: 'No-op guardrail',
  test: () => true,
  message: '',
  severity: 'info',
});

/**
 * Production no-op. Declares the SAME public contract as the real
 * implementation — both halves of a conditionally-exported symbol must, or a
 * consumer's types change with their build configuration.
 *
 * `__guardrails` is OPTIONAL in that contract, so returning the tree without
 * attaching an API satisfies it, which is exactly what a no-op should do.
 */
export function guardrails(
  config: GuardrailsConfig<any> = {}
): Enhancer<{ __guardrails?: GuardrailsAPI }> {
  const enhancerFn = <S>(tree: import('@signaltree/core').SignalTree<S>) => {
    if (config) {
      // Production build ignores guardrail configuration
    }
    return tree as import('@signaltree/core').SignalTree<S>;
  };
  return enhancerFn as unknown as Enhancer<{ __guardrails?: GuardrailsAPI }>;
}

export const rules = {
  noDeepNesting: (_maxDepth = 5) => noopRule('noop'),
  noFunctionsInState: () => noopRule('noop'),
  noCacheInPersistence: () => noopRule('noop'),
  maxPayloadSize: (_maxKB = 100) => noopRule('noop'),
  noSensitiveData: (
    _sensitiveKeys = ['password', 'token', 'secret', 'apiKey']
  ) => noopRule('noop'),
};

export * from './lib/types';
