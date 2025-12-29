import { PathIndex } from './path-index';
import type { DiffOptions } from './diff-engine';
export interface UpdateOptions extends DiffOptions {
    batch?: boolean;
    batchSize?: number;
}
export interface UpdateResult {
    changed: boolean;
    duration: number;
    changedPaths: string[];
    stats?: {
        totalPaths: number;
        optimizedPaths: number;
        batchedUpdates: number;
    };
}
export declare class OptimizedUpdateEngine {
    private pathIndex;
    private diffEngine;
    constructor(tree: unknown);
    update(tree: unknown, updates: unknown, options?: UpdateOptions): UpdateResult;
    rebuildIndex(tree: unknown): void;
    getIndexStats(): ReturnType<PathIndex['getStats']>;
    private createPatches;
    private createPatch;
    private calculatePriority;
    private sortPatches;
    private applyPatches;
    private batchApplyPatches;
    private applyPatch;
    private isEqual;
}
