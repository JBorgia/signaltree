import { Signal, WritableSignal } from '@angular/core';
import { SecurityValidatorConfig } from './security/security-validator';
export interface TimeTravelConfig {
    enabled?: boolean;
    maxHistorySize?: number;
    includePayload?: boolean;
    actionNames?: {
        update?: string;
        set?: string;
        batch?: string;
        [key: string]: string | undefined;
    };
}
export interface MemoizationConfig {
    enabled?: boolean;
    maxCacheSize?: number;
    ttl?: number;
    enableLRU?: boolean;
    equality?: 'deep' | 'shallow' | 'reference';
}
export type Primitive = string | number | boolean | null | undefined | bigint | symbol;
export type NotFn<T> = T extends (...args: unknown[]) => unknown ? never : T;
declare module '@angular/core' {
    interface WritableSignal<T> {
        (value: NotFn<T>): void;
        (updater: (current: T) => T): void;
    }
}
export interface NodeAccessor<T> {
    (): T;
    (value: T): void;
    (updater: (current: T) => T): void;
}
export type TreeNode<T> = {
    [K in keyof T]: T[K] extends EntityMapMarker<infer E, infer Key> ? EntitySignal<E, Key> : T[K] extends Primitive ? CallableWritableSignal<T[K]> : T[K] extends readonly unknown[] ? CallableWritableSignal<T[K]> : T[K] extends Date | RegExp | Map<any, any> | Set<any> | Error | ((...args: unknown[]) => unknown) ? CallableWritableSignal<T[K]> : T[K] extends object ? NodeAccessor<T[K]> & TreeNode<T[K]> : CallableWritableSignal<T[K]>;
};
export interface ISignalTree<T> extends NodeAccessor<T> {
    readonly state: TreeNode<T>;
    readonly $: TreeNode<T>;
    with<TAdded>(enhancer: (tree: ISignalTree<T>) => ISignalTree<T> & TAdded): this & TAdded;
    bind(thisArg?: unknown): NodeAccessor<T>;
    destroy(): void;
}
export interface EffectsMethods<T> {
    effect(fn: (state: T) => void | (() => void)): () => void;
    subscribe(fn: (state: T) => void): () => void;
}
export interface BatchingConfig {
    enabled?: boolean;
    notificationDelayMs?: number;
}
export interface BatchingMethods<T = unknown> {
    batch(fn: () => void): void;
    coalesce(fn: () => void): void;
    hasPendingNotifications(): boolean;
    flushNotifications(): void;
}
export interface MemoizationMethods<T> {
    memoize<R>(fn: (state: T) => R, cacheKey?: string): Signal<R>;
    memoizedUpdate?: (updater: (current: T) => Partial<T>, cacheKey?: string) => void;
    clearMemoCache(key?: string): void;
    clearCache?: (key?: string) => void;
    getCacheStats(): CacheStats;
}
export type CacheStats = {
    size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    keys: string[];
};
export interface TimeTravelMethods<T = unknown> {
    undo(): void;
    redo(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    getHistory(): TimeTravelEntry<T>[];
    resetHistory(): void;
    jumpTo(index: number): void;
    getCurrentIndex(): number;
    readonly __timeTravel?: {
        undo(): void;
        redo(): void;
        canUndo(): boolean;
        canRedo(): boolean;
        getHistory(): TimeTravelEntry<T>[];
        resetHistory(): void;
        jumpTo(index: number): void;
        getCurrentIndex(): number;
    };
}
export interface DevToolsMethods {
    connectDevTools(): void;
    disconnectDevTools(): void;
}
export interface EntitiesEnabled {
}
export interface OptimizedUpdateMethods<T> {
    updateOptimized(updates: Partial<T>, options?: {
        batch?: boolean;
        batchSize?: number;
        maxDepth?: number;
        ignoreArrayOrder?: boolean;
        equalityFn?: (a: unknown, b: unknown) => boolean;
    }): {
        changed: boolean;
        duration: number;
        changedPaths: string[];
        stats?: {
            totalPaths: number;
            optimizedPaths: number;
            batchedUpdates: number;
        };
    };
}
export interface TimeTravelEntry<T> {
    action: string;
    timestamp: number;
    state: T;
    payload?: unknown;
}
export type TreePreset = 'basic' | 'performance' | 'development' | 'production';
export interface TreeConfig {
    batchUpdates?: boolean;
    useMemoization?: boolean;
    enableTimeTravel?: boolean;
    useLazySignals?: boolean;
    useShallowComparison?: boolean;
    maxCacheSize?: number;
    trackPerformance?: boolean;
    treeName?: string;
    enableDevTools?: boolean;
    debugMode?: boolean;
    useStructuralSharing?: boolean;
    security?: SecurityValidatorConfig;
}
export interface EntityConfig<E, K extends string | number = string> {
    selectId?: (entity: E) => K;
    hooks?: {
        beforeAdd?: (entity: E) => E | false;
        beforeUpdate?: (id: K, changes: Partial<E>) => Partial<E> | false;
        beforeRemove?: (id: K, entity: E) => boolean;
    };
}
declare const ENTITY_MAP_BRAND: unique symbol;
export interface EntityMapMarker<E, K extends string | number> {
    readonly [ENTITY_MAP_BRAND]: {
        __entity: E;
        __key: K;
    };
    readonly __isEntityMap: true;
    readonly __entityMapConfig?: EntityConfig<E, K>;
}
export declare function entityMap<E, K extends string | number = E extends {
    id: infer I extends string | number;
} ? I : string>(config?: EntityConfig<E, K>): EntityMapMarker<E, K>;
export interface MutationOptions {
    onError?: (error: Error) => void;
}
export interface AddOptions<E, K> extends MutationOptions {
    selectId?: (entity: E) => K;
}
export interface AddManyOptions<E, K> extends AddOptions<E, K> {
    mode?: 'strict' | 'skip' | 'overwrite';
}
export interface TapHandlers<E, K extends string | number> {
    onAdd?: (entity: E, id: K) => void;
    onUpdate?: (id: K, changes: Partial<E>, entity: E) => void;
    onRemove?: (id: K, entity: E) => void;
    onChange?: () => void;
}
export interface InterceptContext<T> {
    block(reason?: string): void;
    transform(value: T): void;
    readonly blocked: boolean;
    readonly blockReason: string | undefined;
}
export interface InterceptHandlers<E, K extends string | number> {
    onAdd?: (entity: E, ctx: InterceptContext<E>) => void | Promise<void>;
    onUpdate?: (id: K, changes: Partial<E>, ctx: InterceptContext<Partial<E>>) => void | Promise<void>;
    onRemove?: (id: K, entity: E, ctx: InterceptContext<void>) => void | Promise<void>;
}
export type EntityNode<E> = {
    (): E;
    (value: E): void;
    (updater: (current: E) => E): void;
} & {
    [P in keyof E]: E[P] extends object ? E[P] extends readonly unknown[] ? CallableWritableSignal<E[P]> : EntityNode<E[P]> : CallableWritableSignal<E[P]>;
};
export interface EntitySignal<E, K extends string | number = string> {
    byId(id: K): EntityNode<E> | undefined;
    byIdOrFail(id: K): EntityNode<E>;
    readonly all: Signal<E[]>;
    readonly count: Signal<number>;
    readonly ids: Signal<K[]>;
    has(id: K): Signal<boolean>;
    readonly isEmpty: Signal<boolean>;
    readonly map: Signal<ReadonlyMap<K, E>>;
    where(predicate: (entity: E) => boolean): Signal<E[]>;
    find(predicate: (entity: E) => boolean): Signal<E | undefined>;
    addOne(entity: E, opts?: AddOptions<E, K>): K;
    addMany(entities: E[], opts?: AddManyOptions<E, K>): K[];
    updateOne(id: K, changes: Partial<E>, opts?: MutationOptions): void;
    updateMany(ids: K[], changes: Partial<E>, opts?: MutationOptions): void;
    updateWhere(predicate: (entity: E) => boolean, changes: Partial<E>): number;
    upsertOne(entity: E, opts?: AddOptions<E, K>): K;
    upsertMany(entities: E[], opts?: AddOptions<E, K>): K[];
    removeOne(id: K, opts?: MutationOptions): void;
    removeMany(ids: K[], opts?: MutationOptions): void;
    removeWhere(predicate: (entity: E) => boolean): number;
    clear(): void;
    removeAll(): void;
    setAll(entities: E[], opts?: AddOptions<E, K>): void;
    tap(handlers: TapHandlers<E, K>): () => void;
    intercept(handlers: InterceptHandlers<E, K>): () => void;
}
export interface LoggingConfig {
    name?: string;
    filter?: (path: string) => boolean;
    collapsed?: boolean;
    onLog?: (entry: LogEntry) => void;
}
export interface LogEntry {
    path: string;
    prev: unknown;
    value: unknown;
    timestamp: number;
}
export interface ValidationConfig<T> {
    validators: Array<{
        match: (path: string) => boolean;
        validate: (value: T, path: string) => void | never;
    }>;
    onError?: (error: Error, path: string) => void;
}
export interface PersistenceConfig {
    key: string;
    storage?: Storage;
    debounceMs?: number;
    filter?: (path: string) => boolean;
    serialize?: (state: unknown) => string;
    deserialize?: (json: string) => unknown;
}
export interface DevToolsConfig {
    enableBrowserDevTools?: boolean;
    enableLogging?: boolean;
    performanceThreshold?: number;
    name?: string;
    treeName?: string;
    enabled?: boolean;
    logActions?: boolean;
    maxAge?: number;
    features?: {
        jump?: boolean;
        skip?: boolean;
        reorder?: boolean;
    };
}
export type EntityType<T> = T extends EntitySignal<infer E, infer K extends string | number> ? E : never;
export type EntityKeyType<T> = T extends EntitySignal<unknown, infer K extends string | number> ? K : never;
export type IsEntityMap<T> = T extends EntityMapMarker<unknown, infer K extends string | number> ? true : false;
export type DeepEntityAwareTreeNode<T> = {
    [K in keyof T]: T[K] extends EntityMapMarker<infer E, infer Key> ? EntitySignal<E, Key> : T[K] extends object ? DeepEntityAwareTreeNode<T[K]> : CallableWritableSignal<T[K]>;
};
export type EntityAwareTreeNode<T> = {
    [K in keyof T]: T[K] extends EntityMapMarker<infer E, infer Key> ? EntitySignal<E, Key> : CallableWritableSignal<T[K]>;
};
export type TypedSignalTree<T> = ISignalTree<T> & {
    $: DeepEntityAwareTreeNode<T>;
};
export type PathHandler = (value: unknown, prev: unknown, path: string) => void;
export type PathInterceptor = (ctx: {
    path: string;
    value: unknown;
    prev: unknown;
    blocked: boolean;
    blockReason?: string;
}, next: () => void) => void | Promise<void>;
export type CallableWritableSignal<T> = WritableSignal<T> & {
    (value: NotFn<T>): void;
    (updater: (current: T) => T): void;
};
export type AccessibleNode<T> = NodeAccessor<T> & TreeNode<T>;
export declare const ENHANCER_META: unique symbol;
export type Enhancer<TAdded> = (tree: ISignalTree<any>) => ISignalTree<any> & TAdded;
export type EnhancerWithMeta<TAdded> = Enhancer<TAdded> & {
    metadata?: EnhancerMeta;
};
export interface EnhancerMeta {
    name?: string;
    requires?: string[];
    provides?: string[];
    description?: string;
}
export type FullSignalTree<T> = ISignalTree<T> & EffectsMethods<T> & BatchingMethods<T> & MemoizationMethods<T> & TimeTravelMethods<T> & DevToolsMethods & EntitiesEnabled & OptimizedUpdateMethods<T>;
export type ProdSignalTree<T> = ISignalTree<T> & EffectsMethods<T> & BatchingMethods<T> & MemoizationMethods<T> & EntitiesEnabled & OptimizedUpdateMethods<T>;
export type MinimalSignalTree<T> = ISignalTree<T> & EffectsMethods<T>;
export type SignalTree<T> = ISignalTree<T> & TreeNode<T>;
export type SignalTreeBase<T> = ISignalTree<T> & TreeNode<T>;
export declare function isSignalTree<T>(value: unknown): value is ISignalTree<T>;
export {};
