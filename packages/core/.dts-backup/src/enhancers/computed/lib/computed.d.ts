import { Signal } from '@angular/core';
import type { TreeNode, SignalTree } from '../../../lib/types';
export interface ComputedConfig {
    lazy?: boolean;
    memoize?: boolean;
}
export type ComputedSignal<T> = Signal<T>;
export interface ComputedSignalTree<T extends Record<string, unknown>> extends SignalTree<T> {
    computed<U>(computeFn: (tree: TreeNode<T>) => U): ComputedSignal<U>;
}
export declare function computedEnhancer(_config?: ComputedConfig): import("../../../lib/types").EnhancerWithMeta<SignalTree<Record<string, unknown>>, ComputedSignalTree<Record<string, unknown>>>;
export declare function createComputed<T>(dependencies: readonly Signal<unknown>[], computeFn: () => T): ComputedSignal<T>;
