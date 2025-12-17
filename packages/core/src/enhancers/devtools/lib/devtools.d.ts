import { Signal } from '@angular/core';
import type { SignalTree } from '../../../lib/types';
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
export interface ModularDevToolsInterface<_T = unknown> {
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
export declare function withDevTools<T>(config?: {
    enabled?: boolean;
    treeName?: string;
    enableBrowserDevTools?: boolean;
    enableLogging?: boolean;
    performanceThreshold?: number;
}): (tree: SignalTree<T>) => SignalTree<T> & {
    __devTools: ModularDevToolsInterface<T>;
};
export declare function enableDevTools<T>(treeName?: string): (tree: SignalTree<T>) => SignalTree<T> & {
    __devTools: ModularDevToolsInterface<T>;
};
export declare function withFullDevTools<T>(treeName?: string): (tree: SignalTree<T>) => SignalTree<T> & {
    __devTools: ModularDevToolsInterface<T>;
};
export declare function withProductionDevTools<T>(): (tree: SignalTree<T>) => SignalTree<T> & {
    __devTools: ModularDevToolsInterface<T>;
};
