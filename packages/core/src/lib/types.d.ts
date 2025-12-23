import { Signal, WritableSignal } from '@angular/core';

import type { SecurityValidatorConfig } from './security/security-validator';
export type NotFn<T> = T extends (...args: unknown[]) => unknown ? never : T;
declare module '@angular/core' {
  interface WritableSignal<T> {
    (value: NotFn<T>): void;
    (updater: (current: T) => T): void;
  }
}
export type Primitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | symbol;
export type BuiltInObject =
  | Date
  | RegExp
  | ((...args: unknown[]) => unknown)
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | ArrayBuffer
  | DataView
  | Error
  | Promise<unknown>
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array
  | URL
  | URLSearchParams
  | FormData
  | Blob
  | File
  | Headers
  | Request
  | Response
  | AbortController
  | AbortSignal;
export type Unwrap<T> = [T] extends [WritableSignal<infer U>]
  ? U
  : [T] extends [Signal<infer U>]
  ? U
  : [T] extends [BuiltInObject]
  ? T
  : [T] extends [readonly unknown[]]
  ? T
  : [T] extends [EntityMapMarker<infer E, infer K>]
  ? EntitySignal<E, K>
  : [T] extends [object]
  ? {
      [K in keyof T]: Unwrap<T[K]>;
    }
  : T;
export interface NodeAccessor<T> {
  (): T;
  (value: T): void;
  (updater: (current: T) => T): void;
}
export type AccessibleNode<T> = NodeAccessor<T> & TreeNode<T>;
export type CallableWritableSignal<T> = WritableSignal<T> & {
  (value: NotFn<T>): void;
  (updater: (current: T) => T): void;
};
export type TreeNode<T> = {
  [K in keyof T]: [T[K]] extends [EntityMapMarker<infer E, infer Key>]
    ? EntitySignal<E, Key>
    : [T[K]] extends [readonly unknown[]]
    ? CallableWritableSignal<T[K]>
    : [T[K]] extends [object]
    ? [T[K]] extends [Signal<unknown>]
      ? T[K]
      : [T[K]] extends [BuiltInObject]
      ? CallableWritableSignal<T[K]>
      : [T[K]] extends [(...args: unknown[]) => unknown]
      ? CallableWritableSignal<T[K]>
      : AccessibleNode<T[K]>
    : CallableWritableSignal<T[K]>;
};
export type RemoveSignalMethods<T> = T extends infer U ? U : never;
export type DeepPath<
  T,
  Prefix extends string = '',
  Depth extends readonly number[] = []
> = Depth['length'] extends 5
  ? never
  : {
      [K in keyof T]: K extends string
        ? T[K] extends readonly unknown[]
          ? `${Prefix}${K}`
          : T[K] extends object
          ? T[K] extends Signal<unknown>
            ? never
            : T[K] extends BuiltInObject
            ? never
            : T[K] extends (...args: unknown[]) => unknown
            ? never
            : `${Prefix}${K}` | DeepPath<T[K], `${Prefix}${K}.`, [...Depth, 1]>
          : never
        : never;
    }[keyof T];
export type DeepAccess<
  T,
  Path extends string
> = Path extends `${infer First}.${infer Rest}`
  ? First extends keyof T
    ? DeepAccess<T[First] & object, Rest>
    : never
  : Path extends keyof T
  ? T[Path]
  : never;
export interface EnhancerMeta {
  name?: string;
  requires?: string[];
  provides?: string[];
}
export type Enhancer<Input = unknown, Output = unknown> = (
  input: Input
) => Output;
export type EnhancerWithMeta<Input = unknown, Output = unknown> = Enhancer<
  Input,
  Output
> & {
  metadata?: EnhancerMeta;
};
export declare const ENHANCER_META: unique symbol;
export type ChainResult<
  Start,
  E extends Array<EnhancerWithMeta<unknown, unknown>>
> = E extends [infer H, ...infer R]
  ? H extends EnhancerWithMeta<SignalTree<unknown>, infer O>
    ? R extends Array<EnhancerWithMeta<unknown, unknown>>
      ? ChainResult<O, R>
      : O
    : H extends EnhancerWithMeta<infer I, infer O>
    ? Start extends I
      ? R extends Array<EnhancerWithMeta<unknown, unknown>>
        ? ChainResult<O, R>
        : O
      : unknown
    : unknown
  : Start;
