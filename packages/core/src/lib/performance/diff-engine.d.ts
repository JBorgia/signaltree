import type { Path } from './path-index';
export declare enum ChangeType {
    ADD = "add",
    UPDATE = "update",
    DELETE = "delete",
    REPLACE = "replace"
}
export interface Change {
    type: ChangeType;
    path: Path;
    value?: unknown;
    oldValue?: unknown;
}
export interface Diff {
    changes: Change[];
    hasChanges: boolean;
}
export interface DiffOptions {
    maxDepth?: number;
    detectDeletions?: boolean;
    ignoreArrayOrder?: boolean;
    equalityFn?: (a: unknown, b: unknown) => boolean;
    keyValidator?: (key: string) => boolean;
}
export declare class DiffEngine {
    private defaultOptions;
    diff(current: unknown, updates: unknown, options?: DiffOptions): Diff;
    private traverse;
    private diffArrays;
    private diffArraysOrdered;
    private diffArraysUnordered;
    private stringify;
}
