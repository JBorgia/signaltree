/**
 * Production no-op module
 * This module exports empty implementations to ensure zero production cost
 */

export function withGuardrails(): any {
  return (tree: any) => tree;
}

export const rules = {
  noDeepNesting: () => ({ name: 'noop', test: () => true, message: '' }),
  noFunctionsInState: () => ({ name: 'noop', test: () => true, message: '' }),
  noCacheInPersistence: () => ({ name: 'noop', test: () => true, message: '' }),
  maxPayloadSize: () => ({ name: 'noop', test: () => true, message: '' }),
  noSensitiveData: () => ({ name: 'noop', test: () => true, message: '' }),
};

export type * from './lib/types';
