import { Signal } from '@angular/core';
import type { ISignalTree, DevToolsConfig, DevToolsMethods } from '../../lib/types';
export interface ModuleMetadata {
    name: string;
    methods: string[];
    addedAt: Date;
    lastActivity: Date;
    operationCount: number;
    averageExecutionTime: number;
    errorCount: number;
}
export interface ModularPerformanceMetrics {
    totalUpdates: number;
    moduleUpdates: Record<string, number>;
    modulePerformance: Record<string, number>;
    compositionChain: string[];
    signalGrowth: Record<string, number>;
    memoryDelta: Record<string, number>;
    moduleCacheStats: Record<string, {
        hits: number;
        misses: number;
    }>;
}
export interface ModuleActivityTracker {
    trackMethodCall: (module: string, method: string, duration: number) => void;
    trackError: (module: string, error: Error, context?: string) => void;
    getModuleActivity: (module: string) => ModuleMetadata | undefined;
    getAllModules: () => ModuleMetadata[];
}
export interface CompositionLogger {
    logComposition: (modules: string[], action: 'with' | 'enhance') => void;
    logMethodExecution: (module: string, method: string, args: unknown[], result: unknown) => void;
    logStateChange: (module: string, path: string, oldValue: unknown, newValue: unknown) => void;
    logPerformanceWarning: (module: string, operation: string, duration: number, threshold: number) => void;
    exportLogs: () => Array<{
        timestamp: Date;
        module: string;
        type: 'composition' | 'method' | 'state' | 'performance';
        data: unknown;
    }>;
}
export interface ModularDevToolsInterface {
    activityTracker: ModuleActivityTracker;
    logger: CompositionLogger;
    metrics: Signal<ModularPerformanceMetrics>;
    trackComposition: (modules: string[]) => void;
    startModuleProfiling: (module: string) => string;
    endModuleProfiling: (profileId: string) => void;
    connectDevTools: (treeName: string) => void;
    exportDebugSession: () => {
        metrics: ModularPerformanceMetrics;
        modules: ModuleMetadata[];
        logs: Array<unknown>;
        compositionHistory: Array<{
            timestamp: Date;
            chain: string[];
        }>;
    };
}
export declare function devTools(config?: DevToolsConfig): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods;
export declare function enableDevTools(treeName?: string): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods;
export declare function fullDevTools(treeName?: string): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods;
export declare function productionDevTools(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods;
export declare const withDevTools: typeof devTools & {
    production: typeof productionDevTools;
    full: typeof fullDevTools;
    enable: typeof enableDevTools;
};
