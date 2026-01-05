import { WritableSignal } from '@angular/core';
export type UndoRedoHistory<T> = {
    past: T[];
    present: T;
    future: T[];
};
export interface EditSession<T> {
    readonly original: WritableSignal<T>;
    readonly modified: WritableSignal<T>;
    readonly canUndo: () => boolean;
    readonly canRedo: () => boolean;
    readonly isDirty: () => boolean;
    setOriginal(value: T): void;
    applyChanges(valueOrUpdater: T | ((current: T) => T)): void;
    undo(): void;
    redo(): void;
    reset(): void;
    getHistory(): UndoRedoHistory<T>;
}
export declare function createEditSession<T>(initial: T): EditSession<T>;
export default createEditSession;
