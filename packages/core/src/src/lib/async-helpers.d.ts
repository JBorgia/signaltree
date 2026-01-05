import type { ISignalTree } from './types';
export declare function createAsyncOperation<T, TResult>(name: string, operation: () => Promise<TResult>): (tree: ISignalTree<T>) => Promise<TResult>;
export declare function trackAsync<T>(operation: () => Promise<T>): {
    pending: import("@angular/core").Signal<boolean>;
    error: import("@angular/core").Signal<Error | null>;
    result: import("@angular/core").Signal<T | null>;
    execute: () => Promise<T>;
};
