import type { WritableSignal } from '@angular/core';
export type PathSegment = string | number;
export type Path = PathSegment[];
export declare class PathIndex<T extends object = WritableSignal<any>> {
    private root;
    private pathCache;
    private stats;
    set(path: Path, signal: T): void;
    get(path: Path): T | null;
    has(path: Path): boolean;
    getByPrefix(prefix: Path): Map<string, T>;
    delete(path: Path): boolean;
    clear(): void;
    getStats(): {
        hits: number;
        misses: number;
        sets: number;
        cleanups: number;
        hitRate: number;
        cacheSize: number;
    };
    buildFromTree(tree: unknown, path?: Path): void;
    private pathToString;
    private collectDescendants;
}
