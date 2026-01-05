import type { WritableSignal } from '@angular/core';
export interface MemoryStats {
    cachedSignals: number;
    cleanedUpSignals: number;
    peakCachedSignals: number;
    manualDisposes: number;
    estimatedMemoryBytes: number;
}
export interface MemoryManagerConfig {
    enableAutoCleanup?: boolean;
    debugMode?: boolean;
    onCleanup?: (path: string, stats: MemoryStats) => void;
}
export declare class SignalMemoryManager {
    private cache;
    private registry;
    private config;
    private stats;
    constructor(config?: MemoryManagerConfig);
    cacheSignal<T>(path: string, signal: WritableSignal<T>): void;
    getSignal(path: string): WritableSignal<unknown> | undefined;
    hasSignal(path: string): boolean;
    removeSignal(path: string): boolean;
    private handleCleanup;
    getStats(): MemoryStats;
    dispose(): void;
    getCachedPaths(): string[];
    clearStale(): number;
    resetStats(): void;
}
