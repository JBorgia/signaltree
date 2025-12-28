import type { EnhancerWithMeta } from '../types';

/**
 * Resolve enhancer order.
 * For now this is a simple pass-through that preserves order.
 * Future improvement: topological sort using metadata.requires/provides.
 */
export function resolveEnhancerOrder<T extends EnhancerWithMeta<any, any>>(
  enhancers: T[],
  _coreCapabilities = new Set<string>(),
  _debug = false
): T[] {
  // TODO: implement real ordering based on metadata.requires/provides
  return enhancers;
}

export * from './effects';
export * from './batching';
export * from './memoization';
export * from './time-travel';
export * from './devtools';
export * from './entities';
