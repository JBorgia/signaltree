import type { ISignalTree } from './types';
export declare function wrapWithDevProxy<T>(tree: ISignalTree<T>): ISignalTree<T>;
export declare function shouldUseDevProxy(): boolean;
