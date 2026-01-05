import { ISignalTree } from '../../lib/types';
export interface SerializationConfig {
    includeMetadata?: boolean;
    replacer?: (key: string, value: unknown) => unknown;
    reviver?: (key: string, value: unknown) => unknown;
    preserveTypes?: boolean;
    maxDepth?: number;
    handleCircular?: boolean;
}
export interface SerializedState<T = unknown> {
    data: T;
    metadata?: {
        timestamp: number;
        version: string;
        appVersion?: string;
        types?: Record<string, string>;
        circularRefs?: Array<{
            path: string;
            targetPath: string;
        }>;
        nodeMap?: Record<string, 'b' | 'r'>;
    };
}
export interface SerializableSignalTree<T> extends ISignalTree<T> {
    $: any;
    serialize(config?: SerializationConfig): string;
    deserialize(json: string, config?: SerializationConfig): void;
    toJSON(): T;
    fromJSON(data: T, metadata?: SerializedState<T>['metadata']): void;
    snapshot(): SerializedState<T>;
    restore(snapshot: SerializedState<T>): void;
}
export interface SerializationMethods {
    serialize(config?: SerializationConfig): string;
    deserialize(json: string, config?: SerializationConfig): void;
    toJSON(): unknown;
    fromJSON(data: unknown, metadata?: SerializedState<unknown>['metadata']): void;
    snapshot(): SerializedState<unknown>;
    restore(snapshot: SerializedState<unknown>): void;
}
export interface PersistenceMethods {
    save(): Promise<void>;
    load(): Promise<void>;
    clear(): Promise<void>;
    __flushAutoSave?: () => Promise<void>;
}
export declare function serialization(defaultConfig?: SerializationConfig): <T>(tree: ISignalTree<T>) => ISignalTree<T> & SerializationMethods;
export declare const withSerialization: (defaultConfig?: SerializationConfig) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & SerializationMethods;
export declare function enableSerialization(): <T>(tree: ISignalTree<T>) => ISignalTree<T> & SerializationMethods;
export interface StorageAdapter {
    getItem(key: string): string | null | Promise<string | null>;
    setItem(key: string, value: string): void | Promise<void>;
    removeItem(key: string): void | Promise<void>;
}
export interface PersistenceConfig extends SerializationConfig {
    key: string;
    storage?: StorageAdapter;
    autoSave?: boolean;
    debounceMs?: number;
    autoLoad?: boolean;
    skipCache?: boolean;
}
export declare function persistence(config: PersistenceConfig): <T>(tree: ISignalTree<T>) => ISignalTree<T> & SerializationMethods & PersistenceMethods;
export declare const withPersistence: (cfg: PersistenceConfig) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & SerializationMethods & PersistenceMethods;
export declare function createStorageAdapter(getItem: (key: string) => string | null | Promise<string | null>, setItem: (key: string, value: string) => void | Promise<void>, removeItem: (key: string) => void | Promise<void>): StorageAdapter;
export declare function createIndexedDBAdapter(dbName?: string, storeName?: string): StorageAdapter;
export declare function applySerialization<T extends Record<string, unknown>>(tree: ISignalTree<T>): ISignalTree<T> & SerializationMethods;
export declare function applyPersistence<T extends Record<string, unknown>>(tree: ISignalTree<T>, cfg: PersistenceConfig): ISignalTree<T> & SerializationMethods & PersistenceMethods;
