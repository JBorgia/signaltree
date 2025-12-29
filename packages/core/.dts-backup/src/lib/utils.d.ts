import { Signal, WritableSignal } from '@angular/core';
import { deepEqual, isBuiltInObject, parsePath } from '@signaltree/shared';
export { deepEqual };
export { deepEqual as equal };
export { isBuiltInObject };
export { parsePath };
export interface MemoryManager {
    getSignal(path: string): WritableSignal<unknown> | undefined;
    cacheSignal(path: string, signal: WritableSignal<unknown>): void;
    dispose(): void;
}
export interface NodeAccessor<T> {
    (): T;
    (value: T): void;
    (updater: (current: T) => T): void;
}
export type TreeNode<T> = {
    [K in keyof T]: T[K] extends readonly unknown[] ? WritableSignal<T[K]> : T[K] extends object ? T[K] extends Signal<unknown> ? T[K] : T[K] extends (...args: unknown[]) => unknown ? WritableSignal<T[K]> : NodeAccessor<T[K]> : WritableSignal<T[K]>;
};
export declare function isNodeAccessor(value: unknown): value is NodeAccessor<unknown>;
export declare function isAnySignal(value: unknown): boolean;
export declare function toWritableSignal<T>(node: NodeAccessor<T>, injector?: unknown): WritableSignal<T>;
export declare function composeEnhancers<T>(...enhancers: Array<(tree: T) => T>): (tree: T) => T;
export declare function createLazySignalTree<T extends object>(obj: T, equalityFn: (a: unknown, b: unknown) => boolean, basePath?: string, memoryManager?: MemoryManager): TreeNode<T>;
export declare function unwrap<T>(node: TreeNode<T>): T;
export declare function unwrap<T>(node: NodeAccessor<T> & TreeNode<T>): T;
export declare function unwrap<T>(node: NodeAccessor<T>): T;
export declare function unwrap<T>(node: unknown): T;
