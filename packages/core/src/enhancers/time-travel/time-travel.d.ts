import type { ISignalTree, TimeTravelMethods, TimeTravelConfig, TimeTravelEntry } from '../../lib/types';
export type { TimeTravelConfig, TimeTravelEntry };
export declare function timeTravel(config?: TimeTravelConfig): <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T>;
export declare function enableTimeTravel(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T>;
export declare function timeTravelHistory(maxHistorySize: number): <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T>;
export declare const withTimeTravel: ((config?: TimeTravelConfig) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T>) & {
    minimal: () => <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T>;
    debug: () => <T>(tree: ISignalTree<T>) => ISignalTree<T> & TimeTravelMethods<T>;
    history: typeof timeTravelHistory;
};