export interface WithMethod<T> {
  (): SignalTree<T>;
  <O>(enhancer: (input: SignalTree<T>) => O): O;
  <O1, O2>(e1: (input: SignalTree<T>) => O1, e2: (input: O1) => O2): O2;
  <O1, O2, O3>(
    e1: (input: SignalTree<T>) => O1,
    e2: (input: O1) => O2,
    e3: (input: O2) => O3
  ): O3;
  <O>(enhancer: EnhancerWithMeta<SignalTree<T>, O>): O;
  <O1, O2>(
    e1: EnhancerWithMeta<SignalTree<T>, O1>,
    e2: EnhancerWithMeta<O1, O2>
  ): O2;
  <O1, O2, O3>(
    e1: EnhancerWithMeta<SignalTree<T>, O1>,
    e2: EnhancerWithMeta<O1, O2>,
    e3: EnhancerWithMeta<O2, O3>
  ): O3;
}
export type SignalTree<T> = NodeAccessor<T> & {
  state: TreeNode<T>;
  $: TreeNode<T>;
  with: WithMethod<T>;
  destroy(): void;
  dispose?(): void;
  effect(fn: (tree: T) => void): void;
  subscribe(fn: (tree: T) => void): () => void;
  batch(updater: (tree: T) => void): void;
  batchUpdate(updater: (current: T) => Partial<T>): void;
  memoize<R>(fn: (tree: T) => R, cacheKey?: string): Signal<R>;
  memoizedUpdate(updater: (current: T) => Partial<T>, cacheKey?: string): void;
  clearMemoCache(key?: string): void;
  getCacheStats(): {
    size: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    keys: string[];
  };
  optimize(): void;
  clearCache(): void;
  invalidatePattern(pattern: string): number;
  updateOptimized?(
    updates: Partial<T>,
    options?: {
      batch?: boolean;
      batchSize?: number;
      maxDepth?: number;
      ignoreArrayOrder?: boolean;
      equalityFn?: (a: unknown, b: unknown) => boolean;
    }
  ): {
    changed: boolean;
    duration: number;
    changedPaths: string[];
    stats?: {
      totalPaths: number;
      optimizedPaths: number;
      batchedUpdates: number;
    };
  };
  entities<
    E extends {
      id: string | number;
    }
  >(
    entityKey?: keyof T
  ): EntityHelpers<E>;
  undo(): void;
  redo(): void;
  getHistory(): TimeTravelEntry<T>[];
  resetHistory(): void;
  jumpTo?: (index: number) => void;
  canUndo?: () => boolean;
  canRedo?: () => boolean;
  getCurrentIndex?: () => number;
};
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
export declare function entityMap<
  E,
  K extends string | number = E extends {
    id: infer I extends string | number;
  }
    ? I
    : string
>(config?: EntityConfig<E, K>): EntityMapMarker<E, K>;
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
  onUpdate?: (
    id: K,
    changes: Partial<E>,
    ctx: InterceptContext<Partial<E>>
  ) => void | Promise<void>;
  onRemove?: (
    id: K,
    entity: E,
    ctx: InterceptContext<void>
  ) => void | Promise<void>;
}
export type EntityNode<E> = {
  (): E;
  (value: E): void;
  (updater: (current: E) => E): void;
} & {
  [P in keyof E]: E[P] extends object
    ? E[P] extends readonly unknown[]
      ? CallableWritableSignal<E[P]>
      : EntityNode<E[P]>
    : CallableWritableSignal<E[P]>;
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
export interface EntityHelpers<
  E extends {
    id: string | number;
  }
> {
  add(entity: E): void;
  update(id: E['id'], updates: Partial<E>): void;
  remove(id: E['id']): void;
  upsert(entity: E): void;
  selectById(id: E['id']): Signal<E | undefined>;
  selectBy(predicate: (entity: E) => boolean): Signal<E[]>;
  selectIds(): Signal<Array<string | number>>;
  selectAll(): Signal<E[]>;
  selectTotal(): Signal<number>;
  clear(): void;
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
  name?: string;
  maxAge?: number;
  features?: {
    jump?: boolean;
    skip?: boolean;
    reorder?: boolean;
  };
}
export type EntityType<T> = T extends EntitySignal<
  infer E,
  infer K extends string | number
>
  ? E
  : never;
export type EntityKeyType<T> = T extends EntitySignal<
  unknown,
  infer K extends string | number
>
  ? K
  : never;
export type IsEntityMap<T> = T extends EntityMapMarker<
  unknown,
  infer K extends string | number
>
  ? true
  : false;
export type EntityAwareTreeNode<T> = {
  [K in keyof T]: T[K] extends EntityMapMarker<infer E, infer Key>
    ? EntitySignal<E, Key>
    : T[K] extends object
    ? EntityAwareTreeNode<T[K]>
    : CallableWritableSignal<T[K]>;
};
export type PathHandler = (value: unknown, prev: unknown, path: string) => void;
export type PathInterceptor = (
  ctx: {
    path: string;
    value: unknown;
    prev: unknown;
    blocked: boolean;
    blockReason?: string;
  },
  next: () => void
) => void | Promise<void>;
export interface TimeTravelEntry<T> {
  action: string;
  timestamp: number;
  state: T;
  payload?: unknown;
}
export declare function isSignalTree<T>(value: unknown): value is SignalTree<T>;
export {};
