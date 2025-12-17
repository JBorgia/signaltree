import type { EnhancerMeta, EnhancerWithMeta } from '../lib/types';
export declare function createEnhancer<I = unknown, O = unknown>(meta: EnhancerMeta, enhancerFn: (input: I) => O): EnhancerWithMeta<I, O>;
export declare function resolveEnhancerOrder(enhancers: EnhancerWithMeta<unknown, unknown>[], availableCapabilities?: Set<string>, debugMode?: boolean): EnhancerWithMeta<unknown, unknown>[];
