import type { EnhancerMeta, EnhancerWithMeta, Enhancer } from '../lib/types';
export declare function createEnhancer<TAdded = unknown>(meta: EnhancerMeta, enhancerFn: Enhancer<TAdded>): EnhancerWithMeta<TAdded>;
export declare function resolveEnhancerOrder(enhancers: EnhancerWithMeta<unknown>[], availableCapabilities?: Set<string>, debugMode?: boolean): EnhancerWithMeta<unknown>[];
