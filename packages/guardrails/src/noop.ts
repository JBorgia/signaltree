/**
 * Production no-op module
 * This module exports empty implementations to ensure zero production cost
 */

import type { SignalTreeBase as SignalTree } from '@signaltree/core';

import type { GuardrailsConfig, GuardrailRule } from './lib/types';

const noopRule = (name: string): GuardrailRule => ({
  name,
  description: 'No-op guardrail',
  test: () => true,
  message: '',
  severity: 'info',
});

export function withGuardrails(config: GuardrailsConfig<any> = {}) {
  return <S>(tree: import('@signaltree/core').SignalTreeBase<S>) => {
    if (config) {
      // Production build ignores guardrail configuration
    }
    return tree as import('@signaltree/core').SignalTreeBase<S>;
  };
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
