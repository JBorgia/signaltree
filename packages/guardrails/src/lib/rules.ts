/**
 * Prebuilt Guardrail Rules
 * @packageDocumentation
 */

import type { GuardrailRule } from './types';

export const rules = {
  /**
   * Prevents deep nesting beyond specified depth
   */
  noDeepNesting: (maxDepth = 5): GuardrailRule => ({
    name: 'no-deep-nesting',
    description: `Prevents nesting deeper than ${maxDepth} levels`,
    test: (ctx) => ctx.path.length <= maxDepth,
    message: (ctx) => `Path too deep: ${ctx.path.join('.')} (${ctx.path.length} levels, max: ${maxDepth})`,
    severity: 'warning',
    tags: ['architecture', 'complexity'],
  }),
  
  /**
   * Prevents storing functions in state (breaks serialization)
   */
  noFunctionsInState: (): GuardrailRule => ({
    name: 'no-functions',
    description: 'Functions break serialization',
    test: (ctx) => typeof ctx.value !== 'function',
    message: 'Functions cannot be stored in state (breaks serialization)',
    severity: 'error',
    tags: ['serialization', 'data'],
  }),
  
  /**
   * Prevents cache from being persisted
   */
  noCacheInPersistence: (): GuardrailRule => ({
    name: 'no-cache-persistence',
    description: 'Prevent cache from being persisted',
    test: (ctx) => {
      if (ctx.metadata?.source === 'serialization' && ctx.path.includes('cache')) {
        return false;
      }
      return true;
    },
    message: 'Cache should not be persisted',
    severity: 'warning',
    tags: ['persistence', 'cache'],
  }),
  
  /**
   * Limits payload size
   */
  maxPayloadSize: (maxKB = 100): GuardrailRule => ({
    name: 'max-payload-size',
    description: `Limit payload size to ${maxKB}KB`,
    test: (ctx) => {
      try {
        const size = JSON.stringify(ctx.value).length;
        return size < maxKB * 1024;
      } catch {
        return true; // Can't serialize, let it pass
      }
    },
    message: (ctx) => {
      const size = JSON.stringify(ctx.value).length;
      const kb = (size / 1024).toFixed(1);
      return `Payload size ${kb}KB exceeds limit of ${maxKB}KB`;
    },
    severity: 'warning',
    tags: ['performance', 'data'],
  }),
  
  /**
   * Prevents storing sensitive data
   */
  noSensitiveData: (sensitiveKeys: string[] = ['password', 'token', 'secret', 'apiKey']): GuardrailRule => ({
    name: 'no-sensitive-data',
    description: 'Prevents storing sensitive data',
    test: (ctx) => {
      return !ctx.path.some(segment => 
        sensitiveKeys.some(key => 
          typeof segment === 'string' && segment.toLowerCase().includes(key.toLowerCase())
        )
      );
    },
    message: (ctx) => `Sensitive data detected in path: ${ctx.path.join('.')}`,
    severity: 'error',
    tags: ['security', 'data'],
  }),
};
