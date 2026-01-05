import type { ISignalTree, EntitiesEnabled } from '../../lib/types';
export interface EntitiesEnhancerConfig {
    enabled?: boolean;
}
export declare function entities(config?: EntitiesEnhancerConfig): <T>(tree: ISignalTree<T>) => ISignalTree<T> & EntitiesEnabled;
export declare function enableEntities(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & EntitiesEnabled;
export declare function highPerformanceEntities(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & EntitiesEnabled;
export declare const withEntities: typeof entities & {
    highPerformance: typeof highPerformanceEntities;
    enable: typeof enableEntities;
};
